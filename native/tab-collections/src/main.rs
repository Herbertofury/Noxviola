//! Local-only collection store. SQLite owns durable transactions and indexes;
//! the browser never hydrates the entire library into its renderer or main thread.
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
const FRAME: usize = 8 * 1024 * 1024;
fn text<'a>(v: &'a Value, k: &str) -> Result<&'a str> {
    let s = v[k].as_str().ok_or("Missing text field")?;
    if s.len() > 65536 || s.chars().any(|c| c.is_control()) {
        return Err("Invalid text field".into());
    }
    Ok(s)
}
fn number(v: &Value, k: &str) -> Result<i64> {
    v[k].as_i64()
        .filter(|n| *n >= 0)
        .ok_or_else(|| "Invalid numeric field".into())
}
fn open(file: &str) -> Result<Connection> {
    #[cfg(unix)]
    if file != ":memory:" {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        if std::fs::symlink_metadata(file).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("Collection database cannot be a symbolic link".into());
        }
        std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .mode(0o600)
            .open(file)?;
        std::fs::set_permissions(file, std::fs::Permissions::from_mode(0o600))?;
    }
    let db = Connection::open(file)?;
    db.busy_timeout(std::time::Duration::from_secs(5))?;
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA cache_size=-8192;")?;
    let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version > 2 {
        return Err("Unsupported collection database version; original file preserved".into());
    }
    if version == 0 {
        db.execute_batch("BEGIN IMMEDIATE;
      CREATE TABLE collections(id INTEGER PRIMARY KEY, identity TEXT NOT NULL, title TEXT NOT NULL, created INTEGER NOT NULL, starred INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, count INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX collection_page ON collections(identity,archived,id);
      CREATE TABLE tabs(id INTEGER PRIMARY KEY, collection_id INTEGER NOT NULL REFERENCES collections(id), url TEXT NOT NULL, title TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX tab_page ON tabs(collection_id,id);
      CREATE VIRTUAL TABLE search USING fts5(title,url,content='tabs',content_rowid='id');
      CREATE TRIGGER tab_insert AFTER INSERT ON tabs BEGIN INSERT INTO search(rowid,title,url) VALUES(new.id,new.title,new.url); UPDATE collections SET count=count+1 WHERE id=new.collection_id; END;
      PRAGMA user_version=1; COMMIT;")?;
    }
    if version < 2 {
        db.execute_batch("BEGIN IMMEDIATE;
          CREATE TABLE folders(id INTEGER PRIMARY KEY,identity TEXT NOT NULL,title TEXT NOT NULL);
          CREATE INDEX folders_page ON folders(identity,id);
          CREATE TABLE library_revisions(identity TEXT PRIMARY KEY,revision INTEGER NOT NULL);
          ALTER TABLE collections ADD COLUMN folder_id INTEGER REFERENCES folders(id);
          ALTER TABLE collections ADD COLUMN sort_key REAL NOT NULL DEFAULT 0;
          UPDATE collections SET sort_key=id*1024.0;
          CREATE INDEX collection_order ON collections(identity,archived,folder_id,sort_key,id);
          CREATE TRIGGER collection_revision_insert AFTER INSERT ON collections BEGIN INSERT INTO library_revisions VALUES(new.identity,1) ON CONFLICT(identity) DO UPDATE SET revision=revision+1; END;
          CREATE TRIGGER collection_revision_update AFTER UPDATE OF title,starred,locked,archived,folder_id,sort_key ON collections BEGIN INSERT INTO library_revisions VALUES(new.identity,1) ON CONFLICT(identity) DO UPDATE SET revision=revision+1; END;
          CREATE TRIGGER folder_revision_insert AFTER INSERT ON folders BEGIN INSERT INTO library_revisions VALUES(new.identity,1) ON CONFLICT(identity) DO UPDATE SET revision=revision+1; END;
          CREATE TRIGGER folder_revision_update AFTER UPDATE ON folders BEGIN INSERT INTO library_revisions VALUES(new.identity,1) ON CONFLICT(identity) DO UPDATE SET revision=revision+1; END;
          PRAGMA user_version=2; COMMIT;")?;
    }
    Ok(db)
}
fn revision(db: &Connection, identity: &str) -> Result<i64> {
    Ok(db
        .query_row(
            "SELECT revision FROM library_revisions WHERE identity=?1",
            [identity],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or(0))
}
fn folder(db: &Connection, identity: &str, value: &Value) -> Result<Option<i64>> {
    if value.is_null() || value == 0 {
        return Ok(None);
    }
    let id = value.as_i64().filter(|v| *v > 0).ok_or("Invalid folder")?;
    if !db.query_row(
        "SELECT EXISTS(SELECT 1 FROM folders WHERE identity=?1 AND id=?2)",
        params![identity, id],
        |r| r.get::<_, bool>(0),
    )? {
        return Err("Folder not found in this identity".into());
    }
    Ok(Some(id))
}
fn page(mut items: Vec<Value>, revision: i64, ordered: bool) -> Value {
    let mut bytes = 0;
    let mut keep = 0;
    for item in &items {
        let size = item.to_string().len();
        if keep >= 50 || (keep > 0 && bytes + size > 1024 * 1024) {
            break;
        }
        bytes += size;
        keep += 1;
    }
    let more = keep < items.len();
    items.truncate(keep);
    let next = if more {
        let last = items.last().unwrap();
        json!({"id":last["id"],"sort":if ordered {last["sort"].clone()}else{json!(0)},"revision":revision})
    } else {
        Value::Null
    };
    json!({"items":items,"next":next,"revision":revision})
}
fn cursor(v: &Value, revision: i64) -> Result<(i64, f64)> {
    if v.is_null() || v == 0 {
        return Ok((0, -f64::MAX));
    }
    if v["revision"].as_i64() != Some(revision) {
        return Err("Library changed. Return to the first page before continuing.".into());
    }
    Ok((
        number(v, "id")?,
        v["sort"]
            .as_f64()
            .filter(|n| n.is_finite())
            .ok_or("Invalid page cursor")?,
    ))
}
fn run(db: &mut Connection, v: &Value) -> Result<Value> {
    let identity = text(v, "identity")?;
    if identity.is_empty()
        || !identity
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    {
        return Err("Invalid identity".into());
    }
    let op = text(v, "op")?;
    match op {
        "save" => {
            let title = text(v, "title")?;
            let rows = v["tabs"].as_array().ok_or("Tabs must be an array")?;
            if rows.is_empty() {
                return Err("No supported tabs to save".into());
            }
            let tx = db.transaction()?;
            tx.execute(
                "INSERT INTO collections(identity,title,created,sort_key) SELECT ?1,?2,?3,coalesce(max(sort_key),0)+1024 FROM collections WHERE identity=?1 AND folder_id IS NULL AND archived=0",
                params![identity, title, number(v, "created")?],
            )?;
            let id = tx.last_insert_rowid();
            {
                let mut insert = tx.prepare(
                    "INSERT INTO tabs(collection_id,url,title,pinned) VALUES(?1,?2,?3,?4)",
                )?;
                for tab in rows {
                    let raw = text(tab, "url")?;
                    let url = url::Url::parse(raw)?;
                    if !["http", "https"].contains(&url.scheme())
                        || !url.username().is_empty()
                        || url.password().is_some()
                    {
                        return Err(
                            "Only HTTP(S) addresses without credentials can be archived".into()
                        );
                    }
                    let title = text(tab, "title")?;
                    insert.execute(params![
                        id,
                        raw,
                        title,
                        tab["pinned"].as_bool().unwrap_or(false)
                    ])?;
                }
            }
            tx.commit()?;
            Ok(json!({"id":id,"saved":rows.len()}))
        }
        "groups" => {
            // A read transaction keeps the revision and page from one snapshot.
            let tx = db.transaction()?;
            let rev = revision(&tx, identity)?;
            let (after, sort) = cursor(&v["after"], rev)?;
            let target = folder(&tx, identity, &v["folder"])?;
            let archived = v["archived"].as_bool().unwrap_or(false);
            let mut stmt=tx.prepare("SELECT id,title,created,starred,locked,archived,count,sort_key FROM collections WHERE identity=?1 AND archived=?2 AND folder_id IS ?3 AND (sort_key,id)>(?4,?5) ORDER BY sort_key,id LIMIT 51")?;
            let items=stmt.query_map(params![identity,archived,target,sort,after], |r|Ok(json!({"id":r.get::<_,i64>(0)?,"title":r.get::<_,String>(1)?,"created":r.get::<_,i64>(2)?,"starred":r.get::<_,bool>(3)?,"locked":r.get::<_,bool>(4)?,"archived":r.get::<_,bool>(5)?,"count":r.get::<_,i64>(6)?,"sort":r.get::<_,f64>(7)?})))?.collect::<std::result::Result<Vec<_>,_>>()?;
            Ok(page(items, rev, true))
        }
        "folders" => {
            let tx = db.transaction()?;
            let rev = revision(&tx, identity)?;
            let (after, _) = cursor(&v["after"], rev)?;
            let mut stmt = tx.prepare(
                "SELECT id,title FROM folders WHERE identity=?1 AND id>?2 ORDER BY id LIMIT 51",
            )?;
            let items = stmt
                .query_map(params![identity, after], |r| {
                    Ok(json!({"id":r.get::<_,i64>(0)?,"title":r.get::<_,String>(1)?}))
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(page(items, rev, false))
        }
        "folder-create" => {
            let title = text(v, "title")?.trim();
            if title.is_empty() {
                return Err("Folder name required".into());
            }
            db.execute(
                "INSERT INTO folders(identity,title) VALUES(?1,?2)",
                params![identity, title],
            )?;
            Ok(json!({"id":db.last_insert_rowid(),"title":title}))
        }
        "folder-rename" => {
            let id = folder(db, identity, &v["folder"])?.ok_or("Choose a named folder")?;
            let title = text(v, "title")?.trim();
            if title.is_empty() {
                return Err("Folder name required".into());
            }
            db.execute(
                "UPDATE folders SET title=?1 WHERE id=?2 AND identity=?3",
                params![title, id, identity],
            )?;
            Ok(json!({"updated":true}))
        }
        "move" => {
            let tx = db.transaction()?;
            let id = number(v, "group")?;
            let target = folder(&tx, identity, &v["folder"])?;
            let (locked, archived): (bool, bool) = tx
                .query_row(
                    "SELECT locked,archived FROM collections WHERE id=?1 AND identity=?2",
                    params![id, identity],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?
                .ok_or("Collection not found")?;
            if locked {
                return Err("Unlock this collection before moving it".into());
            }
            let before = if v["before"].is_null() {
                None
            } else {
                Some(number(v, "before")?)
            };
            if before == Some(id) {
                return Err("Choose a different destination collection".into());
            }
            // Rare precision exhaustion is repaired entirely inside SQLite, not by
            // materializing the folder in the browser or silently losing ordering.
            let bounds = |db: &Connection| -> Result<(f64, f64)> {
                let upper = if let Some(before) = before {
                    db.query_row("SELECT sort_key FROM collections WHERE id=?1 AND identity=?2 AND folder_id IS ?3 AND archived=?4",params![before,identity,target,archived],|r|r.get::<_,f64>(0)).optional()?.ok_or("Destination collection not in this folder and archive view")?
                } else {
                    db.query_row("SELECT coalesce(max(sort_key),0)+2048 FROM collections WHERE identity=?1 AND folder_id IS ?2 AND archived=?3 AND id<>?4",params![identity,target,archived,id],|r|r.get(0))?
                };
                let lower=db.query_row("SELECT coalesce(max(sort_key),?5-2048) FROM collections WHERE identity=?1 AND folder_id IS ?2 AND archived=?3 AND id<>?4 AND (sort_key,id)<(?5,?6)",params![identity,target,archived,id,upper,before.unwrap_or(i64::MAX)],|r|r.get(0))?;
                Ok((lower, upper))
            };
            let (mut lower, mut upper) = bounds(&tx)?;
            let mut rank = lower + (upper - lower) / 2.;
            if !rank.is_finite() || rank <= lower || rank >= upper {
                tx.execute("WITH ordered AS MATERIALIZED (SELECT id,row_number() OVER(ORDER BY sort_key,id)*1024.0 AS rank FROM collections WHERE identity=?1 AND folder_id IS ?2 AND archived=?3) UPDATE collections SET sort_key=(SELECT rank FROM ordered WHERE ordered.id=collections.id) WHERE id IN(SELECT id FROM ordered)",params![identity,target,archived])?;
                (lower, upper) = bounds(&tx)?;
                rank = lower + (upper - lower) / 2.;
            }
            if !rank.is_finite() || rank <= lower || rank >= upper {
                return Err("Cannot represent destination ordering; no records moved".into());
            }
            tx.execute(
                "UPDATE collections SET folder_id=?1,sort_key=?2 WHERE id=?3 AND identity=?4",
                params![target, rank, id, identity],
            )?;
            tx.commit()?;
            Ok(json!({"moved":true}))
        }
        "tabs" => {
            let id = number(v, "group")?;
            let after = v["after"].as_i64().unwrap_or(0);
            let query = v["query"].as_str().unwrap_or("").trim();
            if query.len() > 512 {
                return Err("Search is too long".into());
            }
            let fts = query
                .split_whitespace()
                .map(|s| format!("\"{}\"*", s.replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(" AND ");
            let sql = if fts.is_empty() {
                "SELECT t.id,t.url,t.title,t.pinned FROM tabs t JOIN collections c ON c.id=t.collection_id WHERE c.identity=?1 AND c.id=?2 AND t.id>?3 ORDER BY t.id LIMIT 101"
            } else {
                "SELECT t.id,t.url,t.title,t.pinned FROM tabs t JOIN collections c ON c.id=t.collection_id JOIN search ON search.rowid=t.id WHERE c.identity=?1 AND c.id=?2 AND t.id>?3 AND search MATCH ?4 ORDER BY t.id LIMIT 101"
            };
            let mut stmt = db.prepare(sql)?;
            let mut rows = if fts.is_empty() {
                stmt.query(params![identity, id, after])?
            } else {
                stmt.query(params![identity, id, after, fts])?
            };
            let mut items = Vec::new();
            while let Some(r) = rows.next()? {
                items.push(json!({"id":r.get::<_,i64>(0)?,"url":r.get::<_,String>(1)?,"title":r.get::<_,String>(2)?,"pinned":r.get::<_,bool>(3)?}));
            }
            let mut bytes = 0usize;
            let mut keep = 0;
            for item in &items {
                let size = item.to_string().len();
                if keep >= 100 || (keep > 0 && bytes + size > 1024 * 1024) {
                    break;
                }
                bytes += size;
                keep += 1;
            }
            let more = keep < items.len();
            items.truncate(keep);
            Ok(
                json!({"next":if more {items.last().unwrap()["id"].clone()} else {Value::Null},"items":items}),
            )
        }
        "update" => {
            let id = number(v, "group")?;
            let field = text(v, "field")?;
            let locked: bool = db
                .query_row(
                    "SELECT locked FROM collections WHERE id=?1 AND identity=?2",
                    params![id, identity],
                    |r| r.get(0),
                )
                .optional()?
                .ok_or("Collection not found")?;
            if locked && field != "locked" {
                return Err("Unlock this collection before changing it".into());
            }
            let val = match field {
                "title" => Value::String(text(v, "value")?.to_owned()),
                "starred" | "locked" | "archived" => {
                    json!(v["value"].as_bool().ok_or("Boolean required")?)
                }
                _ => return Err("Unsupported field".into()),
            };
            let sql = format!("UPDATE collections SET {field}=?1 WHERE id=?2 AND identity=?3");
            if let Some(s) = val.as_str() {
                db.execute(&sql, params![s, id, identity])?;
            } else {
                db.execute(&sql, params![val.as_bool().unwrap(), id, identity])?;
            }
            Ok(json!({"updated":true}))
        }
        "get" => {
            let id = number(v, "id")?;
            let item=db.query_row("SELECT t.id,t.url,t.title,t.pinned FROM tabs t JOIN collections c ON c.id=t.collection_id WHERE t.id=?1 AND c.identity=?2",params![id,identity],|r|Ok(json!({"id":r.get::<_,i64>(0)?,"url":r.get::<_,String>(1)?,"title":r.get::<_,String>(2)?,"pinned":r.get::<_,bool>(3)?}))).optional()?.ok_or("Saved tab not found in this identity")?;
            Ok(item)
        }
        "health" => {
            let result: String = db.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
            Ok(json!({"integrity":result}))
        }
        _ => Err("Unsupported collection operation".into()),
    }
}
fn main() -> Result<()> {
    let file = std::env::args().nth(1).ok_or("Database path required")?;
    let mut db = open(&file)?;
    let mut input = io::stdin().lock();
    let mut out = io::stdout().lock();
    loop {
        // read_until can grow indefinitely; take() provides a strict per-request bound.
        let mut line = Vec::new();
        let n = std::io::Read::take(&mut input, (FRAME + 1) as u64).read_until(b'\n', &mut line)?;
        if n == 0 {
            break;
        }
        if n > FRAME || !line.ends_with(b"\n") {
            return Err("Collection request exceeds frame limit".into());
        }
        let result = serde_json::from_slice::<Value>(&line)
            .map_err(|e| e.into())
            .and_then(|v| run(&mut db, &v));
        let response = match result {
            Ok(value) => json!({"ok":value}),
            Err(error) => json!({"error":error.to_string()}),
        };
        writeln!(out, "{response}")?;
        out.flush()?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn request(db: &mut Connection, v: Value) -> Value {
        run(db, &v).unwrap()
    }
    #[test]
    fn rollback_identity_and_paging() {
        let mut db = open(":memory:").unwrap();
        let tabs=(0..301).map(|i|json!({"url":format!("https://example.org/{i}"),"title":format!("research {i}")})).collect::<Vec<_>>();
        let a = request(
            &mut db,
            json!({"op":"save","identity":"personal","title":"A","created":1,"tabs":tabs}),
        );
        let id = a["id"].as_i64().unwrap();
        let mut after = 0;
        let mut seen = 0;
        loop {
            let page = request(
                &mut db,
                json!({"op":"tabs","identity":"personal","group":id,"after":after}),
            );
            seen += page["items"].as_array().unwrap().len();
            assert!(page["items"].as_array().unwrap().len() <= 100);
            match page["next"].as_i64() {
                Some(n) => after = n,
                None => break,
            }
        }
        assert_eq!(seen, 301);
        assert!(
            request(&mut db, json!({"op":"tabs","identity":"other","group":id}))["items"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert!(run(&mut db,&json!({"op":"save","identity":"personal","title":"bad","created":1,"tabs":[{"url":"https://ok.test","title":"ok"},{"url":"javascript:alert(1)","title":"bad"}]})).is_err());
        assert_eq!(
            request(&mut db, json!({"op":"groups","identity":"personal"}))["items"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        request(
            &mut db,
            json!({"op":"update","identity":"personal","group":id,"field":"locked","value":true}),
        );
        assert!(run(
            &mut db,
            &json!({"op":"update","identity":"personal","group":id,"field":"archived","value":true})
        )
        .is_err());
        assert_eq!(
            request(
                &mut db,
                json!({"op":"tabs","identity":"personal","group":id,"query":"research 29"})
            )["items"]
                .as_array()
                .unwrap()
                .len(),
            11
        );
    }
}

#[cfg(test)]
mod migration_tests {
    use super::*;
    fn legacy(file: &str, conflict: bool) {
        let db = Connection::open(file).unwrap();
        db.execute_batch("CREATE TABLE collections(id INTEGER PRIMARY KEY,identity TEXT NOT NULL,title TEXT NOT NULL,created INTEGER NOT NULL,starred INTEGER NOT NULL DEFAULT 0,locked INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,count INTEGER NOT NULL DEFAULT 0);CREATE TABLE tabs(id INTEGER PRIMARY KEY,collection_id INTEGER NOT NULL,url TEXT NOT NULL,title TEXT NOT NULL,pinned INTEGER NOT NULL DEFAULT 0);CREATE VIRTUAL TABLE search USING fts5(title,url,content='tabs',content_rowid='id');INSERT INTO collections VALUES(77,'personal','Legacy retained',123,1,1,0,1);INSERT INTO tabs VALUES(88,77,'https://example.test','Original',1);PRAGMA user_version=1;").unwrap();
        if conflict {
            db.execute_batch("CREATE TABLE folders(unknown TEXT);")
                .unwrap();
        }
    }
    #[test]
    fn schema_one_migration_preserves_rows_and_rolls_back_on_conflict() {
        for conflict in [false, true] {
            let file = std::env::temp_dir().join(format!(
                "nox-legacy-{}-{conflict}.sqlite",
                std::process::id()
            ));
            let file = file.to_str().unwrap();
            legacy(file, conflict);
            let result = open(file);
            if conflict {
                assert!(result.is_err());
            } else {
                let db = result.unwrap();
                assert_eq!(
                    db.query_row("SELECT title FROM collections WHERE id=77", [], |r| r
                        .get::<_, String>(0))
                        .unwrap(),
                    "Legacy retained"
                );
                assert_eq!(
                    db.query_row("SELECT pinned FROM tabs WHERE id=88", [], |r| r
                        .get::<_, i64>(0))
                        .unwrap(),
                    1
                );
            }
            let db = Connection::open(file).unwrap();
            let version: i64 = db
                .query_row("PRAGMA user_version", [], |r| r.get(0))
                .unwrap();
            assert_eq!(version, if conflict { 1 } else { 2 });
            let column: i64 = db
                .query_row(
                    "SELECT count(*) FROM pragma_table_info('collections') WHERE name='folder_id'",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(column, if conflict { 0 } else { 1 });
            drop(db);
            std::fs::remove_file(file).unwrap();
        }
    }
}

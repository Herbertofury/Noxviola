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
    if version > 1 {
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
    Ok(db)
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
                "INSERT INTO collections(identity,title,created) VALUES(?1,?2,?3)",
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
            let after = v["after"].as_i64().unwrap_or(0);
            let archived = v["archived"].as_bool().unwrap_or(false);
            let mut stmt=db.prepare("SELECT id,title,created,starred,locked,archived,count FROM collections WHERE identity=?1 AND archived=?2 AND id>?3 ORDER BY id LIMIT 51")?;
            let rows=stmt.query_map(params![identity,archived,after], |r|Ok(json!({"id":r.get::<_,i64>(0)?,"title":r.get::<_,String>(1)?,"created":r.get::<_,i64>(2)?,"starred":r.get::<_,bool>(3)?,"locked":r.get::<_,bool>(4)?,"archived":r.get::<_,bool>(5)?,"count":r.get::<_,i64>(6)?})))?;
            let mut items = rows.collect::<std::result::Result<Vec<_>, _>>()?;
            let mut bytes = 0usize;
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
            Ok(
                json!({"next":if more {items.last().unwrap()["id"].clone()} else {Value::Null},"items":items}),
            )
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

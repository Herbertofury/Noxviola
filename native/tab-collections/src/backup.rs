//! Streaming library-only backup. No browser cookies, live sessions or automatic navigation.
use super::{text, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, BufWriter, Read, Write},
    path::Path,
};
const LINE: u64 = 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Origin {
    backup: String,
    source: i64,
    identity: String,
}
#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
enum Record {
    Header {
        format: String,
        version: u32,
        identity: String,
        backup: String,
        created: i64,
    },
    Folder {
        id: i64,
        title: String,
    },
    Collection {
        id: i64,
        title: String,
        created: i64,
        folder: Option<i64>,
        starred: bool,
        locked: bool,
        archived: bool,
        origin: Option<Origin>,
    },
    Tab {
        id: i64,
        group: i64,
        url: String,
        title: String,
        pinned: bool,
    },
    Footer {
        folders: u64,
        collections: u64,
        tabs: u64,
        sha256: String,
    },
}
fn valid(s: &str) -> Result<()> {
    if s.len() > 65536 || s.chars().any(|c| c.is_control()) {
        return Err("Invalid backup text".into());
    }
    Ok(())
}
fn positive(id: i64) -> Result<()> {
    if id <= 0 {
        return Err("Invalid backup ID".into());
    }
    Ok(())
}
fn emit(writer: &mut BufWriter<File>, hash: &mut Sha256, r: &Record) -> Result<()> {
    let mut bytes = serde_json::to_vec(r)?;
    bytes.push(b'\n');
    if bytes.len() > LINE as usize {
        return Err("Backup record exceeds line budget".into());
    }
    hash.update(&bytes);
    writer.write_all(&bytes)?;
    Ok(())
}
fn origin(row: &rusqlite::Row<'_>, offset: usize) -> rusqlite::Result<Option<Origin>> {
    match row.get::<_, Option<String>>(offset)? {
        Some(backup) => Ok(Some(Origin {
            backup,
            source: row.get(offset + 1)?,
            identity: row.get(offset + 2)?,
        })),
        None => Ok(None),
    }
}
pub fn export(db: &mut Connection, v: &Value, identity: &str) -> Result<Value> {
    let target = Path::new(text(v, "file")?);
    let temporary = Path::new(text(v, "temporary")?);
    if target == temporary || target.parent() != temporary.parent() {
        return Err("Backup staging must be a distinct sibling file".into());
    }
    if target.try_exists()? {
        return Err("Choose a new backup filename; existing files are never replaced".into());
    }
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(temporary)?;
    let mut published = false;
    let result = (|| -> Result<Value> {
        let tx = db.transaction()?;
        let mut writer = BufWriter::new(file);
        let mut hash = Sha256::new();
        let (mut folders, mut groups, mut tabs) = (0, 0, 0);
        emit(
            &mut writer,
            &mut hash,
            &Record::Header {
                format: "noxviola-library".into(),
                version: 1,
                identity: identity.into(),
                backup: text(v, "backup")?.into(),
                created: super::number(v, "created")?,
            },
        )?;
        {
            let mut stmt =
                tx.prepare("SELECT id,title FROM folders WHERE identity=?1 ORDER BY id")?;
            let mut rows = stmt.query([identity])?;
            while let Some(r) = rows.next()? {
                emit(
                    &mut writer,
                    &mut hash,
                    &Record::Folder {
                        id: r.get(0)?,
                        title: r.get(1)?,
                    },
                )?;
                folders += 1;
            }
        }
        let mut stmt=tx.prepare("SELECT c.id,c.title,c.created,c.folder_id,c.starred,c.locked,c.archived,o.backup_id,o.source_id,o.source_identity FROM collections c LEFT JOIN collection_origins o ON o.collection_id=c.id WHERE c.identity=?1 ORDER BY c.archived,c.folder_id,c.sort_key,c.id")?;
        let mut rows = stmt.query([identity])?;
        while let Some(r) = rows.next()? {
            let id: i64 = r.get(0)?;
            emit(
                &mut writer,
                &mut hash,
                &Record::Collection {
                    id,
                    title: r.get(1)?,
                    created: r.get(2)?,
                    folder: r.get(3)?,
                    starred: r.get(4)?,
                    locked: r.get(5)?,
                    archived: r.get(6)?,
                    origin: origin(r, 7)?,
                },
            )?;
            groups += 1;
            let mut ts = tx.prepare(
                "SELECT id,url,title,pinned FROM tabs WHERE collection_id=?1 ORDER BY id",
            )?;
            let mut tr = ts.query([id])?;
            while let Some(t) = tr.next()? {
                emit(
                    &mut writer,
                    &mut hash,
                    &Record::Tab {
                        id: t.get(0)?,
                        group: id,
                        url: t.get(1)?,
                        title: t.get(2)?,
                        pinned: t.get(3)?,
                    },
                )?;
                tabs += 1;
            }
        }
        let digest = format!("{:x}", hash.finalize());
        serde_json::to_writer(
            &mut writer,
            &Record::Footer {
                folders,
                collections: groups,
                tabs,
                sha256: digest,
            },
        )?;
        writer.write_all(b"\n")?;
        writer.flush()?;
        writer.get_ref().sync_all()?;
        drop(writer);
        // Atomic no-clobber publication. Unsupported hard-link filesystems fail safely.
        fs::hard_link(temporary, target)?;
        published = true;
        fs::remove_file(temporary)?;
        #[cfg(unix)]
        File::open(target.parent().unwrap_or(Path::new(".")))?.sync_all()?;
        Ok(json!({"folders":folders,"collections":groups,"tabs":tabs,"libraryOnly":true}))
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
        if published {
            return Err("Backup was published, but cleanup or directory synchronization failed. Verify it before retrying; existing files will not be replaced".into());
        }
    }
    result
}
pub fn import(db: &mut Connection, v: &Value, identity: &str) -> Result<Value> {
    let file = Path::new(text(v, "file")?);
    let meta = fs::symlink_metadata(file)?;
    if !meta.is_file() {
        return Err("Backup must be a regular file, not a link or device".into());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
    }
    let handle = options.open(file)?;
    let opened = handle.metadata()?;
    if !opened.is_file() {
        return Err("Backup must remain a regular file".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.dev() != opened.dev() || meta.ino() != opened.ino() {
            return Err("Backup file changed before reading".into());
        }
    }
    let mut reader = BufReader::new(handle);
    let tx = db.transaction()?;
    tx.execute_batch("CREATE TEMP TABLE backup_folders(source INTEGER PRIMARY KEY,dest INTEGER NOT NULL);CREATE TEMP TABLE backup_groups(source INTEGER PRIMARY KEY,dest INTEGER NOT NULL);CREATE TEMP TABLE backup_tabs(source INTEGER PRIMARY KEY);")?;
    let result = (|| -> Result<Value> {
        let mut hash = Sha256::new();
        let (mut folders, mut groups, mut tabs) = (0u64, 0u64, 0u64);
        let mut manifest: Option<String> = None;
        let mut done = false;
        let mut current_group = None;
        let mut rank: f64 = tx.query_row(
            "SELECT COALESCE(MAX(sort_key),0) FROM collections WHERE identity=?1",
            [identity],
            |r| r.get(0),
        )?;
        loop {
            let mut bytes = Vec::new();
            let n = Read::take(reader.by_ref(), LINE + 1).read_until(b'\n', &mut bytes)?;
            if n == 0 {
                break;
            }
            if n as u64 > LINE || bytes.last() != Some(&b'\n') {
                return Err("Oversized or truncated backup record".into());
            }
            if done {
                return Err("Unexpected data after backup footer".into());
            }
            let record: Record = serde_json::from_slice(&bytes)?;
            match record {
                Record::Header {
                    format,
                    version,
                    identity: owner,
                    backup,
                    created,
                } => {
                    if manifest.is_some()
                        || format != "noxviola-library"
                        || version != 1
                        || owner != identity
                        || created < 0
                        || backup.is_empty()
                    {
                        return Err(
                            "Unsupported backup format or different browser identity".into()
                        );
                    }
                    valid(&backup)?;
                    if tx.query_row("SELECT EXISTS(SELECT 1 FROM backup_imports WHERE identity=?1 AND backup_id=?2)",params![identity,backup],|r|r.get::<_,bool>(0))?{return Err("This backup was already imported. No duplicate copies were added; inspect the library before choosing another backup".into());}
                    manifest = Some(backup);
                }
                Record::Folder { id, title } => {
                    if manifest.is_none() || groups > 0 {
                        return Err("Folders must precede collections".into());
                    }
                    positive(id)?;
                    valid(&title)?;
                    tx.execute(
                        "INSERT INTO folders(identity,title) VALUES(?1,?2)",
                        params![identity, title],
                    )?;
                    let dest = tx.last_insert_rowid();
                    tx.execute(
                        "INSERT INTO backup_folders VALUES(?1,?2)",
                        params![id, dest],
                    )?;
                    folders += 1;
                }
                Record::Collection {
                    id,
                    title,
                    created,
                    folder,
                    starred,
                    locked,
                    archived,
                    origin,
                } => {
                    let backup = manifest.as_ref().ok_or("Missing backup header")?;
                    positive(id)?;
                    valid(&title)?;
                    if created < 0 {
                        return Err("Invalid creation time".into());
                    }
                    let dest_folder = if let Some(f) = folder {
                        Some(
                            tx.query_row(
                                "SELECT dest FROM backup_folders WHERE source=?1",
                                [f],
                                |r| r.get::<_, i64>(0),
                            )
                            .optional()?
                            .ok_or("Missing source folder")?,
                        )
                    } else {
                        None
                    };
                    let next = rank + 1024.;
                    if !next.is_finite() || next <= rank {
                        return Err(
                            "Collection ordering exhausted; original library retained".into()
                        );
                    }
                    rank = next;
                    tx.execute("INSERT INTO collections(identity,title,created,folder_id,starred,locked,archived,sort_key) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![identity,title,created,dest_folder,starred,locked,archived,rank])?;
                    let dest = tx.last_insert_rowid();
                    tx.execute("INSERT INTO backup_groups VALUES(?1,?2)", params![id, dest])?;
                    let root = origin.unwrap_or(Origin {
                        backup: backup.clone(),
                        source: id,
                        identity: identity.into(),
                    });
                    valid(&root.backup)?;
                    valid(&root.identity)?;
                    positive(root.source)?;
                    tx.execute(
                        "INSERT INTO collection_origins VALUES(?1,?2,?3,?4,?5)",
                        params![dest, root.backup, root.source, root.identity, backup],
                    )?;
                    current_group = Some(id);
                    groups += 1;
                }
                Record::Tab {
                    id,
                    group,
                    url,
                    title,
                    pinned,
                } => {
                    if current_group != Some(group) {
                        return Err("Tab must belong to its preceding collection".into());
                    }
                    positive(id)?;
                    valid(&url)?;
                    valid(&title)?;
                    let parsed = url::Url::parse(&url)?;
                    if !["http", "https"].contains(&parsed.scheme())
                        || !parsed.username().is_empty()
                        || parsed.password().is_some()
                    {
                        return Err("Unsafe backup URL".into());
                    }
                    tx.execute("INSERT INTO backup_tabs VALUES(?1)", [id])?;
                    let dest: i64 = tx.query_row(
                        "SELECT dest FROM backup_groups WHERE source=?1",
                        [group],
                        |r| r.get(0),
                    )?;
                    tx.execute(
                        "INSERT INTO tabs(collection_id,url,title,pinned) VALUES(?1,?2,?3,?4)",
                        params![dest, url, title, pinned],
                    )?;
                    tabs += 1;
                }
                Record::Footer {
                    folders: f,
                    collections: c,
                    tabs: t,
                    sha256,
                } => {
                    if manifest.is_none()
                        || f != folders
                        || c != groups
                        || t != tabs
                        || sha256 != format!("{:x}", hash.clone().finalize())
                    {
                        return Err(
                            "Backup checksum/count mismatch; original library retained".into()
                        );
                    }
                    done = true;
                    continue;
                }
            }
            hash.update(&bytes);
        }
        if !done {
            return Err("Missing backup footer; nothing imported".into());
        }
        let after = reader.get_ref().metadata()?;
        if opened.len() != after.len() || opened.modified()? != after.modified()? {
            return Err("Backup changed while reading; nothing imported".into());
        }
        tx.execute(
            "INSERT INTO backup_imports VALUES(?1,?2,?3,?4,?5)",
            params![
                identity,
                manifest,
                i64::try_from(folders)?,
                i64::try_from(groups)?,
                i64::try_from(tabs)?
            ],
        )?;
        Ok(
            json!({"folders":folders,"collections":groups,"tabs":tabs,"backup":manifest,"additive":true,"libraryOnly":true}),
        )
    })();
    // TEMP objects are connection-local and must be gone after both failure and success.
    match result {
        Ok(value) => {
            tx.execute_batch(
                "DROP TABLE backup_tabs;DROP TABLE backup_groups;DROP TABLE backup_folders;",
            )?;
            tx.commit()?;
            Ok(value)
        }
        Err(error) => {
            drop(tx);
            Err(error)
        }
    }
}

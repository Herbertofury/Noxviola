//! Lossless, read-only access to explicitly selected Enderloom JSON exports.
//!
//! This crate does not discover profiles or copy, remove, or modify files. It
//! deliberately does not read Chromium cookies, storage, or encrypted requests.

use serde_json::Value;
use std::{
    error::Error,
    fmt, fs, io,
    path::{Path, PathBuf},
};

/// The three portable JSON document types whose shape is known to Enderloom.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DocumentKind {
    Session,
    Library,
    Downloads,
}

impl DocumentKind {
    pub fn filename(self) -> &'static str {
        match self {
            Self::Session => "session.json",
            Self::Library => "browser-library.json",
            Self::Downloads => "browser-downloads.json",
        }
    }

    fn validate(self, value: &Value) -> bool {
        match self {
            Self::Session => value
                .as_object()
                .is_some_and(|o| o.get("tabs").is_some_and(Value::is_array)),
            Self::Library => value.as_object().is_some_and(|o| {
                o.get("history").is_none_or(Value::is_array)
                    && o.get("preferences").is_none_or(Value::is_object)
            }),
            Self::Downloads => value.is_array(),
        }
    }
}

/// The raw JSON tree is retained, including fields this version does not know.
/// Arrays, including duplicate tabs and history rows, retain their original order.
#[derive(Debug)]
pub struct Document {
    pub kind: DocumentKind,
    pub source: PathBuf,
    /// Exact original bytes, retained for lossless archival or further parsing.
    pub original_bytes: Vec<u8>,
    pub value: Value,
}

impl Document {
    pub fn tabs(&self) -> Option<&[Value]> {
        (self.kind == DocumentKind::Session)
            .then(|| self.value.get("tabs")?.as_array().map(Vec::as_slice))
            .flatten()
    }
}

#[derive(Debug)]
pub enum ImportError {
    Read {
        path: PathBuf,
        source: io::Error,
    },
    Parse {
        path: PathBuf,
        source: serde_json::Error,
    },
    InvalidShape {
        path: PathBuf,
        kind: DocumentKind,
    },
}

impl fmt::Display for ImportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read { path, source } => write!(f, "cannot read {}: {source}", path.display()),
            Self::Parse { path, source } => {
                write!(f, "invalid JSON in {}: {source}", path.display())
            }
            Self::InvalidShape { path, kind } => write!(
                f,
                "unexpected {kind:?} document shape in {}",
                path.display()
            ),
        }
    }
}

impl Error for ImportError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Read { source, .. } => Some(source),
            Self::Parse { source, .. } => Some(source),
            _ => None,
        }
    }
}

/// Read exactly the path the caller selected. No fallback or writes occur.
pub fn read_document(path: impl AsRef<Path>, kind: DocumentKind) -> Result<Document, ImportError> {
    let path = path.as_ref();
    let bytes = fs::read(path).map_err(|source| ImportError::Read {
        path: path.into(),
        source,
    })?;
    let value: Value = serde_json::from_slice(&bytes).map_err(|source| ImportError::Parse {
        path: path.into(),
        source,
    })?;
    if !kind.validate(&value) {
        return Err(ImportError::InvalidShape {
            path: path.into(),
            kind,
        });
    }
    Ok(Document {
        kind,
        source: path.into(),
        original_bytes: bytes,
        value,
    })
}

/// Read a named document from a caller-selected export directory. Missing files
/// return an error, so callers can decide how to report an incomplete export.
pub fn read_from_directory(
    directory: impl AsRef<Path>,
    kind: DocumentKind,
) -> Result<Document, ImportError> {
    read_document(directory.as_ref().join(kind.filename()), kind)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture(name: &str, bytes: &[u8]) -> PathBuf {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("noxviola-enderloom-{}-{id}", std::process::id()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join(name);
        fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn session_preserves_duplicate_tabs_order_and_unknown_data_without_writing_source() {
        let source = br#"{ "future":{"nested":[3,2,1]}, "tabs":[{"id":"a","url":"https://example.test/","extra":1},{"id":"b","url":"https://example.test/","extra":2}], "tabSequence":["b","a"], "activeTabId":"b" }"#;
        let path = fixture("session.json", source);
        let doc = read_document(&path, DocumentKind::Session).unwrap();
        let tabs = doc.tabs().unwrap();
        assert_eq!(tabs.len(), 2);
        assert_eq!(tabs[0]["id"], "a");
        assert_eq!(tabs[1]["id"], "b");
        assert_eq!(tabs[1]["extra"], 2);
        assert_eq!(doc.value["tabSequence"], serde_json::json!(["b", "a"]));
        assert_eq!(doc.value["future"]["nested"], serde_json::json!([3, 2, 1]));
        assert_eq!(doc.original_bytes, source);
        assert_eq!(fs::read(&path).unwrap(), source);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn directory_selection_reads_only_requested_document() {
        let source = br#"{"history":[{"url":"https://example.test/","future":true}],"preferences":{"theme":"dark","unknown":7},"newRoot":"kept"}"#;
        let path = fixture("browser-library.json", source);
        let doc = read_from_directory(path.parent().unwrap(), DocumentKind::Library).unwrap();
        assert_eq!(doc.value["newRoot"], "kept");
        assert_eq!(doc.value["history"][0]["future"], true);
        assert_eq!(doc.value["preferences"]["unknown"], 7);
        assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn malformed_and_missing_inputs_are_errors_with_no_recovery_write() {
        let path = fixture("session.json", b"{broken");
        assert!(matches!(
            read_document(&path, DocumentKind::Session),
            Err(ImportError::Parse { .. })
        ));
        assert!(matches!(
            read_from_directory(path.parent().unwrap(), DocumentKind::Downloads),
            Err(ImportError::Read { .. })
        ));
        assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn wrong_shape_is_not_silently_treated_as_an_empty_session() {
        let path = fixture("session.json", br#"{"tabs":{}}"#);
        assert!(matches!(
            read_document(&path, DocumentKind::Session),
            Err(ImportError::InvalidShape { .. })
        ));
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn downloads_retain_original_bytes_and_unknown_fields() {
        let source = br#"[{"id":"x","future":{"size":123456789012345678901234567890}}]"#;
        let path = fixture("browser-downloads.json", source);
        let doc = read_document(&path, DocumentKind::Downloads).unwrap();
        assert_eq!(doc.original_bytes, source);
        assert_eq!(
            doc.value[0]["future"]["size"].to_string(),
            "123456789012345678901234567890"
        );
        assert!(doc.tabs().is_none());
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}

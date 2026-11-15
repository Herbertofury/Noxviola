//! Durable session data, compatible with Noxviola's draft PR #5 version-1 JSON.
//!
//! Identity records are labels and routing metadata only. This crate does not
//! provide, or make any claim about, web storage or network isolation.
//!
//! The data model and checkpoint behavior are derived from the Noxviola
//! experimental browser in PR #5 (GPL-3.0-only), which in turn documents
//! Enderloom provenance. No private user data is included.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fmt, fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

type Extra = BTreeMap<String, Value>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub version: u32,
    pub profiles: Vec<Profile>,
    pub tabs: Vec<Tab>,
    pub active_id: Option<String>,
    #[serde(flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    #[serde(flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Tab {
    pub id: String,
    pub url: String,
    pub title: String,
    pub identity: String,
    #[serde(flatten)]
    pub extra: Extra,
}

impl Default for Session {
    fn default() -> Self {
        Self {
            version: 1,
            profiles: vec![Profile {
                id: "personal".into(),
                name: "Personal".into(),
                extra: Extra::new(),
            }],
            tabs: vec![],
            active_id: None,
            extra: Extra::new(),
        }
    }
}

impl Session {
    /// Validates without normalizing or dropping any data. Unsupported/newer
    /// sessions remain on disk for a compatible version to recover.
    pub fn validate(&self) -> Result<(), String> {
        use std::collections::HashSet;
        if self.version != 1 {
            return Err(format!("unsupported session version {}", self.version));
        }
        let mut profile_ids = HashSet::new();
        for p in &self.profiles {
            if p.id.is_empty()
                || !p
                    .id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
                || !profile_ids.insert(&p.id)
            {
                return Err("invalid or duplicate profile ID".into());
            }
        }
        let mut tab_ids = HashSet::new();
        for t in &self.tabs {
            if t.id.is_empty() || !tab_ids.insert(&t.id) {
                return Err("invalid or duplicate tab ID".into());
            }
            // An empty address is the native shell's unopened new-tab page.
            if !t.url.is_empty() {
                let url = url::Url::parse(&t.url).map_err(|_| "invalid tab URL")?;
                if !matches!(url.scheme(), "http" | "https" | "about") {
                    return Err("unsupported tab URL scheme".into());
                }
            }
            if !profile_ids.contains(&t.identity) {
                return Err("tab references an unknown profile".into());
            }
        }
        if self
            .active_id
            .as_ref()
            .is_some_and(|id| !tab_ids.contains(id))
        {
            return Err("active tab is missing".into());
        }
        Ok(())
    }
}

#[derive(Debug)]
pub enum StateError {
    Io {
        path: PathBuf,
        source: io::Error,
    },
    Invalid {
        path: PathBuf,
        reason: String,
    },
    /// Both copies are preserved for inspection; saving must not proceed.
    RecoveryRequired {
        primary: String,
        previous: String,
    },
}
impl fmt::Display for StateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io { path, source } => write!(f, "{}: {source}", path.display()),
            Self::Invalid { path, reason } => write!(f, "{}: {reason}", path.display()),
            Self::RecoveryRequired { primary, previous } => write!(
                f,
                "session recovery required (primary: {primary}; previous: {previous})"
            ),
        }
    }
}
impl std::error::Error for StateError {}

#[derive(Debug, PartialEq)]
pub enum LoadedSession {
    New(Session),
    Primary(Session),
    /// The primary exists but cannot be decoded/validated. Keep both copies;
    /// recovery requires an explicit user-facing workflow before saving.
    Previous {
        session: Session,
        primary_error: String,
    },
}

fn previous_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".previous");
    name.into()
}

// A generic traversal is necessary because unknown fields can contain nested
// objects. serde_json::Value would already have discarded duplicated keys.
struct UniqueJson;

impl<'de> Deserialize<'de> for UniqueJson {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Visitor;
        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = UniqueJson;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("JSON without duplicate object keys")
            }
            fn visit_bool<E: serde::de::Error>(self, _: bool) -> Result<Self::Value, E> {
                Ok(UniqueJson)
            }
            fn visit_i64<E: serde::de::Error>(self, _: i64) -> Result<Self::Value, E> {
                Ok(UniqueJson)
            }
            fn visit_u64<E: serde::de::Error>(self, _: u64) -> Result<Self::Value, E> {
                Ok(UniqueJson)
            }
            fn visit_f64<E: serde::de::Error>(self, _: f64) -> Result<Self::Value, E> {
                Ok(UniqueJson)
            }
            fn visit_str<E: serde::de::Error>(self, _: &str) -> Result<Self::Value, E> {
                Ok(UniqueJson)
            }
            fn visit_string<E: serde::de::Error>(self, _: String) -> Result<Self::Value, E> {
                Ok(UniqueJson)
            }
            fn visit_unit<E: serde::de::Error>(self) -> Result<Self::Value, E> {
                Ok(UniqueJson)
            }
            fn visit_none<E: serde::de::Error>(self) -> Result<Self::Value, E> {
                Ok(UniqueJson)
            }
            fn visit_some<D: serde::Deserializer<'de>>(
                self,
                d: D,
            ) -> Result<Self::Value, D::Error> {
                UniqueJson::deserialize(d)
            }
            fn visit_seq<A: serde::de::SeqAccess<'de>>(
                self,
                mut seq: A,
            ) -> Result<Self::Value, A::Error> {
                while seq.next_element::<UniqueJson>()?.is_some() {}
                Ok(UniqueJson)
            }
            fn visit_map<A: serde::de::MapAccess<'de>>(
                self,
                mut map: A,
            ) -> Result<Self::Value, A::Error> {
                let mut keys = std::collections::HashSet::new();
                while let Some(key) = map.next_key::<String>()? {
                    if !keys.insert(key) {
                        return Err(serde::de::Error::custom("duplicate object key"));
                    }
                    map.next_value::<UniqueJson>()?;
                }
                Ok(UniqueJson)
            }
        }
        deserializer.deserialize_any(Visitor)
    }
}

fn read_session(path: &Path) -> Result<Option<Session>, StateError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(StateError::Io {
                path: path.into(),
                source,
            });
        }
    };
    // Refuse ambiguous JSON before materializing it as maps; otherwise a
    // later checkpoint could silently overwrite one of the duplicate values.
    serde_json::from_slice::<UniqueJson>(&bytes).map_err(|e| StateError::Invalid {
        path: path.into(),
        reason: e.to_string(),
    })?;
    let session: Session = serde_json::from_slice(&bytes).map_err(|e| StateError::Invalid {
        path: path.into(),
        reason: e.to_string(),
    })?;
    session.validate().map_err(|reason| StateError::Invalid {
        path: path.into(),
        reason,
    })?;
    Ok(Some(session))
}

/// Load a primary file or recoverable checkpoint without writing either file.
pub fn load(path: &Path) -> Result<LoadedSession, StateError> {
    match read_session(path) {
        Ok(Some(session)) => Ok(LoadedSession::Primary(session)),
        Ok(None) => match read_session(&previous_path(path))? {
            Some(session) => Ok(LoadedSession::Previous {
                session,
                primary_error: "primary file missing".into(),
            }),
            None => Ok(LoadedSession::New(Session::default())),
        },
        Err(primary @ StateError::Io { .. }) => Err(primary),
        Err(primary) => match read_session(&previous_path(path)) {
            Ok(Some(session)) => Ok(LoadedSession::Previous {
                session,
                primary_error: primary.to_string(),
            }),
            Ok(None) => Err(StateError::RecoveryRequired {
                primary: primary.to_string(),
                previous: "missing".into(),
            }),
            Err(previous) => Err(StateError::RecoveryRequired {
                primary: primary.to_string(),
                previous: previous.to_string(),
            }),
        },
    }
}

fn replace(path: &Path, data: &[u8]) -> Result<(), StateError> {
    let dir = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let wrap = |source| StateError::Io {
        path: path.into(),
        source,
    };
    fs::create_dir_all(dir).map_err(wrap)?;
    let mut temp = tempfile::NamedTempFile::new_in(dir).map_err(wrap)?;
    temp.write_all(data).map_err(wrap)?;
    temp.as_file().sync_all().map_err(wrap)?;
    // tempfile uses atomic replacement on supported Windows and Unix targets.
    temp.persist(path).map_err(|e| wrap(e.error))?;
    Ok(())
}

/// Save an already validated state. A malformed or absent primary alongside
/// an existing checkpoint is never overwritten; resolve recovery explicitly.
pub fn save(path: &Path, session: &Session) -> Result<(), StateError> {
    session.validate().map_err(|reason| StateError::Invalid {
        path: path.into(),
        reason,
    })?;
    let next = serde_json::to_vec_pretty(session).map_err(|e| StateError::Invalid {
        path: path.into(),
        reason: e.to_string(),
    })?;
    match load(path)? {
        LoadedSession::New(_) => {}
        LoadedSession::Previous { primary_error, .. } => {
            return Err(StateError::RecoveryRequired {
                primary: primary_error,
                previous: "available; restore explicitly".into(),
            });
        }
        LoadedSession::Primary(_) => {
            // Do not destroy an unreadable or newer-format checkpoint either.
            read_session(&previous_path(path))?;
            // Save exact previous bytes, including unknown fields and formatting.
            let old = fs::read(path).map_err(|source| StateError::Io {
                path: path.into(),
                source,
            })?;
            replace(&previous_path(path), &old)?;
        }
    }
    replace(path, &next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample() -> Session {
        let mut state = Session::default();
        state
            .extra
            .insert("futureSetting".into(), json!({"nested": [1, 2]}));
        for n in 0..100 {
            state.tabs.push(Tab {
                id: format!("tab-{n}"),
                url: "https://example.com/repeated".into(),
                title: format!("Tab {n}"),
                identity: "personal".into(),
                extra: Extra::new(),
            });
        }
        state.active_id = Some("tab-99".into());
        state
    }

    #[test]
    fn duplicate_urls_all_survive_restart_and_unknown_fields_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("browser-session.json");
        let mut state = sample();
        state.profiles[0]
            .extra
            .insert("color".into(), json!("purple"));
        state.tabs[1].extra.insert("group".into(), json!("work"));
        save(&file, &state).unwrap();
        assert_eq!(load(&file).unwrap(), LoadedSession::Primary(state));
    }

    #[test]
    fn checkpoint_preserves_exact_prior_file_and_recovers_without_overwriting_corruption() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("browser-session.json");
        let first = sample();
        save(&file, &first).unwrap();
        let exact_first = fs::read(&file).unwrap();
        let mut second = first.clone();
        second.tabs[0].title = "Changed".into();
        save(&file, &second).unwrap();
        assert_eq!(fs::read(previous_path(&file)).unwrap(), exact_first);
        fs::write(&file, b"broken").unwrap();
        assert!(
            matches!(load(&file).unwrap(), LoadedSession::Previous { session, .. } if session == first)
        );
        assert!(matches!(
            save(&file, &second),
            Err(StateError::RecoveryRequired { .. })
        ));
        assert_eq!(fs::read(&file).unwrap(), b"broken");
        assert_eq!(fs::read(previous_path(&file)).unwrap(), exact_first);
    }

    #[test]
    fn newer_or_invalid_data_is_never_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("session.json");
        let future = br#"{"version":2,"profiles":[],"tabs":[],"activeId":null}"#;
        fs::write(&file, future).unwrap();
        assert!(load(&file).is_err());
        assert!(save(&file, &sample()).is_err());
        assert_eq!(fs::read(&file).unwrap(), future);
        fs::remove_file(&file).unwrap();
        fs::write(previous_path(&file), future).unwrap();
        assert!(save(&file, &sample()).is_err());
        assert!(!file.exists());
        assert_eq!(fs::read(previous_path(&file)).unwrap(), future);
    }

    #[test]
    fn missing_primary_with_previous_requires_explicit_recovery() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("session.json");
        let state = sample();
        save(&file, &state).unwrap();
        fs::copy(&file, previous_path(&file)).unwrap();
        fs::remove_file(&file).unwrap();
        assert!(matches!(
            load(&file).unwrap(),
            LoadedSession::Previous { .. }
        ));
        assert!(save(&file, &state).is_err());
        assert!(!file.exists());
    }

    #[test]
    fn invalid_references_or_duplicate_ids_are_rejected_without_writes() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("session.json");
        let mut state = sample();
        state.tabs[1].id = state.tabs[0].id.clone();
        assert!(save(&file, &state).is_err());
        state.tabs[1].id = "tab-1".into();
        state.tabs[1].identity = "unknown".into();
        assert!(save(&file, &state).is_err());
        assert!(!file.exists());
    }

    #[test]
    fn unknown_numbers_outside_u64_range_keep_exact_value_after_save() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("session.json");
        let original = br#"{"version":1,"profiles":[{"id":"personal","name":"Personal"}],"tabs":[],"activeId":null,"unknown":123456789012345678901234567890}"#;
        fs::write(&file, original).unwrap();
        let LoadedSession::Primary(session) = load(&file).unwrap() else {
            panic!("expected primary")
        };
        save(&file, &session).unwrap();
        let LoadedSession::Primary(reloaded) = load(&file).unwrap() else {
            panic!("expected primary")
        };
        assert_eq!(
            reloaded.extra["unknown"].to_string(),
            "123456789012345678901234567890"
        );
        assert_eq!(fs::read(previous_path(&file)).unwrap(), original);
    }

    #[test]
    fn duplicate_nested_unknown_keys_require_recovery_without_changing_either_copy() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("session.json");
        let previous = previous_path(&file);
        let valid = br#"{"version":1,"profiles":[{"id":"personal","name":"Personal"}],"tabs":[],"activeId":null,"unknown":123456789012345678901234567890}"#;
        let ambiguous = br#"{"version":1,"profiles":[{"id":"personal","name":"Personal"}],"tabs":[],"activeId":null,"unknown":{"array":[{"key":1,"key":2}]}}"#;

        fs::write(&file, ambiguous).unwrap();
        fs::write(&previous, valid).unwrap();
        let LoadedSession::Previous { session, .. } = load(&file).unwrap() else {
            panic!("expected recovery")
        };
        assert_eq!(
            session.extra["unknown"].to_string(),
            "123456789012345678901234567890"
        );
        assert!(matches!(
            save(&file, &session),
            Err(StateError::RecoveryRequired { .. })
        ));
        assert_eq!(fs::read(&file).unwrap(), ambiguous);
        assert_eq!(fs::read(&previous).unwrap(), valid);

        fs::write(&file, valid).unwrap();
        fs::write(&previous, ambiguous).unwrap();
        let LoadedSession::Primary(session) = load(&file).unwrap() else {
            panic!("expected primary")
        };
        assert!(matches!(
            save(&file, &session),
            Err(StateError::Invalid { .. })
        ));
        assert_eq!(fs::read(&file).unwrap(), valid);
        assert_eq!(fs::read(&previous).unwrap(), ambiguous);
    }

    #[test]
    fn about_urls_supported_by_navigation_can_be_saved_and_restored() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("session.json");
        let mut state = sample();
        state.tabs[0].url = "about:blank".into();
        save(&file, &state).unwrap();
        assert_eq!(load(&file).unwrap(), LoadedSession::Primary(state));
    }
}

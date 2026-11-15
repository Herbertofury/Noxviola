//! Noxviola-only session location and single-writer checkpoint worker.
//! Hermes is MPL-2.0; Noxviola's separate session core is GPL-3.0-only.
use noxviola_core::{LoadedSession, Session};
use std::{
    fs::{self, File, OpenOptions},
    io,
    path::PathBuf,
    rc::Rc,
    sync::mpsc::{self, Receiver, Sender},
    thread::{self, JoinHandle},
};

pub enum Message {
    Save { session: Session, revision: u64 },
    Finish(Option<Session>),
}
pub struct SaveResult {
    pub revision: u64,
    pub result: Result<(), String>,
}

pub struct SessionStore {
    // Keep the lock alive through the final worker join.
    _lock: File,
    sender: Sender<Message>,
    pub results: Rc<Receiver<SaveResult>>,
    worker: JoinHandle<Result<(), String>>,
}

fn data_dir() -> io::Result<PathBuf> {
    #[cfg(windows)]
    let base = std::env::var_os("LOCALAPPDATA");
    #[cfg(not(windows))]
    let base = std::env::var_os("XDG_DATA_HOME").or_else(|| {
        std::env::var_os("HOME")
            .map(|home| PathBuf::from(home).join(".local/share").into_os_string())
    });
    base.map(PathBuf::from)
        .map(|p| p.join("Noxviola").join("servo-experimental"))
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "No user data directory is available",
            )
        })
}

impl SessionStore {
    pub fn open() -> Result<(Session, Self), Box<dyn std::error::Error>> {
        let dir = data_dir()?;
        fs::create_dir_all(&dir)?;
        let lock = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(dir.join("session.lock"))?;
        fs2::FileExt::try_lock_exclusive(&lock).map_err(|error| {
            io::Error::new(
                error.kind(),
                format!("Cannot acquire Noxviola session lock: {error}"),
            )
        })?;
        let path = dir.join("browser-session.json");
        let restored = match noxviola_core::load(&path)? {
            LoadedSession::New(session) | LoadedSession::Primary(session) => session,
            LoadedSession::Previous { primary_error, .. } => {
                return Err(io::Error::other(format!(
                    "Session recovery required; files preserved in {}: {primary_error}",
                    dir.display()
                ))
                .into());
            }
        };
        if restored
            .profiles
            .iter()
            .any(|profile| profile.id != "personal")
            || restored.tabs.iter().any(|tab| tab.identity != "personal")
        {
            return Err(io::Error::other("This experimental Servo build cannot safely restore tabs from named identities because storage isolation is not implemented. Session files were left untouched.").into());
        }
        let (sender, receiver) = mpsc::channel();
        let (result_sender, results) = mpsc::channel();
        let worker = thread::spawn(move || {
            while let Ok(message) = receiver.recv() {
                match message {
                    Message::Save { session, revision } => {
                        let result =
                            noxviola_core::save(&path, &session).map_err(|error| error.to_string());
                        let _ = result_sender.send(SaveResult { revision, result });
                    }
                    Message::Finish(session) => {
                        return session.map_or(Ok(()), |session| {
                            noxviola_core::save(&path, &session).map_err(|error| error.to_string())
                        });
                    }
                }
            }
            Err("Session worker stopped without a final checkpoint".into())
        });
        Ok((
            restored,
            Self {
                _lock: lock,
                sender,
                results: Rc::new(results),
                worker,
            },
        ))
    }

    pub fn sender(&self) -> Sender<Message> {
        self.sender.clone()
    }

    pub fn finish(self, session: Option<Session>) -> Result<(), Box<dyn std::error::Error>> {
        self.sender
            .send(Message::Finish(session))
            .map_err(|_| io::Error::other("Session worker disconnected"))?;
        self.worker
            .join()
            .map_err(|_| io::Error::other("Session worker panicked"))?
            .map_err(io::Error::other)?;
        Ok(())
    }
}

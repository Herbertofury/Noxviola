use std::collections::VecDeque;

use crate::address::{AddressResolutionError, resolve_address};
use crate::browser::{BrowserCommand, BrowserEvent, BrowserState};
use crate::{Tab, TabCommand, TabId};

#[derive(Debug)]
pub struct BrowserController {
    tabs: Vec<Tab>,
    active_tab_id: TabId,
    next_tab_id: u64,
    command_queue: VecDeque<TabCommand>,
    session: noxviola_core::Session,
    revision: u64,
}

impl BrowserController {
    pub fn new(state: BrowserState) -> Self {
        let initial_tab_id = TabId::new(1);

        Self {
            tabs: vec![Tab::new(initial_tab_id, state)],
            active_tab_id: initial_tab_id,
            next_tab_id: 2,
            command_queue: VecDeque::new(),
            session: noxviola_core::Session::default(),
            revision: 0,
        }
    }

    /// Restore tab order and active selection. Numeric IDs are runtime-only;
    /// durable identifiers and unknown metadata remain with each tab.
    pub fn from_session(mut session: noxviola_core::Session) -> Result<Self, String> {
        session.validate()?;
        if !session
            .profiles
            .iter()
            .any(|profile| profile.id == "personal")
        {
            session.profiles.push(noxviola_core::Profile {
                id: "personal".into(),
                name: "Personal".into(),
                extra: Default::default(),
            });
        }
        if session.tabs.is_empty() {
            let mut controller = Self::default();
            controller.session = session;
            return Ok(controller);
        }
        let mut tabs = Vec::with_capacity(session.tabs.len());
        let mut active_tab_id = TabId::new(1);
        for (index, saved) in session.tabs.iter().enumerate() {
            let id = TabId::new(index as u64 + 1);
            if session.active_id.as_deref() == Some(saved.id.as_str()) {
                active_tab_id = id;
            }
            let state = BrowserState::from_session(saved.url.clone(), saved.title.clone());
            let mut tab = Tab::new(id, state);
            tab.saved = saved.clone();
            tabs.push(tab);
        }
        Ok(Self {
            next_tab_id: tabs.len() as u64 + 1,
            tabs,
            active_tab_id,
            command_queue: VecDeque::new(),
            session,
            revision: 0,
        })
    }

    pub fn session_snapshot(&self) -> noxviola_core::Session {
        let mut snapshot = self.session.clone();
        snapshot.tabs = self
            .tabs
            .iter()
            .map(|tab| {
                let mut saved = tab.saved.clone();
                saved.url = tab.state().url().to_owned();
                saved.title = tab.state().page_title().to_owned();
                saved
            })
            .collect();
        snapshot.active_id = self
            .tabs
            .iter()
            .find(|tab| tab.id() == self.active_tab_id)
            .map(|tab| tab.saved.id.clone());
        snapshot
    }

    pub const fn session_revision(&self) -> u64 {
        self.revision
    }

    pub fn queue_navigation(&mut self, input: &str) -> Result<(), AddressResolutionError> {
        let url = resolve_address(input)?.to_string();
        self.active_state_mut()
            .apply(BrowserEvent::AddressChanged { url: url.clone() });
        self.revision = self.revision.wrapping_add(1);
        self.queue_command(BrowserCommand::Navigate { url });
        Ok(())
    }

    pub fn state(&self) -> &BrowserState {
        self.active_state()
    }

    pub fn active_state(&self) -> &BrowserState {
        self.active_tab()
            .expect("the controller always owns an active tab")
            .state()
    }

    pub const fn active_tab_id(&self) -> TabId {
        self.active_tab_id
    }

    pub fn tabs(&self) -> impl ExactSizeIterator<Item = &Tab> {
        self.tabs.iter()
    }

    pub fn open_tab(&mut self) -> TabId {
        let tab_id = TabId::new(self.next_tab_id);
        self.next_tab_id += 1;
        self.tabs.push(Tab::new(tab_id, BrowserState::default()));
        self.active_tab_id = tab_id;
        self.revision = self.revision.wrapping_add(1);
        tab_id
    }

    pub fn select_tab(&mut self, tab_id: TabId) -> bool {
        if self.tabs.iter().any(|tab| tab.id() == tab_id) {
            self.active_tab_id = tab_id;
            self.revision = self.revision.wrapping_add(1);
            true
        } else {
            false
        }
    }

    pub fn select_tab_at(&mut self, index: usize) -> bool {
        let Some(tab) = self.tabs.get(index) else {
            return false;
        };

        self.active_tab_id = tab.id();
        self.revision = self.revision.wrapping_add(1);
        true
    }

    pub fn select_next_tab(&mut self, backwards: bool) {
        let active_index = self
            .tabs
            .iter()
            .position(|tab| tab.id() == self.active_tab_id)
            .expect("the active tab is always present");
        let next_index = if backwards {
            active_index.checked_sub(1).unwrap_or(self.tabs.len() - 1)
        } else {
            (active_index + 1) % self.tabs.len()
        };

        self.active_tab_id = self.tabs[next_index].id();
        self.revision = self.revision.wrapping_add(1);
    }

    pub fn close_tab(&mut self, tab_id: TabId) -> bool {
        if self.tabs.len() == 1 {
            return false;
        }

        let Some(index) = self.tabs.iter().position(|tab| tab.id() == tab_id) else {
            return false;
        };

        let was_active = self.active_tab_id == tab_id;
        self.tabs.remove(index);
        self.revision = self.revision.wrapping_add(1);
        self.command_queue
            .retain(|queued| queued.tab_id() != tab_id);

        if was_active {
            let replacement_index = index.saturating_sub(1).min(self.tabs.len() - 1);
            self.active_tab_id = self.tabs[replacement_index].id();
        }

        true
    }

    pub fn close_tab_at(&mut self, index: usize) -> bool {
        let Some(tab_id) = self.tabs.get(index).map(Tab::id) else {
            return false;
        };

        self.close_tab(tab_id)
    }

    pub fn queue_command(&mut self, command: BrowserCommand) {
        let tab_id = self.active_tab_id;
        let queued = self.queue_command_for(tab_id, command);
        debug_assert!(queued, "the active tab must accept commands");
    }

    pub fn queue_command_for(&mut self, tab_id: TabId, command: BrowserCommand) -> bool {
        if !self.tabs.iter().any(|tab| tab.id() == tab_id) {
            return false;
        }

        if let Some(last_command) = self.command_queue.back_mut() {
            if last_command.tab_id() != tab_id {
                self.command_queue
                    .push_back(TabCommand::new(tab_id, command));
                return true;
            }

            match (last_command.command_mut(), &command) {
                (
                    BrowserCommand::PointerMoved { x, y },
                    BrowserCommand::PointerMoved {
                        x: latest_x,
                        y: latest_y,
                    },
                ) => {
                    *x = *latest_x;
                    *y = *latest_y;
                    return true;
                }
                (
                    BrowserCommand::Scrolled {
                        delta_x,
                        delta_y,
                        x,
                        y,
                    },
                    BrowserCommand::Scrolled {
                        delta_x: latest_delta_x,
                        delta_y: latest_delta_y,
                        x: latest_x,
                        y: latest_y,
                    },
                ) => {
                    *delta_x += latest_delta_x;
                    *delta_y += latest_delta_y;
                    *x = *latest_x;
                    *y = *latest_y;
                    return true;
                }
                (
                    BrowserCommand::FocusChanged { focused },
                    BrowserCommand::FocusChanged {
                        focused: latest_focused,
                    },
                ) => {
                    *focused = *latest_focused;
                    return true;
                }
                _ => {}
            }
        }

        self.command_queue
            .push_back(TabCommand::new(tab_id, command));
        true
    }

    pub fn next_command(&mut self) -> Option<TabCommand> {
        self.command_queue.pop_front()
    }

    pub fn has_pending_commands(&self) -> bool {
        !self.command_queue.is_empty()
    }

    pub fn handle_event(&mut self, tab_id: TabId, event: BrowserEvent) -> bool {
        let Some(tab) = self.tabs.iter_mut().find(|tab| tab.id() == tab_id) else {
            return false;
        };

        let session_changed = matches!(
            &event,
            BrowserEvent::AddressChanged { .. } | BrowserEvent::PageTitleChanged { .. }
        );
        tab.state_mut().apply(event);
        if session_changed {
            self.revision = self.revision.wrapping_add(1);
        }
        true
    }

    fn active_tab(&self) -> Option<&Tab> {
        self.tabs.iter().find(|tab| tab.id() == self.active_tab_id)
    }

    fn active_state_mut(&mut self) -> &mut BrowserState {
        let active_tab_id = self.active_tab_id;
        self.tabs
            .iter_mut()
            .find(|tab| tab.id() == active_tab_id)
            .expect("the controller always owns an active tab")
            .state_mut()
    }
}

impl Default for BrowserController {
    fn default() -> Self {
        Self::new(BrowserState::default())
    }
}

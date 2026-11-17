# Sidebar, settings and tab interaction checkpoint

The 2026-11-17 implementation retains the full Opera GX + Firefox sidebar target. It does not establish complete parity.

## Working behavior

- The launcher supports workspaces, tabs, bookmarks, history, downloads, accounts/identities, Extensions, Settings and Library. Following, Resource Monitor and New tab are optional launcher controls. Their managers use the existing canonical services. A manager shortcut does not imply an embedded extension sidebar or a proprietary Opera service.
- Account entries show only the current identity's non-secret metadata. Opening a row rechecks the identity and routes through its actual Session. Firefox password storage, autofill and OS reauthentication remain unimplemented.
- Panels have saved pin state. Unpinned panels dismiss after a page click or keyboard interaction; renderer completion is observed before geometry changes. A slow generated click, typed character, re-pinning and returning to a sidebar website are covered by the native tests. No pointer polling is used.
- Motion uses the installed Firefox resource's 230/190ms panel and 200/160ms launcher durations with `cubic-bezier(0.2, 0, 0, 1)`. Reduced motion and interrupted transitions are retained. Electron view resizing differs from Firefox's view-transition architecture.
- Settings has categorized navigation, search, draft preservation, hidden-invalid-field reveal, responsive layout and links to existing managers. It remains an in-window page. The top-right button opens a native browser menu with functional Settings and manager actions.
- Tabs have separate selection and close controls. Right-click, Shift+F10 and the context-menu key open the same tab actions. Reload and Duplicate target the requested tab; group/workspace assignment, pinning, muting, moving and closing remain available. Native tests cover background-tab actions.

## Verification and practical limits

The integrated Windows source gate and 502 automated tests passed after merging the nested-pane branch. The native suite exercises account identity boundaries, menu display and Settings routing, settings search, canonical manager launchers, tab menu actions, page input preservation, restart recovery and existing browser workflows. Packaged execution and CI have separate receipts; no source test is a substitute for those.

A fresh local 12-toggle sample recorded 439 JavaScript frame intervals: median 6.9ms, p95 7.1ms, maximum 7.2ms. These are shell callback intervals, not compositor presentation measurements or a claim of equal performance to Firefox.

## Remaining parity work

Opera-specific GX resource limiters, GX Corner/rewards/cleaner, My Flow and device services, full news/pinboards, coordinated media playback, messenger notifications/unread state, full provider sign-in qualification and sidebar extension APIs remain open. Firefox password management, synced tabs, full bookmark/history variants, extension sidebarAction, hover expansion and all reference customization/accessibility variants remain open. Website panels and existing managers provide useful partial behavior; they do not fulfill these missing services.

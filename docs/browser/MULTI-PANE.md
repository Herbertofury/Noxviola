# Independent multi-pane browsing

## Open a new pane in a named container

From the New Tab container menu, choose **Split right in container** or **Split below in container**, then pick an enrolled container. The existing pane stays open. The new pane gets a fresh blank tab in the selected session, in the current workspace. It does not move an existing tab from another workspace or copy the originating pane's page or sign-in. A menu opened for a pane that is no longer present cannot split a replacement pane.

## Owner goal

Arbitrarily many independently controllable browser panes, split in either direction and configurable like windows. Each pane must select its own account/container with real storage isolation. The supplied reference shows side-by-side ChatGPT panes, but appearance alone is not the implementation baseline. Full Firefox/Chrome grouping and movement parity remains the target, not a completion claim.

## Implemented candidate

- A persisted binary layout tree supports repeated side-by-side and stacked splits with no fixed pane-count cap. Actual sandboxed `WebContentsView` instances occupy the calculated rectangles; this is not iframe simulation.
- Every pane has address/search, account-container selection, focus, nested split and hide controls. Hide preserves its tab; closing a tab removes only that pane and collapses its now-empty branch. Existing Split command collapses back to one pane without closing tabs.
- Account switching creates a different tab/view in the selected existing identity session. It never changes the session of a live view or copies cookies/storage/grants. The old account tab remains available. Extension pages must be opened separately in their enrolled identity. Logged-in accounts themselves are not fabricated.
- Native page focus selects the active pane for shared browser controls. Per-pane commands target stable tab IDs, not whichever pane happened to become active later. Address drafts and input selection survive chrome rerenders.
- Divider keyboard arrows resize splits; pointer release commits a dragged divider. Live drag-preview smoothness and platform input capture remain qualification targets, not a claim of full desktop-window behavior.
- Explicit position swapping changes pane placement. Ordinary tab-strip movement moves the split's member tabs as one contiguous unit and does not swap visual pane positions. Group/workspace assignment and pin changes apply to the unit. Grouping within a workspace preserves the split layout.
- Layout and identities are part of the existing atomic session checkpoint. Invalid, duplicate, missing-tab or cross-workspace persisted layout data fails validation instead of silently discarding panes. Selecting an unrelated tab suspends the current split unit without changing either tab's group or pin. Returning to any member restores its tree, including across workspace switches; suspended units are saved in the same atomic session checkpoint. Group/pin and ordinary movement operate on both active and suspended units.

There is no arbitrary application pane limit, but screen space and real processes are finite. Very small panes can have zero remaining content area; there is no claim that dozens of native surfaces remain usable on a small display. More panes consume resources. No measured performance superiority is claimed. Chrome toolbar rebuilds are skipped when their relevant state is unchanged.

## Actual source-code parity study

The source review examined [Firefox Tabbrowser.sys.mjs](https://github.com/mozilla-firefox/firefox/blob/main/browser/components/tabbrowser/Tabbrowser.sys.mjs) and [tabsplitview.mjs](https://github.com/mozilla-firefox/firefox/blob/main/browser/components/tabbrowser/content/tabsplitview.mjs): a split wrapper moves atomically into groups; ordinary tab movement is distinct from `reverseTabs`; unsplitting retains tabs; cross-window adoption preserves split identity. It also examined [Chromium tab_strip_model.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/tabs/tab_strip_model.cc) and [tests](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/tabs/tab_strip_model_unittest.cc): split collection movement retains group/pin metadata, layout/ratio are visual state, and ordinary moves differ from explicit reversal. Chromium's two-tab restriction is not imported into Noxviola's arbitrary-pane model.

These are public-source semantics, not an assertion that the user's installed browser builds were inspected. Current owner computer is unavailable to this pass. No donor implementation or trademark artwork was copied.

## Acceptance gates

Portable tests cover nested partition geometry, non-overlap, 65-leaf model preservation, immutable resize/removal, strict saved-layout validation and identity-scoped UI commands. Native tests exercise three actual surfaces, both axes, isolated same-origin identities, swapping/resizing, group/unit movement and real restart layout restoration. Hosted exact-commit results, not local DOM tests, establish native passage. The local workspace lacks a desktop display.

Open: native drag-to-edge creation and high-frequency resize behavior; explicit cross-window split adoption/detachment; full grouped-wrapper visual parity; full per-workspace UI for selecting among split units; arbitrary-count native scale benchmarks; accessibility and tiny-screen usability; owner-device testing. Preserve browser foundation, unrelated work and existing project holds. No full browser parity or release readiness is claimed by this candidate.

## Whole-group action

The group-header actions button/context menu (including Shift+F10) and Workspaces group card offer **Show all N tabs in split view**. The action uses every current tab in that group, including collapsed groups, without changing group collapse state, pinning, identities, tab URLs or tab-strip order. Empty groups are disabled/rejected; one-tab groups focus that tab. Larger groups receive a balanced alternating-axis tree, with no application count cap. Existing overlapping pane units retain unselected tabs; no tab is closed. Invoking it again on the same membership preserves the customized ratios/visual swaps, including suspended layouts. Closing a pane closes only its tab; normal restore plus the group action restores group participation. The five-pane group is covered by native restart tests. Finite display/process resources still limit practical simultaneous use; there is no high-count native performance guarantee.

Rust-first exception for this increment is narrowly the existing Electron menu/renderer-to-WebContentsView integration: it composes the existing JavaScript pane model and does not add a new service, duplicate native core or Rust sidecar/build pipeline. No claim that JavaScript outperforms Rust is made. The recorded Rust pane-core evaluation remains pending; future independent core additions should start with Rust.

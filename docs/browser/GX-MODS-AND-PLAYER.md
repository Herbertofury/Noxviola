# GX player and mod compatibility

## Player and Mini Player

Select **Media player** in the rail, then choose Spotify, Apple Music, Deezer, SoundCloud, TIDAL or YouTube Music. The current identity owns the service session. The service picker provides **Player Home** and **Player Settings**. The header can expand the service across the browsing area, return to its sidebar width, reload, pin, close or unload. The mixer returns to browser-owned audio controls while the service stays loaded.

The toolbar Mini Player appears directly after the address and search field when a Player service starts playback. It shows the track, artist and service, with play or pause and any next or previous actions the site registers through Media Session. Float it into a draggable window with seek and volume, dock it again, or hide the controls while the track continues. Settings search finds the Player controls for toolbar, floating or hidden placement, background, interruption and resume time. Other Noxviola audio can interrupt playback. Resumption targets the same paused source and honours an explicit pause or a change of identity.

On a compatible playing audio or video element, open **Volume boost & equalizer**, choose 100–500% gain and one of eight presets, and select **Apply**. Gain, filters and a compressor process captured audio locally. Reset stops the capture and restores the normal audio route. Protected streams, closed shadow roots and Web Audio-only providers require different integration. Provider sign-in and protected playback remain service- and engine-dependent.

Installed Opera GX `139.0.6053.63` resources 58256, 62127 and 63682 call `opr.browserSidebarPrivate.switchToPlayerWindow`, `opr.browserSidebarPrivate.openPlayerHome` and `opr.mediaPlayerPrivate.onVideoElementInserted`. The adjacent native DLL contains `MiniplayerServiceFactory`, `SidebarMiniplayerViewGx`, `ToolbarMiniplayerViewGx`, separate toolbar artwork, metadata and button views, and `playerServiceShowMiniplayerBackground`. These are shipped resource calls and symbol names. Opera describes the toolbar, floating placement and interruption behavior publicly. [Opera GX Mini Player](https://blogs.opera.com/news/2026/06/step-into-summer-with-a-massive-update-from-gx/)

A Windows synthetic runtime test exercised real Chromium audio, Media Session callbacks, seeking, active-identity boundaries, both control surfaces, native always-on-top placement and Settings persistence. The control sat 3 CSS pixels after the address field at 700 and 1,320 pixel window widths. The source test observed 16 ms to reveal the toolbar control after playback and 194 ms to show the floating controls, measured through an automated local UI. These observations do not establish comparative browser speed or commercial account playback. The controller reacts to playback events and only sets a timer for a pending automatic resume. The visible floating view interpolates its progress locally.

## Packages and store

Open **Mods** in the sidebar. **Browse GX Store** opens the official catalog, including its real categories and search. **Browse Opera Add-ons** opens that catalog. Use the existing Extensions manager to review compatible local browser add-ons. Use **Inspect mod folder** or **Inspect mod ZIP** for a publisher or creator's GX source package with `manifest.json`. Review the category and website scope before importing. Each category can be enabled separately and can come from a different package.

The importer supports legacy payloads and named components from schema v2. Choose a component in each category, then save the whole combination as a named preset. Importing starts with every category off. Previously imported files that lacked a verified hash require a new review from the original folder or ZIP.

| Category | Working desktop behavior |
| --- | --- |
| Themes and wallpapers | Light and dark palettes, local still images or video with optional poster, and supported start-page tint, blur, opacity and vignette fields |
| Background music | Named tracks, synchronized layers using one audio clock, an activity-responsive mix, and pausing for other browser audio |
| Browser and keyboard sounds | Named sound sets and supported browser-chrome events |
| Web modding | Scoped offline CSS with named styles and package-local verification |
| Fonts | Header and body faces with declared weights and styles |
| Cursors | Static cursor files for corresponding browser controls |
| App icons | Browser brand and native window icon on Windows |
| Sidebar icons | Self-contained Lottie vector animations for matching tools, with hover and focus playback |
| Splash screen | A local startup video you can skip |
| Stickers | Place and move stickers on a visible page screenshot, undo a placement, and save the result as a local PNG from **More tools → Edit screenshot** |

Direct signed GX Store and Opera Add-ons installation still needs a verified acquisition path. SkSL shaders and Speed Dial effects use a compositor contract that remains separate. Game strips, mobile overrides, animated cursors, dynamic wallpaper components, linked stylesheets and Lottie assets with external media require their own runtime paths. Package reviews show unsupported components and the local archive preserves their bytes.

## Observed implementation boundaries

Read-only inspection of Opera GX `139.0.6053.63` found 5,281 entries in the installed `opera.pak`, SHA-256 `f0f743830b3de8b60212611166a2c2bb636123ff79fcb8fe1b8d5fc8cf8c3f17`. Resource 62137 calls private per-category APIs for selection, presets, fonts, icons, cursors, wallpapers, sounds, themes and splash screens. Resources 62134 and 62149 read category settings. Resource 63682 calls `opr.mediaPlayerPrivate.onVideoElementInserted`; resource 63588 uses `chrome.tabCapture.getMediaStreamId` for GX Chroma visualization. That visualization does not establish the signal path of GX's booster. Native `SetAudioEqualizer` and `AudioEqualizerServiceFactory` names were also found in the installed binary. No proprietary implementation or assets were copied into Noxviola.

In this pass, the installed sidebar settings bundle at resource 62134 listed the active role for app icons, fonts, cursors, image overrides, splash screens and stickers. Resources 62142 and 62149 enumerated presets and independent category enablement. Resource 18346 selected the active Speed Dial effect. Resource 62203 managed and validated shaders through the native service. Resource 62127 selected Game Strips. The schema v2 field shapes were cross-checked against a pinned template from a public mod author. [Expanded mod template at `91fad40`](https://github.com/mr-jamz/opera-gx-mod-builder/blob/91fad40124b4e466d5de92e908eaf99bb07db85e/ModTemplate2.0/manifest.json)

Public GX Store detail scripts validate versioned installation metadata, including IDs for the release, package and CRX. The reviewed detail HTML exposes no direct ZIP or CRX download link. The browser-side install contract and publisher trust would need verification before equivalent one-click acquisition is enabled.

Windows synthetic QA imports both a folder and a ZIP, activates categories across packages, decodes wallpaper and sound, probes a real site's applied CSS, navigates the GX catalog, and checks restart. The audio QA samples the actual compressor output for two gain settings and a bass preset, then verifies the reset restores the original element. Expanded-package QA selects named components, decodes a real font, loads a native icon, renders a vector sidebar override, measures music layers starting at the same audio timestamp, exports a sticker in the captured PNG, plays and skips a real startup video, and restores the preset after restart.

Sources: [Opera's mod format](https://github.com/opera-gaming/gxmods/blob/main/documentation/mods.md), [manifest template](https://github.com/opera-gaming/gxmods/blob/main/documentation/Mod_Template/manifest.json), [GX Store](https://store.gx.me/mods/), [GX audio controls](https://press.opera.com/2026/10/29/opera-gx-browser-booster/), [GX music player](https://www.opera.com/gx/features/music-player), [Electron extension support](https://www.electronjs.org/docs/latest/api/extensions-api).

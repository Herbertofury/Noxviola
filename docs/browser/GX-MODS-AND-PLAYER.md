# GX player and mod compatibility

Select **Media player** in the rail to open a music service in the same isolated identity as the current tab. The provider picker includes Spotify, Apple Music, Deezer, SoundCloud, TIDAL and YouTube Music. The **Mixer** button returns to playback controls while the provider remains loaded. **Unload** stops the current provider panel. Service authentication and protected playback depend on that site and the engine.

On a compatible playing audio or video element, open **Volume boost & equalizer**, choose 100–500% gain and one of eight presets, and select **Apply**. Gain, filters and a compressor process captured audio locally. Reset stops the capture and restores the normal audio route. This implementation works on individual capture-compatible HTML media elements. The browser-wide native output graph, protected media, Web Audio-only sites, and provider transport commands need separate integration.

## Packages and store

Open **Mods** in the sidebar. **Browse GX Store** opens the official catalog, including its real categories and search. **Browse Opera Add-ons** opens that catalog. Use the existing Extensions manager to review compatible local browser add-ons. Use **Inspect mod folder** or **Inspect mod ZIP** for a publisher or creator's GX source package with `manifest.json`. Review the category and website scope before importing. Each category can be enabled separately and can come from a different package.

The first adapter supports the published light/dark HSL theme palette, local image or video wallpapers, selected keyboard and browser sound events, one background track with audio ducking, and network-free CSS on declared HTTP(S) pages. The preview retains additional layers and unsupported assets in the package. Reviews identify unsupported categories and stylesheet variants before activation. The local import does not run extension scripts from a mod. The original package and earlier checkpoints are preserved.

One-click GX Store and Opera Add-ons installation, verified publisher-signed CRX ingestion, multilayer music, richer wallpaper formats, shaders, font replacement, icon sets, cursors, splash screens, stickers, game strips, Speed Dial effects, and mobile variants have independent runtime and trust requirements. A catalog listing or a CRX ID does not establish a usable package distribution route. Desktop package features can differ from mobile assets and linked GX Corner content.

## Observed implementation boundaries

Read-only inspection of Opera GX `139.0.6053.63` found 5,281 entries in the installed `opera.pak`, SHA-256 `f0f743830b3de8b60212611166a2c2bb636123ff79fcb8fe1b8d5fc8cf8c3f17`. Resource 62137 calls private per-category APIs for selection, presets, fonts, icons, cursors, wallpapers, sounds, themes and splash screens. Resources 62134 and 62149 read category settings. Resource 63682 calls `opr.mediaPlayerPrivate.onVideoElementInserted`; resource 63588 uses `chrome.tabCapture.getMediaStreamId` for GX Chroma visualization. That visualization does not establish the signal path of GX's booster. Native `SetAudioEqualizer` and `AudioEqualizerServiceFactory` names were also found in the installed binary. No proprietary implementation or assets were copied into Noxviola.

Public GX Store detail scripts validate versioned installation metadata, including IDs for the release, package and CRX. The reviewed detail HTML exposes no direct ZIP or CRX download link. The browser-side install contract and publisher trust would need verification before equivalent one-click acquisition is enabled.

Windows synthetic QA imports both a folder and a ZIP, activates categories across packages, decodes wallpaper and sound, probes a real site's applied CSS, navigates the GX catalog, and checks restart. The audio QA samples the actual compressor output for two gain settings and a bass preset, then verifies the reset restores the original element.

Sources: [Opera's mod format](https://github.com/opera-gaming/gxmods/blob/main/documentation/mods.md), [manifest template](https://github.com/opera-gaming/gxmods/blob/main/documentation/Mod_Template/manifest.json), [GX Store](https://store.gx.me/mods/), [GX audio controls](https://press.opera.com/2026/10/29/opera-gx-browser-booster/), [GX music player](https://www.opera.com/gx/features/music-player), [Electron extension support](https://www.electronjs.org/docs/latest/api/extensions-api).

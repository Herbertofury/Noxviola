# Noxviola Fox Globe Icon Pack

Ready-to-use icon exports from the **final approved purple fox / Earth artwork**. The original artwork is copied byte-for-byte; this pack was created **without image generation**.

## Contents

- `source/fox_globe_original_1254.png`: untouched original RGBA artwork
- `png_transparent/`: 16, 20, 24, 32, 40, 48, 64, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512, 1024 px PNGs
- `windows/fox_globe_windows.ico`: multi-resolution Windows desktop/taskbar icon (16/24/32/48/64/128/256)
- `macos/fox_globe_macos.icns`: native Mac app icon
- `web_favicon/`: favicon ICO/PNG, 180px Apple touch icon, Android/PWA PNGs, web manifest, HTML icon tags
- `browser_extension/icons/`: icon16.png, icon32.png, icon48.png, icon96.png, icon128.png for Chrome / Firefox / Opera GX extensions
- `browser_extension/manifest-icons-example.json`: merge the `icons` and `action.default_icon` objects into your existing extension manifest (do not replace the entire manifest)
- `previews/`: real-scale light/dark size sheet and nearest-neighbor detail inspection

## Common choices

- **Windows shortcut:** `windows/fox_globe_windows.ico`
- **Opera GX / Chrome / Firefox extension:** `browser_extension/icons/`, then use the manifest snippet
- **Website favicon:** copy `web_favicon/` into the site root and add the HTML tags
- **Mac app:** `macos/fox_globe_macos.icns`
- **Full-quality transparent master:** `source/fox_globe_original_1254.png`

All icon exports maintain alpha transparency; only the comparison previews have a background. Tiny icons use gentle resize sharpening for legibility. The artwork itself is not modified or redrawn.

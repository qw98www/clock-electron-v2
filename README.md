# Cat Clock Electron v2

A fresh Electron-based desktop break reminder for macOS.

## Assets

This repository does not bundle the cat videos. Place these files in `renderer/assets/` before running:

- `assets1.webm`
- `assets2.webm`

## Development

```bash
npm install
npm start
```

## Packaging

```bash
npm run dist
```

The packaged app is generated in `dist/`.

## Notes

- The app keeps running in the tray when the control panel window is closed.
- Electron is used here because Chromium correctly renders the source WebM transparency on macOS.

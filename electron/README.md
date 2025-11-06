# Tyton Desktop Application (Electron)

This directory contains the Electron wrapper for the Tyton Orchestrator desktop application.

## Quick Start

### Development Mode
```bash
# From project root
npm run electron:dev
```

### Build Installers
```bash
# Build for current platform
npm run electron:build

# Build for specific platforms
npm run electron:build:win     # Windows
npm run electron:build:mac     # macOS  
npm run electron:build:linux   # Linux
```

## Files

- **`main.js`** - Electron main process (application entry point)
- **`preload.js`** - Preload script for secure renderer-main communication
- **`icon.png`** - Application icon (placeholder - update with actual icon)
- **`build/`** - Build resources for platform-specific installers

## How It Works

1. **Main Process** (`main.js`) starts the Express server
2. Server runs on `localhost:5000`
3. Electron window loads the React app from the local server
4. All web app functionality works as-is in the desktop app

## Configuration

Build configuration is in `/electron-builder.json` at project root.

## Adding Features

To add Electron-specific features:
1. Edit `main.js` for main process features
2. Edit `preload.js` to expose APIs to renderer
3. Update web app to use `window.electron` APIs if needed

## Platform-Specific Icons

For production builds, replace the placeholder icon with proper icons:

- **Windows:** Place `icon.ico` in `build/` (256x256 recommended)
- **macOS:** Place `icon.icns` in `build/` (1024x1024 source)
- **Linux:** Place `icon.png` in `build/` (512x512 recommended)

You can use tools like `electron-icon-builder` to generate platform icons:
```bash
npx electron-icon-builder --input=./icon.png --output=./electron/build
```

## Security

This app follows Electron security best practices:
- Context isolation enabled
- Node integration disabled in renderer
- Preload script for controlled IPC
- Web security enabled

## Troubleshooting

See `/DESKTOP_APP_MAINTENANCE.md` for common issues and solutions.

# Tyton Desktop Application - Maintenance Guide

## 🚨 IMPORTANT FOR ALL AGENTS AND DEVELOPERS

**This project includes both a web application AND a desktop application built with Electron.**

When making changes to the web application, you MUST also ensure the desktop application remains functional and up-to-date.

---

## Architecture Overview

The Tyton Desktop Application is built using Electron and wraps the full-stack web application:

```
┌─────────────────────────────────────────┐
│     Electron Main Process               │
│  (electron/main.js)                     │
│                                         │
│  - Starts Express Server                │
│  - Creates Browser Window               │
│  - Manages Application Lifecycle        │
└─────────────────────────────────────────┘
           │
           ├──────────────┬──────────────┐
           │              │              │
           ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │  Server  │   │ Renderer │   │ Preload  │
    │ Process  │   │ Process  │   │  Script  │
    │          │   │          │   │          │
    │ Express  │   │  React   │   │ Security │
    │ + APIs   │   │   App    │   │  Bridge  │
    └──────────┘   └──────────┘   └──────────┘
```

---

## Critical Files

### Electron-Specific Files
- **`electron/main.js`** - Main Electron process (window management, server startup)
- **`electron/preload.js`** - Preload script for secure IPC communication
- **`electron-builder.json`** - Build configuration for creating installers
- **`electron/build/`** - Build resources (icons, entitlements)

### Shared Files (Used by Both Web and Desktop)
- **`client/`** - React frontend application
- **`server/`** - Express backend server
- **`shared/`** - Shared TypeScript types and schemas
- **`package.json`** - Dependencies and scripts for both apps

---

## Maintenance Checklist

### ✅ When Adding New Features

- [ ] Implement feature in the web app (React components, server APIs)
- [ ] Test the feature in web mode (`npm run dev`)
- [ ] **Test the feature in desktop mode (`npm run electron:dev`)**
- [ ] Ensure no browser-specific APIs that won't work in Electron
- [ ] Update this document if new Electron-specific code is needed

### ✅ When Modifying Server Code

- [ ] Test that server starts correctly in Electron
- [ ] Verify port configuration (default: 5000) works
- [ ] Check that all API endpoints are accessible from Electron renderer
- [ ] Ensure proper error handling for server failures

### ✅ When Updating Dependencies

- [ ] Run `npm install` to update all dependencies
- [ ] Test web app: `npm run dev`
- [ ] **Test desktop app: `npm run electron:dev`**
- [ ] If Electron has issues, may need to rebuild native modules:
  ```bash
  npm run electron:rebuild
  ```
- [ ] Test building installers: `npm run electron:build`

### ✅ When Modifying Build Process

- [ ] Update both `vite.config.ts` (web) and `electron-builder.json` (desktop)
- [ ] Test production build for web: `npm run build && npm start`
- [ ] **Test desktop build: `npm run electron:build`**
- [ ] Verify installer works on target platform

### ✅ When Adding External Dependencies

- [ ] Check if dependency works in Electron environment
- [ ] Some Node.js native modules may need electron-rebuild
- [ ] Test in both dev and production builds
- [ ] Update `electron-builder.json` if files need to be included

---

## Development Commands

### Running Desktop App in Development

```bash
# Start the web app dev server (for development)
npm run dev

# In another terminal, start Electron
npm run electron:dev
```

The desktop app will:
1. Start the Express server on port 5000
2. Open an Electron window loading `http://localhost:5000`
3. Include DevTools for debugging

### Building Desktop App

```bash
# Build for current platform
npm run electron:build

# Build for specific platforms
npm run electron:build:win      # Windows (NSIS installer + Portable)
npm run electron:build:mac      # macOS (DMG + ZIP, Universal binary)
npm run electron:build:linux    # Linux (AppImage, DEB, RPM, tar.gz)

# Build for all platforms (requires platform-specific tools)
npm run electron:build:all
```

Installers will be created in the `release/` directory.

---

## Testing the Desktop App

### Manual Testing Checklist

1. **Startup**
   - [ ] App launches without errors
   - [ ] Server starts successfully
   - [ ] Window opens and loads UI

2. **Core Functionality**
   - [ ] All pages load correctly
   - [ ] Navigation works
   - [ ] API calls succeed
   - [ ] WebSocket connections work (if applicable)

3. **Desktop-Specific Features**
   - [ ] Window can be resized
   - [ ] App can be minimized/maximized
   - [ ] App icon appears correctly
   - [ ] External links open in default browser
   - [ ] App closes cleanly (server stops)

4. **Production Build**
   - [ ] Installer runs correctly
   - [ ] App installs to correct location
   - [ ] Desktop shortcut created (Windows/Linux)
   - [ ] App launches from installation
   - [ ] Uninstaller works

---

## Common Issues and Solutions

### Issue: "Server failed to start in time"

**Cause:** Server takes too long to initialize

**Solution:**
- Increase timeout in `electron/main.js` (waitForServer function)
- Check for errors in server startup logs
- Ensure all dependencies are installed

### Issue: Native module errors

**Cause:** Native modules not built for Electron

**Solution:**
```bash
npm install @electron/rebuild --save-dev
npx electron-rebuild
```

### Issue: App won't build on certain platforms

**Cause:** Missing platform-specific build tools

**Solution:**
- **Windows:** Install Windows Build Tools, .NET Framework
- **macOS:** Install Xcode Command Line Tools
- **Linux:** Install build-essential, rpm, dpkg

### Issue: Changes not reflected in desktop app

**Cause:** Using old build or cached files

**Solution:**
```bash
# Clear build cache
rm -rf dist/ release/

# Rebuild everything
npm run build
npm run electron:build
```

### Issue: WebSocket connections fail

**Cause:** CORS or security policy issues

**Solution:**
- Ensure WebSocket server accepts connections from `localhost`
- Check `electron/main.js` webPreferences settings
- Verify `electron/preload.js` exposes necessary APIs

---

## Architecture Decisions

### Why Electron?

Electron allows us to:
- Reuse 100% of the web application code
- Provide a native desktop experience
- Access OS-level features if needed in the future
- Distribute via installers instead of web-only

### Security Considerations

The desktop app follows Electron security best practices:
- **Context Isolation:** Enabled to separate Electron and web contexts
- **Node Integration:** Disabled in renderer for security
- **Preload Script:** Used for controlled IPC communication
- **Web Security:** Enabled to prevent loading untrusted content

### Future Enhancements

Potential improvements for the desktop app:
- [ ] Auto-update mechanism using electron-updater
- [ ] Native system notifications
- [ ] Menu bar integration
- [ ] File system access for import/export
- [ ] Native file dialogs
- [ ] Tray icon support
- [ ] Custom protocol handlers

---

## Deployment and Distribution

### Building Installers for Release

1. **Update version** in `package.json`

2. **Build for each platform:**
   ```bash
   # On Windows machine or CI
   npm run electron:build:win
   
   # On macOS machine or CI
   npm run electron:build:mac
   
   # On Linux machine or CI
   npm run electron:build:linux
   ```

3. **Test installers** on target platforms

4. **Distribute:**
   - Upload to releases page
   - Provide download links
   - Include installation instructions

### Installer Types Generated

- **Windows:** NSIS installer (`.exe`) + Portable (`.exe`)
- **macOS:** DMG image (`.dmg`) + ZIP archive (`.zip`)
- **Linux:** AppImage (`.AppImage`), DEB (`.deb`), RPM (`.rpm`), TAR.GZ (`.tar.gz`)

---

## Git Workflow

### Before Committing Changes

```bash
# Test web app
npm run dev
# Manually test in browser

# Test desktop app
npm run electron:dev
# Manually test in Electron window

# If everything works, commit
git add .
git commit -m "feat: description of changes

- Note any desktop-specific changes
- Tested in both web and desktop modes"
```

### Commit Message Guidelines

When changes affect the desktop app, mention it:

```
feat: add new pipeline visualization feature

- Added PipelineVisualization component
- Updated OrchestrationProvider with new state
- ✅ Tested in web mode
- ✅ Tested in desktop mode (Electron)
```

---

## Contact and Support

If you encounter issues with the desktop app that this guide doesn't cover:

1. Check Electron documentation: https://www.electronjs.org/docs
2. Check electron-builder docs: https://www.electron.build/
3. Review error logs in console
4. Test in web mode to isolate Electron-specific issues

---

## Summary for Agents

**🤖 TL;DR for AI Agents:**

1. **Always test both web and desktop** when making changes
2. **Run `npm run electron:dev`** to test desktop app during development
3. **Run `npm run electron:build`** to verify builds still work
4. **Don't break the Electron integration** - the app must work as both web and desktop
5. **Update this document** if you add Electron-specific features

---

*Last Updated: 2025-11-06*
*Document Version: 1.0.0*

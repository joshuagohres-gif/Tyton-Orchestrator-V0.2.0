const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// Keep a global reference of the window object
let mainWindow;
let serverProcess;
const SERVER_PORT = 5000;

// Check if server is ready
function checkServerReady(port, callback) {
  const options = {
    host: 'localhost',
    port: port,
    timeout: 2000
  };

  const request = http.get(`http://localhost:${port}`, (res) => {
    callback(true);
  });

  request.on('error', () => {
    callback(false);
  });

  request.on('timeout', () => {
    request.destroy();
    callback(false);
  });
}

// Wait for server to be ready
function waitForServer(port, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      console.log(`Checking server... attempt ${attempts}/${maxAttempts}`);
      
      checkServerReady(port, (ready) => {
        if (ready) {
          clearInterval(interval);
          console.log('Server is ready!');
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          reject(new Error('Server failed to start in time'));
        }
      });
    }, 1000);
  });
}

// Start the Express server
function startServer() {
  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged;
    
    if (isDev) {
      // In development, use tsx to run the server with hot reload
      console.log('Starting development server...');
      serverProcess = spawn('npm', ['run', 'dev'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: SERVER_PORT.toString(), NODE_ENV: 'development' },
        shell: true
      });
    } else {
      // In production, run the built server
      console.log('Starting production server...');
      const serverPath = path.join(process.resourcesPath, 'app', 'dist', 'index.js');
      serverProcess = spawn('node', [serverPath], {
        env: { ...process.env, PORT: SERVER_PORT.toString(), NODE_ENV: 'production' },
        shell: true
      });
    }

    serverProcess.stdout.on('data', (data) => {
      console.log(`Server: ${data.toString().trim()}`);
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`Server Error: ${data.toString().trim()}`);
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
      reject(error);
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`Server process exited with code ${code} and signal ${signal}`);
    });

    // Wait for server to be ready before resolving
    waitForServer(SERVER_PORT)
      .then(() => resolve())
      .catch((error) => reject(error));
  });
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    backgroundColor: '#0a0a0a',
    show: false, // Don't show until ready
    autoHideMenuBar: true
  });

  // Show window when ready to show
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the app from localhost
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  // Open DevTools in development mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in default browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  try {
    console.log('Starting Tyton Desktop Application...');
    await startServer();
    createWindow();

    app.on('activate', () => {
      // On macOS re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('Failed to start application:', error);
    app.quit();
  }
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up server process when app is quitting
app.on('before-quit', () => {
  if (serverProcess) {
    console.log('Stopping server...');
    serverProcess.kill();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

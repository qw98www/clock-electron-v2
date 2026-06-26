const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_NAME = 'Cat Clock';
const BREAK_WINDOW_ID = 'break-window';

let mainWindow = null;
let breakWindow = null;
let breakInterval = null;
let tickTimer = null;
let tray = null;
let isQuitting = false;

const DEFAULT_SETTINGS = {
  enabled: true,
  intervalSecs: 45 * 60,
  breakSecs: 5 * 60,
};

const state = {
  ...DEFAULT_SETTINGS,
  launchAtLogin: false,
  isRunning: false,
  isOnBreak: false,
  nextBreakAt: null,
  breakEndAt: null,
  pausedRemainingMs: null,
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function clampNumber(value, min, max, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    state.enabled = parsed.enabled !== false;
    // Support both new (intervalSecs) and legacy (intervalMinutes) format
    if (parsed.intervalSecs !== undefined) {
      state.intervalSecs = clampNumber(parsed.intervalSecs, 10, 240 * 60, DEFAULT_SETTINGS.intervalSecs);
    } else if (parsed.intervalMinutes !== undefined) {
      state.intervalSecs = clampNumber(parsed.intervalMinutes, 1, 240, 45) * 60;
    }
    if (parsed.breakSecs !== undefined) {
      state.breakSecs = clampNumber(parsed.breakSecs, 5, 60 * 60, DEFAULT_SETTINGS.breakSecs);
    } else if (parsed.breakMinutes !== undefined) {
      state.breakSecs = clampNumber(parsed.breakMinutes, 1, 60, 5) * 60;
    }
    state.launchAtLogin = parsed.launchAtLogin === true;
  } catch (_error) {
    saveSettings();
  }
}

function saveSettings() {
  const payload = {
    enabled: state.enabled,
    intervalSecs: state.intervalSecs,
    breakSecs: state.breakSecs,
    launchAtLogin: state.launchAtLogin,
  };
  fs.writeFileSync(settingsPath(), JSON.stringify(payload, null, 2), 'utf8');
}

function publicState() {
  return {
    enabled: state.enabled,
    intervalSecs: state.intervalSecs,
    breakSecs: state.breakSecs,
    launchAtLogin: state.launchAtLogin,
    isRunning: state.isRunning,
    isOnBreak: state.isOnBreak,
    nextBreakAt: state.nextBreakAt,
    breakEndAt: state.breakEndAt,
    now: Date.now(),
  };
}

function sendState() {
  const snapshot = publicState();
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('state:update', snapshot);
    }
  });
  rebuildTrayMenu();
}

function setLaunchAtLogin(enabled) {
  state.launchAtLogin = !!enabled;
  if (!app.isPackaged) {
    return;
  }
  try {
    app.setLoginItemSettings({ openAtLogin: state.launchAtLogin });
  } catch (_error) {
    state.launchAtLogin = false;
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
}

function resetNextBreak() {
  state.nextBreakAt = Date.now() + state.intervalSecs * 1000;
  state.pausedRemainingMs = null;
}

function startTimer() {
  if (!state.enabled) return;
  state.isRunning = true;
  state.isOnBreak = false;
  state.breakEndAt = null;

  if (state.pausedRemainingMs && state.pausedRemainingMs > 0) {
    state.nextBreakAt = Date.now() + state.pausedRemainingMs;
    state.pausedRemainingMs = null;
  } else if (!state.nextBreakAt) {
    resetNextBreak();
  }

  sendState();
}

function pauseTimer() {
  if (state.isRunning && state.nextBreakAt) {
    state.pausedRemainingMs = Math.max(0, state.nextBreakAt - Date.now());
    state.nextBreakAt = null;
  }
  state.isRunning = false;
  sendState();
}

function closeBreakWindow() {
  if (breakInterval) {
    clearInterval(breakInterval);
    breakInterval = null;
  }
  if (breakWindow && !breakWindow.isDestroyed()) {
    breakWindow.close();
  }
  breakWindow = null;
}

function finishBreak() {
  state.isOnBreak = false;
  state.isRunning = state.enabled;
  state.breakEndAt = null;
  resetNextBreak();
  closeBreakWindow();
  sendState();
}

function skipToNextCycle() {
  state.isOnBreak = false;
  state.isRunning = state.enabled;
  state.breakEndAt = null;
  resetNextBreak();
  closeBreakWindow();
  sendState();
}

function rebuildTrayMenu() {
  if (!tray) return;

  const runPauseLabel = state.isRunning ? 'Pause Timer' : 'Start Timer';
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show Control Panel',
      click: () => showMainWindow(),
    },
    {
      label: runPauseLabel,
      click: () => {
        if (state.isRunning) {
          pauseTimer();
        } else {
          startTimer();
        }
      },
    },
    {
      label: 'Skip Current Cycle',
      click: () => skipToNextCycle(),
    },
    { type: 'separator' },
    {
      label: 'Launch At Login',
      type: 'checkbox',
      checked: !!state.launchAtLogin,
      click: (menuItem) => {
        setLaunchAtLogin(menuItem.checked);
        saveSettings();
        sendState();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip(APP_NAME);

  if (state.isOnBreak) {
    tray.setTitle('CatClock BREAK');
  } else if (state.isRunning) {
    tray.setTitle('CatClock ON');
  } else if (!state.enabled) {
    tray.setTitle('CatClock OFF');
  } else {
    tray.setTitle('CatClock PAUSE');
  }
}

function createTray() {
  if (tray) return;
  tray = new Tray(nativeImage.createEmpty());
  tray.on('click', () => showMainWindow());
  rebuildTrayMenu();
}

function showBreakWindow() {
  state.isOnBreak = true;
  state.isRunning = false;
  state.pausedRemainingMs = null;
  state.breakEndAt = Date.now() + state.breakSecs * 1000;
  state.nextBreakAt = null;

  closeBreakWindow();

  breakWindow = new BrowserWindow({
    width: 900,
    height: 620,
    alwaysOnTop: true,
    fullscreenable: true,
    autoHideMenuBar: true,
    title: 'Cat Break',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  breakWindow.loadFile(path.join(__dirname, 'renderer', 'break.html'));
  breakWindow.on('closed', () => {
    breakWindow = null;
    if (state.isOnBreak) {
      finishBreak();
    }
  });

  if (Notification.isSupported()) {
    new Notification({
      title: APP_NAME,
      body: 'Time to look away from the screen and relax.',
    }).show();
  }

  breakInterval = setInterval(() => {
    if (!state.isOnBreak || !state.breakEndAt) return;
    if (Date.now() >= state.breakEndAt) {
      finishBreak();
    } else {
      sendState();
    }
  }, 1000);

  sendState();
}

function startTick() {
  if (tickTimer) {
    clearInterval(tickTimer);
  }

  tickTimer = setInterval(() => {
    if (!state.enabled || !state.isRunning || state.isOnBreak) {
      return;
    }

    if (!state.nextBreakAt) {
      resetNextBreak();
      sendState();
      return;
    }

    if (Date.now() >= state.nextBreakAt) {
      showBreakWindow();
      return;
    }

    sendState();
  }, 1000);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 560,
    autoHideMenuBar: true,
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    sendState();
  });
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  loadSettings();
  try {
    state.launchAtLogin = !!app.getLoginItemSettings().openAtLogin;
  } catch (_error) {
    state.launchAtLogin = false;
  }

  createMainWindow();
  createTray();
  startTick();
  if (state.enabled) {
    startTimer();
  } else {
    sendState();
  }

  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('state:get', () => publicState());

ipcMain.handle('settings:save', (_event, nextSettings) => {
  state.enabled = nextSettings.enabled !== false;
  state.intervalSecs = clampNumber(nextSettings.intervalSecs, 10, 240 * 60, DEFAULT_SETTINGS.intervalSecs);
  state.breakSecs = clampNumber(nextSettings.breakSecs, 5, 60 * 60, DEFAULT_SETTINGS.breakSecs);
  if (typeof nextSettings.launchAtLogin === 'boolean') {
    setLaunchAtLogin(nextSettings.launchAtLogin);
  }
  saveSettings();

  if (!state.enabled) {
    state.isRunning = false;
    state.isOnBreak = false;
    state.nextBreakAt = null;
    state.breakEndAt = null;
    state.pausedRemainingMs = null;
    closeBreakWindow();
  }
  // When timer is running, keep the current countdown unchanged.
  // New interval takes effect from the next cycle (after break or skip).

  sendState();
  return publicState();
});

ipcMain.handle('timer:start', () => {
  startTimer();
  return publicState();
});

ipcMain.handle('timer:pause', () => {
  pauseTimer();
  return publicState();
});

ipcMain.handle('timer:skip', () => {
  skipToNextCycle();
  return publicState();
});

ipcMain.handle('break:endNow', () => {
  finishBreak();
  return publicState();
});

ipcMain.handle('asset:getPath', (_event, filename) => {
  return pathToFileURL(path.join(__dirname, 'renderer', 'assets', filename)).href;
});

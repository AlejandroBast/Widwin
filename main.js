const {
  app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, screen, dialog, session,
} = require('electron');
const path = require('path');
const fs = require('fs');
const templates = require('./templates');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let manager = null;
let tray = null;
let quitting = false;
const wins = new Map(); // id -> BrowserWindow
const removing = new Set(); // ids que se están borrando (única vía legítima de cerrar un widget)

const DEFAULTS = {
  name: 'Widget', x: 100, y: 100, width: 300, height: 200,
  alwaysOnTop: false, opacity: 1, clickThrough: false, locked: true,
};
const PATCHABLE = ['name', 'x', 'y', 'width', 'height', 'alwaysOnTop', 'opacity', 'clickThrough', 'locked'];

// ---------- disco ----------
const widgetsRoot = () => path.join(app.getPath('userData'), 'widgets');
const safeId = (id) => (/^[a-z0-9-]+$/.test(String(id)) ? String(id) : null);
const dirOf = (id) => path.join(widgetsRoot(), safeId(id));
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function readCfg(id) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dirOf(id), 'widget.json'), 'utf8'));
    return { ...DEFAULTS, ...raw, id };
  } catch {
    return null;
  }
}
function writeCfg(cfg) {
  fs.writeFileSync(path.join(dirOf(cfg.id), 'widget.json'), JSON.stringify(cfg, null, 2));
}
function listCfgs() {
  fs.mkdirSync(widgetsRoot(), { recursive: true });
  return fs
    .readdirSync(widgetsRoot(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && safeId(d.name))
    .map((d) => readCfg(d.name))
    .filter(Boolean);
}

// ---------- ventanas de widget ----------
function clampToScreen(cfg) {
  const visible = screen.getAllDisplays().some((d) => {
    const b = d.workArea;
    return cfg.x < b.x + b.width - 40 && cfg.x + cfg.width > b.x + 40 &&
           cfg.y < b.y + b.height - 40 && cfg.y + cfg.height > b.y + 40;
  });
  if (!visible) {
    const b = screen.getPrimaryDisplay().workArea;
    cfg.x = b.x + 60;
    cfg.y = b.y + 60;
  }
}

function applyState(win, cfg) {
  win.setAlwaysOnTop(cfg.alwaysOnTop, cfg.alwaysOnTop ? 'screen-saver' : 'normal');
  win.setOpacity(Math.min(1, Math.max(0.1, cfg.opacity)));
  win.setIgnoreMouseEvents(cfg.clickThrough && cfg.locked);
  win.webContents.send('widget:state', { locked: cfg.locked, name: cfg.name });
}

function idOfWindow(win) {
  for (const [id, w] of wins) if (w === win) return id;
  return null;
}

function saveBounds(id) {
  const win = wins.get(id);
  const cfg = readCfg(id);
  if (!win || win.isDestroyed() || !cfg) return;
  Object.assign(cfg, win.getBounds());
  writeCfg(cfg);
  notifyManager();
}

function createWidgetWindow(cfg) {
  if (wins.has(cfg.id)) return;
  clampToScreen(cfg);

  const win = new BrowserWindow({
    x: cfg.x, y: cfg.y, width: cfg.width, height: cfg.height,
    frame: false, transparent: true, hasShadow: false, show: false,
    skipTaskbar: true, resizable: false, minimizable: false, maximizable: false,
    fullscreenable: false, title: cfg.name,
    webPreferences: {
      preload: path.join(__dirname, 'widget-preload.js'),
      contextIsolation: true,
      sandbox: true,
      partition: 'persist:w-' + cfg.id, // localStorage/cookies aislados por widget
    },
  });
  wins.set(cfg.id, win);

  // Un widget no se puede cerrar: solo se elimina desde el gestor.
  win.on('close', (e) => {
    if (!quitting && !removing.has(cfg.id)) e.preventDefault();
  });
  win.on('minimize', () => win.restore());

  let t;
  win.on('move', () => {
    clearTimeout(t);
    t = setTimeout(() => saveBounds(cfg.id), 400);
  });

  // Si la página se cuelga o muere, se recarga sola.
  win.webContents.on('render-process-gone', () => {
    setTimeout(() => !win.isDestroyed() && win.webContents.reload(), 1000);
  });
  win.webContents.on('did-finish-load', () => {
    const c = readCfg(cfg.id);
    if (c) applyState(win, c);
  });

  // Los enlaces http(s) se abren en el navegador, nunca dentro del widget.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.once('ready-to-show', () => win.showInactive());
  win.loadFile(path.join(dirOf(cfg.id), 'index.html'));
  applyState(win, cfg);
}

function destroyWidget(id) {
  removing.add(id);
  const win = wins.get(id);
  if (win && !win.isDestroyed()) win.destroy();
  wins.delete(id);
  removing.delete(id);
  session.fromPartition('persist:w-' + id).clearStorageData().catch(() => {});
  fs.rmSync(dirOf(id), { recursive: true, force: true });
}

function newId(name) {
  const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'widget';
  return slug.slice(0, 24) + '-' + Date.now().toString(36);
}

function createWidget(name, html, size) {
  const id = newId(name);
  const b = screen.getPrimaryDisplay().workArea;
  const n = wins.size;
  const cfg = {
    ...DEFAULTS, id, name,
    width: size.width, height: size.height,
    x: b.x + b.width - size.width - 40 - (n % 6) * 30,
    y: b.y + 40 + (n % 6) * 30,
  };
  fs.mkdirSync(dirOf(id), { recursive: true });
  fs.writeFileSync(path.join(dirOf(id), 'index.html'), html);
  writeCfg(cfg);
  createWidgetWindow(cfg);
  notifyManager();
  return cfg;
}

// ---------- gestor ----------
function notifyManager() {
  if (manager && !manager.isDestroyed()) manager.webContents.send('widgets:changed');
}

function openManager() {
  if (manager && !manager.isDestroyed()) {
    manager.show();
    manager.focus();
    return;
  }
  manager = new BrowserWindow({
    width: 1040, height: 700, minWidth: 780, minHeight: 520,
    backgroundColor: '#14161c', title: 'DeskWidgets', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'manager-preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  manager.loadFile(path.join(__dirname, 'manager', 'index.html'));
  // Cerrar el gestor solo lo oculta; la app y los widgets siguen vivos en la bandeja.
  manager.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      manager.hide();
    }
  });
}

// ---------- bandeja ----------
function makeIcon() {
  const s = 32, buf = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const r = 7, cx = Math.min(Math.max(x, r), s - 1 - r), cy = Math.min(Math.max(y, r), s - 1 - r);
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      const grid = x > 7 && x < 24 && y > 7 && y < 24 && (x === 15 || x === 16 || y === 15 || y === 16);
      buf[i] = grid ? 255 : 255; // B
      buf[i + 1] = grid ? 255 : 140; // G
      buf[i + 2] = grid ? 255 : 90; // R
      buf[i + 3] = inside ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: s, height: s });
}

function createTray() {
  tray = new Tray(makeIcon());
  tray.setToolTip('DeskWidgets');
  tray.on('click', openManager);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir gestor de widgets', click: openManager },
    { type: 'separator' },
    { label: 'Salir (cierra todos los widgets)', click: () => { quitting = true; app.quit(); } },
  ]));
}

// ---------- inicio con Windows ----------
function loginArgs() {
  return {
    path: process.execPath,
    args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'],
  };
}
function setAutostart(on) {
  app.setLoginItemSettings({ openAtLogin: on, ...loginArgs() });
}

// ---------- IPC ----------
ipcMain.handle('widgets:list', () => listCfgs());
ipcMain.handle('widgets:templates', () =>
  Object.entries(templates).map(([key, t]) => ({ key, label: t.label })));
ipcMain.handle('widgets:create', (_e, name, key) => {
  const t = templates[key] || templates.blank;
  return createWidget(String(name || 'Widget').slice(0, 60), t.html, t);
});
ipcMain.handle('widgets:import', async () => {
  const r = await dialog.showOpenDialog(manager, {
    title: 'Importar widget HTML',
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const file = r.filePaths[0];
  return createWidget(path.basename(file).replace(/\.html?$/i, ''), fs.readFileSync(file, 'utf8'), { width: 300, height: 200 });
});
ipcMain.handle('widgets:get-html', (_e, id) =>
  safeId(id) ? fs.readFileSync(path.join(dirOf(id), 'index.html'), 'utf8') : '');
ipcMain.handle('widgets:save-html', (_e, id, html) => {
  if (!safeId(id)) return;
  fs.writeFileSync(path.join(dirOf(id), 'index.html'), String(html));
  wins.get(id)?.webContents.reload();
});
ipcMain.handle('widgets:update', (_e, id, patch) => {
  const cfg = safeId(id) && readCfg(id);
  if (!cfg) return null;
  for (const k of PATCHABLE) if (k in patch) cfg[k] = patch[k];
  writeCfg(cfg);
  const win = wins.get(id);
  if (win && !win.isDestroyed()) {
    if (['x', 'y', 'width', 'height'].some((k) => k in patch)) {
      win.setBounds({
        x: Math.round(cfg.x), y: Math.round(cfg.y),
        width: Math.max(80, Math.round(cfg.width)), height: Math.max(60, Math.round(cfg.height)),
      });
    }
    applyState(win, cfg);
    win.setTitle(cfg.name);
  }
  notifyManager();
  return cfg;
});
ipcMain.handle('widgets:edit', (_e, id, on) => {
  const cfg = safeId(id) && readCfg(id);
  if (!cfg) return;
  cfg.locked = !on;
  writeCfg(cfg);
  const win = wins.get(id);
  if (win) applyState(win, cfg);
  notifyManager();
});
ipcMain.handle('widgets:reload', (_e, id) => { wins.get(id)?.webContents.reload(); });
ipcMain.handle('widgets:delete', (_e, id) => {
  if (!safeId(id)) return;
  destroyWidget(id);
  notifyManager();
});
ipcMain.handle('widgets:open-folder', (_e, id) => safeId(id) && shell.openPath(dirOf(id)));
ipcMain.handle('app:get-autostart', () => app.getLoginItemSettings(loginArgs()).openAtLogin);
ipcMain.handle('app:set-autostart', (_e, on) => setAutostart(!!on));

// Mensajes que envía el propio widget (modo edición).
ipcMain.on('widget:resize', (e, w, h) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || !idOfWindow(win)) return;
  const b = win.getBounds();
  win.setBounds({ x: b.x, y: b.y, width: Math.max(80, Math.round(w)), height: Math.max(60, Math.round(h)) });
});
ipcMain.on('widget:resize-end', (e) => {
  const id = idOfWindow(BrowserWindow.fromWebContents(e.sender));
  if (id) saveBounds(id);
});
ipcMain.on('widget:done', (e) => {
  const id = idOfWindow(BrowserWindow.fromWebContents(e.sender));
  if (!id) return;
  saveBounds(id);
  const cfg = readCfg(id);
  cfg.locked = true;
  writeCfg(cfg);
  applyState(wins.get(id), cfg);
  notifyManager();
});

// ---------- ciclo de vida ----------
app.on('second-instance', openManager);
app.on('before-quit', () => { quitting = true; });
// Sin esto Electron saldría al no quedar ventanas visibles; queremos seguir en la bandeja.
app.on('window-all-closed', () => {});

app.whenReady().then(() => {
  // Primera ejecución: arrancar con Windows para que los widgets estén siempre activos.
  if (!fs.existsSync(settingsFile())) {
    fs.writeFileSync(settingsFile(), JSON.stringify({ autostartInitialized: true }));
    setAutostart(true);
  }
  createTray();
  const cfgs = listCfgs();
  cfgs.forEach(createWidgetWindow);
  const hidden = process.argv.includes('--hidden');
  if (!hidden || cfgs.length === 0) openManager();
});

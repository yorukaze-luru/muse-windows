// Muse Link (unofficial, personal use only) - AGENT ONLY app.
// This app does NOT contain the Muse window. The earlier Muse Windows
// wrapper (folder version v0.2.2) stays a separate app and is used as before.
// Muse Link is only:
// 1) Tray agent: link status, base folder, key revoke, auto-start setting.
// 2) First-run setup wizard: automatic setup for the local folder link
//    (Tailscale + Windows OpenSSH + dedicated user + base folder).
// Closing a window does not quit the agent (it lives in the tray).
// Quit explicitly from the tray menu or the "Quit Muse Link" button
// in the agent / wizard windows.
const { app, BrowserWindow, Menu, Tray, shell, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const BASE_FOLDER = 'C:\\MuseWorkspaces';
const LINK_USER = 'muselink';
const APP_VERSION = '1.0.0';

// ---- settings (userData/muse-link-settings.json; separate from the wrapper) ----
function settingsPath() { return path.join(app.getPath('userData'), 'muse-link-settings.json'); }
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { return {}; }
}
function saveSettings(patch) {
  const next = Object.assign(loadSettings(), patch);
  try { fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8'); } catch {}
  return next;
}
// ---- PowerShell helpers (Windows only) ----
function runPowerShell(script, elevated) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ ok: false, out: '', err: 'not-windows' }); return; }
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    let child;
    if (elevated) {
      const outer = 'try { $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList \'-NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + encoded + '\'; exit $p.ExitCode } catch { exit 1 }';
      child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', outer], { windowsHide: true });
    } else {
      child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true });
    }
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => resolve({ ok: false, out, err: String(e) }));
    child.on('close', (code) => resolve({ ok: code === 0, out, err, code }));
  });
}

async function getLinkStatus() {
  if (process.platform !== 'win32') {
    return { platform: process.platform, tailscaleInstalled: false, sshdRunning: false, baseFolderExists: false, linkUserExists: false, keyRegistered: false };
  }
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "$ts = [bool](Get-Command tailscale -ErrorAction SilentlyContinue) -or (Test-Path 'C:\\Program Files\\Tailscale\\tailscale.exe')",
    "$sshd = (Get-Service sshd -ErrorAction SilentlyContinue).Status -eq 'Running'",
    "$base = Test-Path '" + BASE_FOLDER + "'",
    "$usr = [bool](Get-LocalUser -Name '" + LINK_USER + "' -ErrorAction SilentlyContinue)",
    "$key = Test-Path 'C:\\Users\\" + LINK_USER + "\\.ssh\\authorized_keys'",
    "$logText = Get-Content 'C:\\ProgramData\\MuseLink\\setup.log' -Raw -ErrorAction SilentlyContinue",
    "if ($logText) { $ri = $logText.LastIndexOf('Public key: registered'); $vi = $logText.LastIndexOf('authorized_keys removed'); if ($ri -ge 0 -and $ri -gt $vi) { $key = $true } elseif ($vi -gt $ri) { $key = $false } }",
    "@{ tailscaleInstalled=$ts; sshdRunning=$sshd; baseFolderExists=$base; linkUserExists=$usr; keyRegistered=$key } | ConvertTo-Json -Compress",
  ].join('; ');
  const r = await runPowerShell(script, false);
  try { return Object.assign({ platform: 'win32' }, JSON.parse(r.out.trim().split('\n').pop())); }
  catch { return { platform: 'win32', tailscaleInstalled: false, sshdRunning: false, baseFolderExists: false, linkUserExists: false, keyRegistered: false }; }
}

// ---- windows (local files only, with preload) ----
let wizardWindow = null;
let agentWindow = null;
let tray = null;

function createLocalWindow(file, title, width, height, minWidth, minHeight) {
  const win = new BrowserWindow({
    width, height, minWidth: minWidth || width, minHeight: minHeight || height,
    title, icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#ffffff', autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'link-preload.js'),
    },
  });
  win.loadFile(path.join(__dirname, 'assets', file));
  return win;
}

function openWizard() {
  if (wizardWindow && !wizardWindow.isDestroyed()) { wizardWindow.focus(); return wizardWindow; }
  wizardWindow = createLocalWindow('wizard.html', 'Muse Link setup', 760, 720);
  wizardWindow.on('closed', () => { wizardWindow = null; });
  return wizardWindow;
}

function openAgent() {
  if (agentWindow && !agentWindow.isDestroyed()) { agentWindow.focus(); return agentWindow; }
  agentWindow = createLocalWindow('agent.html', 'Muse Link agent', 660, 720, 560, 480);
  agentWindow.on('closed', () => { agentWindow = null; });
  return agentWindow;
}

function quitApp() { app.isQuitting = true; app.quit(); }

// ---- tray agent ----
function buildTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) image = image.resize({ width: 16, height: 16 });
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('Muse Link agent');
  const refresh = () => {
    const s = loadSettings();
    const menu = Menu.buildFromTemplate([
      { label: s.setupCompleted ? 'Link: setup done (check status in agent)' : 'Link: not set up yet', enabled: false },
      { type: 'separator' },
      { label: 'Open agent (status / settings)', click: () => openAgent() },
      { label: 'Open setup wizard', click: () => openWizard() },
      { label: 'Open base folder', click: () => shell.openPath(BASE_FOLDER) },
      { type: 'separator' },
      { label: 'Quit Muse Link', click: () => quitApp() },
    ]);
    tray.setContextMenu(menu);
  };
  tray.on('click', () => openAgent());
  refresh();
  tray.refreshMenu = refresh;
  return tray;
}

// ---- updates ----
// Updates are managed by the Muse app's plugin page (it downloads the
// new Link setup from GitHub Releases and installs it), so the agent
// itself does not self-update.

// ---- IPC for local windows ----
ipcMain.handle('link:get-settings', () => loadSettings());
ipcMain.handle('link:get-status', () => getLinkStatus());
ipcMain.handle('link:get-version', () => APP_VERSION);
ipcMain.handle('link:quit', () => { quitApp(); return { ok: true }; });
ipcMain.handle('link:uninstall', () => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows' };
  const uninstaller = path.join(path.dirname(process.execPath), 'Uninstall Muse Link.exe');
  if (!fs.existsSync(uninstaller)) return { ok: false, reason: 'not-found' };
  try {
    spawn(uninstaller, [], { detached: true, windowsHide: false }).unref();
    setTimeout(() => quitApp(), 500);
    return { ok: true };
  } catch (e) { return { ok: false, reason: String(e) }; }
});
ipcMain.handle('link:save-settings', (_e, patch) => {
  const next = saveSettings(patch || {});
  if (tray && tray.refreshMenu) tray.refreshMenu();
  return next;
});
function readBundledScript(name) {
  return fs.readFileSync(path.join(__dirname, 'scripts', name), 'utf8');
}
ipcMain.handle('link:run-setup', async () => {
  try { return await runPowerShell(readBundledScript('setup.ps1'), true); }
  catch (e) { return { ok: false, out: '', err: String(e) }; }
});
ipcMain.handle('link:run-revoke', async () => {
  let r;
  try { r = await runPowerShell(readBundledScript('revoke.ps1'), true); }
  catch (e) { r = { ok: false, out: '', err: String(e) }; }
  if (r.ok) saveSettings({ setupCompleted: false, keyRevoked: true });
  if (tray && tray.refreshMenu) tray.refreshMenu();
  return r;
});
ipcMain.handle('link:open-tailscale', () => {
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '', 'C:\\Program Files\\Tailscale\\tailscale-ipn.exe'], { detached: true, windowsHide: true }).unref();
  }
  return { ok: true };
});
ipcMain.handle('link:open-external', (_e, url) => { if (/^https:\/\//i.test(String(url))) shell.openExternal(String(url)); return { ok: true }; });
ipcMain.handle('link:open-base-folder', () => shell.openPath(BASE_FOLDER));
ipcMain.handle('link:fit-window', (e, h) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || win.isDestroyed()) return { ok: false };
  const wanted = Math.ceil(Number(h) || 0);
  if (!wanted) return { ok: false };
  const wa = screen.getDisplayMatching(win.getBounds()).workArea;
  const target = Math.max(400, Math.min(wanted, wa.height - 16));
  const [w] = win.getContentSize();
  win.setContentSize(w, target);
  return { ok: true, height: target };
});
ipcMain.handle('link:setup-log', () => {
  try { return fs.readFileSync('C:\\ProgramData\\MuseLink\\setup.log', 'utf8').slice(-6000); } catch { return ''; }
});
ipcMain.handle('link:finish-setup', () => {
  saveSettings({ setupCompleted: true, keyRevoked: false });
  if (tray && tray.refreshMenu) tray.refreshMenu();
  return loadSettings();
});

// ---- app lifecycle ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.whenReady().then(() => {
  // 起動・停止は Muse 本体アプリ（プラグイン管理）が担うようになったため、
  // 旧方式のログイン時自動起動が残っていれば解除する（移行処理）。
  try { app.setLoginItemSettings({ openAtLogin: false }); } catch {}
  buildTray();
  const s = loadSettings();
  if (!s.setupCompleted) openWizard(); else openAgent();
});

app.on('second-instance', () => { openAgent(); });

// Tray resident: do not quit when all windows close. Quit from tray or buttons.
app.on('window-all-closed', () => {});
app.on('before-quit', () => { app.isQuitting = true; });

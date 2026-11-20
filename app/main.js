// Muse Windows版ラッパー（非公式・個人利用のみ）
// 公式サイト https://muse.ai/ を単独ウィンドウで表示するだけの Electron ラッパー。
// - ログインは公式ページ上で行う。パスワードを扱う・抜き取る仕組みは一切ない。
// - 公式アプリとして配布しない。YTV2 と同じ Electron + NSIS 構成。
// - Mac版専用の機能（どこでも音声入力／クイックチャット／Mac連携など）は再現できない。
const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn, execFile } = require('child_process');

const MUSE_URL = 'https://muse.ai/';

// 新規ウィンドウ（target=_blank／ポップアップ）をアプリ内で開いてよいドメイン。
// Muse本体に加えて、ログインで使う想定の認証系ドメインを含める。
// ここに無い http/https の新規ウィンドウは既定ブラウザで開く。
const POPUP_ALLOWED_SUFFIXES = [
  'muse.ai',
  'meta.com',
  'meta.ai',
  'facebook.com',
  'fb.com',
  'instagram.com',
  'whatsapp.com',
  'google.com',
  'apple.com',
  'microsoftonline.com',
  'live.com',
];

function isPopupAllowed(url) {
  if (url === 'about:blank') return true;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  if (POPUP_ALLOWED_SUFFIXES.some((d) => host === d || host.endsWith('.' + d))) {
    return true;
  }
  // 未知の認証プロバイダがポップアップを使う場合の保険：
  // URLに認証系の語が入っていればアプリ内で開く（ログインが外部に飛んで切れるのを防ぐ）。
  return /(auth|login|oauth|signin|sign-in|accounts)/i.test(url);
}

// 二重起動を防ぎ、2回目の起動では既存ウィンドウを前面に出す。
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: 'Muse（非公式Windows版・個人利用）',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#ffffff',
    show: false, // スプラッシュの準備ができてから表示する（クリック直後に窓を出すため）
    autoHideMenuBar: false, // Altキーでメニューを表示
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // preload なし：ページ側に何も差し込まない（公式サイトをそのまま表示）
    },
  });

  // 新規ウィンドウの扱い：
  // - Muse本体と認証系ポップアップはアプリ内で開く（ログインのセッションを切らない）。
  // - それ以外の http/https リンクは既定ブラウザで開く。
  // メインフレームの遷移（will-navigate）は横取りしない。ログインは別ドメインへ
  // リダイレクト／遷移することがあり、外部ブラウザへ渡すとセッションが戻らなくなるため、
  // アプリカで学んだ通り http/https 遷移はアプリ内で処理させる。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isPopupAllowed(url)) return { action: 'allow' };
    if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.focus();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  // まずローカルのスプラッシュを即表示して「起動した」ことを見せてから、
  // 本体（muse.ai）を読み込む。ポータブル単一EXEの自己展開が無い形式でも、
  // Electron自体の起動＋サイト読み込みの待ち時間が不安にならないようにするため。
  let splashDone = false;
  mainWindow.webContents.once('did-finish-load', () => {
    if (splashDone) return;
    splashDone = true;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(MUSE_URL);
    }, 250);
  });
  mainWindow.loadFile(path.join(__dirname, 'assets', 'splash.html'));
  return mainWindow;
}

function buildMenu() {
  const template = [
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'forceReload', label: '強制的に再読み込み' },
        { type: 'separator' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { role: 'resetZoom', label: '実際のサイズ' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '開発者ツール' },
      ],
    },
    {
      label: '移動',
      submenu: [
        {
          label: '戻る',
          accelerator: 'Alt+Left',
          click: () => { if (mainWindow && mainWindow.webContents.canGoBack()) mainWindow.webContents.goBack(); },
        },
        {
          label: '進む',
          accelerator: 'Alt+Right',
          click: () => { if (mainWindow && mainWindow.webContents.canGoForward()) mainWindow.webContents.goForward(); },
        },
        { type: 'separator' },
        {
          label: 'Muse ホームを開く',
          click: () => { if (mainWindow) mainWindow.loadURL(MUSE_URL); },
        },
      ],
    },
    {
      label: 'プラグイン',
      submenu: [
        {
          label: 'プラグイン管理を開く',
          click: () => { openPluginsWindow(); },
        },
      ],
    },
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: 'このアプリについて',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'このアプリについて',
              message: 'Muse Windows版ラッパー（非公式・個人利用） v' + app.getVersion(),
              detail: '公式サイト muse.ai を単独ウィンドウで表示するだけのラッパーです。\n'
                + '公式アプリではありません。配布しないでください。\n'
                + 'ログインは公式ページ上で行います。',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- プラグイン管理（Muse Link） ----
// Muse Link は「プラグイン」として扱う：本体アプリが GitHub Releases
// から Link のセットアップを取得してインストール／アップデートし、
// エージェントの起動・停止を管理する。本体アプリが終了したら
// エージェントも終了する。更新フィードは Link の自動更新と同じ
// link.yml（最新リリース）を使い、プラグインページから更新できる。
// 接続の土台（OpenSSH / Tailscale）は Windows のサービスなので、
// エージェント停止中も Muse からの接続自体は切れない。
let linkChild = null;
let pluginsWindow = null;
let linkInstallCache; // undefined = 未確認, null = 未インストール, それ以外 = { dir, exe, uninstaller, version }

function linkCandidateDirs() {
  const dirs = [];
  const local = process.env.LOCALAPPDATA;
  const pf = process.env.ProgramFiles;
  const pf86 = process.env['ProgramFiles(x86)'];
  if (local) dirs.push(path.join(local, 'Programs', 'Muse Link'), path.join(local, 'Programs', 'muse-link'));
  if (pf) dirs.push(path.join(pf, 'Muse Link'));
  if (pf86) dirs.push(path.join(pf86, 'Muse Link'));
  return dirs;
}
function queryLinkRegistry() {
  return new Promise((resolve) => {
    const script = "$keys = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); "
      + "$e = Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'Muse Link' } | Select-Object -First 1; "
      + "if ($e) { Write-Output $e.InstallLocation; Write-Output $e.DisplayVersion; Write-Output $e.UninstallString }";
    execFile('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true }, (err, stdout) => {
      if (err) { resolve(null); return; }
      const lines = String(stdout).split(/\r?\n/).map((s) => s.trim());
      const installLocation = lines[0] || '';
      const displayVersion = lines[1] || '';
      const uninstallString = lines[2] || '';
      if (!installLocation && !uninstallString) { resolve(null); return; }
      resolve({ installLocation, displayVersion, uninstallString });
    });
  });
}
async function findLinkInstall() {
  if (process.platform !== 'win32') return null;
  if (linkInstallCache !== undefined) return linkInstallCache;
  const reg = await queryLinkRegistry();
  const dirs = [];
  if (reg) {
    if (reg.installLocation) dirs.push(reg.installLocation);
    if (reg.uninstallString) {
      const cleaned = reg.uninstallString.replace(/^"|"$/g, '');
      const m = cleaned.match(/^(.*)[\\/][^\\/]+$/);
      if (m) dirs.push(m[1]);
    }
  }
  dirs.push(...linkCandidateDirs());
  for (const dir of dirs) {
    const exe = path.join(dir, 'Muse Link.exe');
    if (fs.existsSync(exe)) {
      linkInstallCache = {
        dir,
        exe,
        uninstaller: path.join(dir, 'Uninstall Muse Link.exe'),
        version: reg && reg.displayVersion ? reg.displayVersion : null,
      };
      return linkInstallCache;
    }
  }
  linkInstallCache = null;
  return null;
}
function invalidateLinkCache() { linkInstallCache = undefined; }
const LINK_FEED_URL = 'https://github.com/yorukaze-luru/muse-windows/releases/latest/download/link.yml';
const LINK_LATEST_BASE = 'https://github.com/yorukaze-luru/muse-windows/releases/latest/download/';
let latestLinkInfo = null;
let latestLinkCheckedAt = 0;
let linkDownload = null; // { percent } while a setup download is running

function fetchText(url, redirectsLeft) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'muse-windows-app' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if ((redirectsLeft || 0) <= 0) { reject(new Error('too many redirects')); return; }
        resolve(fetchText(res.headers.location, (redirectsLeft || 0) - 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('http ' + res.statusCode)); return; }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}
async function fetchLatestLinkInfo(force) {
  const now = Date.now();
  if (!force && latestLinkInfo && now - latestLinkCheckedAt < 5 * 60 * 1000) return latestLinkInfo;
  try {
    const yml = await fetchText(LINK_FEED_URL, 5);
    const version = (yml.match(/^version:\s*(\S+)\s*$/m) || [])[1];
    const fileName = (yml.match(/url:\s*(Muse-Link-Setup-\S+\.exe)/) || yml.match(/^path:\s*(Muse-Link-Setup-\S+\.exe)\s*$/m) || [])[1];
    if (!version || !fileName) return null;
    latestLinkInfo = { version, fileName, url: LINK_LATEST_BASE + fileName };
    latestLinkCheckedAt = now;
    return latestLinkInfo;
  } catch { return null; }
}
function downloadFile(url, dest, onProgress, redirectsLeft) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'muse-windows-app' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if ((redirectsLeft || 0) <= 0) { reject(new Error('too many redirects')); return; }
        resolve(downloadFile(res.headers.location, dest, onProgress, (redirectsLeft || 0) - 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('http ' + res.statusCode)); return; }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const out = fs.createWriteStream(dest);
      res.on('data', (c) => {
        received += c.length;
        if (onProgress && total > 0) onProgress(Math.floor((received / total) * 100));
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
      res.on('error', reject);
    }).on('error', reject);
  });
}
function getInstalledLinkVersion(inst) {
  return new Promise((resolve) => {
    if (!inst) { resolve(null); return; }
    if (inst.version) { resolve(inst.version); return; }
    const script = "(Get-Item -LiteralPath '" + inst.exe.replace(/'/g, "''") + "').VersionInfo.ProductVersion";
    execFile('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true }, (err, stdout) => {
      if (err) { resolve(null); return; }
      const m = String(stdout).match(/\d+\.\d+\.\d+/);
      if (m) inst.version = m[0];
      resolve(m ? m[0] : null);
    });
  });
}
function semverGreater(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}
function isImageRunning(imageName) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve(false); return; }
    execFile('tasklist', ['/FI', 'IMAGENAME eq ' + imageName, '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, stdout) => {
      resolve(!err && String(stdout).toLowerCase().includes(imageName.toLowerCase()));
    });
  });
}
async function getLinkState() {
  const inst = await findLinkInstall();
  const installed = !!inst;
  const [running, installedVersion, latest] = await Promise.all([
    installed ? isImageRunning('Muse Link.exe') : Promise.resolve(false),
    getInstalledLinkVersion(inst),
    fetchLatestLinkInfo(false),
  ]);
  return {
    installed,
    running,
    installedVersion,
    latestVersion: latest ? latest.version : null,
    updateAvailable: !!(installed && installedVersion && latest && semverGreater(latest.version, installedVersion)),
    downloadPercent: linkDownload ? linkDownload.percent : null,
  };
}
async function startLink() {
  const inst = await findLinkInstall();
  if (!inst) return { ok: false, reason: 'not-installed' };
  if (linkChild && !linkChild.killed) return { ok: true, already: true };
  try {
    linkChild = spawn(inst.exe, [], { detached: false, stdio: 'ignore', windowsHide: false });
    linkChild.on('exit', () => { linkChild = null; });
    linkChild.on('error', () => { linkChild = null; });
    return { ok: true };
  } catch (e) { return { ok: false, reason: String(e) }; }
}
function killLinkProcesses(force) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve(); return; }
    const args = ['/IM', 'Muse Link.exe', '/FI', 'USERNAME eq ' + (process.env.USERNAME || '')];
    if (force) args.push('/F');
    execFile('taskkill', args, { windowsHide: true }, () => resolve());
  });
}
async function stopLink() {
  if (linkChild) { try { linkChild.kill(); } catch {} linkChild = null; }
  await killLinkProcesses(false);
  if (await isImageRunning('Muse Link.exe')) await killLinkProcesses(true);
  return { ok: true };
}
function runAndWait(file, args, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(file, args, { stdio: 'ignore', windowsHide: false }); }
    catch (e) { resolve(-1); return; }
    const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(-2); }, timeoutMs || 240000);
    child.on('error', () => { clearTimeout(timer); resolve(-1); });
    child.on('exit', (code) => { clearTimeout(timer); resolve(code == null ? -1 : code); });
  });
}
async function installLink() {
  const info = await fetchLatestLinkInfo(true);
  if (!info) return { ok: false, reason: 'no-release' };
  const wasRunning = await isImageRunning('Muse Link.exe');
  await stopLink();
  const dest = path.join(app.getPath('temp'), info.fileName);
  linkDownload = { percent: 0 };
  try {
    await downloadFile(info.url, dest, (p) => { linkDownload = { percent: p }; }, 5);
  } catch (e) {
    linkDownload = null;
    return { ok: false, reason: 'download-failed' };
  }
  linkDownload = null;
  await runAndWait(dest, ['/S']);
  invalidateLinkCache();
  if (await findLinkInstall()) {
    if (wasRunning) startLink();
    return { ok: true, mode: 'silent' };
  }
  // サイレントで入らなかった場合は通常の（画面が出る）インストーラーを開く。
  try { spawn(dest, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref(); } catch {}
  return { ok: false, mode: 'gui-launched' };
}
async function uninstallLink() {
  await stopLink();
  const inst = await findLinkInstall();
  if (!inst) return { ok: true };
  if (!fs.existsSync(inst.uninstaller)) return { ok: false, reason: 'no-uninstaller' };
  await runAndWait(inst.uninstaller, ['/S']);
  invalidateLinkCache();
  if (!(await findLinkInstall())) return { ok: true };
  try { spawn(inst.uninstaller, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref(); } catch {}
  return { ok: false, mode: 'gui-launched' };
}
async function openLinkWindow() {
  const inst = await findLinkInstall();
  if (!inst) return { ok: false, reason: 'not-installed' };
  // エージェントは単一インスタンス制：起動済みなら既存側がウィンドウを開き、
  // 未起動ならこのプロセスがそのままエージェントになる（監視対象に取り込む）。
  try {
    const child = spawn(inst.exe, [], { detached: false, stdio: 'ignore', windowsHide: false });
    child.on('exit', () => { if (linkChild === child) linkChild = null; });
    child.on('error', () => {});
    if (!linkChild) linkChild = child;
    return { ok: true };
  } catch (e) { return { ok: false, reason: String(e) }; }
}
function openPluginsWindow() {
  if (pluginsWindow && !pluginsWindow.isDestroyed()) { pluginsWindow.focus(); return pluginsWindow; }
  pluginsWindow = new BrowserWindow({
    width: 860, height: 640, minWidth: 680, minHeight: 480,
    title: 'プラグイン管理',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#ffffff', autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'plugin-preload.js'),
    },
  });
  pluginsWindow.loadFile(path.join(__dirname, 'plugins.html'));
  pluginsWindow.on('closed', () => { pluginsWindow = null; });
  return pluginsWindow;
}

ipcMain.handle('plugins:get-link-state', () => getLinkState());
ipcMain.handle('plugins:install-link', () => installLink());
ipcMain.handle('plugins:update-link', () => installLink());
ipcMain.handle('plugins:uninstall-link', () => uninstallLink());
ipcMain.handle('plugins:start-link', () => startLink());
ipcMain.handle('plugins:stop-link', () => stopLink());
ipcMain.handle('plugins:open-link-window', () => openLinkWindow());

// 自動更新：GitHub Releases（配布リポジトリ yorukaze-luru/muse-windows）の
// latest.yml を electron-builder が埋め込んだ app-update.yml 経由で参照する。
// 失敗しても起動は続行する（オフライン・未公開リリース等）。
function setupAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  } catch {}
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  setupAutoUpdate();
  // プラグイン（Muse Link）が入っていれば、エージェントを一緒に起動する。
  findLinkInstall().then((inst) => { if (inst) startLink(); }).catch(() => {});
});

// 本体アプリの終了に合わせて、プラグイン（Muse Link エージェント）も終了する。
app.on('before-quit', () => {
  if (linkChild) { try { linkChild.kill(); } catch {} linkChild = null; }
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/IM', 'Muse Link.exe', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

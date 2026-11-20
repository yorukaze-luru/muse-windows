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

// ---- プラグイン管理（plugins フォルダ方式） ----
// 実行フォルダ直下の plugins/ にプラグインのフォルダを置くと、プラグイン
// 管理ページが認識して一覧に出す。各フォルダには muse-plugin.json
// （マニフェスト）が必要: { id, name, description, version, exe, autostart, feed }
// - exe: フォルダ内の実行ファイル名（起動・停止の対象）
// - autostart: true なら本体アプリの起動時に一緒に起動する
// - feed: 更新フィード（yml）の URL。あれば新版チェックと、zip を取得して
//   フォルダへ展開するインストール／アップデートができる
// Muse Link は同梱カタログとして、未導入でもカードを出す（feed 固定）。
// 旧形式（Windows にインストールされた Link）も検出して操作できる。
let pluginsWindow = null;
let linkChild = null; // 旧形式 Link の子プロセス
let linkInstallCache; // undefined = 未確認, null = なし, それ以外 = { dir, exe, uninstaller, version }
const pluginChildren = new Map(); // id -> child process（フォルダ版）
const pluginDownloads = new Map(); // id -> percent
const feedCache = new Map(); // feedUrl -> { at, info }
const LINK_FEED_URL = 'https://github.com/yorukaze-luru/muse-link/releases/latest/download/link.yml';
const PLUGIN_CATALOG = [
  {
    id: 'muse-link',
    name: 'Muse Link',
    description: 'Muse があなたのPCのフォルダで作業できるようにする連携エージェントです。本体アプリの起動中だけ動作します（本体を終了するとエージェントも終了します）。接続の土台（SSH / Tailscale）は Windows のサービスなので、エージェント停止中も接続自体は切れません。',
    feed: LINK_FEED_URL,
  },
];

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
function killImage(imageName, force) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve(); return; }
    const args = ['/IM', imageName];
    if (force) args.push('/F');
    execFile('taskkill', args, { windowsHide: true }, () => resolve());
  });
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
function extractZip(zipPath, destDir) {
  return new Promise((resolve) => {
    try {
      fs.rmSync(destDir, { recursive: true, force: true });
      fs.mkdirSync(destDir, { recursive: true });
    } catch {}
    const script = "Expand-Archive -LiteralPath '" + zipPath.replace(/'/g, "''") + "' -DestinationPath '" + destDir.replace(/'/g, "''") + "' -Force";
    execFile('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true }, (err) => resolve(!err));
  });
}
async function fetchFeedInfo(feedUrl, force) {
  const now = Date.now();
  const c = feedCache.get(feedUrl);
  if (!force && c && now - c.at < 5 * 60 * 1000) return c.info;
  let info = null;
  try {
    const yml = await fetchText(feedUrl, 5);
    const version = (yml.match(/^version:\s*(\S+)\s*$/m) || [])[1];
    const fileName = (yml.match(/^path:\s*(\S+)\s*$/m) || yml.match(/url:\s*(\S+)/) || [])[1];
    if (version && fileName) {
      const base = feedUrl.slice(0, feedUrl.lastIndexOf('/') + 1);
      info = { version, fileName, url: base + fileName };
    }
  } catch {}
  feedCache.set(feedUrl, { at: now, info });
  return info;
}

// ---- フォルダ版プラグイン ----
function getPluginsDir() {
  const dir = path.join(path.dirname(app.getPath('exe')), 'plugins');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}
function readManifest(dir) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'muse-plugin.json'), 'utf8'));
    if (!m || !m.id || !m.exe) return null;
    return m;
  } catch { return null; }
}
function scanPlugins() {
  const base = getPluginsDir();
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch {}
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(base, e.name);
    const m = readManifest(dir);
    if (!m) continue;
    out.push({ manifest: m, dir, folderName: e.name, exePath: path.join(dir, m.exe) });
  }
  return out;
}
function findPlugin(id) { return scanPlugins().find((p) => p.manifest.id === id) || null; }
async function startPlugin(id) {
  const p = findPlugin(id);
  if (!p) return { ok: false, reason: 'not-installed' };
  const cur = pluginChildren.get(id);
  if (cur && !cur.killed) return { ok: true, already: true };
  try {
    const child = spawn(p.exePath, [], { detached: false, stdio: 'ignore', windowsHide: false, cwd: p.dir });
    pluginChildren.set(id, child);
    child.on('exit', () => { if (pluginChildren.get(id) === child) pluginChildren.delete(id); });
    child.on('error', () => { if (pluginChildren.get(id) === child) pluginChildren.delete(id); });
    return { ok: true };
  } catch (e) { return { ok: false, reason: String(e) }; }
}
async function stopPlugin(id) {
  const p = findPlugin(id);
  const child = pluginChildren.get(id);
  if (child) { try { child.kill(); } catch {} pluginChildren.delete(id); }
  if (p) {
    const image = path.basename(p.manifest.exe);
    await killImage(image, false);
    if (await isImageRunning(image)) await killImage(image, true);
  }
  return { ok: true };
}
async function uninstallPlugin(id) {
  const p = findPlugin(id);
  if (!p) return { ok: true };
  await stopPlugin(id);
  try { fs.rmSync(p.dir, { recursive: true, force: true }); } catch {}
  return findPlugin(id) ? { ok: false, reason: 'delete-failed' } : { ok: true };
}
async function installPluginFromFeed(id, feedUrl, folderName) {
  const info = await fetchFeedInfo(feedUrl, true);
  if (!info) return { ok: false, reason: 'no-release' };
  const existing = findPlugin(id);
  const wasRunning = existing ? await isImageRunning(path.basename(existing.manifest.exe)) : false;
  if (existing) await stopPlugin(id);
  const zipDest = path.join(app.getPath('temp'), info.fileName);
  pluginDownloads.set(id, 0);
  try {
    await downloadFile(info.url, zipDest, (pct) => pluginDownloads.set(id, pct), 5);
  } catch (e) {
    pluginDownloads.delete(id);
    return { ok: false, reason: 'download-failed' };
  }
  pluginDownloads.delete(id);
  const destDir = path.join(getPluginsDir(), folderName);
  if (!(await extractZip(zipDest, destDir))) return { ok: false, reason: 'extract-failed' };
  const m = readManifest(destDir);
  if (!m) return { ok: false, reason: 'extract-failed' };
  if (m.autostart || wasRunning) startPlugin(id);
  return { ok: true };
}

// ---- 旧形式 Muse Link（Windows インストール版）の検出と操作 ----
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
async function startLinkLegacy() {
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
async function stopLinkLegacy() {
  if (linkChild) { try { linkChild.kill(); } catch {} linkChild = null; }
  await killImage('Muse Link.exe', false);
  if (await isImageRunning('Muse Link.exe')) await killImage('Muse Link.exe', true);
  return { ok: true };
}
async function openLinkLegacy() {
  const inst = await findLinkInstall();
  if (!inst) return { ok: false, reason: 'not-installed' };
  try {
    const child = spawn(inst.exe, [], { detached: false, stdio: 'ignore', windowsHide: false });
    child.on('exit', () => { if (linkChild === child) linkChild = null; });
    child.on('error', () => {});
    if (!linkChild) linkChild = child;
    return { ok: true };
  } catch (e) { return { ok: false, reason: String(e) }; }
}
async function uninstallLinkLegacy() {
  await stopLinkLegacy();
  const inst = await findLinkInstall();
  if (!inst) return { ok: true };
  if (!fs.existsSync(inst.uninstaller)) return { ok: false, reason: 'no-uninstaller' };
  await runAndWait(inst.uninstaller, ['/S']);
  invalidateLinkCache();
  if (!(await findLinkInstall())) return { ok: true };
  try { spawn(inst.uninstaller, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref(); } catch {}
  return { ok: false, mode: 'gui-launched' };
}

// ---- プラグイン一覧と操作の振り分け ----
async function getPluginsList() {
  const list = [];
  const seen = new Set();
  for (const p of scanPlugins()) {
    const m = p.manifest;
    seen.add(m.id);
    const running = await isImageRunning(path.basename(m.exe));
    let latestVersion = null;
    let updateAvailable = false;
    if (m.feed) {
      const info = await fetchFeedInfo(m.feed, false);
      if (info) {
        latestVersion = info.version;
        updateAvailable = semverGreater(info.version, m.version || '0.0.0');
      }
    }
    list.push({
      id: m.id,
      name: m.name || m.id,
      description: m.description || '',
      version: m.version || null,
      source: 'folder',
      running,
      latestVersion,
      updateAvailable,
      downloadPercent: pluginDownloads.has(m.id) ? pluginDownloads.get(m.id) : null,
    });
  }
  for (const c of PLUGIN_CATALOG) {
    if (seen.has(c.id)) continue;
    const info = await fetchFeedInfo(c.feed, false);
    const legacy = c.id === 'muse-link' ? await findLinkInstall() : null;
    if (legacy) {
      const [running, ver] = await Promise.all([isImageRunning('Muse Link.exe'), getInstalledLinkVersion(legacy)]);
      list.push({
        id: c.id, name: c.name, description: c.description, version: ver,
        source: 'legacy', running,
        latestVersion: info ? info.version : null, updateAvailable: false,
        downloadPercent: pluginDownloads.has(c.id) ? pluginDownloads.get(c.id) : null,
      });
    } else {
      list.push({
        id: c.id, name: c.name, description: c.description, version: null,
        source: 'catalog', running: false,
        latestVersion: info ? info.version : null, updateAvailable: false,
        downloadPercent: pluginDownloads.has(c.id) ? pluginDownloads.get(c.id) : null,
      });
    }
  }
  return { pluginsDir: getPluginsDir(), plugins: list };
}
async function pluginInstall(id) {
  const c = PLUGIN_CATALOG.find((x) => x.id === id);
  if (c) return installPluginFromFeed(id, c.feed, id);
  const p = findPlugin(id);
  if (p && p.manifest.feed) return installPluginFromFeed(id, p.manifest.feed, p.folderName);
  return { ok: false, reason: 'no-feed' };
}
async function pluginStart(id) {
  if (findPlugin(id)) return startPlugin(id);
  if (id === 'muse-link') return startLinkLegacy();
  return { ok: false, reason: 'not-installed' };
}
async function pluginStop(id) {
  if (findPlugin(id)) return stopPlugin(id);
  if (id === 'muse-link') return stopLinkLegacy();
  return { ok: true };
}
async function pluginOpen(id) {
  if (findPlugin(id)) return startPlugin(id);
  if (id === 'muse-link') return openLinkLegacy();
  return { ok: false, reason: 'not-installed' };
}
async function pluginUninstall(id) {
  if (findPlugin(id)) return uninstallPlugin(id);
  if (id === 'muse-link') return uninstallLinkLegacy();
  return { ok: true };
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

ipcMain.handle('plugins:list', () => getPluginsList());
ipcMain.handle('plugins:install', (e, id) => pluginInstall(id));
ipcMain.handle('plugins:update', (e, id) => pluginInstall(id));
ipcMain.handle('plugins:uninstall', (e, id) => pluginUninstall(id));
ipcMain.handle('plugins:start', (e, id) => pluginStart(id));
ipcMain.handle('plugins:stop', (e, id) => pluginStop(id));
ipcMain.handle('plugins:open', (e, id) => pluginOpen(id));
ipcMain.handle('plugins:open-folder', () => shell.openPath(getPluginsDir()));

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
  // autostart のフォルダ版プラグインを一緒に起動する。Muse Link の
  // フォルダ版が無い場合は、旧形式（インストール版）があればそちらを起動する。
  for (const p of scanPlugins()) { if (p.manifest.autostart) startPlugin(p.manifest.id); }
  if (!findPlugin('muse-link')) {
    findLinkInstall().then((inst) => { if (inst) startLinkLegacy(); }).catch(() => {});
  }
});

// 本体アプリの終了に合わせて、プラグイン（Muse Link エージェント）も終了する。
app.on('before-quit', () => {
  for (const child of pluginChildren.values()) { try { child.kill(); } catch {} }
  pluginChildren.clear();
  if (linkChild) { try { linkChild.kill(); } catch {} linkChild = null; }
  if (process.platform === 'win32') {
    const images = new Set(['Muse Link.exe']);
    for (const p of scanPlugins()) images.add(path.basename(p.manifest.exe));
    for (const image of images) {
      try { spawn('taskkill', ['/IM', image, '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
    }
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

// Muse Windows版ラッパー（非公式・個人利用のみ）
// 公式サイト https://muse.ai/ を単独ウィンドウで表示するだけの Electron ラッパー。
// - ログインは公式ページ上で行う。パスワードを扱う・抜き取る仕組みは一切ない。
// - 公式アプリとして配布しない。YTV2 と同じ Electron + NSIS 構成。
// - Mac版専用の機能（どこでも音声入力／クイックチャット／Mac連携など）は再現できない。
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');

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
    autoHideMenuBar: true, // Altキーでメニューを表示
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

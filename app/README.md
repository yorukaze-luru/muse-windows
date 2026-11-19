# Muse アプリ（Windows版ラッパー）

**非公式・個人利用のアプリです。Muse / Meta 公式のアプリではありません。**

公式サイト `https://muse.ai/` を単独ウィンドウで表示するだけの Electron ラッパーです。中身は公式サイトをそのまま読み込むだけで、ログインも公式ページ上で行います。パスワードを扱う仕組みは一切ありません。

## v1.0.0（インストーラー版）

- NSIS インストーラー（`Muse-Windows-Setup-1.0.0.exe`）＋ ポータブル単一EXE の2形式で配布
- インストーラーには追加ページがあり、**Muse Link エージェントを一緒にインストール**するか選べます（仕組みは `build/installer.nsh`。Link 本体は別アプリとしてインストールされます）
- 自動更新は GitHub Releases（`yorukaze-luru/muse-windows` の `latest.yml`）を参照（インストーラー版のみ。ポータブル版は自動更新なし）
- 未署名のため初回は SmartScreen の警告が出ることがあります（詳細情報 → 実行）

## 仕様メモ

- メインフレームの http/https 遷移はアプリ内で処理する（ログインの別ドメイン遷移を切らないため）。新規ウィンドウは Muse 本体と認証系ドメイン（Meta／Facebook／Google／Apple 等）だけアプリ内で開き、それ以外のリンクは既定のブラウザで開く
- ログイン状態は Electron の通常のセッションに残る（ブラウザと同じ感覚）
- メニューは Alt キーで表示（再読み込み／拡大縮小／開発者ツール／Muse ホーム）。Alt+←／→ で戻る／進む
- 二重起動すると、既存のウィンドウが前面に出る
- できることは Web 版と同等（チャット・Feed・Ideas・Goals・Library・承認カード）。Mac 版専用の「どこでも音声入力」「クイックチャット」「Mac連携」は再現できません

## ビルド

- 必要：Node.js LTS、Windows または Linux
- アイコン（`assets/icon.ico` / `icon.png`）は base64 形式（`.b64`）で保存されています。ビルド前に復元してください（GitHub Actions では自動で復元されます）。PowerShell の場合：
  `[IO.File]::WriteAllBytes('assets/icon.ico', [Convert]::FromBase64String((Get-Content 'assets/icon.ico.b64' -Raw)))`（png も同様）
- `npm ci` のあと `npm run dist`
- インストーラーに Link を同梱するには、先に `link-setup/Muse-Link-Setup.exe`（Link 単体インストーラーを改名したもの）を置く必要があります（`link-setup/README.txt` 参照）。GitHub Actions では自動でステージングされます

## アンインストール

インストーラー版は Windows の「アプリ」設定から。ポータブル版は EXE ファイルを削除するだけです。ログイン情報などは `%APPDATA%` 配下のアプリ用データフォルダに残るので、完全に消したいときはそちらも削除してください。

## ファイル

- `main.js` — Electron のメインプロセス（ウィンドウ作成・外部リンク処理・メニュー・自動更新）
- `package.json` — electron ^33.2.0 / electron-builder ^25.1.8
- `assets/icon.png` / `assets/icon.ico` — アイコン

# Muse Windows版（非公式・個人利用）

> **これは公式アプリではありません。** Muse / Meta 公式とは関係のない、個人が制作した非公式アプリです。

Muse（muse.ai）を Windows の単独ウィンドウで使えるようにする、非公式の個人制作アプリです。ログインは公式ページ上で行います（パスワードを扱う仕組みはありません）。

## ダウンロード

Releases からどうぞ。

| ファイル | 内容 |
|---|---|
| `Muse-Windows-Setup-x.y.z.exe` | Muse アプリのインストーラー。途中のページで **Muse Link エージェントを一緒にインストール** するか選べます |
| `Muse-Link-Setup-x.y.z.exe` | Muse Link だけの単体インストーラー |
| `Muse-Windows-Portable-x.y.z.exe` | インストール不要の単一EXE版（自動更新なし） |

## Muse Link とは

Muse が、あなたの PC の指定フォルダ（`C:\MuseWorkspaces`）の中で読み書きやコマンド実行をできるようにする連携エージェントです。接続は Tailscale + Windows 標準の OpenSSH で、専用ユーザー `muselink` と鍵認証だけを使います。初回起動時にセットアップウィザードが開きます。

Muse アプリとは別アプリとしてインストールされ、アンインストールも別々にできます。

## 自動更新

- Muse アプリ: このリポジトリの Releases を参照して自動更新します（インストーラー版のみ）
- Muse Link: 同じ Releases 内の Link 用フィード（link.yml）で自動更新します
- ポータブル版は自動更新しません

## 注意

- 未署名のため、Windows SmartScreen の警告が出ることがあります
- 非公式・個人利用のプロジェクトです。Muse / Meta 公式とは関係ありません
- Mac 版 Muse の専用機能（どこでも音声入力など）は再現できません

## 構成

- `app/` — Muse アプリ（Electron ラッパー）
- `link/` — Muse Link エージェント
- リリースは GitHub Actions でビルドしています（タグ `v*` で下書きリリースを作成）

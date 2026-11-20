# Muse Windows版（非公式・個人利用）

> **これは公式アプリではありません。** Muse / Meta 公式とは関係のない、個人が制作した非公式アプリです。

Muse（muse.ai）を Windows の単独ウィンドウで使えるようにする、非公式の個人制作アプリです。ログインは公式ページ上で行います（パスワードを扱う仕組みはありません）。

## ダウンロード

Releases からどうぞ。

| ファイル | 内容 |
|---|---|
| `Muse-Windows-Setup-x.y.z.exe` | Muse アプリのインストーラー |
| `Muse-Windows-Portable-x.y.z.exe` | インストール不要の単一EXE版（自動更新なし） |

## プラグイン（Muse Link）

Muse があなたの PC のフォルダで作業できるようにする連携エージェント「Muse Link」は、別リポジトリ [yorukaze-luru/muse-link](https://github.com/yorukaze-luru/muse-link) で配布しています。

- インストール／アップデートは、本体アプリのメニュー「プラグイン」→「プラグイン管理を開く」から行います（muse-link の GitHub Releases から、ダウンロードとインストールまで本体アプリ内で完結します）
- エージェントは本体アプリの起動中のみ動作し、本体を終了するとエージェントも終了します

## 自動更新

- Muse アプリ: このリポジトリの Releases を参照して自動更新します（インストーラー版のみ）
- Muse Link: muse-link リポジトリの Releases（link.yml フィード）をプラグインページが参照します
- ポータブル版は自動更新しません

## 注意

- 未署名のため、Windows SmartScreen の警告が出ることがあります
- 非公式・個人利用のプロジェクトです。Muse / Meta 公式とは関係ありません
- Mac 版 Muse の専用機能（どこでも音声入力など）は再現できません

## 構成

- `app/` — Muse アプリ（Electron ラッパー）
- Muse Link は別リポジトリ（yorukaze-luru/muse-link）に分離しました
- リリースは GitHub Actions でビルドしています（タグ `v*` で下書きリリースを作成）

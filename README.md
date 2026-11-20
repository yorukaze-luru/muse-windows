# Muse Windows版（非公式・個人利用）

> **これは公式アプリではありません。** Muse / Meta 公式とは関係のない、個人が制作した非公式アプリです。

Muse（muse.ai）を Windows の単独ウィンドウで使えるようにする、非公式の個人制作アプリです。ログインは公式ページ上で行います（パスワードを扱う仕組みはありません）。

## ダウンロード

Releases からどうぞ。

| ファイル | 内容 |
|---|---|
| `Muse-Windows-Setup-x.y.z.zip` | Muse アプリのインストーラー（zip を解凍して実行。自動更新あり） |
| `Muse-Windows-Portable-x.y.z.zip` | インストール不要の単一EXE版（別リリース `portable-vx.y.z`、自動更新なし） |
| `Muse-Plugin-Template.zip` | プラグイン作成用のサンプル一式 |

## ドキュメント（Wiki）

使い方の詳細は [Wiki](https://github.com/yorukaze-luru/muse-windows/wiki) にあります。

- [インストールと初期セットアップ](https://github.com/yorukaze-luru/muse-windows/wiki/インストールと初期セットアップ)
- [Muse Link のセットアップ](https://github.com/yorukaze-luru/muse-windows/wiki/Muse-Link-のセットアップ)
- [プラグインの使い方](https://github.com/yorukaze-luru/muse-windows/wiki/プラグインの使い方)
- [プラグインの作り方](https://github.com/yorukaze-luru/muse-windows/wiki/プラグインの作り方)
- [トラブルシューティング](https://github.com/yorukaze-luru/muse-windows/wiki/トラブルシューティング)

## プラグイン（Muse Link）

Muse があなたの PC のフォルダで作業できるようにする連携エージェント「Muse Link」は、別リポジトリ [yorukaze-luru/muse-link](https://github.com/yorukaze-luru/muse-link) で配布しています。

- プラグインは、アプリの実行フォルダにある `plugins` フォルダにフォルダ単位で置く方式です。プラグイン管理ページ（メニュー「プラグイン」→「プラグイン管理を開く」）が自動で認識して一覧に出します
- Muse Link のインストール／アップデートはプラグイン管理ページから行えます（GitHub Releases から取得して `plugins` フォルダへ展開します）
- エージェントは本体アプリの起動中のみ動作し、本体を終了するとエージェントも終了します
- 自作プラグインも同じ形式で作れます。Releases の `Muse-Plugin-Template.zip` がサンプルです

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
- `plugin-template/` — プラグイン作成用サンプルの原稿（リリースに zip で付きます）
- Muse Link は別リポジトリ（yorukaze-luru/muse-link）に分離しました
- リリースは GitHub Actions で自動化しています（バージョンを上げると、ビルドからリリースページの作成まで自動で進みます）

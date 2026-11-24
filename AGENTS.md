# AGENTS.md

このファイルは、AIコーディングエージェント（Codexなど）がこのリポジトリで作業するときの案内です。

## プロジェクト概要

Webサイトの稼働状態を確認し、結果を記録するモニタリングツールです。URLを入力すると、HTTP状態・応答時間・SSL証明書の期限・セキュリティヘッダーを診断でき、診断結果の保存と履歴表示、登録したURLの定期監視と異常時の通知（サーバーログ・Webhook）もできます。

- フロントエンド: TypeScript + Vite + Tailwind CSS（`src/`）
- バックエンド: Node.js標準のHTTPサーバー（`server/`）。診断結果や監視イベントはローカルのJSON Linesファイル（`data/`）に保存します
- 開発ルールの正本は CONTRIBUTING.md です。このファイルと食い違う場合は CONTRIBUTING.md を優先してください
- 実装計画は PLAN.md、使い方と仕様の詳細は README.md を参照してください

## コマンド

```bash
nvm use          # Node.jsのバージョンを .nvmrc に合わせる
npm install      # 依存関係のインストール
npm run dev      # フロントエンドの開発サーバー
npm run dev:api  # 診断APIサーバー（定期監視もこのプロセスで動く）
npm run build    # ビルド（型チェックを含む）
npm test         # サーバーのテスト
```

作業を終える前に、必ず `npm run build` と `npm test` が通ることを確認してください。

## 構成

- `src/main.ts`: 画面のエントリーポイント
- `src/site-check-api.ts`: 診断APIとの通信
- `src/url-validation.ts`: 入力URLの検証
- `src/security-headers.ts`: セキュリティヘッダーの判定表示
- `src/response-time-chart.ts`: 応答時間の推移グラフ
- `src/monitor-event.ts`: 監視イベントの表示用定義
- `server/index.ts`: 診断APIサーバーのエントリーポイント
- `server/check-site.ts`: サイト診断（HTTP・SSL・セキュリティヘッダー）
- `server/monitor-*.ts`: 定期監視、監視対象とイベントの保存
- `server/*.test.ts`: サーバー側のテスト（`npm test` で実行）
- `index.html`: フロントエンドのHTML
- `data/`: 診断結果などのローカルデータ（Gitの管理対象外）

## 開発ルール

詳細は CONTRIBUTING.md を参照してください。要点は次のとおりです。

- 変更は必ず Issue → 作業ブランチ → Pull Request → マージの順で進める。mainへの直接コミットはしない
- 1つのPRは1つの目的（原則として1つのIssue）だけに対応させる
- ブランチ名は `<type>/<short-description>` の形式にし、説明部分は英語のkebab-caseにする
- コミットメッセージは `<prefix>: <日本語の説明>` の形式にする。1コミットには原則として1つの目的だけを含める
- マージ方法は Merge commit を基本とする
- マージ前に、セルフレビューとCodexレビューの指摘確認を行う

## このリポジトリ特有の注意点

- `data/` 配下のJSON Linesファイルはローカルデータなので、コミットに含めない（`.gitignore` で除外済み）
- 生成ファイル（`dist/`、`dist-server/`）は直接編集しない
- 定期監視は診断APIの単一プロセスで実行する前提の実装です。監視間隔は環境変数 `MONITOR_INTERVAL_MS`、Webhook通知先は `MONITOR_WEBHOOK_URL` で変更できます
- 環境変数の値やWebhook URLを、コードやドキュメントに実例として書かない

## 禁止事項

- シークレット、APIキー、パスワード、トークンを含むURLをコードやドキュメントに書かない
- メールアドレスなどの個人情報を、Issue、PR、コード、ドキュメントに書かない
- 生成ファイル（`dist/`、`dist-server/`）やローカルデータ（`data/`）を直接編集・コミットしない
- 関係のない変更を同じPRに混ぜない

## レビューガイドライン

Pull Requestをレビューするときは、次を重点的に確認してください。

レビューコメントは日本語で書いてください。指摘のタイトル、問題の説明、修正案を日本語で記述し、コード上の識別子、コマンド、ファイルパスなどは必要に応じて原文のまま記述してよいです。

- 変更がIssueの目的に絞られているか。関係のない変更が混ざっていないか
- コミットメッセージが形式（`<prefix>: <日本語の説明>`）に従っているか
- `npm run build` と `npm test` が通る変更か。サーバー側のロジック変更にテストの追加・更新漏れがないか
- ローカルデータ（`data/`）や生成物がコミットに含まれていないか
- シークレットやトークンを含むURL、個人情報が含まれていないか
- `package.json` や環境変数まわりの変更がある場合、その影響がPR本文で説明されているか
- 仕様が変わる変更なのに、README.md や PLAN.md の更新漏れがないか

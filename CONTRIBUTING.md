# 開発ルール

## コミットメッセージ

コミットメッセージは、英語の接頭辞と日本語の説明を組み合わせます。

```text
<prefix>: <日本語の説明>
```

| 接頭辞 | 用途 |
| --- | --- |
| `feat` | 新機能 |
| `fix` | 不具合修正 |
| `docs` | ドキュメントのみの変更 |
| `style` | 見た目やフォーマットの変更 |
| `refactor` | 振る舞いを変えないコード改善 |
| `test` | テストの追加・修正 |
| `chore` | 設定、依存関係、その他の保守作業 |

例:

```text
feat: URL登録フォームを追加
fix: SSL期限の計算誤差を修正
docs: 開発手順を追記
```

## ブランチ運用

`main`へ直接コミットせず、機能や変更目的ごとにブランチを作成します。

ブランチ名は `<type>/<short-description>` とし、説明部分には英語のkebab-caseを使用します。

```text
feature/url-registration
fix/ssl-expiration
docs/setup-guide
chore/update-dependencies
```


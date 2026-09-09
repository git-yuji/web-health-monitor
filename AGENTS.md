# Repository Rules

## Commit messages

- コミットメッセージには英語の接頭辞を付ける。
- 接頭辞の後の説明は日本語で書く。
- 形式は `<prefix>: <日本語の説明>` とする。
- 1コミットには、原則として1つの目的だけを含める。

使用する接頭辞:

- `feat`: 新機能
- `fix`: 不具合修正
- `docs`: ドキュメントのみの変更
- `style`: 見た目やフォーマットの変更
- `refactor`: 振る舞いを変えないコード改善
- `test`: テストの追加・修正
- `chore`: 設定、依存関係、その他の保守作業

例:

```text
feat: URL登録フォームを追加
fix: SSL期限の計算誤差を修正
docs: 開発手順を追記
```

## Branches

- `main`へ直接コミットしない。
- 機能や変更目的ごとにブランチを作成する。
- ブランチ名は `<type>/<short-description>` の形式にする。
- `short-description`は英語のkebab-caseで書く。
- 変更が完了したら、対応するブランチを`main`へマージする。

例:

```text
feature/url-registration
fix/ssl-expiration
docs/setup-guide
chore/update-dependencies
```


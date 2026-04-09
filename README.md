# slack-url-summary-bot

Slack のチャンネルに投稿されたメッセージ内の URL を検出し、ページ内容を AI で要約して **同じメッセージのスレッド** に返すボットです。

実装は [Cloudflare Workers](https://developers.cloudflare.com/workers/) 上で動かし、[Slack Events API](https://api.slack.com/apis/connections/events-api) でイベントを受け取ります。

## 挙動

- チャンネルへの直接投稿（トップレベル）にのみ反応する。スレッド内の返信は無視する
- メッセージ内の URL を検出し、ページを取得して OpenAI（`gpt-4o-mini`）で日本語要約する
- 要約結果を元メッセージのスレッドに返信する
- Bot 自身・Bot メッセージへの反応はしない（無限ループ防止）
- すべてのリクエストは [Request Signing](https://docs.slack.dev/authentication/verifying-requests-from-slack) で検証する

## ディレクトリ構成

```
src/
├── index.ts              # エントリポイント（リクエスト受付・Slack 投稿）
├── types.ts              # 共通型定義
├── slack/
│   ├── verify.ts         # Slack 署名検証
│   └── client.ts         # chat.postMessage
└── summarizer/
    ├── fetch.ts          # URL 取得・HTML → テキスト変換
    ├── openai.ts         # OpenAI API 呼び出し
    ├── prompts.ts        # プロンプト定義
    └── index.ts          # summarizeUrl（要約のエントリ）
```

## 必要なもの

- Node.js
- [Cloudflare](https://dash.cloudflare.com/) アカウント
- Slack アプリ（Bot User・Events API の設定）
- OpenAI API キー

## セットアップ

```bash
npm ci
```

## 環境変数（シークレット）

ローカルでは Wrangler がプロジェクト直下の **`.dev.vars`** 系から読み込みます。
**これらのファイルは Git にコミットしないでください**（`.gitignore` に含まれています）。

| 名前 | 説明 |
| --- | --- |
| `SLACK_SIGNING_SECRET` | Slack アプリの **Signing Secret**（`Basic Information` → `App Credentials`） |
| `SLACK_BOT_TOKEN` | Bot の **Bot User OAuth Token**（`xoxb-...`） |
| `OPENAI_API_KEY` | OpenAI の API キー（`sk-...`） |

### 複数ワークスペースの使い分け

`wrangler.jsonc` の `env.test` / `env.company` に対応するローカルファイル:

- `.dev.vars.test` — 検証用 Slack
- `.dev.vars.company` — 会社用 Slack

各ファイルに上表の 3 つのキーをすべて記載してください。

## ローカル開発

```bash
# 検証用（.dev.vars.test）
npm run dev:test

# 会社用（.dev.vars.company）
npm run dev:company
```

開発サーバーは既定で `http://localhost:8787` です。

Slack からイベントを届けるには **公開 HTTPS の URL** が必要です。[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) でローカルにトンネルを張り、その URL を Slack アプリに設定します。

```bash
cloudflared tunnel --url http://localhost:8787
```

> 起動のたびに URL が変わるため、変わったら Slack 側の Request URL も更新してください。

## Slack アプリ設定

1. **Event Subscriptions** をオンにし、**Request URL** に Worker の URL を設定する
   （初回は `url_verification` が飛ぶため、エンドポイントが 200 + challenge を返す必要がある）
2. **Subscribe to bot events** に `message.channels`（または必要なイベント）を追加する
3. **OAuth & Permissions** で `chat:write` を付与し、ボットをチャンネルに招待する

## 本番デプロイ

### シークレットの登録

```bash
npx wrangler login

npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put SLACK_BOT_TOKEN
npx wrangler secret put OPENAI_API_KEY
```

環境を指定する場合は `--env` を付ける:

```bash
npx wrangler secret put SLACK_SIGNING_SECRET --env company
npx wrangler secret put SLACK_BOT_TOKEN --env company
npx wrangler secret put OPENAI_API_KEY --env company
```

登録済み一覧の確認:

```bash
npx wrangler secret list
```

### 手動デプロイ

```bash
# デフォルト環境
npm run deploy

# 環境を指定
npx wrangler deploy --env company
```

### GitHub Actions による自動デプロイ

`main` ブランチへの push で自動デプロイされます（`.github/workflows/deploy.yml`）。

リポジトリの **Settings → Secrets and variables → Actions** に以下を登録してください:

| Secret 名 | 値 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare の API トークン（`Edit Cloudflare Workers` テンプレートで作成） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |

デプロイ後に表示される `*.workers.dev` の URL を Slack の Request URL に設定してください。

## 型生成

`wrangler.jsonc` のバインディングを変更したあとは:

```bash
npm run cf-typegen
```

## ドキュメント

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Wrangler 設定リファレンス](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Slack Events API](https://api.slack.com/apis/connections/events-api)
- [OpenAI API リファレンス](https://platform.openai.com/docs/api-reference)

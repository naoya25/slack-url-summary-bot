# slack-url-summary-bot

Slack のチャンネルに投稿されたメッセージ内の URL を検出し、内容を要約して **同じメッセージのスレッド** に返すためのボットです。

実装は [Cloudflare Workers](https://developers.cloudflare.com/workers/) 上で動かし、[Slack Events API](https://api.slack.com/apis/connections/events-api) でイベントを受け取ります。

## いまの挙動（開発中）

- 通常のチャンネルメッセージ（`message`・`subtype` なし）を受け取ると、**その投稿と同じ文面をスレッドに 1 件返信**します（[`chat.postMessage`](https://api.slack.com/methods/chat.postMessage) の `thread_ts` を使用）。
- トップレベル投稿では `thread_ts` にそのメッセージの `ts` を使います。すでにスレッド内の投稿では、親スレッドの `thread_ts` を引き継ぎます。
- **Bot 自身の投稿**や Bot メッセージは無視し、ループしません。
- すべての `POST` は [Request signing](https://docs.slack.dev/authentication/verifying-requests-from-slack) で検証します。`SLACK_SIGNING_SECRET` が Slack アプリと一致している必要があります。

## 必要なもの

- Node.js（プロジェクトの開発環境用）
- [Cloudflare](https://dash.cloudflare.com/) アカウント（本番デプロイ時）
- Slack で作成したアプリ（Bot User・Events API の Request URL 設定）

## リポジトリのセットアップ

```bash
npm ci
```

## 環境変数（シークレット）

ローカルでは Wrangler がプロジェクト直下の **`.dev.vars`** 系から読み込みます。
**これらのファイルは Git にコミットしないでください**（`.gitignore` に含まれています）。

| 名前                   | 説明                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| `SLACK_SIGNING_SECRET` | Slack アプリの **Signing Secret**（`Basic Information` → `App Credentials`） |
| `SLACK_BOT_TOKEN`      | Bot の **Bot User OAuth Token**（`xoxb-...`）                                |

同名キーを、本番では Cloudflare ダッシュボードまたは `wrangler secret put` で Worker に登録します。

### 複数ワークスペース（検証用・本番用など）

Wrangler の [環境ごとのローカルファイル](https://developers.cloudflare.com/workers/development-testing/environment-variables/)を使う例:

- `.dev.vars.test` — 検証用 Slack
- `.dev.vars.company` — 会社用 Slack

`wrangler.jsonc` の `env.test` / `env.company` と対応しています。
`.dev.vars.<環境名>` だけが読み込まれるため、**その環境用に上表のキーをすべて**書いてください。

## ローカル開発

```bash
# デフォルト（.dev.vars）
npm run dev

# 検証用 .dev.vars.test
npm run dev:test

# 本番相当の .dev.vars.company
npm run dev:company
```

開発サーバーは既定で `http://localhost:8787` です。

Slack からイベントを届けるには **公開 HTTPS の Request URL** が必要です。次のような方法でローカルにトンネルを張り、その URL を Slack アプリに設定します。

- [cloudflared quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)（起動のたび URL が変わることがあるので、変わったら Slack 側も更新）

```bash
cloudflared tunnel --url http://localhost:8787
```

## Slack アプリ設定（概要）

1. **Event Subscriptions** をオンにし、**Request URL** に Worker（またはトンネル）の `https://...` を指定する。
   初回は `url_verification` が飛ぶため、エンドポイントは **HTTP 200** で **challenge 文字列をそのまま本文に返す**必要があります。
2. **Subscribe to bot events** に、メッセージを受け取るイベント（例: `message.channels` など、運用に合わせて選択）を追加する。
3. **OAuth & Permissions** で、スレッドに投稿するために **`chat:write`** を付与する（ボットをチャンネルに招待しておく）。

（URL の抽出・要約などは今後の実装です。）

## 本番デプロイ

```bash
npx wrangler login

# シークレットを Cloudflare に登録（対話で値を入力）
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put SLACK_BOT_TOKEN

# デフォルト環境にデプロイ
npm run deploy

# または wrangler.jsonc の env に合わせて
npx wrangler deploy --env company
```

デプロイ後に表示される **`*.workers.dev` などの HTTPS URL** を、Slack の Request URL に設定し直してください。

## 型生成

`wrangler.jsonc` のバインディングを変えたあとは:

```bash
npm run cf-typegen
```

## ドキュメント

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Wrangler の設定](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [ローカル開発の環境変数](https://developers.cloudflare.com/workers/development-testing/environment-variables/)

# Cloudflare Workers

**注意。** Cloudflare Workers の API や制限について、手元の知識が古い可能性があります。Workers、KV、R2、D1、Durable Objects、Queues、Vectorize、AI、Agents SDK に関する作業の前には、必ず最新ドキュメントを参照してください。

## ドキュメント

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

制限・クォータは各プロダクトの `/platform/limits/` ページから確認する。例: `/workers/platform/limits`

## コマンド

| コマンド              | 用途                  |
| --------------------- | --------------------- |
| `npx wrangler dev`    | ローカル開発          |
| `npx wrangler deploy` | Cloudflare へデプロイ |
| `npx wrangler types`  | TypeScript 型を生成   |

`wrangler.jsonc` のバインディングを変更したあとは `wrangler types` を実行する。

## Node.js 互換

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## エラー

- **Error 1102**（CPU／メモリ超過）: `/workers/platform/limits/` で制限を確認する
- **エラー全般**: https://developers.cloudflare.com/workers/observability/errors/

## プロダクト別ドキュメント

API リファレンスと制限は次のパスから取得する:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

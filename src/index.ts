import type { Env, SlackUrlVerification, SlackEventCallback } from './types';
import { verifySlackRequest } from './slack/verify';
import { postThreadReply } from './slack/client';
import { extractUrls, summarizeUrl } from './summarizer';

export type { Env };

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Slack は必ず POST で送ってくる。それ以外は無視
		if (request.method !== 'POST') {
			return new Response('ok', { status: 200 });
		}

		const rawBody = await request.text();

		let body: SlackUrlVerification | SlackEventCallback;
		try {
			body = JSON.parse(rawBody) as SlackUrlVerification | SlackEventCallback;
		} catch {
			return new Response('invalid json', { status: 400 });
		}

		// Slack のリトライリクエストは無視する（重複処理防止）
		// 3 秒以内に 200 を返せなかった場合に Slack が X-Slack-Retry-Num ヘッダー付きで再送してくる
		if (request.headers.get('X-Slack-Retry-Num')) {
			return new Response('ok', { status: 200 });
		}

		// リクエストが本当に Slack から来たものか署名で検証する（なりすまし防止）
		const verifyResult = await verifySlackRequest(request, rawBody, env.SLACK_SIGNING_SECRET);
		if (!verifyResult.ok) {
			return new Response('invalid signature', { status: 401 });
		}

		// Event Subscriptions の URL 登録時に Slack が送る疎通確認。challenge をそのまま返せば OK
		if (body.type === 'url_verification' && 'challenge' in body && body.challenge) {
			return new Response(body.challenge, {
				status: 200,
				headers: { 'Content-Type': 'text/plain' },
			});
		}

		// 通常のイベント通知
		if (body.type === 'event_callback') {
			const event = body.event;

			// メッセージイベント以外は無視
			if (!event || event.type !== 'message') {
				return new Response('ok', { status: 200 });
			}
			// subtype あり = 編集・削除など通常の投稿ではないので無視
			if (event.subtype !== undefined) {
				return new Response('ok', { status: 200 });
			}
			// bot からの投稿は無視（自分自身への無限ループ防止）
			if (event.bot_id) {
				return new Response('ok', { status: 200 });
			}

			// 自分自身（このボット）の投稿も無視
			const botUserId = body.authorizations?.[0]?.user_id;
			if (event.user && botUserId && event.user === botUserId) {
				return new Response('ok', { status: 200 });
			}

			// thread_ts が ts と異なる = スレッド内の返信なので無視
			if (event.thread_ts && event.thread_ts !== event.ts) {
				return new Response('ok', { status: 200 });
			}

			const text = event.text?.trim();
			if (!text || !event.channel || !event.ts) {
				return new Response('ok', { status: 200 });
			}

			const urls = extractUrls(text);
			if (urls.length > 0) {
				// Slack の 3 秒タイムアウトを避けるためバックグラウンドで処理する
				ctx.waitUntil((async () => {
					for (const url of urls) {
						const summary = await summarizeUrl(env.JAPANAI_API_KEY, env.JAPANAI_USER_ID, url);
						const message = summary ?? ':warning: リンクの内容を取得できませんでした。';
						await postThreadReply(env, event.channel!, event.ts!, message);
					}
				})());
			}
		}

		return new Response('ok', { status: 200 });
	},
};

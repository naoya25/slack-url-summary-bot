export interface Env {
	SLACK_SIGNING_SECRET: string;
	SLACK_BOT_TOKEN: string;
	OPENAI_API_KEY: string;
	/** ローカル等デバッグ時のみ `1` / `true` / `yes`。本番では未設定推奨。 */
	SLACK_DEBUG_VERIFY?: string;
	/**
	 * 開発・切り分け用のみ。`url_verification` だけ署名検証を省略して challenge を返す。
	 * 本番・インターネットに晒す URL では絶対に有効にしない。
	 */
	SLACK_SKIP_SIGNATURE_FOR_URL_VERIFICATION?: string;
}

type SlackUrlVerification = {
	type: 'url_verification';
	challenge: string;
};

type SlackMessageEvent = {
	type: 'message';
	subtype?: string;
	user?: string;
	bot_id?: string;
	text?: string;
	channel?: string;
	ts?: string;
	thread_ts?: string;
};

type SlackEventCallback = {
	type: 'event_callback';
	event?: SlackMessageEvent;
	authorizations?: Array<{ user_id?: string; is_bot?: boolean }>;
};

// ── Slack 署名検証 ────────────────────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}
	let out = 0;
	for (let i = 0; i < a.length; i++) {
		out |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return out === 0;
}

function envFlagEnabled(v: string | undefined): boolean {
	const t = v?.trim().toLowerCase();
	return t === '1' || t === 'true' || t === 'yes';
}

/** `.dev.vars` の引用符や空白で署名が一致しないのを防ぐ */
function normalizeSigningSecret(raw: string): string {
	return raw.trim().replace(/^["']|["']$/g, '');
}

type SlackVerifyFailReason =
	| 'empty_signing_secret'
	| 'missing_x_slack_signature'
	| 'missing_x_slack_request_timestamp'
	| 'invalid_timestamp'
	| 'clock_skew_exceeds_5min'
	| 'signature_mismatch';

type SlackVerifyResult =
	| { ok: true }
	| { ok: false; reason: SlackVerifyFailReason; meta: Record<string, string | number> };

function logSlackVerifyFailure(result: Extract<SlackVerifyResult, { ok: false }>, env: Env): void {
	if (!envFlagEnabled(env.SLACK_DEBUG_VERIFY)) {
		return;
	}
	console.warn(
		'[slack-verify]',
		JSON.stringify({ ok: false, reason: result.reason, ...result.meta }),
	);
}

async function verifySlackRequestDetailed(
	request: Request,
	rawBody: string,
	signingSecret: string,
): Promise<SlackVerifyResult> {
	const secret = normalizeSigningSecret(signingSecret);
	if (!secret) {
		return { ok: false, reason: 'empty_signing_secret', meta: {} };
	}

	const signature = request.headers.get('X-Slack-Signature');
	const timestamp = request.headers.get('X-Slack-Request-Timestamp');

	const metaBase: Record<string, string | number> = {
		bodyLength: rawBody.length,
		signingSecretLength: secret.length,
	};

	if (!signature) {
		return { ok: false, reason: 'missing_x_slack_signature', meta: metaBase };
	}
	if (!timestamp) {
		return { ok: false, reason: 'missing_x_slack_request_timestamp', meta: metaBase };
	}

	const ts = Number.parseInt(timestamp, 10);
	if (!Number.isFinite(ts)) {
		return {
			ok: false,
			reason: 'invalid_timestamp',
			meta: { ...metaBase, timestampHeaderLength: timestamp.length },
		};
	}

	const nowSec = Math.floor(Date.now() / 1000);
	const skewSeconds = nowSec - ts;
	metaBase.skewSeconds = skewSeconds;

	if (Math.abs(skewSeconds) > 60 * 5) {
		return { ok: false, reason: 'clock_skew_exceeds_5min', meta: metaBase };
	}

	const encoder = new TextEncoder();
	const base = `v0:${timestamp}:${rawBody}`;
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(base));
	const hex = [...new Uint8Array(mac)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	const expected = `v0=${hex}`;

	const sigNorm = signature.trim().toLowerCase();
	const expNorm = expected.toLowerCase();
	metaBase.signatureHeaderLength = signature.length;
	metaBase.computedSignatureLength = expNorm.length;

	if (!timingSafeEqual(sigNorm, expNorm)) {
		return { ok: false, reason: 'signature_mismatch', meta: metaBase };
	}

	return { ok: true };
}

// ── URL 抽出・ページ取得・要約 ────────────────────────────────────────────────

function extractUrls(text: string): string[] {
	const regex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
	return [...new Set(text.match(regex) ?? [])];
}

/** HTML を平文に変換して先頭 8,000 文字を返す */
async function fetchPageText(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Slackbot 1.0; +slack.com)' },
			redirect: 'follow',
		});
		if (!res.ok) {
			console.warn(`[fetch-url] ${url} responded ${res.status}`);
			return null;
		}
		const contentType = res.headers.get('Content-Type') ?? '';
		if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
			return null;
		}
		const html = await res.text();
		const text = html
			.replace(/<script[\s\S]*?<\/script>/gi, '')
			.replace(/<style[\s\S]*?<\/style>/gi, '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#039;/g, "'")
			.replace(/&nbsp;/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 8000);
		return text || null;
	} catch (err) {
		console.warn(`[fetch-url] failed to fetch ${url}:`, err);
		return null;
	}
}

async function summarizeWithOpenAI(apiKey: string, url: string, pageText: string): Promise<string> {
	const res = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: 'gpt-4o-mini',
			messages: [
				{
					role: 'system',
					content:
						'あなたはウェブページの内容を日本語で簡潔に要約するアシスタントです。3〜5文で要点をまとめてください。',
				},
				{
					role: 'user',
					content: `URL: ${url}\n\n${pageText}`,
				},
			],
			max_tokens: 600,
		}),
	});

	const data = (await res.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
		error?: { message?: string };
	};

	if (data.error) {
		console.error('[openai] error:', data.error.message);
		return '要約中にエラーが発生しました。';
	}

	return data.choices?.[0]?.message?.content?.trim() ?? '要約できませんでした。';
}

// ── Slack 投稿 ────────────────────────────────────────────────────────────────

async function postThreadReply(
	env: Env,
	channel: string,
	threadTs: string,
	text: string,
): Promise<void> {
	const res = await fetch('https://slack.com/api/chat.postMessage', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
		},
		body: JSON.stringify({
			channel,
			thread_ts: threadTs,
			text,
		}),
	});

	const data = (await res.json()) as { ok?: boolean; error?: string };
	if (!data.ok) {
		console.error('[slack] chat.postMessage failed:', data.error);
	}
}

async function handleUrlSummaries(
	env: Env,
	channel: string,
	threadTs: string,
	urls: string[],
): Promise<void> {
	for (const url of urls) {
		const pageText = await fetchPageText(url);
		if (!pageText) {
			await postThreadReply(env, channel, threadTs, `<${url}> の内容を取得できませんでした。`);
			continue;
		}
		const summary = await summarizeWithOpenAI(env.OPENAI_API_KEY, url, pageText);
		await postThreadReply(env, channel, threadTs, `*<${url}|リンクの要約>*\n${summary}`);
	}
}

// ── エントリポイント ──────────────────────────────────────────────────────────

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
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

		if (
			body.type === 'url_verification' &&
			'challenge' in body &&
			body.challenge &&
			envFlagEnabled(env.SLACK_SKIP_SIGNATURE_FOR_URL_VERIFICATION)
		) {
			console.warn(
				'[slack] SLACK_SKIP_SIGNATURE_FOR_URL_VERIFICATION: url_verification answered without signature check — remove this flag in production',
			);
			return new Response(body.challenge, {
				status: 200,
				headers: { 'Content-Type': 'text/plain' },
			});
		}

		const verifyResult = await verifySlackRequestDetailed(
			request,
			rawBody,
			env.SLACK_SIGNING_SECRET,
		);
		if (!verifyResult.ok) {
			logSlackVerifyFailure(verifyResult, env);
			return new Response('invalid signature', { status: 401 });
		}

		if (body.type === 'url_verification' && 'challenge' in body && body.challenge) {
			return new Response(body.challenge, {
				status: 200,
				headers: { 'Content-Type': 'text/plain' },
			});
		}

		if (body.type === 'event_callback') {
			const event = body.event;
			if (!event || event.type !== 'message') {
				return new Response('ok', { status: 200 });
			}
			if (event.subtype !== undefined) {
				return new Response('ok', { status: 200 });
			}
			if (event.bot_id) {
				return new Response('ok', { status: 200 });
			}

			const botUserId = body.authorizations?.[0]?.user_id;
			if (event.user && botUserId && event.user === botUserId) {
				return new Response('ok', { status: 200 });
			}

			const text = event.text?.trim();
			if (!text || !event.channel || !event.ts) {
				return new Response('ok', { status: 200 });
			}

			const urls = extractUrls(text);
			if (urls.length > 0) {
				const threadTs = event.thread_ts ?? event.ts;
				// Slack の 3 秒タイムアウトを避けるためバックグラウンドで処理する
				ctx.waitUntil(handleUrlSummaries(env, event.channel, threadTs, urls));
			}
		}

		return new Response('ok', { status: 200 });
	},
};

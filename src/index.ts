export interface Env {
	SLACK_SIGNING_SECRET: string;
	SLACK_BOT_TOKEN: string;
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

async function verifySlackRequest(
	request: Request,
	rawBody: string,
	signingSecret: string,
): Promise<boolean> {
	const timestamp = request.headers.get('X-Slack-Request-Timestamp');
	const signature = request.headers.get('X-Slack-Signature');
	if (!timestamp || !signature) {
		return false;
	}
	const ts = Number.parseInt(timestamp, 10);
	if (!Number.isFinite(ts)) {
		return false;
	}
	const nowSec = Math.floor(Date.now() / 1000);
	if (Math.abs(nowSec - ts) > 60 * 5) {
		return false;
	}

	const encoder = new TextEncoder();
	const base = `v0:${timestamp}:${rawBody}`;
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(signingSecret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(base));
	const hex = [...new Uint8Array(mac)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	const expected = `v0=${hex}`;

	return timingSafeEqual(signature, expected);
}

async function postThreadEcho(
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
		console.error('chat.postMessage failed:', data.error);
	}
}

export default {
	async fetch(
		request: Request,
		env: Env,
		_ctx?: ExecutionContext,
	): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('ok', { status: 200 });
		}

		const rawBody = await request.text();

		if (!(await verifySlackRequest(request, rawBody, env.SLACK_SIGNING_SECRET))) {
			return new Response('invalid signature', { status: 401 });
		}

		let body: SlackUrlVerification | SlackEventCallback;
		try {
			body = JSON.parse(rawBody) as SlackUrlVerification | SlackEventCallback;
		} catch {
			return new Response('invalid json', { status: 400 });
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

			const threadTs = event.thread_ts ?? event.ts;
			await postThreadEcho(env, event.channel, threadTs, text);
		}

		return new Response('ok', { status: 200 });
	},
};

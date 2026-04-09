import type { Env } from '../types';

export async function postThreadReply(
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

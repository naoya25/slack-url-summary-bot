export interface Env {
	SLACK_SIGNING_SECRET: string;
	SLACK_BOT_TOKEN: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('ok', { status: 200 });
		}

		const rawBody = await request.text();
		console.log('rawBody:', rawBody);

		const body = JSON.parse(rawBody);

		if (body.type === 'url_verification' && body.challenge) {
			return new Response(body.challenge, {
				status: 200,
				headers: {
					'Content-Type': 'text/plain',
				},
			});
		}

		if (body.type === 'event_callback') {
			console.log('event received:', JSON.stringify(body, null, 2));
		}

		return new Response('ok', { status: 200 });
	},
};

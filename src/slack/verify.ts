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

/** `.dev.vars` の引用符や空白で署名が一致しないのを防ぐ */
function normalizeSigningSecret(raw: string): string {
	return raw.trim().replace(/^["']|["']$/g, '');
}

export type SlackVerifyFailReason =
	| 'empty_signing_secret'
	| 'missing_x_slack_signature'
	| 'missing_x_slack_request_timestamp'
	| 'invalid_timestamp'
	| 'clock_skew_exceeds_5min'
	| 'signature_mismatch';

export type SlackVerifyResult =
	| { ok: true }
	| { ok: false; reason: SlackVerifyFailReason; meta: Record<string, string | number> };

export async function verifySlackRequest(
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

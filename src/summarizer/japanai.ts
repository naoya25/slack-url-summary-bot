import { SUMMARIZE_SYSTEM_PROMPT, buildSummarizeUserPrompt } from './prompts';

export async function summarizeWithJapanAI(
	apiKey: string,
	userId: string,
	url: string,
	pageText: string,
): Promise<string> {
	const prompt = [SUMMARIZE_SYSTEM_PROMPT, buildSummarizeUserPrompt(url, pageText)].join('\n\n');

	const res = await fetch('https://api.japan-ai.co.jp/chat/v2', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: 'gemini-2.5-flash',
			prompt,
			userId,
		}),
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '(body unreadable)');
		console.error('[japanai] HTTP error:', res.status, res.statusText, body);
		return '要約中にエラーが発生しました。';
	}

	const data = (await res.json()) as { status?: string; chatMessage?: string };

	if (data.status && data.status !== 'succeeded') {
		console.error('[japanai] error status:', data.status);
		return '要約中にエラーが発生しました。';
	}

	return data.chatMessage?.trim() ?? '要約できませんでした。';
}

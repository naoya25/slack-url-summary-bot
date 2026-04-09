import { SUMMARIZE_SYSTEM_PROMPT, buildSummarizeUserPrompt } from './prompts';

export async function summarizeWithOpenAI(
	apiKey: string,
	url: string,
	pageText: string,
): Promise<string> {
	const res = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: 'gpt-4o-mini',
			messages: [
				{ role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
				{ role: 'user', content: buildSummarizeUserPrompt(url, pageText) },
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

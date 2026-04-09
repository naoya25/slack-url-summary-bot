import type { Env } from '../types';
import { postThreadReply } from '../slack/client';
import { extractUrls, fetchPageText } from './fetch';
import { summarizeWithOpenAI } from './openai';

export { extractUrls };

export async function handleUrlSummaries(
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

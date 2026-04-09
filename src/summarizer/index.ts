import { extractUrls, fetchPageText } from './fetch';
import { summarizeWithOpenAI } from './openai';

export { extractUrls };

/**
 * URL のページ内容を取得して要約テキストを返す。
 * 取得・要約に失敗した場合は null を返す。
 */
export async function summarizeUrl(apiKey: string, url: string): Promise<string | null> {
	const pageText = await fetchPageText(url);
	if (!pageText) {
		return null;
	}
	return summarizeWithOpenAI(apiKey, url, pageText);
}

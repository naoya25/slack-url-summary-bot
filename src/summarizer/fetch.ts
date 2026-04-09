export function extractUrls(text: string): string[] {
	const regex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
	return [...new Set(text.match(regex) ?? [])];
}

/** HTML を平文に変換して先頭 8,000 文字を返す */
export async function fetchPageText(url: string): Promise<string | null> {
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

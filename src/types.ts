export interface Env {
	SLACK_SIGNING_SECRET: string;
	SLACK_BOT_TOKEN: string;
	JAPANAI_API_KEY: string;
	JAPANAI_USER_ID: string;
}

export type SlackUrlVerification = {
	type: 'url_verification';
	challenge: string;
};

export type SlackMessageEvent = {
	type: 'message';
	subtype?: string;
	user?: string;
	bot_id?: string;
	text?: string;
	channel?: string;
	ts?: string;
	thread_ts?: string;
};

export type SlackEventCallback = {
	type: 'event_callback';
	event?: SlackMessageEvent;
	authorizations?: Array<{ user_id?: string; is_bot?: boolean }>;
};

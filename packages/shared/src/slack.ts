export interface SlackConfig {
  botToken: string;
  defaultChannel: string;
}

export function formatTestingMessage(input: {
  featureTitle: string;
  testUrl: string;
  humanChecklist: string[];
}): string {
  const checklistLines = input.humanChecklist.map((item) => `- [ ] ${item}`);

  return [
    `*Feature ready for testing: "${input.featureTitle}"*`,
    `Deployed to: ${input.testUrl}`,
    "",
    "*Checklist:*",
    ...checklistLines,
    "",
    'Reply "ship it" to approve or describe any issues.',
  ].join("\n");
}

interface ChatPostMessageResponse {
  ok?: boolean;
  ts?: string;
  error?: string;
}

export class SlackNotifier {
  private readonly config: SlackConfig;

  constructor(config: SlackConfig) {
    this.config = config;
  }

  async notify(channel: string, text: string, threadTs?: string): Promise<string> {
    const payload: { channel: string; text: string; thread_ts?: string } = {
      channel: channel || this.config.defaultChannel,
      text,
    };

    if (threadTs) {
      payload.thread_ts = threadTs;
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack API request failed with status ${response.status}`);
    }

    const data = (await response.json()) as ChatPostMessageResponse;
    if (!data.ok || !data.ts) {
      throw new Error(`Slack API error: ${data.error ?? "missing_ts"}`);
    }

    return data.ts;
  }
}

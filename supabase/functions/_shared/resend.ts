export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const RESEND_API_URL = "https://api.resend.com/emails";
const DIGEST_FROM_ADDRESS = "Zazig <digest@zazig.com>";

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("Missing required environment variable: RESEND_API_KEY");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: DIGEST_FROM_ADDRESS,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Resend API request failed with status ${response.status}: ${responseBody}`,
    );
  }
}

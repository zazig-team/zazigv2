export interface DigestData {
  weekEnding: string;
  shippedFeatures: Array<{ title: string; promotedVersion: string | null }>;
  mergedPrCount: number;
  failedJobs: Array<{ title: string; featureTitle: string }>;
}

export function renderWeeklyDigest(data: DigestData): { html: string; text: string; subject: string } {
  const shippedCount = data.shippedFeatures.length;
  const failureCount = data.failedJobs.length;
  const subject = `Zazig digest: ${shippedCount} shipped, ${failureCount} failures — week of ${data.weekEnding}`;

  const shippedHtml =
    shippedCount > 0
      ? `<ul style="margin:8px 0 0 20px;padding:0;">${data.shippedFeatures
          .map((feature) => {
            const version = feature.promotedVersion ? ` (v${escapeHtml(feature.promotedVersion)})` : "";
            return `<li style="margin:0 0 6px 0;">${escapeHtml(feature.title)}${version}</li>`;
          })
          .join("")}</ul>`
      : `<p style="margin:8px 0 0 0;color:#374151;">nothing shipped</p>`;

  const failuresHtml =
    failureCount > 0
      ? `<ul style="margin:8px 0 0 20px;padding:0;">${data.failedJobs
          .map(
            (job) =>
              `<li style="margin:0 0 6px 0;">${escapeHtml(job.title)} (${escapeHtml(job.featureTitle)})</li>`,
          )
          .join("")}</ul>`
      : `<p style="margin:8px 0 0 0;color:#374151;">no failures</p>`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;">
    <div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;line-height:1.45;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;">
        <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.2;">Zazig Weekly Digest</h1>

        <h2 style="margin:0;font-size:16px;">Shipped features</h2>
        ${shippedHtml}

        <h2 style="margin:20px 0 0 0;font-size:16px;">Merged PRs</h2>
        <p style="margin:8px 0 0 0;color:#111827;">${data.mergedPrCount} PRs merged this week</p>

        <h2 style="margin:20px 0 0 0;font-size:16px;">Failed builds</h2>
        ${failuresHtml}

        <p style="margin:24px 0 0 0;padding-top:12px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
          Zazig weekly digest — week ending ${escapeHtml(data.weekEnding)}
        </p>
      </div>
    </div>
  </body>
</html>`;

  const shippedText =
    shippedCount > 0
      ? data.shippedFeatures
          .map((feature) => {
            const version = feature.promotedVersion ? ` (v${feature.promotedVersion})` : "";
            return `- ${feature.title}${version}`;
          })
          .join("\n")
      : "nothing shipped";

  const failuresText =
    failureCount > 0
      ? data.failedJobs.map((job) => `- ${job.title} (${job.featureTitle})`).join("\n")
      : "no failures";

  const text = `Zazig Weekly Digest

Shipped features
${shippedText}

Merged PRs
${data.mergedPrCount} PRs merged this week

Failed builds
${failuresText}

Zazig weekly digest — week ending ${data.weekEnding}`;

  return { html, text, subject };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

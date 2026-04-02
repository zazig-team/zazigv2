const ANSI_ESCAPE_SEQUENCE_REGEX = /\x1b\[[0-9;]*m/g;
const FAIL_MARKER_REGEX = /\bFAIL\b/;
const SUMMARY_LINE_REGEX = /^\s*(Test Files\b|Tests\b|Test Suites:|Tests:)/i;
const EXTENDED_SUMMARY_LINE_REGEX = /^\s*(Tests\b|Test Suites:|Test Files\b|Start at\b|Duration\b)/i;
const NPM_ERROR_LINE_REGEX = /^\s*npm (?:error|ERR!)/i;
const MAX_SUMMARY_BYTES = 8 * 1024;

function stripAnsi(rawLog: string): string {
  return rawLog.replace(ANSI_ESCAPE_SEQUENCE_REGEX, "");
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim().length === 0) end -= 1;
  return lines.slice(0, end);
}

function extractFailureBlock(lines: string[]): string[] {
  let failStart = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (FAIL_MARKER_REGEX.test(lines[index])) {
      failStart = index;
      break;
    }
  }

  if (failStart < 0) return [];

  const block: string[] = [];
  let summaryFound = false;

  for (let index = failStart; index < lines.length; index += 1) {
    const line = lines[index];
    block.push(line);

    if (SUMMARY_LINE_REGEX.test(line)) {
      summaryFound = true;
      for (let next = index + 1; next < lines.length; next += 1) {
        if (!EXTENDED_SUMMARY_LINE_REGEX.test(lines[next])) break;
        block.push(lines[next]);
      }
      break;
    }
  }

  if (!summaryFound) {
    return trimTrailingBlankLines(block);
  }

  return trimTrailingBlankLines(block);
}

function extractNpmErrorLines(lines: string[]): string[] {
  const collected: string[] = [];
  let index = lines.length - 1;

  while (index >= 0 && lines[index].trim().length === 0) {
    index -= 1;
  }

  while (index >= 0) {
    const line = lines[index];
    if (NPM_ERROR_LINE_REGEX.test(line)) {
      collected.push(line.trimEnd());
      index -= 1;
      continue;
    }
    if (collected.length > 0 && line.trim().length === 0) {
      index -= 1;
      continue;
    }
    if (collected.length > 0) break;
    index -= 1;
  }

  return collected.reverse();
}

function truncateToByteLimit(summary: string, runId?: string | number): string {
  const summaryBytes = Buffer.byteLength(summary, "utf8");
  if (summaryBytes <= MAX_SUMMARY_BYTES) return summary;

  const pointerRunId = runId === undefined ? "<runId>" : String(runId);
  const marker = `[truncated — full log: gh run view ${pointerRunId} --log-failed]`;
  const markerBytes = Buffer.byteLength(marker, "utf8");

  if (markerBytes >= MAX_SUMMARY_BYTES) {
    return marker.slice(0, MAX_SUMMARY_BYTES);
  }

  const availableBytes = MAX_SUMMARY_BYTES - markerBytes;
  let prefix = Buffer.from(summary, "utf8").subarray(0, availableBytes).toString("utf8");

  while (Buffer.byteLength(prefix, "utf8") > availableBytes) {
    prefix = prefix.slice(0, -1);
  }

  return `${prefix}${marker}`;
}

export function extractFailureSummary(rawLog: string, runId?: string | number): string {
  const strippedLog = stripAnsi(rawLog ?? "");
  const lines = strippedLog.split(/\r?\n/);

  const failureBlock = extractFailureBlock(lines);
  const npmErrorLines = extractNpmErrorLines(lines);

  const sections: string[] = [];
  if (failureBlock.length > 0) sections.push(failureBlock.join("\n"));
  if (npmErrorLines.length > 0) sections.push(npmErrorLines.join("\n"));

  let summary = sections.join("\n\n").trim();

  if (!summary) {
    summary = trimTrailingBlankLines(lines.slice(-200)).join("\n").trim();
  }

  return truncateToByteLimit(summary, runId);
}

export function extractWorkspaceName(rawLog: string): string | null {
  const strippedLog = stripAnsi(rawLog ?? "");
  const lines = strippedLog.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*npm error\s+(?:path|in)\s+(.+)$/i);
    if (!match) continue;

    const normalizedPath = match[1].trim().replace(/^['"]|['"]$/g, "").replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) continue;

    const packagesIndex = segments.lastIndexOf("packages");
    if (packagesIndex >= 0 && packagesIndex < segments.length - 1) {
      const nextSegment = segments[packagesIndex + 1];
      if (nextSegment.startsWith("@") && packagesIndex + 2 < segments.length) {
        return segments[packagesIndex + 2];
      }
      return nextSegment;
    }

    const lastSegment = segments[segments.length - 1];
    if (lastSegment) return lastSegment;
  }

  return null;
}

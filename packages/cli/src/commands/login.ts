/**
 * login.ts — zazig login
 *
 * Supports dual-mode email auth:
 *   1) Link callback flow (default) via local HTTP callback server
 *   2) One-time code flow (`--otp`/`--code`) for environments that send codes
 *
 * Company context comes from user_companies at runtime, not at login time.
 */

import * as http from "node:http";
import { URL } from "node:url";
import { createInterface } from "node:readline/promises";
import { saveCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

interface OAuthTokens {
  access_token: string;
  refresh_token: string;
}

type LoginMode = "auto" | "link" | "otp";

export async function login(args: string[] = []): Promise<void> {
  let mode: LoginMode;
  try {
    mode = parseLoginMode(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error("Usage: zazig login [--otp|--code|--link]");
    process.exit(1);
  }

  // Only respect SUPABASE_URL/ANON_KEY env overrides when ZAZIG_ENV is explicitly
  // set (e.g. staging). Otherwise always use the hardcoded production defaults.
  // This prevents a stray SUPABASE_URL in the shell from poisoning credentials.json.
  const envOverride = Boolean(process.env["ZAZIG_ENV"]);
  const supabaseUrl = (envOverride && process.env["SUPABASE_URL"]) || DEFAULT_SUPABASE_URL;
  const anonKey = (envOverride && process.env["SUPABASE_ANON_KEY"]) || DEFAULT_SUPABASE_ANON_KEY;

  // 1. Prompt for email
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let email: string;
  try {
    email = (await rl.question("Email address: ")).trim();
  } finally {
    rl.close();
  }

  if (!email) {
    console.error("Email is required.");
    process.exit(1);
  }

  // OTP-only mode: no localhost callback server required.
  if (mode === "otp") {
    await sendMagicLink({ supabaseUrl, anonKey, email });
    console.log(`Sign-in code sent to ${email} — paste the code from your email below.`);
    const code = await promptForRequiredOtpCode();
    const tokens = await verifyOtpCode({ supabaseUrl, anonKey, email, code });
    persistCredentials({ tokens, email, supabaseUrl });
    return;
  }

  // Link/auto mode: start localhost callback server and send link with redirect.
  // Prefer 3000 because Supabase site_url often points to localhost:3000.
  const port = await findAvailablePort(3000);
  const { server, callbackPromise } = await startCallbackServer(port);
  const timeoutMs = 5 * 60 * 1000;
  let otpPromptAbort: AbortController | null = null;

  try {
    const redirectTo = `http://127.0.0.1:${port}/callback`;
    await sendMagicLink({ supabaseUrl, anonKey, email, redirectTo });

    console.log(`Magic link sent to ${email} — click the link in your email to finish login.`);
    const timeoutPromise = loginTimeout(timeoutMs);
    let tokens: OAuthTokens;

    if (mode === "link") {
      tokens = await Promise.race([callbackPromise, timeoutPromise]);
    } else {
      otpPromptAbort = new AbortController();
      const callbackResultPromise = callbackPromise.then((value) => ({
        kind: "callback" as const,
        value,
      }));

      console.log("If your email shows a one-time code instead of a link, paste it and press Enter.");
      console.log("Or press Enter to continue waiting for the link callback.\n");

      const otpPromptPromise = promptForOptionalOtpCode(otpPromptAbort.signal).then((value) => ({
        kind: "otp" as const,
        value,
      }));

      const first = await Promise.race([
        callbackResultPromise,
        otpPromptPromise,
        timeoutPromise,
      ]);

      if (first.kind === "callback") {
        otpPromptAbort.abort();
        tokens = first.value;
      } else if (!first.value) {
        tokens = await Promise.race([callbackPromise, timeoutPromise]);
      } else {
        try {
          tokens = await verifyOtpCode({
            supabaseUrl,
            anonKey,
            email,
            code: first.value,
          });
        } catch (err) {
          console.error(
            `Code verification failed: ${err instanceof Error ? err.message : String(err)}`
          );
          console.error("Continuing to wait for the magic link callback...");
          tokens = await Promise.race([callbackPromise, timeoutPromise]);
        }
      }
    }

    persistCredentials({ tokens, email, supabaseUrl });
  } finally {
    otpPromptAbort?.abort();
    server.close();
  }
}

function parseLoginMode(args: string[]): LoginMode {
  let mode: LoginMode = "auto";

  for (const arg of args) {
    switch (arg) {
      case "--otp":
      case "--code":
        if (mode === "link") {
          throw new Error("Cannot combine --otp/--code with --link.");
        }
        mode = "otp";
        break;
      case "--link":
        if (mode === "otp") {
          throw new Error("Cannot combine --link with --otp/--code.");
        }
        mode = "link";
        break;
      default:
        throw new Error(`Unknown login option: ${arg}`);
    }
  }

  return mode;
}

async function startCallbackServer(port: number): Promise<{
  server: http.Server;
  callbackPromise: Promise<OAuthTokens>;
}> {
  let resolveCallback: (tokens: OAuthTokens) => void;
  const callbackPromise = new Promise<OAuthTokens>((resolve) => {
    resolveCallback = resolve;
  });

  const callbackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>zazig — Signed in</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&family=JetBrains+Mono:wght@400&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px;-webkit-font-smoothing:antialiased}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#0c0d10;color:#eaecf1;min-height:100vh;display:flex;justify-content:center;align-items:center;overflow:hidden}
body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.03;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-size:256px 256px}
.shell{position:relative;z-index:1;width:100%;max-width:400px;padding:24px;text-align:center}
.card{opacity:0;animation:fadeUp .6s ease-out .1s forwards}
.brand{display:flex;align-items:center;justify-content:center;margin-bottom:48px}
.brand-wordmark{font-size:28px;font-weight:800;letter-spacing:-.03em;color:#eaecf1;text-decoration:none}
.brand-dot{width:7px;height:7px;border-radius:50%;background:#3ecf71;margin-left:2px;margin-bottom:-2px;animation:breathe 4s ease-in-out infinite}
.icon-ring{width:56px;height:56px;border-radius:50%;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;position:relative}
.icon-ring.success{background:rgba(62,207,113,.1)}
.icon-ring.error{background:rgba(239,84,84,.1)}
.icon-ring svg{width:28px;height:28px;opacity:0}
.icon-ring.success svg{color:#3ecf71;animation:checkIn .5s ease-out .4s forwards}
.icon-ring.error svg{color:#ef5454;animation:checkIn .5s ease-out .4s forwards}
.ring-pulse{position:absolute;inset:0;border-radius:50%;opacity:0}
.icon-ring.success .ring-pulse{border:2px solid #3ecf71;animation:pulse 1s ease-out .3s forwards}
.icon-ring.error .ring-pulse{border:2px solid #ef5454;animation:pulse 1s ease-out .3s forwards}
h2{font-size:20px;font-weight:700;letter-spacing:-.02em;margin-bottom:10px;opacity:0;animation:fadeUp .5s ease-out .5s forwards}
.detail{font-size:14px;color:#868c98;line-height:1.6;opacity:0;animation:fadeUp .5s ease-out .6s forwards}
.hint{margin-top:32px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#505660;opacity:0;animation:fadeUp .5s ease-out .7s forwards}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes breathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.65;transform:scale(.88)}}
@keyframes checkIn{0%{opacity:0;transform:scale(.5)}60%{opacity:1;transform:scale(1.15)}100%{opacity:1;transform:scale(1)}}
@keyframes pulse{0%{opacity:.6;transform:scale(1)}100%{opacity:0;transform:scale(1.8)}}
</style>
</head>
<body>
<div class="shell">
<div class="card">
<div class="brand">
<span class="brand-wordmark">zazig</span>
<span class="brand-dot"></span>
</div>
<div id="icon" class="icon-ring success">
<div class="ring-pulse"></div>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path id="check-path" d="M5 13l4 4L19 7"/></svg>
</div>
<h2 id="title">Signed in</h2>
<p id="detail" class="detail">You&rsquo;re authenticated. Return to your terminal<br>to continue&nbsp;working.</p>
<p class="hint">You can close this tab</p>
</div>
</div>
<script>
const hash = window.location.hash.substring(1);
const params = new URLSearchParams(hash);
const at = params.get('access_token');
const rt = params.get('refresh_token');
if (at && rt) {
  fetch('/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ access_token: at, refresh_token: rt })
  });
} else {
  document.getElementById('icon').className = 'icon-ring error';
  document.getElementById('icon').innerHTML = '<div class="ring-pulse"></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  document.getElementById('title').textContent = 'Sign-in failed';
  document.getElementById('detail').innerHTML = 'No authentication tokens were received.<br>Please try <code style="font-family:JetBrains Mono,monospace;font-size:13px;color:#b0b6c3">zazig login</code> again.';
}
</script>
</body>
</html>`;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, `http://127.0.0.1:${port}`);

    if (url.pathname === "/" || url.pathname === "/callback") {
      // Handle both root (site_url fallback) and /callback (explicit redirect_to)
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(callbackHtml);
    } else if (url.pathname === "/token" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const tokens = JSON.parse(body) as Partial<OAuthTokens>;
          if (!tokens.access_token || !tokens.refresh_token) {
            throw new Error("Missing tokens");
          }
          res.writeHead(200);
          res.end();
          resolveCallback(tokens as OAuthTokens);
        } catch {
          res.writeHead(400);
          res.end();
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { server, callbackPromise };
}

async function sendMagicLink({
  supabaseUrl,
  anonKey,
  email,
  redirectTo,
}: {
  supabaseUrl: string;
  anonKey: string;
  email: string;
  redirectTo?: string;
}): Promise<void> {
  const body: Record<string, string> = { email };

  let url = `${supabaseUrl}/auth/v1/magiclink`;
  if (redirectTo) {
    url += `?redirect_to=${encodeURIComponent(redirectTo)}`;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const raw = await resp.text().catch(() => "");
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { /* not JSON */ }

    const errorCode = typeof parsed?.["error_code"] === "string" ? parsed["error_code"] : "";
    const msg = typeof parsed?.["msg"] === "string" ? parsed["msg"] : "";

    if (resp.status === 429 || errorCode === "over_email_send_rate_limit") {
      const wait = msg.match(/after (\d+) seconds/)?.[1];
      const hint = wait ? `Try again in ${wait} seconds.` : "Wait a moment and try again.";
      console.error(`Rate limited — too many sign-in requests. ${hint}`);
      process.exit(1);
    }

    const detail = msg || raw || `HTTP ${resp.status}`;
    console.error(`Failed to send sign-in email: ${detail}`);
    process.exit(1);
  }
}

async function verifyOtpCode({
  supabaseUrl,
  anonKey,
  email,
  code,
}: {
  supabaseUrl: string;
  anonKey: string;
  email: string;
  code: string;
}): Promise<OAuthTokens> {
  const candidates = [
    { email, token: code, type: "email" },
    { email, token: code, type: "magiclink" },
  ];
  const errors: string[] = [];

  for (const candidate of candidates) {
    const resp = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify(candidate),
    });
    const dataRaw: unknown = await resp.json().catch(() => ({}));
    const data =
      dataRaw && typeof dataRaw === "object"
        ? (dataRaw as Record<string, unknown>)
        : {};

    if (!resp.ok) {
      const msg = typeof data["msg"] === "string" ? data["msg"] : `HTTP ${resp.status}`;
      errors.push(`${candidate.type}: ${msg}`);
      continue;
    }

    const maybeTopAccess = typeof data["access_token"] === "string" ? data["access_token"] : null;
    const maybeTopRefresh = typeof data["refresh_token"] === "string" ? data["refresh_token"] : null;
    const session =
      typeof data["session"] === "object" && data["session"] !== null
        ? (data["session"] as Record<string, unknown>)
        : null;
    const maybeSessionAccess = session && typeof session["access_token"] === "string"
      ? session["access_token"]
      : null;
    const maybeSessionRefresh = session && typeof session["refresh_token"] === "string"
      ? session["refresh_token"]
      : null;

    const access_token = maybeTopAccess ?? maybeSessionAccess;
    const refresh_token = maybeTopRefresh ?? maybeSessionRefresh;

    if (access_token && refresh_token) {
      return { access_token, refresh_token };
    }

    errors.push(`${candidate.type}: verification succeeded but no session tokens returned`);
  }

  throw new Error(`Could not verify one-time code (${errors.join("; ")})`);
}

function persistCredentials({
  tokens,
  email,
  supabaseUrl,
}: {
  tokens: OAuthTokens;
  email: string;
  supabaseUrl: string;
}): void {
  saveCredentials({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    email,
    supabaseUrl,
  });

  console.log(`Logged in as ${email}`);
}

function loginTimeout(timeoutMs: number): Promise<never> {
  return new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error("Login timed out")), timeoutMs);
    t.unref();
  });
}

async function promptForOptionalOtpCode(signal: AbortSignal): Promise<string | null> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const value = (
      await rl.question("One-time code (optional): ", { signal })
    ).trim();
    return value.length > 0 ? value : null;
  } catch (err) {
    if (isAbortError(err)) {
      return null;
    }
    throw err;
  } finally {
    rl.close();
  }
}

async function promptForRequiredOtpCode(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const value = (await rl.question("One-time code: ")).trim();
      if (value.length > 0) {
        return value;
      }
      console.error("A one-time code is required. Paste the code from your email.");
    }
  } finally {
    rl.close();
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || /aborted/i.test(err.message))
  );
}

function findAvailablePort(preferredPort: number): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(preferredPort, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      server.close(() => resolve(addr.port));
    });
    server.on("error", () => {
      // Preferred port taken — use any available port
      const s = http.createServer();
      s.listen(0, "127.0.0.1", () => {
        const addr = s.address() as { port: number };
        s.close(() => resolve(addr.port));
      });
    });
  });
}

/**
 * login.ts — zazig login
 *
 * Opens the browser to Supabase hosted auth UI. A local HTTP callback
 * server captures the OAuth tokens and stores the refresh token in
 * ~/.zazigv2/credentials.json. No passwords handled in the CLI.
 */

import * as http from "node:http";
import { exec } from "node:child_process";
import { URL } from "node:url";
import { saveCredentials } from "../lib/credentials.js";

export async function login(): Promise<void> {
  // 1. Find an available port
  const port = await findAvailablePort(54321);

  // 2. Start local callback server
  let resolveCallback: (tokens: {
    access_token: string;
    refresh_token: string;
  }) => void;
  const callbackPromise = new Promise<{
    access_token: string;
    refresh_token: string;
  }>((resolve) => {
    resolveCallback = resolve;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, `http://localhost:${port}`);

    if (url.pathname === "/callback") {
      // Supabase puts tokens in the URL hash fragment. Serve a page that
      // reads the hash and POSTs the tokens back to our local server.
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html>
<html><body>
<p>Login successful &mdash; you can close this tab.</p>
<script>
const hash = window.location.hash.substring(1);
const params = new URLSearchParams(hash);
fetch('/token', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
  })
});
</script>
</body></html>`);
    } else if (url.pathname === "/token" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const tokens = JSON.parse(body) as {
            access_token: string;
            refresh_token: string;
          };
          res.writeHead(200);
          res.end();
          resolveCallback(tokens);
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

  await new Promise<void>((resolve) => server.listen(port, resolve));

  // 3. Open browser to Supabase auth UI
  const supabaseUrl =
    process.env["SUPABASE_URL"] ?? "https://jmussmwglgbwncgygzbz.supabase.co";
  const redirectTo = `http://localhost:${port}/callback`;
  const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirectTo)}`;

  console.log("Opening browser to log in...");
  console.log(`If your browser doesn't open, visit:\n  ${authUrl}`);
  openBrowser(authUrl);

  // 4. Wait for callback (timeout after 5 minutes)
  const timeoutMs = 5 * 60 * 1000;
  let tokens: { access_token: string; refresh_token: string };
  try {
    tokens = await Promise.race([
      callbackPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Login timed out")), timeoutMs)
      ),
    ]);
  } catch (err) {
    server.close();
    throw err;
  }

  server.close();

  // 5. Decode the JWT to get email / company_id
  const payload = decodeJwtPayload(tokens.access_token);
  const email = (payload?.email as string) ?? "unknown";
  const companyId =
    (payload?.company_id as string) ??
    (payload?.user_metadata as Record<string, unknown> | undefined)
      ?.company_id as string | undefined ??
    null;

  // 6. Save credentials
  saveCredentials({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    email,
    companyId,
    supabaseUrl,
  });

  console.log(`Logged in as ${email}`);
  if (companyId) console.log(`Company: ${companyId}`);
}

function decodeJwtPayload(
  token: string
): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf-8")
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${url}"`, (err) => {
    if (err) console.warn("Could not open browser automatically.");
  });
}

async function findAvailablePort(preferredPort: number): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(preferredPort, () => {
      const addr = server.address() as { port: number };
      server.close(() => resolve(addr.port));
    });
    server.on("error", () => {
      // Preferred port taken — use any available port
      const s = http.createServer();
      s.listen(0, () => {
        const addr = s.address() as { port: number };
        s.close(() => resolve(addr.port));
      });
    });
  });
}

/**
 * login.ts — zazig login
 *
 * Sends a magic link to the user's email. A local HTTP callback server
 * captures the auth tokens and stores them in ~/.zazigv2/credentials.json.
 * Company context comes from user_companies at runtime, not at login time.
 */

import * as http from "node:http";
import { URL } from "node:url";
import { createInterface } from "node:readline/promises";
import { saveCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

export async function login(): Promise<void> {
  const supabaseUrl = process.env["SUPABASE_URL"] ?? DEFAULT_SUPABASE_URL;
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;

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

  // 2. Find an available port
  const port = await findAvailablePort(54321);

  // 3. Start local callback server
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

  // 4. Send magic link
  const redirectTo = `http://localhost:${port}/callback`;

  const resp = await fetch(`${supabaseUrl}/auth/v1/magiclink`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({ email, redirect_to: redirectTo }),
  });

  if (!resp.ok) {
    server.close();
    console.error(`Failed to send magic link (HTTP ${resp.status}).`);
    process.exit(1);
  }

  console.log(
    `Magic link sent to ${email} — check your email and click the link to log in.`
  );

  // 5. Wait for callback (timeout after 5 minutes)
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

  // 6. Save credentials — no company selection at login time
  saveCredentials({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    email,
    supabaseUrl,
  });

  console.log(`Logged in as ${email}`);
}

function findAvailablePort(preferredPort: number): Promise<number> {
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

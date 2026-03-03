/**
 * login.ts — zazig login
 *
 * Sends a 6-digit OTP code to the user's email. The user enters the code
 * in the terminal to complete authentication. Tokens are stored in
 * ~/.zazigv2/credentials.json. Company context comes from user_companies
 * at runtime, not at login time.
 */

import { createInterface } from "node:readline/promises";
import { saveCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

export async function login(): Promise<void> {
  const supabaseUrl = process.env["SUPABASE_URL"] ?? DEFAULT_SUPABASE_URL;
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  let email: string;
  try {
    email = (await rl.question("Email address: ")).trim();
  } catch {
    rl.close();
    console.error("Email is required.");
    process.exit(1);
    return;
  }

  if (!email) {
    rl.close();
    console.error("Email is required.");
    process.exit(1);
  }

  // 1. Send OTP code via email
  const otpResp = await fetch(`${supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({ email }),
  });

  if (!otpResp.ok) {
    rl.close();
    const body = await otpResp.text();
    console.error(`Failed to send login code (HTTP ${otpResp.status}): ${body}`);
    process.exit(1);
  }

  console.log(`\nLogin code sent to ${email} — check your email.`);

  // 2. Prompt for the 6-digit code
  let code: string;
  try {
    code = (await rl.question("Enter code: ")).trim();
  } catch {
    rl.close();
    console.error("Code entry cancelled.");
    process.exit(1);
    return;
  } finally {
    rl.close();
  }

  if (!code) {
    console.error("Code is required.");
    process.exit(1);
  }

  // 3. Verify the OTP code
  const verifyResp = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({
      email,
      token: code,
      type: "email",
    }),
  });

  if (!verifyResp.ok) {
    const body = await verifyResp.text();
    console.error(`Verification failed (HTTP ${verifyResp.status}): ${body}`);
    process.exit(1);
  }

  const session = (await verifyResp.json()) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!session.access_token || !session.refresh_token) {
    console.error("Verification succeeded but no tokens received.");
    process.exit(1);
  }

  // 4. Save credentials
  saveCredentials({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    email,
    supabaseUrl,
  });

  console.log(`Logged in as ${email}`);
}

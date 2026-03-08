#!/usr/bin/env node

/**
 * zazig-staging — CLI entry point for staging environment.
 *
 * Identical to zazig but forces ZAZIG_ENV=staging and uses
 * staging Doppler config for Supabase credentials.
 *
 * TODO: If a dedicated staging promote/push flow is added, register pushed
 * versions in agent_versions with env: "staging" to mirror production promote.
 */

// Set environment before any imports
process.env["ZAZIG_ENV"] = "staging";
process.env["SUPABASE_URL"] = "https://ymgjtrbrvhezxpwjuhbu.supabase.co";
process.env["SUPABASE_ANON_KEY"] =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltZ2p0cmJydmhlenhwd2p1aGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MzE0ODksImV4cCI6MjA4ODEwNzQ4OX0.tIWVnC87cJMVzZILdkKzfPckTQhx6xt95JPhfwzSWR0";

// Delegate to the main CLI
await import("./index.js");

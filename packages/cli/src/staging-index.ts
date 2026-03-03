#!/usr/bin/env node

/**
 * zazig-staging — CLI entry point for staging environment.
 *
 * Identical to zazig but forces ZAZIG_ENV=staging and uses
 * staging Doppler config for Supabase credentials.
 */

// Set environment before any imports
process.env["ZAZIG_ENV"] = "staging";

// Delegate to the main CLI
await import("./index.js");

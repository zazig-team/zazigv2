# Playwright MCP Browser Testing for Claude Code

**Date:** 2026-03-08
**Tags:** Playwright, MCP, browser testing, permissions, Claude Code, Supabase auth, magic link, RLS debugging

## Problem

Debugging Supabase RLS issues required testing with a real authenticated browser session. The Management API runs as superuser (bypasses RLS), making SQL console tests unreliable. We needed Claude Code to drive a browser, authenticate, and test queries — ideally running in a background loop.

## Solution: Playwright MCP Plugin

Claude Code has a built-in Playwright MCP plugin (`mcp__plugin_playwright_playwright__*`). It can navigate pages, click elements, fill forms, evaluate JavaScript, take screenshots, and read console/network logs.

### Setup

1. **First run**: Call `browser_install` to install the bundled Chromium.
2. **Chrome conflict**: If Chrome is already running, Playwright can't launch with the same user data dir. Run `rm -rf ~/Library/Caches/ms-playwright/mcp-chrome-*` to clear stale sessions.
3. **Auth with Supabase**: Use the admin API to generate a magic link, then navigate Playwright to it:

```bash
# Generate magic link (no user password needed)
curl -s -X POST "https://{ref}.supabase.co/auth/v1/admin/generate_link" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "magiclink", "email": "tom@zazig.com"}'
```

Then in Playwright: navigate to the returned `action_link`, then navigate to `/dashboard` to trigger the app route (the landing page doesn't process the auth hash).

### Required Permissions

Add ALL Playwright tools to `.claude/settings.local.json` to avoid permission prompts during background loops:

```json
{
  "permissions": {
    "allow": [
      "mcp__plugin_playwright_playwright__browser_navigate",
      "mcp__plugin_playwright_playwright__browser_take_screenshot",
      "mcp__plugin_playwright_playwright__browser_evaluate",
      "mcp__plugin_playwright_playwright__browser_click",
      "mcp__plugin_playwright_playwright__browser_type",
      "mcp__plugin_playwright_playwright__browser_wait_for",
      "mcp__plugin_playwright_playwright__browser_snapshot",
      "mcp__plugin_playwright_playwright__browser_run_code",
      "mcp__plugin_playwright_playwright__browser_install",
      "mcp__plugin_playwright_playwright__browser_console_messages",
      "mcp__plugin_playwright_playwright__browser_network_requests",
      "mcp__plugin_playwright_playwright__browser_close",
      "mcp__plugin_playwright_playwright__browser_fill_form",
      "mcp__plugin_playwright_playwright__browser_select_option",
      "mcp__plugin_playwright_playwright__browser_press_key",
      "mcp__plugin_playwright_playwright__browser_hover",
      "mcp__plugin_playwright_playwright__browser_drag",
      "mcp__plugin_playwright_playwright__browser_handle_dialog",
      "mcp__plugin_playwright_playwright__browser_file_upload",
      "mcp__plugin_playwright_playwright__browser_navigate_back",
      "mcp__plugin_playwright_playwright__browser_resize",
      "mcp__plugin_playwright_playwright__browser_tabs"
    ]
  }
}
```

### Key Tools

| Tool | Use |
|------|-----|
| `browser_snapshot` | Accessibility tree (better than screenshot for element refs) |
| `browser_evaluate` | Run JS in page context — test Supabase queries with the user's real JWT |
| `browser_console_messages` | Check for errors (level: "error") |
| `browser_network_requests` | See all API calls and status codes |
| `browser_take_screenshot` | Visual verification |

### Testing Supabase Queries via Playwright

```javascript
// Run in browser_evaluate — uses the page's real auth session
async () => {
  const token = JSON.parse(localStorage.getItem('sb-{ref}-auth-token'));
  const accessToken = token.access_token;
  const resp = await fetch('{supabase_url}/rest/v1/{table}?select=id,title&limit=3', {
    headers: {
      'apikey': '{anon_key}',
      'Authorization': 'Bearer ' + accessToken
    }
  });
  return JSON.stringify({ status: resp.status, data: await resp.json() });
}
```

## Gotchas

- **ToolSearch required**: Playwright tools are deferred — must call `ToolSearch` with `select:mcp__plugin_playwright_playwright__browser_*` before using them.
- **Chrome already running**: Kills the Playwright launch. Close Chrome or clear the MCP cache dir.
- **Landing page doesn't process auth hash**: After magic link redirect, navigate to an authenticated route like `/dashboard`.
- **Network requests can be huge**: Use Grep on the saved file rather than reading it directly.
- **`browser_snapshot` > `browser_take_screenshot`** for interaction: snapshot gives element refs for clicking/typing.

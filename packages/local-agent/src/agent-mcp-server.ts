#!/usr/bin/env node

/**
 * Zazig Agent MCP Server — stdio MCP server for agent outbound messaging.
 *
 * Gives agents a `send_message` tool to reply to external platform messages.
 * Runs as a subprocess configured via .mcp.json in the agent workspace directory.
 *
 * Environment variables (provided by executor at spawn time):
 *   SUPABASE_URL      — Supabase project URL
 *   SUPABASE_ANON_KEY — Supabase anonymous API key
 *   ZAZIG_JOB_ID      — Current job ID (optional)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "zazig-agent-mcp",
  version: "0.1.0",
});

server.tool(
  "send_message",
  "Send a reply to an external platform message (Slack, etc.) via the orchestrator",
  {
    conversation_id: z.string().describe("The opaque conversation ID from the inbound message"),
    text: z.string().describe("The message text to send"),
  },
  async ({ conversation_id, text }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required",
          },
        ],
      };
    }

    const jobId = process.env.ZAZIG_JOB_ID ?? "";

    const response = await fetch(`${supabaseUrl}/functions/v1/agent-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ conversationId: conversation_id, text, jobId }),
    });

    if (response.ok) {
      return {
        content: [{ type: "text" as const, text: "Message sent successfully." }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to send message (HTTP ${response.status}): ${errorBody}`,
        },
      ],
      isError: true,
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[zazig-agent-mcp] Fatal error:", err);
  process.exit(1);
});

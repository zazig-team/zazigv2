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

server.tool(
  "create_feature",
  "Create a new feature for a project",
  {
    title: z.string().describe("Feature title"),
    description: z.string().optional().describe("Feature description"),
    project_id: z.string().optional().describe("Project ID to associate this feature with"),
    priority: z.enum(["low", "medium", "high"]).optional().describe("Feature priority (default: medium)"),
  },
  async ({ title, description, project_id, priority }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const jobId = process.env.ZAZIG_JOB_ID ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/create-feature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ title, description, project_id, priority, job_id: jobId }),
    });

    if (response.ok) {
      const data = await response.json() as { feature_id: string };
      return {
        content: [{ type: "text" as const, text: `Feature created successfully. feature_id: ${data.feature_id}` }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to create feature (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  },
);

server.tool(
  "update_feature",
  "Update an existing feature's title, description, priority, or status. CPO may only set status to 'created' or 'ready_for_breakdown'.",
  {
    feature_id: z.string().describe("ID of the feature to update"),
    title: z.string().optional().describe("New feature title"),
    description: z.string().optional().describe("New feature description"),
    priority: z.enum(["low", "medium", "high"]).optional().describe("New priority"),
    status: z.enum(["created", "ready_for_breakdown"]).optional().describe("New status (CPO can only set 'created' or 'ready_for_breakdown')"),
  },
  async ({ feature_id, title, description, priority, status }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/update-feature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ feature_id, title, description, priority, status }),
    });

    if (response.ok) {
      return {
        content: [{ type: "text" as const, text: "Feature updated successfully." }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to update feature (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  },
);

server.tool(
  "query_projects",
  "Query projects (and optionally their features) for the current company",
  {
    company_id: z.string().optional().describe("Company ID to filter by (defaults to the current job's company)"),
    include_features: z.boolean().optional().describe("Whether to include features for each project (default: false)"),
  },
  async ({ company_id, include_features }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const jobId = process.env.ZAZIG_JOB_ID ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    // Resolve company_id from job if not provided
    let resolvedCompanyId = company_id;
    if (!resolvedCompanyId && jobId) {
      const jobResp = await fetch(
        `${supabaseUrl}/rest/v1/jobs?id=eq.${jobId}&select=company_id`,
        { headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey } },
      );
      if (jobResp.ok) {
        const jobs = await jobResp.json() as Array<{ company_id: string }>;
        resolvedCompanyId = jobs[0]?.company_id;
      }
    }

    if (!resolvedCompanyId) {
      return {
        content: [{ type: "text" as const, text: "Error: company_id could not be resolved. Provide company_id explicitly." }],
        isError: true,
      };
    }

    // Query projects
    const selectFields = include_features
      ? "id,name,description,status,features(id,title,description,priority,status)"
      : "id,name,description,status";
    const projectsResp = await fetch(
      `${supabaseUrl}/rest/v1/projects?company_id=eq.${resolvedCompanyId}&select=${encodeURIComponent(selectFields)}`,
      { headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey } },
    );

    if (!projectsResp.ok) {
      const errorBody = await projectsResp.text().catch(() => "unknown error");
      return {
        content: [{ type: "text" as const, text: `Failed to query projects (HTTP ${projectsResp.status}): ${errorBody}` }],
        isError: true,
      };
    }

    const projects = await projectsResp.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(projects, null, 2) }],
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

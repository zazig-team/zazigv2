#!/usr/bin/env node

/**
 * Zazig Agent MCP Server — stdio MCP server for agent outbound messaging.
 *
 * Gives agents a `send_message` tool to reply to external platform messages.
 * Runs as a subprocess configured via .mcp.json in the agent workspace directory.
 *
 * Environment variables (provided by executor at spawn time):
 *   SUPABASE_URL        — Supabase project URL
 *   SUPABASE_ANON_KEY   — Supabase anonymous API key
 *   ZAZIG_JOB_ID        — Current job ID (optional)
 *   ZAZIG_TMUX_SESSION  — Tmux session name (for enable_remote tool)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const server = new McpServer({
  name: "zazig-agent-mcp",
  version: "0.1.0",
});

// Server-side tool access control.
// ZAZIG_ALLOWED_TOOLS unset → backward compat, all tools allowed (logs warning).
// ZAZIG_ALLOWED_TOOLS="" → empty Set → all tools rejected (safe default for zero-tool roles).
const ALLOWED_TOOLS_ENV = process.env.ZAZIG_ALLOWED_TOOLS;
const allowedTools: Set<string> | null = ALLOWED_TOOLS_ENV !== undefined
  ? new Set(ALLOWED_TOOLS_ENV.split(",").filter(Boolean))
  : null;
if (allowedTools === null) {
  console.warn("[zazig-agent-mcp] ZAZIG_ALLOWED_TOOLS not set — all tools allowed (backward compat)");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolHandler = (args: any) => Promise<any>;
function guardedHandler(toolName: string, handler: ToolHandler): ToolHandler {
  return async (args) => {
    if (allowedTools !== null && !allowedTools.has(toolName)) {
      return {
        content: [{ type: "text", text: `Access denied: tool "${toolName}" is not allowed for this role.` }],
        isError: true,
      };
    }
    return handler(args);
  };
}

server.tool(
  "send_message",
  "Send a reply to an external platform message (Slack, etc.) via the orchestrator",
  {
    conversation_id: z.string().describe("The opaque conversation ID from the inbound message"),
    text: z.string().describe("The message text to send"),
  },
  guardedHandler("send_message", async ({ conversation_id, text }) => {
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
  }),
);

server.tool(
  "enable_remote",
  "Enable remote control for this Claude Code session. Returns a URL that a human can use to connect from any device.",
  {},
  guardedHandler("enable_remote", async () => {
    const sessionName = process.env.ZAZIG_TMUX_SESSION;
    if (!sessionName) {
      return {
        content: [{ type: "text", text: "Error: ZAZIG_TMUX_SESSION not set — cannot enable remote control." }],
        isError: true,
      };
    }

    try {
      // Send /remote-control command to the tmux session
      await execFileAsync("tmux", ["send-keys", "-t", sessionName, "/remote-control", "Enter"]);

      // Wait for the command to produce output
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Capture the pane output to find the URL
      const { stdout } = await execFileAsync("tmux", ["capture-pane", "-t", sessionName, "-p", "-S", "-30"]);

      // Parse the URL from the output (looks for https:// URLs)
      const urlMatch = stdout.match(/https:\/\/\S+/);
      if (!urlMatch) {
        return {
          content: [{ type: "text", text: "Remote control enabled but could not capture the URL from output. Check the tmux session manually." }],
        };
      }

      return {
        content: [{ type: "text", text: `Remote control enabled. URL: ${urlMatch[0]}` }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Failed to enable remote control: ${msg}` }],
        isError: true,
      };
    }
  }),
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
  guardedHandler("create_feature", async ({ title, description, project_id, priority }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const jobId = process.env.ZAZIG_JOB_ID ?? "";
    const companyId = process.env.ZAZIG_COMPANY_ID ?? "";

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
      body: JSON.stringify({ title, description, project_id, priority, job_id: jobId, company_id: companyId }),
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
  }),
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
    spec: z.string().optional().describe("Full feature spec (self-contained, readable by Breakdown Specialist)"),
    acceptance_tests: z.string().optional().describe("Feature-level acceptance criteria"),
    human_checklist: z.string().optional().describe("Manual verification steps for human on test server"),
  },
  guardedHandler("update_feature", async ({ feature_id, title, description, priority, status, spec, acceptance_tests, human_checklist }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const jobId = process.env.ZAZIG_JOB_ID ?? "";
    const companyId = process.env.ZAZIG_COMPANY_ID ?? "";

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
      body: JSON.stringify({ feature_id, title, description, priority, status, spec, acceptance_tests, human_checklist, job_id: jobId, company_id: companyId }),
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
  }),
);

server.tool(
  "query_projects",
  "Query projects (and optionally their features) for the current company",
  {
    company_id: z.string().optional().describe("Company ID to filter by (defaults to the current job's company)"),
    include_features: z.boolean().optional().describe("Whether to include features for each project (default: false)"),
  },
  guardedHandler("query_projects", async ({ company_id, include_features }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const jobId = process.env.ZAZIG_JOB_ID ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    // Resolve company_id: explicit param > env var > job lookup
    let resolvedCompanyId = company_id;
    if (!resolvedCompanyId) {
      resolvedCompanyId = process.env.ZAZIG_COMPANY_ID;
    }
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
  }),
);

server.tool(
  "query_features",
  "Query features for a project or fetch a single feature by ID. Used by the Breakdown Specialist to read feature specs before running jobify.",
  {
    feature_id: z.string().optional().describe("Feature UUID — returns a single feature with full detail"),
    project_id: z.string().optional().describe("Project UUID — returns all features for this project"),
    status: z.string().optional().describe("Filter by status (e.g. 'ready_for_breakdown')"),
  },
  guardedHandler("query_features", async ({ feature_id, project_id, status }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    const payload: Record<string, unknown> = {};
    if (feature_id) payload.feature_id = feature_id;
    if (project_id) payload.project_id = project_id;
    if (status) payload.status = status;

    const response = await fetch(`${supabaseUrl}/functions/v1/query-features`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json() as { features: unknown[] };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data.features, null, 2) }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to query features (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  }),
);

server.tool(
  "create_project",
  "Create a new project for a company. Used by the Project Architect when structuring an approved plan.",
  {
    company_id: z.string().describe("Company ID this project belongs to"),
    name: z.string().describe("Project name"),
    description: z.string().optional().describe("Project description"),
    status: z.enum(["active", "paused", "archived"]).optional().describe("Project status (default: active)"),
  },
  guardedHandler("create_project", async ({ company_id, name, description, status }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/create-project`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ company_id, name, description, status }),
    });

    if (response.ok) {
      const data = await response.json() as { project_id: string };
      return {
        content: [{ type: "text" as const, text: `Project created successfully. project_id: ${data.project_id}` }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to create project (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  }),
);

server.tool(
  "batch_create_features",
  "Atomically create multiple feature outlines for a project. Used by the Project Architect after decomposing a plan into features via featurify.",
  {
    project_id: z.string().describe("Parent project UUID"),
    features: z.array(z.object({
      title: z.string().describe("Feature title"),
      description: z.string().optional().describe("Brief feature outline (NOT a full spec — CPO enriches later)"),
      priority: z.enum(["low", "medium", "high"]).optional().describe("Feature priority (default: medium)"),
      depends_on_index: z.array(z.number()).optional().describe("Indexes into this array for inter-feature dependencies (informational)"),
    })).describe("Array of feature outline objects to create"),
  },
  guardedHandler("batch_create_features", async ({ project_id, features }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/batch-create-features`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ project_id, features }),
    });

    if (response.ok) {
      const data = await response.json() as { features: Array<{ feature_id: string; title: string; status: string }> };
      const summary = data.features.map((f) => `- ${f.title} (${f.feature_id}): ${f.status}`).join("\n");
      return {
        content: [{ type: "text" as const, text: `Created ${data.features.length} features:\n${summary}` }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to create features (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  }),
);

server.tool(
  "query_jobs",
  "Query jobs by job ID, feature ID, or status filter. Used by the Verification Specialist to poll job status during active acceptance testing.",
  {
    job_id: z.string().optional().describe("Job UUID — returns a single job with full detail"),
    feature_id: z.string().optional().describe("Feature UUID — returns all jobs for this feature"),
    status: z.string().optional().describe("Filter by status (e.g. 'queued', 'dispatched', 'complete')"),
  },
  guardedHandler("query_jobs", async ({ job_id, feature_id, status }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    const payload: Record<string, unknown> = {};
    if (job_id) payload.job_id = job_id;
    if (feature_id) payload.feature_id = feature_id;
    if (status) payload.status = status;

    const response = await fetch(`${supabaseUrl}/functions/v1/query-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json() as { jobs: unknown[] };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data.jobs, null, 2) }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to query jobs (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  }),
);

server.tool(
  "batch_create_jobs",
  "Atomically create multiple jobs for a feature. Used by the Breakdown Specialist after decomposing a feature via jobify. Supports temp:N references in depends_on for cross-job dependencies.",
  {
    feature_id: z.string().describe("Parent feature UUID"),
    jobs: z.array(z.object({
      title: z.string().describe("Job title"),
      spec: z.string().describe("Self-contained task description"),
      acceptance_tests: z.string().describe("Gherkin acceptance criteria with AC-{SEQ}-{NUM} IDs"),
      role: z.string().describe("Which worker type executes this (e.g. 'senior-engineer', 'junior-engineer')"),
      job_type: z.enum(["code", "infra", "design", "research", "docs", "bug", "persistent_agent", "verify", "breakdown", "combine", "deploy_to_test", "deploy_to_prod", "review"]).describe("Category of work"),
      complexity: z.enum(["simple", "medium", "complex"]).describe("Estimated effort — routes to model"),
      depends_on: z.array(z.string()).optional().describe("Dependencies — use 'temp:N' for jobs in this batch (0-based index) or UUIDs for existing jobs"),
    })).describe("Array of job objects to create"),
  },
  guardedHandler("batch_create_jobs", async ({ feature_id, jobs }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/batch-create-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ feature_id, jobs }),
    });

    if (response.ok) {
      const data = await response.json() as { jobs: Array<{ job_id: string; title: string; status: string }> };
      const summary = data.jobs.map((j) => `- ${j.title} (${j.job_id}): ${j.status}`).join("\n");
      return {
        content: [{ type: "text" as const, text: `Created ${data.jobs.length} jobs:\n${summary}` }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to create jobs (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  }),
);

server.tool(
  "execute_sql",
  "Execute a scoped SQL statement against the pipeline database. Restricted to jobs, features, agent_events, machines tables. Used by pipeline-technician for prescribed operations.",
  {
    sql: z.string().describe("The SQL statement to execute"),
    expected_affected_rows: z.number().optional().describe("Expected number of affected rows — triggers warning on mismatch"),
  },
  guardedHandler("execute_sql", async ({ sql, expected_affected_rows }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/execute-sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ sql, expected_affected_rows }),
    });

    if (response.ok) {
      const data = await response.json() as { rows: unknown[]; affected_rows: number; warning?: string };
      let text = `Rows affected: ${data.affected_rows}\nResult: ${JSON.stringify(data.rows, null, 2)}`;
      if (data.warning) text += `\n⚠️ WARNING: ${data.warning}`;
      return { content: [{ type: "text" as const, text }] };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to execute SQL (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  }),
);

// NOTE: commission_contractor disabled — re-enable when contractor pipeline is ready.
// server.tool(
//   "commission_contractor",
//   ...
// );

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[zazig-agent-mcp] Fatal error:", err);
  process.exit(1);
});

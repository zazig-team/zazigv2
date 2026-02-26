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
    spec: z.string().optional().describe("Full feature spec (self-contained, readable by Breakdown Specialist)"),
    acceptance_tests: z.string().optional().describe("Feature-level acceptance criteria"),
    human_checklist: z.string().optional().describe("Manual verification steps for human on test server"),
  },
  async ({ feature_id, title, description, priority, status, spec, acceptance_tests, human_checklist }) => {
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
  },
);

server.tool(
  "query_features",
  "Query features for a project or fetch a single feature by ID. Used by the Breakdown Specialist to read feature specs before running jobify.",
  {
    feature_id: z.string().optional().describe("Feature UUID — returns a single feature with full detail"),
    project_id: z.string().optional().describe("Project UUID — returns all features for this project"),
    status: z.string().optional().describe("Filter by status (e.g. 'ready_for_breakdown')"),
  },
  async ({ feature_id, project_id, status }) => {
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
  },
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
  async ({ company_id, name, description, status }) => {
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
  },
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
  async ({ project_id, features }) => {
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
  },
);

server.tool(
  "query_jobs",
  "Query jobs by job ID, feature ID, or status filter. Used by the Verification Specialist to poll job status during active acceptance testing.",
  {
    job_id: z.string().optional().describe("Job UUID — returns a single job with full detail"),
    feature_id: z.string().optional().describe("Feature UUID — returns all jobs for this feature"),
    status: z.string().optional().describe("Filter by status (e.g. 'queued', 'dispatched', 'complete')"),
  },
  async ({ job_id, feature_id, status }) => {
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
  },
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
      job_type: z.enum(["code", "infra", "design", "research", "docs", "bug", "persistent_agent", "verify", "breakdown", "combine", "deploy", "review"]).describe("Category of work"),
      complexity: z.enum(["simple", "medium", "complex"]).describe("Estimated effort — routes to model"),
      depends_on: z.array(z.string()).optional().describe("Dependencies — use 'temp:N' for jobs in this batch (0-based index) or UUIDs for existing jobs"),
    })).describe("Array of job objects to create"),
  },
  async ({ feature_id, jobs }) => {
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
  },
);

server.tool(
  "create_idea",
  "Create a new idea in the ideas inbox",
  {
    raw_text: z.string().describe("Raw text of the idea"),
    originator: z.string().describe("Who originated this idea"),
    source: z.enum(["terminal", "slack", "telegram", "agent", "web", "api", "monitoring"]).optional().describe("Source channel of the idea"),
    title: z.string().optional().describe("Optional title for the idea"),
    description: z.string().optional().describe("Optional description"),
    scope: z.string().optional().describe("Scope of the idea"),
    complexity: z.string().optional().describe("Estimated complexity"),
    domain: z.string().optional().describe("Domain this idea belongs to"),
    autonomy: z.string().optional().describe("Autonomy level"),
    tags: z.array(z.string()).optional().describe("Tags for the idea"),
    flags: z.array(z.string()).optional().describe("Flags for the idea"),
    clarification_notes: z.string().optional().describe("Notes requiring clarification"),
    processed_by: z.string().optional().describe("Agent or person who processed this idea"),
    source_ref: z.string().optional().describe("Reference to the source (e.g. message ID)"),
    project_id: z.string().optional().describe("Project to associate this idea with"),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Idea priority"),
    suggested_exec: z.string().optional().describe("Suggested executor for this idea"),
  },
  async ({ raw_text, originator, source, title, description, scope, complexity, domain, autonomy, tags, flags, clarification_notes, processed_by, source_ref, project_id, priority, suggested_exec }) => {
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

    const response = await fetch(`${supabaseUrl}/functions/v1/create-idea`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ raw_text, originator, source, title, description, scope, complexity, domain, autonomy, tags, flags, clarification_notes, processed_by, source_ref, project_id, priority, suggested_exec, job_id: jobId, company_id: companyId }),
    });

    if (response.ok) {
      const data = await response.json() as { idea_id: string };
      return {
        content: [{ type: "text" as const, text: `Idea created successfully. idea_id: ${data.idea_id}` }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to create idea (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  },
);

server.tool(
  "query_ideas",
  "Query ideas from the inbox with optional filters",
  {
    idea_id: z.string().optional().describe("Idea UUID — returns a single idea with full detail"),
    status: z.string().optional().describe("Filter by status (e.g. 'new', 'triaged', 'parked', 'rejected')"),
    domain: z.string().optional().describe("Filter by domain"),
    source: z.string().optional().describe("Filter by source channel"),
    priority: z.string().optional().describe("Filter by priority"),
    project_id: z.string().optional().describe("Filter by project ID"),
    search: z.string().optional().describe("Full-text search across idea content"),
    limit: z.number().optional().describe("Maximum number of ideas to return"),
  },
  async ({ idea_id, status, domain, source, priority, project_id, search, limit }) => {
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

    const response = await fetch(`${supabaseUrl}/functions/v1/query-ideas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ idea_id, status, domain, source, priority, project_id, search, limit, job_id: jobId, company_id: companyId }),
    });

    if (response.ok) {
      const data = await response.json() as { ideas: unknown[] };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data.ideas, null, 2) }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to query ideas (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  },
);

server.tool(
  "update_idea",
  "Update triage metadata on an existing idea",
  {
    idea_id: z.string().describe("ID of the idea to update"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    status: z.enum(["new", "triaged", "parked", "rejected"]).optional().describe("New status"),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("New priority"),
    suggested_exec: z.string().optional().describe("Suggested executor"),
    tags: z.array(z.string()).optional().describe("Updated tags"),
    flags: z.array(z.string()).optional().describe("Updated flags"),
    clarification_notes: z.string().optional().describe("Clarification notes"),
    triage_notes: z.string().optional().describe("Notes from triage"),
    project_id: z.string().optional().describe("Associated project ID"),
  },
  async ({ idea_id, title, description, status, priority, suggested_exec, tags, flags, clarification_notes, triage_notes, project_id }) => {
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

    const response = await fetch(`${supabaseUrl}/functions/v1/update-idea`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ idea_id, title, description, status, priority, suggested_exec, tags, flags, clarification_notes, triage_notes, project_id, job_id: jobId, company_id: companyId }),
    });

    if (response.ok) {
      return {
        content: [{ type: "text" as const, text: "Idea updated successfully." }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to update idea (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  },
);

server.tool(
  "promote_idea",
  "Promote a triaged idea to a feature, job, or research track",
  {
    idea_id: z.string().describe("ID of the idea to promote"),
    promote_to: z.enum(["feature", "job", "research"]).describe("Target type to promote the idea to"),
    project_id: z.string().optional().describe("Project to associate the promoted item with"),
    title: z.string().optional().describe("Override title for the promoted item"),
  },
  async ({ idea_id, promote_to, project_id, title }) => {
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

    const response = await fetch(`${supabaseUrl}/functions/v1/promote-idea`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ idea_id, promote_to, project_id, title, job_id: jobId, company_id: companyId }),
    });

    if (response.ok) {
      const data = await response.json() as { idea_id: string; promoted_to_type: string; promoted_to_id: string };
      return {
        content: [{ type: "text" as const, text: `Idea promoted. idea_id: ${data.idea_id}, promoted_to_type: ${data.promoted_to_type}, promoted_to_id: ${data.promoted_to_id}` }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to promote idea (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  },
);

server.tool(
  "batch_create_ideas",
  "Atomically create multiple ideas in the inbox (used by Ideaify for multi-idea splits)",
  {
    ideas: z.array(z.object({
      raw_text: z.string().describe("Raw text of the idea"),
      originator: z.string().describe("Who originated this idea"),
      source: z.enum(["terminal", "slack", "telegram", "agent", "web", "api", "monitoring"]).optional().describe("Source channel"),
      title: z.string().optional().describe("Optional title"),
      description: z.string().optional().describe("Optional description"),
      scope: z.string().optional().describe("Scope of the idea"),
      complexity: z.string().optional().describe("Estimated complexity"),
      domain: z.string().optional().describe("Domain this idea belongs to"),
      autonomy: z.string().optional().describe("Autonomy level"),
      tags: z.array(z.string()).optional().describe("Tags"),
      flags: z.array(z.string()).optional().describe("Flags"),
      clarification_notes: z.string().optional().describe("Clarification notes"),
      processed_by: z.string().optional().describe("Agent or person who processed this idea"),
      source_ref: z.string().optional().describe("Reference to the source"),
      project_id: z.string().optional().describe("Project to associate with"),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Idea priority"),
      suggested_exec: z.string().optional().describe("Suggested executor"),
    })).describe("Array of idea objects to create"),
  },
  async ({ ideas }) => {
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

    const response = await fetch(`${supabaseUrl}/functions/v1/batch-create-ideas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ ideas, job_id: jobId, company_id: companyId }),
    });

    if (response.ok) {
      const data = await response.json() as { ideas: Array<{ idea_id: string; title: string; status: string }> };
      const summary = data.ideas.map((i) => `- ${i.title} (${i.idea_id}): ${i.status}`).join("\n");
      return {
        content: [{ type: "text" as const, text: `Created ${data.ideas.length} ideas:\n${summary}` }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to create ideas (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  },
);

server.tool(
  "execute_sql",
  "Execute a scoped SQL statement against the pipeline database. Restricted to jobs, features, agent_events, machines tables. Used by pipeline-technician for prescribed operations.",
  {
    sql: z.string().describe("The SQL statement to execute"),
    expected_affected_rows: z.number().optional().describe("Expected number of affected rows — triggers warning on mismatch"),
  },
  async ({ sql, expected_affected_rows }) => {
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
  },
);

server.tool(
  "commission_contractor",
  "Commission an ephemeral contractor to perform pipeline work. Used by the CPO to dispatch Project Architects (featurify), Monitoring Agents, or Verification Specialists.",
  {
    company_id: z.string().describe("Company UUID"),
    role: z.enum(["project-architect", "monitoring-agent", "verification-specialist", "pipeline-technician"]).describe("Contractor role to commission"),
    project_id: z.string().describe("Target project UUID"),
    feature_id: z.string().optional().describe("Target feature UUID (required for verification-specialist)"),
    context: z.string().optional().describe("Additional instructions from the CPO"),
  },
  async ({ company_id, role, project_id, feature_id, context }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/commission-contractor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ company_id, role, project_id, feature_id, context }),
    });

    if (response.ok) {
      const data = await response.json() as { job_id: string; role: string; status: string };
      return {
        content: [{ type: "text" as const, text: `Contractor commissioned successfully. job_id: ${data.job_id}, role: ${data.role}, status: ${data.status}` }],
      };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to commission contractor (HTTP ${response.status}): ${errorBody}` }],
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

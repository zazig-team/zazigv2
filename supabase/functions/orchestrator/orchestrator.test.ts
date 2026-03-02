/**
 * Tests for handleJobComplete and triggerFeatureVerification.
 *
 * These tests use a mock Supabase client to verify orchestrator behavior
 * without hitting a real database.
 */

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";

// ---------------------------------------------------------------------------
// Set required env vars BEFORE importing index.ts (which reads them at top level)
// ---------------------------------------------------------------------------

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

// Stub Deno.serve so the module-level call doesn't start a server.
// deno-lint-ignore no-explicit-any
const originalServe = (Deno as any).serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (_handler: unknown) => {
  // no-op: prevent actual server from starting during tests
  return { finished: Promise.resolve(), ref: () => {}, unref: () => {}, addr: { hostname: "localhost", port: 0, transport: "tcp" as const } };
};

// Now import the functions under test after stubbing Deno.serve.
const {
  handleJobComplete,
  triggerFeatureVerification,
  handleFeatureApproved,
  handleFeatureRejected,
  triggerBreakdown,
  checkUnblockedJobs,
  notifyCPO,
  handleDeployComplete,
} = await import("./index.ts");

// Restore Deno.serve after import.
// deno-lint-ignore no-explicit-any
(Deno as any).serve = originalServe;

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

interface MockCall {
  table: string;
  method: string;
  // deno-lint-ignore no-explicit-any
  args: any[];
}

/**
 * Creates a chainable mock Supabase client that records calls and returns
 * configurable responses. Each `.from(table)` call starts a new chain.
 */
function createMockSupabase(config: {
  /** Responses for `.from(table).update(...).eq(...).eq(...)` chains */
  // deno-lint-ignore no-explicit-any
  updateResults?: Record<string, { error: any }>;
  /** Responses for `.from(table).select(...).eq(...).single()` chains */
  // deno-lint-ignore no-explicit-any
  selectSingleResults?: Record<string, { data: any; error: any }>;
  /** Responses for `.from(table).insert(...)` chains */
  // deno-lint-ignore no-explicit-any
  insertResults?: Record<string, { error: any }>;
  /** Response for `.rpc(name, args)` */
  // deno-lint-ignore no-explicit-any
  rpcResults?: Record<string, { data: any; error: any }>;
} = {}) {
  const calls: MockCall[] = [];

  // deno-lint-ignore no-explicit-any
  function makeChain(table: string): any {
    const chain = {
      // deno-lint-ignore no-explicit-any
      select(_cols: string): any {
        calls.push({ table, method: "select", args: [_cols] });
        return chain;
      },
      // deno-lint-ignore no-explicit-any
      update(payload: unknown): any {
        calls.push({ table, method: "update", args: [payload] });
        return chain;
      },
      // deno-lint-ignore no-explicit-any
      insert(payload: unknown): any {
        calls.push({ table, method: "insert", args: [payload] });
        const key = `${table}:insert`;
        return config.insertResults?.[key] ?? { error: null };
      },
      // deno-lint-ignore no-explicit-any
      eq(_col: string, _val: unknown): any {
        calls.push({ table, method: "eq", args: [_col, _val] });
        return chain;
      },
      // deno-lint-ignore no-explicit-any
      single(): any {
        calls.push({ table, method: "single", args: [] });
        const key = `${table}:single`;
        return config.selectSingleResults?.[key] ?? { data: null, error: null };
      },
    };

    // When the chain ends at update().eq().eq() (no .single()), return update result.
    // We use a Proxy to intercept the final property access or call.
    // For simplicity, override eq to return the update result after recording.
    const updateKey = `${table}:update`;
    const updateResult = config.updateResults?.[updateKey] ?? { error: null };

    // Return a proxy-like chain that resolves update results on terminal calls
    return new Proxy(chain, {
      get(target, prop) {
        if (prop === "then") {
          // Make it awaitable — resolve with update result when used in await context
          return undefined;
        }
        // deno-lint-ignore no-explicit-any
        return (target as any)[prop];
      },
    });
  }

  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [table] });
      return makeChain(table);
    },
    // deno-lint-ignore no-explicit-any
    rpc(name: string, args: any) {
      calls.push({ table: "_rpc", method: "rpc", args: [name, args] });
      const key = `rpc:${name}`;
      return config.rpcResults?.[key] ?? { data: null, error: null };
    },
    // deno-lint-ignore no-explicit-any
    channel(_name: string): any {
      return { subscribe: () => {}, unsubscribe: () => {} };
    },
  };

  return { client, calls };
}

// ---------------------------------------------------------------------------
// Better mock that tracks the full chain and returns appropriate results
// ---------------------------------------------------------------------------

interface ChainedCall {
  table: string;
  operations: { method: string; args: unknown[] }[];
}

function createSmartMockSupabase() {
  const chainedCalls: ChainedCall[] = [];
  // deno-lint-ignore no-explicit-any
  const responseMap = new Map<string, any>();

  function setResponse(pattern: string, response: unknown) {
    responseMap.set(pattern, response);
  }

  // deno-lint-ignore no-explicit-any
  function makeChain(table: string): any {
    const ops: { method: string; args: unknown[] }[] = [];
    const currentChain: ChainedCall = { table, operations: ops };
    chainedCalls.push(currentChain);

    function getPattern(): string {
      return `${table}:${ops.map((o) => o.method).join(".")}`;
    }

    // deno-lint-ignore no-explicit-any
    const chain: any = {};

    for (const method of ["select", "update", "insert", "eq", "in", "single", "maybeSingle", "filter", "order", "gt", "not", "limit", "neq", "contains", "head"]) {
      // deno-lint-ignore no-explicit-any
      chain[method] = (...args: any[]) => {
        ops.push({ method, args });
        const pattern = getPattern();
        if (responseMap.has(pattern)) {
          return responseMap.get(pattern);
        }
        return chain;
      };
    }

    return chain;
  }

  const client = {
    from(table: string) {
      return makeChain(table);
    },
    // deno-lint-ignore no-explicit-any
    rpc(name: string, args: any) {
      const call: ChainedCall = { table: "_rpc", operations: [{ method: "rpc", args: [name, args] }] };
      chainedCalls.push(call);
      const pattern = `rpc:${name}`;
      return responseMap.get(pattern) ?? { data: null, error: null };
    },
    // deno-lint-ignore no-explicit-any
    channel(_name: string): any {
      // deno-lint-ignore no-explicit-any
      const ch: any = {
        // deno-lint-ignore no-explicit-any
        subscribe(callback?: (status: string) => any) {
          if (callback) callback("SUBSCRIBED");
          return ch;
        },
        send() { return Promise.resolve("ok"); },
        unsubscribe() { return Promise.resolve(); },
        // deno-lint-ignore no-explicit-any
        on() { return ch; },
      };
      return ch;
    },
  };

  return { client, chainedCalls, setResponse };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("handleJobComplete — marks a completed job and releases its slot", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  setResponse("jobs:select.eq.single", {
    data: {
      job_type: "verify",
      context: "{}",
      feature_id: null,
      company_id: "co-1",
      project_id: "proj-1",
      branch: "feature/auth",
      result: null,
      role: "reviewer",
      slot_type: "claude_code",
    },
    error: null,
  });
  setResponse("jobs:update.eq", { error: null });

  const msg = {
    type: "job_complete" as const,
    protocolVersion: 1,
    jobId: "job-1",
    machineId: "machine-1",
    result: "Test failed: assertion error in auth module",
  };

  // deno-lint-ignore no-explicit-any
  await handleJobComplete(client as any, msg);

  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  const updateChain = jobsChains.find((c) => c.operations[0].method === "update");
  assertEquals(updateChain !== undefined, true, "Should update the job row");
  // deno-lint-ignore no-explicit-any
  const updatePayload = updateChain!.operations[0].args[0] as any;
  assertEquals(updatePayload.status, "complete");
  assertEquals(updatePayload.result, "Test failed: assertion error in auth module");
  assertEquals(updatePayload.machine_id, null);

  const rpcCalls = chainedCalls.filter((c) => c.table === "_rpc");
  const releaseCall = rpcCalls.find((c) => c.operations[0].args[0] === "release_machine_slot");
  assertEquals(releaseCall !== undefined, true, "release_machine_slot should be called");
});

Deno.test("handleJobComplete — feature-linked completion does not auto-deploy without verification context", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  setResponse("jobs:update.eq", { error: null });

  setResponse("jobs:select.eq.single", {
    data: {
      job_type: "verify",
      context: "{}",
      feature_id: "feature-1",
      company_id: "co-1",
      project_id: "proj-1",
      branch: "feature/one",
      result: null,
      role: "reviewer",
      slot_type: "claude_code",
    },
    error: null,
  });

  // checkUnblockedJobs candidate scan
  setResponse("jobs:select.eq.eq.contains", { data: [], error: null });

  const msg = {
    type: "job_complete" as const,
    protocolVersion: 1,
    jobId: "job-2",
    machineId: "machine-1",
    result: "All tests passed",
  };

  // deno-lint-ignore no-explicit-any
  await handleJobComplete(client as any, msg);

  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  const updateChain = jobsChains.find((c) => c.operations[0].method === "update");
  assertEquals(updateChain !== undefined, true, "Should mark job complete");

  // deno-lint-ignore no-explicit-any
  assertEquals((updateChain!.operations[0].args[0] as any).status, "complete");

  // No legacy verify-result RPC path
  const rpcCalls = chainedCalls.filter((c) => c.table === "_rpc");
  const allDoneCall = rpcCalls.find((c) => c.operations[0].args[0] === "all_feature_jobs_complete");
  assertEquals(allDoneCall === undefined, true);

  // No feature deploy transition for non-verification context
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length, 0, "Should not initiate test deploy");
});

Deno.test("handleJobComplete — passive verification completion initiates test deploy", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  setResponse("jobs:update.eq", { error: null });

  setResponse("jobs:select.eq.single", {
    data: {
      job_type: "verify",
      context: "{\"type\":\"feature_verification\"}",
      feature_id: "feature-99",
      company_id: "company-1",
      project_id: "proj-1",
      branch: "feature/auth-system",
      result: null,
      role: "reviewer",
      slot_type: "claude_code",
    },
    error: null,
  });

  setResponse("jobs:select.eq.eq.contains", { data: [], error: null });

  // initiateTestDeploy lookups + CAS transition
  setResponse("features:select.eq.single", {
    data: {
      project_id: "proj-1",
      company_id: "company-1",
      branch: "feature/auth-system",
      title: "Auth Feature",
    },
    error: null,
  });
  setResponse("features:update.eq.eq.select", { data: [{ id: "feature-99" }], error: null });
  setResponse("projects:select.eq.single", { data: { repo_url: "" }, error: null });
  setResponse("jobs:insert", { error: null });
  setResponse("rpc:release_machine_slot", { data: null, error: null });

  const msg = {
    type: "job_complete" as const,
    protocolVersion: 1,
    jobId: "job-3",
    machineId: "machine-1",
    result: "All tests passed",
  };

  // deno-lint-ignore no-explicit-any
  await handleJobComplete(client as any, msg);

  // Feature table should be accessed (select details + update status)
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length >= 2, true, "Should have feature update + select chains");

  // First feature chain: select details
  assertEquals(featureChains[0].operations[0].method, "select");
  // Second feature chain: CAS update status to verifying
  assertEquals(featureChains[1].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((featureChains[1].operations[0].args[0] as any).status, "deploying_to_test");

  // Jobs should include completion update and deploy job insertion
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length >= 4, true, "Should include select, update, release-slot select, and deploy insert");

  // Deploy job should be queued
  const insertChain = jobsChains.find((c) => c.operations.some((o) => o.method === "insert"));
  assertEquals(insertChain !== undefined, true, "Should insert a deploy job");
  // deno-lint-ignore no-explicit-any
  const insertPayload = insertChain!.operations[0].args[0] as any;
  assertEquals(insertPayload.status, "queued");
  assertEquals(insertPayload.role, "test-deployer");
  assertEquals(insertPayload.job_type, "deploy_to_test");
  assertEquals(insertPayload.feature_id, "feature-99");
  assertEquals(insertPayload.branch, "feature/auth-system");
  const context = JSON.parse(insertPayload.context);
  assertEquals(context.type, "deploy_to_test");
  assertEquals(context.featureBranch, "feature/auth-system");
  assertEquals(context.featureId, "feature-99");
});

Deno.test("handleJobComplete — reviewer NO_REPORT triggers request-feature-fix", async () => {
  const { client, setResponse } = createSmartMockSupabase();

  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    fetchCalls.push({ input, init });
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;

  try {
    setResponse("jobs:update.eq", { error: null });
    setResponse("jobs:select.eq.single", {
      data: {
        job_type: "verify",
        context: "{}",
        feature_id: "feature-no-report",
        company_id: "company-1",
        project_id: "proj-1",
        branch: "feature/no-report",
        acceptance_tests: null,
        result: null,
        role: "reviewer",
        source: "pipeline",
        machine_id: "machine-1",
        slot_type: "claude_code",
      },
      error: null,
    });
    setResponse("jobs:select.eq.eq.contains", { data: [], error: null });
    setResponse("rpc:release_machine_slot", { data: null, error: null });

    const msg = {
      type: "job_complete" as const,
      protocolVersion: 1,
      jobId: "verify-job-no-report",
      machineId: "machine-1",
      result: "NO_REPORT",
    };

    // deno-lint-ignore no-explicit-any
    await handleJobComplete(client as any, msg);

    assertEquals(fetchCalls.length, 1, "Should delegate NO_REPORT to request-feature-fix");
    const fetchUrl = String(fetchCalls[0].input);
    assertStringIncludes(fetchUrl, "/functions/v1/request-feature-fix");
    const fetchBody = String(fetchCalls[0].init?.body ?? "");
    assertStringIncludes(fetchBody, "\"feature_id\":\"feature-no-report\"");
    assertStringIncludes(fetchBody, "NO_REPORT");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("triggerFeatureVerification — sets feature to verifying and inserts queued job", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // select feature details
  setResponse("features:select.eq.single", {
    data: {
      status: "combining",
      branch: "feature/payment-flow",
      project_id: "proj-2",
      company_id: "company-2",
      acceptance_tests: "pytest tests/",
    },
    error: null,
  });

  // insert verification job
  setResponse("jobs:insert.select", { data: [{ id: "verify-job-2" }], error: null });
  setResponse("features:update.eq.eq.select", { data: [{ id: "feature-42" }], error: null });

  // deno-lint-ignore no-explicit-any
  await triggerFeatureVerification(client as any, "feature-42");

  // Feature update chain
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length, 2, "Should select and then update features");

  // First: select feature details
  assertEquals(featureChains[0].operations[0].method, "select");
  // Second: CAS update to verifying
  assertEquals(featureChains[1].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((featureChains[1].operations[0].args[0] as any).status, "verifying");

  // Job insert
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 1);
  assertEquals(jobsChains[0].operations[0].method, "insert");

  // deno-lint-ignore no-explicit-any
  const payload = jobsChains[0].operations[0].args[0] as any;
  assertEquals(payload.company_id, "company-2");
  assertEquals(payload.project_id, "proj-2");
  assertEquals(payload.feature_id, "feature-42");
  assertEquals(payload.role, "reviewer");
  assertEquals(payload.job_type, "verify");
  assertEquals(payload.complexity, "simple");
  assertEquals(payload.slot_type, "claude_code");
  assertEquals(payload.status, "queued");
  assertEquals(payload.branch, "feature/payment-flow");

  const context = JSON.parse(payload.context);
  assertEquals(context.type, "feature_verification");
  assertEquals(context.featureBranch, "feature/payment-flow");
  assertEquals(context.acceptanceTests, "pytest tests/");
});

Deno.test("triggerFeatureVerification — insert failure leaves feature status unchanged", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  setResponse("features:select.eq.single", {
    data: {
      status: "combining",
      branch: "feature/payment-flow",
      project_id: "proj-2",
      company_id: "company-2",
      acceptance_tests: "pytest tests/",
      verification_type: "passive",
    },
    error: null,
  });
  setResponse("jobs:insert.select", {
    data: null,
    error: { message: "insert failed" },
  });

  // deno-lint-ignore no-explicit-any
  await triggerFeatureVerification(client as any, "feature-42");

  const featureUpdates = chainedCalls.filter((c) =>
    c.table === "features" && c.operations.some((o) => o.method === "update")
  );
  assertEquals(featureUpdates.length, 0, "Feature must not be moved to verifying when insert fails");
});

Deno.test("handleJobComplete — always releases slot via RPC", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  setResponse("jobs:update.eq", { error: null });
  setResponse("jobs:select.eq.single", {
    data: { feature_id: null, company_id: "co-1", slot_type: "claude_code" },
    error: null,
  });
  setResponse("rpc:release_machine_slot", { data: null, error: null });

  // deno-lint-ignore no-explicit-any
  await handleJobComplete(client as any, {
    type: "job_complete",
    protocolVersion: 1,
    jobId: "verify-job-slot",
    machineId: "machine-1",
    result: "Lint errors found",
  });

  const rpcCalls = chainedCalls.filter((c) => c.table === "_rpc");
  const releaseCall = rpcCalls.find((c) => c.operations[0].args[0] === "release_machine_slot");
  assertEquals(releaseCall !== undefined, true, "release_machine_slot RPC should be called");
});

Deno.test("handleDeployComplete — stale CAS match skips Slack/event side effects", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  setResponse("features:select.eq.single", {
    data: {
      company_id: "co-1",
      project_id: "proj-1",
      title: "Feature title",
      human_checklist: "",
      spec: "",
    },
    error: null,
  });
  setResponse("features:update.eq.eq.select", {
    data: [],
    error: null,
  });

  // deno-lint-ignore no-explicit-any
  await handleDeployComplete(client as any, {
    type: "deploy_complete",
    protocolVersion: 1,
    featureId: "feat-1",
    machineId: "machine-1",
    testUrl: "https://preview.example.com",
    ephemeral: true,
  });

  const eventsChains = chainedCalls.filter((c) => c.table === "events");
  assertEquals(eventsChains.length, 0, "No feature_status_changed event should be inserted on stale CAS");
});

// ---------------------------------------------------------------------------
// handleFeatureApproved tests
// ---------------------------------------------------------------------------

Deno.test("handleFeatureApproved — feature in ready_to_test → marks deploying_to_prod, jobs complete, logs event", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // 1. Fetch feature
  setResponse("features:select.eq.single", {
    data: { project_id: "proj-1", company_id: "co-1", branch: "feat/auth" },
    error: null,
  });

  // 2. CAS update → success (1 row updated)
  setResponse("features:update.eq.eq.select", {
    data: [{ id: "feat-1" }],
    error: null,
  });

  // 3. Mark jobs complete
  setResponse("jobs:update.eq.not", { error: null });

  // 4. Insert event
  setResponse("events:insert", { error: null });
  // 5. Insert deploy job
  setResponse("jobs:insert", { data: [{ id: "deploy-job-1" }], error: null });

  const msg = {
    type: "feature_approved" as const,
    protocolVersion: 1,
    featureId: "feat-1",
    machineId: "machine-1",
  };

  // deno-lint-ignore no-explicit-any
  await handleFeatureApproved(client as any, msg);

  // Verify feature was updated to deploying_to_prod
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length >= 2, true, "Should have select + update on features");

  // First chain: select feature details
  assertEquals(featureChains[0].operations[0].method, "select");

  // Second chain: CAS update to deploying_to_prod
  assertEquals(featureChains[1].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((featureChains[1].operations[0].args[0] as any).status, "deploying_to_prod");

  // Jobs table: mark jobs complete + enqueue prod deploy job
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 2, "Should update jobs and insert deploy job");
  // deno-lint-ignore no-explicit-any
  assertEquals((jobsChains[0].operations[0].args[0] as any).status, "complete");
  // deno-lint-ignore no-explicit-any
  const deployPayload = jobsChains[1].operations[0].args[0] as any;
  assertEquals(deployPayload.job_type, "deploy_to_prod");
  assertEquals(deployPayload.role, "deployer");
  assertEquals(deployPayload.status, "queued");
  assertEquals(JSON.parse(deployPayload.context).target, "prod");

  // Events table: log approval
  const eventsChains = chainedCalls.filter((c) => c.table === "events");
  assertEquals(eventsChains.length, 1, "Should insert event");
  assertEquals(eventsChains[0].operations[0].method, "insert");
  // deno-lint-ignore no-explicit-any
  const eventPayload = eventsChains[0].operations[0].args[0] as any;
  assertEquals(eventPayload.event_type, "feature_status_changed");
  assertEquals(eventPayload.detail.reason, "human_approved");
});

Deno.test("handleFeatureApproved — feature NOT in ready_to_test (CAS guard) → no-op", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Fetch feature succeeds
  setResponse("features:select.eq.single", {
    data: { project_id: "proj-1", company_id: "co-1", branch: "feat/x" },
    error: null,
  });

  // CAS update → 0 rows (feature not in ready_to_test)
  setResponse("features:update.eq.eq.select", {
    data: [],
    error: null,
  });

  const msg = {
    type: "feature_approved" as const,
    protocolVersion: 1,
    featureId: "feat-2",
    machineId: "machine-1",
  };

  // deno-lint-ignore no-explicit-any
  await handleFeatureApproved(client as any, msg);

  // Should NOT touch jobs or events
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 0, "Should not update jobs when CAS fails");

  const eventsChains = chainedCalls.filter((c) => c.table === "events");
  assertEquals(eventsChains.length, 0, "Should not insert event when CAS fails");
});

Deno.test("handleFeatureApproved — queues a prod deployer job after approval", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  setResponse("features:select.eq.single", {
    data: { project_id: "proj-1", company_id: "co-1", branch: "feat/prod" },
    error: null,
  });
  setResponse("features:update.eq.eq.select", { data: [{ id: "feat-prod" }], error: null });
  setResponse("jobs:update.eq.not", { error: null });
  setResponse("events:insert", { error: null });
  setResponse("jobs:insert", { data: [{ id: "deploy-job-2" }], error: null });

  // deno-lint-ignore no-explicit-any
  await handleFeatureApproved(client as any, {
    type: "feature_approved",
    protocolVersion: 1,
    featureId: "feat-prod",
    machineId: "machine-1",
  });

  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 2);
  const deployInsert = jobsChains.find((c) => c.operations[0].method === "insert");
  assertEquals(deployInsert !== undefined, true);
  // deno-lint-ignore no-explicit-any
  const payload = deployInsert!.operations[0].args[0] as any;
  assertEquals(payload.job_type, "deploy_to_prod");
  assertEquals(payload.branch, "feat/prod");
  const context = JSON.parse(payload.context);
  assertEquals(context.target, "prod");
  assertEquals(context.featureBranch, "feat/prod");
});

// ---------------------------------------------------------------------------
// handleFeatureRejected tests
// ---------------------------------------------------------------------------

Deno.test("handleFeatureRejected — severity=small → logs event, no feature update", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Fetch company_id
  setResponse("features:select.eq.single", {
    data: { company_id: "co-1" },
    error: null,
  });

  // Insert human_reply event
  setResponse("events:insert", { error: null });

  const msg = {
    type: "feature_rejected" as const,
    protocolVersion: 1,
    featureId: "feat-1",
    feedback: "Button color is off",
    severity: "small" as const,
    machineId: "machine-1",
  };

  // deno-lint-ignore no-explicit-any
  await handleFeatureRejected(client as any, msg);

  // Should log event with human_reply type
  const eventsChains = chainedCalls.filter((c) => c.table === "events");
  assertEquals(eventsChains.length, 1, "Should insert human_reply event");
  // deno-lint-ignore no-explicit-any
  const eventPayload = eventsChains[0].operations[0].args[0] as any;
  assertEquals(eventPayload.event_type, "human_reply");
  assertEquals(eventPayload.detail.severity, "small");
  assertEquals(eventPayload.detail.action, "fix_agent_in_thread");

  // Should NOT update feature status or insert jobs
  const featureUpdates = chainedCalls.filter((c) =>
    c.table === "features" && c.operations.some((o) => o.method === "update")
  );
  assertEquals(featureUpdates.length, 0, "Should not update feature status for small rejection");

  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 0, "Should not insert fix job for small rejection");
});

Deno.test("handleFeatureRejected — severity=big + in ready_to_test → resets to building, inserts fix job", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Fetch feature details
  setResponse("features:select.eq.single", {
    data: { company_id: "co-1", project_id: "proj-1", branch: "feat/auth", spec: "Build auth" },
    error: null,
  });

  // CAS update → success
  setResponse("features:update.eq.eq.select", {
    data: [{ id: "feat-1" }],
    error: null,
  });

  // Insert event
  setResponse("events:insert", { error: null });

  // Insert fix job
  setResponse("jobs:insert.select", { data: [{ id: "fix-job-1" }], error: null });

  // Queue check → empty
  setResponse("features:select.eq.eq.order.limit", { data: [], error: null });

  const msg = {
    type: "feature_rejected" as const,
    protocolVersion: 1,
    featureId: "feat-1",
    feedback: "Auth flow is completely broken",
    severity: "big" as const,
    machineId: "machine-1",
  };

  // deno-lint-ignore no-explicit-any
  await handleFeatureRejected(client as any, msg);

  // Feature should be reset to building
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  const buildingUpdate = featureChains.find((c) => {
    if (c.operations[0].method !== "update") return false;
    // deno-lint-ignore no-explicit-any
    return (c.operations[0].args[0] as any).status === "building";
  });
  assertEquals(buildingUpdate !== undefined, true, "Should reset feature to building");

  // Event should be logged
  const eventsChains = chainedCalls.filter((c) => c.table === "events");
  assertEquals(eventsChains.length, 1, "Should insert feature_status_changed event");
  // deno-lint-ignore no-explicit-any
  const eventPayload = eventsChains[0].operations[0].args[0] as any;
  assertEquals(eventPayload.event_type, "feature_status_changed");
  assertEquals(eventPayload.detail.reason, "human_rejected");
  assertEquals(eventPayload.detail.feedback, "Auth flow is completely broken");

  // Fix job should be inserted
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 1, "Should insert fix job");
  // deno-lint-ignore no-explicit-any
  const jobPayload = jobsChains[0].operations[0].args[0] as any;
  assertEquals(jobPayload.role, "engineer");
  assertEquals(jobPayload.status, "queued");
  assertEquals(jobPayload.rejection_feedback, "Auth flow is completely broken");
  assertEquals(jobPayload.branch, "feat/auth");
  const ctx = JSON.parse(jobPayload.context);
  assertEquals(ctx.type, "rejection_fix");
  assertEquals(ctx.originalSpec, "Build auth");
});

Deno.test("handleFeatureRejected — severity=big + NOT in ready_to_test (CAS guard) → no-op", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Fetch feature
  setResponse("features:select.eq.single", {
    data: { company_id: "co-1", project_id: "proj-1", branch: "feat/x", spec: "" },
    error: null,
  });

  // CAS update → 0 rows (not in ready_to_test)
  setResponse("features:update.eq.eq.select", { data: [], error: null });

  const msg = {
    type: "feature_rejected" as const,
    protocolVersion: 1,
    featureId: "feat-3",
    feedback: "Everything is wrong",
    severity: "big" as const,
    machineId: "machine-1",
  };

  // deno-lint-ignore no-explicit-any
  await handleFeatureRejected(client as any, msg);

  // Should NOT insert events or jobs
  const eventsChains = chainedCalls.filter((c) => c.table === "events");
  assertEquals(eventsChains.length, 0, "Should not insert event when CAS fails");

  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 0, "Should not insert fix job when CAS fails");
});

Deno.test.ignore("handleFeatureRejected — severity=big + queue exists → promotes next feature", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Fetch feature
  setResponse("features:select.eq.single", {
    data: { company_id: "co-1", project_id: "proj-1", branch: "feat/y", spec: "spec", human_checklist: "" },
    error: null,
  });

  // CAS update → success
  setResponse("features:update.eq.eq.select", { data: [{ id: "feat-5" }], error: null });

  // Insert event
  setResponse("events:insert", { error: null });

  // Insert fix job
  setResponse("jobs:insert", { error: null });

  // Queue check → next feature waiting
  setResponse("features:select.eq.eq.order.limit", { data: [{ id: "next-feat" }], error: null });

  // promoteToTesting internals:
  setResponse("features:select.eq.eq.limit", { data: [], error: null });
  setResponse("features:update.eq", { error: null });

  const msg = {
    type: "feature_rejected" as const,
    protocolVersion: 1,
    featureId: "feat-5",
    feedback: "Major rework needed",
    severity: "big" as const,
    machineId: "machine-1",
  };

  // deno-lint-ignore no-explicit-any
  await handleFeatureRejected(client as any, msg);

  // Should promote next feature — look for update to "deploying_to_test"
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  const promoteUpdate = featureChains.find((c) => {
    if (c.operations[0].method !== "update") return false;
    // deno-lint-ignore no-explicit-any
    const payload = c.operations[0].args[0] as any;
    return payload.status === "deploying_to_test";
  });
  assertEquals(promoteUpdate !== undefined, true, "Should promote next feature to deploying_to_test after big rejection");
});

// ---------------------------------------------------------------------------
// Standalone job tests (jobs with no feature_id)
// ---------------------------------------------------------------------------

Deno.test("handleJobComplete — standalone completion marks complete and skips feature logic", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // update complete → success
  setResponse("jobs:update.eq", { error: null });

  // select feature_id, context, company_id → null feature_id (standalone)
  setResponse("jobs:select.eq.single", {
    data: {
      job_type: "verify",
      context: "{}",
      feature_id: null,
      company_id: "co-1",
      project_id: "proj-1",
      branch: "feature/standalone",
      result: null,
      role: "reviewer",
      slot_type: "claude_code",
    },
    error: null,
  });

  const msg = {
    type: "job_complete" as const,
    protocolVersion: 1,
    jobId: "verify-job-1",
    machineId: "machine-1",
    result: "All tests passed",
  };

  // deno-lint-ignore no-explicit-any
  await handleJobComplete(client as any, msg);

  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 3, "Should have fetch + update + release-slot lookup");

  const updateChain = jobsChains.find((c) => c.operations[0].method === "update");
  assertEquals(updateChain !== undefined, true, "Should update job to complete");
  // deno-lint-ignore no-explicit-any
  assertEquals((updateChain!.operations[0].args[0] as any).status, "complete");

  // No features table access — standalone job
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length, 0, "Should not access features table");
});

Deno.test("handleJobComplete — standalone completion writes result payload", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // update to complete → success
  setResponse("jobs:update.eq", { error: null });

  setResponse("jobs:select.eq.single", {
    data: {
      job_type: "verify",
      context: "{}",
      feature_id: null,
      company_id: "co-1",
      project_id: "proj-1",
      branch: "feature/standalone-2",
      result: null,
      role: "reviewer",
      slot_type: "claude_code",
    },
    error: null,
  });

  const msg = {
    type: "job_complete" as const,
    protocolVersion: 1,
    jobId: "verify-job-2",
    machineId: "machine-1",
    result: "Lint errors found",
  };

  // deno-lint-ignore no-explicit-any
  await handleJobComplete(client as any, msg);

  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  const updateChain = jobsChains.find((c) => c.operations[0].method === "update");
  assertEquals(updateChain !== undefined, true, "Should update job");

  // deno-lint-ignore no-explicit-any
  const updatePayload = updateChain!.operations[0].args[0] as any;
  assertEquals(updatePayload.status, "complete");
  assertEquals(updatePayload.result, "Lint errors found");
});

Deno.test("handleJobComplete — job with no feature_id → marks complete and returns early", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // update complete → success
  setResponse("jobs:update.eq", { error: null });

  // select feature_id, context, company_id → null feature_id
  setResponse("jobs:select.eq.single", {
    data: {
      job_type: "verify",
      context: "{}",
      feature_id: null,
      company_id: "co-1",
      project_id: "proj-1",
      branch: "feature/standalone-3",
      result: null,
      role: "reviewer",
      slot_type: "claude_code",
    },
    error: null,
  });

  const msg = {
    type: "job_complete" as const,
    protocolVersion: 1,
    jobId: "verify-job-3",
    machineId: "machine-1",
    result: "All tests passed",
  };

  // deno-lint-ignore no-explicit-any
  await handleJobComplete(client as any, msg);

  // Should have 3 jobs chains: fetch row, update complete, release-slot lookup
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 3, "Should have fetch + update + release-slot lookup");

  const updateChain = jobsChains.find((c) => c.operations[0].method === "update");
  assertEquals(updateChain !== undefined, true, "Should update job");
  // deno-lint-ignore no-explicit-any
  assertEquals((updateChain!.operations[0].args[0] as any).status, "complete");

  // No features table access — no feature_id means skip
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length, 0, "Should not access features table");
});

// ---------------------------------------------------------------------------
// triggerBreakdown tests
// ---------------------------------------------------------------------------

Deno.test("triggerBreakdown — creates queued breakdown job with correct context", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // 1. Fetch feature
  setResponse("features:select.eq.single", {
    data: {
      company_id: "co-1",
      project_id: "proj-1",
      title: "Add user auth",
      spec: "Implement OAuth2 login flow",
      acceptance_tests: "Users can log in via Google",
      branch: "feature/add-user-auth",
    },
    error: null,
  });

  // 2. Idempotency check — no existing breakdown job
  setResponse("jobs:select.eq.eq.in.maybeSingle", {
    data: null,
    error: null,
  });
  setResponse("jobs:select.eq.in", { data: [], error: null });

  // 3. Insert breakdown job
  setResponse("jobs:insert.select.single", {
    data: { id: "breakdown-job-1" },
    error: null,
  });

  // 4. CAS update feature status to breakdown
  setResponse("features:update.eq.eq", { error: null });

  // deno-lint-ignore no-explicit-any
  await triggerBreakdown(client as any, "feat-10");

  // Verify feature was fetched
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length, 2, "Should fetch feature + update status");

  // First chain: select feature details
  assertEquals(featureChains[0].operations[0].method, "select");

  // Second chain: CAS update to breakdown
  assertEquals(featureChains[1].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((featureChains[1].operations[0].args[0] as any).status, "breakdown");

  // Verify breakdown job was inserted
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 3, "Should have idempotency check + stale scan + insert on jobs");

  // First jobs chain: idempotency check (select)
  assertEquals(jobsChains[0].operations[0].method, "select");

  // Insert chain: breakdown job
  const insertChain = jobsChains.find((c) => c.operations[0].method === "insert");
  assertEquals(insertChain !== undefined, true, "Should insert a breakdown job");
  // deno-lint-ignore no-explicit-any
  const payload = insertChain!.operations[0].args[0] as any;
  assertEquals(payload.company_id, "co-1");
  assertEquals(payload.project_id, "proj-1");
  assertEquals(payload.feature_id, "feat-10");
  assertEquals(payload.role, "breakdown-specialist");
  assertEquals(payload.job_type, "breakdown");
  assertEquals(payload.status, "queued");

  const context = JSON.parse(payload.context);
  assertEquals(context.type, "breakdown");
  assertEquals(context.featureId, "feat-10");
  assertEquals(context.title, "Add user auth");
  assertEquals(context.spec, "Implement OAuth2 login flow");
  assertEquals(context.acceptance_tests, "Users can log in via Google");
});

Deno.test("triggerBreakdown — idempotent: skips if active breakdown job exists", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // 1. Fetch feature
  setResponse("features:select.eq.single", {
    data: {
      company_id: "co-1",
      project_id: "proj-1",
      title: "Add payments",
      spec: "Stripe integration",
      acceptance_tests: "Can charge a card",
      branch: "feature/add-payments",
    },
    error: null,
  });

  // 2. Idempotency check — existing active breakdown job found
  setResponse("jobs:select.eq.eq.in.maybeSingle", {
    data: { id: "existing-breakdown-99", status: "queued" },
    error: null,
  });

  // deno-lint-ignore no-explicit-any
  await triggerBreakdown(client as any, "feat-20");

  // Should NOT insert a new job or update feature
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 1, "Should only have the idempotency check, no insert");
  assertEquals(jobsChains[0].operations[0].method, "select", "Should be the select for idempotency check");

  // Should NOT update feature status
  const featureUpdates = chainedCalls.filter(
    (c) => c.table === "features" && c.operations.some((o) => o.method === "update")
  );
  assertEquals(featureUpdates.length, 0, "Should not update feature when breakdown already exists");
});

// ---------------------------------------------------------------------------
// checkUnblockedJobs tests
// ---------------------------------------------------------------------------

Deno.test("checkUnblockedJobs — all deps complete → logs unblocked", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Candidates query: jobs that depend on the completed job
  setResponse("jobs:select.eq.eq.contains", {
    data: [{ id: "job-A", depends_on: ["job-X", "job-Y"] }],
    error: null,
  });

  // Dep status query: all deps are complete/done
  setResponse("jobs:select.in", {
    data: [
      { id: "job-X", status: "complete" },
      { id: "job-Y", status: "complete" },
    ],
    error: null,
  });

  // deno-lint-ignore no-explicit-any
  await checkUnblockedJobs(client as any, "feature-1", "job-X");

  // Verify candidate query was made
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 2, "Should have candidate query + dep status query");

  // First chain: select candidates with contains
  assertEquals(jobsChains[0].operations[0].method, "select");
  const containsOp = jobsChains[0].operations.find((o) => o.method === "contains");
  assertEquals(containsOp !== undefined, true, "Should have contains filter for depends_on");

  // Second chain: select dep statuses with in
  assertEquals(jobsChains[1].operations[0].method, "select");
  const inOp = jobsChains[1].operations.find((o) => o.method === "in");
  assertEquals(inOp !== undefined, true, "Should have in filter for dep IDs");
});

Deno.test("checkUnblockedJobs — partial deps incomplete → stays blocked", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Candidates query
  setResponse("jobs:select.eq.eq.contains", {
    data: [{ id: "job-A", depends_on: ["job-X", "job-Y"] }],
    error: null,
  });

  // Dep status query: one dep still executing
  setResponse("jobs:select.in", {
    data: [
      { id: "job-X", status: "complete" },
      { id: "job-Y", status: "executing" },
    ],
    error: null,
  });

  // deno-lint-ignore no-explicit-any
  await checkUnblockedJobs(client as any, "feature-1", "job-X");

  // Both queries should still be made
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 2, "Should have candidate query + dep status query");

  // Candidate query
  assertEquals(jobsChains[0].operations[0].method, "select");
  const containsOp = jobsChains[0].operations.find((o) => o.method === "contains");
  assertEquals(containsOp !== undefined, true, "Should query candidates with contains");

  // Dep check query
  assertEquals(jobsChains[1].operations[0].method, "select");
  const inOp = jobsChains[1].operations.find((o) => o.method === "in");
  assertEquals(inOp !== undefined, true, "Should check dep statuses with in");
});

Deno.test("checkUnblockedJobs — no candidates → early return", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Candidates query returns empty
  setResponse("jobs:select.eq.eq.contains", {
    data: [],
    error: null,
  });

  // deno-lint-ignore no-explicit-any
  await checkUnblockedJobs(client as any, "feature-1", "job-X");

  // Only the candidate query should be made, no dep status query
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 1, "Should only have the candidate query");
  assertEquals(jobsChains[0].operations[0].method, "select");
  const containsOp = jobsChains[0].operations.find((o) => o.method === "contains");
  assertEquals(containsOp !== undefined, true, "Should query candidates with contains");
});

// ---------------------------------------------------------------------------
// notifyCPO tests
// ---------------------------------------------------------------------------

Deno.test("notifyCPO — sends MessageInbound to CPO machine", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // CPO job query: found an active CPO
  setResponse("jobs:select.eq.in.eq.limit.maybeSingle", {
    data: { id: "cpo-job-1", machine_id: "machine-1" },
    error: null,
  });

  // Machine query: resolve machine name
  setResponse("machines:select.eq.single", {
    data: { name: "toms-mac" },
    error: null,
  });

  // deno-lint-ignore no-explicit-any
  await notifyCPO(client as any, "co-1", "Test notification");

  // Verify jobs query was made with role=cpo filters
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 1, "Should query jobs for active CPO");
  const eqOps = jobsChains[0].operations.filter((o) => o.method === "eq");
  const roleEq = eqOps.find((o) => o.args[0] === "role" && o.args[1] === "cpo");
  assertEquals(roleEq !== undefined, true, "Should filter by role=cpo");

  // Verify machines query was made
  const machineChains = chainedCalls.filter((c) => c.table === "machines");
  assertEquals(machineChains.length, 1, "Should query machines for CPO machine name");
  assertEquals(machineChains[0].operations[0].method, "select");
});

Deno.test("notifyCPO — no active CPO → no channel operations", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // CPO job query: no active CPO (maybeSingle returns null)
  setResponse("jobs:select.eq.in.eq.limit.maybeSingle", {
    data: null,
    error: null,
  });

  // deno-lint-ignore no-explicit-any
  await notifyCPO(client as any, "co-1", "Test");

  // Verify jobs query was made
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 1, "Should query jobs for active CPO");

  // No machines query should be made
  const machineChains = chainedCalls.filter((c) => c.table === "machines");
  assertEquals(machineChains.length, 0, "Should not query machines when no CPO found");
});

// ---------------------------------------------------------------------------
// triggerBreakdown role fix test
// ---------------------------------------------------------------------------

Deno.test("triggerBreakdown — uses breakdown-specialist role", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Fetch feature
  setResponse("features:select.eq.single", {
    data: {
      company_id: "co-1",
      project_id: "proj-1",
      title: "Test feature",
      spec: "Test spec",
      acceptance_tests: "Test AT",
    },
    error: null,
  });

  // Idempotency check — no existing breakdown job
  setResponse("jobs:select.eq.eq.in.maybeSingle", {
    data: null,
    error: null,
  });

  // Insert breakdown job
  setResponse("jobs:insert.select.single", {
    data: { id: "breakdown-job-new" },
    error: null,
  });

  // CAS update feature status
  setResponse("features:update.eq.eq", { error: null });

  // deno-lint-ignore no-explicit-any
  await triggerBreakdown(client as any, "feat-role-test");

  // Find the insert chain and verify role
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  const insertChain = jobsChains.find((c) => c.operations.some((o) => o.method === "insert"));
  assertEquals(insertChain !== undefined, true, "Should insert a breakdown job");

  // deno-lint-ignore no-explicit-any
  const payload = insertChain!.operations[0].args[0] as any;
  assertEquals(payload.role, "breakdown-specialist", "Should use breakdown-specialist role, not tech-lead or feature-breakdown-expert");
});

// ---------------------------------------------------------------------------
// handleJobComplete — active verification failure notifies CPO
// ---------------------------------------------------------------------------

Deno.test("handleJobComplete — active verification failure triggers CPO notification lookup", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // 1. Fetch completion context + slot type
  setResponse("jobs:select.eq.single", {
    data: {
      job_type: "verify",
      context: "{\"type\":\"active_feature_verification\"}",
      feature_id: "feat-notify",
      company_id: "co-notify",
      project_id: "proj-1",
      branch: "feature/notify",
      result: null,
      role: "verification-specialist",
      slot_type: "claude_code",
    },
    error: null,
  });

  // 2. Mark complete
  setResponse("jobs:update.eq", { error: null });

  // 3. notifyCPO internals: find active CPO job
  setResponse("jobs:select.eq.in.eq.limit.maybeSingle", {
    data: null, // No CPO active — notification lost (but queries still happen)
    error: null,
  });

  const msg = {
    type: "job_complete" as const,
    protocolVersion: 1,
    jobId: "job-fail-notify",
    machineId: "machine-1",
    result: "Tests failed: timeout in auth module",
  };

  // deno-lint-ignore no-explicit-any
  await handleJobComplete(client as any, msg);

  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  const updateChain = jobsChains.find((c) => c.operations[0].method === "update");
  assertEquals(updateChain !== undefined, true, "Should update completed job");
  // deno-lint-ignore no-explicit-any
  const updatePayload = updateChain!.operations[0].args[0] as any;
  assertEquals(updatePayload.status, "complete");
  assertEquals(updatePayload.result, "Tests failed: timeout in auth module");

  const cpoLookup = jobsChains.find((c) =>
    c.operations.some((o) => o.method === "in") && c.operations.some((o) => o.method === "maybeSingle")
  );
  assertEquals(cpoLookup !== undefined, true, "Should query for active CPO job");
});

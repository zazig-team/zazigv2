/**
 * Tests for handleVerifyResult and triggerFeatureVerification.
 *
 * These tests use a mock Supabase client to verify orchestrator behavior
 * without hitting a real database.
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

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

// Now import the functions under test.
import { handleVerifyResult, triggerFeatureVerification, handleFeatureApproved, handleFeatureRejected, triggerBreakdown, checkUnblockedJobs, notifyCPO } from "./index.ts";

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

Deno.test("handleVerifyResult — failed verification re-queues job for retry", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // The update().eq() chain should return { error: null }
  setResponse("jobs:update.eq", { error: null });

  const msg = {
    type: "verify_result" as const,
    protocolVersion: 1,
    jobId: "job-1",
    machineId: "machine-1",
    passed: false,
    testOutput: "Test failed: assertion error in auth module",
  };

  // deno-lint-ignore no-explicit-any
  await handleVerifyResult(client as any, msg);

  // Verify update was called on jobs table (re-queue + CPO notification lookup)
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length >= 1, true, "Should have at least the re-queue update");

  const updateOps = jobsChains[0].operations;
  // Should be: update({status: "queued", ...}).eq("id", "job-1")
  assertEquals(updateOps[0].method, "update");
  // deno-lint-ignore no-explicit-any
  const updatePayload = updateOps[0].args[0] as any;
  assertEquals(updatePayload.status, "queued");
  assertEquals(updatePayload.verify_context, "Test failed: assertion error in auth module");
  assertEquals(updatePayload.machine_id, null);

  assertEquals(updateOps[1].method, "eq");
  assertEquals(updateOps[1].args[0], "id");
  assertEquals(updateOps[1].args[1], "job-1");
});

Deno.test("handleVerifyResult — passed verification, not all jobs done, no feature trigger", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // update done → success
  setResponse("jobs:update.eq", { error: null });

  // select feature_id → returns feature_id
  setResponse("jobs:select.eq.single", {
    data: { feature_id: "feature-1" },
    error: null,
  });

  // RPC all_feature_jobs_complete → false (not all done)
  setResponse("rpc:all_feature_jobs_complete", { data: false, error: null });

  const msg = {
    type: "verify_result" as const,
    protocolVersion: 1,
    jobId: "job-2",
    machineId: "machine-1",
    passed: true,
    testOutput: "All tests passed",
  };

  // deno-lint-ignore no-explicit-any
  await handleVerifyResult(client as any, msg);

  // Should have: 1 update (mark done), 1 select (feature_id), 1 checkUnblockedJobs query, 1 rpc
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length >= 2, true, "Should have at least update + select jobs chains");

  // First chain: update status to complete
  assertEquals(jobsChains[0].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((jobsChains[0].operations[0].args[0] as any).status, "complete");

  // Second chain: select feature_id
  assertEquals(jobsChains[1].operations[0].method, "select");

  // RPC called
  const rpcCalls = chainedCalls.filter((c) => c.table === "_rpc");
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].operations[0].args[0], "all_feature_jobs_complete");

  // No features table access (triggerFeatureVerification not called)
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length, 0, "Should not trigger feature verification");
});

Deno.test("handleVerifyResult — passed, all jobs done, triggers feature verification", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // update done → success
  setResponse("jobs:update.eq", { error: null });

  // select feature_id → returns feature_id
  setResponse("jobs:select.eq.single", {
    data: { feature_id: "feature-99" },
    error: null,
  });

  // RPC all_feature_jobs_complete → true (all done!)
  setResponse("rpc:all_feature_jobs_complete", { data: true, error: null });

  // triggerFeatureVerification: CAS update feature status (returns updated row)
  setResponse("features:update.eq.not.select", { data: [{ id: "feature-99" }], error: null });

  // triggerFeatureVerification: select feature details
  setResponse("features:select.eq.single", {
    data: {
      branch: "feature/auth-system",
      project_id: "proj-1",
      company_id: "company-1",
      acceptance_tests: "run npm test",
    },
    error: null,
  });

  // triggerFeatureVerification: insert verification job
  setResponse("jobs:insert", { error: null });

  const msg = {
    type: "verify_result" as const,
    protocolVersion: 1,
    jobId: "job-3",
    machineId: "machine-1",
    passed: true,
    testOutput: "All tests passed",
  };

  // deno-lint-ignore no-explicit-any
  await handleVerifyResult(client as any, msg);

  // Feature table should be accessed (update status + select details)
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length >= 2, true, "Should have feature update + select chains");

  // First feature chain: CAS update status to verifying with .not() guard
  assertEquals(featureChains[0].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((featureChains[0].operations[0].args[0] as any).status, "verifying");
  // Verify CAS guard: .not() should be in the chain
  const notOp = featureChains[0].operations.find((o) => o.method === "not");
  assertEquals(notOp !== undefined, true, "Should have .not() CAS guard");

  // Jobs should have 4 chains: update done, select feature_id, checkUnblockedJobs query, insert verification job
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length >= 3, true, "Should have at least update + select + insert on jobs");

  // The insert chain should have the verification job
  const insertChain = jobsChains.find((c) => c.operations.some((o) => o.method === "insert"));
  assertEquals(insertChain !== undefined, true, "Should insert a verification job");
  // deno-lint-ignore no-explicit-any
  const insertPayload = insertChain!.operations[0].args[0] as any;
  assertEquals(insertPayload.status, "queued");
  assertEquals(insertPayload.role, "reviewer");
  assertEquals(insertPayload.job_type, "verify");
  assertEquals(insertPayload.feature_id, "feature-99");
  assertEquals(insertPayload.branch, "feature/auth-system");
  const context = JSON.parse(insertPayload.context);
  assertEquals(context.type, "feature_verification");
  assertEquals(context.featureBranch, "feature/auth-system");
  assertEquals(context.acceptanceTests, "run npm test");
});

Deno.test("triggerFeatureVerification — sets feature to verifying and inserts queued job", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // CAS update feature status to verifying (returns updated row)
  setResponse("features:update.eq.not.select", { data: [{ id: "feature-42" }], error: null });

  // select feature details
  setResponse("features:select.eq.single", {
    data: {
      branch: "feature/payment-flow",
      project_id: "proj-2",
      company_id: "company-2",
      acceptance_tests: "pytest tests/",
    },
    error: null,
  });

  // insert verification job
  setResponse("jobs:insert", { error: null });

  // deno-lint-ignore no-explicit-any
  await triggerFeatureVerification(client as any, "feature-42");

  // Feature update chain
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length, 2, "Should update and select from features");

  // First: CAS update status to verifying with .not() guard and .select()
  assertEquals(featureChains[0].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((featureChains[0].operations[0].args[0] as any).status, "verifying");
  assertEquals(featureChains[0].operations[1].method, "eq");
  assertEquals(featureChains[0].operations[1].args[1], "feature-42");
  // Verify CAS guard present
  const notOp = featureChains[0].operations.find((o) => o.method === "not");
  assertEquals(notOp !== undefined, true, "Should have .not() CAS guard");
  const selectOp = featureChains[0].operations.find((o) => o.method === "select");
  assertEquals(selectOp !== undefined, true, "Should have .select() for row count check");

  // Second: select feature details
  assertEquals(featureChains[1].operations[0].method, "select");

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

// ---------------------------------------------------------------------------
// handleFeatureApproved tests
// ---------------------------------------------------------------------------

Deno.test("handleFeatureApproved — feature in testing → marks done, jobs done, logs event", async () => {
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

  // 3. Mark jobs done
  setResponse("jobs:update.eq.not", { error: null });

  // 4. Insert event
  setResponse("events:insert", { error: null });

  // 5. No queued features
  setResponse("features:select.eq.eq.order.limit", { data: [], error: null });

  const msg = {
    type: "feature_approved" as const,
    protocolVersion: 1,
    featureId: "feat-1",
    machineId: "machine-1",
  };

  // deno-lint-ignore no-explicit-any
  await handleFeatureApproved(client as any, msg);

  // Verify feature was updated to done
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length >= 3, true, "Should have select + update + queue check on features");

  // First chain: select feature details
  assertEquals(featureChains[0].operations[0].method, "select");

  // Second chain: CAS update to done
  assertEquals(featureChains[1].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((featureChains[1].operations[0].args[0] as any).status, "done");

  // Jobs table: mark jobs done
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 1, "Should update jobs");
  // deno-lint-ignore no-explicit-any
  assertEquals((jobsChains[0].operations[0].args[0] as any).status, "done");

  // Events table: log approval
  const eventsChains = chainedCalls.filter((c) => c.table === "events");
  assertEquals(eventsChains.length, 1, "Should insert event");
  assertEquals(eventsChains[0].operations[0].method, "insert");
  // deno-lint-ignore no-explicit-any
  const eventPayload = eventsChains[0].operations[0].args[0] as any;
  assertEquals(eventPayload.event_type, "feature_status_changed");
  assertEquals(eventPayload.detail.reason, "human_approved");
});

Deno.test("handleFeatureApproved — feature NOT in testing (CAS guard) → no-op", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Fetch feature succeeds
  setResponse("features:select.eq.single", {
    data: { project_id: "proj-1", company_id: "co-1", branch: "feat/x" },
    error: null,
  });

  // CAS update → 0 rows (feature not in testing)
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

Deno.test("handleFeatureApproved — queue exists → calls promoteToTesting", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Fetch feature
  setResponse("features:select.eq.single", {
    data: { project_id: "proj-1", company_id: "co-1", branch: "feat/auth", human_checklist: "check" },
    error: null,
  });

  // CAS update → success
  setResponse("features:update.eq.eq.select", {
    data: [{ id: "feat-1" }],
    error: null,
  });

  // Mark jobs done
  setResponse("jobs:update.eq.not", { error: null });

  // Insert event
  setResponse("events:insert", { error: null });

  // Queue check → next feature waiting
  setResponse("features:select.eq.eq.order.limit", { data: [{ id: "next-feat" }], error: null });

  // promoteToTesting internals:
  // Check if another feature in testing (should be empty — we just moved ours to done)
  setResponse("features:select.eq.eq.limit", { data: [], error: null });
  // Update next feature to testing
  setResponse("features:update.eq", { error: null });

  const msg = {
    type: "feature_approved" as const,
    protocolVersion: 1,
    featureId: "feat-1",
    machineId: "machine-1",
  };

  // deno-lint-ignore no-explicit-any
  await handleFeatureApproved(client as any, msg);

  // promoteToTesting should have been called — look for the testing update
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  // Should have: select(fetch) + update(done CAS) + select(queue check) +
  //              select(promoteToTesting fetch) + select(promoteToTesting check testing) + update(promote to testing)
  assertEquals(featureChains.length >= 5, true, "Should have multiple feature chains including promoteToTesting");

  // Find the update chain that sets status to "testing" (promoteToTesting)
  const promoteUpdate = featureChains.find((c) => {
    if (c.operations[0].method !== "update") return false;
    // deno-lint-ignore no-explicit-any
    const payload = c.operations[0].args[0] as any;
    return payload.status === "testing";
  });
  assertEquals(promoteUpdate !== undefined, true, "Should promote next feature to testing");
});

Deno.test("handleFeatureApproved — no queue → does not call promoteToTesting", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  setResponse("features:select.eq.single", {
    data: { project_id: "proj-1", company_id: "co-1", branch: "feat/x" },
    error: null,
  });
  setResponse("features:update.eq.eq.select", { data: [{ id: "feat-1" }], error: null });
  setResponse("jobs:update.eq.not", { error: null });
  setResponse("events:insert", { error: null });

  // Queue check → empty
  setResponse("features:select.eq.eq.order.limit", { data: [], error: null });

  const msg = {
    type: "feature_approved" as const,
    protocolVersion: 1,
    featureId: "feat-1",
    machineId: "machine-1",
  };

  // deno-lint-ignore no-explicit-any
  await handleFeatureApproved(client as any, msg);

  // No promoteToTesting — should NOT have an update that sets status to "testing"
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  const promoteUpdate = featureChains.find((c) => {
    if (c.operations[0].method !== "update") return false;
    // deno-lint-ignore no-explicit-any
    const payload = c.operations[0].args[0] as any;
    return payload.status === "testing";
  });
  assertEquals(promoteUpdate, undefined, "Should NOT promote any feature when queue is empty");
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

Deno.test("handleFeatureRejected — severity=big + in testing → resets to building, inserts fix job", async () => {
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
  setResponse("jobs:insert", { error: null });

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

Deno.test("handleFeatureRejected — severity=big + NOT in testing (CAS guard) → no-op", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // Fetch feature
  setResponse("features:select.eq.single", {
    data: { company_id: "co-1", project_id: "proj-1", branch: "feat/x", spec: "" },
    error: null,
  });

  // CAS update → 0 rows (not in testing)
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

Deno.test("handleFeatureRejected — severity=big + queue exists → promotes next feature", async () => {
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

  // Should promote next feature — look for update to "testing"
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  const promoteUpdate = featureChains.find((c) => {
    if (c.operations[0].method !== "update") return false;
    // deno-lint-ignore no-explicit-any
    const payload = c.operations[0].args[0] as any;
    return payload.status === "testing";
  });
  assertEquals(promoteUpdate !== undefined, true, "Should promote next feature to testing after big rejection");
});

// ---------------------------------------------------------------------------
// Standalone job tests (jobs with no feature_id)
// ---------------------------------------------------------------------------

Deno.test("handleVerifyResult — standalone job passed → marks complete, returns early (no feature_id)", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // update complete → success
  setResponse("jobs:update.eq", { error: null });

  // select feature_id, context, company_id → null feature_id (standalone)
  setResponse("jobs:select.eq.single", {
    data: { feature_id: null, company_id: "co-1", context: "{}" },
    error: null,
  });

  const msg = {
    type: "verify_result" as const,
    protocolVersion: 1,
    jobId: "verify-job-1",
    machineId: "machine-1",
    passed: true,
    testOutput: "All tests passed",
  };

  // deno-lint-ignore no-explicit-any
  await handleVerifyResult(client as any, msg);

  // Should have: 1 update (mark complete), 1 select (feature_id+context+company_id)
  // No further processing — no feature_id means early return
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 2, "Should have update + select only (no feature processing)");

  // First chain: update to complete
  assertEquals(jobsChains[0].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((jobsChains[0].operations[0].args[0] as any).status, "complete");

  // Second chain: select feature_id and context
  assertEquals(jobsChains[1].operations[0].method, "select");

  // No features table access — standalone job
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length, 0, "Should not access features table");
});

Deno.test("handleVerifyResult — failed verification re-queues job and looks up CPO notification context", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // update to queued → success
  setResponse("jobs:update.eq", { error: null });

  // CPO notification lookup — select feature_id, company_id
  setResponse("jobs:select.eq.single", {
    data: { feature_id: null, company_id: "co-1" },
    error: null,
  });

  const msg = {
    type: "verify_result" as const,
    protocolVersion: 1,
    jobId: "verify-job-2",
    machineId: "machine-1",
    passed: false,
    testOutput: "Lint errors found",
  };

  // deno-lint-ignore no-explicit-any
  await handleVerifyResult(client as any, msg);

  // Should have: 1 update (re-queue) + 1 select (CPO notification lookup)
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length >= 1, true, "Should have at least the re-queue update chain");

  // Check it sets queued (re-queue for retry)
  // deno-lint-ignore no-explicit-any
  const updatePayload = jobsChains[0].operations[0].args[0] as any;
  assertEquals(updatePayload.status, "queued");
});

Deno.test("handleVerifyResult — job with no feature_id → marks complete and returns early", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // update complete → success
  setResponse("jobs:update.eq", { error: null });

  // select feature_id, context, company_id → null feature_id
  setResponse("jobs:select.eq.single", {
    data: { feature_id: null, context: "{}", company_id: "co-1" },
    error: null,
  });

  const msg = {
    type: "verify_result" as const,
    protocolVersion: 1,
    jobId: "verify-job-3",
    machineId: "machine-1",
    passed: true,
    testOutput: "All tests passed",
  };

  // deno-lint-ignore no-explicit-any
  await handleVerifyResult(client as any, msg);

  // Should have 2 jobs chains (update complete + select), then early return
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 2, "Should have update + select only");

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
    },
    error: null,
  });

  // 2. Idempotency check — no existing breakdown job
  setResponse("jobs:select.eq.eq.not.maybeSingle", {
    data: null,
    error: null,
  });

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
  assertEquals(jobsChains.length, 2, "Should have idempotency check + insert on jobs");

  // First jobs chain: idempotency check (select)
  assertEquals(jobsChains[0].operations[0].method, "select");

  // Second jobs chain: insert breakdown job
  assertEquals(jobsChains[1].operations[0].method, "insert");
  // deno-lint-ignore no-explicit-any
  const payload = jobsChains[1].operations[0].args[0] as any;
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
    },
    error: null,
  });

  // 2. Idempotency check — existing active breakdown job found
  setResponse("jobs:select.eq.eq.not.maybeSingle", {
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
      { id: "job-Y", status: "done" },
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
  setResponse("jobs:select.eq.eq.not.maybeSingle", {
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
// handleVerifyResult — failed verification notifies CPO
// ---------------------------------------------------------------------------

Deno.test("handleVerifyResult — failed verification fetches feature/company for CPO notification", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // 1. Re-queue the failed job (update status to queued)
  setResponse("jobs:update.eq", { error: null });

  // 2. Fetch job's feature_id and company_id for CPO notification
  setResponse("jobs:select.eq.single", {
    data: { feature_id: "feat-notify", company_id: "co-notify" },
    error: null,
  });

  // 3. Fetch feature title for notification message
  setResponse("features:select.eq.single", {
    data: { title: "Auth Feature" },
    error: null,
  });

  // 4. notifyCPO internals: find active CPO job
  setResponse("jobs:select.eq.in.eq.limit.maybeSingle", {
    data: null, // No CPO active — notification lost (but queries still happen)
    error: null,
  });

  const msg = {
    type: "verify_result" as const,
    protocolVersion: 1,
    jobId: "job-fail-notify",
    machineId: "machine-1",
    passed: false,
    testOutput: "Tests failed: timeout in auth module",
  };

  // deno-lint-ignore no-explicit-any
  await handleVerifyResult(client as any, msg);

  // Verify the re-queue update was made
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length >= 2, true, "Should have update (re-queue) + select (feature/company) + CPO lookup");

  // First chain: update to re-queue
  assertEquals(jobsChains[0].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  const updatePayload = jobsChains[0].operations[0].args[0] as any;
  assertEquals(updatePayload.status, "queued");
  assertEquals(updatePayload.verify_context, "Tests failed: timeout in auth module");

  // Second chain: select feature_id and company_id for notification
  assertEquals(jobsChains[1].operations[0].method, "select");

  // Feature table should be accessed to get the title
  const featureChains = chainedCalls.filter((c) => c.table === "features");
  assertEquals(featureChains.length, 1, "Should fetch feature title for CPO notification");
  assertEquals(featureChains[0].operations[0].method, "select");
});

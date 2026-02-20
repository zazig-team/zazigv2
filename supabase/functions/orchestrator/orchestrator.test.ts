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
import { handleVerifyResult, triggerFeatureVerification } from "./index.ts";

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

    for (const method of ["select", "update", "insert", "eq", "in", "single", "order", "gt"]) {
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
      return { subscribe: () => {}, unsubscribe: () => {} };
    },
  };

  return { client, chainedCalls, setResponse };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("handleVerifyResult — failed verification sets job to verify_failed", async () => {
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

  // Verify update was called on jobs table
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 1, "Should have exactly 1 jobs chain call");

  const updateOps = jobsChains[0].operations;
  // Should be: update({status: "verify_failed", ...}).eq("id", "job-1")
  assertEquals(updateOps[0].method, "update");
  // deno-lint-ignore no-explicit-any
  const updatePayload = updateOps[0].args[0] as any;
  assertEquals(updatePayload.status, "verify_failed");
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

  // Should have: 1 update (mark done), 1 select (feature_id), 1 rpc
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 2, "Should have 2 jobs chains (update + select)");

  // First chain: update status to done
  assertEquals(jobsChains[0].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((jobsChains[0].operations[0].args[0] as any).status, "done");

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

  // triggerFeatureVerification: update feature status
  setResponse("features:update.eq", { error: null });

  // triggerFeatureVerification: select feature details
  setResponse("features:select.eq.single", {
    data: {
      feature_branch: "feature/auth-system",
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

  // First feature chain: update status to verifying
  assertEquals(featureChains[0].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((featureChains[0].operations[0].args[0] as any).status, "verifying");

  // Jobs should have 3 chains: update done, select feature_id, insert verification job
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 3, "Should have update + select + insert on jobs");

  // The insert chain should have the verification job
  const insertChain = jobsChains.find((c) => c.operations.some((o) => o.method === "insert"));
  assertEquals(insertChain !== undefined, true, "Should insert a verification job");
  // deno-lint-ignore no-explicit-any
  const insertPayload = insertChain!.operations[0].args[0] as any;
  assertEquals(insertPayload.status, "queued");
  assertEquals(insertPayload.role, "reviewer");
  assertEquals(insertPayload.feature_id, "feature-99");
  assertEquals(insertPayload.branch, "feature/auth-system");
  const context = JSON.parse(insertPayload.context);
  assertEquals(context.type, "feature_verification");
  assertEquals(context.featureBranch, "feature/auth-system");
  assertEquals(context.acceptanceTests, "run npm test");
});

Deno.test("triggerFeatureVerification — sets feature to verifying and inserts queued job", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // update feature status to verifying
  setResponse("features:update.eq", { error: null });

  // select feature details
  setResponse("features:select.eq.single", {
    data: {
      feature_branch: "feature/payment-flow",
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

  // First: update status to verifying
  assertEquals(featureChains[0].operations[0].method, "update");
  // deno-lint-ignore no-explicit-any
  assertEquals((featureChains[0].operations[0].args[0] as any).status, "verifying");
  assertEquals(featureChains[0].operations[1].method, "eq");
  assertEquals(featureChains[0].operations[1].args[1], "feature-42");

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
  assertEquals(payload.job_type, "code");
  assertEquals(payload.complexity, "simple");
  assertEquals(payload.slot_type, "claude_code");
  assertEquals(payload.status, "queued");
  assertEquals(payload.branch, "feature/payment-flow");

  const context = JSON.parse(payload.context);
  assertEquals(context.type, "feature_verification");
  assertEquals(context.featureBranch, "feature/payment-flow");
  assertEquals(context.acceptanceTests, "pytest tests/");
});

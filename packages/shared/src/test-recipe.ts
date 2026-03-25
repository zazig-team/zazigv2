/**
 * zazig.test.yaml — Test Environment Recipe Schema
 *
 * Defines the structure of the `zazig.test.yaml` file that lives in the root
 * of a project repository. The local agent reads this file when it receives a
 * `deploy_to_test` message to determine how to deploy the feature branch to
 * a test environment.
 *
 * v1 providers: vercel, custom
 * v2 providers (deferred): supabase, expo, testflight, netlify, docker
 */

/** Provider types supported in v1. */
export type TestRecipeProvider = "vercel" | "custom";

/** How the test environment should be managed after testing. */
export type TestRecipeType = "ephemeral" | "persistent";

export interface TestRecipeDeploy {
  /** Deployment provider. */
  provider: TestRecipeProvider;
  /** Vercel project ID (required for vercel provider). */
  project_id?: string;
  /** Vercel team ID (optional for vercel provider). */
  team_id?: string;
  /** Custom deploy script path (required for custom provider). */
  script?: string;
  /** How to capture the deploy URL from a custom script. */
  url_output?: "stdout";
}

export interface TestRecipeTeardown {
  /** Teardown script path. Runs after approve/reject for ephemeral envs. */
  script?: string;
}

export interface TestRecipeHealthcheck {
  /** URL path to poll (appended to deploy URL). */
  path: string;
  /** Timeout in seconds before giving up on healthcheck. */
  timeout: number;
}

export interface TestRecipe {
  /** Human-readable name for the test environment. */
  name: string;
  /** Whether the test env is ephemeral (cleaned up) or persistent. */
  type: TestRecipeType;
  /** Deployment configuration. */
  deploy: TestRecipeDeploy;
  /** Teardown configuration. Only used for ephemeral envs. */
  teardown?: TestRecipeTeardown;
  /** Healthcheck configuration. Polls deploy URL until 200 or timeout. */
  healthcheck?: TestRecipeHealthcheck;
}

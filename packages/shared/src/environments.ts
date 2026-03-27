/**
 * zazig.environments.yaml — Environment Configuration Schema
 *
 * Defines staging and production environments for a project.
 * Lives in the project repo root. Built incrementally — agents add
 * entries when they provision infrastructure.
 *
 * v1 deploy providers: supabase, vercel, custom
 */

export type EnvironmentDeployProvider = "supabase" | "vercel" | "custom";

export interface EnvironmentDeploy {
  /** Deployment provider. */
  provider: EnvironmentDeployProvider;
  /** Supabase project ref (required for supabase provider). */
  project_ref?: string;
  /** Whether to deploy edge functions (supabase provider). */
  edge_functions?: boolean;
  /** Whether to push migrations (supabase provider). */
  migrations?: boolean;
  /** Vercel project ID (required for vercel provider). */
  project_id?: string;
  /** Vercel team ID (optional for vercel provider). */
  team_id?: string;
  /** Custom deploy script path (required for custom provider). */
  script?: string;
}

export interface EnvironmentAgentConfig {
  /** Where the local agent runs from: 'repo' (git dist/) or 'pinned' (~/.zazigv2/builds/current/). */
  source: "repo" | "pinned";
  /** Doppler config name for secrets. */
  doppler_config: string;
}

export interface EnvironmentHealthcheck {
  /** URL path to poll (appended to deploy URL). */
  path: string;
  /** Timeout in seconds. */
  timeout: number;
}

export interface EnvironmentConfig {
  deploy: EnvironmentDeploy;
  agent?: EnvironmentAgentConfig;
  healthcheck?: EnvironmentHealthcheck;
  /** Which environment must pass before promoting to this one. */
  promote_from?: string;
}

export interface EnvironmentsConfig {
  /** Project name. */
  name: string;
  /** Environment definitions keyed by name (e.g. 'staging', 'production'). */
  environments: Record<string, EnvironmentConfig>;
}

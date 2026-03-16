/**
 * Shared GitHub utilities for edge functions.
 *
 * This shim keeps imports stable while implementations remain in pipeline-utils.
 */
export { parseGitHubRepoUrl, triggerCICheck } from "./pipeline-utils.ts";

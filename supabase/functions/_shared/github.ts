/**
 * Shared GitHub utilities for edge functions.
 *
 * This shim keeps imports stable while implementations remain in pipeline-utils.
 */
export { checkPRCIStatus, parseGitHubRepoUrl } from "./pipeline-utils.ts";

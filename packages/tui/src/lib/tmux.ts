import { execFileSync } from 'node:child_process';

export const PERSISTENT_ROLES = ['cpo', 'cto', 'vpe'];

export interface AgentSession {
  role: string;
  sessionName: string;
  isAlive: boolean;
}

/**
 * Zazig session naming pattern: <machine>-<companyId>-<role>
 * e.g. macbook-550e8400-e29b-41d4-a716-446655440000-cpo
 */
const ZAZIG_SESSION_PATTERN = /^[^-]+-[0-9a-f-]+-[a-z-]+$/;

/**
 * Returns true if the role is a persistent agent (cpo, cto, vpe)
 * as opposed to an expert session (hotfix-engineer, spec-writer, etc.)
 */
export function isPersistentAgent(role: string): boolean {
  return PERSISTENT_ROLES.includes(role);
}

/**
 * Shells out to tmux to list sessions, filters for zazig naming pattern,
 * and returns AgentSession objects with role, sessionName, and isAlive fields.
 *
 * Returns an empty array if tmux is not running or has no sessions.
 */
export function listAgentSessions(): AgentSession[] {
  let output: string;
  try {
    output = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    // tmux not running or no sessions
    return [];
  }

  const lines = output.split('\n').filter(Boolean);
  const sessions: AgentSession[] = [];

  for (const sessionName of lines) {
    if (!ZAZIG_SESSION_PATTERN.test(sessionName)) {
      continue;
    }

    // Extract role: last segment(s) after machine and companyId
    // companyId is a UUID-like string: 8-4-4-4-12 hex chars joined with dashes
    // Pattern: <machine>-<uuid_with_dashes>-<role>
    // UUID portion: we look for the first segment that looks like start of UUID
    const parts = sessionName.split('-');
    // Find where the UUID-like part ends: UUID = 8-4-4-4-12 = 5 groups
    // machine is parts[0], then UUID is next 5 parts, then role is remaining
    if (parts.length < 7) {
      continue;
    }

    // machine = parts[0]
    // companyId = parts[1..5] (UUID segments)
    // role = parts[6..] joined with '-'
    const role = parts.slice(6).join('-');

    sessions.push({
      role,
      sessionName,
      // isAlive is true when the session appears in the list-sessions output
      isAlive: true,
    });
  }

  // For persistent agents not found in the tmux output, they are not alive
  // (we only return sessions that exist in tmux output with isAlive: true)
  // Dead expert sessions are excluded (not in list = isAlive false)
  // The filter above already handles this — only alive sessions are in output

  return sessions;
}

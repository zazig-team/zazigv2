export interface PersistentAgentView {
  role: string;
  sessionName: string | null;
  isRunning: boolean;
  isActive: boolean;
}

type AnyRecord = Record<string, unknown>;
type QueueTransition = (transition: () => Promise<void>) => void;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null;
}

function asRecordArray(value: unknown): AnyRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getTmuxSessionNames(status: AnyRecord): string[] {
  const rawTmuxSessions = status.tmux_sessions ?? status.tmuxSessions ?? [];
  if (!Array.isArray(rawTmuxSessions)) return [];

  const sessionNames: string[] = [];
  for (const session of rawTmuxSessions) {
    if (typeof session === 'string') {
      const name = session.trim();
      if (name.length > 0) {
        sessionNames.push(name);
      }
      continue;
    }

    if (!isRecord(session)) {
      continue;
    }

    const name =
      getString(session.session_name) ||
      getString(session.sessionName) ||
      getString(session.session) ||
      getString(session.name);
    if (name.length > 0) {
      sessionNames.push(name);
    }
  }

  return sessionNames;
}

export function derivePersistentAgents(
  status: AnyRecord,
  activeSession: string | null,
): PersistentAgentView[] {
  const persistentAgents = asRecordArray(status.persistent_agents ?? status.persistentAgents);
  const tmuxSessionNames = getTmuxSessionNames(status);

  return persistentAgents
    .map((agent, index) => {
      const role =
        getString(agent.role) ||
        getString(agent.role_name) ||
        getString(agent.roleName) ||
        `agent-${index + 1}`;
      // Prefer exact session_name from status (company-scoped), fall back to suffix match
      const exactSessionName = getString(agent.session_name) || getString(agent.sessionName);
      const roleSuffix = `-${role.toLowerCase()}`;
      const sessionName = exactSessionName
        ? (tmuxSessionNames.includes(exactSessionName) ? exactSessionName : null)
        : (tmuxSessionNames.find((name) => name.endsWith(roleSuffix)) ?? null);
      const isRunning = sessionName !== null;

      return {
        role,
        sessionName,
        isRunning,
        isActive: Boolean(sessionName && activeSession === sessionName),
      };
    })
    .filter((agent) => agent.role.length > 0);
}

export interface QueuePersistentAgentSwitchDeps {
  queueTerminalTransition: QueueTransition;
  terminalDetach: () => Promise<unknown>;
  terminalAttach: (sessionName: string) => Promise<unknown>;
  setTerminalMessage: (message: string | undefined) => void;
  setActiveSession: (sessionName: string) => void;
  activeSessionRef: { current: string | null };
}

export function queuePersistentAgentSwitch(
  agent: Pick<PersistentAgentView, 'sessionName'>,
  deps: QueuePersistentAgentSwitchDeps,
): void {
  const sessionName = agent.sessionName;
  if (!sessionName) {
    return;
  }

  deps.queueTerminalTransition(async () => {
    deps.setTerminalMessage(undefined);
    await deps.terminalDetach();
    await deps.terminalAttach(sessionName);
    deps.activeSessionRef.current = sessionName;
    deps.setActiveSession(sessionName);
  });
}

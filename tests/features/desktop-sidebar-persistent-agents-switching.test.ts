/**
 * Feature: Desktop Sidebar Lists All Permanent Agents With Switching
 * Feature ID: 434544fa-bf57-4b11-91d8-ba45b054f9e4
 *
 * Regression coverage for:
 * - Dynamic rendering of all persistent agents (no CPO-only control)
 * - Liveness dots + active highlight + disabled non-running cards
 * - Queue-driven switch behavior (detach before attach) and non-running no-op
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import PipelineColumn, {
  type PersistentAgent,
} from '../../packages/desktop/src/renderer/components/PipelineColumn';
import {
  derivePersistentAgents,
  queuePersistentAgentSwitch,
} from '../../packages/desktop/src/renderer/persistent-agents';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const PIPELINE_COLUMN = 'packages/desktop/src/renderer/components/PipelineColumn.tsx';
const APP_TSX = 'packages/desktop/src/renderer/App.tsx';

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function renderSidebar(persistentAgents: PersistentAgent[], activeSession: string | null): string {
  return renderToStaticMarkup(
    React.createElement(PipelineColumn, {
      activeSession,
      persistentAgents,
      onAgentClick: () => undefined,
      onJobClick: () => undefined,
      onWatchClick: () => undefined,
    }),
  );
}

function contextAround(html: string, text: string, radius = 900): string {
  const idx = html.indexOf(text);
  if (idx < 0) return '';
  const start = Math.max(0, idx - radius);
  const end = Math.min(html.length, idx + text.length + radius);
  return html.slice(start, end);
}

describe('AC-3-001: dynamic persistent-agent rendering and no hardcoded CPO control', () => {
  it('renders all roles from payload-derived persistent agents', () => {
    const statusPayload = {
      persistent_agents: [
        { role: 'strategy' },
        { role: 'ops-chief' },
        { role: 'qa-lead' },
      ],
      tmux_sessions: ['macbook-strategy', 'macbook-qa-lead'],
    } satisfies Record<string, unknown>;

    const persistentAgents = derivePersistentAgents(statusPayload, null);
    const html = renderSidebar(persistentAgents, null);

    expect(persistentAgents.map((agent) => agent.role)).toEqual(['strategy', 'ops-chief', 'qa-lead']);
    expect(html).toContain('strategy');
    expect(html).toContain('ops-chief');
    expect(html).toContain('qa-lead');
  });

  it('does not contain the legacy onCpoClick CPO-only control path', () => {
    const pipelineColumnContent = readRepoFile(PIPELINE_COLUMN);
    const appContent = readRepoFile(APP_TSX);

    expect(pipelineColumnContent, `File not found: ${PIPELINE_COLUMN}`).not.toBeNull();
    expect(appContent, `File not found: ${APP_TSX}`).not.toBeNull();

    expect(pipelineColumnContent).not.toMatch(/onCpoClick/);
    expect(appContent).not.toMatch(/onCpoClick/);
  });

  it('renders only payload role names (no hardcoded CPO button text)', () => {
    const statusPayload = {
      persistent_agents: [
        { role: 'architect' },
        { role: 'delivery-manager' },
      ],
      tmux_sessions: ['host-architect'],
    } satisfies Record<string, unknown>;

    const html = renderSidebar(derivePersistentAgents(statusPayload, null), null);

    expect(html).toContain('architect');
    expect(html).toContain('delivery-manager');
    expect(html).not.toContain('CPO');
  });
});

describe('AC-3-002: running/non-running and active visual semantics', () => {
  const statusPayload = {
    persistent_agents: [{ role: 'cto' }, { role: 'cso' }],
    tmux_sessions: [{ session_name: 'machine-cto' }],
  } satisfies Record<string, unknown>;

  let html: string;

  beforeAll(() => {
    html = renderSidebar(derivePersistentAgents(statusPayload, 'machine-cto'), 'machine-cto');
  });

  it('marks running agent with green liveness dot and active blue highlight', () => {
    const ctoContext = contextAround(html, '>cto<');
    expect(ctoContext).toContain('background:#22c55e');
    expect(ctoContext).toContain('aria-pressed="true"');
    expect(ctoContext).toContain('border:1px solid #2563eb');
    expect(ctoContext).toContain('cursor:pointer');
  });

  it('marks non-running agent with grey liveness dot and disabled visual state', () => {
    const csoContext = contextAround(html, '>cso<');
    expect(csoContext).toContain('background:#737d92');
    expect(csoContext).toContain('aria-pressed="false"');
    expect(csoContext).toContain('cursor:default');
    expect(csoContext).toContain('opacity:0.7');
    expect(csoContext).toContain('Not running locally');
  });
});

describe('AC-3-003: switch and no-op behavior through transition queue path', () => {
  it('queues running-agent switch with detach-then-attach and no-ops for non-running', async () => {
    const callOrder: string[] = [];
    const queuedTransitions: Array<() => Promise<void>> = [];

    const queueTerminalTransition = vi.fn((transition: () => Promise<void>) => {
      queuedTransitions.push(transition);
    });
    const terminalDetach = vi.fn(async () => {
      callOrder.push('detach');
    });
    const terminalAttach = vi.fn(async (sessionName: string) => {
      callOrder.push(`attach:${sessionName}`);
    });
    const setTerminalMessage = vi.fn();
    const setActiveSession = vi.fn();
    const activeSessionRef = { current: null as string | null };

    const runningAgent: PersistentAgent = {
      role: 'cto',
      sessionName: 'machine-cto',
      isRunning: true,
      isActive: false,
    };
    const nonRunningAgent: PersistentAgent = {
      role: 'cso',
      sessionName: null,
      isRunning: false,
      isActive: false,
    };

    queuePersistentAgentSwitch(runningAgent, {
      queueTerminalTransition,
      terminalDetach,
      terminalAttach,
      setTerminalMessage,
      setActiveSession,
      activeSessionRef,
    });

    expect(queueTerminalTransition).toHaveBeenCalledTimes(1);
    expect(terminalDetach).not.toHaveBeenCalled();
    expect(terminalAttach).not.toHaveBeenCalled();

    await queuedTransitions[0]();

    expect(callOrder).toEqual(['detach', 'attach:machine-cto']);
    expect(setActiveSession).toHaveBeenCalledWith('machine-cto');
    expect(activeSessionRef.current).toBe('machine-cto');

    queuePersistentAgentSwitch(nonRunningAgent, {
      queueTerminalTransition,
      terminalDetach,
      terminalAttach,
      setTerminalMessage,
      setActiveSession,
      activeSessionRef,
    });

    expect(queueTerminalTransition).toHaveBeenCalledTimes(1);
    expect(terminalDetach).toHaveBeenCalledTimes(1);
    expect(terminalAttach).toHaveBeenCalledTimes(1);
  });
});

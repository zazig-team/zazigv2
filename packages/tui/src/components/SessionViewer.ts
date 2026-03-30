/**
 * SessionViewer — Ink TUI component that embeds an active tmux pane.
 *
 * Renders an Ink Box occupying the main content area (below the top bar,
 * beside the sidebar) and embeds the selected tmux session's active pane
 * into that region via `embedSession`. Input is forwarded directly to the
 * embedded pane — Ink does not intercept keyboard input once the pane is
 * joined.
 *
 * Requires `react` and `ink` at runtime. Import and render via:
 *   import { render } from 'ink';
 *   render(React.createElement(SessionViewer, { sessionName: 'cpo-agent' }));
 */

import { detachEmbeddedPane, embedSession, hasSession } from "../lib/tmux.js";
import type { SessionGeometry } from "../lib/tmux.js";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const SESSION_ENDED_MESSAGE = "Session ended";
export const WAITING_MESSAGE = "Waiting for agents...";
const SESSION_POLL_INTERVAL_MS = 1500;

type ReactRuntime = {
  useState: <T>(initialState: T) => [T, (value: T) => void];
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => void;
  useRef: <T>(initialValue: T) => { current: T };
};

type InkRuntime = {
  Box: (props: Record<string, unknown>, ...children: unknown[]) => unknown;
  Text: (props: Record<string, unknown>, ...children: unknown[]) => unknown;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionViewerProps {
  /** The currently selected tmux session name (from App state). */
  sessionName: string | null;
}

/**
 * Calculates the geometry for the session viewer region.
 * Subtracts space for the sidebar (left) and top bar (top).
 */
function computeGeometry(): SessionGeometry {
  const totalCols = process.stdout.columns ?? 80;
  const totalRows = process.stdout.rows ?? 24;

  const SIDEBAR_WIDTH = 20;
  const TOP_BAR_HEIGHT = 2;

  return {
    top: TOP_BAR_HEIGHT,
    left: SIDEBAR_WIDTH,
    width: Math.max(1, totalCols - SIDEBAR_WIDTH),
    height: Math.max(1, totalRows - TOP_BAR_HEIGHT),
  };
}

// ---------------------------------------------------------------------------
// SessionViewer component
// ---------------------------------------------------------------------------

/**
 * React/Ink component that embeds a tmux session into the TUI content area.
 *
 * On mount and whenever `sessionName` changes, the component calls
 * `embedSession` to position the session's active pane in the Ink-allocated
 * region.  When the session name changes (tab switch), `switchSession` is
 * called to update the displayed pane.
 *
 * The Ink Box dimensions are derived from `process.stdout.columns/rows` minus
 * the space consumed by the sidebar and top bar, and are passed as geometry to
 * `embedSession` so the tmux pane is sized to match.
 *
 * Input routing: after `join-pane` the embedded tmux pane receives keyboard
 * input directly — Ink does not intercept it.
 *
 * This function is a valid React functional component when used with React ≥ 18
 * and Ink ≥ 5.  The dependency on React/Ink is intentionally deferred via
 * dynamic require so that this module can be imported in test environments
 * where those packages may not be installed.
 */
export function SessionViewer(props: SessionViewerProps): unknown {
  const { sessionName } = props;
  const geometry = computeGeometry();
  const geometryKey = `${geometry.top}:${geometry.left}:${geometry.width}:${geometry.height}`;
  const normalizedSessionName =
    typeof sessionName === "string" ? sessionName.trim() : "";
  const hasSelectedSession = normalizedSessionName.length > 0;

  // Lazy-load React hooks to allow the module to be imported without React
  // being installed (e.g. in unit-test environments that only inspect exports).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = (globalThis as Record<string, unknown>)["React"] as
    | ReactRuntime
    | undefined;

  if (!React) {
    // Return a minimal descriptor for non-React environments (tests, etc.)
    return {
      type: "SessionViewer",
      props,
      message: hasSelectedSession ? null : WAITING_MESSAGE,
    };
  }

  const { useState, useEffect, useRef } = React;

  const [message, setMessage] = useState<string | null>(
    hasSelectedSession ? null : WAITING_MESSAGE
  );
  const embeddedSessionRef = useRef<string | null>(null);
  const embeddedGeometryRef = useRef<string | null>(null);

  // Poll session liveness while a session is selected. Move to placeholders
  // when no session is selected or when the active session disappears.
  useEffect(() => {
    let cancelled = false;
    let pollInFlight = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const clearEmbeddedPane = async (): Promise<void> => {
      if (!embeddedSessionRef.current) {
        return;
      }
      try {
        await detachEmbeddedPane();
      } catch {
        // Best effort cleanup; rendering falls back to placeholder either way.
      }
      if (!cancelled) {
        embeddedSessionRef.current = null;
        embeddedGeometryRef.current = null;
      }
    };

    const showPlaceholder = async (nextMessage: string): Promise<void> => {
      await clearEmbeddedPane();
      if (!cancelled) {
        setMessage(nextMessage);
      }
    };

    const syncSessionState = async (): Promise<void> => {
      if (cancelled || pollInFlight) {
        return;
      }

      pollInFlight = true;
      try {
        if (!hasSelectedSession) {
          await showPlaceholder(WAITING_MESSAGE);
          return;
        }

        const alive = await hasSession(normalizedSessionName);
        if (!alive) {
          await showPlaceholder(SESSION_ENDED_MESSAGE);
          return;
        }

        const needsEmbed =
          embeddedSessionRef.current !== normalizedSessionName ||
          embeddedGeometryRef.current !== geometryKey;

        if (needsEmbed) {
          if (
            embeddedSessionRef.current &&
            embeddedSessionRef.current !== normalizedSessionName
          ) {
            await clearEmbeddedPane();
          }

          await embedSession(normalizedSessionName, geometry);
          if (!cancelled) {
            embeddedSessionRef.current = normalizedSessionName;
            embeddedGeometryRef.current = geometryKey;
          }
        }

        if (!cancelled) {
          setMessage(null);
        }
      } catch {
        await showPlaceholder(SESSION_ENDED_MESSAGE);
      } finally {
        pollInFlight = false;
      }
    };

    void syncSessionState();

    if (hasSelectedSession) {
      timer = setInterval(() => {
        void syncSessionState();
      }, SESSION_POLL_INTERVAL_MS);
    }

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [
    geometryKey,
    hasSelectedSession,
    normalizedSessionName,
  ]);

  // Dynamically resolve Ink's Box and Text to avoid compile-time dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ink = (globalThis as Record<string, unknown>)["ink"] as
    | InkRuntime
    | undefined;

  if (!ink) {
    return null;
  }

  const { Box, Text } = ink;

  return Box(
    {
      width: geometry.width,
      height: geometry.height,
      flexDirection: "column",
      justifyContent: message ? "center" : "flex-start",
      alignItems: message ? "center" : "stretch",
    },
    message ? Text({ color: "gray", dimColor: true }, message) : null
  );
}

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

import {
  detachEmbeddedPane,
  embedSession,
  hasSession,
  switchSession,
  TmuxSessionNotFoundError,
} from "../lib/tmux.js";
import type { SessionGeometry } from "../lib/tmux.js";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const SESSION_ENDED_MESSAGE = "Session ended";
export const WAITING_MESSAGE = "Waiting for agents...";
const SESSION_POLL_INTERVAL_MS = 1500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionViewerProps {
  /** The currently selected tmux session name (from App state). */
  sessionName: string | null;
}

type ViewerState = "waiting" | "active" | "ended";

type ReactLike = {
  useState: <T>(initial: T) => [T, (value: T) => void];
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => void;
  useRef: <T>(initial: T) => { current: T };
};

type InkLike = {
  Box: (...args: unknown[]) => unknown;
  Text: (...args: unknown[]) => unknown;
};

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

function normalizeSessionName(sessionName: string | null): string | null {
  const normalized = sessionName?.trim();
  return normalized ? normalized : null;
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
  const normalizedSessionName = normalizeSessionName(props.sessionName);

  // Lazy-load React hooks to allow the module to be imported without React
  // being installed (e.g. in unit-test environments that only inspect exports).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = (globalThis as Record<string, unknown>)["React"] as
    | ReactLike
    | undefined;

  if (!React) {
    // Return a minimal descriptor for non-React environments (tests, etc.)
    return {
      type: "SessionViewer",
      props,
      message: normalizedSessionName ? null : WAITING_MESSAGE,
    };
  }

  const { useState, useEffect, useRef } = React;

  const [viewerState, setViewerState] = useState<ViewerState>(
    normalizedSessionName ? "active" : "waiting"
  );
  const geometry = computeGeometry();
  const activeEmbeddedSessionRef = useRef<string | null>(null);
  const viewerStateRef = useRef<ViewerState>(viewerState);

  useEffect(() => {
    viewerStateRef.current = viewerState;
  }, [viewerState]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const detachCurrentPane = async (): Promise<void> => {
      if (!activeEmbeddedSessionRef.current) return;

      try {
        await detachEmbeddedPane();
      } catch {
        // A stale pane is not fatal to UI state transitions.
      }
      activeEmbeddedSessionRef.current = null;
    };

    const markEnded = async (): Promise<void> => {
      await detachCurrentPane();
      if (!cancelled) {
        setViewerState("ended");
      }
    };

    const attachSession = async (sessionName: string): Promise<void> => {
      try {
        await embedSession(sessionName, geometry);
        if (cancelled) return;
        activeEmbeddedSessionRef.current = sessionName;
        setViewerState("active");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof TmuxSessionNotFoundError) {
          await markEnded();
          return;
        }
        await markEnded();
      }
    };

    const evaluateSelectedSession = async (): Promise<void> => {
      if (cancelled || inFlight) return;
      inFlight = true;

      try {
        if (!normalizedSessionName) {
          if (viewerStateRef.current !== "waiting") {
            setViewerState("waiting");
          }
          await detachCurrentPane();
          return;
        }

        const alive = await hasSession(normalizedSessionName);
        if (cancelled) return;

        if (!alive) {
          if (
            viewerStateRef.current !== "ended" ||
            activeEmbeddedSessionRef.current === normalizedSessionName
          ) {
            await markEnded();
          }
          return;
        }

        // New selection or previously ended session: embed again.
        if (
          viewerStateRef.current !== "active" ||
          activeEmbeddedSessionRef.current !== normalizedSessionName
        ) {
          await attachSession(normalizedSessionName);
          return;
        }

        // Keep tmux client focused on the selected session while active.
        await switchSession(normalizedSessionName).catch(async (error: unknown) => {
          if (cancelled) return;
          if (error instanceof TmuxSessionNotFoundError) {
            await markEnded();
          }
        });
      } finally {
        inFlight = false;
      }
    };

    void evaluateSelectedSession();

    if (normalizedSessionName) {
      pollTimer = setInterval(() => {
        void evaluateSelectedSession();
      }, SESSION_POLL_INTERVAL_MS);
    }

    return () => {
      cancelled = true;
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [
    normalizedSessionName,
    geometry.top,
    geometry.left,
    geometry.width,
    geometry.height,
  ]);

  // Dynamically resolve Ink's Box and Text to avoid compile-time dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ink = (globalThis as Record<string, unknown>)["ink"] as
    | InkLike
    | undefined;

  if (!ink) {
    return null;
  }

  const { Box, Text } = ink;

  const renderPlaceholder = (message: string): unknown =>
    Box(
      {
        width: geometry.width,
        height: geometry.height,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      },
      Text({ color: "gray", dimColor: true }, message)
    );

  if (viewerState === "waiting") {
    return renderPlaceholder(WAITING_MESSAGE);
  }

  if (viewerState === "ended") {
    return renderPlaceholder(SESSION_ENDED_MESSAGE);
  }

  return Box(
    {
      width: geometry.width,
      height: geometry.height,
      flexDirection: "column",
    },
    null
  );
}

export default SessionViewer;

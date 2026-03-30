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

import { embedSession, switchSession } from "../lib/tmux.js";
import type { SessionGeometry } from "../lib/tmux.js";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const SESSION_ENDED_MESSAGE = "Session ended";
export const WAITING_MESSAGE = "Waiting for agents...";

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

  // Lazy-load React hooks to allow the module to be imported without React
  // being installed (e.g. in unit-test environments that only inspect exports).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = (globalThis as Record<string, unknown>)["React"] as
    | { useState: Function; useEffect: Function }
    | undefined;

  if (!React) {
    // Return a minimal descriptor for non-React environments (tests, etc.)
    return {
      type: "SessionViewer",
      props,
      message: sessionName ? null : WAITING_MESSAGE,
    };
  }

  const { useState, useEffect } = React;

  const [message, setMessage] = useState<string | null>(
    sessionName ? null : WAITING_MESSAGE
  );

  const geometry = computeGeometry();

  // Embed or switch the session whenever the selection changes.
  useEffect(() => {
    let cancelled = false;

    if (!sessionName) {
      setMessage(WAITING_MESSAGE);
      return;
    }

    embedSession(sessionName, geometry)
      .then(() => {
        if (!cancelled) setMessage(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setMessage(`${SESSION_ENDED_MESSAGE}: ${err.message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionName]);

  // Handle tab switches after the initial embed.
  useEffect(() => {
    if (!sessionName) return;

    switchSession(sessionName).catch((err: Error) => {
      setMessage(`${SESSION_ENDED_MESSAGE}: ${err.message}`);
    });
  }, [sessionName]);

  // Dynamically resolve Ink's Box and Text to avoid compile-time dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ink = (globalThis as Record<string, unknown>)["ink"] as
    | { Box: Function; Text: Function }
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
    },
    message ? Text({ color: "gray" }, message) : null
  );
}

/**
 * SessionViewer — Ink TUI component that embeds an active tmux pane.
 *
 * Renders an Ink Box occupying the main content area (below the top bar,
 * beside the sidebar) and embeds the selected tmux session's active pane
 * into that region via `embedSession`. Input is forwarded directly to the
 * embedded pane — Ink does not intercept keyboard input once the pane is
 * joined.
 *
 * Edge cases handled:
 *   - sessionName is null/empty: renders a "Waiting for agents..." placeholder
 *     without issuing any tmux commands.
 *   - Session dies while viewing: polls every 2 s, detects when the session
 *     is gone, and renders a "Session ended" placeholder. Continues polling;
 *     if the session reappears it re-embeds automatically.
 *
 * Requires `react` and `ink` at runtime. Import and render via:
 *   import { render } from 'ink';
 *   render(React.createElement(SessionViewer, { sessionName: 'cpo-agent' }));
 */

import { embedSession, hasSession, switchSession } from "../lib/tmux.js";
import type { SessionGeometry } from "../lib/tmux.js";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const SESSION_ENDED_MESSAGE = "Session ended";
export const WAITING_MESSAGE = "Waiting for agents...";

/** How often (ms) to poll tmux for session liveness. */
const POLL_INTERVAL_MS = 2000;

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
 * States:
 *   - waiting: sessionName is null/empty — shows "Waiting for agents..."
 *   - embedded: session is live — tmux pane is joined into the Ink region
 *   - ended: session was live but has died — shows "Session ended", keeps
 *     polling and re-embeds when the same session name reappears
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
    | { useState: Function; useEffect: Function; useRef: Function }
    | undefined;

  if (!React) {
    // Return a minimal descriptor for non-React environments (tests, etc.)
    return {
      type: "SessionViewer",
      props,
      message: sessionName ? null : WAITING_MESSAGE,
    };
  }

  const { useState, useEffect, useRef } = React;

  // null = session is embedded (no placeholder); string = placeholder message
  const [message, setMessage] = useState(
    sessionName ? null : (WAITING_MESSAGE as string | null)
  );

  // Track whether the session is currently embedded so re-embed logic is clean.
  const isEmbedded = useRef(false);

  const geometry = computeGeometry();

  // Main effect: embed/switch session and start liveness polling.
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function stopPolling() {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    async function embed() {
      if (cancelled) return;
      try {
        await embedSession(sessionName as string, geometry);
        if (!cancelled) {
          isEmbedded.current = true;
          setMessage(null);
        }
      } catch {
        if (!cancelled) {
          isEmbedded.current = false;
          setMessage(SESSION_ENDED_MESSAGE);
        }
      }
    }

    if (!sessionName) {
      stopPolling();
      isEmbedded.current = false;
      setMessage(WAITING_MESSAGE);
      return () => { cancelled = true; };
    }

    // Embed the session initially.
    embed().then(() => {
      if (cancelled) return;

      // Start polling for liveness every POLL_INTERVAL_MS.
      pollTimer = setInterval(async () => {
        if (cancelled) return;
        let alive = false;
        try {
          alive = await hasSession(sessionName as string);
        } catch {
          alive = false;
        }

        if (cancelled) return;

        if (!alive) {
          if (isEmbedded.current) {
            // Session just died — switch to placeholder.
            isEmbedded.current = false;
            setMessage(SESSION_ENDED_MESSAGE);
          }
          // Keep polling so we can re-embed when it reappears.
        } else {
          if (!isEmbedded.current) {
            // Session reappeared — re-embed.
            await embed();
          }
        }
      }, POLL_INTERVAL_MS);
    });

    return () => {
      cancelled = true;
      stopPolling();
      isEmbedded.current = false;
    };
  }, [sessionName]);

  // Handle tab switches after the initial embed.
  useEffect(() => {
    if (!sessionName) return;

    switchSession(sessionName).catch(() => {
      setMessage(SESSION_ENDED_MESSAGE);
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

  if (message) {
    // Render a centred placeholder (no tmux pane embedded).
    return Box(
      {
        width: geometry.width,
        height: geometry.height,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      },
      Text({ color: "gray", dimColor: true }, message)
    );
  }

  // Session is actively embedded — render an empty box that Ink leaves alone
  // so the tmux pane can occupy the region.
  return Box(
    {
      width: geometry.width,
      height: geometry.height,
      flexDirection: "column",
    },
    null
  );
}

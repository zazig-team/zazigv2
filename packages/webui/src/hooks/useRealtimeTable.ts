import { useEffect } from "react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface UseRealtimeTableOptions {
  table: string;
  filter?: string;
  onInsert?: (payload: Record<string, unknown>) => void;
  onUpdate?: (payload: Record<string, unknown>) => void;
  onDelete?: (payload: Record<string, unknown>) => void;
  enabled?: boolean;
}

function sanitizeChannelPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "_");
}

function payloadRow(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): Record<string, unknown> {
  if (payload.eventType === "DELETE") {
    return payload.old;
  }
  return payload.new;
}

export function useRealtimeTable(options: UseRealtimeTableOptions): void {
  const {
    table,
    filter,
    onInsert,
    onUpdate,
    onDelete,
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const channelName = `realtime:${sanitizeChannelPart(table)}:${sanitizeChannelPart(
      filter ?? "all",
    )}`;

    const baseConfig = {
      schema: "public" as const,
      table,
      filter,
    };

    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on("postgres_changes", { ...baseConfig, event: "INSERT" }, (payload) => {
        if (onInsert) {
          onInsert(payloadRow(payload));
        }
      })
      .on("postgres_changes", { ...baseConfig, event: "UPDATE" }, (payload) => {
        if (onUpdate) {
          onUpdate(payloadRow(payload));
        }
      })
      .on("postgres_changes", { ...baseConfig, event: "DELETE" }, (payload) => {
        if (onDelete) {
          onDelete(payloadRow(payload));
        }
      })
      .subscribe();

    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [enabled, filter, onDelete, onInsert, onUpdate, table]);
}

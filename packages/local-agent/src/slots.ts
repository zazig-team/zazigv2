/**
 * slots.ts — Local slot tracker
 *
 * Tracks how many execution slots are in use vs available on this machine.
 * Used by the heartbeat to report slotsAvailable to the orchestrator.
 *
 * Job execution is a separate concern (future card); this module provides
 * the read interface used by the heartbeat sender.
 */

import type { SlotType } from "@zazigv2/shared";
import type { SlotConfig } from "./config.js";

export interface SlotSnapshot {
  claude_code: number;
  codex: number;
}

export class SlotTracker {
  private readonly total: Record<SlotType, number>;
  private readonly inUse: Record<SlotType, number>;

  constructor(config: SlotConfig) {
    this.total = {
      claude_code: config.claude_code,
      codex: config.codex,
    };
    this.inUse = {
      claude_code: 0,
      codex: 0,
    };
  }

  /** Returns the number of free slots per slot type. */
  getAvailable(): SlotSnapshot {
    return {
      claude_code: Math.max(0, this.total.claude_code - this.inUse.claude_code),
      codex: Math.max(0, this.total.codex - this.inUse.codex),
    };
  }

  /** Acquire a slot; throws if none are available. For future use by job executor. */
  acquire(slotType: SlotType): void {
    const available = this.total[slotType] - this.inUse[slotType];
    if (available <= 0) {
      throw new Error(`No available slots for ${slotType}`);
    }
    this.inUse[slotType]++;
  }

  /** Try to acquire a slot. Returns true if acquired, false if at capacity. */
  tryAcquire(slotType: SlotType): boolean {
    const available = this.total[slotType] - this.inUse[slotType];
    if (available <= 0) return false;
    this.inUse[slotType]++;
    return true;
  }

  /** Release a slot previously acquired. For future use by job executor. */
  release(slotType: SlotType): void {
    if (this.inUse[slotType] > 0) {
      this.inUse[slotType]--;
    }
  }
}

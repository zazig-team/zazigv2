export interface PipelineSnapshot {
  capacity: { max: number; active: number; available: number };
  features_by_status: Record<
    string,
    Array<{
      id: string;
      title: string;
      priority: string;
      has_spec: boolean;
      tags?: string[];
      updated_at: string;
    }>
  >;
  failed_features: Array<{
    id: string;
    title: string;
    priority: string;
    fail_count: number;
    updated_at: string;
  }>;
  stuck_items: Array<{
    id: string;
    title: string;
    status: string;
    updated_at: string;
  }>;
  active_jobs: { queued: number; dispatched: number; executing: number };
}

export interface HealthSummary {
  status: 'healthy' | 'warning' | 'critical';
  totalFeatures: number;
  activeCount: number;
  backlogCount: number;
  failedCount: number;
  stuckCount: number;
  capacityUtilisation: number;
  alerts: Alert[];
}

export interface Alert {
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

const ACTIVE_STATUS_EXCEPTIONS = new Set(['created', 'complete', 'failed', 'pr_ready']);

export function analysePipelineHealth(snapshot: PipelineSnapshot): HealthSummary {
  const totalFeatures = Object.values(snapshot.features_by_status).reduce(
    (sum, features) => sum + features.length,
    0,
  );

  const activeCount = Object.entries(snapshot.features_by_status).reduce(
    (sum, [status, features]) =>
      ACTIVE_STATUS_EXCEPTIONS.has(status) ? sum : sum + features.length,
    0,
  );

  const backlogCount = snapshot.features_by_status.created?.length ?? 0;
  const failedCount = snapshot.failed_features.length;
  const stuckCount = snapshot.stuck_items.length;

  const capacityUtilisation =
    snapshot.capacity.max === 0 ? 0 : activeCount / snapshot.capacity.max;

  const alerts: Alert[] = [];

  for (const feature of snapshot.failed_features) {
    if (feature.priority === 'high' && feature.fail_count >= 2) {
      alerts.push({
        severity: 'critical',
        message: `High-priority feature "${feature.title}" has ${feature.fail_count} failures.`,
      });
    }
  }

  if (capacityUtilisation >= 1) {
    alerts.push({
      severity: 'critical',
      message: 'Pipeline capacity is at or over 100%.',
    });
  }

  if (stuckCount > 0) {
    alerts.push({
      severity: 'warning',
      message: `${stuckCount} stuck item${stuckCount === 1 ? '' : 's'} detected.`,
    });
  }

  if (failedCount > 3) {
    alerts.push({
      severity: 'warning',
      message: `${failedCount} failed features are currently present.`,
    });
  }

  if (capacityUtilisation >= 0.8) {
    alerts.push({
      severity: 'warning',
      message: 'Capacity utilisation is at or above 80%.',
    });
    }

  if (backlogCount > 5 && activeCount < 2) {
    alerts.push({
      severity: 'info',
      message: 'Backlog is high while active work is low; pipeline appears idle.',
    });
  }

  const status = alerts.some((alert) => alert.severity === 'critical')
    ? 'critical'
    : alerts.some((alert) => alert.severity === 'warning')
      ? 'warning'
      : 'healthy';

  return {
    status,
    totalFeatures,
    activeCount,
    backlogCount,
    failedCount,
    stuckCount,
    capacityUtilisation,
    alerts,
  };
}

function formatCapacityPercentage(utilisation: number): number {
  return Math.round(utilisation * 100);
}

export function formatHealthReport(summary: HealthSummary): string {
  const capacityMax =
    summary.capacityUtilisation === 0 ? 0 : Math.round(summary.activeCount / summary.capacityUtilisation);
  const percentage = formatCapacityPercentage(summary.capacityUtilisation);

  const lines = [
    `Pipeline: ${summary.status.toUpperCase()}`,
    `Capacity: ${summary.activeCount}/${capacityMax} (${percentage}%)`,
    `Features: ${summary.totalFeatures} total | ${summary.activeCount} active | ${summary.backlogCount} backlog | ${summary.failedCount} failed`,
  ];

  if (summary.alerts.length > 0) {
    lines.push('Alerts:');
    for (const alert of summary.alerts) {
      lines.push(`  [${alert.severity.toUpperCase()}] ${alert.message}`);
    }
  }

  return lines.join('\n');
}


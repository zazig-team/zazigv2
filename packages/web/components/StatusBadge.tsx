import React from 'react';

type Status = 'proposed' | 'designing' | 'in_progress' | 'complete';

const STATUS_STYLES: Record<Status, React.CSSProperties> = {
  proposed: { backgroundColor: '#e2e8f0', color: '#475569' },
  designing: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  in_progress: { backgroundColor: '#fef3c7', color: '#92400e' },
  complete: { backgroundColor: '#dcfce7', color: '#166534' },
};

const STATUS_LABELS: Record<Status, string> = {
  proposed: 'Proposed',
  designing: 'Designing',
  in_progress: 'In Progress',
  complete: 'Complete',
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const knownStatus = status as Status;
  const style = STATUS_STYLES[knownStatus] ?? { backgroundColor: '#f1f5f9', color: '#64748b' };
  const label = STATUS_LABELS[knownStatus] ?? status;

  return (
    <span
      style={{
        ...style,
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

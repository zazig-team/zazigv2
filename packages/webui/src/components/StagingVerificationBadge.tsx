interface StagingVerificationBadgeProps {
  staging_verified_by: string | null;
  staging_verified_at: string | null;
  className?: string;
  showUnverified?: boolean;
}

export function formatRelativeVerificationTime(iso: string | null): string {
  if (!iso) {
    return "just now";
  }

  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return "just now";
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) {
    return "just now";
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays < 7) {
    return `${deltaDays}d ago`;
  }

  if (deltaDays < 30) {
    return `${Math.floor(deltaDays / 7)}w ago`;
  }

  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function StagingVerificationBadge({
  staging_verified_by,
  staging_verified_at,
  className,
  showUnverified = false,
}: StagingVerificationBadgeProps): JSX.Element | null {
  const verifierName = (staging_verified_by ?? "").trim();

  if (!verifierName) {
    if (!showUnverified) {
      return null;
    }

    return (
      <span className={className ?? "staging-verification-badge staging-verification-badge--neutral"}>
        Unverified
      </span>
    );
  }

  return (
    <span className={className ?? "staging-verification-badge staging-verification-badge--positive"}>
      <span className="staging-verification-badge__dot" aria-hidden="true" />
      {`Verified by ${verifierName} · ${formatRelativeVerificationTime(staging_verified_at)}`}
    </span>
  );
}

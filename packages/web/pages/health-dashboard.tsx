import type { GetServerSideProps } from 'next';
import StatusBadge from '@/components/StatusBadge';
import type { FeatureRow } from './api/health';

type Props =
  | { features: FeatureRow[]; error?: never }
  | { features?: never; error: string };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const host = context.req.headers.host ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';

  try {
    const res = await fetch(`${protocol}://${host}/api/health`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { props: { error: (body as { error?: string }).error ?? `HTTP ${res.status}` } };
    }
    const data = await res.json() as { features: FeatureRow[] };
    return { props: { features: data.features } };
  } catch (err) {
    return { props: { error: String(err) } };
  }
};

export default function HealthDashboard({ features, error }: Props) {
  if (error) {
    return (
      <main style={{ fontFamily: 'sans-serif', padding: '24px' }}>
        <h1>Health Dashboard</h1>
        <p style={{ color: 'red' }}>Error loading data: {error}</p>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '24px' }}>
      <h1>Health Dashboard</h1>
      {features.length === 0 ? (
        <p>No features found.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Updated At</th>
            </tr>
          </thead>
          <tbody>
            {features.map((feature) => (
              <tr key={feature.id}>
                <td style={tdStyle}>
                  <code style={{ fontSize: '11px' }}>{feature.id}</code>
                </td>
                <td style={tdStyle}>{feature.title}</td>
                <td style={tdStyle}>
                  <StatusBadge status={feature.status} />
                </td>
                <td style={tdStyle}>
                  {new Date(feature.updated_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #e2e8f0',
  verticalAlign: 'middle',
};

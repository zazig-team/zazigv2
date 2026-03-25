import { Link } from "react-router-dom";

export default function Privacy(): JSX.Element {
  return (
    <div className="legal-page">
      <Link to="/" className="back-link">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M10 4l-4 4 4 4" />
        </svg>
        Back
      </Link>

      <div className="legal-shell">
        <div className="legal-card">
          <div className="brand">
            <Link to="/" className="brand-wordmark">zazig</Link>
            <span className="brand-dot" />
          </div>

          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-updated">Last updated: 5 March 2026</p>

          <div className="legal-body">
            <h2>1. What we collect</h2>
            <p>When you create an account we store your email address and, if you sign in with Google, your name and profile photo. We also store usage data such as login timestamps and feature interactions to operate and improve the service.</p>

            <h2>2. How we use it</h2>
            <p>Your data is used to authenticate you, provide the Zazig platform, and communicate service updates. We do not sell your personal data to third parties.</p>

            <h2>3. Third-party services</h2>
            <p>We use Supabase for authentication and data storage, Vercel for hosting, and Google OAuth as an optional sign-in provider. Each operates under their own privacy policies.</p>

            <h2>4. Data retention</h2>
            <p>Account data is retained while your account is active. You can request deletion of your account and associated data by emailing <a href="mailto:privacy@zazig.com">privacy@zazig.com</a>.</p>

            <h2>5. Cookies</h2>
            <p>We use essential cookies and local storage for authentication sessions. We do not use tracking or advertising cookies.</p>

            <h2>6. Security</h2>
            <p>Data is encrypted in transit (TLS) and at rest. Access tokens expire after one hour and are refreshed automatically.</p>

            <h2>7. Contact</h2>
            <p>For privacy questions, contact <a href="mailto:privacy@zazig.com">privacy@zazig.com</a>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

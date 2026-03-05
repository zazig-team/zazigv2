import { Link } from "react-router-dom";

export default function Terms(): JSX.Element {
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

          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-updated">Last updated: 5 March 2026</p>

          <div className="legal-body">
            <h2>1. Acceptance</h2>
            <p>By using Zazig you agree to these terms. If you do not agree, do not use the service.</p>

            <h2>2. The service</h2>
            <p>Zazig provides an autonomous software engineering platform. We may update, modify, or discontinue features at any time.</p>

            <h2>3. Accounts</h2>
            <p>You are responsible for maintaining the security of your account credentials. Notify us immediately if you suspect unauthorised access.</p>

            <h2>4. Acceptable use</h2>
            <p>You agree not to use Zazig to violate any laws, infringe intellectual property, or interfere with the operation of the service.</p>

            <h2>5. Intellectual property</h2>
            <p>Code and content you create using Zazig belongs to you. The Zazig platform, brand, and associated tooling remain the property of Zazig.</p>

            <h2>6. Limitation of liability</h2>
            <p>Zazig is provided &ldquo;as is&rdquo; without warranty. We are not liable for any damages arising from your use of the service, to the maximum extent permitted by law.</p>

            <h2>7. Termination</h2>
            <p>We may suspend or terminate your access if you violate these terms. You may delete your account at any time by contacting <a href="mailto:support@zazig.com">support@zazig.com</a>.</p>

            <h2>8. Changes</h2>
            <p>We may update these terms. Continued use after changes constitutes acceptance.</p>

            <h2>9. Contact</h2>
            <p>Questions? Email <a href="mailto:legal@zazig.com">legal@zazig.com</a>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

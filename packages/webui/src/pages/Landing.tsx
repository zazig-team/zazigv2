import { Link } from "react-router-dom";

export default function Landing(): JSX.Element {
  return (
    <div className="landing-page">
      <div className="landing-glow" />

      <div className="landing-shell">
        <nav className="landing-nav">
          <Link to="/" className="landing-nav-wordmark">
            zazig<span className="landing-nav-dot" />
          </Link>
          <div className="landing-nav-links">
            <Link to="/about" className="landing-nav-link">
              About
            </Link>
            <a className="landing-nav-link" href="#" onClick={(event) => event.preventDefault()}>
              Docs
            </a>
            <Link to="/login" className="landing-nav-signin">
              Sign in
            </Link>
          </div>
        </nav>

        <main className="landing-hero">
          <div className="landing-hero-mark">
            <span className="landing-hero-logo">zazig</span>
            <span className="landing-hero-dot" />
          </div>
          <p className="landing-hero-tagline">Your autonomous startup that scales while you sleep.</p>
        </main>

        <footer className="landing-footer">
          <span className="landing-footer-left">Autonomous software engineering</span>
          <div className="landing-footer-right">
            <a
              className="landing-footer-link"
              href="#"
              onClick={(event) => event.preventDefault()}
            >
              Twitter
            </a>
            <a
              className="landing-footer-link"
              href="#"
              onClick={(event) => event.preventDefault()}
            >
              GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function Login(): JSX.Element {
  const { signInWithMagicLink, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [sendingMagicLink, setSendingMagicLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && !sendingMagicLink,
    [email, sendingMagicLink],
  );

  const onSendMagicLink = async (): Promise<void> => {
    const value = email.trim().toLowerCase();

    if (!isValidEmail(value)) {
      setError("Please enter a valid email address");
      return;
    }

    setError(null);
    setSendingMagicLink(true);

    try {
      await signInWithMagicLink(value);
      setSentTo(value);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : String(signInError));
    } finally {
      setSendingMagicLink(false);
    }
  };

  const onGoogleSignIn = async (): Promise<void> => {
    try {
      await signInWithGoogle();
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : String(googleError));
    }
  };

  return (
    <div className="login-page">
      <Link to="/" className="back-link">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M10 4l-4 4 4 4" />
        </svg>
        Back
      </Link>

      <div className="login-shell">
        <div className="login-card">
          <div className="brand">
            <Link to="/" className="brand-wordmark">
              zazig
            </Link>
            <span className="brand-dot" />
          </div>

          {sentTo ? (
            <div className="success-state show">
              <div className="success-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
                </svg>
              </div>
              <h2 className="success-title">Check your email</h2>
              <p className="success-detail">
                We sent a sign-in link to
                <br />
                <strong>{sentTo}</strong>
              </p>
              <p className="success-resend">
                Didn&apos;t receive it?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setSentTo(null);
                    void onSendMagicLink();
                  }}
                >
                  Resend link
                </button>
              </p>
            </div>
          ) : (
            <>
              <div className="login-header">
                <h1 className="login-title">Sign in to your workspace</h1>
                <p className="login-subtitle">Enter your email to receive a magic link.</p>
              </div>

              <div className="login-form">
                <div className="input-group">
                  <label className="input-label" htmlFor="email">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    className="input-field"
                    placeholder="you@company.com"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) {
                        setError(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void onSendMagicLink();
                      }
                    }}
                  />
                  <span className={`input-error${error ? " show" : ""}`}>{error ?? " "}</span>
                </div>

                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void onSendMagicLink()}
                  disabled={!canSubmit}
                >
                  {sendingMagicLink ? <span className="spinner" /> : "Continue with magic link"}
                </button>

                <div className="divider">
                  <span className="divider-line" />
                  <span className="divider-text">or</span>
                  <span className="divider-line" />
                </div>

                <button type="button" className="btn-google" onClick={() => void onGoogleSignIn()}>
                  <svg viewBox="0 0 18 18" fill="none">
                    <path
                      d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                      fill="#4285F4"
                    />
                    <path
                      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                      fill="#34A853"
                    />
                    <path
                      d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 2.58z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </button>
              </div>

              <div className="login-footer">
                Don&apos;t have an account? <a href="#">Request access</a>
              </div>
            </>
          )}

          <p className="terms">
            By continuing, you agree to our <a href="#">Terms of Service</a> and{" "}
            <a href="#">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

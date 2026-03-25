import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function AuthCallback(): JSX.Element {
  const navigate = useNavigate();
  const { loading, session } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (session) {
      const redirectTo = sessionStorage.getItem("auth_redirect");
      if (redirectTo) {
        sessionStorage.removeItem("auth_redirect");
        navigate(redirectTo, { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
      return;
    }

    // If URL has auth tokens in the hash, Supabase is still processing them.
    // Wait for onAuthStateChange to fire instead of redirecting to /login.
    const hash = window.location.hash;
    if (hash && (hash.includes("access_token") || hash.includes("error"))) {
      return;
    }

    navigate("/login", { replace: true });
  }, [loading, navigate, session]);

  return <div className="route-loading">Completing sign-in…</div>;
}

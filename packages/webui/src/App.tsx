import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import Nav from "./components/Nav";
import { CompanyProvider } from "./hooks/useCompany";
import { useAuth } from "./hooks/useAuth";
import Dashboard from "./pages/Dashboard";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Pipeline from "./pages/Pipeline";
import Roadmap from "./pages/Roadmap";
import Team from "./pages/Team";
import AuthCallback from "./pages/AuthCallback";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

function RouteLoading(): JSX.Element {
  return <div className="route-loading">Loading…</div>;
}

function ProtectedLayout(): JSX.Element {
  const { loading, session } = useAuth();

  if (loading) {
    return <RouteLoading />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <CompanyProvider>
      <div className="app-shell">
        <Nav />
        <Outlet />
      </div>
    </CompanyProvider>
  );
}

function LoginRoute(): JSX.Element {
  const { loading, session } = useAuth();

  if (loading) {
    return <RouteLoading />;
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Login />;
}

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/tos" element={<Terms />} />

      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/roadmap" element={<Roadmap />} />
        <Route path="/team" element={<Team />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

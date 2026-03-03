import { NavLink } from "react-router-dom";
import CompanySwitcher from "./CompanySwitcher";
import ThemeToggle from "./ThemeToggle";
import { useCompany } from "../hooks/useCompany";
import { useAuth } from "../hooks/useAuth";

function initialsFromUserName(value: string | null | undefined): string {
  if (!value) {
    return "U";
  }

  const parts = value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "U";
  }

  return parts
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export default function Nav(): JSX.Element {
  const { companies, activeCompanyId, setActiveCompanyId } = useCompany();
  const { signOut, user } = useAuth();

  const displayName =
    (typeof user?.user_metadata?.name === "string" && user.user_metadata.name) ||
    user?.email ||
    "User";

  return (
    <nav className="nav">
      <div className="nav-left">
        <div className="nav-brand">
          zazig<span className="dot dot--positive dot--breathe" />
        </div>
        <div className="nav-links">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/pipeline"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Pipeline
          </NavLink>
          <NavLink to="/team" className={({ isActive }) => (isActive ? "active" : undefined)}>
            Team
          </NavLink>
        </div>
      </div>

      <div className="nav-right">
        <CompanySwitcher
          companies={companies}
          activeCompanyId={activeCompanyId}
          onSelectCompany={setActiveCompanyId}
        />
        <ThemeToggle />
        <button className="nav-avatar" onClick={() => void signOut()} title="Sign out" type="button">
          {initialsFromUserName(displayName)}
        </button>
      </div>
    </nav>
  );
}

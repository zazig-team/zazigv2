import { useEffect, useRef, useState } from "react";
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const displayName =
    (typeof user?.user_metadata?.name === "string" && user.user_metadata.name) ||
    user?.email ||
    "User";

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (!target || !userMenuRef.current) {
        return;
      }
      if (!userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener("click", closeOnOutsideClick);
    return () => document.removeEventListener("click", closeOnOutsideClick);
  }, []);

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
            to="/ideas"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Ideas
          </NavLink>
          <NavLink
            to="/pipeline"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Pipeline
          </NavLink>
          <NavLink
            to="/roadmap"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Roadmap
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
        <div className="nav-user-menu" ref={userMenuRef}>
          <button
            className="nav-avatar"
            onClick={() => setUserMenuOpen((current) => !current)}
            title="Open user menu"
            type="button"
          >
            {initialsFromUserName(displayName)}
          </button>
          <div className={`nav-user-menu-popover${userMenuOpen ? " open" : ""}`}>
            <NavLink
              to="/settings"
              className="nav-user-menu-item"
              onClick={() => setUserMenuOpen(false)}
            >
              Settings
            </NavLink>
            <button
              className="nav-user-menu-item"
              onClick={() => {
                setUserMenuOpen(false);
                void signOut();
              }}
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

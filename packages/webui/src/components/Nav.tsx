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
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  const displayName =
    (typeof user?.user_metadata?.name === "string" && user.user_metadata.name) ||
    user?.email ||
    "User";

  useEffect(() => {
    if (!avatarOpen) return;

    function handleClickOutside(event: MouseEvent): void {
      if (avatarRef.current && !avatarRef.current.contains(event.target as Node)) {
        setAvatarOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [avatarOpen]);

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
        <div className="nav-avatar-wrap" ref={avatarRef}>
          <button
            className="nav-avatar"
            type="button"
            onClick={() => setAvatarOpen((prev) => !prev)}
            title={displayName}
          >
            {initialsFromUserName(displayName)}
          </button>
          <div className={`nav-avatar-menu${avatarOpen ? " open" : ""}`}>
            <div className="nav-avatar-menu-email">{user?.email ?? "Unknown"}</div>
            <button
              className="nav-avatar-menu-item"
              type="button"
              onClick={() => {
                setAvatarOpen(false);
                void signOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

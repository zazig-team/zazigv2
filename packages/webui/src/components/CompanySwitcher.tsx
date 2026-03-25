import { useEffect, useRef, useState } from "react";
import type { Company } from "../hooks/useCompany";

interface CompanySwitcherProps {
  companies: Company[];
  activeCompanyId: string | null;
  onSelectCompany: (companyId: string) => void;
}

export default function CompanySwitcher({
  companies,
  activeCompanyId,
  onSelectCompany,
}: CompanySwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (!target || !rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("click", closeOnOutsideClick);
    return () => document.removeEventListener("click", closeOnOutsideClick);
  }, []);

  const activeCompany =
    companies.find((company) => company.id === activeCompanyId) ?? companies[0] ?? null;

  return (
    <div className="company-switcher" ref={rootRef}>
      <button
        className="company-switcher-btn"
        onClick={() => setOpen((current) => !current)}
        disabled={companies.length === 0}
        type="button"
      >
        {activeCompany?.name ?? "No workspace"}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div className={`company-switcher-menu${open ? " open" : ""}`}>
        {companies.map((company) => {
          const isActive = company.id === activeCompanyId;

          return (
            <button
              key={company.id}
              className={`company-switcher-item${isActive ? " company-switcher-item--active" : ""}`}
              onClick={() => {
                onSelectCompany(company.id);
                setOpen(false);
              }}
              type="button"
            >
              {company.name}
              {isActive ? <span className="company-switcher-check" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

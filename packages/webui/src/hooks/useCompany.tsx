import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface Company {
  id: string;
  name: string;
}

interface CompanyContextValue {
  loading: boolean;
  error: string | null;
  companies: Company[];
  activeCompanyId: string | null;
  activeCompany: Company | null;
  setActiveCompanyId: (companyId: string) => void;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

function relationObject<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function CompanyProvider({ children }: { children: ReactNode }): JSX.Element {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCompanies(): Promise<void> {
      if (!user) {
        setCompanies([]);
        setActiveCompanyIdState(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("user_companies")
        .select("company_id, companies(id, name)")
        .eq("user_id", user.id);

      if (cancelled) {
        return;
      }

      if (queryError) {
        setError(queryError.message);
        setCompanies([]);
        setActiveCompanyIdState(null);
        setLoading(false);
        return;
      }

      const parsedCompanies = ((data ?? []) as Array<Record<string, unknown>>)
        .map((row) => {
          const company = relationObject<{ id: string; name: string }>(
            row.companies as
              | { id: string; name: string }
              | Array<{ id: string; name: string }>
              | null,
          );

          if (!company) {
            return null;
          }

          return {
            id: company.id,
            name: company.name,
          };
        })
        .filter((company): company is Company => company !== null);

      setCompanies(parsedCompanies);

      const storageKey = `zazig:webui:active-company:${user.id}`;
      const storedCompanyId = window.localStorage.getItem(storageKey);
      const defaultCompanyId =
        storedCompanyId && parsedCompanies.some((company) => company.id === storedCompanyId)
          ? storedCompanyId
          : (parsedCompanies[0]?.id ?? null);

      setActiveCompanyIdState(defaultCompanyId);
      if (defaultCompanyId) {
        window.localStorage.setItem(storageKey, defaultCompanyId);
      }
      setLoading(false);
    }

    loadCompanies().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const setActiveCompanyId = (companyId: string): void => {
    setActiveCompanyIdState(companyId);
    if (user) {
      window.localStorage.setItem(`zazig:webui:active-company:${user.id}`, companyId);
    }
  };

  const activeCompany =
    companies.find((company) => company.id === activeCompanyId) ?? null;

  const value = useMemo<CompanyContextValue>(
    () => ({
      loading,
      error,
      companies,
      activeCompanyId,
      activeCompany,
      setActiveCompanyId,
    }),
    [loading, error, companies, activeCompanyId, activeCompany],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error("useCompany must be used within CompanyProvider");
  }
  return context;
}

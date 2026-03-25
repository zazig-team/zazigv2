import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getCurrentSession,
  onAuthStateChange,
  verifyEmailOtp,
  signInWithGoogle,
  signInWithMagicLink,
  signOut,
} from "../lib/auth";

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInWithMagicLink: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    getCurrentSession()
      .then((current) => {
        if (!isMounted) {
          return;
        }
        setSession(current);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    const subscription = onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      signInWithMagicLink,
      verifyEmailOtp,
      signInWithGoogle,
      signOut,
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

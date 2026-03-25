import { useEffect, useState } from "react";

const THEME_KEY = "zazig-theme";

type Theme = "light" | "dark";

function getCurrentTheme(): Theme {
  const theme = document.documentElement.getAttribute("data-theme");
  return theme === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(THEME_KEY, theme);
}

export function initializeTheme(): void {
  const storedTheme = window.localStorage.getItem(THEME_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    applyTheme(storedTheme);
    return;
  }

  applyTheme("dark");
}

export default function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => getCurrentTheme());

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", storedTheme);
      setTheme(storedTheme);
    }

    const observer = new MutationObserver(() => {
      setTheme(getCurrentTheme());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  const toggleTheme = (): void => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
      <svg
        className="icon-moon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
      </svg>
      <svg
        className="icon-sun"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    </button>
  );
}

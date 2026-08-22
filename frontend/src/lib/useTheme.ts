import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "agrihaul-theme";

function getInitialTheme(): Theme {
  return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

// Toggling sets a `data-theme` attribute on <html>, which index.css's
// `:root[data-theme="dark"]` block overrides tokens against — every
// component already styled with CSS variables (which is nearly all of
// them) picks up the change automatically, no per-component code needed.
// Safe to call from multiple components at once (AppLayout, both
// platform-admin topbars): they're never mounted simultaneously, and all
// read/write the same localStorage key and DOM attribute.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  return { theme, toggleTheme };
}

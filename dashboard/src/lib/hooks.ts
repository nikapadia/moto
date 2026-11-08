import { useCallback, useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router";

/** useState that survives reloads. Storage can be unavailable, which only loses the preference. */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Keep the preference for this visit only
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** The link that opens a resource in the inspector, on top of the current page. */
export function useOpenLink() {
  const location = useLocation();
  const [params] = useSearchParams();
  return useCallback(
    (uid: string) => {
      const next = new URLSearchParams(params);
      next.set("open", uid);
      return { pathname: location.pathname, search: `?${next}` };
    },
    [location.pathname, params],
  );
}

async function writeClipboard(text: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // navigator.clipboard only exists on HTTPS and localhost, and Moto is often reached by IP
  const area = document.createElement("textarea");
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export function useCopy() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = useCallback(async (text: string) => {
    await writeClipboard(text);
    setCopied(true);
  }, []);
  return { copied, copy };
}

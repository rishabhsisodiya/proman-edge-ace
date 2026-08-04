"use client";

import { useEffect, useState } from "react";

/**
 * Same shape as useState, but backed by sessionStorage — survives a
 * navigation away and back (e.g. opening a ticket detail page, which
 * unmounts the list page entirely), cleared when the tab closes. Not meant
 * for anything that needs to persist longer than that.
 */
export function useSessionState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // sessionStorage unavailable (private browsing, quota, etc.) — filters just won't persist.
    }
  }, [key, state]);

  return [state, setState];
}

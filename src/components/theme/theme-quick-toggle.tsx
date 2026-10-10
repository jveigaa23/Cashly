"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { writeThemePreference } from "./theme-store";
import type { ResolvedTheme } from "./theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getResolved(): ResolvedTheme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** Botão do cabeçalho que alterna entre claro e escuro. */
export function ThemeQuickToggle() {
  const resolved = useSyncExternalStore<ResolvedTheme | null>(
    subscribe,
    getResolved,
    () => null,
  );
  const next: ResolvedTheme = resolved === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Usar tema escuro" : "Usar tema claro";

  return (
    <button
      type="button"
      onClick={() => writeThemePreference(next)}
      aria-label={label}
      title={label}
      disabled={resolved === null}
      className="inline-flex size-12 items-center justify-center rounded-xl text-foreground hover:bg-surface-muted"
    >
      {resolved === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

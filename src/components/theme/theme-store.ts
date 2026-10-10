"use client";

import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  isThemePreference,
  type ThemePreference,
} from "./theme";

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(value)) return value;
  } catch {
    // Armazenamento indisponível (modo privado/bloqueado): usa o padrão.
  }
  return "system";
}

/** Salva a preferência e notifica o script de tema e os componentes. */
export function writeThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Armazenamento bloqueado: não há como persistir; o tema segue o sistema.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function subscribeThemePreference(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  themeInitScript,
} from "./theme";

function mockSystemDark(dark: boolean) {
  const listeners: Array<() => void> = [];
  const mql = {
    matches: dark,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mql));
  return {
    change(next: boolean) {
      mql.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

function runInitScript() {
  // Executa exatamente o texto que vai para o <head>.
  new Function(themeInitScript)();
}

const html = () => document.documentElement;

describe("resolveTheme", () => {
  it("respeita escolha manual e segue o sistema no modo automático", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("valida preferências", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("blue")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});

describe("script de inicialização do tema", () => {
  beforeEach(() => {
    html().removeAttribute("data-theme");
    html().removeAttribute("data-theme-preference");
  });

  it("sem preferência salva, segue o sistema", () => {
    mockSystemDark(true);
    runInitScript();
    expect(html().dataset.theme).toBe("dark");
    expect(html().dataset.themePreference).toBe("system");
  });

  it("aplica a preferência salva", () => {
    mockSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    runInitScript();
    expect(html().dataset.theme).toBe("light");
  });

  it("ignora valor inválido salvo", () => {
    mockSystemDark(false);
    localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    runInitScript();
    expect(html().dataset.theme).toBe("light");
    expect(html().dataset.themePreference).toBe("system");
  });

  it("acompanha mudança do sistema no modo automático e reage a nova escolha", () => {
    const system = mockSystemDark(false);
    runInitScript();
    system.change(true);
    expect(html().dataset.theme).toBe("dark");

    localStorage.setItem(THEME_STORAGE_KEY, "light");
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    expect(html().dataset.theme).toBe("light");
    system.change(true);
    expect(html().dataset.theme).toBe("light");
  });

  it("não quebra se o armazenamento estiver bloqueado", () => {
    mockSystemDark(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(runInitScript).not.toThrow();
    expect(html().dataset.theme).toBe("dark");
  });
});

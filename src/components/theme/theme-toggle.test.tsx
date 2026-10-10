import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY, themeInitScript } from "./theme";
import { ThemeToggle } from "./theme-toggle";
import { ThemeQuickToggle } from "./theme-quick-toggle";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn() })),
  );
  new Function(themeInitScript)();
});

describe("ThemeToggle", () => {
  it("marca 'Automático' por padrão e salva a escolha", async () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: "Automático" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Escuro" }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("radio", { name: "Escuro" })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("funciona pelo teclado", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);
    const light = screen.getByRole("radio", { name: "Claro" });
    expect(light).toBeChecked();

    light.focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByRole("radio", { name: "Escuro" })).toBeChecked();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});

describe("ThemeQuickToggle", () => {
  it("alterna entre claro e escuro com rótulo acessível", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    new Function(themeInitScript)();
    render(<ThemeQuickToggle />);

    await userEvent.click(screen.getByRole("button", { name: "Usar tema escuro" }));
    expect(document.documentElement.dataset.theme).toBe("dark");

    expect(
      await screen.findByRole("button", { name: "Usar tema claro" }),
    ).toBeInTheDocument();
  });
});

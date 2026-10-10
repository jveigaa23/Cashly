"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { DeviceIcon, MoonIcon, SunIcon } from "@/components/ui/icons";
import type { ThemePreference } from "./theme";
import {
  readThemePreference,
  subscribeThemePreference,
  writeThemePreference,
} from "./theme-store";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  Icon: typeof SunIcon;
}[] = [
  { value: "light", label: "Claro", Icon: SunIcon },
  { value: "dark", label: "Escuro", Icon: MoonIcon },
  { value: "system", label: "Automático", Icon: DeviceIcon },
];

/**
 * Seletor de tema em formato de grupo de opções (radiogroup nativo),
 * acessível por teclado e leitor de tela.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // No servidor não sabemos a preferência: nenhuma opção marcada até hidratar.
  const preference = useSyncExternalStore<ThemePreference | null>(
    subscribeThemePreference,
    readThemePreference,
    () => null,
  );

  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-2 font-semibold">Aparência</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, Icon }) => {
          const checked = preference === value;
          return (
            <label
              key={value}
              className={cn(
                "flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-2 text-sm font-medium",
                "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                checked
                  ? "border-primary bg-surface-muted"
                  : "border-border bg-surface hover:bg-surface-muted",
              )}
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={checked}
                onChange={() => writeThemePreference(value)}
                className="sr-only"
              />
              <Icon />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-muted">
        “Automático” acompanha a configuração do celular ou computador.
      </p>
    </fieldset>
  );
}

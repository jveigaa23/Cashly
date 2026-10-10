"use client";

import { useSyncExternalStore } from "react";
import { WifiOffIcon } from "@/components/ui/icons";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Faixa fixa avisando que o aparelho está sem conexão. */
export function ConnectionStatus() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  return (
    <div role="status" aria-live="polite">
      {online ? null : (
        <div className="flex items-center gap-3 bg-warning-bg px-4 py-3 text-warning">
          <WifiOffIcon className="shrink-0" />
          <p className="font-semibold">
            Sem internet. Nada será salvo até a conexão voltar.
          </p>
        </div>
      )}
    </div>
  );
}

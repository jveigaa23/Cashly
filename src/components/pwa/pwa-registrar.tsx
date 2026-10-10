"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { RefreshIcon } from "@/components/ui/icons";
import {
  applyUpdate,
  getPwaState,
  getServerPwaState,
  startPwa,
  subscribePwa,
} from "./pwa-store";

/**
 * Registra o Service Worker (apenas no build de produção, para não
 * interferir no recarregamento do ambiente de desenvolvimento) e avisa
 * quando há uma versão nova do app.
 */
export function PwaRegistrar() {
  const { updateReady } = useSyncExternalStore(
    subscribePwa,
    getPwaState,
    getServerPwaState,
  );

  useEffect(() => {
    startPwa({ registerWorker: process.env.NODE_ENV === "production" });
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-lg md:bottom-6"
    >
      <p className="min-w-0 flex-1 font-medium">
        Há uma nova versão do Cashly disponível.
      </p>
      <Button onClick={applyUpdate}>
        <RefreshIcon />
        Atualizar
      </Button>
    </div>
  );
}

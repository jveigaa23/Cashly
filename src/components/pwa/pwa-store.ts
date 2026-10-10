"use client";

/**
 * Estado da PWA no navegador: registro do Service Worker, versão nova em
 * espera e convite de instalação. Exposto como "external store" para
 * `useSyncExternalStore`.
 */

export type ServiceWorkerStatus =
  | "unsupported"
  | "disabled"
  | "registering"
  | "ready"
  | "error";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __cashlyInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export interface PwaState {
  swStatus: ServiceWorkerStatus;
  updateReady: boolean;
  canPromptInstall: boolean;
  installed: boolean;
}

const SERVER_STATE: PwaState = {
  swStatus: "registering",
  updateReady: false,
  canPromptInstall: false,
  installed: false,
};

let state: PwaState = SERVER_STATE;
let waitingWorker: ServiceWorker | null = null;
let started = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribePwa(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getPwaState = () => state;
export const getServerPwaState = () => SERVER_STATE;

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari no iOS
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Inicializa uma única vez (chamado pelo PwaRegistrar). */
export function startPwa({ registerWorker }: { registerWorker: boolean }) {
  if (started) return;
  started = true;

  setState({
    installed: isStandalone(),
    canPromptInstall: Boolean(window.__cashlyInstallPrompt),
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__cashlyInstallPrompt = event as BeforeInstallPromptEvent;
    setState({ canPromptInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    window.__cashlyInstallPrompt = null;
    setState({ installed: true, canPromptInstall: false });
  });

  if (!("serviceWorker" in navigator)) {
    setState({ swStatus: "unsupported" });
    return;
  }
  if (!registerWorker) {
    setState({ swStatus: "disabled" });
    return;
  }
  void register();
}

async function register() {
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    const trackInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        // Só é "atualização" se já havia uma versão controlando a página.
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          waitingWorker = worker;
          setState({ updateReady: true });
        }
      });
    };

    if (registration.waiting && navigator.serviceWorker.controller) {
      waitingWorker = registration.waiting;
      setState({ updateReady: true });
    }
    trackInstalling(registration.installing);
    registration.addEventListener("updatefound", () =>
      trackInstalling(registration.installing),
    );

    // Procura versões novas quando o app volta a ficar visível.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        registration.update().catch(() => {
          // Sem rede: tenta de novo na próxima vez.
        });
      }
    });

    setState({ swStatus: "ready" });
  } catch (error) {
    console.error("Falha ao registrar o Service Worker", error);
    setState({ swStatus: "error" });
  }
}

/** Ativa a versão em espera e recarrega a página — só após ação explícita. */
export function applyUpdate() {
  if (!waitingWorker) return;
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => window.location.reload(),
    { once: true },
  );
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
}

/** Abre o convite nativo de instalação (Chrome/Edge/Android). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = window.__cashlyInstallPrompt;
  if (!event) return "unavailable";
  await event.prompt();
  const { outcome } = await event.userChoice;
  // O evento só pode ser usado uma vez.
  window.__cashlyInstallPrompt = null;
  setState({ canPromptInstall: false });
  return outcome;
}

/**
 * Captura o convite de instalação antes da hidratação do React
 * (o navegador pode dispará-lo cedo). Executado no <head>.
 */
export const installPromptCaptureScript = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__cashlyInstallPrompt=e});`;

import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event?: unknown) => void;

class FakeWorker extends EventTarget {
  state = "installing";
  postMessage = vi.fn();
  setState(state: string) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

function setup({ controlled, waiting }: { controlled: boolean; waiting?: FakeWorker }) {
  const registration = Object.assign(new EventTarget(), {
    waiting: waiting ?? null,
    installing: null as FakeWorker | null,
    update: vi.fn().mockResolvedValue(undefined),
  });
  const containerListeners: Record<string, Listener[]> = {};
  const container = {
    controller: controlled ? {} : null,
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: (type: string, cb: Listener) => {
      (containerListeners[type] ??= []).push(cb);
    },
  };
  Object.defineProperty(navigator, "serviceWorker", { value: container, configurable: true });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  const reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });
  return {
    registration,
    container,
    reload,
    fireControllerChange: () => containerListeners.controllerchange?.forEach((cb) => cb()),
  };
}

// O módulo guarda estado global: cada teste importa uma instância nova.
async function freshStore() {
  vi.resetModules();
  return import("./pwa-store");
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("pwa-store", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("registra /sw.js sem cache HTTP e fica pronto", async () => {
    const { container } = setup({ controlled: false });
    const store = await freshStore();
    store.startPwa({ registerWorker: true });
    await flush();
    expect(container.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    expect(store.getPwaState().swStatus).toBe("ready");
    expect(store.getPwaState().updateReady).toBe(false);
  });

  it("não registra quando desabilitado (desenvolvimento)", async () => {
    const { container } = setup({ controlled: false });
    const store = await freshStore();
    store.startPwa({ registerWorker: false });
    expect(container.register).not.toHaveBeenCalled();
    expect(store.getPwaState().swStatus).toBe("disabled");
  });

  it("primeira instalação não é anunciada como atualização", async () => {
    const { registration } = setup({ controlled: false });
    const store = await freshStore();
    store.startPwa({ registerWorker: true });
    await flush();
    const worker = new FakeWorker();
    registration.installing = worker;
    registration.dispatchEvent(new Event("updatefound"));
    worker.setState("installed");
    expect(store.getPwaState().updateReady).toBe(false);
  });

  it("nova versão fica em espera até a pessoa confirmar", async () => {
    const { registration, reload, fireControllerChange } = setup({ controlled: true });
    const store = await freshStore();
    const listener = vi.fn();
    store.subscribePwa(listener);
    store.startPwa({ registerWorker: true });
    await flush();

    const worker = new FakeWorker();
    registration.installing = worker;
    registration.dispatchEvent(new Event("updatefound"));
    worker.setState("installed");

    expect(store.getPwaState().updateReady).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    store.applyUpdate();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();

    fireControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("detecta versão que já estava em espera ao abrir o app", async () => {
    const waiting = new FakeWorker();
    setup({ controlled: true, waiting });
    const store = await freshStore();
    store.startPwa({ registerWorker: true });
    await flush();
    expect(store.getPwaState().updateReady).toBe(true);
  });

  it("falha no registro vira estado de erro, sem quebrar o app", async () => {
    const { container } = setup({ controlled: false });
    container.register.mockRejectedValue(new Error("SecurityError"));
    const store = await freshStore();
    store.startPwa({ registerWorker: true });
    await flush();
    expect(store.getPwaState().swStatus).toBe("error");
  });

  it("convite de instalação capturado antes da hidratação é aproveitado", async () => {
    setup({ controlled: false });
    const prompt = vi.fn().mockResolvedValue(undefined);
    window.__cashlyInstallPrompt = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    const store = await freshStore();
    store.startPwa({ registerWorker: false });
    expect(store.getPwaState().canPromptInstall).toBe(true);

    await expect(store.promptInstall()).resolves.toBe("accepted");
    expect(prompt).toHaveBeenCalled();
    expect(store.getPwaState().canPromptInstall).toBe(false);
    await expect(store.promptInstall()).resolves.toBe("unavailable");
  });
});

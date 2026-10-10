"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { FormState } from "@/components/ui/form-message";
import { registerPushAction, sendTestPushAction, unregisterPushAction } from "@/server/notifications/actions";

type DeviceState = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIosNotInstalled() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/** Liga/desliga os avisos no celular para ESTE aparelho. */
export function PushDevice({ publicKey, devices }: { publicKey: string | null; devices: number }) {
  const [state, setState] = useState<DeviceState>("checking");
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      let next: DeviceState;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        next = isIosNotInstalled() ? "ios-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "denied";
      } else {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        next = sub ? "on" : "off";
      }
      if (alive) setState(next);
    })().catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, []);

  if (!publicKey) {
    return (
      <Notice tone="info" title="Avisos no celular ainda não estão disponíveis">
        Falta configurar o envio no servidor (chaves VAPID). Enquanto isso, os avisos aparecem no sino do app.
      </Notice>
    );
  }

  const enable = () =>
    start(async () => {
      setResult(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
        const r = await registerPushAction(sub.toJSON(), navigator.userAgent);
        setResult(r);
        if (r.status === "success") setState("on");
        else await sub.unsubscribe();
      } catch {
        setResult({ status: "error", message: "Não foi possível ativar os avisos neste aparelho. Tente de novo." });
      }
    });

  const disable = () =>
    start(async () => {
      setResult(null);
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const r = await unregisterPushAction(sub.endpoint);
        await sub.unsubscribe();
        setResult(r);
      }
      setState("off");
    });

  const test = () => start(async () => setResult(await sendTestPushAction()));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">
        {devices === 0 ? "Nenhum aparelho seu recebe avisos no momento." : `${devices} ${devices === 1 ? "aparelho seu recebe" : "aparelhos seus recebem"} avisos.`}
      </p>
      {result?.message ? (
        <Notice tone={result.status === "error" ? "danger" : "success"} role={result.status === "error" ? "alert" : "status"} title={result.message} />
      ) : null}
      {state === "checking" ? <p className="text-muted">Verificando este aparelho…</p> : null}
      {state === "unsupported" ? (
        <Notice tone="info" title="Este navegador não recebe avisos">Use o Chrome no Android ou o app instalado.</Notice>
      ) : null}
      {state === "ios-install" ? (
        <Notice tone="info" title="No iPhone, instale o app primeiro">
          Abra no Safari, toque em Compartilhar → “Adicionar à Tela de Início” e ative os avisos pelo app instalado (iOS 16.4 ou mais novo).
        </Notice>
      ) : null}
      {state === "denied" ? (
        <Notice tone="warning" title="Os avisos estão bloqueados neste aparelho">
          Libere as notificações do Cashly nas configurações do navegador ou do celular e volte aqui.
        </Notice>
      ) : null}
      {state === "off" ? (
        <Button type="button" onClick={enable} disabled={pending}>
          {pending ? "Ativando…" : "Ativar avisos neste aparelho"}
        </Button>
      ) : null}
      {state === "on" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={test} disabled={pending}>
            Enviar aviso de teste
          </Button>
          <Button type="button" variant="secondary" onClick={disable} disabled={pending}>
            Desativar neste aparelho
          </Button>
        </div>
      ) : null}
    </div>
  );
}

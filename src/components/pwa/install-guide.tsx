"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DownloadIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getPwaState,
  getServerPwaState,
  promptInstall,
  subscribePwa,
} from "./pwa-store";

type Platform = "ios" | "android" | "desktop" | "unknown";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

const noop = () => () => {};

export function InstallGuide() {
  const { installed, canPromptInstall } = useSyncExternalStore(
    subscribePwa,
    getPwaState,
    getServerPwaState,
  );
  const platform = useSyncExternalStore<Platform>(
    noop,
    detectPlatform,
    () => "unknown",
  );
  const [result, setResult] = useState<"dismissed" | null>(null);

  return (
    <Card aria-labelledby="install-title">
      <CardTitle id="install-title">Instalar no celular ou computador</CardTitle>

      {installed ? (
        <div className="mt-3">
          <StatusBadge tone="success">Aplicativo instalado</StatusBadge>
          <p className="mt-2 text-muted">
            Você está usando o Cashly como aplicativo.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-muted">
            Instalado, o Cashly abre direto pela tela inicial, como um
            aplicativo comum. Ele continua precisando de internet para mostrar
            e salvar os dados.
          </p>

          {canPromptInstall ? (
            <Button
              size="lg"
              onClick={async () => {
                const outcome = await promptInstall();
                setResult(outcome === "dismissed" ? "dismissed" : null);
              }}
            >
              <DownloadIcon />
              Instalar aplicativo
            </Button>
          ) : null}

          {result === "dismissed" ? (
            <Notice title="Instalação cancelada">
              Você pode instalar depois pelo menu do navegador.
            </Notice>
          ) : null}

          {platform === "ios" ? (
            <ol className="list-decimal space-y-1 pl-6">
              <li>Abra este endereço no <strong>Safari</strong>.</li>
              <li>
                Toque no botão <strong>Compartilhar</strong> (quadrado com uma
                seta para cima).
              </li>
              <li>
                Escolha <strong>Adicionar à Tela de Início</strong> e confirme.
              </li>
            </ol>
          ) : null}

          {platform === "android" && !canPromptInstall ? (
            <ol className="list-decimal space-y-1 pl-6">
              <li>Abra este endereço no <strong>Chrome</strong>.</li>
              <li>Toque no menu <strong>⋮</strong> no canto superior.</li>
              <li>
                Escolha <strong>Instalar app</strong> ou{" "}
                <strong>Adicionar à tela inicial</strong>.
              </li>
            </ol>
          ) : null}

          {platform === "desktop" && !canPromptInstall ? (
            <p>
              No Chrome ou Edge, use o ícone de instalação na barra de
              endereço ou o menu do navegador → <strong>Instalar Cashly</strong>.
              Outros navegadores podem não oferecer instalação.
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

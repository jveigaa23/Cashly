"use client";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

/** Erro nas telas de entrar/cadastrar: recarregar resolve versão nova publicada no meio do caminho. */
export default function AuthError() {
  return (
    <div className="space-y-4">
      <Notice tone="danger" role="alert" title="Não foi possível concluir agora">
        Pode ser a internet ou uma atualização do Cashly. Recarregue a página e tente de novo. Se estava criando uma
        conta, veja antes se o e-mail de confirmação já chegou.
      </Notice>
      <Button onClick={() => window.location.reload()}>Recarregar a página</Button>
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

/**
 * "Tentar novamente" recarrega a página inteira: também resolve o caso de uma
 * versão nova do app publicada enquanto a tela estava aberta.
 */
export default function AppError() {
  return (
    <div className="space-y-4">
      <Notice tone="danger" role="alert" title="Não foi possível carregar esta tela">
        Verifique sua conexão com a internet e tente novamente. Se você estava
        salvando algo, confira se a alteração aparece antes de repetir.
      </Notice>
      <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-4">
      <Notice tone="danger" role="alert" title="Não foi possível carregar esta tela">
        Verifique sua conexão com a internet e tente novamente. Se você estava
        salvando algo, confira se a alteração aparece antes de repetir.
      </Notice>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  );
}

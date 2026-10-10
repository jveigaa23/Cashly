"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      Imprimir ou salvar em PDF
    </Button>
  );
}

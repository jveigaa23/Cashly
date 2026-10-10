import { formatBRL } from "@/lib/format/money";
import { cn } from "@/lib/cn";

/** Valor em reais com dígitos alinhados. */
export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={cn("tabular whitespace-nowrap", className)}>{formatBRL(cents)}</span>;
}

import { Notice } from "@/components/ui/notice";

/**
 * Indica de forma honesta que uma seção ainda não foi implementada.
 * Nunca exibir dados simulados no lugar.
 */
export function ComingSoon({
  phase,
  children,
}: {
  phase: number;
  children: React.ReactNode;
}) {
  return (
    <Notice tone="info" title={`Em construção — chega na Fase ${phase}`}>
      {children}
    </Notice>
  );
}

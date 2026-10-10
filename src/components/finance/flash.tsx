import { Notice } from "@/components/ui/notice";

/** Confirmação após uma ação concluída (vinda de ?chave=1 na URL). */
export function Flash({ params, messages }: { params: Record<string, string | string[] | undefined>; messages: Record<string, string> }) {
  const key = Object.keys(messages).find((k) => params[k] !== undefined);
  if (!key) return null;
  return <Notice tone="success" role="status" title={messages[key]} className="mb-4" />;
}

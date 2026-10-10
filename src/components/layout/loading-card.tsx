import { Card } from "@/components/ui/card";

export function LoadingCard({ label = "Carregando…" }: { label?: string }) {
  return (
    <Card aria-busy="true">
      <p className="text-muted">{label}</p>
    </Card>
  );
}

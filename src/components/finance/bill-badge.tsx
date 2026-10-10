import { SITUATION_LABEL, type BillSituation } from "@/domain/bills";
import { StatusBadge } from "@/components/ui/status-badge";

export function BillBadge({ situation }: { situation: BillSituation }) {
  const { label, tone } = SITUATION_LABEL[situation];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

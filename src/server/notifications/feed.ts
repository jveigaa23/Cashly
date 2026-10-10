import type { NotificationFacts } from "@/domain/notifications";
import type { Database } from "@/lib/supabase/database.types";

export type FeedRow = Database["public"]["Views"]["notification_feed"]["Row"];

export function feedRowToFacts(row: FeedRow): NotificationFacts {
  return {
    event: row.event as NotificationFacts["event"],
    referenceType: row.reference_type as NotificationFacts["referenceType"],
    referenceId: row.reference_id,
    variant: row.variant as NotificationFacts["variant"],
    referenceName: row.reference_name,
    referenceDueDate: row.reference_due_date,
    referenceStatus: row.reference_status,
    installmentNumber: row.installment_number,
    installmentCount: row.installment_count,
    planId: row.plan_id,
    budgetMonth: row.budget_month,
    budgetAlertPercent: row.budget_alert_percent,
    budgetGeneral: row.budget_general,
  };
}

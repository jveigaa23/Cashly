import { cn } from "@/lib/cn";
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  InfoIcon,
  XCircleIcon,
} from "./icons";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const tones: Record<StatusTone, { className: string; Icon: typeof CheckIcon }> =
  {
    success: { className: "bg-success-bg text-success", Icon: CheckIcon },
    warning: { className: "bg-warning-bg text-warning", Icon: ClockIcon },
    danger: { className: "bg-danger-bg text-danger", Icon: AlertIcon },
    info: { className: "bg-info-bg text-info", Icon: InfoIcon },
    neutral: { className: "bg-surface-muted text-muted", Icon: XCircleIcon },
  };

/**
 * Selo de status. O significado nunca depende só da cor:
 * sempre há um ícone e um texto.
 */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  const { className: toneClass, Icon } = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold",
        toneClass,
        className,
      )}
    >
      <Icon width={16} height={16} />
      {children}
    </span>
  );
}

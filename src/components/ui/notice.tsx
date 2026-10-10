import { cn } from "@/lib/cn";
import { AlertIcon, CheckIcon, InfoIcon } from "./icons";

type Tone = "info" | "warning" | "danger" | "success";

const tones: Record<Tone, { className: string; Icon: typeof InfoIcon }> = {
  info: { className: "border-info bg-info-bg", Icon: InfoIcon },
  warning: { className: "border-warning bg-warning-bg", Icon: AlertIcon },
  danger: { className: "border-danger bg-danger-bg", Icon: AlertIcon },
  success: { className: "border-success bg-success-bg", Icon: CheckIcon },
};

/** Caixa de aviso. Use role="alert" apenas para erros que exigem atenção imediata. */
export function Notice({
  tone = "info",
  title,
  children,
  role,
  className,
}: {
  tone?: Tone;
  title: string;
  children?: React.ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  const { className: toneClass, Icon } = tones[tone];
  return (
    <div
      role={role}
      className={cn(
        "flex gap-3 rounded-xl border-l-4 p-4 text-foreground max-[319px]:gap-2 max-[319px]:p-3",
        toneClass,
        className,
      )}
    >
      <Icon className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 text-muted">{children}</div> : null}
      </div>
    </div>
  );
}

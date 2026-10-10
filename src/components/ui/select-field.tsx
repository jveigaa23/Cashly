"use client";

import { useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  /** Texto da opção vazia (ex.: "Sem categoria"). Omitir para não ter opção vazia. */
  emptyLabel?: string;
  errors?: string[];
  hint?: string;
};

export function SelectField({ label, name, options, emptyLabel, errors, hint, className, ...props }: SelectFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-dica` : undefined;
  const errorId = errors?.length ? `${id}-erro` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <select
        id={id}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "min-h-12 w-full rounded-xl border-2 bg-surface px-3 text-lg text-foreground focus:border-primary",
          errors?.length ? "border-danger" : "border-border",
        )}
        {...props}
      >
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {errors?.length ? (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

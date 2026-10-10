"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
};

/**
 * Campo de texto com rótulo visível, dica e erro associados ao input
 * (aria-describedby/aria-invalid). Campos de senha ganham "Mostrar".
 */
export function TextField({ label, name, hint, errors, type = "text", className, ...props }: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-dica` : undefined;
  const errorId = errors?.length ? `${id}-erro` : undefined;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

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
      <div className="relative">
        <input
          id={id}
          name={name}
          type={isPassword && showPassword ? "text" : type}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          className={cn(
            "min-h-12 w-full rounded-xl border-2 bg-surface px-3 text-lg text-foreground",
            "placeholder:text-muted focus:border-primary focus:outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
            errors?.length ? "border-danger" : "border-border",
            isPassword && "pr-24",
          )}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-controls={id}
            className="absolute inset-y-0 right-0 min-w-16 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-surface-muted"
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        ) : null}
      </div>
      {errors?.length ? (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

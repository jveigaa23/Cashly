"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

/** Botão de envio que se desativa e avisa enquanto o servidor responde (evita envio duplo). */
export function SubmitButton({ children, pendingText = "Aguarde…", ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} aria-disabled={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

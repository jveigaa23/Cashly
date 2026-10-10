import { Notice } from "./notice";

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Valores para repreencher o formulário após erro (nunca senhas). */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };

/** Mensagem geral do formulário, anunciada ao leitor de tela. */
export function FormMessage({ state }: { state: FormState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <Notice
      role={state.status === "error" ? "alert" : "status"}
      tone={state.status === "error" ? "danger" : "success"}
      title={state.message}
    />
  );
}

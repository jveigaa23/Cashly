"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/form-message";
import { safeNextPath } from "@/lib/auth/routes";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  fieldErrors,
  forgotPasswordSchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import { authErrorMessage, logServerError } from "./errors";
import { requireUser } from "./session";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

function callbackUrl(next: string) {
  return `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: text(form, "email"), password: text(form, "password") });
  if (!parsed.success) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error), values: { email: text(form, "email") } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code !== "invalid_credentials") logServerError("signIn", error);
    return { status: "error", message: authErrorMessage(error.code), values: { email: parsed.data.email } };
  }
  redirect(safeNextPath(text(form, "next")));
}

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { name: text(form, "name"), email: text(form, "email") };
  const parsed = signUpSchema.safeParse({ ...values, password: text(form, "password"), confirmPassword: text(form, "confirmPassword") });
  if (!parsed.success) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error), values };
  }

  const supabase = await createClient();
  const next = safeNextPath(text(form, "next"), "/bem-vindo");
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: callbackUrl(next),
      data: { display_name: parsed.data.name },
    },
  });
  if (error) {
    logServerError("signUp", error);
    return { status: "error", message: authErrorMessage(error.code), values };
  }

  // Confirmação de e-mail desativada no projeto: a sessão já existe.
  if (data.session) redirect(next);

  // Por segurança o Supabase responde igual quando o e-mail já tem conta.
  return {
    status: "success",
    message: `Enviamos um link de confirmação para ${parsed.data.email}. Abra o e-mail neste aparelho e toque no link para ativar a conta. Se já tiver conta, use "Entrar".`,
  };
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: text(form, "email") });
  if (!parsed.success) {
    return { status: "error", message: "Confira o e-mail.", fieldErrors: fieldErrors(parsed.error), values: { email: text(form, "email") } };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl("/redefinir-senha"),
  });
  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) {
    return { status: "error", message: authErrorMessage(error.code), values: { email: parsed.data.email } };
  }
  if (error) logServerError("resetPassword", error);
  // Mesma resposta exista ou não a conta (não revela quais e-mails estão cadastrados).
  return {
    status: "success",
    message: "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Abra o e-mail neste aparelho.",
  };
}

export async function updatePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const parsed = newPasswordSchema.safeParse({ password: text(form, "password"), confirmPassword: text(form, "confirmPassword") });
  if (!parsed.success) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logServerError("updatePassword", error);
    return { status: "error", message: authErrorMessage(error.code) };
  }
  return { status: "success", message: "Senha alterada com sucesso." };
}

export async function signOutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) logServerError("signOut", error);
  redirect("/entrar");
}

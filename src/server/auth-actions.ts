"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/form-message";
import { safeNextPath } from "@/lib/auth/routes";
import { publicEnv } from "@/lib/env";
import { auth } from "@/lib/auth/server";
import {
  fieldErrors,
  forgotPasswordSchema,
  changePasswordSchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import { authErrorCode, authErrorMessage, logServerError } from "./errors";
import { isPasswordLeaked } from "./password-check";
import { requireUser } from "./session";

const LEAKED_MESSAGE = "Essa senha já apareceu em vazamentos de dados na internet. Escolha outra senha.";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Para onde o link do e-mail de nova senha leva (o Neon Auth acrescenta ?token=...). */
function resetPasswordUrl() {
  return `${publicEnv().NEXT_PUBLIC_SITE_URL}/redefinir-senha`;
}

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: text(form, "email"), password: text(form, "password") });
  if (!parsed.success) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error), values: { email: text(form, "email") } };
  }

  const { error } = await auth().signIn.email(parsed.data);
  if (error) {
    const code = authErrorCode(error);
    if (code !== "invalid_credentials") logServerError("signIn", { code });
    return { status: "error", message: authErrorMessage(code), values: { email: parsed.data.email } };
  }
  redirect(safeNextPath(text(form, "next")));
}

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { name: text(form, "name"), email: text(form, "email") };
  const parsed = signUpSchema.safeParse({ ...values, password: text(form, "password"), confirmPassword: text(form, "confirmPassword") });
  if (!parsed.success) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error), values };
  }

  if (await isPasswordLeaked(parsed.data.password)) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors: { password: [LEAKED_MESSAGE] }, values };
  }

  const next = safeNextPath(text(form, "next"), "/bem-vindo");
  const { error } = await auth().signUp.email({
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.name,
  });
  if (error) {
    const code = authErrorCode(error);
    if (code !== "user_already_exists") logServerError("signUp", { code });
    return { status: "error", message: authErrorMessage(code), values };
  }

  // Sem confirmação de e-mail no projeto: a sessão já existe.
  redirect(next);
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: text(form, "email") });
  if (!parsed.success) {
    return { status: "error", message: "Confira o e-mail.", fieldErrors: fieldErrors(parsed.error), values: { email: text(form, "email") } };
  }
  const { error } = await auth().requestPasswordReset({
    email: parsed.data.email,
    redirectTo: resetPasswordUrl(),
  });
  const code = error ? authErrorCode(error) : undefined;
  if (code === "over_request_rate_limit") {
    return { status: "error", message: authErrorMessage(code), values: { email: parsed.data.email } };
  }
  if (error) logServerError("resetPassword", { code });
  // Mesma resposta exista ou não a conta (não revela quais e-mails estão cadastrados).
  return {
    status: "success",
    message: "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Abra o e-mail neste aparelho.",
  };
}

/** Nova senha a partir do link do e-mail (sem sessão; o token vem do link). */
export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = text(form, "token");
  const parsed = newPasswordSchema.safeParse({ password: text(form, "password"), confirmPassword: text(form, "confirmPassword") });
  if (!parsed.success) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
  }
  if (!token) return { status: "error", message: authErrorMessage("invalid_token") };
  if (await isPasswordLeaked(parsed.data.password)) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors: { password: [LEAKED_MESSAGE] } };
  }

  const { error } = await auth().resetPassword({ newPassword: parsed.data.password, token });
  if (error) {
    const code = authErrorCode(error);
    if (code !== "invalid_token") logServerError("resetPassword", { code });
    return { status: "error", message: authErrorMessage(code) };
  }
  return { status: "success", message: "Senha criada. Agora é só entrar com o seu e-mail e a nova senha." };
}

/** Troca de senha de quem já está logado (exige a senha atual). */
export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: text(form, "currentPassword"),
    password: text(form, "password"),
    confirmPassword: text(form, "confirmPassword"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
  }
  if (await isPasswordLeaked(parsed.data.password)) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors: { password: [LEAKED_MESSAGE] } };
  }

  const { error } = await auth().changePassword({
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.password,
    revokeOtherSessions: true,
  });
  if (error) {
    const code = authErrorCode(error);
    if (code === "invalid_password") {
      return { status: "error", message: "Confira os campos destacados.", fieldErrors: { currentPassword: ["Senha atual incorreta."] } };
    }
    logServerError("changePassword", { code });
    return { status: "error", message: authErrorMessage(code) };
  }
  return { status: "success", message: "Senha alterada com sucesso." };
}

export async function signOutAction() {
  const { error } = await auth().signOut();
  if (error) logServerError("signOut", { code: authErrorCode(error) });
  redirect("/entrar");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { acceptInviteSchema, createHouseholdSchema, fieldErrors, inviteSchema } from "@/lib/validation/auth";
import { logServerError, rpcErrorMessage } from "./errors";
import { getMembership, requireOwner, requireUser } from "./session";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function createHouseholdAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  if (await getMembership()) redirect("/");

  const values = { householdName: text(form, "householdName"), displayName: text(form, "displayName") };
  const parsed = createHouseholdSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error), values };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_household", {
    p_name: parsed.data.householdName,
    p_display_name: parsed.data.displayName,
  });
  if (error) {
    logServerError("create_household", error);
    return { status: "error", message: rpcErrorMessage(error), values };
  }
  redirect("/");
}

export type InviteState = FormState & { link?: string; email?: string };

export async function createInviteAction(_prev: InviteState, form: FormData): Promise<InviteState> {
  // household_id e papel vêm da sessão; o banco confere de novo.
  await requireOwner();
  const parsed = inviteSchema.safeParse({ email: text(form, "email") });
  if (!parsed.success) {
    return { status: "error", message: "Confira o e-mail.", fieldErrors: fieldErrors(parsed.error), values: { email: text(form, "email") } };
  }

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_household_invite", { p_email: parsed.data.email });
  if (error || !token) {
    logServerError("create_household_invite", error);
    return { status: "error", message: rpcErrorMessage(error), values: { email: parsed.data.email } };
  }

  revalidatePath("/ajustes");
  return {
    status: "success",
    message: "Convite criado. Envie o link abaixo para a pessoa (vale por 7 dias).",
    link: `${publicEnv().NEXT_PUBLIC_SITE_URL}/convite/${token}`,
    email: parsed.data.email,
  };
}

export async function revokeInviteAction(form: FormData): Promise<void> {
  await requireOwner();
  const id = z.uuid().safeParse(text(form, "inviteId"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_household_invite", { p_invite_id: id.data });
  if (error) logServerError("revoke_household_invite", error);
  revalidatePath("/ajustes");
}

export async function acceptInviteAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const values = { displayName: text(form, "displayName") };
  const parsed = acceptInviteSchema.safeParse({ token: text(form, "token"), ...values });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return {
      status: "error",
      message: errors.token ? "Este link de convite está incompleto. Peça um novo convite." : "Confira os campos destacados.",
      fieldErrors: errors,
      values,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_household_invite", {
    p_token: parsed.data.token,
    p_display_name: parsed.data.displayName,
  });
  if (error) {
    logServerError("accept_household_invite", error);
    return { status: "error", message: rpcErrorMessage(error), values };
  }
  redirect("/");
}

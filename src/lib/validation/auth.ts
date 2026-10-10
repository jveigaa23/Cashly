import { z } from "zod";

const email = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail muito longo.")
  .pipe(z.email({ error: "E-mail inválido. Confira se digitou certo." }));

export const PASSWORD_MIN = 8;

const newPassword = z
  .string({ error: "Crie uma senha." })
  .min(PASSWORD_MIN, `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`)
  .max(72, "A senha pode ter no máximo 72 caracteres.");

const personName = z
  .string({ error: "Informe seu nome." })
  .trim()
  .min(1, "Informe seu nome.")
  .max(60, "Use no máximo 60 caracteres.");

export const signInSchema = z.object({
  email,
  password: z.string({ error: "Informe a senha." }).min(1, "Informe a senha."),
});

export const signUpSchema = z
  .object({
    name: personName,
    email,
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não são iguais.",
  });

export const forgotPasswordSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não são iguais.",
  });

export const createHouseholdSchema = z.object({
  householdName: z
    .string()
    .trim()
    .min(1, "Dê um nome para a família.")
    .max(80, "Use no máximo 80 caracteres."),
  displayName: personName,
});

export const inviteSchema = z.object({ email });

export const acceptInviteSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, "Convite inválido."),
  displayName: personName,
});

export type FieldErrors = Record<string, string[] | undefined>;

/** Converte erros do Zod em mensagens por campo. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}

import { describe, expect, it } from "vitest";
import {
  acceptInviteSchema,
  createHouseholdSchema,
  fieldErrors,
  signInSchema,
  signUpSchema,
} from "./auth";

describe("validação de formulários de acesso", () => {
  it("normaliza e-mail (espaços e maiúsculas)", () => {
    const r = signInSchema.parse({ email: "  Maria@Exemplo.COM ", password: "x" });
    expect(r.email).toBe("maria@exemplo.com");
  });

  it("rejeita e-mail inválido com mensagem em português", () => {
    const r = signInSchema.safeParse({ email: "maria@", password: "x" });
    expect(r.success).toBe(false);
    expect(fieldErrors(r.error!).email).toEqual(["E-mail inválido. Confira se digitou certo."]);
  });

  it("cadastro exige senha de 8+ caracteres e confirmação igual", () => {
    const short = signUpSchema.safeParse({ name: "Ana", email: "a@b.co", password: "1234567", confirmPassword: "1234567" });
    expect(fieldErrors(short.error!).password).toEqual(["A senha precisa ter pelo menos 8 caracteres."]);

    const mismatch = signUpSchema.safeParse({ name: "Ana", email: "a@b.co", password: "12345678", confirmPassword: "12345679" });
    expect(fieldErrors(mismatch.error!).confirmPassword).toEqual(["As senhas não são iguais."]);

    expect(signUpSchema.safeParse({ name: " Ana ", email: "a@b.co", password: "12345678", confirmPassword: "12345678" }).data?.name).toBe("Ana");
  });

  it("nome não pode ser só espaços", () => {
    const r = createHouseholdSchema.safeParse({ householdName: "   ", displayName: "Ana" });
    expect(fieldErrors(r.error!).householdName).toEqual(["Dê um nome para a família."]);
  });

  it("token de convite tem formato fixo", () => {
    expect(acceptInviteSchema.safeParse({ token: "a".repeat(64), displayName: "Pai" }).success).toBe(true);
    expect(acceptInviteSchema.safeParse({ token: "../../etc", displayName: "Pai" }).success).toBe(false);
  });
});

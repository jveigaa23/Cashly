import { describe, expect, it } from "vitest";
import { isGuestOnlyPath, isPublicPath, safeNextPath } from "./routes";

describe("rotas públicas", () => {
  it.each(["/entrar", "/cadastro", "/esqueci-senha", "/redefinir-senha", "/convite/abc"])("%s é pública", (p) => {
    expect(isPublicPath(p)).toBe(true);
  });

  it.each(["/", "/contas", "/ajustes", "/entrarx", "/convites", "/bem-vindo", "/auth/callback"])(
    "%s exige login",
    (p) => expect(isPublicPath(p)).toBe(false),
  );

  it("convite e nova senha não são 'só para visitantes'", () => {
    expect(isGuestOnlyPath("/convite/abc")).toBe(false);
    expect(isGuestOnlyPath("/redefinir-senha")).toBe(false);
    expect(isGuestOnlyPath("/entrar")).toBe(true);
  });
});

describe("safeNextPath (sem redirecionamento aberto)", () => {
  it.each([
    ["/contas", "/contas"],
    ["/contas?mes=2026-10", "/contas?mes=2026-10"],
    ["/convite/abc", "/convite/abc"],
  ])("%s → %s", (input, expected) => expect(safeNextPath(input)).toBe(expected));

  it.each([
    "https://malicioso.com",
    "//malicioso.com",
    "/\\malicioso.com",
    "javascript:alert(1)",
    "",
    null,
    undefined,
    "contas",
  ])("%j cai no padrão", (input) => expect(safeNextPath(input)).toBe("/"));
});

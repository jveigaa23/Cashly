import { describe, expect, it } from "vitest";
import { authorizeCron } from "./cron-auth";

const SECRET = "s".repeat(40);

describe("authorizeCron", () => {
  it("aceita só o segredo exato", () => {
    expect(authorizeCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(authorizeCron(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(authorizeCron(SECRET, SECRET)).toBe(false);
    expect(authorizeCron(null, SECRET)).toBe(false);
  });
  it("sem segredo configurado (ou curto demais) recusa tudo", () => {
    expect(authorizeCron("Bearer ", undefined)).toBe(false);
    expect(authorizeCron("Bearer abc", "abc")).toBe(false);
  });
});

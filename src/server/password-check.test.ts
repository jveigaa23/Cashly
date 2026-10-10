import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { isPasswordLeaked } = await import("./password-check");

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const LEAKED_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

function fakeFetch(body: string, ok = true) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    void init;
    return new Response(body, { status: ok ? 200 : 503, headers: { "x-url": String(url) } });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("senha vazada (k-anonymity)", () => {
  it("envia só o prefixo de 5 caracteres do hash e detecta a senha vazada", async () => {
    const f = fakeFetch(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${LEAKED_SUFFIX}:9545824\r\nFFFFF:0`);
    expect(await isPasswordLeaked("password", f)).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect(String(url)).not.toContain(LEAKED_SUFFIX); // só o prefixo sai do servidor
    expect((init?.headers as Record<string, string>)["Add-Padding"]).toBe("true");
  });

  it("senha não listada, ou listada só como preenchimento (contagem 0)", async () => {
    expect(await isPasswordLeaked("password", fakeFetch("0018A45C4D1DEF81644B54AB7F969B88D65:3"))).toBe(false);
    expect(await isPasswordLeaked("password", fakeFetch(`${LEAKED_SUFFIX}:0`))).toBe(false);
  });

  it("serviço indisponível ou com erro: não bloqueia (null)", async () => {
    expect(await isPasswordLeaked("password", fakeFetch("", false))).toBeNull();
    const broken = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await isPasswordLeaked("password", broken)).toBeNull();
  });

  it("pode ser desligado por configuração", async () => {
    vi.stubEnv("PASSWORD_LEAK_CHECK", "off");
    const f = fakeFetch(`${LEAKED_SUFFIX}:1`);
    expect(await isPasswordLeaked("password", f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

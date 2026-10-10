import "server-only";
import { createHash } from "node:crypto";

/**
 * Verifica se a senha aparece em vazamentos conhecidos (HaveIBeenPwned,
 * Pwned Passwords) por k-anonymity: só os 5 primeiros caracteres do hash
 * SHA-1 saem do servidor; a senha nunca é enviada nem registrada.
 *
 * Retorna true/false, ou null quando não foi possível verificar (serviço
 * fora do ar ou desligado por PASSWORD_LEAK_CHECK=off). Nesse caso o
 * cadastro segue, pois as demais regras de senha continuam valendo.
 */
export async function isPasswordLeaked(password: string, fetchImpl: typeof fetch = fetch): Promise<boolean | null> {
  if (process.env.PASSWORD_LEAK_CHECK === "off") return null;
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "Cashly" },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [s, count] = line.trim().split(":");
      return s === suffix && Number(count) > 0;
    });
  } catch {
    return null;
  }
}

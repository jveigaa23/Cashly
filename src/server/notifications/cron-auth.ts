import { createHash, timingSafeEqual } from "node:crypto";

/** Compara "Bearer <segredo>" em tempo constante. Segredo ausente ou curto = sempre recusa. */
export function authorizeCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

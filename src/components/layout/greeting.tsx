import { requireMember } from "@/server/session";

export async function Greeting() {
  const { displayName, householdName } = await requireMember();
  return (
    <p className="mt-1 text-muted">
      Olá, {displayName}! Família {householdName}.
    </p>
  );
}

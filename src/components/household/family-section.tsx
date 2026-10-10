import { Card, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/server/errors";
import { revokeInviteAction } from "@/server/household-actions";
import { requireMember } from "@/server/session";
import { InviteForm } from "./invite-form";

export async function FamilySection() {
  const membership = await requireMember();
  const supabase = await createClient();
  const isOwner = membership.role === "owner";

  const [members, invites] = await Promise.all([
    supabase.from("household_members").select("id, display_name, role").order("created_at"),
    isOwner
      ? supabase
          .from("household_invites")
          .select("id, email, expires_at")
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (members.error || invites.error) {
    logServerError("FamilySection", members.error ?? invites.error);
    throw new Error("Não foi possível carregar a família.");
  }

  return (
    <Card aria-labelledby="familia">
      <CardTitle id="familia">Família: {membership.householdName}</CardTitle>
      <ul className="mt-3 divide-y divide-border">
        {members.data.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span className="font-medium">
              {m.display_name}
              {m.id === membership.memberId ? <span className="text-muted"> (você)</span> : null}
            </span>
            <StatusBadge tone={m.role === "owner" ? "info" : "neutral"}>
              {m.role === "owner" ? "Responsável principal" : "Membro"}
            </StatusBadge>
          </li>
        ))}
      </ul>

      {isOwner ? (
        <div className="mt-5 border-t border-border pt-5">
          <h3 className="mb-3 text-lg font-semibold">Convidar outra pessoa</h3>
          <InviteForm />

          {invites.data.length ? (
            <div className="mt-5">
              <h3 className="mb-2 font-semibold">Convites aguardando</h3>
              <ul className="divide-y divide-border">
                {invites.data.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="break-all font-medium">{invite.email}</p>
                      <p className="text-sm text-muted">
                        Vale até {formatDateTime(invite.expires_at, membership.timezone)}
                      </p>
                    </div>
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <button
                        type="submit"
                        className="min-h-12 rounded-xl px-3 font-semibold text-danger hover:bg-danger-bg"
                      >
                        Cancelar convite
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

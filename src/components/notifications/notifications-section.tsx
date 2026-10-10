import { Card, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { pushConfig, whatsappStatus } from "@/server/notifications/config";
import { countDevices, loadPreferences } from "@/server/notifications/queries";
import { requireMember } from "@/server/session";
import { PreferencesForm } from "./preferences-form";
import { PushDevice } from "./push-device";

export async function NotificationsSection() {
  await requireMember();
  const [prefs, devices] = await Promise.all([loadPreferences(), countDevices()]);
  const push = pushConfig();
  const whatsapp = whatsappStatus();
  return (
    <Card aria-labelledby="avisos-titulo" id="avisos" className="scroll-mt-20">
      <CardTitle id="avisos-titulo">Avisos</CardTitle>
      <p className="mt-1 text-muted">Cada pessoa escolhe os próprios avisos. Os avisos não mostram valores; toque para ver no app.</p>

      <h3 className="mt-5 font-semibold">Neste aparelho</h3>
      <div className="mt-2">
        <PushDevice publicKey={push?.publicKey ?? null} devices={devices} />
      </div>

      <h3 className="mt-6 font-semibold">O que avisar</h3>
      <div className="mt-2">
        <PreferencesForm prefs={prefs} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <h3 className="font-semibold">WhatsApp</h3>
        <StatusBadge tone="neutral">Não configurado</StatusBadge>
      </div>
      <p className="mt-1 text-sm text-muted">
        {whatsapp.configured || whatsapp.reason === "Não configurado." ? "" : `${whatsapp.reason} `}Enviar pelo WhatsApp exige uma conta WhatsApp Business da Meta, um número
        próprio e modelos de mensagem aprovados, com custo por conversa. Fica desligado até a família decidir.
      </p>
    </Card>
  );
}

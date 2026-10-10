import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountsSection } from "@/components/finance/accounts-section";
import { AccountSection } from "@/components/household/account-section";
import { FamilySection } from "@/components/household/family-section";
import { NotificationsSection } from "@/components/notifications/notifications-section";
import { PageHeader } from "@/components/layout/page-header";
import { InstallGuide } from "@/components/pwa/install-guide";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Ajustes" };

function SectionLoading({ label }: { label: string }) {
  return (
    <Card aria-busy="true">
      <p className="text-muted">Carregando {label}…</p>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="space-y-4">
        <Suspense fallback={<SectionLoading label="família" />}>
          <FamilySection />
        </Suspense>
        <Suspense fallback={<SectionLoading label="contas" />}>
          <AccountsSection />
        </Suspense>
        <Suspense fallback={<SectionLoading label="avisos" />}>
          <NotificationsSection />
        </Suspense>
        <Card>
          <ThemeToggle />
        </Card>
        <InstallGuide />
        <Suspense fallback={<SectionLoading label="conta" />}>
          <AccountSection />
        </Suspense>
      </div>
    </>
  );
}

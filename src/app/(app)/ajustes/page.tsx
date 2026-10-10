import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { InstallGuide } from "@/components/pwa/install-guide";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Ajustes" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="space-y-4">
        <Card>
          <ThemeToggle />
        </Card>
        <InstallGuide />
      </div>
    </>
  );
}

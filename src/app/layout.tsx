import type { Metadata, Viewport } from "next";
import { PwaRegistrar } from "@/components/pwa/pwa-registrar";
import { installPromptCaptureScript } from "@/components/pwa/pwa-store";
import { themeInitScript } from "@/components/theme/theme";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME } from "@/lib/app-config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_SHORT_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_SHORT_NAME,
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#151d1a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo antes da primeira pintura (evita "piscar"). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: installPromptCaptureScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        {children}
        <PwaRegistrar />
      </body>
    </html>
  );
}

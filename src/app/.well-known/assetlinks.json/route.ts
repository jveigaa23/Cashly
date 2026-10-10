import { NextResponse } from "next/server";
import { assetLinks } from "@/lib/android";

/**
 * Digital Asset Links: prova ao Android que o APK (Trusted Web Activity) e
 * este site são do mesmo dono — o app abre em tela cheia, sem barra de
 * endereço. Configurado por ANDROID_PACKAGE_NAME e ANDROID_CERT_SHA256.
 */
export async function GET() {
  const links = assetLinks(process.env.ANDROID_PACKAGE_NAME, process.env.ANDROID_CERT_SHA256);
  if (!links) return new NextResponse("Não configurado", { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(links, { headers: { "Cache-Control": "public, max-age=3600" } });
}

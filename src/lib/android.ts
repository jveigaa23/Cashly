/** Formato do certificado: 32 bytes em hexadecimal separados por ":" (keytool/PWABuilder). */
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const PACKAGE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;

/**
 * Conteúdo de /.well-known/assetlinks.json. Aceita várias impressões digitais
 * separadas por vírgula (chave de envio + chave da Google Play). Entrada
 * inválida = null (a rota responde 404 em vez de publicar algo errado).
 */
export function assetLinks(packageName: string | undefined, fingerprints: string | undefined) {
  const pkg = packageName?.trim();
  const certs = (fingerprints ?? "").split(",").map((f) => f.trim().toUpperCase()).filter(Boolean);
  if (!pkg || !PACKAGE.test(pkg) || certs.length === 0 || !certs.every((c) => FINGERPRINT.test(c))) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: certs },
    },
  ];
}

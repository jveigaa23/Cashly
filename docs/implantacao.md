# Implantação (produção)

## Onde roda

| Peça | Serviço | Detalhe |
| --- | --- | --- |
| App (Next.js) | Vercel, projeto `cashly` (time "veiga"), plano Hobby (gratuito) | Funções em São Paulo (`gru1`, `vercel.json`) |
| Endereço | **https://cashly-familia.vercel.app** | HTTPS automático |
| Banco e login | Neon `cashly` (`broad-leaf-06438164`), São Paulo (`aws-sa-east-1`), plano gratuito; Neon Auth | Migrações em `db/migrations` ([banco.md](banco.md)) |
| Avisos no celular | Vercel Cron diário, 11:00 UTC (~8h de Brasília) | `/api/cron/notificacoes` |

Cada `git push` no branch de produção (`claude/family-finance-app-ifam9d`)
publica uma nova versão. Os aparelhos mostram "Nova versão disponível" e
atualizam ao tocar em "Atualizar". Para voltar a uma versão anterior:
Vercel → projeto → Deployments → versão anterior → "Instant Rollback".

Versões diferentes abertas no celular: `deploymentId` (= `VERCEL_DEPLOYMENT_ID`)
faz o Next recarregar a página quando detecta uma versão antiga, e a chave
fixa das Server Actions evita o erro "Failed to find Server Action" em
formulários abertos durante um deploy.

## Proteção do projeto na Vercel

"Vercel Authentication" vale só para as prévias e URLs internas de cada
deploy; o endereço de produção é público (o app tem login próprio).

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Tipo | Situação |
| --- | --- | --- |
| `NEON_AUTH_BASE_URL` | servidor | URL do Neon Auth (Console → Auth) |
| `NEON_AUTH_COOKIE_SECRET` | **sensível** | 32+ caracteres aleatórios (`openssl rand -base64 32`); trocar desloga todo mundo |
| `NEON_DATA_API_URL` | servidor | URL do Data API (termina em `/rest/v1`) |
| `NEXT_PUBLIC_SITE_URL` | pública | `https://cashly-familia.vercel.app` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | pública | configurada |
| `VAPID_PRIVATE_KEY` | **sensível**, só produção | configurada (gerada para este projeto) |
| `VAPID_SUBJECT` | pública | URL do app |
| `CRON_SECRET` | **sensível**, só produção | configurada (gerada para este projeto) |
| `DATABASE_URL` | **sensível**, só produção | connection string do Neon (só o agendador usa) |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | **sensível** | configurada: mantém formulários abertos válidos depois de um redeploy |
| `ANDROID_PACKAGE_NAME`, `ANDROID_CERT_SHA256` | públicas | opcionais — só para o APK (ver abaixo) |

Variáveis `NEXT_PUBLIC_*` e as do Android entram no build: depois de mudar,
faça um novo deploy (Deployments → ⋯ → Redeploy).

### DATABASE_URL (agendador dos avisos no celular)

1. Neon → projeto cashly → Connect → copiar a connection string (branch
   `main`, banco `cashly`).
2. Vercel → cashly → Settings → Environment Variables → Add: nome
   `DATABASE_URL`, valor colado, tipo **Sensitive**, ambiente
   **Production** apenas.
3. Redeploy. Sem ela, os avisos continuam no sino do app; só o envio para o
   celular fica parado (a rota responde 503 dizendo o que falta).

O agendador usa essa conexão só como `service_role`. Nunca colocar a
connection string no código, em `NEXT_PUBLIC_*` ou em mensagens.

## Neon → Auth → Configuration

- **Trusted domains**: `https://cashly-familia.vercel.app` (e o endereço
  de uma prévia, se for testar nela).

Os links de "Esqueci minha senha" voltam para `NEXT_PUBLIC_SITE_URL/redefinir-senha`.

## Instalar no celular

**Caminho recomendado (sem APK):** no Samsung, abrir o endereço no
**Chrome**, entrar e tocar em "Instalar app" (ou ⋮ → "Instalar app"). O
Chrome cria um app de verdade (WebAPK): ícone na gaveta de apps, tela cheia,
notificações, atualização automática. Não precisa liberar "fontes
desconhecidas".

**APK para enviar por WhatsApp (opcional), via PWABuilder:**

1. Abrir https://www.pwabuilder.com, informar `https://cashly-familia.vercel.app`.
2. "Package for stores" → **Android** → "Generate Package". Sugestão de
   Package ID: `app.vercel.cashly_familia.twa`. Deixar "Signing key" em
   "New" (o PWABuilder cria a chave).
3. Baixar o `.zip`. Ele contém o APK, o AAB e a **chave de assinatura**
   (`signing.keystore` + senhas em `signing-key-info.txt`). **Guardar a chave
   em lugar seguro** (ex.: Google Drive pessoal): sem ela não é possível
   atualizar o APK depois.
4. No `assetlinks.json` que vem no zip, copiar `package_name` e o valor de
   `sha256_cert_fingerprints`. Na Vercel, cadastrar
   `ANDROID_PACKAGE_NAME` e `ANDROID_CERT_SHA256` (vários certificados:
   separar por vírgula) e fazer Redeploy. Conferir em
   `https://cashly-familia.vercel.app/.well-known/assetlinks.json`.
5. Enviar o `.apk` para o celular; ao abrir, o Android pede para permitir
   instalar de "fontes desconhecidas" para o app usado (WhatsApp/Arquivos).

Com o `assetlinks.json` certo, o app abre em tela cheia; sem ele, aparece
uma barra de endereço no topo. O APK é só uma "casca": o conteúdo continua
vindo do site e se atualiza sozinho.

## Limites dos planos gratuitos

- **Neon**: o banco gratuito desliga sozinho depois de alguns minutos sem uso
  e liga na primeira consulta (a primeira tela pode demorar um pouco mais).
  Nada é pausado por dias nem perdido.
- **Neon**: restauração a um ponto no tempo nas últimas 6 horas. Recomendação:
  baixar a planilha do ano em Relatórios → Ano → "Baixar planilha (CSV)"
  todo mês, e antes de qualquer mudança grande.
- **Vercel Hobby**: uso pessoal/não comercial; cron no máximo 1x por dia,
  horário aproximado.

## Conferência pós-deploy

- `/entrar` abre com HTTPS, cabeçalhos de segurança e CSP.
- `/api/cron/notificacoes` sem o segredo responde 401.
- "Esqueci minha senha" envia o e-mail do Neon Auth e o link abre `/redefinir-senha`.
- `/.well-known/assetlinks.json`: 404 até configurar o Android.

# Implantação (produção)

## Onde roda

| Peça | Serviço | Detalhe |
| --- | --- | --- |
| App (Next.js) | Vercel, projeto `cashly` (time "veiga"), plano Hobby (gratuito) | Funções em São Paulo (`gru1`, `vercel.json`) |
| Endereço | **https://cashly-familia.vercel.app** | HTTPS automático |
| Banco e login | Supabase `cashly` (`fnukwrwfdwgufwnsqiia`), São Paulo (`sa-east-1`), plano gratuito | Migrações em `supabase/migrations` |
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
| `NEXT_PUBLIC_SUPABASE_URL` | pública | configurada |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pública (protegida pelo RLS) | configurada |
| `NEXT_PUBLIC_SITE_URL` | pública | `https://cashly-familia.vercel.app` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | pública | configurada |
| `VAPID_PRIVATE_KEY` | **sensível**, só produção | configurada (gerada para este projeto) |
| `VAPID_SUBJECT` | pública | URL do app |
| `CRON_SECRET` | **sensível**, só produção | configurada (gerada para este projeto) |
| `SUPABASE_SECRET_KEY` | **sensível**, só produção | configurada pelo responsável |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | **sensível** | configurada: mantém formulários abertos válidos depois de um redeploy |
| `ANDROID_PACKAGE_NAME`, `ANDROID_CERT_SHA256` | públicas | opcionais — só para o APK (ver abaixo) |

Variáveis `NEXT_PUBLIC_*` e as do Android entram no build: depois de mudar,
faça um novo deploy (Deployments → ⋯ → Redeploy).

### SUPABASE_SECRET_KEY (agendador dos avisos no celular)

1. Supabase → Project Settings → API Keys → "Secret keys" → criar/copiar
   (`sb_secret_...`).
2. Vercel → cashly → Settings → Environment Variables → Add: nome
   `SUPABASE_SECRET_KEY`, valor colado, tipo **Sensitive**, ambiente
   **Production** apenas.
3. Redeploy. Sem ela, os avisos continuam no sino do app; só o envio para o
   celular fica parado (a rota responde 503 dizendo o que falta).

Nunca colocar essa chave no código, em `NEXT_PUBLIC_*` ou em mensagens.

## Supabase → Authentication → URL Configuration

- **Site URL**: `https://cashly-familia.vercel.app`
- **Redirect URLs**: `https://cashly-familia.vercel.app/auth/callback`
  (manter `http://localhost:3000/auth/callback` para desenvolvimento)

Sem isso, os links dos e-mails (confirmação, recuperação de senha) apontam
para o endereço errado.

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

- **Supabase**: projetos gratuitos **pausam após 7 dias sem uso**. O uso
  diário dos pais e o agendador (depois da `SUPABASE_SECRET_KEY`) mantêm o
  projeto ativo. Se pausar, reativar no painel do Supabase (dados mantidos).
- **Supabase**: o plano gratuito não oferece backup baixável. Recomendação:
  baixar a planilha do ano em Relatórios → Ano → "Baixar planilha (CSV)"
  todo mês, e antes de qualquer mudança grande.
- **Vercel Hobby**: uso pessoal/não comercial; cron no máximo 1x por dia,
  horário aproximado.

## Conferência pós-deploy

- `/entrar` abre com HTTPS, cabeçalhos de segurança e CSP.
- `/api/cron/notificacoes` sem o segredo responde 401.
- Cadastro de uma conta nova recebe o e-mail de confirmação (SMTP).
- `/.well-known/assetlinks.json`: 404 até configurar o Android.

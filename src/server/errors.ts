/**
 * Tradução de erros do Supabase/Postgres para mensagens claras.
 * Nunca repassar a mensagem técnica para a tela, nem registrar dados sensíveis.
 */

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar. Procure a mensagem do Cashly na sua caixa de entrada.",
  weak_password: "Senha muito fraca. Use uma senha mais longa, misturando letras e números.",
  same_password: "A nova senha precisa ser diferente da atual.",
  over_email_send_rate_limit: "Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  email_address_invalid: "E-mail inválido. Confira se digitou certo.",
  signup_disabled: "Novos cadastros estão desativados.",
  session_not_found: "Sua sessão expirou. Entre novamente.",
  otp_expired: "O link expirou. Peça um novo.",
};

export function authErrorMessage(code: string | undefined): string {
  return (code && AUTH_MESSAGES[code]) || "Não foi possível concluir agora. Tente de novo em instantes.";
}

const RPC_MESSAGES: Record<string, string> = {
  not_authenticated: "Sua sessão expirou. Entre novamente.",
  already_member: "Essa pessoa já participa de uma família no Cashly.",
  not_owner: "Somente quem criou a família pode fazer isso.",
  invite_invalid: "Este convite não é mais válido. Ele pode ter expirado, sido usado ou cancelado. Peça um novo convite.",
  invite_email_mismatch: "Este convite foi enviado para outro e-mail. Entre com o e-mail que recebeu o convite.",
  rate_limited: "Muitos convites hoje. Tente novamente amanhã.",
};

/** Funções do banco sinalizam erros conhecidos pela mensagem (ex.: 'invite_invalid'). */
export function rpcErrorMessage(error: { message?: string } | null | undefined): string {
  const key = error?.message?.trim();
  return (key && RPC_MESSAGES[key]) || "Não foi possível concluir agora. Tente de novo em instantes.";
}

/** Registro de erro sem dados pessoais/financeiros: só código e contexto. */
export function logServerError(context: string, error: { code?: string; message?: string } | null | undefined) {
  console.error(`[cashly] ${context}`, { code: error?.code ?? "desconhecido" });
}

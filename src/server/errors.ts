/**
 * Tradução de erros do Neon Auth/Postgres para mensagens claras.
 * Nunca repassar a mensagem técnica para a tela, nem registrar dados sensíveis.
 */

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials:
    "E-mail ou senha incorretos. Se sua conta foi criada antes de 17/11/2026, crie uma nova senha em “Esqueci minha senha”.",
  user_already_exists: "Já existe uma conta com esse e-mail. Use “Entrar” ou “Esqueci minha senha”.",
  invalid_token: "Este link de nova senha expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.",
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

/** Erro do Neon Auth (Better Auth): `code` em MAIÚSCULAS e `status` HTTP. */
export interface AuthError {
  code?: string;
  status?: number;
  message?: string;
}

const BETTER_AUTH_CODES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "invalid_credentials",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "invalid_credentials",
  USER_ALREADY_EXISTS: "user_already_exists",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "user_already_exists",
  INVALID_EMAIL: "email_address_invalid",
  PASSWORD_TOO_SHORT: "weak_password",
  PASSWORD_TOO_LONG: "weak_password",
  INVALID_PASSWORD: "invalid_password",
  INVALID_TOKEN: "invalid_token",
  EMAIL_NOT_VERIFIED: "email_not_confirmed",
  SESSION_EXPIRED: "session_not_found",
};

/** Converte o erro do Neon Auth para o código usado nas mensagens (sem dados pessoais). */
export function authErrorCode(error: AuthError | null | undefined): string {
  if (!error) return "desconhecido";
  if (error.status === 429) return "over_request_rate_limit";
  const code = error.code ? BETTER_AUTH_CODES[error.code] : undefined;
  return code ?? (error.code ? error.code.toLowerCase() : `http_${error.status ?? "desconhecido"}`);
}

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
  not_found: "Registro não encontrado. Ele pode ter sido removido ou pertencer a outra família.",
  bill_canceled: "Esta conta foi cancelada e não pode mais ser alterada.",
  bill_already_paid: "Esta conta já está paga.",
  bill_has_payments: "Esta conta tem pagamentos registrados. Cancele os pagamentos antes de cancelar a conta.",
  payment_exceeds_outstanding: "O valor é maior que o que falta pagar. Se a diferença for juros ou multa, informe em “Encargos”.",
  paid_on_in_future: "A data do pagamento não pode ser no futuro.",
  invalid_amount: "Valor inválido.",
  payment_canceled: "Este pagamento já foi cancelado.",
  reason_required: "Explique o motivo em poucas palavras.",
  transaction_canceled: "Este lançamento foi cancelado e não pode mais ser alterado.",
  linked_to_payment: "Este lançamento veio do pagamento de uma conta. Para corrigir o valor ou a data, cancele o pagamento na conta.",
  use_cancel_function: "Use o botão “Cancelar lançamento”.",
  category_kind_mismatch: "Escolha uma categoria do tipo certo (receita ou despesa).",
  amount_below_paid: "O valor da conta não pode ficar menor que o total já pago.",
  invalid_rate: "Taxa inválida. Use um percentual entre 0 e 100.",
  invalid_count: "Número de parcelas inválido.",
  invalid_method: "Forma de juros inválida.",
  invalid_recurrence: "Dados da repetição inválidos.",
  invalid_date: "Data inválida.",
  plan_canceled: "Este parcelamento foi cancelado.",
  plan_has_payments: "Este parcelamento tem pagamentos registrados. Cancele os pagamentos antes.",
  installment_already_paid: "Esta parcela já está paga.",
};

/** Funções do banco sinalizam erros conhecidos pela mensagem (ex.: 'invite_invalid'). */
export function rpcErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const key = error?.message?.trim();
  if (key && RPC_MESSAGES[key]) return RPC_MESSAGES[key];
  if (error?.code === "23503") return "Opção inválida: a categoria ou conta escolhida não foi encontrada.";
  if (error?.code === "42501") return "Você não tem permissão para fazer isso.";
  return "Não foi possível concluir agora. Nada foi alterado; tente de novo em instantes.";
}

/** Registro de erro sem dados pessoais/financeiros: só código e contexto. */
export function logServerError(context: string, error: { code?: string; message?: string } | null | undefined) {
  console.error(`[cashly] ${context}`, { code: error?.code ?? "desconhecido" });
}

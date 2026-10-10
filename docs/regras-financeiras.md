# Regras financeiras do Cashly

Todas as regras abaixo estão implementadas em funções puras (`src/domain/`) e,
quando geram registros, também no banco (funções SQL equivalentes). Testes
cruzados garantem que TypeScript e banco produzem o mesmo resultado.

> **Estimativas não são valores oficiais.** Para juros, multas e parcelas
> valem os termos do contrato, boleto, carnê ou credor.

## Dinheiro e arredondamento

- Valores em **centavos inteiros** na aplicação; `NUMERIC(14,2)` no banco.
- Taxas em “micro-pontos percentuais” (1% = 1.000.000) com `BigInt`.
- Somas são exatas; cada componente (multa, juros) é arredondado **uma vez**,
  ao centavo, **meio para cima** (0,5 centavo → 1 centavo).
- Valores digitados com mais de 2 casas são **recusados**, nunca arredondados.

## Situação de uma conta a pagar

| Situação | Regra |
| --- | --- |
| A vencer | saldo > 0 e vencimento depois de hoje |
| Vence hoje | saldo > 0 e vencimento = hoje |
| Vencida | saldo > 0 e vencimento antes de hoje |
| Paga em parte | algum principal pago, saldo > 0 (pode estar vencida) |
| Paga | principal pago = valor original |
| Cancelada | cancelada explicitamente (com motivo) |

“Hoje” é calculado no fuso da família (padrão `America/Sao_Paulo`). “Vencida”
nunca é gravada; é derivada.

## Pagamentos

- Quitação é sempre ação explícita, com etapa de revisão.
- Pagamento = **principal** + **encargos** (juros/multa pagos junto).
  Só o principal reduz o saldo; principal nunca pode passar do saldo.
- Data do pagamento não pode ser no futuro (fuso da família).
- Cada pagamento gera **uma** despesa realizada; contas pendentes não entram
  nos totais. Cancelar o pagamento cancela a despesa e recalcula a conta.
- Reenvio do mesmo formulário não duplica (`request_id`).
- Dois pagamentos simultâneos são serializados por bloqueio de linha.

## Multa e juros (estimativa)

- O atraso começa no **dia seguinte ao vencimento**. Não há ajuste para fim de
  semana/feriado (estimativa conservadora: pode superestimar).
- **Multa**: percentual aplicado **uma única vez**, se havia saldo após o
  vencimento.
  - base “valor original”: sobre o valor original;
  - base “saldo”: sobre o que faltava no dia do vencimento.
- **Juros simples**:
  - ao dia: taxa × dias;
  - ao mês: **pro rata die**, taxa ÷ 30 por dia.
  - base “valor original”: o valor original enquanto houver saldo;
  - base “saldo”: o saldo de cada dia; um pagamento no dia D reduz a base a
    partir de D+1.
- A contagem **para no dia da quitação** (ou na data de referência).
- Encargos já pagos são abatidos do estimado.
- Juros compostos **não** são calculados nesta versão.

Exemplo: R$ 1.000,00, multa 2%, juros 1% a.m., 30 dias de atraso →
multa R$ 20,00 + juros R$ 10,00 = R$ 1.030,00 estimados.

## Parcelamentos

- **Sem juros**: total ÷ parcelas; os centavos que sobram vão para a
  **última** parcela (R$ 100,00 em 3 = 33,33 + 33,33 + 33,34).
- **Juros simples ao mês**: juros = total × taxa × nº de parcelas
  (arredondado ao centavo); (total + juros) dividido como acima.
  Não é tabela Price.
- Vencimentos mensais a partir da 1ª data, mantendo o dia âncora:
  31/01 → 28/02 (29/02 em ano bissexto) → 31/03.
- Geração idempotente: cada número de parcela existe uma vez no plano.
- Saldo devedor = soma do que falta nas parcelas não canceladas.
- Plano fica “quitado” quando todas as parcelas estão pagas; cancelar um
  pagamento o reabre. Plano com pagamentos ativos não pode ser cancelado.

## Recorrências

- Mensal (no dia escolhido) ou anual (na mesma data).
- Dia 29–31 em meses mais curtos cai no **último dia do mês**; 29/02 vira
  28/02 em anos comuns.
- A primeira ocorrência é a primeira data ≥ início; a data final é inclusiva.
- As ocorrências são geradas até ~35 dias à frente ao abrir Contas ou
  Lançamentos . A unicidade `(regra, data)`
  impede duplicatas, inclusive em gerações simultâneas.
- Contas recorrentes nascem “a vencer”; receitas/despesas recorrentes nascem
  como **previstas** e só entram no realizado quando confirmadas.
- “Parar de repetir” desativa a regra e cancela as ocorrências futuras ainda
  sem pagamento; as passadas e as pagas permanecem.
- Editar uma conta gerada altera só aquela ocorrência.

## Saldo registrado (painel e relatórios)

- O Cashly não se conecta ao banco. O **saldo registrado** até uma data é:
  soma dos saldos iniciais das contas (com data ≤ data) + receitas
  **recebidas** − despesas **pagas** até essa data.
- O saldo inicial de uma conta vale a partir do dia informado; lançamentos
  daquela conta **anteriores** a esse dia não entram (o saldo inicial já os
  inclui). Lançamentos sem conta sempre entram. Saldo inicial diferente de 0
  exige a data.
- Previstos, cancelados e contas ainda não pagas **nunca** entram.
- Regra única: função `registered_balance(date)` no banco, usada pelo painel
  e por cada fim de mês do relatório. No mês atual, o saldo é até hoje; meses
  futuros aparecem como “Ainda não chegou”.

## Totais, comparações e categorias

- Receitas/despesas do mês = lançamentos confirmados com data no mês. O
  previsto aparece separado e não entra no resultado.
- Comparação com o mês anterior: diferença em R$ e em %; se o mês anterior
  for 0, só a diferença em R$.
- Participação por categoria em pontos-base (0,01%), arredondada para baixo;
  lançamentos sem categoria aparecem como “Sem categoria”.

## Orçamento

- Limite mensal geral (todas as despesas) ou por categoria; um por
  combinação mês + categoria (salvar de novo atualiza).
- **Gasto** = despesas pagas no mês (na categoria, ou todas, no geral).
  Despesas previstas e contas em aberto com vencimento no mês aparecem à
  parte como **previsão**, sem entrar no gasto.
- Situação: “Dentro do limite”; “Perto do limite” quando o gasto atinge o
  percentual de aviso (padrão 80%); “Limite ultrapassado” quando passa do
  limite. Sempre com ícone e texto, não só cor.
- Remover um limite não altera nenhum lançamento. “Copiar do mês anterior”
  só cria os limites que ainda não existem no mês.

## Avisos

- **Contas a vencer**: conta em aberto (a vencer ou paga em parte) com
  vencimento entre hoje e hoje + N dias (padrão 3; escolhido em Ajustes).
- **Vencidas**: conta ou parcela em aberto vencida há até 30 dias.
- **Parcelas a vencer**: parcela em aberto de parcelamento ativo, mesma janela
  de N dias.
- **Orçamento**: quando as despesas pagas do mês atingem o percentual de aviso
  do limite e quando passam do limite (dois avisos no máximo por limite/mês).
- Cada aviso é criado uma única vez por item e vencimento (não repete todo
  dia). Conta paga ou cancelada tira o aviso dos não lidos automaticamente.
- "Hoje" é a data no fuso da família (`America/Sao_Paulo`).
- Os avisos nunca trazem valores em dinheiro; o valor aparece ao abrir o app.

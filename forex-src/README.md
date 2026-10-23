# DDS Finance

Dashboard de trading, rentabilidade e patrimônio. Publicado em **https://www.ddsinovacao.com.br/forex/**.

- Acesso por telefone + PIN de 4 dígitos (cada usuário vê só os próprios dados).
- Importação incremental do `transactions.csv` exportado da plataforma: só IDs novos são gravados.
- Lucro diário, lucro total, lucro do período, rentabilidade (TWR e simples), capital estimado.
- Conversão do patrimônio para reais pela PTAX oficial do Banco Central (indicativa).

## Estrutura

```
forex-src/                 código-fonte (este diretório)
  src/                     React + TypeScript + Tailwind + Recharts
    lib/                   cálculos (metrics.ts), CSV, datas, formatação, API
    pages/                 telas
  supabase/migrations/     SQL do banco (prefixo dds_finance_ na instância compartilhada)
  supabase/functions/      Edge Function forex-ptax (cotação do BCB)
  supabase/tests/          gerador do teste de banco (A–O)
  tests/unit/              testes dos cálculos (Vitest)
  tests/e2e/               testes de tela em 390 px e 1440 px (Playwright)
forex/                     build publicado pelo GitHub Pages (gerado; não editar à mão)
```

## Como funciona

**Banco (Supabase, projeto `arffptuclrrzuzdrcmuc`, compartilhado com outros sistemas).** Todas as tabelas e funções
começam com `dds_finance_`. Nenhuma tabela de outro sistema é alterada.

- O DDS Finance **não usa o Supabase Auth**: a instância tem um gatilho em `auth.users` que cria perfis em outro sistema
  (`dds_flow`). Por isso o login usa sessões próprias, como o Tarefa Diária: o PIN é conferido no banco
  (bcrypt de um HMAC com segredo guardado no Vault), o login devolve um token aleatório de 256 bits e o banco guarda só o
  SHA-256 dele. Toda função pública recebe esse token.
- As tabelas não têm leitura direta (RLS ligado, sem políticas, permissões revogadas para `anon`/`authenticated`).
  Tudo passa por funções `SECURITY DEFINER` que filtram pelo dono da sessão.
- Bloqueio de tentativas: 5 erros seguidos no mesmo telefone bloqueiam por 1, 5, 15, 60 e 240 minutos (progressivo);
  30 erros em 15 minutos do mesmo IP bloqueiam o IP por 15 minutos.
- PINs fáceis (1234, 1111…) são recusados. Recuperação: o administrador gera um PIN provisório; no próximo acesso a
  pessoa cria o PIN definitivo e as outras sessões dela são encerradas.

**Importação.** O navegador lê o CSV e envia os valores brutos (`{columns, rows}`). O banco valida cada linha, calcula
uma impressão digital (SHA-256 dos campos financeiros) e compara com o que já existe:

| Situação | O que acontece |
|---|---|
| Id novo | gravado |
| Id existente e idêntico | ignorado |
| Id existente com valores diferentes | **não sobrescreve**; vira divergência para conferência |
| Id repetido no arquivo, idêntico | gravado uma vez |
| Id repetido no arquivo, conflitante | nenhuma das linhas é gravada; divergência |
| Linha inválida | separada com o motivo |
| Reason desconhecido | gravado como "sem classificação", fora dos cálculos |

A unicidade é garantida no banco por `UNIQUE (user_id, source, external_transaction_id)` com `ON CONFLICT DO NOTHING`
e um bloqueio por usuário durante a importação, então importações simultâneas não duplicam nada.

**Regras financeiras** (versão 1, validadas com o arquivo real e com o saldo confirmado na plataforma):

- `TradeResults` → resultado operacional = `AmountProfit`
- `PerformanceFee` → resultado operacional = `Amount` (a taxa debitada). Nessas linhas o `AmountProfit` é o lucro da
  semana liquidado no fechamento, não dinheiro saindo da conta. **Isto difere do briefing original**, que pedia
  `AmountProfit`: com aquela regra o lucro total ficaria muito abaixo do real e o capital estimado não bateria com o
  saldo da plataforma. A mudança foi confirmada pelo Diogo em 23/10/2026.
- `Deposit` → entrada de capital (`Amount`); `Withdrawal` → saída de capital (`|Amount|`). Nenhum dos dois é lucro ou prejuízo.
- Capital estimado = capital inicial + depósitos − retiradas + resultado operacional acumulado.
- Rentabilidade simples = resultado ÷ capital-base × 100 (só com capital-base configurado).
- TWR = Π(1 + resultado do dia ÷ capital no início do dia) − 1, com aportes e retiradas no início do dia.
- A coluna `Time` não informa fuso; ela é interpretada como horário de Brasília (confirmado). Os dias são agrupados no
  fuso configurado pelo usuário (padrão `America/Sao_Paulo`).

**Câmbio.** A Edge Function `forex-ptax` busca a PTAX de fechamento (compra e venda) na API Olinda do BCB e grava em
`dds_finance_exchange_rates` (única por data/tipo/fonte). Não consulta o BCB se a última consulta tiver menos de 10
minutos. É chamada pelo agendamento (`pg_cron` + `pg_net`: dias úteis das 13h25 às 17h55 a cada 30 min, e 08h10 todo dia)
e pelo app quando a última consulta passou de 30 min. O app mostra data, fonte e situação da cotação e nunca apresenta
uma taxa antiga como atual.

## Desenvolvimento

```bash
cd forex-src
npm install
npm run dev            # http://localhost:5173/forex/
npm test               # cálculos; com DDS_CSV=/caminho/transactions.csv inclui os totais do arquivo real
npm run build && npx playwright test   # telas em 390 px e 1440 px (backend simulado)
```

Variáveis opcionais em `.env.example` (só valores públicos).

## Publicar uma nova versão

```bash
cd forex-src
npm ci
npm run build          # typecheck + build com base /forex/
npm run deploy:copy    # copia dist/ para ../forex
cd ..
git add forex forex-src
git commit -m "DDS Finance: ..."
git pull --rebase origin main && git push origin main
```

O GitHub Pages publica em 1–2 minutos. Como a navegação usa `#/rota`, recarregar qualquer tela funciona sem
configuração extra.

### Banco
As migrações estão em `supabase/migrations/` na ordem do nome. Elas foram aplicadas no projeto em partes
(nomes `dds_finance_*` no histórico do Supabase). Para mudar uma função, crie uma nova migração com `create or replace`.

### Edge Function
`supabase/functions/forex-ptax/index.ts` — publicar com `supabase functions deploy forex-ptax --no-verify-jwt`
(ou pelo painel). Não precisa de segredo extra.

## Manutenção

- **Novo usuário / esqueceu o PIN:** Administração (menu) → Novo acesso / Redefinir PIN. O PIN provisório aparece uma vez.
- **Cotação parada:** veja Cotação cambial → "Última consulta". O botão "Verificar agora" força uma nova consulta.
  Os agendamentos são os jobs `dds_finance_ptax_intraday` e `dds_finance_ptax_daily` em `cron.job`.
- **Backup:** o banco segue a política de backup do plano do Supabase. Cada usuário pode exportar tudo (JSON) e as
  movimentações (CSV) em Configurações. Como a importação é idempotente, reenviar o `transactions.csv` completo
  reconstrói o histórico.
- **LGPD:** em Configurações o usuário exporta seus dados, apaga os dados financeiros ou exclui a conta (com PIN).
  O arquivo CSV não é guardado; os registros de segurança não contêm PIN nem valores.
- **Nova regra de classificação:** altere `dds_finance__analyze` (e incremente `rule_version`), documente aqui e na
  tela Capital e rentabilidade.

# CRL — roteiro de testes

O projeto está em desenvolvimento. Antes do uso real, testar com registros fictícios: entrada ADM, perfil monitor, acolhimento, rotina, devocionais, ressocialização, documentos, medicamentos, estoque, caixa e relatórios.

Validar no navegador a restrição de acesso por perfil, a consistência dos registros e a proteção das informações. O fechamento auditado e a criação da próxima ocorrência recorrente foram implementados no banco e ligados à interface. Ainda precisam de teste autenticado pelo navegador.

A revisão dos sete arquivos JavaScript foi sintática, sem testes completos de autenticação. Não utilizar dados reais antes da homologação.

## Atualização desta etapa

- Tarefas: rotina de conclusão com identificação do autor, horário e próxima ocorrência semanal/quinzenal/mensal. Atualização direta de tarefas segue sem permissão para o cliente autenticado.
- Estoque: totais consolidados no banco, sem depender do limite visual dos últimos 300 movimentos.
- Caixa: totais de receitas/despesas consolidados no banco, restritos a ADM; listagem visual permanece limitada a 300 lançamentos.
- RPCs conferidas no banco; JavaScript atualizado verificado sintaticamente.
- Pendência prioritária: testes integrados autenticados com dados fictícios, revisão de RLS e configuração de backup antes da produção.

## Homologação parcial adicional (11/10/2026)
- Simulação SQL de sessão autenticada como Francielly: `crl_is_admin()` retornou verdadeiro.
- Sessão sem usuário identificado: `crl_is_admin()` falso e contagem visível de membros e acolhidos igual a zero.
- Perfil anônimo teve leitura direta de `crl_residents` negada por permissão.
- Tentativa de teste transacional com acolhido fictício: uma chamada inicialmente falhou por incompatibilidade de tipo; a execução da sequência corrigida foi bloqueada antes de rodar. Portanto não houve homologação end-to-end nem registro fictício persistido.
- Nova aba **Auditoria (ADM)**, que consulta eventos armazenados sem alterar registros; script validado sintaticamente. Confirmação no navegador continua pendente.
- Residentes no banco: zero na última verificação; não usar dados reais antes dos testes funcionais.

## Testes transacionais de integração (11/10/2026 — segunda rodada)

- Falha real descoberta no cadastro: `crl_check_tenant_reference()` tentava acessar `NEW.record_id` em tabelas que não possuem essa coluna, resultando em `record "new" has no field "record_id"`. Migração `crl_fix_tenant_trigger_table_specific_columns` corrigiu o gatilho, separando as verificações por tabela e mantendo isolamento institucional.
- **Teste autenticado como ADM, transação revertida:** `crl_admit_resident`, criação de registro de rotina, criação e conclusão de tarefa semanal com próxima ocorrência foram executados sem erro.
- **Segundo teste autenticado como ADM, transação revertida:** admissão fictícia, devocional com presença, abertura e fechamento de viagem com 7 km calculados, preparação do relatório mensal foram executados sem erro.
- Verificação de ausência de resíduos após as duas transações: `crl_residents`, `crl_stays`, `crl_activities`, `crl_tasks`, `crl_evolution_reports` com zero registros.
- **Ainda pendente:** E2E por navegador autenticado, monitor ativo e bloqueado, armazenamento privado, geração de documento com assinatura, medicação e financeiro. A simulação SQL não substitui testes do navegador nem revisão jurídica dos dados sensíveis.

## Bateria adicional de integração e segurança (11/10/2026)

Testes feitos por simulação autenticada de ADM e alteração temporária do papel para monitor dentro de transações SQL com `ROLLBACK`. Nenhuma conta de monitor permanente foi criada nem foram inseridos dados reais.

- **Ressocialização:** entrada fictícia, autorização de saída com responsável, encerramento do retorno e confirmação no banco passaram.
- **Financeiro:** caixa fictício, estoque de teste, contribuição mensal e pagamento parcial de R$ 75 sobre R$ 200 passaram, com verificação do total.
- **Monitor:** papel alterado somente dentro de transação revertida. `crl_is_admin()` retornou `false`; `crl_is_member(...,false)` retornou `true`; `crl_cash_summary` recusou acesso.
- **Medicamentos:** vinculação de metadado de receita fictícia em caminho com formato válido, solicitação, conferência ADM e registro de ocorrência passaram no banco. **Não houve envio real de arquivo ao Storage** nem teste de decisão clínica.
- **Estoque:** nova RPC `crl_register_stock_movement` valida unidade e quantidade, audita entradas/saídas, serializa movimentos concorrentes e impede saída superior ao saldo. Teste com 10 kg de entrada, 7 kg de saída e tentativa de 5 kg adicional: saída excessiva rejeitada. Interface passou a usar a RPC. Gravação direta do cliente autenticado foi bloqueada.
- **Segurança de funções:** Supabase Advisor identificou que RPCs privilegiadas da CRL podiam ser invocadas pelo papel `anon`. Migração `crl_lock_security_definer_function_execution_to_authenticated` revogou `EXECUTE` público/anônimo das 27 funções `crl_*` com `SECURITY DEFINER`, preservando concessão ao papel `authenticated`. Verificação posterior confirmou 0 funções do grupo executáveis por `anon` e administração ainda reconhecida.
- **Outros avisos do Advisor:** há avisos de segurança relativos ao produto DDS Avaliações no projeto Supabase compartilhado; eles não foram modificados nesta etapa para não comprometer esse produto.
- **Acesso via navegador:** ainda não homologado externamente neste ambiente; requisições ao domínio `www.ddsinovacao.com.br` não puderam ser verificadas. Validação de Edge Function de PDF com assinatura real/autorizada, entrega de arquivos privados e interface móvel depende desse teste.

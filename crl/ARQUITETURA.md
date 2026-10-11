# CRL — arquitetura e implantação

**Estado:** interface pública em `/crl/` é somente uma demonstração com dados fictícios. Não inserir dados reais.

O banco de dados independente ainda não foi criado: a organização SystemDDS atingiu o limite de projetos gratuitos ativos. Nenhuma alteração foi aplicada aos bancos de DDS Avaliações ou CRM Clientes.

## Componentes

- Interface responsiva no site DDS: painel, acolhidos, prontuário, rotina, devocionais, tarefas, medicamentos, ressocialização, veículo, documentos, financeiro e estatísticas.
- Banco privado previsto em projeto Supabase próprio, com tabelas `organizations`, `memberships`, `residents`, `stays`, `notes`, `documents`, `attachments`, `activities`, `attendance`, `tasks`, `medications`, `medication_administrations`, `trips`, `contributions`, `payments`, `inventory_movements`, `financial_entries`, `audit_events`.
- Acesso por usuário e senha com autenticação segura e perfis ADM e monitor; monitores apenas acolhidos ativos e informações necessárias.
- Assinatura institucional em armazenamento privado; documento final somente após aprovação do ADM.
- Registro de entradas/saídas, múltiplas passagens por pessoa e retificações auditadas.
- Exportação de relatórios e PDFs e aplicativo PWA offline após segurança e sincronização serem testadas.

## Próximas etapas

1. Criar projeto Supabase independente, quando houver capacidade disponível.
2. Revisar e aplicar migração SQL e testar RLS com múltiplas instituições.
3. Implementar backend administrativo para primeiro ADM, cadastro e bloqueio de monitores, documentos, assinatura autorizada e uploads privados.
4. Conectar telas ao backend, testar registros de presença, viagens e KM percorridos, contribuições, estoque e evolução dos acolhidos.
5. Habilitar dados reais somente após validação de LGPD, isolamento, permissões, auditoria e backups.

**Segurança:** não subir a assinatura de Francielly a este repositório público e não reutilizar banco de outro sistema sem uma decisão explícita.

## Implantação temporária — 11/10/2026

Usuário autorizou utilizar infraestrutura existente temporariamente. Migração `crl_isolated_foundation_closed_by_default_20261011` aplicada com sucesso ao projeto Supabase **DDS Avaliações** (`kwadhzmdaakxkztggigm`). Foram verificadas **17 tabelas `public.crl_*`**, vazias, todas com RLS habilitado e permissões diretas revogadas de `anon` e `authenticated`. As tabelas existentes de outros aplicativos não foram alteradas deliberadamente. A CRL ainda **não está operativa**: falta provisionamento seguro de usuários e bootstrap de ADM, políticas específicas, backend de escrita, armazenamento privado, migração de identidade, geração autorizada de PDFs, sincronização e testes. **Não inserir dados reais ainda.** O projeto atual é compartilhado temporariamente e a futura migração deve incluir auth, arquivos privados e auditoria.

## Revisão RLS — continuação

Migração `crl_fix_resident_visibility_and_tenant_references` aplicada ao Supabase DDS Avaliações. Corrigida a visibilidade de residentes ativos vinculados ao ID da pessoa, impedido perfil de membro inativo de consultar a própria linha, e criadas verificações de pertencimento à instituição em nove tabelas vinculadas. **A autenticação de produção e o primeiro ADM continuam pendentes**, portanto o site segue somente demonstração. Antes da operação real, testar políticas com identidades ADM/monitor, autorização em documentos, integridade de referências múltiplas (atividades e anexos), e provisionamento protegido; nenhum dado real deve ser inserido ainda.

## Progresso de implementação — 11/10/2026

- Instituição CRL registrada no projeto Supabase temporário.
- Migração `crl_atomic_admission_and_trip_closure` aplicada. Função `crl_admit_resident` insere cadastro e período de acolhimento em uma única transação, verificando associação à instituição; `crl_finish_trip` calcula a distância e valida KM final e horário antes de encerrar uma viagem.
- **Limitação:** o fechamento via RLS atual está disponível ao autor original da viagem; revisão/retificação por ADM precisa de operação auditada própria.
- Primeiro usuário ADM não foi provisionado; login, sessões, arquivos privados, IA e PDFs assinados não estão operacionais.
- Não usar dados reais nesta fase.


## Iteração operacional — devocionais, viagens e retificações

- Página de acesso restrito `/crl/acesso.html` recebeu as abas **Devocionais** e **Veículo**, com lista de viagens e botão de finalização.
- `crl_complete_devotional` salva tema, ministrante, horários e lista completa de acolhidos ativos em uma transação. Falta exige justificativa.
- `crl_finish_trip` conclui viagem com hora de chegada, estado de limpeza e KM calculados pelo banco.
- `crl_protect_trip_history` impede alterações retroativas da viagem original após encerramento.
- `crl_rectify_trip` cria retificação administrativa auditável sem substituir o registro original.
- `crl_amend_record` cria retificação textual do prontuário, mantendo o original.
- `crl_admit_resident` agora realiza uma operação transacional protegida com verificação explícita de membro, gerando evento de auditoria.
- A sincronização offline, armazenamento privado, autorização de assinatura e criação da primeira conta ADM ainda estão pendentes.

**Verificação:** migrações aplicadas e sintaxe do JavaScript publicada verificada; ainda não ocorreram testes ponta a ponta autenticados porque não há ADM/monitor provisionados. Não inserir dados reais.


## Iteração: módulos operacionais e indicadores — 11/10/2026

### GitHub
- `/crl/acesso.html` e `/crl/acesso.js` publicados com abas Acolhidos, Rotina, Veículo, Devocionais, Refeições e Estatísticas (esta última somente para ADM habilitado).
- Devocionais exigem todos os acolhidos ativos marcados e justificativa para falta; gravação pela função transacional `crl_complete_devotional`.
- Viagens: visualizar abertas e encerradas, registrar KM final e horário, e apresentar a distância automaticamente.
- Retificação: relato original preservado, somente autor ou ADM pode corrigir; viagens encerradas recebem retificação auditada exclusiva do ADM, sem sobrescrever o registro.
- Refeições: novo lançamento de quantidade servida por tipo e data, sem estimar valores automaticamente.

### Supabase
- Migrações: `crl_devotional_atomic_attendance_tenant_checks_v1`, `crl_immutable_trips_and_audited_rectifications_v1`, `crl_record_correction_author_or_admin_only`, `crl_meal_reporting_and_admin_consolidated_metrics`, `crl_dashboard_accurate_active_at_end_v2`.
- Novo controle `crl_meals` com RLS; `crl_trip_rectifications` com RLS e inserção bloqueada diretamente.
- `crl_dashboard_summary` retorna indicadores consolidados apenas para ADM autenticado, incluindo conclusão de nove meses. Denominador = acolhimentos encerrados no período; a interpretação causal não é feita automaticamente.
- Falta separar datas de pagamentos efetivos das competências de contribuição, finalizar os relatórios de pagamentos e testar segurança/integração com contas de teste.

### Status de homologação
- Arquivos do GitHub verificados e JavaScript compilado sintaticamente sem erros.
- As migrações foram aplicadas; ainda **não há ADM/monitor autenticado** para teste ponta a ponta.
- **Não inserir dados reais de pessoas ou medicamentos até validação e liberação explícita.**


## Iteração — encerramentos, retornos e contribuições (11/10/2026)
- Migração `crl_stay_completion_readmission_and_immutability_20261011`: fechamento somente por ADM e com justificativa; nova passagem vinculada à pessoa, com nove meses contados desde a nova entrada.
- Migração `crl_force_audited_period_transitions_and_prevent_overlap`: usuários autenticados não podem inserir/editar períodos diretamente; criação e encerramento ocorrem por procedimentos auditados. Datas anteriores ao último desligamento são recusadas para reingresso.
- Nova aba **Histórico e retornos (ADM)** na área restrita: busca por nome, lista de passagens, encerramento e reingresso em formulário próprio, com histórico preservado.
- Migração `crl_admin_payment_ledger_partial_payments_20261011`: `crl_contribution_payments` armazena recebimentos parciais e recalcula saldo por função autorizada. Gravação direta de pagamentos bloqueada.
- Migração `crl_dashboard_use_actual_received_contributions_20261011`: indicador financeiro soma pagamentos por data de recebimento, e não vencimentos.
- Aba **Contribuições (ADM)** permite lançar contribuição mensal (R$ 0 = G5), conferir diária dividida por 30, registrar pagamento parcial e abrir WhatsApp do responsável com texto pronto, sem envio automático.
- Tela de **Estatísticas ADM** adicionou exportação CSV e impressão/Salvar PDF do navegador, ambas sujeitas a autorização da sessão.
- Atenção: ajustes/cancelamento auditável de pagamentos, provisionamento do primeiro ADM, testes completos de RLS, assinatura privada, IA e modo offline ainda não foram homologados. Usar apenas dados fictícios até aprovação.

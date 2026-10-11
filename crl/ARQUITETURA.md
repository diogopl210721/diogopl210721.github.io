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


## Iteração — anexos privados e ligação com o prontuário (11/10/2026)

- Buckets Supabase `crl-private` (privado, máximo 10 MB, JPG/PNG/WebP/PDF) e `crl-signatures` (privado, máximo 2 MB, PNG/WebP) criados e conferidos como **não públicos**.
- Políticas no `storage.objects` restringem leitura e upload pelo identificador de instituição e acolhimento ativo, ou ao ADM; assinatura institucional restrita a ADM.
- `crl_files` agora permite inserção de metadados vinculados ao acolhimento sob RLS, com caminho de arquivo compatível e autor autenticado.
- Tela restrita **Arquivos** aceita arquivos pela câmera ou seleção do dispositivo, salva no bucket privado, associa ao período e permite link de leitura com validade curta (5 minutos).
- Upload e vínculo de metadados ainda não são uma transação indivisível: uma falha de conexão após o upload pode exigir conciliação administrativa de arquivos órfãos.
- Nenhuma assinatura da Francielly foi publicada ou copiada para os buckets nesta iteração.

## Bloqueios antes de homologar dados reais

- `crl_members` permanece sem usuários; a primeira conta ADM ainda não foi provisionada em Supabase Auth por canal seguro.
- Testes com usuários reais de teste (ADM, monitor, monitor bloqueado) e revisão do isolamento entre instituições e das políticas de arquivos ainda pendentes.
- Implementação dos modelos documentais, aprovação de assinatura, exportações completas, ajustes auditados de recebimentos, IA e sincronização offline permanecem pendentes.


## Iteração — declarações oficiais e assinatura privada (11/10/2026)
- Migração `crl_official_declarations_signature_registry_and_approval`: registro de assinatura por instituição, data de emissão, snapshot dos dados, número do documento, aprovação pelo ADM; gravações diretas de documentos bloqueadas para usuários comuns.
- Migração `crl_pdf_bucket_private_admin_access_20261011`: bucket `crl-documents` privado, com leitura controlada por instituição, vínculo ao período e papel ADM. Bucket `crl-signatures` permanece privado e separado.
- Edge Function `crl-official-documents`, com JWT exigido, verifica usuário ADM ativo, valida período e CPF/RG e exige aprovação explícita antes de criar PDF; obtém a assinatura privada no servidor, incorpora a logomarca oficial e grava PDF no bucket privado com rastro de auditoria.
- O texto segue a declaração fornecida: "Declaro para devidos fins..." / "em Programa Terapêutico nesta Comunidade" / "em regime integral" / "Sem previsão de alta" / "Estamos à disposição para quaisquer esclarecimentos".
- Arquivo `crl/documents.js`: seleção de acolhido ativo, prévia preenchida, atualização auditada de CPF/RG, upload autorizado de assinatura PNG, aprovação pelo ADM, consulta de documentos arquivados, acesso temporário ao PDF e compartilhamento manual quando suportado pelo navegador.
- Migração `crl_approval_identity_document_audited_updates`: CPF/RG corrigidos somente via operação autenticada do ADM, com auditoria; atualização direta do cadastro foi bloqueada.
- A aba "Declarações (ADM)" está integrada ao `acesso.html`/`acesso.js` e ao atalho administrativo do painel.
- Correção de marcação duplicada no menu "Acolhidos"; cabeçalho permanece branco com logo CRL.
- **Validação parcial:** migrações aplicadas, Edge Function declarada ACTIVE e sintaxe dos scripts verificada. Geração/assinatura/compartilhamento exigem teste fim a fim no navegador com usuário ADM e dados fictícios; não usar documentos reais antes dessa homologação.


## Iteração — prontuário integrado e exportação (11/10/2026)
- Novo módulo `crl/prontuario.js` adicionado ao sistema autenticado e à barra de navegação (aba **Prontuários**).
- Lista de acolhidos ativos ganhou botão **Abrir prontuário**. Busca administrativa de histórico ganhou acesso à passagem específica.
- Visualização consolida vínculo, datas e tempo de permanência, registros com retificações, presenças nas devocionais, tarefas, medicamentos cadastrados, anexos privados e, para ADM, histórico de passagens, contribuições e PDFs oficiais.
- Exportação CSV de dados consultados e opção de impressão/Salvar PDF pelo navegador, incluindo a logomarca original. CSV protegido contra fórmulas comuns de planilhas.
- Consultas passam por RLS existente; monitor consulta apenas passagem ativa e não recebe blocos de histórico/financeiro, enquanto ADM pode abrir passagens encerradas.
- Resumo de frequência é **descritivo**, sem diagnóstico, classificação de recuperação ou conclusões causais atribuídas a IA.
- **Limites desta iteração:** carregamento de até 250 registros/tarefas/presenças por seção, até 200 anexos e até 100 históricos e contribuições; exporta somente os itens carregados e não inclui bytes de anexos privados. Exportação histórica integral com paginação, sincronização offline, geração por IA e testes automatizados de RLS ainda pendentes.
- Arquivos `crl/acesso.html`, `crl/acesso.js` e `crl/prontuario.js` atualizados no GitHub; sintaxe JavaScript conferida. Sem homologação end-to-end em navegador autenticado; **não inserir dados reais ainda**.


## Iteração — medicação e ressocialização (11/10/2026)

### Banco de dados e autorização
- Migração `crl_medication_monitor_logs_and_resocialization_audit`: RPCs `crl_register_verified_medication` (ADM com receita associada), `crl_record_medication_event` (ADM/monitor de acolhido ativo) e tabela `crl_resocializations` com abertura, fechamento e auditoria.
- Migração `crl_medication_requests_monitor_to_admin_review`: `crl_medication_requests` armazena transcrição de receita feita pelo monitor; `crl_review_medication_request` limita aprovação/rejeição ao ADM. Nenhuma administração pode ser registrada antes da conferência.
- `crl_resocializations` permite uma única saída em aberto por passagem; exige finalidade, justificativa e responsável ou marcação de ausência de responsável.
- Inserções diretas pelo perfil `authenticated` em pedidos de medicamento, medicações conferidas e ressocializações ficam negadas; só funções autenticadas e auditadas efetuam gravações.
- `crl_medication_administrations` preserva eventos como histórico, com justificativa obrigatória para eventos diferentes de administração.

### Interface
- `crl/care.js` contém as telas de **Medicamentos** e **Ressocialização**, integradas a `acesso.html` / `acesso.js`.
- Monitor registra dados que constam na foto/PDF da receita e aguarda conferência ADM; ADM pode abrir a receita privada, aprovar ou rejeitar com justificativa. Eventos subsequentes podem ser registrados pelos perfis autorizados.
- O monitor registra saída de ressocialização, justificativa, responsável que busca ou ausência dele, previsão e retorno efetivo. Relatórios em CSV e impressão do que estiver carregado.
- `prontuario.js` reúne solicitações de medicamento, prescrições conferidas, eventos de administração e histórico de ressocializações; `dashboard.js` inclui pendências de conferência e saídas sem retorno.
- **Sem prescrição automática nem sugestões de dose pela IA**. É um registro operacional, não substitui prescrição, decisão clínica, equipe de saúde nem procedimentos de emergência.

### Verificações e pendências
- Aplicação SQL concluída; conferidos RLS e ausência de permissão de inserção direta em tabelas sensíveis.
- Sintaxe dos módulos JS `acesso.js`, `care.js`, `prontuario.js` e `dashboard.js` validada no repositório.
- **Pendente:** testes integrados autenticados (ADM, monitor e bloqueado), verificação no navegador e revisão de responsabilidade profissional antes de usar medicamentos reais. Ainda não liberar operação com acolhidos reais.


## Iteração — relatórios mensais rastreáveis de evolução (11/10/2026)
- Migração `crl_monthly_evolution_evidence_drafts_and_adm_approval`: nova tabela privada `crl_evolution_reports` com RLS, um relatório por passagem e competência, rascunho, referências de até 30 registros, contagens, texto-base e aprovação permanente pelo ADM.
- RPC `crl_prepare_evolution_report`: consulta fatos do período (registros, presenças de devocionais, tarefas e ressocializações), cria ou atualiza rascunho e registra evento de auditoria. Não gera diagnóstico, avaliação clínica ou interpretação causal.
- RPC `crl_approve_evolution_report`: exige ADM ativo, revisão do texto (40–15000 caracteres) e competência já encerrada; congela texto e snapshot após aprovação. Inclusão e atualização direta da tabela negadas para usuários autenticados.
- Tela `crl/evolution.js` adicionada ao menu **Evolução mensal (ADM)**: seleção de acolhido, competência, fontes rastreáveis, edição do parecer, aprovação e impressão/Salvar PDF no navegador; atalho também no painel ADM.
- **Limite:** texto automático segue regras determinísticas, não integração real de IA. A impressão é do navegador, não PDF oficial assinado/arquivado no Supabase; o arquivo aprovado permanece imutável na tabela. Validar paginação/evidências extensas e fluxos autenticados antes de usar dados reais.

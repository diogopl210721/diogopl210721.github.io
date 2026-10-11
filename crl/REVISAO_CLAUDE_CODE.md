# CRL — Dossiê para revisão independente no Claude Code

> Atualizado em 11/10/2026. Fonte: código do GitHub e inventário do Supabase ativo. Esta é uma **foto do projeto no estado atual**, não certificado de homologação ou garantia de segurança. O repositório hospeda outros projetos; revise **somente a pasta \`crl/\`** e suas dependências.

## 1. O que estamos construindo

**Sistema CRL — Comunidade Terapêutica Caminho de Retorno ao Lar**, destinado à operação da casa: acolhidos, histórico de entradas e saídas, prontuários e fotos, registros de rotina, devocionais/presenças, escala de tarefas, refeições, ressocialização, veículos, medicamentos, contribuições mensais, estoque/doações, caixa/despesas, equipe de monitores, relatórios e declarações.

A interface deve ser simples, rápida e bem acabada tanto em iPhone quanto em desktop. **Identidade visual obrigatória:** cabeçalho branco, logomarca vermelha original da CRL, fundo cinza-claro, cartões brancos, botões/ícones em vermelho. Menu lateral no desktop e navegação inferior no celular. A marca está embutida no HTML de acesso.

**URLs:** landing \`https://www.ddsinovacao.com.br/crl/\`; painel \`https://www.ddsinovacao.com.br/crl/acesso.html\`.

## 2. Stack e arquitetura real

- **GitHub Pages:** código estático HTML/CSS/JS sob \`diogopl210721/diogopl210721.github.io/crl/\`, branch \`main\`. Não há backend Node/PHP do site: chamadas seguras usam Postgres RPC e Edge Functions do Supabase.
- **Frontend:** HTML/CSS e JavaScript ES modules nativos, Supabase JS v2 importado por CDN \`https://esm.sh/@supabase/supabase-js@2\`. \`acesso.js\` orquestra navegação e formulários; módulos \`*.js\` são importados diretamente.
- **Banco:** PostgreSQL/Supabase com tabelas \`public.crl_*\`, RLS e RPCs \`public.crl_*\`. O projeto atual foi **compartilhado temporariamente com DDS Avaliações**, projeto id \`kwadhzmdaakxkztggigm\`. **Não alterar tabelas/funções/buckets DDS não prefixados \`crl_\`.** Planejar migração para projeto Supabase independente quando conveniente.
- **Autenticação:** Supabase Auth e tabela \`public.crl_members\`; login de nome de usuário mapeado no frontend para e-mail técnico \`usuario@crl.ddsinovacao.com.br\`. Esse e-mail técnico não é, por si só, uma caixa real de recuperação.
- **Edge Functions:** \`crl-admin-monitors\` (gestão segura de usuários) e \`crl-official-documents\` (emissão/assinatura de documentos), ambas com verificação JWT ativada. Código de referência reproduzido em \`supabase/functions/.../index.ts\`.
- **Armazenamento:** buckets privados \`crl-private\`, \`crl-signatures\`, \`crl-documents\` e URLs assinadas temporárias, com permissões a auditar.
- **Integração com IA:** **não existe uma análise com LLM externo em produção**. O relatório de evolução atual é determinístico, baseado em contagens e evidências, revisado por ADM.
- **Segredos:** nenhuma senha de usuário, JWT de sessão ou service-role key deve ir ao frontend, GitHub, dossiê ou conversa. A chave publishable no browser é pública por definição; a segurança depende das políticas/RPCs.

## 3. Perfis e regras de equipe

**Administrador (ADM):** gerencia monitores, vencimentos/contribuições, caixa, histórico completo, emissão de declarações, revisão de receitas, auditoria e relatórios mensais. Existe conta administrativa Francielly.

**Monitor:** executa rotinas operacionais autorizadas, sem acesso ao caixa, contribuições, aprovações ADM ou histórico encerrado. Existe usuário \`diogo\` cadastrado no Auth/membership em consulta anterior, porém o vínculo \`monitor_vinculo\` desse registro constava **nulo** na verificação — precisa classificar no painel ADM.

**Vínculos de monitor:**
1. **Aluno:** selecionar um acolhido já existente; \`crl_members.resident_id\` associa a conta ao cadastro permanente da pessoa, sem duplicá-la. Edge Function confirma acolhimento ativo, obtém nome do prontuário e impede conta duplicada para o mesmo aluno.
2. **Voluntário:** cadastro próprio de nome, login, senha e telefone opcional; sem salário.
3. **Contratado:** cadastro próprio, salário mensal \`salary_monthly\`; ADM escolhe competência e clica em **Lançar salário nas despesas**. \`crl_register_monitor_salary\` grava \`crl_financial_entries\` de tipo despesa e \`crl_monitor_payroll\` com unicidade por monitor + competência; não executa pagamento bancário.

**Ponto crítico para avaliação:** as políticas atuais concedem permissões operacionais pelo papel genérico \`monitor\`. **Revisar separação de privilégios de monitor-aluno, voluntário e contratado**, em particular dados de saúde/prontuários de outros acolhidos. A simples classificação do vínculo não garante controle de acesso diferenciado.

## 4. Módulos e arquivos frontend

| Arquivo | Papel |
|---|---|
| \`index.html\` | Página pública/entrada e apresentação CRL |
| \`acesso.html\` | Shell autenticado, branding, layout desktop/mobile, menus e formulários |
| \`acesso.js\` | Supabase Auth, papéis, navegação, acolhimento, registros, tarefas, viagens, devocionais, refeições, contribuições, equipe e integrações |
| \`dashboard.js\` | Dashboard com cartões clicáveis, totais reais calculados por \`crl_dashboard_cards\` |
| \`prontuario.js\` | Histórico por acolhido/passagem, anexos, registros, participação, medicamentos, ressocializações, relatórios e exportação/impressão |
| \`care.js\` | Receitas/medicamentos (pedido, conferência ADM, registro de administração) e ressocialização (saída/retorno) |
| \`documents.js\` | Declarações oficiais, prévia, CPF/RG, assinatura PNG autorizada, PDFs privados |
| \`evolution.js\` | Relatório mensal factual, evidências, sugestões determinísticas, edição de rascunho, aprovação ADM e impressão |
| \`operations.js\` | Movimentações de estoque e controle de caixa, totais do banco, lançamento de entradas/despesas |
| \`auditoria.js\` | Consulta de ações auditadas do ADM |
| \`diagnostico.js\` | Testes de conectividade/leituras/RPC/Edge Functions pelo ADM |
| \`README.md\`, \`ARQUITETURA.md\`, \`VALIDACAO_FINAL.md\`, \`CONFIGURACAO-ADM.md\`, \`ETAPA-LOGIN.md\` | Documentação **histórica**; há mensagens antigas de protótipo que não refletem o estado atual. Este dossiê é a referência consolidada. |
| \`schema.sql\` | **Modelo preliminar não executado**, usando schema \`crl\` separado. **Não é o schema real em execução** (\`public.crl_*\`). Não aplicar cegamente. |

### Dashboard pedido pela instituição

Seis indicadores principais: acolhidos ativos; devocionais do mês; escala de tarefas; contribuições vencidas (somente ADM); refeições do mês; ressocializações em andamento. Indicadores extras: medicamentos pendentes ADM, viagens e KM, entradas de estoque/KG recebido/KG consumido, despesas, conclusões, desistências/abandonos e acolhidos perto de completar nove meses. Cartão inteiro clicável, abrindo módulo/filtro. Totais calculados pela RPC \`crl_dashboard_cards\`.

### Regras importantes dos registros

- Acolhido tem cadastro permanente \`crl_residents\` e múltiplas passagens \`crl_stays\`; não apagar histórico após saída.
- Tarefa semanal/quinzenal/mensal gera a próxima ocorrência quando é concluída, com auditoria.
- Desvios de horário/quilometragem de veículo e correções de prontuário devem preservar trilha auditada.
- Receita é anexada em bucket privado e deve ser **conferida pelo ADM** antes da operação; interface não prescreve doses nem recomenda tratamentos.
- Pagamento parcial de contribuição possui registro específico, e saldo deve refletir valores realmente pagos.
- Lançamentos de estoque rejeitam saída acima do saldo atual e têm função transacional com auditoria.
- Relatório mensal **aprovado não é editável**; impressão pelo navegador não equivale a PDF oficial assinado.
- A emissão de declaração oficial usa Edge Function, assinatura privada e aprovação ADM; modelos, campos e autorização humana precisam ser conferidos com o documento original.

## 5. Backend — arquivos anexados para revisão

> Estes arquivos foram extraídos de *definições implantadas* e metadados do projeto. Servem para análise; não são backup transacional nem scripts completos para recriar o Supabase em ambiente limpo.

- \`supabase/functions/crl-admin-monitors/index.ts\` — cópia da Edge Function implantada v5.
- \`supabase/functions/crl-official-documents/index.ts\` — cópia da Edge Function implantada v1.
- \`supabase/exports/crl_rpc_definitions.sql\` — snapshot de 36 funções SQL \`crl_*\` atualmente presentes no banco.
- \`supabase/exports/crl_db_catalog_snapshot.json\` — catálogo de colunas, constraints, indexes, triggers, políticas RLS e buckets privados \`crl-*\`; **sem dados de tabelas**.
- \`schema.sql\` — legado/preliminar, **não confundir** com os snapshots.
- O histórico integral das migrações fica no Supabase; os arquivos acima **não incluem cópias de todas as versões históricas das migrações**.

## 6. O que realmente foi testado

**Confirmado em testes SQL com rollback e autenticação simulada da conta ADM:** admissão, registros de rotina, tarefas concluídas/recorrência, devocional e presença, viagens e KM, ressocialização aberta/encerrada, contribuições/pagamentos parciais, receitas de medicamento/conferência/ocorrência (usando metadados fictícios, sem upload físico), estoque com impedimento de saldo negativo e cálculos de caixa. Verificados RLS contra papel anônimo, reconhecimento ADM e negação de resumo financeiro quando papel temporariamente alterado para monitor.

**Confirmado sintaticamente/simuladamente:** arquivos JS, menu, dashboard e cliques de navegação por testes com backend simulado; Edge Functions constam como ACTIVE.

**Não concluído:** teste ponta a ponta num navegador autenticado cobrindo TODOS os botões e formulários; upload real de foto/receita, download privado, emissão de PDF assinado, recuperação da conta, monitor-aluno com restrições refinadas, rotina comprovada de backup/restauração, monitoramento/alertas. O usuário conseguiu abrir a tela no iPhone e enviou capturas; isso confirma acesso ao site em seu dispositivo, mas não a correção de todos os fluxos.

**Importante:** não extrapolar testes transacionais para afirmar que o sistema está “100% homologado”. É necessário auditoria e ensaio operacional real, principalmente com dados de saúde.

## 7. Pontos que o Claude deve auditar primeiro

1. **Segurança/LGPD:** RLS e relacionamento de identidade \`auth.users\`, \`crl_members\`, \`crl_residents\`, \`crl_stays\`; segregação de dados sensíveis; monitor-aluno com privilégio mínimo; logs de leitura, retenção, consentimento/base legal, revogação de sessões.
2. **Cadastro de monitor:** confirmar criação \`aluno\`, \`voluntario\`, \`contratado\` com a função implantada, vínculo à passagem ativa, impossibilidade de duplicar aluno, edição de vínculo/salário, reset/bloqueio/reativação. No caso do aluno, nome deve ser extraído do prontuário.
3. **Folha/caixa:** conferir se \`crl_register_monitor_salary\` lança exatamente uma despesa por competência, se histórico/confirmações são coerentes e se "registrar salário" significa despesa de competência, **não pagamento bancário realizado**. Revisar necessidade de estado "a pagar"/"pago" e prova de pagamento.
4. **Interface:** contraste e responsividade, foco/teclado/acessibilidade; dashboard desaparece ao entrar nos demais módulos; menu inferior iPhone; formulários em telas estreitas; alerts, estados de carregamento, erros e mensagens; consistência dos filtros com os KPIs.
5. **Integridade do Postgres:** constraints, \`SECURITY DEFINER\`, \`search_path\`, policies, vínculos entre instituições, funções concedidas a \`authenticated\`, triggers, parâmetros de RPC, bloqueio de duplicidade e concorrência.
6. **Prontuários/documentos:** modelos oficiais com confirmação da pessoa responsável; privacidade dos buckets/URLs temporárias; metadados, assinatura autorizada, emissão e download de PDF; fidelidade das declarações; tentativas de manipular IDs.
7. **Performance/dados:** paginação de consultas limitadas a 60/100/200/300 itens; exportação que pode ser incompleta; índices e agregações; horários locais \`America/Sao_Paulo\` versus UTC; consistência de KPIs.
8. **Deploy/engenharia:** codebase sem testes automatizados nem build, módulos ES e Supabase via CDN; separar staging/prod, logs, alertas e rollback; estratégia de migração para projeto Supabase independente; política de backups.
9. **Docs obsoletos:** reconciliar \`README.md\`, \`CONFIGURACAO-ADM.md\`, \`schema.sql\` com o banco real sem executar \`schema.sql\` legado.

## 8. Pedido ao Claude Code

> Faça uma **auditoria crítica do código completo da pasta \`crl/\`**, considerando front-end, Edge Functions, RPCs PostgreSQL e políticas RLS exportadas. Não confie em listas de recursos como evidência de funcionamento: para cada módulo, verifique o código e classifique **Funcional / Parcial / Com erro / Não implementado**. Priorize (P0, P1, P2) falhas que impedem criar acolhido, autenticar ADM/monitor, controlar despesas e salários, emitir documentos e proteger informações de saúde.
>
> Avalie design mobile e desktop com visual CRL (header branco + logo vermelha); proponha layout mais profissional preservando a identidade da instituição. Entregue: resumo executivo, mapa de módulos, bugs comprovados com arquivo e trecho, riscos RLS/LGPD, testes necessários, plano de correção priorizado e sugestões de melhoria. Se propuser mudança no Supabase compartilhado, **não altere tabelas/funções/buckets DDS**.
>
> Não rode migrações destrutivas, não modifique dados reais e não publique alterações sem aprovação. Faça primeiro uma revisão independente e apresente o diagnóstico.

## 9. Acesso e execução para revisão

- Projeto código: \`https://github.com/diogopl210721/diogopl210721.github.io\`
- Somente pasta \`crl/\`: \`https://github.com/diogopl210721/diogopl210721.github.io/tree/main/crl\`
- Download ZIP padrão GitHub: \`https://github.com/diogopl210721/diogopl210721.github.io/archive/refs/heads/main.zip\` (inclui outros projetos da raiz).
- Pacote exclusivo CRL: workflow \`.github/workflows/crl-review-package.yml\`, com artefato ZIP \`CRL-CODIGO-COMPLETO\` se GitHub Actions estiver habilitado e a execução terminar com sucesso.
- **Não enviar senhas ou chaves secretas ao Claude**. Nunca inserir dados reais de pacientes na revisão de código.

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

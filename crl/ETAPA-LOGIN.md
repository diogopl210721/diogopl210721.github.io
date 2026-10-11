# CRL — Etapa de autenticação e operação

## Aplicado no Supabase
Projeto temporário: DDS Avaliações (`kwadhzmdaakxkztggigm`).
Migração aplicada: `crl_fix_resident_visibility_and_tenant_references`, com correção de RLS para acolhidos ativos, membros inativos e validação de referências cruzadas de instituição.
Nenhuma senha nem assinatura institucional estão publicadas.

## Login proposto
- Exibir somente usuário e senha.
- Internamente, relacionar o nome de usuário a identidade gerenciada por Supabase Auth; não salvar senha na tabela `crl_members`.
- Primeiro ADM `francielly` ainda precisa ser criado por fluxo administrativo seguro e exigir troca de senha.
- O cadastro de monitores será exclusivo do ADM.
- Suspensão de monitor deve revogar sessões e bloquear sincronização posterior.

## Bloqueadores para operação real
1. Provisionamento do primeiro ADM via canal protegido.
2. Interface autenticada com sessão válida, teste de RLS com ADM e monitor, e verificação do isolamento entre instituições.
3. Armazenamento privado e emissão autorizada de declarações; assinatura da responsável nunca no repositório público.
4. Revisão de regras de prontuário, medicamentos, auditoria e sincronização offline.
5. Teste ponta a ponta com dados fictícios antes de operar.

## Estado da interface
`/crl/` é uma demonstração sem persistência. Não inserir dados reais.

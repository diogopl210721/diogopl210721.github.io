# CRL — Primeiro administrador

**Situação:** identidade de primeiro ADM definida como usuário `francielly`. A conta de autenticação **ainda não foi criada**.

## Requisitos de provisionamento

1. Criar usuário no Supabase Auth por método administrativo confiável, com senha forte fornecida em interface segura. Nunca gravar senhas em GitHub, SQL, logs ou chats.
2. Relacionar o `auth.users.id` à tabela `public.crl_members`, com `username='francielly'`, `role='admin'`, `active=true` e o `institution_id` apropriado.
3. Exigir troca de senha no primeiro acesso e prover recuperação segura; o login da CRL exibirá apenas usuário e senha.
4. Validar RLS em contas ADM e monitor, inclusive negação de históricos encerrados e acesso financeiro para monitor.
5. Manter assinatura da responsável em bucket privado e emissão de declarações mediante aprovação do ADM.

**Aviso:** o ambiente atual é um protótipo. Não inserir prontuários reais até que o processo de autenticação, políticas cruzadas, armazenamento e auditoria sejam testados.

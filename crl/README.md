# CRL | Próxima etapa técnica

**Estado:** protótipo publicado em `/crl/`, dados fictícios. Projeto Supabase independente NÃO criado: a conta atingiu o limite de projetos gratuitos.

## Conteúdo preparado
- `index.html`: demonstração navegável; não é produto pronto e não armazena dados reais.
- `schema.sql`: modelo preliminar de tabelas, tipos e relacionamentos; não executado. RLS ativada e sem permissões para usuários finais, por padrão.
- Nenhuma assinatura ou documento real deve ser incluído no GitHub público.

## Antes de uso real
1. Criar projeto Supabase independente quando houver vaga e revisar migrações.
2. Autenticação *username + senha* com serviço de identidade confiável. O login não pode usar senha em tabela própria nem credenciais embutidas no frontend.
3. Políticas RLS por instituição, tipo de usuário, período ativo e domínio de dados; verificação por testes automatizados.
4. Convites, bloqueio/revogação de sessões e acesso offline limitado; nenhuma conta de monitor pode conceder privilégios.
5. Armazenamento privado de anexos, receitas, documentos e assinatura de Francielly; emissão aprovada pelo ADM no servidor.
6. Validar integridade referencial *organization_id* também entre tabelas relacionadas, trilhas imutáveis, backups e LGPD.
7. Testar sincronização offline e evitar gravação de prontuários em armazenamento local sem proteção adequada.
8. Geração real de PDF, relatórios e resumos de IA somente após permissões e auditoria.
9. Homologar com dados fictícios antes de qualquer cadastro real.

**Importante:** schema preliminar é artefato para revisão, não pronto para produção.

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
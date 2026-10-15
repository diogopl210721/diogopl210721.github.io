# Tarefa Diária

Sistema de gestão de demandas publicado em **https://www.ddsinovacao.com.br/tarefadiaria/**.

- Frontend estático (HTML + CSS + JS, sem build, sem bibliotecas), servido pelo GitHub Pages do repositório `diogopl210721.github.io`, na pasta `tarefadiaria/`.
- Dados no Supabase (projeto compartilhado `arffptuclrrzuzdrcmuc`), em tabelas com prefixo `td_`.

## Como funciona o acesso

- Login simples: **celular + PIN de 4 números**.
- O PIN é guardado com bcrypt no banco. Depois de 5 PINs errados o acesso bloqueia por 15 min (30, 60… até 24 h se repetir).
- O login devolve um token aleatório de 256 bits. O banco guarda só o hash (SHA-256). A sessão dura 90 dias com “Manter conectado” ou 12 h sem.
- As tabelas `td_*` têm RLS ligada **sem nenhuma política** e sem permissões para `anon`/`authenticated`: ninguém lê nem grava direto.
- Todo acesso passa por funções RPC `td_*` (SECURITY DEFINER) que validam o token antes de qualquer coisa.
- A chave em `assets/config.js` é a chave **publicável** do Supabase (feita para ficar no navegador). Sozinha ela não abre nenhum dado.
- Usuário com PIN provisório só consegue trocar o PIN até criar o próprio.

## Regras do negócio

| Regra | Como ficou |
|---|---|
| Origem × tipo | Salesforce → sempre **OC**; TOTVS → sempre **CI** (garantido também no banco) |
| Atrasada | aberta há **mais de 120 horas** (5 dias corridos), independente de atualizações |
| Parada | aviso separado: mais de 120 h sem nenhuma atualização |
| Histórico | append-only (trigger impede UPDATE/DELETE). Abertura, atualização, mudança de status, conclusão, reabertura e edição |
| Antes / Agora | ao salvar uma atualização, a descrição atual vira “anterior” e o texto novo vira “atual”, na mesma transação |
| Concluído | sai da lista de abertas e vai para Concluídas; trocar o status reabre sem perder histórico |
| Clientes | identificados pelo código (normalizado: sem espaços, maiúsculo). O mesmo cliente pode ter N demandas. Mudanças de nome/código/contato/telefone ficam em auditoria |
| WhatsApp | link `wa.me/55…` (não envia nada sozinho) |
| Horários | gravados em `timestamptz`, exibidos em America/Sao_Paulo |

## Arquivos

```
tarefadiaria/
├── index.html
├── assets/
│   ├── app.css      layout (menu azul-marinho, cartões, status coloridos, A4 paisagem)
│   ├── app.js       aplicação
│   └── config.js    URL + chave publicável do Supabase
├── supabase/
│   └── migrations/001_tarefa_diaria.sql   estrutura completa (tabelas, gatilhos, funções, permissões)
└── README.md
```

## Funções RPC (todas recebem `p_token`, exceto login)

| Função | Para quê |
|---|---|
| `td_login(p_telefone, p_pin, p_lembrar)` | entra e devolve token |
| `td_logout`, `td_me`, `td_trocar_pin` | sessão e PIN |
| `td_resumo` | indicadores, gráfico de 6 meses, status das abertas, prioridades |
| `td_listar(p_filtros, p_limite, p_offset)` | lista paginada com busca e filtros (escopo, q, status, origem, consultor, atraso, ordem, ids) |
| `td_demanda(p_id)` | demanda + cliente + histórico completo |
| `td_criar_demanda(p)` | cria cliente (se novo) + demanda + evento de abertura; avisa conflito de código |
| `td_registrar(p_id, p_texto, p_status)` | atualização e/ou mudança de status (com conclusão/reabertura) |
| `td_editar_demanda(p_id, p)` | consultor, origem, registro, contato, telefone, próxima ação (registra “edição”) |
| `td_clientes_listar`, `td_cliente`, `td_cliente_por_codigo`, `td_salvar_cliente` | clientes |
| `td_consultores_listar`, `td_salvar_consultor` | lista de consultores |
| `td_usuarios_listar`, `td_salvar_usuario`, `td_backup` | administração (só admin) |

## Usuários

- Administrador cadastra pessoas em **Configurações → Usuários com acesso** (nome, celular, PIN provisório).
- A pessoa entra e o sistema pede para criar o próprio PIN.
- Admin pode redefinir PIN, desbloquear, desativar e dar/tirar acesso de administrador.

## Publicar uma nova versão

```bash
git clone https://github.com/diogopl210721/diogopl210721.github.io.git
# copie a pasta tarefadiaria/ por cima
git add tarefadiaria && git commit -m "Tarefa Diária: ..." && git push
```

O GitHub Pages atualiza em 1–2 minutos. Ao mudar CSS/JS, aumente o `?v=` em `index.html` para o navegador não usar a versão antiga em cache.

## Mudanças no banco

Aplique o SQL de `supabase/migrations/` no SQL Editor do Supabase (ou via MCP). O script não altera nenhuma tabela de outros sistemas. Para conferir a segurança: `select * from td_clientes` com a role `anon` deve dar *permission denied*.

## Backup

**Configurações → Baixar backup completo** gera um JSON com clientes, demandas, histórico, auditoria e consultores. Também dá para exportar CSV (Excel) das abertas em **Relatórios** e de todas as demandas em Configurações.

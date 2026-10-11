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

# Evidências da primeira versão

Verificação em 15/10/2026, sem dados reais ou serviços de produção.

## Automatizado

- **25 testes aprovados** com `node --test tests/*.test.mjs`.
- Migração executada de fato em PostgreSQL em memória (PGlite), com papéis Auth simulados: RLS, allowlist, privilégios por coluna, autoria das notas, proteção da auditoria, versão de registro, conflito de agenda, pagamentos acima do saldo, deduplicação de submissão financeira e revogação de acesso.
- Seed fictício testado: exige habilitação explícita e tabela de pacientes vazia.
- API testada com provedor Supabase simulado: falta de configuração/sessão, origem externa, usuário sem permissão, login/cookies, refresh, conflito de edição, validação, limite de corpo e logout.
- Domínio testado: intervalos, virada de ano, mês no fuso de Santos, coorte do CRM, receita recebida, saldo e mensagens de WhatsApp.
- Build estático concluído (`node scripts/build.mjs`) e sintaxe JavaScript verificada.

## Interface local

Verificado no navegador, em viewport efetivo de 433 px: entrada no modo fictício, cadastro de paciente, anotação de histórico com texto HTML exibido literalmente, revisão e confirmação de retorno a 60 dias, mudança para o mês do retorno e recebimento parcial com atualização de receita/saldo. Nenhum erro ou aviso de console foi encontrado nessa navegação. Captura de tela entregue separadamente.

As regras CSS também incluem layout desktop; a tentativa de override para 1440 px não alterou o viewport efetivo do navegador integrado. Revisão visual em desktop amplo permanece no roteiro de homologação.

## Limites da validação

A compilação local de Pages Functions pelo Wrangler 4.45.0 foi tentada, mas o processo esbuild foi bloqueado ao consultar diretórios ancestrais pelo sandbox Windows (`Cannot read directory`, acesso negado). Não houve confirmação de compilação do bundle de Functions nesta máquina. O workflow GitHub inclui essa verificação em runner Ubuntu; seu resultado deve ser conferido antes do merge.

Não foi executado Supabase Auth real, hospedagem Cloudflare, cookies no edge em HTTPS nem concorrência entre duas conexões PostgreSQL reais. O guia SETUP lista esses testes de aceite. Nenhum deploy foi realizado.

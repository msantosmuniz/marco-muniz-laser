# Configuração e homologação

## 1. Repositório e isolamento

O código-fonte desta revisão está em repositório público. Credenciais, backups e dados pessoais ou clínicos nunca devem ser enviados ao Git, independentemente da visibilidade. Caso a clínica retome a exigência de repositório privado, o proprietário pode alterar a visibilidade em GitHub → Settings → General → Danger Zone. Ative revisão obrigatória de PR e proteção da branch principal conforme o plano disponível.

Use um projeto Supabase exclusivo de homologação, sem copiar pacientes da produção. Não conectar esta branch ao projeto Pages que atende o site público. Não habilitar deploy automático de produção enquanto o PR estiver em revisão.

## 2. Supabase

1. Crie o projeto no painel e guarde as credenciais no gerenciador apropriado, nunca no Git.
2. Aplique `supabase/migrations/202610150001_initial.sql` no SQL Editor ou por seu fluxo de migrações Supabase. A migração é transacional e destinada a um banco inicial vazio; não reaplicar sobre tabelas existentes.
3. Em Auth, desabilite cadastro público. Crie **dois usuários individuais** por processo administrativo seguro, com e-mail e senha exclusiva. Esta versão usa login por senha; não tem fluxo de aceitar convite ou redefinir senha por link na UI. Provisionamento e recuperação são administrados no Supabase por um responsável, sem compartilhar senhas no repositório/chat.
4. Copie os UUIDs dos dois usuários Auth e execute no SQL Editor, substituindo os marcadores (não executar literalmente):

```sql
insert into public.admins(user_id, slot) values
  ('UUID_DO_PRIMEIRO_USUARIO', 1),
  ('UUID_DO_SEGUNDO_USUARIO', 2);
```

Os slots 1 e 2 impedem uma terceira conta administrativa. A aplicação não pode editar essa tabela. Para revogar acesso imediatamente: `update public.admins set active = false where user_id = 'UUID';`, por administrador do banco. Configure também revogação de sessões no Auth.

5. Configure JWT com duração curta (sugestão operacional: 15 minutos), políticas de senha, limites de autenticação e monitoramento de falhas no Auth. Verifique configurações atuais disponíveis no plano.
6. Só em homologação vazia: para dados fictícios persistentes, execute `set app.seed_demo = 'true';` e o conteúdo de `supabase/seed-demo.sql` **na mesma conexão**. Não é migração nem executa automaticamente. O seed não cria credenciais nem usuários.

## 3. Cloudflare Pages — configurar somente quando autorizado

Não houve publicação nesta entrega. Para uma futura homologação autorizada:

- Crie projeto **separado** de Pages conectado ao repositório e à branch de revisão.
- Framework preset: None. Root directory: raiz do repositório. Node.js: 22 ou superior.
- Build command: `node scripts/build.mjs`. Output directory: `dist`.
- A pasta `functions/` deve permanecer na raiz para que Pages compile `/api/*`. Não usar upload só dos arquivos estáticos: isso omite a API.
- Configure os bindings **Preview** `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `APP_ORIGIN` com valores da homologação. `APP_ORIGIN` deve ser exatamente a origem HTTPS escolhida, sem `/` final (ex.: URL estável de preview). Requests para outros hosts são negados.
- Não reutilize bindings Supabase de produção em previews. Configure Production somente após aprovação própria.
- Habilite limitação de tentativas de login no Cloudflare, além dos limites do Supabase Auth. Regra recomendada para homologar: POST em `/api/login`, limite por IP adequado à operação; bloqueio temporário e monitoramento. Validar suporte/plano no painel antes do uso real.
- HTTPS é obrigatório: cookies `__Host-` não funcionam em HTTP público. O servidor Node local destina-se à demonstração e não reproduz o runtime de cookies do Pages.
- Em produção futura, a intranet recebe exclusivamente `app.marcomunizlaser.com.br`. O domínio principal permanece em seu projeto atual. Não configurar redirecionamento global entre os projetos.

## 4. Roteiro de aceite em HTTPS

1. Sem login: `/api/data` deve responder 401. POST de origem diferente deve responder 403.
2. Usuário Auth fora de `admins`: login sem acesso aos dados; testar também PostgREST direto com seu JWT.
3. Primeiro e segundo admins entram individualmente. Cadastre paciente fictício no primeiro e use **Atualizar dados** no segundo; ambos veem o mesmo cadastro.
4. Abra o mesmo registro nas duas sessões, salve em uma e tente salvar na outra: a segunda deve receber conflito, sem sobrescrever a primeira.
5. Crie sessões sobrepostas: uma deve falhar; sessões adjacentes são permitidas. Cancele e reagende manualmente; marque realizado.
6. Revise sugestão de retorno: confirme que abrir/fechar o formulário não agenda nada. Salvar deve ser necessário.
7. Percorra os cinco status do CRM e confira métricas do mês da criação do orçamento.
8. Registre recebimento parcial, tente valor acima do saldo e confirme rejeição. Compare receita por data de recebimento e valor das sessões pelo mês de atendimento.
9. Confira auditoria e autor, login/refresh/logout; tente alterar audit_events ou admins usando o JWT: acesso deve ser negado.
10. Aguarde expiração do access token e valide refresh, depois logout. Desative o admin no banco: o JWT existente não deve mais ler dados.
11. Teste celular, teclado e formulário com erro. Inspecione cookies HttpOnly/Secure/SameSite e ausência de tokens/dados clínicos em storage do navegador. Verifique headers em arquivos estáticos **e** endpoints da API.
12. Teste backup/restauração em ambiente separado. Valide requisitos operacionais de privacidade antes de dados reais.

## 5. Testes automatizados

`node --test tests/*.test.mjs` verifica domínio, API com Supabase simulado, migração real e políticas SQL com PostgreSQL em memória (PGlite). O teste cria apenas o esquema mínimo de Auth e papéis para exercer RLS. Não testa o serviço Supabase Auth real, o runtime Pages, entrega de cookies pelo edge, concorrência entre conexões PostgreSQL independentes ou backup. O roteiro acima cobre os pontos de integração restantes.

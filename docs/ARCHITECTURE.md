# Arquitetura e autenticação

## Componentes

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Interface | `public/app.js`, `styles.css`, `index.html` | Navegação, formulários, estados vazios, feedback e versão em memória para demonstração |
| Cliente de sessão | `public/api-client.js` | Renovação compartilhada, descarte de respostas antigas e encerramento imediato da tela |
| Regras de domínio | `public/domain.js` | Métricas, dinheiro, fuso de Santos, saldos e sugestões de retorno |
| API/BFF | `functions/api/[[path]].js`, `server/api.js` | Rotas Pages, sessão, autorização, CSRF, cookies e chamadas ao Supabase |
| Validação | `server/validation.js` | Campos permitidos, limites, UUIDs, datas, valores e status |
| Persistência | `supabase/migrations/202610150001_initial.sql` | Tabelas, privilégios por coluna, RLS, auditoria, conflitos e integridade financeira |
| Institucional | `site-public/` | Material de importação pendente; links de WhatsApp independentes da intranet |

O site público permanece em `marcomunizlaser.com.br`. A intranet se destina a `app.marcomunizlaser.com.br`, em outro projeto Pages. Nenhuma troca de domínio faz parte deste PR.

## Fluxo de uma requisição

```mermaid
sequenceDiagram
    participant B as Navegador
    participant P as Pages Function
    participant A as Supabase Auth
    participant D as PostgreSQL / RLS
    B->>P: POST /api/login (e-mail + senha, mesma origem)
    P->>A: Token grant_type=password
    A-->>P: Access JWT + refresh token
    P->>A: GET /auth/v1/user (validar token)
    P->>D: Consultar admins ativos com JWT do usuário
    D-->>P: Autorização / negação
    P->>D: log_activity(login)
    P-->>B: Dois cookies HttpOnly + identidade sem tokens
    B->>P: GET /api/data ou POST/PATCH /api/entidade
    P->>A: Validar usuário novamente
    P->>D: Verificar administrador ativo
    P->>D: Ler/gravar sob JWT, privilégios e RLS
    D->>D: Validar constraints; auditar escrita na mesma transação
    P-->>B: JSON no-store
```

O HTML e o código cliente são públicos; não contêm informações privadas. Não existe proteção baseada apenas em ocultar páginas. Toda leitura/gravação privada exige usuário validado no servidor **e** autorização no PostgreSQL. Chamada direta à API Supabase também está sujeita a RLS e privilégios.

## Senhas, credenciais e tokens

- A senha percorre o formulário → API da mesma origem → Supabase Auth via HTTPS. A aplicação não a persiste, não a registra e não implementa hash próprio; armazenamento e verificação de senha são responsabilidade do Supabase Auth.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `APP_ORIGIN` são bindings de servidor no Cloudflare. A chave pública/anon não concede privilégio administrativo; as políticas do banco são obrigatórias. Não há necessidade de `service_role`, segredo JWT ou chave privada no runtime.
- O servidor valida cada access token via `/auth/v1/user`; não confia em um JWT apenas decodificado nem em metadados editáveis do usuário. Consulta ainda `admins.active`, permitindo revogação imediata de acesso aos dados pela allowlist.
- Os tokens retornam em `__Host-mml_access` e `__Host-mml_refresh`: `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, sem atributo Domain. Portanto o site institucional não recebe os cookies da intranet. O corpo JSON nunca retorna tokens ao JavaScript.
- Access cookie dura `expires_in` do Supabase. Refresh cookie dura 8 horas desde a última renovação (janela móvel, não duração absoluta). Configure expiração de JWT de 15 minutos e limites de sessão no provedor conforme disponibilidade do plano. A UI bloqueia após 15 minutos de inatividade, limpa os dados em memória e tenta revogar a sessão.
- Após resposta 401, o cliente tenta `/api/refresh` uma vez; há uma promessa compartilhada para evitar renovação simultânea na mesma aba. O servidor troca o refresh token, revalida o administrador e atualiza ambos os cookies. Abas separadas podem competir pela rotação: falha leva a novo login.
- Ao sair ou bloquear por inatividade, a interface limpa os dados imediatamente e invalida respostas pendentes. Uma resposta antiga não pode reabrir o espaço de trabalho nem encerrar uma sessão posterior. Respostas 403 em operações privadas também bloqueiam a tela. Login/refresh pendentes terminam antes do logout, evitando que seus cookies sejam aplicados depois da limpeza na mesma aba; novos logins aguardam esse encerramento.
- Logout tenta revogar a sessão local no Supabase e apaga os cookies mesmo quando a sessão já venceu. Se o access token venceu, utiliza o refresh cookie exclusivamente para obter um token e revogar a sessão, sem devolvê-lo ao navegador. Falha da auditoria ou remoção da allowlist não impede essa tentativa de revogação. JWTs são stateless e podem permanecer válidos até a expiração; desativar `admins.active` interrompe acesso ao banco de imediato. A interface informa quando não foi possível confirmar revogação remota. Sem rede, a tela é limpa, mas não há garantia de limpeza dos cookies HttpOnly; reconectar e encerrar a sessão antes de compartilhar o dispositivo.
- Não há tokens nem dados clínicos em URL, localStorage, IndexedDB, cache de service worker ou logs da aplicação.

## Endpoints

- `POST /api/login`, `/api/refresh`, `/api/logout`.
- `GET /api/session`, `/api/data` (leitura paginada do banco; auditado na API).
- `POST /api/patients|notes|appointments|quotes|payments`.
- `PATCH /api/patients|appointments|quotes|procedures/:id`, com UUID `version` obrigatório.
- Sem endpoints de criar admins, alterar papéis, excluir registros ou enviar WhatsApp.

`PATCH` inclui `id` e `version` como filtros no mesmo UPDATE; zero linhas indica conflito (409). O banco gera outra versão a cada escrita. Auditoria de mutação é trigger na mesma transação, inclusive para acessos autorizados fora do BFF. Auditoria de leitura é somente do BFF; chamadas diretas de leitura ao PostgREST não geram eventos nessa tabela.

## Referências oficiais

- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: sessões no servidor e refresh tokens](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Cloudflare Pages: rotas de Functions](https://developers.cloudflare.com/pages/functions/routing/)
- [Cloudflare Pages: bindings e variáveis](https://developers.cloudflare.com/pages/functions/bindings/)

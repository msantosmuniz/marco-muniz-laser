# Segurança e dados pessoais

## Controles implementados

- Acesso apenas a dois administradores explicitamente provisionados; validação da sessão no servidor em cada request e allowlist consultada novamente.
- RLS em todas as tabelas, privilégios por coluna e ausência de privilégios de exclusão para usuários da aplicação. Papéis não são derivados de metadados editáveis de Auth.
- Origin exato para POST/PATCH, host permitido, cookies isolados por host, SameSite Strict, validação por lista de campos, limite de corpo de 16 KB e respostas privadas `no-store`.
- Conteúdo variável escapado antes da renderização; sem HTML clínico, scripts inline, fontes externas ou analytics. CSP e headers nos arquivos estáticos e respostas da API.
- Registro de autor, entidade, ID, operação e nomes dos campos modificados; sem valores clínicos, telefone, senha ou tokens nos eventos de auditoria. Logs de falha de login ficam a cargo do Supabase Auth, sem duplicação local de credenciais.
- Histórico clínico por notas anexadas; sem sobrescrita de autor ou exclusão pela aplicação. Versões para conflitos de edição. Constraints para sobreposição da agenda e integridade dos recebimentos.
- Sem cache offline de pacientes. Sessão bloqueada na UI após 15 minutos de inatividade; renovação/revogação do provedor descrita em ARCHITECTURE.
- Nenhum envio automático de WhatsApp ou dado de paciente embutido em link público.

## Preparação operacional pendente

Estes controles técnicos **não constituem certificação nem garantia de conformidade integral com a LGPD**. Antes de operar com pacientes, a clínica deve definir com responsáveis apropriados: finalidade/base legal do tratamento dos dados pessoais e clínicos, aviso de privacidade, política de retenção de prontuários e documentos, atendimento a solicitações dos titulares, acesso dos responsáveis, fornecedores/suboperadores e transferências aplicáveis, backups e restauração, plano de incidentes e procedimentos de encerramento/revogação de contas. Não se presume que consentimento seja a única base ou que todos os dados possam ser apagados sem avaliar obrigações de guarda.

Não coletar CPF, documentos, imagens ou dados adicionais nesta versão. Campo de histórico deve conter apenas conteúdo necessário ao atendimento. Não usar pacientes reais em dev/homologação, logs de teste, PRs ou capturas de tela. Recebimentos não armazenam dados de cartão; somente forma de pagamento, data e valor.

Exclusão/anonimização, exportação de prontuário e correção/estorno financeiro não estão na UI. Estabelecer procedimento administrativo autorizado e auditado para tais solicitações antes da operação. Não editar o banco informalmente: preserve rastreabilidade e confira consequências financeiras e de retenção.

## Limites conhecidos

- MFA de usuário não foi implementado na UI; login usa senha. Considerar MFA e fluxo de recuperação de senha como etapa de endurecimento antes de expansão.
- Limites distribuídos de tentativas dependem da configuração do Cloudflare e Supabase; esta aplicação não usa um contador em memória como controle de segurança.
- A tabela de auditoria protege contra alteração pelos administradores da aplicação, não contra o proprietário do banco. Para retenção resistente à alteração, integrar uma trilha externa e controles operacionais.
- Logs de leitura são gerados na API. RLS permite acesso direto de admins ao PostgREST; tais leituras não são registradas pela trigger. Se auditoria de toda leitura direta for exigida, adicionar auditoria nativa de banco/gateway e revisar a superfície exposta.
- A API carrega registros autorizados em memória na aba. Um admin tem acesso completo; evitar dispositivos compartilhados, proteger o sistema operacional e não deixar uma sessão aberta sem supervisão.
- Manifesto PWA é preparação, não promessa de instalação em todos os dispositivos. Sem service worker ou acesso offline nesta entrega.

## Incidentes

Desative primeiro `admins.active` do usuário afetado, revogue suas sessões no Auth, preserve evidências sem reproduzir dados clínicos desnecessários, investigue o período e acione o procedimento aprovado da clínica. Se uma chave for exposta, rotacione no provedor; não resolva somente apagando um arquivo do Git.

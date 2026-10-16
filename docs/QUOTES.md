# Orçamentos: diagnóstico, operação e ativação

## Diagnóstico antes da implementação

A interface existente é JavaScript modular sem framework. `server/api.js` é o BFF de Cloudflare Pages Functions: valida o usuário no Supabase Auth e consulta a allowlist `admins` a cada requisição. Access/refresh tokens ficam em cookies HttpOnly, Secure e SameSite=Strict; o JavaScript não os recebe. Os dados privados têm `no-store`, controle de origem e políticas PostgreSQL RLS. O banco possui auditoria e atualização otimista por UUID de versão.

Pacientes são compartilhados pela agenda, notas e CRM. A agenda possui exclusão de sobreposição e confirmação manual de retornos. Pagamentos são separados de valores propostos e têm proteção contra recebimento em excesso. O CRM já tinha `quotes` com paciente, procedimento, valor total, data de criação e os status novo, orçamento enviado, sem resposta, fechado e perdido. O painel diário e o financeiro devem continuar independentes dos valores orçados.

## Implementação

- Ampliar `quotes` por migração adicional, sem substituir tabelas, recriar pacientes ou reclassificar valores antigos.
- Cadastro de cliente novo e orçamento na transação `create_quote_intake`, com JWT do administrador, RLS, idempotência e verificação de telefone.
- Cliente existente é selecionado pelo cadastro. Para cliente novo, telefone brasileiro com/sem 55 é normalizado. Nome e telefone compatíveis reutilizam o paciente; telefone compartilhado, divergência de nome ou múltiplos candidatos exigem seleção manual. Não há mesclagem automática. A proteção cobre este fluxo; o cadastro genérico de pacientes permanece com seu comportamento anterior.
- Três colunas visuais: Aguardando (inclui as três etapas abertas antigas), Fechado e Perdido. Edição sem mudança de categoria conserva o status antigo.
- Novos orçamentos começam com o valor de uma sessão. O total pode ser ajustado ao editar para propostas com várias sessões. Valor por sessão e total são explícitos; o sistema não calcula quantidade clínica de sessões.
- Registros antigos não ganham valor por sessão fictício. Campo nulo aparece como não informado e continua permitido na edição de registros legados. Data nula usa `created_at` no fuso America/Sao_Paulo.
- Prévia com identidade visual, descrição escapada e impressão A4. “Exportar PDF / imprimir” usa o diálogo do navegador: escolher **Salvar como PDF**. Nenhum documento público ou link de acesso ao orçamento é criado. O arquivo salvo passa a ser responsabilidade do administrador. PDF não é anexado automaticamente ao WhatsApp.
- Compartilhamento abre uma prévia com destinatário e texto, depois um link `wa.me`. Apenas o clique do administrador transfere o conteúdo ao WhatsApp; o envio final é manual. As mensagens de recuperação evitam mencionar o procedimento. Não existe integração Business Platform nem mensagem automática nesta entrega.

## Lembretes e indicadores

Lembretes são calculados a partir da data do orçamento, em dias de calendário de Brasília. Antes de sete dias não há pendência; entre sete e quatorze dias há a primeira etapa; a partir de quinze há a segunda. A etapa de quinze substitui uma primeira etapa vencida, evitando dois contatos no mesmo momento. Abrir WhatsApp não confirma entrega. **Marcar contato realizado** grava uma etapa única, com autor e horário do servidor em `quote_contacts`.

Fechado ou Perdido elimina automaticamente as pendências calculadas, sem apagar histórico. O banco trava o orçamento ao registrar um contato e recusa registros encerrados ou etapas ainda não vencidas. Outro administrador pode ter uma tela antiga; abrir uma mensagem atualiza os dados e revalida a pendência, e a gravação sempre é verificada no banco. Não há agendador nem fila que possa enviar depois do encerramento. Reabrir orçamento conserva contatos já registrados; não reinicia a sequência. Alterar a data recalcula somente etapas ainda não registradas. Atualizar dados recalcula a lista, inclusive após a mudança de dia.

O mês selecionado filtra os indicadores, não os cartões do CRM nem os acompanhamentos. Quantidade, valor orçado, quantidade/valor fechado, perdido e conversão são coortes pela **data do orçamento**, usando o status atual. Não representam vendas ocorridas naquele mês nem receita recebida. Recebimentos continuam exclusivamente no Financeiro. A tabela mensal permite comparar essas coortes.

## Ativação no Supabase / Cloudflare

1. Revisar a alteração e garantir backup/restauração antes de modificar um banco com dados importantes.
2. No projeto exclusivo de homologação, aplicar **apenas** `supabase/migrations/202610160001_quotes.sql`, após a migração inicial já aplicada. Não reaplicar a migração inicial nem o seed. A transação adicional não apaga registros.
3. Publicar juntos frontend e Functions desta branch no projeto separado de homologação. A nova API consulta `quote_contacts`; publicar antes da migração causará falha ao carregar dados. Não é necessária uma chave nova nem service_role.
4. Testar os dois administradores: orçamento novo/existente, telefone duplicado/ambíguo, edição concorrente, fechamento, contatos de 7/15 dias, exportação PDF e WhatsApp sem envio automático. Usar somente dados fictícios.
5. Para reverter aplicação, restaurar o deploy anterior; deixar as novas colunas/tabelas no banco. A aplicação anterior continua a ler os dados. Orçamentos novos com status aguardando não aparecem no kanban antigo: evitar rollback funcional depois de iniciar uso sem planejar a compatibilidade de status. Não executar DROP nem excluir registros.

Esta alteração não requer mudar DNS, domínio, site institucional, allowlist administrativa ou credenciais. A migração remota e a publicação dependem desta sequência; não são executadas pelo build.

## Google Drive: preparação e configuração pendente

`server/import-preview.js` é um adaptador puro, sem rede e sem gravações. Recebe linhas mapeadas (`external_id`, `name`, `phone`), pacientes e vínculos já conhecidos. Retorna proposta de novo cadastro, vínculo exato, item já importado ou revisão manual. Detecta duplicidade por ID estável da origem e por telefone normalizado, no banco e no lote. Nunca usa somente nome para unir pessoas. Não valida nem importa valores/procedimentos; isso pertence à futura etapa de mapeamento e validação do orçamento.

A tabela privada `import_links` reserva a unicidade `(source_key, external_id)`. Escritas por administradores e anônimos estão desabilitadas até existir a transação revisada de importação. Nenhum endpoint público ou botão de importação está ativo.

Antes de ativar: fornecer link/ID da planilha, aba, nomes das colunas e significado dos valores/status; escolher um identificador estável por linha (número da linha não serve, pois muda ao ordenar); definir origem principal dos dados e política para conflitos; autorizar leitura mínima no Google; guardar OAuth/credenciais apenas em secrets do servidor; implementar leitura paginada, prévia autenticada, confirmação humana e gravação transacional com os vínculos. Não publicar a planilha na web nem colocar dados ou credenciais no repositório. Reexecuções devem consultar os vínculos e o banco novamente dentro da transação.

## Validação

Executar `node --test tests/*.test.mjs` e `node scripts/build.mjs`. Os testes usam dados fictícios e PostgreSQL em memória (PGlite), não o Supabase remoto. Cobrem migração sobre registros existentes, RLS/privilégios, rollback atômico, idempotência, deduplicação, histórico de contato, bloqueio por status/data, limites de 7/15 dias, métricas, escape de HTML, links WhatsApp e prévia de importação. Os testes anteriores de autenticação, agenda, sessões e financeiro permanecem.

Testes concorrentes com conexões Supabase independentes e conferência do PDF salvo no navegador de uso devem integrar a homologação remota. Não há alegação de certificação LGPD; regras de acesso, retenção, backups e uso autorizado dos arquivos exportados continuam operacionais.

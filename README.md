# Marco Muniz Laser

Intranet de gestão da clínica em Santos/SP. **Versão inicial em homologação; ampliação de Orçamentos em revisão.** Consulte [Orçamentos: diagnóstico, operação e ativação](docs/QUOTES.md) antes de publicar esta atualização: ela exige uma migração adicional. A branch não altera DNS, domínios nem o site atual. O repositório continha somente um README na inspeção de 15/10/2026. O código-fonte desta revisão é público; não contém credenciais nem dados reais de pacientes.

## Executar agora com dados fictícios

Requisito: Node.js 22 ou superior. Sem dependências para executar ou compilar a aplicação.

```sh
node scripts/dev.mjs
```

Abra `http://localhost:4173` e escolha **Explorar com dados fictícios**. Cadastre pacientes, acrescente notas, agende, reagende, cancele, marque sessões realizadas, atualize orçamentos e registre pagamentos. Demonstração disponível somente em localhost/127.0.0.1; é isolada da API e perde suas alterações ao recarregar. Não inserir dados reais. Não há senha padrão nem bypass de autenticação no servidor.

```sh
# Dependência apenas para testes de banco
corepack pnpm install --frozen-lockfile
node --test tests/*.test.mjs
node scripts/build.mjs
```

Se Corepack não estiver instalado, use o pnpm 11.25.0 instalado pelo gerenciador oficial. O build gera `dist/` com a intranet; `functions/` fornece a API no Cloudflare Pages. Não há dependências de runtime de terceiros.

## Escopo entregue

- Autenticação Supabase por e-mail/senha, dois administradores em allowlist no banco, cookies HttpOnly, refresh e logout.
- Cadastro/editagem de pacientes, procedimento principal e histórico de notas anexadas com autoria. Sessões também compõem o histórico.
- Agenda compartilhada por mês, horários de Brasília, criação manual, reagendamento, cancelamento e conclusão. Uma sala/recurso: banco impede sobreposição, inclusive em gravações simultâneas.
- Retornos sugeridos após sessão realizada: tatuagem 60 dias, micropigmentação 30 dias, onicomicose 15 dias. Configuráveis, nunca agendados automaticamente.
- CRM em três colunas (Aguardando, Fechado e Perdido), preservando as etapas anteriores. Orçamentos personalizados, valor por sessão, data, PDF pela impressão do navegador, mensagens manuais de WhatsApp e acompanhamentos de 7/15 dias. Preparação de importação do Drive com revisão de duplicidades, ainda sem conexão ativa.
- Valor por sessão, pagamentos parciais, saldo a receber e histórico de recebimentos. Banco impede excesso e protege sessões com pagamento contra cancelamento, mudança de paciente/procedimento/horário ou redução abaixo do recebido.
- Dashboard mensal: novos pacientes, orçamentos criados no mês, conversões dessa coorte pelo status atual, sessões realizadas no mês e receita pela data de pagamento. Valores em centavos inteiros.
- Auditoria de escrita no banco e de acesso/login/refresh/logout na API. Registro da atividade de cada administrador sem duplicação de conteúdo clínico.
- Layout responsivo, manifesto PWA e ícone. Sem funcionamento offline nem cache de dados clínicos; instalação completa/offline é expansão futura.

## Configuração e limites

1. Siga [SETUP.md](docs/SETUP.md) para provisionar um Supabase de homologação, migrar o banco e configurar dois usuários individuais.
2. Leia [ARCHITECTURE.md](docs/ARCHITECTURE.md) para componentes, fluxo de autenticação, credenciais/tokens e estrutura modular.
3. Leia [SECURITY.md](docs/SECURITY.md) para controles, limites e preparação operacional de privacidade.
4. Para preservar o site público, forneça os arquivos listados em [site-public/README.md](site-public/README.md). Ainda não há reconstrução da publicação: ela permanece separada e intocada.
5. [WHATSAPP.md](docs/WHATSAPP.md) define a interface de integração futura; nenhum envio Business Platform está implementado ou ativo.

Agenda compartilhada usa persistência central e botão **Atualizar dados**; esta versão não usa Realtime. Conflitos de edição são detectados por versão do registro. Os dados são paginados internamente pela API, com limite explícito de 50 mil registros por entidade. É uma versão para operação pequena; paginação por busca/período deve anteceder crescimento significativo. Os últimos 100 eventos aparecem na tela de atividades.

Notas e recebimentos são anexados sem edição/exclusão pela interface. Estorno, conciliação, exportações em massa, anexos, recorrência, múltiplas salas e autosserviço de recuperação de senha não fazem parte desta versão. Correções financeiras exigem procedimento administrativo auditado; não usar o sistema como contabilidade fiscal.

A versão inicial possui ambiente de homologação separado no Supabase e Cloudflare, com dados fictícios e duas contas administrativas. Esta atualização deve passar pela migração e pelos testes de homologação descritos em QUOTES.md antes de uso. Credenciais e dados pessoais não pertencem ao repositório.

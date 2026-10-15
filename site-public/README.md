# Site público — preservação obrigatória

O repositório original contém somente `README.md`. Nenhum HTML, CSS, imagem ou conteúdo publicado foi fornecido. A leitura de `https://marcomunizlaser.com.br` falhou; não foi possível confirmar nem importar seu conteúdo. Não se declara que a versão pública foi reproduzida.

Este diretório mantém separado o contrato de integração do site institucional. `whatsapp.js` tem os três tratamentos informados e links com mensagens prontas para **5513997505099**, sem enviar nome, telefone, histórico ou dados do CRM. Os textos são sugestões novas, não extraídos do site atual. Nenhum envio é automático.

## Arquivos necessários para preservar fielmente a publicação

1. Código-fonte completo ou exportação estática: `index.html`, páginas de tratamento, contato e privacidade; scripts, CSS e fontes; se houver framework, componentes, rotas, `package.json` e lockfile.
2. Pasta de imagens e outros arquivos: logotipo em boa resolução, favicon, fotos, banners e imagens de compartilhamento, com indicação das permissões de uso.
3. SEO atual: títulos, descriptions, canonical, Open Graph, dados estruturados, textos/URLs dos tratamentos, `robots.txt`, `sitemap.xml` e redirecionamentos.
4. Conteúdo aprovado: endereço completo de Santos/SP, horários, biografia, contatos, textos de tratamentos, política de privacidade e qualquer registro profissional exibido.
5. Configuração de build e exportação do Cloudflare Pages (`_headers`, `_redirects`, `wrangler` se usado), sem credenciais. Identificar o projeto que atende o domínio atual e sua branch de produção.

Não fornecer arquivos `.env`, tokens, chaves privadas ou dados de pacientes. Acesso de configuração deve ser feito nos painéis dos fornecedores.

## Importação posterior

- Preservar texto, identidade visual e URLs existentes; comparar com a publicação antes de qualquer substituição.
- Manter SEO local em Santos/SP e canonical no domínio público. Não inventar endereço, avaliações, resultados clínicos, credenciais profissionais ou promessas de resultado.
- Aplicar os links de `whatsapp.js` aos botões correspondentes após revisão dos textos.
- Publicar o institucional em projeto Pages separado da intranet. Não apontar `marcomunizlaser.com.br` para `dist/` deste projeto: `dist/` contém exclusivamente a intranet e tem `noindex`.
- Só produzir a configuração final de build público e trocar a publicação após receber os arquivos e autorização explícita.

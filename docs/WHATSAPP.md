# Integração futura com WhatsApp Business Platform

A v1 só prepara links públicos `wa.me` em `site-public/whatsapp.js`, para o telefone 5513997505099. Não há token Meta, webhook, fila ou disparo automático.

## Fronteira proposta para a expansão

Adicionar módulo `server/integrations/whatsapp/` implementando uma porta `sendApprovedTemplate({ patientId, appointmentId, templateId, locale, idempotencyKey, approvedBy })`. Implementações devem buscar o telefone no servidor após autorização; não receber histórico clínico arbitrário do navegador. A UI deverá apresentar destinatário, texto e motivo antes da confirmação explícita.

Persistir uma outbox com estado pendente/enviado/falhou, aprovação humana, ID de idempotência e identificador externo. Separar logs de entrega da auditoria clínica. Alteração de intervalo ou agendamento não implica aprovação de mensagem; nenhum timer de agenda deve disparar comunicação automaticamente na v1.

Na implementação futura, validar requisitos atuais da Meta para templates, autorização do destinatário e janelas de conversa, verificar assinatura dos webhooks, usar credenciais em secrets do servidor, deduplicar callbacks e aplicar retentativas limitadas. Não enviar diagnósticos, notas ou prontuários em mensagens de lembrete. Implementar retenção e cancelamento das comunicações segundo as políticas aprovadas da clínica. Esses itens são contrato de expansão, não funcionalidades entregues.

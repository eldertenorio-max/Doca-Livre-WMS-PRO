# Pré-requisito — Plataforma

Sem estes blocos, as ondas viram gambiarra.

## Épicos

### P0. Multi-empresa / multi-CD
- Tabelas `wms_empresa`, `wms_deposito`, vínculo usuário↔depósito
- Toda entidade WMS ganha `deposito_id` (nullable na migração; obrigatório depois)
- **Aceite:** dois depósitos isolados no mesmo banco sem vazamento de estoque
- **Status:** foundation (`rfq_platform` + flags)

### P1. Camada de integração
- Fila de eventos (`rfq_integration_event`)
- Webhooks outbound + ingest ASN/EDI/API com idempotência
- **Aceite:** evento persistido e reprocessável sem duplicar
- **Status:** foundation

### P2. Parametrização por cliente/depósito
- Perfis: conferência (cego/parcial/total), política lote (FIFO/FEFO/LIFO), putaway
- API `/api/rfq/params`
- **Aceite:** mudar perfil altera comportamento do recebimento sem deploy
- **Status:** foundation

### P3. Jobs assíncronos + performance
- Workers para schema/seed, putaway pesado, relatórios
- Timeouts curtos no path crítico (já iniciado no recebimento)
- **Aceite:** bipagem não bloqueia em ensure_schema
- **Status:** wip (parcial no código atual)

### P4. PWA / coletor
- Offline parcial, fila local de bipagens, testes em coletor real
- **Aceite:** bipagem sobrevive a queda de rede curta
- **Status:** backlog

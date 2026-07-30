# Onda 1 — Fechar WMS de mercado (Parciais → Sim)

Objetivo: todos os itens WMS `Parcial` da RFQ virarem `Sim`.

## Épicos

| ID | Requisito RFQ | Entrega | Status |
|----|---------------|---------|--------|
| W1 | ASN / pré-aviso | Import ASN (XML/JSON/API), vínculo NF/recebimento | foundation |
| W2 | Recebimento cego | Perfil `conferencia_modo=cego\|parcial\|total` | foundation |
| W3 | QA aprovação/reprovação | Estados de lote + bloqueio putaway | foundation |
| W4 | Picking onda/zona | Motor de ondas + zonas | foundation |
| W5 | Rota de picking | Ordenação por corredor/endereço | foundation |
| W6 | RFID conferência | Adapter RFID + fallback barcode | foundation |
| W7 | Ordem carregamento otimizada | Sequenciador carga/doca | foundation |
| W8 | Inventário cego + recontagem | Políticas 2ª contagem | foundation |
| W9 | KPIs giro/acuracidade/produtividade | Métricas + API analytics | foundation |
| W10 | Putaway configurável | Políticas por SKU/depósito | foundation |
| W11 | Mobile RF hardening | PWA offline / coletor | backlog |

## Critério de pronto

Cada épico: API + UI (ou flag) + teste + demo de mercado + status RFQ = `Sim`.

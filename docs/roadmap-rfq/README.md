# Roadmap RFQ — Doca Livre WMS Pro

Visão de **produto de mercado** para cobrir a planilha RFQ (`docs/RFQ_respostas_WMS_Pro_v2.xlsx`).

## Status das ondas

| Onda | Escopo | Doc |
|------|--------|-----|
| Plataforma | Multi-CD, integrações, parâmetros, jobs, PWA | [00-plataforma.md](00-plataforma.md) |
| 1 — WMS mercado | Fechar todos os `Parcial` da aba WMS | [01-onda1-wms.md](01-onda1-wms.md) |
| 2 — 3PL | Multi-cliente, billing, SLA, portal | [02-onda2-3pl.md](02-onda2-3pl.md) |
| 3 — YMS | Agendamento, portaria, pátio, KPIs yard | [03-onda3-yms.md](03-onda3-yms.md) |
| 4 — Verticais | Cross-dock, bobinas, WCS/RFID, milk run | [04-onda4-verticais.md](04-onda4-verticais.md) |
| Fora do núcleo | Portuário / Siscomex | [99-portuario-parceria.md](99-portuario-parceria.md) |

## Legenda de status de épico

- `backlog` — especificado, não iniciado
- `foundation` — schema/API/flag no código (esqueleto)
- `wip` — em desenvolvimento
- `done` — critério de aceite atendido (vira `Sim` na RFQ)

## API de cobertura

Prefixo: `/api/rfq` (módulo `rfq_platform.py`).

| Método | Path | Função |
|--------|------|--------|
| GET | `/coverage` | Catálogo RFQ + status + flags |
| GET | `/flags` | Feature flags |
| GET/POST | `/params` | Parametrização por depósito |
| GET | `/depositos` | Multi-CD |
| GET/POST | `/events` | Fila de integração idempotente |
| GET/POST | `/asn` | ASN / pré-aviso |
| POST | `/qa/lote` | QA quarentena/aprovado/reprovado |
| GET | `/conferencia/modo` | Recebimento cego/parcial/total |
| POST | `/picking/onda` | Motor de ondas |
| POST | `/picking/rota` | Ordenação de rota |
| POST | `/rfid/read` | Adapter RFID + fallback barcode |
| POST | `/carregamento/sequenciar` | Sequenciador de carga |
| GET | `/kpis/wms` | KPIs WMS |
| GET | `/inventario/politica` | Inventário cego / recontagem |
| POST | `/tpl/*` | 3PL (depositante, tarifa, fatura, SLA, portal) |
| GET/POST | `/yms/*` | YMS (agendamento, portaria, pátio) |
| POST | `/cross-dock/liberar` | Cross-dock |
| GET/POST | `/bobinas` | Vertical bobinas |
| POST | `/wcs/evento` | Middleware WCS |
| GET | `/portuario` | Declara fora do núcleo |

Flags via env: `RFQ_FLAG_<NOME>=1|0` (ex.: `RFQ_FLAG_PORTUARIO_CORE=0`).

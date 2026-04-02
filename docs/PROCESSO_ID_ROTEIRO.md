# Processo para trazer o ID do Roteiro e o Identificador da Rota

Este documento explica **como** o sistema obtém `id_roteiro` e `identificador_rota` e **o que é necessário** para que eles apareçam na tabela `romaneio_por_item`.

---

## 1. Objetivo

- **Tabela:** `romaneio_por_item` (Postgres).
- **Campos:** `id_roteiro` (ex: `660002`) e `identificador_rota` (ex: `"38 - GRU - BARRA FUNDA"`).
- **Origem dos dados:** API Ravex (`https://api.rest.app.ravex.com.br`).

Os valores são preenchidos **no momento da importação** (Ravex → nosso backend → banco). Cada linha do romaneio recebe o mesmo `id_roteiro` e `identificador_rota` da viagem.

---

## 2. Quando o fluxo é executado

O fluxo que **resolve** `id_roteiro` e `identificador_rota` roda dentro de `_ravex_linhas_romaneio_viagem(token, id_viagem)`, que é chamada quando:

| Ação do usuário | Endpoint / fluxo |
|-----------------|-------------------|
| **Importar Ravex** → “Puxar este roteiro/viagem” (ID único) | `POST /api/ravex/importar-romaneio` |
| **Importar Ravex** → “Puxar todos os roteiros do período” | `POST /api/ravex/sincronizar-periodo` (para cada viagem do período) |
| **Importar Ravex** → “Puxar lista de roteiros/viagens” | `POST /api/ravex/importar-lista` (para cada ID da lista) |

Em todos os casos, o backend:

1. Obtém **token** Ravex (`RAVEX_USER` / `RAVEX_PASSWORD`).
2. Resolve **id_viagem** (a partir de id_roteiro ou id informado, se necessário).
3. Chama **`_ravex_linhas_romaneio_viagem(token, id_viagem)`**.
4. Grava o retorno (`id_roteiro`, `linhas`) em `romaneio_por_item` (cada linha contém `id_roteiro` e `identificador_rota`).

Ou seja: **só há preenchimento de id_roteiro/identificador_rota quando há importação Ravex** (por período, por ID único ou por lista). Dados antigos importados antes das melhorias continuarão com NULL até **reimportar**.

---

## 3. O que é necessário para trazer o id_roteiro

### 3.1 Entrada obrigatória

- **Token Ravex** válido (credenciais no Render: `RAVEX_USER`, `RAVEX_PASSWORD`).
- **id_viagem** (ID da viagem faturada). Ele é obtido pelo próprio fluxo de importação a partir do que o usuário informa (id_roteiro ou id da viagem).
- **Viagem existente na Ravex:** `GET /api/viagem-faturada/{id}` deve retornar sucesso (viagem faturada).

### 3.2 Ordem em que o sistema tenta obter id_roteiro

Dentro de `_ravex_linhas_romaneio_viagem`, o `id_roteiro` é preenchido **nessa ordem** (primeira fonte que devolver valor ganha):

| # | Fonte | API / origem | Condição |
|---|--------|---------------|----------|
| 1 | **obter-roteiro-por-periodo** | `GET /api/roteiro/obter-roteiro-por-periodo?pDataInicial=...&pDataFinal=...` | Ter data da viagem (ou usar data atual como fallback). Lista de roteiros; escolhe o que tem `viagemFaturada.id` ou `viagemFaturadaId` = nosso `id_viagem`. Do roteiro escolhido usa `id`. |
| 2 | Objeto **roteiro** dentro da viagem | Resposta de `GET /api/viagem-faturada/{id}` (`viagem.roteiro` ou `viagem.roteiroFaturado`) | Viagem já vir com roteiro embutido; usar `roteiro.id` ou `roteiro.Id`. |
| 3 | Campos diretos da viagem | Mesma resposta da viagem | `viagem.roteiroId`, `viagem.idRoteiro`, `viagem.roteiro_id`, `viagem.id_roteiro`. |
| 4 | **Pedido da primeira NF** | Para cada NF: `GET /api/viagem-faturada/{id}/notas-fiscais` → pega primeiro pedido → `GET /api/pedido/{id}` | Do pedido: `roteiroId`, `idRoteiro`, `roteiro_id` ou `pedido.roteiro.id`. |

Se após todos os passos `id_roteiro` continuar vazio, ele não será preenchido e as linhas podem ser gravadas com `id_roteiro` NULL (dependendo do restante do fluxo).

---

## 4. O que é necessário para trazer o identificador_rota

### 4.1 Ordem de preenchimento

| # | Fonte | API / origem | Condição |
|---|--------|---------------|----------|
| 1 | **GET /api/roteiro/{id}** | `GET /api/roteiro/660002` (exemplo) | **Sempre que já tivermos id_roteiro.** Resposta deve ter `identificadorRota` (ou `identificador_rota`, `identificador`, `nome`). Essa é a **fonte oficial** do identificador. |
| 2 | Objeto roteiro na viagem | `viagem.roteiro` / `viagem.roteiroFaturado` | Se não veio do passo 1, usa o mesmo objeto para pegar `identificadorRota`, etc. |
| 3 | Campos da viagem | Resposta da viagem | `viagem.identificadorRota`, `identificador`, `nome`. |
| 4 | **Filtro de valor inválido** | — | Se o valor for um “código técnico” (ex: muitos caracteres, sem `" - "`), é descartado e o sistema tenta de novo via **obter-roteiro-por-periodo** (e depois, se tiver id_roteiro, via GET roteiro/{id}). |

Ou seja: para ter identificador legível (ex: `"38 - GRU - BARRA FUNDA"`), o ideal é **sempre** ter `id_roteiro` e chamar **GET /api/roteiro/{id}**.

---

## 5. APIs Ravex usadas (resumo)

| Finalidade | URL / método | Parâmetros / corpo | O que precisamos da resposta |
|------------|--------------|--------------------|-----------------------------|
| **Listar roteiros no período (achar id do roteiro)** | `GET /api/roteiro/obter-roteiro-por-periodo` | `pDataInicial`, `pDataFinal` (ex: `2026-03-11`, `2026-03-13` ou ISO com hora) | Lista de roteiros; em cada um: `id` (ou `Id`) e `viagemFaturada.id` ou `viagemFaturadaId` para comparar com `id_viagem`. |
| **Trazer identificador do roteiro** | `GET /api/roteiro/{id}` (ex: `/api/roteiro/660002`) | — | `identificadorRota` (ou `identificador_rota`, `identificador`, `nome`). |
| Obter viagem (já usada antes) | `GET /api/viagem-faturada/{id}` | — | `inicioDataHora` / `dataInicioViagem` (para montar período), `roteiro`, `roteiroId`, etc. |
| Obter pedido (fallback para id_roteiro) | `GET /api/pedido/{id}` | — | `roteiroId`, `roteiro.id`, etc. |

---

## 6. Por que pode não vir id_roteiro / identificador_rota

Possíveis causas:

1. **Viagem sem data**  
   Usamos `inicioDataHora`, `dataInicioViagem`, `dataHoraInicio`, `dataInicio`, `dataFim`, `data`. Se a API não devolver nenhum deles, usamos a data atual (UTC). Se o período estiver errado, **obter-roteiro-por-periodo** pode não devolver o roteiro dessa viagem.

2. **obter-roteiro-por-periodo retorna vazio**  
   - Formato de data: tentamos `YYYY-MM-DD` e, se a lista vier vazia, ISO com hora.  
   - Janela: 3 dias antes e 3 dias depois da data da viagem.  
   - Se a API exige outro formato ou outra janela, a lista pode vir vazia.

3. **Estrutura da resposta diferente**  
   Esperamos algo como: `{ "success": true, "data": [ { "id": 660002, "identificadorRota": "...", "viagemFaturada": { "id": 12345 } }, ... ] }`.  
   Se a lista estiver em `data.items`, `data.result` ou no primeiro nível (`items`, `result`), o código já tenta esses campos. Outros formatos podem exigir ajuste em `ravex_client.obter_roteiro_por_periodo`.

4. **Viagem não traz roteiro e pedido também não**  
   Se a viagem não tiver `roteiro`/`roteiroId` e o pedido da primeira NF também não tiver `roteiroId`/`roteiro.id`, e além disso **obter-roteiro-por-periodo** não devolver o roteiro dessa viagem, `id_roteiro` fica vazio.

5. **GET /api/roteiro/{id} falha ou não traz identificadorRota**  
   Se a chamada falhar (404, 401, timeout) ou a resposta não tiver `identificadorRota` (nem os fallbacks), `identificador_rota` pode ficar vazio ou vir só de outras fontes (que às vezes são códigos técnicos e são descartados).

---

## 7. O que fazer na prática

1. **Reimportar** pela aba **Importar Ravex** (por período, por ID único ou por lista) para que o novo fluxo rode e preencha `id_roteiro` e `identificador_rota` no banco.  
2. **Conferir credenciais** no Render: `RAVEX_USER`, `RAVEX_PASSWORD` (e `RAVEX_BASE_URL` se usar outro ambiente).  
3. **Testar com um id_viagem conhecido:**  
   - Importar só essa viagem (ou um roteiro que tenha essa viagem).  
   - Ver na tabela `romaneio_por_item` se `id_roteiro` e `identificador_rota` foram preenchidos.  
4. Se ainda não vier:  
   - Ver nos **logs do Render** se há erro 4xx/5xx ou timeout nas chamadas à Ravex.  
   - (Opcional) Usar um endpoint de debug (ex.: algo como `/api/ravex-debug-roteiro?id_viagem=XXX`) que chame as mesmas APIs e devolva as respostas brutas para inspecionar formato e conteúdo.

---

## 8. Onde está o código

| O quê | Onde |
|-------|------|
| Montagem das linhas e resolução de id_roteiro/identificador_rota | `app.py` → `_ravex_linhas_romaneio_viagem()` |
| Chamada a obter-roteiro-por-periodo | `ravex_client.py` → `obter_roteiro_por_periodo()` |
| Chamada a GET /api/roteiro/{id} | `ravex_client.py` → `obter_roteiro_por_id()` |
| Gravação em romaneio_por_item | `app.py` → rotas que chamam `_ravex_linhas_romaneio_viagem` e depois `INSERT INTO romaneio_por_item` (ex.: `api_ravex_importar_romaneio`, `api_ravex_sincronizar_periodo`, importar-lista). |
| Conversão da linha para o INSERT | `app.py` → `_romaneio_linha_para_tuple_pg()` (usa `L.get('id_roteiro')`, `L.get('identificador_rota')`). |

Com isso, o processo e o que é necessário para trazer o id do roteiro e o identificador da rota ficam definidos de forma clara no projeto.

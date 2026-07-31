/**
 * UI RFQ dentro do módulo Endereçamento WMS (sub-abas ASN, Config, QA, Picking+, YMS, 3PL, Verticais).
 */
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function msg(elId, text, isErr) {
        var el = $(elId);
        if (!el) return;
        el.textContent = text || '';
        el.style.color = isErr ? '#c62828' : '#37474f';
    }

    async function api(path, opts) {
        opts = opts || {};
        var init = {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
            method: opts.method || 'GET',
            body: opts.body ? JSON.stringify(opts.body) : undefined
        };
        var resp = await fetch('/api/rfq' + path, init);
        var data = {};
        try { data = await resp.json(); } catch (e) { data = {}; }
        if (!resp.ok || data.ok === false) {
            var err = (data && data.erro) || ('HTTP ' + resp.status);
            throw new Error(err);
        }
        return data;
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── ASN ──────────────────────────────────────────────────────────────────

    async function loadWmsAsn() {
        var tb = $('wms-tbody-asn');
        if (tb) tb.innerHTML = '<tr><td colspan="6" class="loading">Carregando...</td></tr>';
        try {
            var data = await api('/asn');
            var rows = data.asns || [];
            if (!tb) return;
            if (!rows.length) {
                tb.innerHTML = '<tr><td colspan="6">Nenhum ASN importado.</td></tr>';
                return;
            }
            tb.innerHTML = rows.map(function (r) {
                return '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.numero) + '</td><td>' + esc(r.fornecedor) +
                    '</td><td>' + esc(r.deposito_id) + '</td><td>' + esc(r.status) + '</td><td>' + esc(r.criado_em) + '</td></tr>';
            }).join('');
        } catch (e) {
            if (tb) tb.innerHTML = '<tr><td colspan="6">Erro: ' + esc(e.message) + '</td></tr>';
        }
    }

    async function salvarAsn() {
        try {
            var numero = ($('wms-asn-numero') || {}).value || '';
            var body = {
                numero: String(numero).trim(),
                fornecedor: (($('wms-asn-fornecedor') || {}).value || '').trim() || null,
                deposito_id: parseInt(($('wms-asn-deposito') || {}).value, 10) || null
            };
            if (!body.numero) { msg('wms-asn-msg', 'Informe o nº ASN.', true); return; }
            await api('/asn', { method: 'POST', body: body });
            msg('wms-asn-msg', 'ASN ' + body.numero + ' importado.');
            if ($('wms-asn-numero')) $('wms-asn-numero').value = '';
            await loadWmsAsn();
        } catch (e) {
            msg('wms-asn-msg', e.message, true);
        }
    }

    // ── Config / params ──────────────────────────────────────────────────────

    async function loadWmsConfigRfq() {
        var sel = $('wms-rfq-deposito');
        try {
            var deps = await api('/depositos');
            var list = deps.depositos || [];
            if (sel) {
                if (!list.length) {
                    sel.innerHTML = '<option value="">Nenhum depósito</option>';
                } else {
                    sel.innerHTML = list.map(function (d) {
                        return '<option value="' + esc(d.id) + '">' + esc(d.codigo) + ' — ' + esc(d.nome) + '</option>';
                    }).join('');
                }
            }
            var depId = sel && sel.value ? parseInt(sel.value, 10) : null;
            if (depId) await _aplicarParamsNaUi(depId);
            msg('wms-rfq-config-msg', 'Parâmetros carregados.');
        } catch (e) {
            msg('wms-rfq-config-msg', e.message, true);
        }
    }

    async function _aplicarParamsNaUi(depId) {
        var data = await api('/params?deposito_id=' + encodeURIComponent(depId));
        var map = {};
        (data.params || []).forEach(function (p) { map[p.chave] = p.valor; });
        if ($('wms-rfq-conf-modo') && map.conferencia_modo != null) {
            $('wms-rfq-conf-modo').value = String(map.conferencia_modo);
        }
        if ($('wms-rfq-politica-lote') && map.politica_lote != null) {
            $('wms-rfq-politica-lote').value = String(map.politica_lote);
        }
        if ($('wms-rfq-inv-cego') && map.inventario_cego != null) {
            $('wms-rfq-inv-cego').value = map.inventario_cego ? 'true' : 'false';
        }
        if ($('wms-rfq-recontagem') && map.recontagem_auto != null) {
            $('wms-rfq-recontagem').value = map.recontagem_auto ? 'true' : 'false';
        }
    }

    async function salvarParamsRfq() {
        var sel = $('wms-rfq-deposito');
        var depId = sel && sel.value ? parseInt(sel.value, 10) : null;
        if (!depId) { msg('wms-rfq-config-msg', 'Selecione um depósito.', true); return; }
        var pares = [
            ['conferencia_modo', ($('wms-rfq-conf-modo') || {}).value || 'total'],
            ['politica_lote', ($('wms-rfq-politica-lote') || {}).value || 'FEFO'],
            ['inventario_cego', (($('wms-rfq-inv-cego') || {}).value || 'false') === 'true'],
            ['recontagem_auto', (($('wms-rfq-recontagem') || {}).value || 'true') === 'true']
        ];
        try {
            for (var i = 0; i < pares.length; i++) {
                await api('/params', {
                    method: 'POST',
                    body: { deposito_id: depId, chave: pares[i][0], valor: pares[i][1] }
                });
            }
            msg('wms-rfq-config-msg', 'Parâmetros salvos para o depósito ' + depId + '.');
            await atualizarBannerRecebimentoCego();
        } catch (e) {
            msg('wms-rfq-config-msg', e.message, true);
        }
    }

    async function verCoverage() {
        var box = $('wms-rfq-coverage-box');
        if (!box) return;
        try {
            var data = await api('/coverage');
            box.hidden = false;
            var resumo = data.resumo || {};
            var linhas = Object.keys(resumo).map(function (k) {
                return '<li><strong>' + esc(k) + '</strong>: ' + esc(resumo[k]) + '</li>';
            }).join('');
            var itens = (data.itens || []).slice(0, 40).map(function (it) {
                return '<tr><td>' + esc(it.id) + '</td><td>' + esc(it.onda) + '</td><td>' + esc(it.titulo) +
                    '</td><td>' + esc(it.status) + '</td></tr>';
            }).join('');
            box.innerHTML =
                '<p style="margin:0 0 8px 0;">Resumo: <ul style="margin:4px 0 8px 18px;">' + linhas + '</ul></p>' +
                '<div class="table-container"><table class="data-table"><thead><tr><th>ID</th><th>Onda</th><th>Título</th><th>Status</th></tr></thead><tbody>' +
                itens + '</tbody></table></div>';
        } catch (e) {
            box.hidden = false;
            box.textContent = e.message;
        }
    }

    // ── Recebimento cego (banner na aba Recebimento) ─────────────────────────

    async function atualizarBannerRecebimentoCego() {
        var banner = $('wms-rec-modo-banner');
        if (!banner) return;
        try {
            var deps = await api('/depositos');
            var depId = (deps.depositos && deps.depositos[0] && deps.depositos[0].id) || null;
            var q = depId ? ('?deposito_id=' + encodeURIComponent(depId)) : '';
            var data = await api('/conferencia/modo' + q);
            if (data.ocultar_qtd_esperada) {
                banner.hidden = false;
                banner.className = 'wms-rfq-banner wms-rfq-banner--warn';
                banner.innerHTML = '<strong>Recebimento cego ativo</strong> — quantidades esperadas ocultas na conferência. Auditoria pós-conferência habilitada. Altere em <em>Config RFQ</em>.';
                document.querySelectorAll('#wms-tbody-rec-nf-itens td:nth-child(4), #wms-panel-recebimento th:nth-child(4)').forEach(function (el) {
                    if (el && el.closest('#wms-rec-nf-itens-wrap')) el.style.visibility = 'hidden';
                });
            } else {
                banner.hidden = false;
                banner.className = 'wms-rfq-banner';
                banner.innerHTML = 'Modo de conferência: <strong>' + esc(data.modo || 'total') + '</strong>. Configure em <em>Config RFQ</em>.';
            }
        } catch (e) {
            banner.hidden = true;
        }
    }

    // ── QA ───────────────────────────────────────────────────────────────────

    async function loadWmsQaLote() {
        msg('wms-qa-msg', 'Informe SKU/lote e registre o status de qualidade.');
    }

    async function salvarQa() {
        try {
            var body = {
                sku: (($('wms-qa-sku') || {}).value || '').trim(),
                lote: (($('wms-qa-lote') || {}).value || '').trim(),
                status: ($('wms-qa-status') || {}).value || 'quarentena',
                motivo: (($('wms-qa-motivo') || {}).value || '').trim() || null,
                deposito_id: parseInt(($('wms-qa-deposito') || {}).value, 10) || null
            };
            if (!body.sku || !body.lote) { msg('wms-qa-msg', 'SKU e lote obrigatórios.', true); return; }
            var data = await api('/qa/lote', { method: 'POST', body: body });
            msg('wms-qa-msg', 'QA registrado: ' + data.status +
                (data.putaway_bloqueado ? ' — putaway bloqueado.' : ' — putaway liberado.'));
        } catch (e) {
            msg('wms-qa-msg', e.message, true);
        }
    }

    // ── Picking+ ─────────────────────────────────────────────────────────────

    async function loadWmsPickingAvancado() {
        msg('wms-onda-msg', 'Crie uma onda ou ordene uma rota de picks.');
        var tb = $('wms-tbody-rota');
        if (tb && !tb.querySelector('td:not(.loading)')) {
            tb.innerHTML = '<tr><td colspan="2">Aguardando ordenação...</td></tr>';
        }
    }

    async function criarOnda() {
        try {
            var body = {
                codigo: (($('wms-onda-codigo') || {}).value || '').trim() || null,
                zona: (($('wms-onda-zona') || {}).value || '').trim() || null,
                deposito_id: parseInt(($('wms-onda-deposito') || {}).value, 10) || null
            };
            var data = await api('/picking/onda', { method: 'POST', body: body });
            msg('wms-onda-msg', 'Onda criada: ' + data.codigo + ' (' + data.status + ')');
        } catch (e) {
            msg('wms-onda-msg', e.message, true);
        }
    }

    async function ordenarRota() {
        var ta = $('wms-rota-picks');
        var lines = String((ta && ta.value) || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
        var picks = lines.map(function (end) { return { endereco: end }; });
        var tb = $('wms-tbody-rota');
        try {
            var data = await api('/picking/rota', { method: 'POST', body: { picks: picks } });
            var ord = data.picks || [];
            if (!tb) return;
            if (!ord.length) {
                tb.innerHTML = '<tr><td colspan="2">Nenhum pick informado.</td></tr>';
                return;
            }
            tb.innerHTML = ord.map(function (p) {
                return '<tr><td>' + esc(p.seq_rota) + '</td><td>' + esc(p.endereco) + '</td></tr>';
            }).join('');
        } catch (e) {
            if (tb) tb.innerHTML = '<tr><td colspan="2">Erro: ' + esc(e.message) + '</td></tr>';
        }
    }

    // ── YMS ──────────────────────────────────────────────────────────────────

    async function loadWmsYms() {
        await Promise.all([listarAgendamentos(), loadPatio()]);
    }

    async function listarAgendamentos() {
        var tb = $('wms-tbody-yms');
        if (tb) tb.innerHTML = '<tr><td colspan="7" class="loading">Carregando...</td></tr>';
        try {
            var data = await api('/yms/agendamentos');
            var rows = data.agendamentos || [];
            if (!tb) return;
            if (!rows.length) {
                tb.innerHTML = '<tr><td colspan="7">Nenhum agendamento.</td></tr>';
                return;
            }
            tb.innerHTML = rows.map(function (r) {
                var slot = esc(r.slot_inicio || '') + ' → ' + esc(r.slot_fim || '');
                return '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.doca) + '</td><td>' + esc(r.placa) +
                    '</td><td>' + esc(r.transportadora) + '</td><td>' + esc(r.prioridade) +
                    '</td><td>' + esc(r.status) + '</td><td>' + slot + '</td></tr>';
            }).join('');
        } catch (e) {
            if (tb) tb.innerHTML = '<tr><td colspan="7">Erro: ' + esc(e.message) + '</td></tr>';
        }
    }

    async function loadPatio() {
        var el = $('wms-yms-patio-mapa');
        if (!el) return;
        try {
            var data = await api('/yms/patio');
            var vagas = data.mapa || [];
            if (!vagas.length) {
                el.textContent = 'Nenhuma vaga cadastrada. Use “Criar vaga”.';
                return;
            }
            el.innerHTML = vagas.map(function (v) {
                var occ = v.ocupado ? 'ocupada' : 'livre';
                return '<span class="wms-yms-vaga wms-yms-vaga--' + occ + '">' +
                    esc(v.codigo) + (v.placa ? ' · ' + esc(v.placa) : '') + '</span>';
            }).join(' ');
        } catch (e) {
            el.textContent = e.message;
        }
    }

    async function agendarYms() {
        try {
            var body = {
                doca: (($('wms-yms-doca') || {}).value || '').trim(),
                transportadora: (($('wms-yms-transp') || {}).value || '').trim(),
                placa: (($('wms-yms-placa') || {}).value || '').trim(),
                slot_inicio: ($('wms-yms-inicio') || {}).value || null,
                slot_fim: ($('wms-yms-fim') || {}).value || null,
                prioridade: ($('wms-yms-prio') || {}).value || 'normal'
            };
            if (!body.placa && !body.doca) { msg('wms-yms-msg', 'Informe doca ou placa.', true); return; }
            await api('/yms/agendamento', { method: 'POST', body: body });
            msg('wms-yms-msg', 'Agendamento criado.');
            await listarAgendamentos();
        } catch (e) {
            msg('wms-yms-msg', e.message, true);
        }
    }

    async function checkinYms() {
        try {
            var body = {
                agendamento_id: parseInt(($('wms-yms-check-ag') || {}).value, 10) || null,
                placa: (($('wms-yms-placa') || {}).value || '').trim() || null,
                motorista: (($('wms-yms-motorista') || {}).value || '').trim() || null,
                peso_entrada: parseFloat(($('wms-yms-peso') || {}).value) || null,
                docs_ok: !!( $('wms-yms-docs-ok') && $('wms-yms-docs-ok').checked )
            };
            await api('/yms/portaria/checkin', { method: 'POST', body: body });
            msg('wms-yms-msg', 'Check-in registrado.');
        } catch (e) {
            msg('wms-yms-msg', e.message, true);
        }
    }

    async function criarVaga() {
        try {
            var codigo = (($('wms-yms-vaga') || {}).value || '').trim();
            if (!codigo) { msg('wms-yms-msg', 'Informe o código da vaga.', true); return; }
            await api('/yms/patio/vaga', { method: 'POST', body: { codigo: codigo, tipo: 'geral' } });
            msg('wms-yms-msg', 'Vaga ' + codigo + ' criada.');
            await loadPatio();
        } catch (e) {
            msg('wms-yms-msg', e.message, true);
        }
    }

    // ── 3PL ──────────────────────────────────────────────────────────────────

    async function loadWms3pl() {
        msg('wms-tpl-msg', 'Cadastre depositante, tarifas e consulte o portal.');
    }

    async function criarDepositante() {
        try {
            var body = {
                codigo: (($('wms-tpl-codigo') || {}).value || '').trim(),
                nome: (($('wms-tpl-nome') || {}).value || '').trim(),
                deposito_id: parseInt(($('wms-tpl-deposito') || {}).value, 10) || null
            };
            if (!body.codigo) { msg('wms-tpl-msg', 'Código obrigatório.', true); return; }
            await api('/tpl/depositante', { method: 'POST', body: body });
            msg('wms-tpl-msg', 'Depositante ' + body.codigo + ' criado.');
        } catch (e) {
            msg('wms-tpl-msg', e.message, true);
        }
    }

    async function salvarTarifa() {
        try {
            var body = {
                depositante_id: parseInt(($('wms-tpl-dep-id') || {}).value, 10) || null,
                tipo: ($('wms-tpl-tarifa-tipo') || {}).value || 'posicao',
                unidade: 'dia',
                valor: parseFloat(($('wms-tpl-tarifa-valor') || {}).value) || 0
            };
            await api('/tpl/tarifa', { method: 'POST', body: body });
            msg('wms-tpl-msg', 'Tarifa salva.');
        } catch (e) {
            msg('wms-tpl-msg', e.message, true);
        }
    }

    async function gerarFatura() {
        try {
            var body = {
                depositante_id: parseInt(($('wms-tpl-dep-id') || {}).value, 10) || null,
                periodo: (($('wms-tpl-periodo') || {}).value || '').trim(),
                total: parseFloat(($('wms-tpl-total') || {}).value) || 0
            };
            await api('/tpl/fatura', { method: 'POST', body: body });
            msg('wms-tpl-msg', 'Fatura rascunho gerada.');
        } catch (e) {
            msg('wms-tpl-msg', e.message, true);
        }
    }

    async function abrirPortal() {
        var cod = (($('wms-tpl-portal-cod') || {}).value || '').trim();
        var out = $('wms-tpl-portal-out');
        if (!cod) { msg('wms-tpl-msg', 'Informe o código do portal.', true); return; }
        try {
            var data = await api('/tpl/portal/' + encodeURIComponent(cod));
            msg('wms-tpl-msg', 'Portal read-only de ' + cod + '.');
            if (out) {
                out.hidden = false;
                out.textContent = JSON.stringify(data, null, 2);
            }
        } catch (e) {
            msg('wms-tpl-msg', e.message, true);
        }
    }

    // ── Verticais ────────────────────────────────────────────────────────────

    async function loadWmsVerticais() {
        try {
            var data = await api('/portuario');
            var box = $('wms-portuario-box');
            if (box) {
                box.innerHTML = '<strong>Portuário / Siscomex:</strong> ' + esc(data.mensagem || 'Fora do núcleo.') +
                    ' <span style="opacity:.8">(' + esc(data.doc || '') + ')</span>';
            }
        } catch (e) {
            var box2 = $('wms-portuario-box');
            if (box2) box2.textContent = e.message;
        }
        msg('wms-vert-msg', 'Cross-dock, bobinas e WCS — verticais sob demanda.');
    }

    async function liberarCrossDock() {
        try {
            var body = { recebimento_id: parseInt(($('wms-xd-rec') || {}).value, 10) || null };
            var data = await api('/cross-dock/liberar', { method: 'POST', body: body });
            msg('wms-vert-msg', 'Cross-dock liberado: onda ' + (data.onda_expedicao || '') + ' (sem putaway).');
        } catch (e) {
            msg('wms-vert-msg', e.message, true);
        }
    }

    async function salvarBobina() {
        try {
            var body = {
                codigo: (($('wms-bob-codigo') || {}).value || '').trim(),
                peso_kg: parseFloat(($('wms-bob-peso') || {}).value) || null,
                diametro_mm: parseFloat(($('wms-bob-diam') || {}).value) || null,
                empilhamento_max: parseInt(($('wms-bob-emp') || {}).value, 10) || null
            };
            if (!body.codigo) { msg('wms-vert-msg', 'Código da bobina obrigatório.', true); return; }
            await api('/bobinas', { method: 'POST', body: body });
            msg('wms-vert-msg', 'Bobina ' + body.codigo + ' cadastrada.');
            await listarBobinas();
        } catch (e) {
            msg('wms-vert-msg', e.message, true);
        }
    }

    async function listarBobinas() {
        var tb = $('wms-tbody-bobinas');
        if (tb) tb.innerHTML = '<tr><td colspan="5" class="loading">Carregando...</td></tr>';
        try {
            var data = await api('/bobinas');
            var rows = data.bobinas || [];
            if (!tb) return;
            if (!rows.length) {
                tb.innerHTML = '<tr><td colspan="5">Nenhuma bobina.</td></tr>';
                return;
            }
            tb.innerHTML = rows.map(function (r) {
                return '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.codigo) + '</td><td>' + esc(r.peso_kg) +
                    '</td><td>' + esc(r.diametro_mm) + '</td><td>' + esc(r.status) + '</td></tr>';
            }).join('');
        } catch (e) {
            if (tb) tb.innerHTML = '<tr><td colspan="5">Erro: ' + esc(e.message) + '</td></tr>';
        }
    }

    async function eventoWcs() {
        try {
            var body = {
                tipo: (($('wms-wcs-tipo') || {}).value || '').trim() || 'wcs.event',
                fabricante: (($('wms-wcs-fab') || {}).value || '').trim() || 'generico'
            };
            var data = await api('/wcs/evento', { method: 'POST', body: body });
            msg('wms-vert-msg', 'Evento WCS registrado: ' + data.event_id);
        } catch (e) {
            msg('wms-vert-msg', e.message, true);
        }
    }

    // ── Router / binds ───────────────────────────────────────────────────────

    var LOADERS = {
        asn: loadWmsAsn,
        'config-rfq': loadWmsConfigRfq,
        'qa-lote': loadWmsQaLote,
        'picking-avancado': loadWmsPickingAvancado,
        yms: loadWmsYms,
        '3pl': loadWms3pl,
        verticais: loadWmsVerticais
    };

    function loadWmsRfqTab(tab) {
        var fn = LOADERS[tab];
        if (fn) return fn();
        return Promise.resolve();
    }

    function bindOnce() {
        if (window._wmsRfqBound) return;
        window._wmsRfqBound = true;
        var pairs = [
            ['btn-wms-asn-salvar', salvarAsn],
            ['btn-wms-asn-atualizar', loadWmsAsn],
            ['btn-wms-rfq-salvar-params', salvarParamsRfq],
            ['btn-wms-rfq-coverage', verCoverage],
            ['btn-wms-qa-salvar', salvarQa],
            ['btn-wms-onda-criar', criarOnda],
            ['btn-wms-rota-ordenar', ordenarRota],
            ['btn-wms-yms-agendar', agendarYms],
            ['btn-wms-yms-atualizar', loadWmsYms],
            ['btn-wms-yms-checkin', checkinYms],
            ['btn-wms-yms-vaga', criarVaga],
            ['btn-wms-tpl-criar', criarDepositante],
            ['btn-wms-tpl-tarifa', salvarTarifa],
            ['btn-wms-tpl-fatura', gerarFatura],
            ['btn-wms-tpl-portal', abrirPortal],
            ['btn-wms-xd-liberar', liberarCrossDock],
            ['btn-wms-bob-salvar', salvarBobina],
            ['btn-wms-bob-listar', listarBobinas],
            ['btn-wms-wcs-evento', eventoWcs]
        ];
        pairs.forEach(function (p) {
            var el = $(p[0]);
            if (el) el.addEventListener('click', function () { p[1](); });
        });
        var depSel = $('wms-rfq-deposito');
        if (depSel) {
            depSel.addEventListener('change', function () {
                var id = parseInt(depSel.value, 10);
                if (id) _aplicarParamsNaUi(id).catch(function () {});
            });
        }
    }

    window.loadWmsRfqTab = loadWmsRfqTab;
    window.loadWmsAsn = loadWmsAsn;
    window.loadWmsConfigRfq = loadWmsConfigRfq;
    window.loadWmsQaLote = loadWmsQaLote;
    window.loadWmsPickingAvancado = loadWmsPickingAvancado;
    window.loadWmsYms = loadWmsYms;
    window.loadWms3pl = loadWms3pl;
    window.loadWmsVerticais = loadWmsVerticais;
    window.atualizarBannerRecebimentoCego = atualizarBannerRecebimentoCego;
    window.initWmsRfqUi = bindOnce;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindOnce);
    } else {
        bindOnce();
    }
})();

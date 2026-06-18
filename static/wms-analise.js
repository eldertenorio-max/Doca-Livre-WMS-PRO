/* WMS — Ocupação, Estoque de Segurança, Shelf Life, Visão Cruzada (dados do estoque WMS) */
(function() {
    var _wmsAnaliseCharts = {};

    function _esc(t) {
        if (typeof escHtml === 'function') return escHtml(t);
        return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _fmtData(v) {
        if (!v) return '—';
        if (typeof formatarDataPtBR === 'function') return formatarDataPtBR(v) || v;
        return String(v).slice(0, 10);
    }

    function _fmtHora(iso) {
        if (!iso) return '—';
        try {
            var d = new Date(iso);
            if (!isNaN(d.getTime())) {
                var p = function(n) { return (n < 10 ? '0' : '') + n; };
                return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
            }
        } catch (e) { /* ignore */ }
        return String(iso);
    }

    function _badgeStatus(st) {
        st = (st || '').toLowerCase();
        var cls = 'wms-analise-badge-verde';
        if (st === 'vermelho') cls = 'wms-analise-badge-vermelho';
        else if (st === 'amarelo') cls = 'wms-analise-badge-amarelo';
        else if (st === 'laranja') cls = 'wms-analise-badge-laranja';
        else if (st === 'excedido') cls = 'wms-analise-badge-excedido';
        else if (st === 'sem dado') cls = '';
        return '<span class="wms-analise-badge ' + cls + '">' + _esc(st || '—') + '</span>';
    }

    function _destroyChart(id) {
        if (_wmsAnaliseCharts[id]) {
            try { _wmsAnaliseCharts[id].destroy(); } catch (e) { /* ignore */ }
            delete _wmsAnaliseCharts[id];
        }
    }

    function _catParam(selId) {
        var el = document.getElementById(selId);
        return el && el.value ? ('&categoria=' + encodeURIComponent(el.value)) : '';
    }

    window.loadWmsOcupacao = async function() {
        var root = document.getElementById('wms-ocupacao-conteudo');
        if (!root) return;
        root.innerHTML = '<p class="loading">Carregando ocupação…</p>';
        try {
            var data = await _wmsFetchGet('/wms/analise/ocupacao', 60000);
            if (!data || data.erro) {
                root.innerHTML = '<p class="loading" style="color:#f87171;">' + _esc(_wmsErroMsg(data, 'Erro ao carregar ocupação.')) + '</p>';
                return;
            }
            var html = '';
            html += '<div class="wms-analise-resumo-dia">';
            html += '<div class="wms-analise-meta">TOTAL DE POSIÇÕES · <strong style="color:#f8fafc;font-size:1.1rem;">' + (data.total_posicoes || 0) + '</strong></div>';
            html += '<h2>RESUMO DO ARMAZÉM</h2>';
            html += '<div class="wms-analise-meta">Atualizado: ' + _esc(_fmtHora(data.atualizado_em)) + ' · Fonte: WMS</div>';
            html += '</div>';

            html += '<div class="wms-analise-bloco wms-analise-bloco--ocup"><h3>OCUPAÇÃO</h3><div class="wms-analise-metricas">';
            html += '<div><div class="wms-analise-metrica-lbl">Posições ocupadas (c/ avaria)</div><div class="wms-analise-metrica-val" style="color:#38bdf8;">' + (data.posicoes_ocupadas_com_avaria || 0) + '</div></div>';
            html += '<div><div class="wms-analise-metrica-lbl">% ocupada (c/ avaria)</div><div class="wms-analise-metrica-val" style="color:#38bdf8;">' + (data.percentual_ocupado || 0) + '%</div></div>';
            html += '</div><p class="wms-analise-nota">Ocupação física: ' + (data.posicoes_ocupadas || 0) + ' pos. Avaria acrescenta ' + (data.avaria_posicoes || 0) + ' pos. ao total ocupado.</p></div>';

            html += '<div class="wms-analise-bloco wms-analise-bloco--livre"><h3>LIVRES</h3><div class="wms-analise-metricas">';
            html += '<div><div class="wms-analise-metrica-lbl">Saldo livre (capacidade)</div><div class="wms-analise-metrica-val" style="color:#4ade80;">' + (data.posicoes_livres || 0) + '</div></div>';
            html += '<div><div class="wms-analise-metrica-lbl">% livre</div><div class="wms-analise-metrica-val" style="color:#4ade80;">' + (data.percentual_livre || 0) + '%</div></div>';
            html += '</div><p class="wms-analise-nota">Vagas físicas vazias nas câmaras: ' + (data.posicoes_vazias_fisicas || 0) + '.</p></div>';

            html += '<div class="wms-analise-bloco wms-analise-bloco--avaria"><h3>AVARIA (ACRÉSCIMO NA OCUPAÇÃO)</h3><div class="wms-analise-metricas">';
            html += '<div><div class="wms-analise-metrica-lbl">Quantidade</div><div class="wms-analise-metrica-val" style="color:#fbbf24;">' + (data.avaria_posicoes || 0) + ' pos.</div></div>';
            html += '<div><div class="wms-analise-metrica-lbl">% sobre o armazém</div><div class="wms-analise-metrica-val" style="color:#fbbf24;">' + (data.percentual_avaria || 0) + '%</div></div>';
            html += '</div></div>';

            html += '<h3 style="color:#94a3b8;font-size:14px;margin:16px 0 8px;">Detalhe por câmara</h3><div class="wms-analise-camaras">';
            (data.camaras || []).forEach(function(c) {
                var tot = c.total_posicoes || 0;
                var ocup = c.ocupadas || 0;
                var vaz = c.vazias || 0;
                var pctO = tot ? Math.round(100 * ocup / tot) : 0;
                var pctV = tot ? Math.round(100 * vaz / tot) : 0;
                html += '<div class="wms-analise-cam-card"><h4>' + _esc(c.descricao || ('Câmara ' + c.camara)) + '</h4>';
                html += '<div style="text-align:center;margin-bottom:8px;font-size:12px;color:#94a3b8;">' + tot + ' posições no total</div>';
                html += '<div class="wms-analise-barra">';
                if (pctV > 0) html += '<div class="wms-analise-barra-vaz" style="width:' + pctV + '%;">Vazias ' + vaz + '</div>';
                if (pctO > 0) html += '<div class="wms-analise-barra-ocup" style="width:' + pctO + '%;">Ocupadas ' + ocup + '</div>';
                html += '</div></div>';
            });
            html += '</div>';

            _destroyChart('wms-chart-ocup-cam');
            html += '<div class="wms-analise-charts" style="margin-top:18px;"><div class="wms-analise-chart-box"><h4>% ocupação por câmara</h4><canvas id="wms-chart-ocup-cam" height="200"></canvas></div></div>';
            root.innerHTML = html;

            if (typeof Chart !== 'undefined' && data.camaras && data.camaras.length) {
                var ctx = document.getElementById('wms-chart-ocup-cam');
                if (ctx) {
                    _wmsAnaliseCharts['wms-chart-ocup-cam'] = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: data.camaras.map(function(c) { return 'Cam. ' + c.camara; }),
                            datasets: [{
                                label: '% ocupado',
                                data: data.camaras.map(function(c) { return c.percentual_ocupacao || 0; }),
                                backgroundColor: ['#22c55e', '#3b82f6', '#f97316', '#a855f7']
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: { legend: { display: false } },
                            scales: { y: { beginAtZero: true, max: 100, ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } }
                        }
                    });
                }
            }
        } catch (e) {
            root.innerHTML = '<p class="loading" style="color:#f87171;">' + _esc((e && e.message) || 'Erro.') + '</p>';
        }
    };

    function _renderSegTabela(itens, filtro) {
        var rows = itens || [];
        if (filtro) rows = rows.filter(function(r) { return (r.para_condicional || '') === filtro; });
        if (!rows.length) return '<p class="wms-analise-nota">Nenhum item.</p>';
        var h = '<div class="wms-analise-table-wrap"><table><thead><tr><th>SKU</th><th>Descrição</th><th>Cat.</th><th>Status</th><th>Estoque</th><th>Ideal méd.</th><th>Pos. WMS</th><th>Pos. plan.</th></tr></thead><tbody>';
        rows.slice(0, 200).forEach(function(r) {
            h += '<tr><td><strong>' + _esc(r.sku) + '</strong></td><td>' + _esc(r.descricao) + '</td><td>' + _esc(r.categoria) + '</td>';
            h += '<td>' + _badgeStatus(r.para_condicional) + '</td><td><strong>' + _esc(r.estoque_atual) + '</strong></td>';
            h += '<td>' + _esc(r.estoque_ideal_med != null ? r.estoque_ideal_med : '—') + '</td>';
            h += '<td>' + _esc(r.posicao_atual) + '</td><td>' + _esc(r.posicoes_med != null ? r.posicoes_med : '—') + '</td></tr>';
        });
        h += '</tbody></table></div>';
        if (rows.length > 200) h += '<p class="wms-analise-nota">Exibindo 200 de ' + rows.length + ' itens.</p>';
        return h;
    }

    window.loadWmsEstoqueSeguranca = async function() {
        var root = document.getElementById('wms-seg-conteudo');
        if (!root) return;
        root.innerHTML = '<p class="loading">Carregando…</p>';
        window._wmsSegFiltroStatus = window._wmsSegFiltroStatus || null;
        try {
            var data = await _wmsFetchGet('/wms/analise/estoque-seguranca?sync=1' + _catParam('wms-seg-filtro-cat'), 90000);
            if (!data || data.erro) {
                root.innerHTML = '<p class="loading" style="color:#f87171;">' + _esc(_wmsErroMsg(data, 'Erro.')) + '</p>';
                return;
            }
            window._wmsSegItens = data.itens || [];
            var res = data.resumo_status || {};
            var html = '<p class="wms-analise-fonte">Fonte: cadastro WMS + estoque real armazenado · ' + (data.total || 0) + ' SKUs</p>';
            html += '<div class="wms-analise-cards-row">';
            ['Excedido', 'Verde', 'Amarelo', 'Vermelho'].forEach(function(st) {
                var cls = 'wms-analise-stat-' + st.toLowerCase();
                var active = window._wmsSegFiltroStatus === st ? ' active' : '';
                html += '<div class="wms-analise-stat-card ' + cls + active + '" data-wms-seg-filtro="' + st + '"><strong>' + (res[st] || 0) + '</strong><span>' + st + '</span></div>';
            });
            html += '<div class="wms-analise-stat-card' + (!window._wmsSegFiltroStatus ? ' active' : '') + '" data-wms-seg-filtro=""><strong>' + (data.total || 0) + '</strong><span>Todos</span></div>';
            html += '</div>';

            html += '<div class="wms-analise-charts"><div class="wms-analise-chart-box"><h4>Distribuição por status</h4><canvas id="wms-chart-seg-status" height="180"></canvas></div>';
            html += '<div class="wms-analise-chart-box"><h4>Top 15 — estoque atual vs ideal médio</h4><canvas id="wms-chart-seg-top" height="180"></canvas></div></div>';
            html += '<div id="wms-seg-tabela">' + _renderSegTabela(window._wmsSegItens, window._wmsSegFiltroStatus) + '</div>';
            root.innerHTML = html;

            root.querySelectorAll('[data-wms-seg-filtro]').forEach(function(el) {
                el.addEventListener('click', function() {
                    var f = el.getAttribute('data-wms-seg-filtro') || '';
                    window._wmsSegFiltroStatus = f || null;
                    var tb = document.getElementById('wms-seg-tabela');
                    if (tb) tb.innerHTML = _renderSegTabela(window._wmsSegItens, window._wmsSegFiltroStatus);
                    root.querySelectorAll('[data-wms-seg-filtro]').forEach(function(c) {
                        c.classList.toggle('active', (c.getAttribute('data-wms-seg-filtro') || '') === f);
                    });
                });
            });

            if (typeof Chart !== 'undefined') {
                _destroyChart('wms-chart-seg-status');
                var ctx1 = document.getElementById('wms-chart-seg-status');
                if (ctx1) {
                    _wmsAnaliseCharts['wms-chart-seg-status'] = new Chart(ctx1, {
                        type: 'doughnut',
                        data: {
                            labels: ['Excedido', 'Verde', 'Amarelo', 'Vermelho'],
                            datasets: [{ data: [res.Excedido || 0, res.Verde || 0, res.Amarelo || 0, res.Vermelho || 0], backgroundColor: ['#a78bfa', '#22c55e', '#eab308', '#ef4444'] }]
                        },
                        options: { plugins: { legend: { labels: { color: '#cbd5e1' } } } }
                    });
                }
                var top = (window._wmsSegItens || []).slice().sort(function(a, b) { return (b.estoque_atual || 0) - (a.estoque_atual || 0); }).slice(0, 15);
                _destroyChart('wms-chart-seg-top');
                var ctx2 = document.getElementById('wms-chart-seg-top');
                if (ctx2 && top.length) {
                    _wmsAnaliseCharts['wms-chart-seg-top'] = new Chart(ctx2, {
                        type: 'bar',
                        data: {
                            labels: top.map(function(r) { return r.sku; }),
                            datasets: [
                                { label: 'Estoque WMS', data: top.map(function(r) { return r.estoque_atual || 0; }), backgroundColor: '#38bdf8' },
                                { label: 'Ideal méd.', data: top.map(function(r) { return r.estoque_ideal_med || 0; }), backgroundColor: '#64748b' }
                            ]
                        },
                        options: {
                            responsive: true,
                            plugins: { legend: { labels: { color: '#cbd5e1' } } },
                            scales: { x: { ticks: { color: '#94a3b8', maxRotation: 60 } }, y: { ticks: { color: '#94a3b8' } } }
                        }
                    });
                }
            }
        } catch (e) {
            root.innerHTML = '<p class="loading" style="color:#f87171;">' + _esc((e && e.message) || 'Erro.') + '</p>';
        }
    };

    window.loadWmsShelfLife = async function() {
        var root = document.getElementById('wms-shelf-conteudo');
        if (!root) return;
        root.innerHTML = '<p class="loading">Carregando…</p>';
        try {
            var data = await _wmsFetchGet('/wms/analise/shelf-life?sync=1' + _catParam('wms-shelf-filtro-cat'), 60000);
            if (!data || data.erro) {
                root.innerHTML = '<p class="loading" style="color:#f87171;">' + _esc(_wmsErroMsg(data, 'Erro.')) + '</p>';
                return;
            }
            var res = data.resumo_status || {};
            var itens = data.itens || [];
            var html = '<p class="wms-analise-fonte">Shelf life calculado pela validade dos lotes armazenados no WMS · ' + (data.total || 0) + ' SKUs</p>';
            html += '<div class="wms-analise-bloco" style="border-color:#f97316;"><h3 style="color:#fb923c;">Regras de shelf life %</h3>';
            html += '<p class="wms-analise-nota" style="margin:0;">Verde ≥60% · Amarelo ≥40% · Laranja ≥20% · Vermelho &lt;20% (dias para vencer ÷ shelf dias do item).</p></div>';
            html += '<div class="wms-analise-cards-row">';
            ['Verde', 'Amarelo', 'Laranja', 'Vermelho', 'Sem dado'].forEach(function(st) {
                html += '<div class="wms-analise-stat-card"><strong>' + (res[st] || 0) + '</strong><span>' + st + '</span></div>';
            });
            html += '</div>';
            html += '<div class="wms-analise-charts"><div class="wms-analise-chart-box"><h4>Distribuição shelf life</h4><canvas id="wms-chart-shelf-pie" height="180"></canvas></div>';
            html += '<div class="wms-analise-chart-box"><h4>Menor shelf % (top 20)</h4><canvas id="wms-chart-shelf-bar" height="180"></canvas></div></div>';
            html += '<div class="wms-analise-table-wrap"><table><thead><tr><th>SKU</th><th>Descrição</th><th>Qtd.</th><th>Validade</th><th>Dias p/ vencer</th><th>Shelf dias</th><th>Shelf %</th><th>Status</th></tr></thead><tbody>';
            itens.slice(0, 150).forEach(function(r) {
                html += '<tr><td><strong>' + _esc(r.sku) + '</strong></td><td>' + _esc(r.descricao) + '</td><td>' + _esc(r.quantidade) + '</td>';
                html += '<td>' + _esc(_fmtData(r.data_validade)) + '</td><td>' + _esc(r.dias_para_vencer != null ? r.dias_para_vencer : '—') + '</td>';
                html += '<td>' + _esc(r.shelf_dias != null ? r.shelf_dias : '—') + '</td><td>' + _esc(r.shelf_pct != null ? r.shelf_pct + '%' : '—') + '</td>';
                html += '<td>' + _badgeStatus(r.status) + '</td></tr>';
            });
            html += '</tbody></table></div>';
            root.innerHTML = html;

            if (typeof Chart !== 'undefined') {
                _destroyChart('wms-chart-shelf-pie');
                var ctx1 = document.getElementById('wms-chart-shelf-pie');
                if (ctx1) {
                    _wmsAnaliseCharts['wms-chart-shelf-pie'] = new Chart(ctx1, {
                        type: 'doughnut',
                        data: {
                            labels: ['Verde', 'Amarelo', 'Laranja', 'Vermelho', 'Sem dado'],
                            datasets: [{ data: [res.Verde || 0, res.Amarelo || 0, res.Laranja || 0, res.Vermelho || 0, res['Sem dado'] || 0], backgroundColor: ['#22c55e', '#eab308', '#f97316', '#ef4444', '#64748b'] }]
                        },
                        options: { plugins: { legend: { labels: { color: '#cbd5e1' } } } }
                    });
                }
                var crit = itens.filter(function(r) { return r.shelf_pct != null; }).sort(function(a, b) { return (a.shelf_pct || 999) - (b.shelf_pct || 999); }).slice(0, 20);
                _destroyChart('wms-chart-shelf-bar');
                var ctx2 = document.getElementById('wms-chart-shelf-bar');
                if (ctx2 && crit.length) {
                    _wmsAnaliseCharts['wms-chart-shelf-bar'] = new Chart(ctx2, {
                        type: 'bar',
                        data: {
                            labels: crit.map(function(r) { return r.sku; }),
                            datasets: [{ label: 'Shelf %', data: crit.map(function(r) { return r.shelf_pct || 0; }), backgroundColor: crit.map(function(r) {
                                var s = (r.status || '').toLowerCase();
                                if (s === 'vermelho') return '#ef4444';
                                if (s === 'laranja') return '#f97316';
                                if (s === 'amarelo') return '#eab308';
                                return '#22c55e';
                            }) }]
                        },
                        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { max: 100, ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8', font: { size: 9 } } } } }
                    });
                }
            }
        } catch (e) {
            root.innerHTML = '<p class="loading" style="color:#f87171;">' + _esc((e && e.message) || 'Erro.') + '</p>';
        }
    };

    window.loadWmsVisaoCruzada = async function() {
        var root = document.getElementById('wms-cruz-conteudo');
        if (!root) return;
        root.innerHTML = '<p class="loading">Carregando…</p>';
        window._wmsCruzFiltroPrio = window._wmsCruzFiltroPrio || null;
        try {
            var data = await _wmsFetchGet('/wms/analise/visao-cruzada?sync=1' + _catParam('wms-cruz-filtro-cat'), 90000);
            if (!data || data.erro) {
                root.innerHTML = '<p class="loading" style="color:#f87171;">' + _esc(_wmsErroMsg(data, 'Erro.')) + '</p>';
                return;
            }
            window._wmsCruzLinhas = data.linhas || [];
            var cp = data.contagem_prioridade || {};
            var html = '<p class="wms-analise-fonte">Cruzamento estoque de segurança × shelf life (WMS) · <strong style="color:#f87171;">' + (data.urgentes || 0) + '</strong> urgentes</p>';
            html += '<div class="wms-analise-cards-row" style="flex-wrap:wrap;">';
            ['critico', 'desperdicio', 'produzir', 'validade', 'avaliar', 'excedente_ok', 'ok'].forEach(function(p) {
                var lbl = { critico: 'Crítico', desperdicio: 'Desperdício', produzir: 'Produzir', validade: 'Validade', avaliar: 'Avaliar', excedente_ok: 'Exced. OK', ok: 'Ok' }[p] || p;
                var act = window._wmsCruzFiltroPrio === p ? ' active' : '';
                html += '<div class="wms-analise-stat-card' + act + '" data-wms-cruz-prio="' + p + '"><strong>' + (cp[p] || 0) + '</strong><span>' + lbl + '</span></div>';
            });
            html += '</div>';

            var matriz = data.matriz || {};
            html += '<h4 style="color:#94a3b8;margin:12px 0 6px;">Matriz estoque × shelf</h4><div class="wms-analise-matriz">';
            html += '<div class="wms-analise-matriz-head"></div><div class="wms-analise-matriz-head">Shelf boa</div><div class="wms-analise-matriz-head">Atenção</div><div class="wms-analise-matriz-head">Ruim</div>';
            var rowsM = [
                { k: 'pouco', l: 'Pouco est.' },
                { k: 'ok', l: 'Estoque OK' },
                { k: 'muito', l: 'Muito est.' }
            ];
            var colsM = ['boa', 'atencao', 'ruim'];
            rowsM.forEach(function(row) {
                html += '<div class="wms-analise-matriz-head">' + row.l + '</div>';
                colsM.forEach(function(col) {
                    var key = row.k + '-' + col;
                    var n = matriz[key] || 0;
                    html += '<div class="wms-analise-matriz-cell" data-matriz="' + key + '" style="background:#1e293b;">' + n + '</div>';
                });
            });
            html += '</div>';

            html += '<div id="wms-cruz-tabela" class="wms-analise-table-wrap"><table><thead><tr><th>SKU</th><th>Descrição</th><th>Estoque</th><th>Cond.</th><th>Shelf</th><th>Shelf %</th><th>Prioridade</th><th>Ação</th></tr></thead><tbody>';
            var linhas = window._wmsCruzLinhas;
            if (window._wmsCruzFiltroPrio) linhas = linhas.filter(function(l) { return l.prioridade === window._wmsCruzFiltroPrio; });
            linhas.slice(0, 120).forEach(function(l) {
                html += '<tr><td><strong>' + _esc(l.sku) + '</strong></td><td>' + _esc(l.descricao) + '</td><td>' + _esc(l.estoque_atual) + '</td>';
                html += '<td>' + (l.condicional ? _badgeStatus(l.condicional) : '—') + '</td><td>' + (l.shelf_status ? _badgeStatus(l.shelf_status) : '—') + '</td>';
                html += '<td>' + _esc(l.shelf_pct != null ? l.shelf_pct + '%' : '—') + '</td><td><strong>' + _esc(l.prioridade_label) + '</strong></td>';
                html += '<td style="font-size:11px;max-width:220px;">' + _esc(l.acao) + '</td></tr>';
            });
            html += '</tbody></table></div>';
            root.innerHTML = html;

            root.querySelectorAll('[data-wms-cruz-prio]').forEach(function(el) {
                el.addEventListener('click', function() {
                    var p = el.getAttribute('data-wms-cruz-prio');
                    window._wmsCruzFiltroPrio = window._wmsCruzFiltroPrio === p ? null : p;
                    loadWmsVisaoCruzada();
                });
            });
        } catch (e) {
            root.innerHTML = '<p class="loading" style="color:#f87171;">' + _esc((e && e.message) || 'Erro.') + '</p>';
        }
    };

    window.initWmsAnalisePanels = function() {
        if (window._wmsAnaliseInit) return;
        window._wmsAnaliseInit = true;
        var binds = [
            ['btn-wms-ocupacao-atualizar', loadWmsOcupacao],
            ['btn-wms-seg-atualizar', loadWmsEstoqueSeguranca],
            ['btn-wms-shelf-atualizar', loadWmsShelfLife],
            ['btn-wms-cruz-atualizar', loadWmsVisaoCruzada]
        ];
        binds.forEach(function(pair) {
            var btn = document.getElementById(pair[0]);
            if (btn) btn.addEventListener('click', pair[1]);
        });
    };
})();

// Variáveis globais
const API_BASE = '/api';
window._terceirosFornecedoresRecebidosLocais = window._terceirosFornecedoresRecebidosLocais || {};

window._getIdViagemAtivo = function() {
    if (window._fluxoBipagemAtivo === 'devolucao') {
        var el = document.getElementById('dev-id-viagem-hidden');
        return el ? el.value.trim() : '';
    }
    var el2 = document.getElementById('id-viagem-hidden');
    return el2 ? el2.value.trim() : '';
};

/** Campos do formulário de bipagem ativo: Conferência (carregamento) ou Bipar devoluções. */
window._elBipagem = function(id) {
    if (window._fluxoBipagemAtivo !== 'devolucao') return document.getElementById(id);
    var map = {
        'codigo-barras': 'dev-codigo-barras',
        'produto-nome': 'dev-produto-nome',
        'quantidade': 'dev-quantidade',
        'veiculo': 'dev-veiculo',
        'status': 'dev-status',
        'doca': 'dev-doca',
        'codigo-produto': 'dev-codigo-produto',
        'id-viagem-hidden': 'dev-id-viagem-hidden',
        'aviso-produto-fora-relacao': 'dev-aviso-produto-fora-relacao',
    };
    return document.getElementById(map[id] || id);
};

function _conferenciaTemPendenciasLocais() {
    var p = window._conferenciaPending;
    if (!p) return false;
    var adds = p.adds || {};
    var removes = p.removes || {};
    var k;
    for (k in adds) {
        if (adds[k] && adds[k].qtd > 0) return true;
    }
    for (k in removes) {
        if ((removes[k] || 0) > 0) return true;
    }
    return false;
}

function _limparPendenciasConferenciaTimers() {
    var p = window._conferenciaPending;
    if (!p) return;
    Object.keys(p.addTimers || {}).forEach(function(chave) {
        clearTimeout(p.addTimers[chave]);
        delete p.addTimers[chave];
    });
    Object.keys(p.removeTimers || {}).forEach(function(chave) {
        clearTimeout(p.removeTimers[chave]);
        delete p.removeTimers[chave];
    });
    p.adds = {};
    p.removes = {};
}

/** Conferência carregamento: bipagem local até gerar comprovante (completo ou divergente). */
function _conferenciaUsaRascunhoLocal() {
    return window._fluxoBipagemAtivo !== 'devolucao' && window._conferenciaSalvarSomenteNoComprovante !== false;
}

var _CONFERENCIA_SESSAO_KEY = 'conferencia_carregamento_sessao_v1';

function _conferenciaLerSessao() {
    try {
        var raw = sessionStorage.getItem(_CONFERENCIA_SESSAO_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function _conferenciaSalvarSessao(patch) {
    if (!_conferenciaUsaRascunhoLocal()) return;
    var base = _conferenciaLerSessao() || {};
    var idV = (patch && patch.id_viagem) || base.id_viagem || (window._getIdViagemAtivo && window._getIdViagemAtivo()) || '';
    var next = Object.assign({}, base, patch || {}, { id_viagem: String(idV || '').trim(), atualizado_em: Date.now() });
    try {
        sessionStorage.setItem(_CONFERENCIA_SESSAO_KEY, JSON.stringify(next));
    } catch (e) { /* ignore */ }
    _conferenciaAtualizarAvisoRascunho();
}

function _conferenciaLimparSessao() {
    try {
        sessionStorage.removeItem(_CONFERENCIA_SESSAO_KEY);
    } catch (e) { /* ignore */ }
    _conferenciaAtualizarAvisoRascunho();
}

function _conferenciaAtualizarAvisoRascunho() {
    var el = document.getElementById('conferencia-rascunho-aviso');
    if (!el) return;
    var mostrar = _conferenciaUsaRascunhoLocal() && (_conferenciaTemPendenciasLocais() || !(_conferenciaLerSessao() || {}).comprovante_gerado);
    var idV = (window._getIdViagemAtivo && window._getIdViagemAtivo()) || '';
    el.style.display = (mostrar && idV) ? 'block' : 'none';
}

function _conferenciaAtualizarAvisoNaoBaixado(conferencia) {
    var el = document.getElementById('conferencia-nao-baixado-aviso');
    if (!el) return;
    var conf = conferencia || {};
    var mostrar = conf.ja_baixado_ravex === false && conf.aviso_ravex;
    if (mostrar) {
        el.textContent = conf.aviso_ravex;
        el.style.display = 'block';
        var chave = String(conf.aviso_ravex) + '|' + (conf.id_viagem || conf.id_roteiro || '');
        if (window._conferenciaUltimoAvisoNaoBaixado !== chave) {
            window._conferenciaUltimoAvisoNaoBaixado = chave;
            showMessage(conf.aviso_ravex, 'warning');
        }
    } else {
        el.style.display = 'none';
        window._conferenciaUltimoAvisoNaoBaixado = '';
    }
}

function _conferenciaMarcarSessaoRascunho() {
    var idV = window._getIdViagemAtivo && window._getIdViagemAtivo();
    if (!idV) return;
    _conferenciaSalvarSessao({ id_viagem: idV, comprovante_gerado: false, tem_rascunho: true });
}

function _conferenciaPeriodoBipagemKey(idV) {
    var fluxo = (window._fluxoBipagemAtivo === 'devolucao') ? 'devolucao' : 'carregamento';
    return 'conf_periodo_' + fluxo + '_' + String(idV || '').trim();
}

function _formatarPeriodoBipagemLocal(iso) {
    return formatarDataHoraPtBR(iso);
}

/** Formata data/hora para exibição em português (dd/mm/aaaa hh:mm:ss). */
function formatarDataHoraPtBR(val) {
    if (val == null || val === '') return '-';
    var s = String(val).trim();
    if (!s || s === '-') return '-';
    if (/^\d{2}\/\d{2}\/\d{4}(\s+\d{2}:\d{2}(:\d{2})?)?$/.test(s)) return s;
    try {
        var d = new Date(s);
        if (!isNaN(d.getTime())) {
            return d.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        }
    } catch (e) { /* ignore */ }
    return s;
}

function _conferenciaRegistrarMomentoBipagemLocal() {
    var idV = window._getIdViagemAtivo && window._getIdViagemAtivo();
    if (!idV) return;
    var agora = new Date().toISOString();
    try {
        var key = _conferenciaPeriodoBipagemKey(idV);
        var raw = sessionStorage.getItem(key);
        var obj = raw ? JSON.parse(raw) : null;
        if (!obj || !obj.inicio) {
            obj = { inicio: agora, fim: agora };
        } else {
            obj.fim = agora;
        }
        sessionStorage.setItem(key, JSON.stringify(obj));
    } catch (e) { /* ignore */ }
    loadPeriodoCarregamento(idV);
}

function _conferenciaObterPeriodoBipagemLocal(idV) {
    idV = idV || ((window._getIdViagemAtivo && window._getIdViagemAtivo()) || '');
    if (!idV) return null;
    try {
        var raw = sessionStorage.getItem(_conferenciaPeriodoBipagemKey(idV));
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function _conferenciaLimparPeriodoBipagemLocal(idV) {
    if (!idV) return;
    try {
        sessionStorage.removeItem(_conferenciaPeriodoBipagemKey(idV));
        sessionStorage.removeItem('conf_periodo_carregamento_' + String(idV).trim());
        sessionStorage.removeItem('conf_periodo_devolucao_' + String(idV).trim());
    } catch (e) { /* ignore */ }
}

function _conferenciaEnfileirarAddLocal(codigoBarras, qtd) {
    if (!codigoBarras) return;
    if (!window._conferenciaPending) window._conferenciaPending = { removes: {}, removeTimers: {}, adds: {}, addTimers: {}, DEBOUNCE_MS: 700 };
    var n = parseInt(qtd, 10) || 1;
    if (!window._conferenciaPending.adds[codigoBarras]) window._conferenciaPending.adds[codigoBarras] = { qtd: 0 };
    window._conferenciaPending.adds[codigoBarras].qtd += n;
    window._ultimoBipadoCodigo = String(codigoBarras).trim();
    _conferenciaRegistrarMomentoBipagemLocal();
    _conferenciaMarcarSessaoRascunho();
}

function _conferenciaEnfileirarRemoveLocal(codigoBarras, qtd) {
    if (!codigoBarras) return;
    var n = parseInt(qtd, 10) || 1;
    if (!window._conferenciaPending.removes[codigoBarras]) window._conferenciaPending.removes[codigoBarras] = 0;
    window._conferenciaPending.removes[codigoBarras] += n;
    var add = window._conferenciaPending.adds[codigoBarras];
    if (add) {
        add.qtd = Math.max(0, (add.qtd || 0) - n);
        if (add.qtd <= 0) delete window._conferenciaPending.adds[codigoBarras];
    }
    _conferenciaMarcarSessaoRascunho();
}

window._conferenciaUltimoBip = { codigo: '', em: 0 };

/** Índices das colunas da tabela ITENS DA VIAGEM (conferência carregamento e devolução). */
window._CONF_COL = {
    STATUS: 0,
    MOTIVO: 1,
    COD_BARRAS: 2,
    COD_PRODUTO: 3,
    PRODUTO: 4,
    QTD_PROD: 5,
    BIPADO: 6,
    UN: 7,
    PESO: 8,
    AVISO: 9,
    FALTA: 10,
    ACAO: 11
};

/** Índices das colunas do extrato (carregamento e devolução). */
window._EXTRATO_COL = {
    STATUS: 0,
    MOTIVO: 1,
    COD_BARRAS: 2,
    COD_PRODUTO: 3,
    PRODUTO: 4,
    QTD_PROD: 5,
    BIPADO: 6,
    UN: 7,
    PESO: 8,
    AVISO: 9,
    FALTA: 10
};

function _conferenciaObterEstadoLinhaBipagem(codigoBarrasStr, codigoProdutoStr) {
    var tbody = document.getElementById(window._fluxoBipagemAtivo === 'devolucao' ? 'dev-tbody-conferencia' : 'tbody-conferencia');
    if (!tbody) return null;
    codigoBarrasStr = (codigoBarrasStr || '').toString().trim();
    codigoProdutoStr = (codigoProdutoStr || '').toString().trim();
    var rows = tbody.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row.cells || row.cells.length < 12) continue;
        var dataCodigo = (row.getAttribute && row.getAttribute('data-codigo')) || '';
        var C = window._CONF_COL;
        var cbLinha = (row.cells[C.COD_BARRAS].textContent || '').trim();
        var cpLinha = (row.cells[C.COD_PRODUTO].textContent || '').trim();
        var cbValido = cbLinha && cbLinha !== '-';
        var match = (codigoProdutoStr && (cpLinha === codigoProdutoStr || dataCodigo === codigoProdutoStr))
            || (codigoBarrasStr && cbValido && cbLinha === codigoBarrasStr);
        if (!match) continue;
        var prod = parseInt(row.cells[C.QTD_PROD].textContent, 10) || 0;
        var bip = parseInt(row.cells[C.BIPADO].textContent, 10) || 0;
        return {
            row: row,
            prod: prod,
            bip: bip,
            codigo_barras: cbLinha,
            produto: (row.cells[C.PRODUTO].textContent || '').trim()
        };
    }
    return null;
}

/** Atualiza a coluna de código de barras na linha do romaneio após vincular na base. */
function _atualizarCodigoBarrasLinhaConferencia(codigoProduto, codigoBarras) {
    codigoProduto = (codigoProduto || '').toString().trim();
    codigoBarras = normalizarCodigoBarrasDuplicado((codigoBarras || '').toString().trim());
    if (!codigoProduto || !codigoBarras) return false;
    var est = _conferenciaObterEstadoLinhaBipagem('', codigoProduto);
    if (!est || !est.row) return false;
    var row = est.row;
    var C = window._CONF_COL;
    var cellCb = row.cells[C.COD_BARRAS];
    if (cellCb) {
        cellCb.innerHTML = '<strong>' + escapeHtml(codigoBarras) + '</strong>';
    }
    var cellAviso = row.cells[C.AVISO];
    if (cellAviso) {
        var avisoTxt = (cellAviso.textContent || '').trim();
        if (avisoTxt.indexOf('Sem código') >= 0 || avisoTxt.indexOf('⚠️ Sem código') >= 0) {
            _aplicarEstiloCelulaAviso(cellAviso, '');
        }
    }
    var qtdProd = parseInt(row.cells[C.QTD_PROD].textContent, 10) || 0;
    var qtdBip = parseInt(row.cells[C.BIPADO].textContent, 10) || 0;
    var qtdFalta = Math.max(0, qtdProd - qtdBip);
    var st = _statusBipagemConferencia(qtdProd, qtdBip);
    _conferenciaAtualizarCelulaAcaoLinha(row, st, qtdBip, qtdFalta);
    return true;
}

function _conferenciaAtualizarCelulaAcaoLinha(row, stLinha, novaQtdBipada, novaQtdFalta) {
    if (!row || !row.cells || row.cells.length < 12) return;
    var C = window._CONF_COL;
    var cellAcao = row.cells[C.ACAO];
    if (!cellAcao) return;
    var codigoBarrasLinha = (row.cells[C.COD_BARRAS].textContent || '').trim();
    var produtoNome = (row.cells[C.PRODUTO].textContent || '').trim();
    var btns = _htmlBotoesAcaoConferencia({
        codigo_barras: codigoBarrasLinha,
        produto: produtoNome,
        quantidade_bipada: novaQtdBipada,
        quantidade_falta: novaQtdFalta
    });
    var hint = '';
    if (stLinha === 'EXCEDENTE') {
        hint = '<span class="conf-hint-excedente" style="color: #e65100; font-weight: bold;">Bipado a mais</span>';
    } else if (stLinha === 'COMPLETO') {
        hint = '<span class="conf-hint-completo" style="color: #4caf50; font-weight: bold;">✓ Completo</span>';
    }
    cellAcao.innerHTML = '<div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">'
        + btns.bipar + (btns.tirar || '') + (btns.excluir || '') + hint + '</div>';
}

/** Um único ponto para bipar: atualiza tabela/status na hora e enfileira (sem duplicar Enter + leitor). */
function _conferenciaProcessarBipagemCodigo(codigoBarras, quantidade, codigoProdutoOpcional, opts) {
    opts = opts || {};
    var cod = (codigoBarras || '').toString().trim();
    if (!cod) return false;
    var qtd = parseInt(quantidade, 10) || 1;
    if (qtd > 0 && _conferenciaUsaRascunhoLocal()) {
        var docaEl = window._elBipagem('doca');
        var doca = docaEl && docaEl.value ? String(docaEl.value).trim() : '';
        if (['1', '2', '3', '4'].indexOf(doca) < 0) {
            if (!opts.silencioso) {
                _conferenciaMostrarErroComprovante('Selecione a doca (1, 2, 3 ou 4) no bloco «3. DADOS DO CARREGAMENTO» antes de bipar.', true);
            }
            return false;
        }
    }
    var estLinha = _conferenciaObterEstadoLinhaBipagem(cod, codigoProdutoOpcional || '');
    if (!opts.permitirExcedente && qtd > 0 && estLinha && estLinha.prod > 0 && estLinha.bip >= estLinha.prod) {
        if (!opts.silencioso) {
            showMessage('Item já completo (' + estLinha.bip + '/' + estLinha.prod + '). Use o botão «Bipar» na linha apenas se houver sobra.', 'warning');
        }
        return false;
    }
    if (!opts.permitirRepetir) {
        var agora = Date.now();
        var janelaMs = (estLinha && estLinha.prod > 0 && estLinha.bip >= estLinha.prod) ? 800 : 450;
        if (window._conferenciaUltimoBip && window._conferenciaUltimoBip.codigo === cod && (agora - window._conferenciaUltimoBip.em) < janelaMs) {
            return false;
        }
        window._conferenciaUltimoBip = { codigo: cod, em: agora };
    }
    var atualizou = atualizarQuantidadeBipadaNaTabela(cod, qtd, codigoProdutoOpcional || '', opts);
    if (atualizou) {
        atualizarEstatisticasOtimista(qtd > 0 ? qtd : 0, qtd < 0);
        atualizarBoxesComprovante();
    }
    if (opts.somenteTabela) return atualizou;
    if (_conferenciaUsaRascunhoLocal()) {
        if (qtd > 0) _conferenciaEnfileirarAddLocal(cod, qtd);
        else if (qtd < 0) _conferenciaEnfileirarRemoveLocal(cod, Math.abs(qtd));
    } else if (qtd > 0) {
        if (!window._conferenciaPending.adds[cod]) window._conferenciaPending.adds[cod] = { qtd: 0 };
        window._conferenciaPending.adds[cod].qtd += qtd;
        if (window._conferenciaPending.addTimers[cod]) clearTimeout(window._conferenciaPending.addTimers[cod]);
        window._conferenciaPending.addTimers[cod] = setTimeout(function() { _flushAdd(cod); }, window._conferenciaPending.DEBOUNCE_MS);
    }
    return atualizou;
}

function _conferenciaValidarPreBipagem(modoDev) {
    var idViagem = window._getIdViagemAtivo && window._getIdViagemAtivo();
    if (!idViagem) {
        showMessage('Por favor, selecione uma viagem primeiro', 'error');
        return false;
    }
    if (!modoDev) {
        var docaEl = window._elBipagem && window._elBipagem('doca');
        var doca = docaEl && docaEl.value ? String(docaEl.value).trim() : '';
        if (!doca || ['1', '2', '3', '4'].indexOf(doca) < 0) {
            showMessage('Selecione a doca antes de bipar', 'error');
            return false;
        }
    }
    if (modoDev && (!window._devolucaoNfAtiva || !window._devolucaoNfAtiva.id)) {
        showMessage('Inicie uma NF (número + motivo) antes de bipar o retorno.', 'error');
        return false;
    }
    return true;
}

function _conferenciaObterQtdBipagemForm(opts) {
    opts = opts || {};
    var qtdEl = document.getElementById(opts.qtdInputId || (opts.modoDevolucao ? 'dev-quantidade' : 'quantidade'));
    if (!qtdEl && window._elBipagem) qtdEl = window._elBipagem('quantidade');
    var qRaw = parseInt(qtdEl && qtdEl.value, 10);
    return (!isNaN(qRaw) && qRaw >= 1 && qRaw <= 99999) ? qRaw : 1;
}

function _conferenciaResetarQtdBipada() {
    var dev = window._fluxoBipagemAtivo === 'devolucao';
    var qtdInp = document.getElementById(dev ? 'dev-quantidade' : 'quantidade');
    if (qtdInp) qtdInp.value = '1';
}

function _conferenciaProntoParaProximoBip() {
    window.ultimoCodigoBuscado = '';
    var dev = window._fluxoBipagemAtivo === 'devolucao';
    var inp = document.getElementById(dev ? 'dev-codigo-barras' : 'codigo-barras');
    if (inp) inp.value = '';
    _conferenciaResetarQtdBipada();
    if (typeof focarCampoCodigoBarras === 'function') focarCampoCodigoBarras();
}

function _conferenciaBiparCodigoDireto(codigoBarras, opts) {
    opts = opts || {};
    var cod = normalizarCodigoBarrasDuplicado(String(codigoBarras || '').trim());
    if (!cod) return false;
    var modoDev = !!opts.modoDevolucao;
    if (!_conferenciaValidarPreBipagem(modoDev)) return false;
    var qtd = _conferenciaObterQtdBipagemForm(opts);
    var procOpts = {
        permitirRepetir: !!opts.permitirRepetir,
        permitirExcedente: !!opts.permitirExcedente
    };
    var codProdEl = window._elBipagem && window._elBipagem('codigo-produto');
    var codProd = codProdEl && codProdEl.value ? String(codProdEl.value).trim() : '';
    _conferenciaProcessarBipagemCodigo(cod, qtd, codProd, procOpts);
    if (typeof buscarProdutoNaPlanilha === 'function') {
        buscarProdutoNaPlanilha(cod, qtd, true, true);
    }
    if (opts.limparCampo !== false) _conferenciaProntoParaProximoBip();
    return true;
}

function _conferenciaRegistrarScanSemLimpar(codigo, opts) {
    var cod = normalizarCodigoBarrasDuplicado(String(codigo || '').trim());
    if (!cod || cod === window.ultimoCodigoBuscado) return;
    window.ultimoCodigoBuscado = cod;
    var qtd = _conferenciaObterQtdBipagemForm(opts);
    _conferenciaProcessarBipagemCodigo(cod, qtd, '');
    if (typeof buscarProdutoNaPlanilha === 'function') {
        buscarProdutoNaPlanilha(cod, qtd, true, true);
    }
    _conferenciaResetarQtdBipada();
}

function _conferenciaBindInputCodigoBarras(inputEl, opts) {
    if (!inputEl) return;
    opts = opts || {};
    var timeoutBusca;
    inputEl.addEventListener('input', function(e) {
        var codigo = normalizarCodigoBarrasDuplicado((e.target.value || '').trim());
        clearTimeout(timeoutBusca);
        if (codigo.length >= 3 && codigo !== window.ultimoCodigoBuscado) {
            timeoutBusca = setTimeout(function() {
                if (!_conferenciaValidarPreBipagem(!!opts.modoDevolucao)) return;
                _conferenciaRegistrarScanSemLimpar(codigo, opts);
            }, 60);
        }
    });
    inputEl.addEventListener('blur', function(e) {
        if (window._ignorarBlurBipagemConferencia) return;
        var dest = e.relatedTarget;
        if (dest && (dest.tagName === 'BUTTON' || dest.type === 'submit' || dest.closest('[data-conf-acao]'))) return;
        setTimeout(function() {
            if (window._ignorarBlurBipagemConferencia) return;
            var active = document.activeElement;
            if (active && (active.tagName === 'BUTTON' || active.type === 'submit' || active.closest('[data-conf-acao]'))) return;
            var codigo = normalizarCodigoBarrasDuplicado((e.target.value || '').trim());
            if (codigo.length >= 3 && codigo !== window.ultimoCodigoBuscado) {
                if (!_conferenciaValidarPreBipagem(!!opts.modoDevolucao)) return;
                _conferenciaRegistrarScanSemLimpar(codigo, opts);
            }
        }, 0);
    });
    inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(timeoutBusca);
            var codigo = normalizarCodigoBarrasDuplicado((e.target.value || '').trim());
            if (codigo.length > 0) {
                window.ultimoCodigoBuscado = codigo;
                _conferenciaBiparCodigoDireto(codigo, opts);
            }
        }
    });
    inputEl.addEventListener('paste', function() {
        setTimeout(function() {
            var codigo = normalizarCodigoBarrasDuplicado((inputEl.value || '').trim());
            if (codigo.length >= 3) {
                window.ultimoCodigoBuscado = codigo;
                _conferenciaBiparCodigoDireto(codigo, opts);
            }
        }, 50);
    });
}

async function _conferenciaDescartarRascunhoLocal(idViagem) {
    _limparPendenciasConferenciaTimers();
    if (idViagem) {
        try {
            sessionStorage.removeItem(_conferenciaPeriodoBipagemKey(idViagem));
        } catch (e) { /* ignore */ }
    }
    _conferenciaAtualizarAvisoRascunho();
    loadEstatisticas();
}

var _conferenciaRetornoResolver = null;

function _conferenciaFecharModalRetorno() {
    var m = document.getElementById('modal-conferencia-retorno');
    if (m) m.style.display = 'none';
}

function _conferenciaFecharModalConfirmaAcao() {
    var m = document.getElementById('modal-conferencia-confirma-acao');
    if (m) m.style.display = 'none';
}

function _conferenciaConfirmarAcaoModal(titulo, texto, rotuloOk) {
    return new Promise(function(resolve) {
        var modal = document.getElementById('modal-conferencia-confirma-acao');
        var tit = document.getElementById('modal-conferencia-confirma-titulo');
        var txt = document.getElementById('modal-conferencia-confirma-texto');
        var btnOk = document.getElementById('btn-conferencia-confirma-ok');
        var btnCancel = document.getElementById('btn-conferencia-confirma-cancelar');
        if (!modal || !btnOk || !btnCancel) {
            resolve(window.confirm(texto));
            return;
        }
        if (tit) tit.textContent = titulo || 'Confirmar';
        if (txt) txt.textContent = texto || '';
        btnOk.textContent = rotuloOk || 'Confirmar';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '10150';
        function fechar(ok) {
            modal.style.display = 'none';
            modal.style.zIndex = '';
            btnOk.onclick = null;
            btnCancel.onclick = null;
            resolve(!!ok);
        }
        btnOk.onclick = function() { fechar(true); };
        btnCancel.onclick = function() { fechar(false); };
    });
}

function _conferenciaAbrirModalRetorno(idViagem) {
    return new Promise(function(resolve) {
        var modal = document.getElementById('modal-conferencia-retorno');
        if (!modal) {
            resolve(true);
            return;
        }
        var elId = document.getElementById('modal-conferencia-retorno-id');
        var elMsg = document.getElementById('modal-conferencia-retorno-msg');
        if (elId) elId.textContent = idViagem || '-';
        var sess = _conferenciaLerSessao();
        var pend = _conferenciaTemPendenciasLocais();
        if (elMsg) {
            if (pend) {
                elMsg.textContent = 'Há bipagem desta viagem ainda não salva (grave ao gerar o comprovante). O que deseja fazer?';
            } else if (sess && sess.comprovante_gerado) {
                elMsg.textContent = 'O comprovante desta viagem já foi gerado. Deseja continuar bipando, trocar de viagem ou zerar e recomeçar?';
            } else {
                elMsg.textContent = 'O que deseja fazer com esta viagem?';
            }
        }
        _conferenciaRetornoResolver = resolve;
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
    });
}

function _conferenciaResolverModalRetorno(acao) {
    var fn = _conferenciaRetornoResolver;
    _conferenciaRetornoResolver = null;
    _conferenciaFecharModalRetorno();
    if (fn) fn(acao);
}

window._conferenciaAcaoRetornoContinuar = function() {
    _conferenciaResolverModalRetorno('continuar');
};

window._conferenciaAcaoRetornoOutra = async function() {
    _conferenciaFecharModalRetorno();
    var ok = await _conferenciaConfirmarAcaoModal(
        'Bipar outra viagem',
        'Deseja trocar de viagem? A bipagem não salva desta viagem será descartada da tela (não vai para o comprovante).',
        'Sim, trocar viagem'
    );
    if (!ok) {
        _conferenciaResolverModalRetorno('continuar');
        return;
    }
    var idV = window._getIdViagemAtivo && window._getIdViagemAtivo();
    await _conferenciaDescartarRascunhoLocal(idV);
    _conferenciaLimparSessao();
    _conferenciaResolverModalRetorno('outra');
    var inp = document.getElementById('id-viagem');
    var hid = document.getElementById('id-viagem-hidden');
    if (hid) hid.value = '';
    window._conferenciaIdViagemAtiva = '';
    if (inp) {
        inp.value = '';
        inp.focus();
    }
    var tbody = document.getElementById('tbody-conferencia');
    if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="loading">Digite o ID do roteiro e busque para iniciar a conferência.</td></tr>';
    document.getElementById('conferencia-completa-box').style.display = 'none';
    document.getElementById('conferencia-divergente-box').style.display = 'none';
};

window._conferenciaAcaoRetornoZerar = async function() {
    var idV = window._getIdViagemAtivo && window._getIdViagemAtivo();
    if (!idV) {
        showMessage('Nenhuma viagem selecionada.', 'error');
        _conferenciaResolverModalRetorno('continuar');
        return;
    }
    _conferenciaFecharModalRetorno();
    var ok = await _conferenciaConfirmarAcaoModal(
        'Zerar bipagem',
        'Confirma zerar TODOS os itens bipados da viagem ' + idV + ' e começar do zero? Esta ação não pode ser desfeita.',
        'Sim, zerar tudo'
    );
    if (!ok) {
        _conferenciaResolverModalRetorno('continuar');
        return;
    }
    await _executarZerarBipagemViagem(idV);
    _conferenciaResolverModalRetorno('zerar');
};

function initConferenciaSessaoModais() {
    var mRet = document.getElementById('modal-conferencia-retorno');
    if (mRet && !mRet._bound) {
        mRet._bound = true;
        mRet.addEventListener('click', function(e) {
            if (e.target === mRet) _conferenciaResolverModalRetorno('continuar');
        });
    }
    var btnCont = document.getElementById('btn-conferencia-retorno-continuar');
    var btnOutra = document.getElementById('btn-conferencia-retorno-outra');
    var btnZerar = document.getElementById('btn-conferencia-retorno-zerar');
    var btnFechar = document.getElementById('btn-conferencia-retorno-fechar');
    if (btnCont && !btnCont._bound) {
        btnCont._bound = true;
        btnCont.addEventListener('click', function() { window._conferenciaAcaoRetornoContinuar(); });
    }
    if (btnOutra && !btnOutra._bound) {
        btnOutra._bound = true;
        btnOutra.addEventListener('click', function() { void window._conferenciaAcaoRetornoOutra(); });
    }
    if (btnZerar && !btnZerar._bound) {
        btnZerar._bound = true;
        btnZerar.addEventListener('click', function() { void window._conferenciaAcaoRetornoZerar(); });
    }
    if (btnFechar && !btnFechar._bound) {
        btnFechar._bound = true;
        btnFechar.addEventListener('click', function() { _conferenciaResolverModalRetorno('continuar'); });
    }
    var mComp = document.getElementById('modal-comprovante-completo');
    if (mComp && !mComp._bound) {
        mComp._bound = true;
        mComp.addEventListener('click', function(e) {
            if (e.target === mComp) fecharModalComprovanteCompleto();
        });
    }
}

function _conferenciaTalvezModalRetorno(idViagem) {
    if (!_conferenciaUsaRascunhoLocal() || !idViagem) return Promise.resolve(true);
    var sess = _conferenciaLerSessao();
    if (!sess || String(sess.id_viagem) !== String(idViagem)) return Promise.resolve(true);
    if (!sess.visitou_conferencia && !_conferenciaTemPendenciasLocais()) return Promise.resolve(true);
    return _conferenciaAbrirModalRetorno(idViagem).then(function(acao) {
        if (acao === 'outra') return false;
        return true;
    });
}

function _conferenciaCancelarGravacaoComprovante() {
    window._conferenciaGravarCancelado = true;
    if (window._conferenciaGravarAbort && typeof window._conferenciaGravarAbort.abort === 'function') {
        try { window._conferenciaGravarAbort.abort(); } catch (e) { /* ignore */ }
    }
    window._conferenciaSalvandoNoComprovante = false;
    _ravexLoadingSetCancelVisible(false);
    if (window.ravexLoadingHide) window.ravexLoadingHide();
    showMessage('Gravação cancelada. A bipagem permanece neste aparelho; você pode tentar gerar o comprovante de novo.', 'warning');
}

function _conferenciaValidarPreComprovante() {
    var idV = window._getIdViagemAtivo && window._getIdViagemAtivo();
    if (!idV) {
        return { ok: false, erro: 'Nenhuma viagem carregada. Busque o ID do roteiro na conferência.' };
    }
    var docaEl = window._elBipagem('doca');
    var doca = docaEl && docaEl.value ? String(docaEl.value).trim() : '';
    if (['1', '2', '3', '4'].indexOf(doca) < 0) {
        return {
            ok: false,
            erro: 'Selecione a doca (1, 2, 3 ou 4) no bloco «3. DADOS DO CARREGAMENTO» antes de gerar o comprovante.',
            focarDoca: true
        };
    }
    if (_conferenciaUsaRascunhoLocal()) {
        var itens = _conferenciaColetarItensTabelaParaGravar();
        if (!itens.length && !_conferenciaTabelaTemBipagemNoDOM()) {
            return { ok: false, erro: 'Nenhum item bipado na tabela. Bipe os produtos antes de gerar o comprovante.' };
        }
    }
    return { ok: true };
}

function _conferenciaMostrarErroComprovante(msg, focarDoca) {
    if (window.ravexErrorShow) {
        window.ravexErrorShow(msg);
    } else {
        showMessage(msg, 'error');
    }
    if (focarDoca) {
        var docaEl = document.getElementById('doca');
        if (docaEl) {
            try { docaEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
            docaEl.focus();
            docaEl.style.outline = '3px solid #c62828';
            docaEl.style.outlineOffset = '2px';
            setTimeout(function() {
                docaEl.style.outline = '';
                docaEl.style.outlineOffset = '';
            }, 4500);
        }
    }
}

function _conferenciaAtivarAbaExtrato(idViagem, opts) {
    opts = opts || {};
    if (typeof sairConferenciaListaMaximizadaSeAtiva === 'function') sairConferenciaListaMaximizadaSeAtiva();
    var inputExtrato = document.getElementById('extrato-id-viagem');
    var inputRelatorio = document.getElementById('relatorio-extrato-id-viagem');
    if (inputExtrato) inputExtrato.value = idViagem;
    if (inputRelatorio) inputRelatorio.value = idViagem;
    var modulo = document.getElementById('modulo-carregamento');
    var tabButtons = modulo ? modulo.querySelectorAll('.tab-button') : document.querySelectorAll('.tab-button');
    var tabContents = modulo ? modulo.querySelectorAll('.tab-content') : document.querySelectorAll('.tab-content');
    tabButtons.forEach(function(btn) { btn.classList.remove('active'); });
    tabContents.forEach(function(c) { c.classList.remove('active'); });
    var btnExtrato = modulo
        ? modulo.querySelector('.tab-button[data-tab="extrato"]')
        : document.querySelector('.tab-button[data-tab="extrato"]');
    var contentExtrato = document.getElementById('extrato');
    if (btnExtrato) btnExtrato.classList.add('active');
    if (contentExtrato) contentExtrato.classList.add('active');
    var tbody = document.getElementById('tbody-extrato');
    if (tbody && !opts.semLoading) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Carregando extrato...</td></tr>';
    }
    var resumoEl = document.getElementById('extrato-resumo');
    if (resumoEl && !opts.semLoading) resumoEl.style.display = 'none';
    if (contentExtrato) {
        try { contentExtrato.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
    }
}

async function _conferenciaSalvarBipagemEGerarExtrato() {
    var idViagem = window._getIdViagemAtivo && window._getIdViagemAtivo();
    if (!idViagem) {
        _conferenciaMostrarErroComprovante('Nenhuma viagem selecionada.');
        return false;
    }
    var pre = _conferenciaValidarPreComprovante();
    if (!pre.ok) {
        _conferenciaMostrarErroComprovante(pre.erro, pre.focarDoca);
        return false;
    }
    var btnC = document.getElementById('btn-confirmar-comprovante-completo');
    var btnD = document.getElementById('btn-confirmar-comprovante-divergente');
    if (btnC) btnC.disabled = true;
    if (btnD) btnD.disabled = true;
    var salvou = false;
    var periodoAntesGravar = _conferenciaObterPeriodoBipagemLocal(idViagem);
    try {
        window._conferenciaSalvandoNoComprovante = true;
        window._conferenciaGravarCancelado = false;
        window._conferenciaGravarAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        if (window.ravexLoadingShow) window.ravexLoadingShow('Gravando bipagem no servidor… Aguarde.');
        _ravexLoadingSetCancelVisible(true, _conferenciaCancelarGravacaoComprovante);
        var flushOk = await _flushTodasPendenciasConferencia();
        _ravexLoadingSetCancelVisible(false);
        if (window.ravexLoadingHide) window.ravexLoadingHide();
        if (window._conferenciaGravarCancelado || (flushOk && flushOk.cancelado)) {
            return false;
        }
        if (!flushOk || flushOk.ok === false || flushOk.falhas > 0) {
            if (flushOk && flushOk.erro === 'doca') {
                _conferenciaMostrarErroComprovante('Selecione a doca (1, 2, 3 ou 4) no bloco «3. DADOS DO CARREGAMENTO» antes de gerar o comprovante.', true);
            } else if (flushOk && flushOk.erro) {
                _conferenciaMostrarErroComprovante(flushOk.erro);
            } else {
                _conferenciaMostrarErroComprovante('Não foi possível gravar toda a bipagem. Verifique a doca e tente de novo.');
            }
            return false;
        }
        _conferenciaSalvarSessao({ id_viagem: idViagem, comprovante_gerado: true, tem_rascunho: false });
        _limparPendenciasConferenciaTimers();
        salvou = true;
        _conferenciaAtivarAbaExtrato(idViagem, { semLoading: true });
        _conferenciaPreencherExtratoInstantaneo(idViagem, { periodoLocal: periodoAntesGravar });
        showMessage('Bipagem salva. Extrato atualizado.', 'success');
        _conferenciaAtualizarAvisoRascunho();
        void loadExtrato(idViagem, { forcar: true, silencioso: true });
        loadEstatisticas();
        return true;
    } catch (e) {
        if (window.ravexLoadingHide) window.ravexLoadingHide();
        console.error('_conferenciaSalvarBipagemEGerarExtrato', e);
        if (!salvou) {
            showMessage('Erro ao salvar bipagem. Tente novamente.', 'error');
        } else {
            showMessage('Bipagem salva, mas houve erro ao abrir o extrato. Clique na aba Extrato e em Buscar.', 'warning');
        }
        return false;
    } finally {
        window._conferenciaSalvandoNoComprovante = false;
        window._conferenciaGravarAbort = null;
        _ravexLoadingSetCancelVisible(false);
        if (window.ravexLoadingHide) window.ravexLoadingHide();
        if (btnC) btnC.disabled = false;
        if (btnD) btnD.disabled = false;
    }
}

function _esperarBipagemConferenciaIdle(timeoutMs) {
    timeoutMs = timeoutMs == null ? 90000 : timeoutMs;
    var inicio = Date.now();
    return new Promise(function(resolve) {
        function passo() {
            if (Date.now() - inicio > timeoutMs) {
                resolve();
                return;
            }
            if (_conferenciaTemPendenciasLocais()) {
                setTimeout(passo, 120);
                return;
            }
            var chain = window.bipagemEmAndamento || Promise.resolve();
            chain.then(function() {
                if (_conferenciaTemPendenciasLocais()) setTimeout(passo, 120);
                else resolve();
            }).catch(function() { resolve(); });
        }
        passo();
    });
}

function _conferenciaTabelaTemBipagemNoDOM() {
    var tbody = document.getElementById('tbody-conferencia');
    if (!tbody) return false;
    var rows = tbody.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row.cells || row.cells.length < 12 || row.querySelector('td[colspan]')) continue;
        if ((parseInt(row.cells[window._CONF_COL.BIPADO].textContent, 10) || 0) > 0) return true;
    }
    return false;
}

/** Grava um add pendente direto no servidor (não volta para o rascunho local). */
async function _conferenciaPersistirAddNoServidor(codigoBarras, quantidade) {
    codigoBarras = normalizarCodigoBarrasDuplicado((codigoBarras || '').toString().trim());
    var qtd = parseInt(quantidade, 10) || 0;
    if (!codigoBarras || qtd <= 0) return { ok: false };
    var idViagem = window._getIdViagemAtivo && window._getIdViagemAtivo();
    if (!idViagem) return { ok: false };
    var docaEl = window._elBipagem('doca');
    var doca = docaEl && docaEl.value ? docaEl.value.trim() : '';
    var veiculoInput = window._elBipagem('veiculo');
    var statusSelect = window._elBipagem('status');
    var override = {
        codigo_barras: codigoBarras,
        produto: '',
        quantidade: qtd,
        veiculo: (veiculoInput && veiculoInput.value) ? veiculoInput.value.trim() : '',
        status: (statusSelect && statusSelect.value) ? statusSelect.value : 'PENDENTE',
        id_viagem: idViagem,
        doca: doca,
        codigo_interno: '',
        codigo_dun: '',
        peso: '',
        unidade: ''
    };
    try {
        var response = await fetch(API_BASE + '/buscar-produto/' + encodeURIComponent(codigoBarras), {
            credentials: 'same-origin',
            cache: 'no-store'
        });
        var resultado = await response.json();
        if (resultado.encontrado && resultado.produto) {
            var produto = resultado.produto;
            override.codigo_barras = (produto.codigo_barras || codigoBarras).toString().trim();
            override.produto = (produto.produto || '').trim();
            override.codigo_interno = (produto.codigo_produto || '').toString().trim();
            override.codigo_dun = (produto.codigo_dun != null) ? String(produto.codigo_dun).trim() : '';
            override.peso = (produto.peso != null) ? String(produto.peso).trim() : '';
            override.unidade = (produto.unidade != null) ? String(produto.unidade).trim() : '';
        } else {
            var tbody = document.getElementById('tbody-conferencia');
            if (tbody) {
                tbody.querySelectorAll('tr').forEach(function(row) {
                    if (!row.cells || row.cells.length < 12) return;
                    var C = window._CONF_COL;
                    var cb = (row.cells[C.COD_BARRAS].textContent || '').trim();
                    if (cb !== codigoBarras) return;
                    if (!override.produto) override.produto = (row.cells[C.PRODUTO].textContent || '').trim();
                    if (!override.codigo_interno) override.codigo_interno = (row.getAttribute('data-codigo') || row.cells[C.COD_PRODUTO].textContent || '').trim();
                });
            }
        }
        var result = await addProduto(true, override);
        if (result && result.success) return { ok: true };
        if (result && result.produto_nao_cadastrado) return { ok: false, motivo: 'nao_cadastrado' };
        return { ok: false };
    } catch (e) {
        return { ok: false };
    }
}

/** Coleta itens bipados visíveis na tabela da conferência (fonte da verdade ao gerar comprovante). */
function _conferenciaColetarItensTabelaParaGravar() {
    var tbody = document.getElementById('tbody-conferencia');
    if (!tbody) return [];
    var itens = [];
    var rows = tbody.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row.cells || row.cells.length < 12 || row.querySelector('td[colspan]')) continue;
        var C = window._CONF_COL;
        var qtdBip = parseInt(row.cells[C.BIPADO].textContent, 10) || 0;
        if (qtdBip <= 0) continue;
        var codigoBarras = (row.cells[C.COD_BARRAS].textContent || '').trim();
        var codigoInterno = (row.getAttribute('data-codigo') || row.cells[C.COD_PRODUTO].textContent || '').trim();
        if ((!codigoBarras || codigoBarras === '-') && !codigoInterno) continue;
        itens.push({
            codigo_barras: codigoBarras,
            codigo_interno: codigoInterno,
            codigo_produto: codigoInterno,
            produto: (row.cells[C.PRODUTO].textContent || '').trim(),
            quantidade: qtdBip,
            unidade: (row.cells[C.UN].textContent || '').trim(),
            peso: (row.cells[C.PESO].textContent || '').trim()
        });
    }
    return itens;
}

/** Monta lista do extrato a partir da tabela da conferência (instantâneo após gerar comprovante). */
function _conferenciaMontarExtratoDaTabela() {
    var tbody = document.getElementById('tbody-conferencia');
    if (!tbody) return [];
    var C = window._CONF_COL;
    var lista = [];
    var rows = tbody.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row.cells || row.cells.length < 12 || row.querySelector('td[colspan]')) continue;
        var qtdProd = parseInt(row.cells[C.QTD_PROD].textContent, 10) || 0;
        var qtdBip = parseInt(row.cells[C.BIPADO].textContent, 10) || 0;
        var qtdFalta = parseInt(row.cells[C.FALTA].textContent, 10) || 0;
        var codigoInterno = (row.getAttribute('data-codigo') || row.cells[C.COD_PRODUTO].textContent || '').trim();
        var motivoInput = row.cells[C.MOTIVO].querySelector('input.input-motivo-divergencia');
        var motivo = motivoInput ? motivoInput.value.trim() : (row.cells[C.MOTIVO].textContent || '').trim();
        var avisoCell = row.cells[C.AVISO].textContent || '';
        lista.push({
            codigo_barras: (row.cells[C.COD_BARRAS].textContent || '').trim(),
            codigo_produto: codigoInterno,
            produto: (row.cells[C.PRODUTO].textContent || '').trim(),
            quantidade_produto: qtdProd,
            quantidade_bipada: qtdBip,
            quantidade_falta: qtdFalta,
            unidade: (row.cells[C.UN].textContent || '').trim(),
            peso_bruto: (row.cells[C.PESO].textContent || '').trim(),
            motivo_divergencia: motivo,
            aviso_sobra: _avisoConferenciaBipagem(avisoCell, qtdProd, qtdBip),
            status_bipado: _statusBipagemConferencia(qtdProd, qtdBip)
        });
    }
    return lista;
}

/** Preenche o extrato na hora com os dados já visíveis na conferência (sem esperar API). */
function _conferenciaPreencherExtratoInstantaneo(idViagem, opts) {
    opts = opts || {};
    var extrato = _conferenciaMontarExtratoDaTabela();
    var cacheHit = _cacheExtratoObter(idViagem, 'carregamento');
    var baseResp = (cacheHit && cacheHit.resp) ? cacheHit.resp : {};
    var meta = _extratoMetaDeResp(baseResp);
    var periodo = meta.periodo || {};
    if (opts.periodoLocal && opts.periodoLocal.inicio) {
        periodo = {
            inicio_carregamento: _formatarPeriodoBipagemLocal(opts.periodoLocal.inicio),
            fim_carregamento: _formatarPeriodoBipagemLocal(opts.periodoLocal.fim || opts.periodoLocal.inicio)
        };
    }
    var idHidden = (document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value || '').trim();
    var mesmoRoteiro = idHidden === idViagem;
    if (mesmoRoteiro) {
        var vi = meta.viagemInfo || {};
        var pick = function(id, atual) {
            if (atual && String(atual).trim()) return atual;
            var el = document.getElementById(id);
            return el && el.value ? el.value.trim() : (el && el.textContent ? el.textContent.trim() : '');
        };
        meta.viagemInfo = {
            data_expedicao: pick('data-expedicao', vi.data_expedicao),
            placa: pick('viagem-placa', vi.placa),
            motorista: pick('viagem-motorista', vi.motorista),
            identificador_rota: pick('viagem-identificador-rota', vi.identificador_rota),
            coordenador: pick('viagem-coordenador', vi.coordenador),
            conferente: pick('viagem-conferente', vi.conferente),
            ajudante1: pick('viagem-ajudante1', vi.ajudante1),
            ajudante2: pick('viagem-ajudante2', vi.ajudante2)
        };
    }
    var respSynth = Object.assign({}, baseResp, {
        lista: extrato,
        lista_ja_agregada: true,
        inicio_carregamento: periodo.inicio_carregamento,
        fim_carregamento: periodo.fim_carregamento
    });
    _cacheExtratoSalvar(idViagem, 'carregamento', respSynth);
    _preencherExtratoTela(idViagem, extrato, respSynth, meta.viagemInfo, periodo);
}

/** Grava toda a bipagem da tela em uma única requisição (rápido e confiável). */
async function _conferenciaGravarBipagemCompletaNoServidor() {
    var idViagem = window._getIdViagemAtivo && window._getIdViagemAtivo();
    if (!idViagem) return { ok: false, falhas: 1, erro: 'Nenhuma viagem selecionada.' };
    var docaEl = window._elBipagem('doca');
    var doca = docaEl && docaEl.value ? docaEl.value.trim() : '';
    var docasValidas = ['1', '2', '3', '4'];
    if (!doca || docasValidas.indexOf(doca) < 0) {
        return { ok: false, falhas: 1, erro: 'doca' };
    }
    if (window._conferenciaGravarCancelado) {
        return { ok: false, falhas: 0, cancelado: true };
    }
    var itens = _conferenciaColetarItensTabelaParaGravar();
    if (itens.length === 0 && _conferenciaTabelaTemBipagemNoDOM()) {
        return {
            ok: false,
            falhas: 1,
            erro: 'Não foi possível ler os itens bipados na tabela. Recarregue a conferência e tente novamente.'
        };
    }
    var veiculoInput = window._elBipagem('veiculo');
    var statusSelect = window._elBipagem('status');
    _conferenciaRegistrarMomentoBipagemLocal();
    var periodoLocal = _conferenciaObterPeriodoBipagemLocal(idViagem);
    var fetchOpts = {
        method: 'POST',
        body: JSON.stringify({
            fluxo: 'carregamento',
            doca: doca,
            veiculo: (veiculoInput && veiculoInput.value) ? veiculoInput.value.trim() : '',
            status: (statusSelect && statusSelect.value) ? statusSelect.value : 'PENDENTE',
            itens: itens,
            inicio_carregamento: periodoLocal && periodoLocal.inicio,
            fim_carregamento: periodoLocal && periodoLocal.fim
        })
    };
    if (window._conferenciaGravarAbort && window._conferenciaGravarAbort.signal) {
        fetchOpts.signal = window._conferenciaGravarAbort.signal;
    }
    var result = await fetchAPI('/conferencia/' + encodeURIComponent(idViagem) + '/gravar-bipagem', fetchOpts);
    if (window._conferenciaGravarCancelado || (result && result._cancelado)) {
        return { ok: false, falhas: 0, cancelado: true };
    }
    if (result && result.success) {
        var p = window._conferenciaPending;
        if (p) {
            p.removes = {};
            p.adds = {};
        }
        _conferenciaLimparPeriodoBipagemLocal(idViagem);
        if (itens.length > 0 && (result.gravados == null || result.gravados <= 0)) {
            return {
                ok: false,
                falhas: 1,
                erro: (result.mensagem || 'Nenhum item foi gravado no servidor. Verifique códigos de barras e doca.')
            };
        }
        return { ok: true, falhas: 0, gravados: result.gravados || itens.length };
    }
    return {
        ok: false,
        falhas: 1,
        erro: (result && result.erro) ? result.erro : 'Falha ao gravar bipagem no servidor.'
    };
}

/** Se não há fila pendente mas a tabela mostra bipado, grava a partir do DOM (servidor ainda vazio). */
async function _conferenciaPersistirBipagemVisivelNaTabela() {
    var tbody = document.getElementById('tbody-conferencia');
    if (!tbody) return { ok: 0, falhas: 0 };
    var ok = 0;
    var falhas = 0;
    var rows = tbody.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row.cells || row.cells.length < 12 || row.querySelector('td[colspan]')) continue;
        var C = window._CONF_COL;
        var qtdBip = parseInt(row.cells[C.BIPADO].textContent, 10) || 0;
        if (qtdBip <= 0) continue;
        var cod = (row.cells[C.COD_BARRAS].textContent || '').trim();
        if (!cod || cod === '-') continue;
        var res = await _conferenciaPersistirAddNoServidor(cod, qtdBip);
        if (res && res.ok) ok++;
        else falhas++;
    }
    return { ok: ok, falhas: falhas };
}

/** Grava no servidor adds/removes pendentes (antes de tirar tudo, excluir ou gerar comprovante). */
async function _flushTodasPendenciasConferencia() {
    if (_conferenciaUsaRascunhoLocal() && window._conferenciaSalvandoNoComprovante) {
        return _conferenciaGravarBipagemCompletaNoServidor();
    }
    var p = window._conferenciaPending;
    if (!p) return { ok: true, falhas: 0 };
    Object.keys(p.addTimers || {}).forEach(function(k) {
        clearTimeout(p.addTimers[k]);
        delete p.addTimers[k];
    });
    Object.keys(p.removeTimers || {}).forEach(function(k) {
        clearTimeout(p.removeTimers[k]);
        delete p.removeTimers[k];
    });
    var removes = Object.assign({}, p.removes || {});
    var adds = Object.assign({}, p.adds || {});
    var idViagem = window._getIdViagemAtivo && window._getIdViagemAtivo();
    if (!idViagem) return { ok: 0, falhas: 1 };
    var fluxo = (window._fluxoBipagemAtivo === 'devolucao') ? 'devolucao' : 'carregamento';
    var falhas = 0;
    var ok = 0;
    for (var codRem of Object.keys(removes)) {
        var n = removes[codRem];
        if (!n || n <= 0) continue;
        try {
            var resRem = await fetchAPI('/conferencia/remover', {
                method: 'POST',
                body: JSON.stringify({
                    id_viagem: idViagem,
                    codigo_barras: codRem,
                    quantidade: (n >= 99999) ? 'tudo' : n,
                    fluxo: fluxo
                })
            });
            if (resRem && resRem.success) ok++;
            else falhas++;
        } catch (e) {
            falhas++;
        }
    }
    var codigosAdd = Object.keys(adds);
    if (codigosAdd.length > 0) {
        for (var i = 0; i < codigosAdd.length; i++) {
            var codAdd = codigosAdd[i];
            var entry = adds[codAdd];
            if (!entry || !entry.qtd || entry.qtd <= 0) continue;
            var resAdd = await _conferenciaPersistirAddNoServidor(codAdd, entry.qtd);
            if (resAdd && resAdd.ok) ok++;
            else falhas++;
        }
    } else if (_conferenciaUsaRascunhoLocal() && _conferenciaTabelaTemBipagemNoDOM()) {
        var domRes = await _conferenciaPersistirBipagemVisivelNaTabela();
        ok += domRes.ok || 0;
        falhas += domRes.falhas || 0;
    }
    if (falhas === 0) {
        p.removes = {};
        p.adds = {};
    }
    return { ok: ok, falhas: falhas };
}

var _timerReloadConferenciaAtiva = null;

/** Recarrega a tabela só após bipagens pendentes gravarem no servidor (evita “voltar” o contador). */
function reloadConferenciaAtiva(idViagem, opts) {
    opts = opts || {};
    if (!idViagem) return Promise.resolve();
    var fl = (window._fluxoBipagemAtivo === 'devolucao') ? 'devolucao' : 'carregamento';
    var runLoad = function() {
        if (_conferenciaTemPendenciasLocais() && !opts.forcarIgnorarPendencias) {
            return Promise.resolve();
        }
        return loadConferencia(idViagem, {
            fluxo: fl,
            sincronizarServidor: true,
            forcar: opts.forcar === true
        });
    };
    if (opts.aguardarBipagem === false && !opts.forcarIgnorarPendencias) {
        if (_conferenciaTemPendenciasLocais()) {
            agendarReloadConferenciaAtiva(idViagem, opts);
            return Promise.resolve();
        }
        return runLoad();
    }
    return _esperarBipagemConferenciaIdle(opts.timeoutMs).then(function() {
        if (_conferenciaTemPendenciasLocais() && !opts.forcarIgnorarPendencias) {
            agendarReloadConferenciaAtiva(idViagem, opts);
            return Promise.resolve();
        }
        if (_conferenciaTemPendenciasLocais() && opts.forcarIgnorarPendencias) {
            if (opts.descartarPendencias) {
                _limparPendenciasConferenciaTimers();
            } else {
                return _flushTodasPendenciasConferencia().then(runLoad);
            }
        }
        return runLoad();
    });
}

/** Uma única recarga após parar de clicar (evita piscar/resetar a tabela a cada flush). */
function agendarReloadConferenciaAtiva(idViagem, opts) {
    if (!idViagem) return;
    opts = opts || {};
    var delay = opts.debounceMs != null ? opts.debounceMs : 900;
    if (_timerReloadConferenciaAtiva) clearTimeout(_timerReloadConferenciaAtiva);
    _timerReloadConferenciaAtiva = setTimeout(function() {
        _timerReloadConferenciaAtiva = null;
        reloadConferenciaAtiva(idViagem, { timeoutMs: opts.timeoutMs || 20000 });
    }, delay);
}

function _conferenciaTabelaJaCarregada(fluxoTab, idViagem) {
    var isDev = fluxoTab === 'devolucao';
    var idAtivo = isDev ? (window._devConferenciaIdViagemAtiva || '') : (window._conferenciaIdViagemAtiva || '');
    if (!idViagem || String(idViagem) !== String(idAtivo)) return false;
    var tbody = document.getElementById(isDev ? 'dev-tbody-conferencia' : 'tbody-conferencia');
    if (!tbody) return false;
    var trs = tbody.querySelectorAll('tr');
    if (!trs.length) return false;
    if (trs.length === 1 && tbody.querySelector('td.loading')) return false;
    return true;
}

// Atualização em tempo real: stream de eventos (quando alguém bipa em qualquer dispositivo, todos atualizam)
let _eventSource = null;
let _ultimaChamadaLoadAllData = 0;
var DEBOUNCE_LOAD_ALL_MS = 5000;

function initEventosStream() {
    const url = (window.location.origin || (window.location.protocol + '//' + window.location.host)) + '/api/eventos-stream';
    try {
        if (_eventSource) {
            _eventSource.close();
            _eventSource = null;
        }
        _eventSource = new EventSource(url);
        _eventSource.onmessage = function(ev) {
            const msg = (ev.data || '').trim();
            if (!msg) return;
            try {
                const data = JSON.parse(msg);
                if (data.t === 'atualizar') {
                    if (typeof data.total_bipados !== 'undefined') {
                        const elB = document.getElementById('stat-bipados');
                        const elS = document.getElementById('stat-soma-quantidades');
                        if (elB) elB.textContent = data.total_bipados;
                        if (elS) elS.textContent = data.soma_quantidades;
                    }
                }
            } catch (e) {
                if (msg === 'atualizar') { /* legado */ }
            }
            var agora = Date.now();
            if (agora - _ultimaChamadaLoadAllData >= DEBOUNCE_LOAD_ALL_MS) {
                _ultimaChamadaLoadAllData = agora;
                loadAllData();
            }
        };
        _eventSource.onerror = function() {
            _eventSource.close();
            _eventSource = null;
            setTimeout(initEventosStream, 4000);
        };
    } catch (e) {
        setTimeout(initEventosStream, 4000);
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    initModulos();
    initTabs();
    if (typeof prefetchBaixadosRavex === 'function') {
        setTimeout(function() { prefetchBaixadosRavex('carregamento'); }, 600);
    }
    initDevolucoesTabs();
    initDevolucaoNfFlow();
    initEstoqueSp();
    initWmsEnderecamento();
    initTerceirosTabs();
    void _terceirosGarantirPrefetchLista();
    initTerceirosAlertasHeader();
    initTerceirosPendenciaRecebimentoDelegacao();
    initTerceirosExcluirDelegacaoGlobal();
    initTerceirosBotoesPdfXmlDelegacao();
    initTerceirosModalPopupBloqueado();
    initTerceirosModalConfirmarRecebimentoFornecedores();
    initTerceirosConferenciaAcoesDelegacao();
    initForms();
    initFiltrosBase();
    initBaseItemModal();
    initNavegacaoRapida();
    initHubModulosOverlay();
    initConferenciaTabelaAcoes();
    initModalZerarItens();
    initConferenciaSessaoModais();
    initBaixadosRavexFiltros('carregamento');
    initBaixadosRavexFiltros('devolucao');
    initBaixadosRavexExcluir('carregamento');
    initBaixadosRavexExcluir('devolucao');
    window._conferenciaSalvarSomenteNoComprovante = true;
    initCadastroRapidoCodigoBarras();
    // Primeira carga após um tick para a tela pintar antes (resposta mais rápida percebida)
    setTimeout(function() {
        loadAllData();
        loadColaboradoresMotoristas();
        loadPlacas();
        restaurarTerceirosUltimaNotaSeSessao();
    }, 0);
    initEventosStream();
    // Sair é um link direto (href="/login?sair=1") no HTML; não depende de JS
    var btnAtualizarAba = document.getElementById('btn-atualizar-aba');
    if (btnAtualizarAba) {
        btnAtualizarAba.addEventListener('click', function() {
            var activeTab = document.querySelector('.tab-content.active');
            var activeId = activeTab ? activeTab.id : '';
            if (!activeId) return;
            btnAtualizarAba.disabled = true;
            loadTabData(activeId).then(function() {
                showMessage('Aba atualizada.', 'success');
            }).catch(function() {
                showMessage('Erro ao atualizar. Tente novamente.', 'error');
            }).finally(function() {
                btnAtualizarAba.disabled = false;
            });
        });
    }

});

let _terceirosDocAtual = {
    id: null,
    area: 'recebimento',
    recebimento_concluido: false
};
let _terceirosTabAtual = 'pendencia-recebimento';
/** Evita reentrada em «Recebimento concluído» / finalizar descarga (duplo clique, Promises sobrepostas). */
let _terceirosRecebimentoConcluindo = false;
let _terceirosConfirmacaoLancamentoResolver = null;
let _terceirosConfirmacaoConcluirSemBipagemResolver = null;
let _terceirosConfirmacaoMotivoFluxoResolver = null;
let _terceirosConfirmacaoRecebedorMgResolver = null;
let _terceirosConfirmacaoIrNotasLancadasResolver = null;
let _terceirosConfirmacaoIrRecebimentosMgResolver = null;
let _terceirosConfirmacaoRecebimentoFornecedoresResolver = null;
/** Evita fechar modal de confirmação no mesmo clique que abriu (ex.: «Sim» no select + backdrop). */
let _terceirosIgnorarCliqueBackdropModalAte = 0;
let _terceirosExcluirDocumentoResolver = null;
let _terceirosExcluirDocumentoAtual = null;
/** IDs removidos da UI até o servidor confirmar (evita reaparecer por merge de cache em background). */
if (!window._terceirosIdsOcultosExclusao) window._terceirosIdsOcultosExclusao = new Set();
if (!window._terceirosExclusaoIdsEmAndamento) window._terceirosExclusaoIdsEmAndamento = {};
/** Após mudar de etapa: destaca a linha desta NF na tabela da aba de destino (data-ter-doc-id). */
let _terceirosDestacarDocIdAposCarga = null;

/** Reabre a última NF após F5 (evita “sumir” bipagem que já está no servidor). */
var TERCEIROS_SESS_DOC_KEY = 'terceiros_doc_restaurar_v1';
/** Guarda só a sub-aba ativa (independente do documento — não é limpa ao fechar detalhe). */
var TERCEIROS_SESS_SUBABA_KEY = 'terceiros_subaba_v1';
var TERCEIROS_SESS_MAX_MS = 12 * 60 * 60 * 1000;

function _persistirTerceirosSubabaNaSessao(tab) {
    try {
        var aba = _terceirosNormalizarAbaTab(tab);
        sessionStorage.setItem(TERCEIROS_SESS_SUBABA_KEY, JSON.stringify({ tab: aba, t: Date.now() }));
    } catch (e) {}
}

function _lerTerceirosSubabaNaSessao() {
    try {
        var raw = sessionStorage.getItem(TERCEIROS_SESS_SUBABA_KEY);
        if (!raw) return null;
        var o = JSON.parse(raw);
        if (!o || !o.tab) return null;
        if (o.t && Date.now() - o.t > TERCEIROS_SESS_MAX_MS) {
            sessionStorage.removeItem(TERCEIROS_SESS_SUBABA_KEY);
            return null;
        }
        return o;
    } catch (e) {
        return null;
    }
}

function _limparTerceirosDocumentoNaSessao() {
    try {
        sessionStorage.removeItem(TERCEIROS_SESS_DOC_KEY);
    } catch (e) {}
}

function _lerTerceirosDocumentoNaSessao() {
    try {
        var raw = sessionStorage.getItem(TERCEIROS_SESS_DOC_KEY);
        if (!raw) return null;
        var o = JSON.parse(raw);
        if (!o || !o.id) return null;
        if (o.t && Date.now() - o.t > TERCEIROS_SESS_MAX_MS) {
            _limparTerceirosDocumentoNaSessao();
            return null;
        }
        return o;
    } catch (e) {
        return null;
    }
}

function _persistirTerceirosDocumentoNaSessao(documentoId, area) {
    try {
        if (documentoId == null || documentoId === '') {
            _limparTerceirosDocumentoNaSessao();
            return;
        }
        /* Só persiste NF aberta na pendência (descarga/bipagem). Evita reabrir MG/listas após o sininho. */
        if (_terceirosTabAtual !== 'pendencia-recebimento') {
            _limparTerceirosDocumentoNaSessao();
            return;
        }
        var aid = Number(documentoId);
        if (!Number.isFinite(aid) || aid <= 0) return;
        var ar = (area === 'expedicao' || area === 'carreta') ? area : 'recebimento';
        var payload = {
            id: aid,
            area: ar,
            tab: 'pendencia-recebimento',
            t: Date.now()
        };
        sessionStorage.setItem(TERCEIROS_SESS_DOC_KEY, JSON.stringify(payload));
    } catch (e) {}
}

function definirDestaqueLinhaTerceirosDoc(documentoId) {
    var n = parseInt(documentoId, 10);
    _terceirosDestacarDocIdAposCarga = Number.isFinite(n) && n > 0 ? n : null;
}

function aplicarDestaqueLinhaTerceirosDoc(tbody) {
    if (!tbody || _terceirosDestacarDocIdAposCarga == null) return;
    var idAlvo = _terceirosDestacarDocIdAposCarga;
    _terceirosDestacarDocIdAposCarga = null;
    window.requestAnimationFrame(function() {
        var tr = tbody.querySelector('tr[data-ter-doc-id="' + idAlvo + '"]');
        if (!tr) return;
        tr.classList.add('ter-fornecedor-linha-destacada');
        tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        window.setTimeout(function() {
            tr.classList.remove('ter-fornecedor-linha-destacada');
        }, 2400);
    });
}

/**
 * Recarrega só a tabela da aba indicada (ex.: já estamos na aba e forçamos atualização).
 * @param {string} tab mesmo valor de data-ter-tab / _terceirosTabAtual
 */
function _terceirosDadosListaParaRender() {
    var hit = _terceirosObterCacheLista();
    if (hit) return hit;
    var stale = _terceirosObterCacheLista({ staleOk: true });
    if (stale) return stale;
    if (_terceirosListaCache.rows && _terceirosListaCache.rows.length) {
        return {
            rows: _terceirosFiltrarRowsNaoExcluidas(_terceirosListaCache.rows),
            erro: _terceirosListaCache.erro,
            _stale: true
        };
    }
    return undefined;
}

function _terceirosLoaderPorAba(tab) {
    if (tab === 'pendencia-recebimento' || tab === 'enviar-xml') return loadTerceirosDocumentos;
    if (tab === 'fornecedores-recebidos') return loadTerceirosFornecedoresRecebidos;
    if (tab === 'pendentes-lancamento') return loadTerceirosPendentesLancamento;
    if (tab === 'notas-lancadas') return loadTerceirosNotasLancadas;
    if (tab === 'pendencias-mg') return loadTerceirosPendenciasMg;
    if (tab === 'notas-enviadas-mg') return loadTerceirosNotasEnviadasMg;
    if (tab === 'recebimentos-mg') return loadTerceirosRecebimentosMg;
    if (tab === 'historico') return loadTerceirosHistorico;
    return null;
}

var TERCEIROS_ABAS_LISTA_WARM = [
    'pendencia-recebimento',
    'fornecedores-recebidos',
    'pendentes-lancamento',
    'notas-lancadas',
    'pendencias-mg',
    'notas-enviadas-mg',
    'recebimentos-mg',
    'historico'
];

async function recarregarListaTerceirosTab(tab) {
    var pre = _terceirosDadosListaParaRender();
    if (!pre && _terceirosPrefetchPromise) {
        try {
            pre = await _terceirosPrefetchPromise;
        } catch (e) {
            console.error('recarregarListaTerceirosTab prefetch:', e);
        }
    }
    if (!pre) pre = _terceirosDadosListaParaRender();
    if (tab === 'painel') return loadPainelTerceiros();
    if (tab === 'pendencia-recebimento' || tab === 'enviar-xml') return loadTerceirosDocumentos(pre);
    if (tab === 'fornecedores-recebidos') return loadTerceirosFornecedoresRecebidos(pre);
    if (tab === 'pendentes-lancamento') return loadTerceirosPendentesLancamento(pre);
    if (tab === 'notas-lancadas') return loadTerceirosNotasLancadas(pre);
    if (tab === 'pendencias-mg') return loadTerceirosPendenciasMg(pre);
    if (tab === 'notas-enviadas-mg') return loadTerceirosNotasEnviadasMg(pre);
    if (tab === 'recebimentos-mg') return loadTerceirosRecebimentosMg(pre);
    if (tab === 'historico') return loadTerceirosHistorico(pre);
    if (tab === 'relatorios') return undefined;
    return undefined;
}

var TERCEIROS_FLUXO_ABAS = [
    'painel',
    'enviar-xml',
    'pendencia-recebimento',
    'fornecedores-recebidos',
    'pendentes-lancamento',
    'notas-lancadas',
    'pendencias-mg',
    'notas-enviadas-mg',
    'recebimentos-mg',
    'historico',
    'relatorios'
];

var TERCEIROS_LABEL_ABA = {
    'painel': 'Painel',
    'enviar-xml': 'Enviar XML',
    'pendencia-recebimento': 'Pendência de recebimento',
    'fornecedores-recebidos': 'Fornecedores recebidos',
    'pendentes-lancamento': 'NFs pendentes de lançamento',
    'notas-lancadas': 'Notas fiscais lançadas',
    'pendencias-mg': 'Pendências envio MG',
    'notas-enviadas-mg': 'Notas enviadas para MG',
    'recebimentos-mg': 'Recebimentos de MG',
    'historico': 'Histórico',
    'relatorios': 'Relatórios'
};

function _terceirosNormalizarAbaTab(tab) {
    var aba = 'painel';
    if (tab === 'painel') aba = 'painel';
    if (tab === 'enviar-xml') aba = 'enviar-xml';
    if (tab === 'pendencia-recebimento') aba = 'pendencia-recebimento';
    if (tab === 'fornecedores-recebidos') aba = 'fornecedores-recebidos';
    if (tab === 'pendentes-lancamento') aba = 'pendentes-lancamento';
    if (tab === 'notas-lancadas') aba = 'notas-lancadas';
    if (tab === 'notas-enviadas-mg') aba = 'notas-enviadas-mg';
    if (tab === 'recebimentos-mg') aba = 'recebimentos-mg';
    if (tab === 'pendencias-mg') aba = 'pendencias-mg';
    if (tab === 'historico') aba = 'historico';
    if (tab === 'relatorios') aba = 'relatorios';
    return aba;
}

function _terceirosIndiceAbaFluxo(aba) {
    return TERCEIROS_FLUXO_ABAS.indexOf(_terceirosNormalizarAbaTab(aba));
}

function terceirosAbaAnteriorNoFluxo(aba) {
    var idx = _terceirosIndiceAbaFluxo(aba);
    if (idx <= 0) return null;
    return TERCEIROS_FLUXO_ABAS[idx - 1];
}

/** Remove botões antigos «Voltar: aba anterior» (substituídos por voltar à lista da NF). */
function removerTerceirosBotoesVoltarAba() {
    document.querySelectorAll('.ter-btn-voltar-aba').forEach(function(el) {
        el.remove();
    });
}

var TERCEIROS_TBODY_POR_ABA = {
    'pendencia-recebimento': 'ter-tbody-recebimento-documentos',
    'fornecedores-recebidos': 'ter-tbody-fornecedores-recebidos',
    'pendentes-lancamento': 'ter-tbody-pendentes-lancamento-mg',
    'notas-lancadas': 'ter-tbody-notas-lancadas',
    'pendencias-mg': 'ter-tbody-pendencias-mg',
    'notas-enviadas-mg': 'ter-tbody-notas-enviadas-mg',
    'recebimentos-mg': 'ter-tbody-recebimentos-mg',
    'historico': 'ter-tbody-historico'
};

/** Fecha o detalhe da NF e volta à tabela da aba de onde a nota foi aberta. */
function terceirosVoltarDaNotaParaLista() {
    var tabOrigem = window._terceirosDetalheOrigemTab || _terceirosTabAtual || 'pendencia-recebimento';
    var docIdVoltar = (_terceirosDocAtual && _terceirosDocAtual.id != null) ? String(_terceirosDocAtual.id) : null;
    window._terceirosDetalheOrigemTab = null;
    resetTerceirosDetalhe();
    if (window.terceirosMostrarAba) window.terceirosMostrarAba(tabOrigem);
    window.requestAnimationFrame(function() {
        var tbodyId = TERCEIROS_TBODY_POR_ABA[tabOrigem] || 'ter-tbody-recebimento-documentos';
        if (tabOrigem === 'pendentes-lancamento' && docIdVoltar) {
            var docId = docIdVoltar;
            TERCEIROS_PEND_LANC_TBODY_IDS.some(function(id) {
                var tb = document.getElementById(id);
                if (tb && tb.querySelector('tr[data-ter-doc-id="' + docId + '"]')) {
                    tbodyId = id;
                    return true;
                }
                return false;
            });
        }
        var tbody = document.getElementById(tbodyId);
        var alvo = (tbody && tbody.closest('.conferencia-bloco')) || tbody;
        if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}
window.terceirosVoltarDaNotaParaLista = terceirosVoltarDaNotaParaLista;

/** Atualiza botões e painéis da sub-aba (sem fetch). */
function terceirosAplicarPainelAbaSomenteUi(aba) {
    _terceirosTabAtual = aba;
    var botoes = document.querySelectorAll('.terceiros-subtab[data-ter-tab]');
    var painel = document.getElementById('terceiros-panel-painel');
    var enviarXml = document.getElementById('terceiros-panel-enviar-xml');
    var recebimento = document.getElementById('terceiros-panel-recebimento');
    var fornecedoresRecebidos = document.getElementById('terceiros-panel-fornecedores-recebidos');
    var pendentesLancamento = document.getElementById('terceiros-panel-pendentes-lancamento');
    var notasLancadas = document.getElementById('terceiros-panel-notas-lancadas');
    var notasEnviadasMg = document.getElementById('terceiros-panel-notas-enviadas-mg');
    var recebimentosMg = document.getElementById('terceiros-panel-recebimentos-mg');
    var pendenciasMg = document.getElementById('terceiros-panel-pendencias-mg');
    var historico = document.getElementById('terceiros-panel-historico');
    var relatorios = document.getElementById('terceiros-panel-relatorios');
    if (!botoes.length || !painel || !enviarXml || !recebimento || !fornecedoresRecebidos) return;
    botoes.forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-ter-tab') === aba);
    });
    painel.classList.toggle('devolucoes-panel-active', aba === 'painel');
    enviarXml.classList.toggle('devolucoes-panel-active', aba === 'enviar-xml');
    recebimento.classList.toggle('devolucoes-panel-active', aba === 'pendencia-recebimento');
    fornecedoresRecebidos.classList.toggle('devolucoes-panel-active', aba === 'fornecedores-recebidos');
    if (pendentesLancamento) pendentesLancamento.classList.toggle('devolucoes-panel-active', aba === 'pendentes-lancamento');
    if (notasLancadas) notasLancadas.classList.toggle('devolucoes-panel-active', aba === 'notas-lancadas');
    if (notasEnviadasMg) notasEnviadasMg.classList.toggle('devolucoes-panel-active', aba === 'notas-enviadas-mg');
    if (recebimentosMg) recebimentosMg.classList.toggle('devolucoes-panel-active', aba === 'recebimentos-mg');
    if (pendenciasMg) pendenciasMg.classList.toggle('devolucoes-panel-active', aba === 'pendencias-mg');
    if (historico) historico.classList.toggle('devolucoes-panel-active', aba === 'historico');
    if (relatorios) relatorios.classList.toggle('devolucoes-panel-active', aba === 'relatorios');
    _persistirTerceirosSubabaNaSessao(aba);
    if (aba !== 'pendencia-recebimento') {
        _limparTerceirosDocumentoNaSessao();
    } else if (_terceirosDocAtual && _terceirosDocAtual.id != null && String(_terceirosDocAtual.id).trim() !== '') {
        _persistirTerceirosDocumentoNaSessao(_terceirosDocAtual.id, _terceirosDocAtual.area);
    }
    var moduloTer = document.getElementById('modulo-terceiros');
    if (moduloTer) moduloTer.setAttribute('data-ter-aba-ativa', aba || 'painel');
    if (aba === 'painel') {
        _agendarChartsPainelTerceiros();
    }
    _terceirosSincronizarCampoEnviarMgDetalhe();
    _terceirosSincronizarCampoRecebidaMgDetalhe();
    _terceirosSincronizarCamposCarretaEnviarXml();
}

/** Motorista/placa editáveis só na 1ª aba (Enviar XML) e na 6ª (Pendências envio MG). */
function _terceirosPodeEditarMotoristaPlaca() {
    var aba = _terceirosTabAtual;
    return aba === 'enviar-xml' || aba === 'pendencias-mg';
}

function _terceirosSincronizarCamposCarretaEnviarXml() {
    var pode = _terceirosTabAtual === 'enviar-xml';
    var titulo = 'Alterar somente na aba 1 — Enviar XML';
    ['ter-carreta-motorista', 'ter-carreta-placa'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.disabled = !pode;
        el.title = pode ? '' : titulo;
    });
}

function _terceirosSincronizarCampoEnviarMgDetalhe() {
    var el = document.getElementById('ter-rec-enviar-mg');
    if (!el) return;
    var podeEditar = _terceirosTabAtual === 'pendencias-mg';
    el.disabled = !podeEditar;
    el.title = podeEditar ? '' : 'Alterar somente na aba 6 — Pendências envio MG';
}

function _terceirosSincronizarCampoRecebidaMgDetalhe() {
    var el = document.getElementById('ter-rec-recebida-mg');
    if (!el) return;
    var podeEditar = _terceirosTabAtual === 'recebimentos-mg';
    el.disabled = !podeEditar;
    el.title = podeEditar ? '' : 'Alterar somente na aba 8 — Recebimentos de MG';
}

/** Diagnóstico sempre visível: o último PASSO no console mostra onde o fluxo ficou pendente. */
function _terceirosLogFluxoRecebimento(etapa) {
    try {
        console.log('[terceiros recebimento concluído]', etapa, new Date().toISOString());
    } catch (e) {}
}

/**
 * Abre sub-aba aguardando carga da lista (evita trocar de aba antes do reload terminarem).
 * Protegido por timeout para nenhum await ficar pendente indefinidamente.
 * @param {boolean} [listaJaFoiRecarregada] Se true, só aplica UI (lista já foi atualizada em background).
 */
async function abrirAbaTerceirosSeDiferenteAsync(tab, forcarRecarregarLista, listaJaFoiRecarregada) {
    var aba = _terceirosNormalizarAbaTab(tab);
    var msLimite = 50000;
    var executar = async function() {
        if (_terceirosTabAtual === aba) {
            if (forcarRecarregarLista) {
                await recarregarListaTerceirosTab(aba);
            }
            return;
        }
        terceirosAplicarPainelAbaSomenteUi(aba);
        if (!listaJaFoiRecarregada) {
            await recarregarListaTerceirosTab(aba);
        }
    };
    try {
        await Promise.race([
            executar(),
            new Promise(function(_, rej) {
                window.setTimeout(function() {
                    rej(new Error('TERCEIROS_ABA_ASYNC_TIMEOUT'));
                }, msLimite);
            })
        ]);
    } catch (e) {
        if (e && e.message === 'TERCEIROS_ABA_ASYNC_TIMEOUT') {
            console.warn('[terceiros] abrirAbaTerceirosSeDiferenteAsync: tempo limite (' + msLimite + 'ms). A aba pode estar inconsistente.');
            terceirosAplicarPainelAbaSomenteUi(aba);
            try {
                void recarregarListaTerceirosTab(aba);
            } catch (e2) {
                console.error(e2);
            }
        } else {
            throw e;
        }
    }
}

/**
 * Reaplica filtro de previsão na 2ª aba quando o cache da pendência já foi atualizado (mantém filtro ativo sem F5).
 */
function terceirosReaplicarFiltroPrevisaoPendenciaSeAplicavel() {
    try {
        reaplicarFiltroPrevisaoPendenciaRecebimento();
    } catch (e) {
        console.error(e);
    }
}

/** Atualiza cache local e remove NF da tabela da 4ª aba após marcar nota lançada. */
function _terceirosAtualizarNotaLancadaLocal(documentoId, valorNorm, motivo) {
    if (documentoId == null) return;
    var id = String(documentoId);
    var locais = window._terceirosFornecedoresRecebidosLocais || {};
    var baseLocal = locais[id] || { id: documentoId };
    var patch = { nota_lancada: valorNorm };
    if (motivo != null && String(motivo).trim() !== '') {
        patch.motivo_nao_lancada = String(motivo).trim();
    }
    locais[id] = Object.assign({}, baseLocal, patch);
    if (Array.isArray(_terceirosListaCache.rows)) {
        _terceirosListaCache.rows = _terceirosListaCache.rows.map(function(row) {
            if (!row || String(row.id) !== id) return row;
            return Object.assign({}, row, patch);
        });
        _terceirosListaCache.ts = Date.now();
    }
    if (_terceirosDocAtual && String(_terceirosDocAtual.id) === id) {
        Object.assign(_terceirosDocAtual, patch);
    }
    _terceirosAtualizarPainelLocalRapido();
}

var TERCEIROS_PEND_LANC_TBODY_IDS = [
    'ter-tbody-pendentes-lancamento-mg',
    'ter-tbody-pendentes-lancamento-sp',
    'ter-tbody-pendentes-lancamento-outras'
];

/** Tabelas de NF nas abas 2–8 (e painel) que usam data-ter-doc-id. */
var TERCEIROS_TBODIES_LISTA_DOC = [
    'ter-tbody-recebimento-documentos',
    'ter-tbody-fornecedores-recebidos',
    'ter-tbody-pendentes-lancamento-mg',
    'ter-tbody-pendentes-lancamento-sp',
    'ter-tbody-pendentes-lancamento-outras',
    'ter-tbody-notas-lancadas',
    'ter-tbody-pendencias-mg',
    'ter-tbody-notas-enviadas-mg',
    'ter-tbody-recebimentos-mg',
    'ter-tbody-historico'
];

function _terceirosUfDestinoPendenteLanc(row) {
    var uf = String((row && row.destinatario_uf) || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (uf === 'MG' || uf === 'SP') return uf;
    return 'OUTRAS';
}

function _terceirosDividirRowsPendentesLancamentoPorUf(rows) {
    var grupos = { MG: [], SP: [], OUTRAS: [] };
    (Array.isArray(rows) ? rows : []).forEach(function(row) {
        var chave = _terceirosUfDestinoPendenteLanc(row);
        grupos[chave].push(row);
    });
    return grupos;
}

function _terceirosMensagemVaziaPendenteLancamento(ufChave) {
    if (ufChave === 'MG') {
        return 'Nenhuma NF de <strong>Minas Gerais (MG)</strong> aguardando lançamento fiscal.';
    }
    if (ufChave === 'SP') {
        return 'Nenhuma NF de <strong>São Paulo (SP)</strong> aguardando lançamento fiscal.';
    }
    return 'Nenhuma NF de outras UFs aguardando lançamento fiscal.';
}

function renderTerceirosPendenteLancamentoRowHtml(row) {
    return '<tr data-ter-doc-id="' + escapeHtml(String(row.id)) + '">'
        + renderTerceirosCelulasNfAtePrevisao(row)
        + renderTerceirosCelulasStatusFluxo(row, 'pendentes-lancamento')
        + renderTerceirosListaAcoesCelula(
            renderTerceirosAbrirButton(row, 'data-ter-pend-lanc-doc', 'Abrir detalhe', 'pendentes-lancamento')
            + renderTerceirosBotoesPdfXmlNf(row)
            + renderTerceirosComprovanteButton(row)
            + renderTerceirosExcluirButton(row, 'data-ter-excluir-pend-lanc-doc')
        )
        + '</tr>';
}

function bindTerceirosPendentesLancamentoTbody(tbody) {
    if (!tbody) return;
    bindTerceirosAbrirButtons('[data-ter-pend-lanc-doc]');
    bindTerceirosExcluirButtons('[data-ter-excluir-pend-lanc-doc]');
    bindTerceirosComprovanteButtons('[data-ter-comprovante-doc]');
    if (!window._terceirosNotaLancadaPendEmAndamento) window._terceirosNotaLancadaPendEmAndamento = {};
    tbody.querySelectorAll('[data-ter-nota-lancada-pend]').forEach(function(select) {
        if (select.dataset.terPendLancBound === '1') return;
        select.dataset.terPendLancBound = '1';
        select.addEventListener('change', function() {
            var id = parseInt(select.getAttribute('data-ter-nota-lancada-pend') || '0', 10);
            var recebimentoConcluido = select.getAttribute('data-ter-recebimento-concluido') === 'sim';
            var fornecedorRecebido = select.getAttribute('data-ter-fornecedor-recebido') === 'sim';
            var valor = (select.value || '').trim().toLowerCase();
            if (!id || !valor) return;
            if (window._terceirosNotaLancadaPendEmAndamento[id]) return;
            window._terceirosNotaLancadaPendEmAndamento[id] = true;
            select.disabled = true;
            var opcoesStatus = {
                recebimento_concluido: recebimentoConcluido,
                fornecedor_recebido: fornecedorRecebido
            };
            if (valor === 'sim') {
                opcoesStatus.movimento_lancada_sim_aplicado = true;
                void terceirosNavegarParaNotasLancadasAposMarcarSim(id);
            }
            _terceirosAtualizarStatusComMotivo(id, 'nota_lancada', valor, opcoesStatus).finally(function() {
                delete window._terceirosNotaLancadaPendEmAndamento[id];
                if (select.isConnected) select.disabled = false;
            });
        });
    });
}

function _terceirosPreencherTbodyPendenteLancamento(tbody, rows, ufChave) {
    if (!tbody) return;
    var cols = TERCEIROS_COLS_LISTA_FLUXO;
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + cols + '" class="loading">' + _terceirosMensagemVaziaPendenteLancamento(ufChave) + '</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(renderTerceirosPendenteLancamentoRowHtml).join('');
    bindTerceirosPendentesLancamentoTbody(tbody);
}

function _terceirosRemoverLinhaPendentesLancamento(documentoId) {
    if (documentoId == null) return;
    var id = String(documentoId);
    var algumRestante = false;
    TERCEIROS_PEND_LANC_TBODY_IDS.forEach(function(tbodyId) {
        var tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        var tr = tbody.querySelector('tr[data-ter-doc-id="' + id + '"]');
        if (tr) tr.remove();
        if (tbody.querySelector('tr[data-ter-doc-id]')) algumRestante = true;
    });
    if (!algumRestante) {
        void loadTerceirosPendentesLancamento();
    }
}

function _terceirosAtualizarEnviarMgLocal(documentoId, valorNorm, motivo) {
    if (documentoId == null) return;
    var id = String(documentoId);
    var locais = window._terceirosFornecedoresRecebidosLocais || {};
    var baseLocal = locais[id] || { id: documentoId };
    var patch = { enviar_para_mg: valorNorm };
    if (motivo != null && String(motivo).trim() !== '') {
        patch.motivo_nao_enviar_mg = String(motivo).trim();
    }
    locais[id] = Object.assign({}, baseLocal, patch);
    if (Array.isArray(_terceirosListaCache.rows)) {
        _terceirosListaCache.rows = _terceirosListaCache.rows.map(function(row) {
            if (!row || String(row.id) !== id) return row;
            return Object.assign({}, row, patch);
        });
        _terceirosListaCache.ts = Date.now();
    }
    if (_terceirosDocAtual && String(_terceirosDocAtual.id) === id) {
        Object.assign(_terceirosDocAtual, patch);
    }
    _terceirosAtualizarPainelLocalRapido();
}

function _terceirosAtualizarConsumivelHistoricoLocal(documentoId, valorNorm, documentoAtualizado) {
    if (documentoId == null) return;
    var id = String(documentoId);
    var locais = window._terceirosFornecedoresRecebidosLocais || {};
    var baseLocal = locais[id] || { id: documentoId };
    var patch = {
        consumivel_sp_historico: valorNorm,
        consumivel_sp_historico_em: (documentoAtualizado && documentoAtualizado.consumivel_sp_historico_em) || '',
        consumivel_sp_historico_por: (documentoAtualizado && documentoAtualizado.consumivel_sp_historico_por) || ''
    };
    locais[id] = Object.assign({}, baseLocal, patch);
    window._terceirosFornecedoresRecebidosLocais = locais;
    if (Array.isArray(_terceirosListaCache.rows)) {
        _terceirosListaCache.rows = _terceirosListaCache.rows.map(function(row) {
            if (!row || String(row.id) !== id) return row;
            return Object.assign({}, row, patch);
        });
    }
    _terceirosAtualizarPainelLocalRapido();
}

function _terceirosAtualizarRecebidaMgLocal(documentoId, valorNorm, motivo, recebedorMg) {
    if (documentoId == null) return;
    var id = String(documentoId);
    var patch = { carga_recebida_mg: valorNorm };
    if (motivo != null && String(motivo).trim() !== '') {
        patch.motivo_nao_recebida_mg = String(motivo).trim();
    }
    if (recebedorMg != null) {
        patch.recebedor_mg = String(recebedorMg || '').trim();
    }
    var locais = window._terceirosFornecedoresRecebidosLocais || {};
    var baseLocal = locais[id] || { id: documentoId };
    locais[id] = Object.assign({}, baseLocal, patch);
    if (Array.isArray(_terceirosListaCache.rows)) {
        _terceirosListaCache.rows = _terceirosListaCache.rows.map(function(row) {
            if (!row || String(row.id) !== id) return row;
            return Object.assign({}, row, patch);
        });
        _terceirosListaCache.ts = Date.now();
    }
    if (_terceirosDocAtual && String(_terceirosDocAtual.id) === id) {
        Object.assign(_terceirosDocAtual, patch);
    }
    _terceirosAtualizarPainelLocalRapido();
}

function _terceirosAtualizarMotoristaPlacaLocal(documentoId, motorista, placa, tipo) {
    if (documentoId == null) return;
    var id = String(documentoId);
    var patch = {};
    var saidaMg = tipo === 'saida_mg';
    if (motorista != null) patch[saidaMg ? 'motorista_saida_mg' : 'motorista_carreta'] = String(motorista).trim();
    if (placa != null) patch[saidaMg ? 'placa_saida_mg' : 'placa_carreta'] = String(placa).trim().toUpperCase();
    var locais = window._terceirosFornecedoresRecebidosLocais || {};
    var baseLocal = locais[id] || { id: documentoId };
    locais[id] = Object.assign({}, baseLocal, patch);
    if (Array.isArray(_terceirosListaCache.rows)) {
        _terceirosListaCache.rows = _terceirosListaCache.rows.map(function(row) {
            if (!row || String(row.id) !== id) return row;
            return Object.assign({}, row, patch);
        });
        _terceirosListaCache.ts = Date.now();
    }
    if (_terceirosDocAtual && String(_terceirosDocAtual.id) === id) {
        Object.assign(_terceirosDocAtual, patch);
    }
    _terceirosAtualizarPainelLocalRapido();
}

function _terceirosUsaMotoristaSaidaMgNaAba(aba) {
    return aba === 'pendencias-mg' || aba === 'notas-enviadas-mg' || aba === 'recebimentos-mg' || aba === 'historico';
}

function _terceirosMotoristaLista(row, attrPrefix) {
    var usaSaida = attrPrefix === 'pend-mg' || _terceirosUsaMotoristaSaidaMgNaAba(_terceirosTabAtual);
    return usaSaida ? (row.motorista_saida_mg || '') : (row.motorista_carreta || '');
}

function _terceirosPlacaLista(row, attrPrefix) {
    var usaSaida = attrPrefix === 'pend-mg' || _terceirosUsaMotoristaSaidaMgNaAba(_terceirosTabAtual);
    return usaSaida ? (row.placa_saida_mg || '') : (row.placa_carreta || '');
}

function _terceirosMotoristaEmLista(row, attrPrefix) {
    var usaSaida = attrPrefix === 'pend-mg' || _terceirosUsaMotoristaSaidaMgNaAba(_terceirosTabAtual);
    return usaSaida ? (row.motorista_saida_mg_em || '') : (row.motorista_carreta_em || '');
}

function _terceirosRemoverLinhaPendenciasMg(documentoId) {
    var tbody = document.getElementById('ter-tbody-pendencias-mg');
    if (!tbody || documentoId == null) return;
    var tr = tbody.querySelector('tr[data-ter-doc-id="' + String(documentoId) + '"]');
    if (tr) tr.remove();
    if (!tbody.querySelector('tr[data-ter-doc-id]')) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF aguardando <strong>envio para MG</strong>. As notas entram aqui após o recebimento concluído e antes do lançamento fiscal.</td></tr>';
    }
}

function _terceirosRemoverLinhaRecebimentosMg(documentoId) {
    var tbody = document.getElementById('ter-tbody-recebimentos-mg');
    if (!tbody || documentoId == null) return;
    var tr = tbody.querySelector('tr[data-ter-doc-id="' + String(documentoId) + '"]');
    if (tr) tr.remove();
    if (!tbody.querySelector('tr[data-ter-doc-id]')) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF aguardando <strong>Recebida MG</strong>. Entram aqui após <strong>Enviado MG = Sim</strong> na 6ª ou 7ª aba.</td></tr>';
    }
}

function _terceirosRemoverLinhaNotasLancadas(documentoId) {
    var tbody = document.getElementById('ter-tbody-notas-lancadas');
    if (!tbody || documentoId == null) return;
    var tr = tbody.querySelector('tr[data-ter-doc-id="' + String(documentoId) + '"]');
    if (tr) tr.remove();
    if (!tbody.querySelector('tr[data-ter-doc-id]')) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF aguardando ação após lançamento.</td></tr>';
    }
}

function _terceirosInserirLinhaHistoricoLocal(documentoId) {
    var tbody = document.getElementById('ter-tbody-historico');
    if (!tbody || documentoId == null) return;
    var row = _terceirosRowPorId(documentoId);
    if (!row || !_terceirosConsideraHistorico(row)) return;
    var id = String(documentoId);
    var html = '<tr data-ter-doc-id="' + escapeHtml(id) + '">'
        + renderTerceirosCelulasNfAtePrevisao(row, { historicoMotoristaPlaca: true })
        + renderTerceirosCelulasStatusFluxo(row, 'historico')
        + renderTerceirosListaAcoesCelula(
            renderTerceirosAbrirButton(row, 'data-ter-historico-doc', 'Abrir detalhe', 'historico')
            + renderTerceirosBotoesPdfXmlNf(row)
            + renderTerceirosComprovanteButton(row)
            + renderTerceirosExcluirButton(row, 'data-ter-excluir-historico-doc')
        )
        + '</tr>';
    var atual = tbody.querySelector('tr[data-ter-doc-id="' + id + '"]');
    if (atual) {
        atual.outerHTML = html;
    } else {
        var loading = tbody.querySelector('tr.loading, td.loading');
        if (loading || !tbody.querySelector('tr[data-ter-doc-id]')) {
            tbody.innerHTML = html;
        } else {
            tbody.insertAdjacentHTML('afterbegin', html);
        }
    }
    bindTerceirosAbrirButtons('[data-ter-historico-doc]');
    bindTerceirosExcluirButtons('[data-ter-excluir-historico-doc]');
    bindTerceirosComprovanteButtons('[data-ter-comprovante-doc]');
    aplicarDestaqueLinhaTerceirosDoc(tbody);
}

/** 4ª → 5ª aba: após marcar «Sim» em Nota lançada. */
async function terceirosNavegarParaNotasLancadasAposMarcarSim(documentoId) {
    if (documentoId == null) return;
    _terceirosAtualizarNotaLancadaLocal(documentoId, 'sim');
    _terceirosRemoverLinhaPendentesLancamento(documentoId);
    definirDestaqueLinhaTerceirosDoc(documentoId);
    abrirAbaTerceirosSeDiferente('notas-lancadas', true);
    try {
        await loadTerceirosNotasLancadas();
        var tbody5 = document.getElementById('ter-tbody-notas-lancadas');
        if (tbody5) aplicarDestaqueLinhaTerceirosDoc(tbody5);
    } catch (e) {
        console.error(e);
    }
    try {
        void loadTerceirosPendentesLancamento();
        void loadTerceirosFornecedoresRecebidos();
    } catch (e2) {
        console.error(e2);
    }
}

/** 5ª → 6ª aba: escolher enviar para MG não registra envio ainda; apenas abre a pendência. */
async function terceirosNavegarParaPendenciasMgAposEscolherEnviar(documentoId) {
    if (documentoId == null) return;
    _terceirosAtualizarEnviarMgLocal(documentoId, 'pendente');
    definirDestaqueLinhaTerceirosDoc(documentoId);
    abrirAbaTerceirosSeDiferente('pendencias-mg', true);
    try {
        await loadTerceirosPendenciasMg();
        var tbody6 = document.getElementById('ter-tbody-pendencias-mg');
        if (tbody6) aplicarDestaqueLinhaTerceirosDoc(tbody6);
    } catch (e) {
        console.error(e);
    }
    showMessage('NF enviada para a 6ª aba — Pendências envio MG. Confirme o envio por lá.', 'success');
}

async function terceirosMarcarPendenciaMgDaNotaLancada(documentoId) {
    if (documentoId == null) return;
    await terceirosNavegarParaPendenciasMgAposEscolherEnviar(documentoId);
    var resp = await fetchAPI('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/status', {
        method: 'POST',
        body: JSON.stringify({ campo: 'enviar_para_mg', valor: 'pendente' })
    });
    if (!_terceirosRespostaApiOk(resp)) {
        showMessage((resp && resp.erro) || 'Erro ao mover NF para pendência MG.', 'error');
        await recarregarTodasListasTerceiros();
        return;
    }
    if (resp && resp.documento) {
        _terceirosAtualizarEnviarMgLocal(documentoId, resp.documento.enviar_para_mg || 'pendente');
    }
    void recarregarTodasListasTerceiros().catch(function(e) {
        console.error(e);
    });
}

/** 6ª → 7ª/8ª abas: envio MG confirmado. */
async function terceirosNavegarParaNotasEnviadasMgAposConfirmar(documentoId) {
    if (documentoId == null) return;
    _terceirosAtualizarEnviarMgLocal(documentoId, 'sim');
    _terceirosRemoverLinhaPendenciasMg(documentoId);
    definirDestaqueLinhaTerceirosDoc(documentoId);
    abrirAbaTerceirosSeDiferente('notas-enviadas-mg', true);
    try {
        await loadTerceirosNotasEnviadasMg();
        var tbody7 = document.getElementById('ter-tbody-notas-enviadas-mg');
        if (tbody7) aplicarDestaqueLinhaTerceirosDoc(tbody7);
        void loadTerceirosRecebimentosMg();
    } catch (e) {
        console.error(e);
    }
}

/** 8ª → 4ª aba: recebimento MG confirmado, agora aguarda lançamento fiscal. */
async function terceirosNavegarParaPendentesLancamentoAposRecebidaMg(documentoId, recebedorMg) {
    if (documentoId == null) return;
    _terceirosAtualizarRecebidaMgLocal(documentoId, 'sim', '', recebedorMg || '');
    _terceirosRemoverLinhaDeTodasListas(documentoId);
    definirDestaqueLinhaTerceirosDoc(documentoId);
    abrirAbaTerceirosSeDiferente('pendentes-lancamento', true);
    try {
        await loadTerceirosPendentesLancamento();
        TERCEIROS_PEND_LANC_TBODY_IDS.forEach(function(tbodyId) {
            var tbody = document.getElementById(tbodyId);
            if (tbody) aplicarDestaqueLinhaTerceirosDoc(tbody);
        });
    } catch (e) {
        console.error(e);
    }
    try {
        void loadTerceirosRecebimentosMg();
        void loadTerceirosNotasEnviadasMg();
        void loadTerceirosPendenciasMg();
    } catch (e2) {
        console.error(e2);
    }
}

/** 8ª → Histórico: recebimento MG finalizado com Não + motivo ou carreta concluída. */
async function terceirosNavegarParaHistoricoAposRecebidaMg(documentoId, valorNorm, motivo) {
    if (documentoId == null) return;
    _terceirosAtualizarRecebidaMgLocal(documentoId, valorNorm || 'sim', motivo || '');
    _terceirosRemoverLinhaDeTodasListas(documentoId);
    definirDestaqueLinhaTerceirosDoc(documentoId);
    terceirosAplicarPainelAbaSomenteUi('historico');
    _terceirosInserirLinhaHistoricoLocal(documentoId);
    try {
        void loadTerceirosHistorico();
        void loadTerceirosRecebimentosMg();
        void loadTerceirosNotasEnviadasMg();
    } catch (e) {
        console.error(e);
    }
}

/**
 * Fluxo padrão após POST /status com sucesso: origem → destino → filtros → destaque → aba → detalhe.
 * Ordem: reload origem; definir destaque; reload destino; abrir aba sem duplicar fetch.
 * Não chama loadTerceirosDocumentoDetalhe aqui (evita cadeias reload + reentrada).
 * @returns {Promise<boolean>} true se este fluxo cobriu o caso (evitar refreshTerceirosViews).
 */
async function moverDocumentoFluxoTerceirosAposStatus(documentoId, campo, valor) {
    if (!isTerceirosFlagSim(valor)) return false;
    try {
        if (campo === 'nota_lancada') {
            return false;
        }
        if (campo === 'enviar_para_mg') {
            return false;
        }
        if (campo === 'carga_recebida_mg') {
            await loadTerceirosPendenciasMg();
            await loadTerceirosNotasEnviadasMg();
            await loadTerceirosNotasLancadas();
            definirDestaqueLinhaTerceirosDoc(documentoId);
            await loadTerceirosRecebimentosMg();
            await abrirAbaTerceirosSeDiferenteAsync('recebimentos-mg', false, true);
            return true;
        }
    } catch (e) {
        console.error(e);
    }
    return false;
}

/** Libera SSE e gráficos antes de sair do painel (descarrega a página mais rápido). */
function _prepararSaidaParaEntrada() {
    _pausarPainelLeve({ destruirGraficos: true });
}

function _pausarPainelLeve(opts) {
    opts = opts || {};
    try {
        if (_eventSource) {
            _eventSource.close();
            _eventSource = null;
        }
    } catch (e) {}
    if (typeof _estoqueSpPararTimer === 'function') _estoqueSpPararTimer();
    if (typeof _limparPendenciasConferenciaTimers === 'function') _limparPendenciasConferenciaTimers();
    try {
        if (typeof _timerPosBipagem !== 'undefined' && _timerPosBipagem) {
            clearTimeout(_timerPosBipagem);
            _timerPosBipagem = null;
        }
    } catch (e) {}
    try {
        if (typeof _ravexImportAbortarAtivo === 'function') _ravexImportAbortarAtivo();
    } catch (e) {}
    if (opts.destruirGraficos) {
        try {
            if (typeof destroyCharts === 'function') destroyCharts();
            if (typeof destroyPainelDevolucoesCharts === 'function') destroyPainelDevolucoesCharts();
            if (typeof destroyPainelTerceirosCharts === 'function') destroyPainelTerceirosCharts();
        } catch (e) {}
    }
}

function _pausarPainelParaHub() {
    _pausarPainelLeve({ destruirGraficos: true });
}

function _mostrarHubModulos() {
    var hub = document.getElementById('hub-modulos-overlay');
    if (!hub) {
        window.location.href = '/entrada';
        return;
    }
    hub.hidden = false;
    hub.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hub-modulos-aberto');
    var primeiro = hub.querySelector('[data-hub-modulo]');
    if (primeiro && primeiro.focus) primeiro.focus();
    setTimeout(function() {
        if (hub.hidden) return;
        _pausarPainelLeve({ destruirGraficos: false });
    }, 0);
}

function _ocultarHubModulos(opts) {
    opts = opts || {};
    var hub = document.getElementById('hub-modulos-overlay');
    if (!hub || hub.hidden) return;
    hub.hidden = true;
    hub.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('hub-modulos-aberto');
    if (opts.retomarStream !== false && typeof initEventosStream === 'function') {
        initEventosStream();
    }
}

function initHubModulosOverlay() {
    var hub = document.getElementById('hub-modulos-overlay');
    if (!hub || hub._hubInit) return;
    hub._hubInit = true;
    hub.querySelectorAll('[data-hub-modulo]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            var mod = btn.getAttribute('data-hub-modulo');
            if (!mod) return;
            _ocultarHubModulos({ retomarStream: false });
            if (mod !== 'terceiros' && typeof _limparTerceirosDocumentoNaSessao === 'function') {
                _limparTerceirosDocumentoNaSessao();
            }
            if (typeof window.controleMostrarModulo === 'function') {
                window.controleMostrarModulo(mod);
            } else {
                window.location.href = '/painel?modulo=' + encodeURIComponent(mod);
                return;
            }
            if (typeof initEventosStream === 'function') initEventosStream();
        });
    });
}

function _htmlBotoesAcaoConferencia(opts) {
    opts = opts || {};
    var codigoBarras = (opts.codigo_barras || '-').toString();
    if (codigoBarras === '-') {
        return {
            bipar: opts.sem_codigo_html || '',
            tirar: '',
            excluir: ''
        };
    }
    var cod = escapeHtml(codigoBarras);
    var prod = escapeHtml(opts.produto || '');
    var qtdBipada = parseInt(opts.quantidade_bipada, 10) || 0;
    var qtdFaltaParaBipar = Math.max(1, parseInt(opts.quantidade_falta, 10) || 0);
    var st = opts.btnStyleSec || 'padding: 4px 8px; font-size: 11px;';
    var tirar = qtdBipada > 0
        ? '<button type="button" class="btn btn-secondary" data-conf-acao="tirar-1" data-conf-codigo="' + cod + '" style="' + st + '" title="Remover 1 unidade bipada">➖ Tirar 1</button> '
          + '<button type="button" class="btn btn-secondary" data-conf-acao="tirar-tudo" data-conf-codigo="' + cod + '" style="' + st + '" title="Remover todas as unidades bipadas deste item">🗑️ Tirar tudo</button> '
        : '';
    var excluir = '<button type="button" class="btn btn-secondary" data-conf-acao="excluir" data-conf-codigo="' + cod + '" data-conf-produto="' + prod + '" style="' + st + ' color: #c62828;" title="Excluir item da conferência">🗑️ Excluir</button>';
    var bipar = '<button type="button" class="btn btn-primary" data-conf-acao="bipar" data-conf-codigo="' + cod + '" data-conf-produto="' + prod + '" data-conf-qtd-falta="' + qtdFaltaParaBipar + '" style="padding: 6px 12px; font-size: 12px;">📱 Bipar</button>';
    return { bipar: bipar, tirar: tirar, excluir: excluir };
}

function _abrirModalFlex(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'flex';
}

function initCadastroRapidoCodigoBarras() {
    function bind(btnId) {
        var btn = document.getElementById(btnId);
        if (!btn || btn._cadastroRapidoBound) return;
        btn._cadastroRapidoBound = true;
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var idV = window._getIdViagemAtivo && window._getIdViagemAtivo();
            if (!idV) {
                showMessage('Carregue a viagem (ID do roteiro) antes de cadastrar o código.', 'warning');
                return;
            }
            var cb = window._elBipagem('codigo-barras');
            if (cb && !(cb.value || '').trim()) {
                showMessage('Digite ou escaneie o código de barras primeiro.', 'warning');
                if (cb.focus) cb.focus();
                return;
            }
            document.getElementById('modal-produto-nao-cadastrado').style.display = 'none';
            void window._abrirModalCadastroItemFromBipagem();
        });
    }
    bind('btn-cadastrar-codigo-bipagem');
    bind('btn-dev-cadastrar-codigo-bipagem');
}

function initConferenciaTabelaAcoes() {
    function bind(tbodyId) {
        var tbody = document.getElementById(tbodyId);
        if (!tbody || tbody._confAcoesBound) return;
        tbody._confAcoesBound = true;
        tbody.addEventListener('mousedown', function(e) {
            if (e.target.closest('[data-conf-acao]')) {
                window._ignorarBlurBipagemConferencia = true;
                setTimeout(function() { window._ignorarBlurBipagemConferencia = false; }, 400);
            }
        }, { passive: true });
        tbody.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-conf-acao]');
            if (!btn || btn.disabled) return;
            e.preventDefault();
            e.stopPropagation();
            var acao = btn.getAttribute('data-conf-acao');
            var codigo = btn.getAttribute('data-conf-codigo') || '';
            var produto = btn.getAttribute('data-conf-produto') || '';
            var qtdFalta = parseInt(btn.getAttribute('data-conf-qtd-falta'), 10) || 1;
            if (acao === 'bipar') {
                biparItem(btn, codigo, produto, qtdFalta);
            } else if (acao === 'tirar-1') {
                tirarBipado(btn, codigo, 1);
            } else if (acao === 'tirar-tudo') {
                tirarBipado(btn, codigo, 'tudo');
            } else if (acao === 'excluir') {
                abrirModalExcluirItem(btn);
            }
        });
    }
    bind('tbody-conferencia');
    bind('dev-tbody-conferencia');
}

function initNavegacaoRapida() {
    var linkInicio = document.querySelector('.header-link-inicio');
    if (!linkInicio) return;
    var href = linkInicio.getAttribute('href') || '/entrada';
    var temHub = !!document.getElementById('hub-modulos-overlay');

    function prefetchEntrada() {
        if (temHub) return;
        try {
            if (document.querySelector('link[rel="prefetch"][href="' + href + '"]')) return;
            var prefetch = document.createElement('link');
            prefetch.rel = 'prefetch';
            prefetch.href = href;
            prefetch.as = 'document';
            document.head.appendChild(prefetch);
        } catch (e) {}
    }
    prefetchEntrada();

    function irParaEntrada(e) {
        if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return;
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (linkInicio._navegandoEntrada) return;
        linkInicio._navegandoEntrada = true;
        linkInicio.classList.add('header-link-inicio--saindo');
        if (temHub) {
            _mostrarHubModulos();
            linkInicio.classList.remove('header-link-inicio--saindo');
            linkInicio._navegandoEntrada = false;
            return;
        }
        _pausarPainelParaHub();
        window.location.assign(href);
    }

    linkInicio.addEventListener('mouseenter', prefetchEntrada, { passive: true });
    linkInicio.addEventListener('click', irParaEntrada);
    linkInicio.addEventListener('auxclick', function(e) {
        if (e.button === 1) return;
        irParaEntrada(e);
    });
    linkInicio.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            irParaEntrada(e);
        }
    });
}

function initModulos() {
    var carreg = document.getElementById('modulo-carregamento');
    var dev = document.getElementById('modulo-devolucoes');
    var ter = document.getElementById('modulo-terceiros');
    var est = document.getElementById('modulo-estoque-sp');
    var wms = document.getElementById('modulo-enderecamento-wms');
    if (!carreg) return;

    var botoes = document.querySelectorAll('.modulo-button');

    function mostrarModulo(id, opts) {
        opts = opts || {};
        var estoqueAba = opts.estoqueAba || null;
        carreg.hidden = id !== 'carregamento';
        if (dev) dev.hidden = id !== 'devolucoes';
        if (ter) ter.hidden = id !== 'terceiros';
        if (est) est.hidden = id !== 'estoque-sp';
        if (wms) wms.hidden = id !== 'enderecamento-wms';
        carreg.classList.toggle('modulo-area--ativo', id === 'carregamento');
        if (dev) dev.classList.toggle('modulo-area--ativo', id === 'devolucoes');
        if (ter) ter.classList.toggle('modulo-area--ativo', id === 'terceiros');
        if (est) est.classList.toggle('modulo-area--ativo', id === 'estoque-sp');
        if (wms) wms.classList.toggle('modulo-area--ativo', id === 'enderecamento-wms');
        botoes.forEach(function(b) {
            b.classList.toggle('active', b.getAttribute('data-modulo') === id);
        });
        var btnAtualizar = document.getElementById('btn-atualizar-aba');
        if (btnAtualizar) {
            btnAtualizar.style.display = id === 'carregamento' ? '' : 'none';
        }
        window._fluxoBipagemAtivo = id === 'devolucoes' ? 'devolucao' : 'carregamento';
        if (id !== 'estoque-sp') {
            _estoqueSpPararTimer();
        }
        if (id === 'carregamento') {
            var activeTab = document.querySelector('.tab-content.active');
            if (activeTab && activeTab.id) loadTabData(activeTab.id);
        } else if (id === 'devolucoes') {
            var painelDev = document.getElementById('devolucoes-panel-painel');
            if (painelDev && painelDev.classList.contains('devolucoes-panel-active')) {
                loadPainelDevolucoes();
            }
        } else if (id === 'estoque-sp') {
            _estoqueSpIniciarTempoReal();
            if (estoqueAba && typeof window._estoqueSpMostrarAba === 'function') {
                window._estoqueSpMostrarAba(estoqueAba);
            }
        } else if (id === 'enderecamento-wms') {
            if (typeof window._wmsIniciarModulo === 'function') {
                window._wmsIniciarModulo(opts.wmsTab);
            }
        } else if (id === 'terceiros') {
            void _terceirosGarantirPrefetchLista();
            var painelTer = document.getElementById('terceiros-panel-painel');
            if (painelTer && painelTer.classList.contains('devolucoes-panel-active')) {
                if (window._terceirosPainelUltimoData && !window._terceirosPainelUltimoData.erro) {
                    _agendarChartsPainelTerceiros();
                } else {
                    void loadPainelTerceiros();
                }
            } else {
                void refreshTerceirosViews({ usarCache: true });
            }
        }
    }

    botoes.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var mod = btn.getAttribute('data-modulo');
            if (!mod) return;
            if (mod !== 'terceiros') {
                _limparTerceirosDocumentoNaSessao();
            }
            mostrarModulo(mod);
        });
    });

    var params = new URLSearchParams(window.location.search);
    var modUrl = params.get('modulo');
    var abaUrl = params.get('aba');
    if (modUrl === 'enderecamento-wms') {
        mostrarModulo('enderecamento-wms', { wmsTab: abaUrl });
    } else if (modUrl && ['carregamento', 'devolucoes', 'terceiros', 'estoque-sp'].indexOf(modUrl) !== -1) {
        mostrarModulo(modUrl, { estoqueAba: abaUrl });
    }

    window.controleMostrarModulo = mostrarModulo;
}

function initDevolucoesTabs() {
    var botoes = document.querySelectorAll('.devolucoes-subtab[data-dev-tab]');
    var painel = document.getElementById('devolucoes-panel-painel');
    var conferencia = document.getElementById('devolucoes-panel-bipar');
    var extrato = document.getElementById('devolucoes-panel-extrato');
    var baixaRavex = document.getElementById('devolucoes-panel-baixa-ravex');
    var relatorios = document.getElementById('devolucoes-panel-relatorios');
    var divergencias = document.getElementById('devolucoes-panel-divergencias');
    if (!botoes.length || !painel || !conferencia || !extrato || !relatorios || !divergencias) return;

    function mostrarDevTab(tab) {
        botoes.forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-dev-tab') === tab);
        });
        painel.classList.toggle('devolucoes-panel-active', tab === 'painel');
        conferencia.classList.toggle('devolucoes-panel-active', tab === 'conferencia');
        extrato.classList.toggle('devolucoes-panel-active', tab === 'extrato');
        if (baixaRavex) baixaRavex.classList.toggle('devolucoes-panel-active', tab === 'baixa-ravex');
        relatorios.classList.toggle('devolucoes-panel-active', tab === 'relatorios');
        divergencias.classList.toggle('devolucoes-panel-active', tab === 'divergencias');
        if (tab === 'painel') loadPainelDevolucoes();
        if (tab === 'extrato') loadExtratoDevolucao();
        if (tab === 'baixa-ravex') loadBaixadosRavex('devolucao');
        if (tab === 'divergencias') loadDivergenciasDevolucao(false);
    }

    botoes.forEach(function(btn) {
        btn.addEventListener('click', function() {
            mostrarDevTab(btn.getAttribute('data-dev-tab') || 'painel');
        });
    });

    mostrarDevTab('painel');
}

window._devolucaoNfAtiva = null;
window._devConferenciaIdViagemAtiva = '';

function _devolucaoGetIdViagemAtivo() {
    var h = document.getElementById('dev-id-viagem-hidden');
    if (h && h.value.trim()) return h.value.trim();
    var inp = document.getElementById('dev-id-viagem');
    return inp ? inp.value.trim() : '';
}

function _devolucaoAplicarBloqueioBipagem(bloquear) {
    var wrap4 = document.getElementById('dev-conferencia-bloco-4-wrapper');
    var wrapForm = document.getElementById('dev-form-bipagem-container');
    [wrap4, wrapForm].forEach(function(el) {
        if (!el) return;
        el.classList.toggle('conferencia-blocos-bloqueado', !!bloquear);
    });
    var overlay4 = wrap4 && wrap4.querySelector('.conferencia-blocos-overlay');
    if (overlay4) {
        overlay4.innerHTML = bloquear
            ? '<span>Selecione a NF e o motivo, clique em <strong>Iniciar NF</strong> para bipar o retorno.</span>'
            : '';
    }
}

function _devolucaoAtualizarUiNfAtiva() {
    var nf = window._devolucaoNfAtiva;
    var hid = document.getElementById('dev-devolucao-nf-id');
    var banner = document.getElementById('dev-nf-ativa-banner');
    var txt = document.getElementById('dev-nf-ativa-texto');
    var btnIni = document.getElementById('dev-btn-iniciar-nf');
    var btnConc = document.getElementById('dev-btn-concluir-nf');
    var formNova = document.getElementById('dev-nf-form-nova');
    if (hid) hid.value = nf && nf.id ? String(nf.id) : '';
    if (banner) banner.style.display = nf && nf.id ? 'block' : 'none';
    if (txt && nf) {
        txt.textContent = 'NF ' + (nf.numero_nf || '-') + ' — ' + (nf.motivo_label || nf.motivo || '') + ' (em andamento)';
    }
    var emAndamento = nf && nf.status === 'em_andamento';
    if (btnIni) btnIni.style.display = emAndamento ? 'none' : '';
    if (btnConc) btnConc.style.display = emAndamento ? '' : 'none';
    if (formNova) formNova.style.display = emAndamento ? 'none' : '';
    _devolucaoAplicarBloqueioBipagem(!emAndamento);
}

function initDevolucaoNfFlow() {
    var btnIni = document.getElementById('dev-btn-iniciar-nf');
    var btnConc = document.getElementById('dev-btn-concluir-nf');
    if (btnIni) {
        btnIni.addEventListener('click', async function() {
            var idV = _devolucaoGetIdViagemAtivo();
            var numero = (document.getElementById('dev-numero-nf') && document.getElementById('dev-numero-nf').value || '').trim();
            var motivo = (document.getElementById('dev-motivo-devolucao') && document.getElementById('dev-motivo-devolucao').value || '').trim();
            var doca = (document.getElementById('dev-doca') && document.getElementById('dev-doca').value || '').trim();
            if (!idV) {
                showMessage('Busque o roteiro/viagem primeiro.', 'error');
                return;
            }
            if (!numero || !motivo) {
                showMessage('Informe o número da NF e o motivo da devolução.', 'error');
                return;
            }
            if (!doca) {
                showMessage('Selecione a doca.', 'error');
                return;
            }
            var resp = await fetchAPI('/devolucoes/notas', {
                method: 'POST',
                body: JSON.stringify({ id_viagem: idV, numero_nf: numero, motivo: motivo, doca: doca }),
            });
            if (!resp || !resp.success) {
                showMessage((resp && resp.erro) || 'Não foi possível iniciar a NF.', 'error');
                return;
            }
            window._devolucaoNfAtiva = resp.nota;
            _devolucaoAtualizarUiNfAtiva();
            showMessage('NF iniciada. Bipe os itens do retorno.', 'success');
            await carregarListaNfsDevolucao(idV);
            await loadConferenciaDevolucaoNf(resp.nota.id);
        });
    }
    if (btnConc) {
        btnConc.addEventListener('click', async function() {
            var nf = window._devolucaoNfAtiva;
            if (!nf || !nf.id) return;
            var resp = await fetchAPI('/devolucoes/notas/' + encodeURIComponent(nf.id) + '/concluir', { method: 'POST', body: '{}' });
            if (!resp || !resp.success) {
                showMessage((resp && resp.erro) || 'Erro ao concluir NF.', 'error');
                return;
            }
            showMessage('NF concluída com sucesso.', 'success');
            window._devolucaoNfAtiva = null;
            _devolucaoAtualizarUiNfAtiva();
            var idV = _devolucaoGetIdViagemAtivo();
            var tbody = document.getElementById('dev-tbody-conferencia');
            if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="loading">Selecione ou inicie outra NF para bipar.</td></tr>';
            var numInp = document.getElementById('dev-numero-nf');
            var motSel = document.getElementById('dev-motivo-devolucao');
            if (numInp) numInp.value = '';
            if (motSel) motSel.value = '';
            if (idV) await carregarListaNfsDevolucao(idV);
        });
    }
}

async function carregarListaNfsDevolucao(idViagem) {
    var tbody = document.getElementById('dev-tbody-nfs');
    if (!tbody || !idViagem) return;
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Carregando...</td></tr>';
    var resp = await fetchAPI('/devolucoes/notas?id_viagem=' + encodeURIComponent(idViagem));
    if (!resp || resp.erro) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Erro ao carregar NFs.</td></tr>';
        return;
    }
    var notas = resp.notas || [];
    if (!notas.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Nenhuma NF registrada ainda.</td></tr>';
        return;
    }
    tbody.innerHTML = notas.map(function(n) {
        var st = n.status === 'concluida' ? 'Concluída' : 'Em andamento';
        var btn = n.status === 'em_andamento'
            ? '<button type="button" class="btn btn-secondary btn-sm" data-dev-abrir-nf="' + n.id + '">Continuar</button>'
            : '—';
        return '<tr><td>' + escHtml(n.numero_nf) + '</td><td>' + escHtml(n.motivo_label || n.motivo) + '</td><td>' + escHtml(st) + '</td><td>' + escHtml(n.criado_em || '-') + '</td><td>' + btn + '</td></tr>';
    }).join('');
    tbody.querySelectorAll('[data-dev-abrir-nf]').forEach(function(btn) {
        btn.addEventListener('click', async function() {
            var nfId = parseInt(btn.getAttribute('data-dev-abrir-nf'), 10);
            var nota = notas.find(function(x) { return x.id === nfId; });
            if (!nota) return;
            window._devolucaoNfAtiva = nota;
            _devolucaoAtualizarUiNfAtiva();
            await loadConferenciaDevolucaoNf(nfId);
        });
    });
    var aberta = notas.find(function(n) { return n.status === 'em_andamento'; });
    if (aberta && !window._devolucaoNfAtiva) {
        window._devolucaoNfAtiva = aberta;
        _devolucaoAtualizarUiNfAtiva();
        await loadConferenciaDevolucaoNf(aberta.id);
    }
}

async function carregarContextoDevolucaoViagem(idViagem) {
    window._devConferenciaIdViagemAtiva = idViagem;
    var info = await fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/info');
    if (info && !info.erro) {
        var elR = document.getElementById('dev-display-id-roteiro');
        var elV = document.getElementById('dev-display-id-viagem');
        var elIdRota = document.getElementById('dev-viagem-identificador-rota');
        var elP = document.getElementById('dev-viagem-placa');
        var elM = document.getElementById('dev-viagem-motorista');
        var elD = document.getElementById('dev-data-expedicao');
        var hid = document.getElementById('dev-id-viagem-hidden');
        if (elR) elR.textContent = (info.id_roteiro && String(info.id_roteiro).trim()) || '-';
        if (elV) elV.textContent = (info.id_viagem && String(info.id_viagem).trim()) || idViagem;
        if (elIdRota) elIdRota.textContent = (info.identificador_rota && String(info.identificador_rota).trim()) || '-';
        if (elP) elP.value = (info.placa && String(info.placa).trim()) || '';
        if (elM) elM.value = (info.motorista && String(info.motorista).trim()) || '';
        if (elD) elD.textContent = (info.data_expedicao && String(info.data_expedicao).trim()) || '-';
        if (hid) hid.value = (info.id_viagem && String(info.id_viagem).trim()) || idViagem;
    }
    _habilitarBlocosDevolucao(true);
    await carregarListaNfsDevolucao((document.getElementById('dev-id-viagem-hidden') && document.getElementById('dev-id-viagem-hidden').value.trim()) || idViagem);
    _devolucaoAtualizarUiNfAtiva();
}

function _habilitarBlocosDevolucao(sim) {
    var wrapForm = document.getElementById('dev-form-bipagem-container');
    var wrap4 = document.getElementById('dev-conferencia-bloco-4-wrapper');
    [wrapForm, wrap4].forEach(function(el) {
        if (!el) return;
        if (sim) {
            el.classList.remove('conferencia-blocos-bloqueado');
        }
    });
    var titulo = document.getElementById('dev-titulo-lista-wrapper');
    var tabela = document.getElementById('dev-tabela-conferencia-container');
    if (titulo) titulo.style.display = sim ? 'flex' : 'none';
    if (tabela) tabela.style.display = sim ? 'block' : 'none';
}

async function loadConferenciaDevolucaoNf(nfId) {
    var idViagem = _devolucaoGetIdViagemAtivo();
    if (!idViagem || !nfId) return;
    var conferencia = await _modFetchGet('/devolucoes/conferencia/' + encodeURIComponent(idViagem) + '?devolucao_nf_id=' + encodeURIComponent(nfId), 90000);
    if (!conferencia || conferencia.erro) {
        showMessage(_modErroMsg(conferencia, 'Erro ao carregar itens da NF.'), 'error');
        return;
    }
    if (conferencia.placa !== undefined) {
        var elP = document.getElementById('dev-viagem-placa');
        var elM = document.getElementById('dev-viagem-motorista');
        if (elP && conferencia.placa) elP.value = conferencia.placa;
        if (elM && conferencia.motorista) elM.value = conferencia.motorista;
    }
    var lista = conferencia.lista || [];
    await loadConferencia(idViagem, { fluxo: 'devolucao', forcar: true, _listaOverride: lista, _modoDevolucaoNf: true });
}

window._estoqueSpTimer = null;
window._estoqueSpAbaAtiva = 'estoque-atual';

function _estoqueSpPararTimer() {
    if (window._estoqueSpTimer) {
        window.clearInterval(window._estoqueSpTimer);
        window._estoqueSpTimer = null;
    }
}

function _estoqueSpIniciarTempoReal() {
    _estoqueSpPararTimer();
    window._estoqueSpAbaAtiva = 'estoque-atual';
    if (typeof _estoqueSpMostrarAba === 'function') {
        _estoqueSpMostrarAba('estoque-atual');
    }
    loadEstoqueSpTempoReal();
    window._estoqueSpTimer = window.setInterval(function() {
        if (window._estoqueSpAbaAtiva === 'estoque-atual') {
            loadEstoqueSpTempoReal(true);
        }
    }, 30000);
}

function initEstoqueSp() {
    var botoes = document.querySelectorAll('.estoque-sp-subtab[data-estoque-tab]');
    var pAtual = document.getElementById('estoque-sp-panel-estoque-atual');
    var pSaida = document.getElementById('estoque-sp-panel-saida');
    var pDev = document.getElementById('estoque-sp-panel-entrada-devolucao');
    var pTer = document.getElementById('estoque-sp-panel-entrada-terceiros');
    var filtrosData = document.getElementById('estoque-sp-filtros-data');
    var lblAtualizado = document.getElementById('estoque-sp-atualizado-em');
    if (!botoes.length) return;

    function mostrar(tab) {
        tab = tab || 'estoque-atual';
        window._estoqueSpAbaAtiva = tab;
        botoes.forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-estoque-tab') === tab); });
        if (pAtual) pAtual.classList.toggle('devolucoes-panel-active', tab === 'estoque-atual');
        if (pSaida) pSaida.classList.toggle('devolucoes-panel-active', tab === 'saida');
        if (pDev) pDev.classList.toggle('devolucoes-panel-active', tab === 'entrada-devolucao');
        if (pTer) pTer.classList.toggle('devolucoes-panel-active', tab === 'entrada-terceiros');
        var ehAtual = tab === 'estoque-atual';
        if (filtrosData) filtrosData.style.display = ehAtual ? 'none' : 'flex';
        if (lblAtualizado) lblAtualizado.style.display = ehAtual ? 'block' : 'none';
        if (ehAtual) {
            loadEstoqueSpTempoReal();
        } else {
            loadEstoqueSpResumo();
        }
    }
    window._estoqueSpMostrarAba = mostrar;

    botoes.forEach(function(btn) {
        btn.addEventListener('click', function() {
            mostrar(btn.getAttribute('data-estoque-tab') || 'estoque-atual');
        });
    });
    var btnAt = document.getElementById('btn-estoque-sp-atualizar');
    if (btnAt) btnAt.addEventListener('click', function() { loadEstoqueSpResumo(); });
    var params = new URLSearchParams(window.location.search);
    var abaInicial = params.get('aba') || '';
    var abasValidas = ['estoque-atual', 'saida', 'entrada-devolucao', 'entrada-terceiros'];
    if (params.get('modulo') === 'estoque-sp' && abasValidas.indexOf(abaInicial) === -1) abaInicial = 'estoque-atual';
    if (abasValidas.indexOf(abaInicial) === -1) abaInicial = 'estoque-atual';
    if (params.get('modulo') !== 'enderecamento-wms') {
        mostrar(abaInicial);
    }
}

function _estoqueSpFmtNum(n) {
    var v = Number(n) || 0;
    if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
    return v.toFixed(2).replace(/\.?0+$/, '');
}

async function loadEstoqueSpTempoReal(silencioso) {
    var tbody = document.getElementById('estoque-sp-tbody-atual');
    if (!silencioso && tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Carregando estoque atual...</td></tr>';
    }
    try {
        var data = await _modFetchGet('/estoque-sp/tempo-real', 60000);
        if (!data || data.erro) {
            if (!silencioso) {
                showMessage(_modErroMsg(data, 'Erro ao carregar estoque em tempo real.'), 'error');
            }
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading" style="color:#c62828;">' + escHtml(_modErroMsg(data, 'Erro ao carregar.')) + '</td></tr>';
            return;
        }
    var ea = data.estoque_atual || {};
    var elL = document.getElementById('estoque-sp-atual-linhas');
    var elS = document.getElementById('estoque-sp-atual-saldo');
    var elSa = document.getElementById('estoque-sp-atual-saida');
    var elE = document.getElementById('estoque-sp-atual-entradas');
    var lbl = document.getElementById('estoque-sp-atualizado-em');
    if (elL) elL.textContent = String(ea.total_linhas || 0);
    if (elS) elS.textContent = _estoqueSpFmtNum(ea.total_saldo || 0);
    if (elSa) elSa.textContent = _estoqueSpFmtNum(ea.total_saida || 0);
    var ent = (ea.total_entrada_devolucao || 0) + (ea.total_entrada_terceiros || 0);
    if (elE) elE.textContent = _estoqueSpFmtNum(ent);
    if (lbl) {
        lbl.textContent = 'Atualizado em: ' + (data.atualizado_em || '—') + ' · próxima atualização em ~30s';
        lbl.style.display = 'block';
    }
    if (!tbody) return;
    var itens = ea.itens || [];
    if (!itens.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Nenhum movimento registrado ainda.</td></tr>';
        return;
    }
    tbody.innerHTML = itens.map(function(it) {
        var saldo = Number(it.saldo) || 0;
        var cls = saldo < 0 ? ' style="color:#c62828;font-weight:bold;"' : (saldo > 0 ? ' style="color:#2e7d32;font-weight:bold;"' : '');
        return '<tr><td>' + escHtml(it.codigo_produto || '-') + '</td><td>' + escHtml(it.produto || '-') + '</td><td>' + escHtml(it.codigo_barras || '-') + '</td><td>' + escHtml(_estoqueSpFmtNum(it.qtd_saida)) + '</td><td>' + escHtml(_estoqueSpFmtNum(it.qtd_entrada_devolucao)) + '</td><td>' + escHtml(_estoqueSpFmtNum(it.qtd_entrada_terceiros)) + '</td><td' + cls + '>' + escHtml(_estoqueSpFmtNum(saldo)) + '</td></tr>';
    }).join('');
    } catch (e) {
        if (!silencioso && tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading" style="color:#c62828;">' + escHtml((e && e.message) || 'Erro ao carregar estoque.') + '</td></tr>';
        }
    }
}

async function loadEstoqueSpResumo() {
    var tbIds = ['estoque-sp-tbody-saida', 'estoque-sp-tbody-dev', 'estoque-sp-tbody-ter'];
    tbIds.forEach(function(id) {
        var tb = document.getElementById(id);
        if (tb) tb.innerHTML = '<tr><td colspan="5" class="loading">Carregando...</td></tr>';
    });
    var di = document.getElementById('estoque-sp-data-inicio');
    var df = document.getElementById('estoque-sp-data-fim');
    var q = [];
    if (di && di.value) q.push('data_inicio=' + encodeURIComponent(di.value));
    if (df && df.value) q.push('data_fim=' + encodeURIComponent(df.value));
    var url = '/estoque-sp/resumo' + (q.length ? '?' + q.join('&') : '');
    try {
        var data = await _modFetchGet(url, 60000);
        if (!data || data.erro) {
            showMessage(_modErroMsg(data, 'Erro ao carregar Estoque SP.'), 'error');
            tbIds.forEach(function(id) {
                var tb = document.getElementById(id);
                if (tb) tb.innerHTML = '<tr><td colspan="5" class="loading" style="color:#c62828;">' + escHtml(_modErroMsg(data, 'Erro ao carregar.')) + '</td></tr>';
            });
            return;
        }
    function paint(sec, tbodyId, linhasId, qtdId) {
        var secData = data[sec];
        if (!secData) return;
        var elL = document.getElementById(linhasId);
        var elQ = document.getElementById(qtdId);
        if (elL) elL.textContent = String(secData.total_linhas || 0);
        if (elQ) elQ.textContent = String(secData.total_quantidade || 0);
        var tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        var itens = secData.itens || [];
        if (!itens.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">Nenhum registro.</td></tr>';
            return;
        }
        tbody.innerHTML = itens.map(function(it) {
            return '<tr><td>' + escHtml(it.codigo_produto || '-') + '</td><td>' + escHtml(it.produto || '-') + '</td><td>' + escHtml(it.codigo_barras || '-') + '</td><td>' + escHtml(it.quantidade) + '</td><td>' + escHtml(it.registros || 0) + '</td></tr>';
        }).join('');
    }
    paint('saida', 'estoque-sp-tbody-saida', 'estoque-sp-saida-linhas', 'estoque-sp-saida-qtd');
    paint('entrada_devolucao', 'estoque-sp-tbody-dev', 'estoque-sp-dev-linhas', 'estoque-sp-dev-qtd');
    paint('entrada_terceiros', 'estoque-sp-tbody-ter', 'estoque-sp-ter-linhas', 'estoque-sp-ter-qtd');
    } catch (e) {
        showMessage('Erro ao carregar Estoque SP: ' + ((e && e.message) || 'tente novamente.'), 'error');
        tbIds.forEach(function(id) {
            var tb = document.getElementById(id);
            if (tb) tb.innerHTML = '<tr><td colspan="5" class="loading" style="color:#c62828;">' + escHtml((e && e.message) || 'Erro ao carregar.') + '</td></tr>';
        });
    }
}

function _wmsErroMsg(data, fallback) {
    return _modErroMsg(data, fallback || 'Erro ao carregar dados WMS.');
}

async function _wmsFetchGet(path, timeoutMs) {
    return _modFetchGet(path, timeoutMs || 45000);
}

function _wmsSetTbody(id, cols, html) {
    var tb = document.getElementById(id);
    if (tb) tb.innerHTML = '<tr><td colspan="' + cols + '">' + html + '</td></tr>';
}

window._wmsRelatorioUltimo = null;

function _wmsFmtDuracaoMin(min) {
    if (min == null || min === '' || isNaN(min)) return '—';
    min = parseInt(min, 10);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    var m = min % 60;
    return h + ' h ' + m + ' min';
}

function _wmsLabelEventoHistorico(tipo) {
    var map = {
        palete_criado: 'Palete vinculado',
        produto_bipado: 'Produto bipado',
        movimentacao: 'Movimentação / armazenagem',
        controle_palete_entrada: 'Entrada palete',
        controle_palete_saida: 'Saída palete',
        controle_palete_retorno: 'Retorno palete'
    };
    return map[tipo] || tipo || '—';
}

var _WMS_CTRL_MOTIVO_LABELS = {
    expedicao: 'Expedição', transferencia: 'Transferência', auditoria: 'Auditoria',
    manutencao: 'Manutenção', outro: 'Outro', nao_informado: 'Não informado',
    retorno_expedicao: 'Retorno expedição', retorno_transferencia: 'Retorno transferência',
    retorno_auditoria: 'Retorno auditoria', reentrada: 'Reentrada', retorno: 'Retorno'
};

function _wmsLabelMotivoPalete(m) {
    return _WMS_CTRL_MOTIVO_LABELS[m] || m || '—';
}

function _wmsLabelTipoControlePalete(t) {
    var map = { entrada: 'Entrada', saida: 'Saída', retorno: 'Retorno' };
    return map[t] || t || '—';
}

window._wmsControlePaleteAtual = null;

function _wmsPaintControlePaleteDetalhe(data) {
    window._wmsControlePaleteAtual = data;
    var box = document.getElementById('wms-ctrl-palete-detalhe');
    var acoes = document.getElementById('wms-ctrl-acoes');
    var formSaida = document.getElementById('wms-ctrl-form-saida');
    var formRetorno = document.getElementById('wms-ctrl-form-retorno');
    var tbHist = document.getElementById('wms-tbody-ctrl-historico');
    if (!box) return;
    var pal = data.palete || {};
    var fora = !!data.fora_armazem;
    var saidaAberta = data.saida_aberta || null;
    var statusCor = fora ? '#e65100' : '#2e7d32';
    var html = '<h4 style="margin:0 0 10px 0;">Palete <strong>' + escHtml(pal.etiqueta || '—') + '</strong></h4>';
    html += '<div class="extrato-resumo-grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">';
    html += '<div><span class="extrato-resumo-label">Status:</span> <strong style="color:' + statusCor + ';">' + escHtml(pal.status || '—') + '</strong></div>';
    html += '<div><span class="extrato-resumo-label">NF:</span> ' + escHtml(pal.numero_nf || '—') + '</div>';
    html += '<div><span class="extrato-resumo-label">Fornecedor:</span> ' + escHtml(pal.fornecedor || '—') + '</div>';
    html += '<div><span class="extrato-resumo-label">Endereço:</span> ' + escHtml(pal.codigo_endereco || '—') + '</div>';
    if (fora) html += '<div style="grid-column:1/-1;color:#e65100;"><strong>⚠ Palete fora do armazém</strong>';
    if (saidaAberta) {
        html += ' — saída em ' + escHtml(formatarDataHoraPtBR(saidaAberta.criado_em));
        html += ' · ' + escHtml(_wmsLabelMotivoPalete(saidaAberta.motivo));
        if (saidaAberta.destino_externo) html += ' → ' + escHtml(saidaAberta.destino_externo);
        html += '</div>';
    } else if (fora) html += '</div>';
    html += '</div>';
    var itens = data.itens || [];
    if (itens.length) {
        html += '<p style="margin:10px 0 4px 0;font-size:12px;"><strong>Itens no palete:</strong> ';
        html += itens.map(function(it) {
            return escHtml(it.sku) + ' (' + escHtml(it.quantidade_caixas) + ' cx)';
        }).join(' · ');
        html += '</p>';
    }
    box.innerHTML = html;
    box.style.display = 'block';
    if (acoes) acoes.style.display = 'block';
    if (formSaida) formSaida.style.display = (!fora && !saidaAberta) ? 'block' : 'none';
    if (formRetorno) formRetorno.style.display = (fora || saidaAberta) ? 'block' : 'none';
    if (tbHist) {
        var hist = data.historico || [];
        if (!hist.length) {
            tbHist.innerHTML = '<tr><td colspan="7" class="loading">Sem registros de entrada/saída.</td></tr>';
        } else {
            tbHist.innerHTML = hist.map(function(h) {
                return '<tr><td>' + escHtml(formatarDataHoraPtBR(h.criado_em)) + '</td>'
                    + '<td><strong>' + escHtml(_wmsLabelTipoControlePalete(h.tipo)) + '</strong></td>'
                    + '<td>' + escHtml(h.subtipo || '—') + '</td>'
                    + '<td>' + escHtml(_wmsLabelMotivoPalete(h.motivo)) + '</td>'
                    + '<td>' + escHtml(h.codigo_endereco || '—') + '</td>'
                    + '<td>' + escHtml(h.destino_externo || '—') + '</td>'
                    + '<td>' + escHtml(h.criado_por || '—') + '</td></tr>';
            }).join('');
        }
    }
}

async function loadWmsControlePaleteConsulta() {
    var etq = (document.getElementById('wms-ctrl-etiqueta') || {}).value || '';
    etq = String(etq).trim();
    if (!etq) {
        showMessage('Bipe ou informe a etiqueta do palete (22 caracteres).', 'warning');
        return;
    }
    var tbHist = document.getElementById('wms-tbody-ctrl-historico');
    if (tbHist) tbHist.innerHTML = '<tr><td colspan="7" class="loading">Consultando...</td></tr>';
    try {
        var data = await _wmsFetchGet('/wms/paletes/controle?etiqueta=' + encodeURIComponent(etq), 45000);
        if (!data || data.erro) {
            showMessage(_modErroMsg(data, 'Palete não encontrado.'), 'error');
            if (tbHist) tbHist.innerHTML = '<tr><td colspan="7" class="loading" style="color:#c62828;">' + escHtml(_modErroMsg(data, 'Não encontrado.')) + '</td></tr>';
            return;
        }
        _wmsPaintControlePaleteDetalhe(data);
    } catch (e) {
        showMessage((e && e.message) || 'Erro ao consultar palete.', 'error');
        if (tbHist) tbHist.innerHTML = '<tr><td colspan="7" class="loading" style="color:#c62828;">Erro.</td></tr>';
    }
}

async function loadWmsControlePaletesFora() {
    var tb = document.getElementById('wms-tbody-ctrl-fora');
    var cnt = document.getElementById('wms-ctrl-fora-contagem');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="9" class="loading">Carregando...</td></tr>';
    try {
        var data = await _wmsFetchGet('/wms/paletes/controle?lista=fora', 45000);
        var lista = (data && data.paletes_fora) || [];
        if (cnt) cnt.textContent = '(' + lista.length + ')';
        if (!lista.length) {
            tb.innerHTML = '<tr><td colspan="9" class="loading">Nenhum palete fora do armazém no momento.</td></tr>';
            return;
        }
        tb.innerHTML = lista.map(function(p) {
            return '<tr><td><strong>' + escHtml(p.etiqueta) + '</strong></td>'
                + '<td>' + escHtml(p.status) + '</td><td>' + escHtml(p.numero_nf || '—') + '</td>'
                + '<td>' + escHtml(p.ultimo_endereco || '—') + '</td>'
                + '<td>' + escHtml(formatarDataHoraPtBR(p.saida_em)) + '</td>'
                + '<td>' + escHtml(_wmsLabelMotivoPalete(p.motivo_saida)) + '</td>'
                + '<td>' + escHtml(p.destino_externo || '—') + '</td>'
                + '<td>' + escHtml(p.operador_saida || '—') + '</td>'
                + '<td><button type="button" class="btn btn-secondary btn-sm wms-ctrl-abrir-etq" data-etq="' + escHtml(p.etiqueta) + '">Abrir</button></td></tr>';
        }).join('');
        tb.querySelectorAll('.wms-ctrl-abrir-etq').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var inp = document.getElementById('wms-ctrl-etiqueta');
                if (inp) inp.value = btn.getAttribute('data-etq') || '';
                loadWmsControlePaleteConsulta();
            });
        });
    } catch (e) {
        tb.innerHTML = '<tr><td colspan="9" class="loading" style="color:#c62828;">' + escHtml((e && e.message) || 'Erro.') + '</td></tr>';
    }
}

async function wmsRegistrarSaidaPalete() {
    var cur = window._wmsControlePaleteAtual;
    if (!cur || !cur.palete || !cur.palete.id) {
        showMessage('Consulte um palete antes de registrar a saída.', 'warning');
        return;
    }
    if (!confirm('Confirmar saída do palete ' + (cur.palete.etiqueta || '') + ' do armazém?')) return;
    var motivo = (document.getElementById('wms-ctrl-motivo-saida') || {}).value || 'nao_informado';
    var destino = (document.getElementById('wms-ctrl-destino-saida') || {}).value || '';
    var obs = (document.getElementById('wms-ctrl-obs-saida') || {}).value || '';
    var data = await fetchAPI('/wms/paletes/controle', {
        method: 'POST',
        body: JSON.stringify({
            acao: 'saida',
            palete_id: cur.palete.id,
            motivo: motivo,
            destino_externo: destino,
            observacao: obs
        })
    });
    if (!data || data.erro) {
        showMessage(_modErroMsg(data, 'Não foi possível registrar a saída.'), 'error');
        return;
    }
    showMessage('Saída registrada. Palete marcado como fora do armazém.', 'success');
    _wmsPaintControlePaleteDetalhe(data);
    loadWmsControlePaletesFora();
    var elF = document.getElementById('wms-stat-pal-fora');
    if (elF) elF.textContent = String((parseInt(elF.textContent, 10) || 0) + 1);
}

async function wmsRegistrarRetornoPalete() {
    var cur = window._wmsControlePaleteAtual;
    if (!cur || !cur.palete || !cur.palete.id) {
        showMessage('Consulte um palete antes de registrar o retorno.', 'warning');
        return;
    }
    if (!confirm('Confirmar retorno do palete ' + (cur.palete.etiqueta || '') + '?')) return;
    var motivo = (document.getElementById('wms-ctrl-motivo-retorno') || {}).value || 'retorno';
    var end = (document.getElementById('wms-ctrl-endereco-retorno') || {}).value || '';
    var obs = (document.getElementById('wms-ctrl-obs-retorno') || {}).value || '';
    var data = await fetchAPI('/wms/paletes/controle', {
        method: 'POST',
        body: JSON.stringify({
            acao: 'retorno',
            palete_id: cur.palete.id,
            motivo: motivo,
            codigo_endereco: end,
            observacao: obs
        })
    });
    if (!data || data.erro) {
        showMessage(_modErroMsg(data, 'Não foi possível registrar o retorno.'), 'error');
        return;
    }
    showMessage(end.trim() ? 'Retorno registrado e palete rearmazenado.' : 'Retorno registrado — palete em conferência.', 'success');
    _wmsPaintControlePaleteDetalhe(data);
    loadWmsControlePaletesFora();
    var elF = document.getElementById('wms-stat-pal-fora');
    if (elF) {
        var n = (parseInt(elF.textContent, 10) || 1) - 1;
        elF.textContent = String(Math.max(0, n));
    }
}

function loadWmsControlePaletesAba() {
    loadWmsControlePaletesFora();
    var inp = document.getElementById('wms-ctrl-etiqueta');
    if (inp && !inp.dataset.bound) {
        inp.dataset.bound = '1';
        inp.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); loadWmsControlePaleteConsulta(); }
        });
    }
}

function wmsInitHistoricoNfAba() {
    var nfIn = document.getElementById('wms-hist-nf');
    if (nfIn && !nfIn.dataset.bound) {
        nfIn.dataset.bound = '1';
        nfIn.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); loadWmsHistoricoNf(); }
        });
    }
    var recNf = document.getElementById('wms-rec-nf');
    if (nfIn && recNf && String(recNf.value || '').trim() && !String(nfIn.value || '').trim()) {
        nfIn.value = recNf.value.trim();
    }
}

function wmsInitRelatoriosAba() {
    var di = document.getElementById('wms-rel-data-inicio');
    var df = document.getElementById('wms-rel-data-fim');
    if (!di || di.dataset.inited) return;
    di.dataset.inited = '1';
    var hoje = new Date();
    var ini = new Date(hoje);
    ini.setDate(ini.getDate() - 30);
    var fmt = function(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    if (!di.value) di.value = fmt(ini);
    if (!df.value) df.value = fmt(hoje);
}

async function loadWmsHistoricoNf() {
    var box = document.getElementById('wms-historico-conteudo');
    if (!box) return;
    var nf = (document.getElementById('wms-hist-nf') || {}).value || '';
    var rid = (document.getElementById('wms-hist-rec-id') || {}).value || '';
    if (!String(nf).trim() && !String(rid).trim()) {
        showMessage('Informe o número da NF ou o ID do recebimento WMS.', 'warning');
        return;
    }
    box.innerHTML = '<p class="loading">Carregando histórico...</p>';
    var q = [];
    if (String(nf).trim()) q.push('numero_nf=' + encodeURIComponent(String(nf).trim()));
    if (String(rid).trim()) q.push('recebimento_id=' + encodeURIComponent(String(rid).trim()));
    try {
        var data = await _wmsFetchGet('/wms/historico-nf?' + q.join('&'), 60000);
        if (!data || data.erro) {
            box.innerHTML = '<p class="loading" style="color:#c62828;">' + escHtml(_modErroMsg(data, 'Histórico não encontrado.')) + '</p>';
            return;
        }
        _wmsPaintHistoricoNf(box, data);
    } catch (e) {
        box.innerHTML = '<p class="loading" style="color:#c62828;">' + escHtml((e && e.message) || 'Erro ao carregar histórico.') + '</p>';
    }
}

function _wmsPaintHistoricoNf(box, data) {
    var rec = data.recebimento || {};
    var per = data.periodo || {};
    var tot = data.totais || {};
    var ter = data.terceiros || {};
    var html = '';
    html += '<div class="extrato-resumo-box" style="margin-bottom:14px;">';
    html += '<h4 style="margin:0 0 10px 0;color:#1976D2;">NF ' + escHtml(rec.numero_nf || '—') + ' · Recebimento WMS #' + escHtml(rec.id || '—') + '</h4>';
    html += '<div class="extrato-resumo-grid">';
    html += '<section class="extrato-resumo-grupo"><h4 class="extrato-resumo-grupo-titulo">Documento</h4>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Fornecedor:</span> ' + escHtml(rec.fornecedor || '—') + '</div>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Placa:</span> ' + escHtml(rec.placa || '—') + '</div>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Status WMS:</span> <strong>' + escHtml(rec.status || '—') + '</strong></div>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Origem:</span> ' + escHtml(rec.origem || '—') + '</div>';
    if (ter.motorista) html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Motorista:</span> ' + escHtml(ter.motorista) + '</div>';
    html += '</section>';
    html += '<section class="extrato-resumo-grupo"><h4 class="extrato-resumo-grupo-titulo">Bipagem</h4>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Início:</span> <strong>' + escHtml(formatarDataHoraPtBR(per.inicio_bipagem)) + '</strong></div>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Fim:</span> <strong>' + escHtml(formatarDataHoraPtBR(per.fim_bipagem)) + '</strong></div>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Duração:</span> ' + escHtml(_wmsFmtDuracaoMin(per.duracao_minutos)) + '</div>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Operadores:</span> ' + escHtml((per.operadores || []).join(', ') || per.criado_por || '—') + '</div>';
    html += '</section>';
    html += '<section class="extrato-resumo-grupo"><h4 class="extrato-resumo-grupo-titulo">Totais</h4>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Paletes:</span> ' + escHtml(tot.paletes) + '</div>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Linhas bipadas:</span> ' + escHtml(tot.linhas_bipagem) + '</div>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">SKUs:</span> ' + escHtml(tot.skus_unicos) + '</div>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Caixas:</span> <strong>' + escHtml(tot.caixas_bipadas) + '</strong></div>';
    html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Movimentações:</span> ' + escHtml(tot.movimentacoes) + '</div>';
    html += '</section></div></div>';

    var itensNf = data.itens_nf || [];
    if (itensNf.length) {
        html += '<h4 style="margin:14px 0 8px 0;">Conferência NF × WMS</h4>';
        html += '<div class="table-container"><table class="data-table"><thead><tr><th>Item</th><th>SKU</th><th>Descrição</th><th>Qtd NF</th><th>Qtd WMS</th><th>Pendente</th><th>Status</th><th>EAN</th></tr></thead><tbody>';
        html += itensNf.map(function(it) {
            return '<tr><td>' + escHtml(it.n_item) + '</td><td><strong>' + escHtml(it.sku) + '</strong></td><td>' + escHtml(it.descricao) + '</td>'
                + '<td>' + escHtml(it.quantidade_xml) + '</td><td><strong>' + escHtml(it.quantidade_wms) + '</strong></td>'
                + '<td>' + escHtml(it.pendente_wms) + '</td><td>' + escHtml(it.status_wms) + '</td><td>' + escHtml(it.codigo_ean || '') + '</td></tr>';
        }).join('');
        html += '</tbody></table></div>';
    }

    var bipados = data.itens_bipados || [];
    html += '<h4 style="margin:14px 0 8px 0;">Tudo que foi bipado</h4>';
    if (!bipados.length) {
        html += '<p class="info-text">Nenhum item bipado neste recebimento.</p>';
    } else {
        html += '<div class="table-container"><table class="data-table"><thead><tr><th>Data/hora</th><th>SKU</th><th>Descrição</th><th>Lote</th><th>Produção</th><th>Validade</th><th>Cx</th><th>Palete (22)</th><th>Status palete</th></tr></thead><tbody>';
        html += bipados.map(function(it) {
            return '<tr><td>' + escHtml(formatarDataHoraPtBR(it.bipado_em)) + '</td><td><strong>' + escHtml(it.sku) + '</strong></td>'
                + '<td>' + escHtml(it.descricao) + '</td><td>' + escHtml(it.lote || '—') + '</td>'
                + '<td>' + escHtml(it.data_producao || '—') + '</td><td>' + escHtml(it.data_validade || '—') + '</td>'
                + '<td><strong>' + escHtml(it.quantidade_caixas) + '</strong></td>'
                + '<td>' + escHtml(it.palete_etiqueta || '—') + '</td><td>' + escHtml(it.palete_status || '—') + '</td></tr>';
        }).join('');
        html += '</tbody></table></div>';
    }

    var pals = data.paletes || [];
    if (pals.length) {
        html += '<h4 style="margin:14px 0 8px 0;">Paletes</h4>';
        html += '<div class="table-container"><table class="data-table"><thead><tr><th>Etiqueta</th><th>Status</th><th>Endereço</th><th>Estado</th><th>Criado em</th><th>Atualizado</th><th>Operador</th></tr></thead><tbody>';
        html += pals.map(function(p) {
            return '<tr><td><strong>' + escHtml(p.etiqueta) + '</strong></td><td>' + escHtml(p.status) + '</td>'
                + '<td>' + escHtml(p.endereco || '—') + '</td><td>' + escHtml(p.estado_fisico || '—') + '</td>'
                + '<td>' + escHtml(formatarDataHoraPtBR(p.criado_em)) + '</td>'
                + '<td>' + escHtml(formatarDataHoraPtBR(p.atualizado_em)) + '</td>'
                + '<td>' + escHtml(p.criado_por || '—') + '</td></tr>';
        }).join('');
        html += '</tbody></table></div>';
    }

    var linha = data.linha_do_tempo || [];
    html += '<h4 style="margin:14px 0 8px 0;">Linha do tempo</h4>';
    if (!linha.length) {
        html += '<p class="info-text">Sem eventos registrados.</p>';
    } else {
        html += '<div class="table-container"><table class="data-table"><thead><tr><th>Data/hora</th><th>Evento</th><th>Descrição</th><th>Detalhe</th><th>Usuário</th></tr></thead><tbody>';
        html += linha.map(function(ev) {
            return '<tr><td>' + escHtml(formatarDataHoraPtBR(ev.quando)) + '</td><td>' + escHtml(_wmsLabelEventoHistorico(ev.tipo)) + '</td>'
                + '<td>' + escHtml(ev.descricao) + '</td><td>' + escHtml(ev.detalhe || '') + '</td>'
                + '<td>' + escHtml(ev.usuario || '—') + '</td></tr>';
        }).join('');
        html += '</tbody></table></div>';
    }
    box.innerHTML = html;
}

var _WMS_REL_COL_LABELS = {
    id: 'ID', numero_nf: 'NF', fornecedor: 'Fornecedor', placa: 'Placa', status: 'Status', origem: 'Origem',
    qtd_paletes: 'Paletes', qtd_caixas: 'Caixas', criado_em: 'Criado em', atualizado_em: 'Atualizado', criado_por: 'Operador',
    bipado_em: 'Bipado em', palete: 'Palete', sku: 'SKU', descricao: 'Descrição', lote: 'Lote',
    data_producao: 'Produção', data_validade: 'Validade', quantidade_caixas: 'Caixas',
    etiqueta: 'Etiqueta', endereco: 'Endereço', bloqueio_tipo: 'Bloqueio',
    tipo: 'Tipo', origem_codigo: 'Origem', destino: 'Destino', destino_codigo: 'Destino',
    concluida_em: 'Concluída em', concluida_por: 'Concluído por', observacao: 'Observação',
    total_caixas: 'Total caixas', linhas_bipagem: 'Linhas', paletes: 'Paletes',
    prod_mais_antiga: 'Prod. + antiga', validade_max: 'Val. máxima',
    operador: 'Operador', itens_bipados: 'Itens bipados', caixas: 'Caixas',
    camara: 'Câmara', descricao_cam: 'Descrição', total_posicoes: 'Total pos.', cadastradas: 'Cadastradas',
    ocupadas: 'Ocupadas', vazias: 'Vazias', ocupacao_pct: 'Ocupação %', qtd_bipada: 'Qtd bipada',
    subtipo: 'Subtipo', motivo: 'Motivo', destino_externo: 'Destino externo', codigo_endereco: 'Endereço',
    status_palete: 'Status palete', ultimo_endereco: 'Último endereço', saida_em: 'Saída em',
    motivo_saida: 'Motivo saída', operador_saida: 'Operador saída'
};

function _wmsRelColLabel(col) {
    return _WMS_REL_COL_LABELS[col] || col;
}

async function loadWmsRelatorio() {
    var tipo = (document.getElementById('wms-rel-tipo') || {}).value || 'recebimentos';
    var di = (document.getElementById('wms-rel-data-inicio') || {}).value || '';
    var df = (document.getElementById('wms-rel-data-fim') || {}).value || '';
    var thead = document.querySelector('#wms-tabela-relatorio thead');
    var tbody = document.getElementById('wms-tbody-relatorio');
    var titulo = document.getElementById('wms-relatorio-titulo');
    var contagem = document.getElementById('wms-relatorio-contagem');
    var btnCsv = document.getElementById('btn-wms-relatorio-csv');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td class="loading">Gerando relatório...</td></tr>';
    if (btnCsv) btnCsv.disabled = true;
    window._wmsRelatorioUltimo = null;
    var q = 'tipo=' + encodeURIComponent(tipo);
    if (di && tipo !== 'ocupacao' && tipo !== 'nfs_pendentes' && tipo !== 'paletes_fora') q += '&data_inicio=' + encodeURIComponent(di);
    if (df && tipo !== 'ocupacao' && tipo !== 'nfs_pendentes' && tipo !== 'paletes_fora') q += '&data_fim=' + encodeURIComponent(df);
    try {
        var data = await _wmsFetchGet('/wms/relatorios?' + q, 90000);
        if (!data || data.erro) {
            tbody.innerHTML = '<tr><td class="loading" style="color:#c62828;">' + escHtml(_modErroMsg(data, 'Erro ao gerar relatório.')) + '</td></tr>';
            return;
        }
        window._wmsRelatorioUltimo = data;
        var cols = data.colunas || [];
        var linhas = data.linhas || [];
        if (titulo) titulo.textContent = data.titulo || 'Relatório';
        if (contagem) contagem.textContent = linhas.length + ' linha(s).';
        if (thead) thead.innerHTML = '<tr>' + cols.map(function(c) { return '<th>' + escHtml(_wmsRelColLabel(c)) + '</th>'; }).join('') + '</tr>';
        if (!linhas.length) {
            tbody.innerHTML = '<tr><td colspan="' + Math.max(cols.length, 1) + '" class="loading">Nenhum registro no período.</td></tr>';
        } else {
            tbody.innerHTML = linhas.map(function(row) {
                return '<tr>' + cols.map(function(c) {
                    var v = row[c];
                    if (c.indexOf('_em') >= 0 || c === 'bipado_em') v = formatarDataHoraPtBR(v);
                    return '<td>' + escHtml(v != null && v !== '' ? v : '—') + '</td>';
                }).join('') + '</tr>';
            }).join('');
        }
        if (btnCsv) btnCsv.disabled = !linhas.length;
    } catch (e) {
        tbody.innerHTML = '<tr><td class="loading" style="color:#c62828;">' + escHtml((e && e.message) || 'Erro.') + '</td></tr>';
    }
}

function wmsExportarRelatorioCsv() {
    var data = window._wmsRelatorioUltimo;
    if (!data || !data.linhas || !data.linhas.length) return;
    var cols = data.colunas || [];
    var sep = ';';
    var linhas = [cols.map(function(c) { return _wmsRelColLabel(c); }).join(sep)];
    data.linhas.forEach(function(row) {
        linhas.push(cols.map(function(c) {
            var v = row[c];
            if (v == null) return '';
            var s = String(v).replace(/"/g, '""');
            if (s.indexOf(sep) >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) s = '"' + s + '"';
            return s;
        }).join(sep));
    });
    var blob = new Blob(['\ufeff' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wms-' + (data.tipo || 'relatorio') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}

function _wmsMostrarSubtab(tab) {
    tab = tab || 'painel';
    document.querySelectorAll('.wms-subtab[data-wms-tab]').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-wms-tab') === tab);
    });
    document.querySelectorAll('.wms-inner-panel').forEach(function(p) {
        var id = p.id || '';
        var show = id === 'wms-panel-' + tab;
        p.hidden = !show;
        p.classList.toggle('wms-inner-panel-active', show);
    });
    if (tab === 'painel') loadWmsPainel();
    else if (tab === 'localizacoes') loadWmsLocalizacoes();
    else if (tab === 'etiquetas-longarina') loadWmsEtiquetasLongarinaAba();
    else if (tab === 'produtos') loadWmsProdutos();
    else if (tab === 'movimentacoes') loadWmsMovimentacoes();
    else if (tab === 'recebimento') loadWmsRecebimentos();
    else if (tab === 'controle-paletes') loadWmsControlePaletesAba();
    else if (tab === 'historico-nf') wmsInitHistoricoNfAba();
    else if (tab === 'relatorios') wmsInitRelatoriosAba();
    else if (tab === 'separacao') loadWmsSeparacao();
    else if (tab === 'inventario') loadWmsInventarios();
}

function initWmsEnderecamento() {
    if (!document.getElementById('modulo-enderecamento-wms')) return;
    document.querySelectorAll('.wms-subtab[data-wms-tab]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            _wmsMostrarSubtab(btn.getAttribute('data-wms-tab') || 'painel');
        });
    });
    var bLoc = document.getElementById('btn-wms-localizacoes');
    if (bLoc) bLoc.addEventListener('click', loadWmsLocalizacoes);
    var bEtqCol = document.getElementById('btn-wms-etq-coluna');
    if (bEtqCol) bEtqCol.addEventListener('click', wmsImprimirEtqColuna);
    var bEtqCam = document.getElementById('btn-wms-etq-camara');
    if (bEtqCam) bEtqCam.addEventListener('click', wmsImprimirEtqCamara);
    var bEtqTodas = document.getElementById('btn-wms-etq-todas');
    if (bEtqTodas) bEtqTodas.addEventListener('click', wmsImprimirEtqTodasLongarinas);
    var bEtqRes = document.getElementById('btn-wms-etq-resumo-atualizar');
    if (bEtqRes) bEtqRes.addEventListener('click', function() { loadWmsEtqLongarinaResumo({ forcarSync: true }); });
    var bEtqDemo = document.getElementById('btn-wms-etq-demo');
    if (bEtqDemo) bEtqDemo.addEventListener('click', wmsImprimirEtqDemo);
    var bEtqUnico = document.getElementById('btn-wms-etq-unico');
    if (bEtqUnico) bEtqUnico.addEventListener('click', wmsImprimirEtqUnico);
    var etqCodUnico = document.getElementById('wms-etq-codigo-unico');
    if (etqCodUnico && !etqCodUnico.dataset.bound) {
        etqCodUnico.dataset.bound = '1';
        etqCodUnico.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); wmsImprimirEtqUnico(); }
        });
    }
    var bProd = document.getElementById('btn-wms-produtos');
    if (bProd) bProd.addEventListener('click', loadWmsProdutos);
    var bPesq = document.getElementById('btn-wms-pesquisa');
    if (bPesq) bPesq.addEventListener('click', loadWmsPesquisaSku);
    var bRec = document.getElementById('btn-wms-novo-recebimento');
    if (bRec) bRec.addEventListener('click', wmsIniciarBipagemNf);
    var bEtqNf = document.getElementById('btn-wms-imprimir-etq-nf-todos');
    if (bEtqNf) bEtqNf.addEventListener('click', wmsImprimirEtiquetasNfTodos);
    var bIniciar = document.getElementById('btn-wms-iniciar-bipagem');
    if (bIniciar) bIniciar.addEventListener('click', wmsIniciarBipagemNf);
    wmsInitRecebimentoIntegracaoNf();
    var bRecL = document.getElementById('btn-wms-rec-lista');
    if (bRecL) bRecL.addEventListener('click', loadWmsRecebimentos);
    var bVerHist = document.getElementById('btn-wms-ver-historico-nf');
    if (bVerHist) bVerHist.addEventListener('click', function() {
        var nf = (document.getElementById('wms-rec-nf') || {}).value || '';
        var histNf = document.getElementById('wms-hist-nf');
        if (histNf && nf.trim()) histNf.value = nf.trim();
        var rid = window._wmsNfDoc && window._wmsNfDoc.recebimento_wms_id;
        var histRid = document.getElementById('wms-hist-rec-id');
        if (histRid && rid) histRid.value = String(rid);
        _wmsMostrarSubtab('historico-nf');
        if (nf.trim() || rid) loadWmsHistoricoNf();
    });
    var bConf = document.getElementById('btn-wms-conferir-palete');
    if (bConf) bConf.addEventListener('click', wmsConferirPalete);
    var bBipPal = document.getElementById('btn-wms-bip-palete');
    if (bBipPal) bBipPal.addEventListener('click', wmsBipPalete);
    var bBipProd = document.getElementById('btn-wms-bip-produto');
    if (bBipProd) bBipProd.addEventListener('click', wmsBipProduto);
    var bImp = document.getElementById('btn-wms-imprimir-etiqueta');
    if (bImp) bImp.addEventListener('click', wmsImprimirEtiqueta);
    var bSug = document.getElementById('btn-wms-sugerir-destino');
    if (bSug) bSug.addEventListener('click', wmsSugerirDestino);
    var bDest = document.getElementById('btn-wms-confirmar-destino');
    if (bDest) bDest.addEventListener('click', wmsConfirmarDestino);
    var bPick = document.getElementById('btn-wms-picking');
    if (bPick) bPick.addEventListener('click', loadWmsPickingLista);
    var bFin = document.getElementById('btn-wms-finalizar-recebimento');
    if (bFin) bFin.addEventListener('click', wmsFinalizarRecebimento);
    var bInv = document.getElementById('btn-wms-novo-inventario');
    if (bInv) bInv.addEventListener('click', wmsCriarInventario);
    var bRedis = document.getElementById('btn-wms-redistribuir');
    if (bRedis) bRedis.addEventListener('click', wmsRedistribuirLayout);
    var bCtrlBusca = document.getElementById('btn-wms-ctrl-buscar');
    if (bCtrlBusca) bCtrlBusca.addEventListener('click', loadWmsControlePaleteConsulta);
    var bCtrlFora = document.getElementById('btn-wms-ctrl-atualizar-fora');
    if (bCtrlFora) bCtrlFora.addEventListener('click', loadWmsControlePaletesFora);
    var bCtrlSaida = document.getElementById('btn-wms-ctrl-registrar-saida');
    if (bCtrlSaida) bCtrlSaida.addEventListener('click', wmsRegistrarSaidaPalete);
    var bCtrlRet = document.getElementById('btn-wms-ctrl-registrar-retorno');
    if (bCtrlRet) bCtrlRet.addEventListener('click', wmsRegistrarRetornoPalete);
    var bHist = document.getElementById('btn-wms-historico-buscar');
    if (bHist) bHist.addEventListener('click', loadWmsHistoricoNf);
    var bRel = document.getElementById('btn-wms-relatorio-gerar');
    if (bRel) bRel.addEventListener('click', loadWmsRelatorio);
    var bRelCsv = document.getElementById('btn-wms-relatorio-csv');
    if (bRelCsv) bRelCsv.addEventListener('click', wmsExportarRelatorioCsv);

    window._wmsIniciarModulo = function(tab) {
        var abasWms = ['painel', 'localizacoes', 'etiquetas-longarina', 'produtos', 'movimentacoes', 'recebimento', 'controle-paletes', 'historico-nf', 'relatorios', 'separacao', 'inventario', 'pesquisa'];
        var t = (tab || 'painel').trim();
        if (abasWms.indexOf(t) === -1) t = 'painel';
        _wmsMostrarSubtab(t);
    };
    wmsBipInitStepper();
}

async function wmsRedistribuirLayout() {
    if (!confirm('Recalcular a distribuição de categorias em todos os endereços?')) return;
    var data = await fetchAPI('/wms/layout/gerar', { method: 'POST', body: JSON.stringify({ force: true }) });
    if (data && data.ok) {
        showMessage('Distribuição atualizada: ' + (data.geradas || 0) + ' endereços.', 'success');
        loadWmsPainel();
        loadWmsLocalizacoes();
    } else {
        showMessage((data && data.erro) || 'Erro ao recalcular.', 'error');
    }
}

async function loadWmsPainel() {
    _wmsSetTbody('wms-tbody-dist-categoria', 5, '<span class="loading">Carregando...</span>');
    _wmsSetTbody('wms-tbody-zoneamento', 3, '<span class="loading">Carregando...</span>');
    try {
        var data = await _wmsFetchGet('/wms/painel', 60000);
        if (!data || data.erro) {
            var err = _wmsErroMsg(data, 'Erro ao carregar painel WMS.');
            showMessage(err, 'error');
            _wmsSetTbody('wms-tbody-dist-categoria', 5, escHtml(err));
            _wmsSetTbody('wms-tbody-zoneamento', 3, escHtml(err));
            return;
        }
        var elM = document.getElementById('wms-stat-mov-pend');
        var elR = document.getElementById('wms-stat-rec-abertos');
        var elI = document.getElementById('wms-stat-inv-ativos');
        var elP = document.getElementById('wms-stat-pal-fora');
        if (elM) elM.textContent = String(data.movimentacoes_pendentes || 0);
        if (elR) elR.textContent = String(data.recebimentos_abertos || 0);
        if (elI) elI.textContent = String(data.inventarios_ativos || 0);
        if (elP) elP.textContent = String(data.paletes_fora_armazem || 0);
        var box = document.getElementById('wms-camaras-barras');
        if (box) {
            var cams = data.camaras || [];
            box.innerHTML = cams.map(function(c) {
                var pct = Number(c.ocupacao_pct) || 0;
                var vaz = c.vazias != null ? c.vazias : '—';
                var ocup = c.ocupadas != null ? c.ocupadas : '—';
                var tot = c.total_posicoes || c.cadastradas || 0;
                return '<div style="margin-bottom:14px;"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><strong>Câmara ' + escHtml(c.camara) + '</strong><span>' + escHtml(ocup) + ' ocup. · ' + escHtml(vaz) + ' vaz. · ' + pct + '%</span></div><div style="background:#e0e0e0;border-radius:4px;height:10px;overflow:hidden;"><div style="width:' + Math.min(pct, 100) + '%;background:#1976d2;height:100%;"></div></div><div style="font-size:11px;color:#666;margin-top:2px;">Total ref.: ' + escHtml(tot) + ' posições</div></div>';
            }).join('') || '<p class="info-text">Nenhuma câmara cadastrada.</p>';
        }
        var info = document.getElementById('wms-layout-info');
        if (info) {
            var pesosPos = data.pesos_posicoes_categoria || data.pesos_categoria || {};
            var parts = ['A', 'B', 'C', 'D'].filter(function(k) { return pesosPos[k]; }).map(function(k) {
                return k + ': ' + pesosPos[k] + ' pos.';
            });
            var stParts = [];
            var rs = data.resumo_status_planejamento || {};
            ['Vermelho', 'Amarelo', 'Verde', 'Excedido'].forEach(function(k) {
                if (rs[k]) stParts.push(k + ' ' + rs[k]);
            });
            info.textContent = 'Posições médias (metas): ' + (parts.join(' · ') || 'padrão') +
                (stParts.length ? ' · Status WMS real: ' + stParts.join(', ') : ' · Status WMS real');
        }
        var dtb = document.getElementById('wms-tbody-dist-categoria');
        if (dtb) {
            var dist = data.distribuicao_categoria || [];
            dtb.innerHTML = dist.length ? dist.map(function(d) {
                return '<tr><td><strong>' + escHtml(d.categoria) + '</strong></td><td>' + escHtml(d.camara) + '</td><td>' + escHtml(d.total) + '</td><td>' + escHtml(d.vazias) + '</td><td>' + escHtml(d.ocupadas) + '</td></tr>';
            }).join('') : '<tr><td colspan="5">Sem distribuição — clique em Recalcular distribuição.</td></tr>';
        }
        var ztb = document.getElementById('wms-tbody-zoneamento');
        if (ztb) {
            var zona = data.zoneamento || [];
            ztb.innerHTML = zona.length ? zona.map(function(z) {
                return '<tr><td>' + escHtml(z.categoria) + '</td><td>' + escHtml(z.camara) + ' — ' + escHtml(z.camara_descricao || '') + '</td><td>' + escHtml(z.prioridade) + '</td></tr>';
            }).join('') : '<tr><td colspan="3">Sem zoneamento.</td></tr>';
        }
    } catch (e) {
        var msg = (e && e.message) || 'Erro ao carregar painel WMS.';
        _wmsSetTbody('wms-tbody-dist-categoria', 5, escHtml(msg));
        _wmsSetTbody('wms-tbody-zoneamento', 3, escHtml(msg));
        showMessage(msg, 'error');
    }
}

async function loadWmsLocalizacoes() {
    _wmsSetTbody('wms-tbody-localizacoes', 10, '<span class="loading">Carregando endereços...</span>');
    var tb = document.getElementById('wms-tbody-localizacoes');
    var cam = document.getElementById('wms-filtro-camara');
    var cat = document.getElementById('wms-filtro-cat-zona');
    var st = document.getElementById('wms-filtro-status');
    var q = [];
    if (cam && cam.value) q.push('camara=' + encodeURIComponent(cam.value));
    if (cat && cat.value) q.push('categoria=' + encodeURIComponent(cat.value));
    if (st && st.value) q.push('status=' + encodeURIComponent(st.value));
    var path = '/wms/localizacoes' + (q.length ? '?' + q.join('&') : '');
    try {
        var data = await _wmsFetchGet(path, 60000);
        if (!tb) return;
        if (!data || data.erro) {
            tb.innerHTML = '<tr><td colspan="10">' + escHtml(_wmsErroMsg(data, 'Erro ao carregar localizações.')) + '</td></tr>';
            if (data && data.erro) showMessage(data.erro, 'error');
            return;
        }
        var rows = data.localizacoes || [];
        tb.innerHTML = rows.length ? rows.map(function(r) {
            var niv = parseInt(r.nivel, 10);
            var zona = r.zona_armazenagem || (niv === 1 ? 'picking' : 'pulmao');
            var zl = zona === 'picking' ? 'PICKING' : 'PULMÃO';
            var cod = escHtml(r.codigo_endereco || '');
            var bcLong = escHtml(r.barcode_longarina || '');
            var codJs = String(r.codigo_endereco || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return '<tr><td>' + cod + '</td><td><strong>' + bcLong + '</strong></td><td>' + escHtml(r.camara) + '</td><td>' + escHtml(r.rua) + '</td><td>' + escHtml(r.posicao) + '</td><td>' + escHtml(r.nivel) + '</td><td><strong>' + escHtml(zl) + '</strong></td><td><strong>' + escHtml(r.categoria_zona || r.area || '—') + '</strong></td><td>' + escHtml(r.status) + '</td><td><button type="button" class="btn btn-sm btn-secondary" onclick="wmsImprimirEtqEndereco(\'' + codJs + '\')">Longarina</button></td></tr>';
        }).join('') : '<tr><td colspan="10">Nenhuma localização. Clique em Atualizar ou use o painel para recalcular o layout.</td></tr>';
    } catch (e) {
        if (tb) {
            tb.innerHTML = '<tr><td colspan="10">' + escHtml((e && e.message) || 'Erro ao carregar localizações.') + '</td></tr>';
        }
        showMessage('Erro ao carregar localizações WMS.', 'error');
    }
}

function _wmsAbrirEtiquetaUrl(url) {
    var w = window.open(url, '_blank');
    if (!w) showMessage('Pop-up bloqueado — libere pop-ups para imprimir etiquetas.', 'error');
}

window.wmsImprimirEtqEndereco = function(codigo) {
    if (!codigo) return;
    _wmsAbrirEtiquetaUrl('/api/wms/etiqueta/endereco?codigo=' + encodeURIComponent(codigo));
};

function wmsImprimirEtqColuna() {
    var cam = (document.getElementById('wms-etq-camara') || {}).value || '';
    var rua = ((document.getElementById('wms-etq-rua') || {}).value || '').trim().toUpperCase();
    var pos = (document.getElementById('wms-etq-pos') || {}).value || '';
    if (!cam) { showMessage('Selecione a câmara (Rua).', 'error'); return; }
    if (!rua || !pos) { showMessage('Informe a rua interna (letra) e o prédio (posição).', 'error'); return; }
    var url = '/api/wms/etiqueta/enderecos?camara=' + encodeURIComponent(cam) +
        '&rua=' + encodeURIComponent(rua) + '&posicao=' + encodeURIComponent(pos);
    _wmsAbrirEtiquetaUrl(url);
}

function wmsImprimirEtqCamara() {
    var cam = (document.getElementById('wms-etq-camara') || {}).value || '';
    if (!cam) { showMessage('Selecione a câmara.', 'error'); return; }
    if (!confirm('Imprimir todas as longarinas da câmara ' + cam + '?')) return;
    _wmsAbrirEtiquetaUrl('/api/wms/etiqueta/enderecos?camara=' + encodeURIComponent(cam));
}

async function loadWmsEtqLongarinaResumo(opcoes) {
    opcoes = opcoes || {};
    var box = document.getElementById('wms-etq-resumo-box');
    if (!box) return;
    box.innerHTML = '<p class="loading" style="margin:0;">Carregando resumo…</p>';
    try {
        var data = await _wmsFetchGet('/wms/etiqueta/enderecos/resumo', 30000);
        if (!data || data.erro) {
            box.innerHTML = '<p style="margin:0;color:#c62828;">' + escHtml(_modErroMsg(data, 'Erro ao carregar.')) + '</p>';
            return;
        }
        var nCfg = data.niveis_config || 5;
        var mx = data.max_nivel_banco || 0;
        if ((opcoes.forcarSync || mx < nCfg) && !opcoes.jaSincronizou) {
            box.innerHTML = '<p class="loading" style="margin:0;">Atualizando layout para ' + escHtml(nCfg) + ' níveis (pode levar 1 min)…</p>';
            data = await _wmsFetchGet('/wms/etiqueta/enderecos/resumo?sync=1', 120000);
            if (!data || data.erro) {
                box.innerHTML = '<p style="margin:0;color:#c62828;">' + escHtml(_modErroMsg(data, 'Erro ao sincronizar layout.')) + '</p>';
                return;
            }
            opcoes.jaSincronizou = true;
        }
        var total = data.total_etiquetas || 0;
        var cols = data.total_colunas || 0;
        mx = data.max_nivel_banco || 0;
        var inc = data.colunas_incompletas || 0;
        var html = '<h4 style="margin:0 0 8px 0;color:#1565c0;">Armazém pronto para etiquetar</h4>';
        html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Níveis por coluna (config):</span> <strong>' + escHtml(nCfg) + '</strong> (1 PICKING + ' + escHtml(nCfg - 1) + ' PULMÃO)</div>';
        html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Máx. nível no banco:</span> <strong>' + escHtml(mx) + '</strong></div>';
        html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Total de etiquetas:</span> <strong>' + escHtml(total) + '</strong></div>';
        html += '<div class="extrato-resumo-linha"><span class="extrato-resumo-label">Colunas (pilares):</span> <strong>' + escHtml(cols) + '</strong></div>';
        if (mx < nCfg) {
            html += '<p class="info-text" style="margin:10px 0 0 0;padding:8px;background:#fff3e0;border:1px solid #ffb74d;border-radius:6px;color:#e65100;">Layout ainda com ' + escHtml(mx) + ' níveis. Clique <strong>Atualizar resumo</strong> ou no Painel «Recalcular distribuição».</p>';
        } else if (inc > 0) {
            html += '<p class="info-text" style="margin:8px 0 0 0;font-size:12px;">' + escHtml(inc) + ' coluna(s) com menos de ' + escHtml(nCfg) + ' níveis — normal nas últimas colunas parciais de cada câmara.</p>';
        }
        var por = data.por_camara || [];
        if (por.length) {
            html += '<div class="table-container" style="margin-top:10px;max-height:160px;overflow:auto;"><table class="data-table"><thead><tr><th>Câmara</th><th>Colunas</th><th>Etiquetas</th></tr></thead><tbody>';
            html += por.map(function(r) {
                return '<tr><td><strong>' + escHtml(r.camara) + '</strong></td><td>' + escHtml(r.colunas) + '</td><td>' + escHtml(r.etiquetas) + '</td></tr>';
            }).join('');
            html += '</tbody></table></div>';
        }
        if (!total) {
            html += '<p class="info-text" style="margin:8px 0 0 0;">Nenhum endereço no banco. No <strong>Painel WMS</strong>, use «Recalcular distribuição» ou aguarde a geração automática do layout.</p>';
        }
        box.innerHTML = html;
    } catch (e) {
        box.innerHTML = '<p style="margin:0;color:#c62828;">' + escHtml((e && e.message) || 'Erro.') + '</p>';
    }
}

function loadWmsEtiquetasLongarinaAba() {
    loadWmsEtqLongarinaResumo();
}

function wmsImprimirEtqTodasLongarinas() {
    var box = document.getElementById('wms-etq-resumo-box');
    var txt = box ? box.textContent : '';
    var msg = 'Imprimir TODAS as etiquetas de longarina do armazém';
    if (txt && txt.indexOf('Total') >= 0) {
        msg += ' (' + txt.replace(/\s+/g, ' ').trim().slice(0, 120) + '…)?';
    } else {
        msg += '? Pode levar várias páginas.';
    }
    if (!confirm(msg)) return;
    _wmsAbrirEtiquetaUrl('/api/wms/etiqueta/enderecos?todas=1');
}

function wmsImprimirEtqUnico() {
    var cod = ((document.getElementById('wms-etq-codigo-unico') || {}).value || '').trim();
    if (!cod) { showMessage('Informe o código longarina (21.13.1.1) ou WMS.', 'warning'); return; }
    wmsImprimirEtqEndereco(cod);
}

function wmsImprimirEtqDemo() {
    _wmsAbrirEtiquetaUrl('/api/wms/etiqueta/modelo?tipo=endereco');
}

window.wmsImprimirEtqPaleteModelo = function() {
    _wmsAbrirEtiquetaUrl('/api/wms/etiqueta/modelo?tipo=palete');
};

async function loadWmsProdutos() {
    _wmsSetTbody('wms-tbody-produtos', 8, '<span class="loading">Carregando...</span>');
    var tb = document.getElementById('wms-tbody-produtos');
    try {
        var cat = document.getElementById('wms-filtro-categoria');
        var path = '/wms/produtos';
        if (cat && cat.value) path += '?categoria=' + encodeURIComponent(cat.value);
        var data = await _wmsFetchGet(path, 45000);
        if (!tb) return;
        if (!data || data.erro) {
            tb.innerHTML = '<tr><td colspan="8">' + escHtml(_wmsErroMsg(data, 'Erro ao carregar produtos.')) + '</td></tr>';
            return;
        }
        function corStatus(st) {
            st = (st || '').toLowerCase();
            if (st === 'vermelho') return '#ffcdd2';
            if (st === 'amarelo') return '#fff9c4';
            if (st === 'excedido') return '#ffe0b2';
            if (st === 'verde') return '#e8f5e9';
            return '';
        }
        var rows = data.produtos || [];
        tb.innerHTML = rows.length ? rows.map(function(p) {
            var bg = corStatus(p.status_condicional);
            var est = p.estoque_atual != null ? p.estoque_atual : '0';
            var pos = p.posicao_atual != null ? p.posicao_atual : '0';
            var posPlan = p.posicoes_med != null ? ' / plan ' + p.posicoes_med : '';
            return '<tr style="' + (bg ? 'background:' + bg + ';' : '') + '"><td>' + escHtml(p.sku) + '</td><td>' + escHtml(p.descricao || '') + '</td><td><strong>' + escHtml(p.categoria) + '</strong></td><td><strong>' + escHtml(p.status_condicional || 'Verde') + '</strong></td><td>' + escHtml(pos + posPlan) + '</td><td>' + escHtml(est) + '</td><td>' + escHtml(p.padrao_plt || '') + '</td><td>' + escHtml(p.conversao || '') + '</td></tr>';
        }).join('') : '<tr><td colspan="8">Importe data/wms_produtos_planejamento.tsv</td></tr>';
    } catch (e) {
        if (tb) tb.innerHTML = '<tr><td colspan="8">' + escHtml((e && e.message) || 'Erro ao carregar produtos.') + '</td></tr>';
        showMessage('Erro ao carregar produtos WMS.', 'error');
    }
}

async function loadWmsMovimentacoes() {
    _wmsSetTbody('wms-tbody-movimentacoes', 6, '<span class="loading">Carregando...</span>');
    var tb = document.getElementById('wms-tbody-movimentacoes');
    try {
        var data = await _wmsFetchGet('/wms/movimentacoes?status=pendente', 45000);
        if (!tb) return;
        if (!data || data.erro) {
            tb.innerHTML = '<tr><td colspan="6">' + escHtml(_wmsErroMsg(data, 'Erro ao carregar movimentações.')) + '</td></tr>';
            return;
        }
        var rows = data.movimentacoes || [];
        tb.innerHTML = rows.length ? rows.map(function(m) {
            return '<tr><td>' + escHtml(m.id) + '</td><td>' + escHtml(m.tipo) + '</td><td>' + escHtml(m.etiqueta) + '</td><td>' + escHtml(m.destino || '') + '</td><td>' + escHtml(m.prioridade) + '</td><td><button type="button" class="btn btn-sm btn-success" onclick="wmsConcluirMovimentacao(' + m.id + ')">Concluir</button></td></tr>';
        }).join('') : '<tr><td colspan="6">Nenhuma movimentação pendente.</td></tr>';
    } catch (e) {
        if (tb) tb.innerHTML = '<tr><td colspan="6">' + escHtml((e && e.message) || 'Erro ao carregar movimentações.') + '</td></tr>';
        showMessage('Erro ao carregar movimentações WMS.', 'error');
    }
}

window.wmsConcluirMovimentacao = async function(id) {
    var data = await fetchAPI('/wms/movimentacoes', { method: 'POST', body: JSON.stringify({ acao: 'concluir', id: id }) });
    if (data && data.ok) {
        showMessage('Movimentação concluída.', 'success');
        loadWmsMovimentacoes();
        loadWmsPainel();
    } else {
        showMessage((data && data.erro) || 'Erro ao concluir.', 'error');
    }
};

async function loadWmsRecebimentos() {
    _wmsSetTbody('wms-tbody-recebimentos', 6, '<span class="loading">Carregando...</span>');
    var tb = document.getElementById('wms-tbody-recebimentos');
    try {
        var data = await _wmsFetchGet('/wms/recebimentos', 45000);
        if (!tb) return;
        if (!data || data.erro) {
            tb.innerHTML = '<tr><td colspan="6">' + escHtml(_wmsErroMsg(data, 'Erro ao carregar recebimentos.')) + '</td></tr>';
            return;
        }
        var rows = data.recebimentos || [];
        tb.innerHTML = rows.length ? rows.map(function(r) {
            var nf = r.numero_nf || '—';
            var orig = (r.origem || '').toLowerCase();
            var vinc = r.terceiros_documento_id ? ' · Doc #' + r.terceiros_documento_id : '';
            var btnExcluir = '<button type="button" class="btn btn-sm" style="background:#c62828;color:#fff;" '
                + 'data-wms-rec-id="' + escHtml(String(r.id)) + '" data-wms-rec-nf="' + escHtml(String(nf)) + '" '
                + 'onclick="event.stopPropagation(); wmsExcluirRecebimento(this)" title="Excluir recebimento">Excluir</button>';
            return '<tr style="cursor:pointer;" onclick="wmsAbrirRecebimento(' + r.id + ')"><td>' + escHtml(r.id) + '</td><td>' + escHtml(r.numero_nf || '') + escHtml(vinc) + '</td><td>' + escHtml(r.fornecedor || '') + '</td><td>' + escHtml(r.placa || '') + '</td><td>' + escHtml(r.status) + (orig === 'carreta' ? ' · carreta' : '') + '</td><td>' + btnExcluir + '</td></tr>';
        }).join('') : '<tr><td colspan="6">Nenhum recebimento.</td></tr>';
    } catch (e) {
        if (tb) tb.innerHTML = '<tr><td colspan="6">' + escHtml((e && e.message) || 'Erro ao carregar recebimentos.') + '</td></tr>';
        showMessage('Erro ao carregar recebimentos WMS.', 'error');
    }
}

function wmsLimparPainelNfDescarga() {
    window._wmsNfDoc = null;
    var info = document.getElementById('wms-rec-nf-info');
    var wrap = document.getElementById('wms-rec-nf-itens-wrap');
    var tb = document.getElementById('wms-tbody-rec-nf-itens');
    var hid = document.getElementById('wms-rec-terceiros-doc-id');
    var hidA = document.getElementById('wms-rec-terceiros-area');
    if (info) { info.style.display = 'none'; info.innerHTML = ''; }
    if (wrap) wrap.style.display = 'none';
    if (tb) tb.innerHTML = '';
    if (hid) hid.value = '';
    if (hidA) hidA.value = '';
}

function _wmsStatusItemNfLabel(st) {
    st = (st || 'pendente').toLowerCase();
    if (st === 'ok') return '<span style="color:#2e7d32;font-weight:bold;">OK</span>';
    if (st === 'parcial') return '<span style="color:#e65100;font-weight:bold;">Parcial</span>';
    return '<span style="color:#666;">Pendente</span>';
}

function wmsPreencherPainelNfDescarga(doc) {
    if (!doc) { wmsLimparPainelNfDescarga(); return; }
    window._wmsNfDoc = doc;
    var hid = document.getElementById('wms-rec-terceiros-doc-id');
    var hidA = document.getElementById('wms-rec-terceiros-area');
    var forn = document.getElementById('wms-rec-fornecedor');
    var placa = document.getElementById('wms-rec-placa');
    if (hid) hid.value = doc.documento_id != null ? String(doc.documento_id) : '';
    if (hidA) hidA.value = doc.area || '';
    if (forn) forn.value = doc.fornecedor || '';
    if (placa) placa.value = doc.placa || '';
    var info = document.getElementById('wms-rec-nf-info');
    if (info) {
        var areaLbl = doc.area === 'carreta' ? 'Carreta' : (doc.area || 'Recebimento');
        var st = doc.recebimento_concluido ? '<span style="color:#e65100;">Recebimento já concluído no módulo descarga</span>' :
            '<span style="color:#2e7d32;">Pendência — imprima etiquetas de <strong>produto</strong> (fase A) e depois inicie a bipagem (fase B)</span>';
        var recWms = doc.recebimento_wms_id ? (' · Recebimento WMS #' + escHtml(doc.recebimento_wms_id)) : '';
        info.innerHTML = '<strong>NF ' + escHtml(doc.numero_nf || '') + '</strong>'
            + (doc.serie_nf ? ' · Série ' + escHtml(doc.serie_nf) : '')
            + ' · ' + escHtml(areaLbl)
            + (doc.motorista ? ' · Motorista: ' + escHtml(doc.motorista) : '')
            + recWms
            + '<br>' + st
            + ' · ' + escHtml(doc.total_itens || 0) + ' item(ns) · Qtd NF: ' + escHtml(doc.quantidade_total_xml || 0);
        info.style.display = 'block';
    }
    var wrap = document.getElementById('wms-rec-nf-itens-wrap');
    var tb = document.getElementById('wms-tbody-rec-nf-itens');
    var itens = doc.itens || [];
    if (wrap && tb) {
        wrap.style.display = itens.length ? 'block' : 'none';
        tb.innerHTML = itens.length ? itens.map(function(it) {
            var skuJs = String(it.sku || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            var nItemJs = String(it.n_item != null ? it.n_item : '').replace(/'/g, "\\'");
            var qWms = it.quantidade_wms != null ? it.quantidade_wms : 0;
            return '<tr><td>' + escHtml(it.n_item || '') + '</td><td><strong>' + escHtml(it.sku || '—') + '</strong></td>'
                + '<td>' + escHtml(it.descricao || '') + '</td><td>' + escHtml(it.quantidade_xml) + '</td>'
                + '<td>' + escHtml(qWms) + '</td><td>' + _wmsStatusItemNfLabel(it.status_wms) + '</td>'
                + '<td>' + escHtml(it.codigo_ean || '—') + '</td>'
                + '<td><button type="button" class="btn btn-sm btn-secondary" title="Etiqueta de produto 50×76 mm — código EAN/SKU para bipar na etapa 2" onclick="wmsImprimirEtiquetaNfItem(\'' + nItemJs + '\', \'' + skuJs + '\')">Etq. produto</button></td></tr>';
        }).join('') : '';
    }
    if (doc.recebimento_wms_id) {
        wmsSincronizarRecebimentoAberto(doc.recebimento_wms_id, { resetarPalete: false });
    }
}

function wmsImprimirEtiquetasNfTodos() {
    var docId = (document.getElementById('wms-rec-terceiros-doc-id') || {}).value || '';
    var nf = (document.getElementById('wms-rec-nf') || {}).value || '';
    if (!docId && !String(nf).trim()) {
        showMessage('Busque a NF primeiro.', 'warning');
        return;
    }
    var url = '/api/wms/etiqueta/nf-itens?auto_print=1';
    if (docId) url += '&documento_id=' + encodeURIComponent(docId);
    else url += '&numero_nf=' + encodeURIComponent(String(nf).trim());
    _wmsAbrirEtiquetaUrl(url);
}

window.wmsImprimirEtiquetaNfItem = function(nItem, sku) {
    var docId = (document.getElementById('wms-rec-terceiros-doc-id') || {}).value || '';
    if (!docId) { showMessage('Busque a NF primeiro.', 'warning'); return; }
    var url = '/api/wms/etiqueta/nf-itens?documento_id=' + encodeURIComponent(docId) + '&auto_print=1';
    if (nItem) url += '&n_item=' + encodeURIComponent(nItem);
    else if (sku) url += '&sku=' + encodeURIComponent(sku);
    _wmsAbrirEtiquetaUrl(url);
};

async function wmsAtualizarPainelNfDescarga() {
    var nf = (document.getElementById('wms-rec-nf') || {}).value || '';
    if (!String(nf).trim()) return;
    var data = await fetchAPI('/wms/recebimentos/buscar-nf?numero_nf=' + encodeURIComponent(nf.trim()));
    if (data && data.documento) wmsPreencherPainelNfDescarga(data.documento);
}

function wmsNormalizarCodigoBip(codigo) {
    return String(codigo || '').trim().replace(/\s+/g, ' ');
}

function wmsSomenteDigitosCodigo(codigo) {
    return String(codigo || '').replace(/\D/g, '');
}

function wmsCompactCodigoProduto(codigo) {
    return String(codigo || '').replace(/[\s.\-_/\\]/g, '').toUpperCase();
}

function wmsMostrarErroBipProduto(msg) {
    var box = document.getElementById('wms-bip-erro-produto');
    if (!msg) {
        if (box) { box.style.display = 'none'; box.textContent = ''; }
        return;
    }
    if (box) {
        box.textContent = msg;
        box.style.display = 'block';
    }
    showMessage(msg, 'error');
}

function wmsResolverCodigoProdutoNf(codigo) {
    codigo = wmsNormalizarCodigoBip(codigo);
    if (!codigo || !window._wmsNfDoc) return null;
    var norm = wmsSomenteDigitosCodigo(codigo);
    var compact = wmsCompactCodigoProduto(codigo);
    var itens = window._wmsNfDoc.itens || [];
    for (var i = 0; i < itens.length; i++) {
        var it = itens[i];
        var sku = String(it.sku || '').trim();
        var skuCompact = wmsCompactCodigoProduto(sku);
        var ean = wmsSomenteDigitosCodigo(it.codigo_ean);
        if (sku && (sku === codigo || sku.toUpperCase() === codigo.toUpperCase() || (compact && skuCompact && skuCompact === compact))) return it;
        if (ean && norm && (ean === norm || ean.endsWith(norm) || norm.endsWith(ean))) return it;
    }
    return null;
}

async function wmsGarantirRecebimentoAberto() {
    var hid = document.getElementById('wms-rec-detalhe-id');
    var rid = (hid && hid.value) ? String(hid.value).trim() : '';
    if (!rid && window._wmsNfDoc && window._wmsNfDoc.recebimento_wms_id) {
        rid = String(window._wmsNfDoc.recebimento_wms_id);
    }
    if (rid) {
        wmsSincronizarRecebimentoAberto(rid, { resetarPalete: false });
        return parseInt(rid, 10);
    }
    var nf = (document.getElementById('wms-rec-nf') || {}).value || '';
    if (!String(nf).trim()) return null;
    if (!window._wmsNfDoc) await wmsBuscarNfDescarga();
    if (!window._wmsNfDoc) return null;
    if (window._wmsNfDoc.recebimento_wms_id) {
        wmsSincronizarRecebimentoAberto(window._wmsNfDoc.recebimento_wms_id, { resetarPalete: false });
        return parseInt(window._wmsNfDoc.recebimento_wms_id, 10);
    }
    var terDoc = (document.getElementById('wms-rec-terceiros-doc-id') || {}).value || '';
    var body = {
        numero_nf: nf.trim(),
        fornecedor: (document.getElementById('wms-rec-fornecedor') || {}).value || '',
        placa: (document.getElementById('wms-rec-placa') || {}).value || '',
        terceiros_documento_id: terDoc ? parseInt(terDoc, 10) : null,
        terceiros_area: (document.getElementById('wms-rec-terceiros-area') || {}).value || ''
    };
    var data = await fetchAPIComTimeout('/wms/recebimentos', { method: 'POST', body: JSON.stringify(body) }, 60000);
    if (!data || !data.ok) {
        wmsMostrarErroBipProduto((data && data.erro) || 'Erro ao abrir recebimento WMS.');
        return null;
    }
    window._wmsNfDoc.recebimento_wms_id = data.id;
    wmsSincronizarRecebimentoAberto(data.id, { resetarPalete: false });
    loadWmsRecebimentos();
    return parseInt(data.id, 10);
}

function wmsSincronizarRecebimentoAberto(id, opts) {
    opts = opts || {};
    var det = document.getElementById('wms-recebimento-detalhe');
    var hid = document.getElementById('wms-rec-detalhe-id');
    var ridNovo = String(id || '');
    var ridAtual = hid ? String(hid.value || '') : '';
    if (det) det.style.display = 'block';
    if (hid) hid.value = ridNovo;
    wmsBipInitStepper();
    if (opts.resetarPalete || !ridAtual || ridAtual !== ridNovo) {
        wmsBipResetNovoPalete();
    } else if (!document.getElementById('wms-rec-palete-id').value) {
        wmsBipEnsurePalete(true);
    }
}

async function wmsIniciarBipagemNf() {
    var nf = (document.getElementById('wms-rec-nf') || {}).value || '';
    if (!String(nf).trim()) {
        showMessage('Informe o número da NF.', 'error');
        return;
    }
    if (!window._wmsNfDoc) {
        await wmsBuscarNfDescarga();
        if (!window._wmsNfDoc) return;
    }
    if (window._wmsNfDoc.recebimento_concluido) {
        showMessage('Esta NF já foi concluída no módulo de descarga.', 'warning');
        return;
    }
    var rid = window._wmsNfDoc.recebimento_wms_id;
    if (!rid) {
        var terDoc = (document.getElementById('wms-rec-terceiros-doc-id') || {}).value || '';
        var body = {
            numero_nf: nf.trim(),
            fornecedor: (document.getElementById('wms-rec-fornecedor') || {}).value || '',
            placa: (document.getElementById('wms-rec-placa') || {}).value || '',
            terceiros_documento_id: terDoc ? parseInt(terDoc, 10) : null,
            terceiros_area: (document.getElementById('wms-rec-terceiros-area') || {}).value || ''
        };
        var data = await fetchAPI('/wms/recebimentos', { method: 'POST', body: JSON.stringify(body) });
        if (!data || !data.ok) {
            showMessage((data && data.erro) || 'Erro ao criar recebimento.', 'error');
            return;
        }
        rid = data.id;
        window._wmsNfDoc.recebimento_wms_id = rid;
        loadWmsRecebimentos();
    }
    wmsSincronizarRecebimentoAberto(rid, { resetarPalete: true });
    var det = document.getElementById('wms-recebimento-detalhe');
    if (det && det.scrollIntoView) det.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showMessage('Comece bipando a etiqueta de produto (EAN) na caixa.', 'success');
}

function wmsInitRecebimentoIntegracaoNf() {
    var nfEl = document.getElementById('wms-rec-nf');
    if (!nfEl || nfEl.dataset.wmsNfBind) return;
    nfEl.dataset.wmsNfBind = '1';
    nfEl.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            wmsBuscarNfDescarga();
        }
    });
    nfEl.addEventListener('blur', function() {
        var v = String(nfEl.value || '').trim();
        if (v && (!window._wmsNfDoc || String(window._wmsNfDoc.numero_nf || '') !== v)) {
            wmsBuscarNfDescarga();
        }
    });
    var skuEl = document.getElementById('wms-pal-sku');
    if (skuEl && !skuEl.dataset.wmsSkuBind) {
        skuEl.dataset.wmsSkuBind = '1';
        skuEl.addEventListener('keydown', function(ev) {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            var it = wmsResolverCodigoProdutoNf(skuEl.value);
            if (it) {
                skuEl.value = it.sku || skuEl.value;
                showMessage('Produto NF: ' + (it.descricao || it.sku), 'success');
                var up = document.getElementById('wms-pal-up');
                if (up) up.focus();
            }
        });
        skuEl.addEventListener('blur', function() {
            var it = wmsResolverCodigoProdutoNf(skuEl.value);
            if (it) skuEl.value = it.sku || skuEl.value;
        });
    }
}

window.wmsBuscarNfDescarga = async function() {
    var nf = (document.getElementById('wms-rec-nf') || {}).value || '';
    if (!String(nf).trim()) {
        showMessage('Informe o número da NF.', 'warning');
        return;
    }
    var data = await fetchAPI('/wms/recebimentos/buscar-nf?numero_nf=' + encodeURIComponent(nf.trim()));
    if (!data || data.erro || !data.documento) {
        wmsLimparPainelNfDescarga();
        showMessage((data && data.erro) || 'NF não encontrada no módulo de descarga.', 'error');
        return;
    }
    wmsPreencherPainelNfDescarga(data.documento);
    if (data.documento.recebimento_concluido) {
        showMessage('NF encontrada, mas o recebimento já foi concluído no módulo de descarga.', 'warning');
    } else {
        showMessage('NF carregada — fase A: imprima as etiquetas de produto; depois clique em Iniciar bipagem.', 'success');
    }
};

window.wmsExcluirRecebimento = async function(btn) {
    var id = btn && btn.getAttribute ? btn.getAttribute('data-wms-rec-id') : btn;
    var nf = (btn && btn.getAttribute ? btn.getAttribute('data-wms-rec-nf') : '') || '—';
    var label = nf && nf !== '—' ? ('NF ' + nf) : ('recebimento #' + id);
    if (!confirm('Excluir ' + label + '?\n\nPaletes em conferência serão removidos. Não é possível excluir se algum palete já foi armazenado no WMS.')) return;
    var data = await fetchAPI('/wms/recebimentos', {
        method: 'POST',
        body: JSON.stringify({ acao: 'excluir', recebimento_id: parseInt(id, 10) })
    });
    if (data && data.ok) {
        showMessage('Recebimento excluído.', 'success');
        var hid = document.getElementById('wms-rec-detalhe-id');
        if (hid && String(hid.value) === String(id)) {
            var det = document.getElementById('wms-recebimento-detalhe');
            if (det) det.style.display = 'none';
            hid.value = '';
        }
        loadWmsRecebimentos();
        loadWmsPainel();
        loadWmsMovimentacoes();
    } else {
        showMessage((data && data.erro) || 'Erro ao excluir recebimento.', 'error');
    }
};

window._wmsBipEtapa = 1;
window._wmsBipMaxEtapa = 1;
window._wmsBipResumo = { palete: '', produto: '', impresso: false, endereco: '' };

var _WMS_BIP_ACOES = {
    1: 'Bipe a etiqueta de produto (EAN) colada na caixa e confirme lote e datas.',
    2: 'Imprima a etiqueta (já com o endereço de guardar), cole no palete e clique em «Etiqueta colada — continuar».',
    3: 'Leve o palete ao endereço indicado e bipe a etiqueta da longarina/coluna — a entrada confirma sozinha.'
};

function wmsEnderecoBipPareceCompleto(codigo) {
    var c = wmsNormalizarCodigoBip(codigo);
    if (!c) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(c)) return true;
    if (/^\d{2}-[A-Z]-\d{2}-\d+$/i.test(c)) return true;
    return false;
}

var _wmsDestinoBipTimer = null;

function wmsAgendarConfirmarDestinoAuto() {
    if (window._wmsBipEtapa !== 3) return;
    if (window._wmsConfirmandoDestino) return;
    clearTimeout(_wmsDestinoBipTimer);
    _wmsDestinoBipTimer = setTimeout(function() {
        var dest = document.getElementById('wms-bip-destino');
        var cod = dest ? wmsNormalizarCodigoBip(dest.value) : '';
        if (wmsEnderecoBipPareceCompleto(cod)) wmsConfirmarDestino();
    }, 150);
}

function wmsInitBipDestinoAutoConfirm() {
    var destBip = document.getElementById('wms-bip-destino');
    if (!destBip || destBip.dataset.wmsBipAuto) return;
    destBip.dataset.wmsBipAuto = '1';
    destBip.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            clearTimeout(_wmsDestinoBipTimer);
            wmsConfirmarDestino();
        }
    });
    destBip.addEventListener('input', wmsAgendarConfirmarDestinoAuto);
    destBip.addEventListener('paste', function() {
        setTimeout(wmsAgendarConfirmarDestinoAuto, 50);
    });
}

function wmsFormatarDestinoEtiqueta(sug) {
    if (!sug || !sug.codigo_endereco) return null;
    var bc = sug.barcode_longarina || sug.codigo_endereco;
    var txt = sug.texto || '';
    var zona = sug.zona_label || '';
    return {
        barcode: bc,
        texto: txt,
        zona: zona,
        destino: bc + (txt ? ' — ' + txt : (zona ? ' (' + zona + ')' : ''))
    };
}

function wmsBipAtualizarEnderecoEtapa2() {
    var box = document.getElementById('wms-bip-endereco-etapa2');
    var val = document.getElementById('wms-bip-endereco-valor');
    var det = document.getElementById('wms-bip-endereco-detalhe');
    var fmt = wmsFormatarDestinoEtiqueta(window._wmsSugestaoAtual);
    var onStep2 = window._wmsBipEtapa === 2;
    if (!box || !val) return;
    if (fmt) {
        box.style.display = '';
        val.textContent = fmt.barcode;
        if (det) det.textContent = (fmt.texto || '') + (fmt.zona ? ' · ' + fmt.zona : '');
        if (window._wmsBipResumo) window._wmsBipResumo.endereco = fmt.barcode;
    } else if (onStep2) {
        box.style.display = '';
        val.textContent = '—';
        if (det) det.textContent = window._wmsSugestaoCarregando
            ? 'Calculando endereço de guardar…'
            : 'Sem indicação automática — libere vagas ou informe manualmente no passo 3.';
    } else {
        box.style.display = 'none';
        val.textContent = '—';
        if (det) det.textContent = '';
    }
}

async function wmsGarantirSugestaoDestino(silent) {
    if (window._wmsSugestaoAtual && window._wmsSugestaoAtual.codigo_endereco) {
        wmsBipAtualizarEnderecoEtapa2();
        return window._wmsSugestaoAtual;
    }
    var pid = (document.getElementById('wms-rec-palete-id') || {}).value;
    if (!pid) {
        wmsBipAtualizarEnderecoEtapa2();
        return null;
    }
    window._wmsSugestaoCarregando = true;
    wmsBipAtualizarEnderecoEtapa2();
    try {
        var data = await fetchAPI('/wms/recebimentos', {
            method: 'POST',
            body: JSON.stringify({ acao: 'sugerir_destino', palete_id: parseInt(pid, 10) })
        });
        if (data && !data.erro) {
            _wmsMostrarSugestao(data);
            return data;
        }
        if (!silent) showMessage((data && data.erro) || 'Não foi possível calcular o endereço de guardar.', 'warning');
    } catch (e) {
        if (!silent) showMessage((e && e.message) || 'Erro ao calcular endereço.', 'error');
    } finally {
        window._wmsSugestaoCarregando = false;
        wmsBipAtualizarEnderecoEtapa2();
    }
    return window._wmsSugestaoAtual && window._wmsSugestaoAtual.codigo_endereco ? window._wmsSugestaoAtual : null;
}

function wmsBipAtualizarCodigoPaleteUI(etiqueta) {
    var el = document.getElementById('wms-bip-codigo-palete');
    var hid = document.getElementById('wms-bip-etiqueta');
    var v = etiqueta || (hid && hid.value) || '';
    if (hid && etiqueta) hid.value = etiqueta;
    if (el) el.textContent = v || '—';
}

function wmsBipAtualizarResumos() {
    var r = window._wmsBipResumo || {};
    var elPr = document.getElementById('wms-bip-resumo-produto');
    var elI = document.getElementById('wms-bip-resumo-imprimir');
    var elD = document.getElementById('wms-bip-resumo-destino');
    if (elPr) elPr.textContent = r.produto ? '✓ ' + r.produto : '';
    if (elI) elI.textContent = r.impresso ? '✓ ' + (r.palete || 'Etiqueta colada') : (r.palete ? '✓ ' + r.palete : '');
    if (elD) elD.textContent = r.endereco ? '✓ ' + r.endereco : '';
    wmsBipAtualizarCodigoPaleteUI(r.palete);
    wmsBipAtualizarEnderecoEtapa2();
}

async function wmsBipEnsurePalete(silent) {
    var rid = (document.getElementById('wms-rec-detalhe-id') || {}).value;
    if (!rid) {
        rid = await wmsGarantirRecebimentoAberto();
        if (!rid) return null;
    }
    var pid = (document.getElementById('wms-rec-palete-id') || {}).value;
    if (pid) {
        var hid = document.getElementById('wms-bip-etiqueta');
        return { ok: true, palete_id: parseInt(pid, 10), etiqueta: (hid && hid.value) || '' };
    }
    var data = await fetchAPIComTimeout('/wms/recebimentos', {
        method: 'POST',
        body: JSON.stringify({ acao: 'bip_palete', recebimento_id: parseInt(rid, 10), etiqueta: '' })
    }, 60000);
    if (data && data.ok) {
        var pidEl = document.getElementById('wms-rec-palete-id');
        if (pidEl) pidEl.value = String(data.palete_id);
        window._wmsBipResumo.palete = data.etiqueta || '';
        wmsBipAtualizarCodigoPaleteUI(data.etiqueta);
        return data;
    }
    if (!silent) wmsMostrarErroBipProduto((data && data.erro) || 'Erro ao abrir palete no sistema.');
    return null;
}

function wmsBipIrParaEtapa(n, opts) {
    opts = opts || {};
    n = Math.max(1, Math.min(3, parseInt(n, 10) || 1));
    if (!opts.manterMax && n > window._wmsBipMaxEtapa) window._wmsBipMaxEtapa = n;
    window._wmsBipEtapa = n;
    var maxLiberada = opts.maxLiberada || window._wmsBipMaxEtapa;
    document.querySelectorAll('.wms-bip-step[data-wms-bip-step]').forEach(function(btn) {
        var s = parseInt(btn.getAttribute('data-wms-bip-step'), 10);
        btn.classList.remove('wms-bip-step--ativa', 'wms-bip-step--feita');
        btn.disabled = s > maxLiberada;
        if (s < n) btn.classList.add('wms-bip-step--feita');
        else if (s === n) btn.classList.add('wms-bip-step--ativa');
    });
    document.querySelectorAll('.wms-rec-etapa[data-wms-bip-step]').forEach(function(el) {
        var s = parseInt(el.getAttribute('data-wms-bip-step'), 10);
        el.classList.remove('wms-rec-etapa--ativa', 'wms-rec-etapa--feita', 'wms-rec-etapa--aguardando');
        if (s < n) el.classList.add('wms-rec-etapa--feita');
        else if (s === n) el.classList.add('wms-rec-etapa--ativa');
        else el.classList.add('wms-rec-etapa--aguardando');
    });
    var txt = document.getElementById('wms-bip-acao-texto');
    if (txt) txt.textContent = _WMS_BIP_ACOES[n] || '';
    wmsBipAtualizarResumos();
    if (n === 2) wmsGarantirSugestaoDestino(true);
    if (n === 3) {
        if (!window._wmsDestinoManual) {
            var destEl = document.getElementById('wms-bip-destino');
            if (destEl) destEl.value = '';
        }
        wmsSugerirDestino();
    }
    if (!opts.semFoco) wmsBipFocarEtapa(n);
}

function wmsBipFocarEtapa(n) {
    var idMap = { 1: 'wms-pal-sku', 3: 'wms-bip-destino' };
    var el = document.getElementById(idMap[n]);
    if (el && !el.readOnly) {
        setTimeout(function() { el.focus(); if (el.select) el.select(); }, 80);
    }
}

async function wmsBipResetNovoPalete() {
    window._wmsBipMaxEtapa = 1;
    window._wmsBipResumo = { palete: '', produto: '', impresso: false, endereco: '' };
    var pid = document.getElementById('wms-rec-palete-id');
    if (pid) pid.value = '';
    var bip = document.getElementById('wms-bip-etiqueta');
    if (bip) bip.value = '';
    var bipM = document.getElementById('wms-bip-etiqueta-manual');
    if (bipM) bipM.value = '';
    wmsBipAtualizarCodigoPaleteUI('');
    var info = document.getElementById('wms-rec-palete-info');
    if (info) { info.textContent = ''; info.style.display = 'none'; }
    ['wms-pal-sku', 'wms-pal-lote', 'wms-pal-up'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var msg = document.getElementById('wms-palete-gerado');
    if (msg) msg.textContent = '';
    _wmsResetDestinoSugestao();
    var sug = document.getElementById('wms-sugestao-destino');
    if (sug) { sug.style.display = 'none'; sug.innerHTML = ''; }
    var btnProx = document.getElementById('btn-wms-bip-proximo-palete');
    if (btnProx) btnProx.style.display = 'none';
    wmsMostrarErroBipProduto('');
    wmsBipIrParaEtapa(1);
    await wmsBipEnsurePalete(true);
}

function wmsBipInitStepper() {
    var nav = document.getElementById('wms-bip-stepper');
    if (!nav || nav.dataset.wmsBipBind) return;
    nav.dataset.wmsBipBind = '1';
    nav.addEventListener('click', function(ev) {
        var btn = ev.target.closest('.wms-bip-step[data-wms-bip-step]');
        if (!btn || btn.disabled) return;
        wmsBipIrParaEtapa(parseInt(btn.getAttribute('data-wms-bip-step'), 10), { semFoco: false });
    });
    var det = document.getElementById('wms-recebimento-detalhe');
    if (det && !det.dataset.wmsBipCabBind) {
        det.dataset.wmsBipCabBind = '1';
        det.addEventListener('click', function(ev) {
            var cab = ev.target.closest('.wms-rec-etapa-cab');
            if (!cab) return;
            var etapa = cab.closest('[data-wms-bip-step]');
            if (!etapa || etapa.classList.contains('wms-rec-etapa--aguardando')) return;
            if (etapa.classList.contains('wms-rec-etapa--feita') && !etapa.classList.contains('wms-rec-etapa--ativa')) {
                wmsBipIrParaEtapa(parseInt(etapa.getAttribute('data-wms-bip-step'), 10), { manterMax: true });
            }
        });
    }
    var bipMan = document.getElementById('wms-bip-etiqueta-manual');
    if (bipMan && !bipMan.dataset.wmsBipEnter) {
        bipMan.dataset.wmsBipEnter = '1';
        bipMan.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); wmsBipPalete(); }
        });
    }
    var btnCola = document.getElementById('btn-wms-etq-cola-ok');
    if (btnCola) btnCola.addEventListener('click', function() {
        window._wmsBipResumo.impresso = true;
        wmsBipIrParaEtapa(3);
        showMessage('Leve o palete ao endereço da etiqueta e bipe a longarina/coluna — confirma automaticamente.', 'success');
    });
    wmsInitBipDestinoAutoConfirm();
    var btnProx = document.getElementById('btn-wms-bip-proximo-palete');
    if (btnProx) btnProx.addEventListener('click', wmsBipResetNovoPalete);
    var valEl = document.getElementById('wms-pal-validade');
    if (valEl && !valEl.dataset.wmsBipEnter) {
        valEl.dataset.wmsBipEnter = '1';
        valEl.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); wmsBipProduto(); }
        });
    }
}

window.wmsAbrirRecebimento = function(id) {
    wmsSincronizarRecebimentoAberto(id, { resetarPalete: true });
};

window._wmsSugestaoAtual = null;
window._wmsDestinoManual = false;

function _wmsAplicarModoDestinoSugestao() {
    var dest = document.getElementById('wms-bip-destino');
    var btnManual = document.getElementById('btn-wms-destino-manual');
    var btnSug = document.getElementById('btn-wms-usar-sugestao');
    var manual = !!window._wmsDestinoManual;
    if (dest) {
        dest.readOnly = false;
        dest.style.background = '#fff';
        dest.style.fontWeight = dest.value ? 'bold' : 'normal';
        if (!dest.value) {
            dest.placeholder = manual
                ? 'Digite o endereço ou bip a longarina/coluna…'
                : 'Bipe a etiqueta da longarina/coluna (ex.: 11.5.2.1)…';
        }
    }
    if (btnManual) btnManual.style.display = manual ? 'none' : '';
    if (btnSug) btnSug.style.display = manual ? '' : 'none';
}

function _wmsResetDestinoSugestao() {
    window._wmsDestinoManual = false;
    window._wmsSugestaoAtual = null;
    var dest = document.getElementById('wms-bip-destino');
    if (dest) dest.value = '';
    _wmsAplicarModoDestinoSugestao();
}

window.wmsHabilitarDestinoManual = function() {
    window._wmsDestinoManual = true;
    _wmsAplicarModoDestinoSugestao();
    var dest = document.getElementById('wms-bip-destino');
    if (dest) { dest.focus(); dest.select(); }
    showMessage('Modo manual: o endereço digitado substitui a indicação do sistema.', 'warning');
};

window.wmsUsarSugestaoDestino = function() {
    window._wmsDestinoManual = false;
    var sug = window._wmsSugestaoAtual;
    if (!sug || !sug.codigo_endereco) {
        wmsSugerirDestino();
        return;
    }
    var dest = document.getElementById('wms-bip-destino');
    if (dest) dest.value = '';
    _wmsAplicarModoDestinoSugestao();
    if (dest) dest.focus();
    showMessage('Indicação do sistema restaurada — bipe a etiqueta da longarina/coluna indicada acima.', 'success');
};

function _wmsMostrarSugestao(sug) {
    var box = document.getElementById('wms-sugestao-destino');
    var dest = document.getElementById('wms-bip-destino');
    if (!box) return;
    window._wmsSugestaoAtual = sug || null;
    if (!sug || !sug.codigo_endereco) {
        box.style.display = 'block';
        box.style.background = '#fff3e0';
        box.style.border = '1px solid #ffb74d';
        box.innerHTML = '<strong>Sem indicação automática:</strong> ' + escHtml((sug && sug.motivo && sug.motivo.join(' · ')) || 'Nenhuma posição vazia.') +
            ' Use <em>Alterar endereço manualmente</em> se necessário.';
        wmsBipAtualizarEnderecoEtapa2();
        return;
    }
    var alerta = sug.alerta ? '<br><span style="color:#e65100;font-weight:bold;">⚠ ' + escHtml(sug.alerta) + '</span>' : '';
    var st = sug.status_condicional ? ' · Status: <strong>' + escHtml(sug.status_condicional) + '</strong>' : '';
    var priLbl = {
        adensamento_lote: 'mesmo SKU e lote',
        zoneamento: 'FIFO + cluster + categoria'
    };
    var priTxt = priLbl[sug.prioridade] || 'putaway inteligente';
    var bcLong = sug.barcode_longarina || sug.codigo_endereco;
    box.style.display = 'block';
    box.style.background = '#e8f5e9';
    box.style.border = '1px solid #81c784';
    box.style.padding = '10px';
    box.style.borderRadius = '8px';
    box.innerHTML = '<strong style="color:#1b5e20;">✓ Onde colocar — indicação do sistema (' + escHtml(sug.zona_label || 'PULMÃO') + ')</strong><br>' +
        '<span style="font-size:16px;font-weight:bold;">' + escHtml(bcLong) + '</span> <span style="font-size:12px;color:#555;">(bip longarina)</span> — ' + escHtml(sug.texto || '') + st + alerta +
        '<br><span style="font-size:12px;color:#2e7d32;">Critério: ' + escHtml(priTxt) + ' · ' + escHtml((sug.motivo || []).join(' · ')) + '</span>' +
        '<br><span style="font-size:12px;color:#555;">Bipe a etiqueta da longarina/coluna — a entrada confirma automaticamente.</span>';
    if (window._wmsBipEtapa >= 3 && dest && !window._wmsDestinoManual) dest.focus();
    _wmsAplicarModoDestinoSugestao();
    wmsBipAtualizarEnderecoEtapa2();
}

async function wmsBipPalete() {
    var rid = (document.getElementById('wms-rec-detalhe-id') || {}).value;
    if (!rid) { showMessage('Selecione um recebimento.', 'error'); return; }
    var manual = document.getElementById('wms-bip-etiqueta-manual');
    var etiqueta = (manual && manual.value ? manual.value : '') || '';
    if (!etiqueta.trim()) {
        showMessage('Informe o código de 22 caracteres da etiqueta já colada no palete.', 'warning');
        return;
    }
    var data = await fetchAPI('/wms/recebimentos', {
        method: 'POST',
        body: JSON.stringify({ acao: 'bip_palete', recebimento_id: parseInt(rid, 10), etiqueta: etiqueta.trim() })
    });
    if (data && data.ok) {
        var hid = document.getElementById('wms-rec-palete-id');
        if (hid) hid.value = String(data.palete_id);
        window._wmsBipResumo.palete = data.etiqueta || '';
        wmsBipAtualizarCodigoPaleteUI(data.etiqueta);
        wmsBipAtualizarResumos();
        showMessage('Etiqueta de palete vinculada.', 'success');
    } else {
        showMessage((data && data.erro) || 'Erro ao vincular etiqueta do palete.', 'error');
    }
}

async function wmsBipProduto() {
    var btn = document.getElementById('btn-wms-bip-produto');
    wmsMostrarErroBipProduto('');
    var rid = await wmsGarantirRecebimentoAberto();
    if (!rid) return;
    var skuRaw = wmsNormalizarCodigoBip((document.getElementById('wms-pal-sku') || {}).value);
    if (!skuRaw) {
        wmsMostrarErroBipProduto('Bipe o EAN ou SKU da etiqueta de produto.');
        var skuEl = document.getElementById('wms-pal-sku');
        if (skuEl) skuEl.focus();
        return;
    }
    var dp = (document.getElementById('wms-pal-producao') || {}).value || '';
    var dv = (document.getElementById('wms-pal-validade') || {}).value || '';
    if (!dp) { wmsMostrarErroBipProduto('Informe a data de produção.'); return; }
    if (!dv) { wmsMostrarErroBipProduto('Informe a data de validade.'); return; }
    var qtd = parseInt((document.getElementById('wms-pal-qtd') || {}).value || '1', 10);
    if (isNaN(qtd) || qtd < 1) {
        wmsMostrarErroBipProduto('Informe a quantidade de caixas (mínimo 1).');
        return;
    }
    var criado = await wmsBipEnsurePalete(false);
    if (!criado || !criado.palete_id) return;
    var pid = criado.palete_id;
    var skuResolved = wmsResolverCodigoProdutoNf(skuRaw);
    var body = {
        acao: 'bip_produto',
        palete_id: parseInt(pid, 10),
        estado_palete: (document.getElementById('wms-pal-estado') || {}).value || 'bom',
        item: {
            sku: skuRaw,
            descricao: (skuResolved && skuResolved.descricao) || '',
            lote: ((document.getElementById('wms-pal-lote') || {}).value || '').trim(),
            up: ((document.getElementById('wms-pal-up') || {}).value || '').trim(),
            data_producao: dp,
            data_validade: dv,
            quantidade_caixas: qtd
        }
    };
    if (skuResolved && skuResolved.sku) body.item.sku = skuResolved.sku;
    if (btn) { btn.disabled = true; btn.textContent = 'Conferindo…'; }
    var msg = document.getElementById('wms-palete-gerado');
    try {
        var data = await fetchAPIComTimeout('/wms/recebimentos', { method: 'POST', body: JSON.stringify(body) }, 90000);
        if (data && data.ok) {
            var skuTxt = body.item.sku || '';
            var loteTxt = body.item.lote ? ' · lote ' + body.item.lote : '';
            var upTxt = body.item.up ? ' · UP ' + body.item.up : '';
            window._wmsBipResumo.produto = skuTxt + loteTxt + upTxt;
            window._wmsBipResumo.palete = data.etiqueta || window._wmsBipResumo.palete || '';
            wmsBipAtualizarCodigoPaleteUI(window._wmsBipResumo.palete);
            var txt = 'Produto conferido no palete ' + (data.etiqueta || '');
            if (data.bloqueios && data.bloqueios.length) txt += ' — Bloqueios: ' + data.bloqueios.join(', ');
            if (msg) msg.textContent = txt;
            _wmsMostrarSugestao(data.sugestao);
            wmsBipIrParaEtapa(2);
            showMessage('Produto OK — imprima a etiqueta do palete e cole no meio dele.', 'success');
            wmsAtualizarPainelNfDescarga();
        } else {
            wmsMostrarErroBipProduto((data && data.erro) || 'Erro ao confirmar produto.');
        }
    } catch (e) {
        wmsMostrarErroBipProduto((e && e.message) || 'Erro ao confirmar produto.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Confirmar produto'; }
    }
}

async function wmsImprimirEtiqueta() {
    var btn = document.getElementById('btn-wms-imprimir-etiqueta');
    var etiqueta = (document.getElementById('wms-bip-etiqueta') || {}).value || '';
    if (!etiqueta || etiqueta.length !== 22) {
        showMessage('Confira o produto no passo 1 antes de imprimir a etiqueta do palete.', 'error');
        wmsBipIrParaEtapa(1);
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Preparando…'; }
    try {
        await wmsGarantirSugestaoDestino(true);
        var url = '/api/wms/etiqueta?etiqueta=' + encodeURIComponent(etiqueta);
        var fmt = wmsFormatarDestinoEtiqueta(window._wmsSugestaoAtual);
        if (fmt) {
            url += '&destino=' + encodeURIComponent(fmt.destino);
            url += '&barcode_longarina=' + encodeURIComponent(fmt.barcode);
            if (fmt.texto) url += '&endereco_texto=' + encodeURIComponent(fmt.texto);
        }
        var w = window.open(url, '_blank');
        if (!w) {
            showMessage('Pop-up bloqueado — libere pop-ups para imprimir.', 'error');
            return;
        }
        window._wmsBipResumo.impresso = true;
        wmsBipAtualizarResumos();
        var avisoEnd = fmt ? '' : ' Endereço não calculado — verifique vagas no armazém.';
        showMessage('Etiqueta enviada à impressora. Cole no palete e clique em «Etiqueta colada — continuar».' + avisoEnd, fmt ? 'success' : 'warning');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Imprimir etiqueta'; }
    }
}

async function wmsSugerirDestino() {
    var pid = (document.getElementById('wms-rec-palete-id') || {}).value;
    if (!pid) { showMessage('Bipe palete e produto primeiro.', 'error'); return; }
    var data = await fetchAPI('/wms/recebimentos', {
        method: 'POST',
        body: JSON.stringify({ acao: 'sugerir_destino', palete_id: parseInt(pid, 10) })
    });
    if (data && !data.erro) {
        _wmsMostrarSugestao(data);
    } else {
        showMessage((data && data.erro) || 'Erro ao obter indicação de destino.', 'error');
    }
}

async function wmsConfirmarDestino() {
    if (window._wmsConfirmandoDestino) return;
    var pid = (document.getElementById('wms-rec-palete-id') || {}).value;
    if (!pid) { showMessage('Bipe palete e produto antes de confirmar.', 'error'); return; }
    var manual = !!window._wmsDestinoManual;
    var cod = ((document.getElementById('wms-bip-destino') || {}).value || '').trim();
    if (!cod) {
        showMessage(manual
            ? 'Informe o endereço ou bipe a etiqueta da longarina/coluna.'
            : 'Bipe a etiqueta da longarina ou coluna — confirma automaticamente.', 'error');
        var destErr = document.getElementById('wms-bip-destino');
        if (destErr) destErr.focus();
        return;
    }
    if (!manual && (!window._wmsSugestaoAtual || !window._wmsSugestaoAtual.codigo_endereco)) {
        await wmsSugerirDestino();
        if (!window._wmsSugestaoAtual || !window._wmsSugestaoAtual.codigo_endereco) {
            showMessage('Não há indicação de destino. Altere manualmente ou libere vagas no armazém.', 'error');
            return;
        }
    }
    var body = {
        acao: 'confirmar_armazenagem',
        palete_id: parseInt(pid, 10),
        usar_sugestao: !manual,
        codigo_endereco: cod
    };
    var btn = document.getElementById('btn-wms-confirmar-destino');
    window._wmsConfirmandoDestino = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Confirmando…'; }
    try {
        var data = await fetchAPI('/wms/recebimentos', { method: 'POST', body: JSON.stringify(body) });
        if (data && data.ok) {
            clearTimeout(_wmsDestinoBipTimer);
            var st = data.status_atualizado || {};
            var stTxt = Object.keys(st).map(function(k) { return k + ': ' + st[k]; }).join(' · ');
            var endFinal = (data.localizacao && data.localizacao.codigo_endereco) || body.codigo_endereco || cod;
            window._wmsBipResumo.endereco = endFinal;
            window._wmsBipMaxEtapa = 3;
            document.querySelectorAll('.wms-bip-step[data-wms-bip-step]').forEach(function(btnStep) {
                btnStep.classList.remove('wms-bip-step--ativa');
                btnStep.classList.add('wms-bip-step--feita');
                btnStep.disabled = false;
            });
            document.querySelectorAll('.wms-rec-etapa[data-wms-bip-step]').forEach(function(el) {
                el.classList.remove('wms-rec-etapa--ativa', 'wms-rec-etapa--aguardando');
                el.classList.add('wms-rec-etapa--feita');
            });
            wmsBipAtualizarResumos();
            showMessage('Palete guardado em ' + endFinal + (manual ? ' (manual)' : '') +
                (stTxt ? ' · ' + stTxt : ''), 'success');
            loadWmsPainel();
            loadWmsProdutos();
            wmsAtualizarPainelNfDescarga();
            var btnProx = document.getElementById('btn-wms-bip-proximo-palete');
            if (btnProx) btnProx.style.display = '';
            var txtAcao = document.getElementById('wms-bip-acao-texto');
            if (txtAcao) txtAcao.textContent = 'Palete guardado! Clique em «Próximo palete» para montar outro ou «Finalizar NF» quando terminar a nota.';
        } else {
            if (data && data.sugestao) _wmsMostrarSugestao(data.sugestao);
            showMessage((data && data.erro) || 'Erro ao confirmar destino.', 'error');
            var destFail = document.getElementById('wms-bip-destino');
            if (destFail) { destFail.value = ''; destFail.focus(); }
        }
    } finally {
        window._wmsConfirmandoDestino = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Confirmar guardado'; }
    }
}

function loadWmsSeparacao() {
    _wmsSetTbody('wms-tbody-separacao', 10, 'Informe roteiro e viagem e clique em Gerar lista.');
}

async function loadWmsPickingLista() {
    var roteiro = (document.getElementById('wms-pick-roteiro') || {}).value || '';
    var viagem = (document.getElementById('wms-pick-viagem') || {}).value || '';
    if (!roteiro.trim() || !viagem.trim()) {
        showMessage('Informe id_roteiro e id_viagem.', 'error');
        return;
    }
    _wmsSetTbody('wms-tbody-separacao', 10, '<span class="loading">Carregando romaneio + estoque WMS...</span>');
    var tb = document.getElementById('wms-tbody-separacao');
    try {
        var path = '/wms/picking?id_roteiro=' + encodeURIComponent(roteiro.trim()) + '&id_viagem=' + encodeURIComponent(viagem.trim());
        var data = await _wmsFetchGet(path, 60000);
        if (!tb) return;
        if (!data || data.erro) {
            tb.innerHTML = '<tr><td colspan="10">' + escHtml(_wmsErroMsg(data, 'Erro ao gerar picking.')) + '</td></tr>';
            if (data && data.erro) showMessage(data.erro, 'error');
            return;
        }
        var itens = data.itens || [];
        if (!itens.length) {
            tb.innerHTML = '<tr><td colspan="10">Nenhum item para separar.</td></tr>';
            return;
        }
        function corStatus(st) {
            st = (st || '').toLowerCase();
            if (st === 'vermelho') return '#ffcdd2';
            if (st === 'amarelo') return '#fff9c4';
            if (st === 'excedido') return '#ffe0b2';
            if (st === 'verde') return '#e8f5e9';
            return '';
        }
        tb.innerHTML = itens.map(function(it) {
            var alerta = it.alerta ? ' style="background:#fff3e0;"' : '';
            var bg = corStatus(it.status_condicional);
            if (bg && !it.alerta) alerta = ' style="background:' + bg + ';"';
            var qtd = it.quantidade_separar != null ? it.quantidade_separar : it.quantidade_romaneio;
            return '<tr' + alerta + '><td>' + escHtml(it.sequencia) + '</td><td><strong>' + escHtml(it.sku) + '</strong></td><td><strong>' + escHtml(it.status_condicional || '—') + '</strong></td><td>' + escHtml(qtd) + '</td><td>' + escHtml(it.endereco || '—') + '</td><td>' + escHtml(it.texto || it.alerta || '—') + '</td><td>' + escHtml(it.zona_label || '—') + '</td><td>' + escHtml(it.data_producao || '—') + '</td><td>' + escHtml(it.etiqueta || '—') + '</td><td>' + (it.alerta ? escHtml(it.alerta) : '') + '</td></tr>';
        }).join('');
        showMessage('Lista de separação: ' + itens.length + ' linha(s). Vermelho primeiro.', 'success');
    } catch (e) {
        if (tb) tb.innerHTML = '<tr><td colspan="10">' + escHtml((e && e.message) || 'Erro ao gerar picking.') + '</td></tr>';
        showMessage('Erro ao gerar lista de separação WMS.', 'error');
    }
}

async function wmsCriarRecebimento() {
    var btn = document.getElementById('btn-wms-novo-recebimento');
    if (btn) btn.disabled = true;
    var nf = (document.getElementById('wms-rec-nf') || {}).value || '';
    if (!String(nf).trim()) {
        if (btn) btn.disabled = false;
        showMessage('Informe o número da NF.', 'error');
        return;
    }
    var terDoc = (document.getElementById('wms-rec-terceiros-doc-id') || {}).value || '';
    if (!terDoc) {
        await wmsBuscarNfDescarga();
        terDoc = (document.getElementById('wms-rec-terceiros-doc-id') || {}).value || '';
    }
    var body = {
        numero_nf: nf.trim(),
        fornecedor: (document.getElementById('wms-rec-fornecedor') || {}).value || '',
        placa: (document.getElementById('wms-rec-placa') || {}).value || '',
        terceiros_documento_id: terDoc ? parseInt(terDoc, 10) : null,
        terceiros_area: (document.getElementById('wms-rec-terceiros-area') || {}).value || ''
    };
    var data = await fetchAPI('/wms/recebimentos', { method: 'POST', body: JSON.stringify(body) });
    if (btn) btn.disabled = false;
    if (data && data.ok) {
        var msg = 'Recebimento #' + data.id + ' criado.';
        if (data.terceiros_documento_id) msg += ' Vinculado à NF do módulo descarga (doc #' + data.terceiros_documento_id + ').';
        showMessage(msg, 'success');
        wmsAbrirRecebimento(data.id);
        loadWmsRecebimentos();
    } else {
        showMessage((data && data.erro) || 'Erro ao criar recebimento.', 'error');
    }
}

async function wmsConferirPalete() {
    var rid = (document.getElementById('wms-rec-detalhe-id') || {}).value;
    if (!rid) { showMessage('Selecione um recebimento.', 'error'); return; }
    var body = {
        acao: 'conferir_palete',
        recebimento_id: parseInt(rid, 10),
        estado_palete: (document.getElementById('wms-pal-estado') || {}).value || 'bom',
        item: {
            sku: (document.getElementById('wms-pal-sku') || {}).value || '',
            lote: (document.getElementById('wms-pal-lote') || {}).value || '',
            data_validade: (document.getElementById('wms-pal-validade') || {}).value || '',
            quantidade_caixas: parseInt((document.getElementById('wms-pal-qtd') || {}).value || '1', 10)
        }
    };
    var data = await fetchAPI('/wms/recebimentos', { method: 'POST', body: JSON.stringify(body) });
    var msg = document.getElementById('wms-palete-gerado');
    if (data && data.ok) {
        var txt = 'Palete ' + data.etiqueta + ' (' + data.etiqueta.length + ' chars)';
        if (data.bloqueios && data.bloqueios.length) txt += ' — Bloqueios: ' + data.bloqueios.join(', ');
        if (msg) msg.textContent = txt;
        showMessage('Palete conferido.', 'success');
    } else {
        showMessage((data && data.erro) || 'Erro na conferência.', 'error');
    }
}

async function wmsFinalizarRecebimento() {
    var rid = (document.getElementById('wms-rec-detalhe-id') || {}).value;
    if (!rid) return;
    var data = await fetchAPI('/wms/recebimentos', {
        method: 'POST',
        body: JSON.stringify({ acao: 'finalizar', recebimento_id: parseInt(rid, 10), respostas: [] })
    });
    if (data && data.ok) {
        var msg = 'Recebimento finalizado. Movimentações geradas: ' + (data.movimentacoes_geradas || 0);
        if (data.terceiros && data.terceiros.recebimento_concluido) {
            msg += ' · Pendência de recebimento atualizada no módulo descarga.';
        } else if (data.terceiros && data.terceiros.erro) {
            msg += ' · Aviso terceiros: ' + data.terceiros.erro;
        }
        showMessage(msg, 'success');
        loadWmsRecebimentos();
        loadWmsMovimentacoes();
        loadWmsPainel();
    } else {
        showMessage((data && data.erro) || 'Erro ao finalizar.', 'error');
    }
}

async function wmsCriarInventario() {
    var body = {
        tipo: (document.getElementById('wms-inv-tipo') || {}).value || 'localizacao',
        camara: (document.getElementById('wms-inv-camara') || {}).value || null,
        descricao: (document.getElementById('wms-inv-desc') || {}).value || ''
    };
    var data = await fetchAPI('/wms/inventarios', { method: 'POST', body: JSON.stringify(body) });
    if (data && data.ok) {
        showMessage('Inventário #' + data.id + ' com ' + data.linhas + ' posições.', 'success');
        loadWmsInventarios();
    } else {
        showMessage((data && data.erro) || 'Erro ao criar inventário.', 'error');
    }
}

async function loadWmsInventarios() {
    _wmsSetTbody('wms-tbody-inventarios', 4, '<span class="loading">Carregando...</span>');
    var tb = document.getElementById('wms-tbody-inventarios');
    try {
        var data = await _wmsFetchGet('/wms/inventarios', 45000);
        if (!tb) return;
        if (!data || data.erro) {
            tb.innerHTML = '<tr><td colspan="4">' + escHtml(_wmsErroMsg(data, 'Erro ao carregar inventários.')) + '</td></tr>';
            return;
        }
        var rows = data.inventarios || [];
        tb.innerHTML = rows.length ? rows.map(function(i) {
            return '<tr><td>' + escHtml(i.id) + '</td><td>' + escHtml(i.tipo) + '</td><td>' + escHtml(i.descricao) + '</td><td>' + escHtml(i.status) + '</td></tr>';
        }).join('') : '<tr><td colspan="4">Nenhum inventário.</td></tr>';
    } catch (e) {
        if (tb) tb.innerHTML = '<tr><td colspan="4">' + escHtml((e && e.message) || 'Erro ao carregar inventários.') + '</td></tr>';
        showMessage('Erro ao carregar inventários WMS.', 'error');
    }
}

async function loadWmsPesquisaSku() {
    var tb = document.getElementById('wms-tbody-pesquisa');
    var q = (document.getElementById('wms-pesq-q') || {}).value || '';
    if (tb) tb.innerHTML = '<tr><td colspan="7"><span class="loading">Carregando...</span></td></tr>';
    try {
        var data = await _wmsFetchGet('/wms/pesquisa-sku?q=' + encodeURIComponent(q), 45000);
        if (!tb) return;
        if (!data || data.erro) {
            tb.innerHTML = '<tr><td colspan="7">' + escHtml(_wmsErroMsg(data, 'Erro na pesquisa.')) + '</td></tr>';
            return;
        }
        var res = data.resumo_estoque_real;
        var head = '';
        if (res && res.sku) {
            head = '<tr style="background:#e3f2fd;font-weight:bold;"><td colspan="7">Estoque real WMS — ' +
                escHtml(res.sku) + ': ' + escHtml(res.estoque_atual) + ' cx · ' + escHtml(res.posicao_atual) +
                ' pos. · Status ' + escHtml(res.status_condicional || 'Verde') + '</td></tr>';
        }
        var rows = data.resultados || [];
        tb.innerHTML = head + (rows.length ? rows.map(function(r) {
            return '<tr><td>' + escHtml(r.sku) + '</td><td>' + escHtml(r.lote || '') + '</td><td>' + escHtml(r.data_validade || '') + '</td><td>' + escHtml(r.etiqueta || '') + '</td><td>' + escHtml(r.codigo_endereco || '') + '</td><td>' + escHtml(r.bloqueio_tipo || '') + '</td><td>' + escHtml(r.quantidade_caixas) + '</td></tr>';
        }).join('') : (head ? '' : '<tr><td colspan="7">Nenhum resultado.</td></tr>'));
    } catch (e) {
        if (tb) tb.innerHTML = '<tr><td colspan="7">' + escHtml((e && e.message) || 'Erro na pesquisa.') + '</td></tr>';
        showMessage('Erro na pesquisa WMS.', 'error');
    }
}

function initTerceirosTabs() {
    var sessDoc = _lerTerceirosDocumentoNaSessao();
    if (sessDoc && sessDoc.tab && sessDoc.tab !== 'pendencia-recebimento') {
        _limparTerceirosDocumentoNaSessao();
    }
    var botoes = document.querySelectorAll('.terceiros-subtab[data-ter-tab]');
    var painel = document.getElementById('terceiros-panel-painel');
    var enviarXml = document.getElementById('terceiros-panel-enviar-xml');
    var recebimento = document.getElementById('terceiros-panel-recebimento');
    var fornecedoresRecebidos = document.getElementById('terceiros-panel-fornecedores-recebidos');
    var pendentesLancamento = document.getElementById('terceiros-panel-pendentes-lancamento');
    var notasLancadas = document.getElementById('terceiros-panel-notas-lancadas');
    var notasEnviadasMg = document.getElementById('terceiros-panel-notas-enviadas-mg');
    var recebimentosMg = document.getElementById('terceiros-panel-recebimentos-mg');
    var pendenciasMg = document.getElementById('terceiros-panel-pendencias-mg');
    var historico = document.getElementById('terceiros-panel-historico');
    var relatorios = document.getElementById('terceiros-panel-relatorios');
    if (!botoes.length || !painel || !enviarXml || !recebimento || !fornecedoresRecebidos || !pendentesLancamento || !notasLancadas || !notasEnviadasMg || !recebimentosMg || !pendenciasMg || !historico || !relatorios) return;

    function mostrarTerTab(tab) {
        var aba = _terceirosNormalizarAbaTab(tab);
        terceirosAplicarPainelAbaSomenteUi(aba);
        void recarregarListaTerceirosTab(aba);
    }

    botoes.forEach(function(btn) {
        btn.addEventListener('click', function() {
            mostrarTerTab(btn.getAttribute('data-ter-tab') || 'painel');
        });
    });

    window.terceirosMostrarAba = mostrarTerTab;
    var btnTerDescargaCancel = document.getElementById('btn-ter-descarga-loading-cancel');
    if (btnTerDescargaCancel) {
        btnTerDescargaCancel.addEventListener('click', cancelarCarregandoDescargaTerceiros);
    }
    var btnTerAcaoCancel = document.getElementById('btn-ter-acao-loading-cancel');
    if (btnTerAcaoCancel) {
        btnTerAcaoCancel.addEventListener('click', cancelarTerAcaoLoading);
    }
    var tabInicial = 'painel';
    var sub = _lerTerceirosSubabaNaSessao();
    if (sub && sub.tab) {
        tabInicial = sub.tab;
    } else {
        var sessTab = _lerTerceirosDocumentoNaSessao();
        if (sessTab && sessTab.tab) tabInicial = sessTab.tab;
    }
    removerTerceirosBotoesVoltarAba();
    var btnTerVoltarLista = document.getElementById('btn-ter-voltar-lista-nf');
    if (btnTerVoltarLista) {
        btnTerVoltarLista.addEventListener('click', terceirosVoltarDaNotaParaLista);
    }
    void _terceirosGarantirPrefetchLista();
    mostrarTerTab(tabInicial);
}

/** Após init: reabre pendência + NF só com ?modulo=terceiros (F5 na descarga). Não rouba outras telas. */
async function restaurarTerceirosUltimaNotaSeSessao() {
    var urlMod = '';
    try {
        urlMod = (new URL(window.location.href).searchParams.get('modulo') || '').toLowerCase();
    } catch (e) {}
    if (urlMod !== 'terceiros') return;

    var o = _lerTerceirosDocumentoNaSessao();
    if (!o || !o.id) return;
    if ((o.tab || '') !== 'pendencia-recebimento') {
        _limparTerceirosDocumentoNaSessao();
        return;
    }
    if (window.controleMostrarModulo) window.controleMostrarModulo('terceiros');
    var area = (o.area === 'expedicao' || o.area === 'carreta') ? o.area : 'recebimento';
    try {
        var data = await fetchTerceirosDocumentosTodos();
        var rows = _terceirosMesclarRecebidosLocaisNasRows(data.rows || []);
        var row = rows.filter(function(r) { return String(r.id) === String(o.id); })[0];
        if (row && !_terceirosConsideraPendenciaRecebimento(row)) {
            _limparTerceirosDocumentoNaSessao();
            _persistirTerceirosSubabaNaSessao('fornecedores-recebidos');
            if (window.terceirosMostrarAba) window.terceirosMostrarAba('fornecedores-recebidos');
            definirDestaqueLinhaTerceirosDoc(o.id);
            return;
        }
    } catch (e) {
        console.error(e);
    }
    if (window.terceirosMostrarAba) window.terceirosMostrarAba('pendencia-recebimento');
    void loadTerceirosDocumentoDetalhe(area, o.id);
}

// Sistema de Abas
function _carregErroMsg(data, fallback) {
    if (data && data._timeout) return 'Tempo esgotado ao carregar. Tente novamente em alguns segundos.';
    if (data && data.erro) return String(data.erro);
    if (data === null) return 'Falha de conexão com o servidor.';
    return fallback || 'Erro ao carregar dados.';
}

async function _carregFetchGet(path, timeoutMs) {
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return fetchAPIComTimeout(path + sep + '_=' + Date.now(), {}, timeoutMs || 60000);
}

var _modErroMsg = _carregErroMsg;
var _modFetchGet = _carregFetchGet;

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            var t = button.getAttribute('data-tab');
            if (t === 'baixa-ravex' && typeof prefetchBaixadosRavex === 'function') {
                prefetchBaixadosRavex('carregamento');
            }
            if (t === 'conferencia') {
                var idPre = (document.getElementById('id-viagem') && document.getElementById('id-viagem').value.trim())
                    || (document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value.trim()) || '';
                if (idPre && !_cacheExtratoObter(idPre, 'carregamento')) {
                    fetchAPI('/conferencia/' + encodeURIComponent(idPre) + _conferenciaQueryRapida()).then(function(r) {
                        if (r && !r.erro) _cacheExtratoSalvar(idPre, 'carregamento', r);
                    }).catch(function() {});
                }
            }
        }, { passive: true });
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            if (typeof sairConferenciaListaMaximizadaSeAtiva === 'function') sairConferenciaListaMaximizadaSeAtiva();
            
            // Remover active de todos
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Adicionar active no selecionado
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            // Recarregar dados da aba ativa
            loadTabData(targetTab);
        });
    });
}

// Carregar dados da aba específica (retorna Promise para poder await)
function loadTabData(tab) {
    switch(tab) {
        case 'painel':
            initPainelPlacasFiltroData();
            return loadPainelCompleto();
        case 'base':
            return loadBasePlanilha();
        case 'conferencia': {
            var idV = (document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value) || (document.getElementById('id-viagem') && document.getElementById('id-viagem').value) || '';
            idV = (idV && idV.trim()) ? idV.trim() : '';
            if (!idV) {
                showMessage('Digite o ID do roteiro e busque para atualizar a conferência.', 'warning');
                return Promise.resolve();
            }
            return _conferenciaTalvezModalRetorno(idV).then(function(continuar) {
                if (continuar === false) return Promise.resolve();
                _conferenciaSalvarSessao({ id_viagem: idV, visitou_conferencia: true });
                if (_conferenciaTabelaJaCarregada('carregamento', idV) && !_conferenciaTemPendenciasLocais()) {
                    _conferenciaAtualizarAvisoRascunho();
                    return loadEstatisticas();
                }
                return loadConferencia(idV, { forcar: true }).then(function() {
                    loadEstatisticas();
                    _conferenciaAtualizarAvisoRascunho();
                });
            });
        }
        case 'extrato':
            return loadExtrato();
        case 'romaneio':
            return loadRomaneio();
        case 'importar-ravex':
            return Promise.resolve();
        case 'baixa-ravex':
            return loadBaixadosRavex('carregamento');
        case 'divergencias':
            return loadDivergencias(false);
        default:
            return Promise.resolve();
    }
}

function _baixadosRavexScope(scope) {
    return (scope === 'devolucao' || scope === 'dev') ? 'devolucao' : 'carregamento';
}

function _baixadosRavexPrefix(scope) {
    return _baixadosRavexScope(scope) === 'devolucao' ? 'dev-' : '';
}

function _baixadosRavexEl(suffix, scope) {
    return document.getElementById(_baixadosRavexPrefix(scope) + suffix);
}

function _baixadosRavexFiltroState(scope) {
    scope = _baixadosRavexScope(scope);
    if (!window._baixadosRavexFiltrosPorScope) {
        window._baixadosRavexFiltrosPorScope = {};
    }
    if (!window._baixadosRavexFiltrosPorScope[scope]) {
        window._baixadosRavexFiltrosPorScope[scope] = { periodo: 'todos', data_inicio: '', data_fim: '', usuario: '' };
    }
    return window._baixadosRavexFiltrosPorScope[scope];
}

function _baixadosRavexFmtData(iso) {
    var s = String(iso || '').trim();
    if (!s) return '—';
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    return s;
}

/** Texto legível para a coluna Descrição (Baixados Ravex). */
function _baixadosRavexDescricaoImportacao(row) {
    var tipo = String((row && row.tipo) || '').toLowerCase();
    var p = (row && row.parametros) || {};
    if (typeof p === 'string') {
        try { p = JSON.parse(p); } catch (e) { p = {}; }
    }
    p = p || {};
    var partes = [];
    var titulo = '';

    if (p.origem === 'romaneio_por_item') {
        partes.push('Importação legada (agrupada por data)');
        if (p.dataset_id) partes.push('dataset ' + p.dataset_id);
        return { texto: partes.join(' · '), titulo: '' };
    }

    if (tipo === 'id_unico' || (!tipo && (p.id_roteiro || p.id_viagem || p.id_informado))) {
        var idR = String(p.id_roteiro || p.id_informado || '').trim();
        var idV = String(p.id_viagem || '').trim();
        var somenteR = p.somente_roteiro === true || p.somente_roteiro === 'true';
        var viagens = Array.isArray(p.viagens_importadas) ? p.viagens_importadas.map(String).filter(Boolean) : [];
        if (idR) partes.push('Roteiro ' + idR);
        if (somenteR || (!idV && !viagens.length && !p.id_viagem)) {
            partes.push('(sem viagem faturada)');
        } else if (idV) {
            partes.push('Viagem ' + idV);
        } else if (viagens.length === 1) {
            partes.push('Viagem ' + viagens[0]);
        } else if (viagens.length > 1) {
            partes.push(viagens.length + ' viagens');
            titulo = 'Viagens: ' + viagens.join(', ');
        }
        return { texto: partes.join(' · '), titulo: titulo };
    }

    if (tipo === 'periodo') {
        var di = p.data_inicio || '';
        var df = p.data_fim || '';
        if (di || df) {
            partes.push('Período ' + _baixadosRavexFmtData(di) + ' a ' + _baixadosRavexFmtData(df));
        }
        var nImp = (Array.isArray(p.viagens_importadas) ? p.viagens_importadas.length : 0)
            || parseInt(row.viagens_processadas, 10) || 0;
        if (nImp) partes.push(nImp + (nImp === 1 ? ' viagem importada' : ' viagens importadas'));
        var pul = parseInt(p.pulados_duplicados, 10);
        if (pul > 0) partes.push(pul + (pul === 1 ? ' pulada (duplicada)' : ' puladas (duplicadas)'));
        if (Array.isArray(p.viagens_importadas) && p.viagens_importadas.length) {
            titulo = 'IDs viagem: ' + p.viagens_importadas.join(', ');
        }
        return { texto: partes.join(' · ') || 'Sincronização por período', titulo: titulo };
    }

    if (tipo === 'lista') {
        var nIds = parseInt(p.ids_recebidos, 10) || 0;
        if (nIds) partes.push('Lista de ' + nIds + (nIds === 1 ? ' ID' : ' IDs'));
        var nImp2 = (Array.isArray(p.viagens_importadas) ? p.viagens_importadas.length : 0)
            || parseInt(row.viagens_processadas, 10) || 0;
        if (nImp2) partes.push(nImp2 + (nImp2 === 1 ? ' importada' : ' importadas'));
        var pul2 = parseInt(p.pulados_duplicados, 10);
        if (pul2 > 0) partes.push(pul2 + ' pulada(s) (duplicada)');
        if (Array.isArray(p.viagens_importadas) && p.viagens_importadas.length) {
            titulo = 'Importadas: ' + p.viagens_importadas.join(', ');
        }
        return { texto: partes.join(' · ') || 'Importação em lista', titulo: titulo };
    }

    if (p.id_roteiro) partes.push('Roteiro ' + p.id_roteiro);
    if (p.id_viagem) partes.push('Viagem ' + p.id_viagem);
    if (p.id_informado && !p.id_roteiro) partes.push('ID ' + p.id_informado);
    if (!partes.length && Object.keys(p).length) {
        return { texto: 'Importação', titulo: JSON.stringify(p) };
    }
    return { texto: partes.join(' · ') || '—', titulo: Object.keys(p).length ? JSON.stringify(p) : '' };
}

var _BAIXADOS_RAVEX_CACHE_TTL_MS = 120000;

function _cacheBaixadosRavexKey(scope, qs) {
    return _baixadosRavexScope(scope) + '|' + (qs || '');
}

function _cacheBaixadosRavexGet(key) {
    var c = window._cacheBaixadosRavex && window._cacheBaixadosRavex[key];
    if (!c || !c.resp) return null;
    if (Date.now() - (c.ts || 0) > _BAIXADOS_RAVEX_CACHE_TTL_MS) return null;
    return c.resp;
}

function _cacheBaixadosRavexSet(key, resp) {
    if (!window._cacheBaixadosRavex) window._cacheBaixadosRavex = {};
    window._cacheBaixadosRavex[key] = { ts: Date.now(), resp: resp };
}

function _cacheBaixadosRavexInvalidar(scope) {
    if (!window._cacheBaixadosRavex) return;
    var prefix = _baixadosRavexScope(scope || 'carregamento') + '|';
    Object.keys(window._cacheBaixadosRavex).forEach(function(k) {
        if (k.indexOf(prefix) === 0) delete window._cacheBaixadosRavex[k];
    });
}

function _paintBaixadosRavex(resp, scope, tbody) {
    if (!tbody || !resp) return;
    if (typeof _baixadosRavexPreencherUsuarios === 'function') {
        _baixadosRavexPreencherUsuarios(Array.isArray(resp.usuarios) ? resp.usuarios : [], scope);
    }
    if (typeof _baixadosRavexAtualizarResumoFiltro === 'function') {
        _baixadosRavexAtualizarResumoFiltro(Array.isArray(resp.rows) ? resp.rows.length : 0, scope);
    }
    const rows = Array.isArray(resp.rows) ? resp.rows : [];
    if (!window._baixadosRavexRowsById) window._baixadosRavexRowsById = {};
    rows.forEach(function(r) {
        if (r && r.id != null && r.id !== '') window._baixadosRavexRowsById[String(r.id)] = r;
    });
    if (!rows.length) {
        var msgVazio = (typeof _baixadosRavexTemFiltroAtivo === 'function' && _baixadosRavexTemFiltroAtivo(scope))
            ? 'Nenhum download encontrado com os filtros aplicados.'
            : 'Nenhuma importação registrada ainda.';
        if (resp.fonte === 'vazio' && !(typeof _baixadosRavexTemFiltroAtivo === 'function' && _baixadosRavexTemFiltroAtivo(scope))) {
            msgVazio += scope === 'devolucao'
                ? ' Os romaneios importados do Ravex alimentam as devoluções.'
                : ' Importe pelo menos uma viagem na aba IMPORTAR RAVEX.';
        }
        tbody.innerHTML = '<tr><td colspan="9" class="loading">' + escapeHtml(msgVazio) + '</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(function(r) {
        var desc = (typeof _baixadosRavexDescricaoImportacao === 'function')
            ? _baixadosRavexDescricaoImportacao(r) : { texto: '', titulo: '' };
        var descTxt = desc.texto || '—';
        var descTitle = desc.titulo || descTxt;
        var erros = (r.erros_count != null && r.erros_count !== '')
            ? parseInt(r.erros_count, 10)
            : (Array.isArray(r.erros) ? r.erros.length : 0);
        if (isNaN(erros)) erros = 0;
        var st = String(r.status || '');
        var stHtml = escapeHtml(st);
        if (st === 'DUPLICADO') {
            stHtml = '<span style="color:#e65100;font-weight:700;">' + stHtml + '</span>';
        }
        var importId = r.id != null && r.id !== '' ? String(r.id) : '';
        var acaoHtml = importId
            ? '<button type="button" class="btn btn-secondary btn-sm baixa-ravex-btn-excluir" data-baixa-ravex-import-id="' + escapeHtml(importId) + '" title="Excluir viagem/roteiro e todos os dados relacionados">🗑️ Excluir</button>'
            : '<span class="baixa-ravex-sem-excluir" title="Registro legado sem ID de importação">—</span>';
        return '<tr>'
            + '<td>' + escapeHtml(String(r.criado_em || '')) + '</td>'
            + '<td>' + escapeHtml(String(r.tipo || '')) + '</td>'
            + '<td>' + stHtml + '</td>'
            + '<td class="baixa-ravex-descricao" style="max-width: 520px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="' + escapeHtml(descTitle) + '">' + escapeHtml(descTxt) + '</td>'
            + '<td><strong>' + escapeHtml(String(r.viagens_processadas || 0)) + '</strong></td>'
            + '<td><strong>' + escapeHtml(String(r.total_itens || 0)) + '</strong></td>'
            + '<td>' + escapeHtml(String(r.usuario || '')) + '</td>'
            + '<td>' + (erros ? ('<span style="color:#c62828;font-weight:700;">' + erros + '</span>') : '0') + '</td>'
            + '<td class="baixa-ravex-acoes">' + acaoHtml + '</td>'
            + '</tr>';
    }).join('');
}

function prefetchBaixadosRavex(scope) {
    scope = _baixadosRavexScope(scope);
    var qs = (typeof _baixadosRavexQueryFiltros === 'function') ? _baixadosRavexQueryFiltros(scope) : '?limit=150';
    var key = _cacheBaixadosRavexKey(scope, qs);
    if (_cacheBaixadosRavexGet(key)) return;
    if (window._baixadosRavexPrefetchEmCurso && window._baixadosRavexPrefetchEmCurso[key]) return;
    if (!window._baixadosRavexPrefetchEmCurso) window._baixadosRavexPrefetchEmCurso = {};
    window._baixadosRavexPrefetchEmCurso[key] = true;
    var usuariosOk = window._baixadosRavexUsuariosCarregados && window._baixadosRavexUsuariosCarregados[scope];
    fetchAPI('/ravex/importacoes' + qs + (usuariosOk ? '&usuarios=0' : '&usuarios=1')).then(function(resp) {
        if (resp && !resp.erro) {
            _cacheBaixadosRavexSet(key, resp);
            if (Array.isArray(resp.usuarios) && resp.usuarios.length) {
                if (!window._baixadosRavexUsuariosCarregados) window._baixadosRavexUsuariosCarregados = {};
                window._baixadosRavexUsuariosCarregados[scope] = true;
            }
        }
    }).catch(function() { /* ignore */ }).finally(function() {
        delete window._baixadosRavexPrefetchEmCurso[key];
    });
}

async function loadBaixadosRavex(scope, opts) {
    opts = opts || {};
    scope = _baixadosRavexScope(scope);
    window._baixadosRavexScopeAtivo = scope;
    const tbody = _baixadosRavexEl('tbody-baixa-ravex', scope);
    if (!tbody) return;
    if (typeof initBaixadosRavexFiltros === 'function') initBaixadosRavexFiltros(scope);
    if (typeof initBaixadosRavexExcluir === 'function') initBaixadosRavexExcluir(scope);
    var qs = (typeof _baixadosRavexQueryFiltros === 'function') ? _baixadosRavexQueryFiltros(scope) : '?limit=150';
    var cacheKey = _cacheBaixadosRavexKey(scope, qs);
    var cached = !opts.forcar && _cacheBaixadosRavexGet(cacheKey);
    if (cached) {
        _paintBaixadosRavex(cached, scope, tbody);
    } else {
        var jaTinhaDados = tbody.querySelector('tr:not(.loading)');
        if (!jaTinhaDados) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading">Carregando...</td></tr>';
        }
    }
    var usuariosOk = window._baixadosRavexUsuariosCarregados && window._baixadosRavexUsuariosCarregados[scope];
    try {
        var path = '/ravex/importacoes' + qs + (usuariosOk ? '&usuarios=0' : '&usuarios=1');
        const resp = await _carregFetchGet(path, 60000);
        if (!resp || resp.erro) {
            if (!cached) {
                tbody.innerHTML = '<tr><td colspan="9" class="loading" style="color:#c62828;">' + escapeHtml(_carregErroMsg(resp, 'Erro ao carregar histórico')) + '</td></tr>';
            }
            return;
        }
        if (Array.isArray(resp.usuarios) && resp.usuarios.length) {
            if (!window._baixadosRavexUsuariosCarregados) window._baixadosRavexUsuariosCarregados = {};
            window._baixadosRavexUsuariosCarregados[scope] = true;
        }
        _cacheBaixadosRavexSet(cacheKey, resp);
        _paintBaixadosRavex(resp, scope, tbody);
    } catch (e) {
        if (!cached) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading" style="color:#c62828;">Erro ao carregar histórico. Tente novamente.</td></tr>';
        }
    }
}

function _baixadosRavexResumoExclusao(row) {
    var tipo = String(row.tipo || '');
    var params = row.parametros || {};
    var viagens = Array.isArray(params.viagens_importadas) ? params.viagens_importadas : [];
    var idV = params.id_viagem ? String(params.id_viagem) : '';
    if (idV && viagens.indexOf(idV) < 0) viagens.unshift(idV);
    var nV = parseInt(row.viagens_processadas, 10) || viagens.length || (idV ? 1 : 0);
    var linhas = [
        'Excluir esta importação e TODOS os dados ligados à(s) viagem(ns)?',
        '',
        'Serão apagados: romaneio, histórico Ravex, itens bipados, placa/motorista, responsáveis, período de bipagem, divergências e cadastro de roteiro.',
        '',
        'Tipo: ' + tipo + ' | Viagens: ' + nV + ' | Itens: ' + (row.total_itens || 0)
    ];
    if (viagens.length) {
        var preview = viagens.slice(0, 8).join(', ');
        if (viagens.length > 8) preview += '… (+' + (viagens.length - 8) + ')';
        linhas.push('IDs viagem: ' + preview);
    } else if (params.id_roteiro || params.id_informado) {
        linhas.push('ID informado: ' + (params.id_roteiro || params.id_informado));
    }
    linhas.push('', 'Esta ação não pode ser desfeita.');
    return linhas.join('\n');
}

async function excluirImportacaoRavex(importId, row, scope) {
    importId = String(importId || '').trim();
    if (!importId) return;
    var msg = row ? _baixadosRavexResumoExclusao(row) : ('Excluir importação #' + importId + ' e todos os dados da viagem/roteiro?\n\nEsta ação não pode ser desfeita.');
    if (!window.confirm(msg)) return;
    var btn = document.querySelector('.baixa-ravex-btn-excluir[data-baixa-ravex-import-id="' + importId + '"]');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Excluindo…';
    }
    var resp = await fetchAPI('/ravex/importacoes/' + encodeURIComponent(importId), { method: 'DELETE' });
    if (!resp || resp.erro || !resp.ok) {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🗑️ Excluir';
        }
        showMessage((resp && resp.erro) ? resp.erro : 'Erro ao excluir importação.', 'error');
        return;
    }
    var n = resp.total_viagens != null ? resp.total_viagens : (Array.isArray(resp.viagens_excluidas) ? resp.viagens_excluidas.length : 0);
    showMessage('Importação excluída' + (n ? (' (' + n + ' viagem' + (n === 1 ? '' : 'ns') + ')') : '') + '.', 'success');
    _cacheBaixadosRavexInvalidar(scope);
    loadBaixadosRavex(scope || window._baixadosRavexScopeAtivo || 'carregamento', { forcar: true });
}

function initBaixadosRavexExcluir(scope) {
    scope = _baixadosRavexScope(scope);
    if (!window._baixadosRavexExcluirInitFlags) window._baixadosRavexExcluirInitFlags = {};
    if (window._baixadosRavexExcluirInitFlags[scope]) return;
    var tbody = _baixadosRavexEl('tbody-baixa-ravex', scope);
    if (!tbody) return;
    window._baixadosRavexExcluirInitFlags[scope] = true;
    tbody.addEventListener('click', function(e) {
        var btn = e.target.closest('.baixa-ravex-btn-excluir');
        if (!btn || btn.disabled) return;
        e.preventDefault();
        var importId = btn.getAttribute('data-baixa-ravex-import-id');
        var row = (window._baixadosRavexRowsById && importId) ? window._baixadosRavexRowsById[importId] : null;
        excluirImportacaoRavex(importId, row, scope);
    });
}

function initBaixadosRavexFiltros(scope) {
    scope = _baixadosRavexScope(scope);
    if (!window._baixadosRavexFiltrosInitFlags) window._baixadosRavexFiltrosInitFlags = {};
    if (window._baixadosRavexFiltrosInitFlags[scope]) return;
    window._baixadosRavexFiltrosInitFlags[scope] = true;
    _baixadosRavexFiltroState(scope);
    var panelId = scope === 'devolucao' ? 'devolucoes-panel-baixa-ravex' : 'baixa-ravex';
    var panel = document.getElementById(panelId);
    if (!panel) return;
    panel.querySelectorAll('.baixa-ravex-filtro-data-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var p = btn.getAttribute('data-baixa-ravex-filtro-data') || 'todos';
            var f = _baixadosRavexFiltroState(scope);
            f.periodo = p;
            var di = _baixadosRavexEl('baixa-ravex-filtro-data-inicio', scope);
            var df = _baixadosRavexEl('baixa-ravex-filtro-data-fim', scope);
            if (di) di.value = '';
            if (df) df.value = '';
            f.data_inicio = '';
            f.data_fim = '';
            _baixadosRavexAtualizarBtnsData(scope);
            loadBaixadosRavex(scope);
        });
    });
    var di = _baixadosRavexEl('baixa-ravex-filtro-data-inicio', scope);
    var df = _baixadosRavexEl('baixa-ravex-filtro-data-fim', scope);
    function onDataLivreChange() {
        var f = _baixadosRavexFiltroState(scope);
        f.periodo = 'todos';
        f.data_inicio = di ? di.value : '';
        f.data_fim = df ? df.value : '';
        _baixadosRavexAtualizarBtnsData(scope);
        loadBaixadosRavex(scope);
    }
    if (di) di.addEventListener('change', onDataLivreChange);
    if (df) df.addEventListener('change', onDataLivreChange);
    var selUser = _baixadosRavexEl('baixa-ravex-filtro-usuario', scope);
    if (selUser) {
        selUser.addEventListener('change', function() {
            _baixadosRavexFiltroState(scope).usuario = selUser.value || '';
            loadBaixadosRavex(scope);
        });
    }
}

function _baixadosRavexAtualizarBtnsData(scope) {
    var f = _baixadosRavexFiltroState(scope);
    var temDataLivre = !!(f.data_inicio || f.data_fim);
    var panelId = _baixadosRavexScope(scope) === 'devolucao' ? 'devolucoes-panel-baixa-ravex' : 'baixa-ravex';
    var panel = document.getElementById(panelId);
    if (!panel) return;
    panel.querySelectorAll('.baixa-ravex-filtro-data-btn').forEach(function(btn) {
        var t = btn.getAttribute('data-baixa-ravex-filtro-data') || 'todos';
        btn.classList.toggle('baixa-ravex-filtro-btn--ativo', !temDataLivre && t === (f.periodo || 'todos'));
    });
}

function _baixadosRavexQueryFiltros(scope) {
    var f = _baixadosRavexFiltroState(scope);
    var q = ['limit=150'];
    if (f.data_inicio) q.push('data_inicio=' + encodeURIComponent(f.data_inicio));
    if (f.data_fim) q.push('data_fim=' + encodeURIComponent(f.data_fim));
    if (!f.data_inicio && !f.data_fim && f.periodo && f.periodo !== 'todos') {
        q.push('periodo=' + encodeURIComponent(f.periodo));
    }
    if (f.usuario) q.push('usuario=' + encodeURIComponent(f.usuario));
    return '?' + q.join('&');
}

function _baixadosRavexTemFiltroAtivo(scope) {
    var f = _baixadosRavexFiltroState(scope);
    return !!(f.data_inicio || f.data_fim || (f.periodo && f.periodo !== 'todos') || f.usuario);
}

function _baixadosRavexPreencherUsuarios(usuarios, scope) {
    scope = _baixadosRavexScope(scope);
    var sel = _baixadosRavexEl('baixa-ravex-filtro-usuario', scope);
    if (!sel) return;
    var f = _baixadosRavexFiltroState(scope);
    var atual = f.usuario || sel.value || '';
    var html = '<option value="">Todos</option>';
    (usuarios || []).forEach(function(u) {
        if (!u) return;
        html += '<option value="' + escapeHtml(String(u)) + '">' + escapeHtml(String(u)) + '</option>';
    });
    sel.innerHTML = html;
    sel.value = atual;
    f.usuario = sel.value || '';
}

function _baixadosRavexAtualizarResumoFiltro(total, scope) {
    scope = _baixadosRavexScope(scope);
    var el = _baixadosRavexEl('baixa-ravex-filtro-resumo', scope);
    if (!el) return;
    if (!_baixadosRavexTemFiltroAtivo(scope)) {
        el.style.display = 'none';
        el.textContent = '';
        return;
    }
    var f = _baixadosRavexFiltroState(scope);
    var partes = [];
    if (f.data_inicio || f.data_fim) {
        partes.push('período ' + (f.data_inicio || '…') + ' a ' + (f.data_fim || '…'));
    } else if (f.periodo === 'hoje') {
        partes.push('hoje');
    } else if (f.periodo === 'ontem') {
        partes.push('ontem');
    }
    if (f.usuario) partes.push('usuário ' + f.usuario);
    el.textContent = total + ' registro(s) — filtro: ' + partes.join(', ');
    el.style.display = 'block';
}

// Carregar todos os dados
function loadAllData() {
    var moduloCarreg = document.getElementById('modulo-carregamento');
    if (moduloCarreg && moduloCarreg.hidden) {
        var moduloDev = document.getElementById('modulo-devolucoes');
        if (moduloDev && !moduloDev.hidden) {
            var painelDev = document.getElementById('devolucoes-panel-painel');
            var extratoDev = document.getElementById('devolucoes-panel-extrato');
            var divergenciasDev = document.getElementById('devolucoes-panel-divergencias');
            if (painelDev && painelDev.classList.contains('devolucoes-panel-active')) loadPainelDevolucoes();
            if (extratoDev && extratoDev.classList.contains('devolucoes-panel-active')) loadExtratoDevolucao();
            if (divergenciasDev && divergenciasDev.classList.contains('devolucoes-panel-active')) loadDivergenciasDevolucao(true);
        }
        return;
    }
    const activeTab = document.querySelector('.tab-content.active');
    const activeId = activeTab ? activeTab.id : '';
    if (activeId === 'painel') {
        loadPainelCompleto();
        return;
    }
    if (activeId === 'conferencia') {
        if (_conferenciaUsaRascunhoLocal() && _conferenciaTemPendenciasLocais()) {
            return;
        }
        loadEstatisticas();
        return;
    }
    if (activeId === 'divergencias') {
        loadEstatisticas();
        loadDivergencias(true);
        return;
    }
    loadEstatisticas();
    loadTabData(activeId);
}

async function loadPainelDevolucoes() {
    var tabelasPainel = [['dev-tbody-painel-viagens', 7], ['dev-tbody-painel-itens', 3], ['dev-tbody-painel-veiculos', 3], ['dev-tbody-painel-docas', 3], ['dev-tbody-painel-usuarios', 3]];
    var statIds = ['dev-stat-bipados', 'dev-stat-soma-quantidades', 'dev-stat-unicos', 'dev-stat-viagens', 'dev-stat-docas', 'dev-stat-usuarios'];
    tabelasPainel.forEach(function(pair) {
        var tb = document.getElementById(pair[0]);
        if (tb) tb.innerHTML = '<tr><td colspan="' + pair[1] + '" class="loading">Carregando painel...</td></tr>';
    });
    statIds.forEach(function(sid) {
        var el = document.getElementById(sid);
        if (el) el.textContent = '…';
    });
    try {
    const data = await _modFetchGet('/devolucoes/painel', 60000);
    if (!data) {
        var msgFalha = 'Não foi possível carregar o painel. Use «Atualizar aba» e tente novamente.';
        statIds.forEach(function(sid) {
            var el = document.getElementById(sid);
            if (el) el.textContent = '—';
        });
        tabelasPainel.forEach(function(pair) {
            var tb = document.getElementById(pair[0]);
            if (tb) tb.innerHTML = '<tr><td colspan="' + pair[1] + '" class="loading" style="color:#c62828;">' + escapeHtml(msgFalha) + '</td></tr>';
        });
        destroyPainelDevolucoesCharts();
        return;
    }
    if (data.erro) {
        if (data._falhaGateway) {
            console.warn('Painel de devoluções: servidor indisponível (proxy/gateway).');
            var msgInd = 'Não foi possível carregar o painel no momento. Use o botão «Atualizar aba» no topo e tente de novo.';
            statIds.forEach(function(sid) {
                var el = document.getElementById(sid);
                if (el) el.textContent = '—';
            });
            tabelasPainel.forEach(function(pair) {
                var tb = document.getElementById(pair[0]);
                if (tb) tb.innerHTML = '<tr><td colspan="' + pair[1] + '" class="loading">' + escapeHtml(msgInd) + '</td></tr>';
            });
            destroyPainelDevolucoesCharts();
            return;
        }
        var msgErro = _modErroMsg(data, 'Erro ao carregar painel de devoluções.');
        showMessage('Painel de devoluções: ' + msgErro, 'error');
        statIds.forEach(function(sid) {
            var el = document.getElementById(sid);
            if (el) el.textContent = '—';
        });
        tabelasPainel.forEach(function(pair) {
            var tb = document.getElementById(pair[0]);
            if (tb) tb.innerHTML = '<tr><td colspan="' + pair[1] + '" class="loading" style="color:#c62828;">' + escapeHtml(msgErro) + '</td></tr>';
        });
        destroyPainelDevolucoesCharts();
        return;
    }

    const stats = data.estatisticas || {};
    const set = function(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val != null && val !== '' ? val : '0';
    };
    set('dev-stat-bipados', stats.total_bipados ?? 0);
    set('dev-stat-soma-quantidades', stats.soma_quantidades ?? 0);
    set('dev-stat-unicos', stats.total_unicos ?? 0);
    set('dev-stat-viagens', stats.total_viagens ?? 0);
    set('dev-stat-docas', stats.total_docas ?? 0);
    set('dev-stat-usuarios', stats.total_usuarios ?? 0);

    const preencherTabela = function(tbodyId, rows, emptyMsg, renderRow) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        if (!rows || !rows.length) {
            const cols = tbodyId === 'dev-tbody-painel-viagens' ? 7 : 3;
            tbody.innerHTML = '<tr><td colspan="' + cols + '" class="loading">' + escapeHtml(emptyMsg) + '</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(renderRow).join('');
    };

    preencherTabela('dev-tbody-painel-viagens', data.viagens || [], 'Nenhuma viagem com devolução ainda.', function(v) {
        return '<tr>'
            + '<td><strong>' + escapeHtml(v.id_viagem || '-') + '</strong></td>'
            + '<td>' + escapeHtml(formatarDataHoraPtBR(v.inicio)) + '</td>'
            + '<td>' + escapeHtml(formatarDataHoraPtBR(v.fim)) + '</td>'
            + '<td>' + (v.duracao_minutos != null ? v.duracao_minutos : '-') + '</td>'
            + '<td>' + (v.registros ?? 0) + '</td>'
            + '<td><strong>' + (v.qtd_devolvida ?? 0) + '</strong></td>'
            + '<td>' + (v.itens_unicos ?? 0) + '</td>'
            + '</tr>';
    });

    preencherTabela('dev-tbody-painel-itens', data.top_itens || [], 'Nenhum item devolvido ainda.', function(i) {
        return '<tr>'
            + '<td>' + escapeHtml(i.produto || '-') + '</td>'
            + '<td>' + escapeHtml(i.codigo_barras || '-') + '</td>'
            + '<td><strong>' + (i.total ?? 0) + '</strong></td>'
            + '</tr>';
    });

    preencherTabela('dev-tbody-painel-veiculos', data.veiculos || [], 'Nenhum veículo com devolução ainda.', function(v) {
        return '<tr>'
            + '<td>' + escapeHtml(v.veiculo || '-') + '</td>'
            + '<td>' + (v.registros ?? 0) + '</td>'
            + '<td><strong>' + (v.total ?? 0) + '</strong></td>'
            + '</tr>';
    });

    preencherTabela('dev-tbody-painel-docas', data.docas || [], 'Nenhuma doca usada ainda.', function(d) {
        return '<tr>'
            + '<td>' + escapeHtml(d.doca || '-') + '</td>'
            + '<td>' + (d.registros ?? 0) + '</td>'
            + '<td><strong>' + (d.total ?? 0) + '</strong></td>'
            + '</tr>';
    });

    preencherTabela('dev-tbody-painel-usuarios', data.usuarios || [], 'Nenhum usuário com devolução ainda.', function(u) {
        return '<tr>'
            + '<td>' + escapeHtml(u.usuario || '-') + '</td>'
            + '<td>' + (u.registros ?? 0) + '</td>'
            + '<td><strong>' + (u.total ?? 0) + '</strong></td>'
            + '</tr>';
    });

    renderPainelDevolucoesCharts(data);
    } catch (e) {
        console.error('loadPainelDevolucoes:', e);
        var msgExc = _modErroMsg(null, (e && e.message) || 'Erro ao carregar painel de devoluções.');
        statIds.forEach(function(sid) {
            var el = document.getElementById(sid);
            if (el) el.textContent = '—';
        });
        tabelasPainel.forEach(function(pair) {
            var tb = document.getElementById(pair[0]);
            if (tb) tb.innerHTML = '<tr><td colspan="' + pair[1] + '" class="loading" style="color:#c62828;">' + escapeHtml(msgExc) + '</td></tr>';
        });
        destroyPainelDevolucoesCharts();
    }
}

let terChartEtapas = null;
let terChartBipagemXml = null;
let terChartRemetentes = null;
let terChartPlacas = null;
let terChartUf = null;
let terChartConferencia = null;
let terChartMotoristas = null;
let terChartChegadasCarreta = null;
window._terceirosPainelUltimoData = null;

function _terceirosPainelModuloVisivel() {
    var panel = document.getElementById('terceiros-panel-painel');
    var mod = document.getElementById('modulo-terceiros');
    return !!(panel && mod
        && panel.classList.contains('devolucoes-panel-active')
        && mod.classList.contains('modulo-area--ativo'));
}

function _terceirosAtualizarAlertasHeaderDoCache() {
    var hit = _terceirosObterCacheLista({ staleOk: true });
    if (!hit || !Array.isArray(hit.rows)) return;
    void atualizarAlertasTerceirosHeader(_terceirosMesclarRecebidosLocaisNasRows(hit.rows));
}

function _terceirosAtualizarPainelLocalRapido() {
    _terceirosAtualizarAlertasHeaderDoCache();
    if (!_terceirosPainelModuloVisivel()) return;
    var hit = _terceirosObterCacheLista({ staleOk: true });
    if (!hit || !Array.isArray(hit.rows) || !hit.rows.length) return;
    _terceirosRenderPainelTerceirosData(_terceirosPainelDataLocalFromRows(hit.rows));
}

function _agendarChartsPainelTerceiros() {
    if (!_terceirosPainelModuloVisivel() || !window._terceirosPainelUltimoData || window._terceirosPainelUltimoData.erro) {
        return;
    }
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            if (_terceirosPainelModuloVisivel() && window._terceirosPainelUltimoData) {
                renderPainelTerceirosCharts(window._terceirosPainelUltimoData);
            }
        });
    });
}

function _painelTerceirosStatsRapidasFromRows(rows) {
    rows = Array.isArray(rows) ? rows : [];
    var s = {
        total_nf: rows.length,
        pendencia_recebimento: 0,
        fornecedores_recebidos: 0,
        recebimento_concluido: 0,
        pendentes_lancamento: 0,
        notas_lancadas: 0,
        pendencias_mg: 0,
        recebimentos_mg: 0,
        quantidade_total_xml: 0,
        quantidade_total_bipada: 0,
        nfs_carreta: 0,
        conferencia_ok: 0,
        conferencia_divergente: 0
    };
    rows.forEach(function(row) {
        row = _terceirosRowEstadoMesclado(row);
        var etapaEx = _terceirosEtapaExclusivaDoRow(row);
        var qXml = parseFloat(row.quantidade_total_xml) || 0;
        var qBip = parseFloat(row.quantidade_total_bipada) || 0;
        var divIt = parseInt(row.itens_divergentes, 10) || 0;
        s.quantidade_total_xml += qXml;
        s.quantidade_total_bipada += qBip;
        if ((row.area || '').toLowerCase() === 'carreta') s.nfs_carreta += 1;
        if (isTerceirosFlagSim(row.recebimento_concluido)) s.recebimento_concluido += 1;
        if (_terceirosRowApareceNaEtapa(row, 'fornecedores-recebidos')) s.fornecedores_recebidos += 1;
        if (_terceirosRowApareceNaEtapa(row, 'pendentes-lancamento')) s.pendentes_lancamento += 1;
        if (etapaEx === 'notas-lancadas') s.notas_lancadas += 1;
        if (etapaEx === 'pendencias-mg') s.pendencias_mg += 1;
        if (etapaEx === 'recebimentos-mg') s.recebimentos_mg += 1;
        if (etapaEx === 'pendencia-recebimento') s.pendencia_recebimento += 1;
        if (divIt === 0 && Math.abs(qXml - qBip) <= 1e-6 && qXml > 1e-9) s.conferencia_ok += 1;
        else if (qBip > 1e-9 || divIt > 0) s.conferencia_divergente += 1;
    });
    return s;
}

function _terceirosTopPainelFromAgg(agg, limit) {
    return Object.keys(agg || {}).sort(function(a, b) {
        var diff = (agg[b] || 0) - (agg[a] || 0);
        return diff !== 0 ? diff : a.localeCompare(b);
    }).slice(0, limit || 12).map(function(k) {
        return { nome: k, total: agg[k] || 0 };
    });
}

function _terceirosPainelDataLocalFromRows(rows) {
    rows = _terceirosRowsEstadoMesclado(rows || []);
    var stats = _painelTerceirosStatsRapidasFromRows(rows);
    var etapas = [
        ['pendencia-recebimento', 'Pendência de recebimento', stats.pendencia_recebimento],
        ['fornecedores-recebidos', 'Fornecedores recebidos', stats.fornecedores_recebidos],
        ['pendentes-lancamento', 'Pendentes de lançamento', stats.pendentes_lancamento],
        ['notas-lancadas', 'Notas lançadas', stats.notas_lancadas],
        ['pendencias-mg', 'Pendências envio MG', stats.pendencias_mg],
        ['recebimentos-mg', 'Recebimentos MG', stats.recebimentos_mg],
        ['historico', 'Histórico', getTerceirosRowsPorEtapa(rows, 'historico').length]
    ].filter(function(item) { return item[2] > 0; }).map(function(item) {
        return { etapa: item[0], label: item[1], total: item[2] };
    });
    var remetentes = {};
    var placas = {};
    var ufs = {};
    var motoristas = {};
    rows.forEach(function(row) {
        if (!row) return;
        var rem = String(row.remetente_nome || 'Sem remetente').trim() || 'Sem remetente';
        var uf = String(row.destinatario_uf || '—').trim().toUpperCase() || '—';
        var placa = String(row.placa_carreta || '').trim().toUpperCase();
        var motorista = String(row.motorista_carreta || '').trim();
        remetentes[rem] = (remetentes[rem] || 0) + 1;
        ufs[uf] = (ufs[uf] || 0) + 1;
        if (placa) placas[placa] = (placas[placa] || 0) + 1;
        if (motorista) motoristas[motorista] = (motoristas[motorista] || 0) + 1;
    });
    return {
        _local: true,
        estatisticas: stats,
        etapas: etapas,
        top_remetentes: _terceirosTopPainelFromAgg(remetentes, 12),
        top_placas: _terceirosTopPainelFromAgg(placas, 12),
        por_uf: _terceirosTopPainelFromAgg(ufs, 10),
        top_motoristas: _terceirosTopPainelFromAgg(motoristas, 12).map(function(m) {
            return { motorista: m.nome, nfs: m.total };
        }),
        top_itens: [],
        chegadas_carreta: [],
        ultimas_nfs: rows.slice().sort(function(a, b) {
            return Number(b.id || 0) - Number(a.id || 0);
        }).slice(0, 30).map(function(row) {
            var etapa = _terceirosLabelEtapaAtual(row);
            return {
                id: row.id,
                nf: [row.numero_nf || '-', row.serie_nf ? ('Série ' + row.serie_nf) : ''].filter(Boolean).join(' / '),
                remetente: row.remetente_nome || 'Sem remetente',
                destinatario: row.destinatario_nome || '-',
                uf: row.destinatario_uf || '—',
                etapa: etapa,
                qtd_xml: parseFloat(row.quantidade_total_xml) || 0,
                qtd_bipada: parseFloat(row.quantidade_total_bipada) || 0,
                area: row.area || ''
            };
        })
    };
}

function _aplicarPainelTerceirosStats(s) {
    s = s || {};
    var set = function(id, val) {
        var el = document.getElementById(id);
        if (!el) return;
        if (typeof val === 'number' && !Number.isInteger(val)) {
            el.textContent = _formatTerQtdDisplay(val);
        } else {
            el.textContent = val != null && val !== '' ? String(val) : '0';
        }
    };
    set('ter-stat-total-nf', s.total_nf ?? 0);
    set('ter-stat-pendencia', s.pendencia_recebimento ?? 0);
    set('ter-stat-fornecedores', s.fornecedores_recebidos ?? 0);
    set('ter-stat-receb-concluido', s.recebimento_concluido ?? 0);
    set('ter-stat-pend-lanc', s.pendentes_lancamento ?? 0);
    set('ter-stat-notas-lanc', s.notas_lancadas ?? 0);
    set('ter-stat-pend-mg', s.pendencias_mg ?? 0);
    set('ter-stat-qtd-xml', s.quantidade_total_xml ?? 0);
    set('ter-stat-qtd-bip', s.quantidade_total_bipada ?? 0);
    set('ter-stat-carreta', s.nfs_carreta ?? 0);
    set('ter-stat-conf-ok', s.conferencia_ok ?? 0);
    set('ter-stat-conf-div', s.conferencia_divergente ?? 0);
    set('ter-stat-mg-ok', s.recebimentos_mg ?? 0);
}

function destroyPainelTerceirosCharts() {
    if (terChartEtapas) { terChartEtapas.destroy(); terChartEtapas = null; }
    if (terChartBipagemXml) { terChartBipagemXml.destroy(); terChartBipagemXml = null; }
    if (terChartRemetentes) { terChartRemetentes.destroy(); terChartRemetentes = null; }
    if (terChartPlacas) { terChartPlacas.destroy(); terChartPlacas = null; }
    if (terChartUf) { terChartUf.destroy(); terChartUf = null; }
    if (terChartConferencia) { terChartConferencia.destroy(); terChartConferencia = null; }
    if (terChartMotoristas) { terChartMotoristas.destroy(); terChartMotoristas = null; }
    if (terChartChegadasCarreta) { terChartChegadasCarreta.destroy(); terChartChegadasCarreta = null; }
    document.querySelectorAll('#terceiros-panel-painel .chart-box--oculto').forEach(function(box) {
        box.classList.remove('chart-box--oculto');
    });
}

function _terceirosMarcarChartBoxPainel(canvasId, temGrafico) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var box = canvas.closest('.chart-box');
    if (box) box.classList.toggle('chart-box--oculto', !temGrafico);
}

function _terPainelLabelCurtoDatahora(datahoraBr) {
    if (!datahoraBr) return '-';
    var s = String(datahoraBr).trim();
    var partes = s.split(/\s+/);
    if (partes.length < 2) return s.length > 14 ? s.slice(0, 14) : s;
    var data = partes[0];
    var hora = partes[1];
    if (data.length >= 5) data = data.slice(0, 5);
    if (hora.length >= 5) hora = hora.slice(0, 5);
    return data + ' ' + hora;
}

function renderPainelTerceirosCharts(data) {
    destroyPainelTerceirosCharts();
    if (typeof Chart === 'undefined') return;
    var cores = ['#366092', '#5c6bc0', '#26a69a', '#ffa726', '#ef5350', '#7e57c2', '#42a5f5', '#66bb6a'];
    var optsBar = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
    };
    var etapas = data.etapas || [];
    var labelsEtapasPadrao = [
        'Pendência de recebimento',
        'Fornecedores recebidos',
        'Pendentes de lançamento',
        'Notas lançadas',
        'Pendências envio MG',
        'Recebimentos MG',
        'Histórico'
    ];
    var mapaEtapas = {};
    etapas.forEach(function(e) {
        mapaEtapas[e.label || e.etapa] = e.total || 0;
    });
    var labelsE = labelsEtapasPadrao;
    var dataE = labelsEtapasPadrao.map(function(lbl) { return mapaEtapas[lbl] || 0; });
    var ctxE = document.getElementById('ter-chart-etapas');
    if (ctxE && dataE.some(function(v) { return v > 0; })) {
        terChartEtapas = new Chart(ctxE, {
            type: 'bar',
            data: {
                labels: labelsE,
                datasets: [{
                    label: 'NFs',
                    data: dataE,
                    backgroundColor: '#366092',
                    borderColor: '#1a237e',
                    borderWidth: 1
                }]
            },
            options: Object.assign({}, optsBar, {
                indexAxis: 'y',
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
            })
        });
    }
    var stats = data.estatisticas || {};
    var ctxB = document.getElementById('ter-chart-bipagem-xml');
    if (ctxB) {
        terChartBipagemXml = new Chart(ctxB, {
            type: 'bar',
            data: {
                labels: ['XML', 'Bipado'],
                datasets: [{
                    label: 'Quantidade',
                    data: [stats.quantidade_total_xml || 0, stats.quantidade_total_bipada || 0],
                    backgroundColor: ['#5c6bc0', '#2e7d32'],
                    borderWidth: 1
                }]
            },
            options: Object.assign({}, optsBar, {
                scales: { y: { beginAtZero: true } }
            })
        });
    }
    var topRem = (data.top_remetentes || []).slice(0, 8);
    var ctxR = document.getElementById('ter-chart-remetentes');
    if (ctxR && topRem.length) {
        terChartRemetentes = new Chart(ctxR, {
            type: 'bar',
            data: {
                labels: topRem.map(function(r) { return r.nome; }),
                datasets: [{
                    data: topRem.map(function(r) { return r.total || 0; }),
                    backgroundColor: '#26a69a',
                    borderWidth: 1
                }]
            },
            options: Object.assign({}, optsBar, {
                indexAxis: 'y',
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
            })
        });
    }
    var topPl = (data.top_placas || []).slice(0, 8);
    var ctxP = document.getElementById('ter-chart-placas');
    if (ctxP && topPl.length) {
        terChartPlacas = new Chart(ctxP, {
            type: 'bar',
            data: {
                labels: topPl.map(function(p) { return p.nome; }),
                datasets: [{
                    data: topPl.map(function(p) { return p.total || 0; }),
                    backgroundColor: '#7b1fa2',
                    borderWidth: 1
                }]
            },
            options: Object.assign({}, optsBar, {
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            })
        });
    }
    var porUf = (data.por_uf || []).slice(0, 8);
    var ctxU = document.getElementById('ter-chart-uf');
    if (ctxU && porUf.length) {
        terChartUf = new Chart(ctxU, {
            type: 'doughnut',
            data: {
                labels: porUf.map(function(u) { return u.nome; }),
                datasets: [{
                    data: porUf.map(function(u) { return u.total || 0; }),
                    backgroundColor: cores.slice(0, porUf.length),
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }
    var ctxC = document.getElementById('ter-chart-conferencia');
    if (ctxC) {
        terChartConferencia = new Chart(ctxC, {
            type: 'pie',
            data: {
                labels: ['Completo', 'Divergente'],
                datasets: [{
                    data: [stats.conferencia_ok || 0, stats.conferencia_divergente || 0],
                    backgroundColor: ['#2e7d32', '#c62828'],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }
    var topMot = (data.top_motoristas || []).slice(0, 10);
    var ctxMot = document.getElementById('ter-chart-motoristas');
    if (ctxMot && topMot.length) {
        terChartMotoristas = new Chart(ctxMot, {
            type: 'bar',
            data: {
                labels: topMot.map(function(m) {
                    var nome = (m.motorista || '-').trim();
                    return nome.length > 28 ? nome.slice(0, 26) + '…' : nome;
                }),
                datasets: [{
                    label: 'NFs',
                    data: topMot.map(function(m) { return m.nfs || 0; }),
                    backgroundColor: '#ef6c00',
                    borderColor: '#e65100',
                    borderWidth: 1
                }]
            },
            options: Object.assign({}, optsBar, {
                indexAxis: 'y',
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: function(items) {
                                var idx = items[0] && items[0].dataIndex;
                                return (topMot[idx] && topMot[idx].motorista) || '';
                            }
                        }
                    }
                }
            })
        });
    }
    var chegadas = (data.chegadas_carreta || []).slice(-15);
    var ctxCh = document.getElementById('ter-chart-chegadas-carreta');
    if (ctxCh && chegadas.length) {
        terChartChegadasCarreta = new Chart(ctxCh, {
            type: 'bar',
            data: {
                labels: chegadas.map(function(c) {
                    return _terPainelLabelCurtoDatahora(c.inicio_descarga);
                }),
                datasets: [{
                    label: 'Início descarga',
                    data: chegadas.map(function() { return 1; }),
                    backgroundColor: '#1565c0',
                    borderColor: '#0d47a1',
                    borderWidth: 1
                }]
            },
            options: Object.assign({}, optsBar, {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 1.2,
                        ticks: { display: false },
                        grid: { display: false }
                    },
                    x: {
                        ticks: { maxRotation: 55, minRotation: 35, font: { size: 10 } }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                var c = chegadas[ctx.dataIndex];
                                if (!c) return '';
                                return [
                                    'Início: ' + (c.inicio_descarga || '-'),
                                    'Motorista: ' + (c.motorista || '-'),
                                    'Placa: ' + (c.placa || '-'),
                                    'NF: ' + (c.nf || '-')
                                ];
                            }
                        }
                    }
                }
            })
        });
    }
    _terceirosMarcarChartBoxPainel('ter-chart-etapas', !!terChartEtapas);
    _terceirosMarcarChartBoxPainel('ter-chart-bipagem-xml', !!terChartBipagemXml);
    _terceirosMarcarChartBoxPainel('ter-chart-remetentes', !!terChartRemetentes);
    _terceirosMarcarChartBoxPainel('ter-chart-placas', !!terChartPlacas);
    _terceirosMarcarChartBoxPainel('ter-chart-uf', !!terChartUf);
    _terceirosMarcarChartBoxPainel('ter-chart-conferencia', !!terChartConferencia);
    _terceirosMarcarChartBoxPainel('ter-chart-motoristas', !!terChartMotoristas);
    _terceirosMarcarChartBoxPainel('ter-chart-chegadas-carreta', !!terChartChegadasCarreta);
}

var _terceirosPainelFetchSeq = 0;
var _terceirosPainelFetchPromise = null;
var _terceirosPainelFetchUltimoTs = 0;

function _terceirosRenderPainelTerceirosData(data) {
    if (!data) return;
    window._terceirosPainelUltimoData = data;

    var statIds = [
        'ter-stat-total-nf', 'ter-stat-pendencia', 'ter-stat-fornecedores', 'ter-stat-receb-concluido',
        'ter-stat-pend-lanc', 'ter-stat-notas-lanc', 'ter-stat-pend-mg', 'ter-stat-qtd-xml', 'ter-stat-qtd-bip',
        'ter-stat-carreta', 'ter-stat-conf-ok', 'ter-stat-conf-div', 'ter-stat-mg-ok'
    ];
    if (data.erro) {
        statIds.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
        destroyPainelTerceirosCharts();
        var msg = escapeHtml(data.erro);
        [['ter-tbody-painel-ultimas', 8], ['ter-tbody-painel-itens', 3], ['ter-tbody-painel-remetentes', 2],
            ['ter-tbody-painel-motoristas', 2], ['ter-tbody-painel-placas', 2]].forEach(function(pair) {
            var tb = document.getElementById(pair[0]);
            if (tb) tb.innerHTML = '<tr><td colspan="' + pair[1] + '" class="loading">' + msg + '</td></tr>';
        });
        return;
    }
    _aplicarPainelTerceirosStats(data.estatisticas || {});

    var preencher = function(tbodyId, rows, cols, emptyMsg, renderRow) {
        var tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        if (!rows || !rows.length) {
            tbody.innerHTML = '<tr><td colspan="' + cols + '" class="loading">' + escapeHtml(emptyMsg) + '</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(renderRow).join('');
    };

    preencher('ter-tbody-painel-ultimas', data.ultimas_nfs || [], 8, data._local ? 'Sincronizando últimas NFs...' : 'Nenhuma NF cadastrada ainda.', function(n) {
        var origem = (n.area === 'carreta') ? 'Carreta' : ((n.area === 'expedicao') ? 'Expedição' : 'Recebimento');
        return '<tr>'
            + '<td><strong>' + escapeHtml(n.nf || '-') + '</strong></td>'
            + '<td>' + terceirosListaCellTextoLongo(n.remetente) + '</td>'
            + '<td>' + terceirosListaCellTextoLongo(n.destinatario) + '</td>'
            + '<td>' + escapeHtml(n.uf || '-') + '</td>'
            + '<td>' + escapeHtml(n.etapa || '-') + '</td>'
            + '<td>' + escapeHtml(_formatTerQtdDisplay(n.qtd_xml)) + '</td>'
            + '<td><strong>' + escapeHtml(_formatTerQtdDisplay(n.qtd_bipada)) + '</strong></td>'
            + '<td>' + escapeHtml(origem) + '</td>'
            + '</tr>';
    });

    preencher('ter-tbody-painel-itens', data.top_itens || [], 3, data._local ? 'Sincronizando itens bipados...' : 'Nenhum item bipado ainda.', function(i) {
        return '<tr>'
            + '<td>' + terceirosListaCellTextoLongo(i.produto) + '</td>'
            + '<td>' + escapeHtml(i.codigo_ean || '-') + '</td>'
            + '<td><strong>' + escapeHtml(_formatTerQtdDisplay(i.total)) + '</strong></td>'
            + '</tr>';
    });

    preencher('ter-tbody-painel-remetentes', data.top_remetentes || [], 2, 'Sem remetentes.', function(r) {
        return '<tr><td>' + terceirosListaCellTextoLongo(r.nome) + '</td><td><strong>' + (r.total || 0) + '</strong></td></tr>';
    });

    preencher('ter-tbody-painel-motoristas', data.top_motoristas || [], 2, 'Sem motoristas cadastrados.', function(m) {
        return '<tr><td>' + terceirosListaCellTextoLongo(m.motorista) + '</td><td><strong>' + (m.nfs || 0) + '</strong></td></tr>';
    });

    preencher('ter-tbody-painel-placas', data.top_placas || [], 2, 'Sem placas registradas.', function(p) {
        return '<tr><td><strong>' + escapeHtml(p.nome || '-') + '</strong></td><td><strong>' + (p.total || 0) + '</strong></td></tr>';
    });

    _agendarChartsPainelTerceiros();
}

async function loadPainelTerceiros(opcoes) {
    opcoes = opcoes || {};
    var cacheHit = _terceirosObterCacheLista({ staleOk: true });
    var renderizouLocal = false;
    if (cacheHit && cacheHit.rows && cacheHit.rows.length) {
        _terceirosRenderPainelTerceirosData(_terceirosPainelDataLocalFromRows(
            _terceirosMesclarRecebidosLocaisNasRows(cacheHit.rows)
        ));
        renderizouLocal = true;
    }
    if (!renderizouLocal && !opcoes.force) {
        try {
            var dataLista = await fetchTerceirosDocumentosTodos();
            if (dataLista && Array.isArray(dataLista.rows) && dataLista.rows.length) {
                _terceirosRenderPainelTerceirosData(_terceirosPainelDataLocalFromRows(dataLista.rows));
                renderizouLocal = true;
            }
        } catch (eListaPainel) {
            console.error('loadPainelTerceiros lista local:', eListaPainel);
        }
    }
    if (renderizouLocal && !opcoes.force) {
        var agoraBg = Date.now();
        if (_terceirosPainelFetchPromise && agoraBg - _terceirosPainelFetchUltimoTs < 15000) return;
        var seqBg = ++_terceirosPainelFetchSeq;
        _terceirosPainelFetchUltimoTs = agoraBg;
        _terceirosPainelFetchPromise = fetchAPIComTimeout('/terceiros/painel', {}, 12000).then(function(data) {
            if (!data || seqBg !== _terceirosPainelFetchSeq) return;
            if (data.erro) {
                console.error('loadPainelTerceiros background:', data.erro);
                return;
            }
            _terceirosRenderPainelTerceirosData(data);
        }).catch(function(e) {
            console.error('loadPainelTerceiros background:', e);
        }).finally(function() {
            _terceirosPainelFetchPromise = null;
        });
        return;
    }

    var seq = ++_terceirosPainelFetchSeq;
    var data;
    try {
        data = await fetchAPIComTimeout('/terceiros/painel', {}, 15000);
    } catch (ePainel) {
        if (!renderizouLocal) {
            _terceirosRenderPainelTerceirosData({ erro: _modErroMsg(null, (ePainel && ePainel.message) || 'Erro ao carregar painel de terceiros.') });
        }
        return;
    }
    if (!data || seq !== _terceirosPainelFetchSeq) {
        if (!renderizouLocal && !data) {
            _terceirosRenderPainelTerceirosData({ erro: _modErroMsg(null, 'Falha de conexão com o servidor.') });
        }
        return;
    }
    if (data.erro && renderizouLocal) {
        console.error('loadPainelTerceiros:', data.erro);
        return;
    }
    _terceirosRenderPainelTerceirosData(data);
}

function getTerceirosPrefixo() {
    return 'ter-rec';
}

function getTerceirosAreaApi(area) {
    if (area === 'expedicao') return 'expedicao';
    if (area === 'carreta') return 'carreta';
    return 'recebimento';
}

function _terceirosTabDestinoAposRecebimentoConcluido(rowLike) {
    rowLike = rowLike || _terceirosDocAtual || {};
    if (isTerceirosConsumivelSp(rowLike)) return 'pendentes-lancamento';
    if (_terceirosUsaFluxoMg(rowLike)) return 'pendencias-mg';
    return 'fornecedores-recebidos';
}

function _terceirosFecharModalRecebimentoConcluidoUi() {
    var modal = document.getElementById('modal-terceiros-recebimento-concluido');
    if (!modal) return;
    modal.style.display = 'none';
    modal.style.alignItems = '';
    modal.style.justifyContent = '';
}

function abrirModalRecebimentoConcluidoTerceiros(tabDestinoOpt) {
    var modal = document.getElementById('modal-terceiros-recebimento-concluido');
    if (!modal) return;
    var tabDestino = tabDestinoOpt || window._terceirosRecebimentoConcluidoTabDestino || 'fornecedores-recebidos';
    window._terceirosRecebimentoConcluidoTabDestino = tabDestino;
    var titulo = document.getElementById('ter-rec-concluido-aviso-titulo');
    var textoPrincipal = document.getElementById('ter-rec-concluido-aviso-texto');
    var textoFluxo = document.getElementById('ter-rec-concluido-aviso-fluxo');
    var textoRodape = document.getElementById('ter-rec-concluido-aviso-rodape');
    var btnProx = document.getElementById('btn-ter-proxima-etapa-lancamento');
    if (tabDestino === 'pendentes-lancamento') {
        if (titulo) titulo.textContent = 'Recebimento concluído — Consumível SP';
        if (textoPrincipal) {
            textoPrincipal.innerHTML = 'O produto <strong>chegou</strong>. Esta NF é <strong>consumível SP</strong> e '
                + '<strong>não passa por Minas Gerais (MG)</strong>.';
        }
        if (textoFluxo) {
            textoFluxo.innerHTML = 'Ela segue direto para a <strong>4ª aba — NFs pendentes de lançamento</strong> '
                + '(separada por UF do destinatário, ex.: SP). Marque <strong>Nota lançada</strong> quando o fiscal concluir.';
        }
        if (textoRodape) textoRodape.textContent = 'Use Fechar ou o botão abaixo para abrir a lista de pendentes de lançamento.';
        if (btnProx) btnProx.textContent = 'Ir para pendentes de lançamento';
    } else if (tabDestino === 'pendencias-mg') {
        if (titulo) titulo.textContent = 'Recebimento concluído';
        if (textoPrincipal) {
            textoPrincipal.innerHTML = 'A NF saiu da 2ª aba (Pendência). No <strong>fluxo MG</strong>, ela segue para '
                + '<strong>Pendências envio MG</strong> (6ª aba).';
        }
        if (textoFluxo) {
            textoFluxo.innerHTML = 'Só entra em <strong>NFs pendentes de lançamento</strong> (4ª aba) depois de '
                + '<strong>Recebida MG = Sim</strong> na 8ª aba. Depois marque <strong>Nota lançada</strong>.';
        }
        if (textoRodape) textoRodape.textContent = 'Use Fechar para continuar, ou avance para a próxima etapa do fluxo MG.';
        if (btnProx) btnProx.textContent = 'Ir para pendências envio MG';
    } else {
        if (titulo) titulo.textContent = 'Recebimento concluído';
        if (textoPrincipal) {
            textoPrincipal.innerHTML = 'A NF saiu da 2ª aba (Pendência) e está em '
                + '<strong>Fornecedores recebidos</strong> (3ª aba).';
        }
        if (textoFluxo) {
            textoFluxo.innerHTML = 'Quando estiver pronta, marque <strong>Nota lançada</strong> na 4ª aba '
                + '(NFs pendentes de lançamento).';
        }
        if (textoRodape) textoRodape.textContent = 'Use Fechar para continuar, ou avance para a próxima etapa do fluxo.';
        if (btnProx) btnProx.textContent = 'Ir para fornecedores recebidos';
    }
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10050';
    var btnFechar = document.getElementById('btn-ter-fechar-recebimento-concluido');
    window.setTimeout(function() {
        if (btnProx && tabDestino === 'pendentes-lancamento') btnProx.focus();
        else if (btnFechar) btnFechar.focus();
    }, 50);
}

function fecharModalRecebimentoConcluidoTerceiros() {
    _terceirosFecharModalRecebimentoConcluidoUi();
    var tab = window._terceirosRecebimentoConcluidoTabDestino || 'fornecedores-recebidos';
    abrirAbaTerceirosSeDiferente(tab, true);
}

function _terceirosLabelAreaUpload(areaChave) {
    if (areaChave === 'carreta') return 'Carreta';
    if (areaChave === 'expedicao') return 'Expedição';
    return 'Recebimento';
}

function _terceirosFormatarPrevisaoUpload(isoLocal) {
    if (!isoLocal) return '';
    var d = new Date(isoLocal);
    if (isNaN(d.getTime())) return isoLocal;
    try {
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return isoLocal;
    }
}

function abrirModalUploadXmlTerceirosConcluido(opcoes) {
    opcoes = opcoes || {};
    var modal = document.getElementById('modal-terceiros-upload-xml-concluido');
    if (!modal) return;
    var total = opcoes.totalCriados || 0;
    var erros = opcoes.erros || [];
    var tituloEl = document.getElementById('ter-upload-sucesso-titulo');
    var resumoEl = document.getElementById('ter-upload-sucesso-resumo');
    var detalhesEl = document.getElementById('ter-upload-sucesso-detalhes');
    var errosEl = document.getElementById('ter-upload-sucesso-erros');
    var btnPendencia = document.getElementById('btn-ter-upload-ir-pendencia');
    var iconeEl = modal.querySelector('.ter-upload-sucesso-icone');
    var sucesso = total > 0;
    modal.classList.toggle('modal-ter-upload-sucesso--erro', !sucesso);
    modal.classList.remove('modal-ter-upload-sucesso--aviso');
    if (iconeEl) iconeEl.textContent = sucesso ? '✓' : '✕';
    if (tituloEl) tituloEl.textContent = sucesso ? 'Upload concluído!' : 'Nenhum XML aceito';
    if (resumoEl) {
        if (sucesso) {
            var n = total === 1 ? 'nota fiscal' : 'notas fiscais';
            resumoEl.textContent = total + ' ' + n + ' registrada(s) com sucesso.';
        } else {
            resumoEl.textContent = 'Revise os arquivos enviados e tente novamente.';
        }
    }
    if (detalhesEl) {
        var partes = [];
        if (opcoes.areaLabel) partes.push('<strong>Área:</strong> ' + opcoes.areaLabel);
        if (opcoes.previsao) partes.push('<strong>Previsão de chegada:</strong> ' + _terceirosFormatarPrevisaoUpload(opcoes.previsao));
        if (sucesso) {
            partes.push('As notas aparecem na aba <strong>Pendência de recebimento</strong> para conferência.');
        }
        detalhesEl.innerHTML = partes.join('<br>');
    }
    if (errosEl) {
        errosEl.innerHTML = '';
        if (erros.length) {
            erros.forEach(function(msg) {
                var li = document.createElement('li');
                li.textContent = msg;
                errosEl.appendChild(li);
            });
            errosEl.hidden = false;
        } else {
            errosEl.hidden = true;
        }
    }
    if (btnPendencia) btnPendencia.style.display = sucesso ? '' : 'none';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    var btnFechar = document.getElementById('btn-ter-upload-fechar');
    window.setTimeout(function() {
        if (btnFechar) btnFechar.focus();
    }, 50);
}

function fecharModalUploadXmlTerceirosConcluido() {
    var modal = document.getElementById('modal-terceiros-upload-xml-concluido');
    if (modal) {
        modal.style.display = 'none';
        modal.style.alignItems = '';
        modal.style.justifyContent = '';
        modal.classList.remove('modal-ter-upload-sucesso--erro');
        modal.classList.remove('modal-ter-upload-sucesso--aviso');
    }
}

function terceirosIrParaPendenciaAposUpload() {
    fecharModalUploadXmlTerceirosConcluido();
    terceirosAplicarPainelAbaSomenteUi('pendencia-recebimento');
    var hit = _terceirosObterCacheLista();
    if (hit && Array.isArray(hit.rows)) {
        void loadTerceirosDocumentos(hit);
        return;
    }
    if (window.terceirosMostrarAba) window.terceirosMostrarAba('pendencia-recebimento');
}

/** Fecha o modal e leva à aba correta do fluxo (consumível SP → 4ª; MG → 6ª; demais → 3ª). */
function terceirosIrParaProximaEtapaLancamento() {
    _terceirosFecharModalRecebimentoConcluidoUi();
    var tab = window._terceirosRecebimentoConcluidoTabDestino || 'pendencias-mg';
    if (window.terceirosMostrarAba) window.terceirosMostrarAba(tab);
}
window.terceirosIrParaProximaEtapaLancamento = terceirosIrParaProximaEtapaLancamento;

function _terceirosPrepararModalConfirmacaoBackdrop() {
    _terceirosIgnorarCliqueBackdropModalAte = Date.now() + 400;
}

function _terceirosDeveIgnorarCliqueBackdropModal() {
    return Date.now() < _terceirosIgnorarCliqueBackdropModalAte;
}

function _terceirosExibirModalOverlay(modal) {
    if (!modal) return;
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10050';
}

function _terceirosOcultarModalOverlay(modal) {
    if (!modal) return;
    modal.style.display = 'none';
    modal.style.alignItems = '';
    modal.style.justifyContent = '';
    modal.style.zIndex = '';
}

function fecharModalLancamentoSemRecebimento(confirmado) {
    var modal = document.getElementById('modal-terceiros-lancar-sem-recebimento');
    _terceirosOcultarModalOverlay(modal);
    if (_terceirosConfirmacaoLancamentoResolver) {
        _terceirosConfirmacaoLancamentoResolver(!!confirmado);
        _terceirosConfirmacaoLancamentoResolver = null;
    }
}

function abrirModalLancamentoSemRecebimento() {
    var modal = document.getElementById('modal-terceiros-lancar-sem-recebimento');
    if (!modal) {
        return Promise.resolve(window.confirm('Esta nota fiscal ainda não foi recebida. Deseja lançar mesmo assim?'));
    }
    return new Promise(function(resolve) {
        _terceirosConfirmacaoLancamentoResolver = resolve;
        _terceirosPrepararModalConfirmacaoBackdrop();
        window.setTimeout(function() {
            _terceirosExibirModalOverlay(modal);
        }, 0);
    });
}

function fecharModalConcluirRecebimentoSemBipagemCompleta(confirmado) {
    var modal = document.getElementById('modal-terceiros-concluir-sem-bipagem-completa');
    _terceirosOcultarModalOverlay(modal);
    if (_terceirosConfirmacaoConcluirSemBipagemResolver) {
        _terceirosConfirmacaoConcluirSemBipagemResolver(!!confirmado);
        _terceirosConfirmacaoConcluirSemBipagemResolver = null;
    }
}

var TERCEIROS_MOTIVO_FLUXO_TITULOS = {
    nota_lancada: 'Por que a nota não foi lançada?',
    enviar_para_mg: 'Por que não enviar para MG?',
    carga_recebida_mg: 'Por que não foi recebida em MG?'
};

function fecharModalMotivoFluxoTerceiros(confirmado, textoMotivo) {
    var modal = document.getElementById('modal-terceiros-motivo-fluxo');
    _terceirosOcultarModalOverlay(modal);
    if (_terceirosConfirmacaoMotivoFluxoResolver) {
        _terceirosConfirmacaoMotivoFluxoResolver(confirmado ? (textoMotivo || '').trim() : false);
        _terceirosConfirmacaoMotivoFluxoResolver = null;
    }
}

function abrirModalMotivoFluxoTerceiros(campo) {
    var modal = document.getElementById('modal-terceiros-motivo-fluxo');
    var titulo = document.getElementById('ter-motivo-fluxo-titulo');
    var textarea = document.getElementById('ter-motivo-fluxo-texto');
    if (titulo) titulo.textContent = TERCEIROS_MOTIVO_FLUXO_TITULOS[campo] || 'Informe o motivo';
    if (textarea) textarea.value = '';
    if (!modal) {
        return Promise.resolve(window.prompt(TERCEIROS_MOTIVO_FLUXO_TITULOS[campo] || 'Motivo:'));
    }
    return new Promise(function(resolve) {
        _terceirosConfirmacaoMotivoFluxoResolver = resolve;
        _terceirosPrepararModalConfirmacaoBackdrop();
        window.setTimeout(function() {
            _terceirosExibirModalOverlay(modal);
            if (textarea) textarea.focus();
        }, 0);
    });
}

function fecharModalRecebedorMgTerceiros(confirmado, nome) {
    var modal = document.getElementById('modal-terceiros-recebedor-mg');
    _terceirosOcultarModalOverlay(modal);
    if (_terceirosConfirmacaoRecebedorMgResolver) {
        _terceirosConfirmacaoRecebedorMgResolver(confirmado ? (nome || '').trim() : false);
        _terceirosConfirmacaoRecebedorMgResolver = null;
    }
}

function abrirModalRecebedorMgTerceiros() {
    var modal = document.getElementById('modal-terceiros-recebedor-mg');
    var input = document.getElementById('ter-recebedor-mg-nome');
    if (input) input.value = '';
    if (!modal) {
        return Promise.resolve(window.prompt('Quem recebeu em MG?'));
    }
    return new Promise(function(resolve) {
        _terceirosConfirmacaoRecebedorMgResolver = resolve;
        _terceirosPrepararModalConfirmacaoBackdrop();
        window.setTimeout(function() {
            _terceirosExibirModalOverlay(modal);
            if (input) input.focus();
        }, 0);
    });
}

async function _terceirosAtualizarStatusComMotivo(documentoId, campo, valor, opcoes) {
    opcoes = opcoes || {};
    if (isTerceirosFlagSim(valor) && campo === 'carga_recebida_mg' && !opcoes.forcar_fluxo_carreta && !opcoes.recebedor_mg) {
        var recebedor = await abrirModalRecebedorMgTerceiros();
        if (!recebedor) {
            try {
                await recarregarTodasListasTerceiros();
            } catch (eRec) {
                console.error(eRec);
            }
            showMessage('Operação cancelada. Informe quem recebeu em MG para concluir.', 'warning');
            return;
        }
        opcoes.recebedor_mg = recebedor;
        _terceirosAtualizarRecebidaMgLocal(documentoId, 'sim', '', recebedor);
        opcoes.movimento_recebida_mg_aplicado = true;
        void terceirosNavegarParaPendentesLancamentoAposRecebidaMg(documentoId, recebedor);
    }
    if (isTerceirosFlagNao(valor) && (campo === 'nota_lancada' || campo === 'enviar_para_mg' || campo === 'carga_recebida_mg')) {
        var motivo = await abrirModalMotivoFluxoTerceiros(campo);
        if (!motivo) {
            try {
                await recarregarTodasListasTerceiros();
            } catch (e) {
                console.error(e);
            }
            showMessage('Operação cancelada. Nenhuma alteração foi salva.', 'warning');
            return;
        }
        opcoes.motivo = motivo;
        if (campo === 'nota_lancada') {
            _terceirosAtualizarNotaLancadaLocal(documentoId, 'nao', motivo);
            opcoes.movimento_historico_aplicado = true;
            void terceirosNavegarParaHistoricoAposEnviarMg(documentoId);
        } else if (campo === 'enviar_para_mg') {
            _terceirosAtualizarEnviarMgLocal(documentoId, 'nao', motivo);
            opcoes.movimento_historico_aplicado = true;
            void terceirosNavegarParaHistoricoAposEnviarMg(documentoId);
        } else if (campo === 'carga_recebida_mg') {
            _terceirosAtualizarRecebidaMgLocal(documentoId, 'nao', motivo);
            opcoes.movimento_recebida_mg_aplicado = true;
            void terceirosNavegarParaHistoricoAposRecebidaMg(documentoId, 'nao', motivo);
        }
    }
    return atualizarStatusTerceirosDireto(documentoId, campo, valor, opcoes);
}

function abrirModalConcluirRecebimentoSemBipagemCompleta() {
    var modal = document.getElementById('modal-terceiros-concluir-sem-bipagem-completa');
    if (!modal) {
        return Promise.resolve(window.confirm('A bipagem ainda não está completa. Deseja concluir o recebimento mesmo assim?'));
    }
    return new Promise(function(resolve) {
        _terceirosConfirmacaoConcluirSemBipagemResolver = resolve;
        _terceirosPrepararModalConfirmacaoBackdrop();
        window.setTimeout(function() {
            _terceirosExibirModalOverlay(modal);
        }, 0);
    });
}

function fecharModalIrParaNotasLancadas(confirmado) {
    var modal = document.getElementById('modal-terceiros-ir-notas-lancadas');
    _terceirosOcultarModalOverlay(modal);
    if (_terceirosConfirmacaoIrNotasLancadasResolver) {
        _terceirosConfirmacaoIrNotasLancadasResolver(!!confirmado);
        _terceirosConfirmacaoIrNotasLancadasResolver = null;
    }
}

function abrirModalIrParaNotasLancadas() {
    var modal = document.getElementById('modal-terceiros-ir-notas-lancadas');
    if (!modal) {
        return Promise.resolve(window.confirm('Nota lançada com sucesso. Deseja ir para a 5ª aba — Notas fiscais lançadas?'));
    }
    return new Promise(function(resolve) {
        _terceirosConfirmacaoIrNotasLancadasResolver = resolve;
        _terceirosPrepararModalConfirmacaoBackdrop();
        window.setTimeout(function() {
            _terceirosExibirModalOverlay(modal);
        }, 0);
    });
}

function fecharModalConfirmarRecebimentoFornecedores(escolha) {
    var modal = document.getElementById('modal-terceiros-confirmar-recebimento-fornecedores');
    _terceirosOcultarModalOverlay(modal);
    var resolver = _terceirosConfirmacaoRecebimentoFornecedoresResolver;
    _terceirosConfirmacaoRecebimentoFornecedoresResolver = null;
    if (!resolver) return;
    var valor = (escolha === 'ir' || escolha === 'ficar') ? escolha : false;
    resolver(valor);
}
window.fecharModalConfirmarRecebimentoFornecedores = fecharModalConfirmarRecebimentoFornecedores;

/** Delegação no modal (não depende só de initForms). */
function initTerceirosModalConfirmarRecebimentoFornecedores() {
    if (window._terceirosModalConfRecebFornOk) return;
    var modal = document.getElementById('modal-terceiros-confirmar-recebimento-fornecedores');
    if (!modal) return;
    window._terceirosModalConfRecebFornOk = true;
    modal.addEventListener('click', function(ev) {
        if (!ev.target || typeof ev.target.closest !== 'function') return;
        if (ev.target.closest('#btn-ter-ir-fornecedores-recebidos')) {
            ev.preventDefault();
            ev.stopPropagation();
            fecharModalConfirmarRecebimentoFornecedores('ir');
            return;
        }
        if (ev.target.closest('#btn-ter-ficar-pendencia-recebimento')) {
            ev.preventDefault();
            ev.stopPropagation();
            fecharModalConfirmarRecebimentoFornecedores('ficar');
            return;
        }
        if (ev.target.closest('#modal-terceiros-confirmar-recebimento-fornecedores-close')) {
            ev.preventDefault();
            ev.stopPropagation();
            fecharModalConfirmarRecebimentoFornecedores(false);
        }
    });
}

/** Antes de concluir recebimento: «ir» | «ficar» | false (cancelar). */
function abrirModalConfirmarRecebimentoFornecedores() {
    var modal = document.getElementById('modal-terceiros-confirmar-recebimento-fornecedores');
    if (!modal) {
        if (window.confirm('Marcar recebimento como concluído e ir para a 3ª aba — Fornecedores recebidos?')) {
            return Promise.resolve('ir');
        }
        if (window.confirm('Deseja concluir o recebimento e permanecer nesta aba?')) {
            return Promise.resolve('ficar');
        }
        return Promise.resolve(false);
    }
    return new Promise(function(resolve) {
        if (_terceirosConfirmacaoRecebimentoFornecedoresResolver) {
            try {
                _terceirosConfirmacaoRecebimentoFornecedoresResolver(false);
            } catch (e) {
                console.error(e);
            }
        }
        _terceirosConfirmacaoRecebimentoFornecedoresResolver = resolve;
        _terceirosPrepararModalConfirmacaoBackdrop();
        window.setTimeout(function() {
            _terceirosExibirModalOverlay(modal);
            var btnIr = document.getElementById('btn-ter-ir-fornecedores-recebidos');
            if (btnIr) btnIr.focus();
        }, 0);
    });
}

function _terceirosPrepararBotaoRecebimentoSalvando(btn) {
    if (!btn || btn.tagName !== 'BUTTON') return;
    btn.disabled = true;
    btn.dataset.terFinDescLabel = btn.dataset.terFinDescLabel || btn.textContent || 'Recebimento concluído';
    btn.textContent = 'A guardar…';
}

function _terceirosAtualizarProgressoRecebimento(titulo, subtitulo) {
    var text = document.getElementById('ter-acao-loading-text');
    var sub = document.getElementById('ter-acao-loading-sub');
    if (text && titulo) text.textContent = titulo;
    if (sub && subtitulo) sub.textContent = subtitulo;
}

function _terceirosRestaurarBotaoRecebimentoConcluido(btnOpt) {
    var btn = btnOpt || document.getElementById('btn-ter-rec-concluir');
    if (!btn) return;
    var concluido = isTerceirosFlagSim(_terceirosDocAtual && _terceirosDocAtual.recebimento_concluido);
    atualizarBotaoConclusaoTerceiros(getTerceirosPrefixo(), concluido);
}

function _terceirosPausarTimersBipagemPendente() {
    try {
        var pFlushBg = window._terceirosBipagemPending;
        if (!pFlushBg) return;
        Object.keys(pFlushBg.addTimers || {}).forEach(function(k) {
            clearTimeout(pFlushBg.addTimers[k]);
        });
        Object.keys(pFlushBg.removeTimers || {}).forEach(function(k) {
            clearTimeout(pFlushBg.removeTimers[k]);
        });
        pFlushBg.addTimers = {};
        pFlushBg.removeTimers = {};
    } catch (e) {
        console.error(e);
    }
}

function _terceirosAguardarComTimeout(promise, ms, codigoErro) {
    return Promise.race([
        promise,
        new Promise(function(_, reject) {
            window.setTimeout(function() {
                reject(new Error(codigoErro || 'TERCEIROS_TIMEOUT'));
            }, ms);
        })
    ]);
}

async function _terceirosAplicarUiAposRecebimentoConcluido(documentoId, documentoAtualizado, irParaFornecedores) {
    var prefixoConcl = getTerceirosPrefixo();
    definirDestaqueLinhaTerceirosDoc(documentoId);
    aplicarMovimentoRecebimentoConcluidoLocal(documentoId, documentoAtualizado);
    void atualizarAlertasTerceirosHeaderAposMudancaRecebimento();
    if (irParaFornecedores) {
        var tabDestinoReceb = _terceirosTabDestinoAposRecebimentoConcluido(documentoAtualizado);
        window._terceirosRecebimentoConcluidoTabDestino = tabDestinoReceb;
        resetTerceirosDetalhe();
        terceirosAplicarPainelAbaSomenteUi(tabDestinoReceb);
        _terceirosRestaurarBotaoRecebimentoConcluido();
        fecharTerAcaoLoading();
        window._terceirosUiRecebimentoConcluidoAplicada = true;
        var painelDestino = document.getElementById('terceiros-panel-' + tabDestinoReceb);
        if (painelDestino) {
            window.requestAnimationFrame(function() {
                painelDestino.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
        animarConclusaoTerceiros(prefixoConcl);
        window.setTimeout(function() {
            abrirModalRecebimentoConcluidoTerceiros(tabDestinoReceb);
        }, 0);
        showMessage(
            tabDestinoReceb === 'pendencias-mg'
                ? 'Recebimento concluído. A NF está na 6ª aba — Pendências envio MG.'
                : (tabDestinoReceb === 'pendentes-lancamento'
                    ? 'Recebimento concluído. Consumível SP liberado para lançamento.'
                    : 'Recebimento concluído. A NF está em Fornecedores recebidos.'),
            'success'
        );
        return;
    }
    try {
        void loadTerceirosDocumentos();
    } catch (e) {
        console.error(e);
    }
    atualizarBotaoConclusaoTerceiros(prefixoConcl, true);
    if (_terceirosDocAtual && documentoAtualizado) {
        _terceirosDocAtual = Object.assign({}, _terceirosDocAtual, documentoAtualizado);
    }
    showMessage('Recebimento concluído. Você permanece nesta aba.', 'success');
}

/** Após salvar «Sim» em Nota lançada — encerra no Histórico se o MG já foi recebido. */
async function _terceirosAposConfirmarNotaLancadaSim(documentoId, documentoResp, opcoes) {
    if (documentoId == null) return;
    opcoes = opcoes || {};
    var notaVal = (documentoResp && documentoResp.nota_lancada) ? documentoResp.nota_lancada : 'sim';
    if (documentoResp && _terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
        Object.assign(_terceirosDocAtual, documentoResp);
    }
    _terceirosAtualizarNotaLancadaLocal(documentoId, notaVal);
    var rowAtual = documentoResp || _terceirosRowPorId(documentoId);
    if (_terceirosFluxoMgConcluido(rowAtual)) {
        if (!opcoes.movimento_historico_aplicado) {
            await terceirosNavegarParaHistoricoAposEnviarMg(documentoId);
        }
        void recarregarTodasListasTerceiros().catch(function(e) {
            console.error(e);
        });
        showMessage('Nota lançada. Fluxo MG completo; a NF está no Histórico.', 'success');
        return;
    }
    if (!opcoes.movimento_lancada_sim_aplicado) {
        await terceirosNavegarParaNotasLancadasAposMarcarSim(documentoId);
    }
    void recarregarTodasListasTerceiros().catch(function(e) {
        console.error(e);
    });
    showMessage('Nota lançada.', 'success');
}

/** Após «Não» em Lançada — vai ao Histórico com motivo. */
async function _terceirosAposConfirmarNotaLancadaNao(documentoId, documentoResp, opcoes) {
    if (documentoId == null) return;
    opcoes = opcoes || {};
    if (documentoResp && _terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
        Object.assign(_terceirosDocAtual, documentoResp);
    }
    var motivo = (documentoResp && documentoResp.motivo_nao_lancada) || opcoes.motivo || '';
    _terceirosAtualizarNotaLancadaLocal(documentoId, 'nao', motivo);
    if (!opcoes.movimento_historico_aplicado) {
        await terceirosNavegarParaHistoricoAposEnviarMg(documentoId);
    }
    void recarregarTodasListasTerceiros().catch(function(e) {
        console.error(e);
    });
    showMessage('Lançamento «Não» registrado. A NF está no Histórico.', 'success');
}

function fecharModalIrParaRecebimentosMg(confirmado) {
    var modal = document.getElementById('modal-terceiros-ir-recebimentos-mg');
    _terceirosOcultarModalOverlay(modal);
    if (_terceirosConfirmacaoIrRecebimentosMgResolver) {
        _terceirosConfirmacaoIrRecebimentosMgResolver(!!confirmado);
        _terceirosConfirmacaoIrRecebimentosMgResolver = null;
    }
}

function abrirModalIrParaRecebimentosMg() {
    var modal = document.getElementById('modal-terceiros-ir-recebimentos-mg');
    if (!modal) {
        return Promise.resolve(window.confirm('Enviado para MG registrado. Deseja ir para o Histórico?'));
    }
    return new Promise(function(resolve) {
        _terceirosConfirmacaoIrRecebimentosMgResolver = resolve;
        _terceirosPrepararModalConfirmacaoBackdrop();
        window.setTimeout(function() {
            _terceirosExibirModalOverlay(modal);
        }, 0);
    });
}

/** 6ª aba → Histórico: após marcar «Sim» em Enviado para MG. */
async function terceirosNavegarParaHistoricoAposEnviarMg(documentoId) {
    if (documentoId == null) return;
    definirDestaqueLinhaTerceirosDoc(documentoId);
    abrirAbaTerceirosSeDiferente('historico', true);
    try {
        await loadTerceirosHistorico();
        var tbodyHist = document.getElementById('ter-tbody-historico');
        if (tbodyHist) aplicarDestaqueLinhaTerceirosDoc(tbodyHist);
    } catch (e) {
        console.error(e);
    }
    try {
        void loadTerceirosPendenciasMg();
        void loadTerceirosNotasLancadas();
        void loadTerceirosRecebimentosMg();
    } catch (e2) {
        console.error(e2);
    }
}

/** 5ª aba — carreta: encerra fluxo local (sem MG) e vai ao Histórico. */
async function _terceirosConcluirCarretaNoHistorico(documentoId) {
    if (documentoId == null) return;
    await atualizarStatusTerceirosDireto(documentoId, 'carga_recebida_mg', 'sim', { forcar_fluxo_carreta: true });
}

async function _terceirosConcluirConsumivelNoHistorico(documentoId) {
    if (documentoId == null) return;
    _terceirosAtualizarConsumivelHistoricoLocal(documentoId, 'sim');
    _terceirosRemoverLinhaNotasLancadas(documentoId);
    _terceirosInserirLinhaHistoricoLocal(documentoId);
    await atualizarStatusTerceirosDireto(documentoId, 'consumivel_sp_historico', 'sim', {
        movimento_historico_aplicado: true
    });
}

async function _terceirosAposConcluirCarretaNoHistorico(documentoId, documentoResp) {
    if (documentoId == null) return;
    if (documentoResp && _terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
        Object.assign(_terceirosDocAtual, documentoResp);
    }
    _terceirosAtualizarRecebidaMgLocal(documentoId, 'sim');
    await terceirosNavegarParaHistoricoAposRecebidaMg(documentoId, 'sim');
    void recarregarTodasListasTerceiros().catch(function(e) { console.error(e); });
    showMessage('NF de carreta registrada no histórico.', 'success');
}

async function _terceirosAposConcluirConsumivelNoHistorico(documentoId, documentoResp, opcoes) {
    if (documentoId == null) return;
    opcoes = opcoes || {};
    if (documentoResp && _terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
        Object.assign(_terceirosDocAtual, documentoResp);
    }
    _terceirosAtualizarConsumivelHistoricoLocal(documentoId, 'sim', documentoResp);
    if (!opcoes.movimento_historico_aplicado) {
        _terceirosRemoverLinhaNotasLancadas(documentoId);
        _terceirosInserirLinhaHistoricoLocal(documentoId);
    }
    void recarregarTodasListasTerceiros().catch(function(e) { console.error(e); });
    showMessage('Consumível SP enviado para o Histórico.', 'success');
}

/** Após confirmar recebimento em MG (fluxo normal) — vai para pendência de lançamento. */
async function _terceirosAposConfirmarRecebidaMgSim(documentoId, documentoResp, opcoes) {
    if (documentoId == null) return;
    opcoes = opcoes || {};
    if (documentoResp && isTerceirosAreaCarreta(documentoResp)) {
        await _terceirosAposConcluirCarretaNoHistorico(documentoId, documentoResp);
        return;
    }
    if (documentoResp && _terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
        Object.assign(_terceirosDocAtual, documentoResp);
    }
    var recebedorMg = (documentoResp && documentoResp.recebedor_mg) || opcoes.recebedor_mg || '';
    _terceirosAtualizarRecebidaMgLocal(documentoId, 'sim', '', recebedorMg);
    if (!opcoes.movimento_recebida_mg_aplicado) {
        await terceirosNavegarParaPendentesLancamentoAposRecebidaMg(documentoId, recebedorMg);
    }
    void recarregarTodasListasTerceiros().catch(function(e) {
        console.error(e);
    });
    showMessage('Recebida MG confirmada. A NF está na 4ª aba — NFs pendentes de lançamento.', 'success');
}

/** Após «Não» em Recebida MG — Histórico com motivo. */
async function _terceirosAposConfirmarRecebidaMgNao(documentoId, documentoResp, opcoes) {
    if (documentoId == null) return;
    opcoes = opcoes || {};
    if (documentoResp && _terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
        Object.assign(_terceirosDocAtual, documentoResp);
    }
    var motivo = (documentoResp && documentoResp.motivo_nao_recebida_mg) || opcoes.motivo || '';
    _terceirosAtualizarRecebidaMgLocal(documentoId, 'nao', motivo);
    if (!opcoes.movimento_recebida_mg_aplicado) {
        await terceirosNavegarParaHistoricoAposRecebidaMg(documentoId, 'nao', motivo);
    }
    void recarregarTodasListasTerceiros().catch(function(e) {
        console.error(e);
    });
    showMessage('Recebida MG «Não» registrada. A NF está no Histórico.', 'success');
}

/** Após marcar que não é necessário envio para MG — vai ao Histórico. */
async function _terceirosAposConfirmarEnviarMgNao(documentoId, documentoResp, opcoes) {
    if (documentoResp && isTerceirosAreaCarreta(documentoResp)) {
        showMessage('NF de carreta não utiliza envio para MG. Conclua na 5ª aba — Notas lançadas.', 'warning');
        return;
    }
    if (documentoId == null) return;
    opcoes = opcoes || {};
    if (documentoResp && _terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
        Object.assign(_terceirosDocAtual, documentoResp);
    }
    var motivo = (documentoResp && documentoResp.motivo_nao_enviar_mg) || opcoes.motivo || '';
    _terceirosAtualizarEnviarMgLocal(documentoId, 'nao', motivo);
    if (!opcoes.movimento_historico_aplicado) {
        await terceirosNavegarParaHistoricoAposEnviarMg(documentoId);
    }
    void recarregarTodasListasTerceiros().catch(function(e) {
        console.error(e);
    });
    showMessage('Envio para MG «Não» registrado. A NF está no Histórico.', 'success');
}

/** Após «Sim» em Enviar/Enviado MG — NF nas abas 7 e 8. */
async function _terceirosAposConfirmarEnviarMgSim(documentoId, documentoResp, opcoes) {
    if (documentoResp && isTerceirosAreaCarreta(documentoResp)) {
        showMessage('NF de carreta não utiliza envio para MG. Conclua na 5ª aba — Notas lançadas.', 'warning');
        return;
    }
    if (documentoId == null) return;
    opcoes = opcoes || {};
    if (documentoResp && _terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
        Object.assign(_terceirosDocAtual, documentoResp);
    }
    var envVal = (documentoResp && documentoResp.enviar_para_mg) ? documentoResp.enviar_para_mg : 'sim';
    _terceirosAtualizarEnviarMgLocal(documentoId, envVal);
    if (!opcoes.movimento_enviar_mg_sim_aplicado) {
        await terceirosNavegarParaNotasEnviadasMgAposConfirmar(documentoId);
    }
    void recarregarTodasListasTerceiros().catch(function(e) {
        console.error(e);
    });
    showMessage('Enviado para MG registrado. A NF está nas abas 7 e 8.', 'success');
}

function fecharModalExcluirDocumento(confirmado) {
    var modal = document.getElementById('modal-terceiros-excluir-documento');
    _terceirosOcultarModalOverlay(modal);
    if (_terceirosExcluirDocumentoResolver) {
        _terceirosExcluirDocumentoResolver(!!confirmado);
        _terceirosExcluirDocumentoResolver = null;
    }
    if (!confirmado) {
        _terceirosExcluirDocumentoAtual = null;
    }
}

function abrirModalExcluirDocumento(infoDocumento) {
    var modal = document.getElementById('modal-terceiros-excluir-documento');
    var infoEl = document.getElementById('modal-terceiros-excluir-documento-info');
    _terceirosExcluirDocumentoAtual = infoDocumento || null;
    if (infoEl) {
        infoEl.textContent = infoDocumento && infoDocumento.nf ? infoDocumento.nf : 'NF não identificada';
    }
    if (!modal) {
        return Promise.resolve(window.confirm('Deseja excluir esta NF do módulo de terceiros?'));
    }
    return new Promise(function(resolve) {
        _terceirosExcluirDocumentoResolver = resolve;
        _terceirosPrepararModalConfirmacaoBackdrop();
        window.setTimeout(function() {
            _terceirosExibirModalOverlay(modal);
        }, 0);
    });
}

var TERCEIROS_EXCLUIR_BTN_SELETOR = [
    '[data-ter-excluir-doc]',
    '[data-ter-excluir-fornecedor-doc]',
    '[data-ter-excluir-pend-lanc-doc]',
    '[data-ter-excluir-lancada-doc]',
    '[data-ter-excluir-enviada-doc]',
    '[data-ter-excluir-receb-mg-doc]',
    '[data-ter-excluir-pendencia-doc]',
    '[data-ter-excluir-historico-doc]'
].join(', ');

var TERCEIROS_EXCLUIR_BTN_ATTRS = [
    'data-ter-excluir-doc',
    'data-ter-excluir-fornecedor-doc',
    'data-ter-excluir-pend-lanc-doc',
    'data-ter-excluir-lancada-doc',
    'data-ter-excluir-enviada-doc',
    'data-ter-excluir-receb-mg-doc',
    'data-ter-excluir-pendencia-doc',
    'data-ter-excluir-historico-doc'
];

function _terceirosObterIdDoBotaoExcluir(btn) {
    if (!btn) return NaN;
    for (var i = 0; i < TERCEIROS_EXCLUIR_BTN_ATTRS.length; i++) {
        var raw = btn.getAttribute(TERCEIROS_EXCLUIR_BTN_ATTRS[i]);
        if (raw == null || raw === '') continue;
        var id = terceirosIdDocumentoDeAtributo(raw);
        if (Number.isFinite(id)) return id;
    }
    return NaN;
}

async function _terceirosFluxoExcluirDocumento(documentoId, nf, btnEl) {
    var id = Number(documentoId);
    if (!Number.isFinite(id) || id <= 0) {
        showMessage('Não foi possível identificar a nota. Recarregue a lista.', 'warning');
        return;
    }
    if (window._terceirosExclusaoIdsEmAndamento[String(id)]) {
        showMessage('Esta NF já está sendo excluída. Aguarde.', 'warning');
        return;
    }
    var confirmou = await abrirModalExcluirDocumento({ id: id, nf: nf || 'NF não identificada' });
    if (!confirmou) {
        showMessage('Exclusão cancelada.', 'warning');
        return;
    }
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.dataset.terExcluindo = '1';
    }
    try {
        await excluirDocumentoTerceiros(id);
    } finally {
        if (btnEl && btnEl.isConnected) {
            btnEl.disabled = false;
            delete btnEl.dataset.terExcluindo;
        }
    }
}

/** Um listener no módulo Terceiros: Excluir funciona em todas as abas após re-render da tabela. */
function initTerceirosExcluirDelegacaoGlobal() {
    if (window._terceirosExcluirDelegacaoOk) return;
    var modulo = document.getElementById('modulo-terceiros');
    if (!modulo) return;
    window._terceirosExcluirDelegacaoOk = true;
    modulo.addEventListener('click', function(ev) {
        var el = ev.target;
        if (!el || typeof el.closest !== 'function') return;
        var btn = el.closest(TERCEIROS_EXCLUIR_BTN_SELETOR);
        if (!btn || !modulo.contains(btn)) return;
        if (btn.disabled || btn.dataset.terExcluindo === '1') return;
        ev.preventDefault();
        ev.stopPropagation();
        var id = _terceirosObterIdDoBotaoExcluir(btn);
        var nf = btn.getAttribute('data-ter-excluir-nf') || 'NF não identificada';
        void _terceirosFluxoExcluirDocumento(id, nf, btn);
    });
}

function _terceirosTextoArquivo(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(String(reader.result || '')); };
        reader.onerror = function() { reject(reader.error || new Error('Erro ao ler XML.')); };
        reader.readAsText(file);
    });
}

function _terceirosNumeroPedidoValidoLocal(valor) {
    var p = String(valor || '').trim();
    if (!p) return false;
    var normalizado = p.toLowerCase().replace(/[./]/g, '');
    if (['', '-', '—', 'na', 'n/a', 'nao', 'não', 'none', 'null', 's/n', 'sn', 'sem', 'sem pedido', '0'].indexOf(normalizado) >= 0) return false;
    if (p.length <= 2 && !/\d/.test(p)) return false;
    return true;
}

function _terceirosExtrairPedidoTextoLivreLocal(texto) {
    texto = String(texto || '');
    var patterns = [
        /Numero do Pedido do Cliente:\s*([^|\n\r;]+)/i,
        /N[uú]mero\s+do\s+Pedido[^:]*:\s*([^|\n\r;]+)/i,
        /(?:ORDEM\s+DE\s+COMPRA|O\.?C\.?)\s*(?:n[º°.]|N[º°]|No\.?|#)?\s*:?\s*([0-9][0-9A-Za-z\-/]*)/i,
        /(?:xPed|XPED)\s*[=:]\s*([0-9][0-9A-Za-z\-/]*)/i,
        /\bPED\.?\s*(?:CLIENTE|COMPRA)?\s*[=:#]?\s*([0-9][0-9A-Za-z\-/]*)/i,
        /Pedido\s*(?:do\s+Cliente\s*)?(?:n[º°.]|N[º°]|No\.?|#)?\s*:+\s*([0-9][0-9A-Za-z\-/]*)/i,
        /\bOC\s*[=:#]?\s*([0-9][0-9A-Za-z\-/]*)/i
    ];
    for (var i = 0; i < patterns.length; i++) {
        var match = texto.match(patterns[i]);
        if (match && _terceirosNumeroPedidoValidoLocal(match[1])) return String(match[1]).trim();
    }
    return '';
}

function _terceirosExtrairPedidoXmlLocal(xmlTexto) {
    var texto = String(xmlTexto || '');
    if (!texto.trim()) return '';
    if (typeof DOMParser !== 'undefined') {
        var doc = new DOMParser().parseFromString(texto, 'text/xml');
        var tags = doc.getElementsByTagName('*');
        for (var i = 0; i < tags.length; i++) {
            var nome = String(tags[i].localName || tags[i].nodeName || '').toLowerCase();
            if (nome === 'xped' || nome === 'nped') {
                var val = String(tags[i].textContent || '').trim();
                if (_terceirosNumeroPedidoValidoLocal(val)) return val;
            }
        }
        for (var j = 0; j < tags.length; j++) {
            var nomeObs = String(tags[j].localName || tags[j].nodeName || '').toLowerCase();
            if (nomeObs === 'obscont') {
                var campoEl = null;
                var textoEl = null;
                for (var c = 0; c < tags[j].childNodes.length; c++) {
                    var child = tags[j].childNodes[c];
                    var childName = String(child.localName || child.nodeName || '').toLowerCase();
                    if (childName === 'xcampo') campoEl = child;
                    if (childName === 'xtexto') textoEl = child;
                }
                var campoTxt = String((campoEl && campoEl.textContent) || '').toLowerCase();
                if (textoEl && (campoTxt.indexOf('ped') >= 0 || campoTxt === 'xped' || campoTxt === 'oc' || campoTxt.indexOf('ordem') >= 0)) {
                    var valTextoObs = String(textoEl.textContent || '').trim();
                    if (_terceirosNumeroPedidoValidoLocal(valTextoObs)) return valTextoObs;
                }
            }
            if (nomeObs === 'infadprod' || nomeObs === 'infcpl' || nomeObs === 'xtexto') {
                var valObs = _terceirosExtrairPedidoTextoLivreLocal(tags[j].textContent || '');
                if (valObs) return valObs;
            }
        }
    }
    return _terceirosExtrairPedidoTextoLivreLocal(texto);
}

async function _terceirosValidarPedidosXmlAntesUpload(files) {
    var erros = [];
    var lista = Array.prototype.slice.call(files || []);
    for (var i = 0; i < lista.length; i++) {
        var file = lista[i];
        var texto = await _terceirosTextoArquivo(file);
        var pedido = _terceirosExtrairPedidoXmlLocal(texto);
        if (!_terceirosNumeroPedidoValidoLocal(pedido)) {
            erros.push((file && file.name ? file.name : 'XML') + ': sem número de pedido.');
        }
    }
    return erros;
}

async function uploadXmlTerceirosComPrefixo(prefixo, areaChave, opcoes) {
    opcoes = opcoes || {};
    var previsaoEl = document.getElementById(prefixo + '-previsao');
    var pedidoEl = document.getElementById(prefixo + '-pedido');
    var consumivelEl = document.getElementById(prefixo + '-consumivel-sp');
    var recebedorConsumivelEl = document.getElementById(prefixo + '-recebedor-consumivel-sp');
    var filesEl = document.getElementById(prefixo + '-xml');
    var resultadoEl = document.getElementById(prefixo + '-upload-resultado');
    if (!previsaoEl || !filesEl || !resultadoEl) return;
    if (!previsaoEl.value.trim()) {
        resultadoEl.textContent = 'Informe a previsão de chegada.';
        return;
    }
    var pedidoManual = pedidoEl ? (pedidoEl.value || '').trim() : '';
    if (areaChave !== 'carreta' && !_terceirosNumeroPedidoValidoLocal(pedidoManual)) {
        resultadoEl.textContent = 'Informe o número de pedido antes de subir os XMLs.';
        if (pedidoEl) pedidoEl.focus();
        return;
    }
    var consumivelSp = !!(consumivelEl && consumivelEl.checked);
    var recebedorConsumivel = recebedorConsumivelEl ? (recebedorConsumivelEl.value || '').trim() : '';
    if (areaChave !== 'carreta' && consumivelSp && !recebedorConsumivel) {
        resultadoEl.textContent = 'Informe quem solicitou/irá receber o consumível SP.';
        if (recebedorConsumivelEl) recebedorConsumivelEl.focus();
        return;
    }
    var motEl = null;
    var plaEl = null;
    if (opcoes.exigeMotoristaPlaca) {
        motEl = document.getElementById(prefixo + '-motorista');
        plaEl = document.getElementById(prefixo + '-placa');
        if (!motEl || !plaEl) return;
        var motVal = (motEl.value || '').trim();
        var plaVal = (plaEl.value || '').trim();
        if (!motVal) {
            resultadoEl.textContent = 'Informe o nome do motorista.';
            return;
        }
        if (!plaVal) {
            resultadoEl.textContent = 'Informe a placa da carreta.';
            return;
        }
    }
    if (!filesEl.files || !filesEl.files.length) {
        resultadoEl.textContent = 'Selecione ao menos um XML.';
        return;
    }
    var form = new FormData();
    form.append('area', getTerceirosAreaApi(areaChave));
    form.append('previsao_chegada', previsaoEl.value.trim());
    if (areaChave !== 'carreta') {
        form.append('numero_pedido', pedidoManual);
        form.append('consumivel_sp', consumivelSp ? 'sim' : '');
        form.append('recebedor_consumivel_sp', consumivelSp ? recebedorConsumivel : '');
    }
    if (opcoes.exigeMotoristaPlaca && motEl && plaEl) {
        form.append('motorista_carreta', (motEl.value || '').trim());
        form.append('placa_carreta', (plaEl.value || '').trim().toUpperCase());
    }
    Array.prototype.forEach.call(filesEl.files, function(file) {
        form.append('files', file);
    });
    var qtdArquivos = filesEl.files.length;
    var btnUploadId = prefixo === 'ter-carreta' ? 'btn-ter-carreta-upload' : 'btn-ter-recebimento-upload';
    var btnUpload = document.getElementById(btnUploadId);
    resultadoEl.textContent = '';
    if (btnUpload) btnUpload.disabled = true;
    mostrarTerAcaoLoading(
        'Enviando ' + qtdArquivos + ' arquivo' + (qtdArquivos > 1 ? 's' : '') + ' XML…',
        'Aguarde enquanto os XMLs são processados no servidor.',
        { mensagemCancelado: 'Envio de XMLs cancelado.' }
    );
    try {
        var fetchOpts = {
            method: 'POST',
            body: form,
            credentials: 'same-origin'
        };
        var sigUpload = terAcaoLoadingSignal();
        if (sigUpload) fetchOpts.signal = sigUpload;
        const resp = await fetch(API_BASE + '/terceiros/upload-xml', fetchOpts);
        if (window._terAcaoLoadCancelado) {
            resultadoEl.textContent = 'Envio cancelado.';
            return;
        }
        const data = await resp.json().catch(function() { return {}; });
        if (!resp.ok || !data.ok) {
            resultadoEl.textContent = (data && data.erro) ? data.erro : 'Erro ao enviar XMLs.';
            return;
        }
        fecharTerAcaoLoading();
        resultadoEl.textContent = '';
        filesEl.value = '';
        if (areaChave !== 'carreta' && pedidoEl) pedidoEl.value = '';
        if (areaChave !== 'carreta' && consumivelEl) consumivelEl.checked = false;
        if (areaChave !== 'carreta' && recebedorConsumivelEl) recebedorConsumivelEl.value = '';
        var consumivelBox = document.getElementById(prefixo + '-consumivel-sp-box');
        if (consumivelBox) consumivelBox.style.display = 'none';
        if (opcoes.exigeMotoristaPlaca && motEl) motEl.value = '';
        if (opcoes.exigeMotoristaPlaca && plaEl) plaEl.value = '';
        var idsCriados = Array.isArray(data.criados) ? data.criados : [];
        if (idsCriados.length) {
            definirDestaqueLinhaTerceirosDoc(idsCriados[idsCriados.length - 1]);
        }
        if ((data.total_criados || 0) > 0) {
            void _terceirosAplicarUploadNoCache(data);
        }
        abrirModalUploadXmlTerceirosConcluido({
            totalCriados: data.total_criados || 0,
            erros: data.erros || [],
            previsao: previsaoEl.value.trim(),
            areaLabel: _terceirosLabelAreaUpload(areaChave)
        });
    } catch (e) {
        if (_terAcaoFoiCancelado(e)) {
            resultadoEl.textContent = 'Envio cancelado.';
            return;
        }
        resultadoEl.textContent = 'Erro ao enviar XMLs.';
    } finally {
        if (btnUpload) btnUpload.disabled = false;
        fecharTerAcaoLoading();
    }
}

async function uploadXmlTerceiros() {
    return uploadXmlTerceirosComPrefixo('ter-recebimento', 'recebimento');
}

async function uploadXmlTerceirosCarreta() {
    return uploadXmlTerceirosComPrefixo('ter-carreta', 'carreta', { exigeMotoristaPlaca: true });
}

var _terceirosListaCache = { rows: null, erro: null, ts: 0, promise: null };
var _terceirosListaFetchGen = 0;
var TERCEIROS_LISTA_CACHE_MS = 90000;
/** Lista antiga ainda exibida enquanto o servidor responde (evita tela vazia por timeout). */
var TERCEIROS_LISTA_CACHE_STALE_MS = 600000;
var _terceirosPrefetchPromise = null;

/**
 * Uma única requisição ao abrir a página: preenche todas as tabelas Terceiros em paralelo.
 */
function _terceirosGarantirPrefetchLista() {
    if (_terceirosPrefetchPromise) return _terceirosPrefetchPromise;
    _terceirosPrefetchPromise = fetchTerceirosDocumentosTodos().then(function(data) {
        void warmTerceirosTodasListas(data);
        return data;
    }).catch(function(e) {
        console.error('_terceirosGarantirPrefetchLista:', e);
        _terceirosPrefetchPromise = null;
        throw e;
    });
    return _terceirosPrefetchPromise;
}

/** Preenche listas: aba visível primeiro; demais em background (troca de aba instantânea). */
async function warmTerceirosTodasListas(dataPreloaded, opcoes) {
    opcoes = opcoes || {};
    var data = dataPreloaded;
    if (!data || (!data.rows && !data.erro)) {
        data = await fetchTerceirosDocumentosTodos();
    }
    if (!data) return;
    var abaAtiva = opcoes.abaPrioritaria != null
        ? _terceirosNormalizarAbaTab(opcoes.abaPrioritaria)
        : _terceirosNormalizarAbaTab(_terceirosTabAtual || 'painel');
    var pularAtiva = !!opcoes.pularAbaAtiva;
    if (!pularAtiva) {
        if (abaAtiva === 'painel') {
            await loadPainelTerceiros();
        } else {
            var loaderAtivo = _terceirosLoaderPorAba(abaAtiva);
            if (loaderAtivo) await loaderAtivo(data);
        }
        void atualizarAlertasTerceirosHeader(_terceirosMesclarRecebidosLocaisNasRows(data.rows || []));
    }
    var demais = TERCEIROS_ABAS_LISTA_WARM.filter(function(t) {
        return pularAtiva || t !== abaAtiva;
    });
    void Promise.all(demais.map(function(tab) {
        var fn = _terceirosLoaderPorAba(tab);
        if (!fn) return Promise.resolve();
        return Promise.resolve(fn(data)).catch(function(err) {
            console.error('warmTerceirosTodasListas:', tab, err);
        });
    }));
}

function invalidateTerceirosListaCache() {
    _terceirosListaCache.rows = null;
    _terceirosListaCache.erro = null;
    _terceirosListaCache.ts = 0;
    window._terceirosPainelUltimoData = null;
}

function _terceirosMarcarDocumentoExcluidoOculto(documentoId) {
    if (documentoId == null || documentoId === '') return;
    window._terceirosIdsOcultosExclusao.add(String(documentoId));
}

function _terceirosDesmarcarDocumentoExcluidoOculto(documentoId) {
    if (documentoId == null || documentoId === '') return;
    window._terceirosIdsOcultosExclusao.delete(String(documentoId));
}

function _terceirosDesmarcarDocumentoExcluidoOcultoDepois(documentoId, ms) {
    if (documentoId == null || documentoId === '') return;
    window.setTimeout(function() {
        _terceirosDesmarcarDocumentoExcluidoOculto(documentoId);
    }, ms || 15000);
}

function _terceirosFiltrarRowsNaoExcluidas(rows) {
    if (!Array.isArray(rows)) return rows;
    var ocultos = window._terceirosIdsOcultosExclusao;
    if (!ocultos || !ocultos.size) return rows;
    return rows.filter(function(row) {
        return !row || row.id == null || !ocultos.has(String(row.id));
    });
}

function _terceirosObterCacheLista(opcoes) {
    opcoes = opcoes || {};
    var now = Date.now();
    if (!_terceirosListaCache.rows || !_terceirosListaCache.rows.length) return null;
    var idade = now - (_terceirosListaCache.ts || 0);
    var rowsFiltradas = _terceirosFiltrarRowsNaoExcluidas(_terceirosListaCache.rows);
    if (idade < TERCEIROS_LISTA_CACHE_MS) {
        return { rows: rowsFiltradas, erro: _terceirosListaCache.erro };
    }
    if (opcoes.staleOk && idade < TERCEIROS_LISTA_CACHE_STALE_MS) {
        return { rows: rowsFiltradas, erro: _terceirosListaCache.erro, _stale: true };
    }
    return null;
}

function _terceirosRecarregarAbasAposListaAtualizada(data) {
    if (!data || !data.rows) return;
    var tab = _terceirosNormalizarAbaTab(_terceirosTabAtual || 'painel');
    void recarregarListaTerceirosTab(tab);
    void warmTerceirosTodasListas(data, { pularAbaAtiva: true });
}

/** Uma requisição compartilhada; abas leem do cache ou reutilizam fetch em andamento. */
async function fetchTerceirosDocumentosTodos(opcoes) {
    opcoes = opcoes || {};
    var force = !!opcoes.force;
    if (force) {
        _terceirosListaFetchGen++;
        window._terceirosFornecedoresRecebidosLocais = {};
    }
    if (!force) {
        var hit = _terceirosObterCacheLista();
        if (hit) return hit;
        var stale = _terceirosObterCacheLista({ staleOk: true });
        if (stale && stale._stale) {
            if (!_terceirosListaCache.promise) {
                _terceirosListaCache.promise = fetchTerceirosDocumentosTodos({ force: true })
                    .then(function(data) {
                        _terceirosRecarregarAbasAposListaAtualizada(data);
                        return data;
                    })
                    .catch(function(e) {
                        console.error('fetchTerceirosDocumentosTodos revalidação:', e);
                        return stale;
                    })
                    .finally(function() {
                        _terceirosListaCache.promise = null;
                    });
            }
            return stale;
        }
        if (_terceirosListaCache.promise) return _terceirosListaCache.promise;
    }
    function _terceirosOrdenarRowsLista(rows) {
        return (rows || []).slice().sort(function(a, b) {
            return Number(b.id || 0) - Number(a.id || 0);
        });
    }
    function _terceirosErroRespostaDocumentos(resp) {
        if (!resp) return 'Erro ao carregar documentos.';
        if (resp._timeout) return 'Tempo esgotado ao contactar o servidor.';
        if (resp._falhaGateway) {
            return mensagemErroRespostaNaoJson(502, typeof resp.erro === 'string' ? resp.erro : '');
        }
        return (resp && resp.erro) ? resp.erro : null;
    }
    function _terceirosMesclarResumoItensNasRows(baseRows, fullRows) {
        if (!Array.isArray(fullRows) || !fullRows.length) return baseRows;
        fullRows = _terceirosFiltrarRowsNaoExcluidas(fullRows);
        var porId = {};
        fullRows.forEach(function(r) {
            if (r && r.id != null) porId[String(r.id)] = r;
        });
        var base = _terceirosFiltrarRowsNaoExcluidas(Array.isArray(baseRows) ? baseRows : []);
        var idsVistos = {};
        var merged = base.map(function(r) {
            if (!r || r.id == null) return r;
            idsVistos[String(r.id)] = true;
            var f = porId[String(r.id)];
            if (!f) return r;
            return Object.assign({}, r, f);
        });
        fullRows.forEach(function(r) {
            if (!r || r.id == null || idsVistos[String(r.id)]) return;
            if (window._terceirosIdsOcultosExclusao && window._terceirosIdsOcultosExclusao.has(String(r.id))) return;
            merged.push(r);
        });
        return merged;
    }
    function _terceirosAtualizarCacheLista(ordenadas, erro) {
        ordenadas = _terceirosRowsEstadoMesclado(_terceirosFiltrarRowsNaoExcluidas(ordenadas));
        if (ordenadas.length || !erro) {
            _terceirosListaCache.rows = ordenadas;
            _terceirosListaCache.erro = erro;
            _terceirosListaCache.ts = Date.now();
        }
    }
    async function _terceirosBuscarResumoCompletoEmBackground() {
        var genInicio = _terceirosListaFetchGen;
        try {
            var respFull = await fetchAPIComTimeout(
                '/terceiros/documentos?area=' + encodeURIComponent('todas'),
                {},
                90000
            );
            if (genInicio !== _terceirosListaFetchGen) return;
            var erroFull = _terceirosErroRespostaDocumentos(respFull);
            var rowsFull = Array.isArray(respFull && respFull.rows) ? respFull.rows : [];
            if (erroFull || !rowsFull.length) return;
            if (genInicio !== _terceirosListaFetchGen) return;
            var ordenadasFull = _terceirosOrdenarRowsLista(rowsFull);
            var base = _terceirosListaCache.rows || ordenadasFull;
            var merged = _terceirosMesclarResumoItensNasRows(base, ordenadasFull);
            _terceirosAtualizarCacheLista(_terceirosOrdenarRowsLista(merged.length ? merged : ordenadasFull), null);
            if (genInicio !== _terceirosListaFetchGen) return;
            _terceirosRecarregarAbasAposListaAtualizada({ rows: _terceirosListaCache.rows, erro: null });
        } catch (e) {
            console.error('_terceirosBuscarResumoCompletoEmBackground:', e);
        }
    }
    var executar = async function() {
        var respLeve = await fetchAPIComTimeout(
            '/terceiros/documentos?area=' + encodeURIComponent('todas') + '&leve=1',
            {},
            45000
        );
        var erroLeve = _terceirosErroRespostaDocumentos(respLeve);
        var rowsLeve = Array.isArray(respLeve && respLeve.rows) ? respLeve.rows : [];
        if (!erroLeve && rowsLeve.length) {
            var ordenadasLeve = _terceirosOrdenarRowsLista(rowsLeve);
            _terceirosAtualizarCacheLista(ordenadasLeve, null);
            void _terceirosBuscarResumoCompletoEmBackground();
            return { erro: null, rows: ordenadasLeve };
        }
        var resp = await fetchAPIComTimeout(
            '/terceiros/documentos?area=' + encodeURIComponent('todas'),
            {},
            90000
        );
        var erro = _terceirosErroRespostaDocumentos(resp);
        var rows = Array.isArray(resp && resp.rows) ? resp.rows : [];
        var ordenadas = _terceirosOrdenarRowsLista(rows);
        if (ordenadas.length || !erro) {
            _terceirosAtualizarCacheLista(ordenadas, erro);
        } else if (_terceirosListaCache.rows && _terceirosListaCache.rows.length) {
            return { erro: erro, rows: _terceirosListaCache.rows, _stale: true };
        }
        return { erro: erro, rows: ordenadas };
    };
    _terceirosListaCache.promise = executar().finally(function() {
        _terceirosListaCache.promise = null;
    });
    return _terceirosListaCache.promise;
}

async function _terceirosResolverDadosLista(dataPreloaded, tbody, colspan) {
    if (dataPreloaded && (dataPreloaded.rows || dataPreloaded.erro)) return dataPreloaded;
    var hit = _terceirosDadosListaParaRender();
    if (hit) {
        if (hit._stale) void fetchTerceirosDocumentosTodos();
        return hit;
    }
    if (_terceirosListaCache.promise) {
        var hitParcial = _terceirosDadosListaParaRender();
        if (hitParcial && hitParcial.rows && hitParcial.rows.length) {
            void _terceirosListaCache.promise.then(function(data) {
                if (data && data.rows) _terceirosRecarregarAbasAposListaAtualizada(data);
            }).catch(function() {});
            return hitParcial;
        }
        return _terceirosListaCache.promise;
    }
    if (_terceirosPrefetchPromise) {
        var hitPrefetch = _terceirosDadosListaParaRender();
        if (hitPrefetch && hitPrefetch.rows && hitPrefetch.rows.length) {
            return hitPrefetch;
        }
        return _terceirosPrefetchPromise;
    }
    if (tbody) {
        var jaTemLinhas = tbody.querySelector('tr[data-ter-doc-id]');
        if (!jaTemLinhas) {
            tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="loading">Carregando...</td></tr>';
        }
    }
    return fetchTerceirosDocumentosTodos();
}

function isTerceirosSim(valor) {
    return String(valor || '').toLowerCase() === 'sim';
}

function isTerceirosNao(valor) {
    return String(valor || '').toLowerCase() === 'nao';
}

/** Campos vindos da API podem vir como boolean, número ou texto (sim/nao). */
function isTerceirosFlagSim(valor) {
    if (valor === true || valor === 1) return true;
    if (valor === false || valor === 0 || valor == null) return false;
    var s = String(valor).toLowerCase();
    return s === 'sim' || s === 's' || s === 'true' || s === '1';
}

/** Recebimento concluído (flag, data no banco ou cache local após POST). */
function _terceirosRecebimentoEstaConcluido(row) {
    row = _terceirosRowEstadoMesclado(row || {});
    if (!row || row.id == null) return false;
    if (isTerceirosFlagSim(row.recebimento_concluido)) return true;
    if (String(row.recebimento_concluido_em || '').trim()) return true;
    if (String(row.nota_lancada || '').trim()) return true;
    if (String(row.enviar_para_mg || '').trim()) return true;
    if (String(row.carga_recebida_mg || '').trim()) return true;
    return false;
}

function isTerceirosFlagNao(valor) {
    if (valor === false || valor === 0) return true;
    if (valor === true || valor === 1) return false;
    return isTerceirosNao(valor);
}

function isTerceirosMotoristaObrigatorio(row) {
    return !!(row && row.motorista_obrigatorio);
}

/** XML enviado pelo bloco «Dados do envio (carreta)». */
function isTerceirosAreaCarreta(row) {
    return !!(row && String(row.area || '').toLowerCase() === 'carreta');
}

function isTerceirosConsumivelSp(row) {
    return isTerceirosFlagSim(row && row.consumivel_sp);
}

/** Rotas que passam pelas abas 6ª–8ª (envio/recebimento MG). */
function _terceirosUsaFluxoMg(row) {
    return !isTerceirosAreaCarreta(row) && !isTerceirosConsumivelSp(row);
}

function _terceirosEnviarMgEstaPendente(row) {
    return String((row && row.enviar_para_mg) || '').trim().toLowerCase() === 'pendente';
}

function _terceirosRecebidaMgSim(row) {
    return isTerceirosFlagSim(row && row.carga_recebida_mg);
}

/** 5ª aba: NF lançada aguardando conclusão carreta ou, em casos antigos, decisão MG. */
function _terceirosConsideraNotasLancadas(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (_terceirosConsideraHistorico(row)) return false;
    if (!isTerceirosFlagSim(row && row.nota_lancada)) return false;
    if (!_terceirosRecebimentoEstaConcluido(row)) return false;
    if (isTerceirosAreaCarreta(row)) {
        return !isTerceirosFlagSim(row.carga_recebida_mg);
    }
    if (isTerceirosConsumivelSp(row)) {
        return !isTerceirosFlagSim(row.consumivel_sp_historico);
    }
    return false;
}

/** 6ª aba: após recebimento inicial, aguardando confirmar envio MG. */
function _terceirosConsideraPendenciasMg(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (_terceirosConsideraHistorico(row)) return false;
    if (!_terceirosUsaFluxoMg(row)) return false;
    if (!_terceirosRecebimentoEstaConcluido(row)) return false;
    if (_terceirosRecebidaMgSim(row) || isTerceirosFlagNao(row.carga_recebida_mg)) return false;
    if (isTerceirosFlagSim(row.enviar_para_mg) || isTerceirosFlagNao(row.enviar_para_mg)) return false;
    return true;
}

/** 7ª aba: envio MG confirmado (Enviado MG = Sim), aguardando recebida MG. */
function _terceirosConsideraNotasEnviadasMg(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (_terceirosConsideraHistorico(row)) return false;
    if (!_terceirosUsaFluxoMg(row)) return false;
    if (!isTerceirosFlagSim(row.enviar_para_mg)) return false;
    if (isTerceirosFlagSim(row.carga_recebida_mg) || isTerceirosFlagNao(row.carga_recebida_mg)) return false;
    return true;
}

/** 8ª aba: aguardando confirmação de recebida em MG. */
function _terceirosConsideraRecebimentosMg(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (_terceirosConsideraHistorico(row)) return false;
    if (!_terceirosUsaFluxoMg(row)) return false;
    if (!isTerceirosFlagSim(row.enviar_para_mg)) return false;
    if (isTerceirosFlagSim(row.carga_recebida_mg) || isTerceirosFlagNao(row.carga_recebida_mg)) return false;
    return true;
}

/** Fluxo MG encerrado: lançada + enviada + recebida em MG. */
function _terceirosFluxoMgConcluido(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!_terceirosUsaFluxoMg(row)) return false;
    return isTerceirosFlagSim(row.nota_lancada)
        && isTerceirosFlagSim(row.enviar_para_mg)
        && isTerceirosFlagSim(row.carga_recebida_mg);
}

/** Histórico: fluxo encerrado (Sim em todas as etapas) ou «Não» com motivo registrado. */
function _terceirosHistoricoPeloEstadoRow(row) {
    if (!row || row.id == null) return false;
    if (isTerceirosAreaCarreta(row)) {
        return isTerceirosFlagSim(row.carga_recebida_mg);
    }
    if (isTerceirosConsumivelSp(row)) {
        return isTerceirosFlagSim(row.consumivel_sp_historico);
    }
    if (isTerceirosFlagNao(row.nota_lancada) && String(row.motivo_nao_lancada || '').trim()) return true;
    if (isTerceirosFlagNao(row.enviar_para_mg) && String(row.motivo_nao_enviar_mg || '').trim()) return true;
    if (isTerceirosFlagNao(row.carga_recebida_mg) && String(row.motivo_nao_recebida_mg || '').trim()) return true;
    if (!_terceirosUsaFluxoMg(row)) return false;
    return isTerceirosFlagSim(row.nota_lancada)
        && isTerceirosFlagSim(row.enviar_para_mg)
        && isTerceirosFlagSim(row.carga_recebida_mg);
}

/** Histórico: fluxo encerrado (Sim em todas as etapas) ou «Não» com motivo registrado. */
function _terceirosConsideraHistorico(row) {
    row = _terceirosRowEstadoMesclado(row);
    return _terceirosHistoricoPeloEstadoRow(row);
}

function _terceirosMotivoHtmlCampo(row, colMotivo) {
    var txt = row && row[colMotivo] ? String(row[colMotivo]).trim() : '';
    if (!txt) return '';
    return '<div class="ter-status-meta"><strong>Motivo:</strong> ' + escapeHtml(txt) + '</div>';
}

function textoResumoEnviarMgHistorico(row) {
    if (isTerceirosConsumivelSp(row)) return 'N/A — Consumível SP';
    if (isTerceirosAreaCarreta(row)) return 'N/A';
    if (isTerceirosFlagNao(row.enviar_para_mg)) return 'Não — sem envio';
    return row.enviar_para_mg || '-';
}

function _terceirosLabelEtapaAtual(row) {
    var etapa = _terceirosEtapaExclusivaDoRow(row);
    return TERCEIROS_LABEL_ABA[etapa] || etapa || '—';
}

/** @deprecated Use getTerceirosRowsPorEtapa(rows, 'notas-lancadas'). */
function getTerceirosRowsNotasLancadasComHistorico(rows) {
    return getTerceirosRowsPorEtapa(rows, 'notas-lancadas');
}

function _terceirosEnviarMgEhNao(row) {
    return isTerceirosFlagNao(row && row.enviar_para_mg);
}

function textoResumoRecebidaMgHistorico(row) {
    if (isTerceirosConsumivelSp(row)) {
        return isTerceirosFlagSim(row.consumivel_sp_historico) ? 'Histórico' : 'Sem MG';
    }
    if (isTerceirosAreaCarreta(row)) {
        return isTerceirosFlagSim(row.carga_recebida_mg) ? 'Concluído' : '-';
    }
    if (_terceirosEnviarMgEhNao(row)) return 'Não vai para MG';
    return row.carga_recebida_mg || '-';
}

/** Resumo legível do status de nota lançada (aba Fornecedores recebidos). */
function textoResumoNotaLancadaTerceiros(row) {
    if (isTerceirosFlagSim(row.nota_lancada)) return 'Sim';
    if (isTerceirosFlagNao(row.nota_lancada)) return 'Não';
    return 'Pendente';
}

function textoResumoEnviarMgTerceiros(row, etapa) {
    if (isTerceirosConsumivelSp(row)) return 'N/A — Consumível SP';
    if (isTerceirosAreaCarreta(row)) return 'N/A';
    if (isTerceirosFlagSim(row && row.enviar_para_mg)) {
        return (etapa === 'notas-enviadas-mg' || etapa === 'recebimentos-mg' || etapa === 'historico') ? 'Sim' : 'Sim';
    }
    if (isTerceirosFlagNao(row && row.enviar_para_mg)) return 'Não';
    return 'Pendente';
}

function textoResumoEnviadoMgColuna(row, etapa) {
    if (isTerceirosConsumivelSp(row)) return 'N/A — Consumível SP';
    if (isTerceirosAreaCarreta(row)) return 'N/A';
    if (etapa === 'notas-enviadas-mg' || etapa === 'recebimentos-mg' || etapa === 'historico') {
        if (isTerceirosFlagSim(row && row.enviar_para_mg)) return 'Sim';
        if (isTerceirosFlagNao(row && row.enviar_para_mg)) return 'Não';
        return 'Pendente';
    }
    return textoResumoEnviarMgTerceiros(row, etapa);
}

function textoResumoRecebidaMgTerceiros(row) {
    if (isTerceirosConsumivelSp(row)) {
        return isTerceirosFlagSim(row && row.consumivel_sp_historico) ? 'Histórico' : 'Sem MG';
    }
    if (isTerceirosAreaCarreta(row)) {
        return isTerceirosFlagSim(row && row.carga_recebida_mg) ? 'Concluído' : 'Sem MG';
    }
    if (_terceirosEnviarMgEhNao(row)) return 'Não vai para MG';
    if (isTerceirosFlagSim(row && row.carga_recebida_mg)) return 'Sim';
    if (isTerceirosFlagNao(row && row.carga_recebida_mg)) return 'Não';
    return 'Pendente';
}

function terceirosCelulaPlacaLista(row) {
    var plc = ((_terceirosPlacaLista(row) || '').trim() || '—');
    return '<td><strong>' + escapeHtml(plc) + '</strong></td>';
}

function terceirosCelulaMotoristaListaLeitura(row) {
    return '<td>' + terceirosListaCellTextoLongo(_terceirosMotoristaLista(row)) + '</td>';
}

function terceirosCelulasMotoristaPlacaHistorico(row) {
    var motChegada = (row.motorista_carreta || '').trim() || '—';
    var plaChegada = (row.placa_carreta || '').trim() || '—';
    if (isTerceirosAreaCarreta(row)) {
        return '<td><div class="ter-inline-stack">'
                + '<div><strong>Trouxe:</strong> ' + escapeHtml(motChegada) + '</div>'
            + '</div></td>'
            + '<td><div class="ter-inline-stack">'
                + '<div><strong>Trouxe:</strong> ' + escapeHtml(plaChegada) + '</div>'
            + '</div></td>';
    }
    var motSaida = (row.motorista_saida_mg || '').trim() || '—';
    var plaSaida = (row.placa_saida_mg || '').trim() || '—';
    return '<td><div class="ter-inline-stack">'
            + '<div><strong>Trouxe:</strong> ' + escapeHtml(motChegada) + '</div>'
            + '<div><strong>Levou:</strong> ' + escapeHtml(motSaida) + '</div>'
        + '</div></td>'
        + '<td><div class="ter-inline-stack">'
            + '<div><strong>Trouxe:</strong> ' + escapeHtml(plaChegada) + '</div>'
            + '<div><strong>Levou:</strong> ' + escapeHtml(plaSaida) + '</div>'
        + '</div></td>';
}

function renderTerceirosCelulasMotoristaPlacaLista(row, attrPrefix) {
    if (!_terceirosPodeEditarMotoristaPlaca()) {
        return terceirosCelulaMotoristaListaLeitura(row) + terceirosCelulaPlacaLista(row);
    }
    attrPrefix = attrPrefix || 'doc';
    var id = String(row.id);
    var motoristaVal = _terceirosMotoristaLista(row, attrPrefix);
    var placaVal = _terceirosPlacaLista(row, attrPrefix);
    var motoristaEm = _terceirosMotoristaEmLista(row, attrPrefix);
    var aviso = isTerceirosMotoristaObrigatorio(row)
        ? '<div class="ter-status-meta ter-status-meta--alerta">Obrigatório para esta rota</div>'
        : '';
    return '<td><div class="ter-inline-stack">'
            + '<input type="text" class="ter-input-inline" data-ter-motorista-' + attrPrefix + '-doc="' + escapeHtml(id) + '" value="' + escapeHtml(motoristaVal || '') + '" placeholder="Motorista">'
            + renderTerceirosUsuarioMeta(row.atualizado_por || '', motoristaEm)
            + aviso
        + '</div></td>'
        + '<td><div class="ter-inline-stack">'
            + '<input type="text" class="ter-input-inline" data-ter-placa-' + attrPrefix + '-doc="' + escapeHtml(id) + '" value="' + escapeHtml(placaVal || '') + '" placeholder="Placa" style="text-transform: uppercase;">'
            + '<button type="button" class="btn btn-secondary btn-sm" data-ter-salvar-mot-placa-' + attrPrefix + '-doc="' + escapeHtml(id) + '">Salvar</button>'
        + '</div></td>';
}

function bindTerceirosSalvarMotoristaPlacaLista(tbody, attrPrefix) {
    if (!tbody || !_terceirosPodeEditarMotoristaPlaca()) return;
    attrPrefix = attrPrefix || 'doc';
    tbody.querySelectorAll('[data-ter-salvar-mot-placa-' + attrPrefix + '-doc]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = parseInt(btn.getAttribute('data-ter-salvar-mot-placa-' + attrPrefix + '-doc') || '0', 10);
            var inputMot = document.querySelector('[data-ter-motorista-' + attrPrefix + '-doc="' + String(id) + '"]');
            var inputPla = document.querySelector('[data-ter-placa-' + attrPrefix + '-doc="' + String(id) + '"]');
            var motorista = inputMot ? inputMot.value.trim() : '';
            var placa = inputPla ? inputPla.value.trim() : '';
            if (!id) return;
            btn.disabled = true;
            var textoOriginal = btn.textContent;
            btn.textContent = 'Salvo';
            var tipo = attrPrefix === 'pend-mg' ? 'saida_mg' : 'chegada';
            void salvarMotoristaPlacaTerceirosDireto(id, motorista, placa, tipo).finally(function() {
                if (btn.isConnected) {
                    btn.disabled = false;
                    btn.textContent = textoOriginal || 'Salvar';
                }
            });
        });
    });
}

/** Coluna somente leitura fora da 6ª aba (Pendências envio MG). */
function renderTerceirosEnviarMgSomenteLeitura(row) {
    if (isTerceirosAreaCarreta(row)) {
        return '<span class="ter-status-meta">N/A — carga na carreta (sem envio MG)</span>';
    }
    return renderTerceirosStatusComUsuario(
        textoResumoEnviarMgTerceiros(row),
        row.enviar_para_mg_por || '',
        row.enviar_para_mg_em || ''
    ) + '<div class="ter-status-meta">Alterar na aba <strong>Notas lançadas</strong> ou <strong>Pendências envio MG</strong></div>';
}

/** Coluna somente leitura fora da 8ª aba (Recebimentos de MG). */
function renderTerceirosRecebidaMgSomenteLeitura(row) {
    if (isTerceirosAreaCarreta(row)) {
        return '<span class="ter-status-meta">Use o botão «Registrar no histórico» nesta linha</span>';
    }
    if (_terceirosEnviarMgEhNao(row)) {
        return renderTerceirosStatusComUsuario('Não vai para MG', '', '')
            + '<div class="ter-status-meta">NF sem envio para Minas Gerais</div>';
    }
    return renderTerceirosStatusComUsuario(
        textoResumoRecebidaMgTerceiros(row),
        row.carga_recebida_mg_por || '',
        row.carga_recebida_mg_em || ''
    ) + renderTerceirosRecebedorMgMeta(row)
        + '<div class="ter-status-meta">Alterar na aba <strong>Recebimentos de MG</strong></div>';
}

/** 5ª aba — fluxos sem MG: concluir e enviar ao Histórico. */
function renderTerceirosConclusaoSemMgTab5(row) {
    if (isTerceirosConsumivelSp(row)) {
        return '<td><div class="ter-inline-stack">'
            + '<button type="button" class="btn btn-primary btn-sm" data-ter-concluir-consumivel-doc="' + escapeHtml(String(row.id)) + '">Enviar para histórico</button>'
            + '<span class="ter-status-meta">Consumível SP sem envio MG</span>'
            + '</div></td>';
    }
    if (!isTerceirosAreaCarreta(row)) {
        return '<td>' + renderTerceirosRecebidaMgSomenteLeitura(row) + '</td>';
    }
    return '<td><div class="ter-inline-stack">'
        + '<button type="button" class="btn btn-primary btn-sm" data-ter-concluir-carreta-doc="' + escapeHtml(String(row.id)) + '">Registrar no histórico</button>'
        + '<span class="ter-status-meta">Sem envio para MG</span>'
        + '</div></td>';
}

/** NF com pelo menos uma unidade bipada (permanece na pendência até recebimento concluído). */
function _terceirosTemBipagemIniciada(row) {
    if (!row) return false;
    var q = parseFloat(row.quantidade_total_bipada);
    return !isNaN(q) && q > 1e-9;
}

/** Mescla cache local (recebimento / status) sobre a linha vinda da API. */
function _terceirosRowEstadoMesclado(row) {
    if (!row || row.id == null) return row || {};
    var id = String(row.id);
    var locais = window._terceirosFornecedoresRecebidosLocais || {};
    var local = locais[id];
    if (_terceirosHistoricoPeloEstadoRow(row)) {
        if (local) {
            try { delete locais[id]; } catch (e) { /* ignore */ }
        }
        return row;
    }
    if (!local) return row;
    var valorLocal = function(campo) {
        var v = local[campo];
        return v != null && String(v).trim() !== '' ? v : row[campo];
    };
    return Object.assign({}, row, {
        recebimento_concluido: local.recebimento_concluido != null ? local.recebimento_concluido : row.recebimento_concluido,
        recebimento_concluido_em: local.recebimento_concluido_em || row.recebimento_concluido_em,
        recebimento_concluido_por: local.recebimento_concluido_por || row.recebimento_concluido_por,
        nota_lancada: valorLocal('nota_lancada'),
        nota_lancada_em: local.nota_lancada_em || row.nota_lancada_em,
        nota_lancada_por: local.nota_lancada_por || row.nota_lancada_por,
        enviar_para_mg: valorLocal('enviar_para_mg'),
        enviar_para_mg_em: local.enviar_para_mg_em || row.enviar_para_mg_em,
        enviar_para_mg_por: local.enviar_para_mg_por || row.enviar_para_mg_por,
        motorista_carreta: valorLocal('motorista_carreta'),
        motorista_carreta_em: local.motorista_carreta_em || row.motorista_carreta_em,
        placa_carreta: valorLocal('placa_carreta'),
        motorista_saida_mg: valorLocal('motorista_saida_mg'),
        motorista_saida_mg_em: local.motorista_saida_mg_em || row.motorista_saida_mg_em,
        placa_saida_mg: valorLocal('placa_saida_mg'),
        carga_recebida_mg: valorLocal('carga_recebida_mg'),
        carga_recebida_mg_em: local.carga_recebida_mg_em || row.carga_recebida_mg_em,
        carga_recebida_mg_por: local.carga_recebida_mg_por || row.carga_recebida_mg_por,
        recebedor_mg: valorLocal('recebedor_mg'),
        consumivel_sp: valorLocal('consumivel_sp'),
        recebedor_consumivel_sp: valorLocal('recebedor_consumivel_sp'),
        consumivel_sp_historico: valorLocal('consumivel_sp_historico'),
        consumivel_sp_historico_em: local.consumivel_sp_historico_em || row.consumivel_sp_historico_em,
        consumivel_sp_historico_por: local.consumivel_sp_historico_por || row.consumivel_sp_historico_por,
        motivo_nao_lancada: valorLocal('motivo_nao_lancada'),
        motivo_nao_enviar_mg: valorLocal('motivo_nao_enviar_mg'),
        motivo_nao_recebida_mg: valorLocal('motivo_nao_recebida_mg'),
        quantidade_total_bipada: local.quantidade_total_bipada != null ? local.quantidade_total_bipada : row.quantidade_total_bipada,
        quantidade_total_xml: local.quantidade_total_xml != null ? local.quantidade_total_xml : row.quantidade_total_xml,
        itens_divergentes: local.itens_divergentes != null ? local.itens_divergentes : row.itens_divergentes
    });
}

function _terceirosRowsEstadoMesclado(rows) {
    return (Array.isArray(rows) ? rows : []).map(_terceirosRowEstadoMesclado);
}

function _terceirosRowPorId(documentoId) {
    if (documentoId == null) return null;
    var id = String(documentoId);
    if (_terceirosDocAtual && String(_terceirosDocAtual.id) === id) {
        return _terceirosRowEstadoMesclado(_terceirosDocAtual);
    }
    var rows = _terceirosListaCache.rows;
    if (Array.isArray(rows)) {
        for (var i = 0; i < rows.length; i++) {
            if (String(rows[i].id) === id) return _terceirosRowEstadoMesclado(rows[i]);
        }
    }
    var loc = (window._terceirosFornecedoresRecebidosLocais || {})[id];
    return loc ? _terceirosRowEstadoMesclado(loc) : null;
}

/** 2ª aba — até marcar recebimento concluído (inclui bipagem em andamento). */
function _terceirosConsideraPendenciaRecebimento(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!row || row.id == null) return false;
    if (_terceirosConsideraHistorico(row)) return false;
    return !_terceirosRecebimentoEstaConcluido(row);
}

/** 3ª aba — recebimento concluído, antes do lançamento fiscal. */
function _terceirosConsideraFornecedorRecebido(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!row || row.id == null) return false;
    if (!_terceirosRecebimentoEstaConcluido(row)) return false;
    if (_terceirosConsideraHistorico(row)) return false;
    if (_terceirosUsaFluxoMg(row)) return false;
    if (isTerceirosConsumivelSp(row)) return false;
    if (isTerceirosFlagSim(row.nota_lancada) || isTerceirosFlagNao(row.nota_lancada)) return false;
    return true;
}

/** Lançamento fiscal sem modal de aviso: recebimento concluído ou descarga já iniciada (bipagem). */
function _terceirosPodeLancarNotaSemConfirmacaoRecebimento(rowLike) {
    if (!rowLike) return false;
    return isTerceirosFlagSim(rowLike.recebimento_concluido) || _terceirosTemBipagemIniciada(rowLike);
}

function _terceirosOpPodeLancarNotaSemConfirmacao(opcoes) {
    opcoes = opcoes || {};
    if (opcoes.forcar_lancamento_sem_recebimento) return true;
    if (opcoes.fornecedor_recebido === true) return true;
    if (opcoes.recebimento_concluido === true || isTerceirosFlagSim(opcoes.recebimento_concluido)) return true;
    if (opcoes.row && _terceirosPodeLancarNotaSemConfirmacaoRecebimento(opcoes.row)) return true;
    return false;
}

/** 4ª aba — recebimento concluído e lançamento fiscal ainda pendente. */
function _terceirosConsideraPendenteLancamento(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!row || row.id == null) return false;
    if (_terceirosConsideraHistorico(row)) return false;
    if (!_terceirosRecebimentoEstaConcluido(row)) return false;
    if (isTerceirosFlagSim(row.nota_lancada) || isTerceirosFlagNao(row.nota_lancada)) return false;
    if (_terceirosUsaFluxoMg(row) && !_terceirosRecebidaMgSim(row)) return false;
    return true;
}

/** NF listada na aba (várias abas podem exibir a mesma NF conforme o fluxo). */
function _terceirosRowApareceNaEtapa(row, etapa) {
    row = _terceirosRowEstadoMesclado(row);
    if (!row || row.id == null) return false;
    if (etapa === 'historico') return _terceirosConsideraHistorico(row);
    if (etapa === 'pendencia-recebimento') return _terceirosConsideraPendenciaRecebimento(row);
    if (etapa === 'fornecedores-recebidos') return _terceirosConsideraFornecedorRecebido(row);
    if (etapa === 'pendentes-lancamento') return _terceirosConsideraPendenteLancamento(row);
    if (etapa === 'notas-lancadas') return _terceirosConsideraNotasLancadas(row);
    if (etapa === 'pendencias-mg') return _terceirosConsideraPendenciasMg(row);
    if (etapa === 'notas-enviadas-mg') return _terceirosConsideraNotasEnviadasMg(row);
    if (etapa === 'recebimentos-mg') return _terceirosConsideraRecebimentosMg(row);
    return false;
}

/** Etapa principal para alertas/navegação (uma NF, uma etiqueta). */
function _terceirosEtapaExclusivaDoRow(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!row || row.id == null) return '';
    if (_terceirosConsideraHistorico(row)) return 'historico';
    if (_terceirosConsideraPendenciaRecebimento(row)) return 'pendencia-recebimento';
    if (_terceirosConsideraRecebimentosMg(row)) return 'recebimentos-mg';
    if (_terceirosConsideraNotasEnviadasMg(row)) return 'notas-enviadas-mg';
    if (_terceirosConsideraPendenciasMg(row)) return 'pendencias-mg';
    if (_terceirosConsideraPendenteLancamento(row)) return 'pendentes-lancamento';
    if (_terceirosConsideraFornecedorRecebido(row)) return 'fornecedores-recebidos';
    if (_terceirosConsideraNotasLancadas(row)) return 'notas-lancadas';
    return '';
}

function _terceirosTotalBipadoItensLocais() {
    var itens = window._terceirosBipagemItens || [];
    var total = 0;
    for (var i = 0; i < itens.length; i++) {
        total += parseFloat(itens[i].quantidade_bipada) || 0;
    }
    return total;
}

/** Na 2ª aba: fecha descarga e leva à etapa correta quando a NF não pertence mais à pendência. */
function _terceirosFecharDescargaSeForaDaPendencia(documentoIdOpt) {
    if (_terceirosTabAtual !== 'pendencia-recebimento') return;
    var docId = documentoIdOpt != null ? Number(documentoIdOpt) : _terceirosDocumentoIdAtualParaApi();
    if (!Number.isFinite(docId) || docId <= 0) return;
    if (window._terceirosSuprimirFecharDescargaDocId != null
        && String(window._terceirosSuprimirFecharDescargaDocId) === String(docId)) {
        return;
    }
    var detalhe = document.getElementById('ter-recebimento-detalhe');
    if (!detalhe || detalhe.style.display === 'none') return;

    var rowLike = _terceirosRowEstadoMesclado(
        (_terceirosDocAtual && _terceirosDocAtual.id != null) ? _terceirosDocAtual : { id: docId }
    );
    if (!rowLike.id) rowLike.id = docId;
    if (_terceirosConsideraPendenciaRecebimento(rowLike)) return;
    if (_terceirosConsideraPendenteLancamento(rowLike)) return;

    resetTerceirosDetalhe();
    definirDestaqueLinhaTerceirosDoc(docId);
    var etapa = _terceirosEtapaExclusivaDoRow(rowLike);
    var tabDestino = (etapa && etapa !== 'pendencia-recebimento' && etapa !== 'historico')
        ? etapa
        : 'fornecedores-recebidos';
    terceirosAplicarPainelAbaSomenteUi(tabDestino);
    void recarregarListaTerceirosTab(tabDestino);
}

function _terceirosFecharDescargaSeDocumentoNaoNaListaPendencia(rowsPendencia) {
    var docId = _terceirosDocumentoIdAtualParaApi();
    if (docId == null) return;
    if (window._terceirosSuprimirFecharDescargaDocId != null
        && String(window._terceirosSuprimirFecharDescargaDocId) === String(docId)) {
        return;
    }
    var cache = window._terceirosPendenciaRowsCache || [];
    var naListaCache = cache.some(function(r) {
        return r && String(r.id) === String(docId);
    });
    if (naListaCache) return;
    var naLista = (Array.isArray(rowsPendencia) ? rowsPendencia : []).some(function(r) {
        return r && String(r.id) === String(docId);
    });
    if (!naLista) _terceirosFecharDescargaSeForaDaPendencia(docId);
}

function getTerceirosRowsPorEtapa(rows, etapa) {
    rows = _terceirosRowsEstadoMesclado(rows);
    return rows.filter(function(row) {
        return _terceirosRowApareceNaEtapa(row, etapa);
    });
}

function _terceirosIdsRecebidosLocais() {
    return Object.keys(window._terceirosFornecedoresRecebidosLocais || {});
}

function _terceirosGuardarFornecedorRecebidoLocal(row) {
    if (!row || row.id == null) return;
    var id = String(row.id);
    window._terceirosFornecedoresRecebidosLocais = window._terceirosFornecedoresRecebidosLocais || {};
    window._terceirosFornecedoresRecebidosLocais[id] = Object.assign({}, row, {
        recebimento_concluido: 'Sim',
        _recebido_local_em: Date.now()
    });
}

/** Sobrepõe estado local sobre rows da API (sininho / listas sem esperar o backend). */
function _terceirosMesclarRecebidosLocaisNasRows(rows) {
    return _terceirosRowsEstadoMesclado(rows);
}

function _terceirosMesclarFornecedoresRecebidosLocais(rows) {
    return _terceirosRowsEstadoMesclado(rows);
}

function atualizarAlertasTerceirosHeaderAposMudancaRecebimento() {
    _terceirosAtualizarAlertasHeaderDoCache();
}

/** Linhas atuais da 2ª aba (sempre recalcula a partir do cache global). */
function _terceirosObterRowsPendenciaLista() {
    var base = Array.isArray(_terceirosListaCache.rows) ? _terceirosListaCache.rows : [];
    return getTerceirosRowsPorEtapa(_terceirosMesclarRecebidosLocaisNasRows(base), 'pendencia-recebimento');
}

function _terceirosInvalidarCachePendenciaLista() {
    window._terceirosPendenciaRowsCache = null;
}

function _terceirosAtualizarRecebimentoConcluidoNoCacheLista(documentoId, patch) {
    if (documentoId == null || documentoId === '') return;
    var id = String(documentoId);
    patch = patch || {};
    if (Array.isArray(_terceirosListaCache.rows)) {
        _terceirosListaCache.rows = _terceirosListaCache.rows.map(function(row) {
            if (!row || String(row.id) !== id) return row;
            return Object.assign({}, row, patch, {
                recebimento_concluido: patch.recebimento_concluido != null ? patch.recebimento_concluido : true
            });
        });
        _terceirosListaCache.ts = Date.now();
    }
    _terceirosInvalidarCachePendenciaLista();
    _terceirosAtualizarPainelLocalRapido();
}

/** Remove NF do cache compartilhado das listas (sem novo fetch). */
function _terceirosRemoverDocumentoDoCacheLista(documentoId) {
    if (documentoId == null || documentoId === '') return;
    var id = String(documentoId);
    if (Array.isArray(_terceirosListaCache.rows)) {
        _terceirosListaCache.rows = _terceirosListaCache.rows.filter(function(row) {
            return !row || String(row.id) !== id;
        });
        _terceirosListaCache.ts = Date.now();
    }
}

/** Grava resposta do servidor no cache global e descarta override local da NF. */
function _terceirosPersistirDocumentoServidorNoCache(documento) {
    if (!documento || documento.id == null) return;
    var id = String(documento.id);
    try {
        var loc = window._terceirosFornecedoresRecebidosLocais;
        if (loc && Object.prototype.hasOwnProperty.call(loc, id)) delete loc[id];
    } catch (e) { /* ignore */ }
    if (Array.isArray(_terceirosListaCache.rows)) {
        var achou = false;
        _terceirosListaCache.rows = _terceirosListaCache.rows.map(function(row) {
            if (!row || String(row.id) !== id) return row;
            achou = true;
            return Object.assign({}, row, documento);
        });
        if (!achou) {
            _terceirosListaCache.rows.unshift(Object.assign({}, documento));
        }
        _terceirosListaCache.ts = Date.now();
    }
    _terceirosAtualizarPainelLocalRapido();
}

function _terceirosAtualizarContadoresPendLancamentoUfFromDom() {
    var counts = { MG: 0, SP: 0, OUTRAS: 0 };
    TERCEIROS_PEND_LANC_TBODY_IDS.forEach(function(tbodyId) {
        var tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        var n = tbody.querySelectorAll('tr[data-ter-doc-id]').length;
        if (tbodyId.indexOf('-mg') !== -1) counts.MG = n;
        else if (tbodyId.indexOf('-sp') !== -1) counts.SP = n;
        else counts.OUTRAS = n;
    });
    var countMg = document.getElementById('ter-pend-lanc-count-mg');
    var countSp = document.getElementById('ter-pend-lanc-count-sp');
    var countOutras = document.getElementById('ter-pend-lanc-count-outras');
    var blocoOutras = document.getElementById('ter-pend-lanc-bloco-outras');
    if (countMg) countMg.textContent = String(counts.MG);
    if (countSp) countSp.textContent = String(counts.SP);
    if (countOutras) countOutras.textContent = String(counts.OUTRAS);
    if (blocoOutras) blocoOutras.hidden = counts.OUTRAS === 0;
}

/** Remove a linha da NF de todas as tabelas visíveis do módulo. */
function _terceirosRemoverLinhaDeTodasListas(documentoId) {
    if (documentoId == null || documentoId === '') return;
    var id = String(documentoId);
    TERCEIROS_TBODIES_LISTA_DOC.forEach(function(tbodyId) {
        var tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        var tr = tbody.querySelector('tr[data-ter-doc-id="' + id + '"]');
        if (tr) tr.remove();
    });
    _terceirosAtualizarContadoresPendLancamentoUfFromDom();
}

/** Re-renderiza só a aba visível a partir do cache (após exclusão otimista). */
function _terceirosRecarregarAbaAtualDoCacheRapido() {
    var hit = _terceirosObterCacheLista();
    if (!hit || !Array.isArray(hit.rows)) return Promise.resolve();
    var data = { rows: hit.rows, erro: hit.erro };
    var tab = _terceirosTabAtual || 'pendencia-recebimento';
    if (tab === 'pendencia-recebimento') return loadTerceirosDocumentos(data);
    if (tab === 'fornecedores-recebidos') return loadTerceirosFornecedoresRecebidos(data);
    if (tab === 'pendentes-lancamento') return loadTerceirosPendentesLancamento(data);
    if (tab === 'notas-lancadas') return loadTerceirosNotasLancadas(data);
    if (tab === 'pendencias-mg') return loadTerceirosPendenciasMg(data);
    if (tab === 'notas-enviadas-mg') return loadTerceirosNotasEnviadasMg(data);
    if (tab === 'recebimentos-mg') return loadTerceirosRecebimentosMg(data);
    if (tab === 'historico') return loadTerceirosHistorico(data);
    return Promise.resolve();
}

/** Re-renderiza todas as abas a partir do cache (rápido, sem GET /documentos). */
function _terceirosReaplicarTodasListasDoCacheLocal() {
    var hit = _terceirosObterCacheLista();
    if (!hit || !Array.isArray(hit.rows)) return;
    var data = { rows: hit.rows, erro: hit.erro };
    void Promise.all([
        loadTerceirosDocumentos(data),
        loadTerceirosFornecedoresRecebidos(data),
        loadTerceirosPendentesLancamento(data),
        loadTerceirosNotasLancadas(data),
        loadTerceirosPendenciasMg(data),
        loadTerceirosNotasEnviadasMg(data),
        loadTerceirosRecebimentosMg(data),
        loadTerceirosHistorico(data)
    ]).then(function() {
        void atualizarAlertasTerceirosHeader(_terceirosMesclarRecebidosLocaisNasRows(hit.rows));
    }).catch(function(e) {
        console.error(e);
    });
}

/** Após excluir NF: remove caches locais para não reaparecer linha fantasma nas abas. */
function _terceirosRemoverDocumentoDosCachesLocais(documentoId) {
    if (documentoId == null || documentoId === '') return;
    var id = String(documentoId);
    _terceirosMarcarDocumentoExcluidoOculto(documentoId);
    _terceirosRemoverDocumentoDoCacheLista(documentoId);
    try {
        var loc = window._terceirosFornecedoresRecebidosLocais;
        if (loc && Object.prototype.hasOwnProperty.call(loc, id)) delete loc[id];
    } catch (e) {}
    try {
        if (Array.isArray(window._terceirosPendenciaRowsCache)) {
            window._terceirosPendenciaRowsCache = window._terceirosPendenciaRowsCache.filter(function(row) {
                return !row || String(row.id) !== id;
            });
        }
    } catch (e2) {}
}

function _terPad2(n) {
    n = Number(n);
    return (n >= 0 && n < 10) ? '0' + n : String(n);
}

function _terDateKeyLocal(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + _terPad2(d.getMonth() + 1) + '-' + _terPad2(d.getDate());
}

/** Interpreta previsão exibida (ex.: 28/04/2026 12:00:00) ou ISO. Retorna data local meia-noite. */
function parsePrevisaoChegadaTerceiros(texto) {
    if (texto == null) return null;
    var s = String(texto).trim();
    if (!s || s === '-') return null;
    var primeira = s.split(/\s+/)[0];
    var m = primeira.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        var d = parseInt(m[1], 10);
        var mo = parseInt(m[2], 10) - 1;
        var y = parseInt(m[3], 10);
        var dt = new Date(y, mo, d);
        if (dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d) {
            dt.setHours(0, 0, 0, 0);
            return dt;
        }
    }
    var t = Date.parse(s);
    if (!isNaN(t)) {
        var dt2 = new Date(t);
        dt2.setHours(0, 0, 0, 0);
        return dt2;
    }
    return null;
}

/** Previsão com data anterior a hoje (só dia, hora local). */
function _terceirosPrevisaoAtrasada(texto) {
    var pd = parsePrevisaoChegadaTerceiros(texto);
    if (!pd) return false;
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return pd.getTime() < hoje.getTime();
}

function renderTerceirosPrevisaoCelulaHtml(texto, extraHtml) {
    var exibicao = texto || '-';
    var atrasada = _terceirosPrevisaoAtrasada(texto);
    var cls = atrasada ? ' class="ter-previsao-atrasada"' : '';
    var conteudo = atrasada
        ? '<strong>' + escapeHtml(exibicao) + '</strong>'
        : escapeHtml(exibicao);
    return '<td' + cls + '>' + conteudo + (extraHtml || '') + '</td>';
}

function segundaFeiraSemanaContendo(hoje) {
    var x = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    var dow = x.getDay();
    var diff = dow === 0 ? -6 : 1 - dow;
    x.setDate(x.getDate() + diff);
    x.setHours(0, 0, 0, 0);
    return x;
}

/** Próxima semana (segunda a domingo), em relação à semana corrente. */
function intervaloSemanaQueVemTerceiros() {
    var segEsta = segundaFeiraSemanaContendo(new Date());
    var inicio = new Date(segEsta);
    inicio.setDate(inicio.getDate() + 7);
    inicio.setHours(0, 0, 0, 0);
    var fim = new Date(inicio);
    fim.setDate(fim.getDate() + 6);
    fim.setHours(0, 0, 0, 0);
    return { inicio: inicio, fim: fim };
}

function filtrarRowsPendenciaPorPrevisao(rows, tipo, dataLivreIso) {
    rows = Array.isArray(rows) ? rows : [];
    tipo = (tipo || 'todos').toLowerCase();
    if (tipo === 'todos') return rows;
    if (tipo === 'atrasado') {
        return rows.filter(function(row) {
            return _terceirosPrevisaoAtrasada(row.previsao_chegada);
        });
    }
    if (tipo === 'semana') {
        var iv = intervaloSemanaQueVemTerceiros();
        return rows.filter(function(row) {
            var pd = parsePrevisaoChegadaTerceiros(row.previsao_chegada);
            if (!pd) return false;
            pd.setHours(0, 0, 0, 0);
            return pd >= iv.inicio && pd <= iv.fim;
        });
    }
    var alvo = null;
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (tipo === 'hoje') {
        alvo = new Date(hoje);
    } else if (tipo === 'amanha') {
        alvo = new Date(hoje);
        alvo.setDate(alvo.getDate() + 1);
    } else if (tipo === 'depois') {
        alvo = new Date(hoje);
        alvo.setDate(alvo.getDate() + 2);
    } else if (tipo === 'livre' && dataLivreIso) {
        var parts = String(dataLivreIso).split('-');
        if (parts.length === 3) {
            alvo = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
    }
    if (!alvo) return rows;
    alvo.setHours(0, 0, 0, 0);
    var keyAlvo = _terDateKeyLocal(alvo);
    return rows.filter(function(row) {
        var pd = parsePrevisaoChegadaTerceiros(row.previsao_chegada);
        if (!pd) return false;
        return _terDateKeyLocal(pd) === keyAlvo;
    });
}

function renderTerceirosPendenciaDocumentosTbodyHtml(rows) {
    return rows.map(function(row) {
        return '<tr data-ter-doc-id="' + escapeHtml(String(row.id)) + '">'
            + renderTerceirosCelulasNfAtePrevisao(row)
            + renderTerceirosCelulasStatusFluxo(row, 'pendencia')
            + renderTerceirosListaAcoesCelula(renderTerceirosPendenciaRecebimentoAcoes(row))
            + '</tr>';
    }).join('');
}

function atualizarUiBotoesFiltroPrevisaoPendencia() {
    var tipo = (window._terceirosPendenciaFiltroTipo || 'todos').toLowerCase();
    document.querySelectorAll('.ter-filtro-previsao-btn').forEach(function(btn) {
        var t = (btn.getAttribute('data-ter-filtro-previsao') || '').toLowerCase();
        btn.classList.toggle('ter-filtro-previsao-btn--ativo', t === tipo);
    });
}

function reaplicarFiltroPrevisaoPendenciaRecebimento() {
    var tbody = document.getElementById('ter-tbody-recebimento-documentos');
    if (!tbody) return;
    var rows = _terceirosObterRowsPendenciaLista();
    if (!Array.isArray(_terceirosListaCache.rows) || !_terceirosListaCache.rows.length) {
        void loadTerceirosDocumentos();
        return;
    }
    window._terceirosPendenciaRowsCache = rows;
    var tipo = window._terceirosPendenciaFiltroTipo || 'todos';
    var dataLivre = window._terceirosPendenciaFiltroDataLivre || '';
    var filtradas = filtrarRowsPendenciaPorPrevisao(rows, tipo, dataLivre);
    atualizarUiBotoesFiltroPrevisaoPendencia();
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF com recebimento em aberto. Todas as notas subidas por XML aparecem aqui até o recebimento ser marcado como concluído.</td></tr>';
        var hidLista = document.getElementById('ter-rec-documento-id');
        var temNotaAbertaNaTela = (_terceirosDocAtual.id != null && String(_terceirosDocAtual.id).trim() !== '')
            || (hidLista && String(hidLista.value || '').trim() !== '');
        var detalhe = document.getElementById('ter-recebimento-detalhe');
        var detalheVisivel = !!(detalhe && detalhe.style.display !== 'none');
        if (!temNotaAbertaNaTela && !detalheVisivel) {
            resetTerceirosDetalhe();
        }
        return;
    }
    if (!filtradas.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">' + _terceirosMsgListaVaziaFiltroPrevisao() + '</td></tr>';
        return;
    }
    tbody.innerHTML = renderTerceirosPendenciaDocumentosTbodyHtml(filtradas);
}

function _terceirosMsgListaVaziaFiltroPrevisao() {
    if ((window._terceirosPendenciaFiltroTipo || '') === 'atrasado') {
        return 'Nenhuma NF com previsão <strong>atrasada</strong> (data anterior a hoje).';
    }
    return 'Nenhuma NF com <strong>previsão</strong> neste filtro. Use <strong>Todos</strong> ou escolha outra data.';
}

function _terceirosFiltrarRowsHistorico(rows) {
    rows = Array.isArray(rows) ? rows : [];
    var tipo = window._terceirosHistoricoFiltroDataTipo || 'todos';
    var dataLivre = window._terceirosHistoricoFiltroDataLivre || '';
    var uf = String(window._terceirosHistoricoFiltroUf || 'todos').toUpperCase();
    rows = filtrarRowsPendenciaPorPrevisao(rows, tipo, dataLivre);
    if (uf !== 'TODOS') {
        rows = rows.filter(function(row) {
            return String((row && row.destinatario_uf) || '').trim().toUpperCase() === uf;
        });
    }
    return rows;
}

function atualizarUiFiltrosHistoricoTerceiros() {
    var tipo = (window._terceirosHistoricoFiltroDataTipo || 'todos').toLowerCase();
    var uf = String(window._terceirosHistoricoFiltroUf || 'todos').toUpperCase();
    document.querySelectorAll('.ter-historico-filtro-data-btn').forEach(function(btn) {
        var t = (btn.getAttribute('data-ter-hist-filtro-data') || '').toLowerCase();
        btn.classList.toggle('ter-filtro-previsao-btn--ativo', t === tipo);
    });
    document.querySelectorAll('.ter-historico-filtro-uf-btn').forEach(function(btn) {
        var u = String(btn.getAttribute('data-ter-hist-filtro-uf') || 'todos').toUpperCase();
        btn.classList.toggle('ter-filtro-previsao-btn--ativo', u === uf);
    });
}

function _terceirosMsgListaVaziaHistoricoFiltro() {
    return 'Nenhuma NF no histórico com os filtros selecionados. Use <strong>Todos</strong> ou escolha outra data/UF.';
}

function reaplicarFiltrosHistoricoTerceiros() {
    var data = _terceirosObterCacheLista({ staleOk: true });
    if (!data || !Array.isArray(data.rows)) {
        void loadTerceirosHistorico();
        return;
    }
    void loadTerceirosHistorico(data);
}

function initTerceirosFiltrosHistorico() {
    if (window._terceirosFiltrosHistoricoBound) return;
    window._terceirosFiltrosHistoricoBound = true;
    if (typeof window._terceirosHistoricoFiltroDataTipo === 'undefined') window._terceirosHistoricoFiltroDataTipo = 'todos';
    if (typeof window._terceirosHistoricoFiltroUf === 'undefined') window._terceirosHistoricoFiltroUf = 'todos';
    document.querySelectorAll('.ter-historico-filtro-data-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            window._terceirosHistoricoFiltroDataTipo = (btn.getAttribute('data-ter-hist-filtro-data') || 'todos').toLowerCase();
            window._terceirosHistoricoFiltroDataLivre = '';
            var inp = document.getElementById('ter-historico-filtro-data-livre');
            if (inp) inp.value = '';
            reaplicarFiltrosHistoricoTerceiros();
        });
    });
    document.querySelectorAll('.ter-historico-filtro-uf-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            window._terceirosHistoricoFiltroUf = btn.getAttribute('data-ter-hist-filtro-uf') || 'todos';
            reaplicarFiltrosHistoricoTerceiros();
        });
    });
    var inpData = document.getElementById('ter-historico-filtro-data-livre');
    if (inpData) {
        inpData.addEventListener('change', function() {
            var v = (inpData.value || '').trim();
            window._terceirosHistoricoFiltroDataTipo = v ? 'livre' : 'todos';
            window._terceirosHistoricoFiltroDataLivre = v;
            reaplicarFiltrosHistoricoTerceiros();
        });
    }
    atualizarUiFiltrosHistoricoTerceiros();
}

function initTerceirosFiltroPrevisaoPendencia() {
    if (window._terceirosFiltroPrevisaoBound) return;
    window._terceirosFiltroPrevisaoBound = true;
    if (typeof window._terceirosPendenciaFiltroTipo === 'undefined') {
        window._terceirosPendenciaFiltroTipo = 'todos';
    }
    document.querySelectorAll('.ter-filtro-previsao-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var t = (btn.getAttribute('data-ter-filtro-previsao') || 'todos').toLowerCase();
            window._terceirosPendenciaFiltroTipo = t;
            window._terceirosPendenciaFiltroDataLivre = '';
            var inp = document.getElementById('ter-pendencia-filtro-data-livre');
            if (inp) inp.value = '';
            reaplicarFiltroPrevisaoPendenciaRecebimento();
        });
    });
    var inpData = document.getElementById('ter-pendencia-filtro-data-livre');
    if (inpData) {
        inpData.addEventListener('change', function() {
            var v = (inpData.value || '').trim();
            if (!v) {
                window._terceirosPendenciaFiltroTipo = 'todos';
                window._terceirosPendenciaFiltroDataLivre = '';
            } else {
                window._terceirosPendenciaFiltroTipo = 'livre';
                window._terceirosPendenciaFiltroDataLivre = v;
            }
            reaplicarFiltroPrevisaoPendenciaRecebimento();
        });
    }
}

function terceirosListaCellTextoLongo(valor) {
    var text = valor == null || String(valor).trim() === '' ? '-' : String(valor).trim();
    return '<span class="ter-cell-ellipsis" title="' + escapeHtml(text) + '">' + escapeHtml(text) + '</span>';
}

function renderTerceirosListaAcoesCelula(conteudoHtml) {
    return '<td class="ter-lista-acoes-celula"><span class="ter-lista-acoes">' + (conteudoHtml || '') + '</span></td>';
}

function renderTerceirosAbrirButton(row, atributo, rotulo, tabDestino) {
    return '<button type="button" class="btn btn-primary btn-sm" '
        + atributo + '="' + escapeHtml(String(row.id)) + '" '
        + 'data-ter-area="' + escapeHtml(row.area || 'recebimento') + '" '
        + 'data-ter-open-tab="' + escapeHtml(tabDestino || 'pendencia-recebimento') + '">'
        + escapeHtml(rotulo || 'Abrir')
        + '</button>';
}

function renderTerceirosComprovanteButton(row) {
    return '<button type="button" class="btn btn-secondary btn-sm" data-ter-comprovante-doc="' + escapeHtml(String(row.id)) + '" data-ter-area="' + escapeHtml(row.area || 'recebimento') + '">Gerar comprovante</button>';
}

function renderTerceirosExcluirButton(row, atributo) {
    var nf = [row.numero_nf || '-', row.serie_nf ? ('Série ' + row.serie_nf) : ''].filter(Boolean).join(' / ');
    return '<button type="button" class="btn btn-sm" style="background:#c62828;color:#fff;" '
        + atributo + '="' + escapeHtml(String(row.id)) + '" '
        + 'data-ter-excluir-nf="' + escapeHtml(nf) + '">'
        + 'Excluir'
        + '</button>';
}

function _terceirosDetectarPopupBloqueado(win) {
    if (!win) return true;
    try {
        if (win.closed) return true;
        void win.document;
    } catch (e) {
        return true;
    }
    return false;
}

function mostrarModalPopupBloqueado(opcoes) {
    opcoes = opcoes || {};
    window._terPopupBloqueadoPending = opcoes;
    var modal = document.getElementById('modal-ter-popup-bloqueado');
    var tituloEl = document.getElementById('modal-ter-popup-bloqueado-titulo');
    var btnBaixar = document.getElementById('btn-ter-popup-baixar-fallback');
    if (tituloEl && opcoes.titulo) {
        tituloEl.textContent = opcoes.titulo;
    }
    if (btnBaixar) {
        btnBaixar.style.display = opcoes.urlDownload ? 'inline-block' : 'none';
    }
    if (modal) modal.style.display = 'block';
}

function fecharModalPopupBloqueado() {
    var modal = document.getElementById('modal-ter-popup-bloqueado');
    if (modal) modal.style.display = 'none';
    var p = window._terPopupBloqueadoPending;
    if (p && p.revogarBlobUrl) {
        try {
            URL.revokeObjectURL(p.revogarBlobUrl);
        } catch (e) { /* ignore */ }
    }
    window._terPopupBloqueadoPending = null;
}

function terceirosTentarAbrirPopupNovamente() {
    var p = window._terPopupBloqueadoPending;
    if (!p || typeof p.retry !== 'function') {
        fecharModalPopupBloqueado();
        return;
    }
    var retryFn = p.retry;
    fecharModalPopupBloqueado();
    retryFn();
}

function terceirosBaixarFallbackPopup() {
    var p = window._terPopupBloqueadoPending;
    if (p && p.urlDownload) {
        var a = document.createElement('a');
        a.href = p.urlDownload;
        a.download = p.nomeDownload || 'documento.pdf';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showMessage('PDF baixado. Abra o arquivo no leitor de PDF do seu computador.', 'success');
    }
    fecharModalPopupBloqueado();
}

/** Abre nova aba; se pop-up bloqueado, exibe modal com instruções. */
function terceirosAbrirNovaJanela(conteudo, opcoes) {
    opcoes = opcoes || {};
    var win = window.open('about:blank', '_blank');
    if (_terceirosDetectarPopupBloqueado(win)) {
        mostrarModalPopupBloqueado(opcoes);
        return null;
    }
    try {
        try {
            win.opener = null;
        } catch (eOp) { /* ignore */ }
        if (conteudo && conteudo.tipo === 'url' && conteudo.url) {
            win.location.href = conteudo.url;
        } else if (conteudo && conteudo.html) {
            win.document.open();
            win.document.write(conteudo.html);
            win.document.close();
        }
    } catch (e) {
        try {
            win.close();
        } catch (e2) { /* ignore */ }
        mostrarModalPopupBloqueado(opcoes);
        return null;
    }
    return win;
}

function initTerceirosModalPopupBloqueado() {
    var btnFechar = document.getElementById('btn-ter-popup-bloqueado-fechar');
    var btnTentar = document.getElementById('btn-ter-popup-bloqueado-tentar');
    var btnBaixar = document.getElementById('btn-ter-popup-baixar-fallback');
    var modal = document.getElementById('modal-ter-popup-bloqueado');
    if (btnFechar && btnFechar.dataset.bound !== '1') {
        btnFechar.dataset.bound = '1';
        btnFechar.addEventListener('click', fecharModalPopupBloqueado);
    }
    if (btnTentar && btnTentar.dataset.bound !== '1') {
        btnTentar.dataset.bound = '1';
        btnTentar.addEventListener('click', terceirosTentarAbrirPopupNovamente);
    }
    if (btnBaixar && btnBaixar.dataset.bound !== '1') {
        btnBaixar.dataset.bound = '1';
        btnBaixar.addEventListener('click', terceirosBaixarFallbackPopup);
    }
    if (modal && modal.dataset.bound !== '1') {
        modal.dataset.bound = '1';
        modal.addEventListener('click', function(ev) {
            if (ev.target === modal) fecharModalPopupBloqueado();
        });
    }
}

async function abrirDanfeNotaFiscalTerceiros(documentoId) {
    documentoId = parseInt(documentoId, 10);
    if (!Number.isFinite(documentoId) || documentoId <= 0) {
        showMessage('Não foi possível identificar a nota.', 'warning');
        return;
    }
    var url = API_BASE + '/terceiros/documentos/' + encodeURIComponent(documentoId) + '/danfe';
    mostrarTerAcaoLoading(
        'Gerando PDF da NF (Meu Danfe)…',
        'Convertendo o XML da nota. Isso pode levar alguns segundos.'
    );
    try {
        var fetchOpts = { credentials: 'same-origin' };
        var sig = terAcaoLoadingSignal();
        if (sig) fetchOpts.signal = sig;
        var resp = await fetch(url, fetchOpts);
        if (window._terAcaoLoadCancelado) return;
        var contentType = (resp.headers.get('content-type') || '').toLowerCase();
        if (!resp.ok) {
            var errMsg = await resp.text();
            showMessage((errMsg || 'Erro ao gerar PDF da NF.').trim(), 'error');
            return;
        }
        if (contentType.indexOf('application/pdf') >= 0) {
            var blob = await resp.blob();
            if (window._terAcaoLoadCancelado) return;
            var blobUrl = URL.createObjectURL(blob);
            var docIdPdf = documentoId;
            var popupOpts = {
                titulo: 'Pop-up bloqueado — Ver PDF da NF',
                urlDownload: blobUrl,
                nomeDownload: 'danfe-nf-' + String(docIdPdf) + '.pdf',
                revogarBlobUrl: blobUrl,
                retry: function() {
                    abrirDanfeNotaFiscalTerceiros(docIdPdf);
                }
            };
            var janela = terceirosAbrirNovaJanela({ tipo: 'url', url: blobUrl }, popupOpts);
            if (janela) {
                setTimeout(function() {
                    try { URL.revokeObjectURL(blobUrl); } catch (e) { /* ignore */ }
                }, 120000);
            }
            return;
        }
        var html = await resp.text();
        if (window._terAcaoLoadCancelado) return;
        var docIdHtml = documentoId;
        terceirosAbrirNovaJanela(
            { tipo: 'html', html: html },
            {
                titulo: 'Pop-up bloqueado — Ver DANFE',
                retry: function() {
                    abrirDanfeNotaFiscalTerceiros(docIdHtml);
                }
            }
        );
    } catch (e) {
        if (_terAcaoFoiCancelado(e)) return;
        showMessage('Erro ao gerar DANFE: ' + (e && e.message ? e.message : String(e)), 'error');
    } finally {
        fecharTerAcaoLoading();
    }
}

function _terceirosNomeArquivoContentDisposition(header) {
    if (!header) return '';
    var m = /filename\*=UTF-8''([^;\s]+)|filename="([^"]+)"|filename=([^;\s]+)/i.exec(header);
    if (!m) return '';
    var nome = (m[1] || m[2] || m[3] || '').trim();
    try {
        return decodeURIComponent(nome);
    } catch (e) {
        return nome;
    }
}

async function baixarXmlNotaFiscalTerceiros(documentoId) {
    documentoId = parseInt(documentoId, 10);
    if (!Number.isFinite(documentoId) || documentoId <= 0) {
        showMessage('Não foi possível identificar a nota.', 'warning');
        return;
    }
    var url = API_BASE + '/terceiros/documentos/' + encodeURIComponent(documentoId) + '/xml';
    mostrarTerAcaoLoading(
        'Baixando XML da NF…',
        'Preparando o arquivo para download.',
        { mensagemCancelado: 'Download do XML cancelado.' }
    );
    try {
        var fetchOpts = { credentials: 'same-origin' };
        var sigXml = terAcaoLoadingSignal();
        if (sigXml) fetchOpts.signal = sigXml;
        var resp = await fetch(url, fetchOpts);
        if (window._terAcaoLoadCancelado) return;
        if (!resp.ok) {
            var errMsg = await resp.text();
            showMessage((errMsg || 'Erro ao baixar XML.').trim(), 'error');
            return;
        }
        var blob = await resp.blob();
        if (window._terAcaoLoadCancelado) return;
        var nomeArquivo = _terceirosNomeArquivoContentDisposition(resp.headers.get('Content-Disposition'));
        if (!nomeArquivo) nomeArquivo = 'nota_fiscal_' + String(documentoId) + '.xml';
        var blobUrl = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = blobUrl;
        link.download = nomeArquivo;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function() {
            try { URL.revokeObjectURL(blobUrl); } catch (e) { /* ignore */ }
        }, 60000);
        showMessage('Download do XML iniciado.', 'success');
    } catch (e) {
        if (_terAcaoFoiCancelado(e)) return;
        showMessage('Erro ao baixar XML: ' + (e && e.message ? e.message : String(e)), 'error');
    } finally {
        fecharTerAcaoLoading();
    }
}

function renderTerceirosBotoesPdfXmlNf(row) {
    var id = escapeHtml(String(row.id));
    return '<button type="button" class="btn btn-secondary btn-sm" data-ter-ver-pdf-doc="' + id + '" title="Gerar DANFE em PDF a partir do XML (Meu Danfe)">Ver PDF da NF</button>'
        + '<button type="button" class="btn btn-secondary btn-sm" data-ter-baixar-xml-doc="' + id + '" title="Baixar o arquivo XML original da NF">Baixar XML</button>';
}

/** Delegação: Ver PDF / Baixar XML em todas as listas do módulo (2ª aba em diante). */
function initTerceirosBotoesPdfXmlDelegacao() {
    if (window._terceirosBotoesPdfXmlDelegacaoOk) return;
    var root = document.getElementById('modulo-terceiros');
    if (!root) return;
    window._terceirosBotoesPdfXmlDelegacaoOk = true;
    root.addEventListener('click', function(ev) {
        var el = ev.target;
        if (!el || typeof el.closest !== 'function') return;
        var pdfBtn = el.closest('[data-ter-ver-pdf-doc], [data-ter-ver-pdf-pend]');
        if (pdfBtn) {
            ev.preventDefault();
            var idPdf = terceirosIdDocumentoDeAtributo(
                pdfBtn.getAttribute('data-ter-ver-pdf-doc') || pdfBtn.getAttribute('data-ter-ver-pdf-pend')
            );
            abrirDanfeNotaFiscalTerceiros(idPdf);
            return;
        }
        var xmlBtn = el.closest('[data-ter-baixar-xml-doc]');
        if (xmlBtn) {
            ev.preventDefault();
            var idXml = terceirosIdDocumentoDeAtributo(xmlBtn.getAttribute('data-ter-baixar-xml-doc'));
            baixarXmlNotaFiscalTerceiros(idXml);
        }
    });
}

function renderTerceirosPendenciaRecebimentoAcoes(row) {
    var area = escapeHtml(row.area || 'recebimento');
    var id = escapeHtml(String(row.id));
    return '<span class="ter-lista-acoes ter-pendencia-acoes">'
        + '<button type="button" class="btn btn-primary btn-sm" data-ter-descarregar-pend="' + id + '" data-ter-area="' + area + '">Começar descarga</button>'
        + '<button type="button" class="btn btn-secondary btn-sm" data-ter-ver-detalhe-pend="' + id + '" data-ter-area="' + area + '">Ver detalhe</button>'
        + renderTerceirosBotoesPdfXmlNf(row)
        + renderTerceirosExcluirButton(row, 'data-ter-excluir-doc')
        + '</span>';
}

function renderTerceirosUsuarioMeta(usuario, datahora, fallback) {
    var partes = [];
    if (usuario) partes.push('por ' + usuario);
    if (datahora) partes.push('em ' + datahora);
    if (!partes.length && fallback) partes.push(fallback);
    return partes.length ? '<div class="ter-status-meta">' + escapeHtml(partes.join(' ')) + '</div>' : '';
}

function renderTerceirosStatusComUsuario(valor, usuario, datahora, fallback) {
    var texto = valor == null || String(valor).trim() === '' ? '-' : String(valor);
    return '<strong>' + escapeHtml(texto) + '</strong>' + renderTerceirosUsuarioMeta(usuario, datahora, fallback);
}

function renderTerceirosRecebedorMgMeta(row) {
    if (!row || isTerceirosAreaCarreta(row) || !isTerceirosFlagSim(row.carga_recebida_mg)) return '';
    var nome = String(row.recebedor_mg || '').trim();
    if (!nome) return '<div class="ter-status-meta ter-status-meta--alerta"><strong>Recebeu MG:</strong> não informado</div>';
    return '<div class="ter-status-meta"><strong>Recebeu MG:</strong> ' + escapeHtml(nome) + '</div>';
}

function renderTerceirosConsumivelSpMeta(row) {
    if (!isTerceirosConsumivelSp(row)) return '';
    var nome = String(row.recebedor_consumivel_sp || '').trim();
    return '<div class="ter-status-meta"><strong>Consumível SP</strong>'
        + (nome ? ': ' + escapeHtml(nome) : '')
        + '</div>';
}

function renderTerceirosCelulaQuemIraReceber(row) {
    var nome = String(row.recebedor_consumivel_sp || '').trim();
    if (!nome) {
        return '<td><span class="ter-status-meta">—</span></td>';
    }
    var badge = isTerceirosConsumivelSp(row)
        ? ' <span class="ter-origem-badge ter-origem-badge--consumivel-sp">Consumível SP</span>'
        : '';
    return '<td>' + escapeHtml(nome) + badge + '</td>';
}

/** NF já saiu da 2ª aba (fornecedores recebidos e etapas seguintes). */
function _terceirosJaSaiuPendenciaRecebimento(row) {
    return !_terceirosConsideraPendenciaRecebimento(row);
}

/** Colunas NF → UF (identificação da NF na lista). */
function renderTerceirosCelulasNfPedidoRemDestUf(row) {
    var nf = [row.numero_nf || '-', row.serie_nf ? ('Série ' + row.serie_nf) : ''].filter(Boolean).join(' / ');
    var badgeCarreta = (row.area === 'carreta') ? ' <span class="ter-origem-badge ter-origem-badge--carreta">Carreta</span>' : '';
    return '<td><strong>' + escapeHtml(nf) + '</strong>' + badgeCarreta + '</td>'
        + '<td>' + escapeHtml(row.numero_pedido || '-') + '</td>'
        + renderTerceirosCelulaQuemIraReceber(row)
        + '<td>' + terceirosListaCellTextoLongo(row.remetente_nome) + '</td>'
        + '<td>' + terceirosListaCellTextoLongo(row.destinatario_nome) + '</td>'
        + '<td>' + escapeHtml(row.destinatario_uf || '-') + '</td>';
}

/** Colunas NF → previsão (ordem padrão do fluxo). */
function renderTerceirosCelulasNfAtePrevisao(row, opcoes) {
    opcoes = opcoes || {};
    var previsaoExtra = '';
    if (opcoes.avisoMotoristaNaPrevisao && isTerceirosMotoristaObrigatorio(row)) {
        previsaoExtra = '<div class="ter-status-meta ter-status-meta--alerta">Motorista obrigatório</div>';
    }
    var motoristaPlaca;
    if (opcoes.historicoMotoristaPlaca) {
        motoristaPlaca = terceirosCelulasMotoristaPlacaHistorico(row);
    } else if (opcoes.motoristaPlacaPrefix) {
        motoristaPlaca = renderTerceirosCelulasMotoristaPlacaLista(row, opcoes.motoristaPlacaPrefix);
    } else {
        motoristaPlaca = terceirosCelulaMotoristaListaLeitura(row) + terceirosCelulaPlacaLista(row);
    }
    return renderTerceirosCelulasNfPedidoRemDestUf(row)
        + motoristaPlaca
        + renderTerceirosPrevisaoCelulaHtml(row.previsao_chegada, previsaoExtra);
}

function renderTerceirosCelulaIndisponivelFluxo() {
    return '<td><span class="ter-status-meta">—</span></td>';
}

function renderTerceirosCelulaConfFluxo(row, etapa) {
    if (etapa === 'pendencia') {
        if (_terceirosTemBipagemIniciada(row)) {
            return '<td>' + renderTerceirosConferenciaResumoHtml(row) + '</td>';
        }
        return '<td><div class="ter-status-meta">Itens: ' + escapeHtml(String(row.total_itens || 0))
            + '</div><strong>Bipado: ' + escapeHtml(String(row.quantidade_total_bipada || 0)) + '</strong></td>';
    }
    return '<td>' + renderTerceirosConferenciaResumoHtml(row) + '</td>';
}

function renderTerceirosCelulaLancadaFluxo(row, etapa) {
    if (etapa === 'pendencia') return renderTerceirosCelulaIndisponivelFluxo();
    if (etapa === 'pendentes-lancamento') {
        return '<td><select class="ter-select-inline" data-ter-nota-lancada-pend="' + escapeHtml(String(row.id)) + '" data-ter-recebimento-concluido="' + escapeHtml(isTerceirosFlagSim(row.recebimento_concluido) ? 'sim' : 'nao') + '" data-ter-fornecedor-recebido="' + escapeHtml(_terceirosConsideraFornecedorRecebido(row) ? 'sim' : 'nao') + '">'
            + '<option value="">Selecione</option>'
            + '<option value="sim"' + (isTerceirosFlagSim(row.nota_lancada) ? ' selected' : '') + '>Sim</option>'
            + '<option value="nao"' + (isTerceirosFlagNao(row.nota_lancada) && !isTerceirosFlagSim(row.nota_lancada) ? ' selected' : '') + '>Não</option>'
        + '</select>' + renderTerceirosUsuarioMeta(row.nota_lancada_por || '', row.nota_lancada_em || '') + '</td>';
    }
    var htmlLanc = renderTerceirosStatusComUsuario(textoResumoNotaLancadaTerceiros(row), row.nota_lancada_por || '', row.nota_lancada_em || '');
    if (etapa === 'historico' || isTerceirosFlagNao(row.nota_lancada)) {
        htmlLanc += _terceirosMotivoHtmlCampo(row, 'motivo_nao_lancada');
    }
    return '<td>' + htmlLanc + '</td>';
}

function renderTerceirosCelulaEnviarMgFluxo(row, etapa) {
    if (etapa === 'pendencia') return renderTerceirosCelulaIndisponivelFluxo();
    if (isTerceirosConsumivelSp(row)) {
        return '<td>' + renderTerceirosStatusComUsuario('N/A', '', '', 'Consumível SP sem envio MG') + '</td>';
    }
    if (isTerceirosAreaCarreta(row)) {
        return '<td>' + renderTerceirosStatusComUsuario('N/A', '', '', 'Carreta sem envio MG') + '<div class="ter-status-meta">Fluxo de carreta encerra na 5ª aba</div></td>';
    }
    if (etapa === 'notas-lancadas') {
        if (_terceirosConsideraNotasLancadas(row) && _terceirosUsaFluxoMg(row)) {
            return '<td><select class="ter-select-inline" data-ter-enviar-mg-lanc-doc="' + escapeHtml(String(row.id)) + '" data-ter-motorista-obrigatorio="' + escapeHtml(isTerceirosMotoristaObrigatorio(row) ? 'sim' : 'nao') + '" data-ter-motorista-atual="' + escapeHtml(row.motorista_saida_mg || '') + '">'
                + '<option value="">Selecione</option>'
                + '<option value="sim">Sim — ir para pendência MG</option>'
                + '<option value="nao"' + (isTerceirosFlagNao(row.enviar_para_mg) ? ' selected' : '') + '>Não — não enviar</option>'
            + '</select>' + renderTerceirosUsuarioMeta(row.enviar_para_mg_por || '', row.enviar_para_mg_em || '') + '</td>';
        }
        var htmlNl = renderTerceirosStatusComUsuario(textoResumoEnviadoMgColuna(row, etapa), row.enviar_para_mg_por || '', row.enviar_para_mg_em || '')
            + '<div class="ter-status-meta">Etapa atual: <strong>' + escapeHtml(_terceirosLabelEtapaAtual(row)) + '</strong></div>';
        if (isTerceirosFlagNao(row.enviar_para_mg)) htmlNl += _terceirosMotivoHtmlCampo(row, 'motivo_nao_enviar_mg');
        return '<td>' + htmlNl + '</td>';
    }
    if (etapa === 'pendencias-mg') {
        if (isTerceirosFlagSim(row.enviar_para_mg)) {
            return '<td>' + renderTerceirosStatusComUsuario(textoResumoEnviarMgTerceiros(row), row.enviar_para_mg_por || '', row.enviar_para_mg_em || '') + '</td>';
        }
        return '<td><select class="ter-select-inline" data-ter-enviar-mg-pend-doc="' + escapeHtml(String(row.id)) + '" data-ter-motorista-obrigatorio="' + escapeHtml(isTerceirosMotoristaObrigatorio(row) ? 'sim' : 'nao') + '" data-ter-motorista-atual="' + escapeHtml(row.motorista_saida_mg || '') + '">'
            + '<option value="">Selecione</option>'
            + '<option value="sim">Sim</option>'
            + '<option value="nao"' + (isTerceirosFlagNao(row.enviar_para_mg) ? ' selected' : '') + '>Não</option>'
        + '</select>' + renderTerceirosUsuarioMeta(row.enviar_para_mg_por || '', row.enviar_para_mg_em || '') + '</td>';
    }
    if (etapa === 'recebimentos-mg' || etapa === 'notas-enviadas-mg' || etapa === 'historico') {
        var textoMg = etapa === 'historico' ? textoResumoEnviarMgHistorico(row) : textoResumoEnviadoMgColuna(row, etapa);
        var htmlMg = renderTerceirosStatusComUsuario(textoMg, row.enviar_para_mg_por || '', row.enviar_para_mg_em || '');
        if (etapa === 'historico' && isTerceirosFlagNao(row.enviar_para_mg)) {
            htmlMg += _terceirosMotivoHtmlCampo(row, 'motivo_nao_enviar_mg');
        }
        return '<td>' + htmlMg + '</td>';
    }
    return '<td>' + renderTerceirosEnviarMgSomenteLeitura(row) + '</td>';
}

function renderTerceirosCelulaRecebidaMgFluxo(row, etapa) {
    if (etapa === 'pendencia' || etapa === 'fornecedores' || etapa === 'pendentes-lancamento') {
        return renderTerceirosCelulaIndisponivelFluxo();
    }
    if (etapa === 'notas-lancadas') {
        return renderTerceirosConclusaoSemMgTab5(row);
    }
    if (isTerceirosAreaCarreta(row)) {
        return '<td>' + renderTerceirosStatusComUsuario(textoResumoRecebidaMgTerceiros(row), row.carga_recebida_mg_por || '', row.carga_recebida_mg_em || '') + '</td>';
    }
    if (etapa === 'pendencias-mg') {
        return '<td>' + renderTerceirosRecebidaMgSomenteLeitura(row) + '</td>';
    }
    if (etapa === 'recebimentos-mg') {
        return '<td><select class="ter-select-inline" data-ter-recebida-mg-receb-doc="' + escapeHtml(String(row.id)) + '" data-ter-motorista-obrigatorio="' + escapeHtml(isTerceirosMotoristaObrigatorio(row) ? 'sim' : 'nao') + '" data-ter-motorista-atual="' + escapeHtml(row.motorista_saida_mg || '') + '">'
            + '<option value="">Selecione</option>'
            + '<option value="sim"' + (isTerceirosFlagSim(row.carga_recebida_mg) ? ' selected' : '') + '>Sim</option>'
            + '<option value="nao"' + (isTerceirosFlagNao(row.carga_recebida_mg) && !isTerceirosFlagSim(row.carga_recebida_mg) ? ' selected' : '') + '>Não</option>'
        + '</select>' + renderTerceirosUsuarioMeta(row.carga_recebida_mg_por || '', row.carga_recebida_mg_em || '') + '</td>';
    }
    var textoRec = etapa === 'historico' ? textoResumoRecebidaMgHistorico(row) : textoResumoRecebidaMgTerceiros(row);
    var htmlRec = renderTerceirosStatusComUsuario(textoRec, row.carga_recebida_mg_por || '', row.carga_recebida_mg_em || '')
        + renderTerceirosRecebedorMgMeta(row);
    if ((etapa === 'historico' || etapa === 'recebimentos-mg') && isTerceirosFlagNao(row.carga_recebida_mg)) {
        htmlRec += _terceirosMotivoHtmlCampo(row, 'motivo_nao_recebida_mg');
    }
    return '<td>' + htmlRec + '</td>';
}

/** Colunas Receb. → Recebida MG (etapas 9–13). */
function renderTerceirosCelulasStatusFluxo(row, etapa) {
    return '<td>' + renderTerceirosRecebimentoComUsuario(row) + '</td>'
        + renderTerceirosCelulaConfFluxo(row, etapa)
        + renderTerceirosCelulaLancadaFluxo(row, etapa)
        + renderTerceirosCelulaEnviarMgFluxo(row, etapa)
        + renderTerceirosCelulaRecebidaMgFluxo(row, etapa);
}

function renderTerceirosRecebimentoComUsuario(row) {
    var concluido = _terceirosRecebimentoEstaConcluido(row);
    var statusTxt = 'pendente';
    var usuario = '';
    var datahora = '';
    if (concluido) {
        statusTxt = 'concluído';
        usuario = row.recebimento_concluido_por || '';
        datahora = row.recebimento_concluido_em || '';
    } else if (_terceirosTemBipagemIniciada(row)) {
        statusTxt = 'bipagem em andamento';
        usuario = row.atualizado_por || row.criado_por || '';
        datahora = row.atualizado_em || '';
    }
    return renderTerceirosStatusComUsuario(
        statusTxt,
        usuario,
        datahora,
        row.criado_por ? ('criado por ' + row.criado_por) : ''
    );
}

var TERCEIROS_COLS_LISTA_FLUXO = 15;
var TERCEIROS_COLS_LISTA_POS_RECEBIMENTO = TERCEIROS_COLS_LISTA_FLUXO;

function renderTerceirosFornecedorRecebidoRowHtml(row) {
    var arquivada = isTerceirosFlagSim(row.nota_lancada);
    var trClass = arquivada ? ' class="ter-fornecedor-row-arquivo"' : '';
    return '<tr data-ter-doc-id="' + escapeHtml(String(row.id)) + '"' + trClass + '>'
        + renderTerceirosCelulasNfAtePrevisao(row)
        + renderTerceirosCelulasStatusFluxo(row, 'fornecedores')
        + renderTerceirosListaAcoesCelula(
            renderTerceirosAbrirButton(row, 'data-ter-fornecedor-doc', 'Abrir detalhe', 'fornecedores-recebidos')
            + renderTerceirosBotoesPdfXmlNf(row)
            + renderTerceirosComprovanteButton(row)
            + renderTerceirosExcluirButton(row, 'data-ter-excluir-fornecedor-doc')
        )
        + '</tr>';
}

function _terceirosCalcularTotaisConferencia(row, itens) {
    var totalXml = 0;
    var totalBip = 0;
    var divergentes = 0;
    if (Array.isArray(itens) && itens.length) {
        itens.forEach(function(item) {
            var xml = parseFloat(item.quantidade_xml) || 0;
            var bip = parseFloat(item.quantidade_bipada) || 0;
            totalXml += xml;
            totalBip += bip;
            if (Math.abs(xml - bip) > 1e-6) divergentes += 1;
        });
    } else if (row) {
        var resumo = row.resumo || {};
        totalXml = parseFloat(row.quantidade_total_xml != null ? row.quantidade_total_xml : resumo.quantidade_total_xml) || 0;
        totalBip = parseFloat(row.quantidade_total_bipada != null ? row.quantidade_total_bipada : resumo.quantidade_total_bipada) || 0;
        divergentes = parseInt(row.itens_divergentes != null ? row.itens_divergentes : resumo.itens_com_pendencia, 10) || 0;
    }
    return { totalXml: totalXml, totalBip: totalBip, divergentes: divergentes };
}

function _terceirosConferenciaEstaCompleta(row, itens) {
    var t = _terceirosCalcularTotaisConferencia(row, itens);
    if (t.totalXml <= 1e-9) return true;
    if (t.divergentes > 0) return false;
    return Math.abs(t.totalXml - t.totalBip) <= 1e-6;
}

async function _terceirosValidarBipagemAntesConcluirRecebimento() {
    var documentoId = _resolverIdDocumentoTerceirosParaStatus();
    if (documentoId == null) {
        showMessage('Selecione uma nota.', 'warning');
        return false;
    }
    await _flushTerceirosAntesConcluirRecebimento(documentoId);
    var itens = window._terceirosBipagemItens;
    var row = Object.assign({}, _terceirosDocAtual || {});
    if (Array.isArray(itens) && itens.length) {
        var totItens = _terceirosCalcularTotaisConferencia(null, itens);
        row.quantidade_total_xml = totItens.totalXml;
        row.quantidade_total_bipada = totItens.totalBip;
        row.itens_divergentes = totItens.divergentes;
    } else {
        row.quantidade_total_bipada = Math.max(
            parseFloat(row.quantidade_total_bipada) || 0,
            _terceirosTotalBipadoItensLocais()
        );
    }
    if (_terceirosConferenciaEstaCompleta(row, itens)) return true;
    var tot = _terceirosCalcularTotaisConferencia(row, itens);
    var msgEl = document.getElementById('ter-concluir-sem-bipagem-texto');
    if (msgEl) {
        msgEl.innerHTML = 'A bipagem ainda não está completa.<br><strong>XML:</strong> '
            + escapeHtml(_formatTerQtdDisplay(tot.totalXml))
            + ' · <strong>Bipado:</strong> '
            + escapeHtml(_formatTerQtdDisplay(tot.totalBip))
            + (tot.divergentes ? (' · <strong>Itens divergentes:</strong> ' + escapeHtml(String(tot.divergentes))) : '')
            + '<br><br>Deseja marcar o recebimento como concluído mesmo assim?';
    }
    return abrirModalConcluirRecebimentoSemBipagemCompleta();
}

function renderTerceirosConferenciaResumoHtml(row) {
    var tot = _terceirosCalcularTotaisConferencia(row, null);
    var totalXml = tot.totalXml;
    var totalBip = tot.totalBip;
    var divergentes = tot.divergentes;
    var completo = divergentes === 0 && Math.abs(totalXml - totalBip) <= 1e-6;
    var conferenciaHtml = completo
        ? '<span class="status-badge status-OK">✅ Completo</span>'
        : '<span class="status-badge status-FALTA">⚠️ Divergente</span>';
    conferenciaHtml += '<div class="ter-status-meta">XML: ' + escapeHtml(_formatTerQtdDisplay(totalXml))
        + ' / Bipado: ' + escapeHtml(_formatTerQtdDisplay(totalBip))
        + (divergentes ? (' / Itens: ' + escapeHtml(String(divergentes))) : '')
        + '</div>';
    return conferenciaHtml;
}

function scrollTerceirosRecebimentoDetalheSecao(secao) {
    window.requestAnimationFrame(function() {
        var blocoDetalhe = document.querySelector('#terceiros-panel-recebimento .terceiros-detalhe-bloco');
        if (blocoDetalhe) {
            blocoDetalhe.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        var id = 'ter-descarga-conferencia-modelo';
        if (secao === 'bipagem') id = 'ter-bipagem-bloco';
        else if (secao === 'resumo') id = 'ter-resumo-descarga-bloco';
        window.setTimeout(function() {
            var el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 280);
    });
}

/**
 * Só dispara o clique na aba se não estiver nela — evita recarregar a lista inteira à toa.
 * @param {string} tab
 * @param {boolean} [forcarRecarregarLista] Se true e já estivermos na aba, recarrega a tabela (ex.: NF acabou de entrar na lista após mudança de status).
 */
function abrirAbaTerceirosSeDiferente(tab, forcarRecarregarLista) {
    if (_terceirosTabAtual === tab) {
        if (forcarRecarregarLista) {
            void recarregarListaTerceirosTab(tab);
        }
        return;
    }
    var btn = document.querySelector('.terceiros-subtab[data-ter-tab="' + tab + '"]');
    if (btn) btn.click();
}

var _terceirosDescargaLoadAbort = null;

function abrirModalCarregandoDescargaTerceiros(mensagem) {
    window._terceirosDescargaLoadCancelado = false;
    _terceirosDescargaLoadAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var el = document.getElementById('ter-descarga-loading-overlay');
    var text = document.getElementById('ter-descarga-loading-text');
    if (text) text.textContent = mensagem || 'Abrindo descarga…';
    if (el) {
        el.style.display = 'flex';
        el.setAttribute('aria-busy', 'true');
    }
}

function fecharModalCarregandoDescargaTerceiros() {
    var el = document.getElementById('ter-descarga-loading-overlay');
    if (el) {
        el.style.display = 'none';
        el.setAttribute('aria-busy', 'false');
    }
    _terceirosDescargaLoadAbort = null;
}

function cancelarCarregandoDescargaTerceiros() {
    window._terceirosDescargaLoadCancelado = true;
    window._terceirosDetalheCargaSeq = (window._terceirosDetalheCargaSeq || 0) + 1;
    if (_terceirosDescargaLoadAbort) {
        try {
            _terceirosDescargaLoadAbort.abort();
        } catch (e) {}
    }
    fecharModalCarregandoDescargaTerceiros();
}

function terceirosDescargaFoiCancelado() {
    return !!window._terceirosDescargaLoadCancelado;
}

function terceirosDescargaAbortSignal() {
    return _terceirosDescargaLoadAbort && _terceirosDescargaLoadAbort.signal;
}

var _terAcaoLoadAbort = null;

function _terAcaoFoiCancelado(err) {
    if (window._terAcaoLoadCancelado) return true;
    if (err && (err.name === 'AbortError' || String(err.message || '').toLowerCase().indexOf('abort') >= 0)) {
        return true;
    }
    return false;
}

function mostrarTerAcaoLoading(titulo, subtitulo, opcoes) {
    opcoes = opcoes || {};
    window._terAcaoLoadCancelado = false;
    window._terAcaoLoadingCancelMsg = opcoes.mensagemCancelado || 'Operação cancelada.';
    _terAcaoLoadAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var el = document.getElementById('ter-acao-loading-overlay');
    var text = document.getElementById('ter-acao-loading-text');
    var sub = document.getElementById('ter-acao-loading-sub');
    if (text) text.textContent = titulo || 'Carregando…';
    if (sub) sub.textContent = subtitulo || 'Aguarde.';
    if (el) {
        el.style.display = 'flex';
        el.setAttribute('aria-busy', 'true');
    }
}

function fecharTerAcaoLoading() {
    var el = document.getElementById('ter-acao-loading-overlay');
    if (el) {
        el.style.display = 'none';
        el.setAttribute('aria-busy', 'false');
    }
    _terAcaoLoadAbort = null;
}

function cancelarTerAcaoLoading() {
    if (!document.getElementById('ter-acao-loading-overlay') || document.getElementById('ter-acao-loading-overlay').style.display === 'none') {
        return;
    }
    window._terAcaoLoadCancelado = true;
    if (_terAcaoLoadAbort) {
        try {
            _terAcaoLoadAbort.abort();
        } catch (e) { /* ignore */ }
    }
    fecharTerAcaoLoading();
    showMessage(window._terAcaoLoadingCancelMsg || 'Operação cancelada.', 'warning');
}

function terAcaoLoadingSignal() {
    return _terAcaoLoadAbort && _terAcaoLoadAbort.signal;
}

function _terceirosErroDescargaCancelada(err) {
    return !!(err && (err.name === 'AbortError' || String(err.message || '').toLowerCase() === 'cancelado'));
}

async function abrirPendenciaTerceirosComScroll(area, documentoId, secao, opcoes) {
    opcoes = opcoes || {};
    if (!window._terceirosDetalheOrigemTab) {
        window._terceirosDetalheOrigemTab = 'pendencia-recebimento';
    }
    window._terceirosDescargaLoadCancelado = false;
    window._terAcaoLoadCancelado = false;
    var comModalDescarga = opcoes.modalLoading === true;
    var comLoadingAcao = opcoes.loadingAcao === true;
    window._terceirosSuprimirFecharDescargaDocId = documentoId;
    _terceirosIniciarPrefetchDetalhe(documentoId);
    if (comModalDescarga) {
        abrirModalCarregandoDescargaTerceiros(
            opcoes.mensagemLoading || 'Abrindo descarga e conferência…'
        );
    } else if (comLoadingAcao) {
        mostrarTerAcaoLoading(
            opcoes.mensagemLoading || 'Carregando detalhe da NF…',
            'Buscando dados e itens da nota no servidor.',
            { mensagemCancelado: 'Carregamento do detalhe cancelado.' }
        );
    }
    try {
        if (terceirosDescargaFoiCancelado() || window._terAcaoLoadCancelado) throw new Error('cancelado');
        if (window.controleMostrarModulo) window.controleMostrarModulo('terceiros');
        if (_terceirosTabAtual !== 'pendencia-recebimento') {
            terceirosAplicarPainelAbaSomenteUi('pendencia-recebimento');
        }
        if (terceirosDescargaFoiCancelado() || window._terAcaoLoadCancelado) throw new Error('cancelado');
        var vazio = document.getElementById('ter-recebimento-detalhe-vazio');
        var detalhe = document.getElementById('ter-recebimento-detalhe');
        if (vazio) vazio.style.display = 'none';
        if (detalhe) detalhe.style.display = 'block';
        scrollTerceirosRecebimentoDetalheSecao(secao);
        if (terceirosDescargaFoiCancelado() || window._terAcaoLoadCancelado) throw new Error('cancelado');
        await loadTerceirosDocumentoDetalhe(area, documentoId, {
            descargaLoad: comModalDescarga,
            acaoLoad: comLoadingAcao
        });
        if (terceirosDescargaFoiCancelado() || window._terAcaoLoadCancelado) throw new Error('cancelado');
        scrollTerceirosRecebimentoDetalheSecao(secao);
    } catch (err) {
        if (_terceirosErroDescargaCancelada(err) || terceirosDescargaFoiCancelado() || _terAcaoFoiCancelado(err)) {
            return;
        }
        throw err;
    } finally {
        var docSuprimir = documentoId;
        window.setTimeout(function() {
            if (window._terceirosSuprimirFecharDescargaDocId != null
                && String(window._terceirosSuprimirFecharDescargaDocId) === String(docSuprimir)) {
                window._terceirosSuprimirFecharDescargaDocId = null;
            }
        }, 400);
        if (comModalDescarga) fecharModalCarregandoDescargaTerceiros();
        else if (comLoadingAcao) fecharTerAcaoLoading();
    }
}

/** ID numérico de documento a partir do atributo data (evita clique sem efeito quando o id não é válido). */
function terceirosIdDocumentoDeAtributo(raw) {
    if (raw == null) return NaN;
    var s = String(raw).trim();
    if (!s) return NaN;
    var n = parseInt(s, 10);
    return Number.isFinite(n) && n > 0 ? n : NaN;
}

/**
 * Um único listener no tbody da pendência: a lista é recriada via innerHTML e bindings por botão
 * podiam não aplicar ou competir com outros nós; delegação mantém Começar descarga / Ver detalhe / Excluir estáveis.
 */
function initTerceirosPendenciaRecebimentoDelegacao() {
    if (window._terceirosPendenciaRecebimentoDelegacaoOk) return;
    var tbody = document.getElementById('ter-tbody-recebimento-documentos');
    if (!tbody) return;
    window._terceirosPendenciaRecebimentoDelegacaoOk = true;
    tbody.addEventListener('mousedown', function(ev) {
        var el = ev.target;
        if (!el || typeof el.closest !== 'function') return;
        var desc = el.closest('[data-ter-descarregar-pend]');
        var det = el.closest('[data-ter-ver-detalhe-pend]');
        var alvo = desc || det;
        if (!alvo || !tbody.contains(alvo)) return;
        var idP = terceirosIdDocumentoDeAtributo(
            (desc && desc.getAttribute('data-ter-descarregar-pend'))
            || (det && det.getAttribute('data-ter-ver-detalhe-pend'))
        );
        if (Number.isFinite(idP)) _terceirosIniciarPrefetchDetalhe(idP);
    });
    tbody.addEventListener('click', function(ev) {
        var el = ev.target;
        if (!el || typeof el.closest !== 'function') return;
        var desc = el.closest('[data-ter-descarregar-pend]');
        if (desc && tbody.contains(desc)) {
            ev.preventDefault();
            var idD = terceirosIdDocumentoDeAtributo(desc.getAttribute('data-ter-descarregar-pend'));
            var areaD = desc.getAttribute('data-ter-area') || 'recebimento';
            if (!Number.isFinite(idD)) {
                showMessage('Não foi possível identificar a nota. Recarregue a lista.', 'warning');
                return;
            }
            window._terceirosDetalheOrigemTab = 'pendencia-recebimento';
            var btnDesc = desc;
            btnDesc.disabled = true;
            void abrirPendenciaTerceirosComScroll(areaD, idD, 'bipagem', {
                modalLoading: true,
                mensagemLoading: 'Abrindo descarga e conferência…'
            }).then(function() {
                btnDesc.disabled = false;
            }).catch(function(err) {
                if (_terceirosErroDescargaCancelada(err) || terceirosDescargaFoiCancelado()) {
                    btnDesc.disabled = false;
                    return;
                }
                console.error(err);
                showMessage('Erro ao abrir a descarga.', 'error');
                btnDesc.disabled = false;
            });
            return;
        }
        var det = el.closest('[data-ter-ver-detalhe-pend]');
        if (det && tbody.contains(det)) {
            ev.preventDefault();
            var idV = terceirosIdDocumentoDeAtributo(det.getAttribute('data-ter-ver-detalhe-pend'));
            var areaV = det.getAttribute('data-ter-area') || 'recebimento';
            if (!Number.isFinite(idV)) {
                showMessage('Não foi possível identificar a nota. Recarregue a lista.', 'warning');
                return;
            }
            window._terceirosDetalheOrigemTab = 'pendencia-recebimento';
            var btnDet = det;
            btnDet.disabled = true;
            void abrirPendenciaTerceirosComScroll(areaV, idV, 'resumo', {
                modalLoading: false,
                loadingAcao: true,
                mensagemLoading: 'Carregando detalhe da NF…'
            }).then(function() {
                btnDet.disabled = false;
            }).catch(function(err) {
                if (_terceirosErroDescargaCancelada(err) || terceirosDescargaFoiCancelado()) {
                    btnDet.disabled = false;
                    return;
                }
                console.error(err);
                showMessage('Erro ao abrir o detalhe da nota.', 'error');
                btnDet.disabled = false;
            });
            return;
        }
    });
}

/** Ações da tabela da NF por delegação (mais confiável após re-render). */
function initTerceirosConferenciaAcoesDelegacao() {
    if (window._terceirosConferenciaAcoesDelegacaoOk) return;
    var tbody = document.getElementById('ter-tbody-recebimento-itens');
    if (!tbody) return;
    window._terceirosConferenciaAcoesDelegacaoOk = true;
    tbody.addEventListener('click', function(ev) {
        var el = ev.target;
        if (!el || typeof el.closest !== 'function') return;
        var btnTirar1 = el.closest('[data-ter-acao="tirar-1"]');
        if (btnTirar1 && tbody.contains(btnTirar1) && !btnTirar1.disabled) {
            ev.preventDefault();
            var id1 = parseInt(btnTirar1.getAttribute('data-ter-item-id') || '0', 10);
            if (!id1) {
                showMessage('Não foi possível identificar o item para remover.', 'warning');
                return;
            }
            void tirarBipadoTerceiros(btnTirar1, id1, 1);
            return;
        }
        var btnTirarTudo = el.closest('[data-ter-acao="tirar-tudo"]');
        if (btnTirarTudo && tbody.contains(btnTirarTudo) && !btnTirarTudo.disabled) {
            ev.preventDefault();
            var idT = parseInt(btnTirarTudo.getAttribute('data-ter-item-id') || '0', 10);
            if (!idT) {
                showMessage('Não foi possível identificar o item para remover.', 'warning');
                return;
            }
            void tirarBipadoTerceiros(btnTirarTudo, idT, 'tudo');
        }
    });
}

function bindTerceirosAbrirButtons(seletor) {
    document.querySelectorAll(seletor).forEach(function(btn) {
        if (btn.dataset.terAbrirBound === '1') return;
        btn.dataset.terAbrirBound = '1';
        btn.addEventListener('click', function() {
            var id = parseInt(
                btn.getAttribute('data-ter-doc')
                || btn.getAttribute('data-ter-fornecedor-doc')
                || btn.getAttribute('data-ter-pend-lanc-doc')
                || btn.getAttribute('data-ter-lancada-doc')
                ||                 btn.getAttribute('data-ter-enviada-doc')
                || btn.getAttribute('data-ter-receb-mg-doc')
                || btn.getAttribute('data-ter-pendencia-doc')
                || btn.getAttribute('data-ter-historico-doc')
                || '0',
                10
            );
            var area = btn.getAttribute('data-ter-area') || 'recebimento';
            var tabDestino = btn.getAttribute('data-ter-open-tab') || 'pendencia-recebimento';
            window._terceirosDetalheOrigemTab = tabDestino;
            if (!id) return;
            void abrirPendenciaTerceirosComScroll(area, id, 'resumo', {
                modalLoading: false,
                loadingAcao: true,
                mensagemLoading: 'Carregando detalhe da NF…'
            });
        });
    });
}

/** Legado: exclusão unificada em initTerceirosExcluirDelegacaoGlobal (#modulo-terceiros). */
function bindTerceirosExcluirButtons(seletor) {
    void seletor;
}

function bindTerceirosComprovanteButtons(seletor) {
    document.querySelectorAll(seletor).forEach(function(btn) {
        if (btn.dataset.terComprovanteBound === '1') return;
        btn.dataset.terComprovanteBound = '1';
        btn.addEventListener('click', function() {
            var id = parseInt(btn.getAttribute('data-ter-comprovante-doc') || '0', 10);
            var area = btn.getAttribute('data-ter-area') || 'recebimento';
            if (!id) return;
            void gerarComprovanteTerceirosDocumento(id, area, btn);
        });
    });
}

async function loadTerceirosDocumentos(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-recebimento-documentos');
    if (!tbody) return;
    try {
        const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
        if (data.erro) {
            tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">' + escapeHtml(data.erro) + '</td></tr>';
            return;
        }
        const rows = getTerceirosRowsPorEtapa(data.rows, 'pendencia-recebimento');
        void atualizarAlertasTerceirosHeader(_terceirosMesclarRecebidosLocaisNasRows(data.rows));
        window._terceirosPendenciaRowsCache = rows;
        const tipoFiltro = window._terceirosPendenciaFiltroTipo || 'todos';
        const dataLivreFiltro = window._terceirosPendenciaFiltroDataLivre || '';
        const filtradas = filtrarRowsPendenciaPorPrevisao(rows, tipoFiltro, dataLivreFiltro);
        atualizarUiBotoesFiltroPrevisaoPendencia();
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF com recebimento em aberto. Todas as notas subidas por XML aparecem aqui até o recebimento ser marcado como concluído.</td></tr>';
            var hidLista = document.getElementById('ter-rec-documento-id');
            var temNotaAbertaNaTela = (_terceirosDocAtual.id != null && String(_terceirosDocAtual.id).trim() !== '')
                || (hidLista && String(hidLista.value || '').trim() !== '');
            var detalhe = document.getElementById('ter-recebimento-detalhe');
            var detalheVisivel = !!(detalhe && detalhe.style.display !== 'none');
            if (detalheVisivel) {
                _terceirosFecharDescargaSeForaDaPendencia(_terceirosDocumentoIdAtualParaApi());
            } else if (!temNotaAbertaNaTela) {
                resetTerceirosDetalhe();
            }
            return;
        }
        if (!filtradas.length) {
            tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">' + _terceirosMsgListaVaziaFiltroPrevisao() + '</td></tr>';
            _terceirosFecharDescargaSeDocumentoNaoNaListaPendencia(filtradas);
            return;
        }
        tbody.innerHTML = renderTerceirosPendenciaDocumentosTbodyHtml(filtradas);
        _terceirosFecharDescargaSeDocumentoNaoNaListaPendencia(filtradas);
        aplicarDestaqueLinhaTerceirosDoc(tbody);
    } catch (e) {
        console.error('loadTerceirosDocumentos:', e);
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">Erro ao carregar a lista. Atualize a página ou tente novamente.</td></tr>';
    }
}

async function loadTerceirosFornecedoresRecebidos(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-fornecedores-recebidos');
    if (!tbody) return;
    try {
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    void atualizarAlertasTerceirosHeader(_terceirosMesclarRecebidosLocaisNasRows(data.rows || []));
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(data, data.erro)) + '</td></tr>';
        _terceirosDestacarDocIdAposCarga = null;
        return;
    }
    const rows = getTerceirosRowsPorEtapa(data.rows, 'fornecedores-recebidos');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF nesta etapa. Aparece após <strong>recebimento concluído</strong> na 2ª aba, até marcar <strong>Lançada</strong> na 4ª.</td></tr>';
        _terceirosDestacarDocIdAposCarga = null;
        return;
    }
    tbody.innerHTML = rows.map(function(row) {
        return renderTerceirosFornecedorRecebidoRowHtml(row);
    }).join('');
    bindTerceirosAbrirButtons('[data-ter-fornecedor-doc]');
    bindTerceirosExcluirButtons('[data-ter-excluir-fornecedor-doc]');
    bindTerceirosComprovanteButtons('[data-ter-comprovante-doc]');
    aplicarDestaqueLinhaTerceirosDoc(tbody);
    } catch (e) {
        console.error('loadTerceirosFornecedoresRecebidos:', e);
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(null, (e && e.message) || 'Erro ao carregar a lista.')) + '</td></tr>';
        _terceirosDestacarDocIdAposCarga = null;
    }
}

function removerDocumentoDaPendenciaRecebimentoLocal(documentoId) {
    var id = String(documentoId);
    var tbody = document.getElementById('ter-tbody-recebimento-documentos');
    if (tbody) {
        var tr = tbody.querySelector('tr[data-ter-doc-id="' + id + '"]');
        if (tr) tr.remove();
        if (!tbody.querySelector('tr[data-ter-doc-id]')) {
            tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF com recebimento em aberto. Todas as notas subidas por XML aparecem aqui até o recebimento ser marcado como concluído.</td></tr>';
        }
    }
    if (Array.isArray(window._terceirosPendenciaRowsCache)) {
        window._terceirosPendenciaRowsCache = window._terceirosPendenciaRowsCache.filter(function(row) {
            return String(row.id) !== id;
        });
    }
}

function inserirDocumentoFornecedoresRecebidosLocal(row) {
    if (!row || row.id == null) return;
    if (!_terceirosConsideraFornecedorRecebido(row)) return;
    _terceirosGuardarFornecedorRecebidoLocal(row);
    var tbody = document.getElementById('ter-tbody-fornecedores-recebidos');
    if (!tbody) return;
    var id = String(row.id);
    var atual = tbody.querySelector('tr[data-ter-doc-id="' + id + '"]');
    var html = renderTerceirosFornecedorRecebidoRowHtml(row);
    if (atual) {
        atual.outerHTML = html;
    } else {
        var loading = tbody.querySelector('tr.loading, td.loading');
        if (loading || !tbody.querySelector('tr[data-ter-doc-id]')) {
            tbody.innerHTML = html;
        } else {
            tbody.insertAdjacentHTML('afterbegin', html);
        }
    }
    bindTerceirosAbrirButtons('[data-ter-fornecedor-doc]');
    bindTerceirosExcluirButtons('[data-ter-excluir-fornecedor-doc]');
    bindTerceirosComprovanteButtons('[data-ter-comprovante-doc]');
    aplicarDestaqueLinhaTerceirosDoc(tbody);
}

function aplicarMovimentoRecebimentoConcluidoLocal(documentoId, documentoAtualizado) {
    var patch = {
        recebimento_concluido: true,
        recebimento_concluido_em: (documentoAtualizado && documentoAtualizado.recebimento_concluido_em) || '',
        recebimento_concluido_por: (documentoAtualizado && documentoAtualizado.recebimento_concluido_por) || ''
    };
    _terceirosAtualizarRecebimentoConcluidoNoCacheLista(documentoId, patch);
    removerDocumentoDaPendenciaRecebimentoLocal(documentoId);
    if (documentoAtualizado) {
        documentoAtualizado.recebimento_concluido = true;
        inserirDocumentoFornecedoresRecebidosLocal(documentoAtualizado);
    } else if (documentoId != null) {
        _terceirosGuardarFornecedorRecebidoLocal({ id: documentoId, recebimento_concluido: 'Sim' });
    }
    void loadTerceirosPendenciasMg();
    void loadTerceirosPendentesLancamento();
    _terceirosAtualizarAlertasHeaderDoCache();
}

function _terceirosNfTexto(row) {
    return [row.numero_nf || '-', row.serie_nf ? ('Série ' + row.serie_nf) : ''].filter(Boolean).join(' / ');
}

function _terceirosAlertaEtapa(row) {
    row = _terceirosRowEstadoMesclado(row);
    var etapa = _terceirosEtapaExclusivaDoRow(row);
    if (etapa === 'pendencia-recebimento') {
        return { tab: 'pendencia-recebimento', etapa: 'Pendência de recebimento', usuario: row.criado_por || row.atualizado_por || '-', data: row.criado_em || row.atualizado_em || '' };
    }
    if (etapa === 'pendentes-lancamento') {
        return { tab: 'pendentes-lancamento', etapa: 'NFs pendentes de lançamento', usuario: row.recebimento_concluido_por || row.atualizado_por || '-', data: row.recebimento_concluido_em || row.atualizado_em || '' };
    }
    if (etapa === 'fornecedores-recebidos') {
        return { tab: 'fornecedores-recebidos', etapa: 'Fornecedores recebidos', usuario: row.nota_lancada_por || row.recebimento_concluido_por || '-', data: row.nota_lancada_em || row.recebimento_concluido_em || '' };
    }
    if (etapa === 'notas-lancadas') {
        return { tab: 'notas-lancadas', etapa: 'Notas fiscais lançadas', usuario: row.nota_lancada_por || '', data: row.nota_lancada_em || '' };
    }
    if (etapa === 'pendencias-mg') {
        return { tab: 'pendencias-mg', etapa: 'Pendências envio MG', usuario: row.nota_lancada_por || '', data: row.nota_lancada_em || '' };
    }
    if (etapa === 'recebimentos-mg') {
        return { tab: 'recebimentos-mg', etapa: 'Recebimentos de MG', usuario: row.enviar_para_mg_por || '', data: row.enviar_para_mg_em || '' };
    }
    if (etapa === 'notas-enviadas-mg') {
        return { tab: 'notas-enviadas-mg', etapa: 'Notas enviadas para MG', usuario: row.enviar_para_mg_por || '', data: row.enviar_para_mg_em || '' };
    }
    if (etapa === 'historico') {
        return null;
    }
    return null;
}

async function atualizarAlertasTerceirosHeader(rowsOpt) {
    var btn = document.getElementById('btn-terceiros-alertas');
    var countEl = document.getElementById('terceiros-alertas-count');
    var lista = document.getElementById('terceiros-alertas-lista');
    if (!btn || !countEl || !lista) return;
    var rows = rowsOpt;
    if (!Array.isArray(rows)) {
        var hit = _terceirosObterCacheLista();
        var data = hit || await fetchTerceirosDocumentosTodos();
        rows = data && Array.isArray(data.rows) ? data.rows : [];
    }
    rows = _terceirosMesclarRecebidosLocaisNasRows(rows);
    var alertas = [];
    rows.forEach(function(row) {
        var a = _terceirosAlertaEtapa(row);
        if (a) alertas.push(Object.assign({}, a, { row: row }));
    });
    countEl.textContent = String(alertas.length);
    btn.classList.toggle('header-alertas-btn--ativo', alertas.length > 0);
    if (!alertas.length) {
        lista.innerHTML = '<div class="header-alertas-vazio">Nenhuma NF parada.</div>';
        return;
    }
    lista.innerHTML = alertas.slice(0, 30).map(function(a) {
        return '<button type="button" class="header-alerta-item" data-ter-alerta-doc="' + escapeHtml(String(a.row.id)) + '" data-ter-alerta-area="' + escapeHtml(a.row.area || 'recebimento') + '" data-ter-alerta-tab="' + escapeHtml(a.tab) + '">'
            + '<div class="header-alerta-nf">NF ' + escapeHtml(_terceirosNfTexto(a.row)) + '</div>'
            + '<div class="header-alerta-meta">Parada em: <strong>' + escapeHtml(a.etapa) + '</strong></div>'
            + '<div class="header-alerta-meta">Última ação: ' + escapeHtml(a.usuario || '-') + (a.data ? (' em ' + escapeHtml(a.data)) : '') + '</div>'
            + '</button>';
    }).join('');
    lista.querySelectorAll('[data-ter-alerta-doc]').forEach(function(item) {
        item.addEventListener('click', function() {
            var id = parseInt(item.getAttribute('data-ter-alerta-doc') || '0', 10);
            var tab = item.getAttribute('data-ter-alerta-tab') || 'pendencia-recebimento';
            var menu = document.getElementById('terceiros-alertas-menu');
            if (menu) menu.hidden = true;
            _limparTerceirosDocumentoNaSessao();
            if (id) definirDestaqueLinhaTerceirosDoc(id);
            if (window.controleMostrarModulo) window.controleMostrarModulo('terceiros');
            void abrirAbaTerceirosSeDiferenteAsync(tab, true, false).catch(function(e) {
                console.error(e);
                showMessage('Erro ao abrir alerta da NF.', 'error');
            });
        });
    });
}

function initTerceirosAlertasHeader() {
    var btn = document.getElementById('btn-terceiros-alertas');
    var menu = document.getElementById('terceiros-alertas-menu');
    if (!btn || !menu || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        menu.hidden = !menu.hidden;
        if (!menu.hidden) void atualizarAlertasTerceirosHeader();
    });
    document.addEventListener('click', function(ev) {
        if (!menu.hidden && !menu.contains(ev.target) && ev.target !== btn) {
            menu.hidden = true;
        }
    });
    _terceirosAtualizarAlertasHeaderDoCache();
    void _terceirosGarantirPrefetchLista().then(function(data) {
        if (data && Array.isArray(data.rows)) {
            void atualizarAlertasTerceirosHeader(_terceirosMesclarRecebidosLocaisNasRows(data.rows));
        }
    }).catch(function() {});
}

async function loadTerceirosPendentesLancamento(dataPreloaded) {
    var tbodyMg = document.getElementById('ter-tbody-pendentes-lancamento-mg');
    var tbodySp = document.getElementById('ter-tbody-pendentes-lancamento-sp');
    var tbodyOutras = document.getElementById('ter-tbody-pendentes-lancamento-outras');
    if (!tbodyMg || !tbodySp) return;
    var cols = TERCEIROS_COLS_LISTA_FLUXO;
    var msgErro = function(erro) {
        var html = '<tr><td colspan="' + cols + '" class="loading" style="color:#c62828;">' + escapeHtml(erro) + '</td></tr>';
        tbodyMg.innerHTML = html;
        tbodySp.innerHTML = html;
        if (tbodyOutras) tbodyOutras.innerHTML = html;
    };
    try {
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbodyMg, cols);
    if (data.erro) {
        msgErro(_modErroMsg(data, data.erro));
        return;
    }
    const rows = getTerceirosRowsPorEtapa(data.rows, 'pendentes-lancamento');
    var grupos = _terceirosDividirRowsPendentesLancamentoPorUf(rows);
    var countMg = document.getElementById('ter-pend-lanc-count-mg');
    var countSp = document.getElementById('ter-pend-lanc-count-sp');
    var countOutras = document.getElementById('ter-pend-lanc-count-outras');
    var blocoOutras = document.getElementById('ter-pend-lanc-bloco-outras');
    if (countMg) countMg.textContent = String(grupos.MG.length);
    if (countSp) countSp.textContent = String(grupos.SP.length);
    if (countOutras) countOutras.textContent = String(grupos.OUTRAS.length);
    if (blocoOutras) blocoOutras.hidden = grupos.OUTRAS.length === 0;
    if (!rows.length) {
        var msgGeral = 'Nenhuma NF aguardando lançamento fiscal. Entram aqui após <strong>recebimento concluído</strong> na 2ª aba (em paralelo com Fornecedores recebidos).';
        var htmlVazio = '<tr><td colspan="' + cols + '" class="loading">' + msgGeral + '</td></tr>';
        tbodyMg.innerHTML = htmlVazio;
        tbodySp.innerHTML = htmlVazio;
        if (tbodyOutras) tbodyOutras.innerHTML = htmlVazio;
        return;
    }
    _terceirosPreencherTbodyPendenteLancamento(tbodyMg, grupos.MG, 'MG');
    _terceirosPreencherTbodyPendenteLancamento(tbodySp, grupos.SP, 'SP');
    if (tbodyOutras) _terceirosPreencherTbodyPendenteLancamento(tbodyOutras, grupos.OUTRAS, 'OUTRAS');
    var painel = document.getElementById('terceiros-panel-pendentes-lancamento');
    if (painel) aplicarDestaqueLinhaTerceirosDoc(painel);
    } catch (e) {
        console.error('loadTerceirosPendentesLancamento:', e);
        msgErro(_modErroMsg(null, (e && e.message) || 'Erro ao carregar a lista.'));
    }
}

function renderTerceirosNotasLancadasRowHtml(row) {
    return '<tr data-ter-doc-id="' + escapeHtml(String(row.id)) + '">'
        + renderTerceirosCelulasNfAtePrevisao(row, { motoristaPlacaPrefix: 'lanc', avisoMotoristaNaPrevisao: true })
        + renderTerceirosCelulasStatusFluxo(row, 'notas-lancadas')
        + renderTerceirosListaAcoesCelula(
            renderTerceirosAbrirButton(row, 'data-ter-lancada-doc', 'Abrir detalhe', 'pendencia-recebimento')
            + renderTerceirosBotoesPdfXmlNf(row)
            + renderTerceirosComprovanteButton(row)
            + renderTerceirosExcluirButton(row, 'data-ter-excluir-lancada-doc')
        )
        + '</tr>';
}

function bindTerceirosEnviarMgNotasLancadas(tbody) {
    if (!tbody) return;
    if (!window._terceirosEnviarMgLancEmAndamento) window._terceirosEnviarMgLancEmAndamento = {};
    tbody.querySelectorAll('[data-ter-enviar-mg-lanc-doc]').forEach(function(select) {
        if (select.dataset.terEnviarMgLancBound === '1') return;
        select.dataset.terEnviarMgLancBound = '1';
        select.addEventListener('change', function() {
            var id = parseInt(select.getAttribute('data-ter-enviar-mg-lanc-doc') || '0', 10);
            var valor = (select.value || '').trim().toLowerCase();
            if (!id || !valor) return;
            if (window._terceirosEnviarMgLancEmAndamento[id]) return;
            window._terceirosEnviarMgLancEmAndamento[id] = true;
            select.disabled = true;
            var promessa = valor === 'sim'
                ? terceirosMarcarPendenciaMgDaNotaLancada(id)
                : _terceirosAtualizarStatusComMotivo(id, 'enviar_para_mg', valor, {
                    motorista_obrigatorio: select.getAttribute('data-ter-motorista-obrigatorio') === 'sim',
                    motorista_atual: select.getAttribute('data-ter-motorista-atual') || ''
                });
            Promise.resolve(promessa).finally(function() {
                delete window._terceirosEnviarMgLancEmAndamento[id];
                if (select.isConnected) select.disabled = false;
            });
        });
    });
}

async function loadTerceirosNotasLancadas(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-notas-lancadas');
    if (!tbody) return;
    try {
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(data, data.erro)) + '</td></tr>';
        return;
    }
    const rows = getTerceirosRowsNotasLancadasComHistorico(data.rows);
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF aguardando decisão de envio MG. Marque <strong>Lançada = Sim</strong> na 4ª aba.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(renderTerceirosNotasLancadasRowHtml).join('');
    bindTerceirosAbrirButtons('[data-ter-lancada-doc]');
    bindTerceirosExcluirButtons('[data-ter-excluir-lancada-doc]');
    bindTerceirosComprovanteButtons('[data-ter-comprovante-doc]');
    bindTerceirosSalvarMotoristaPlacaLista(tbody, 'lanc');
    bindTerceirosEnviarMgNotasLancadas(tbody);
    if (!window._terceirosConcluirCarretaEmAndamento) window._terceirosConcluirCarretaEmAndamento = {};
    tbody.querySelectorAll('[data-ter-concluir-carreta-doc]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = parseInt(btn.getAttribute('data-ter-concluir-carreta-doc') || '0', 10);
            if (!id || window._terceirosConcluirCarretaEmAndamento[id]) return;
            window._terceirosConcluirCarretaEmAndamento[id] = true;
            btn.disabled = true;
            _terceirosConcluirCarretaNoHistorico(id).finally(function() {
                delete window._terceirosConcluirCarretaEmAndamento[id];
                if (btn.isConnected) btn.disabled = false;
            });
        });
    });
    if (!window._terceirosConcluirConsumivelEmAndamento) window._terceirosConcluirConsumivelEmAndamento = {};
    tbody.querySelectorAll('[data-ter-concluir-consumivel-doc]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = parseInt(btn.getAttribute('data-ter-concluir-consumivel-doc') || '0', 10);
            if (!id || window._terceirosConcluirConsumivelEmAndamento[id]) return;
            window._terceirosConcluirConsumivelEmAndamento[id] = true;
            btn.disabled = true;
            _terceirosConcluirConsumivelNoHistorico(id).finally(function() {
                delete window._terceirosConcluirConsumivelEmAndamento[id];
                if (btn.isConnected) btn.disabled = false;
            });
        });
    });
    aplicarDestaqueLinhaTerceirosDoc(tbody);
    } catch (e) {
        console.error('loadTerceirosNotasLancadas:', e);
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(null, (e && e.message) || 'Erro ao carregar a lista.')) + '</td></tr>';
    }
}

async function loadTerceirosNotasEnviadasMg(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-notas-enviadas-mg');
    if (!tbody) return;
    try {
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(data, data.erro)) + '</td></tr>';
        return;
    }
    const rows = getTerceirosRowsPorEtapa(data.rows, 'notas-enviadas-mg');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF com <strong>Enviado MG = Sim</strong> aguardando recebimento na 8ª aba.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(function(row) {
        return '<tr data-ter-doc-id="' + escapeHtml(String(row.id)) + '">'
            + renderTerceirosCelulasNfAtePrevisao(row)
            + renderTerceirosCelulasStatusFluxo(row, 'notas-enviadas-mg')
            + renderTerceirosListaAcoesCelula(
                renderTerceirosAbrirButton(row, 'data-ter-enviada-doc', 'Abrir detalhe', 'pendencia-recebimento')
                + renderTerceirosBotoesPdfXmlNf(row)
                + renderTerceirosComprovanteButton(row)
                + renderTerceirosExcluirButton(row, 'data-ter-excluir-enviada-doc')
            )
            + '</tr>';
    }).join('');
    bindTerceirosAbrirButtons('[data-ter-enviada-doc]');
    bindTerceirosExcluirButtons('[data-ter-excluir-enviada-doc]');
    bindTerceirosComprovanteButtons('[data-ter-comprovante-doc]');
    aplicarDestaqueLinhaTerceirosDoc(tbody);
    } catch (e) {
        console.error('loadTerceirosNotasEnviadasMg:', e);
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(null, (e && e.message) || 'Erro ao carregar a lista.')) + '</td></tr>';
    }
}

async function loadTerceirosRecebimentosMg(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-recebimentos-mg');
    if (!tbody) return;
    try {
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(data, data.erro)) + '</td></tr>';
        return;
    }
    const rows = getTerceirosRowsPorEtapa(data.rows, 'recebimentos-mg');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF aguardando <strong>Recebida MG</strong>. Entram aqui após <strong>Enviado MG = Sim</strong> na 6ª ou 7ª aba.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(function(row) {
        return '<tr data-ter-doc-id="' + escapeHtml(String(row.id)) + '">'
            + renderTerceirosCelulasNfAtePrevisao(row)
            + renderTerceirosCelulasStatusFluxo(row, 'recebimentos-mg')
            + renderTerceirosListaAcoesCelula(
                renderTerceirosAbrirButton(row, 'data-ter-receb-mg-doc', 'Abrir detalhe', 'pendencia-recebimento')
                + renderTerceirosBotoesPdfXmlNf(row)
                + renderTerceirosComprovanteButton(row)
                + renderTerceirosExcluirButton(row, 'data-ter-excluir-receb-mg-doc')
            )
            + '</tr>';
    }).join('');
    bindTerceirosAbrirButtons('[data-ter-receb-mg-doc]');
    bindTerceirosExcluirButtons('[data-ter-excluir-receb-mg-doc]');
    bindTerceirosComprovanteButtons('[data-ter-comprovante-doc]');
    if (!window._terceirosRecebidaMgEmAndamento) window._terceirosRecebidaMgEmAndamento = {};
    tbody.querySelectorAll('[data-ter-recebida-mg-receb-doc]').forEach(function(select) {
        select.addEventListener('change', function() {
            var id = parseInt(select.getAttribute('data-ter-recebida-mg-receb-doc') || '0', 10);
            var motoristaObrigatorio = select.getAttribute('data-ter-motorista-obrigatorio') === 'sim';
            var motoristaAtual = select.getAttribute('data-ter-motorista-atual') || '';
            var valor = (select.value || '').trim().toLowerCase();
            if (!id || !valor) return;
            if (window._terceirosRecebidaMgEmAndamento[id]) return;
            window._terceirosRecebidaMgEmAndamento[id] = true;
            select.disabled = true;
            var opcoesStatus = {
                motorista_obrigatorio: motoristaObrigatorio,
                motorista_atual: motoristaAtual
            };
            _terceirosAtualizarStatusComMotivo(id, 'carga_recebida_mg', valor, opcoesStatus).finally(function() {
                delete window._terceirosRecebidaMgEmAndamento[id];
                if (select.isConnected) select.disabled = false;
            });
        });
    });
    aplicarDestaqueLinhaTerceirosDoc(tbody);
    } catch (e) {
        console.error('loadTerceirosRecebimentosMg:', e);
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(null, (e && e.message) || 'Erro ao carregar a lista.')) + '</td></tr>';
    }
}

async function loadTerceirosPendenciasMg(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-pendencias-mg');
    if (!tbody) return;
    try {
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(data, data.erro)) + '</td></tr>';
        return;
    }
    const rows = getTerceirosRowsPorEtapa(data.rows, 'pendencias-mg');

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF aguardando <strong>envio para MG</strong>. As notas entram aqui junto com a 5ª aba após <strong>Lançada = Sim</strong>.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(function(row) {
        return '<tr data-ter-doc-id="' + escapeHtml(String(row.id)) + '">'
            + renderTerceirosCelulasNfAtePrevisao(row, { motoristaPlacaPrefix: 'pend-mg', avisoMotoristaNaPrevisao: true })
            + renderTerceirosCelulasStatusFluxo(row, 'pendencias-mg')
            + renderTerceirosListaAcoesCelula(
                renderTerceirosAbrirButton(row, 'data-ter-pendencia-doc', 'Abrir detalhe', 'pendencia-recebimento')
                + renderTerceirosBotoesPdfXmlNf(row)
                + renderTerceirosComprovanteButton(row)
                + renderTerceirosExcluirButton(row, 'data-ter-excluir-pendencia-doc')
            )
            + '</tr>';
    }).join('');
    bindTerceirosAbrirButtons('[data-ter-pendencia-doc]');
    bindTerceirosExcluirButtons('[data-ter-excluir-pendencia-doc]');
    bindTerceirosComprovanteButtons('[data-ter-comprovante-doc]');
    if (!window._terceirosEnviarMgPendEmAndamento) window._terceirosEnviarMgPendEmAndamento = {};
    tbody.querySelectorAll('[data-ter-enviar-mg-pend-doc]').forEach(function(select) {
        select.addEventListener('change', function() {
            var id = parseInt(select.getAttribute('data-ter-enviar-mg-pend-doc') || '0', 10);
            var motoristaObrigatorio = select.getAttribute('data-ter-motorista-obrigatorio') === 'sim';
            var motoristaAtual = select.getAttribute('data-ter-motorista-atual') || '';
            var inputMot = document.querySelector('[data-ter-motorista-pend-mg-doc="' + String(id) + '"]');
            var inputPla = document.querySelector('[data-ter-placa-pend-mg-doc="' + String(id) + '"]');
            if (inputMot && inputMot.value.trim()) motoristaAtual = inputMot.value.trim();
            var valor = (select.value || '').trim().toLowerCase();
            if (!id || !valor) return;
            if (window._terceirosEnviarMgPendEmAndamento[id]) return;
            window._terceirosEnviarMgPendEmAndamento[id] = true;
            select.disabled = true;
            var opcoesStatus = {
                motorista_obrigatorio: motoristaObrigatorio,
                motorista_atual: motoristaAtual
            };
            if (valor === 'sim' && (!motoristaObrigatorio || motoristaAtual || (inputMot && inputMot.value.trim()))) {
                opcoesStatus.movimento_enviar_mg_sim_aplicado = true;
                void terceirosNavegarParaNotasEnviadasMgAposConfirmar(id);
            }
            var promessa;
            if (valor === 'sim' && inputMot && inputPla) {
                var motVal = inputMot.value.trim();
                var plaVal = inputPla.value.trim();
                if (motVal || plaVal) {
                    opcoesStatus.motorista_atual = motVal || motoristaAtual;
                    promessa = salvarMotoristaPlacaTerceirosDireto(id, motVal, plaVal, 'saida_mg').then(function() {
                        return _terceirosAtualizarStatusComMotivo(id, 'enviar_para_mg', valor, opcoesStatus);
                    });
                } else {
                    promessa = _terceirosAtualizarStatusComMotivo(id, 'enviar_para_mg', valor, opcoesStatus);
                }
            } else {
                promessa = _terceirosAtualizarStatusComMotivo(id, 'enviar_para_mg', valor, opcoesStatus);
            }
            promessa.finally(function() {
                delete window._terceirosEnviarMgPendEmAndamento[id];
                if (select.isConnected) select.disabled = false;
            });
        });
    });
    bindTerceirosSalvarMotoristaPlacaLista(tbody, 'pend-mg');
    aplicarDestaqueLinhaTerceirosDoc(tbody);
    } catch (e) {
        console.error('loadTerceirosPendenciasMg:', e);
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(null, (e && e.message) || 'Erro ao carregar a lista.')) + '</td></tr>';
    }
}

async function loadTerceirosHistorico(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-historico');
    if (!tbody) return;
    try {
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(data, data.erro)) + '</td></tr>';
        return;
    }
    var rowsMerged = _terceirosMesclarRecebidosLocaisNasRows(data.rows || []);
    var rows = rowsMerged.filter(function(row) {
        return _terceirosConsideraHistorico(row);
    });
    var rowsFiltradas = _terceirosFiltrarRowsHistorico(rows);
    atualizarUiFiltrosHistoricoTerceiros();

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF no histórico. Entram aqui quando o fluxo termina (todas as etapas <strong>Sim</strong>) ou ao registrar <strong>Não</strong> com motivo nas abas 4, 6 ou 8.</td></tr>';
        return;
    }
    if (!rowsFiltradas.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">' + _terceirosMsgListaVaziaHistoricoFiltro() + '</td></tr>';
        return;
    }

    tbody.innerHTML = rowsFiltradas.map(function(row) {
        return '<tr data-ter-doc-id="' + escapeHtml(String(row.id)) + '">'
            + renderTerceirosCelulasNfAtePrevisao(row, { historicoMotoristaPlaca: true })
            + renderTerceirosCelulasStatusFluxo(row, 'historico')
            + renderTerceirosListaAcoesCelula(
                renderTerceirosAbrirButton(row, 'data-ter-historico-doc', 'Abrir detalhe', 'historico')
                + renderTerceirosBotoesPdfXmlNf(row)
                + renderTerceirosComprovanteButton(row)
                + renderTerceirosExcluirButton(row, 'data-ter-excluir-historico-doc')
            )
            + '</tr>';
    }).join('');
    bindTerceirosAbrirButtons('[data-ter-historico-doc]');
    bindTerceirosExcluirButtons('[data-ter-excluir-historico-doc]');
    bindTerceirosComprovanteButtons('[data-ter-comprovante-doc]');
    aplicarDestaqueLinhaTerceirosDoc(tbody);
    } catch (e) {
        console.error('loadTerceirosHistorico:', e);
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(null, (e && e.message) || 'Erro ao carregar a lista.')) + '</td></tr>';
    }
}

/** Incorpora NFs recém-enviadas no cache local (sem baixar todas as notas de novo). */
function _terceirosMesclarRowsUploadNoCache(novosRows) {
    if (!Array.isArray(novosRows) || !novosRows.length) return;
    var idsNovos = {};
    novosRows.forEach(function(r) {
        if (r && r.id != null) idsNovos[String(r.id)] = true;
    });
    var base = Array.isArray(_terceirosListaCache.rows) ? _terceirosListaCache.rows : [];
    var merged = novosRows.concat(base.filter(function(r) {
        return r && !idsNovos[String(r.id)];
    }));
    merged.sort(function(a, b) {
        return Number(b.id || 0) - Number(a.id || 0);
    });
    _terceirosListaCache.rows = merged;
    _terceirosListaCache.erro = null;
    _terceirosListaCache.ts = Date.now();
    _terceirosAtualizarPainelLocalRapido();
}

/** Atualiza só o painel em background (lista já veio em criados_rows). */
function _terceirosSincronizarListasAposUploadBackground() {
    void loadPainelTerceiros().catch(function(e) {
        console.error('_terceirosSincronizarListasAposUploadBackground painel:', e);
    });
}

/**
 * Atualiza Pendência na hora com criados_rows da API; lista completa sincroniza em background.
 */
function _terceirosAplicarUploadNoCache(uploadResp) {
    var rowsNovos = uploadResp && Array.isArray(uploadResp.criados_rows) ? uploadResp.criados_rows : [];
    if (rowsNovos.length) {
        _terceirosMesclarRowsUploadNoCache(rowsNovos);
        void loadTerceirosDocumentos({ rows: _terceirosListaCache.rows, erro: null });
        void atualizarAlertasTerceirosHeader(_terceirosMesclarRecebidosLocaisNasRows(_terceirosListaCache.rows));
        _terceirosSincronizarListasAposUploadBackground();
        return Promise.resolve({ rows: _terceirosListaCache.rows, erro: null });
    }
    return _terceirosRecarregarAposUpload();
}

/**
 * Após upload de XML: busca lista nova e atualiza Pendência (fallback se API não enviar criados_rows).
 */
async function _terceirosRecarregarAposUpload() {
    invalidateTerceirosListaCache();
    _terceirosPrefetchPromise = null;
    var data = await fetchTerceirosDocumentosTodos({ force: true });
    await loadTerceirosDocumentos(data);
    void warmTerceirosTodasListas(data).catch(function(err) {
        console.error('_terceirosRecarregarAposUpload warm:', err);
    });
    void loadPainelTerceiros().catch(function(err) {
        console.error('_terceirosRecarregarAposUpload painel:', err);
    });
    void atualizarAlertasTerceirosHeader(_terceirosMesclarRecebidosLocaisNasRows(data.rows || []));
    return data;
}

/**
 * Recarrega todas as tabelas do módulo Terceiros (ex.: após excluir NF em qualquer aba).
 * Mantém a sub-aba ativa só na UI; os dados de todas as listas ficam alinhados ao servidor.
 */
async function recarregarTodasListasTerceiros() {
    _terceirosPrefetchPromise = null;
    var data = await fetchTerceirosDocumentosTodos({ force: true });
    await warmTerceirosTodasListas(data);
    await loadPainelTerceiros().catch(function(err) { console.error('recarregarTodasListasTerceiros painel:', err); });
}

async function refreshTerceirosViews(opcoes) {
    opcoes = opcoes || {};
    if (opcoes.usarCache) {
        var hitCache = _terceirosObterCacheLista();
        if (hitCache) {
            await recarregarListaTerceirosTab(_terceirosTabAtual);
            return;
        }
    }
    invalidateTerceirosListaCache();
    _terceirosPrefetchPromise = null;
    try {
        var data = await fetchTerceirosDocumentosTodos({ force: true });
        await warmTerceirosTodasListas(data);
        if (_terceirosTabAtual === 'painel') {
            await loadPainelTerceiros();
        }
    } catch (error) {
        console.error('Erro ao atualizar módulo de terceiros:', error);
        if (_terceirosTabAtual === 'enviar-xml') {
            showMessage('Erro ao carregar dados do módulo de terceiros.', 'error');
            return;
        }
        var tbodyAtivo = document.getElementById('ter-tbody-recebimento-documentos');
        if (_terceirosTabAtual === 'fornecedores-recebidos') tbodyAtivo = document.getElementById('ter-tbody-fornecedores-recebidos');
        if (_terceirosTabAtual === 'pendentes-lancamento') tbodyAtivo = document.getElementById('ter-tbody-pendentes-lancamento-mg');
        if (_terceirosTabAtual === 'notas-lancadas') tbodyAtivo = document.getElementById('ter-tbody-notas-lancadas');
        if (_terceirosTabAtual === 'notas-enviadas-mg') tbodyAtivo = document.getElementById('ter-tbody-notas-enviadas-mg');
        if (_terceirosTabAtual === 'recebimentos-mg') tbodyAtivo = document.getElementById('ter-tbody-recebimentos-mg');
        if (_terceirosTabAtual === 'pendencias-mg') tbodyAtivo = document.getElementById('ter-tbody-pendencias-mg');
        if (_terceirosTabAtual === 'historico') tbodyAtivo = document.getElementById('ter-tbody-historico');
        if (tbodyAtivo) {
            var cols = 9;
            if (tbodyAtivo.id === 'ter-tbody-fornecedores-recebidos' || (tbodyAtivo.id && tbodyAtivo.id.indexOf('ter-tbody-pendentes-lancamento') === 0)) {
                cols = TERCEIROS_COLS_LISTA_FLUXO;
            } else if (tbodyAtivo.id === 'ter-tbody-notas-lancadas' || tbodyAtivo.id === 'ter-tbody-recebimento-documentos') {
                cols = 12;
            } else if (tbodyAtivo.id === 'ter-tbody-pendencias-mg' || tbodyAtivo.id === 'ter-tbody-recebimentos-mg') {
                cols = 11;
            } else if (tbodyAtivo.id === 'ter-tbody-notas-enviadas-mg') {
                cols = 10;
            } else if (tbodyAtivo.id === 'ter-tbody-historico') {
                cols = 15;
            }
            tbodyAtivo.innerHTML = '<tr><td colspan="' + cols + '" class="loading" style="color:#c62828;">Erro ao carregar os dados desta aba.</td></tr>';
        }
        showMessage('Erro ao carregar dados do módulo de terceiros.', 'error');
    }
}

async function excluirDocumentoTerceiros(documentoId) {
    var idNum = Number(documentoId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
        showMessage('Não foi possível identificar a nota para excluir.', 'warning');
        return;
    }
    var idKey = String(idNum);
    if (window._terceirosExclusaoIdsEmAndamento[idKey]) {
        return;
    }
    window._terceirosExclusaoIdsEmAndamento[idKey] = true;
    try {
        _terceirosListaFetchGen++;
        _terceirosRemoverDocumentoDosCachesLocais(idNum);
        _terceirosAtualizarAlertasHeaderDoCache();
        _terceirosRemoverLinhaDeTodasListas(idNum);
        if (Number(_terceirosDestacarDocIdAposCarga) === idNum) {
            _terceirosDestacarDocIdAposCarga = null;
        }
        var atualNum = Number(_terceirosDocAtual && _terceirosDocAtual.id);
        if (Number.isFinite(atualNum) && atualNum === idNum) {
            resetTerceirosDetalhe();
        }

        var resp = await fetchAPIComTimeout(
            '/terceiros/documentos/' + encodeURIComponent(idNum),
            { method: 'DELETE', keepalive: false },
            30000
        );

        _terceirosExcluirDocumentoAtual = null;
        if (!_terceirosRespostaApiOk(resp)) {
            _terceirosDesmarcarDocumentoExcluidoOculto(idNum);
            try {
                await recarregarTodasListasTerceiros();
            } catch (eRec) {
                console.error(eRec);
            }
            showMessage((resp && resp.erro) || 'Erro ao excluir NF.', 'error');
            return;
        }
        _terceirosDesmarcarDocumentoExcluidoOculto(idNum);
        _terceirosReaplicarTodasListasDoCacheLocal();
        void loadPainelTerceiros({ force: true }).catch(function(ePainel) {
            console.error('excluirDocumentoTerceiros painel:', ePainel);
        });
        showMessage((resp && resp.mensagem) || 'NF excluída.', 'success');
    } catch (e) {
        console.error(e);
        _terceirosDesmarcarDocumentoExcluidoOculto(idNum);
        try {
            await recarregarTodasListasTerceiros();
        } catch (e2) {
            console.error(e2);
        }
        showMessage('Erro ao excluir NF. A lista foi atualizada.', 'error');
    } finally {
        delete window._terceirosExclusaoIdsEmAndamento[idKey];
        fecharTerAcaoLoading();
    }
}

async function atualizarStatusTerceirosDireto(documentoId, campo, valor, opcoes) {
    if (!documentoId) return;
    opcoes = opcoes || {};
    if (campo === 'enviar_para_mg' && _terceirosTabAtual !== 'pendencias-mg' && _terceirosTabAtual !== 'notas-lancadas') {
        showMessage('O campo Enviar MG só pode ser alterado na aba 5 — Notas lançadas ou 6 — Pendências envio MG.', 'warning');
        await refreshTerceirosViews();
        return;
    }
    if (campo === 'enviar_para_mg' && opcoes.row && isTerceirosAreaCarreta(opcoes.row)) {
        showMessage('NF de carreta não utiliza envio para MG. Conclua na 5ª aba — Notas lançadas.', 'warning');
        await refreshTerceirosViews();
        return;
    }
    if (campo === 'carga_recebida_mg' && _terceirosTabAtual !== 'recebimentos-mg' && !opcoes.forcar_aba_recebimentos_mg && !opcoes.forcar_fluxo_carreta) {
        showMessage('O campo Recebida MG só pode ser alterado na aba 8 — Recebimentos de MG.', 'warning');
        await refreshTerceirosViews();
        return;
    }
    if ((campo === 'enviar_para_mg' || campo === 'carga_recebida_mg') && String(valor).toLowerCase() === 'sim' && opcoes.motorista_obrigatorio && !String(opcoes.motorista_atual || '').trim()) {
        showMessage('Para esta rota, informe o motorista da carreta antes de continuar.', 'warning');
        await refreshTerceirosViews();
        return;
    }
    if ((campo === 'enviar_para_mg' || campo === 'carga_recebida_mg') && String(valor).toLowerCase() === 'sim') {
        var rowAvanco = opcoes.row || _terceirosRowPorId(documentoId);
        if (rowAvanco && !_terceirosRecebimentoEstaConcluido(rowAvanco)) {
            showMessage('Conclua o recebimento na 2ª aba — Pendência de recebimento antes de avançar.', 'warning');
            await refreshTerceirosViews();
            return;
        }
    }
    if (campo === 'nota_lancada' && String(valor).toLowerCase() === 'sim' && !_terceirosOpPodeLancarNotaSemConfirmacao(opcoes)) {
        var confirmouLocal = await abrirModalLancamentoSemRecebimento();
        if (!confirmouLocal) {
            showMessage('Lançamento cancelado. A nota segue sem recebimento confirmado.', 'warning');
            await refreshTerceirosViews();
            return;
        }
        opcoes.forcar_lancamento_sem_recebimento = true;
    }
    var resp = await fetchAPI('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/status', {
        method: 'POST',
        body: JSON.stringify({
            campo: campo,
            valor: valor,
            motivo: opcoes.motivo || '',
            recebedor_mg: opcoes.recebedor_mg || '',
            forcar_lancamento_sem_recebimento: !!opcoes.forcar_lancamento_sem_recebimento,
            forcar_fluxo_carreta: !!opcoes.forcar_fluxo_carreta
        })
    });
    if (!_terceirosRespostaApiOk(resp)) {
        if (resp && resp.confirmacao_necessaria && campo === 'nota_lancada' && String(valor).toLowerCase() === 'sim' && !opcoes.forcar_lancamento_sem_recebimento) {
            var confirmou = await abrirModalLancamentoSemRecebimento();
            if (confirmou) {
                await atualizarStatusTerceirosDireto(documentoId, campo, valor, Object.assign({}, opcoes, {
                    forcar_lancamento_sem_recebimento: true
                }));
                return;
            }
            showMessage('Lançamento cancelado. A nota segue sem recebimento confirmado.', 'warning');
            await refreshTerceirosViews();
            return;
        }
        showMessage((resp && resp.erro) || 'Erro ao atualizar status.', 'error');
        await refreshTerceirosViews();
        return;
    }
    if (resp && resp.documento) {
        _terceirosPersistirDocumentoServidorNoCache(resp.documento);
        if (_terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
            Object.assign(_terceirosDocAtual, resp.documento);
        }
    } else {
        _terceirosAtualizarAlertasHeaderDoCache();
    }
    if (campo === 'nota_lancada' && isTerceirosFlagSim(valor)) {
        await _terceirosAposConfirmarNotaLancadaSim(documentoId, resp && resp.documento, opcoes);
        return;
    }
    if (campo === 'nota_lancada' && isTerceirosFlagNao(valor)) {
        await _terceirosAposConfirmarNotaLancadaNao(documentoId, resp && resp.documento, opcoes);
        return;
    }
    if (campo === 'enviar_para_mg' && isTerceirosFlagSim(valor)) {
        await _terceirosAposConfirmarEnviarMgSim(documentoId, resp && resp.documento, opcoes);
        return;
    }
    if (campo === 'enviar_para_mg' && isTerceirosFlagNao(valor)) {
        await _terceirosAposConfirmarEnviarMgNao(documentoId, resp && resp.documento, opcoes);
        return;
    }
    if (campo === 'carga_recebida_mg' && isTerceirosFlagSim(valor) && opcoes.forcar_fluxo_carreta) {
        await _terceirosAposConcluirCarretaNoHistorico(documentoId, resp && resp.documento);
        return;
    }
    if (campo === 'carga_recebida_mg' && isTerceirosFlagSim(valor)) {
        await _terceirosAposConfirmarRecebidaMgSim(documentoId, resp && resp.documento, opcoes);
        return;
    }
    if (campo === 'carga_recebida_mg' && isTerceirosFlagNao(valor)) {
        await _terceirosAposConfirmarRecebidaMgNao(documentoId, resp && resp.documento, opcoes);
        return;
    }
    if (campo === 'consumivel_sp_historico' && isTerceirosFlagSim(valor)) {
        await _terceirosAposConcluirConsumivelNoHistorico(documentoId, resp && resp.documento, opcoes);
        return;
    }
    var navegouFluxo = await moverDocumentoFluxoTerceirosAposStatus(documentoId, campo, valor);
    if (!navegouFluxo) {
        if (_terceirosDocAtual.id === documentoId) {
            await loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, documentoId);
        }
        try {
            await recarregarListaTerceirosTab(_terceirosTabAtual);
        } catch (e) {
            console.error(e);
        }
    }
    showMessage('Status atualizado.', 'success');
}

async function salvarMotoristaTerceirosDireto(documentoId, motorista) {
    if (!documentoId) return;
    if (!_terceirosPodeEditarMotoristaPlaca()) {
        showMessage('Motorista e placa só podem ser alterados nas abas Enviar XML e Pendências envio MG.', 'warning');
        return;
    }
    return salvarMotoristaPlacaTerceirosDireto(documentoId, motorista, null, 'chegada');
}

async function salvarMotoristaPlacaTerceirosDireto(documentoId, motorista, placa, tipo) {
    if (!documentoId) return;
    if (!_terceirosPodeEditarMotoristaPlaca()) {
        showMessage('Motorista e placa só podem ser alterados nas abas Enviar XML e Pendências envio MG.', 'warning');
        return;
    }
    motorista = (motorista != null ? String(motorista) : '').trim();
    if (placa != null) placa = String(placa).trim().toUpperCase();
    tipo = tipo || (_terceirosTabAtual === 'pendencias-mg' ? 'saida_mg' : 'chegada');
    if (!motorista) {
        showMessage('Digite o motorista da carreta.', 'warning');
        return;
    }
    var body = { motorista: motorista, tipo: tipo };
    if (placa != null) body.placa = placa;
    _terceirosAtualizarMotoristaPlacaLocal(documentoId, motorista, placa, tipo);
    if (_terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
        var prefixo = getTerceirosPrefixo();
        var motEl = document.getElementById(prefixo + '-motorista-carreta');
        var plaEl = document.getElementById(prefixo + '-placa-carreta');
        if (motEl) motEl.textContent = motorista || '-';
        if (plaEl && placa != null) plaEl.textContent = placa || '-';
    }
    showMessage(placa != null ? 'Motorista e placa salvos.' : 'Motorista salvo.', 'success');
    var resp = await fetchAPI('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/motorista', {
        method: 'POST',
        body: JSON.stringify(body)
    });
    if (!resp || !resp.ok) {
        showMessage((resp && resp.erro) || 'Erro ao salvar motorista e placa.', 'error');
        void refreshTerceirosViews().catch(function(e) { console.error(e); });
        return;
    }
    if (resp.documento) {
        _terceirosAtualizarMotoristaPlacaLocal(
            documentoId,
            tipo === 'saida_mg' ? (resp.documento.motorista_saida_mg || motorista) : (resp.documento.motorista_carreta || motorista),
            placa != null ? (tipo === 'saida_mg' ? (resp.documento.placa_saida_mg || placa) : (resp.documento.placa_carreta || placa)) : placa,
            tipo
        );
    }
    void refreshTerceirosViews({ usarCache: true }).catch(function(e) { console.error(e); });
}

function resetTerceirosDetalhe() {
    _limparTerceirosDocumentoNaSessao();
    var prefixo = getTerceirosPrefixo();
    var vazio = document.getElementById('ter-recebimento-detalhe-vazio');
    var detalhe = document.getElementById('ter-recebimento-detalhe');
    var btnVoltarLista = document.getElementById('btn-ter-voltar-lista-nf');
    if (btnVoltarLista) btnVoltarLista.style.display = 'none';
    if (vazio) vazio.style.display = 'block';
    if (detalhe) detalhe.style.display = 'none';
    _terceirosDocAtual.id = null;
    _terceirosDocAtual.area = 'recebimento';
    _terceirosDocAtual.recebimento_concluido = false;
    ['nf', 'qtd-xml', 'qtd-bipada', 'pendencias'].forEach(function(suf) {
        var el = document.getElementById(prefixo + '-stat-' + suf);
        if (el) el.textContent = suf === 'nf' ? '-' : '0';
    });
    ['pedido', 'remetente', 'destinatario', 'destinatario-uf', 'previsao', 'motorista-carreta', 'placa-carreta', 'concluido-meta'].forEach(function(suf) {
        var el = document.getElementById(prefixo + '-' + suf);
        if (el) el.textContent = '-';
    });
    var elDocIdR = document.getElementById('ter-rec-doc-id-display');
    if (elDocIdR) elDocIdR.textContent = '—';
    var elOrigemR = document.getElementById('ter-rec-origem-badge');
    if (elOrigemR) {
        elOrigemR.style.display = 'none';
        elOrigemR.textContent = '';
        elOrigemR.className = 'ter-origem-badge';
    }
    atualizarBotaoConclusaoTerceiros(prefixo, false);
    var hidDoc = document.getElementById('ter-rec-documento-id');
    if (hidDoc) hidDoc.value = '';
    _limparPendenciasBipagemTerceiros();
    var tbody = document.getElementById('ter-tbody-recebimento-itens');
    if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="loading">Selecione uma nota.</td></tr>';
    window._terceirosBipagemItens = [];
    limparCamposBipagemTerceiros(false);
    atualizarUIBipagemTerceiros(null);
}

function preencherMetaTerceiros(prefixo, campoBase, valor, usuario, datahora) {
    var el = document.getElementById(prefixo + '-' + campoBase);
    if (!el) return;
    var partes = [];
    if (valor) partes.push(String(valor));
    if (usuario) partes.push('por ' + usuario);
    if (datahora) partes.push('em ' + datahora);
    el.textContent = partes.length ? partes.join(' ') : '-';
}

function atualizarBotaoConclusaoTerceiros(prefixo, concluidoRaw) {
    var btn = document.getElementById('btn-' + prefixo + '-concluir');
    if (!btn) return;
    var concluido = isTerceirosFlagSim(concluidoRaw);
    btn.classList.toggle('btn-ter-concluido', concluido);
    btn.textContent = concluido ? 'Recebimento concluído ✓' : 'Recebimento concluído';
    btn.disabled = concluido;
    btn.setAttribute('aria-label', concluido ? 'Recebimento já concluído' : 'Registrar recebimento como concluído');
}

function animarConclusaoTerceiros(prefixo) {
    var btn = document.getElementById('btn-' + prefixo + '-concluir');
    if (!btn) return;
    btn.classList.remove('btn-ter-concluido-animando');
    void btn.offsetWidth;
    btn.classList.add('btn-ter-concluido-animando');
    window.setTimeout(function() {
        btn.classList.remove('btn-ter-concluido-animando');
    }, 1400);
}

if (typeof window._terceirosBipagemPending !== 'object') {
    window._terceirosBipagemPending = { adds: {}, addTimers: {}, removes: {}, removeTimers: {}, DEBOUNCE_MS: 400 };
}

function _limparPendenciasBipagemTerceiros() {
    var p = window._terceirosBipagemPending;
    if (!p) return;
    Object.keys(p.addTimers || {}).forEach(function(k) {
        clearTimeout(p.addTimers[k]);
    });
    Object.keys(p.removeTimers || {}).forEach(function(k) {
        clearTimeout(p.removeTimers[k]);
    });
    p.adds = {};
    p.addTimers = {};
    p.removes = {};
    p.removeTimers = {};
}

/** ID do documento na tela (memória + campo oculto). Sincroniza _terceirosDocAtual.id quando veio só do hidden. */
function _terceirosDocumentoIdAtualParaApi() {
    var raw = _terceirosDocAtual.id;
    var n = raw != null && raw !== '' ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    var hid = document.getElementById('ter-rec-documento-id');
    if (hid && String(hid.value || '').trim() !== '') {
        var p = parseInt(String(hid.value).trim(), 10);
        if (Number.isFinite(p) && p > 0) {
            _terceirosDocAtual.id = p;
            return p;
        }
    }
    return null;
}

/** Envia todas as bipagens/desbipagens em fila (debounce) para o servidor — evita perda ao trocar de NF. */
async function _flushTerceirosPendingDocumento(documentoId) {
    documentoId = Number(documentoId);
    if (!Number.isFinite(documentoId) || documentoId <= 0) return;
    var p = window._terceirosBipagemPending;
    if (!p) return;
    Object.keys(p.addTimers || {}).forEach(function(k) {
        clearTimeout(p.addTimers[k]);
    });
    Object.keys(p.removeTimers || {}).forEach(function(k) {
        clearTimeout(p.removeTimers[k]);
    });
    p.addTimers = {};
    p.removeTimers = {};
    var adds = p.adds;
    var removes = p.removes;
    p.adds = {};
    p.removes = {};
    var addOps = [];
    Object.keys(adds).forEach(function(itemKey) {
        var entry = adds[itemKey];
        if (!entry || !entry.qtd || entry.qtd <= 0) return;
        var itemId = parseInt(itemKey, 10);
        if (!itemId) return;
        addOps.push({
            itemId: itemId,
            codigo_ean: (entry.codigo_ean || '').trim(),
            quantidade: entry.qtd
        });
    });
    var removeOps = [];
    Object.keys(removes).forEach(function(itemKey) {
        var n = removes[itemKey];
        if (n == null || n <= 0) return;
        var itemId = parseInt(itemKey, 10);
        if (!itemId) return;
        removeOps.push({ itemId: itemId, quantidade: n });
    });
    if (!addOps.length && !removeOps.length) return;
    var perReqMs = 40000;
    var algumErro = false;
    var i;
    for (i = 0; i < addOps.length; i++) {
        var a = addOps[i];
        var ra = await fetchAPIComTimeout('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/bipar', {
            method: 'POST',
            body: JSON.stringify({ item_id: a.itemId, codigo_ean: a.codigo_ean, quantidade: a.quantidade }),
            keepalive: false
        }, perReqMs);
        if (!ra || !ra.ok) algumErro = true;
    }
    for (i = 0; i < removeOps.length; i++) {
        var rm = removeOps[i];
        var rr = await fetchAPIComTimeout('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/desbipar', {
            method: 'POST',
            body: JSON.stringify({ item_id: rm.itemId, quantidade: rm.quantidade }),
            keepalive: false
        }, perReqMs);
        if (!rr || !rr.ok) algumErro = true;
    }
    if (algumErro) {
        showMessage('Parte da bipagem não foi salva. Confira as quantidades e bipe de novo se faltar.', 'warning');
    }
}

/**
 * Evita o fluxo de "Recebimento concluído" ficar bloqueado para sempre se /bipar ou /desbipar
 * demorarem ou não responderem (Promise.all do flush).
 */
async function _flushTerceirosPendingDocumentoComLimiteTempo(documentoId, tempoMs) {
    tempoMs = tempoMs == null || tempoMs < 1000 ? 20000 : tempoMs;
    var flushP = _flushTerceirosPendingDocumento(documentoId).then(function() { return 'flush'; });
    var timeoutP = new Promise(function(resolve) {
        window.setTimeout(function() { resolve('timeout'); }, tempoMs);
    });
    var primeiro = await Promise.race([flushP, timeoutP]);
    if (primeiro === 'timeout') {
        showMessage('A sincronização da bipagem está demorando; a conclusão seguirá. Se faltar quantidade, volte à nota e bipe de novo.', 'warning');
    }
}

/**
 * Antes de gravar recebimento concluído: termina todas as bipagens pendentes.
 * Importante: se cortarmos o flush por tempo e já chamarmos POST /status, o SQLite (ou outro BD)
 * pode ficar com escrita concorrente e o pedido de status fica preso — o botão fica em «A guardar…».
 */
async function _flushTerceirosAntesConcluirRecebimento(documentoId) {
    var avisoMs = 8000;
    var avisoT = window.setTimeout(function() {
        showMessage('A guardar últimas bipagens antes de concluir…', 'warning');
    }, avisoMs);
    try {
        await _flushTerceirosPendingDocumentoComLimiteTempo(documentoId, 5000);
    } finally {
        window.clearTimeout(avisoT);
    }
}

/** Resposta JSON de rotas que usam { ok: true/false } (evita depender só de coerção truthy). */
function _terceirosRespostaApiOk(resp) {
    return !!(resp && (resp.ok === true || resp.ok === 1 || isTerceirosFlagSim(resp.ok)));
}

/** Melhor esforço ao fechar aba/navegar: envia fila com keepalive (não bloqueia o unload). */
function _enviarPendenciasTerceirosKeepalive(documentoId) {
    documentoId = Number(documentoId);
    if (!Number.isFinite(documentoId) || documentoId <= 0) return;
    var p = window._terceirosBipagemPending;
    if (!p) return;
    Object.keys(p.addTimers || {}).forEach(function(k) { clearTimeout(p.addTimers[k]); });
    Object.keys(p.removeTimers || {}).forEach(function(k) { clearTimeout(p.removeTimers[k]); });
    p.addTimers = {};
    p.removeTimers = {};
    var adds = Object.assign({}, p.adds);
    var removes = Object.assign({}, p.removes);
    p.adds = {};
    p.removes = {};
    var base = typeof API_BASE !== 'undefined' ? API_BASE : '/api';
    function post(url, body) {
        try {
            fetch(base + url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                credentials: 'same-origin',
                keepalive: true
            });
        } catch (e) { /* ignore */ }
    }
    Object.keys(adds).forEach(function(itemKey) {
        var entry = adds[itemKey];
        if (!entry || !entry.qtd || entry.qtd <= 0) return;
        var itemId = parseInt(itemKey, 10);
        if (!itemId) return;
        post('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/bipar', {
            item_id: itemId,
            codigo_ean: (entry.codigo_ean || '').trim(),
            quantidade: entry.qtd
        });
    });
    Object.keys(removes).forEach(function(itemKey) {
        var n = removes[itemKey];
        if (n == null || n <= 0) return;
        var itemId = parseInt(itemKey, 10);
        if (!itemId) return;
        post('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/desbipar', {
            item_id: itemId,
            quantidade: n
        });
    });
}

/** Status da conferência/extrato a partir das quantidades (romaneio x bipado). */
function _statusBipagemConferencia(qtdProduto, qtdBipada) {
    var prod = parseInt(qtdProduto, 10) || 0;
    var bip = parseInt(qtdBipada, 10) || 0;
    if (bip <= 0) return 'PENDENTE';
    if (prod > 0 && bip > prod) return 'EXCEDENTE';
    if (prod <= 0 && bip > 0) return 'COMPLETO';
    if (prod > 0 && bip >= prod) return 'COMPLETO';
    return 'PARCIAL';
}

/** Coluna Aviso: recalcula “Bipou N a mais” a partir de bipado × romaneio (evita texto antigo). */
function _avisoConferenciaBipagem(avisoExistente, qtdProduto, qtdBipada) {
    var prod = parseInt(qtdProduto, 10) || 0;
    var bip = parseInt(qtdBipada, 10) || 0;
    var sobra = Math.max(0, bip - prod);
    var aviso = (avisoExistente || '').trim();
    var partes = aviso ? aviso.split(' — ').map(function(p) { return p.trim(); }).filter(Boolean) : [];
    partes = partes.filter(function(p) { return p.indexOf('Bipou') < 0; });
    if (sobra > 0) partes.push('Bipou ' + sobra + ' a mais');
    return partes.join(' — ');
}

function _htmlTdAviso(textoAviso) {
    var t = (textoAviso || '').trim();
    var esc = typeof escapeHtml === 'function' ? escapeHtml : function(s) { return String(s || ''); };
    return '<td' + (t ? ' class="celula-aviso-alerta"' : '') + '>' + esc(t) + '</td>';
}

function _aplicarEstiloCelulaAviso(cell, textoAviso) {
    if (!cell) return;
    var t = (textoAviso || '').trim();
    cell.textContent = t;
    if (t) cell.classList.add('celula-aviso-alerta');
    else cell.classList.remove('celula-aviso-alerta');
}

/** Alinhado a app._status_bipagem_terceiros: excedente antes de completo. */
function _statusBipagemTerLocais(qtdXml, qtdBipada) {
    var xml = parseFloat(qtdXml) || 0;
    var bip = parseFloat(qtdBipada) || 0;
    if (bip <= 1e-9) return 'PENDENTE';
    if (bip < xml - 1e-9) return 'PARCIAL';
    if (bip <= xml + 1e-9) return 'COMPLETO';
    return 'EXCEDENTE';
}

/** Mesmo padrão visual da aba Conferência: badge + classe de linha */
function _terConferenciaBadgeEClasseLinha(statusBip) {
    var s = (statusBip || 'PENDENTE').toString().toUpperCase();
    if (s === 'COMPLETO') {
        return { badgeClass: 'status-OK', badgeText: '✅ COMPLETO', rowClass: 'row-completo' };
    }
    if (s === 'EXCEDENTE') {
        return { badgeClass: 'status-EXCEDENTE', badgeText: '📦 EXCEDENTE', rowClass: 'row-excedente' };
    }
    if (s === 'PARCIAL') {
        return { badgeClass: 'status-SOBRA', badgeText: '⚠️ PARCIAL', rowClass: 'row-parcial' };
    }
    return { badgeClass: 'status-FALTA', badgeText: '❌ PENDENTE', rowClass: 'row-pendente' };
}

function _terAtualizarBadgeELinha(row, xmlVal, bipVal) {
    if (!row || !row.cells || row.cells.length < 12) return;
    var st = _statusBipagemTerLocais(xmlVal, bipVal);
    var pack = _terConferenciaBadgeEClasseLinha(st);
    row.className = pack.rowClass;
    row.cells[0].innerHTML = '<span class="status-badge ' + pack.badgeClass + '">' + pack.badgeText + '</span>';
}

function _formatTerQtdDisplay(n) {
    var x = parseFloat(n);
    if (isNaN(x)) return '0';
    var r = Math.round(x * 1000) / 1000;
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    return String(r);
}

function _terHtmlCelulaFalta(xml, bip) {
    var qXml = parseFloat(xml) || 0;
    var qBip = parseFloat(bip) || 0;
    var falta = Math.max(0, qXml - qBip);
    var sobra = Math.max(0, qBip - qXml);
    if (sobra > 1e-9) {
        return '<strong style="color:#7b1fa2;">+' + escapeHtml(_formatTerQtdDisplay(sobra)) + ' sobra</strong>';
    }
    return '<strong style="color: ' + (falta > 1e-9 ? '#f44336' : '#4caf50') + ';">' + escapeHtml(_formatTerQtdDisplay(falta)) + '</strong>';
}

function _terSetCelulaFalta(cell, xml, bip) {
    if (!cell) return;
    cell.innerHTML = _terHtmlCelulaFalta(xml, bip);
}

function _terAtualizarSnapshotItem(itemId, deltaBip) {
    var itens = window._terceirosBipagemItens || [];
    for (var i = 0; i < itens.length; i++) {
        if (Number(itens[i].id) === Number(itemId)) {
            var b = parseFloat(itens[i].quantidade_bipada) || 0;
            itens[i].quantidade_bipada = b + (parseFloat(deltaBip) || 0);
            atualizarResumoTotaisBipagemTerceiros();
            return;
        }
    }
}

/** Atualiza Total XML, Bipado, pendências e cards de estatística a partir do snapshot (tempo real). */
function atualizarResumoTotaisBipagemTerceiros() {
    var itens = window._terceirosBipagemItens || [];
    var totalXml = 0;
    var totalBip = 0;
    var pend = 0;
    for (var i = 0; i < itens.length; i++) {
        var xml = parseFloat(itens[i].quantidade_xml) || 0;
        var bip = parseFloat(itens[i].quantidade_bipada) || 0;
        totalXml += xml;
        totalBip += bip;
        if (_statusBipagemTerLocais(xml, bip) !== 'COMPLETO') {
            pend++;
        }
    }
    totalXml = Math.round(totalXml * 1000) / 1000;
    totalBip = Math.round(totalBip * 1000) / 1000;

    var tx = document.getElementById('ter-bipagem-total-xml');
    var tb = document.getElementById('ter-bipagem-total-bipado');
    var rs = document.getElementById('ter-bipagem-resumo-status');
    if (tx) tx.textContent = 'Total: ' + _formatTerQtdDisplay(totalXml);
    if (tb) tb.textContent = 'Bipado: ' + _formatTerQtdDisplay(totalBip);
    if (rs) {
        if (!itens.length) {
            rs.textContent = 'Sem itens';
            rs.className = 'conferencia-resumo-status status-sem-itens';
            rs.style.color = '';
        } else if (pend > 0) {
            rs.textContent = pend + ' pendência(s)';
            rs.className = 'conferencia-resumo-status';
            rs.style.color = '#e65100';
        } else {
            rs.textContent = 'Completo';
            rs.className = 'conferencia-resumo-status';
            rs.style.color = '#2e7d32';
        }
    }
    var prefixo = getTerceirosPrefixo();
    var elXml = document.getElementById(prefixo + '-stat-qtd-xml');
    var elBip = document.getElementById(prefixo + '-stat-qtd-bipada');
    var elPend = document.getElementById(prefixo + '-stat-pendencias');
    if (elXml) elXml.textContent = _formatTerQtdDisplay(totalXml);
    if (elBip) elBip.textContent = _formatTerQtdDisplay(totalBip);
    if (elPend) elPend.textContent = String(pend);
    atualizarBoxesComprovanteTerceiros();
}

/** Caixas verde/laranja como na Conferência (expedição): comprovante completo vs divergente. */
function atualizarBoxesComprovanteTerceiros() {
    var boxC = document.getElementById('ter-conferencia-completa-box');
    var boxD = document.getElementById('ter-conferencia-divergente-box');
    if (!boxC || !boxD) return;
    var itens = window._terceirosBipagemItens || [];
    var temItens = itens.length > 0;
    var todosCompletos = temItens && itens.every(function(item) {
        var xml = parseFloat(item.quantidade_xml) || 0;
        var bip = parseFloat(item.quantidade_bipada) || 0;
        return _statusBipagemTerLocais(xml, bip) === 'COMPLETO';
    });
    boxC.style.display = (temItens && todosCompletos) ? 'block' : 'none';
    boxD.style.display = (temItens && !todosCompletos) ? 'block' : 'none';
}

function _terTextoEl(id) {
    var el = document.getElementById(id);
    return el ? String(el.textContent || '').trim() : '';
}

/** Imprime comprovante da descarga (NF terceiros). divergente: inclui aviso no topo. */
window.imprimirComprovanteDescargaTerceiros = function(divergente) {
    if (_terceirosDocumentoIdAtualParaApi() == null) {
        showMessage('Selecione uma nota.', 'warning');
        return;
    }
    var itens = window._terceirosBipagemItens || [];
    if (!itens.length) {
        showMessage('Não há itens para o comprovante.', 'warning');
        return;
    }
    var nf = _terTextoEl('ter-rec-stat-nf');
    var pedido = _terTextoEl('ter-rec-pedido');
    var remetente = _terTextoEl('ter-rec-remetente');
    var destinatario = _terTextoEl('ter-rec-destinatario');
    var perfilU = document.getElementById('perfil-usuario');
    var usuario = perfilU ? String(perfilU.textContent || '').trim() : '';
    var agora = new Date().toLocaleString('pt-BR');
    var rows = itens.map(function(item) {
        var xml = parseFloat(item.quantidade_xml) || 0;
        var bip = parseFloat(item.quantidade_bipada) || 0;
        var st = _statusBipagemTerLocais(xml, bip);
        var falta = Math.max(0, xml - bip);
        var sobra = Math.max(0, bip - xml);
        var faltaTxt = sobra > 1e-9
            ? ('0 (+' + _formatTerQtdDisplay(sobra) + ' sobra)')
            : _formatTerQtdDisplay(falta);
        return '<tr>'
            + '<td>' + escapeHtml(String(item.n_item != null ? item.n_item : '')) + '</td>'
            + '<td>' + escapeHtml(String(item.codigo_ean || '')) + '</td>'
            + '<td>' + escapeHtml(String(item.codigo_produto_xml || '')) + '</td>'
            + '<td>' + escapeHtml(String(item.descricao_xml || '')) + '</td>'
            + '<td style="text-align:right">' + escapeHtml(_formatTerQtdDisplay(xml)) + '</td>'
            + '<td style="text-align:right">' + escapeHtml(_formatTerQtdDisplay(bip)) + '</td>'
            + '<td style="text-align:right">' + escapeHtml(faltaTxt) + '</td>'
            + '<td>' + escapeHtml(st) + '</td>'
            + '</tr>';
    }).join('');
    var aviso = divergente
        ? '<p style="color:#e65100;font-weight:bold;">Comprovante divergente — há itens pendentes ou excedentes.</p>'
        : '';
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comprovante descarga</title>'
        + '<style>body{font-family:Arial,sans-serif;padding:16px;font-size:13px}'
        + 'table{border-collapse:collapse;width:100%;margin-top:12px}'
        + 'th,td{border:1px solid #ccc;padding:6px}'
        + 'th{background:#f5f5f5;text-align:left}'
        + '</style></head><body>'
        + '<h2>Comprovante de descarga (terceiros)</h2>'
        + aviso
        + '<p><strong>NF:</strong> ' + escapeHtml(nf || '-') + ' &nbsp; <strong>Pedido:</strong> ' + escapeHtml(pedido || '-') + '</p>'
        + '<p><strong>Remetente:</strong> ' + escapeHtml(remetente || '-') + '</p>'
        + '<p><strong>Destinatário:</strong> ' + escapeHtml(destinatario || '-') + '</p>'
        + '<p><strong>Emitido em:</strong> ' + escapeHtml(agora) + (usuario ? (' &nbsp; <strong>Usuário:</strong> ' + escapeHtml(usuario)) : '') + '</p>'
        + '<table><thead><tr>'
        + '<th>Item</th><th>EAN</th><th>Cód. XML</th><th>Descrição</th><th>Qtd. XML</th><th>Qtd. bipada</th><th>Falta</th><th>Status</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>'
        + '</body></html>';
    var w = terceirosAbrirNovaJanela(
        { tipo: 'html', html: html },
        { titulo: 'Pop-up bloqueado — Gerar comprovante' }
    );
    if (!w) return;
    w.focus();
    try {
        w.print();
    } catch (e) { /* ignore */ }
};

function _terFormatarNfDoc(doc) {
    return [(doc && doc.numero_nf) || '-', (doc && doc.serie_nf) ? ('Série ' + doc.serie_nf) : ''].filter(Boolean).join(' / ');
}

function imprimirComprovanteDescargaTerceirosDoc(doc) {
    if (!doc || !Array.isArray(doc.itens) || !doc.itens.length) {
        showMessage('Não há itens para o comprovante.', 'warning');
        return;
    }
    var itens = doc.itens || [];
    var divergente = itens.some(function(item) {
        var xml = parseFloat(item.quantidade_xml) || 0;
        var bip = parseFloat(item.quantidade_bipada) || 0;
        return _statusBipagemTerLocais(xml, bip) !== 'COMPLETO';
    });
    var perfilU = document.getElementById('perfil-usuario');
    var usuario = perfilU ? String(perfilU.textContent || '').trim() : '';
    var agora = new Date().toLocaleString('pt-BR');
    var rows = itens.map(function(item) {
        var xml = parseFloat(item.quantidade_xml) || 0;
        var bip = parseFloat(item.quantidade_bipada) || 0;
        var st = _statusBipagemTerLocais(xml, bip);
        var falta = Math.max(0, xml - bip);
        var sobra = Math.max(0, bip - xml);
        var faltaTxt = sobra > 1e-9
            ? ('0 (+' + _formatTerQtdDisplay(sobra) + ' sobra)')
            : _formatTerQtdDisplay(falta);
        return '<tr>'
            + '<td>' + escapeHtml(String(item.n_item != null ? item.n_item : '')) + '</td>'
            + '<td>' + escapeHtml(String(item.codigo_ean || '')) + '</td>'
            + '<td>' + escapeHtml(String(item.codigo_produto_xml || '')) + '</td>'
            + '<td>' + escapeHtml(String(item.descricao_xml || '')) + '</td>'
            + '<td style="text-align:right">' + escapeHtml(_formatTerQtdDisplay(xml)) + '</td>'
            + '<td style="text-align:right">' + escapeHtml(_formatTerQtdDisplay(bip)) + '</td>'
            + '<td style="text-align:right">' + escapeHtml(faltaTxt) + '</td>'
            + '<td>' + escapeHtml(st) + '</td>'
            + '</tr>';
    }).join('');
    var aviso = divergente
        ? '<p style="color:#e65100;font-weight:bold;">Comprovante divergente — há itens pendentes ou excedentes.</p>'
        : '<p style="color:#2e7d32;font-weight:bold;">Comprovante completo — todos os itens conferidos.</p>';
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comprovante descarga</title>'
        + '<style>body{font-family:Arial,sans-serif;padding:16px;font-size:13px}'
        + 'table{border-collapse:collapse;width:100%;margin-top:12px}'
        + 'th,td{border:1px solid #ccc;padding:6px}'
        + 'th{background:#f5f5f5;text-align:left}'
        + '</style></head><body>'
        + '<h2>Comprovante de descarga (terceiros)</h2>'
        + aviso
        + '<p><strong>NF:</strong> ' + escapeHtml(_terFormatarNfDoc(doc)) + ' &nbsp; <strong>Pedido:</strong> ' + escapeHtml(doc.numero_pedido || '-') + '</p>'
        + '<p><strong>Remetente:</strong> ' + escapeHtml(doc.remetente_nome || '-') + '</p>'
        + '<p><strong>Destinatário:</strong> ' + escapeHtml(doc.destinatario_nome || '-') + '</p>'
        + '<p><strong>Emitido em:</strong> ' + escapeHtml(agora) + (usuario ? (' &nbsp; <strong>Usuário:</strong> ' + escapeHtml(usuario)) : '') + '</p>'
        + '<table><thead><tr>'
        + '<th>Item</th><th>EAN</th><th>Cód. XML</th><th>Descrição</th><th>Qtd. XML</th><th>Qtd. bipada</th><th>Falta</th><th>Status</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>'
        + '</body></html>';
    var w = terceirosAbrirNovaJanela(
        { tipo: 'html', html: html },
        { titulo: 'Pop-up bloqueado — Gerar comprovante' }
    );
    if (!w) return;
    w.focus();
    try {
        w.print();
    } catch (e) { /* ignore */ }
}

async function gerarComprovanteTerceirosDocumento(documentoId, area, btn) {
    if (btn) btn.disabled = true;
    mostrarTerAcaoLoading(
        'Gerando comprovante…',
        'Carregando itens e dados da nota fiscal.'
    );
    try {
        var opts = {};
        var sig = terAcaoLoadingSignal();
        if (sig) opts.signal = sig;
        var doc = await fetchAPIComTimeout('/terceiros/documentos/' + encodeURIComponent(documentoId), opts, 55000);
        if (window._terAcaoLoadCancelado) return;
        if (!doc || doc.erro) {
            showMessage((doc && doc.erro) || 'Erro ao carregar NF para comprovante.', 'error');
            return;
        }
        imprimirComprovanteDescargaTerceirosDoc(doc);
    } catch (e) {
        if (_terAcaoFoiCancelado(e)) return;
        console.error(e);
        showMessage('Erro ao gerar comprovante.', 'error');
    } finally {
        fecharTerAcaoLoading();
        if (btn) btn.disabled = false;
    }
}

window.abrirModalComprovanteTerceirosDivergente = function() {
    var m = document.getElementById('modal-comprovante-terceiros-divergente');
    if (m) m.style.display = 'block';
};

window.fecharModalComprovanteTerceirosDivergente = function() {
    var m = document.getElementById('modal-comprovante-terceiros-divergente');
    if (m) m.style.display = 'none';
};

window.confirmarImprimirComprovanteTerceirosDivergente = function() {
    fecharModalComprovanteTerceirosDivergente();
    imprimirComprovanteDescargaTerceiros(true);
};

function _flushTerceirosAdd(itemId) {
    var documentoId = _terceirosDocumentoIdAtualParaApi();
    var key = String(itemId);
    if (!documentoId || !itemId) return;
    var entry = window._terceirosBipagemPending.adds[key];
    if (!entry || !entry.qtd || entry.qtd <= 0) return;
    var qtd = entry.qtd;
    var ean = (entry.codigo_ean || '').trim();
    delete window._terceirosBipagemPending.adds[key];
    if (window._terceirosBipagemPending.addTimers[key]) {
        clearTimeout(window._terceirosBipagemPending.addTimers[key]);
        delete window._terceirosBipagemPending.addTimers[key];
    }
    fetchAPI('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/bipar', {
        method: 'POST',
        body: JSON.stringify({ item_id: itemId, codigo_ean: ean, quantidade: qtd })
    }).then(function(resp) {
        if (resp && resp.ok) {
            if (qtd > 1) {
                showMessage('Registradas ' + qtd + ' unidades na bipagem.', 'success');
            } else {
                showMessage('Item bipado com sucesso.', 'success');
            }
            return loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, documentoId).then(function() {
                _terceirosFecharDescargaSeForaDaPendencia(documentoId);
                try { void loadTerceirosDocumentos(); } catch (e) { console.error(e); }
                try { void loadTerceirosFornecedoresRecebidos(); } catch (e2) { console.error(e2); }
                try { void loadTerceirosPendentesLancamento(); } catch (e3) { console.error(e3); }
                return refreshTerceirosViews();
            });
        }
        showMessage((resp && resp.erro) || 'Erro ao bipar item.', 'error');
        return loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, documentoId);
    }).catch(function() {
        showMessage('Erro ao bipar item.', 'error');
        return loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, documentoId);
    });
}

function _flushTerceirosRemove(itemId) {
    var documentoId = _terceirosDocumentoIdAtualParaApi();
    var key = String(itemId);
    if (!documentoId || !itemId) return;
    var n = window._terceirosBipagemPending.removes[key];
    if (n == null || n <= 0) return;
    delete window._terceirosBipagemPending.removes[key];
    if (window._terceirosBipagemPending.removeTimers[key]) {
        clearTimeout(window._terceirosBipagemPending.removeTimers[key]);
        delete window._terceirosBipagemPending.removeTimers[key];
    }
    fetchAPI('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/desbipar', {
        method: 'POST',
        body: JSON.stringify({ item_id: itemId, quantidade: n })
    }).then(function(resp) {
        if (resp && resp.ok) {
            showMessage(n + ' unidade(s) removida(s).', 'success');
            return loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, documentoId).then(function() {
                _terceirosFecharDescargaSeForaDaPendencia(documentoId);
                try { void loadTerceirosDocumentos(); } catch (e) { console.error(e); }
                try { void loadTerceirosFornecedoresRecebidos(); } catch (e2) { console.error(e2); }
                try { void loadTerceirosPendentesLancamento(); } catch (e3) { console.error(e3); }
                return refreshTerceirosViews();
            });
        }
        showMessage((resp && resp.erro) || 'Não foi possível remover.', 'error');
        return loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, documentoId);
    }).catch(function() {
        showMessage('Erro ao remover.', 'error');
        return loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, documentoId);
    });
}

window.biparItemTerceirosConferencia = function(btn, itemId, codigoEan, descricaoXml, qtdFaltaMax) {
    if (_terceirosDocumentoIdAtualParaApi() == null || _terceirosDocAtual.recebimento_concluido) return;
    var idNum = parseInt(itemId, 10);
    if (!idNum) return;
    var cb = document.getElementById('ter-codigo-barras-bipagem');
    var pn = document.getElementById('ter-bipagem-produto-hint');
    var cp = document.getElementById('ter-codigo-produto-bipagem');
    var qEl = document.getElementById('ter-bipagem-quantidade');
    if (cb) cb.value = '';
    var eanVal = (codigoEan && codigoEan !== '-') ? String(codigoEan).trim() : '';
    if (cb && eanVal) cb.value = eanVal;
    if (pn) pn.value = (descricaoXml || '').trim();
    if (qEl) qEl.value = '1';
    var row = btn && btn.closest ? btn.closest('tr') : null;
    var cells = row && row.cells && row.cells.length >= 12 ? row.cells : null;
    if (cells) {
        var xml = parseFloat(cells[5].textContent) || 0;
        var qBip = parseFloat(cells[9].textContent) || 0;
        var novoBip = qBip + 1;
        cells[9].textContent = _formatTerQtdDisplay(novoBip);
        _terSetCelulaFalta(cells[10], xml, novoBip);
        _terAtualizarBadgeELinha(row, xml, novoBip);
    }
    _terAtualizarSnapshotItem(idNum, 1);
    var eanEnvio = eanVal;
    if (!eanEnvio) {
        var it = (window._terceirosBipagemItens || []).filter(function(i) { return Number(i.id) === idNum; })[0];
        eanEnvio = it ? String(it.codigo_ean || '').trim() : '';
    }
    if (!eanEnvio) {
        showMessage('Item sem EAN no XML.', 'warning');
        var docIdEan = _terceirosDocumentoIdAtualParaApi();
        if (docIdEan) loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, docIdEan);
        return;
    }
    var key = String(idNum);
    if (!window._terceirosBipagemPending.adds[key]) {
        window._terceirosBipagemPending.adds[key] = { qtd: 0, codigo_ean: eanEnvio };
    }
    window._terceirosBipagemPending.adds[key].qtd += 1;
    if (window._terceirosBipagemPending.addTimers[key]) {
        clearTimeout(window._terceirosBipagemPending.addTimers[key]);
    }
    window._terceirosBipagemPending.addTimers[key] = setTimeout(function() {
        _flushTerceirosAdd(idNum);
    }, window._terceirosBipagemPending.DEBOUNCE_MS);
    if (cb) cb.focus();
};

/** Salva motivo (texto livre) da linha do item; persistência via API ao sair do campo. */
window.salvarMotivoItemTerceiros = async function(inputEl) {
    if (!inputEl || inputEl.disabled) return;
    var docId = _terceirosDocumentoIdAtualParaApi();
    var itemId = parseInt(inputEl.getAttribute('data-item-id') || '0', 10);
    if (docId == null || !itemId) return;
    var motivo = (inputEl.value || '').trim();
    try {
        var resp = await fetchAPI('/terceiros/documentos/' + encodeURIComponent(docId) + '/item-motivo', {
            method: 'POST',
            body: JSON.stringify({ item_id: itemId, motivo: motivo })
        });
        if (resp && resp.ok) {
            var itens = window._terceirosBipagemItens || [];
            for (var i = 0; i < itens.length; i++) {
                if (Number(itens[i].id) === itemId) {
                    itens[i].motivo = motivo;
                    break;
                }
            }
        } else {
            showMessage((resp && resp.erro) || 'Não foi possível salvar o motivo.', 'error');
        }
    } catch (e) {
        showMessage('Erro ao salvar o motivo.', 'error');
    }
};

window.tirarBipadoTerceiros = async function(btn, itemId, quantidade) {
    var docIdApi = _terceirosDocumentoIdAtualParaApi();
    if (docIdApi == null || _terceirosDocAtual.recebimento_concluido) return;
    var idNum = parseInt(itemId, 10);
    if (!idNum) return;
    var cb = document.getElementById('ter-codigo-barras-bipagem');
    if (cb) cb.value = '';
    var row = btn && btn.closest ? btn.closest('tr') : null;
    var cells = row && row.cells && row.cells.length >= 12 ? row.cells : null;
    var qtdParam = quantidade === 'tudo' || quantidade === 'all' ? 'tudo' : (parseInt(quantidade, 10) || 1);

    if (qtdParam === 'tudo') {
        if (!confirm('Remover todas as unidades bipadas deste item?')) return;
        if (cells) {
            var xml = parseFloat(cells[5].textContent) || 0;
            cells[9].textContent = _formatTerQtdDisplay(0);
            _terSetCelulaFalta(cells[10], xml, 0);
            _terAtualizarBadgeELinha(row, xml, 0);
        }
        var snap = (window._terceirosBipagemItens || []).filter(function(i) { return Number(i.id) === idNum; })[0];
        if (snap) snap.quantidade_bipada = 0;
        atualizarResumoTotaisBipagemTerceiros();
        try {
            var resp = await fetchAPI('/terceiros/documentos/' + encodeURIComponent(docIdApi) + '/desbipar', {
                method: 'POST',
                body: JSON.stringify({ item_id: idNum, quantidade: 'tudo' })
            });
            if (resp && resp.ok) {
                showMessage('Item atualizado.', 'success');
            } else {
                showMessage((resp && resp.erro) || 'Não foi possível remover.', 'error');
            }
        } catch (e) {
            showMessage('Erro ao remover.', 'error');
        }
        await loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, docIdApi);
        await refreshTerceirosViews();
        return;
    }

    if (cells) {
        var qBip = parseFloat(cells[9].textContent) || 0;
        var xml2 = parseFloat(cells[5].textContent) || 0;
        if (qBip <= 1e-9) return;
        var novoBip = Math.max(0, qBip - 1);
        cells[9].textContent = _formatTerQtdDisplay(novoBip);
        _terSetCelulaFalta(cells[10], xml2, novoBip);
        _terAtualizarBadgeELinha(row, xml2, novoBip);
    }
    _terAtualizarSnapshotItem(idNum, -1);
    var key = String(idNum);
    window._terceirosBipagemPending.removes[key] = (window._terceirosBipagemPending.removes[key] || 0) + 1;
    if (window._terceirosBipagemPending.removeTimers[key]) {
        clearTimeout(window._terceirosBipagemPending.removeTimers[key]);
    }
    window._terceirosBipagemPending.removeTimers[key] = setTimeout(function() {
        _flushTerceirosRemove(idNum);
    }, window._terceirosBipagemPending.DEBOUNCE_MS);
};

window.zerarBipagemTerceirosDocumento = async function() {
    var docIdZ = _terceirosDocumentoIdAtualParaApi();
    if (docIdZ == null || _terceirosDocAtual.recebimento_concluido) return;
    if (!confirm('Zerar todos os itens bipados desta nota?')) return;
    _limparPendenciasBipagemTerceiros();
    try {
        var resp = await fetchAPI('/terceiros/documentos/' + encodeURIComponent(docIdZ) + '/zerar-bipagem', {
            method: 'POST',
            body: JSON.stringify({})
        });
        if (resp && resp.ok) {
            showMessage('Bipagem zerada.', 'success');
            await loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, docIdZ);
            await refreshTerceirosViews();
        } else {
            showMessage((resp && resp.erro) || 'Erro ao zerar.', 'error');
        }
    } catch (e) {
        showMessage('Erro ao zerar.', 'error');
    }
};

var _terceirosDetalhePrefetchPromises = {};

function _terceirosUrlDocumentoDetalhe(documentoId) {
    return '/terceiros/documentos/' + encodeURIComponent(documentoId) + '?sem_eventos=1';
}

function _terceirosBuscarRowNoCache(documentoId) {
    var idStr = String(documentoId);
    var pend = window._terceirosPendenciaRowsCache;
    if (Array.isArray(pend)) {
        for (var i = 0; i < pend.length; i++) {
            if (pend[i] && String(pend[i].id) === idStr) return pend[i];
        }
    }
    var hit = _terceirosObterCacheLista();
    if (hit && Array.isArray(hit.rows)) {
        for (var j = 0; j < hit.rows.length; j++) {
            if (hit.rows[j] && String(hit.rows[j].id) === idStr) return hit.rows[j];
        }
    }
    return null;
}

function _terceirosTemBipagemPendenteLocal() {
    var p = window._terceirosBipagemPending;
    if (!p) return false;
    if (Object.keys(p.adds || {}).length || Object.keys(p.removes || {}).length) return true;
    if (Object.keys(p.addTimers || {}).length || Object.keys(p.removeTimers || {}).length) return true;
    return false;
}

function _terceirosIniciarPrefetchDetalhe(documentoId) {
    var id = parseInt(documentoId, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    if (_terceirosDetalhePrefetchPromises[id]) return;
    _terceirosDetalhePrefetchPromises[id] = fetchAPIComTimeout(_terceirosUrlDocumentoDetalhe(id), {}, 55000)
        .catch(function() {
            delete _terceirosDetalhePrefetchPromises[id];
            return null;
        });
}

async function _terceirosFetchDocumentoDetalhe(documentoId, fetchOpts) {
    var id = parseInt(documentoId, 10);
    var pref = _terceirosDetalhePrefetchPromises[id];
    if (pref) {
        delete _terceirosDetalhePrefetchPromises[id];
        return pref;
    }
    return fetchAPIComTimeout(_terceirosUrlDocumentoDetalhe(id), fetchOpts || {}, 55000);
}

function _terceirosAplicarResumoRapidoDetalhe(row) {
    if (!row) return;
    var prefixo = getTerceirosPrefixo();
    var qXml = parseFloat(row.quantidade_total_xml) || 0;
    var qBip = parseFloat(row.quantidade_total_bipada) || 0;
    var pend = parseInt(row.itens_divergentes, 10);
    if (!Number.isFinite(pend)) pend = 0;
    var elXml = document.getElementById(prefixo + '-stat-qtd-xml');
    var elBip = document.getElementById(prefixo + '-stat-qtd-bipada');
    var elPend = document.getElementById(prefixo + '-stat-pendencias');
    if (elXml) elXml.textContent = _formatTerQtdDisplay(qXml);
    if (elBip) elBip.textContent = _formatTerQtdDisplay(qBip);
    if (elPend) elPend.textContent = String(pend);
}

function _terceirosAplicarCabecalhoDetalheUi(doc, area) {
    if (!doc) return;
    var prefixo = getTerceirosPrefixo();
    var vazio = document.getElementById('ter-recebimento-detalhe-vazio');
    var detalhe = document.getElementById('ter-recebimento-detalhe');
    if (vazio) vazio.style.display = 'none';
    if (detalhe) detalhe.style.display = 'block';
    var btnVoltarLista = document.getElementById('btn-ter-voltar-lista-nf');
    if (btnVoltarLista) btnVoltarLista.style.display = 'inline-block';
    var hidId = document.getElementById('ter-rec-documento-id');
    if (hidId && doc.id != null) hidId.value = String(doc.id);
    var statNf = document.getElementById(prefixo + '-stat-nf');
    var pedido = document.getElementById(prefixo + '-pedido');
    if (statNf) statNf.textContent = (doc.numero_nf || '-') + (doc.serie_nf ? ('/' + doc.serie_nf) : '');
    if (pedido) pedido.textContent = doc.numero_pedido || '-';
    var remetente = document.getElementById(prefixo + '-remetente');
    var destinatario = document.getElementById(prefixo + '-destinatario');
    var destinatarioUf = document.getElementById(prefixo + '-destinatario-uf');
    var previsao = document.getElementById(prefixo + '-previsao');
    if (remetente) remetente.textContent = doc.remetente_nome || '-';
    if (destinatario) destinatario.textContent = doc.destinatario_nome || '-';
    if (destinatarioUf) destinatarioUf.textContent = doc.destinatario_uf || '-';
    if (previsao) previsao.textContent = doc.previsao_chegada || '-';
    var motCarreta = document.getElementById(prefixo + '-motorista-carreta');
    var plaCarreta = document.getElementById(prefixo + '-placa-carreta');
    if (motCarreta) motCarreta.textContent = doc.motorista_carreta || '-';
    if (plaCarreta) plaCarreta.textContent = doc.placa_carreta || '-';
    var elDocId = document.getElementById('ter-rec-doc-id-display');
    if (elDocId) elDocId.textContent = doc.id != null ? String(doc.id) : '—';
    var elOrigem = document.getElementById('ter-rec-origem-badge');
    var areaDoc = doc.area || area || 'recebimento';
    if (elOrigem) {
        if (areaDoc === 'carreta') {
            elOrigem.style.display = 'inline-block';
            elOrigem.textContent = 'Carreta';
            elOrigem.className = 'ter-origem-badge ter-origem-badge--carreta';
        } else {
            elOrigem.style.display = 'none';
            elOrigem.textContent = '';
            elOrigem.className = 'ter-origem-badge';
        }
    }
    var rc = isTerceirosFlagSim(doc.recebimento_concluido);
    preencherMetaTerceiros(prefixo, 'concluido-meta', rc ? 'Concluído' : '', doc.recebimento_concluido_por || '', doc.recebimento_concluido_em || '');
    atualizarBotaoConclusaoTerceiros(prefixo, rc);
    _terceirosAplicarResumoRapidoDetalhe(doc);
}

async function loadTerceirosDocumentoDetalhe(area, documentoId, opcoes) {
    opcoes = opcoes || {};
    if (area !== 'expedicao' && area !== 'carreta') area = 'recebimento';
    var idAlvo = parseInt(documentoId, 10);
    if (isNaN(idAlvo)) return;
    if (terceirosDescargaFoiCancelado() || window._terAcaoLoadCancelado) return;

    var seq = (window._terceirosDetalheCargaSeq = (window._terceirosDetalheCargaSeq || 0) + 1);
    var docAnterior = _terceirosDocAtual.id;
    var mudouDocumento = docAnterior == null || Number(docAnterior) !== idAlvo;

    const vazio = document.getElementById('ter-recebimento-detalhe-vazio');
    const detalhe = document.getElementById('ter-recebimento-detalhe');
    const tbody = document.getElementById('ter-tbody-recebimento-itens');
    var rowCache = _terceirosBuscarRowNoCache(idAlvo);

    if (mudouDocumento) {
        if (vazio) vazio.style.display = 'none';
        if (detalhe) detalhe.style.display = 'block';
        var btnVoltarListaLoad = document.getElementById('btn-ter-voltar-lista-nf');
        if (btnVoltarListaLoad) btnVoltarListaLoad.style.display = 'inline-block';
        if (rowCache) {
            _terceirosAplicarCabecalhoDetalheUi(rowCache, area);
            if (opcoes.descargaLoad) fecharModalCarregandoDescargaTerceiros();
        }
        var idAntNum = docAnterior != null && docAnterior !== '' ? Number(docAnterior) : NaN;
        var vaiFlush = Number.isFinite(idAntNum) && idAntNum > 0 && _terceirosTemBipagemPendenteLocal();
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="12" class="loading">' + (vaiFlush
                ? 'Salvando bipagens pendentes…'
                : 'Carregando itens da NF…') + '</td></tr>';
        }
    } else if (tbody && (opcoes.acaoLoad || opcoes.descargaLoad)) {
        if (rowCache) _terceirosAplicarCabecalhoDetalheUi(rowCache, area);
        if (opcoes.descargaLoad) fecharModalCarregandoDescargaTerceiros();
        tbody.innerHTML = '<tr><td colspan="12" class="loading">Carregando itens da NF…</td></tr>';
    }

    if (terceirosDescargaFoiCancelado() || window._terAcaoLoadCancelado) return;

    var doc;
    var fetchOpts = {};
    var sigDescarga = opcoes.descargaLoad ? terceirosDescargaAbortSignal() : null;
    var sigAcao = opcoes.acaoLoad ? terAcaoLoadingSignal() : null;
    if (sigDescarga) fetchOpts.signal = sigDescarga;
    else if (sigAcao) fetchOpts.signal = sigAcao;

    var idAntFlush = docAnterior != null && docAnterior !== '' ? Number(docAnterior) : NaN;
    var precisaFlush = mudouDocumento && Number.isFinite(idAntFlush) && idAntFlush > 0 && _terceirosTemBipagemPendenteLocal();
    var flushP = null;
    if (precisaFlush) {
        flushP = _flushTerceirosPendingDocumento(idAntFlush).then(function() {
            _limparPendenciasBipagemTerceiros();
        }).catch(function(e) {
            if (_terceirosErroDescargaCancelada(e)) throw e;
            console.error(e);
        });
    } else if (mudouDocumento) {
        _limparPendenciasBipagemTerceiros();
    }
    var fetchP = _terceirosFetchDocumentoDetalhe(idAlvo, fetchOpts);
    try {
        if (flushP) {
            var par = await Promise.all([flushP, fetchP]);
            doc = par[1];
        } else {
            doc = await fetchP;
        }
    } catch (err) {
        if (_terceirosErroDescargaCancelada(err) || _terAcaoFoiCancelado(err)) throw err;
        console.error(err);
        doc = null;
    }
    if (seq !== window._terceirosDetalheCargaSeq || terceirosDescargaFoiCancelado() || window._terAcaoLoadCancelado) return;

    if (!doc || doc.erro) {
        var msgErro = (doc && doc.erro) ? String(doc.erro) : 'Erro ao carregar.';
        if (tbody) {
            if (mudouDocumento) {
                tbody.innerHTML = '<tr><td colspan="12" class="loading">' + escapeHtml(msgErro) + '</td></tr>';
            }
        }
        if (!mudouDocumento) {
            showMessage(msgErro, 'error');
        }
        return;
    }
    _terceirosDocAtual = Object.assign({}, _terceirosDocAtual || {}, doc, {
        id: doc.id,
        area: doc.area || area,
        recebimento_concluido: isTerceirosFlagSim(doc.recebimento_concluido)
    });
    _terceirosAplicarCabecalhoDetalheUi(doc, area);
    if (opcoes.descargaLoad) fecharModalCarregandoDescargaTerceiros();

    if (!tbody) return;
    if (seq !== window._terceirosDetalheCargaSeq) return;

    const itens = Array.isArray(doc.itens) ? doc.itens : [];
    var motivosAntes = {};
    if (tbody) {
        tbody.querySelectorAll('input.input-motivo-terceiros-nf').forEach(function(inp) {
            var tr = inp.closest('tr');
            var iid = tr && tr.getAttribute('data-ter-item-id');
            if (iid) motivosAntes[iid] = inp.value;
        });
    }
    window._terceirosBipagemItens = itens.map(function(item) {
        return {
            id: item.id,
            n_item: item.n_item,
            codigo_ean: item.codigo_ean,
            codigo_produto_xml: item.codigo_produto_xml,
            descricao_xml: item.descricao_xml,
            unidade_xml: item.unidade_xml,
            quantidade_xml: item.quantidade_xml,
            quantidade_bipada: item.quantidade_bipada,
            motivo: item.motivo || ''
        };
    });
    atualizarResumoTotaisBipagemTerceiros();
    atualizarUIBipagemTerceiros(doc);
    _terceirosSincronizarCampoEnviarMgDetalhe();
    _terceirosSincronizarCampoRecebidaMgDetalhe();
    _persistirTerceirosDocumentoNaSessao(doc.id, _terceirosDocAtual.area);
    if (_terceirosTabAtual === 'pendencia-recebimento') {
        _terceirosFecharDescargaSeForaDaPendencia(doc.id);
    }
    if (!itens.length) {
        tbody.innerHTML = '<tr><td colspan="12" class="loading">Nenhum item encontrado no XML.</td></tr>';
        return;
    }
    var bloqueado = !!doc.recebimento_concluido;
    if (seq !== window._terceirosDetalheCargaSeq) return;
    tbody.innerHTML = itens.map(function(item) {
        var baseEncontrada = item.codigo_produto_base || item.descricao_base;
        var avisoHtml = baseEncontrada
            ? '<span style="color:#2e7d32;font-weight:600;">Cadastro local</span>'
            : '<span style="color:#c62828;font-weight:600;">Sem cadastro</span>';
        var qXml = parseFloat(item.quantidade_xml) || 0;
        var qBip = parseFloat(item.quantidade_bipada) || 0;
        var falta = Math.max(0, qXml - qBip);
        var qtdFaltaParaBipar = Math.max(1, falta);
        var codigoBarras = item.codigo_ean || '-';
        var codigoBarrasEscapado = (codigoBarras !== '-' ? codigoBarras.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '');
        var produtoEscapado = (item.descricao_xml || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        var podeAcoes = !bloqueado && codigoBarras !== '-';
        var semBip = qBip <= 1e-9;
        var botoesTirar = podeAcoes
            ? ('<button type="button" class="btn btn-secondary" ' + (semBip ? 'disabled ' : '') + 'data-ter-acao="tirar-1" data-ter-item-id="' + item.id + '" style="padding: 4px 8px; font-size: 11px;" title="Remover 1 unidade bipada">➖ Tirar 1</button>'
                + '<button type="button" class="btn btn-secondary" ' + (semBip ? 'disabled ' : '') + 'data-ter-acao="tirar-tudo" data-ter-item-id="' + item.id + '" style="padding: 4px 8px; font-size: 11px;" title="Remover todas as unidades bipadas deste item">🗑️ Tirar tudo</button>')
            : '';
        var btnBipar = (!bloqueado && codigoBarras !== '-')
            ? ('<button type="button" class="btn btn-primary" onclick="biparItemTerceirosConferencia(this, ' + item.id + ', \'' + codigoBarrasEscapado + '\', \'' + produtoEscapado + '\', ' + qtdFaltaParaBipar + ')" style="padding: 6px 12px; font-size: 12px;">📱 Bipar</button>')
            : (falta > 1e-9 ? '<span style="color: #ff9800;" title="Sem EAN no XML para este item.">⚠️ Sem código de barras</span>' : '');
        var acoesWrap = '<div class="ter-conf-acoes-celula">' + btnBipar + botoesTirar + '</div>';
        var st = item.status_bipagem || _statusBipagemTerLocais(qXml, qBip);
        var pack = _terConferenciaBadgeEClasseLinha(st);
        var motTexto = (item.motivo != null && String(item.motivo) !== '') ? String(item.motivo) : (Object.prototype.hasOwnProperty.call(motivosAntes, String(item.id)) ? motivosAntes[String(item.id)] : '');
        var motAttr = String(motTexto).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<tr class="' + pack.rowClass + '" data-ter-item-id="' + item.id + '">'
            + '<td><span class="status-badge ' + pack.badgeClass + '">' + pack.badgeText + '</span></td>'
            + '<td><input type="text" class="input-motivo-terceiros-nf" data-item-id="' + item.id + '" value="' + motAttr + '" placeholder="Motivo" ' + (bloqueado ? 'disabled ' : '') + 'onblur="salvarMotivoItemTerceiros(this)" title="Motivo (opcional) — salva ao sair do campo"></td>'
            + '<td><strong>' + escapeHtml(item.codigo_ean || '-') + '</strong></td>'
            + '<td><strong style="color: #1976D2;">' + escapeHtml(item.codigo_produto_xml || '-') + '</strong></td>'
            + '<td>' + escapeHtml(item.descricao_xml || '-') + '</td>'
            + '<td><strong>' + escapeHtml(_formatTerQtdDisplay(item.quantidade_xml || 0)) + '</strong></td>'
            + '<td>' + escapeHtml(item.unidade_xml || '-') + '</td>'
            + '<td>—</td>'
            + '<td>' + avisoHtml + '</td>'
            + '<td><strong style="color: ' + (qBip > 1e-9 ? '#4caf50' : '#666') + ';">' + escapeHtml(_formatTerQtdDisplay(item.quantidade_bipada || 0)) + '</strong></td>'
            + '<td>' + _terHtmlCelulaFalta(qXml, qBip) + '</td>'
            + '<td style="max-width: 280px;">' + acoesWrap + '</td>'
            + '</tr>';
    }).join('');
    tbody.querySelectorAll('tr').forEach(function(r, index) {
        r.style.opacity = '0';
        window.setTimeout(function() {
            r.style.transition = 'opacity 0.3s';
            r.style.opacity = '1';
        }, index * 20);
    });
}

function encontrarItensTerceirosParaBipar(codigo) {
    codigo = normalizarCodigoBarrasDuplicado(String(codigo || '').trim());
    if (!codigo) return [];
    var itens = window._terceirosBipagemItens || [];
    var matched = itens.filter(function(item) {
        var ean = normalizarCodigoBarrasDuplicado(String(item.codigo_ean || '').trim());
        return ean === codigo;
    });
    return matched.sort(function(a, b) {
        var fa = Math.max(0, (parseFloat(a.quantidade_xml) || 0) - (parseFloat(a.quantidade_bipada) || 0));
        var fb = Math.max(0, (parseFloat(b.quantidade_xml) || 0) - (parseFloat(b.quantidade_bipada) || 0));
        if (fa > 1e-9 && fb <= 1e-9) return -1;
        if (fa <= 1e-9 && fb > 1e-9) return 1;
        return (Number(a.n_item) || 0) - (Number(b.n_item) || 0);
    });
}

function encontrarItensTerceirosParaBiparPorCodigoProduto(cod) {
    cod = String(cod || '').trim().toLowerCase();
    if (!cod) return [];
    var matched = (window._terceirosBipagemItens || []).filter(function(item) {
        var cp = String(item.codigo_produto_xml || '').trim().toLowerCase();
        return cp === cod;
    });
    return matched.sort(function(a, b) {
        var fa = Math.max(0, (parseFloat(a.quantidade_xml) || 0) - (parseFloat(a.quantidade_bipada) || 0));
        var fb = Math.max(0, (parseFloat(b.quantidade_xml) || 0) - (parseFloat(b.quantidade_bipada) || 0));
        if (fa > 1e-9 && fb <= 1e-9) return -1;
        if (fa <= 1e-9 && fb > 1e-9) return 1;
        return (Number(a.n_item) || 0) - (Number(b.n_item) || 0);
    });
}

function preencherBipagemTerceirosPorItemId(itemId) {
    var itens = window._terceirosBipagemItens || [];
    var item = itens.filter(function(i) { return Number(i.id) === Number(itemId); })[0];
    if (!item) return;
    var c = document.getElementById('ter-codigo-barras-bipagem');
    var h = document.getElementById('ter-bipagem-produto-hint');
    var cp = document.getElementById('ter-codigo-produto-bipagem');
    if (c) c.value = String(item.codigo_ean || '').trim();
    if (h) h.value = String(item.descricao_xml || '').trim();
    if (cp) cp.value = String(item.codigo_produto_xml || '').trim();
    var q = document.getElementById('ter-bipagem-quantidade');
    if (q) q.value = '1';
    if (c) c.focus();
}

function limparCamposBipagemTerceiros(focar) {
    if (focar === undefined) focar = true;
    var c = document.getElementById('ter-codigo-barras-bipagem');
    var h = document.getElementById('ter-bipagem-produto-hint');
    var cp = document.getElementById('ter-codigo-produto-bipagem');
    var q = document.getElementById('ter-bipagem-quantidade');
    var ve = document.getElementById('ter-bipagem-veiculo');
    var st = document.getElementById('ter-bipagem-status');
    if (c) c.value = '';
    if (h) h.value = '';
    if (cp) cp.value = '';
    if (q) q.value = '1';
    if (ve) ve.value = '';
    if (st) st.value = 'PENDENTE';
    if (focar && c) c.focus();
}

function atualizarUIBipagemTerceiros(doc) {
    var concluido = !!(doc && doc.recebimento_concluido);
    var msg = document.getElementById('ter-bipagem-msg-concluido');
    var fin = document.getElementById('btn-ter-finalizar-descarga');
    var zer = document.getElementById('btn-ter-zerar-bipagem');
    if (msg) msg.style.display = concluido ? 'block' : 'none';
    if (fin) {
        if (!doc) fin.style.display = 'none';
        else fin.style.display = concluido ? 'none' : '';
    }
    if (zer) {
        if (!doc || concluido) {
            zer.style.display = 'none';
        } else {
            var temBip = false;
            var arr = window._terceirosBipagemItens || [];
            for (var zi = 0; zi < arr.length; zi++) {
                if ((parseFloat(arr[zi].quantidade_bipada) || 0) > 1e-9) {
                    temBip = true;
                    break;
                }
            }
            zer.style.display = temBip ? 'inline-block' : 'none';
        }
    }
    var desabilitar = concluido || !doc;
    ['ter-codigo-barras-bipagem', 'ter-codigo-produto-bipagem', 'ter-bipagem-quantidade', 'ter-bipagem-produto-hint', 'ter-bipagem-veiculo', 'ter-bipagem-status'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.disabled = desabilitar;
    });
    var sub = document.getElementById('btn-ter-bipagem-executar');
    var lim = document.getElementById('btn-ter-bipagem-limpar');
    if (sub) sub.disabled = desabilitar;
    if (lim) lim.disabled = desabilitar;
    if (zer) zer.disabled = desabilitar;
}

function _terAtualizarLinhaBipagemOtimista(itemId, deltaBip) {
    var tbody = document.getElementById('ter-tbody-recebimento-itens');
    if (!tbody) return;
    var row = tbody.querySelector('tr[data-ter-item-id="' + itemId + '"]');
    if (!row || !row.cells || row.cells.length < 12) return;
    var xml = parseFloat(row.cells[5].textContent) || 0;
    var qBip = parseFloat(row.cells[9].textContent) || 0;
    var novoBip = qBip + (parseFloat(deltaBip) || 0);
    row.cells[9].textContent = _formatTerQtdDisplay(novoBip);
    _terSetCelulaFalta(row.cells[10], xml, novoBip);
    _terAtualizarBadgeELinha(row, xml, novoBip);
}

async function executarBipagemTerceirosCentral() {
    if (_terceirosDocumentoIdAtualParaApi() == null) {
        showMessage('Selecione uma nota.', 'warning');
        return;
    }
    if (_terceirosDocAtual.recebimento_concluido) {
        showMessage('Recebimento já concluído.', 'warning');
        return;
    }
    var cEl = document.getElementById('ter-codigo-barras-bipagem');
    var cpEl = document.getElementById('ter-codigo-produto-bipagem');
    var qEl = document.getElementById('ter-bipagem-quantidade');
    var codigo = cEl ? normalizarCodigoBarrasDuplicado((cEl.value || '').trim()) : '';
    var codProd = cpEl ? String(cpEl.value || '').trim() : '';
    var qtdReq = qEl ? parseFloat(qEl.value) : 1;
    if (!qtdReq || qtdReq < 1 || isNaN(qtdReq)) qtdReq = 1;
    var candidatos = codigo ? encontrarItensTerceirosParaBipar(codigo) : [];
    if (!candidatos.length && codProd) {
        candidatos = encontrarItensTerceirosParaBiparPorCodigoProduto(codProd);
    }
    if (!codigo && !codProd) {
        showMessage('Informe o código de barras ou o código produto.', 'error');
        return;
    }
    if (!candidatos.length) {
        showMessage('Nenhum item desta nota com esse código.', 'warning');
        return;
    }
    var item = candidatos[0];
    var xml = parseFloat(item.quantidade_xml) || 0;
    var bip = parseFloat(item.quantidade_bipada) || 0;
    var falta = Math.max(0, xml - bip);
    var aplicar = falta > 1e-9 ? Math.min(qtdReq, falta) : qtdReq;
    if (aplicar < 0.0001) {
        return;
    }
    var eanEnvio = String(item.codigo_ean || '').trim() || codigo;
    if (!eanEnvio) {
        showMessage('Item sem EAN no XML; não é possível bipar.', 'warning');
        return;
    }
    _terAtualizarSnapshotItem(item.id, aplicar);
    _terAtualizarLinhaBipagemOtimista(item.id, aplicar);
    var key = String(item.id);
    if (!window._terceirosBipagemPending.adds[key]) {
        window._terceirosBipagemPending.adds[key] = { qtd: 0, codigo_ean: eanEnvio };
    }
    window._terceirosBipagemPending.adds[key].qtd += aplicar;
    if (window._terceirosBipagemPending.addTimers[key]) {
        clearTimeout(window._terceirosBipagemPending.addTimers[key]);
    }
    window._terceirosBipagemPending.addTimers[key] = setTimeout(function() {
        _flushTerceirosAdd(item.id);
    }, window._terceirosBipagemPending.DEBOUNCE_MS);
    limparCamposBipagemTerceiros(true);
}

async function finalizarDescargaTerceiros() {
    if (_terceirosDocumentoIdAtualParaApi() == null) {
        showMessage('Selecione uma nota.', 'warning');
        return;
    }
    if (_terceirosDocAtual.recebimento_concluido) return;
    if (_terceirosRecebimentoConcluindo) {
        showMessage('Conclusão de recebimento em curso. Aguarde.', 'warning');
        return;
    }
    var fin = document.getElementById('btn-ter-finalizar-descarga');
    if (fin) {
        fin.disabled = true;
        fin.dataset.terFinDescLabel = fin.dataset.terFinDescLabel || fin.textContent || '';
        fin.textContent = 'A guardar…';
    }
    try {
        await concluirRecebimentoTerceirosPelaDescarga(fin, { irFornecedores: true });
    } finally {
        if (fin) {
            fin.disabled = false;
            fin.textContent = fin.dataset.terFinDescLabel || 'Finalizar descarga';
        }
    }
}

function initTerceirosBipagemForm() {
    var form = document.getElementById('form-ter-bipagem');
    if (form && !form.dataset.terBipBound) {
        form.dataset.terBipBound = '1';
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            void executarBipagemTerceirosCentral();
        });
    }
    var lim = document.getElementById('btn-ter-bipagem-limpar');
    if (lim && !lim.dataset.terBipBound) {
        lim.dataset.terBipBound = '1';
        lim.addEventListener('click', function() { limparCamposBipagemTerceiros(true); });
    }
    var zer = document.getElementById('btn-ter-zerar-bipagem');
    if (zer && !zer.dataset.terBipBound) {
        zer.dataset.terBipBound = '1';
        zer.addEventListener('click', function() { void zerarBipagemTerceirosDocumento(); });
    }
    var fin = document.getElementById('btn-ter-finalizar-descarga');
    if (fin && !fin.dataset.terBipBound) {
        fin.dataset.terBipBound = '1';
        fin.addEventListener('click', function() { void finalizarDescargaTerceiros(); });
    }
    var cb = document.getElementById('ter-codigo-barras-bipagem');
    if (cb && !cb.dataset.terBipEnter) {
        cb.dataset.terBipEnter = '1';
        cb.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                void executarBipagemTerceirosCentral();
            }
        });
    }
    var cp = document.getElementById('ter-codigo-produto-bipagem');
    if (cp && !cp.dataset.terBipBlur) {
        cp.dataset.terBipBlur = '1';
        cp.addEventListener('blur', function() {
            var v = String(cp.value || '').trim().toLowerCase();
            if (!v || !_terceirosDocAtual.id) return;
            var lista = encontrarItensTerceirosParaBiparPorCodigoProduto(v);
            if (lista.length === 1) {
                preencherBipagemTerceirosPorItemId(lista[0].id);
            }
        });
    }
    atualizarUIBipagemTerceiros(null);
}

function _resolverIdDocumentoTerceirosParaStatus() {
    return _terceirosDocumentoIdAtualParaApi();
}

function _terceirosMontarDocumentoRecebidoLocal(documentoId, documentoApi) {
    var doc = Object.assign({}, _terceirosDocAtual || {}, documentoApi || {});
    doc.id = documentoId;
    doc.area = doc.area || (_terceirosDocAtual && _terceirosDocAtual.area) || 'recebimento';
    doc.recebimento_concluido = 'Sim';
    doc.recebimento_concluido_em = doc.recebimento_concluido_em || new Date().toLocaleString('pt-BR');
    var prefixo = getTerceirosPrefixo();
    var textoEl = function(id) {
        var el = document.getElementById(id);
        var txt = el ? String(el.textContent || '').trim() : '';
        return txt && txt !== '-' && txt !== '—' ? txt : '';
    };
    if (!doc.numero_nf) {
        var nfTela = textoEl(prefixo + '-stat-nf');
        if (nfTela) {
            var partesNf = nfTela.split('/');
            doc.numero_nf = (partesNf[0] || '').trim();
            if (!doc.serie_nf && partesNf.length > 1) doc.serie_nf = (partesNf[1] || '').trim();
        }
    }
    doc.numero_pedido = doc.numero_pedido || textoEl(prefixo + '-pedido');
    doc.remetente_nome = doc.remetente_nome || textoEl(prefixo + '-remetente');
    doc.destinatario_nome = doc.destinatario_nome || textoEl(prefixo + '-destinatario');
    doc.destinatario_uf = doc.destinatario_uf || textoEl(prefixo + '-destinatario-uf');
    doc.previsao_chegada = doc.previsao_chegada || textoEl(prefixo + '-previsao');
    doc.motorista_carreta = doc.motorista_carreta || textoEl(prefixo + '-motorista-carreta');
    doc.placa_carreta = doc.placa_carreta || textoEl(prefixo + '-placa-carreta');
    if (doc.nota_lancada == null) doc.nota_lancada = (_terceirosDocAtual && _terceirosDocAtual.nota_lancada) || '';
    if (doc.enviar_para_mg == null) doc.enviar_para_mg = (_terceirosDocAtual && _terceirosDocAtual.enviar_para_mg) || '';
    if (doc.carga_recebida_mg == null) doc.carga_recebida_mg = (_terceirosDocAtual && _terceirosDocAtual.carga_recebida_mg) || '';

    var itens = window._terceirosBipagemItens || [];
    if (itens.length) {
        var totalXml = 0;
        var totalBip = 0;
        var divergentes = 0;
        itens.forEach(function(item) {
            var xml = parseFloat(item.quantidade_xml) || 0;
            var bip = parseFloat(item.quantidade_bipada) || 0;
            totalXml += xml;
            totalBip += bip;
            if (Math.abs(xml - bip) > 0.000001) divergentes += 1;
        });
        doc.quantidade_total_xml = totalXml;
        doc.quantidade_total_bipada = totalBip;
        doc.itens_divergentes = divergentes;
    }
    return doc;
}

/**
 * Conclui recebimento: abre Fornecedores recebidos na hora (otimista) e grava no servidor em seguida.
 */
async function _terceirosExecutarConcluirRecebimento(documentoId, btnEl, opcoes) {
    opcoes = opcoes || {};
    var irParaFornecedores = opcoes.irFornecedores !== false;
    _terceirosPrepararBotaoRecebimentoSalvando(btnEl);
    _terceirosPausarTimersBipagemPendente();

    var docLocal = _terceirosMontarDocumentoRecebidoLocal(documentoId, null);
    _terceirosDocAtual = Object.assign({}, _terceirosDocAtual || {}, docLocal);

    if (irParaFornecedores) {
        await _terceirosAplicarUiAposRecebimentoConcluido(documentoId, docLocal, true);
    } else {
        aplicarMovimentoRecebimentoConcluidoLocal(documentoId, docLocal);
        definirDestaqueLinhaTerceirosDoc(documentoId);
        void atualizarAlertasTerceirosHeaderAposMudancaRecebimento();
        atualizarBotaoConclusaoTerceiros(getTerceirosPrefixo(), true);
        fecharTerAcaoLoading();
        showMessage('Recebimento concluído.', 'success');
    }

    var resp = await _postRecebimentoConcluidoTerceirosDireto(documentoId, 25000);
    if (window._terAcaoLoadCancelado) return;

    if (!_terceirosRespostaApiOk(resp)) {
        invalidateTerceirosListaCache();
        try {
            await recarregarTodasListasTerceiros();
        } catch (eRec) {
            console.error(eRec);
        }
        if (irParaFornecedores) {
            terceirosAplicarPainelAbaSomenteUi('pendencia-recebimento');
            resetTerceirosDetalhe();
        }
        showMessage(
            (resp && resp.erro) || 'Não foi possível gravar no servidor. A NF voltou para pendência — tente de novo.',
            'error'
        );
        return;
    }

    if (resp && resp.documento) {
        _terceirosDocAtual = Object.assign({}, _terceirosDocAtual || {}, resp.documento, {
            recebimento_concluido: isTerceirosFlagSim(resp.documento.recebimento_concluido)
        });
        aplicarMovimentoRecebimentoConcluidoLocal(documentoId, _terceirosDocAtual);
    }
    if (resp && resp.email_consumivel_sp && isTerceirosConsumivelSp(_terceirosDocAtual)) {
        var em = resp.email_consumivel_sp;
        if (em.enviado) {
            showMessage('E-mail enviado ao fiscal (consumível SP).', 'success');
        } else if (em.motivo === 'recebimento_ja_estava_concluido') {
            console.info('[terceiros] E-mail consumível SP não reenviado (recebimento já estava concluído).');
        } else if (em.motivo === 'smtp_nao_configurado' || em.motivo === 'smtp_sem_senha') {
            showMessage('Recebimento salvo, mas o servidor não tem SMTP configurado (Render: variáveis SMTP_*).', 'warning');
        } else if (em.motivo && em.motivo.indexOf('erro_smtp') === 0) {
            showMessage('Recebimento salvo, mas falhou o e-mail: ' + em.motivo.replace(/^erro_smtp:\s*/, ''), 'warning');
        }
    }
    void _flushTerceirosPendingDocumentoComLimiteTempo(documentoId, 3000).catch(function(eBg) {
        console.error(eBg);
    });
    if (!irParaFornecedores) return;
    void recarregarTodasListasTerceiros().catch(function(eRec) {
        console.error(eRec);
    });
    void atualizarAlertasTerceirosHeaderAposMudancaRecebimento();
}

async function _postRecebimentoConcluidoTerceirosDireto(documentoId, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = null;
    var timeoutPromise = new Promise(function(resolve) {
        timeoutId = window.setTimeout(function() {
            try {
                if (controller) controller.abort();
            } catch (e) {}
            resolve({ ok: false, erro: 'Tempo esgotado ao concluir recebimento.', _timeout: true });
        }, timeoutMs);
    });
    var requestPromise = fetch(API_BASE + '/terceiros/documentos/' + encodeURIComponent(documentoId) + '/status', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        keepalive: false,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campo: 'recebimento_concluido', valor: 'sim' }),
        signal: controller ? controller.signal : undefined
    }).then(function(response) {
        return Promise.race([
            response.json().catch(function() { return null; }),
            new Promise(function(resolve) {
                window.setTimeout(function() { resolve(null); }, 2000);
            })
        ]).then(function(data) {
            if (!data || typeof data !== 'object') {
                data = { ok: response.ok };
            }
            if (!response.ok && !data.erro) data.erro = 'HTTP ' + response.status;
            return data;
        });
    }).catch(function(error) {
        if (error && error.name === 'AbortError') {
            return { ok: false, erro: 'Tempo esgotado ao concluir recebimento.', _timeout: true };
        }
        console.error(error);
        return { ok: false, erro: 'Erro ao conectar com o servidor.' };
    });

    try {
        return await Promise.race([requestPromise, timeoutPromise]);
    } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
    }
}

async function concluirRecebimentoTerceirosPelaDescarga(fin, opcoes) {
    opcoes = opcoes || {};
    var documentoId = _resolverIdDocumentoTerceirosParaStatus();
    if (documentoId == null) {
        showMessage('Selecione uma nota.', 'warning');
        return;
    }
    if (isTerceirosFlagSim(_terceirosDocAtual.recebimento_concluido)) {
        atualizarBotaoConclusaoTerceiros(getTerceirosPrefixo(), true);
        return;
    }
    if (!opcoes._bipagemValidada) {
        opcoes._bipagemValidada = true;
        var okBip = await _terceirosValidarBipagemAntesConcluirRecebimento();
        if (!okBip) return;
    }
    if (!opcoes._confirmacaoRecebimento) {
        opcoes._confirmacaoRecebimento = true;
        if (opcoes.perguntarDestino === true) {
            var escolhaPre = await abrirModalConfirmarRecebimentoFornecedores();
            if (!escolhaPre) return;
            opcoes.irFornecedores = escolhaPre === 'ir';
        } else {
            opcoes.irFornecedores = opcoes.irFornecedores !== false;
        }
    }
    var irParaFornecedores = opcoes.irFornecedores !== false;
    if (_terceirosRecebimentoConcluindo) {
        showMessage('Conclusão de recebimento em curso. Aguarde.', 'warning');
        return;
    }
    _terceirosRecebimentoConcluindo = true;
    window._terAcaoLoadCancelado = false;
    try {
        await _terceirosExecutarConcluirRecebimento(documentoId, fin, { irFornecedores: irParaFornecedores });
    } finally {
        _terceirosRecebimentoConcluindo = false;
        fecharTerAcaoLoading();
        _terceirosRestaurarBotaoRecebimentoConcluido(fin);
    }
}

async function acionarRecebimentoConcluidoTerceirosDireto(btn) {
    if (_terceirosRecebimentoConcluindo) {
        showMessage('Conclusão de recebimento em curso. Aguarde.', 'warning');
        return;
    }
    try {
        await concluirRecebimentoTerceirosPelaDescarga(btn);
    } catch (e) {
        console.error(e);
        showMessage('Não foi possível concluir o recebimento.', 'error');
    }
}

async function atualizarStatusTerceiros(area, campo, valor, opcoes) {
    opcoes = opcoes || {};
    if (isTerceirosFlagNao(valor) && (campo === 'nota_lancada' || campo === 'enviar_para_mg' || campo === 'carga_recebida_mg') && !opcoes.motivo) {
        var motivoDet = await abrirModalMotivoFluxoTerceiros(campo);
        if (!motivoDet) {
            try {
                await recarregarTodasListasTerceiros();
            } catch (eM) {
                console.error(eM);
            }
            showMessage('Operação cancelada.', 'warning');
            return;
        }
        opcoes.motivo = motivoDet;
    }
    var prefixo = getTerceirosPrefixo();
    var btnConcluir = document.getElementById('btn-' + prefixo + '-concluir');
    var pedidoConclusaoRecebimento = campo === 'recebimento_concluido' && String(valor).toLowerCase() === 'sim';
    var irParaFornecedoresAposConcluir = true;
    if (pedidoConclusaoRecebimento) {
        if (_terceirosRecebimentoConcluindo) {
            showMessage('Conclusão de recebimento em curso. Aguarde.', 'warning');
            return;
        }
        if (isTerceirosFlagSim(_terceirosDocAtual.recebimento_concluido)) {
            return;
        }
        if (opcoes && opcoes.perguntarDestino === true) {
            var escolhaReceb = await abrirModalConfirmarRecebimentoFornecedores();
            if (!escolhaReceb) return;
            irParaFornecedoresAposConcluir = escolhaReceb === 'ir';
        } else {
            irParaFornecedoresAposConcluir = opcoes && opcoes.irFornecedores === false ? false : true;
        }
    }
    try {
        var documentoId = _resolverIdDocumentoTerceirosParaStatus();
        if (documentoId == null) {
            showMessage('Selecione uma nota (Ver detalhe ou Começar descarga) antes de marcar o recebimento como concluído.', 'warning');
            return;
        }
        if (campo === 'enviar_para_mg' && _terceirosDocAtual && isTerceirosAreaCarreta(_terceirosDocAtual)) {
            showMessage('NF de carreta não utiliza envio para MG. Conclua na 5ª aba — Notas lançadas.', 'warning');
            _terceirosSincronizarCampoEnviarMgDetalhe();
            return;
        }
        if (campo === 'enviar_para_mg' && _terceirosTabAtual !== 'pendencias-mg') {
            showMessage('O campo Enviado para MG só pode ser alterado na aba 6 — Pendências envio MG.', 'warning');
            _terceirosSincronizarCampoEnviarMgDetalhe();
            return;
        }
        if (campo === 'carga_recebida_mg' && _terceirosTabAtual !== 'recebimentos-mg' && !(opcoes && opcoes.forcar_fluxo_carreta)) {
            showMessage('O campo Recebida MG só pode ser alterado na aba 8 — Recebimentos de MG.', 'warning');
            _terceirosSincronizarCampoRecebidaMgDetalhe();
            return;
        }
        if (pedidoConclusaoRecebimento && !isTerceirosFlagSim(_terceirosDocAtual.recebimento_concluido)) {
            if (!opcoes._bipagemValidada) {
                opcoes._bipagemValidada = true;
                var okBipReceb = await _terceirosValidarBipagemAntesConcluirRecebimento();
                if (!okBipReceb) return;
            }
            _terceirosRecebimentoConcluindo = true;
            try {
                await _terceirosExecutarConcluirRecebimento(documentoId, btnConcluir, {
                    irFornecedores: irParaFornecedoresAposConcluir
                });
            } finally {
                _terceirosRecebimentoConcluindo = false;
                fecharTerAcaoLoading();
                _terceirosRestaurarBotaoRecebimentoConcluido(btnConcluir);
            }
            return;
        }
        try {
            try {
                await _flushTerceirosPendingDocumentoComLimiteTempo(documentoId, 8000);
            } catch (e) {
                console.error(e);
                showMessage(
                    e && e.message === 'TERCEIROS_FLUSH_TOTAL_TIMEOUT'
                        ? 'Demorou demais a guardar bipagens (limite 2 min). Atualize a página e tente de novo.'
                        : 'Não foi possível sincronizar a bipagem antes de concluir. Verifique a ligação e tente de novo.',
                    'error'
                );
                return;
            }
            opcoes = opcoes || {};
            if (isTerceirosFlagSim(valor) && campo === 'carga_recebida_mg' && !opcoes.forcar_fluxo_carreta && !opcoes.recebedor_mg) {
                var recebedorMgDetalhe = await abrirModalRecebedorMgTerceiros();
                if (!recebedorMgDetalhe) {
                    showMessage('Operação cancelada. Informe quem recebeu em MG para concluir.', 'warning');
                    await recarregarListaTerceirosTab(_terceirosTabAtual).catch(function(eR) { console.error(eR); });
                    return;
                }
                opcoes.recebedor_mg = recebedorMgDetalhe;
                _terceirosAtualizarRecebidaMgLocal(documentoId, 'sim', '', recebedorMgDetalhe);
            }
            var payload = {
                campo: campo,
                valor: valor,
                motivo: opcoes.motivo || '',
                recebedor_mg: opcoes.recebedor_mg || '',
                forcar_lancamento_sem_recebimento: !!opcoes.forcar_lancamento_sem_recebimento,
                forcar_fluxo_carreta: !!opcoes.forcar_fluxo_carreta
            };
            var rowLanc = {
                recebimento_concluido: _terceirosDocAtual.recebimento_concluido,
                quantidade_total_bipada: Math.max(
                    parseFloat(_terceirosDocAtual.quantidade_total_bipada) || 0,
                    _terceirosTotalBipadoItensLocais()
                )
            };
            if (campo === 'nota_lancada' && String(valor).toLowerCase() === 'sim' && !_terceirosPodeLancarNotaSemConfirmacaoRecebimento(rowLanc) && !payload.forcar_lancamento_sem_recebimento) {
                var confirmouLocal = await abrirModalLancamentoSemRecebimento();
                if (!confirmouLocal) {
                    showMessage('Lançamento cancelado. A nota segue sem recebimento confirmado.', 'warning');
                    try {
                        await recarregarListaTerceirosTab(_terceirosTabAtual);
                    } catch (e2) {
                        console.error(e2);
                    }
                    return;
                }
                payload.forcar_lancamento_sem_recebimento = true;
            }
            var resp = await fetchAPIComTimeout('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/status', {
                method: 'POST',
                body: JSON.stringify(payload),
                keepalive: false
            }, 35000);
            if (!_terceirosRespostaApiOk(resp)) {
                if (resp && resp.confirmacao_necessaria && campo === 'nota_lancada' && String(valor).toLowerCase() === 'sim' && !payload.forcar_lancamento_sem_recebimento) {
                    var confirmou = await abrirModalLancamentoSemRecebimento();
                    if (confirmou) {
                        await atualizarStatusTerceiros(area, campo, valor, { forcar_lancamento_sem_recebimento: true });
                        return;
                    }
                    showMessage('Lançamento cancelado. A nota segue sem recebimento confirmado.', 'warning');
                    try {
                        await recarregarListaTerceirosTab(_terceirosTabAtual);
                    } catch (e2) {
                        console.error(e2);
                    }
                    return;
                }
                showMessage((resp && resp.erro) || 'Erro ao atualizar status.', 'error');
                return;
            }
            var concluiuRecebimento = campo === 'recebimento_concluido' && String(valor).toLowerCase() === 'sim';
            if (concluiuRecebimento) {
                return;
            }
            if (campo === 'nota_lancada' && isTerceirosFlagSim(valor)) {
                await _terceirosAposConfirmarNotaLancadaSim(documentoId, resp && resp.documento, opcoes);
                return;
            }
            if (campo === 'nota_lancada' && isTerceirosFlagNao(valor)) {
                await _terceirosAposConfirmarNotaLancadaNao(documentoId, resp && resp.documento, opcoes);
                return;
            }
            if (campo === 'enviar_para_mg' && isTerceirosFlagSim(valor)) {
                await _terceirosAposConfirmarEnviarMgSim(documentoId, resp && resp.documento, opcoes);
                return;
            }
            if (campo === 'enviar_para_mg' && isTerceirosFlagNao(valor)) {
                await _terceirosAposConfirmarEnviarMgNao(documentoId, resp && resp.documento, opcoes);
                return;
            }
            if (campo === 'carga_recebida_mg' && isTerceirosFlagSim(valor) && opcoes.forcar_fluxo_carreta) {
                await _terceirosAposConcluirCarretaNoHistorico(documentoId, resp && resp.documento);
                return;
            }
            if (campo === 'carga_recebida_mg' && isTerceirosFlagSim(valor)) {
                await _terceirosAposConfirmarRecebidaMgSim(documentoId, resp && resp.documento, opcoes);
                return;
            }
            if (campo === 'carga_recebida_mg' && isTerceirosFlagNao(valor)) {
                await _terceirosAposConfirmarRecebidaMgNao(documentoId, resp && resp.documento, opcoes);
                return;
            }
            showMessage('Status atualizado.', 'success');
            var navegouFluxo = await moverDocumentoFluxoTerceirosAposStatus(documentoId, campo, valor);
            if (!navegouFluxo) {
                if (_terceirosDocAtual.id === documentoId) {
                    await loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, documentoId);
                }
                try {
                    await recarregarListaTerceirosTab(_terceirosTabAtual);
                } catch (e) {
                    console.error(e);
                }
            }
        } finally {
            if (pedidoConclusaoRecebimento) {
                _terceirosRecebimentoConcluindo = false;
            }
        }
    } catch (eOuter) {
        console.error(eOuter);
        throw eOuter;
    }
}

/** Fallback direto no HTML: funciona mesmo se initForms não registrou o listener. */
window.marcarRecebimentoConcluidoTerceiros = function() {
    void acionarRecebimentoConcluidoTerceirosDireto(document.getElementById('btn-ter-rec-concluir')).catch(function(e) {
        console.error(e);
        showMessage('Não foi possível concluir o recebimento.', 'error');
    });
};

async function salvarMotoristaTerceiros(area) {
    var documentoId = _terceirosDocumentoIdAtualParaApi();
    if (documentoId == null) return;
    if (!_terceirosPodeEditarMotoristaPlaca()) {
        showMessage('Motorista e placa só podem ser alterados nas abas Enviar XML e Pendências envio MG.', 'warning');
        return;
    }
    var prefixo = getTerceirosPrefixo();
    var input = document.getElementById(prefixo + '-motorista');
    var motorista = input ? input.value.trim() : '';
    if (!motorista) {
        showMessage('Digite o motorista da carreta.', 'warning');
        return;
    }
    var resp = await fetchAPI('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/motorista', {
        method: 'POST',
        body: JSON.stringify({ motorista: motorista })
    });
    if (!resp || !resp.ok) {
        showMessage((resp && resp.erro) || 'Erro ao salvar motorista.', 'error');
        return;
    }
    showMessage('Motorista salvo.', 'success');
    await loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, documentoId);
    await refreshTerceirosViews();
}

// Inicializar formulários
function initForms() {
    // Formulário de adicionar produto
    const formProduto = document.getElementById('form-produto');
    formProduto.addEventListener('submit', async (e) => {
        e.preventDefault();
        await addProduto();
    });
    const formProdutoDev = document.getElementById('form-produto-devolucao');
    if (formProdutoDev) {
        formProdutoDev.addEventListener('submit', async function(e) {
            e.preventDefault();
            await addProduto();
        });
    }
    
    // Formulário de editar produto
    const editForm = document.getElementById('edit-form');
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateProduto();
    });
    
    // Fechar modal ao clicar no X
    document.querySelector('.close').addEventListener('click', closeModal);

    const modalTerIrRecebMg = document.getElementById('modal-terceiros-ir-recebimentos-mg');
    const btnTerIrRecebMg = document.getElementById('btn-ter-ir-recebimentos-mg');
    const btnTerFicarPendMg = document.getElementById('btn-ter-ficar-pendencias-mg');
    const btnTerIrRecebMgClose = document.getElementById('modal-terceiros-ir-recebimentos-mg-close');
    if (btnTerIrRecebMg) btnTerIrRecebMg.addEventListener('click', function() { fecharModalIrParaRecebimentosMg(true); });
    if (btnTerFicarPendMg) btnTerFicarPendMg.addEventListener('click', function() { fecharModalIrParaRecebimentosMg(false); });
    if (btnTerIrRecebMgClose) btnTerIrRecebMgClose.addEventListener('click', function() { fecharModalIrParaRecebimentosMg(false); });

    const modalTerIrNotasLanc = document.getElementById('modal-terceiros-ir-notas-lancadas');
    const btnTerIrNotasLanc = document.getElementById('btn-ter-ir-notas-lancadas');
    const btnTerFicarPendLanc = document.getElementById('btn-ter-ficar-pendentes-lancamento');
    const btnTerIrNotasLancClose = document.getElementById('modal-terceiros-ir-notas-lancadas-close');
    if (btnTerIrNotasLanc) btnTerIrNotasLanc.addEventListener('click', function() { fecharModalIrParaNotasLancadas(true); });
    if (btnTerFicarPendLanc) btnTerFicarPendLanc.addEventListener('click', function() { fecharModalIrParaNotasLancadas(false); });
    if (btnTerIrNotasLancClose) btnTerIrNotasLancClose.addEventListener('click', function() { fecharModalIrParaNotasLancadas(false); });

    const modalTerConfForn = document.getElementById('modal-terceiros-confirmar-recebimento-fornecedores');
    const btnTerIrForn = document.getElementById('btn-ter-ir-fornecedores-recebidos');
    const btnTerFicarPendRec = document.getElementById('btn-ter-ficar-pendencia-recebimento');
    const btnTerConfFornClose = document.getElementById('modal-terceiros-confirmar-recebimento-fornecedores-close');
    if (btnTerIrForn) btnTerIrForn.addEventListener('click', function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        fecharModalConfirmarRecebimentoFornecedores('ir');
    });
    if (btnTerFicarPendRec) btnTerFicarPendRec.addEventListener('click', function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        fecharModalConfirmarRecebimentoFornecedores('ficar');
    });
    if (btnTerConfFornClose) btnTerConfFornClose.addEventListener('click', function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        fecharModalConfirmarRecebimentoFornecedores(false);
    });

    const modalTerSemReceb = document.getElementById('modal-terceiros-lancar-sem-recebimento');
    const btnTerSemRecebConfirmar = document.getElementById('btn-ter-confirmar-lancar-sem-recebimento');
    const btnTerSemRecebCancelar = document.getElementById('btn-ter-cancelar-lancar-sem-recebimento');
    const btnTerSemRecebClose = document.getElementById('modal-terceiros-lancar-sem-recebimento-close');
    if (btnTerSemRecebConfirmar) btnTerSemRecebConfirmar.addEventListener('click', function() { fecharModalLancamentoSemRecebimento(true); });
    if (btnTerSemRecebCancelar) btnTerSemRecebCancelar.addEventListener('click', function() { fecharModalLancamentoSemRecebimento(false); });
    if (btnTerSemRecebClose) btnTerSemRecebClose.addEventListener('click', function() { fecharModalLancamentoSemRecebimento(false); });

    const modalTerSemBip = document.getElementById('modal-terceiros-concluir-sem-bipagem-completa');
    const btnTerSemBipConfirmar = document.getElementById('btn-ter-confirmar-concluir-sem-bipagem');
    const btnTerSemBipCancelar = document.getElementById('btn-ter-cancelar-concluir-sem-bipagem');
    const btnTerSemBipClose = document.getElementById('modal-terceiros-concluir-sem-bipagem-completa-close');
    if (btnTerSemBipConfirmar) btnTerSemBipConfirmar.addEventListener('click', function() { fecharModalConcluirRecebimentoSemBipagemCompleta(true); });
    if (btnTerSemBipCancelar) btnTerSemBipCancelar.addEventListener('click', function() { fecharModalConcluirRecebimentoSemBipagemCompleta(false); });
    if (btnTerSemBipClose) btnTerSemBipClose.addEventListener('click', function() { fecharModalConcluirRecebimentoSemBipagemCompleta(false); });

    const modalTerMotivo = document.getElementById('modal-terceiros-motivo-fluxo');
    const btnTerMotivoConfirmar = document.getElementById('btn-ter-confirmar-motivo-fluxo');
    const btnTerMotivoCancelar = document.getElementById('btn-ter-cancelar-motivo-fluxo');
    const btnTerMotivoClose = document.getElementById('modal-terceiros-motivo-fluxo-close');
    function _terConfirmarMotivoFluxoModal() {
        var ta = document.getElementById('ter-motivo-fluxo-texto');
        var txt = ta ? String(ta.value || '').trim() : '';
        if (!txt) {
            showMessage('Informe o motivo antes de confirmar.', 'warning');
            return;
        }
        fecharModalMotivoFluxoTerceiros(true, txt);
    }
    if (btnTerMotivoConfirmar) btnTerMotivoConfirmar.addEventListener('click', _terConfirmarMotivoFluxoModal);
    if (btnTerMotivoCancelar) btnTerMotivoCancelar.addEventListener('click', function() { fecharModalMotivoFluxoTerceiros(false); });
    if (btnTerMotivoClose) btnTerMotivoClose.addEventListener('click', function() { fecharModalMotivoFluxoTerceiros(false); });

    const modalTerRecebedorMg = document.getElementById('modal-terceiros-recebedor-mg');
    const btnTerRecebedorMgConfirmar = document.getElementById('btn-ter-confirmar-recebedor-mg');
    const btnTerRecebedorMgCancelar = document.getElementById('btn-ter-cancelar-recebedor-mg');
    const btnTerRecebedorMgClose = document.getElementById('modal-terceiros-recebedor-mg-close');
    function _terConfirmarRecebedorMgModal() {
        var inp = document.getElementById('ter-recebedor-mg-nome');
        var txt = inp ? String(inp.value || '').trim() : '';
        if (!txt) {
            showMessage('Informe quem recebeu em MG antes de confirmar.', 'warning');
            return;
        }
        fecharModalRecebedorMgTerceiros(true, txt);
    }
    if (btnTerRecebedorMgConfirmar) btnTerRecebedorMgConfirmar.addEventListener('click', _terConfirmarRecebedorMgModal);
    if (btnTerRecebedorMgCancelar) btnTerRecebedorMgCancelar.addEventListener('click', function() { fecharModalRecebedorMgTerceiros(false); });
    if (btnTerRecebedorMgClose) btnTerRecebedorMgClose.addEventListener('click', function() { fecharModalRecebedorMgTerceiros(false); });

    const modalTerExcluir = document.getElementById('modal-terceiros-excluir-documento');
    const btnTerExcluirConfirmar = document.getElementById('btn-ter-confirmar-excluir-documento');
    const btnTerExcluirCancelar = document.getElementById('btn-ter-cancelar-excluir-documento');
    const btnTerExcluirClose = document.getElementById('modal-terceiros-excluir-documento-close');
    if (btnTerExcluirConfirmar) btnTerExcluirConfirmar.addEventListener('click', function() { fecharModalExcluirDocumento(true); });
    if (btnTerExcluirCancelar) btnTerExcluirCancelar.addEventListener('click', function() { fecharModalExcluirDocumento(false); });
    if (btnTerExcluirClose) btnTerExcluirClose.addEventListener('click', function() { fecharModalExcluirDocumento(false); });

    const modalTerRecConc = document.getElementById('modal-terceiros-recebimento-concluido');
    const btnTerRecConcFechar = document.getElementById('btn-ter-fechar-recebimento-concluido');
    const btnTerRecConcClose = document.getElementById('modal-terceiros-recebimento-concluido-close');
    const btnTerRecProxLanc = document.getElementById('btn-ter-proxima-etapa-lancamento');
    if (btnTerRecConcFechar) btnTerRecConcFechar.addEventListener('click', fecharModalRecebimentoConcluidoTerceiros);
    if (btnTerRecConcClose) btnTerRecConcClose.addEventListener('click', fecharModalRecebimentoConcluidoTerceiros);
    if (btnTerRecProxLanc) btnTerRecProxLanc.addEventListener('click', terceirosIrParaProximaEtapaLancamento);

    const modalTerUploadConc = document.getElementById('modal-terceiros-upload-xml-concluido');
    const btnTerUploadFechar = document.getElementById('btn-ter-upload-fechar');
    const btnTerUploadClose = document.getElementById('modal-terceiros-upload-xml-concluido-close');
    const btnTerUploadPendencia = document.getElementById('btn-ter-upload-ir-pendencia');
    if (btnTerUploadFechar) btnTerUploadFechar.addEventListener('click', fecharModalUploadXmlTerceirosConcluido);
    if (btnTerUploadClose) btnTerUploadClose.addEventListener('click', fecharModalUploadXmlTerceirosConcluido);
    if (btnTerUploadPendencia) btnTerUploadPendencia.addEventListener('click', terceirosIrParaPendenciaAposUpload);
    
    // Fechar modal ao clicar fora
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('edit-modal');
        if (e.target === modal) {
            closeModal();
        }
        if (modalTerIrRecebMg && e.target === modalTerIrRecebMg && !_terceirosDeveIgnorarCliqueBackdropModal()) {
            fecharModalIrParaRecebimentosMg(false);
        }
        if (modalTerIrNotasLanc && e.target === modalTerIrNotasLanc && !_terceirosDeveIgnorarCliqueBackdropModal()) {
            fecharModalIrParaNotasLancadas(false);
        }
        if (modalTerConfForn && e.target === modalTerConfForn && !_terceirosDeveIgnorarCliqueBackdropModal()) {
            fecharModalConfirmarRecebimentoFornecedores(false);
        }
        if (modalTerSemReceb && e.target === modalTerSemReceb && !_terceirosDeveIgnorarCliqueBackdropModal()) {
            fecharModalLancamentoSemRecebimento(false);
        }
        if (modalTerSemBip && e.target === modalTerSemBip && !_terceirosDeveIgnorarCliqueBackdropModal()) {
            fecharModalConcluirRecebimentoSemBipagemCompleta(false);
        }
        if (modalTerMotivo && e.target === modalTerMotivo && !_terceirosDeveIgnorarCliqueBackdropModal()) {
            fecharModalMotivoFluxoTerceiros(false);
        }
        if (modalTerRecebedorMg && e.target === modalTerRecebedorMg && !_terceirosDeveIgnorarCliqueBackdropModal()) {
            fecharModalRecebedorMgTerceiros(false);
        }
        if (modalTerExcluir && e.target === modalTerExcluir && !_terceirosDeveIgnorarCliqueBackdropModal()) {
            fecharModalExcluirDocumento(false);
        }
        if (modalTerRecConc && e.target === modalTerRecConc) {
            fecharModalRecebimentoConcluidoTerceiros();
        }
        if (modalTerUploadConc && e.target === modalTerUploadConc) {
            fecharModalUploadXmlTerceirosConcluido();
        }
    });
    
    // Doca obrigatória: desabilitar bipagem até selecionar doca
    window.atualizarEstadoCampoBipar = function() {
        const docaEl = document.getElementById('doca');
        const codigoBarrasEl = document.getElementById('codigo-barras');
        const codigoProdutoEl = document.getElementById('codigo-produto');
        const docaVal = docaEl ? docaEl.value.trim() : '';
        const habilitado = docaVal === '1' || docaVal === '2' || docaVal === '3' || docaVal === '4';
        if (codigoBarrasEl) {
            codigoBarrasEl.disabled = !habilitado;
            codigoBarrasEl.placeholder = habilitado ? 'Digite ou escaneie o código de barras' : 'Selecione a doca antes de bipar';
        }
        if (codigoProdutoEl) codigoProdutoEl.disabled = !habilitado;
        // Badge "VOCÊ ESTÁ NA DOCA X" (4 pessoas bipando ao mesmo tempo)
        const badge = document.getElementById('doca-badge');
        if (badge) {
            if (habilitado) {
                badge.style.display = 'block';
                badge.textContent = 'VOCÊ ESTÁ NA DOCA ' + docaVal;
                badge.style.background = docaVal === '1' ? '#e3f2fd' : docaVal === '2' ? '#e8f5e9' : docaVal === '3' ? '#fff3e0' : '#fce4ec';
                badge.style.color = docaVal === '1' ? '#1565c0' : docaVal === '2' ? '#2e7d32' : docaVal === '3' ? '#e65100' : '#c2185b';
                badge.style.border = '2px solid ' + (docaVal === '1' ? '#1976d2' : docaVal === '2' ? '#388e3c' : docaVal === '3' ? '#f57c00' : '#ad1457');
            } else {
                badge.style.display = 'none';
            }
        }
    };
    const docaEl = document.getElementById('doca');
    const docaFixarEl = document.getElementById('doca-fixar');
    // Restaurar doca fixa (4 postos: cada dispositivo com sua doca salva)
    try {
        const docaFixa = localStorage.getItem('controle_doca_fixa');
        if (docaFixa === '1' || docaFixa === '2' || docaFixa === '3' || docaFixa === '4') {
            if (docaEl) { docaEl.value = docaFixa; }
            if (docaFixarEl) docaFixarEl.checked = true;
        }
    } catch (e) {}
    if (docaEl) {
        docaEl.addEventListener('change', function() {
            window.atualizarEstadoCampoBipar();
            if (docaFixarEl && docaFixarEl.checked) {
                try { localStorage.setItem('controle_doca_fixa', docaEl.value); } catch (e) {}
            }
        });
        docaEl.addEventListener('input', window.atualizarEstadoCampoBipar);
    }
    if (docaFixarEl) {
        docaFixarEl.addEventListener('change', function() {
            if (docaFixarEl.checked && docaEl && (docaEl.value === '1' || docaEl.value === '2' || docaEl.value === '3' || docaEl.value === '4')) {
                try { localStorage.setItem('controle_doca_fixa', docaEl.value); } catch (e) {}
            } else if (!docaFixarEl.checked) {
                try { localStorage.removeItem('controle_doca_fixa'); } catch (e) {}
            }
        });
    }
    window.atualizarEstadoCampoBipar();

    // Aba Importar Ravex: puxar todos os roteiros por período
    const btnImportarRavex = document.getElementById('btn-importar-ravex-periodo');
    const resultadoImportarRavex = document.getElementById('importar-ravex-resultado');
    const ravexModalConcluido = document.getElementById('ravex-modal-concluido');
    const ravexModalConcluidoMensagem = document.getElementById('ravex-modal-concluido-mensagem');
    const ravexModalConcluidoOk = document.getElementById('ravex-modal-concluido-ok');
    function showRavexModalConcluido(htmlMessage) {
        if (ravexModalConcluidoMensagem) ravexModalConcluidoMensagem.innerHTML = htmlMessage;
        if (ravexModalConcluido) ravexModalConcluido.style.display = 'flex';
        if (resultadoImportarRavex) resultadoImportarRavex.style.display = 'none';
        if (typeof _cacheBaixadosRavexInvalidar === 'function') _cacheBaixadosRavexInvalidar('carregamento');
        if (typeof loadBaixadosRavex === 'function') void loadBaixadosRavex('carregamento', { forcar: true });
    }
    if (ravexModalConcluidoOk && ravexModalConcluido) {
        ravexModalConcluidoOk.addEventListener('click', function() {
            ravexModalConcluido.style.display = 'none';
        });
    }
    function ravexLoadingShow(msg) {
        var el = document.getElementById('ravex-loading-overlay');
        var text = document.getElementById('ravex-loading-text');
        var box = document.getElementById('ravex-loading-box');
        var barTrack = document.getElementById('ravex-loading-bar-track');
        var errorActions = document.getElementById('ravex-error-actions');
        _ravexLoadingSetCancelVisible(false);
        if (el && text) {
            text.textContent = msg || 'Puxando roteiro/viagem da API Ravex...';
            if (box) box.classList.remove('ravex-loading-box--error', 'ravex-loading-box--warning');
            if (barTrack) barTrack.style.display = '';
            if (errorActions) errorActions.style.display = 'none';
            var bar = document.getElementById('ravex-loading-bar');
            if (bar) bar.style.width = '12%';
            el.style.display = 'flex';
        }
    }
    function ravexLoadingHide() {
        var el = document.getElementById('ravex-loading-overlay');
        var box = document.getElementById('ravex-loading-box');
        var barTrack = document.getElementById('ravex-loading-bar-track');
        var errorActions = document.getElementById('ravex-error-actions');
        _ravexLoadingSetCancelVisible(false);
        if (el) el.style.display = 'none';
        if (box) box.classList.remove('ravex-loading-box--error', 'ravex-loading-box--warning');
        if (barTrack) barTrack.style.display = '';
        if (errorActions) errorActions.style.display = 'none';
    }
    window.ravexLoadingShow = ravexLoadingShow;
    window.ravexLoadingHide = ravexLoadingHide;
    function ravexErrorShow(msg) {
        var el = document.getElementById('ravex-loading-overlay');
        var text = document.getElementById('ravex-loading-text');
        var box = document.getElementById('ravex-loading-box');
        var barTrack = document.getElementById('ravex-loading-bar-track');
        var errorActions = document.getElementById('ravex-error-actions');
        var okBtn = document.getElementById('ravex-overlay-ok');
        _ravexLoadingSetCancelVisible(false);
        if (el && text) {
            text.textContent = msg || 'Erro ao processar.';
            if (box) box.classList.add('ravex-loading-box--error');
            if (barTrack) barTrack.style.display = 'none';
            if (errorActions) errorActions.style.display = 'block';
            el.style.display = 'flex';
            if (okBtn) okBtn.onclick = function() { ravexLoadingHide(); };
        }
    }
    function normalizarDataYYYYMMDD(val) {
        if (!val || val.length < 10) return val;
        if (val.charAt(4) === '-' && val.charAt(7) === '-') return val.substring(0, 10);
        var m = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
        return val.substring(0, 10);
    }
    function ravexMostrarDuplicado(data, resultadoEl) {
        var msg = (data && data.erro) ? data.erro : 'Esta viagem já foi baixada anteriormente.';
        _ravexImportAbortarAtivo();
        if (resultadoEl) {
            resultadoEl.style.display = 'block';
            resultadoEl.style.background = '#fff3cd';
            resultadoEl.style.border = '1px solid #ffc107';
            resultadoEl.innerHTML = msg;
        }
        if (typeof showMessage === 'function') showMessage(msg, 'warning');
        if (typeof ravexLoadingHide === 'function') ravexLoadingHide();
        if (typeof _cacheBaixadosRavexInvalidar === 'function') _cacheBaixadosRavexInvalidar('carregamento');
        if (typeof loadBaixadosRavex === 'function') void loadBaixadosRavex('carregamento', { forcar: true });
    }
    function ravexResumoPuladosDuplicados(data) {
        var n = (data && data.total_pulados_duplicados) || 0;
        if (!n) return '';
        return ' Viagens já importadas (ignoradas): <strong>' + n + '</strong>.';
    }
    if (btnImportarRavex && resultadoImportarRavex) {
        btnImportarRavex.addEventListener('click', async function() {
            var rawInicio = (document.getElementById('importar-ravex-data-inicio') || {}).value || '';
            var rawFim = (document.getElementById('importar-ravex-data-fim') || {}).value || '';
            const dataInicio = normalizarDataYYYYMMDD(rawInicio);
            const dataFim = normalizarDataYYYYMMDD(rawFim);
            if (!dataInicio || !dataFim) {
                resultadoImportarRavex.style.display = 'block';
                resultadoImportarRavex.style.background = '#fff3cd';
                resultadoImportarRavex.style.border = '1px solid #ffc107';
                resultadoImportarRavex.innerHTML = 'Preencha data início e data fim.';
                return;
            }
            if (dataInicio > dataFim) {
                resultadoImportarRavex.style.display = 'block';
                resultadoImportarRavex.style.background = '#fff3cd';
                resultadoImportarRavex.style.border = '1px solid #ffc107';
                resultadoImportarRavex.innerHTML = 'Data início não pode ser maior que data fim.';
                return;
            }
            btnImportarRavex.disabled = true;
            resultadoImportarRavex.style.display = 'none';
            var signalPeriodo = _ravexImportSignalLoading('Puxando roteiros da API Ravex... Aguarde.');
            try {
                const res = await ravexPostRavexJob('/ravex/sincronizar-periodo', { data_inicio: dataInicio, data_fim: dataFim }, signalPeriodo);
                const r = { ok: res.ok, status: res.status };
                const data = res.data || {};
                if (r.ok && data.ok) {
                    showRavexModalConcluido('Sincronização concluída. Viagens processadas: <strong>' + (data.viagens_processadas || 0) + '</strong>. Total de itens gravados: <strong>' + (data.total_itens || 0) + '</strong>. Viagens listadas no período: ' + (data.viagens_listadas || 0) + ravexResumoPuladosDuplicados(data) + (data.erros && data.erros.length ? '. Erros em algumas viagens: ' + data.erros.length : '') + '.');
                    loadAllData();
                    ravexLoadingHide();
                } else {
                    resultadoImportarRavex.style.background = '#ffebee';
                    resultadoImportarRavex.style.border = '1px solid #f44336';
                    var errMsg = 'Erro: ' + (data.erro || r.statusText || 'Falha na sincronização');
                    resultadoImportarRavex.innerHTML = errMsg;
                    ravexErrorShow(errMsg);
                }
            } catch (e) {
                if (_ravexImportTratarAbort(e, resultadoImportarRavex)) { /* cancelado */ }
                else {
                    resultadoImportarRavex.style.background = '#ffebee';
                    resultadoImportarRavex.style.border = '1px solid #f44336';
                    var errMsg = 'Erro de rede: ' + (e.message || 'Não foi possível conectar');
                    resultadoImportarRavex.innerHTML = errMsg;
                    ravexErrorShow(errMsg);
                }
            } finally {
                _ravexImportAbortarAtivo();
                resultadoImportarRavex.style.display = 'block';
                btnImportarRavex.disabled = false;
            }
        });
    }

    // Importar Ravex: puxar por ID único (roteiro ou viagem)
    const btnImportarRavexIdUnico = document.getElementById('btn-importar-ravex-id-unico');
    if (btnImportarRavexIdUnico && resultadoImportarRavex) {
        btnImportarRavexIdUnico.addEventListener('click', async function() {
            const idUnico = (document.getElementById('importar-ravex-id-unico') || {}).value || '';
            if (!idUnico.trim()) {
                resultadoImportarRavex.style.display = 'block';
                resultadoImportarRavex.style.background = '#fff3cd';
                resultadoImportarRavex.style.border = '1px solid #ffc107';
                resultadoImportarRavex.innerHTML = 'Digite o ID do roteiro ou da viagem.';
                return;
            }
            btnImportarRavexIdUnico.disabled = true;
            resultadoImportarRavex.style.display = 'none';
            var idTrim = idUnico.trim();
            var signalUnico = _ravexImportSignalLoading('Puxando roteiro/viagem da API Ravex... Aguarde.');
            try {
                const res = await ravexPostImportarRomaneio({ id: idTrim }, signalUnico);
                const r = { ok: res.ok, status: res.status };
                const data = res.data || {};
                if (r.ok && data.ok) {
                    var msgOk = data.mensagem || (
                        data.somente_roteiro
                            ? ('Importado pelo roteiro <strong>' + (data.id_roteiro || idTrim) + '</strong> (sem viagem faturada). Itens: <strong>' + (data.total_itens || 0) + '</strong>.')
                            : ('Importado. ID viagem: <strong>' + (data.id_viagem || '') + '</strong>. Total de itens: <strong>' + (data.total_itens || 0) + '</strong>.')
                    );
                    showRavexModalConcluido(msgOk);
                    ravexLoadingHide();
                } else if (r.status === 409 || (data && data.duplicado)) {
                    ravexMostrarDuplicado(data, resultadoImportarRavex);
                } else {
                    resultadoImportarRavex.style.background = '#ffebee';
                    resultadoImportarRavex.style.border = '1px solid #f44336';
                    var msg = 'Erro: ' + (data.erro || 'Falha ao importar');
                    if (r.status === 502 || r.status === 503 || r.status === 504) {
                        msg = 'Servidor demorou ou ficou indisponível (HTTP ' + r.status + '). A importação pode ter continuado — confira em Baixados (Ravex) ou tente de novo.';
                    }
                    if (data.diagnostico) msg += ' ' + data.diagnostico;
                    resultadoImportarRavex.innerHTML = msg;
                    ravexErrorShow(msg);
                }
            } catch (e) {
                if (_ravexImportTratarAbort(e, resultadoImportarRavex)) { /* cancelado */ }
                else {
                    resultadoImportarRavex.style.background = '#ffebee';
                    resultadoImportarRavex.style.border = '1px solid #f44336';
                    var msg = (e && e.message) ? e.message : 'Não foi possível conectar';
                    if (String(msg).indexOf('502') >= 0 || String(msg).indexOf('Failed to fetch') >= 0) {
                        msg = 'Conexão interrompida ou servidor ocupado. Verifique em Baixados (Ravex) se os itens foram gravados.';
                    }
                    resultadoImportarRavex.innerHTML = 'Erro: ' + msg;
                    ravexErrorShow(msg);
                }
            } finally {
                _ravexImportAbortarAtivo();
                resultadoImportarRavex.style.display = 'block';
                btnImportarRavexIdUnico.disabled = false;
            }
        });
    }

    // Importar Ravex: puxar lista de IDs
    const btnImportarRavexLista = document.getElementById('btn-importar-ravex-lista');
    if (btnImportarRavexLista && resultadoImportarRavex) {
        btnImportarRavexLista.addEventListener('click', async function() {
            const textarea = document.getElementById('importar-ravex-lista-ids');
            const texto = (textarea && textarea.value) ? textarea.value : '';
            const ids = texto.replace(/,/g, '\n').split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
            if (ids.length === 0) {
                resultadoImportarRavex.style.display = 'block';
                resultadoImportarRavex.style.background = '#fff3cd';
                resultadoImportarRavex.style.border = '1px solid #ffc107';
                resultadoImportarRavex.innerHTML = 'Cole uma lista de IDs (um por linha ou separados por vírgula).';
                return;
            }
            btnImportarRavexLista.disabled = true;
            resultadoImportarRavex.style.display = 'none';
            var forcarLista = !!(document.getElementById('importar-ravex-forcar-reimportar') && document.getElementById('importar-ravex-forcar-reimportar').checked);
            var signalLista = _ravexImportSignalLoading('Puxando ' + ids.length + ' roteiro(s)/viagem(ns) da API Ravex... Aguarde.');
            try {
                var bloquearLista = false;
                if (!forcarLista) {
                    var rVer = await fetch(API_BASE + '/ravex/verificar-baixado-lote', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: ids }),
                        signal: signalLista
                    });
                    var verLote = await rVer.json().catch(function() { return {}; });
                    if (signalLista.aborted) return;
                    var duplicadosLista = (verLote && Array.isArray(verLote.ja_baixados))
                        ? verLote.ja_baixados.map(function(x) { return x.id; })
                        : [];
                    if (duplicadosLista.length === ids.length) {
                        ravexMostrarDuplicado({
                            erro: 'Todos os ' + ids.length + ' ID(s) da lista já foram baixados (ex.: ' + duplicadosLista.slice(0, 3).join(', ') + '). Marque «Forçar reimportação» para baixar de novo.'
                        }, resultadoImportarRavex);
                        bloquearLista = true;
                    } else if (duplicadosLista.length > 0) {
                        var textLista = document.getElementById('ravex-loading-text');
                        if (textLista) textLista.textContent = duplicadosLista.length + ' ID(s) já baixados serão ignorados. Puxando da API…';
                    }
                }
                if (!bloquearLista && !signalLista.aborted) {
                    const res = await ravexPostRavexJob('/ravex/importar-lista', { ids: ids }, signalLista);
                    const r = { ok: res.ok, status: res.status };
                    const data = res.data || {};
                    if (r.ok && data.ok) {
                        showRavexModalConcluido('Lista processada. Viagens importadas: <strong>' + (data.viagens_processadas || 0) + '</strong>. Total de itens: <strong>' + (data.total_itens || 0) + '</strong>. IDs na lista: ' + (data.ids_recebidos || 0) + ravexResumoPuladosDuplicados(data) + (data.erros && data.erros.length ? '. Erros: ' + data.erros.length : '') + '.');
                        loadAllData();
                        ravexLoadingHide();
                    } else {
                        resultadoImportarRavex.style.background = '#ffebee';
                        resultadoImportarRavex.style.border = '1px solid #f44336';
                        var msg = 'Erro: ' + (data.erro || r.statusText || 'Falha ao importar lista');
                        if (data.diagnostico) msg += ' ' + data.diagnostico;
                        resultadoImportarRavex.innerHTML = msg;
                        ravexErrorShow(msg);
                    }
                }
            } catch (e) {
                if (_ravexImportTratarAbort(e, resultadoImportarRavex)) { /* cancelado */ }
                else {
                    resultadoImportarRavex.style.background = '#ffebee';
                    resultadoImportarRavex.style.border = '1px solid #f44336';
                    var msg = 'Erro de rede: ' + (e.message || 'Não foi possível conectar');
                    resultadoImportarRavex.innerHTML = msg;
                    ravexErrorShow(msg);
                }
            } finally {
                _ravexImportAbortarAtivo();
                resultadoImportarRavex.style.display = 'block';
                btnImportarRavexLista.disabled = false;
            }
        });
    }

    window.ultimoCodigoBuscado = '';
    _conferenciaBindInputCodigoBarras(document.getElementById('codigo-barras'), { modoDevolucao: false });
    
    // Busca automática no campo Código do produto (igual ao código de barras)
    const codigoProdutoInput = document.getElementById('codigo-produto');
    if (codigoProdutoInput) {
        window.ultimoCodigoProdutoBuscado = '';
        let timeoutBuscaCodigoProduto;
        codigoProdutoInput.addEventListener('input', (e) => {
            const codigo = e.target.value.trim();
            clearTimeout(timeoutBuscaCodigoProduto);
            if (codigo.length >= 2 && codigo !== window.ultimoCodigoProdutoBuscado) {
                timeoutBuscaCodigoProduto = setTimeout(() => {
                    window.ultimoCodigoProdutoBuscado = codigo;
                    buscarProdutoPorCodigoProduto(codigo);
                }, 60);
            }
        });
        codigoProdutoInput.addEventListener('blur', (e) => {
            const codigo = e.target.value.trim();
            if (codigo.length >= 2 && codigo !== window.ultimoCodigoProdutoBuscado) {
                window.ultimoCodigoProdutoBuscado = codigo;
                buscarProdutoPorCodigoProduto(codigo);
            }
        });
        codigoProdutoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(timeoutBuscaCodigoProduto);
                const codigo = e.target.value.trim();
                if (codigo.length >= 2) {
                    window.ultimoCodigoProdutoBuscado = codigo;
                    buscarProdutoPorCodigoProduto(codigo);
                }
            }
        });
        codigoProdutoInput.addEventListener('paste', () => {
            setTimeout(() => {
                const codigo = codigoProdutoInput.value.trim();
                if (codigo.length >= 2) {
                    window.ultimoCodigoProdutoBuscado = codigo;
                    buscarProdutoPorCodigoProduto(codigo);
                }
            }, 50);
        });
    }
    
    // Buscar roteiro ao pressionar Enter no campo ID do roteiro
    const idViagemInput = document.getElementById('id-viagem');
    if (idViagemInput) {
        idViagemInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                buscarItensViagem();
            }
        });
    }
    const devIdViagemInput = document.getElementById('dev-id-viagem');
    if (devIdViagemInput) {
        devIdViagemInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (typeof buscarItensViagemDevolucao === 'function') buscarItensViagemDevolucao();
            }
        });
    }

    _conferenciaBindInputCodigoBarras(document.getElementById('dev-codigo-barras'), {
        modoDevolucao: true,
        qtdInputId: 'dev-quantidade',
        codigoInputId: 'dev-codigo-barras'
    });

    var codigoProdutoDev = document.getElementById('dev-codigo-produto');
    if (codigoProdutoDev) {
        window.ultimoCodigoProdutoBuscadoDev = '';
        var timeoutBuscaCodigoProdutoDev;
        codigoProdutoDev.addEventListener('input', function(e) {
            var codigo = e.target.value.trim();
            clearTimeout(timeoutBuscaCodigoProdutoDev);
            if (codigo.length >= 2 && codigo !== window.ultimoCodigoProdutoBuscadoDev) {
                timeoutBuscaCodigoProdutoDev = setTimeout(function() {
                    window.ultimoCodigoProdutoBuscadoDev = codigo;
                    buscarProdutoPorCodigoProduto(codigo);
                }, 60);
            }
        });
        codigoProdutoDev.addEventListener('blur', function(e) {
            var codigo = e.target.value.trim();
            if (codigo.length >= 2 && codigo !== window.ultimoCodigoProdutoBuscadoDev) {
                window.ultimoCodigoProdutoBuscadoDev = codigo;
                buscarProdutoPorCodigoProduto(codigo);
            }
        });
        codigoProdutoDev.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(timeoutBuscaCodigoProdutoDev);
                var codigo = e.target.value.trim();
                if (codigo.length >= 2) {
                    window.ultimoCodigoProdutoBuscadoDev = codigo;
                    buscarProdutoPorCodigoProduto(codigo);
                }
            }
        });
        codigoProdutoDev.addEventListener('paste', function() {
            setTimeout(function() {
                var codigo = codigoProdutoDev.value.trim();
                if (codigo.length >= 2) {
                    window.ultimoCodigoProdutoBuscadoDev = codigo;
                    buscarProdutoPorCodigoProduto(codigo);
                }
            }, 50);
        });
    }
    
    // Focar no campo de código de barras ao pressionar qualquer tecla (quando estiver na aba conferencia e já tiver viagem selecionada)
    // Não redirecionar se o usuário estiver digitando em qualquer input/textarea/select (ex.: campo Motivo da divergência)
    document.addEventListener('keydown', (e) => {
        var el = e.target;
        var active = document.activeElement;
        var ehCampoDigitar = function(node) {
            if (!node) return false;
            if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') return true;
            if (node.classList && node.classList.contains('input-motivo-divergencia')) return true;
            return false;
        };
        if (ehCampoDigitar(el) || ehCampoDigitar(active)) return;
        const codigoInput = document.getElementById('codigo-barras');
        const idViagem = document.getElementById('id-viagem-hidden');
        if (codigoInput && document.getElementById('conferencia') && document.getElementById('conferencia').classList.contains('active') && idViagem && idViagem.value) {
            codigoInput.focus();
        }
        var moduloDev = document.getElementById('modulo-devolucoes');
        var devCb = document.getElementById('dev-codigo-barras');
        var devHid = document.getElementById('dev-id-viagem-hidden');
        if (moduloDev && !moduloDev.hidden && devCb && devHid && devHid.value.trim()) {
            devCb.focus();
        }
        var modTer = document.getElementById('modulo-terceiros');
        var terDet = document.getElementById('ter-recebimento-detalhe');
        var terCb = document.getElementById('ter-codigo-barras-bipagem');
        if (modTer && !modTer.hidden && terDet && terDet.style.display !== 'none' && terCb && !terCb.disabled) {
            terCb.focus();
        }
    });

    const btnTerRecebUpload = document.getElementById('btn-ter-recebimento-upload');
    if (btnTerRecebUpload) btnTerRecebUpload.addEventListener('click', function() { uploadXmlTerceiros(); });
    const chkTerConsumivelSp = document.getElementById('ter-recebimento-consumivel-sp');
    const boxTerConsumivelSp = document.getElementById('ter-recebimento-consumivel-sp-box');
    const inpTerConsumivelSp = document.getElementById('ter-recebimento-recebedor-consumivel-sp');
    if (chkTerConsumivelSp && boxTerConsumivelSp && chkTerConsumivelSp.dataset.bound !== '1') {
        chkTerConsumivelSp.dataset.bound = '1';
        chkTerConsumivelSp.addEventListener('change', function() {
            boxTerConsumivelSp.style.display = chkTerConsumivelSp.checked ? '' : 'none';
            if (!chkTerConsumivelSp.checked && inpTerConsumivelSp) inpTerConsumivelSp.value = '';
            if (chkTerConsumivelSp.checked && inpTerConsumivelSp) inpTerConsumivelSp.focus();
        });
    }
    const btnTerCarretaUpload = document.getElementById('btn-ter-carreta-upload');
    if (btnTerCarretaUpload) btnTerCarretaUpload.addEventListener('click', function() { uploadXmlTerceirosCarreta(); });

    const btnTerRecConcluir = document.getElementById('btn-ter-rec-concluir');
    if (btnTerRecConcluir && btnTerRecConcluir.dataset.bound !== '1') {
        btnTerRecConcluir.dataset.bound = '1';
        btnTerRecConcluir.addEventListener('click', function() {
            void acionarRecebimentoConcluidoTerceirosDireto(btnTerRecConcluir).catch(function(e) {
                console.error(e);
                showMessage('Não foi possível concluir o recebimento.', 'error');
            });
        });
    }
    initTerceirosBipagemForm();
    initTerceirosFiltroPrevisaoPendencia();
    initTerceirosFiltrosHistorico();

    [
        ['ter-rec-nota-lancada', 'recebimento', 'nota_lancada'],
        ['ter-rec-enviar-mg', 'recebimento', 'enviar_para_mg'],
        ['ter-rec-recebida-mg', 'recebimento', 'carga_recebida_mg']
    ].forEach(function(cfg) {
        var elStatus = document.getElementById(cfg[0]);
        if (!elStatus) return;
        elStatus.addEventListener('change', function() {
            if (elStatus.value) atualizarStatusTerceiros(cfg[1], cfg[2], elStatus.value);
        });
    });

    const btnTerRecMotorista = document.getElementById('btn-ter-rec-motorista');
    if (btnTerRecMotorista) btnTerRecMotorista.addEventListener('click', function() { salvarMotoristaTerceiros('recebimento'); });

    if (!window._terceirosPagehideRegistrado) {
        window._terceirosPagehideRegistrado = true;
        window.addEventListener('pagehide', function() {
            var idPh = _terceirosDocumentoIdAtualParaApi();
            if (!idPh || !window._terceirosBipagemPending) return;
            var pend = window._terceirosBipagemPending;
            var has = Object.keys(pend.adds || {}).length > 0 || Object.keys(pend.removes || {}).length > 0;
            if (has) _enviarPendenciasTerceirosKeepalive(idPh);
        });
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState !== 'hidden') return;
            var idV = _terceirosDocumentoIdAtualParaApi();
            if (!idV || !window._terceirosBipagemPending) return;
            var pend2 = window._terceirosBipagemPending;
            var has2 = Object.keys(pend2.adds || {}).length > 0 || Object.keys(pend2.removes || {}).length > 0;
            if (has2) _enviarPendenciasTerceirosKeepalive(idV);
        });
    }
}

// Verifica se o produto está na relação de itens da viagem
async function produtoNaListaViagem(idViagem, codigoProduto, codigoBarras) {
    if (!idViagem) return true;
    try {
        let url = `/api/conferencia/${encodeURIComponent(idViagem)}/produto-na-lista?`;
        if (codigoProduto) url += `codigo_produto=${encodeURIComponent(codigoProduto)}`;
        else if (codigoBarras) url += `codigo_barras=${encodeURIComponent(codigoBarras)}`;
        else return true;
        const r = await fetch(url);
        const data = await r.json();
        return data.na_lista === true;
    } catch (e) {
        return true;
    }
}

function mostrarAvisoProdutoForaRelacao(mostrar) {
    const aviso = window._elBipagem('aviso-produto-fora-relacao');
    if (!aviso) return;
    if (mostrar) {
        aviso.style.display = 'block';
        if (confirm('Este produto não está na relação de itens desta viagem. Deseja cadastrar ao bipar?')) {
            window.cadastrarExtraAoBipar = true;
        } else {
            window.cadastrarExtraAoBipar = false;
        }
    } else {
        aviso.style.display = 'none';
        window.cadastrarExtraAoBipar = false;
    }
}

// Fila de bipagem: processar uma por vez para não perder nem duplicar
if (typeof window.bipagemEmAndamento === 'undefined') window.bipagemEmAndamento = Promise.resolve();

// Evitar vários GETs por bipagem (estatísticas/período): agrupa e dispara depois
let _timerPosBipagem = null;
function agendarAtualizacoesPosBipagem(idViagem) {
    try {
        if (_timerPosBipagem) clearTimeout(_timerPosBipagem);
        _timerPosBipagem = setTimeout(function() {
            _timerPosBipagem = null;
            loadEstatisticas();
            if (idViagem) loadPeriodoCarregamento(idViagem);
            if (window._fluxoBipagemAtivo === 'devolucao' && window._devolucaoNfAtiva && window._devolucaoNfAtiva.id) {
                loadConferenciaDevolucaoNf(window._devolucaoNfAtiva.id);
            }
        }, 600);
    } catch (e) {}
}

// Ao bipar: 1) foca o campo  2) leva só a barra de rolagem do bloco (main.content) para o topo
function focarCampoCodigoBarras() {
    var cb = window._elBipagem('codigo-barras');
    if (cb && !cb.disabled) cb.focus();
    function rolarBlocoParaTopo() {
        var content = document.querySelector('main.content');
        if (content) content.scrollTop = 0;
    }
    requestAnimationFrame(function() { requestAnimationFrame(rolarBlocoParaTopo); });
}

// Buscar produto na planilha Excel. quantidadeParaAdicionarOpcional: se passado, usa essa qtd no add; skipAtualizarTabelaOpcional: true = não chama atualizarQuantidadeBipadaNaTabela (já atualizado na UI); skipEnqueueOpcional: true = só preenche nome/código (sem somar de novo).
async function buscarProdutoNaPlanilha(codigoBarras, quantidadeParaAdicionarOpcional, skipAtualizarTabelaOpcional, skipEnqueueOpcional) {
    codigoBarras = normalizarCodigoBarrasDuplicado((codigoBarras || '').toString().trim());
    if (!codigoBarras || codigoBarras.length < 3) {
        return;
    }
    
    const codigoInput = window._elBipagem('codigo-barras');
    const produtoNomeInput = window._elBipagem('produto-nome');
    const codigoAtualNoCampo = codigoInput ? normalizarCodigoBarrasDuplicado((codigoInput.value || '').toString().trim()) : codigoBarras;
    if (codigoInput && codigoAtualNoCampo && codigoAtualNoCampo !== codigoBarras) return;

    // Controle de concorrência: evita preencher campos com buscas antigas (atrasadas)
    window._buscaProdutoSeq = (window._buscaProdutoSeq || 0) + 1;
    const seq = window._buscaProdutoSeq;
    try {
        if (window._buscaProdutoAbort && typeof window._buscaProdutoAbort.abort === 'function') {
            window._buscaProdutoAbort.abort();
        }
    } catch (e) {}
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    window._buscaProdutoAbort = controller;
    const aindaEhOCodigoAtual = function() {
        if (!codigoInput) return true;
        const atual = normalizarCodigoBarrasDuplicado((codigoInput.value || '').toString().trim());
        return atual === codigoBarras;
    };
    
    // Mostrar indicador de busca
    if (codigoInput) {
        codigoInput.style.borderColor = '#ffa500';
        codigoInput.style.backgroundColor = '#fff8e1';
    }
    
    try {
        const response = await fetch(
            `/api/buscar-produto/${encodeURIComponent(codigoBarras)}`,
            controller ? { signal: controller.signal } : undefined
        );
        const resultado = await response.json();
        if (seq !== window._buscaProdutoSeq) return;
        if (!aindaEhOCodigoAtual()) return;
        
        const idViagem = window._getIdViagemAtivo();
        const docaEl = window._elBipagem('doca');
        const doca = docaEl && docaEl.value ? docaEl.value.trim() : '';
        const veiculoInput = window._elBipagem('veiculo');
        const statusSelect = window._elBipagem('status');
        const quantidadeInput = window._elBipagem('quantidade');
        
        if (resultado.encontrado && resultado.produto) {
            const produto = resultado.produto;
            
            const codigoProdutoInput = window._elBipagem('codigo-produto');
            
            // Preencher formulário só para exibição (próximo bip pode já estar no campo; bipagem usa override)
            if (codigoProdutoInput && produto.codigo_produto !== undefined) {
                codigoProdutoInput.value = produto.codigo_produto || '';
            }
            if (produtoNomeInput && produto.produto) {
                produtoNomeInput.value = produto.produto;
                produtoNomeInput.style.backgroundColor = '#e8f5e9';
                setTimeout(() => { produtoNomeInput.style.backgroundColor = ''; }, 2000);
            }
            // Não preencher Qtd. bipada com quantidade da planilha: cada bip soma 1 ao já bipado e o campo volta a 1
            if (veiculoInput && produto.veiculo) veiculoInput.value = produto.veiculo;
            if (statusSelect && produto.status) statusSelect.value = produto.status;
            
            if (codigoInput) {
                codigoInput.style.borderColor = '#4caf50';
                codigoInput.style.backgroundColor = '#e8f5e9';
                setTimeout(() => { codigoInput.style.borderColor = ''; codigoInput.style.backgroundColor = ''; }, 2000);
            }
            
            if (idViagem) {
                // Não bloquear bipagem com esse GET; e evitar abrir modal atrasado de busca antiga
                produtoNaListaViagem(idViagem, produto.codigo_produto, codigoBarras).then(function(naLista) {
                    if (seq !== window._buscaProdutoSeq) return;
                    if (!aindaEhOCodigoAtual()) return;
                    mostrarAvisoProdutoForaRelacao(!naLista);
                    if (naLista) window.cadastrarExtraAoBipar = false;
                }).catch(function() {});
                var qtd = 1;
                if (quantidadeParaAdicionarOpcional !== undefined && quantidadeParaAdicionarOpcional !== null) {
                    var qRaw = parseInt(quantidadeParaAdicionarOpcional, 10);
                    if (!isNaN(qRaw) && qRaw >= 1 && qRaw <= 99999) qtd = qRaw;
                } else if (quantidadeInput) {
                    const qRaw = parseInt(quantidadeInput.value, 10);
                    if (!isNaN(qRaw) && qRaw >= 1 && qRaw <= 99999) qtd = qRaw;
                }
                var codigoNorm = (codigoBarras || '').toString().trim();
                var idxPend = (window._pendingEnterUpdates || []).findIndex(function(p) { return (p.codigo || '').toString().trim() === codigoNorm; });
                var pend = idxPend >= 0 ? window._pendingEnterUpdates[idxPend] : null;
                if (pend && pend.qtd !== undefined && quantidadeParaAdicionarOpcional === undefined) {
                    var qtdPend = parseInt(pend.qtd, 10);
                    if (!isNaN(qtdPend) && qtdPend >= 1 && qtdPend <= 99999) qtd = qtdPend;
                }
                var override = {
                    codigo_barras: (produto.codigo_barras || codigoBarras).toString().trim(),
                    produto: (produto.produto || '').trim(),
                    quantidade: qtd,
                    veiculo: (veiculoInput && veiculoInput.value) ? veiculoInput.value.trim() : '',
                    status: (statusSelect && statusSelect.value) ? statusSelect.value : 'PENDENTE',
                    id_viagem: idViagem,
                    doca: doca,
                    codigo_interno: (produto.codigo_produto || '').toString().trim(),
                    codigo_dun: (produto.codigo_dun != null) ? String(produto.codigo_dun).trim() : '',
                    peso: (produto.peso != null) ? String(produto.peso).trim() : '',
                    unidade: (produto.unidade != null) ? String(produto.unidade).trim() : ''
                };
                if (!skipAtualizarTabelaOpcional && (!pend || !pend.updated)) {
                    atualizarQuantidadeBipadaNaTabela(override.codigo_barras, qtd, override.codigo_interno);
                    atualizarEstatisticasOtimista(qtd, false);
                }
                if (idxPend >= 0) window._pendingEnterUpdates.splice(idxPend, 1);
                if (!skipEnqueueOpcional) {
                    if (_conferenciaUsaRascunhoLocal() && !window._conferenciaSalvandoNoComprovante) {
                        _conferenciaEnfileirarAddLocal(override.codigo_barras, qtd);
                    } else {
                        window.bipagemEmAndamento = window.bipagemEmAndamento.then(function() { return addProduto(true, override); }).catch(function() {});
                    }
                }
            }
        } else {
            if (codigoInput) {
                codigoInput.style.borderColor = '#ff9800';
                codigoInput.style.backgroundColor = '#fff3e0';
                setTimeout(() => { codigoInput.style.borderColor = ''; codigoInput.style.backgroundColor = ''; }, 2000);
            }
            if (produtoNomeInput) produtoNomeInput.value = '';
            var avisoFora = window._elBipagem('aviso-produto-fora-relacao');
            if (avisoFora) avisoFora.style.display = 'none';
            if (idViagem) {
                var qtdNaoEnc = 1;
                if (quantidadeParaAdicionarOpcional !== undefined && quantidadeParaAdicionarOpcional !== null) {
                    var qRawNao = parseInt(quantidadeParaAdicionarOpcional, 10);
                    if (!isNaN(qRawNao) && qRawNao >= 1 && qRawNao <= 99999) qtdNaoEnc = qRawNao;
                } else {
                    qtdNaoEnc = (quantidadeInput && parseInt(quantidadeInput.value, 10)) ? Math.max(1, parseInt(quantidadeInput.value, 10)) : 1;
                }
                var codigoNormNao = (codigoBarras || '').toString().trim();
                var idxPendNao = (window._pendingEnterUpdates || []).findIndex(function(p) { return (p.codigo || '').toString().trim() === codigoNormNao; });
                var pendNao = idxPendNao >= 0 ? window._pendingEnterUpdates[idxPendNao] : null;
                if (pendNao && pendNao.qtd !== undefined && quantidadeParaAdicionarOpcional === undefined) {
                    var qtdPendNao = parseInt(pendNao.qtd, 10);
                    if (!isNaN(qtdPendNao) && qtdPendNao >= 1 && qtdPendNao <= 99999) qtdNaoEnc = qtdPendNao;
                }
                var overrideNaoEncontrado = {
                    codigo_barras: codigoBarras,
                    produto: (produtoNomeInput && produtoNomeInput.value) ? produtoNomeInput.value.trim() : '',
                    quantidade: qtdNaoEnc,
                    veiculo: (veiculoInput && veiculoInput.value) ? veiculoInput.value.trim() : '',
                    status: (statusSelect && statusSelect.value) ? statusSelect.value : 'PENDENTE',
                    id_viagem: idViagem,
                    doca: doca
                };
                if (!skipAtualizarTabelaOpcional && (!pendNao || !pendNao.updated)) {
                    atualizarQuantidadeBipadaNaTabela(codigoBarras, qtdNaoEnc, '');
                    atualizarEstatisticasOtimista(qtdNaoEnc, false);
                }
                if (idxPendNao >= 0) window._pendingEnterUpdates.splice(idxPendNao, 1);
                if (!skipEnqueueOpcional) {
                    if (_conferenciaUsaRascunhoLocal() && !window._conferenciaSalvandoNoComprovante) {
                        _conferenciaEnfileirarAddLocal(codigoBarras, qtdNaoEnc);
                    } else {
                        window.bipagemEmAndamento = window.bipagemEmAndamento.then(function() { return addProduto(false, overrideNaoEncontrado); }).catch(function() {});
                    }
                }
            }
        }
    } catch (error) {
        if (error && (error.name === 'AbortError' || error.code === 20)) {
            return;
        }
        console.error('Erro ao buscar produto:', error);
        var codigoNormErr = (codigoBarras || '').toString().trim();
        var idxPendErr = (window._pendingEnterUpdates || []).findIndex(function(p) { return (p.codigo || '').toString().trim() === codigoNormErr; });
        if (idxPendErr >= 0) {
            var pendErr = window._pendingEnterUpdates[idxPendErr];
            var qtdErr = parseInt(pendErr && pendErr.qtd, 10) || 1;
            if (pendErr && pendErr.updated) {
                atualizarQuantidadeBipadaNaTabela(codigoBarras, -qtdErr, '');
                atualizarEstatisticasOtimista(qtdErr, true);
            }
            window._pendingEnterUpdates.splice(idxPendErr, 1);
        }
        if (codigoInput) {
            codigoInput.style.borderColor = '#f44336';
            codigoInput.style.backgroundColor = '#ffebee';
            setTimeout(() => { codigoInput.style.borderColor = ''; codigoInput.style.backgroundColor = ''; }, 2000);
        }
    } finally {
        focarCampoCodigoBarras();
    }
}

// Buscar produto na planilha por Código do produto (busca automática igual ao código de barras)
async function buscarProdutoPorCodigoProduto(codigoProduto) {
    if (!codigoProduto || codigoProduto.length < 2) return;
    const codigoProdutoEl = window._elBipagem('codigo-produto');
    const codigoBarrasEl = window._elBipagem('codigo-barras');
    const produtoNomeInput = window._elBipagem('produto-nome');
    if (codigoProdutoEl) {
        codigoProdutoEl.style.borderColor = '#ffa500';
        codigoProdutoEl.style.backgroundColor = '#fff8e1';
    }
    try {
        const response = await fetch(`/api/buscar-produto-por-codigo-interno/${encodeURIComponent(codigoProduto)}`);
        const resultado = await response.json();
        if (resultado.encontrado && resultado.produto) {
            const p = resultado.produto;
            if (codigoBarrasEl && p.codigo_barras !== undefined) codigoBarrasEl.value = p.codigo_barras || '';
            if (codigoProdutoEl && p.codigo_produto !== undefined) codigoProdutoEl.value = p.codigo_produto || '';
            if (produtoNomeInput) {
                produtoNomeInput.value = p.produto || '';
                produtoNomeInput.style.backgroundColor = '#e8f5e9';
                setTimeout(() => { produtoNomeInput.style.backgroundColor = ''; }, 2000);
            }
            // Manter Qtd. bipada em 1 para cada bip somar ao já bipado
            const v = window._elBipagem('veiculo');
            if (v && p.veiculo) v.value = p.veiculo;
            const s = window._elBipagem('status');
            if (s && p.status) s.value = p.status;
            if (codigoProdutoEl) {
                codigoProdutoEl.style.borderColor = '#4caf50';
                codigoProdutoEl.style.backgroundColor = '#e8f5e9';
                setTimeout(() => { codigoProdutoEl.style.borderColor = ''; codigoProdutoEl.style.backgroundColor = ''; }, 2000);
            }
            if (codigoBarrasEl) window.ultimoCodigoBuscado = (p.codigo_barras || '').trim();
            const idViagem = window._getIdViagemAtivo();
            if (idViagem && p.codigo_produto) {
                const naLista = await produtoNaListaViagem(idViagem, p.codigo_produto, null);
                mostrarAvisoProdutoForaRelacao(!naLista);
                if (naLista) window.cadastrarExtraAoBipar = false;
            }
        } else {
            var avisoElse = window._elBipagem('aviso-produto-fora-relacao');
            if (avisoElse) avisoElse.style.display = 'none';
            if (codigoProdutoEl) {
                codigoProdutoEl.style.borderColor = '#ff9800';
                codigoProdutoEl.style.backgroundColor = '#fff3e0';
                setTimeout(() => { codigoProdutoEl.style.borderColor = ''; codigoProdutoEl.style.backgroundColor = ''; }, 2000);
            }
        }
    } catch (err) {
        var avisoErr = window._elBipagem('aviso-produto-fora-relacao');
        if (avisoErr) avisoErr.style.display = 'none';
        if (codigoProdutoEl) {
            codigoProdutoEl.style.borderColor = '#f44336';
            codigoProdutoEl.style.backgroundColor = '#ffebee';
            setTimeout(() => { codigoProdutoEl.style.borderColor = ''; codigoProdutoEl.style.backgroundColor = ''; }, 2000);
        }
    }
}

/** HTTP de indisponibilidade do app atrás do proxy (sem toast agressivo no cliente). */
function _falhaGatewayHttpStatus(status) {
    var s = Number(status) || 0;
    return s === 502 || s === 503 || s === 504 || s === 524;
}

/** Mensagem curta quando o proxy devolve HTML (502/503) em vez de JSON do app. */
function mensagemErroRespostaNaoJson(status, corpoTexto) {
    var s = Number(status) || 0;
    if (s === 502 || s === 503 || s === 504 || s === 524) {
        return 'Servidor temporariamente indisponível (erro ' + s + '). Na hospedagem, confira se o app está rodando, variáveis (ex.: banco) e os logs; em seguida tente de novo.';
    }
    var t = (corpoTexto || '').trim();
    if (/^\s*<!DOCTYPE/i.test(t) || /^\s*<html/i.test(t)) {
        return 'O serviço respondeu com página de erro (HTTP ' + (s || '?') + ') em vez dos dados. Verifique deploy e logs da hospedagem.';
    }
    var snippet = t.replace(/\s+/g, ' ').trim().slice(0, 200);
    return 'HTTP ' + (s || '?') + (snippet ? ': ' + snippet : '');
}

// API Calls
/** POST/PUT com limite de tempo (evita botão «A guardar…» preso para sempre se o servidor não responder). */
async function fetchAPIComTimeout(endpoint, options, timeoutMs) {
    timeoutMs = timeoutMs == null || timeoutMs < 5000 ? 35000 : timeoutMs;
    var ac = new AbortController();
    var externalSignal = options && options.signal;
    if (externalSignal) {
        if (externalSignal.aborted) {
            try {
                ac.abort();
            } catch (e) {}
        } else if (typeof externalSignal.addEventListener === 'function') {
            externalSignal.addEventListener('abort', function() {
                try {
                    ac.abort();
                } catch (e) {}
            }, { once: true });
        }
    }
    var tid = window.setTimeout(function() {
        try {
            ac.abort();
        } catch (e) {}
    }, timeoutMs);
    try {
        var merged = Object.assign({}, options || {}, { signal: ac.signal });
        if (merged.method && String(merged.method).toUpperCase() !== 'GET' && String(merged.method).toUpperCase() !== 'HEAD') {
            merged.keepalive = false;
        }
        return await fetchAPI(endpoint, merged);
    } finally {
        window.clearTimeout(tid);
    }
}

async function fetchAPI(endpoint, options = {}) {
    try {
        const method = ((options && options.method) ? options.method : 'GET').toString().toUpperCase();
        const isWrite = method !== 'GET' && method !== 'HEAD';
        const hasBody = options.body !== undefined && options.body !== null && options.body !== '';
        const headers = { ...(options.headers || {}) };
        if (hasBody && !headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'application/json';
        }
        const response = await fetch(`${API_BASE}${endpoint}`, {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: headers,
            ...(isWrite && typeof options.keepalive === 'undefined' ? { keepalive: true } : {}),
            ...(method === 'POST' && typeof options.priority === 'undefined' ? { priority: 'high' } : {}),
            ...options,
            headers: headers
        });
        const ct = (response.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) {
            const data = await response.json();
            if (!response.ok && data && typeof data === 'object' && !data.erro) {
                data.erro = data.erro || ('HTTP ' + response.status);
            }
            if (!response.ok && data && typeof data === 'object' && _falhaGatewayHttpStatus(response.status)) {
                data._falhaGateway = true;
            }
            return data;
        }
        const text = await response.text();
        return {
            erro: mensagemErroRespostaNaoJson(response.status, text),
            _falhaGateway: _falhaGatewayHttpStatus(response.status)
        };
    } catch (error) {
        if (error && error.name === 'AbortError') {
            var cancelado = !!(options && options.signal && options.signal.aborted);
            return {
                ok: false,
                erro: cancelado ? 'Operação cancelada.' : 'Tempo esgotado ao contactar o servidor.',
                _cancelado: cancelado,
                _timeout: !cancelado
            };
        }
        console.error('Erro na API:', error);
        showMessage('Erro ao conectar com o servidor', 'error');
        return null;
    }
}

function _ravexLoadingSetCancelVisible(visivel, onCancel) {
    var wrap = document.getElementById('ravex-loading-cancel-wrap');
    var btn = document.getElementById('ravex-loading-cancel');
    if (!wrap || !btn) return;
    if (visivel) {
        wrap.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Cancelar';
        btn.onclick = function() {
            btn.disabled = true;
            btn.textContent = 'Cancelando…';
            if (typeof onCancel === 'function') onCancel();
        };
    } else {
        wrap.style.display = 'none';
        btn.disabled = false;
        btn.textContent = 'Cancelar';
        btn.onclick = null;
    }
}

window._ravexImportAbortController = null;

function _ravexImportAbortarAtivo() {
    if (window._ravexImportAbortController) {
        try { window._ravexImportAbortController.abort(); } catch (e) {}
        window._ravexImportAbortController = null;
    }
}

/** Overlay de carregamento com botão Cancelar (AbortController). */
function _ravexImportSignalLoading(msg) {
    _ravexImportAbortarAtivo();
    var ac = new AbortController();
    window._ravexImportAbortController = ac;
    if (window.ravexLoadingShow) window.ravexLoadingShow(msg || 'Puxando roteiro/viagem da API Ravex...');
    _ravexLoadingSetCancelVisible(true, function() {
        try { ac.abort(); } catch (e) {}
    });
    return ac.signal;
}

function _ravexImportTratarAbort(e, resultadoEl) {
    if (!e || e.name !== 'AbortError') return false;
    _ravexImportAbortarAtivo();
    if (typeof ravexLoadingHide === 'function') ravexLoadingHide();
    if (resultadoEl) {
        resultadoEl.style.display = 'block';
        resultadoEl.style.background = '#eceff1';
        resultadoEl.style.border = '1px solid #90a4ae';
        resultadoEl.innerHTML = 'Download cancelado.';
    }
    if (typeof showMessage === 'function') showMessage('Download cancelado.', 'info');
    return true;
}

function ravexPayloadExtras(base) {
    var o = base && typeof base === 'object' ? Object.assign({}, base) : {};
    var chk = document.getElementById('importar-ravex-forcar-reimportar');
    if (chk && chk.checked) o.forcar_reimportar = true;
    return o;
}
window.ravexPayloadExtras = ravexPayloadExtras;

function ravexLoadingSetProgress(pct, msg) {
    var text = document.getElementById('ravex-loading-text');
    var bar = document.getElementById('ravex-loading-bar');
    if (text && msg) text.textContent = msg;
    if (bar) {
        var p = Math.max(0, Math.min(100, Number(pct) || 0));
        bar.style.width = p + '%';
    }
}
window.ravexLoadingSetProgress = ravexLoadingSetProgress;

async function ravexPollImportarRomaneioJob(jobId, signal) {
    var tentativas = 0;
    while (tentativas < 180) {
        if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
        await new Promise(function(res) { setTimeout(res, 1200); });
        tentativas++;
        var sr = await fetch(API_BASE + '/ravex/importar-romaneio/status/' + encodeURIComponent(jobId), { signal: signal });
        var sd = await sr.json().catch(function() { return {}; });
        if (sr.status === 202) {
            var pct = sd.progress != null ? sd.progress : Math.min(92, 8 + tentativas * 2);
            ravexLoadingSetProgress(pct, sd.message || 'Importando... Aguarde.');
            continue;
        }
        return { ok: sr.ok, status: sr.status, data: sd };
    }
    throw new Error('Tempo esgotado aguardando a importação no servidor. Tente de novo ou use um período menor.');
}

async function ravexPostImportarRomaneio(payload, signal) {
    return ravexPostRavexJob('/ravex/importar-romaneio', payload, signal);
}

async function ravexPostRavexJob(path, payload, signal) {
    var r = await fetch(API_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ravexPayloadExtras(payload)),
        signal: signal
    });
    var data = await r.json().catch(function() { return {}; });
    if (r.status === 202 && data.job_id) {
        ravexLoadingSetProgress(8, 'Processando no servidor...');
        return ravexPollImportarRomaneioJob(data.job_id, signal);
    }
    return { ok: r.ok, status: r.status, data: data };
}

async function ravexVerificarIdJaBaixado(id, signal) {
    if (!id) return { ja_baixado: false, duplicado: false };
    try {
        var url = API_BASE + '/ravex/verificar-baixado?id=' + encodeURIComponent(String(id).trim());
        var opts = {};
        if (signal) opts.signal = signal;
        var r = await fetch(url, opts);
        var data = await r.json().catch(function() { return {}; });
        if (!r.ok) return { ja_baixado: false, duplicado: false, erro: data.erro };
        return data;
    } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        return { ja_baixado: false, duplicado: false };
    }
}

/** Exibe overlay de carregamento com botão Cancelar (ex.: gravar bipagem ao gerar comprovante). */
window.ravexLoadingShowCancelavel = function(msg, onCancel) {
    if (window.ravexLoadingShow) window.ravexLoadingShow(msg);
    _ravexLoadingSetCancelVisible(true, onCancel);
};

// Carregar Estatísticas (usado após bip, etc.)
async function loadEstatisticas() {
    try {
        const stats = await _modFetchGet('/estatisticas', 30000);
        if (stats && !stats.erro) paintEstatisticas(stats);
    } catch (e) {
        console.error('loadEstatisticas:', e);
    }
}

function paintEstatisticas(stats) {
    if (!stats) return;
    const el = (id) => document.getElementById(id);
    if (el('stat-bipados')) el('stat-bipados').textContent = stats.total_bipados ?? 0;
    if (el('stat-soma-quantidades')) el('stat-soma-quantidades').textContent = stats.soma_quantidades ?? 0;
    if (el('stat-carregados')) el('stat-carregados').textContent = stats.total_carregados ?? 0;
    if (el('stat-unicos')) el('stat-unicos').textContent = stats.total_unicos ?? 0;
    if (el('stat-viagens')) el('stat-viagens').textContent = stats.total_viagens ?? 0;
    if (el('stat-divergencias')) el('stat-divergencias').textContent = stats.total_divergencias ?? 0;
    const veiculosContainer = document.getElementById('veiculos-stats');
    if (veiculosContainer) {
        if (stats.veiculos && stats.veiculos.length > 0) {
            veiculosContainer.innerHTML = stats.veiculos.map(v => `
                <div class="veiculo-card">
                    <h4>${(v.veiculo || 'Sem veículo').replace(/</g, '&lt;')}</h4>
                    <p>${v.total} itens</p>
                </div>
            `).join('');
        } else {
            veiculosContainer.innerHTML = '<p class="info-text">Nenhum veículo com itens carregados ainda.</p>';
        }
    }
}

function _painelPlacasStatusClass(status) {
    var s = (status || '').toLowerCase();
    if (s.indexOf('carregado') >= 0 && s.indexOf('não') < 0 && s.indexOf('nao') < 0) return 'painel-status-carregado';
    if (s.indexOf('andamento') >= 0) return 'painel-status-andamento';
    return 'painel-status-pendente';
}

function paintPlacasBaixadasDia(placasDia) {
    placasDia = placasDia || {};
    var rows = placasDia.rows || [];
    var resumo = placasDia.resumo || {};
    var set = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val != null && val !== '' ? val : '0';
    };
    set('stat-placas-total', resumo.total);
    set('stat-placas-carregadas', resumo.carregados);
    set('stat-placas-andamento', resumo.em_andamento);
    set('stat-placas-nao-carregadas', resumo.nao_carregados);
    set('stat-placas-peso-total', resumo.peso_total_kg != null ? Number(resumo.peso_total_kg).toLocaleString('pt-BR') : '0');
    var labelEl = document.getElementById('painel-placas-data-label');
    if (labelEl) labelEl.textContent = placasDia.data ? ('Referência: ' + placasDia.data) : '';
    var dataInput = document.getElementById('painel-placas-data');
    if (dataInput && placasDia.data_iso && !dataInput.value) dataInput.value = placasDia.data_iso;
    var tbody = document.getElementById('tbody-painel-placas-dia');
    if (tbody) {
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading">Nenhuma placa baixada nesta data.</td></tr>';
        } else {
            tbody.innerHTML = rows.map(function(r) {
                var stCls = _painelPlacasStatusClass(r.status);
                return '<tr>'
                    + '<td><strong>' + escapeHtml(r.placa || '—') + '</strong></td>'
                    + '<td>' + escapeHtml(r.id_roteiro || '—') + '</td>'
                    + '<td><strong>' + escapeHtml(r.id_viagem || '—') + '</strong></td>'
                    + '<td><span class="painel-status-badge ' + stCls + '">' + escapeHtml(r.status || '—') + '</span></td>'
                    + '<td>' + escapeHtml(r.inicio_carregamento || '—') + '</td>'
                    + '<td>' + escapeHtml(r.fim_carregamento || '—') + '</td>'
                    + '<td>' + escapeHtml(r.duracao_legivel || (r.duracao_minutos != null ? r.duracao_minutos + ' min' : '—')) + '</td>'
                    + '<td><strong>' + (r.peso_kg != null ? Number(r.peso_kg).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—') + '</strong></td>'
                    + '</tr>';
            }).join('');
        }
    }
    paintPlacasBaixadasCharts(placasDia);
}

function paintPlacasBaixadasCharts(placasDia) {
    if (typeof Chart === 'undefined') return;
    if (chartPlacasStatus) { chartPlacasStatus.destroy(); chartPlacasStatus = null; }
    if (chartPlacasTempo) { chartPlacasTempo.destroy(); chartPlacasTempo = null; }
    if (chartPlacasPeso) { chartPlacasPeso.destroy(); chartPlacasPeso = null; }
    if (chartPlacasResumo) { chartPlacasResumo.destroy(); chartPlacasResumo = null; }
    var rows = (placasDia && placasDia.rows) || [];
    var resumo = (placasDia && placasDia.resumo) || {};
    var opts = { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } };
    var cores = ['#366092', '#4a7ba7', '#5a8bb5', '#6a9bc3', '#7aabd1', '#8bbce0', '#9bccee', '#5c6bc0'];

    var ctxStatus = document.getElementById('chart-placas-status');
    if (ctxStatus) {
        var car = resumo.carregados || 0;
        var and = resumo.em_andamento || 0;
        var nao = resumo.nao_carregados || 0;
        if (car + and + nao === 0) {
            chartPlacasStatus = new Chart(ctxStatus, {
                type: 'doughnut',
                data: { labels: ['Sem dados'], datasets: [{ data: [1], backgroundColor: ['#e0e0e0'] }] },
                options: { ...opts, plugins: { legend: { display: true } } }
            });
        } else {
            chartPlacasStatus = new Chart(ctxStatus, {
                type: 'doughnut',
                data: {
                    labels: ['Carregado', 'Em andamento', 'Não carregado'],
                    datasets: [{
                        data: [car, and, nao],
                        backgroundColor: ['#2e7d32', '#e65100', '#c62828'],
                        borderWidth: 2
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
            });
        }
    }

    var comTempo = rows.filter(function(r) { return r.duracao_minutos != null && r.duracao_minutos > 0; })
        .sort(function(a, b) { return (b.duracao_minutos || 0) - (a.duracao_minutos || 0); })
        .slice(0, 15);
    var ctxTempo = document.getElementById('chart-placas-tempo');
    if (ctxTempo && comTempo.length > 0) {
        chartPlacasTempo = new Chart(ctxTempo, {
            type: 'bar',
            data: {
                labels: comTempo.map(function(r) { return r.placa || r.id_viagem || '—'; }),
                datasets: [{
                    label: 'Minutos',
                    data: comTempo.map(function(r) { return r.duracao_minutos || 0; }),
                    backgroundColor: cores.slice(0, comTempo.length),
                    borderColor: '#1a4d7a',
                    borderWidth: 1
                }]
            },
            options: { ...opts, scales: { y: { beginAtZero: true, title: { display: true, text: 'Minutos' } } } }
        });
    }

    var comPeso = rows.filter(function(r) { return (r.peso_kg || 0) > 0; })
        .sort(function(a, b) { return (b.peso_kg || 0) - (a.peso_kg || 0); })
        .slice(0, 15);
    var ctxPeso = document.getElementById('chart-placas-peso');
    if (ctxPeso && comPeso.length > 0) {
        chartPlacasPeso = new Chart(ctxPeso, {
            type: 'bar',
            data: {
                labels: comPeso.map(function(r) { return r.placa || r.id_viagem || '—'; }),
                datasets: [{
                    label: 'Peso (kg)',
                    data: comPeso.map(function(r) { return r.peso_kg || 0; }),
                    backgroundColor: '#e65100',
                    borderColor: '#bf360c',
                    borderWidth: 1
                }]
            },
            options: { ...opts, scales: { y: { beginAtZero: true, title: { display: true, text: 'kg' } } } }
        });
    }

    var ctxResumo = document.getElementById('chart-placas-resumo');
    if (ctxResumo) {
        var total = resumo.total || 0;
        var carreg = resumo.carregados || 0;
        chartPlacasResumo = new Chart(ctxResumo, {
            type: 'bar',
            data: {
                labels: ['Baixadas', 'Carregadas', 'Em andamento', 'Não carregadas'],
                datasets: [{
                    label: 'Quantidade',
                    data: [total, resumo.carregados || 0, resumo.em_andamento || 0, resumo.nao_carregados || 0],
                    backgroundColor: ['#366092', '#2e7d32', '#e65100', '#c62828'],
                    borderWidth: 1
                }]
            },
            options: { ...opts, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    }
}

function initPainelPlacasFiltroData() {
    if (window._painelPlacasFiltroInit) return;
    window._painelPlacasFiltroInit = true;
    var dataInput = document.getElementById('painel-placas-data');
    var btn = document.getElementById('btn-painel-placas-atualizar');
    if (dataInput && !dataInput.value) {
        var hoje = new Date();
        var pad = function(n) { return (n < 10 ? '0' : '') + n; };
        dataInput.value = hoje.getFullYear() + '-' + pad(hoje.getMonth() + 1) + '-' + pad(hoje.getDate());
    }
    if (btn) {
        btn.addEventListener('click', function() { loadPainelCompleto(); });
    }
    if (dataInput) {
        dataInput.addEventListener('change', function() { loadPainelCompleto(); });
    }
}

// Um único request: painel inteiro (estatísticas + viagens + gráficos) = carregamento instantâneo na rede
async function loadPainelCompleto() {
    initPainelPlacasFiltroData();
    var tbodyPlacas = document.getElementById('tbody-painel-placas-dia');
    var tbodyViagens = document.getElementById('tbody-painel-viagens');
    if (tbodyPlacas) tbodyPlacas.innerHTML = '<tr><td colspan="8" class="loading">Carregando placas do dia...</td></tr>';
    if (tbodyViagens) tbodyViagens.innerHTML = '<tr><td colspan="6" class="loading">Carregando viagens...</td></tr>';
    var dataInput = document.getElementById('painel-placas-data');
    var qs = '';
    if (dataInput && dataInput.value) {
        qs = '?data=' + encodeURIComponent(dataInput.value);
    }
    try {
    const data = await _carregFetchGet('/painel-completo' + qs, 90000);
    if (!data) {
        var err0 = _carregErroMsg(null, 'Não foi possível carregar o painel.');
        showMessage(err0, 'error');
        if (tbodyPlacas) tbodyPlacas.innerHTML = '<tr><td colspan="8" class="loading" style="color:#c62828;">' + escapeHtml(err0) + '</td></tr>';
        if (tbodyViagens) tbodyViagens.innerHTML = '<tr><td colspan="6" class="loading" style="color:#c62828;">' + escapeHtml(err0) + '</td></tr>';
        return;
    }
    if (data.estatisticas) paintEstatisticas(data.estatisticas);
    if (data.erro) showMessage('Painel: ' + data.erro, 'error');
    paintPlacasBaixadasDia(data.placas_baixadas_dia || {});
    paintRomaneioStats(data.romaneio || {});
    const viagens = data.viagens || [];
    const tbody = document.getElementById('tbody-painel-viagens');
    if (tbody) {
        if (viagens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Nenhuma viagem com bipagem ainda.</td></tr>';
        } else {
            tbody.innerHTML = viagens.map(v => `
                <tr>
                    <td><strong>${escapeHtml(v.id_viagem || '-')}</strong></td>
                    <td>${escapeHtml(formatarDataHoraPtBR(v.inicio))}</td>
                    <td>${escapeHtml(formatarDataHoraPtBR(v.fim))}</td>
                    <td>${v.duracao_minutos != null ? v.duracao_minutos : '-'}</td>
                    <td><strong>${v.total_bipados ?? 0}</strong></td>
                    <td style="color: ${(v.total_faltas || 0) > 0 ? '#c62828' : '#2e7d32'}">${v.total_faltas ?? 0}</td>
                </tr>
            `).join('');
        }
    }
    const labels = viagens.slice(0, 15).map(v => v.id_viagem || 'Viagem');
    const cores = ['#366092', '#4a7ba7', '#5a8bb5', '#6a9bc3', '#7aabd1', '#8bbce0', '#9bccee', '#5c6bc0', '#7e57c2', '#9575cd', '#b39ddb', '#ce93d8', '#ab47bc', '#8e24aa', '#6a1b9a'];
    destroyCharts();
    if (typeof Chart !== 'undefined') {
        const opts = { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } };
        const ctxTempo = document.getElementById('chart-tempo-carregamento');
        if (ctxTempo) {
            chartTempoCarregamento = new Chart(ctxTempo, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{ label: 'Minutos', data: viagens.slice(0, 15).map(v => v.duracao_minutos != null ? v.duracao_minutos : 0), backgroundColor: cores.slice(0, labels.length), borderColor: '#1a4d7a', borderWidth: 1 }]
                },
                options: { ...opts, scales: { y: { beginAtZero: true, title: { display: true, text: 'Minutos' } } } }
            });
        }
        const tempoPorPlaca = (data.tempo_por_placa || []).slice(0, 15);
        const ctxTempoPlaca = document.getElementById('chart-tempo-por-placa');
        if (ctxTempoPlaca && tempoPorPlaca.length > 0) {
            chartTempoPorPlaca = new Chart(ctxTempoPlaca, {
                type: 'bar',
                data: {
                    labels: tempoPorPlaca.map(p => p.placa || 'Sem placa'),
                    datasets: [{ label: 'Minutos', data: tempoPorPlaca.map(p => p.total_minutos || 0), backgroundColor: cores.slice(0, tempoPorPlaca.length), borderColor: '#1a4d7a', borderWidth: 1 }]
                },
                options: { ...opts, scales: { y: { beginAtZero: true, title: { display: true, text: 'Minutos' } } } }
            });
        }
        const ctxBipados = document.getElementById('chart-itens-bipados');
        if (ctxBipados) {
            chartItensBipados = new Chart(ctxBipados, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{ label: 'Itens bipados', data: viagens.slice(0, 15).map(v => v.total_bipados || 0), backgroundColor: '#2e7d32', borderColor: '#1b5e20', borderWidth: 1 }]
                },
                options: { ...opts, scales: { y: { beginAtZero: true } } }
            });
        }
        const ctxFaltas = document.getElementById('chart-faltas');
        if (ctxFaltas) {
            chartFaltas = new Chart(ctxFaltas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{ label: 'Faltas', data: viagens.slice(0, 15).map(v => v.total_faltas ?? 0), backgroundColor: '#c62828', borderColor: '#b71c1c', borderWidth: 1 }]
                },
                options: { ...opts, scales: { y: { beginAtZero: true } } }
            });
        }
        const topItens = data.top_itens_bipados || [];
        const ctxItens = document.getElementById('chart-itens-mais-bipados');
        if (ctxItens && topItens.length > 0) {
            chartItensMaisBipados = new Chart(ctxItens, {
                type: 'bar',
                data: {
                    labels: topItens.map(i => i.label),
                    datasets: [{ label: 'Total', data: topItens.map(i => i.total), backgroundColor: '#1565c0', borderColor: '#0d47a1', borderWidth: 1 }]
                },
                options: { ...opts, scales: { y: { beginAtZero: true } } }
            });
        }
        const carrosItens = data.carros_mais_itens || [];
        const ctxCarros = document.getElementById('chart-carros-itens');
        if (ctxCarros && carrosItens.length > 0) {
            chartCarrosItens = new Chart(ctxCarros, {
                type: 'bar',
                data: {
                    labels: carrosItens.map(c => c.veiculo || ''),
                    datasets: [{ label: 'Itens', data: carrosItens.map(c => c.total), backgroundColor: '#6a1b9a', borderColor: '#4a148c', borderWidth: 1 }]
                },
                options: { ...opts, scales: { y: { beginAtZero: true } } }
            });
        }
        const carrosPeso = data.carros_mais_peso || [];
        const ctxPeso = document.getElementById('chart-carros-peso');
        if (ctxPeso && carrosPeso.length > 0) {
            chartCarrosPeso = new Chart(ctxPeso, {
                type: 'bar',
                data: {
                    labels: carrosPeso.map(c => c.veiculo || ''),
                    datasets: [{ label: 'Peso (kg)', data: carrosPeso.map(c => c.peso_total), backgroundColor: '#e65100', borderColor: '#bf360c', borderWidth: 1 }]
                },
                options: { ...opts, scales: { y: { beginAtZero: true } } }
            });
        }
        paintRomaneioCharts(data.romaneio || {});
    }
    } catch (e) {
        console.error('loadPainelCompleto', e);
        var errP = (e && e.message) || 'Erro ao carregar o painel.';
        showMessage('Erro ao carregar o painel: ' + errP, 'error');
        if (tbodyPlacas) tbodyPlacas.innerHTML = '<tr><td colspan="8" class="loading" style="color:#c62828;">' + escapeHtml(errP) + '</td></tr>';
        if (tbodyViagens) tbodyViagens.innerHTML = '<tr><td colspan="6" class="loading" style="color:#c62828;">' + escapeHtml(errP) + '</td></tr>';
    }
}

function paintRomaneioStats(romaneio) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val != null && val !== '' ? val : '—';
    };
    set('stat-romaneio-roteiros', romaneio.qtd_roteiros);
    set('stat-romaneio-veiculos', romaneio.qtd_veiculos);
    set('stat-romaneio-qtd-itens', romaneio.quantidade_total_itens);
    set('stat-romaneio-peso-total', romaneio.peso_total_geral != null ? romaneio.peso_total_geral + ' kg' : null);
    const itens = romaneio.itens_total_por_codigo || {};
    const descricoes = romaneio.itens_descricao_por_codigo || {};
    const tbodyItens = document.getElementById('tbody-romaneio-itens');
    if (tbodyItens) {
        const entries = Object.entries(itens).sort((a, b) => (b[1] || 0) - (a[1] || 0));
        if (entries.length === 0) {
            tbodyItens.innerHTML = '<tr><td colspan="3" class="loading">Nenhum item na planilha ou planilha não carregada.</td></tr>';
        } else {
            tbodyItens.innerHTML = entries.map(([cod, qtd]) => {
                const desc = descricoes[cod] || '—';
                return '<tr><td>' + escapeHtml(cod) + '</td><td>' + escapeHtml(desc) + '</td><td><strong>' + (qtd || 0) + '</strong></td></tr>';
            }).join('');
        }
    }
    const pesoCarro = romaneio.peso_por_carro || {};
    const tbodyPeso = document.getElementById('tbody-romaneio-peso-carro');
    if (tbodyPeso) {
        const entries = Object.entries(pesoCarro).sort((a, b) => (b[1] || 0) - (a[1] || 0));
        if (entries.length === 0) {
            tbodyPeso.innerHTML = '<tr><td colspan="2" class="loading">Nenhum veículo na planilha ou planilha não carregada.</td></tr>';
        } else {
            tbodyPeso.innerHTML = entries.map(([placa, peso]) =>
                '<tr><td>' + escapeHtml(placa) + '</td><td><strong>' + (peso != null ? peso + ' kg' : '—') + '</strong></td></tr>'
            ).join('');
        }
    }
}

// Gráficos do Romaneio por item (dados da aba ROMANEIO POR ITEM)
function paintRomaneioCharts(romaneio) {
    if (typeof Chart === 'undefined') return;
    if (chartRomaneioRoteirosVeiculos) { chartRomaneioRoteirosVeiculos.destroy(); chartRomaneioRoteirosVeiculos = null; }
    if (chartRomaneioQtdItens) { chartRomaneioQtdItens.destroy(); chartRomaneioQtdItens = null; }
    if (chartRomaneioPesoCarro) { chartRomaneioPesoCarro.destroy(); chartRomaneioPesoCarro = null; }
    if (chartRomaneioPesoTotal) { chartRomaneioPesoTotal.destroy(); chartRomaneioPesoTotal = null; }

    const opts = { responsive: true, maintainAspectRatio: true };
    const cores = ['#366092', '#4a7ba7', '#5a8bb5', '#6a9bc3', '#7aabd1', '#8bbce0', '#9bccee', '#5c6bc0', '#7e57c2', '#9575cd', '#b39ddb', '#ce93d8', '#ab47bc', '#8e24aa', '#6a1b9a'];

    // 1. Roteiros e Veículos
    const ctxRoteiros = document.getElementById('chart-romaneio-roteiros-veiculos');
    if (ctxRoteiros) {
        const qtdR = romaneio.qtd_roteiros != null ? Number(romaneio.qtd_roteiros) : 0;
        const qtdV = romaneio.qtd_veiculos != null ? Number(romaneio.qtd_veiculos) : 0;
        const maxRoteiros = Math.max(1, qtdR, qtdV);
        chartRomaneioRoteirosVeiculos = new Chart(ctxRoteiros, {
            type: 'bar',
            data: {
                labels: ['Roteiros', 'Veículos'],
                datasets: [{
                    label: 'Quantidade',
                    data: [qtdR, qtdV],
                    backgroundColor: ['#366092', '#2e7d32'],
                    borderColor: ['#1a4d7a', '#1b5e20'],
                    borderWidth: 1
                }]
            },
            options: { ...opts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: maxRoteiros, ticks: { stepSize: 1 } } } }
        });
    }

    // 2. Quantidade por item (código do produto) – top 15
    const itens = romaneio.itens_total_por_codigo || {};
    const itensSorted = Object.entries(itens).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 15);
    const ctxItens = document.getElementById('chart-romaneio-qtd-itens');
    if (ctxItens && itensSorted.length > 0) {
        chartRomaneioQtdItens = new Chart(ctxItens, {
            type: 'bar',
            data: {
                labels: itensSorted.map(([cod]) => (cod || '').length > 12 ? (cod || '').substring(0, 12) + '…' : (cod || '')),
                datasets: [{
                    label: 'Quantidade',
                    data: itensSorted.map(([, qtd]) => qtd || 0),
                    backgroundColor: cores.slice(0, itensSorted.length),
                    borderColor: '#1a4d7a',
                    borderWidth: 1
                }]
            },
            options: { ...opts, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
        });
    }

    // 3. Peso por carro (veículo)
    const pesoCarro = romaneio.peso_por_carro || {};
    const pesoCarroSorted = Object.entries(pesoCarro).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 15);
    const ctxPesoCarro = document.getElementById('chart-romaneio-peso-carro');
    if (ctxPesoCarro && pesoCarroSorted.length > 0) {
        chartRomaneioPesoCarro = new Chart(ctxPesoCarro, {
            type: 'bar',
            data: {
                labels: pesoCarroSorted.map(([placa]) => (placa || '').length > 10 ? (placa || '').substring(0, 10) + '…' : (placa || '')),
                datasets: [{
                    label: 'Peso (kg)',
                    data: pesoCarroSorted.map(([, p]) => p != null ? Number(p) : 0),
                    backgroundColor: cores.slice(0, pesoCarroSorted.length),
                    borderColor: '#1a4d7a',
                    borderWidth: 1
                }]
            },
            options: { ...opts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'kg' } } } }
        });
    }

    // 4. Peso total (todos os roteiros) – doughnut com um único segmento (mínimo 1 para exibir o anel)
    const pesoTotal = romaneio.peso_total_geral != null ? Number(romaneio.peso_total_geral) : 0;
    const ctxPesoTotal = document.getElementById('chart-romaneio-peso-total');
    if (ctxPesoTotal) {
        const valorExibir = pesoTotal > 0 ? pesoTotal : 1;
        chartRomaneioPesoTotal = new Chart(ctxPesoTotal, {
            type: 'doughnut',
            data: {
                labels: ['Peso total (kg)'],
                datasets: [{
                    data: [valorExibir],
                    backgroundColor: ['#366092'],
                    borderColor: ['#1a4d7a'],
                    borderWidth: 2
                }]
            },
            options: {
                ...opts,
                cutout: '60%',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => 'Total: ' + (ctx.raw || 0).toLocaleString('pt-BR') + ' kg' } }
                }
            },
            plugins: [{
                id: 'pesoTotalCenter',
                afterDraw: (chart) => {
                    const ctx = chart.ctx;
                    const width = chart.width;
                    const height = chart.height;
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 18px sans-serif';
                    ctx.fillStyle = '#333';
                    ctx.fillText((pesoTotal > 0 ? pesoTotal : 0).toLocaleString('pt-BR') + ' kg', width / 2, height / 2 - 8);
                    ctx.font = '12px sans-serif';
                    ctx.fillStyle = '#666';
                    ctx.fillText('Peso total', width / 2, height / 2 + 14);
                    ctx.restore();
                }
            }]
        });
    }
}

// Gráficos do painel (Chart.js)
let chartTempoCarregamento = null;
let chartTempoPorPlaca = null;
let chartItensBipados = null;
let chartFaltas = null;
let chartItensMaisBipados = null;
let chartCarrosItens = null;
let chartCarrosPeso = null;
let chartRomaneioRoteirosVeiculos = null;
let chartRomaneioQtdItens = null;
let chartRomaneioPesoCarro = null;
let chartRomaneioPesoTotal = null;
let chartPlacasStatus = null;
let chartPlacasTempo = null;
let chartPlacasPeso = null;
let chartPlacasResumo = null;
let devChartItensMaisDevolvidos = null;
let devChartVeiculosDevolucoes = null;
let devChartDocasDevolucoes = null;
let devChartUsuariosDevolucoes = null;

function destroyCharts() {
    if (chartTempoCarregamento) { chartTempoCarregamento.destroy(); chartTempoCarregamento = null; }
    if (chartTempoPorPlaca) { chartTempoPorPlaca.destroy(); chartTempoPorPlaca = null; }
    if (chartItensBipados) { chartItensBipados.destroy(); chartItensBipados = null; }
    if (chartFaltas) { chartFaltas.destroy(); chartFaltas = null; }
    if (chartItensMaisBipados) { chartItensMaisBipados.destroy(); chartItensMaisBipados = null; }
    if (chartCarrosItens) { chartCarrosItens.destroy(); chartCarrosItens = null; }
    if (chartCarrosPeso) { chartCarrosPeso.destroy(); chartCarrosPeso = null; }
    if (chartRomaneioRoteirosVeiculos) { chartRomaneioRoteirosVeiculos.destroy(); chartRomaneioRoteirosVeiculos = null; }
    if (chartRomaneioQtdItens) { chartRomaneioQtdItens.destroy(); chartRomaneioQtdItens = null; }
    if (chartRomaneioPesoCarro) { chartRomaneioPesoCarro.destroy(); chartRomaneioPesoCarro = null; }
    if (chartRomaneioPesoTotal) { chartRomaneioPesoTotal.destroy(); chartRomaneioPesoTotal = null; }
    if (chartPlacasStatus) { chartPlacasStatus.destroy(); chartPlacasStatus = null; }
    if (chartPlacasTempo) { chartPlacasTempo.destroy(); chartPlacasTempo = null; }
    if (chartPlacasPeso) { chartPlacasPeso.destroy(); chartPlacasPeso = null; }
    if (chartPlacasResumo) { chartPlacasResumo.destroy(); chartPlacasResumo = null; }
}

function destroyPainelDevolucoesCharts() {
    if (devChartItensMaisDevolvidos) { devChartItensMaisDevolvidos.destroy(); devChartItensMaisDevolvidos = null; }
    if (devChartVeiculosDevolucoes) { devChartVeiculosDevolucoes.destroy(); devChartVeiculosDevolucoes = null; }
    if (devChartDocasDevolucoes) { devChartDocasDevolucoes.destroy(); devChartDocasDevolucoes = null; }
    if (devChartUsuariosDevolucoes) { devChartUsuariosDevolucoes.destroy(); devChartUsuariosDevolucoes = null; }
}

function renderPainelDevolucoesCharts(data) {
    destroyPainelDevolucoesCharts();
    if (typeof Chart === 'undefined') return;

    const topItens = (data.top_itens || []).slice(0, 8);
    const veiculos = (data.veiculos || []).slice(0, 8);
    const docas = (data.docas || []).slice(0, 8);
    const usuarios = (data.usuarios || []).slice(0, 8);
    const cores = ['#366092', '#5c6bc0', '#26a69a', '#42a5f5', '#7e57c2', '#ef5350', '#ffa726', '#66bb6a'];
    const optsPadrao = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        }
    };

    const ctxItens = document.getElementById('dev-chart-itens-mais-devolvidos');
    if (ctxItens && topItens.length > 0) {
        devChartItensMaisDevolvidos = new Chart(ctxItens, {
            type: 'bar',
            data: {
                labels: topItens.map(function(i) { return i.produto || i.codigo_barras || 'Item'; }),
                datasets: [{
                    label: 'Quantidade devolvida',
                    data: topItens.map(function(i) { return i.total || 0; }),
                    backgroundColor: '#5c6bc0',
                    borderColor: '#3949ab',
                    borderWidth: 1
                }]
            },
            options: {
                ...optsPadrao,
                indexAxis: 'y',
                scales: {
                    x: { beginAtZero: true, title: { display: true, text: 'Quantidade' } }
                }
            }
        });
    }

    const ctxVeiculos = document.getElementById('dev-chart-veiculos-devolucoes');
    if (ctxVeiculos && veiculos.length > 0) {
        devChartVeiculosDevolucoes = new Chart(ctxVeiculos, {
            type: 'bar',
            data: {
                labels: veiculos.map(function(v) { return v.veiculo || 'Sem veículo'; }),
                datasets: [{
                    label: 'Quantidade devolvida',
                    data: veiculos.map(function(v) { return v.total || 0; }),
                    backgroundColor: '#2e7d32',
                    borderColor: '#1b5e20',
                    borderWidth: 1
                }]
            },
            options: {
                ...optsPadrao,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Quantidade' } }
                }
            }
        });
    }

    const ctxDocas = document.getElementById('dev-chart-docas-devolucoes');
    if (ctxDocas && docas.length > 0) {
        devChartDocasDevolucoes = new Chart(ctxDocas, {
            type: 'doughnut',
            data: {
                labels: docas.map(function(d) { return d.doca || 'Sem doca'; }),
                datasets: [{
                    data: docas.map(function(d) { return d.total || 0; }),
                    backgroundColor: cores.slice(0, docas.length),
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    const ctxUsuarios = document.getElementById('dev-chart-usuarios-devolucoes');
    if (ctxUsuarios && usuarios.length > 0) {
        devChartUsuariosDevolucoes = new Chart(ctxUsuarios, {
            type: 'pie',
            data: {
                labels: usuarios.map(function(u) { return u.usuario || 'Sem usuário'; }),
                datasets: [{
                    data: usuarios.map(function(u) { return u.total || 0; }),
                    backgroundColor: cores.slice(0, usuarios.length),
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }
}

async function loadPainelGraficos() {
    const tbody = document.getElementById('tbody-painel-viagens');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading">Carregando gráficos...</td></tr>';
    try {
    const [data, extras] = await Promise.all([
        _modFetchGet('/painel-graficos', 60000),
        _modFetchGet('/painel-graficos-extras', 60000)
    ]);
    if (!data || data.erro || !data.viagens) {
        var msgGraf = (data && data.erro) ? _modErroMsg(data, data.erro) : 'Nenhuma viagem com bipagem ainda.';
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading"' + (data && data.erro ? ' style="color:#c62828;"' : '') + '>' + escapeHtml(msgGraf) + '</td></tr>';
        destroyCharts();
        return;
    }
    const viagens = data.viagens;
    if (tbody) {
        if (viagens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Nenhuma viagem com bipagem ainda.</td></tr>';
        } else {
            tbody.innerHTML = viagens.map(v => `
                <tr>
                    <td><strong>${escapeHtml(v.id_viagem || '-')}</strong></td>
                    <td>${escapeHtml(formatarDataHoraPtBR(v.inicio))}</td>
                    <td>${escapeHtml(formatarDataHoraPtBR(v.fim))}</td>
                    <td>${v.duracao_minutos != null ? v.duracao_minutos : '-'}</td>
                    <td><strong>${v.total_bipados ?? 0}</strong></td>
                    <td style="color: ${(v.total_faltas || 0) > 0 ? '#c62828' : '#2e7d32'}">${v.total_faltas ?? 0}</td>
                </tr>
            `).join('');
        }
    }

    const labels = viagens.slice(0, 15).map(v => v.id_viagem || 'Viagem');
    const cores = ['#366092', '#4a7ba7', '#5a8bb5', '#6a9bc3', '#7aabd1', '#8bbce0', '#9bccee', '#5c6bc0', '#7e57c2', '#9575cd', '#b39ddb', '#ce93d8', '#ab47bc', '#8e24aa', '#6a1b9a'];

    destroyCharts();
    if (typeof Chart === 'undefined') return;

    const opts = { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } };

    const ctxTempo = document.getElementById('chart-tempo-carregamento');
    if (ctxTempo) {
        chartTempoCarregamento = new Chart(ctxTempo, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Minutos',
                    data: viagens.slice(0, 15).map(v => v.duracao_minutos != null ? v.duracao_minutos : 0),
                    backgroundColor: cores.slice(0, labels.length),
                    borderColor: '#1a4d7a',
                    borderWidth: 1
                }]
            },
            options: { ...opts, scales: { y: { beginAtZero: true, title: { display: true, text: 'Minutos' } } } }
        });
    }

    const tempoPorPlaca = (data.tempo_por_placa || []).slice(0, 15);
    const ctxTempoPlaca = document.getElementById('chart-tempo-por-placa');
    if (ctxTempoPlaca && tempoPorPlaca.length > 0) {
        chartTempoPorPlaca = new Chart(ctxTempoPlaca, {
            type: 'bar',
            data: {
                labels: tempoPorPlaca.map(p => p.placa || 'Sem placa'),
                datasets: [{
                    label: 'Minutos',
                    data: tempoPorPlaca.map(p => p.total_minutos || 0),
                    backgroundColor: cores.slice(0, tempoPorPlaca.length),
                    borderColor: '#1a4d7a',
                    borderWidth: 1
                }]
            },
            options: { ...opts, scales: { y: { beginAtZero: true, title: { display: true, text: 'Minutos' } } } }
        });
    }

    const ctxBipados = document.getElementById('chart-itens-bipados');
    if (ctxBipados) {
        chartItensBipados = new Chart(ctxBipados, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Itens bipados',
                    data: viagens.slice(0, 15).map(v => v.total_bipados || 0),
                    backgroundColor: '#2e7d32',
                    borderColor: '#1b5e20',
                    borderWidth: 1
                }]
            },
            options: { ...opts, scales: { y: { beginAtZero: true, title: { display: true, text: 'Quantidade' } } } }
        });
    }

    const ctxFaltas = document.getElementById('chart-faltas');
    if (ctxFaltas) {
        chartFaltas = new Chart(ctxFaltas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Faltas',
                    data: viagens.slice(0, 15).map(v => v.total_faltas || 0),
                    backgroundColor: viagens.slice(0, 15).map(v => (v.total_faltas || 0) > 0 ? '#c62828' : '#81c784'),
                    borderColor: '#b71c1c',
                    borderWidth: 1
                }]
            },
            options: { ...opts, scales: { y: { beginAtZero: true, title: { display: true, text: 'Faltas' } } } }
        });
    }

    // Gráficos extras (dados já obtidos em paralelo)
    if (extras && typeof Chart !== 'undefined') {
        const topItens = extras.top_itens_bipados || [];
        const carrosItens = extras.carros_mais_itens || [];
        const carrosPeso = extras.carros_mais_peso || [];
        const optsExtras = { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } };

        const ctxItens = document.getElementById('chart-itens-mais-bipados');
        if (ctxItens && topItens.length > 0) {
            chartItensMaisBipados = new Chart(ctxItens, {
                type: 'bar',
                data: {
                    labels: topItens.map(i => i.label),
                    datasets: [{ label: 'Qtd', data: topItens.map(i => i.total), backgroundColor: '#5c6bc0', borderColor: '#3949ab', borderWidth: 1 }]
                },
                options: { ...optsExtras, indexAxis: 'y', scales: { x: { beginAtZero: true } } }
            });
        }

        const ctxCarrosItens = document.getElementById('chart-carros-itens');
        if (ctxCarrosItens && carrosItens.length > 0) {
            chartCarrosItens = new Chart(ctxCarrosItens, {
                type: 'bar',
                data: {
                    labels: carrosItens.map(c => c.veiculo),
                    datasets: [{ label: 'Itens', data: carrosItens.map(c => c.total), backgroundColor: '#2e7d32', borderColor: '#1b5e20', borderWidth: 1 }]
                },
                options: { ...optsExtras, scales: { y: { beginAtZero: true } } }
            });
        }

        const ctxCarrosPeso = document.getElementById('chart-carros-peso');
        if (ctxCarrosPeso && carrosPeso.length > 0) {
            chartCarrosPeso = new Chart(ctxCarrosPeso, {
                type: 'bar',
                data: {
                    labels: carrosPeso.map(c => c.veiculo),
                    datasets: [{ label: 'Peso', data: carrosPeso.map(c => c.peso_total), backgroundColor: '#1565c0', borderColor: '#0d47a1', borderWidth: 1 }]
                },
                options: { ...optsExtras, scales: { y: { beginAtZero: true, title: { display: true, text: 'Peso' } } } }
            });
        }
    }
    } catch (e) {
        console.error('loadPainelGraficos:', e);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(null, (e && e.message) || 'Erro ao carregar gráficos.')) + '</td></tr>';
        destroyCharts();
    }
}

// Carregar BASE da Planilha (todas as colunas, com filtros)
// Não usa overlay full-screen para permitir trocar de aba enquanto carrega; loading só na área da tabela.
var BASE_COLUNA_LABELS = {
    'Codigo': 'Cód. interno',
    'Descricao': 'Descrição',
    'Cod. EAN-13': 'EAN',
    'Cod. DUN-14': 'DUN',
    'Unidade': 'Unidade',
    'Peso Bruto': 'Peso (kg)'
};

function _labelColunaBase(h) {
    return BASE_COLUNA_LABELS[h] || h;
}

async function loadBasePlanilha(showLoadingState) {
    const thead = document.getElementById('thead-base');
    const tbody = document.getElementById('tbody-base');
    const isRefresh = tbody && tbody.rows.length > 0 && !(tbody.rows.length === 1 && tbody.rows[0].cells.length === 1 && tbody.rows[0].querySelector('.loading'));
    const showLoading = thead && tbody && (showLoadingState === true || !isRefresh);
    if (thead && tbody && showLoading) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Carregando...</td></tr>';
    }
    const codigo = document.getElementById('filtro-base-codigo')?.value?.trim() || '';
    const codInterno = document.getElementById('filtro-base-cod-interno')?.value?.trim() || '';
    const descricao = document.getElementById('filtro-base-descricao')?.value?.trim() || '';
    const ean = document.getElementById('filtro-base-ean')?.value?.trim() || '';
    const dun = document.getElementById('filtro-base-dun')?.value?.trim() || '';
    const unidade = document.getElementById('filtro-base-unidade')?.value?.trim() || '';
    const params = new URLSearchParams();
    if (codigo) params.set('codigo_barras', codigo);
    if (codInterno) params.set('codigo_interno', codInterno);
    if (descricao) params.set('descricao', descricao);
    if (ean) params.set('ean', ean);
    if (dun) params.set('dun', dun);
    if (unidade) params.set('unidade', unidade);
    const url = '/base-planilha' + (params.toString() ? '?' + params.toString() : '');
    try {
        const data = await _carregFetchGet(url, 60000);

        if (!thead || !tbody) return;

        if (data && data.headers && Array.isArray(data.headers)) {
            var dataHeaders = data.headers.filter(function(h) { return h !== '_id'; });
            thead.innerHTML = '<tr>' + dataHeaders.map(h => `<th>${escapeHtml(_labelColunaBase(h))}</th>`).join('') + '<th>Ações</th></tr>';
            const cols = dataHeaders.length + 1;
            if (!data.rows || data.rows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="' + cols + '" class="loading">Nenhum dado encontrado na base de produtos.</td></tr>';
            } else {
                tbody.innerHTML = data.rows.map(row => {
                    var cells = dataHeaders.map(h => `<td>${escapeHtml(row[h] != null ? String(row[h]) : '')}</td>`).join('');
                    var id = row._id != null ? row._id : '';
                    cells += '<td><button type="button" class="btn-secondary btn-sm" data-base-edit-id="' + escapeHtml(String(id)) + '">Editar</button> ';
                    cells += '<button type="button" class="btn-danger btn-sm" data-base-delete-id="' + escapeHtml(String(id)) + '">Excluir</button></td>';
                    return '<tr>' + cells + '</tr>';
                }).join('');
                window._lastBaseHeaders = dataHeaders;
                tbody.querySelectorAll('[data-base-edit-id]').forEach(function(btn) {
                    var id = btn.getAttribute('data-base-edit-id');
                    if (!id) return;
                    btn.addEventListener('click', function() {
                        var row = data.rows.find(function(r) { return String(r._id) === String(id); });
                        if (row) openModalBaseItem(row, dataHeaders);
                    });
                });
                tbody.querySelectorAll('[data-base-delete-id]').forEach(function(btn) {
                    var id = btn.getAttribute('data-base-delete-id');
                    if (!id) return;
                    btn.addEventListener('click', function() { openModalExcluirBaseItem(id); });
                });
            }
        } else if (data === null || (data && data.erro)) {
            thead.innerHTML = '<tr><th>Erro</th></tr>';
            tbody.innerHTML = '<tr><td class="loading" style="color:#c62828;">' + escapeHtml(_carregErroMsg(data, 'Erro ao carregar dados. Configure DATABASE_URL para usar as tabelas.')) + '</td></tr>';
        }
    } catch (e) {
        if (thead && tbody) {
            thead.innerHTML = '<tr><th>Erro</th></tr>';
            tbody.innerHTML = '<tr><td class="loading" style="color:#c62828;">' + escapeHtml((e && e.message) || 'Erro ao carregar base de produtos.') + '</td></tr>';
        }
    } finally {
        // Sem overlay: usuário pode trocar de aba enquanto carrega
    }
}

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function initFiltrosBase() {
    document.getElementById('btn-filtrar-base')?.addEventListener('click', () => loadBasePlanilha(true));
    document.getElementById('btn-limpar-filtros-base')?.addEventListener('click', () => {
        const cod = document.getElementById('filtro-base-codigo');
        const codInt = document.getElementById('filtro-base-cod-interno');
        const desc = document.getElementById('filtro-base-descricao');
        const ean = document.getElementById('filtro-base-ean');
        const dun = document.getElementById('filtro-base-dun');
        const un = document.getElementById('filtro-base-unidade');
        if (cod) cod.value = '';
        if (codInt) codInt.value = '';
        if (desc) desc.value = '';
        if (ean) ean.value = '';
        if (dun) dun.value = '';
        if (un) un.value = '';
        loadBasePlanilha(true);
    });
    document.getElementById('btn-base-adicionar')?.addEventListener('click', function() {
        var headers = window._lastBaseHeaders || ['Codigo', 'Descricao', 'Unidade', 'Cod. EAN-13', 'Cod. DUN-14', 'Peso Bruto'];
        openModalBaseItem(null, headers);
    });
}

function openModalBaseItem(row, headers) {
    var modal = document.getElementById('modal-base-item');
    var titulo = document.getElementById('modal-base-item-titulo');
    var campos = document.getElementById('form-base-item-campos');
    var form = document.getElementById('form-base-item');
    if (!modal || !campos || !form) return;
    form.dataset.baseEditId = row && row._id != null ? String(row._id) : '';
    titulo.textContent = row ? 'Editar produto na base' : 'Cadastrar produto na base';
    campos.innerHTML = (headers || []).map(function(h) {
        var val = row && row[h] != null ? String(row[h]) : '';
        var id = 'base-item-' + h.replace(/\s+/g, '_').replace(/\./g, '_');
        return '<div class="form-group" style="margin-bottom: 0.5rem;"><label for="' + id + '">' + escapeHtml(_labelColunaBase(h)) + '</label><input type="text" id="' + id + '" name="' + escapeHtml(h) + '" value="' + escapeHtml(val) + '" style="width: 100%; max-width: 100%;"></div>';
    }).join('');
    modal.style.display = 'block';
}

function closeModalBaseItem() {
    var modal = document.getElementById('modal-base-item');
    if (modal) modal.style.display = 'none';
}

var _baseExcluirId = null;

function openModalExcluirBaseItem(id) {
    _baseExcluirId = id;
    var modal = document.getElementById('modal-base-excluir');
    if (modal) modal.style.display = 'block';
}

function closeModalExcluirBaseItem() {
    _baseExcluirId = null;
    var modal = document.getElementById('modal-base-excluir');
    if (modal) modal.style.display = 'none';
}

async function confirmExcluirBaseItem() {
    if (!_baseExcluirId) return;
    var id = _baseExcluirId;
    closeModalExcluirBaseItem();
    var resp = await fetchAPI('/base-item/' + encodeURIComponent(id), { method: 'DELETE' });
    if (resp && resp.erro) {
        showMessage(resp.erro, 'error');
        return;
    }
    showMessage(resp && resp.mensagem ? resp.mensagem : 'Registro excluído.', 'success');
    loadBasePlanilha(true);
}

async function submitBaseItem(e) {
    e.preventDefault();
    var form = document.getElementById('form-base-item');
    var campos = document.getElementById('form-base-item-campos');
    if (!form || !campos) return;
    var payload = {};
    campos.querySelectorAll('input[name]').forEach(function(input) {
        var name = input.getAttribute('name');
        if (name) payload[name] = input.value.trim();
    });
    var editId = form.dataset.baseEditId || '';
    var url = editId ? '/base-item/' + encodeURIComponent(editId) : '/base-item';
    var method = editId ? 'PUT' : 'POST';
    var resp = await fetchAPI(url, { method: method, body: JSON.stringify(payload) });
    if (resp && resp.erro) {
        showMessage(resp.erro, 'error');
        return;
    }
    showMessage(resp && resp.mensagem ? resp.mensagem : (editId ? 'Atualizado.' : 'Cadastrado.'), 'success');
    closeModalBaseItem();
    loadBasePlanilha(true);
    var idVConf = window._getIdViagemAtivo && window._getIdViagemAtivo();
    if (idVConf && typeof reloadConferenciaAtiva === 'function') {
        reloadConferenciaAtiva(idVConf, { forcar: true, aguardarBipagem: false });
    }
}

function initBaseItemModal() {
    var form = document.getElementById('form-base-item');
    form?.addEventListener('submit', submitBaseItem);
    document.getElementById('modal-base-item-close')?.addEventListener('click', closeModalBaseItem);
    document.getElementById('btn-base-item-cancelar')?.addEventListener('click', closeModalBaseItem);
    document.getElementById('modal-base-item')?.addEventListener('click', function(e) {
        if (e.target.id === 'modal-base-item') closeModalBaseItem();
    });
    document.getElementById('btn-base-excluir-confirmar')?.addEventListener('click', confirmExcluirBaseItem);
    document.getElementById('modal-base-excluir-close')?.addEventListener('click', closeModalExcluirBaseItem);
    document.getElementById('btn-base-excluir-cancelar')?.addEventListener('click', closeModalExcluirBaseItem);
    document.getElementById('modal-base-excluir')?.addEventListener('click', function(e) {
        if (e.target.id === 'modal-base-excluir') closeModalExcluirBaseItem();
    });
}

// Carregar Produtos (para uso interno)
async function loadProdutos() {
    const produtos = await fetchAPI('/produtos');
    return produtos;
}

// Se o leitor ler dois códigos grudados (um na frente do outro), usa só o primeiro
function normalizarCodigoBarrasDuplicado(codigo) {
    if (!codigo || codigo.length < 4) return codigo;
    const s = String(codigo).trim();
    const n = s.length;
    if (n % 2 !== 0) return s;
    const metade = n / 2;
    if (s.slice(0, metade) === s.slice(metade)) return s.slice(0, metade);
    return s;
}

// Adicionar Produto (forcarAdicionar = true quando usuário confirma; dadosOverride = payload do modal de cadastro)
async function addProduto(forcarAdicionar, dadosOverride) {
    let codigoBarras, produto, quantidade, veiculo, status, idViagem;
    if (dadosOverride) {
        codigoBarras = (dadosOverride.codigo_barras || '').trim();
        produto = (dadosOverride.produto || '').trim();
        quantidade = parseInt(dadosOverride.quantidade) || 1;
        veiculo = (dadosOverride.veiculo || '').trim();
        status = dadosOverride.status || 'PENDENTE';
        idViagem = (dadosOverride.id_viagem || '').trim();
    } else {
        const inputCodigo = window._elBipagem('codigo-barras');
        codigoBarras = (inputCodigo && inputCodigo.value || '').trim();
        codigoBarras = normalizarCodigoBarrasDuplicado(codigoBarras);
        // Não limpar o campo aqui: só limpar após sucesso, para não aparecer modal com campo vazio
        produto = (window._elBipagem('produto-nome') && window._elBipagem('produto-nome').value || '').trim();
        let qRaw = parseInt(window._elBipagem('quantidade') && window._elBipagem('quantidade').value, 10);
        quantidade = (typeof qRaw === 'number' && !isNaN(qRaw) && qRaw >= 1 && qRaw <= 99999) ? qRaw : 1;
        veiculo = (window._elBipagem('veiculo') && window._elBipagem('veiculo').value || '').trim();
        status = (window._elBipagem('status') && window._elBipagem('status').value) || 'PENDENTE';
        idViagem = window._getIdViagemAtivo();
    }
    
    let doca = (dadosOverride && dadosOverride.doca !== undefined) ? String(dadosOverride.doca).trim() : (window._elBipagem('doca') && window._elBipagem('doca').value || '').trim();
    
    if (!codigoBarras) {
        showMessage('Código de barras é obrigatório', 'error');
        return;
    }
    if (!idViagem) {
        showMessage('Por favor, selecione uma viagem primeiro', 'error');
        if (!dadosOverride) {
            var cbNv = window._elBipagem('codigo-barras');
            if (cbNv) { cbNv.value = codigoBarras; cbNv.focus(); }
        }
        return;
    }
    
    const docasValidas = ['1', '2', '3', '4'];
    if (window._fluxoBipagemAtivo === 'devolucao' && (!doca || !docasValidas.includes(doca))) {
        doca = '1';
        var docaDev = window._elBipagem('doca');
        if (docaDev) docaDev.value = '1';
    }
    if (window._fluxoBipagemAtivo === 'devolucao' && (!window._devolucaoNfAtiva || !window._devolucaoNfAtiva.id)) {
        showMessage('Inicie uma NF (número + motivo) antes de bipar o retorno.', 'error');
        return;
    }
    if (!doca || !docasValidas.includes(doca)) {
        showMessage('Selecione a doca antes de bipar', 'error');
        if (!dadosOverride) {
            var cbDoca = window._elBipagem('codigo-barras');
            if (cbDoca) cbDoca.value = codigoBarras;
        }
        const codigoInput = window._elBipagem('codigo-barras');
        if (codigoInput) codigoInput.focus();
        return;
    }
    
    const payload = {
        codigo_barras: codigoBarras,
        produto: produto,
        quantidade: quantidade,
        veiculo: veiculo,
        status: status,
        id_viagem: idViagem,
        doca: doca,
        fluxo: (typeof window._fluxoBipagemAtivo === 'string' && window._fluxoBipagemAtivo === 'devolucao') ? 'devolucao' : 'carregamento'
    };
    if (window._fluxoBipagemAtivo === 'devolucao' && window._devolucaoNfAtiva && window._devolucaoNfAtiva.id) {
        payload.devolucao_nf_id = window._devolucaoNfAtiva.id;
    }
    if (forcarAdicionar) {
        payload.forcar_adicionar = true;
        if (dadosOverride) {
            payload.codigo_interno = (dadosOverride.codigo_interno || '').trim();
            payload.codigo_dun = (dadosOverride.codigo_dun || '').trim();
            payload.peso = (dadosOverride.peso || '').trim();
            var u = dadosOverride.unidade;
            payload.unidade = (u !== undefined && u !== null) ? String(u).trim() : '';
        }
    }

    const codigoProdutoEl = window._elBipagem('codigo-produto');
    const codigoProdutoParaTabela = dadosOverride && (dadosOverride.codigo_interno !== undefined || dadosOverride.codigo_produto !== undefined)
        ? String(dadosOverride.codigo_interno || dadosOverride.codigo_produto || '').trim()
        : (codigoProdutoEl && codigoProdutoEl.value) ? codigoProdutoEl.value.trim() : '';
    _conferenciaProcessarBipagemCodigo(codigoBarras, quantidade, codigoProdutoParaTabela, { permitirRepetir: true });
    if (!dadosOverride) _conferenciaResetarQtdBipada();
    var hidV = window._elBipagem('id-viagem-hidden');
    if (hidV) hidV.value = idViagem;
    if (window.ultimoCodigoBuscado) window.ultimoCodigoBuscado = '';
    focarCampoCodigoBarras();

    if (_conferenciaUsaRascunhoLocal() && !window._conferenciaSalvandoNoComprovante) {
        return { success: true, _apenas_local: true };
    }

    const result = await fetchAPI('/produtos', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (!result) {
        // Falha de rede/servidor: reverter otimista para não “ficar somado” errado
        atualizarQuantidadeBipadaNaTabela(codigoBarras, -quantidade, codigoProdutoParaTabela);
        atualizarEstatisticasOtimista(quantidade, true);
        if (!dadosOverride) {
            var cbF = window._elBipagem('codigo-barras');
            if (cbF) cbF.value = codigoBarras;
            var pnF = window._elBipagem('produto-nome');
            if (pnF) pnF.value = produto;
            var qF = window._elBipagem('quantidade');
            if (qF) qF.value = quantidade;
            if (codigoProdutoEl) codigoProdutoEl.value = codigoProdutoParaTabela;
        }
        var hidF = window._elBipagem('id-viagem-hidden');
        if (hidF) hidF.value = idViagem;
        focarCampoCodigoBarras();
        return;
    }

    if (result && result.produto_nao_cadastrado) {
        atualizarQuantidadeBipadaNaTabela(codigoBarras, -quantidade, codigoProdutoParaTabela);
        atualizarEstatisticasOtimista(quantidade, true);
        if (!dadosOverride) {
            var cbP = window._elBipagem('codigo-barras');
            if (cbP) cbP.value = codigoBarras;
            var pnP = window._elBipagem('produto-nome');
            if (pnP) pnP.value = produto;
            var qP = window._elBipagem('quantidade');
            if (qP) qP.value = quantidade;
            if (codigoProdutoEl) codigoProdutoEl.value = codigoProdutoParaTabela;
        }
        var hidP = window._elBipagem('id-viagem-hidden');
        if (hidP) hidP.value = idViagem;
        if (window.cadastrarExtraAoBipar) {
            window.cadastrarExtraAoBipar = false;
            const dadosOverride = {
                codigo_barras: codigoBarras,
                produto: produto,
                quantidade: quantidade,
                veiculo: veiculo,
                status: status,
                id_viagem: idViagem,
                doca: doca,
                codigo_interno: codigoProdutoParaTabela
            };
            await addProduto(true, dadosOverride);
            return;
        }
        document.getElementById('modal-produto-nao-cadastrado-msg').textContent = result.mensagem || 'Este produto não está na lista da conferência desta viagem. Deseja adicionar mesmo assim?';
        _abrirModalFlex('modal-produto-nao-cadastrado');
        return;
    }
    if (result && !result.success && result.mensagem) {
        atualizarQuantidadeBipadaNaTabela(codigoBarras, -quantidade, codigoProdutoParaTabela);
        atualizarEstatisticasOtimista(quantidade, true);
        if (!dadosOverride) {
            var cbE = window._elBipagem('codigo-barras');
            if (cbE) cbE.value = codigoBarras;
            var pnE = window._elBipagem('produto-nome');
            if (pnE) pnE.value = produto;
            var qE = window._elBipagem('quantidade');
            if (qE) qE.value = quantidade;
            if (codigoProdutoEl) codigoProdutoEl.value = codigoProdutoParaTabela;
        }
        var hidE = window._elBipagem('id-viagem-hidden');
        if (hidE) hidE.value = idViagem;
        showMessage(result.mensagem, 'error');
        focarCampoCodigoBarras();
        return;
    }

    if (result && result.success) {
        if (document.getElementById('modal-cadastro-item')) document.getElementById('modal-cadastro-item').style.display = 'none';
        // Limpar e focar só quando não veio de override (para não apagar o próximo código já digitado)
        if (!dadosOverride) {
            const qtdEl = window._elBipagem('quantidade');
            if (qtdEl) qtdEl.value = '1';
            const cb = window._elBipagem('codigo-barras');
            if (cb) cb.value = '';
            if (codigoProdutoEl) codigoProdutoEl.value = '';
            const pn = window._elBipagem('produto-nome');
            if (pn) pn.value = '';
        }
        agendarAtualizacoesPosBipagem(idViagem);
        focarCampoCodigoBarras();
    }
}

// codigoProdutoOpcional: quando bipamos EAN ou DUN, a linha na tabela pode mostrar outro código; usar código do produto para achar a linha
function atualizarQuantidadeBipadaNaTabela(codigoBarras, quantidade, codigoProdutoOpcional, opts) {
    opts = opts || {};
    const tbody = document.getElementById(window._fluxoBipagemAtivo === 'devolucao' ? 'dev-tbody-conferencia' : 'tbody-conferencia');
    if (!tbody || (!codigoBarras && !codigoProdutoOpcional)) return false;
    const rows = tbody.querySelectorAll('tr');
    const delta = parseInt(quantidade, 10) || 0;
    const codigoBarrasStr = (codigoBarras || '').toString().trim();
    const codigoProdutoStr = (codigoProdutoOpcional || '').toString().trim();
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.cells || row.cells.length < 12) continue;
        const C = window._CONF_COL;
        const dataCodigo = (row.getAttribute && row.getAttribute('data-codigo')) || '';
        const cellCodigoBarras = row.cells[C.COD_BARRAS];
        const cellCodigoProduto = row.cells[C.COD_PRODUTO];
        const codigoBarrasLinha = (cellCodigoBarras && cellCodigoBarras.textContent) ? (cellCodigoBarras.textContent || '').trim() : '';
        const codigoProdutoLinha = (cellCodigoProduto && cellCodigoProduto.textContent) ? (cellCodigoProduto.textContent || '').trim() : '';
        const match = (codigoProdutoStr && (codigoProdutoLinha === codigoProdutoStr || dataCodigo === codigoProdutoStr)) || (codigoBarrasStr && codigoBarrasLinha === codigoBarrasStr);
        if (!match) continue;
        const cellQtdBipada = row.cells[C.BIPADO];
        const cellQtdFalta = row.cells[C.FALTA];
        const cellAviso = row.cells[C.AVISO];
        const cellStatus = row.cells[C.STATUS];
        const cellQtdProduto = row.cells[C.QTD_PROD];
        if (!cellQtdBipada || !cellQtdFalta) continue;
        const qtdBipadaAtual = parseInt(cellQtdBipada.textContent, 10) || 0;
        const qtdFaltaAtual = parseInt(cellQtdFalta.textContent, 10) || 0;
        const qtdProduto = parseInt(cellQtdProduto && cellQtdProduto.textContent ? cellQtdProduto.textContent : 0, 10) || 0;
        // Permitir bipar mesmo após COMPLETO para virar EXCEDENTE e avisar sobra
        if (delta < 0 && qtdBipadaAtual <= 0) continue;
        const novaQtdBipada = Math.max(0, qtdBipadaAtual + delta);
        const novaQtdFalta = Math.max(0, qtdProduto - novaQtdBipada);
        cellQtdBipada.innerHTML = '<strong style="color: ' + (novaQtdBipada > 0 ? '#4caf50' : '#666') + '">' + novaQtdBipada + '</strong>';
        cellQtdFalta.innerHTML = '<strong style="color: ' + (novaQtdFalta > 0 ? '#f44336' : '#4caf50') + '">' + novaQtdFalta + '</strong>';
        if (cellAviso) {
            var textoAviso = _avisoConferenciaBipagem(cellAviso.textContent, qtdProduto, novaQtdBipada);
            _aplicarEstiloCelulaAviso(cellAviso, textoAviso);
        }
        if (cellStatus && row.classList) {
            var stLinha = _statusBipagemConferencia(qtdProduto, novaQtdBipada);
            row.classList.remove('row-completo', 'row-pendente', 'row-parcial', 'row-excedente');
            if (stLinha === 'EXCEDENTE') {
                row.classList.add('row-excedente');
                cellStatus.innerHTML = '<span class="status-badge status-EXCEDENTE">📦 EXCEDENTE</span>';
            } else if (stLinha === 'COMPLETO') {
                row.classList.add('row-completo');
                cellStatus.innerHTML = '<span class="status-badge status-OK">✅ COMPLETO</span>';
            } else if (stLinha === 'PARCIAL') {
                row.classList.add('row-parcial');
                cellStatus.innerHTML = '<span class="status-badge status-SOBRA">⚠️ PARCIAL</span>';
            } else {
                row.classList.add('row-pendente');
                cellStatus.innerHTML = '<span class="status-badge status-FALTA">❌ PENDENTE</span>';
            }
        }
        var stLinhaAcao = _statusBipagemConferencia(qtdProduto, novaQtdBipada);
        _conferenciaAtualizarCelulaAcaoLinha(row, stLinhaAcao, novaQtdBipada, novaQtdFalta);
        // Item bipado: vai para o topo; só COMPLETO (não excedente) vai para o final
        if (delta > 0) {
            var primeiro = tbody.querySelector('tr');
            if (primeiro && row !== primeiro) {
                tbody.insertBefore(row, primeiro);
            }
            if (stLinhaAcao === 'COMPLETO') {
                tbody.appendChild(row);
            }
        }
        atualizarTotaisConferenciaFromDOM();
        focarCampoCodigoBarras();
        return true;
    }
    return false;
}

window._conferenciaListaMaximizada = false;
window._conferenciaListaMaximizadaFluxo = null;

function _conferenciaAtualizarLayoutMaximizado() {
    if (!window._conferenciaListaMaximizada) return;
    var isDev = window._conferenciaListaMaximizadaFluxo === 'devolucao';
    var bloco4 = document.getElementById(isDev ? 'dev-conferencia-bloco-4-wrapper' : 'conferencia-bloco-4-wrapper');
    var panel = document.getElementById(isDev ? 'dev-conferencia-lista-panel' : 'conferencia-lista-panel');
    if (!panel) return;
    var altura = 220;
    if (bloco4 && bloco4.classList.contains('conferencia-bloco-4-no-maximizar')) {
        altura = Math.min(Math.max(bloco4.offsetHeight || 0, 160), Math.round(window.innerHeight * 0.45));
    }
    panel.style.setProperty('--conferencia-bloco4-h', altura + 'px');
}

function _conferenciaAplicarBloco4NoMaximizar(fluxo, maximizado) {
    var isDev = fluxo === 'devolucao';
    var bloco4 = document.getElementById(isDev ? 'dev-conferencia-bloco-4-wrapper' : 'conferencia-bloco-4-wrapper');
    var outro = document.getElementById(isDev ? 'conferencia-bloco-4-wrapper' : 'dev-conferencia-bloco-4-wrapper');
    if (bloco4) bloco4.classList.toggle('conferencia-bloco-4-no-maximizar', maximizado);
    if (outro) outro.classList.remove('conferencia-bloco-4-no-maximizar');
    if (maximizado) {
        requestAnimationFrame(function() {
            _conferenciaAtualizarLayoutMaximizado();
            if (typeof focarCampoCodigoBarras === 'function') focarCampoCodigoBarras();
        });
    }
}

function toggleConferenciaListaMaximizada(fluxo) {
    fluxo = fluxo || (window._fluxoBipagemAtivo === 'devolucao' ? 'devolucao' : 'carregamento');
    var isDev = fluxo === 'devolucao';
    var panel = document.getElementById(isDev ? 'dev-conferencia-lista-panel' : 'conferencia-lista-panel');
    var btn = document.getElementById(isDev ? 'btn-dev-conferencia-maximizar' : 'btn-conferencia-maximizar');
    var tabContainer = document.getElementById(isDev ? 'dev-tabela-conferencia-container' : 'tabela-conferencia-container');
    if (!panel || !tabContainer || tabContainer.style.display === 'none') {
        if (typeof showMessage === 'function') showMessage('Carregue os itens da viagem antes de maximizar.', 'warning');
        return;
    }
    var maximizado = !panel.classList.contains('conferencia-lista-maximizada');
    if (maximizado) {
        panel.classList.add('conferencia-lista-maximizada');
    } else {
        panel.classList.remove('conferencia-lista-maximizada');
        panel.style.removeProperty('--conferencia-bloco4-h');
    }
    window._conferenciaListaMaximizada = maximizado;
    window._conferenciaListaMaximizadaFluxo = maximizado ? fluxo : null;
    document.body.classList.toggle('conferencia-lista-maximizada-aberta', maximizado);
    document.body.classList.toggle('conferencia-lista-maximizada-carregamento', maximizado && !isDev);
    document.body.classList.toggle('conferencia-lista-maximizada-devolucao', maximizado && isDev);
    _conferenciaAplicarBloco4NoMaximizar(fluxo, maximizado);
    if (btn) {
        btn.textContent = maximizado ? '⛶ Restaurar' : '⛶ Maximizar';
        btn.title = maximizado ? 'Restaurar tamanho normal' : 'Maximizar conferência e lista para tela cheia';
    }
    var totaisBar = document.getElementById(isDev ? 'dev-conferencia-lista-totais-bar' : 'conferencia-lista-totais-bar');
    if (totaisBar) totaisBar.style.display = maximizado ? 'inline-flex' : 'none';
    if (maximizado) atualizarTotaisConferenciaFromDOM();
}

if (!window._conferenciaResizeMaximizadoBind) {
    window._conferenciaResizeMaximizadoBind = true;
    window.addEventListener('resize', function() {
        _conferenciaAtualizarLayoutMaximizado();
    });
}

function sairConferenciaListaMaximizadaSeAtiva() {
    if (!window._conferenciaListaMaximizada) return;
    toggleConferenciaListaMaximizada(window._conferenciaListaMaximizadaFluxo || 'carregamento');
}

function _syncConferenciaListaTotaisBar(fluxoTab, totalItens, totalBipado, totalFalta, temExcedente) {
    var isDev = fluxoTab === 'devolucao';
    var elTotal = document.getElementById(isDev ? 'dev-conferencia-lista-total-itens' : 'conferencia-lista-total-itens');
    var elBipado = document.getElementById(isDev ? 'dev-conferencia-lista-total-bipado' : 'conferencia-lista-total-bipado');
    if (!elTotal || !elBipado) return;
    if (isDev) {
        elTotal.textContent = 'Saída: ' + totalItens;
        elBipado.textContent = 'Retorno: ' + totalBipado;
    } else {
        elTotal.textContent = 'Total: ' + totalItens;
        elBipado.textContent = 'Bipado: ' + totalBipado;
    }
    var elStatusLista = document.getElementById(isDev ? 'dev-conferencia-lista-resumo-status' : 'conferencia-lista-resumo-status');
    if (!elStatusLista) return;
    elStatusLista.classList.remove('status-faltando', 'status-completo', 'status-excedente', 'status-sem-itens');
    if (!totalItens || totalItens <= 0) {
        elStatusLista.classList.add('status-sem-itens');
        elStatusLista.textContent = 'Sem itens';
        return;
    }
    var totalB = parseInt(totalBipado, 10) || 0;
    var totalI = parseInt(totalItens, 10) || 0;
    if (totalB > totalI || temExcedente) {
        elStatusLista.classList.add('status-excedente');
        elStatusLista.textContent = 'Bipou a mais';
    } else if (totalFalta > 0) {
        elStatusLista.classList.add('status-faltando');
        elStatusLista.textContent = 'Faltando itens';
    } else {
        elStatusLista.classList.add('status-completo');
        elStatusLista.textContent = 'Tudo bipado';
    }
}

if (!window._conferenciaListaMaximizadaEscBound) {
    window._conferenciaListaMaximizadaEscBound = true;
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && window._conferenciaListaMaximizada) {
            sairConferenciaListaMaximizadaSeAtiva();
        }
    });
}

function atualizarTotaisConferenciaFromDOM() {
    const isDev = window._fluxoBipagemAtivo === 'devolucao';
    const elTotal = document.getElementById(isDev ? 'dev-conferencia-total-itens' : 'conferencia-total-itens');
    const elBipado = document.getElementById(isDev ? 'dev-conferencia-total-bipado' : 'conferencia-total-bipado');
    if (!elTotal || !elBipado) return;
    const tbody = document.getElementById(isDev ? 'dev-tbody-conferencia' : 'tbody-conferencia');
    if (!tbody) return;
    let totalItens = 0, totalBipado = 0, totalFalta = 0;
    let temExcedente = false;
    tbody.querySelectorAll('tr').forEach(function(row) {
        if (row.cells.length < 11) return;
        const C = window._CONF_COL;
        const qtdProduto = parseInt(row.cells[C.QTD_PROD] && row.cells[C.QTD_PROD].textContent ? row.cells[C.QTD_PROD].textContent.replace(/\s/g, '') : 0, 10) || 0;
        const qtdBipada = parseInt(row.cells[C.BIPADO] && row.cells[C.BIPADO].textContent ? row.cells[C.BIPADO].textContent.replace(/\s/g, '') : 0, 10) || 0;
        const qtdFalta = parseInt(row.cells[C.FALTA] && row.cells[C.FALTA].textContent ? row.cells[C.FALTA].textContent.replace(/\s/g, '') : 0, 10) || 0;
        totalItens += qtdProduto;
        totalBipado += qtdBipada;
        totalFalta += qtdFalta;
        if (row.classList && row.classList.contains('row-excedente')) temExcedente = true;
    });
    if (isDev) {
        elTotal.textContent = 'Saída: ' + totalItens;
        elBipado.textContent = 'Retorno: ' + totalBipado;
    } else {
        elTotal.textContent = 'Total: ' + totalItens;
        elBipado.textContent = 'Bipado: ' + totalBipado;
    }
    atualizarStatusResumoConferencia(totalItens, totalBipado, totalFalta, temExcedente, isDev ? 'devolucao' : 'carregamento');
    _syncConferenciaListaTotaisBar(isDev ? 'devolucao' : 'carregamento', totalItens, totalBipado, totalFalta, temExcedente);
}

function atualizarTotaisConferenciaFromData(conferenciaArray, fluxoTab) {
    fluxoTab = fluxoTab || 'carregamento';
    const isDev = fluxoTab === 'devolucao';
    const elTotal = document.getElementById(isDev ? 'dev-conferencia-total-itens' : 'conferencia-total-itens');
    const elBipado = document.getElementById(isDev ? 'dev-conferencia-total-bipado' : 'conferencia-total-bipado');
    if (!elTotal || !elBipado || !conferenciaArray || !conferenciaArray.length) {
        if (elTotal) elTotal.textContent = isDev ? 'Saída: 0' : 'Total: 0';
        if (elBipado) elBipado.textContent = isDev ? 'Retorno: 0' : 'Bipado: 0';
        atualizarStatusResumoConferencia(0, 0, 0, false, fluxoTab);
        _syncConferenciaListaTotaisBar(fluxoTab, 0, 0, 0, false);
        return;
    }
    let totalItens = 0;
    let totalFalta = 0;
    let temExcedente = false;
    const bipadoPorChave = {};
    conferenciaArray.forEach(function(item) {
        totalItens += parseInt(item.quantidade_produto, 10) || 0;
        totalFalta += parseInt(item.quantidade_falta, 10) || 0;
        if ((item.status_bipado || '') === 'EXCEDENTE') temExcedente = true;
        const chave = (item.codigo_produto || '').toString().trim() || (item.codigo_barras || '').toString().trim();
        if (chave) bipadoPorChave[chave] = parseInt(item.quantidade_bipada, 10) || 0;
    });
    let totalBipado = 0;
    for (const k in bipadoPorChave) totalBipado += bipadoPorChave[k];
    if (isDev) {
        elTotal.textContent = 'Saída: ' + totalItens;
        elBipado.textContent = 'Retorno: ' + totalBipado;
    } else {
        elTotal.textContent = 'Total: ' + totalItens;
        elBipado.textContent = 'Bipado: ' + totalBipado;
    }
    atualizarStatusResumoConferencia(totalItens, totalBipado, totalFalta, temExcedente, fluxoTab);
    _syncConferenciaListaTotaisBar(fluxoTab, totalItens, totalBipado, totalFalta, temExcedente);
}

function atualizarStatusResumoConferencia(totalItens, totalBipado, totalFalta, temExcedente, fluxoTab) {
    fluxoTab = fluxoTab || 'carregamento';
    const elStatus = document.getElementById(fluxoTab === 'devolucao' ? 'dev-conferencia-resumo-status' : 'conferencia-resumo-status');
    if (!elStatus) return;
    elStatus.classList.remove('status-faltando', 'status-completo', 'status-excedente', 'status-sem-itens');
    if (!totalItens || totalItens <= 0) {
        elStatus.classList.add('status-sem-itens');
        elStatus.textContent = 'Sem itens';
        return;
    }
    // "Bipou a mais" no resumo: só quando o total bipado for maior que o total de itens
    // (aviso por item continua na coluna Aviso da tabela)
    var totalB = parseInt(totalBipado, 10) || 0;
    var totalI = parseInt(totalItens, 10) || 0;
    if (totalB > totalI) {
        elStatus.classList.add('status-excedente');
        elStatus.textContent = 'Bipou a mais';
        return;
    }
    if (totalFalta > 0) {
        elStatus.classList.add('status-faltando');
        elStatus.textContent = 'Faltando itens';
    } else {
        elStatus.classList.add('status-completo');
        elStatus.textContent = 'Tudo bipado';
    }
}

function atualizarEstatisticasOtimista(quantidade, reverter) {
    const elBipados = document.getElementById('stat-bipados');
    const elSoma = document.getElementById('stat-soma-quantidades');
    const qtd = quantidade || 1;
    if (elBipados) {
        const n = Math.max(0, (parseInt(elBipados.textContent, 10) || 0) + (reverter ? -1 : 1));
        elBipados.textContent = n;
    }
    if (elSoma) {
        const n = Math.max(0, (parseInt(elSoma.textContent, 10) || 0) + (reverter ? -qtd : qtd));
        elSoma.textContent = n;
    }
}

window.fecharModalProdutoNaoCadastrado = function() {
    document.getElementById('modal-produto-nao-cadastrado').style.display = 'none';
    const codigoInput = window._elBipagem('codigo-barras');
    if (codigoInput) codigoInput.focus();
};

function _inferirTipoCodigoBarras(codigo) {
    var s = String(codigo || '').replace(/\D/g, '');
    return (s.length >= 14) ? 'DUN' : 'EAN';
}

function _aplicarItemRomaneioNoCadastro(item) {
    if (!item) return;
    var descEl = document.getElementById('cadastro-item-descricao');
    var codIntEl = document.getElementById('cadastro-item-codigo-interno');
    var unEl = document.getElementById('cadastro-item-unidade');
    var pesoEl = document.getElementById('cadastro-item-peso');
    if (descEl && item.produto) descEl.value = item.produto;
    if (codIntEl) codIntEl.value = (item.codigo_produto || '').trim();
    if (unEl && item.unidade && item.unidade !== '-') unEl.value = item.unidade;
    if (pesoEl && item.peso_bruto && item.peso_bruto !== '-') pesoEl.value = item.peso_bruto;
}

async function _carregarSelectVinculoRomaneio() {
    var sel = document.getElementById('cadastro-item-vinculo-romaneio');
    if (!sel) return;
    var idV = (document.getElementById('cadastro-item-id-viagem') && document.getElementById('cadastro-item-id-viagem').value.trim()) || (window._getIdViagemAtivo && window._getIdViagemAtivo()) || '';
    if (!idV) {
        sel.innerHTML = '<option value="">Carregue uma viagem antes de vincular</option>';
        return;
    }
    sel.innerHTML = '<option value="">Carregando itens do romaneio…</option>';
    var fluxoQ = (window._fluxoBipagemAtivo === 'devolucao') ? '?fluxo=devolucao' : '';
    var data = await fetchAPI('/conferencia/' + encodeURIComponent(idV) + fluxoQ);
    var lista = (data && data.lista) ? data.lista : [];
    sel.innerHTML = '<option value="">— Selecione o produto do romaneio —</option>';
    var vistos = {};
    lista.forEach(function(it) {
        var cod = (it.codigo_produto || '').trim();
        if (!cod || vistos[cod]) return;
        vistos[cod] = true;
        var label = cod + ' — ' + (it.produto || 'Sem descrição');
        if (it.unidade && it.unidade !== '-') label += ' (' + it.unidade + ')';
        var opt = document.createElement('option');
        opt.value = JSON.stringify({
            codigo_produto: cod,
            produto: it.produto || '',
            unidade: it.unidade || '',
            peso_bruto: it.peso_bruto || ''
        });
        opt.textContent = label;
        sel.appendChild(opt);
    });
    if (lista.length === 0) {
        sel.innerHTML = '<option value="">Nenhum item no romaneio desta viagem</option>';
    }
    var codPref = (window._elBipagem('codigo-produto') && window._elBipagem('codigo-produto').value || '').trim();
    if (codPref) _selecionarRomaneioNoCadastroPorCodigo(sel, codPref);
}

function _selecionarRomaneioNoCadastroPorCodigo(sel, codigoProduto) {
    if (!sel || !codigoProduto) return;
    var alvo = String(codigoProduto).trim();
    for (var i = 0; i < sel.options.length; i++) {
        var opt = sel.options[i];
        if (!opt.value) continue;
        try {
            var item = JSON.parse(opt.value);
            if (item && String(item.codigo_produto || '').trim() === alvo) {
                sel.selectedIndex = i;
                _aplicarItemRomaneioNoCadastro(item);
                return;
            }
        } catch (e) { /* ignore */ }
    }
}

window._abrirModalCadastroItemFromBipagem = async function() {
    var codigoBarras = normalizarCodigoBarrasDuplicado((window._elBipagem('codigo-barras') && window._elBipagem('codigo-barras').value || '').trim());
    if (!codigoBarras) {
        showMessage('Digite ou escaneie o código de barras.', 'error');
        var cb0 = window._elBipagem('codigo-barras');
        if (cb0) cb0.focus();
        return;
    }
    var produto = (window._elBipagem('produto-nome') && window._elBipagem('produto-nome').value || '').trim();
    var idViagem = (window._getIdViagemAtivo && window._getIdViagemAtivo()) || '';
    var status = (window._elBipagem('status') && window._elBipagem('status').value) || 'PENDENTE';
    var tipo = _inferirTipoCodigoBarras(codigoBarras);
    document.getElementById('cadastro-item-descricao').value = produto;
    document.getElementById('cadastro-item-codigo-ean').value = tipo === 'EAN' ? codigoBarras : '';
    document.getElementById('cadastro-item-codigo-dun').value = tipo === 'DUN' ? codigoBarras : '';
    document.getElementById('cadastro-item-tipo-codigo').value = tipo;
    document.getElementById('cadastro-item-id-viagem').value = idViagem;
    document.getElementById('cadastro-item-status').value = status;
    document.getElementById('cadastro-item-codigo-interno').value = (window._elBipagem('codigo-produto') && window._elBipagem('codigo-produto').value || '').trim();
    var chkBase = document.getElementById('cadastro-item-atualizar-base');
    if (chkBase) chkBase.checked = true;
    _abrirModalFlex('modal-cadastro-item');
    await _carregarSelectVinculoRomaneio();
    var sel = document.getElementById('cadastro-item-vinculo-romaneio');
    if (sel && !sel._vinculoBound) {
        sel._vinculoBound = true;
        sel.addEventListener('change', function() {
            if (!sel.value) return;
            try { _aplicarItemRomaneioNoCadastro(JSON.parse(sel.value)); } catch (e) { /* ignore */ }
        });
    }
    setTimeout(function() {
        var foco = document.getElementById('cadastro-item-vinculo-romaneio');
        if (foco) foco.focus();
    }, 100);
};

// Abre o modal de cadastro do item (preenchido com dados atuais do formulário)
window.confirmarAdicionarProdutoNaoCadastrado = async function() {
    document.getElementById('modal-produto-nao-cadastrado').style.display = 'none';
    await window._abrirModalCadastroItemFromBipagem();
};

window.fecharModalCadastroItem = function() {
    document.getElementById('modal-cadastro-item').style.display = 'none';
    const codigoInput = window._elBipagem('codigo-barras');
    if (codigoInput) codigoInput.focus();
};

window.confirmarCadastroItem = async function() {
    const descricao = document.getElementById('cadastro-item-descricao').value.trim();
    if (!descricao) {
        showMessage('Informe a descrição do produto', 'error');
        document.getElementById('cadastro-item-descricao').focus();
        return;
    }
    var selRom = document.getElementById('cadastro-item-vinculo-romaneio');
    var itemRom = null;
    if (selRom && selRom.value) {
        try { itemRom = JSON.parse(selRom.value); } catch (e) { itemRom = null; }
    }
    var codigoInterno = (document.getElementById('cadastro-item-codigo-interno').value || '').trim();
    if (itemRom && itemRom.codigo_produto) codigoInterno = itemRom.codigo_produto.trim();
    if (!codigoInterno) {
        showMessage('Selecione um item do romaneio ou informe o código interno.', 'error');
        if (selRom) selRom.focus();
        return;
    }
    const codigoEan = document.getElementById('cadastro-item-codigo-ean').value.trim();
    const codigoDun = document.getElementById('cadastro-item-codigo-dun').value.trim();
    const codigoBipado = normalizarCodigoBarrasDuplicado(codigoEan || codigoDun);
    if (!codigoBipado) {
        showMessage('Informe o código EAN ou DUN bipado', 'error');
        return;
    }
    const tipoCod = document.getElementById('cadastro-item-tipo-codigo').value || _inferirTipoCodigoBarras(codigoBipado);
    const docaEl = window._elBipagem('doca');
    const unidadeEl = document.getElementById('cadastro-item-unidade');
    const unidade = (unidadeEl && unidadeEl.value !== undefined) ? String(unidadeEl.value).trim() : (itemRom && itemRom.unidade) || '';
    const pesoEl = document.getElementById('cadastro-item-peso');
    const peso = pesoEl ? pesoEl.value.trim() : ((itemRom && itemRom.peso_bruto && itemRom.peso_bruto !== '-') ? itemRom.peso_bruto : '');
    const idViagem = document.getElementById('cadastro-item-id-viagem').value.trim() || (window._getIdViagemAtivo && window._getIdViagemAtivo()) || '';
    const atualizarBase = document.getElementById('cadastro-item-atualizar-base') && document.getElementById('cadastro-item-atualizar-base').checked;
    const btn = document.getElementById('btn-cadastro-item-confirmar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    try {
        if (atualizarBase) {
            var respV = await fetchAPI('/base-item/vincular-codigo', {
                method: 'POST',
                body: JSON.stringify({
                    codigo_interno: codigoInterno,
                    codigo_barras: codigoBipado,
                    ean: codigoEan,
                    dun: codigoDun,
                    tipo_codigo: tipoCod,
                    descricao: descricao,
                    unidade: unidade,
                    peso: peso
                })
            });
            if (!respV || respV.erro) {
                showMessage((respV && respV.erro) || 'Não foi possível atualizar a base de códigos.', 'error');
                return;
            }
            showMessage(respV.mensagem || 'Base atualizada com o vínculo do código.', 'success');
            _atualizarCodigoBarrasLinhaConferencia(codigoInterno, codigoBipado);
            window.ultimoCodigoBuscado = '';
        } else {
            _atualizarCodigoBarrasLinhaConferencia(codigoInterno, codigoBipado);
            showMessage('Código vinculado ao item. Bipe na conferência quando quiser.', 'success');
        }
        document.getElementById('modal-cadastro-item').style.display = 'none';
        var cpEl = window._elBipagem('codigo-produto');
        if (cpEl) cpEl.value = codigoInterno;
        var pnEl = window._elBipagem('produto-nome');
        if (pnEl) pnEl.value = descricao;
        if (idViagem) {
            await reloadConferenciaAtiva(idViagem, {
                forcar: true,
                forcarIgnorarPendencias: true,
                aguardarBipagem: false
            });
        }
        var baseTab = document.getElementById('base');
        if (typeof loadBasePlanilha === 'function' && baseTab && baseTab.classList.contains('active')) {
            loadBasePlanilha(false);
        }
        var cbOk = window._elBipagem('codigo-barras');
        if (cbOk) cbOk.value = '';
        focarCampoCodigoBarras();
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Confirmar e vincular'; }
    }
};

// Abrir Modal de Edição (função global)
window.openEditModal = async function(id) {
    const produtos = await fetchAPI('/produtos');
    const produto = produtos.find(p => p.id === id);
    
    if (produto) {
        document.getElementById('edit-id').value = produto.id;
        document.getElementById('edit-produto').value = produto.produto || '';
        document.getElementById('edit-quantidade').value = produto.quantidade;
        document.getElementById('edit-veiculo').value = produto.veiculo || '';
        document.getElementById('edit-status').value = produto.status;
        
        document.getElementById('edit-modal').style.display = 'block';
    }
}

// Fechar Modal (função global)
window.closeModal = function() {
    document.getElementById('edit-modal').style.display = 'none';
}

// Atualizar Produto
async function updateProduto() {
    const id = document.getElementById('edit-id').value;
    const produto = document.getElementById('edit-produto').value.trim();
    const quantidade = parseInt(document.getElementById('edit-quantidade').value);
    const veiculo = document.getElementById('edit-veiculo').value.trim();
    const status = document.getElementById('edit-status').value;
    
    const result = await fetchAPI(`/produtos/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
            produto: produto,
            quantidade: quantidade,
            veiculo: veiculo,
            status: status
        })
    });
    
    if (result && result.success) {
        showMessage('Produto atualizado com sucesso!', 'success');
        closeModal();
        loadConferencia();
        loadEstatisticas();
        loadAllData();
    }
}

// Excluir Produto (função global)
window.deleteProduto = async function(id) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) {
        return;
    }
    
    const result = await fetchAPI(`/produtos/${id}`, {
        method: 'DELETE'
    });
    
    if (result && result.success) {
        showMessage('Produto excluído com sucesso!', 'success');
        const idViagem = document.getElementById('id-viagem-hidden').value.trim();
        if (idViagem) {
            await loadConferencia(idViagem);
        }
        loadEstatisticas();
    }
}

// Carregar início e fim da bipagem/carregamento (data e hora) para a viagem
async function loadPeriodoCarregamento(idViagem) {
    if (!idViagem) return;
    const box = document.getElementById('periodo-carregamento-box');
    if (!box) return;
    try {
        const data = await fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/periodo');
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = (val && String(val).trim()) ? val : '-';
        };
        var inicio = data && data.inicio_carregamento;
        var fim = data && data.fim_carregamento;
        if (_conferenciaUsaRascunhoLocal()) {
            var local = _conferenciaObterPeriodoBipagemLocal(idViagem);
            if (local && local.inicio) {
                inicio = _formatarPeriodoBipagemLocal(local.inicio);
                fim = _formatarPeriodoBipagemLocal(local.fim || local.inicio);
            }
        }
        set('periodo-inicio-carregamento', inicio);
        set('periodo-fim-carregamento', fim);
    } catch (e) {
        const set = (id) => { const el = document.getElementById(id); if (el) el.textContent = '-'; };
        set('periodo-inicio-carregamento'); set('periodo-fim-carregamento');
    }
}

// Sugestões Placa / Motorista (datalist) — cadastro + histórico no banco
let listaColaboradoresMotoristas = [];
let listaPlacas = [];

function _preencherDatalist(datalistId, valores, extras) {
    var datalist = document.getElementById(datalistId);
    if (!datalist) return;
    var vistos = {};
    var lista = [];
    function add(v) {
        var s = String(v || '').trim();
        if (!s) return;
        var k = s.toUpperCase();
        if (vistos[k]) return;
        vistos[k] = true;
        lista.push(s);
    }
    (valores || []).forEach(add);
    (extras || []).forEach(add);
    lista.sort(function(a, b) { return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }); });
    datalist.innerHTML = lista.map(function(v) {
        return '<option value="' + String(v).replace(/"/g, '&quot;') + '">';
    }).join('');
}

async function loadColaboradoresMotoristas(forcar) {
    try {
        const data = await fetchAPI('/colaboradores-motoristas');
        if (data && Array.isArray(data.nomes)) {
            listaColaboradoresMotoristas = data.nomes;
            var motAtual = document.getElementById('viagem-motorista');
            _preencherDatalist('datalist-motoristas', listaColaboradoresMotoristas, motAtual && motAtual.value ? [motAtual.value] : []);
        }
    } catch (e) {
        if (forcar) listaColaboradoresMotoristas = [];
    }
}

async function loadPlacas(forcar) {
    try {
        const data = await fetchAPI('/placas');
        if (data && Array.isArray(data.placas)) {
            listaPlacas = data.placas;
            var placaAtual = document.getElementById('viagem-placa');
            _preencherDatalist('datalist-placas', listaPlacas, placaAtual && placaAtual.value ? [placaAtual.value] : []);
        }
    } catch (e) {
        if (forcar) listaPlacas = [];
    }
}

function atualizarSugestoesRotaConferencia() {
    loadPlacas(true);
    loadColaboradoresMotoristas(true);
}

const COORDENADOR_PADRAO = 'ASTROGILDO RODRIGUES DOS SANTOS';

function _aplicarExtrasConferenciaResponse(conferencia, idViagem, isDev) {
    if (!conferencia || isDev) return;
    var setVal = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = (val && String(val).trim()) ? val : '-';
    };
    var setInput = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.value = (val && String(val).trim()) ? val : '';
    };
    if (conferencia.coordenador !== undefined || conferencia.conferente !== undefined) {
        setInput('viagem-coordenador', (conferencia.coordenador && String(conferencia.coordenador).trim()) ? conferencia.coordenador : COORDENADOR_PADRAO);
        setInput('viagem-conferente', conferencia.conferente || '');
        setInput('viagem-ajudante1', conferencia.ajudante1 || '');
        setInput('viagem-ajudante2', conferencia.ajudante2 || '');
    }
    if (conferencia.inicio_carregamento !== undefined || conferencia.fim_carregamento !== undefined) {
        var inicio = conferencia.inicio_carregamento;
        var fim = conferencia.fim_carregamento;
        if (_conferenciaUsaRascunhoLocal()) {
            var local = _conferenciaObterPeriodoBipagemLocal(idViagem);
            if (local && local.inicio) {
                inicio = _formatarPeriodoBipagemLocal(local.inicio);
                fim = _formatarPeriodoBipagemLocal(local.fim || local.inicio);
            }
        }
        setVal('periodo-inicio-carregamento', inicio);
        setVal('periodo-fim-carregamento', fim);
        var periodoBox = document.getElementById('periodo-carregamento-box');
        if (periodoBox) periodoBox.style.display = 'block';
    }
}

// Carregar info da viagem: data expedição, placa, identificador rota, motorista, responsáveis (editáveis)
async function loadViagemInfo(idViagem) {
    if (!idViagem) return;
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = (val && String(val).trim()) ? val : '-';
    };
    const setInput = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = (val && String(val).trim()) ? val : '';
    };
    const motoristaInput = document.getElementById('viagem-motorista');
    const placaInput = document.getElementById('viagem-placa');
    const setMotorista = (val) => {
        if (motoristaInput) motoristaInput.value = (val && String(val).trim()) ? val : '';
    };
    const setPlaca = (val) => {
        if (placaInput) placaInput.value = (val && String(val).trim()) ? val : '';
    };
    try {
        const data = await fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/info');
        if (data) {
            if (data.data_expedicao != null && String(data.data_expedicao).trim()) setVal('data-expedicao', data.data_expedicao);
            if (data.placa !== undefined && data.placa !== null && String(data.placa).trim()) setPlaca(data.placa);
            if (data.identificador_rota !== undefined && data.identificador_rota !== null && String(data.identificador_rota).trim()) setVal('viagem-identificador-rota', data.identificador_rota);
            else setVal('viagem-identificador-rota', data.identificador_rota || '-');
            if (data.motorista !== undefined && data.motorista !== null && String(data.motorista).trim()) setMotorista(data.motorista);
            setInput('viagem-coordenador', (data.coordenador && String(data.coordenador).trim()) ? data.coordenador : COORDENADOR_PADRAO);
            setInput('viagem-conferente', data.conferente || '');
            setInput('viagem-ajudante1', data.ajudante1 || '');
            setInput('viagem-ajudante2', data.ajudante2 || '');
            if (data.id_roteiro != null && String(data.id_roteiro).trim()) setVal('display-id-roteiro', data.id_roteiro);
            else setVal('display-id-roteiro', data.id_roteiro || '-');
            if (data.id_viagem != null && String(data.id_viagem).trim()) setVal('display-id-viagem', data.id_viagem);
            else setVal('display-id-viagem', data.id_viagem || idViagem || '-');
        } else {
            setVal('data-expedicao', '-');
            setPlaca('');
            setVal('viagem-identificador-rota', '-');
            setMotorista('');
            setInput('viagem-coordenador', COORDENADOR_PADRAO);
            setInput('viagem-conferente', '');
            setInput('viagem-ajudante1', '');
            setInput('viagem-ajudante2', '');
            setVal('display-id-roteiro', '-');
            setVal('display-id-viagem', idViagem || '-');
        }
    } catch (e) {
        setVal('data-expedicao', '-');
        setPlaca('');
        setVal('viagem-identificador-rota', '-');
        setMotorista('');
        setInput('viagem-coordenador', COORDENADOR_PADRAO);
        setInput('viagem-conferente', '');
        setInput('viagem-ajudante1', '');
        setInput('viagem-ajudante2', '');
        setVal('display-id-roteiro', '-');
        setVal('display-id-viagem', idViagem || '-');
    }
    _preencherDatalist('datalist-placas', listaPlacas, placaInput && placaInput.value ? [placaInput.value] : []);
    _preencherDatalist('datalist-motoristas', listaColaboradoresMotoristas, motoristaInput && motoristaInput.value ? [motoristaInput.value] : []);
}

// Salvar motorista alterado na viagem
async function salvarMotoristaViagem() {
    const idViagem = document.getElementById('id-viagem-hidden').value.trim() || document.getElementById('id-viagem').value.trim();
    const motoristaInput = document.getElementById('viagem-motorista');
    if (!idViagem || !motoristaInput) return;
    const motorista = motoristaInput.value.trim();
    try {
        await fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/motorista', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motorista: motorista })
        });
    } catch (e) {
        showMessage('Erro ao salvar motorista.', 'error');
    }
}

// Salvar placa alterada na viagem
async function salvarPlacaViagem() {
    const idViagem = document.getElementById('id-viagem-hidden').value.trim() || document.getElementById('id-viagem').value.trim();
    const placaInput = document.getElementById('viagem-placa');
    if (!idViagem || !placaInput) return;
    const placa = placaInput.value.trim();
    try {
        await fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/placa', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ placa: placa })
        });
    } catch (e) {
        showMessage('Erro ao salvar placa.', 'error');
    }
}

// Salvar responsáveis da viagem (coordenador, conferente, ajudantes)
async function salvarResponsaveisViagem() {
    const idViagem = document.getElementById('id-viagem-hidden').value.trim() || document.getElementById('id-viagem').value.trim();
    if (!idViagem) return;
    const coordenador = (document.getElementById('viagem-coordenador') && document.getElementById('viagem-coordenador').value.trim()) || COORDENADOR_PADRAO;
    const conferente = (document.getElementById('viagem-conferente') && document.getElementById('viagem-conferente').value.trim()) || '';
    const ajudante1 = (document.getElementById('viagem-ajudante1') && document.getElementById('viagem-ajudante1').value.trim()) || '';
    const ajudante2 = (document.getElementById('viagem-ajudante2') && document.getElementById('viagem-ajudante2').value.trim()) || '';
    try {
        await fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/responsaveis', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordenador, conferente, ajudante1, ajudante2 })
        });
    } catch (e) {
        showMessage('Erro ao salvar responsáveis.', 'error');
    }
}

// Buscar Itens da Viagem (lê da base de dados romaneio_por_item; não chama API Ravex)
window.buscarItensViagem = async function() {
    const idInput = document.getElementById('id-viagem').value.trim();
    
    if (!idInput) {
        showMessage('Por favor, digite o ID do roteiro ou o ID da viagem', 'error');
        document.getElementById('id-viagem').focus();
        return;
    }
    
    var overlayEl = document.getElementById('ravex-loading-overlay');
    var overlayText = document.getElementById('ravex-loading-text');
    var overlayBox = document.getElementById('ravex-loading-box');
    var barTrack = document.getElementById('ravex-loading-bar-track');
    var errorActions = document.getElementById('ravex-error-actions');
    var abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var cancelado = false;
    function showOverlay(msg) {
        if (overlayEl && overlayText) {
            overlayText.textContent = msg || 'Carregando conferência... Aguarde.';
            if (overlayBox) overlayBox.classList.remove('ravex-loading-box--error');
            if (barTrack) barTrack.style.display = '';
            if (errorActions) errorActions.style.display = 'none';
            overlayEl.style.display = 'flex';
        }
        _ravexLoadingSetCancelVisible(true, function() {
            cancelado = true;
            if (abortCtrl) {
                try { abortCtrl.abort(); } catch (e) {}
            }
            hideOverlay();
            showMessage('Carregamento cancelado.', 'warning');
        });
    }
    function hideOverlay() {
        _ravexLoadingSetCancelVisible(false);
        if (overlayEl) overlayEl.style.display = 'none';
    }
    var idAnterior = (window._conferenciaIdViagemAtiva || '').trim();
    if (idAnterior && idAnterior !== idInput && _conferenciaUsaRascunhoLocal() && _conferenciaTemPendenciasLocais()) {
        var okTrocar = await _conferenciaConfirmarAcaoModal(
            'Trocar viagem',
            'Há bipagem não salva da viagem ' + idAnterior + '. Ao buscar outra viagem, essa bipagem será descartada (só grava ao gerar comprovante). Continuar?',
            'Sim, buscar outra viagem'
        );
        if (!okTrocar) return;
        await _conferenciaDescartarRascunhoLocal(idAnterior);
    } else if (idAnterior && idAnterior !== idInput) {
        _limparPendenciasConferenciaTimers();
        window._ultimoBipadoCodigo = '';
    }

    var tbodyLoading = document.getElementById('tbody-conferencia');
    if (tbodyLoading) tbodyLoading.innerHTML = '<tr><td colspan="12" class="loading">Carregando itens da viagem...</td></tr>';
    _conferenciaAtualizarAvisoNaoBaixado({ ja_baixado_ravex: true });

    var cacheHit = _cacheExtratoObter(idInput, 'carregamento');
    var overlayTimer = null;
    function agendarOverlay() {
        if (overlayTimer) return;
        overlayTimer = setTimeout(function() {
            overlayTimer = null;
            showOverlay('Carregando conferência da base de dados (romaneio por item)... Aguarde.');
        }, cacheHit && cacheHit.resp ? 700 : 350);
    }
    function cancelarOverlayAgendado() {
        if (overlayTimer) {
            clearTimeout(overlayTimer);
            overlayTimer = null;
        }
    }

    var idViagem = idInput;
    var sucesso = false;
    var overlayOculto = false;
    function tentarOcultarOverlay() {
        cancelarOverlayAgendado();
        if (!overlayOculto && !cancelado) {
            overlayOculto = true;
            hideOverlay();
        }
    }

    if (cacheHit && cacheHit.resp) {
        try {
            await loadConferencia(idInput, {
                respCache: cacheHit.resp,
                forcar: false,
                onDadosRecebidos: function(conf) {
                    if (conf && !conf.erro) {
                        var idV = (conf.id_viagem && String(conf.id_viagem).trim()) || idInput;
                        _habilitarUiConferenciaViagem(idV);
                    }
                },
            });
        } catch (eCache) { /* ignore */ }
    } else {
        agendarOverlay();
    }

    try {
        await loadConferencia(idInput, {
            signal: abortCtrl ? abortCtrl.signal : undefined,
            forcar: true,
            rapido: true,
            onDadosRecebidos: function(conf) {
                tentarOcultarOverlay();
                if (conf && !conf.erro) {
                    var idV = (conf.id_viagem && String(conf.id_viagem).trim()) || idInput;
                    _habilitarUiConferenciaViagem(idV);
                }
            },
        });
        if (cancelado) return;
        idViagem = (document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value.trim()) || document.getElementById('id-viagem').value.trim() || idInput;
        sucesso = true;
        void loadConferencia(idInput, {
            forcar: true,
            rapido: false,
            silencioso: true,
            verificarBaixado: false
        });
    } catch (e) {
        if (cancelado || (e && e._cancelado)) return;
        showMessage('Erro ao conectar. Tente novamente.', 'error');
        if (overlayEl && overlayText) {
            overlayText.textContent = 'Erro: ' + (e.message || 'Não foi possível carregar');
            if (overlayBox) overlayBox.classList.add('ravex-loading-box--error');
            if (barTrack) barTrack.style.display = 'none';
            if (errorActions) errorActions.style.display = 'block';
            _ravexLoadingSetCancelVisible(false);
            var okBtn = document.getElementById('ravex-overlay-ok');
            if (okBtn) okBtn.onclick = function() { hideOverlay(); };
            overlayEl.style.display = 'flex';
            return;
        }
    } finally {
        if (!cancelado && !overlayOculto) hideOverlay();
    }
    if (!sucesso) return;

    _conferenciaSalvarSessao({ id_viagem: idViagem, visitou_conferencia: true, comprovante_gerado: false, tem_rascunho: false });
    _conferenciaAtualizarAvisoRascunho();
    void loadExtrato(idViagem, { prefetch: true });
    void loadEstatisticas();

    setTimeout(function() {
        const docaSelect = document.getElementById('doca');
        const codigoBarrasInput = document.getElementById('codigo-barras');
        const docaVal = docaSelect ? docaSelect.value.trim() : '';
        const docaOk = ['1','2','3','4'].includes(docaVal);
        if (docaSelect && !docaOk) docaSelect.focus();
        else if (codigoBarrasInput && !codigoBarrasInput.disabled) codigoBarrasInput.focus();
    }, 100);
}

// Buscar viagem no painel Devoluções (mesmo romaneio; bipagens separadas por fluxo devolução)
window.buscarItensViagemDevolucao = async function() {
    var idInputEl = document.getElementById('dev-id-viagem');
    var idInput = idInputEl ? idInputEl.value.trim() : '';
    if (!idInput) {
        showMessage('Por favor, digite o ID do roteiro ou o ID da viagem', 'error');
        if (idInputEl) idInputEl.focus();
        return;
    }
    window._fluxoBipagemAtivo = 'devolucao';
    var overlayEl = document.getElementById('ravex-loading-overlay');
    var overlayText = document.getElementById('ravex-loading-text');
    var overlayBox = document.getElementById('ravex-loading-box');
    var barTrack = document.getElementById('ravex-loading-bar-track');
    var errorActions = document.getElementById('ravex-error-actions');
    var abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var cancelado = false;
    function showOverlay(msg) {
        if (overlayEl && overlayText) {
            overlayText.textContent = msg || 'Carregando devolução... Aguarde.';
            if (overlayBox) overlayBox.classList.remove('ravex-loading-box--error');
            if (barTrack) barTrack.style.display = '';
            if (errorActions) errorActions.style.display = 'none';
            overlayEl.style.display = 'flex';
        }
        _ravexLoadingSetCancelVisible(true, function() {
            cancelado = true;
            if (abortCtrl) {
                try { abortCtrl.abort(); } catch (e) {}
            }
            hideOverlay();
            showMessage('Carregamento cancelado.', 'warning');
        });
    }
    function hideOverlay() {
        _ravexLoadingSetCancelVisible(false);
        if (overlayEl) overlayEl.style.display = 'none';
    }
    var idAnteriorDev = (window._devConferenciaIdViagemAtiva || '').trim();
    if (idAnteriorDev && idAnteriorDev !== idInput) {
        _limparPendenciasConferenciaTimers();
    }

    showOverlay('Carregando roteiro para devolução... Aguarde.');
    showMessage('Buscando roteiro...', 'success');
    var idViagem = idInput;
    window._devolucaoNfAtiva = null;
    var sucesso = false;
    try {
        await carregarContextoDevolucaoViagem(idInput);
        if (cancelado) return;
        idViagem = _devolucaoGetIdViagemAtivo() || idInput;
        sucesso = true;
    } catch (e) {
        if (cancelado || (e && e._cancelado)) return;
        showMessage('Erro ao conectar. Tente novamente.', 'error');
        if (overlayEl && overlayText) {
            overlayText.textContent = 'Erro: ' + (e.message || 'Não foi possível carregar');
            if (overlayBox) overlayBox.classList.add('ravex-loading-box--error');
            if (barTrack) barTrack.style.display = 'none';
            if (errorActions) errorActions.style.display = 'block';
            _ravexLoadingSetCancelVisible(false);
            var okBtn = document.getElementById('ravex-overlay-ok');
            if (okBtn) okBtn.onclick = function() { hideOverlay(); };
            overlayEl.style.display = 'flex';
            return;
        }
    } finally {
        if (!cancelado) hideOverlay();
    }
    if (!sucesso) return;

    window._devConferenciaIdViagemAtiva = idViagem;

    var hid = document.getElementById('dev-id-viagem-hidden');
    if (hid) hid.value = idViagem;
    if (idInputEl) idInputEl.value = idViagem;
    var formBip = document.getElementById('dev-form-bipagem-container');
    if (formBip) formBip.classList.remove('conferencia-blocos-bloqueado');
    var bloco4Wrap = document.getElementById('dev-conferencia-bloco-4-wrapper');
    if (bloco4Wrap) bloco4Wrap.classList.remove('conferencia-blocos-bloqueado');
    var tituloWrap = document.getElementById('dev-titulo-lista-wrapper');
    if (tituloWrap) tituloWrap.style.display = 'flex';
    var tabelaC = document.getElementById('dev-tabela-conferencia-container');
    if (tabelaC) tabelaC.style.display = 'block';
    setTimeout(function() {
        var docaSelect = document.getElementById('dev-doca');
        var codigoBarrasInput = document.getElementById('dev-codigo-barras');
        var docaVal = docaSelect ? docaSelect.value.trim() : '';
        var docaOk = ['1', '2', '3', '4'].indexOf(docaVal) !== -1;
        if (docaSelect && !docaOk) docaSelect.focus();
        else if (codigoBarrasInput) codigoBarrasInput.focus();
    }, 300);
};

// Limpar apenas os campos do formulário da seção 4. CONFERÊNCIA (não apaga dados bipados)
window.limparCamposConferencia = function() {
    const codigoBarras = document.getElementById('codigo-barras');
    const codigoProduto = document.getElementById('codigo-produto');
    const produtoNome = document.getElementById('produto-nome');
    const quantidade = document.getElementById('quantidade');
    const veiculo = document.getElementById('veiculo');
    const status = document.getElementById('status');
    if (codigoBarras) codigoBarras.value = '';
    if (codigoProduto) codigoProduto.value = '';
    if (produtoNome) produtoNome.value = '';
    if (quantidade) quantidade.value = '1';
    if (veiculo) veiculo.value = '';
    if (status) status.value = 'PENDENTE';
    if (codigoBarras && !codigoBarras.disabled) codigoBarras.focus();
    const aviso = document.getElementById('aviso-produto-fora-relacao');
    if (aviso) aviso.style.display = 'none';
    window.cadastrarExtraAoBipar = false;
};

window.limparCamposDevolucao = function() {
    var codigoBarras = document.getElementById('dev-codigo-barras');
    var codigoProduto = document.getElementById('dev-codigo-produto');
    var produtoNome = document.getElementById('dev-produto-nome');
    var quantidade = document.getElementById('dev-quantidade');
    var veiculo = document.getElementById('dev-veiculo');
    var status = document.getElementById('dev-status');
    if (codigoBarras) codigoBarras.value = '';
    if (codigoProduto) codigoProduto.value = '';
    if (produtoNome) produtoNome.value = '';
    if (quantidade) quantidade.value = '1';
    if (veiculo) veiculo.value = '';
    if (status) status.value = 'PENDENTE';
    if (codigoBarras) codigoBarras.focus();
    var aviso = document.getElementById('dev-aviso-produto-fora-relacao');
    if (aviso) aviso.style.display = 'none';
    window.cadastrarExtraAoBipar = false;
};

function _zerarTabelaConferenciaNoDOM() {
    var isDev = window._fluxoBipagemAtivo === 'devolucao';
    var tbody = document.getElementById(isDev ? 'dev-tbody-conferencia' : 'tbody-conferencia');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(function(row) {
        if (!row.cells || row.cells.length < 11 || row.querySelector('td[colspan]')) return;
        var C = window._CONF_COL;
        var qtdProduto = parseInt(row.cells[C.QTD_PROD].textContent, 10) || 0;
        row.cells[C.BIPADO].innerHTML = '<strong style="color: #666">0</strong>';
        row.cells[C.FALTA].innerHTML = '<strong style="color: ' + (qtdProduto > 0 ? '#f44336' : '#4caf50') + '">' + qtdProduto + '</strong>';
        if (row.cells[C.AVISO]) _aplicarEstiloCelulaAviso(row.cells[C.AVISO], '');
        if (row.cells[C.STATUS]) row.cells[C.STATUS].innerHTML = '<span class="status-badge status-FALTA">❌ PENDENTE</span>';
        row.classList.remove('row-completo', 'row-excedente', 'row-parcial');
        row.classList.add('row-pendente');
        // Recriar célula de ação para remover qualquer hint antigo (ex.: "✓ Completo")
        _conferenciaAtualizarCelulaAcaoLinha(row, 'PENDENTE', 0, qtdProduto);
    });
    atualizarTotaisConferenciaFromDOM();
    atualizarBoxesComprovante();
}

async function _executarZerarBipagemViagem(idViagem) {
    if (!idViagem) {
        showMessage('Nenhuma viagem selecionada.', 'error');
        return false;
    }
    _limparPendenciasConferenciaTimers();
    window._ultimoBipadoCodigo = '';
    _conferenciaLimparPeriodoBipagemLocal(idViagem);
    if (window.ultimoCodigoBuscado) window.ultimoCodigoBuscado = '';
    await _esperarBipagemConferenciaIdle(8000);
    _zerarTabelaConferenciaNoDOM();
    var fluxo = window._fluxoBipagemAtivo === 'devolucao' ? 'devolucao' : 'carregamento';
    try {
        var result = await fetchAPI('/conferencia/' + encodeURIComponent(idViagem) + '/zerar', {
            method: 'POST',
            body: JSON.stringify({ id_viagem: idViagem, fluxo: fluxo })
        });
        if (result && result.success) {
            showMessage(result.mensagem || 'Bipagem zerada. Você pode bipar novamente.', 'success');
            if (_conferenciaUsaRascunhoLocal()) {
                _conferenciaSalvarSessao({ id_viagem: idViagem, comprovante_gerado: false, tem_rascunho: false });
            }
            await reloadConferenciaAtiva(idViagem, {
                forcar: true,
                forcarIgnorarPendencias: true,
                descartarPendencias: true,
                aguardarBipagem: false
            });
            await loadPeriodoCarregamento(idViagem);
            loadEstatisticas();
            if (typeof limparCamposConferencia === 'function' && window._fluxoBipagemAtivo !== 'devolucao') {
                limparCamposConferencia();
            } else if (typeof limparCamposDevolucao === 'function') {
                limparCamposDevolucao();
            }
            return true;
        }
        showMessage((result && result.erro) || 'Não foi possível zerar', 'error');
        await reloadConferenciaAtiva(idViagem, {
            forcar: true,
            forcarIgnorarPendencias: true,
            descartarPendencias: true,
            aguardarBipagem: false
        });
        return false;
    } catch (error) {
        showMessage('Erro ao zerar bipagem', 'error');
        await reloadConferenciaAtiva(idViagem, {
            forcar: true,
            forcarIgnorarPendencias: true,
            descartarPendencias: true,
            aguardarBipagem: false
        });
        return false;
    }
}

function initModalZerarItens() {
    var aceite = document.getElementById('aceite-zerar-itens');
    var btnConfirmar = document.getElementById('btn-confirmar-zerar');
    var modalZerar = document.getElementById('modal-zerar-itens');
    if (!aceite || !btnConfirmar || btnConfirmar._zerarBound) return;
    btnConfirmar._zerarBound = true;
    aceite.addEventListener('change', function() {
        btnConfirmar.disabled = !aceite.checked;
    });
    btnConfirmar.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        void window.executarZerarItens();
    });
    if (modalZerar && !modalZerar._zerarBound) {
        modalZerar._zerarBound = true;
        modalZerar.addEventListener('click', function(e) {
            if (e.target === modalZerar) fecharModalZerarItens();
        });
    }
}

// Abrir modal de aceite para zerar todos os itens
window.abrirModalZerarItens = function() {
    const idViagem = window._getIdViagemAtivo();
    if (!idViagem) {
        showMessage('Busque um roteiro/viagem antes de zerar.', 'error');
        return;
    }
    initModalZerarItens();
    const modal = document.getElementById('modal-zerar-itens');
    const checkbox = document.getElementById('aceite-zerar-itens');
    const btnConfirmar = document.getElementById('btn-confirmar-zerar');
    if (checkbox) checkbox.checked = false;
    if (btnConfirmar) btnConfirmar.disabled = true;
    if (modal) {
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
    }
};

// Fechar modal zerar itens
window.fecharModalZerarItens = function() {
    const modal = document.getElementById('modal-zerar-itens');
    if (modal) modal.style.display = 'none';
};

// Modal excluir item da conferência
window.abrirModalExcluirItem = function(btn) {
    const codigo = btn.getAttribute('data-codigo') || btn.getAttribute('data-conf-codigo') || '';
    const produto = btn.getAttribute('data-produto') || btn.getAttribute('data-conf-produto') || '';
    document.getElementById('modal-excluir-item-codigo').value = codigo;
    document.getElementById('modal-excluir-item-nome').textContent = produto || codigo || '-';
    document.getElementById('modal-excluir-item').style.display = 'block';
};

window.fecharModalExcluirItem = function() {
    document.getElementById('modal-excluir-item').style.display = 'none';
};

window.confirmarExcluirItem = async function() {
    const codigoBarras = document.getElementById('modal-excluir-item-codigo').value.trim();
    const idViagem = window._getIdViagemAtivo();
    if (!codigoBarras || !idViagem) {
        showMessage('Dados inválidos para excluir', 'error');
        return;
    }
    fecharModalExcluirItem();
    try {
        if (_conferenciaUsaRascunhoLocal()) {
            _conferenciaEnfileirarRemoveLocal(codigoBarras, 99999);
            var tbody = document.getElementById('tbody-conferencia');
            if (tbody) {
                var rows = tbody.querySelectorAll('tr');
                for (var i = 0; i < rows.length; i++) {
                    var r = rows[i];
                    var cbCell = r.cells && r.cells[2];
                    if (cbCell && (cbCell.textContent || '').trim() === codigoBarras) {
                        var Cz = window._CONF_COL;
                        var qp = parseInt(r.cells[Cz.QTD_PROD].textContent, 10) || 0;
                        r.cells[Cz.BIPADO].innerHTML = '<strong style="color: #666">0</strong>';
                        r.cells[Cz.FALTA].innerHTML = '<strong style="color: #f44336">' + qp + '</strong>';
                        break;
                    }
                }
            }
            atualizarTotaisConferenciaFromDOM();
            atualizarBoxesComprovante();
            showMessage('Item removido da conferência (será gravado ao gerar o comprovante).', 'success');
            return;
        }
        await _flushTodasPendenciasConferencia();
        const result = await fetchAPI('/conferencia/remover', {
            method: 'POST',
            body: JSON.stringify({
                id_viagem: idViagem,
                codigo_barras: codigoBarras,
                quantidade: 'tudo',
                fluxo: (window._fluxoBipagemAtivo === 'devolucao') ? 'devolucao' : 'carregamento'
            })
        });
        if (result && result.success) {
            showMessage(result.mensagem || 'Item excluído da conferência.', 'success');
            await reloadConferenciaAtiva(idViagem, { forcar: true, forcarIgnorarPendencias: true });
            loadPeriodoCarregamento(idViagem);
            loadEstatisticas();
        } else {
            showMessage(result?.erro || 'Não foi possível excluir o item', 'error');
        }
    } catch (e) {
        showMessage('Erro ao excluir item', 'error');
    }
};

// Executar zerar todos os itens (após aceite)
window.executarZerarItens = async function() {
    const idViagem = window._getIdViagemAtivo();
    if (!idViagem) {
        showMessage('Nenhuma viagem selecionada.', 'error');
        return;
    }
    const aceite = document.getElementById('aceite-zerar-itens');
    if (!aceite || !aceite.checked) {
        showMessage('Marque a caixa de aceite para confirmar.', 'warning');
        return;
    }
    const btnConfirmar = document.getElementById('btn-confirmar-zerar');
    if (btnConfirmar) btnConfirmar.disabled = true;
    fecharModalZerarItens();
    try {
        await _executarZerarBipagemViagem(idViagem);
    } finally {
        if (btnConfirmar && aceite) btnConfirmar.disabled = !aceite.checked;
    }
};

// Carregar Conferência (itens da viagem com status de bipado)
function agruparConferenciaPorCodigoProduto(conferencia) {
    if (!Array.isArray(conferencia) || conferencia.length === 0) return [];
    const grupos = new Map();

    conferencia.forEach(function(item, idx) {
        const codigoProduto = (item && item.codigo_produto != null) ? item.codigo_produto.toString().trim() : '';
        const codigoBarras = (item && item.codigo_barras != null) ? item.codigo_barras.toString().trim() : '';
        const chave = codigoProduto || codigoBarras || ('__idx__' + idx);

        if (!grupos.has(chave)) {
            grupos.set(chave, {
                codigo_produto: codigoProduto || (item.codigo_produto || ''),
                produto: item.produto || '',
                unidade: item.unidade || '',
                peso_bruto: item.peso_bruto,
                codigo_barras: item.codigo_barras || '',
                motivo_divergencia: item.motivo_divergencia || '',
                quantidade_produto: 0,
                quantidade_bipada: 0,
                quantidade_falta: 0,
                status_bipado: 'PENDENTE',
                aviso_sobra: '',
                _codigos_barras: new Set()
            });
        }

        const g = grupos.get(chave);

        // Consolidar campos de texto (primeiro não vazio)
        if (!g.produto && item.produto) g.produto = item.produto;
        if (!g.unidade && item.unidade) g.unidade = item.unidade;
        if ((g.peso_bruto == null || g.peso_bruto === '') && item.peso_bruto != null && item.peso_bruto !== '') g.peso_bruto = item.peso_bruto;
        if (!g.motivo_divergencia && item.motivo_divergencia) g.motivo_divergencia = item.motivo_divergencia;

        const cb = (item.codigo_barras || '').toString().trim();
        if (cb && cb !== '-') g._codigos_barras.add(cb);

        var qProd = parseInt(item.quantidade_produto, 10) || 0;
        // Soma linhas do romaneio (igual ao backend); bipado usa o maior entre EAN/DUN
        if (qProd > 0) g.quantidade_produto += qProd;
        var qBip = parseInt(item.quantidade_bipada, 10) || 0;
        if (qBip > g.quantidade_bipada) g.quantidade_bipada = qBip;
    });

    return Array.from(grupos.values()).map(function(g) {
        const totalProduto = parseInt(g.quantidade_produto, 10) || 0;
        const totalBipada = parseInt(g.quantidade_bipada, 10) || 0;
        const sobra = Math.max(0, totalBipada - totalProduto);
        const falta = Math.max(0, totalProduto - totalBipada);

        // Código de barras: se houver mais de um, mantém ordem estável (alfabética) e avisa.
        const codigos = Array.from(g._codigos_barras).filter(function(c) { return c && c !== '-'; }).sort();
        if (codigos.length === 1) {
            g.codigo_barras = codigos[0];
        } else if (codigos.length > 1) {
            g.codigo_barras = codigos[0];
            if (!g.aviso_sobra || g.aviso_sobra.indexOf('Múltiplos códigos') < 0) {
                g.aviso_sobra = '⚠️ Múltiplos códigos: ' + codigos.join(', ');
            }
        } else {
            g.codigo_barras = g.codigo_barras || '-';
        }

        g.quantidade_falta = falta;
        g.status_bipado = _statusBipagemConferencia(totalProduto, totalBipada);
        g.aviso_sobra = _avisoConferenciaBipagem(g.aviso_sobra, totalProduto, totalBipada);

        delete g._codigos_barras;
        return g;
    });
}

function _habilitarUiConferenciaViagem(idViagem) {
    if (!idViagem) return;
    window._conferenciaIdViagemAtiva = idViagem;
    var hid = document.getElementById('id-viagem-hidden');
    var inp = document.getElementById('id-viagem');
    if (hid) hid.value = idViagem;
    if (inp) inp.value = idViagem;
    var formBip = document.getElementById('form-bipagem-container');
    if (formBip) formBip.classList.remove('conferencia-blocos-bloqueado');
    var bloco4Wrap = document.getElementById('conferencia-bloco-4-wrapper');
    if (bloco4Wrap) bloco4Wrap.classList.remove('conferencia-blocos-bloqueado');
    var tituloWrap = document.getElementById('titulo-lista-wrapper');
    if (tituloWrap) tituloWrap.style.display = 'flex';
    var tabContainer = document.getElementById('tabela-conferencia-container');
    if (tabContainer) tabContainer.style.display = 'block';
    var periodoBox = document.getElementById('periodo-carregamento-box');
    if (periodoBox) periodoBox.style.display = 'block';
    var btnVoltarBipar = document.getElementById('btn-voltar-bipar');
    if (btnVoltarBipar) btnVoltarBipar.style.display = 'inline-block';
    if (typeof window.atualizarEstadoCampoBipar === 'function') window.atualizarEstadoCampoBipar();
}

function _htmlLinhaConferenciaTabela(item, idViagem, motivosEmEdicao) {
    const statusClass = item.status_bipado === 'COMPLETO' ? 'status-OK' :
                       item.status_bipado === 'EXCEDENTE' ? 'status-EXCEDENTE' :
                       item.status_bipado === 'PARCIAL' ? 'status-SOBRA' : 'status-FALTA';
    const statusText = item.status_bipado === 'COMPLETO' ? '✅ COMPLETO' :
                      item.status_bipado === 'EXCEDENTE' ? '📦 EXCEDENTE' :
                      item.status_bipado === 'PARCIAL' ? '⚠️ PARCIAL' : '❌ PENDENTE';
    const rowClass = item.status_bipado === 'COMPLETO' ? 'row-completo' :
                    item.status_bipado === 'EXCEDENTE' ? 'row-excedente' :
                    item.status_bipado === 'PENDENTE' ? 'row-pendente' : 'row-parcial';
    const codigoBarras = item.codigo_barras || '-';
    const unidade = (item.unidade || '-').toString();
    const qtdBipada = item.quantidade_bipada || 0;
    const qtdProdutoItem = item.quantidade_produto || 0;
    const avisoSobra = _avisoConferenciaBipagem(item.aviso_sobra, qtdProdutoItem, qtdBipada);
    const btns = _htmlBotoesAcaoConferencia({
        codigo_barras: codigoBarras,
        produto: item.produto,
        quantidade_bipada: qtdBipada,
        quantidade_falta: item.quantidade_falta,
        sem_codigo_html: (item.quantidade_falta > 0 ? '<span style="color: #ff9800;" title="Adicione o código do produto ' + escapeHtml(item.codigo_produto || '') + ' na aba BASE com o código de barras correspondente.">⚠️ Sem código de barras</span>' : '')
    });
    const motivoBruto = motivosEmEdicao[idViagem + '|' + (item.codigo_produto || '')] !== undefined ? motivosEmEdicao[idViagem + '|' + (item.codigo_produto || '')] : (item.motivo_divergencia || '');
    const motivoVal = (motivoBruto || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const codigoProdutoEsc = (item.codigo_produto || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<tr class="' + rowClass + '" data-codigo="' + (item.codigo_produto || '') + '">'
        + '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>'
        + '<td><input type="text" class="input-motivo-divergencia" data-id-viagem="' + escHtml(idViagem) + '" data-codigo-produto="' + codigoProdutoEsc + '" value="' + motivoVal + '" placeholder="Motivo da divergência" onblur="salvarMotivoDivergencia(this)" title="Escreva o motivo e saia do campo para salvar"></td>'
        + '<td><strong>' + codigoBarras + '</strong></td>'
        + '<td><strong style="color: #1976D2;">' + (item.codigo_produto || '-') + '</strong></td>'
        + '<td>' + (item.produto || '-') + '</td>'
        + '<td><strong>' + (item.quantidade_produto || 0) + '</strong></td>'
        + '<td><strong style="color: ' + (qtdBipada > 0 ? '#4caf50' : '#666') + '">' + qtdBipada + '</strong></td>'
        + '<td>' + unidade + '</td>'
        + '<td>' + ((item.peso_bruto != null && item.peso_bruto !== '') ? item.peso_bruto : '-') + '</td>'
        + _htmlTdAviso(avisoSobra)
        + '<td><strong style="color: ' + (item.quantidade_falta > 0 ? '#f44336' : '#4caf50') + '">' + (item.quantidade_falta || 0) + '</strong></td>'
        + '<td style="max-width: 280px;"><div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">'
        + btns.bipar + (btns.tirar || '') + (codigoBarras !== '-' ? (btns.excluir || '') : '')
        + (item.quantidade_falta <= 0 && item.status_bipado !== 'EXCEDENTE' ? '<span style="color: #4caf50; font-weight: bold;">✓ Completo</span>' : '')
        + (item.status_bipado === 'EXCEDENTE' ? '<span style="color: #e65100; font-weight: bold;">Bipado a mais</span>' : '')
        + '</div></td></tr>';
}

function _renderizarTabelaConferenciaChunked(tbody, conferenciaOrdenada, idViagem, motivosEmEdicao, fluxoTab, seq) {
    var CHUNK = 250;
    if (!tbody || conferenciaOrdenada.length <= CHUNK) {
        tbody.innerHTML = conferenciaOrdenada.map(function(item) {
            return _htmlLinhaConferenciaTabela(item, idViagem, motivosEmEdicao);
        }).join('');
        atualizarTotaisConferenciaFromData(conferenciaOrdenada, fluxoTab);
        return Promise.resolve();
    }
    return new Promise(function(resolve) {
        tbody.innerHTML = '<tr><td colspan="12" class="loading">Montando ' + conferenciaOrdenada.length + ' itens...</td></tr>';
        var idx = 0;
        function pintarLote() {
            if (seq !== window._conferenciaLoadSeq) { resolve(); return; }
            var fim = Math.min(idx + CHUNK, conferenciaOrdenada.length);
            var html = '';
            for (var i = idx; i < fim; i++) {
                html += _htmlLinhaConferenciaTabela(conferenciaOrdenada[i], idViagem, motivosEmEdicao);
            }
            if (idx === 0) {
                tbody.innerHTML = html;
            } else {
                var wrap = document.createElement('tbody');
                wrap.innerHTML = html;
                while (wrap.firstChild) tbody.appendChild(wrap.firstChild);
            }
            idx = fim;
            if (idx < conferenciaOrdenada.length) {
                requestAnimationFrame(pintarLote);
            } else {
                atualizarTotaisConferenciaFromData(conferenciaOrdenada, fluxoTab);
                resolve();
            }
        }
        requestAnimationFrame(pintarLote);
    });
}

// Atualiza caixa "Gerar comprovante completo" (verde) vs "Gerar comprovante divergente" (laranja). Se conferenciaUI for passado, usa os dados; senão lê da tabela (DOM) para atualização imediata após Bipar/Tirar 1.
function atualizarBoxesComprovante(conferenciaUI, fluxoTab) {
    if (fluxoTab === 'devolucao') return;
    var todosCompletos = false;
    var temItens = false;
    if (conferenciaUI && Array.isArray(conferenciaUI) && conferenciaUI.length > 0) {
        temItens = true;
        todosCompletos = conferenciaUI.every(function(item) {
            return _statusBipagemConferencia(item.quantidade_produto, item.quantidade_bipada) === 'COMPLETO';
        });
    } else {
        var tbody = document.getElementById('tbody-conferencia');
        if (tbody) {
            var rows = tbody.querySelectorAll('tr');
            todosCompletos = true;
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (!row.cells || row.cells.length < 11 || row.querySelector('td[colspan]')) continue;
                temItens = true;
                var Cb = window._CONF_COL;
                var qtdProd = parseInt(row.cells[Cb.QTD_PROD].textContent, 10) || 0;
                var qtdBip = parseInt(row.cells[Cb.BIPADO].textContent, 10) || 0;
                if (_statusBipagemConferencia(qtdProd, qtdBip) !== 'COMPLETO') {
                    todosCompletos = false;
                    break;
                }
            }
        }
    }
    var boxCompleto = document.getElementById('conferencia-completa-box');
    var boxDivergente = document.getElementById('conferencia-divergente-box');
    if (boxCompleto) boxCompleto.style.display = (temItens && todosCompletos) ? 'block' : 'none';
    if (boxDivergente) boxDivergente.style.display = (temItens && !todosCompletos) ? 'block' : 'none';
}

async function loadConferencia(idViagem = null, opts) {
    opts = opts || {};
    const fluxoTab = opts.fluxo || 'carregamento';
    const isDev = fluxoTab === 'devolucao';
    const forcarRecarga = !!(opts.forcar || opts.sincronizarServidor);
    if (!forcarRecarga && _conferenciaTemPendenciasLocais()) {
        return;
    }
    window._conferenciaLoadSeq = (window._conferenciaLoadSeq || 0) + 1;
    var seq = window._conferenciaLoadSeq;
    function L(id) {
        if (!isDev) return document.getElementById(id);
        const map = {
            'tbody-conferencia': 'dev-tbody-conferencia',
            'conferencia-limit-info': 'dev-conferencia-limit-info',
            'titulo-lista-wrapper': 'dev-titulo-lista-wrapper',
            'tabela-conferencia-container': 'dev-tabela-conferencia-container',
            'display-id-roteiro': 'dev-display-id-roteiro',
            'display-id-viagem': 'dev-display-id-viagem',
            'viagem-identificador-rota': 'dev-viagem-identificador-rota',
            'viagem-placa': 'dev-viagem-placa',
            'viagem-motorista': 'dev-viagem-motorista',
            'data-expedicao': 'dev-data-expedicao',
            'id-viagem-hidden': 'dev-id-viagem-hidden',
            'id-viagem': 'dev-id-viagem',
        };
        return document.getElementById(map[id] || ('dev-' + id));
    }
    if (!idViagem) {
        const idViagemInput = L('id-viagem');
        if (idViagemInput) {
            idViagem = idViagemInput.value.trim();
        }
    }

    if (!idViagem) {
        return;
    }

    try {
        var conferencia;
        if (opts.respCache && !opts.forcar) {
            conferencia = opts.respCache;
        } else if (opts._listaOverride && Array.isArray(opts._listaOverride)) {
            conferencia = { lista: opts._listaOverride, id_viagem: idViagem, modo_devolucao_nf: !!opts._modoDevolucaoNf };
        } else if (isDev && window._devolucaoNfAtiva && window._devolucaoNfAtiva.id) {
            var fetchOptsNf = {};
            if (opts.signal) fetchOptsNf.signal = opts.signal;
            conferencia = await _modFetchGet('/devolucoes/conferencia/' + encodeURIComponent(idViagem) + '?devolucao_nf_id=' + encodeURIComponent(window._devolucaoNfAtiva.id), 90000);
        } else if (isDev) {
            conferencia = { lista: [], id_viagem: idViagem };
        } else {
        var q = (opts.rapido === false) ? '?limit=2000' : _conferenciaQueryRapida();
        if (opts.verificarBaixado === false) q += (q.indexOf('?') >= 0 ? '&' : '?') + 'verificar_baixado=0';
        if (isDev) q += (q.indexOf('?') >= 0 ? '&' : '?') + 'fluxo=devolucao';
        var fetchOpts = {};
        if (opts.signal) fetchOpts.signal = opts.signal;
        conferencia = await fetchAPIComTimeout('/conferencia/' + encodeURIComponent(idViagem) + q, fetchOpts, 90000);
        }
        if (seq !== window._conferenciaLoadSeq) return;
        if (conferencia && conferencia._cancelado) {
            var errCancel = new Error('Cancelado');
            errCancel._cancelado = true;
            throw errCancel;
        }
        if (typeof opts.onDadosRecebidos === 'function') {
            try { opts.onDadosRecebidos(conferencia); } catch (eCb) { /* ignore */ }
        }
        if (opts.silencioso && _conferenciaTemPendenciasLocais()) {
            if (!isDev && conferencia && !conferencia.erro) {
                _cacheExtratoSalvar(idViagem, fluxoTab, conferencia);
            }
            return conferencia;
        }
        if (conferencia && !conferencia.erro) {
            const listaParaUI = Array.isArray(conferencia.lista) ? conferencia.lista : (Array.isArray(conferencia) ? conferencia : []);
            if (conferencia.id_roteiro !== undefined || conferencia.id_viagem !== undefined || conferencia.identificador_rota !== undefined || conferencia.placa !== undefined || conferencia.motorista !== undefined || conferencia.data_expedicao !== undefined) {
                var elR = L('display-id-roteiro'); if (elR) elR.textContent = (conferencia.id_roteiro && String(conferencia.id_roteiro).trim()) ? conferencia.id_roteiro : '-';
                var elV = L('display-id-viagem'); if (elV) elV.textContent = (conferencia.id_viagem && String(conferencia.id_viagem).trim()) ? conferencia.id_viagem : (idViagem || '-');
                var elIdRota = L('viagem-identificador-rota'); if (elIdRota) elIdRota.textContent = (conferencia.identificador_rota && String(conferencia.identificador_rota).trim()) ? conferencia.identificador_rota : '-';
                var elP = L('viagem-placa'); if (elP) elP.value = (conferencia.placa && String(conferencia.placa).trim()) ? conferencia.placa : '';
                var elM = L('viagem-motorista'); if (elM) elM.value = (conferencia.motorista && String(conferencia.motorista).trim()) ? conferencia.motorista : '';
                var elD = L('data-expedicao'); if (elD) elD.textContent = (conferencia.data_expedicao && String(conferencia.data_expedicao).trim()) ? conferencia.data_expedicao : '-';
                if (conferencia.id_viagem && String(conferencia.id_viagem).trim()) {
                    var h = L('id-viagem-hidden'); if (h) h.value = conferencia.id_viagem;
                    var i = L('id-viagem'); if (i) i.value = conferencia.id_viagem;
                }
                if (!isDev) {
                    _preencherDatalist('datalist-placas', listaPlacas, [
                        conferencia.placa,
                        elP && elP.value ? elP.value : ''
                    ]);
                    _preencherDatalist('datalist-motoristas', listaColaboradoresMotoristas, [
                        conferencia.motorista,
                        elM && elM.value ? elM.value : ''
                    ]);
                }
            }
            if (!isDev) {
                atualizarSugestoesRotaConferencia();
                _cacheExtratoSalvar(idViagem, fluxoTab, conferencia);
                _conferenciaAtualizarAvisoNaoBaixado(conferencia);
            }
            _aplicarExtrasConferenciaResponse(conferencia, idViagem, isDev);
            const conferenciaUI = conferencia.lista_ja_agregada ? listaParaUI : agruparConferenciaPorCodigoProduto(listaParaUI);
            const tbody = L('tbody-conferencia');
            // Preservar texto que o usuário está digitando nos campos Motivo ao atualizar a tabela (ex.: refresh a cada 5s)
            const motivosEmEdicao = {};
            if (tbody) {
                tbody.querySelectorAll('.input-motivo-divergencia').forEach(function(inp) {
                    var cod = unescapeHtml(inp.getAttribute('data-codigo-produto') || '');
                    var chave = idViagem + '|' + cod;
                    motivosEmEdicao[chave] = inp.value;
                });
            }
            var limitInfo = L('conferencia-limit-info');
            if (limitInfo) {
                var totalR = conferencia.total_romaneio != null ? Number(conferencia.total_romaneio) : 0;
                var limitR = conferencia.limit_romaneio != null ? Number(conferencia.limit_romaneio) : 0;
                if (totalR > limitR && limitR > 0) {
                    limitInfo.textContent = 'Mostrando at\u00e9 ' + limitR + ' de ' + totalR + ' itens do romaneio (carregamento r\u00e1pido).';
                    limitInfo.style.display = 'block';
                } else {
                    limitInfo.style.display = 'none';
                }
            }
            if (!tbody) {
                showMessage('Não foi possível atualizar a tabela.', 'error');
                return undefined;
            }
            if (conferenciaUI.length === 0) {
                var msgVazio = (isDev && (!window._devolucaoNfAtiva || !window._devolucaoNfAtiva.id))
                    ? 'Inicie uma NF e bip os itens do retorno.'
                    : (isDev ? 'Nenhum item bipado nesta NF ainda. Escaneie o retorno.' : 'Nenhum item encontrado para esta viagem no romaneio.');
                if (!isDev && conferencia.ja_baixado_ravex === false && conferencia.aviso_ravex) {
                    msgVazio = conferencia.aviso_ravex;
                }
                tbody.innerHTML = '<tr><td colspan="12" class="loading">' + escapeHtml(msgVazio) + '</td></tr>';
                atualizarTotaisConferenciaFromData([], fluxoTab);
            } else {
            // Ordenar: item bipado por último no topo; itens COMPLETO no final
            const ultimoCodigo = (window._ultimoBipadoCodigo || '').toString().trim();
            const conferenciaOrdenada = conferenciaUI.slice().sort(function(a, b) {
                const aCompleto = (a.status_bipado || '') === 'COMPLETO';
                const bCompleto = (b.status_bipado || '') === 'COMPLETO';
                if (aCompleto && !bCompleto) return 1;
                if (!aCompleto && bCompleto) return -1;
                if (aCompleto && bCompleto) return 0;
                const aCodigo = (a.codigo_barras || '').toString().trim();
                const bCodigo = (b.codigo_barras || '').toString().trim();
                if (aCodigo === ultimoCodigo && bCodigo !== ultimoCodigo) return -1;
                if (aCodigo !== ultimoCodigo && bCodigo === ultimoCodigo) return 1;
                return 0;
            });
            if (ultimoCodigo) {
                const itemBipado = conferenciaOrdenada.find(function(it) { return (it.codigo_barras || '').toString().trim() === ultimoCodigo; });
                if (itemBipado && (itemBipado.status_bipado || '') === 'COMPLETO') window._ultimoBipadoCodigo = '';
            }
            void _renderizarTabelaConferenciaChunked(tbody, conferenciaOrdenada, idViagem, motivosEmEdicao, fluxoTab, seq).then(function() {
                if (seq !== window._conferenciaLoadSeq) return;
                atualizarBoxesComprovante(conferenciaUI, fluxoTab);
            });
            }
            var tituloWrap = L('titulo-lista-wrapper');
            var tabContainer = L('tabela-conferencia-container');
            if (tituloWrap) tituloWrap.style.display = 'flex';
            if (tabContainer) tabContainer.style.display = 'block';
            var btnZ = isDev ? document.getElementById('dev-btn-zerar-bipados') : document.getElementById('btn-voltar-bipar');
            if (btnZ) btnZ.style.display = 'inline-block';
            if (conferenciaUI.length <= 250) {
                atualizarBoxesComprovante(conferenciaUI, fluxoTab);
            }
            if (isDev) window._devConferenciaIdViagemAtiva = idViagem;
            else window._conferenciaIdViagemAtiva = idViagem;
            if (!isDev && _conferenciaUsaRascunhoLocal()) _conferenciaAtualizarAvisoRascunho();
            return conferencia;
        } else if (conferencia && conferencia.erro) {
            const tbodyE = L('tbody-conferencia');
            if (tbodyE) tbodyE.innerHTML = `<tr><td colspan="12" class="loading" style="color: #f44336;">Erro: ${conferencia.erro}</td></tr>`;
            if (!isDev) _conferenciaAtualizarAvisoNaoBaixado({ ja_baixado_ravex: true });
            showMessage(conferencia.erro, 'error');
            return undefined;
        } else {
            const tbodyE = L('tbody-conferencia');
            if (tbodyE) tbodyE.innerHTML = '<tr><td colspan="12" class="loading">Erro ao carregar dados. Verifique o ID (roteiro ou viagem) e se os dados foram importados pela aba Importar Ravex.</td></tr>';
            return undefined;
        }
    } catch (error) {
        if (error && error._cancelado) {
            throw error;
        }
        const fluxoTab2 = (opts && opts.fluxo) || 'carregamento';
        const isDev2 = fluxoTab2 === 'devolucao';
        function L2(id) {
            if (!isDev2) return document.getElementById(id);
            const map = {
                'tbody-conferencia': 'dev-tbody-conferencia',
            };
            return document.getElementById(map[id] || ('dev-' + id));
        }
        const tbodyE = L2('tbody-conferencia');
        if (tbodyE) tbodyE.innerHTML = '<tr><td colspan="12" class="loading" style="color: #f44336;">Erro ao buscar itens da viagem.</td></tr>';
        showMessage('Erro ao buscar itens da viagem', 'error');
        return undefined;
    }
}

// Pendências da conferência: botões livres atualizam a tela na hora; ao parar de clicar (debounce) envia ao servidor.
if (typeof window._conferenciaPending !== 'object') {
    window._conferenciaPending = { removes: {}, removeTimers: {}, adds: {}, addTimers: {}, DEBOUNCE_MS: 700 };
}
function _flushRemove(codigoBarras) {
    if (_conferenciaUsaRascunhoLocal() && !window._conferenciaSalvandoNoComprovante) return;
    var idViagem = (window._getIdViagemAtivo && window._getIdViagemAtivo()) || (document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value.trim());
    if (!idViagem || !codigoBarras) return;
    var n = window._conferenciaPending.removes[codigoBarras];
    if (n == null || n <= 0) return;
    delete window._conferenciaPending.removes[codigoBarras];
    if (window._conferenciaPending.removeTimers[codigoBarras]) {
        clearTimeout(window._conferenciaPending.removeTimers[codigoBarras]);
        delete window._conferenciaPending.removeTimers[codigoBarras];
    }
    fetchAPI('/conferencia/remover', {
        method: 'POST',
        body: JSON.stringify({
            id_viagem: idViagem,
            codigo_barras: codigoBarras,
            quantidade: n,
            fluxo: (window._fluxoBipagemAtivo === 'devolucao') ? 'devolucao' : 'carregamento'
        })
    }).then(function(result) {
        if (result && result.success) {
            agendarReloadConferenciaAtiva(idViagem);
            loadPeriodoCarregamento(idViagem);
            loadEstatisticas();
        } else {
            showMessage(result && result.erro ? result.erro : 'Não foi possível remover', 'error');
            agendarReloadConferenciaAtiva(idViagem);
        }
    }).catch(function() {
        showMessage('Erro ao remover item', 'error');
        agendarReloadConferenciaAtiva(idViagem);
    });
}
function _flushAdd(codigoBarras) {
    if (_conferenciaUsaRascunhoLocal() && !window._conferenciaSalvandoNoComprovante) return;
    var idViagem = window._getIdViagemAtivo && window._getIdViagemAtivo();
    if (!idViagem || !codigoBarras) return;
    var entry = window._conferenciaPending.adds[codigoBarras];
    if (!entry || !entry.qtd || entry.qtd <= 0) return;
    var qtd = entry.qtd;
    delete window._conferenciaPending.adds[codigoBarras];
    if (window._conferenciaPending.addTimers[codigoBarras]) {
        clearTimeout(window._conferenciaPending.addTimers[codigoBarras]);
        delete window._conferenciaPending.addTimers[codigoBarras];
    }
    window._ultimoBipadoCodigo = (codigoBarras || '').toString().trim();
    buscarProdutoNaPlanilha(codigoBarras, qtd, true).then(function() {
        agendarReloadConferenciaAtiva(idViagem);
        loadEstatisticas();
    }).catch(function() {
        agendarReloadConferenciaAtiva(idViagem);
    });
}

// Tirar itens bipados. Tirar 1: sem confirm, atualiza tela e envia ao parar (debounce). Tirar tudo: confirm e envia na hora.
window.tirarBipado = async function(btnOrCodigo, codigoBarrasOrQtd, quantidadeMaybe) {
    var btn = (typeof btnOrCodigo === 'object' && btnOrCodigo && btnOrCodigo.nodeType) ? btnOrCodigo : null;
    var codigoBarras = btn ? codigoBarrasOrQtd : btnOrCodigo;
    var quantidade = btn ? quantidadeMaybe : codigoBarrasOrQtd;
    var cb = document.getElementById(window._fluxoBipagemAtivo === 'devolucao' ? 'dev-codigo-barras' : 'codigo-barras');
    if (cb) cb.value = '';
    const idViagem = window._getIdViagemAtivo();
    if (!idViagem) {
        showMessage('Nenhuma viagem selecionada', 'error');
        return;
    }
    if (!codigoBarras || codigoBarras === '-') {
        showMessage('Item sem código de barras', 'error');
        return;
    }
    const qtd = quantidade === 'tudo' || quantidade === 'all' ? 'tudo' : (parseInt(quantidade, 10) || 1);
    var row = btn ? btn.closest('tr') : null;
    var cells = row && row.cells && row.cells.length >= 11 ? row.cells : null;

    if (qtd === 'tudo') {
        var okTudo = await _conferenciaConfirmarAcaoModal(
            'Tirar tudo',
            'Remover todas as unidades bipadas deste item?',
            'Sim, remover tudo'
        );
        if (!okTudo) return;
        try {
            if (_conferenciaUsaRascunhoLocal()) {
                var qtdBipTudo = cells ? (parseInt(cells[window._CONF_COL.BIPADO].textContent, 10) || 0) : 0;
                if (qtdBipTudo > 0) {
                    var dataCodTudo = (row && row.getAttribute('data-codigo')) || '';
                    _conferenciaProcessarBipagemCodigo(codigoBarras, -qtdBipTudo, dataCodTudo, { permitirRepetir: true });
                }
                atualizarBoxesComprovante();
                return;
            }
            await _flushTodasPendenciasConferencia();
            if (cells) {
                var Ct = window._CONF_COL;
                var qtdProduto = parseInt(cells[Ct.QTD_PROD].textContent, 10) || 0;
                cells[Ct.BIPADO].innerHTML = '<strong style="color: #666">0</strong>';
                cells[Ct.FALTA].innerHTML = '<strong style="color: #f44336">' + qtdProduto + '</strong>';
                if (row.cells[Ct.AVISO]) _aplicarEstiloCelulaAviso(row.cells[Ct.AVISO], '');
                if (row && row.classList) {
                    row.classList.remove('row-completo', 'row-excedente', 'row-parcial');
                    row.classList.add('row-pendente');
                    if (row.cells[Ct.STATUS]) row.cells[Ct.STATUS].innerHTML = '<span class="status-badge status-FALTA">❌ PENDENTE</span>';
                }
                atualizarTotaisConferenciaFromDOM();
                atualizarBoxesComprovante();
            }
            const result = await fetchAPI('/conferencia/remover', {
                method: 'POST',
                body: JSON.stringify({
                    id_viagem: idViagem,
                    codigo_barras: codigoBarras,
                    quantidade: 'tudo',
                    fluxo: (window._fluxoBipagemAtivo === 'devolucao') ? 'devolucao' : 'carregamento'
                })
            });
            if (result && result.success) {
                showMessage(result.mensagem || 'Item(s) removido(s).', 'success');
                await reloadConferenciaAtiva(idViagem, { forcar: true, forcarIgnorarPendencias: true });
                loadPeriodoCarregamento(idViagem);
                loadEstatisticas();
            } else {
                showMessage(result && result.erro ? result.erro : 'Não foi possível remover', 'error');
                await reloadConferenciaAtiva(idViagem, { forcar: true, forcarIgnorarPendencias: true });
            }
        } catch (e) {
            showMessage('Erro ao remover item', 'error');
            if (!_conferenciaUsaRascunhoLocal()) {
                await reloadConferenciaAtiva(idViagem, { forcar: true, forcarIgnorarPendencias: true });
            }
        }
        return;
    }

    if (cells) {
        var qtdBipada = parseInt(cells[window._CONF_COL.BIPADO].textContent, 10) || 0;
        if (qtdBipada <= 0) return;
        var dataCod = (row && row.getAttribute('data-codigo')) || '';
        _conferenciaProcessarBipagemCodigo(codigoBarras, -1, dataCod);
    } else if (_conferenciaUsaRascunhoLocal()) {
        _conferenciaEnfileirarRemoveLocal(codigoBarras, 1);
    } else {
        window._conferenciaPending.removes[codigoBarras] = (window._conferenciaPending.removes[codigoBarras] || 0) + 1;
        if (window._conferenciaPending.removeTimers[codigoBarras]) clearTimeout(window._conferenciaPending.removeTimers[codigoBarras]);
        window._conferenciaPending.removeTimers[codigoBarras] = setTimeout(function() {
            _flushRemove(codigoBarras);
        }, window._conferenciaPending.DEBOUNCE_MS);
    }
};

// Bipar Item diretamente da lista — botão livre: cada clique atualiza a tela; ao parar de clicar (debounce) envia add em lote.
window.biparItem = function(btnOrCodigo, codigoBarrasOrProduto, produtoOrQtd, quantidadeFaltaMaybe) {
    var btn = (typeof btnOrCodigo === 'object' && btnOrCodigo && btnOrCodigo.nodeType) ? btnOrCodigo : null;
    var codigoBarras = btn ? codigoBarrasOrProduto : btnOrCodigo;
    var produto = btn ? produtoOrQtd : codigoBarrasOrProduto;
    var quantidadeFalta = btn ? quantidadeFaltaMaybe : produtoOrQtd;
    const idViagem = window._getIdViagemAtivo();
    if (!idViagem) {
        showMessage('Nenhuma viagem selecionada', 'error');
        return;
    }
    var dev = window._fluxoBipagemAtivo === 'devolucao';
    var cb = document.getElementById(dev ? 'dev-codigo-barras' : 'codigo-barras');
    if (cb) cb.value = codigoBarras;
    document.getElementById(dev ? 'dev-produto-nome' : 'produto-nome').value = produto;
    document.getElementById(dev ? 'dev-quantidade' : 'quantidade').value = 1;
    var row = btn ? btn.closest('tr') : null;
    var dataCod = (row && row.getAttribute('data-codigo')) || '';
    _conferenciaProcessarBipagemCodigo(codigoBarras, 1, dataCod, { permitirExcedente: true, permitirRepetir: true });
    _conferenciaResetarQtdBipada();
    if (cb) cb.focus();
}

window.abrirModalComprovanteCompleto = function() {
    var pre = _conferenciaValidarPreComprovante();
    if (!pre.ok) {
        _conferenciaMostrarErroComprovante(pre.erro, pre.focarDoca);
        return;
    }
    var modal = document.getElementById('modal-comprovante-completo');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
    }
};

window.fecharModalComprovanteCompleto = function() {
    var modal = document.getElementById('modal-comprovante-completo');
    if (modal) modal.style.display = 'none';
};

window.confirmarGerarComprovanteCompleto = function() {
    var pre = _conferenciaValidarPreComprovante();
    if (!pre.ok) {
        fecharModalComprovanteCompleto();
        _conferenciaMostrarErroComprovante(pre.erro, pre.focarDoca);
        return;
    }
    fecharModalComprovanteCompleto();
    void _conferenciaSalvarBipagemEGerarExtrato();
};

// Comprovante divergente: modal de confirmação
window.abrirModalComprovanteDivergente = function() {
    var pre = _conferenciaValidarPreComprovante();
    if (!pre.ok) {
        _conferenciaMostrarErroComprovante(pre.erro, pre.focarDoca);
        return;
    }
    const modal = document.getElementById('modal-comprovante-divergente');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
    }
};

window.fecharModalComprovanteDivergente = function() {
    const modal = document.getElementById('modal-comprovante-divergente');
    if (modal) modal.style.display = 'none';
};

window.confirmarGerarComprovanteDivergente = function() {
    var pre = _conferenciaValidarPreComprovante();
    if (!pre.ok) {
        fecharModalComprovanteDivergente();
        _conferenciaMostrarErroComprovante(pre.erro, pre.focarDoca);
        return;
    }
    fecharModalComprovanteDivergente();
    void _conferenciaSalvarBipagemEGerarExtrato();
};

// Legado: extrato sem salvar (uso interno após salvar)
window.gerarComprovanteCarregamento = function() {
    abrirModalComprovanteCompleto();
};

// Excluir extrato da viagem (apaga todos os itens bipados dessa viagem)
window.excluirExtratoViagem = function() {
    const idViagem = document.getElementById('extrato-id-viagem').value.trim();
    if (!idViagem) {
        showMessage('Busque um extrato por ID do roteiro antes de excluir', 'error');
        return;
    }
    if (!confirm('Excluir todos os itens bipados da viagem ' + idViagem + '? O extrato desta viagem será apagado.')) {
        return;
    }
    fetchAPI('/conferencia/' + encodeURIComponent(idViagem) + '/zerar', {
        method: 'POST',
        body: JSON.stringify({ id_viagem: idViagem, fluxo: 'carregamento' })
    }).then(function(result) {
        if (result && result.success) {
            showMessage('Extrato excluído. Os itens bipados desta viagem foram removidos.', 'success');
            document.getElementById('extrato-id-viagem').value = '';
            loadExtrato();
        } else {
            showMessage('Não foi possível excluir o extrato', 'error');
        }
    }).catch(function() {
        showMessage('Erro ao excluir extrato', 'error');
    });
};

// Buscar extrato por ID do roteiro (reimprimir)
window.buscarExtratoPorViagem = function() {
    const input = document.getElementById('extrato-id-viagem');
    if (input && !input.value.trim()) {
        showMessage('Digite o ID do roteiro para buscar o extrato', 'error');
        return;
    }
    loadExtrato();
};

// Imprimir extrato (só a área do extrato)
window.imprimirExtrato = function() {
    const tbody = document.getElementById('tbody-extrato');
    if (!tbody) return;
    const trs = tbody.querySelectorAll('tr');
    const semDados = trs.length === 0 || (trs.length === 1 && tbody.querySelector('td[colspan="9"]'));
    if (semDados) {
        showMessage('Busque um extrato antes de imprimir (digite o ID do roteiro e clique em Buscar)', 'error');
        return;
    }
    document.body.classList.remove('print-divergencias');
    document.body.classList.add('print-extrato');
    window.print();
    setTimeout(function() { document.body.classList.remove('print-extrato'); }, 500);
};

// Exportar divergências para Excel (itens, roteiros ou completo)
window.exportarDivergenciasExcel = function(tipo) {
    let url = API_BASE + '/divergencias/excel?tipo=' + encodeURIComponent(tipo || 'completo');
    url = appendParamsDataExpedicao(url);
    const a = document.createElement('a');
    a.href = url;
    a.download = tipo === 'itens' ? 'divergencias_itens.xlsx' : tipo === 'roteiros' ? 'divergencias_roteiros.xlsx' : 'divergencias_pagina_completa.xlsx';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showMessage('Download do Excel iniciado.', 'success');
};

// Parâmetros do filtro por data de expedição (aba Relatórios)
function getParamsDataExpedicao() {
    const de = (document.getElementById('relatorio-data-expedicao-inicio') && document.getElementById('relatorio-data-expedicao-inicio').value || '').trim();
    const ate = (document.getElementById('relatorio-data-expedicao-fim') && document.getElementById('relatorio-data-expedicao-fim').value || '').trim();
    if (!de && !ate) return '';
    const p = new URLSearchParams();
    if (de) p.set('data_expedicao_inicio', de);
    if (ate) p.set('data_expedicao_fim', ate);
    return p.toString();
}
function appendParamsDataExpedicao(url) {
    const qs = getParamsDataExpedicao();
    if (!qs) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs;
}

function getParamsDataExpedicaoDevolucao() {
    const de = (document.getElementById('dev-relatorio-data-expedicao-inicio') && document.getElementById('dev-relatorio-data-expedicao-inicio').value || '').trim();
    const ate = (document.getElementById('dev-relatorio-data-expedicao-fim') && document.getElementById('dev-relatorio-data-expedicao-fim').value || '').trim();
    const p = new URLSearchParams();
    p.set('fluxo', 'devolucao');
    if (de) p.set('data_expedicao_inicio', de);
    if (ate) p.set('data_expedicao_fim', ate);
    return p.toString();
}

function appendParamsDevolucao(url) {
    const qs = getParamsDataExpedicaoDevolucao();
    if (!qs) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs;
}

function mostrarRelatorioLoading(titulo, subtitulo) {
    var el = document.getElementById('relatorio-loading-overlay');
    var text = document.getElementById('relatorio-loading-text');
    var sub = document.getElementById('relatorio-loading-sub');
    if (text) text.textContent = titulo || 'Gerando relatório…';
    if (sub) sub.textContent = subtitulo || 'Aguarde enquanto o arquivo Excel é preparado.';
    if (el) {
        el.style.display = 'flex';
        el.setAttribute('aria-busy', 'true');
    }
}

function fecharRelatorioLoading() {
    var el = document.getElementById('relatorio-loading-overlay');
    if (el) {
        el.style.display = 'none';
        el.setAttribute('aria-busy', 'false');
    }
}

function _baixarBlobExcel(blob, nomeArquivo, msgSucesso, msgErro) {
    if (!blob || blob.size === 0) return Promise.resolve();
    var ct = (blob.type || '').toLowerCase();
    if (ct.indexOf('json') !== -1) {
        return blob.text().then(function(t) {
            try {
                var d = JSON.parse(t);
                showMessage((d && d.erro) || msgErro, 'error');
            } catch (e) {
                showMessage(msgErro, 'error');
            }
        });
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeArquivo;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showMessage(msgSucesso, 'success');
    return Promise.resolve();
}

function fetchRelatorioExcel(url, nomeArquivo, opcoes) {
    opcoes = opcoes || {};
    mostrarRelatorioLoading(opcoes.titulo, opcoes.subtitulo);
    var fetchInit = opcoes.fetchInit || {};
    return fetch(url, fetchInit).then(function(r) {
        if (!r.ok) {
            return r.json().then(function(d) {
                showMessage((d && d.erro) || opcoes.msgErro || 'Erro ao gerar relatório', 'error');
            }).catch(function() {
                showMessage(opcoes.msgErro || 'Erro ao gerar relatório', 'error');
            });
        }
        return r.blob();
    }).then(function(blob) {
        if (!blob) return;
        return _baixarBlobExcel(
            blob,
            nomeArquivo || 'relatorio.xlsx',
            opcoes.msgSucesso || 'Download do relatório iniciado.',
            opcoes.msgErro || 'Erro ao gerar relatório'
        );
    }).catch(function() {
        showMessage(opcoes.msgErro || 'Erro ao gerar relatório', 'error');
    }).finally(function() {
        fecharRelatorioLoading();
    });
}

// Helper: baixar relatório por URL (fetch + blob para exibir erros da API)
function downloadRelatorio(url, nomeArquivo, opcoes) {
    fetchRelatorioExcel(url, nomeArquivo, opcoes);
}

window.exportarExtratoExcel = function() {
    const idViagem = (document.getElementById('relatorio-extrato-id-viagem') && document.getElementById('relatorio-extrato-id-viagem').value || '').trim();
    if (!idViagem) {
        showMessage('Digite o ID do roteiro para exportar o extrato em Excel', 'error');
        return;
    }
    let url = API_BASE + '/relatorios/excel/extrato?id_viagem=' + encodeURIComponent(idViagem);
    url = appendParamsDataExpedicao(url);
    fetchRelatorioExcel(url, 'extrato_roteiro_' + idViagem.replace(/[/\\]/g, '_') + '.xlsx', {
        titulo: 'Gerando extrato…',
        subtitulo: 'Aguarde enquanto o Excel do roteiro é preparado.',
        msgSucesso: 'Download do extrato em Excel iniciado.',
        msgErro: 'Erro ao exportar extrato'
    });
};

window.gerarRelatorioBipados = function() {
    downloadRelatorio(appendParamsDataExpedicao(API_BASE + '/relatorios/excel/bipados'), 'relatorio_tudo_que_foi_bipado.xlsx');
};

window.gerarRelatorioResumoRoteiro = function() {
    downloadRelatorio(appendParamsDataExpedicao(API_BASE + '/relatorios/excel/resumo_roteiro'), 'relatorio_resumo_por_roteiro.xlsx');
};

window.gerarRelatorioTempoPlaca = function() {
    downloadRelatorio(appendParamsDataExpedicao(API_BASE + '/relatorios/excel/tempo_placa'), 'relatorio_tempo_por_placa.xlsx');
};

window.gerarRelatorioItensPorRoteiro = function() {
    downloadRelatorio(appendParamsDataExpedicao(API_BASE + '/relatorios/excel/itens_por_roteiro'), 'relatorio_itens_por_roteiro.xlsx');
};

window.gerarRelatorioItensMaisBipados = function() {
    downloadRelatorio(appendParamsDataExpedicao(API_BASE + '/relatorios/excel/itens_mais_bipados'), 'relatorio_itens_mais_bipados.xlsx');
};

window.gerarRelatorioResumoProduto = function() {
    downloadRelatorio(appendParamsDataExpedicao(API_BASE + '/relatorios/excel/resumo_produto'), 'relatorio_resumo_por_produto.xlsx');
};

window.gerarRelatorioRoteirosDivergencia = function() {
    downloadRelatorio(appendParamsDataExpedicao(API_BASE + '/relatorios/excel/roteiros_divergencia'), 'relatorio_roteiros_com_divergencia.xlsx');
};

window.gerarRelatorioCarregamentoVeiculo = function() {
    downloadRelatorio(appendParamsDataExpedicao(API_BASE + '/relatorios/excel/carregamento_veiculo'), 'relatorio_carregamento_por_veiculo.xlsx');
};

window.gerarRelatorioPesoViagemPlaca = function() {
    downloadRelatorio(appendParamsDataExpedicao(API_BASE + '/relatorios/excel/peso_viagem_placa'), 'relatorio_peso_por_viagem_placa.xlsx');
};

window.gerarRelatorioResponsaveisViagem = function() {
    downloadRelatorio(appendParamsDataExpedicao(API_BASE + '/relatorios/excel/responsaveis_viagem'), 'relatorio_responsaveis_por_viagem.xlsx');
};

window.gerarRelatorioRomaneioGuarulhos = function() {
    downloadRelatorio(appendParamsDataExpedicao(API_BASE + '/relatorios/excel/romaneio_guarulhos'), 'relatorio_romaneio_cd_guarulhos.xlsx');
};

window.exportarExtratoDevolucaoExcel = function() {
    const idViagem = (document.getElementById('dev-relatorio-extrato-id-viagem') && document.getElementById('dev-relatorio-extrato-id-viagem').value || '').trim();
    if (!idViagem) {
        showMessage('Digite o ID do roteiro para exportar o extrato de devolução', 'error');
        return;
    }
    let url = API_BASE + '/relatorios/excel/extrato?id_viagem=' + encodeURIComponent(idViagem);
    url = appendParamsDevolucao(url);
    fetchRelatorioExcel(url, 'extrato_devolucao_roteiro_' + idViagem.replace(/[/\\]/g, '_') + '.xlsx', {
        titulo: 'Gerando extrato de devolução…',
        subtitulo: 'Aguarde enquanto o Excel do roteiro é preparado.',
        msgSucesso: 'Download do extrato de devolução iniciado.',
        msgErro: 'Erro ao exportar extrato de devolução'
    });
};

window.gerarRelatorioDevolucoesBipadas = function() {
    downloadRelatorio(appendParamsDevolucao(API_BASE + '/relatorios/excel/bipados'), 'relatorio_devolucoes_bipadas.xlsx');
};

window.gerarRelatorioDevolucoesResumoRoteiro = function() {
    downloadRelatorio(appendParamsDevolucao(API_BASE + '/relatorios/excel/resumo_roteiro'), 'relatorio_devolucoes_resumo_por_roteiro.xlsx');
};

window.gerarRelatorioDevolucoesResumoProduto = function() {
    downloadRelatorio(appendParamsDevolucao(API_BASE + '/relatorios/excel/resumo_produto'), 'relatorio_devolucoes_resumo_por_produto.xlsx');
};

window.gerarRelatorioDevolucoesRoteirosDivergencia = function() {
    downloadRelatorio(appendParamsDevolucao(API_BASE + '/relatorios/excel/roteiros_divergencia'), 'relatorio_devolucoes_roteiros_com_divergencia.xlsx');
};

window.exportarDivergenciasDevolucaoExcel = function(tipo) {
    let url = API_BASE + '/divergencias/excel?tipo=' + encodeURIComponent(tipo || 'completo');
    url = appendParamsDevolucao(url);
    const a = document.createElement('a');
    a.href = url;
    a.download = tipo === 'itens' ? 'divergencias_devolucao_itens.xlsx' : tipo === 'roteiros' ? 'divergencias_devolucao_roteiros.xlsx' : 'divergencias_devolucao_pagina_completa.xlsx';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showMessage('Download do Excel de devoluções iniciado.', 'success');
};

function getParamsDataCriacaoTerceiros() {
    const de = (document.getElementById('ter-relatorio-data-inicio') && document.getElementById('ter-relatorio-data-inicio').value || '').trim();
    const ate = (document.getElementById('ter-relatorio-data-fim') && document.getElementById('ter-relatorio-data-fim').value || '').trim();
    if (!de && !ate) return '';
    const p = new URLSearchParams();
    if (de) p.set('data_criacao_inicio', de);
    if (ate) p.set('data_criacao_fim', ate);
    return p.toString();
}

function appendParamsDataCriacaoTerceiros(url) {
    const qs = getParamsDataCriacaoTerceiros();
    if (!qs) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs;
}

function appendParamsDataCriacaoTerceiros(url) {
    const qs = getParamsDataCriacaoTerceiros();
    if (!qs) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs;
}

function gerarRelatorioTerceirosExcel(suffix, filename) {
    downloadRelatorio(appendParamsDataCriacaoTerceiros(API_BASE + '/terceiros/relatorios/excel/' + suffix), filename);
}

window.gerarRelatorioTerceirosResumoNf = function() {
    gerarRelatorioTerceirosExcel('resumo_nf', 'relatorio_terceiros_resumo_nf.xlsx');
};

window.gerarRelatorioTerceirosItensBipados = function() {
    gerarRelatorioTerceirosExcel('itens_bipados', 'relatorio_terceiros_itens_bipados.xlsx');
};

window.gerarRelatorioTerceirosItensMaisBipados = function() {
    gerarRelatorioTerceirosExcel('itens_mais_bipados', 'relatorio_terceiros_itens_mais_bipados.xlsx');
};

window.gerarRelatorioTerceirosDivergencias = function() {
    gerarRelatorioTerceirosExcel('divergencias', 'relatorio_terceiros_divergencias.xlsx');
};

window.gerarRelatorioTerceirosCarreta = function() {
    gerarRelatorioTerceirosExcel('carreta', 'relatorio_terceiros_carreta.xlsx');
};

window.gerarRelatorioTerceirosNotasLancadas = function() {
    gerarRelatorioTerceirosExcel('notas_lancadas', 'relatorio_terceiros_notas_lancadas.xlsx');
};

window.gerarRelatorioTerceirosHistorico = function() {
    gerarRelatorioTerceirosExcel('historico', 'relatorio_terceiros_historico.xlsx');
};

window.gerarRelatorioTerceirosConsumivelSp = function() {
    gerarRelatorioTerceirosExcel('consumivel_sp', 'relatorio_terceiros_consumivel_sp.xlsx');
};

window.gerarRelatorioTerceirosPendenciasEtapa = function() {
    gerarRelatorioTerceirosExcel('pendencias_etapa', 'relatorio_terceiros_pendencias_etapa.xlsx');
};

window.gerarRelatorioTerceirosEncerradasMotivo = function() {
    gerarRelatorioTerceirosExcel('encerradas_motivo', 'relatorio_terceiros_encerradas_motivo.xlsx');
};

window.gerarRelatorioTerceirosFluxoMg = function() {
    gerarRelatorioTerceirosExcel('fluxo_mg', 'relatorio_terceiros_fluxo_mg.xlsx');
};

window.gerarRelatorioTerceirosPorUf = function() {
    gerarRelatorioTerceirosExcel('por_uf', 'relatorio_terceiros_por_uf.xlsx');
};

window.gerarRelatorioTerceirosPorRemetente = function() {
    gerarRelatorioTerceirosExcel('por_remetente', 'relatorio_terceiros_por_remetente.xlsx');
};

window.gerarRelatorioTerceirosPrevisaoChegada = function() {
    gerarRelatorioTerceirosExcel('previsao_chegada', 'relatorio_terceiros_previsao_chegada.xlsx');
};

window.gerarRelatorioTerceirosRecebimentosPeriodo = function() {
    gerarRelatorioTerceirosExcel('recebimentos_periodo', 'relatorio_terceiros_recebimentos.xlsx');
};

window.gerarRelatorioTerceirosDivergenciaItens = function() {
    gerarRelatorioTerceirosExcel('divergencia_itens', 'relatorio_terceiros_divergencia_itens.xlsx');
};

window.gerarRelatorioTerceirosSemBipagem = function() {
    gerarRelatorioTerceirosExcel('sem_bipagem', 'relatorio_terceiros_sem_bipagem.xlsx');
};

window.gerarRelatorioTerceirosConferenciaIncompleta = function() {
    gerarRelatorioTerceirosExcel('conferencia_incompleta', 'relatorio_terceiros_conferencia_incompleta.xlsx');
};

window.gerarRelatorioTerceirosEventos = function() {
    gerarRelatorioTerceirosExcel('eventos', 'relatorio_terceiros_eventos.xlsx');
};

window.gerarRelatorioTerceirosAuditoriaUsuario = function() {
    gerarRelatorioTerceirosExcel('auditoria_usuario', 'relatorio_terceiros_auditoria_usuario.xlsx');
};

window.gerarRelatorioTerceirosSlaEtapas = function() {
    gerarRelatorioTerceirosExcel('sla_etapas', 'relatorio_terceiros_sla_etapas.xlsx');
};

window.exportarRelatorioTerceirosNf = function() {
    const docId = (document.getElementById('ter-relatorio-nf-id') && document.getElementById('ter-relatorio-nf-id').value || '').trim();
    if (!docId) {
        showMessage('Digite o ID da NF para exportar.', 'error');
        return;
    }
    const url = API_BASE + '/terceiros/relatorios/excel/nf?documento_id=' + encodeURIComponent(docId);
    fetchRelatorioExcel(url, 'relatorio_terceiros_nf_' + docId + '.xlsx', {
        titulo: 'Gerando relatório da NF…',
        subtitulo: 'Aguarde enquanto o Excel é preparado.',
        msgSucesso: 'Download do relatório da NF iniciado.',
        msgErro: 'Erro ao exportar NF',
        fetchInit: { credentials: 'same-origin' }
    });
};

window.buscarExtratoDevolucaoPorViagem = function() {
    loadExtratoDevolucao();
};

window.imprimirExtratoDevolucao = function() {
    const tbody = document.getElementById('dev-tbody-extrato');
    if (!tbody || !tbody.querySelector('tr')) {
        showMessage('Busque um extrato de devolução antes de imprimir.', 'error');
        return;
    }
    document.body.classList.remove('print-divergencias');
    document.body.classList.add('print-extrato');
    window.print();
    setTimeout(function() { document.body.classList.remove('print-extrato'); }, 500);
};

// Imprimir divergências (área: dados do roteiro + itens por roteiro)
window.imprimirDivergencias = function() {
    const conteudo = document.getElementById('divergencias-conteudo');
    if (!conteudo) return;
    const blocos = conteudo.querySelectorAll('.divergencias-roteiro-bloco');
    const semDados = blocos.length === 0 || (conteudo.querySelector('.loading'));
    if (semDados) {
        showMessage('Não há divergências para imprimir.', 'error');
        return;
    }
    document.body.classList.remove('print-extrato');
    document.body.classList.add('print-divergencias');
    window.print();
    setTimeout(function() { document.body.classList.remove('print-divergencias'); }, 500);
};

function _htmlStatusExtratoCelula(item) {
    const st = (item && item.status_bipado) || 'PENDENTE';
    const statusClass = st === 'COMPLETO' ? 'status-OK' : st === 'EXCEDENTE' ? 'status-EXCEDENTE' : st === 'PARCIAL' ? 'status-SOBRA' : 'status-FALTA';
    const statusTela = st === 'COMPLETO' ? '✅ COMPLETO' : st === 'EXCEDENTE' ? '📦 EXCEDENTE' : st === 'PARCIAL' ? '⚠️ PARCIAL' : '❌ PENDENTE';
    const statusPrint = st === 'COMPLETO' ? 'COMPLETO' : st === 'EXCEDENTE' ? 'EXCEDENTE' : st === 'PARCIAL' ? 'PARCIAL' : 'PENDENTE';
    return '<td><span class="status-badge ' + statusClass + '"><span class="extrato-status-screen">' + statusTela + '</span><span class="extrato-status-print">' + statusPrint + '</span></span></td>';
}

function _htmlLinhaExtratoTabela(item) {
    const motivo = (item.motivo_divergencia || '').trim();
    const qtdBip = parseInt(item.quantidade_bipada, 10) || 0;
    const qtdFalta = parseInt(item.quantidade_falta, 10) || 0;
    const avisoTexto = _avisoConferenciaBipagem(item.aviso_sobra, item.quantidade_produto || 0, qtdBip);
    const pack = _terConferenciaBadgeEClasseLinha((item && item.status_bipado) || 'PENDENTE');
    return '<tr class="' + pack.rowClass + '">'
        + _htmlStatusExtratoCelula(item)
        + '<td>' + (motivo ? escHtml(motivo) : '-') + '</td>'
        + '<td><strong>' + escHtml(item.codigo_barras || '-') + '</strong></td>'
        + '<td><strong style="color: #1976D2;">' + escHtml(item.codigo_produto || '-') + '</strong></td>'
        + '<td>' + escHtml(item.produto || '-') + '</td>'
        + '<td><strong>' + escHtml(String(item.quantidade_produto || 0)) + '</strong></td>'
        + '<td><strong style="color: ' + (qtdBip > 0 ? '#4caf50' : '#666') + '">' + qtdBip + '</strong></td>'
        + '<td>' + escHtml(item.unidade || '-') + '</td>'
        + '<td>' + escHtml((item.peso_bruto != null && item.peso_bruto !== '') ? String(item.peso_bruto) : '-') + '</td>'
        + _htmlTdAviso(avisoTexto)
        + '<td><strong style="color: ' + (qtdFalta > 0 ? '#f44336' : '#4caf50') + '">' + qtdFalta + '</strong></td>'
        + '</tr>';
}

function _extratoQtdSobraItem(item) {
    var rom = parseInt(item.quantidade_produto, 10) || 0;
    var bip = parseInt(item.quantidade_bipada, 10) || 0;
    if (item.quantidade_sobra != null && item.quantidade_sobra !== '') {
        var s = parseInt(item.quantidade_sobra, 10);
        if (!isNaN(s) && s > 0) return s;
    }
    return Math.max(0, bip - rom);
}

function _extratoQtdFaltaItem(item) {
    if (item.quantidade_falta != null && item.quantidade_falta !== '') {
        var f = parseInt(item.quantidade_falta, 10);
        if (!isNaN(f) && f > 0) return f;
    }
    var rom = parseInt(item.quantidade_produto, 10) || 0;
    var bip = parseInt(item.quantidade_bipada, 10) || 0;
    return Math.max(0, rom - bip);
}

function _extratoItemTemMais(item) {
    return (item.status_bipado || '') === 'EXCEDENTE' || _extratoQtdSobraItem(item) > 0;
}

function _extratoItemTemFalta(item) {
    if ((item.status_bipado || '') === 'EXCEDENTE') return false;
    return _extratoQtdFaltaItem(item) > 0;
}

function _extratoHtmlLinhaResumoDivergencia(item, tipo) {
    var cod = (item.codigo_produto || item.codigo || '').trim() || '-';
    var nome = (item.produto || item.descricao || '').trim() || '-';
    var rom = parseInt(item.quantidade_produto, 10) || 0;
    var bip = parseInt(item.quantidade_bipada, 10) || 0;
    var un = (item.unidade || '').trim();
    var esc = typeof escapeHtml === 'function' ? escapeHtml : function(s) { return String(s || ''); };
    var detalhe = tipo === 'mais'
        ? '<strong>A mais: ' + _extratoQtdSobraItem(item) + '</strong>'
        : '<strong>Falta: ' + _extratoQtdFaltaItem(item) + '</strong>';
    return '<li><strong>' + esc(cod) + '</strong> — ' + esc(nome)
        + ' · Romaneio: ' + rom + ' · Bipado: ' + bip + ' · ' + detalhe
        + (un ? ' ' + esc(un) : '') + '</li>';
}

function _extratoAtualizarItensBipadosMais(extrato, fluxo) {
    fluxo = fluxo || 'carregamento';
    var boxId = fluxo === 'devolucao' ? 'dev-extrato-itens-bipados-mais' : 'extrato-itens-bipados-mais';
    var conteudoId = fluxo === 'devolucao' ? 'dev-extrato-itens-bipados-mais-conteudo' : 'extrato-itens-bipados-mais-conteudo';
    var box = document.getElementById(boxId);
    var conteudo = document.getElementById(conteudoId);
    if (!box) return;
    var itensMais = (extrato || []).filter(_extratoItemTemMais);
    var itensFalta = (extrato || []).filter(_extratoItemTemFalta);
    if (!itensMais.length && !itensFalta.length) {
        box.style.display = 'none';
        box.classList.remove('extrato-itens-bipados-mais--ativo');
        if (conteudo) conteudo.innerHTML = '';
        return;
    }
    box.style.display = 'block';
    box.classList.add('extrato-itens-bipados-mais--ativo');
    if (!conteudo) return;
    var html = '';
    if (itensMais.length) {
        html += '<p class="extrato-itens-bipados-mais-subtitulo extrato-itens-bipados-mais-subtitulo--mais">Bipados a mais</p><ul>'
            + itensMais.map(function(item) { return _extratoHtmlLinhaResumoDivergencia(item, 'mais'); }).join('')
            + '</ul>';
    }
    if (itensFalta.length) {
        html += '<p class="extrato-itens-bipados-mais-subtitulo extrato-itens-bipados-mais-subtitulo--falta">Faltantes</p><ul>'
            + itensFalta.map(function(item) { return _extratoHtmlLinhaResumoDivergencia(item, 'falta'); }).join('')
            + '</ul>';
    }
    conteudo.innerHTML = html;
}

// Cache do extrato (mesma fonte da conferência) para exibir na hora ao abrir a aba
window._cacheConferenciaExtrato = window._cacheConferenciaExtrato || {};
var _CACHE_CONFERENCIA_TTL_MS = 180000;

function _cacheExtratoChave(idViagem, fluxo) {
    return (fluxo || 'carregamento') + '|' + String(idViagem || '').trim();
}

function _cacheExtratoSalvar(idViagem, fluxo, resp) {
    if (!idViagem || !resp || resp.erro) return;
    window._cacheConferenciaExtrato[_cacheExtratoChave(idViagem, fluxo)] = { ts: Date.now(), resp: resp };
}

function _cacheExtratoObter(idViagem, fluxo) {
    var hit = window._cacheConferenciaExtrato[_cacheExtratoChave(idViagem, fluxo)] || null;
    if (!hit || !hit.resp) return null;
    if (Date.now() - (hit.ts || 0) > _CACHE_CONFERENCIA_TTL_MS) return null;
    return hit;
}

function _conferenciaQueryRapida(extra) {
    var q = ['limit=2000', 'motivos=0', 'periodo_meta=0'];
    if (extra) q.push(extra);
    return '?' + q.join('&');
}

function _extratoListaDeResp(resp) {
    var lista = (resp && resp.lista && Array.isArray(resp.lista)) ? resp.lista : [];
    if (resp && resp.lista_ja_agregada) return lista;
    return (typeof agruparConferenciaPorCodigoProduto === 'function') ? agruparConferenciaPorCodigoProduto(lista) : lista;
}

function _extratoMetaDeResp(resp) {
    if (!resp) return { viagemInfo: {}, periodo: {} };
    return {
        viagemInfo: {
            data_expedicao: resp.data_expedicao,
            placa: resp.placa,
            motorista: resp.motorista,
            identificador_rota: resp.identificador_rota,
            coordenador: resp.coordenador,
            conferente: resp.conferente,
            ajudante1: resp.ajudante1,
            ajudante2: resp.ajudante2,
        },
        periodo: {
            inicio_carregamento: resp.inicio_carregamento,
            fim_carregamento: resp.fim_carregamento,
        },
    };
}

function _preencherExtratoTela(idViagem, extrato, extratoResp, viagemInfo, periodo) {
    var tbody = document.getElementById('tbody-extrato');
    var resumoEl = document.getElementById('extrato-resumo');
    var btnExcluir = document.getElementById('btn-excluir-extrato');
    var avisoDivergenteEl = document.getElementById('extrato-aviso-divergente');
    if (!tbody) return;
    viagemInfo = viagemInfo || {};
    periodo = periodo || {};
    if (!extratoResp || extratoResp.erro) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading" style="color: #c62828;">' + escHtml(extratoResp && extratoResp.erro ? extratoResp.erro : 'Erro ao carregar extrato.') + '</td></tr>';
        if (resumoEl) resumoEl.style.display = 'none';
        if (btnExcluir) btnExcluir.style.display = 'none';
        if (avisoDivergenteEl) avisoDivergenteEl.style.display = 'none';
        _atualizarExtratoStatusRodape([]);
        _extratoAtualizarItensBipadosMais([], 'carregamento');
        return;
    }
    if (!extrato || !extrato.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Nenhum item encontrado para esta viagem. Bipe os itens na aba Conferência primeiro.</td></tr>';
        if (resumoEl) resumoEl.style.display = 'none';
        if (btnExcluir) btnExcluir.style.display = 'none';
        if (avisoDivergenteEl) avisoDivergenteEl.style.display = 'none';
        _atualizarExtratoStatusRodape([]);
        _extratoAtualizarItensBipadosMais([], 'carregamento');
        (function preencherAssinaturasSozinho() {
            var set = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = (val != null && String(val).trim() !== '') ? String(val).trim() : '-'; };
            var idHidden = (document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value || '').trim();
            var mesmoRoteiro = idHidden === idViagem;
            var formMotorista = mesmoRoteiro && document.getElementById('viagem-motorista') ? document.getElementById('viagem-motorista').value.trim() : '';
            var formConferente = mesmoRoteiro && document.getElementById('viagem-conferente') ? document.getElementById('viagem-conferente').value.trim() : '';
            var formAjudante1 = mesmoRoteiro && document.getElementById('viagem-ajudante1') ? document.getElementById('viagem-ajudante1').value.trim() : '';
            var formAjudante2 = mesmoRoteiro && document.getElementById('viagem-ajudante2') ? document.getElementById('viagem-ajudante2').value.trim() : '';
            set('assinatura-nome-motorista', (viagemInfo.motorista && String(viagemInfo.motorista).trim()) ? viagemInfo.motorista.trim() : formMotorista);
            set('assinatura-nome-conferente', (viagemInfo.conferente && String(viagemInfo.conferente).trim()) ? viagemInfo.conferente.trim() : formConferente);
            set('assinatura-nome-ajudante1', (viagemInfo.ajudante1 && String(viagemInfo.ajudante1).trim()) ? viagemInfo.ajudante1.trim() : formAjudante1);
            set('assinatura-nome-ajudante2', (viagemInfo.ajudante2 && String(viagemInfo.ajudante2).trim()) ? viagemInfo.ajudante2.trim() : formAjudante2);
        })();
        return;
    }
    var totalQtdBipada = 0;
    var totalQtdRomaneio = 0;
    var pesoTotal = 0;
    extrato.forEach(function(item) {
        totalQtdBipada += parseInt(item.quantidade_bipada, 10) || 0;
        totalQtdRomaneio += parseInt(item.quantidade_produto, 10) || 0;
        var p = item.peso_bruto;
        if (p != null && p !== '' && p !== '-') {
            var num = parseFloat(String(p).replace(',', '.').replace(/\s/g, ''));
            if (!isNaN(num)) pesoTotal += num;
        }
    });
    if (resumoEl) {
        resumoEl.style.display = 'block';
        var totalItens = document.getElementById('extrato-total-itens');
        var totalQtdEl = document.getElementById('extrato-total-qtd');
        var pesoTotalEl = document.getElementById('extrato-peso-total');
        var idViagemDisplay = document.getElementById('extrato-id-viagem-display');
        var inicioCarreg = document.getElementById('extrato-inicio-carregamento');
        var fimCarreg = document.getElementById('extrato-fim-carregamento');
        var dataExpedicaoEl = document.getElementById('extrato-data-expedicao');
        var placaEl = document.getElementById('extrato-placa');
        var identificadorRotaEl = document.getElementById('extrato-identificador-rota');
        var motoristaEl = document.getElementById('extrato-motorista');
        if (totalItens) totalItens.textContent = extrato.length;
        if (totalQtdEl) totalQtdEl.textContent = totalQtdBipada + ' / ' + totalQtdRomaneio;
        if (pesoTotalEl) pesoTotalEl.textContent = pesoTotal > 0 ? pesoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '-';
        if (idViagemDisplay) idViagemDisplay.textContent = idViagem;
        if (dataExpedicaoEl) dataExpedicaoEl.textContent = (viagemInfo.data_expedicao && String(viagemInfo.data_expedicao).trim()) ? viagemInfo.data_expedicao : '-';
        if (placaEl) placaEl.textContent = (viagemInfo.placa && String(viagemInfo.placa).trim()) ? viagemInfo.placa : '-';
        if (identificadorRotaEl) identificadorRotaEl.textContent = (viagemInfo.identificador_rota && String(viagemInfo.identificador_rota).trim()) ? viagemInfo.identificador_rota : '-';
        if (motoristaEl) motoristaEl.textContent = (viagemInfo.motorista && String(viagemInfo.motorista).trim()) ? viagemInfo.motorista : '-';
        var coordenadorEl = document.getElementById('extrato-coordenador');
        var conferenteEl = document.getElementById('extrato-conferente');
        var ajudante1El = document.getElementById('extrato-ajudante1');
        var ajudante2El = document.getElementById('extrato-ajudante2');
        if (coordenadorEl) coordenadorEl.textContent = (viagemInfo.coordenador && String(viagemInfo.coordenador).trim()) ? viagemInfo.coordenador : '-';
        if (conferenteEl) conferenteEl.textContent = (viagemInfo.conferente && String(viagemInfo.conferente).trim()) ? viagemInfo.conferente : '-';
        if (ajudante1El) ajudante1El.textContent = (viagemInfo.ajudante1 && String(viagemInfo.ajudante1).trim()) ? viagemInfo.ajudante1 : '-';
        if (ajudante2El) ajudante2El.textContent = (viagemInfo.ajudante2 && String(viagemInfo.ajudante2).trim()) ? viagemInfo.ajudante2 : '-';
        if (inicioCarreg) inicioCarreg.textContent = (periodo.inicio_carregamento) ? periodo.inicio_carregamento : '-';
        var setAssinaturaNome = function(id, val) {
            var el = document.getElementById(id);
            if (el) el.textContent = (val != null && String(val).trim() !== '') ? String(val).trim() : '-';
        };
        var idHidden = (document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value || '').trim();
        var mesmoRoteiro = idHidden === idViagem;
        var formMotorista = mesmoRoteiro && document.getElementById('viagem-motorista') ? document.getElementById('viagem-motorista').value.trim() : '';
        var formConferente = mesmoRoteiro && document.getElementById('viagem-conferente') ? document.getElementById('viagem-conferente').value.trim() : '';
        var formAjudante1 = mesmoRoteiro && document.getElementById('viagem-ajudante1') ? document.getElementById('viagem-ajudante1').value.trim() : '';
        var formAjudante2 = mesmoRoteiro && document.getElementById('viagem-ajudante2') ? document.getElementById('viagem-ajudante2').value.trim() : '';
        var motorista = (viagemInfo.motorista && String(viagemInfo.motorista).trim()) ? viagemInfo.motorista.trim() : formMotorista;
        var conferente = (viagemInfo.conferente && String(viagemInfo.conferente).trim()) ? viagemInfo.conferente.trim() : formConferente;
        var ajudante1 = (viagemInfo.ajudante1 && String(viagemInfo.ajudante1).trim()) ? viagemInfo.ajudante1.trim() : formAjudante1;
        var ajudante2 = (viagemInfo.ajudante2 && String(viagemInfo.ajudante2).trim()) ? viagemInfo.ajudante2.trim() : formAjudante2;
        setAssinaturaNome('assinatura-nome-motorista', motorista);
        setAssinaturaNome('assinatura-nome-conferente', conferente);
        setAssinaturaNome('assinatura-nome-ajudante1', ajudante1);
        setAssinaturaNome('assinatura-nome-ajudante2', ajudante2);
        if (fimCarreg) fimCarreg.textContent = (periodo.fim_carregamento) ? periodo.fim_carregamento : '-';
    }
    if (btnExcluir) btnExcluir.style.display = 'inline-block';
    tbody.innerHTML = extrato.map(function(item) { return _htmlLinhaExtratoTabela(item); }).join('');
    _atualizarExtratoStatusRodape(extrato);
    _extratoAtualizarItensBipadosMais(extrato, 'carregamento');
}

// Carregar Extrato (mesmas colunas da Conferência: status, código barras, código produto, produto, qtd produto, unidade, aviso, qtd bipada, qtd falta)
// idViagemOpcional: quando passado (ex.: ao clicar em Gerar comprovante), usa esse ID e atualiza o input
function _atualizarExtratoStatusRodape(extrato) {
    var avisoDivergenteEl = document.getElementById('extrato-aviso-divergente');
    var avisoCompletoEl = document.getElementById('extrato-aviso-completo');
    var tituloAssinaturas = document.getElementById('extrato-assinaturas-titulo');
    if (!extrato || !extrato.length) {
        if (avisoDivergenteEl) avisoDivergenteEl.style.display = 'none';
        if (avisoCompletoEl) avisoCompletoEl.style.display = 'none';
        if (tituloAssinaturas) tituloAssinaturas.textContent = 'Documento conferido e carregado. Assinaturas:';
        return;
    }
    var temDivergencia = extrato.some(function(item) {
        return (item.quantidade_falta || 0) > 0 || (item.status_bipado !== 'COMPLETO');
    });
    if (avisoDivergenteEl) avisoDivergenteEl.style.display = temDivergencia ? 'block' : 'none';
    if (avisoCompletoEl) avisoCompletoEl.style.display = temDivergencia ? 'none' : 'block';
    if (tituloAssinaturas) {
        tituloAssinaturas.textContent = temDivergencia
            ? 'Documento conferido com divergências. Assinaturas:'
            : 'Documento conferido e carregado — carregamento completo. Assinaturas:';
    }
}

async function loadExtrato(idViagemOpcional, opts) {
    opts = opts || {};
    var fluxo = opts.fluxo || 'carregamento';
    const inputBusca = document.getElementById('extrato-id-viagem');
    const inputRelatorio = document.getElementById('relatorio-extrato-id-viagem');
    let idViagem = (idViagemOpcional && String(idViagemOpcional).trim()) ? String(idViagemOpcional).trim() : (inputBusca && inputBusca.value.trim());
    if (!idViagem) {
        const idViagemHidden = document.getElementById('id-viagem-hidden');
        if (idViagemHidden && idViagemHidden.value.trim()) {
            idViagem = idViagemHidden.value.trim();
            if (inputBusca) inputBusca.value = idViagem;
            if (inputRelatorio) inputRelatorio.value = idViagem;
        }
    } else {
        if (inputBusca) inputBusca.value = idViagem;
        if (inputRelatorio) inputRelatorio.value = idViagem;
    }
    const tbody = document.getElementById('tbody-extrato');
    const resumoEl = document.getElementById('extrato-resumo');
    if (!tbody) {
        console.error('loadExtrato: elemento tbody-extrato não encontrado');
        return;
    }
    if (!idViagem) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Digite o ID do roteiro e clique em Buscar para ver o comprovante (extrato) com as informações da carga.</td></tr>';
        if (resumoEl) resumoEl.style.display = 'none';
        _atualizarExtratoStatusRodape([]);
        _extratoAtualizarItensBipadosMais([], 'carregamento');
        return;
    }
    if (opts.prefetch) {
        try {
            var qPre = '/conferencia/' + encodeURIComponent(idViagem) + _conferenciaQueryRapida();
            if (fluxo === 'devolucao') qPre += '&fluxo=devolucao';
            var pre = await fetchAPI(qPre);
            if (pre && !pre.erro) _cacheExtratoSalvar(idViagem, fluxo, pre);
        } catch (e) { /* ignore */ }
        return;
    }
    var cacheHit = !opts.forcar && _cacheExtratoObter(idViagem, fluxo);
    var pintouCache = false;
    if (cacheHit && cacheHit.resp) {
        var metaCache = _extratoMetaDeResp(cacheHit.resp);
        _preencherExtratoTela(idViagem, _extratoListaDeResp(cacheHit.resp), cacheHit.resp, metaCache.viagemInfo, metaCache.periodo);
        pintouCache = true;
    }
    if (!pintouCache && !opts.silencioso) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Carregando extrato...</td></tr>';
        if (resumoEl) resumoEl.style.display = 'none';
    }
    var qConf = '/conferencia/' + encodeURIComponent(idViagem) + '?limit=2000';
    if (fluxo === 'devolucao') qConf += '&fluxo=devolucao';
    var extratoResp = await _carregFetchGet(qConf, 90000);
    if (!extratoResp || extratoResp.erro) {
        if (!pintouCache) {
            tbody.innerHTML = '<tr><td colspan="11" class="loading" style="color:#c62828;">' + escapeHtml(_carregErroMsg(extratoResp, 'Erro ao carregar extrato.')) + '</td></tr>';
        }
        return;
    }
    if (extratoResp && !extratoResp.erro) _cacheExtratoSalvar(idViagem, fluxo, extratoResp);
    var meta = _extratoMetaDeResp(extratoResp);
    _preencherExtratoTela(idViagem, _extratoListaDeResp(extratoResp), extratoResp, meta.viagemInfo, meta.periodo);
}

async function loadExtratoDevolucao(idViagemOpcional) {
    const inputBusca = document.getElementById('dev-extrato-id-viagem');
    const inputRelatorio = document.getElementById('dev-relatorio-extrato-id-viagem');
    let idViagem = (idViagemOpcional && String(idViagemOpcional).trim()) ? String(idViagemOpcional).trim() : (inputBusca && inputBusca.value.trim());
    if (!idViagem) {
        const idViagemHidden = document.getElementById('dev-id-viagem-hidden');
        if (idViagemHidden && idViagemHidden.value.trim()) {
            idViagem = idViagemHidden.value.trim();
            if (inputBusca) inputBusca.value = idViagem;
            if (inputRelatorio) inputRelatorio.value = idViagem;
        }
    } else {
        if (inputBusca) inputBusca.value = idViagem;
        if (inputRelatorio) inputRelatorio.value = idViagem;
    }

    const tbody = document.getElementById('dev-tbody-extrato');
    const resumoEl = document.getElementById('dev-extrato-resumo');
    if (!tbody) return;
    if (!idViagem) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Digite o ID do roteiro e clique em Buscar para ver o extrato das devoluções.</td></tr>';
        if (resumoEl) resumoEl.style.display = 'none';
        _extratoAtualizarItensBipadosMais([], 'devolucao');
        return;
    }

    tbody.innerHTML = '<tr><td colspan="11" class="loading">Carregando extrato de devoluções...</td></tr>';
    if (resumoEl) resumoEl.style.display = 'none';

    try {
    const extratoResp = await _modFetchGet('/conferencia/' + encodeURIComponent(idViagem) + '?fluxo=devolucao&limit=2000', 90000);
    if (extratoResp && !extratoResp.erro) _cacheExtratoSalvar(idViagem, 'devolucao', extratoResp);
    var metaDev = _extratoMetaDeResp(extratoResp);
    var periodo = metaDev.periodo;
    var viagemInfo = metaDev.viagemInfo;
    const extratoListaDev = (extratoResp && extratoResp.lista && Array.isArray(extratoResp.lista)) ? extratoResp.lista : [];
    const extrato = (extratoResp && extratoResp.lista_ja_agregada)
        ? extratoListaDev
        : ((typeof agruparConferenciaPorCodigoProduto === 'function') ? agruparConferenciaPorCodigoProduto(extratoListaDev) : extratoListaDev);
    if (!extratoResp || extratoResp.erro) {
        var msgExtratoErro = _modErroMsg(extratoResp, 'Erro ao carregar extrato de devoluções.');
        tbody.innerHTML = '<tr><td colspan="11" class="loading" style="color:#c62828;">' + escapeHtml(msgExtratoErro) + '</td></tr>';
        if (resumoEl) resumoEl.style.display = 'none';
        _extratoAtualizarItensBipadosMais([], 'devolucao');
        return;
    }
    if (extrato.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Nenhum item encontrado para esta viagem no fluxo de devoluções.</td></tr>';
        if (resumoEl) resumoEl.style.display = 'none';
        _extratoAtualizarItensBipadosMais([], 'devolucao');
        return;
    }

    let totalQtdBipada = 0;
    let totalQtdRomaneio = 0;
    let pesoTotal = 0;
    extrato.forEach(function(item) {
        totalQtdBipada += parseInt(item.quantidade_bipada, 10) || 0;
        totalQtdRomaneio += parseInt(item.quantidade_produto, 10) || 0;
        const p = item.peso_bruto;
        if (p != null && p !== '' && p !== '-') {
            const num = parseFloat(String(p).replace(',', '.').replace(/\s/g, ''));
            if (!isNaN(num)) pesoTotal += num;
        }
    });

    if (resumoEl) {
        resumoEl.style.display = 'block';
        const set = function(id, val) {
            const el = document.getElementById(id);
            if (el) el.textContent = (val != null && String(val).trim() !== '') ? String(val).trim() : '-';
        };
        set('dev-extrato-total-itens', extrato.length);
        set('dev-extrato-total-qtd', totalQtdBipada + ' / ' + totalQtdRomaneio);
        set('dev-extrato-peso-total', pesoTotal > 0 ? pesoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '-');
        set('dev-extrato-id-viagem-display', idViagem);
        set('dev-extrato-data-expedicao', viagemInfo && viagemInfo.data_expedicao);
        set('dev-extrato-placa', viagemInfo && viagemInfo.placa);
        set('dev-extrato-identificador-rota', viagemInfo && viagemInfo.identificador_rota);
        set('dev-extrato-motorista', viagemInfo && viagemInfo.motorista);
        set('dev-extrato-inicio-carregamento', periodo && (periodo.inicio_carregamento || periodo.inicio_bipagem));
        set('dev-extrato-fim-carregamento', periodo && (periodo.fim_carregamento || periodo.fim_bipagem));
    }

    tbody.innerHTML = extrato.map(function(item) {
        return _htmlLinhaExtratoTabela(item);
    }).join('');
    _extratoAtualizarItensBipadosMais(extrato, 'devolucao');
    } catch (e) {
        console.error('loadExtratoDevolucao:', e);
        tbody.innerHTML = '<tr><td colspan="11" class="loading" style="color:#c62828;">' + escapeHtml(_modErroMsg(null, (e && e.message) || 'Erro ao carregar extrato.')) + '</td></tr>';
        if (resumoEl) resumoEl.style.display = 'none';
        _extratoAtualizarItensBipadosMais([], 'devolucao');
    }
}

// Carregar Romaneio da Planilha (todas as colunas, com filtros por id_viagem, id_roteiro, codigo_cliente, codigo_produto, endereco, cidade)
// Não usa overlay full-screen para permitir trocar de aba enquanto carrega; loading só na área da tabela.
async function loadRomaneio(showLoadingState) {
    const thead = document.getElementById('thead-romaneio');
    const tbody = document.getElementById('tbody-romaneio');
    const isRefresh = tbody && tbody.rows.length > 0 && !(tbody.rows.length === 1 && tbody.rows[0].cells.length === 1 && tbody.rows[0].querySelector('.loading'));
    const showLoading = thead && tbody && (showLoadingState === true || !isRefresh);
    if (thead && tbody && showLoading) {
        thead.innerHTML = '<tr><th>Carregando...</th></tr>';
        tbody.innerHTML = '<tr><td colspan="10" class="loading">Carregando...</td></tr>';
    }
    const idViagem = document.getElementById('romaneio-filtro-id-viagem') && document.getElementById('romaneio-filtro-id-viagem').value.trim();
    const idRoteiro = document.getElementById('romaneio-filtro-id-roteiro') && document.getElementById('romaneio-filtro-id-roteiro').value.trim();
    const codigoCliente = document.getElementById('romaneio-filtro-codigo-cliente') && document.getElementById('romaneio-filtro-codigo-cliente').value.trim();
    const codigoProduto = document.getElementById('romaneio-filtro-codigo-produto') && document.getElementById('romaneio-filtro-codigo-produto').value.trim();
    const endereco = document.getElementById('romaneio-filtro-endereco') && document.getElementById('romaneio-filtro-endereco').value.trim();
    const cidade = document.getElementById('romaneio-filtro-cidade') && document.getElementById('romaneio-filtro-cidade').value.trim();
    const params = new URLSearchParams();
    if (idViagem) params.set('id_viagem', idViagem);
    if (idRoteiro) params.set('id_roteiro', idRoteiro);
    if (codigoCliente) params.set('codigo_cliente', codigoCliente);
    if (codigoProduto) params.set('codigo_produto', codigoProduto);
    if (endereco) params.set('endereco', endereco);
    if (cidade) params.set('cidade', cidade);
    const url = '/romaneio' + (params.toString() ? '?' + params.toString() : '');
    try {
        const resp = await _carregFetchGet(url, 60000);
        if (!thead || !tbody) return;
        if (!resp || resp.erro) {
            thead.innerHTML = '<tr><th>Erro</th></tr>';
            tbody.innerHTML = '<tr><td colspan="10" class="loading" style="color:#c62828;">' + escapeHtml(_carregErroMsg(resp, 'Erro ao carregar. Configure DATABASE_URL para usar as tabelas.')) + '</td></tr>';
            return;
        }
        const headers = resp.headers || [];
        const rows = resp.rows || [];
        const temFiltro = idViagem || idRoteiro || codigoCliente || codigoProduto || endereco || cidade;
        thead.innerHTML = '<tr>' + headers.map(h => '<th>' + (h || '-').replace(/</g, '&lt;') + '</th>').join('') + '</tr>';
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="' + Math.max(headers.length, 1) + '" class="loading">Nenhum registro encontrado' + (temFiltro ? ' com os filtros aplicados.' : ' na tabela de romaneio por item.') + '</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(row => {
            return '<tr>' + headers.map(h => {
                const val = row[h];
                const txt = (val !== undefined && val !== null) ? String(val) : '';
                return '<td>' + txt.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</td>';
            }).join('') + '</tr>';
        }).join('');
    } catch (e) {
        if (thead && tbody) {
            thead.innerHTML = '<tr><th>Erro</th></tr>';
            tbody.innerHTML = '<tr><td colspan="10" class="loading" style="color:#c62828;">' + escapeHtml((e && e.message) || 'Erro ao carregar romaneio.') + '</td></tr>';
        }
    } finally {
        // Sem overlay: usuário pode trocar de aba enquanto carrega
    }
}

window.limparFiltrosRomaneio = function() {
    const ids = ['romaneio-filtro-id-viagem', 'romaneio-filtro-id-roteiro', 'romaneio-filtro-codigo-cliente', 'romaneio-filtro-codigo-produto', 'romaneio-filtro-endereco', 'romaneio-filtro-cidade'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    loadRomaneio(true);
};

// Atualizar Romaneio (função global para uso em onclick)
window.updateRomaneio = async function(codigoBarras, quantidade) {
    const result = await fetchAPI('/romaneio', {
        method: 'POST',
        body: JSON.stringify({
            codigo_barras: codigoBarras,
            quantidade_romaneio: parseInt(quantidade) || 0
        })
    });
    
    if (result && result.success) {
        await loadRomaneio();
        await loadDivergencias(true);
        await loadEstatisticas();
        showMessage('Romaneio atualizado!', 'success');
    }
}

// Escapar HTML para exibição segura
function escHtml(s) {
    if (s == null || s === undefined) return '';
    const t = String(s);
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Desescapar atributos HTML para comparar com dados da API (chave id_viagem|codigo_produto)
function unescapeHtml(s) {
    if (s == null || s === undefined) return '';
    const t = String(s);
    return t.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Evitar recarregar a aba Divergências toda vez que trocar de aba (só carrega na 1ª vez ou ao clicar em Atualizar)
let divergenciasJaCarregado = false;
let divergenciasDevolucaoJaCarregado = false;

// Carregar Divergências de TODOS os roteiros: para cada roteiro, exibir DADOS DO ROTEIRO + ITENS DIVERGENTES
// force = true: sempre recarrega (botão Atualizar). force = false/undefined: só carrega se ainda não carregou.
async function loadDivergencias(force) {
    const conteudoEl = document.getElementById('divergencias-conteudo');
    if (!conteudoEl) return;
    if (!force && divergenciasJaCarregado) return;
    if (force) divergenciasJaCarregado = false;
    // Preservar texto digitado nos campos Motivo antes de substituir o conteúdo (chave = id_viagem|codigo_produto, desescapada)
    const motivosEmEdicaoDiv = {};
    conteudoEl.querySelectorAll('.input-motivo-divergencia').forEach(function(inp) {
        var idV = unescapeHtml(inp.getAttribute('data-id-viagem') || '');
        var cod = unescapeHtml(inp.getAttribute('data-codigo-produto') || '');
        motivosEmEdicaoDiv[idV + '|' + cod] = inp.value;
    });
    conteudoEl.innerHTML = '<p class="loading">Carregando divergências dos roteiros mais recentes (pode levar até 1 minuto)...</p>';
    let divergencias;
    try {
        divergencias = await fetchAPIComTimeout('/divergencias?limit_viagens=50', {}, 120000);
    } catch (e) {
        divergenciasJaCarregado = false;
        conteudoEl.innerHTML = '<p class="loading" style="color: #c62828;">' + escapeHtml(_modErroMsg(null, (e && e.message) || 'Erro ao carregar.')) + ' Clique em Atualizar para tentar novamente.</p>';
        return;
    }
    if (!divergencias) {
        divergenciasJaCarregado = false;
        conteudoEl.innerHTML = '<p class="loading" style="color: #c62828;">' + escapeHtml(_modErroMsg(null, 'Não foi possível contactar o servidor. Verifique a conexão e clique em Atualizar.')) + '</p>';
        return;
    }
    if (divergencias && divergencias.erro) {
        divergenciasJaCarregado = false;
        conteudoEl.innerHTML = '<p class="loading" style="color: #c62828;">' + escapeHtml(_modErroMsg(divergencias, divergencias.erro)) + '</p>';
        return;
    }
    if (!Array.isArray(divergencias)) divergencias = [];
    if (divergencias.length === 0) {
        const contagemEl = document.getElementById('divergencias-contagem');
        if (contagemEl) contagemEl.textContent = '';
        conteudoEl.innerHTML = '<p class="loading">Nenhuma divergência em nenhum roteiro. Tudo conferido!</p>';
        divergenciasJaCarregado = true;
        return;
    }
    const porRoteiro = {};
    divergencias.forEach(d => {
        const id = d.id_viagem || '-';
        if (!porRoteiro[id]) porRoteiro[id] = [];
        porRoteiro[id].push(d);
    });
    const idsOrdenados = Object.keys(porRoteiro).sort();
    const contagemEl = document.getElementById('divergencias-contagem');
    if (contagemEl) contagemEl.textContent = `(${divergencias.length} item(ns) em ${idsOrdenados.length} roteiro(s)).`;
    const fragmentos = [];
    for (const idViagem of idsOrdenados) {
        const itens = porRoteiro[idViagem];
        let viagemInfo = {};
        let periodo = {};
        try {
            const [info, per] = await Promise.all([
                fetchAPIComTimeout('/viagem/' + encodeURIComponent(idViagem) + '/info', {}, 20000),
                fetchAPIComTimeout('/viagem/' + encodeURIComponent(idViagem) + '/periodo', {}, 20000)
            ]);
            viagemInfo = info || {};
            periodo = per || {};
        } catch (e) {}
        const v = (x) => (x != null && String(x).trim() !== '') ? escHtml(x) : '-';
        const idSafe = idViagem.replace(/[^a-zA-Z0-9_-]/g, '_');
        fragmentos.push(`
        <div class="divergencias-roteiro-bloco" data-id-viagem="${escHtml(idViagem)}">
            <h3 class="divergencias-roteiro-titulo">Roteiro: ${escHtml(idViagem)}</h3>
            <div class="extrato-resumo-box divergencias-dados-roteiro">
                <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #1976D2;">DADOS DO ROTEIRO</h4>
                <div class="extrato-resumo-grid">
                    <section class="extrato-resumo-grupo">
                        <h4 class="extrato-resumo-grupo-titulo">Identificação</h4>
                        <div class="extrato-resumo-linha"><span class="extrato-resumo-label">ID Roteiro:</span> ${v(idViagem)}</div>
                        <div class="extrato-resumo-linha"><span class="extrato-resumo-label">Identificador da rota:</span> ${v(viagemInfo.identificador_rota)}</div>
                        <div class="extrato-resumo-linha"><span class="extrato-resumo-label">Data de expedição:</span> ${v(viagemInfo.data_expedicao)}</div>
                    </section>
                    <section class="extrato-resumo-grupo">
                        <h4 class="extrato-resumo-grupo-titulo">Veículo</h4>
                        <div class="extrato-resumo-linha"><span class="extrato-resumo-label">Placa:</span> ${v(viagemInfo.placa)}</div>
                        <div class="extrato-resumo-linha"><span class="extrato-resumo-label">Motorista:</span> ${v(viagemInfo.motorista)}</div>
                    </section>
                    <section class="extrato-resumo-grupo">
                        <h4 class="extrato-resumo-grupo-titulo">Período do carregamento</h4>
                        <div class="extrato-resumo-linha"><span class="extrato-resumo-label">Início:</span> ${v(periodo.inicio_carregamento)}</div>
                        <div class="extrato-resumo-linha"><span class="extrato-resumo-label">Fim:</span> ${v(periodo.fim_carregamento)}</div>
                    </section>
                    <section class="extrato-resumo-grupo">
                        <h4 class="extrato-resumo-grupo-titulo">Responsáveis</h4>
                        <div class="extrato-resumo-linha"><span class="extrato-resumo-label">Coordenador:</span> ${v(viagemInfo.coordenador)}</div>
                        <div class="extrato-resumo-linha"><span class="extrato-resumo-label">Conferente:</span> ${v(viagemInfo.conferente)}</div>
                        <div class="extrato-resumo-linha"><span class="extrato-resumo-label">Auxiliar de Carregamento 1:</span> ${v(viagemInfo.ajudante1)}</div>
                        <div class="extrato-resumo-linha"><span class="extrato-resumo-label">Auxiliar de Carregamento 2:</span> ${v(viagemInfo.ajudante2)}</div>
                    </section>
                </div>
            </div>
            <h4 style="margin: 16px 0 8px 0; font-size: 14px; color: #333;">ITENS DIVERGENTES</h4>
            <div class="table-container">
                <table class="data-table tabela-divergencias-roteiro">
                    <thead>
                        <tr>
                            <th>Motivo</th>
                            <th>Status</th>
                            <th>Código de Barras</th>
                            <th>Código do Produto</th>
                            <th>Produto</th>
                            <th>Qtd. Romaneio</th>
                            <th>Unidade</th>
                            <th>Peso Bruto</th>
                            <th>Qtd. Bipada</th>
                            <th>Qtd. Falta</th>
                            <th>Qtd. Sobra</th>
                            <th>Aviso</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itens.map(item => {
                            const pack = _terConferenciaBadgeEClasseLinha(item.status_bipado);
                            const qtdSobra = item.quantidade_sobra != null ? item.quantidade_sobra : 0;
                            const motivoBrutoDiv = motivosEmEdicaoDiv[idViagem + '|' + (item.codigo_produto || '')] !== undefined ? motivosEmEdicaoDiv[idViagem + '|' + (item.codigo_produto || '')] : (item.motivo_divergencia || '');
                            const motivoVal = (motivoBrutoDiv || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            const codigoProdutoEsc = (item.codigo_produto || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            return `<tr class="${pack.rowClass}">
                                <td><input type="text" class="input-motivo-divergencia" data-id-viagem="${escHtml(idViagem)}" data-codigo-produto="${codigoProdutoEsc}" value="${motivoVal}" placeholder="Escreva o motivo" onblur="salvarMotivoDivergencia(this)" title="Escreva o motivo da divergência e saia do campo para salvar"></td>
                                <td><span class="status-badge ${pack.badgeClass}">${pack.badgeText}</span></td>
                                <td><strong>${escHtml(item.codigo_barras || '-')}</strong></td>
                                <td><strong style="color: #1976D2;">${escHtml(item.codigo_produto || '-')}</strong></td>
                                <td>${escHtml(item.produto || '-')}</td>
                                <td><strong>${item.quantidade_produto ?? 0}</strong></td>
                                <td>${escHtml(item.unidade || '-')}</td>
                                <td>${(item.peso_bruto != null && item.peso_bruto !== '') ? escHtml(item.peso_bruto) : '-'}</td>
                                <td><strong style="color: ${(item.quantidade_bipada || 0) > 0 ? '#4caf50' : '#666'}">${item.quantidade_bipada ?? 0}</strong></td>
                                <td><strong style="color: ${(item.quantidade_falta || 0) > 0 ? '#f44336' : '#4caf50'}">${item.quantidade_falta ?? 0}</strong></td>
                                <td><strong style="color: ${qtdSobra > 0 ? '#ff9800' : '#4caf50'}">${qtdSobra}</strong></td>
                                <td style="color: #d32f2f; font-weight: bold;">${escHtml(item.aviso_sobra || '')}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        `);
    }
    conteudoEl.innerHTML = fragmentos.join('');
    divergenciasJaCarregado = true;
}

async function loadDivergenciasDevolucao(force) {
    const conteudoEl = document.getElementById('dev-divergencias-conteudo');
    if (!conteudoEl) return;
    if (!force && divergenciasDevolucaoJaCarregado) return;
    if (force) divergenciasDevolucaoJaCarregado = false;
    conteudoEl.innerHTML = '<p class="loading">Carregando divergências de devoluções...</p>';
    let divergencias;
    try {
        divergencias = await fetchAPIComTimeout('/divergencias?fluxo=devolucao&limit_viagens=50', {}, 120000);
    } catch (e) {
        divergenciasDevolucaoJaCarregado = false;
        conteudoEl.innerHTML = '<p class="loading" style="color: #c62828;">' + escapeHtml(_modErroMsg(null, (e && e.message) || 'Erro ao carregar.')) + ' Clique em Atualizar para tentar novamente.</p>';
        return;
    }
    if (!divergencias) {
        divergenciasDevolucaoJaCarregado = false;
        conteudoEl.innerHTML = '<p class="loading" style="color: #c62828;">' + escapeHtml(_modErroMsg(null, 'Não foi possível contactar o servidor.')) + '</p>';
        return;
    }
    if (divergencias && divergencias.erro) {
        divergenciasDevolucaoJaCarregado = false;
        conteudoEl.innerHTML = '<p class="loading" style="color: #c62828;">' + escapeHtml(_modErroMsg(divergencias, divergencias.erro)) + '</p>';
        return;
    }
    if (!Array.isArray(divergencias)) divergencias = [];
    if (divergencias.length === 0) {
        const contagemEl = document.getElementById('dev-divergencias-contagem');
        if (contagemEl) contagemEl.textContent = '';
        conteudoEl.innerHTML = '<p class="loading">Nenhuma divergência em devoluções.</p>';
        divergenciasDevolucaoJaCarregado = true;
        return;
    }
    const porRoteiro = {};
    divergencias.forEach(function(d) {
        const id = d.id_viagem || '-';
        if (!porRoteiro[id]) porRoteiro[id] = [];
        porRoteiro[id].push(d);
    });
    const idsOrdenados = Object.keys(porRoteiro).sort();
    const contagemEl = document.getElementById('dev-divergencias-contagem');
    if (contagemEl) contagemEl.textContent = '(' + divergencias.length + ' item(ns) em ' + idsOrdenados.length + ' roteiro(s)).';
    const fragmentos = [];
    for (const idViagem of idsOrdenados) {
        const itens = porRoteiro[idViagem];
        let viagemInfo = {};
        let periodo = {};
        try {
            const dados = await Promise.all([
                fetchAPIComTimeout('/viagem/' + encodeURIComponent(idViagem) + '/info', {}, 20000),
                fetchAPIComTimeout('/viagem/' + encodeURIComponent(idViagem) + '/periodo?fluxo=devolucao', {}, 20000)
            ]);
            viagemInfo = dados[0] || {};
            periodo = dados[1] || {};
        } catch (e) {}
        const v = function(x) { return (x != null && String(x).trim() !== '') ? escHtml(x) : '-'; };
        fragmentos.push(
            '<div class="divergencias-roteiro-bloco" data-id-viagem="' + escHtml(idViagem) + '">'
            + '<h3 class="divergencias-roteiro-titulo">Roteiro: ' + escHtml(idViagem) + '</h3>'
            + '<div class="extrato-resumo-box divergencias-dados-roteiro">'
            + '<h4 style="margin: 0 0 12px 0; font-size: 14px; color: #1976D2;">DADOS DO RETORNO</h4>'
            + '<div class="extrato-resumo-grid">'
            + '<section class="extrato-resumo-grupo"><h4 class="extrato-resumo-grupo-titulo">Identificação</h4><div class="extrato-resumo-linha"><span class="extrato-resumo-label">ID Roteiro:</span> ' + v(idViagem) + '</div><div class="extrato-resumo-linha"><span class="extrato-resumo-label">Identificador da rota:</span> ' + v(viagemInfo.identificador_rota) + '</div><div class="extrato-resumo-linha"><span class="extrato-resumo-label">Data de expedição:</span> ' + v(viagemInfo.data_expedicao) + '</div></section>'
            + '<section class="extrato-resumo-grupo"><h4 class="extrato-resumo-grupo-titulo">Veículo</h4><div class="extrato-resumo-linha"><span class="extrato-resumo-label">Placa:</span> ' + v(viagemInfo.placa) + '</div><div class="extrato-resumo-linha"><span class="extrato-resumo-label">Motorista:</span> ' + v(viagemInfo.motorista) + '</div></section>'
            + '<section class="extrato-resumo-grupo"><h4 class="extrato-resumo-grupo-titulo">Período do retorno</h4><div class="extrato-resumo-linha"><span class="extrato-resumo-label">Início:</span> ' + v(periodo.inicio_carregamento || periodo.inicio_bipagem) + '</div><div class="extrato-resumo-linha"><span class="extrato-resumo-label">Fim:</span> ' + v(periodo.fim_carregamento || periodo.fim_bipagem) + '</div></section>'
            + '</div></div>'
            + '<div class="table-container"><table class="data-table tabela-divergencias-roteiro"><thead><tr><th>Status</th><th>Código de Barras</th><th>Código do Produto</th><th>Produto</th><th>Qtd. Romaneio</th><th>Qtd. Bipada</th><th>Qtd. Falta</th><th>Qtd. Sobra</th><th>Aviso</th></tr></thead><tbody>'
            + itens.map(function(item) {
                const pack = _terConferenciaBadgeEClasseLinha(item.status_bipado);
                const qtdSobra = item.quantidade_sobra != null ? item.quantidade_sobra : 0;
                return '<tr class="' + pack.rowClass + '">'
                    + '<td><span class="status-badge ' + pack.badgeClass + '">' + pack.badgeText + '</span></td>'
                    + '<td><strong>' + escHtml(item.codigo_barras || '-') + '</strong></td>'
                    + '<td><strong style="color: #1976D2;">' + escHtml(item.codigo_produto || '-') + '</strong></td>'
                    + '<td>' + escHtml(item.produto || '-') + '</td>'
                    + '<td><strong>' + (item.quantidade_produto ?? 0) + '</strong></td>'
                    + '<td><strong style="color: ' + ((item.quantidade_bipada || 0) > 0 ? '#4caf50' : '#666') + '">' + (item.quantidade_bipada ?? 0) + '</strong></td>'
                    + '<td><strong style="color: ' + ((item.quantidade_falta || 0) > 0 ? '#f44336' : '#4caf50') + '">' + (item.quantidade_falta ?? 0) + '</strong></td>'
                    + '<td><strong style="color: ' + (qtdSobra > 0 ? '#ff9800' : '#4caf50') + '">' + qtdSobra + '</strong></td>'
                    + '<td style="color: #d32f2f; font-weight: bold;">' + escHtml(item.aviso_sobra || '') + '</td>'
                    + '</tr>';
            }).join('')
            + '</tbody></table></div></div>'
        );
    }
    conteudoEl.innerHTML = fragmentos.join('');
    divergenciasDevolucaoJaCarregado = true;
}

// Salvar motivo da divergência (chamado no onblur do input na aba Divergências)
window.salvarMotivoDivergencia = async function(inputEl) {
    if (!inputEl || !inputEl.dataset) return;
    const idViagem = (inputEl.dataset.idViagem || '').trim();
    const codigoProduto = (inputEl.dataset.codigoProduto || '').trim();
    const motivo = (inputEl.value || '').trim();
    if (!idViagem || !codigoProduto) return;
    try {
        const result = await fetchAPI('/divergencias/motivo', {
            method: 'PUT',
            body: JSON.stringify({ id_viagem: idViagem, codigo_produto: codigoProduto, motivo: motivo })
        });
        if (result && result.success) {
            showMessage('Motivo da divergência salvo.', 'success');
        }
    } catch (e) {
        showMessage('Erro ao salvar motivo.', 'error');
    }
};

// Função auxiliar para classe de diferença
function getDiferencaClass(diferenca) {
    if (diferenca === 0) return 'status-OK';
    if (diferenca > 0) return 'status-SOBRA';
    return 'status-FALTA';
}

// Mostrar mensagem
function showMessage(text, type) {
    // Criar elemento de mensagem se não existir
    let messageDiv = document.querySelector('.message');
    if (!messageDiv) {
        messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        document.querySelector('.content').insertBefore(messageDiv, document.querySelector('.content').firstChild);
    }
    
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 3000);
}

// Importar planilha do diretório local
window.importarPlanilhaLocal = async function() {
    const resultDiv = document.getElementById('import-result');
    resultDiv.innerHTML = '<p class="loading">Importando planilha...</p>';
    
    try {
        const response = await fetch('/api/importar-planilha-local', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        
        const resultado = await response.json();
        
        if (resultado.sucesso) {
            let mensagem = `<div class="message success">
                <strong>Importação concluída!</strong><br>
                Arquivo: ${resultado.arquivo}<br>
                Produtos importados da BASE: ${resultado.base || 0}<br>
                Itens de romaneio importados: ${resultado.romaneio || 0}
            </div>`;
            
            if (resultado.erros && resultado.erros.length > 0) {
                mensagem += `<div class="message error">
                    <strong>Avisos:</strong><br>
                    ${resultado.erros.join('<br>')}
                </div>`;
            }
            
            resultDiv.innerHTML = mensagem;
            
            // Recarregar todos os dados
            await loadAllData();
            showMessage('Dados importados com sucesso!', 'success');
        } else {
            resultDiv.innerHTML = `<div class="message error">
                <strong>Erro:</strong> ${resultado.erro || 'Erro desconhecido'}
            </div>`;
            showMessage('Erro ao importar planilha', 'error');
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="message error">
            <strong>Erro:</strong> ${error.message}
        </div>`;
        showMessage('Erro ao conectar com servidor', 'error');
    }
}

// Importar planilha via upload
window.importarPlanilhaUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const resultDiv = document.getElementById('import-result');
    resultDiv.innerHTML = '<p class="loading">Enviando e importando planilha...</p>';
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/importar-planilha', {
            method: 'POST',
            body: formData
        });
        
        const resultado = await response.json();
        
        if (resultado.erro) {
            resultDiv.innerHTML = `<div class="message error">
                <strong>Erro:</strong> ${resultado.erro}
            </div>`;
            showMessage('Erro ao importar planilha', 'error');
        } else {
            let mensagem = `<div class="message success">
                <strong>Importação concluída!</strong><br>
                Produtos importados da BASE: ${resultado.base || 0}<br>
                Itens de romaneio importados: ${resultado.romaneio || 0}
            </div>`;
            
            if (resultado.erros && resultado.erros.length > 0) {
                mensagem += `<div class="message error">
                    <strong>Avisos:</strong><br>
                    ${resultado.erros.join('<br>')}
                </div>`;
            }
            
            resultDiv.innerHTML = mensagem;
            
            // Recarregar todos os dados
            await loadAllData();
            showMessage('Dados importados com sucesso!', 'success');
        }
        
        // Limpar input
        event.target.value = '';
    } catch (error) {
        resultDiv.innerHTML = `<div class="message error">
            <strong>Erro:</strong> ${error.message}
        </div>`;
        showMessage('Erro ao conectar com servidor', 'error');
    }
}

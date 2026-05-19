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

function reloadConferenciaAtiva(idViagem) {
    if (!idViagem) return Promise.resolve();
    var fl = (window._fluxoBipagemAtivo === 'devolucao') ? 'devolucao' : 'carregamento';
    return loadConferencia(idViagem, { fluxo: fl });
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
    initDevolucoesTabs();
    initTerceirosTabs();
    void _terceirosGarantirPrefetchLista();
    initTerceirosAlertasHeader();
    initTerceirosPendenciaRecebimentoDelegacao();
    initTerceirosBotoesPdfXmlDelegacao();
    initTerceirosModalConfirmarRecebimentoFornecedores();
    initTerceirosConferenciaAcoesDelegacao();
    initForms();
    initFiltrosBase();
    initBaseItemModal();
    initNavegacaoRapida();
    // Primeira carga após um tick para a tela pintar antes (resposta mais rápida percebida)
    setTimeout(function() {
        loadAllData();
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
let _terceirosConfirmacaoIrNotasLancadasResolver = null;
let _terceirosConfirmacaoIrRecebimentosMgResolver = null;
let _terceirosConfirmacaoRecebimentoFornecedoresResolver = null;
/** Evita fechar modal de confirmação no mesmo clique que abriu (ex.: «Sim» no select + backdrop). */
let _terceirosIgnorarCliqueBackdropModalAte = 0;
let _terceirosExcluirDocumentoResolver = null;
let _terceirosExcluirDocumentoAtual = null;
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
    return undefined;
}

async function recarregarListaTerceirosTab(tab) {
    var pre = _terceirosDadosListaParaRender();
    if (!pre && _terceirosPrefetchPromise) {
        try {
            pre = await _terceirosPrefetchPromise;
        } catch (e) {
            console.error('recarregarListaTerceirosTab prefetch:', e);
        }
    }
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
    if (!botoes.length || !painel || !enviarXml || !recebimento || !fornecedoresRecebidos || !pendentesLancamento || !notasLancadas || !notasEnviadasMg || !recebimentosMg || !pendenciasMg || !historico || !relatorios) return;
    botoes.forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-ter-tab') === aba);
    });
    painel.classList.toggle('devolucoes-panel-active', aba === 'painel');
    enviarXml.classList.toggle('devolucoes-panel-active', aba === 'enviar-xml');
    recebimento.classList.toggle('devolucoes-panel-active', aba === 'pendencia-recebimento');
    fornecedoresRecebidos.classList.toggle('devolucoes-panel-active', aba === 'fornecedores-recebidos');
    pendentesLancamento.classList.toggle('devolucoes-panel-active', aba === 'pendentes-lancamento');
    notasLancadas.classList.toggle('devolucoes-panel-active', aba === 'notas-lancadas');
    notasEnviadasMg.classList.toggle('devolucoes-panel-active', aba === 'notas-enviadas-mg');
    recebimentosMg.classList.toggle('devolucoes-panel-active', aba === 'recebimentos-mg');
    pendenciasMg.classList.toggle('devolucoes-panel-active', aba === 'pendencias-mg');
    historico.classList.toggle('devolucoes-panel-active', aba === 'historico');
    relatorios.classList.toggle('devolucoes-panel-active', aba === 'relatorios');
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
function _terceirosAtualizarNotaLancadaLocal(documentoId, valorNorm) {
    if (documentoId == null) return;
    var id = String(documentoId);
    var locais = window._terceirosFornecedoresRecebidosLocais || {};
    if (locais[id]) {
        locais[id] = Object.assign({}, locais[id], { nota_lancada: valorNorm });
    }
    if (_terceirosDocAtual && String(_terceirosDocAtual.id) === id) {
        _terceirosDocAtual.nota_lancada = valorNorm;
    }
}

var TERCEIROS_PEND_LANC_TBODY_IDS = [
    'ter-tbody-pendentes-lancamento-mg',
    'ter-tbody-pendentes-lancamento-sp',
    'ter-tbody-pendentes-lancamento-outras'
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
            atualizarStatusTerceirosDireto(id, 'nota_lancada', valor, {
                recebimento_concluido: recebimentoConcluido,
                fornecedor_recebido: fornecedorRecebido
            }).finally(function() {
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

function _terceirosAtualizarEnviarMgLocal(documentoId, valorNorm) {
    if (documentoId == null) return;
    var id = String(documentoId);
    var locais = window._terceirosFornecedoresRecebidosLocais || {};
    if (locais[id]) {
        locais[id] = Object.assign({}, locais[id], { enviar_para_mg: valorNorm });
    }
    if (_terceirosDocAtual && String(_terceirosDocAtual.id) === id) {
        _terceirosDocAtual.enviar_para_mg = valorNorm;
    }
}

function _terceirosRemoverLinhaPendenciasMg(documentoId) {
    var tbody = document.getElementById('ter-tbody-pendencias-mg');
    if (!tbody || documentoId == null) return;
    var tr = tbody.querySelector('tr[data-ter-doc-id="' + String(documentoId) + '"]');
    if (tr) tr.remove();
    if (!tbody.querySelector('tr[data-ter-doc-id]')) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF aguardando <strong>Enviar MG</strong>. As notas entram aqui após o lançamento fiscal na aba Notas Fiscais Lançadas.</td></tr>';
    }
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

function initNavegacaoRapida() {
    var linkInicio = document.querySelector('.header-link-inicio');
    if (!linkInicio) return;
    var href = linkInicio.getAttribute('href') || '/entrada';

    try {
        var prefetch = document.createElement('link');
        prefetch.rel = 'prefetch';
        prefetch.href = href;
        prefetch.as = 'document';
        document.head.appendChild(prefetch);
    } catch (e) {}

    var navegar = function() {
        try {
            if (_eventSource) {
                _eventSource.close();
                _eventSource = null;
            }
        } catch (e) {}
        window.location.assign(href);
    };

    linkInicio.addEventListener('click', function(e) {
        e.preventDefault();
        navegar();
    });
}

function initModulos() {
    var carreg = document.getElementById('modulo-carregamento');
    var dev = document.getElementById('modulo-devolucoes');
    var ter = document.getElementById('modulo-terceiros');
    if (!carreg) return;

    var botoes = document.querySelectorAll('.modulo-button');

    function mostrarModulo(id) {
        carreg.hidden = id !== 'carregamento';
        if (dev) dev.hidden = id !== 'devolucoes';
        if (ter) ter.hidden = id !== 'terceiros';
        carreg.classList.toggle('modulo-area--ativo', id === 'carregamento');
        if (dev) dev.classList.toggle('modulo-area--ativo', id === 'devolucoes');
        if (ter) ter.classList.toggle('modulo-area--ativo', id === 'terceiros');
        botoes.forEach(function(b) {
            b.classList.toggle('active', b.getAttribute('data-modulo') === id);
        });
        var btnAtualizar = document.getElementById('btn-atualizar-aba');
        if (btnAtualizar) {
            btnAtualizar.style.display = id === 'carregamento' ? '' : 'none';
        }
        window._fluxoBipagemAtivo = id === 'devolucoes' ? 'devolucao' : 'carregamento';
        if (id === 'carregamento') {
            var activeTab = document.querySelector('.tab-content.active');
            if (activeTab && activeTab.id) loadTabData(activeTab.id);
        } else if (id === 'devolucoes') {
            var painelDev = document.getElementById('devolucoes-panel-painel');
            if (painelDev && painelDev.classList.contains('devolucoes-panel-active')) {
                loadPainelDevolucoes();
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
    if (modUrl && ['carregamento', 'devolucoes', 'terceiros'].indexOf(modUrl) !== -1) {
        mostrarModulo(modUrl);
    }

    window.controleMostrarModulo = mostrarModulo;
}

function initDevolucoesTabs() {
    var botoes = document.querySelectorAll('.devolucoes-subtab[data-dev-tab]');
    var painel = document.getElementById('devolucoes-panel-painel');
    var conferencia = document.getElementById('devolucoes-panel-bipar');
    var extrato = document.getElementById('devolucoes-panel-extrato');
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
        relatorios.classList.toggle('devolucoes-panel-active', tab === 'relatorios');
        divergencias.classList.toggle('devolucoes-panel-active', tab === 'divergencias');
        if (tab === 'painel') loadPainelDevolucoes();
        if (tab === 'extrato') loadExtratoDevolucao();
        if (tab === 'divergencias') loadDivergenciasDevolucao(false);
    }

    botoes.forEach(function(btn) {
        btn.addEventListener('click', function() {
            mostrarDevTab(btn.getAttribute('data-dev-tab') || 'painel');
        });
    });

    mostrarDevTab('painel');
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
    mostrarTerTab(tabInicial);
    void _terceirosGarantirPrefetchLista();
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
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
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
            return loadConferencia(idV).then(function() {
                loadEstatisticas();
            });
        }
        case 'extrato':
            return loadExtrato();
        case 'romaneio':
            return loadRomaneio();
        case 'importar-ravex':
            return Promise.resolve();
        case 'baixa-ravex':
            return loadBaixadosRavex();
        case 'divergencias':
            return loadDivergencias(false);
        default:
            return Promise.resolve();
    }
}

async function loadBaixadosRavex() {
    const tbody = document.getElementById('tbody-baixa-ravex');
    if (!tbody) return;
    var jaTinhaDados = tbody.querySelector('tr:not(.loading)');
    if (!jaTinhaDados) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Carregando...</td></tr>';
    }
    const resp = await fetchAPI('/ravex/importacoes?limit=200');
    if (!resp || resp.erro) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading" style="color:#c62828;">' + (resp && resp.erro ? escapeHtml(resp.erro) : 'Erro ao carregar histórico') + '</td></tr>';
        return;
    }
    const rows = Array.isArray(resp.rows) ? resp.rows : [];
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Nenhuma importação registrada ainda.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => {
        const params = r.parametros ? JSON.stringify(r.parametros) : '';
        const erros = Array.isArray(r.erros) ? r.erros.length : 0;
        return '<tr>'
            + '<td>' + escapeHtml(String(r.criado_em || '')) + '</td>'
            + '<td>' + escapeHtml(String(r.tipo || '')) + '</td>'
            + '<td>' + escapeHtml(String(r.status || '')) + '</td>'
            + '<td style="max-width: 520px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="' + escapeHtml(params) + '">' + escapeHtml(params) + '</td>'
            + '<td><strong>' + escapeHtml(String(r.viagens_processadas || 0)) + '</strong></td>'
            + '<td><strong>' + escapeHtml(String(r.total_itens || 0)) + '</strong></td>'
            + '<td>' + escapeHtml(String(r.usuario || '')) + '</td>'
            + '<td>' + (erros ? ('<span style="color:#c62828;font-weight:700;">' + erros + '</span>') : '0') + '</td>'
            + '</tr>';
    }).join('');
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
        loadEstatisticas();
        return;
    }
    loadEstatisticas();
    loadTabData(activeId);
}

async function loadPainelDevolucoes() {
    const data = await fetchAPI('/devolucoes/painel');
    if (!data) return;
    if (data.erro) {
        if (data._falhaGateway) {
            console.warn('Painel de devoluções: servidor indisponível (proxy/gateway).');
            var msgInd = 'Não foi possível carregar o painel no momento. Use o botão «Atualizar aba» no topo e tente de novo.';
            ['dev-stat-bipados', 'dev-stat-soma-quantidades', 'dev-stat-unicos', 'dev-stat-viagens', 'dev-stat-docas', 'dev-stat-usuarios'].forEach(function(sid) {
                var el = document.getElementById(sid);
                if (el) el.textContent = '—';
            });
            [['dev-tbody-painel-viagens', 7], ['dev-tbody-painel-itens', 3], ['dev-tbody-painel-veiculos', 3], ['dev-tbody-painel-docas', 3], ['dev-tbody-painel-usuarios', 3]].forEach(function(pair) {
                var tb = document.getElementById(pair[0]);
                if (tb) tb.innerHTML = '<tr><td colspan="' + pair[1] + '" class="loading">' + escapeHtml(msgInd) + '</td></tr>';
            });
            destroyPainelDevolucoesCharts();
            return;
        }
        showMessage('Painel de devoluções: ' + data.erro, 'error');
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
            + '<td>' + escapeHtml(v.inicio || '-') + '</td>'
            + '<td>' + escapeHtml(v.fim || '-') + '</td>'
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
        if (etapaEx === 'fornecedores-recebidos') s.fornecedores_recebidos += 1;
        if (etapaEx === 'pendentes-lancamento') s.pendentes_lancamento += 1;
        if (etapaEx === 'notas-lancadas') s.notas_lancadas += 1;
        if (etapaEx === 'pendencias-mg') s.pendencias_mg += 1;
        if (etapaEx === 'recebimentos-mg') s.recebimentos_mg += 1;
        if (etapaEx === 'pendencia-recebimento') s.pendencia_recebimento += 1;
        if (divIt === 0 && Math.abs(qXml - qBip) <= 1e-6 && qXml > 1e-9) s.conferencia_ok += 1;
        else if (qBip > 1e-9 || divIt > 0) s.conferencia_divergente += 1;
    });
    return s;
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
        'Notas lançadas',
        'Pendências envio MG',
        'Recebimentos MG'
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

async function loadPainelTerceiros() {
    var cacheHit = _terceirosObterCacheLista();
    if (cacheHit && cacheHit.rows && cacheHit.rows.length) {
        _aplicarPainelTerceirosStats(_painelTerceirosStatsRapidasFromRows(
            _terceirosMesclarRecebidosLocaisNasRows(cacheHit.rows)
        ));
    }

    var data = await fetchAPI('/terceiros/painel');
    if (!data) return;
    window._terceirosPainelUltimoData = data;

    var statIds = [
        'ter-stat-total-nf', 'ter-stat-pendencia', 'ter-stat-fornecedores', 'ter-stat-receb-concluido',
        'ter-stat-pend-lanc', 'ter-stat-notas-lanc', 'ter-stat-qtd-xml', 'ter-stat-qtd-bip',
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

    preencher('ter-tbody-painel-ultimas', data.ultimas_nfs || [], 8, 'Nenhuma NF cadastrada ainda.', function(n) {
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

    preencher('ter-tbody-painel-itens', data.top_itens || [], 3, 'Nenhum item bipado ainda.', function(i) {
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

function getTerceirosPrefixo() {
    return 'ter-rec';
}

function getTerceirosAreaApi(area) {
    if (area === 'expedicao') return 'expedicao';
    if (area === 'carreta') return 'carreta';
    return 'recebimento';
}

function abrirModalRecebimentoConcluidoTerceiros() {
    var modal = document.getElementById('modal-terceiros-recebimento-concluido');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10050';
    var btnFechar = document.getElementById('btn-ter-fechar-recebimento-concluido');
    window.setTimeout(function() {
        if (btnFechar) btnFechar.focus();
    }, 50);
}

function fecharModalRecebimentoConcluidoTerceiros() {
    var modal = document.getElementById('modal-terceiros-recebimento-concluido');
    if (modal) {
        modal.style.display = 'none';
        modal.style.alignItems = '';
        modal.style.justifyContent = '';
    }
    abrirAbaTerceirosSeDiferente('fornecedores-recebidos');
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
    var sucesso = total > 0;
    modal.classList.toggle('modal-ter-upload-sucesso--aviso', !sucesso);
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
        modal.classList.remove('modal-ter-upload-sucesso--aviso');
    }
}

function terceirosIrParaPendenciaAposUpload() {
    fecharModalUploadXmlTerceirosConcluido();
    if (window.terceirosMostrarAba) window.terceirosMostrarAba('pendencia-recebimento');
}

/** Fecha o modal e leva à próxima aba do fluxo (NFs pendentes de lançamento). */
function terceirosIrParaProximaEtapaLancamento() {
    var modal = document.getElementById('modal-terceiros-recebimento-concluido');
    if (modal) {
        modal.style.display = 'none';
        modal.style.alignItems = '';
        modal.style.justifyContent = '';
    }
    if (window.terceirosMostrarAba) window.terceirosMostrarAba('pendentes-lancamento');
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

async function _terceirosAplicarUiAposRecebimentoConcluido(documentoId, documentoAtualizado, irParaFornecedores) {
    var prefixoConcl = getTerceirosPrefixo();
    definirDestaqueLinhaTerceirosDoc(documentoId);
    aplicarMovimentoRecebimentoConcluidoLocal(documentoId, documentoAtualizado);
    try {
        void loadTerceirosDocumentos();
    } catch (e) {
        console.error(e);
    }
    try {
        void loadTerceirosFornecedoresRecebidos();
    } catch (e2) {
        console.error(e2);
    }
    void atualizarAlertasTerceirosHeaderAposMudancaRecebimento();
    if (irParaFornecedores) {
        await abrirAbaTerceirosSeDiferenteAsync('fornecedores-recebidos', false, true);
        resetTerceirosDetalhe();
        animarConclusaoTerceiros(prefixoConcl);
        window.setTimeout(function() {
            abrirModalRecebimentoConcluidoTerceiros();
        }, 0);
        showMessage('Recebimento concluído.', 'success');
        return;
    }
    atualizarBotaoConclusaoTerceiros(prefixoConcl, true);
    if (_terceirosDocAtual && documentoAtualizado) {
        _terceirosDocAtual = Object.assign({}, _terceirosDocAtual, documentoAtualizado);
    }
    showMessage('Recebimento concluído. Você permanece nesta aba.', 'success');
}

/** Após salvar «Sim» em Nota lançada: pergunta se vai à 5ª aba. */
async function _terceirosAposConfirmarNotaLancadaSim(documentoId, documentoResp) {
    if (documentoId == null) return;
    var notaVal = (documentoResp && documentoResp.nota_lancada) ? documentoResp.nota_lancada : 'sim';
    _terceirosAtualizarNotaLancadaLocal(documentoId, notaVal);
    invalidateTerceirosListaCache();
    var irAba5 = await abrirModalIrParaNotasLancadas();
    if (irAba5) {
        await terceirosNavegarParaNotasLancadasAposMarcarSim(documentoId);
        showMessage('Nota lançada registrada. Você está na aba Notas fiscais lançadas.', 'success');
        return;
    }
    _terceirosRemoverLinhaPendentesLancamento(documentoId);
    definirDestaqueLinhaTerceirosDoc(documentoId);
    try {
        if (_terceirosTabAtual === 'pendentes-lancamento') {
            await loadTerceirosPendentesLancamento();
        } else {
            await recarregarListaTerceirosTab(_terceirosTabAtual);
        }
        void loadTerceirosFornecedoresRecebidos();
        void loadTerceirosNotasLancadas();
        void atualizarAlertasTerceirosHeader();
    } catch (e) {
        console.error(e);
    }
    showMessage('Nota lançada registrada.', 'success');
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

async function _terceirosAposConcluirCarretaNoHistorico(documentoId, documentoResp) {
    if (documentoId == null) return;
    if (documentoResp && _terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
        Object.assign(_terceirosDocAtual, documentoResp);
    }
    invalidateTerceirosListaCache();
    var irHistorico = await abrirModalIrParaRecebimentosMg();
    if (irHistorico) {
        await terceirosNavegarParaHistoricoAposEnviarMg(documentoId);
        showMessage('NF de carreta registrada no histórico.', 'success');
        return;
    }
    definirDestaqueLinhaTerceirosDoc(documentoId);
    try {
        if (_terceirosTabAtual === 'notas-lancadas') {
            await loadTerceirosNotasLancadas();
        } else {
            await recarregarListaTerceirosTab(_terceirosTabAtual);
        }
        void loadTerceirosHistorico();
        void atualizarAlertasTerceirosHeader();
    } catch (e) {
        console.error(e);
    }
    showMessage('NF de carreta registrada no histórico.', 'success');
}

/** Após confirmar recebimento em MG (fluxo normal) — vai ao Histórico. */
async function _terceirosAposConfirmarRecebidaMgSim(documentoId, documentoResp) {
    if (documentoId == null) return;
    if (documentoResp && isTerceirosAreaCarreta(documentoResp)) {
        await _terceirosAposConcluirCarretaNoHistorico(documentoId, documentoResp);
        return;
    }
    if (documentoResp && _terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
        Object.assign(_terceirosDocAtual, documentoResp);
    }
    invalidateTerceirosListaCache();
    await terceirosNavegarParaHistoricoAposEnviarMg(documentoId);
    showMessage('Recebimento em MG confirmado. A NF está no Histórico e permanece listada em Notas lançadas.', 'success');
}

/** Após marcar que não é necessário envio para MG — vai ao Histórico. */
async function _terceirosAposConfirmarEnviarMgNao(documentoId, documentoResp) {
    if (documentoResp && isTerceirosAreaCarreta(documentoResp)) {
        showMessage('NF de carreta não utiliza envio para MG. Conclua na 5ª aba — Notas lançadas.', 'warning');
        return;
    }
    if (documentoId == null) return;
    _terceirosAtualizarEnviarMgLocal(documentoId, 'nao');
    invalidateTerceirosListaCache();
    await terceirosNavegarParaHistoricoAposEnviarMg(documentoId);
    showMessage('Registrado: envio para MG não necessário. A NF está no Histórico.', 'success');
}

/** Após salvar «Sim» em Enviado para MG: remove da 6ª aba e pergunta se vai ao Histórico. */
async function _terceirosAposConfirmarEnviarMgSim(documentoId, documentoResp) {
    if (documentoResp && isTerceirosAreaCarreta(documentoResp)) {
        showMessage('NF de carreta não utiliza envio para MG. Conclua na 5ª aba — Notas lançadas.', 'warning');
        return;
    }
    if (documentoId == null) return;
    var envVal = (documentoResp && documentoResp.enviar_para_mg) ? documentoResp.enviar_para_mg : 'sim';
    _terceirosAtualizarEnviarMgLocal(documentoId, envVal);
    invalidateTerceirosListaCache();
    var irHistorico = await abrirModalIrParaRecebimentosMg();
    if (irHistorico) {
        await terceirosNavegarParaHistoricoAposEnviarMg(documentoId);
        showMessage('Enviado para MG registrado. Você está no Histórico.', 'success');
        return;
    }
    _terceirosRemoverLinhaPendenciasMg(documentoId);
    definirDestaqueLinhaTerceirosDoc(documentoId);
    try {
        if (_terceirosTabAtual === 'pendencias-mg') {
            await loadTerceirosPendenciasMg();
        } else {
            await recarregarListaTerceirosTab(_terceirosTabAtual);
        }
        void loadTerceirosNotasLancadas();
        void loadTerceirosHistorico();
        void loadTerceirosRecebimentosMg();
        void atualizarAlertasTerceirosHeader();
    } catch (e) {
        console.error(e);
    }
    showMessage('Enviado para MG registrado.', 'success');
}

function fecharModalExcluirDocumento(confirmado) {
    var modal = document.getElementById('modal-terceiros-excluir-documento');
    if (modal) modal.style.display = 'none';
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
    modal.style.display = 'block';
    return new Promise(function(resolve) {
        _terceirosExcluirDocumentoResolver = resolve;
    });
}

async function uploadXmlTerceirosComPrefixo(prefixo, areaChave, opcoes) {
    opcoes = opcoes || {};
    var previsaoEl = document.getElementById(prefixo + '-previsao');
    var filesEl = document.getElementById(prefixo + '-xml');
    var resultadoEl = document.getElementById(prefixo + '-upload-resultado');
    if (!previsaoEl || !filesEl || !resultadoEl) return;
    if (!previsaoEl.value.trim()) {
        resultadoEl.textContent = 'Informe a previsão de chegada.';
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
    if (opcoes.exigeMotoristaPlaca && motEl && plaEl) {
        form.append('motorista_carreta', (motEl.value || '').trim());
        form.append('placa_carreta', (plaEl.value || '').trim().toUpperCase());
    }
    Array.prototype.forEach.call(filesEl.files, function(file) {
        form.append('files', file);
    });
    resultadoEl.textContent = 'Enviando XMLs...';
    try {
        const resp = await fetch(API_BASE + '/terceiros/upload-xml', {
            method: 'POST',
            body: form,
            credentials: 'same-origin'
        });
        const data = await resp.json().catch(function() { return {}; });
        if (!resp.ok || !data.ok) {
            resultadoEl.textContent = (data && data.erro) ? data.erro : 'Erro ao enviar XMLs.';
            return;
        }
        resultadoEl.textContent = '';
        filesEl.value = '';
        if (opcoes.exigeMotoristaPlaca && motEl) motEl.value = '';
        if (opcoes.exigeMotoristaPlaca && plaEl) plaEl.value = '';
        void recarregarTodasListasTerceiros();
        abrirModalUploadXmlTerceirosConcluido({
            totalCriados: data.total_criados || 0,
            erros: data.erros || [],
            previsao: previsaoEl.value.trim(),
            areaLabel: _terceirosLabelAreaUpload(areaChave)
        });
    } catch (e) {
        resultadoEl.textContent = 'Erro ao enviar XMLs.';
    }
}

async function uploadXmlTerceiros() {
    return uploadXmlTerceirosComPrefixo('ter-recebimento', 'recebimento');
}

async function uploadXmlTerceirosCarreta() {
    return uploadXmlTerceirosComPrefixo('ter-carreta', 'carreta', { exigeMotoristaPlaca: true });
}

var _terceirosListaCache = { rows: null, erro: null, ts: 0, promise: null };
var TERCEIROS_LISTA_CACHE_MS = 90000;
var _terceirosPrefetchPromise = null;

/**
 * Uma única requisição ao abrir a página: preenche todas as tabelas Terceiros em paralelo.
 */
function _terceirosGarantirPrefetchLista() {
    if (_terceirosPrefetchPromise) return _terceirosPrefetchPromise;
    _terceirosPrefetchPromise = fetchTerceirosDocumentosTodos().then(function(data) {
        return warmTerceirosTodasListas(data).then(function() { return data; });
    }).catch(function(e) {
        console.error('_terceirosGarantirPrefetchLista:', e);
        _terceirosPrefetchPromise = null;
        throw e;
    });
    return _terceirosPrefetchPromise;
}

/** Preenche todas as listas do módulo a partir dos mesmos dados (troca de aba instantânea). */
async function warmTerceirosTodasListas(dataPreloaded) {
    var data = dataPreloaded;
    if (!data || (!data.rows && !data.erro)) {
        data = await fetchTerceirosDocumentosTodos();
    }
    if (!data) return;
    var abaAtiva = _terceirosTabAtual || 'painel';
    var tarefas = [
        loadTerceirosDocumentos(data),
        loadTerceirosFornecedoresRecebidos(data),
        loadTerceirosPendentesLancamento(data),
        loadTerceirosNotasLancadas(data),
        loadTerceirosPendenciasMg(data),
        loadTerceirosNotasEnviadasMg(data),
        loadTerceirosRecebimentosMg(data),
        loadTerceirosHistorico(data)
    ];
    if (abaAtiva === 'painel') {
        tarefas.push(loadPainelTerceiros());
    }
    await Promise.all(tarefas.map(function(p) {
        return Promise.resolve(p).catch(function(err) {
            console.error('warmTerceirosTodasListas:', err);
        });
    }));
    void atualizarAlertasTerceirosHeader(_terceirosMesclarRecebidosLocaisNasRows(data.rows || []));
}

function invalidateTerceirosListaCache() {
    _terceirosListaCache.rows = null;
    _terceirosListaCache.erro = null;
    _terceirosListaCache.ts = 0;
    window._terceirosPainelUltimoData = null;
}

function _terceirosObterCacheLista() {
    var now = Date.now();
    if (_terceirosListaCache.rows && (now - _terceirosListaCache.ts) < TERCEIROS_LISTA_CACHE_MS) {
        return { rows: _terceirosListaCache.rows, erro: _terceirosListaCache.erro };
    }
    return null;
}

/** Uma requisição compartilhada; abas leem do cache ou reutilizam fetch em andamento. */
async function fetchTerceirosDocumentosTodos(opcoes) {
    opcoes = opcoes || {};
    var force = !!opcoes.force;
    var now = Date.now();
    if (!force) {
        var hit = _terceirosObterCacheLista();
        if (hit) return hit;
        if (_terceirosListaCache.promise) return _terceirosListaCache.promise;
    }
    var executar = async function() {
        const resp = await fetchAPIComTimeout('/terceiros/documentos?area=' + encodeURIComponent('todas'), {}, 45000);
        var erro = (!resp || resp.erro) ? ((resp && resp.erro) || 'Erro ao carregar documentos.') : null;
        const rows = Array.isArray(resp && resp.rows) ? resp.rows : [];
        var ordenadas = rows.slice().sort(function(a, b) {
            return Number(b.id || 0) - Number(a.id || 0);
        });
        _terceirosListaCache.rows = ordenadas;
        _terceirosListaCache.erro = erro;
        _terceirosListaCache.ts = Date.now();
        return { erro: erro, rows: ordenadas };
    };
    _terceirosListaCache.promise = executar().finally(function() {
        _terceirosListaCache.promise = null;
    });
    return _terceirosListaCache.promise;
}

async function _terceirosResolverDadosLista(dataPreloaded, tbody, colspan) {
    if (dataPreloaded && (dataPreloaded.rows || dataPreloaded.erro)) return dataPreloaded;
    var hit = _terceirosObterCacheLista();
    if (hit) return hit;
    if (_terceirosListaCache.promise) {
        return _terceirosListaCache.promise;
    }
    if (_terceirosPrefetchPromise) {
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

/** Rotas que passam pelas abas 6ª–8ª (envio/recebimento MG). */
function _terceirosUsaFluxoMg(row) {
    return !isTerceirosAreaCarreta(row);
}

/** 5ª aba: NF lançada aguardando ação (carreta ou definição de envio MG). */
function _terceirosConsideraNotasLancadas(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!isTerceirosFlagSim(row && row.nota_lancada)) return false;
    if (isTerceirosAreaCarreta(row)) {
        return !isTerceirosFlagSim(row.carga_recebida_mg);
    }
    if (isTerceirosFlagNao(row.enviar_para_mg)) return false;
    return !isTerceirosFlagSim(row.enviar_para_mg);
}

/** Fluxo MG encerrado: lançada + enviada + recebida em MG. */
function _terceirosFluxoMgConcluido(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!_terceirosUsaFluxoMg(row)) return false;
    return isTerceirosFlagSim(row.nota_lancada)
        && isTerceirosFlagSim(row.enviar_para_mg)
        && isTerceirosFlagSim(row.carga_recebida_mg);
}

/** Histórico: carreta concluída; MG dispensado (Não); ou lançada + enviada + recebida MG. */
function _terceirosConsideraHistorico(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!row || row.id == null) return false;
    if (isTerceirosAreaCarreta(row)) {
        return isTerceirosFlagSim(row.carga_recebida_mg);
    }
    if (!isTerceirosFlagSim(row.nota_lancada)) return false;
    if (isTerceirosFlagNao(row.enviar_para_mg)) return true;
    return _terceirosFluxoMgConcluido(row);
}

function textoResumoEnviarMgHistorico(row) {
    if (isTerceirosAreaCarreta(row)) return 'N/A';
    if (isTerceirosFlagNao(row.enviar_para_mg)) return 'Não — sem envio';
    return row.enviar_para_mg || '-';
}

function _terceirosLabelEtapaAtual(row) {
    var etapa = _terceirosEtapaExclusivaDoRow(row);
    return TERCEIROS_LABEL_ABA[etapa] || etapa || '—';
}

/** 5ª aba — todas as NFs com lançamento Sim (histórico completo da etapa). */
function getTerceirosRowsNotasLancadasComHistorico(rows) {
    return _terceirosRowsEstadoMesclado(rows)
        .filter(function(row) {
            return isTerceirosFlagSim(row.nota_lancada);
        })
        .sort(function(a, b) {
            var da = String(a.nota_lancada_em || a.atualizado_em || '');
            var db = String(b.nota_lancada_em || b.atualizado_em || '');
            return db.localeCompare(da);
        });
}

function textoResumoRecebidaMgHistorico(row) {
    if (isTerceirosAreaCarreta(row)) {
        return isTerceirosFlagSim(row.carga_recebida_mg) ? 'Concluído' : '-';
    }
    return row.carga_recebida_mg || '-';
}

/** Resumo legível do status de nota lançada (aba Fornecedores recebidos). */
function textoResumoNotaLancadaTerceiros(row) {
    if (isTerceirosFlagSim(row.nota_lancada)) return 'Sim';
    if (isTerceirosFlagNao(row.nota_lancada)) return 'Não';
    return 'Pendente';
}

function textoResumoEnviarMgTerceiros(row) {
    if (isTerceirosFlagSim(row && row.enviar_para_mg)) return 'Sim';
    if (isTerceirosFlagNao(row && row.enviar_para_mg)) return 'Não';
    return 'Pendente';
}

function textoResumoRecebidaMgTerceiros(row) {
    if (isTerceirosFlagSim(row && row.carga_recebida_mg)) return 'Sim';
    if (isTerceirosFlagNao(row && row.carga_recebida_mg)) return 'Não';
    return 'Pendente';
}

function terceirosCelulaPlacaLista(row) {
    var plc = ((row.placa_carreta || '').trim() || '—');
    return '<td><strong>' + escapeHtml(plc) + '</strong></td>';
}

function terceirosCelulaMotoristaListaLeitura(row) {
    return '<td>' + terceirosListaCellTextoLongo(row.motorista_carreta) + '</td>';
}

function renderTerceirosCelulasMotoristaPlacaLista(row, attrPrefix) {
    if (!_terceirosPodeEditarMotoristaPlaca()) {
        return terceirosCelulaMotoristaListaLeitura(row) + terceirosCelulaPlacaLista(row);
    }
    attrPrefix = attrPrefix || 'doc';
    var id = String(row.id);
    var aviso = isTerceirosMotoristaObrigatorio(row)
        ? '<div class="ter-status-meta ter-status-meta--alerta">Obrigatório para esta rota</div>'
        : '';
    return '<td><div class="ter-inline-stack">'
            + '<input type="text" class="ter-input-inline" data-ter-motorista-' + attrPrefix + '-doc="' + escapeHtml(id) + '" value="' + escapeHtml(row.motorista_carreta || '') + '" placeholder="Motorista">'
            + renderTerceirosUsuarioMeta(row.atualizado_por || '', row.motorista_carreta_em || '')
            + aviso
        + '</div></td>'
        + '<td><div class="ter-inline-stack">'
            + '<input type="text" class="ter-input-inline" data-ter-placa-' + attrPrefix + '-doc="' + escapeHtml(id) + '" value="' + escapeHtml(row.placa_carreta || '') + '" placeholder="Placa" style="text-transform: uppercase;">'
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
            if (id) void salvarMotoristaPlacaTerceirosDireto(id, motorista, placa);
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
    return renderTerceirosStatusComUsuario(
        textoResumoRecebidaMgTerceiros(row),
        row.carga_recebida_mg_por || '',
        row.carga_recebida_mg_em || ''
    ) + '<div class="ter-status-meta">Alterar na aba <strong>Recebimentos de MG</strong></div>';
}

/** 5ª aba — carreta: concluir fluxo sem MG. */
function renderTerceirosConclusaoCarretaTab5(row) {
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
    var locais = window._terceirosFornecedoresRecebidosLocais || {};
    var local = locais[String(row.id)];
    if (!local) return row;
    return Object.assign({}, row, {
        recebimento_concluido: local.recebimento_concluido != null ? local.recebimento_concluido : row.recebimento_concluido,
        recebimento_concluido_em: local.recebimento_concluido_em || row.recebimento_concluido_em,
        recebimento_concluido_por: local.recebimento_concluido_por || row.recebimento_concluido_por,
        nota_lancada: local.nota_lancada != null ? local.nota_lancada : row.nota_lancada,
        nota_lancada_em: local.nota_lancada_em || row.nota_lancada_em,
        nota_lancada_por: local.nota_lancada_por || row.nota_lancada_por,
        enviar_para_mg: local.enviar_para_mg != null ? local.enviar_para_mg : row.enviar_para_mg,
        enviar_para_mg_em: local.enviar_para_mg_em || row.enviar_para_mg_em,
        enviar_para_mg_por: local.enviar_para_mg_por || row.enviar_para_mg_por,
        carga_recebida_mg: local.carga_recebida_mg != null ? local.carga_recebida_mg : row.carga_recebida_mg,
        carga_recebida_mg_em: local.carga_recebida_mg_em || row.carga_recebida_mg_em,
        carga_recebida_mg_por: local.carga_recebida_mg_por || row.carga_recebida_mg_por,
        quantidade_total_bipada: local.quantidade_total_bipada != null ? local.quantidade_total_bipada : row.quantidade_total_bipada,
        quantidade_total_xml: local.quantidade_total_xml != null ? local.quantidade_total_xml : row.quantidade_total_xml,
        itens_divergentes: local.itens_divergentes != null ? local.itens_divergentes : row.itens_divergentes
    });
}

function _terceirosRowsEstadoMesclado(rows) {
    return (Array.isArray(rows) ? rows : []).map(_terceirosRowEstadoMesclado);
}

/** 2ª aba — recebimento em aberto, sem bipagem iniciada. */
function _terceirosConsideraPendenciaRecebimento(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!row || row.id == null) return false;
    if (isTerceirosFlagSim(row.recebimento_concluido)) return false;
    if (_terceirosTemBipagemIniciada(row)) return false;
    return true;
}

/** 3ª aba — recebimento concluído, lançamento fiscal ainda pendente (sem bipagem em andamento). */
function _terceirosConsideraFornecedorRecebido(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!row || row.id == null) return false;
    if (!isTerceirosFlagSim(row.recebimento_concluido)) return false;
    if (isTerceirosFlagSim(row.nota_lancada)) return false;
    if (_terceirosConsideraHistorico(row)) return false;
    if (_terceirosConsideraNotasLancadas(row)) return false;
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

/** 4ª aba — bipagem em andamento sem recebimento concluído (lançamento ainda pendente). */
function _terceirosConsideraPendenteLancamento(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!row || row.id == null) return false;
    if (isTerceirosFlagSim(row.nota_lancada)) return false;
    if (isTerceirosFlagSim(row.recebimento_concluido)) return false;
    return _terceirosTemBipagemIniciada(row);
}

/** Uma NF só pode estar numa aba do fluxo (2ª → 8ª / histórico). */
function _terceirosEtapaExclusivaDoRow(row) {
    row = _terceirosRowEstadoMesclado(row);
    if (!row || row.id == null) return '';
    if (_terceirosConsideraPendenciaRecebimento(row)) return 'pendencia-recebimento';
    if (_terceirosConsideraPendenteLancamento(row)) return 'pendentes-lancamento';
    if (_terceirosConsideraFornecedorRecebido(row)) return 'fornecedores-recebidos';
    if (_terceirosConsideraHistorico(row)) return 'historico';
    if (_terceirosConsideraNotasLancadas(row)) return 'notas-lancadas';
    if (_terceirosUsaFluxoMg(row) && isTerceirosFlagSim(row.carga_recebida_mg) && !isTerceirosFlagSim(row.nota_lancada)) {
        return 'notas-enviadas-mg';
    }
    if (_terceirosUsaFluxoMg(row) && isTerceirosFlagSim(row.enviar_para_mg)) return 'recebimentos-mg';
    if (_terceirosUsaFluxoMg(row) && !isTerceirosFlagSim(row.enviar_para_mg) && !isTerceirosFlagNao(row.enviar_para_mg)) {
        return 'pendencias-mg';
    }
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

/** Na 2ª aba: fecha descarga e leva à 3ª somente quando o recebimento foi marcado como concluído. */
function _terceirosFecharDescargaSeForaDaPendencia(documentoIdOpt) {
    if (_terceirosTabAtual !== 'pendencia-recebimento') return;
    var docId = documentoIdOpt != null ? Number(documentoIdOpt) : _terceirosDocumentoIdAtualParaApi();
    if (!Number.isFinite(docId) || docId <= 0) return;
    var detalhe = document.getElementById('ter-recebimento-detalhe');
    if (!detalhe || detalhe.style.display === 'none') return;

    var rowLike = {
        recebimento_concluido: _terceirosDocAtual && _terceirosDocAtual.recebimento_concluido
    };
    if (_terceirosConsideraPendenciaRecebimento(rowLike)) return;

    resetTerceirosDetalhe();
    definirDestaqueLinhaTerceirosDoc(docId);
    terceirosAplicarPainelAbaSomenteUi('fornecedores-recebidos');
    void loadTerceirosFornecedoresRecebidos();
}

function _terceirosFecharDescargaSeDocumentoNaoNaListaPendencia(rowsPendencia) {
    var docId = _terceirosDocumentoIdAtualParaApi();
    if (docId == null) return;
    var naLista = (Array.isArray(rowsPendencia) ? rowsPendencia : []).some(function(r) {
        return r && String(r.id) === String(docId);
    });
    if (!naLista) _terceirosFecharDescargaSeForaDaPendencia(docId);
}

function getTerceirosRowsPorEtapa(rows, etapa) {
    rows = _terceirosRowsEstadoMesclado(rows);
    if (etapa === 'historico') {
        return rows.filter(function(row) {
            return _terceirosConsideraHistorico(row);
        });
    }
    return rows.filter(function(row) {
        return _terceirosEtapaExclusivaDoRow(row) === etapa;
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

async function atualizarAlertasTerceirosHeaderAposMudancaRecebimento() {
    try {
        var data = await fetchTerceirosDocumentosTodos();
        var rows = data && Array.isArray(data.rows) ? data.rows : [];
        void atualizarAlertasTerceirosHeader(_terceirosMesclarRecebidosLocaisNasRows(rows));
    } catch (e) {
        console.error(e);
    }
}

/** Após excluir NF: remove caches locais para não reaparecer linha fantasma nas abas. */
function _terceirosRemoverDocumentoDosCachesLocais(documentoId) {
    if (documentoId == null || documentoId === '') return;
    var id = String(documentoId);
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
    var cache = window._terceirosPendenciaRowsCache;
    if (!Array.isArray(cache)) {
        void loadTerceirosDocumentos();
        return;
    }
    var tipo = window._terceirosPendenciaFiltroTipo || 'todos';
    var dataLivre = window._terceirosPendenciaFiltroDataLivre || '';
    var filtradas = filtrarRowsPendenciaPorPrevisao(cache, tipo, dataLivre);
    atualizarUiBotoesFiltroPrevisaoPendencia();
    if (!cache.length) {
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

async function abrirDanfeNotaFiscalTerceiros(documentoId) {
    documentoId = parseInt(documentoId, 10);
    if (!Number.isFinite(documentoId) || documentoId <= 0) {
        showMessage('Não foi possível identificar a nota.', 'warning');
        return;
    }
    var url = API_BASE + '/terceiros/documentos/' + encodeURIComponent(documentoId) + '/danfe';
    showMessage('Gerando DANFE a partir do XML (Meu Danfe)...', 'info');
    try {
        var resp = await fetch(url, { credentials: 'same-origin' });
        var contentType = (resp.headers.get('content-type') || '').toLowerCase();
        if (!resp.ok) {
            var errMsg = await resp.text();
            showMessage((errMsg || 'Erro ao gerar PDF da NF.').trim(), 'error');
            return;
        }
        if (contentType.indexOf('application/pdf') >= 0) {
            var blob = await resp.blob();
            var blobUrl = URL.createObjectURL(blob);
            var janela = window.open(blobUrl, '_blank', 'noopener,noreferrer');
            if (!janela) {
                showMessage('Permita pop-ups para visualizar o PDF da nota fiscal.', 'warning');
            } else {
                setTimeout(function() {
                    try { URL.revokeObjectURL(blobUrl); } catch (e) { /* ignore */ }
                }, 120000);
            }
            return;
        }
        var html = await resp.text();
        var janelaHtml = window.open('', '_blank', 'noopener,noreferrer');
        if (!janelaHtml) {
            showMessage('Permita pop-ups para visualizar o DANFE.', 'warning');
            return;
        }
        janelaHtml.document.open();
        janelaHtml.document.write(html);
        janelaHtml.document.close();
    } catch (e) {
        showMessage('Erro ao gerar DANFE: ' + (e && e.message ? e.message : String(e)), 'error');
    }
}

function baixarXmlNotaFiscalTerceiros(documentoId) {
    documentoId = parseInt(documentoId, 10);
    if (!Number.isFinite(documentoId) || documentoId <= 0) {
        showMessage('Não foi possível identificar a nota.', 'warning');
        return;
    }
    var url = API_BASE + '/terceiros/documentos/' + encodeURIComponent(documentoId) + '/xml';
    var link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    if (opcoes.motoristaPlacaPrefix) {
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
    return '<td>' + renderTerceirosStatusComUsuario(textoResumoNotaLancadaTerceiros(row), row.nota_lancada_por || '', row.nota_lancada_em || '') + '</td>';
}

function renderTerceirosCelulaEnviarMgFluxo(row, etapa) {
    if (etapa === 'pendencia') return renderTerceirosCelulaIndisponivelFluxo();
    if (etapa === 'notas-lancadas') {
        if (_terceirosConsideraNotasLancadas(row) && _terceirosUsaFluxoMg(row)) {
            return '<td><select class="ter-select-inline" data-ter-enviar-mg-lanc-doc="' + escapeHtml(String(row.id)) + '" data-ter-motorista-obrigatorio="' + escapeHtml(isTerceirosMotoristaObrigatorio(row) ? 'sim' : 'nao') + '" data-ter-motorista-atual="' + escapeHtml(row.motorista_carreta || '') + '">'
                + '<option value="">Selecione</option>'
                + '<option value="sim">Sim — enviar para MG</option>'
                + '<option value="nao"' + (isTerceirosFlagNao(row.enviar_para_mg) ? ' selected' : '') + '>Não — não enviar</option>'
            + '</select>' + renderTerceirosUsuarioMeta(row.enviar_para_mg_por || '', row.enviar_para_mg_em || '') + '</td>';
        }
        return '<td>' + renderTerceirosStatusComUsuario(textoResumoEnviarMgTerceiros(row), row.enviar_para_mg_por || '', row.enviar_para_mg_em || '')
            + '<div class="ter-status-meta">Etapa atual: <strong>' + escapeHtml(_terceirosLabelEtapaAtual(row)) + '</strong></div></td>';
    }
    if (etapa === 'pendencias-mg') {
        if (isTerceirosFlagSim(row.enviar_para_mg)) {
            return '<td>' + renderTerceirosStatusComUsuario(textoResumoEnviarMgTerceiros(row), row.enviar_para_mg_por || '', row.enviar_para_mg_em || '') + '</td>';
        }
        return '<td><select class="ter-select-inline" data-ter-enviar-mg-pend-doc="' + escapeHtml(String(row.id)) + '" data-ter-motorista-obrigatorio="' + escapeHtml(isTerceirosMotoristaObrigatorio(row) ? 'sim' : 'nao') + '" data-ter-motorista-atual="' + escapeHtml(row.motorista_carreta || '') + '">'
            + '<option value="">Selecione</option>'
            + '<option value="sim">Sim</option>'
            + '<option value="nao"' + (isTerceirosFlagNao(row.enviar_para_mg) ? ' selected' : '') + '>Não</option>'
        + '</select>' + renderTerceirosUsuarioMeta(row.enviar_para_mg_por || '', row.enviar_para_mg_em || '') + '</td>';
    }
    if (etapa === 'recebimentos-mg' || etapa === 'notas-enviadas-mg' || etapa === 'historico') {
        var textoMg = etapa === 'historico' ? textoResumoEnviarMgHistorico(row) : textoResumoEnviarMgTerceiros(row);
        return '<td>' + renderTerceirosStatusComUsuario(textoMg, row.enviar_para_mg_por || '', row.enviar_para_mg_em || '') + '</td>';
    }
    return '<td>' + renderTerceirosEnviarMgSomenteLeitura(row) + '</td>';
}

function renderTerceirosCelulaRecebidaMgFluxo(row, etapa) {
    if (etapa === 'pendencia' || etapa === 'fornecedores' || etapa === 'pendentes-lancamento') {
        return renderTerceirosCelulaIndisponivelFluxo();
    }
    if (etapa === 'notas-lancadas') {
        return renderTerceirosConclusaoCarretaTab5(row);
    }
    if (etapa === 'pendencias-mg') {
        return '<td>' + renderTerceirosRecebidaMgSomenteLeitura(row) + '</td>';
    }
    if (etapa === 'recebimentos-mg') {
        return '<td><select class="ter-select-inline" data-ter-recebida-mg-receb-doc="' + escapeHtml(String(row.id)) + '" data-ter-motorista-obrigatorio="' + escapeHtml(isTerceirosMotoristaObrigatorio(row) ? 'sim' : 'nao') + '" data-ter-motorista-atual="' + escapeHtml(row.motorista_carreta || '') + '">'
            + '<option value="">Selecione</option>'
            + '<option value="sim"' + (isTerceirosFlagSim(row.carga_recebida_mg) ? ' selected' : '') + '>Sim</option>'
            + '<option value="nao"' + (isTerceirosFlagNao(row.carga_recebida_mg) && !isTerceirosFlagSim(row.carga_recebida_mg) ? ' selected' : '') + '>Não</option>'
        + '</select>' + renderTerceirosUsuarioMeta(row.carga_recebida_mg_por || '', row.carga_recebida_mg_em || '') + '</td>';
    }
    var textoRec = etapa === 'historico' ? textoResumoRecebidaMgHistorico(row) : textoResumoRecebidaMgTerceiros(row);
    return '<td>' + renderTerceirosStatusComUsuario(textoRec, row.carga_recebida_mg_por || '', row.carga_recebida_mg_em || '') + '</td>';
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
    var concluido = isTerceirosFlagSim(row.recebimento_concluido);
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

var TERCEIROS_COLS_LISTA_FLUXO = 14;
var TERCEIROS_COLS_LISTA_POS_RECEBIMENTO = TERCEIROS_COLS_LISTA_FLUXO;

function renderTerceirosFornecedorRecebidoRowHtml(row) {
    return '<tr data-ter-doc-id="' + escapeHtml(String(row.id)) + '">'
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

function renderTerceirosConferenciaResumoHtml(row) {
    var resumo = row.resumo || {};
    var totalXml = parseFloat(row.quantidade_total_xml != null ? row.quantidade_total_xml : resumo.quantidade_total_xml) || 0;
    var totalBip = parseFloat(row.quantidade_total_bipada != null ? row.quantidade_total_bipada : resumo.quantidade_total_bipada) || 0;
    var divergentes = parseInt(row.itens_divergentes != null ? row.itens_divergentes : resumo.itens_com_pendencia, 10) || 0;
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
        var id = secao === 'bipagem' ? 'ter-bipagem-bloco' : 'ter-descarga-conferencia-modelo';
        var el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

function _terceirosErroDescargaCancelada(err) {
    return !!(err && (err.name === 'AbortError' || String(err.message || '').toLowerCase() === 'cancelado'));
}

async function abrirPendenciaTerceirosComScroll(area, documentoId, secao, opcoes) {
    opcoes = opcoes || {};
    if (!window._terceirosDetalheOrigemTab) {
        window._terceirosDetalheOrigemTab = 'pendencia-recebimento';
    }
    var comModal = opcoes.modalLoading !== false;
    if (comModal) abrirModalCarregandoDescargaTerceiros(opcoes.mensagemLoading || 'Abrindo nota fiscal e preparando descarga…');
    try {
        if (terceirosDescargaFoiCancelado()) throw new Error('cancelado');
        abrirAbaTerceirosSeDiferente('pendencia-recebimento');
        if (terceirosDescargaFoiCancelado()) throw new Error('cancelado');
        scrollTerceirosRecebimentoDetalheSecao(secao);
        if (terceirosDescargaFoiCancelado()) throw new Error('cancelado');
        await loadTerceirosDocumentoDetalhe(area, documentoId, { descargaLoad: comModal });
        if (terceirosDescargaFoiCancelado()) throw new Error('cancelado');
        scrollTerceirosRecebimentoDetalheSecao(secao);
    } catch (err) {
        if (_terceirosErroDescargaCancelada(err) || terceirosDescargaFoiCancelado()) return;
        throw err;
    } finally {
        if (comModal) fecharModalCarregandoDescargaTerceiros();
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
    tbody.addEventListener('click', function(ev) {
        var el = ev.target;
        if (!el || typeof el.closest !== 'function') return;
        var excluir = el.closest('[data-ter-excluir-doc]');
        if (excluir && tbody.contains(excluir)) {
            ev.preventDefault();
            void (async function() {
                var id = terceirosIdDocumentoDeAtributo(excluir.getAttribute('data-ter-excluir-doc'));
                var nf = excluir.getAttribute('data-ter-excluir-nf') || 'NF não identificada';
                if (!Number.isFinite(id)) {
                    showMessage('Não foi possível identificar a nota. Recarregue a lista.', 'warning');
                    return;
                }
                var confirmou = await abrirModalExcluirDocumento({ id: id, nf: nf });
                if (!confirmou) {
                    showMessage('Exclusão cancelada.', 'warning');
                    return;
                }
                await excluirDocumentoTerceiros(id);
            })();
            return;
        }
        var desc = el.closest('[data-ter-descarregar-pend]');
        if (desc && tbody.contains(desc)) {
            var idD = terceirosIdDocumentoDeAtributo(desc.getAttribute('data-ter-descarregar-pend'));
            var areaD = desc.getAttribute('data-ter-area') || 'recebimento';
            if (!Number.isFinite(idD)) {
                showMessage('Não foi possível identificar a nota. Recarregue a lista.', 'warning');
                return;
            }
            window._terceirosDetalheOrigemTab = 'pendencia-recebimento';
            var btnDesc = desc;
            btnDesc.disabled = true;
            void abrirPendenciaTerceirosComScroll(areaD, idD, 'bipagem', { modalLoading: true }).then(function() {
                btnDesc.disabled = false;
            }).catch(function(err) {
                if (_terceirosErroDescargaCancelada(err) || terceirosDescargaFoiCancelado()) {
                    btnDesc.disabled = false;
                    return;
                }
                console.error(err);
                showMessage('Erro ao abrir a nota.', 'error');
                btnDesc.disabled = false;
            });
            return;
        }
        var det = el.closest('[data-ter-ver-detalhe-pend]');
        if (det && tbody.contains(det)) {
            var idV = terceirosIdDocumentoDeAtributo(det.getAttribute('data-ter-ver-detalhe-pend'));
            var areaV = det.getAttribute('data-ter-area') || 'recebimento';
            if (!Number.isFinite(idV)) {
                showMessage('Não foi possível identificar a nota. Recarregue a lista.', 'warning');
                return;
            }
            window._terceirosDetalheOrigemTab = 'pendencia-recebimento';
            void abrirPendenciaTerceirosComScroll(areaV, idV, 'resumo').catch(function(err) {
                console.error(err);
                showMessage('Erro ao abrir a nota.', 'error');
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
            if (tabDestino === 'pendencia-recebimento') {
                abrirAbaTerceirosSeDiferente('pendencia-recebimento');
                void loadTerceirosDocumentoDetalhe(area, id).then(function() {
                    scrollTerceirosRecebimentoDetalheSecao('resumo');
                });
            } else {
                void abrirPendenciaTerceirosComScroll(area, id, 'resumo', { modalLoading: false });
            }
        });
    });
}

function bindTerceirosExcluirButtons(seletor) {
    document.querySelectorAll(seletor).forEach(function(btn) {
        if (btn.dataset.terExcluirBound === '1') return;
        btn.dataset.terExcluirBound = '1';
        btn.addEventListener('click', async function() {
            var id = parseInt(
                btn.getAttribute('data-ter-excluir-doc')
                || btn.getAttribute('data-ter-excluir-fornecedor-doc')
                || btn.getAttribute('data-ter-excluir-pend-lanc-doc')
                || btn.getAttribute('data-ter-excluir-lancada-doc')
                || btn.getAttribute('data-ter-excluir-enviada-doc')
                || btn.getAttribute('data-ter-excluir-receb-mg-doc')
                || btn.getAttribute('data-ter-excluir-pendencia-doc')
                || btn.getAttribute('data-ter-excluir-historico-doc')
                || '0',
                10
            );
            var nf = btn.getAttribute('data-ter-excluir-nf') || 'NF não identificada';
            if (!id) return;
            var confirmou = await abrirModalExcluirDocumento({ id: id, nf: nf });
            if (!confirmou) {
                showMessage('Exclusão cancelada.', 'warning');
                return;
            }
            await excluirDocumentoTerceiros(id);
        });
    });
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
    } catch (e) {
        console.error('loadTerceirosDocumentos:', e);
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading" style="color:#c62828;">Erro ao carregar a lista. Atualize a página ou tente novamente.</td></tr>';
    }
}

async function loadTerceirosFornecedoresRecebidos(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-fornecedores-recebidos');
    if (!tbody) return;
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    void atualizarAlertasTerceirosHeader(_terceirosMesclarRecebidosLocaisNasRows(data.rows || []));
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">' + escapeHtml(data.erro) + '</td></tr>';
        _terceirosDestacarDocIdAposCarga = null;
        return;
    }
    const rows = getTerceirosRowsPorEtapa(data.rows, 'fornecedores-recebidos');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF nesta etapa. Aparecem aqui após <strong>recebimento concluído</strong>, antes do lançamento fiscal (aba 4). Com <strong>bipagem em andamento</strong> sem concluir recebimento, use a aba <strong>NFs pendentes de lançamento</strong>.</td></tr>';
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
    removerDocumentoDaPendenciaRecebimentoLocal(documentoId);
    if (documentoAtualizado) {
        documentoAtualizado.recebimento_concluido = 'Sim';
        inserirDocumentoFornecedoresRecebidosLocal(documentoAtualizado);
    } else if (documentoId != null) {
        _terceirosGuardarFornecedorRecebidoLocal({ id: documentoId, recebimento_concluido: 'Sim' });
    }
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
    setTimeout(function() {
        void atualizarAlertasTerceirosHeader();
    }, 600);
}

async function loadTerceirosPendentesLancamento(dataPreloaded) {
    var tbodyMg = document.getElementById('ter-tbody-pendentes-lancamento-mg');
    var tbodySp = document.getElementById('ter-tbody-pendentes-lancamento-sp');
    var tbodyOutras = document.getElementById('ter-tbody-pendentes-lancamento-outras');
    if (!tbodyMg || !tbodySp) return;
    var cols = TERCEIROS_COLS_LISTA_FLUXO;
    var msgErro = function(erro) {
        var html = '<tr><td colspan="' + cols + '" class="loading">' + escapeHtml(erro) + '</td></tr>';
        tbodyMg.innerHTML = html;
        tbodySp.innerHTML = html;
        if (tbodyOutras) tbodyOutras.innerHTML = html;
    };
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbodyMg, cols);
    if (data.erro) {
        msgErro(data.erro);
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
        var msgGeral = 'Nenhuma NF aguardando lançamento fiscal. As notas entram aqui quando aparecem em <strong>Fornecedores recebidos</strong> com <strong>Nota lançada</strong> ainda sem marcar como Sim.';
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
}

function renderTerceirosNotasLancadasRowHtml(row) {
    var ativa = _terceirosConsideraNotasLancadas(row);
    var trClass = ativa ? '' : ' class="ter-nota-lanc-row-arquivo"';
    return '<tr data-ter-doc-id="' + escapeHtml(String(row.id)) + '"' + trClass + '>'
        + renderTerceirosCelulasNfAtePrevisao(row, { motoristaPlacaPrefix: ativa ? 'lanc' : null, avisoMotoristaNaPrevisao: ativa })
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
            atualizarStatusTerceirosDireto(id, 'enviar_para_mg', valor, {
                motorista_obrigatorio: select.getAttribute('data-ter-motorista-obrigatorio') === 'sim',
                motorista_atual: select.getAttribute('data-ter-motorista-atual') || ''
            }).finally(function() {
                delete window._terceirosEnviarMgLancEmAndamento[id];
                if (select.isConnected) select.disabled = false;
            });
        });
    });
}

async function loadTerceirosNotasLancadas(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-notas-lancadas');
    if (!tbody) return;
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">' + escapeHtml(data.erro) + '</td></tr>';
        return;
    }
    const rows = getTerceirosRowsNotasLancadasComHistorico(data.rows);
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF lançada ainda.</td></tr>';
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
    aplicarDestaqueLinhaTerceirosDoc(tbody);
}

async function loadTerceirosNotasEnviadasMg(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-notas-enviadas-mg');
    if (!tbody) return;
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">' + escapeHtml(data.erro) + '</td></tr>';
        return;
    }
    const rows = getTerceirosRowsPorEtapa(data.rows, 'notas-enviadas-mg');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF nesta etapa. Com <strong>Lançada</strong>, <strong>Enviar MG</strong> e <strong>Recebida MG</strong> = Sim, a nota vai para o <strong>Histórico</strong> (e continua em Notas lançadas).</td></tr>';
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
}

async function loadTerceirosRecebimentosMg(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-recebimentos-mg');
    if (!tbody) return;
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">' + escapeHtml(data.erro) + '</td></tr>';
        return;
    }
    const rows = getTerceirosRowsPorEtapa(data.rows, 'recebimentos-mg');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF aguardando confirmação de recebimento em MG. As notas entram aqui após marcar <strong>Enviar MG</strong> como Sim na aba Pendência Envio MG.</td></tr>';
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
    tbody.querySelectorAll('[data-ter-recebida-mg-receb-doc]').forEach(function(select) {
        select.addEventListener('change', function() {
            var id = parseInt(select.getAttribute('data-ter-recebida-mg-receb-doc') || '0', 10);
            var motoristaObrigatorio = select.getAttribute('data-ter-motorista-obrigatorio') === 'sim';
            var motoristaAtual = select.getAttribute('data-ter-motorista-atual') || '';
            if (id && select.value) atualizarStatusTerceirosDireto(id, 'carga_recebida_mg', select.value, {
                motorista_obrigatorio: motoristaObrigatorio,
                motorista_atual: motoristaAtual
            });
        });
    });
    aplicarDestaqueLinhaTerceirosDoc(tbody);
}

async function loadTerceirosPendenciasMg(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-pendencias-mg');
    if (!tbody) return;
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">' + escapeHtml(data.erro) + '</td></tr>';
        return;
    }
    const rows = getTerceirosRowsPorEtapa(data.rows, 'pendencias-mg');

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF aguardando <strong>Enviar MG</strong>. As notas entram aqui após o lançamento fiscal na aba Notas Fiscais Lançadas.</td></tr>';
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
            var promessa;
            if (valor === 'sim' && inputMot && inputPla) {
                var motVal = inputMot.value.trim();
                var plaVal = inputPla.value.trim();
                if (motVal || plaVal) {
                    opcoesStatus.motorista_atual = motVal || motoristaAtual;
                    promessa = salvarMotoristaPlacaTerceirosDireto(id, motVal, plaVal).then(function() {
                        return atualizarStatusTerceirosDireto(id, 'enviar_para_mg', valor, opcoesStatus);
                    });
                } else {
                    promessa = atualizarStatusTerceirosDireto(id, 'enviar_para_mg', valor, opcoesStatus);
                }
            } else {
                promessa = atualizarStatusTerceirosDireto(id, 'enviar_para_mg', valor, opcoesStatus);
            }
            promessa.finally(function() {
                delete window._terceirosEnviarMgPendEmAndamento[id];
                if (select.isConnected) select.disabled = false;
            });
        });
    });
    bindTerceirosSalvarMotoristaPlacaLista(tbody, 'pend-mg');
    aplicarDestaqueLinhaTerceirosDoc(tbody);
}

async function loadTerceirosHistorico(dataPreloaded) {
    var tbody = document.getElementById('ter-tbody-historico');
    if (!tbody) return;
    const data = await _terceirosResolverDadosLista(dataPreloaded, tbody, TERCEIROS_COLS_LISTA_FLUXO);
    if (data.erro) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">' + escapeHtml(data.erro) + '</td></tr>';
        return;
    }
    var rowsMerged = _terceirosMesclarRecebidosLocaisNasRows(data.rows || []);
    var rows = rowsMerged.filter(function(row) {
        return _terceirosConsideraHistorico(row);
    });

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="' + TERCEIROS_COLS_LISTA_FLUXO + '" class="loading">Nenhuma NF no histórico. <strong>Carreta:</strong> após concluir na aba Notas lançadas. <strong>Demais rotas:</strong> após <strong>Enviar MG</strong> = Não (sem envio) ou fluxo MG concluído.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(function(row) {
        return '<tr data-ter-doc-id="' + escapeHtml(String(row.id)) + '">'
            + renderTerceirosCelulasNfAtePrevisao(row)
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
}

/**
 * Recarrega todas as tabelas do módulo Terceiros (ex.: após excluir NF em qualquer aba).
 * Mantém a sub-aba ativa só na UI; os dados de todas as listas ficam alinhados ao servidor.
 */
async function recarregarTodasListasTerceiros() {
    invalidateTerceirosListaCache();
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
                cols = 14;
            }
            tbodyAtivo.innerHTML = '<tr><td colspan="' + cols + '" class="loading" style="color:#c62828;">Erro ao carregar os dados desta aba.</td></tr>';
        }
        showMessage('Erro ao carregar dados do módulo de terceiros.', 'error');
    }
}

async function excluirDocumentoTerceiros(documentoId) {
    var resp = await fetchAPI('/terceiros/documentos/' + encodeURIComponent(documentoId), {
        method: 'DELETE'
    });
    _terceirosExcluirDocumentoAtual = null;
    if (!resp || !resp.ok) {
        showMessage((resp && resp.erro) || 'Erro ao excluir NF.', 'error');
        return;
    }
    _terceirosRemoverDocumentoDosCachesLocais(documentoId);
    var idNum = Number(documentoId);
    if (Number.isFinite(idNum) && Number(_terceirosDestacarDocIdAposCarga) === idNum) {
        _terceirosDestacarDocIdAposCarga = null;
    }
    var atualNum = Number(_terceirosDocAtual.id);
    if (Number.isFinite(idNum) && Number.isFinite(atualNum) && idNum === atualNum) {
        resetTerceirosDetalhe();
    }
    await recarregarTodasListasTerceiros();
    showMessage((resp && resp.mensagem) || 'NF excluída com sucesso.', 'success');
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
        if (_terceirosDocAtual && String(_terceirosDocAtual.id) === String(documentoId)) {
            Object.assign(_terceirosDocAtual, resp.documento);
        }
    }
    if (campo === 'nota_lancada' && isTerceirosFlagSim(valor)) {
        await _terceirosAposConfirmarNotaLancadaSim(documentoId, resp && resp.documento);
        return;
    }
    if (campo === 'enviar_para_mg' && isTerceirosFlagSim(valor)) {
        await _terceirosAposConfirmarEnviarMgSim(documentoId, resp && resp.documento);
        return;
    }
    if (campo === 'enviar_para_mg' && isTerceirosFlagNao(valor)) {
        await _terceirosAposConfirmarEnviarMgNao(documentoId, resp && resp.documento);
        return;
    }
    if (campo === 'carga_recebida_mg' && isTerceirosFlagSim(valor) && opcoes.forcar_fluxo_carreta) {
        await _terceirosAposConcluirCarretaNoHistorico(documentoId, resp && resp.documento);
        return;
    }
    if (campo === 'carga_recebida_mg' && isTerceirosFlagSim(valor)) {
        await _terceirosAposConfirmarRecebidaMgSim(documentoId, resp && resp.documento);
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
    return salvarMotoristaPlacaTerceirosDireto(documentoId, motorista, null);
}

async function salvarMotoristaPlacaTerceirosDireto(documentoId, motorista, placa) {
    if (!documentoId) return;
    if (!_terceirosPodeEditarMotoristaPlaca()) {
        showMessage('Motorista e placa só podem ser alterados nas abas Enviar XML e Pendências envio MG.', 'warning');
        return;
    }
    motorista = (motorista != null ? String(motorista) : '').trim();
    if (placa != null) placa = String(placa).trim().toUpperCase();
    if (!motorista) {
        showMessage('Digite o motorista da carreta.', 'warning');
        return;
    }
    var body = { motorista: motorista };
    if (placa != null) body.placa = placa;
    var resp = await fetchAPI('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/motorista', {
        method: 'POST',
        body: JSON.stringify(body)
    });
    if (!resp || !resp.ok) {
        showMessage((resp && resp.erro) || 'Erro ao salvar motorista e placa.', 'error');
        return;
    }
    if (_terceirosDocAtual.id === documentoId) {
        await loadTerceirosDocumentoDetalhe(_terceirosDocAtual.area, documentoId);
    }
    await refreshTerceirosViews();
    showMessage(placa != null ? 'Motorista e placa salvos.' : 'Motorista salvo.', 'success');
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
    var w = window.open('', '_blank');
    if (!w) {
        showMessage('Permita pop-ups para imprimir o comprovante.', 'warning');
        return;
    }
    w.document.write(html);
    w.document.close();
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
    var w = window.open('', '_blank');
    if (!w) {
        showMessage('Permita pop-ups para imprimir o comprovante.', 'warning');
        return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    try {
        w.print();
    } catch (e) { /* ignore */ }
}

async function gerarComprovanteTerceirosDocumento(documentoId, area, btn) {
    var label = btn ? (btn.textContent || 'Gerar comprovante') : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Gerando...';
    }
    try {
        var doc = await fetchAPIComTimeout('/terceiros/documentos/' + encodeURIComponent(documentoId), {}, 55000);
        if (!doc || doc.erro) {
            showMessage((doc && doc.erro) || 'Erro ao carregar NF para comprovante.', 'error');
            return;
        }
        imprimirComprovanteDescargaTerceirosDoc(doc);
    } catch (e) {
        console.error(e);
        showMessage('Erro ao gerar comprovante.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = label || 'Gerar comprovante';
        }
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

async function loadTerceirosDocumentoDetalhe(area, documentoId, opcoes) {
    opcoes = opcoes || {};
    if (area !== 'expedicao' && area !== 'carreta') area = 'recebimento';
    var idAlvo = parseInt(documentoId, 10);
    if (isNaN(idAlvo)) return;
    if (terceirosDescargaFoiCancelado()) return;

    var seq = (window._terceirosDetalheCargaSeq = (window._terceirosDetalheCargaSeq || 0) + 1);
    var docAnterior = _terceirosDocAtual.id;
    var mudouDocumento = docAnterior == null || Number(docAnterior) !== idAlvo;

    const prefixo = getTerceirosPrefixo();
    const vazio = document.getElementById('ter-recebimento-detalhe-vazio');
    const detalhe = document.getElementById('ter-recebimento-detalhe');
    const tbody = document.getElementById('ter-tbody-recebimento-itens');

    if (mudouDocumento) {
        // Painel visível + loading antes do flush (muitas chamadas à API) para o clique não parecer morto.
        if (vazio) vazio.style.display = 'none';
        if (detalhe) detalhe.style.display = 'block';
        var btnVoltarListaLoad = document.getElementById('btn-ter-voltar-lista-nf');
        if (btnVoltarListaLoad) btnVoltarListaLoad.style.display = 'inline-block';
        var idAntNum = docAnterior != null && docAnterior !== '' ? Number(docAnterior) : NaN;
        var vaiFlush = Number.isFinite(idAntNum) && idAntNum > 0;
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="12" class="loading">' + (vaiFlush
                ? 'Salvando bipagens pendentes…'
                : 'Carregando detalhe…') + '</td></tr>';
        }
        if (vaiFlush) {
            try {
                await _flushTerceirosPendingDocumento(idAntNum);
            } catch (e) {
                if (_terceirosErroDescargaCancelada(e)) throw e;
                console.error(e);
            }
            if (terceirosDescargaFoiCancelado()) return;
            if (tbody && seq === window._terceirosDetalheCargaSeq) {
                tbody.innerHTML = '<tr><td colspan="12" class="loading">Carregando detalhe…</td></tr>';
            }
        }
        _limparPendenciasBipagemTerceiros();
    }

    if (terceirosDescargaFoiCancelado()) return;

    var doc;
    var fetchOpts = {};
    var sigDescarga = opcoes.descargaLoad ? terceirosDescargaAbortSignal() : null;
    if (sigDescarga) fetchOpts.signal = sigDescarga;
    try {
        doc = await fetchAPIComTimeout('/terceiros/documentos/' + encodeURIComponent(idAlvo), fetchOpts, 55000);
    } catch (err) {
        if (_terceirosErroDescargaCancelada(err)) throw err;
        console.error(err);
        doc = null;
    }
    if (seq !== window._terceirosDetalheCargaSeq || terceirosDescargaFoiCancelado()) return;

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
    var hidId = document.getElementById('ter-rec-documento-id');
    if (hidId) hidId.value = doc.id != null ? String(doc.id) : '';
    if (vazio) vazio.style.display = 'none';
    if (detalhe) detalhe.style.display = 'block';
    var btnVoltarLista = document.getElementById('btn-ter-voltar-lista-nf');
    if (btnVoltarLista) btnVoltarLista.style.display = 'inline-block';
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
    if (elOrigem) {
        if ((doc.area || '') === 'carreta') {
            elOrigem.style.display = 'inline-block';
            elOrigem.textContent = 'Carreta';
            elOrigem.className = 'ter-origem-badge ter-origem-badge--carreta';
        } else {
            elOrigem.style.display = 'none';
            elOrigem.textContent = '';
            elOrigem.className = 'ter-origem-badge';
        }
    }
    preencherMetaTerceiros(prefixo, 'concluido-meta', doc.recebimento_concluido ? 'Concluído' : '', doc.recebimento_concluido_por || '', doc.recebimento_concluido_em || '');
    atualizarBotaoConclusaoTerceiros(prefixo, doc.recebimento_concluido);

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
    if (!confirm('Finalizar descarga? O recebimento será marcado como concluído. Itens ainda pendentes de bipagem permanecem com status pendente.')) return;
    var fin = document.getElementById('btn-ter-finalizar-descarga');
    if (fin) {
        fin.disabled = true;
        fin.dataset.terFinDescLabel = fin.dataset.terFinDescLabel || fin.textContent || '';
        fin.textContent = 'A guardar…';
    }
    try {
        await concluirRecebimentoTerceirosPelaDescarga(fin);
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
    if (doc.nota_lancada == null) doc.nota_lancada = (_terceirosDocAtual && _terceirosDocAtual.nota_lancada) || 'nao';
    if (doc.enviar_para_mg == null) doc.enviar_para_mg = (_terceirosDocAtual && _terceirosDocAtual.enviar_para_mg) || 'nao';
    if (doc.carga_recebida_mg == null) doc.carga_recebida_mg = (_terceirosDocAtual && _terceirosDocAtual.carga_recebida_mg) || 'nao';

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
    if (!opcoes._confirmacaoRecebimento) {
        var escolhaPre = await abrirModalConfirmarRecebimentoFornecedores();
        if (!escolhaPre) return;
        opcoes._confirmacaoRecebimento = true;
        opcoes.irFornecedores = escolhaPre === 'ir';
    }
    var irParaFornecedores = opcoes.irFornecedores !== false;
    _terceirosPrepararBotaoRecebimentoSalvando(fin);
    if (_terceirosRecebimentoConcluindo) {
        showMessage('Conclusão de recebimento em curso. Aguarde.', 'warning');
        return;
    }
    _terceirosRecebimentoConcluindo = true;
    try {
        _terceirosLogFluxoRecebimento('DESCARGA 1 ANTES POST /status (gravar antes de fechar / F5)');
        var resp = await _postRecebimentoConcluidoTerceirosDireto(documentoId, 25000);
        _terceirosLogFluxoRecebimento('DESCARGA 2 DEPOIS POST /status');
        if (!_terceirosRespostaApiOk(resp)) {
            showMessage((resp && resp.erro) || 'Não foi possível gravar o recebimento no servidor. Tente de novo.', 'error');
            return;
        }
        var documentoAtualizado = _terceirosMontarDocumentoRecebidoLocal(documentoId, resp.documento);
        _terceirosDocAtual = Object.assign({}, _terceirosDocAtual || {}, documentoAtualizado);
        await _terceirosAplicarUiAposRecebimentoConcluido(documentoId, documentoAtualizado, irParaFornecedores);
    } finally {
        _terceirosLogFluxoRecebimento('DESCARGA FINALLY executou');
        _terceirosRecebimentoConcluindo = false;
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
    } finally {
        if (btn && !isTerceirosFlagSim(_terceirosDocAtual.recebimento_concluido) && btn.textContent === 'A guardar…') {
            btn.disabled = false;
            btn.textContent = btn.dataset.terFinDescLabel || 'Recebimento concluído';
        }
    }
}

async function atualizarStatusTerceiros(area, campo, valor, opcoes) {
    var prefixo = getTerceirosPrefixo();
    var btnConcluir = document.getElementById('btn-' + prefixo + '-concluir');
    var pedidoConclusaoRecebimento = campo === 'recebimento_concluido' && String(valor).toLowerCase() === 'sim';
    var irParaFornecedoresAposConcluir = true;
    var watchdogConcluir = null;
    if (pedidoConclusaoRecebimento) {
        if (_terceirosRecebimentoConcluindo) {
            showMessage('Conclusão de recebimento em curso. Aguarde.', 'warning');
            return;
        }
        if (isTerceirosFlagSim(_terceirosDocAtual.recebimento_concluido)) {
            return;
        }
        var escolhaReceb = await abrirModalConfirmarRecebimentoFornecedores();
        if (!escolhaReceb) return;
        irParaFornecedoresAposConcluir = escolhaReceb === 'ir';
    }
    var restaurarBotaoConcluir = null;
    if (pedidoConclusaoRecebimento && btnConcluir && !isTerceirosFlagSim(_terceirosDocAtual.recebimento_concluido)) {
        var txtAntesConcluir = btnConcluir.textContent;
        var disAntesConcluir = btnConcluir.disabled;
        btnConcluir.disabled = true;
        btnConcluir.textContent = 'A guardar…';
        watchdogConcluir = window.setTimeout(function() {
            console.error('[terceiros recebimento concluído] WATCHDOG: fluxo ainda pendente após 15s. Verifique o último PASSO no console e a requisição Pending no Network.');
            if (btnConcluir && btnConcluir.textContent === 'A guardar…') {
                atualizarBotaoConclusaoTerceiros(prefixo, isTerceirosFlagSim(_terceirosDocAtual.recebimento_concluido));
            }
        }, 15000);
        restaurarBotaoConcluir = function() {
            btnConcluir.disabled = disAntesConcluir;
            btnConcluir.textContent = txtAntesConcluir;
        };
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
        if (pedidoConclusaoRecebimento) {
            _terceirosRecebimentoConcluindo = true;
        }
        try {
            try {
                if (pedidoConclusaoRecebimento) {
                    _terceirosLogFluxoRecebimento('PASSO 1 pausar flush; NÃO bloquear POST /status');
                    try {
                        var pFlushBg = window._terceirosBipagemPending;
                        if (pFlushBg) {
                            Object.keys(pFlushBg.addTimers || {}).forEach(function(k) {
                                clearTimeout(pFlushBg.addTimers[k]);
                            });
                            Object.keys(pFlushBg.removeTimers || {}).forEach(function(k) {
                                clearTimeout(pFlushBg.removeTimers[k]);
                            });
                            pFlushBg.addTimers = {};
                            pFlushBg.removeTimers = {};
                        }
                    } catch (eBg0) {
                        console.error(eBg0);
                    }
                    _terceirosLogFluxoRecebimento('PASSO 2 seguindo direto para POST /status');
                } else {
                    await _flushTerceirosPendingDocumentoComLimiteTempo(documentoId, 8000);
                }
            } catch (e) {
                console.error(e);
                if (pedidoConclusaoRecebimento) {
                    showMessage(
                        e && e.message === 'TERCEIROS_FLUSH_TOTAL_TIMEOUT'
                            ? 'Demorou demais a guardar bipagens (limite 2 min). Atualize a página e tente «Recebimento concluído» de novo.'
                            : 'Não foi possível sincronizar a bipagem antes de concluir. Verifique a ligação e tente de novo.',
                        'error'
                    );
                    return;
                }
            }
            opcoes = opcoes || {};
            var payload = {
                campo: campo,
                valor: valor,
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
            if (pedidoConclusaoRecebimento) {
                _terceirosLogFluxoRecebimento('PASSO 3 ANTES await POST /status');
            }
            var resp = await fetchAPIComTimeout('/terceiros/documentos/' + encodeURIComponent(documentoId) + '/status', {
                method: 'POST',
                body: JSON.stringify(payload),
                keepalive: false
            }, pedidoConclusaoRecebimento ? 12000 : 35000);
            if (pedidoConclusaoRecebimento) {
                _terceirosLogFluxoRecebimento('PASSO 4 DEPOIS await POST /status');
            }
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
                restaurarBotaoConcluir = null;
                _terceirosDocAtual.recebimento_concluido = 'Sim';
                try {
                    _terceirosLogFluxoRecebimento('PASSO 5 movimento local após conclusão');
                    var documentoAtualizado = resp && resp.documento ? resp.documento : null;
                    try {
                        void _flushTerceirosPendingDocumentoComLimiteTempo(documentoId, 3000).catch(function(eBg) {
                            console.error(eBg);
                        });
                    } catch (eBg1) {
                        console.error(eBg1);
                    }
                    await _terceirosAplicarUiAposRecebimentoConcluido(documentoId, documentoAtualizado, irParaFornecedoresAposConcluir);
                    _terceirosLogFluxoRecebimento('PASSO 7 fluxo conclusão finalizado');
                } finally {
                    _terceirosLogFluxoRecebimento('FINALLY INTERNO conclusão executou');
                }
                return;
            }
            if (campo === 'nota_lancada' && isTerceirosFlagSim(valor)) {
                await _terceirosAposConfirmarNotaLancadaSim(documentoId, resp && resp.documento);
                return;
            }
            if (campo === 'enviar_para_mg' && isTerceirosFlagSim(valor)) {
                await _terceirosAposConfirmarEnviarMgSim(documentoId, resp && resp.documento);
                return;
            }
            if (campo === 'enviar_para_mg' && isTerceirosFlagNao(valor)) {
                await _terceirosAposConfirmarEnviarMgNao(documentoId, resp && resp.documento);
                return;
            }
            if (campo === 'carga_recebida_mg' && isTerceirosFlagSim(valor) && opcoes.forcar_fluxo_carreta) {
                await _terceirosAposConcluirCarretaNoHistorico(documentoId, resp && resp.documento);
                return;
            }
            if (campo === 'carga_recebida_mg' && isTerceirosFlagSim(valor)) {
                await _terceirosAposConfirmarRecebidaMgSim(documentoId, resp && resp.documento);
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
    } finally {
        if (pedidoConclusaoRecebimento) {
            _terceirosLogFluxoRecebimento('FINALLY EXTERNO atualizarStatusTerceiros executou');
        }
        if (watchdogConcluir) {
            window.clearTimeout(watchdogConcluir);
        }
        if (restaurarBotaoConcluir) restaurarBotaoConcluir();
        if (pedidoConclusaoRecebimento && btnConcluir && btnConcluir.textContent === 'A guardar…') {
            atualizarBotaoConclusaoTerceiros(prefixo, isTerceirosFlagSim(_terceirosDocAtual.recebimento_concluido));
        }
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
        if (modalTerExcluir && e.target === modalTerExcluir) {
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
        if (el && text) {
            text.textContent = msg || 'Puxando roteiro/viagem da API Ravex...';
            if (box) box.classList.remove('ravex-loading-box--error');
            if (barTrack) barTrack.style.display = '';
            if (errorActions) errorActions.style.display = 'none';
            el.style.display = 'flex';
        }
    }
    function ravexLoadingHide() {
        var el = document.getElementById('ravex-loading-overlay');
        var box = document.getElementById('ravex-loading-box');
        var barTrack = document.getElementById('ravex-loading-bar-track');
        var errorActions = document.getElementById('ravex-error-actions');
        if (el) el.style.display = 'none';
        if (box) box.classList.remove('ravex-loading-box--error');
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
            ravexLoadingShow('Puxando roteiros da API Ravex... Aguarde.');
            try {
                const r = await fetch(API_BASE + '/ravex/sincronizar-periodo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data_inicio: dataInicio, data_fim: dataFim })
                });
                const data = await r.json().catch(function() { return {}; });
                if (r.ok && data.ok) {
                    showRavexModalConcluido('Sincronização concluída. Viagens processadas: <strong>' + (data.viagens_processadas || 0) + '</strong>. Total de itens gravados: <strong>' + (data.total_itens || 0) + '</strong>. Viagens listadas no período: ' + (data.viagens_listadas || 0) + (data.erros && data.erros.length ? '. Erros em algumas viagens: ' + data.erros.length : '') + '.');
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
                resultadoImportarRavex.style.background = '#ffebee';
                resultadoImportarRavex.style.border = '1px solid #f44336';
                var errMsg = 'Erro de rede: ' + (e.message || 'Não foi possível conectar');
                resultadoImportarRavex.innerHTML = errMsg;
                ravexErrorShow(errMsg);
            }
            resultadoImportarRavex.style.display = 'block';
            resultadoImportarRavex.style.display = 'block';
            btnImportarRavex.disabled = false;
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
            ravexLoadingShow('Puxando roteiro/viagem da API Ravex...');
            try {
                const r = await fetch(API_BASE + '/ravex/importar-romaneio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: idUnico.trim() })
                });
                const data = await r.json().catch(function() { return {}; });
                if (r.ok && data.ok) {
                    showRavexModalConcluido('Importado. ID viagem: <strong>' + (data.id_viagem || '') + '</strong>. Total de itens: <strong>' + (data.total_itens || 0) + '</strong>.');
                    loadAllData();
                    ravexLoadingHide();
                } else {
                    resultadoImportarRavex.style.background = '#ffebee';
                    resultadoImportarRavex.style.border = '1px solid #f44336';
                    var msg = 'Erro: ' + (data.erro || r.statusText || 'Falha ao importar');
                    if (data.diagnostico) msg += ' ' + data.diagnostico;
                    resultadoImportarRavex.innerHTML = msg;
                    ravexErrorShow(msg);
                }
            } catch (e) {
                resultadoImportarRavex.style.background = '#ffebee';
                resultadoImportarRavex.style.border = '1px solid #f44336';
                var msg = 'Erro de rede: ' + (e.message || 'Não foi possível conectar');
                resultadoImportarRavex.innerHTML = msg;
                ravexErrorShow(msg);
            }
            resultadoImportarRavex.style.display = 'block';
            resultadoImportarRavex.style.display = 'block';
            btnImportarRavexIdUnico.disabled = false;
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
            ravexLoadingShow('Puxando ' + ids.length + ' roteiro(s)/viagem(ns) da API Ravex... Aguarde.');
            try {
                const r = await fetch(API_BASE + '/ravex/importar-lista', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: ids })
                });
                const data = await r.json().catch(function() { return {}; });
                if (r.ok && data.ok) {
                    showRavexModalConcluido('Lista processada. Viagens importadas: <strong>' + (data.viagens_processadas || 0) + '</strong>. Total de itens: <strong>' + (data.total_itens || 0) + '</strong>. IDs na lista: ' + (data.ids_recebidos || 0) + (data.erros && data.erros.length ? '. Erros: ' + data.erros.length : '') + '.');
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
            } catch (e) {
                resultadoImportarRavex.style.background = '#ffebee';
                resultadoImportarRavex.style.border = '1px solid #f44336';
                var msg = 'Erro de rede: ' + (e.message || 'Não foi possível conectar');
                resultadoImportarRavex.innerHTML = msg;
                ravexErrorShow(msg);
            }
            resultadoImportarRavex.style.display = 'block';
            btnImportarRavexLista.disabled = false;
        });
    }

    // Buscar produto automaticamente quando código de barras for digitado
    const codigoInput = document.getElementById('codigo-barras');
    if (codigoInput) {
        let timeoutBusca;
        // Criar variável global para rastrear último código buscado
        window.ultimoCodigoBuscado = '';
        
        codigoInput.addEventListener('input', (e) => {
            const codigo = e.target.value.trim();
            
            // Limpar timeout anterior
            clearTimeout(timeoutBusca);
            
            // Resposta rápida: delay mínimo para bipar direto (leitor envia rápido)
            if (codigo.length >= 3 && codigo !== window.ultimoCodigoBuscado) {
                timeoutBusca = setTimeout(() => {
                    window.ultimoCodigoBuscado = codigo;
                    buscarProdutoNaPlanilha(codigo);
                }, 60);
            }
        });
        
        // Buscar quando perder o foco (blur) — não bipar se o foco foi para um botão (ex.: Tirar 1) para não adicionar de novo
        codigoInput.addEventListener('blur', (e) => {
            var dest = e.relatedTarget;
            if (dest && (dest.tagName === 'BUTTON' || dest.type === 'submit' || (dest.getAttribute && dest.getAttribute('onclick')))) return;
            setTimeout(function() {
                var active = document.activeElement;
                if (active && (active.tagName === 'BUTTON' || active.type === 'submit' || (active.getAttribute && active.getAttribute('onclick')))) return;
                const codigo = (e.target && e.target.value) ? e.target.value.trim() : '';
                if (codigo.length >= 3 && codigo !== window.ultimoCodigoBuscado) {
                    window.ultimoCodigoBuscado = codigo;
                    buscarProdutoNaPlanilha(codigo);
                }
            }, 0);
        });
        
        // Enter (ou bip do leitor): atualizar tabela na hora (qtd +1), depois bipar em background
        codigoInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(timeoutBusca);
                const codigo = (e.target.value || '').trim();
                if (codigo.length > 0) {
                    window.ultimoCodigoBuscado = codigo;
                    var qtdForm = parseInt(document.getElementById('quantidade') && document.getElementById('quantidade').value, 10);
                    var qtdEnter = (typeof qtdForm === 'number' && !isNaN(qtdForm) && qtdForm >= 1 && qtdForm <= 99999) ? qtdForm : 1;
                    var atualizouEnter = atualizarQuantidadeBipadaNaTabela(codigo, qtdEnter, '');
                    if (atualizouEnter) atualizarEstatisticasOtimista(qtdEnter, false);
                    if (!window._pendingEnterUpdates) window._pendingEnterUpdates = [];
                    window._pendingEnterUpdates.push({ codigo: codigo, qtd: qtdEnter, updated: !!atualizouEnter });
                    e.target.value = '';
                    focarCampoCodigoBarras();
                    buscarProdutoNaPlanilha(codigo);
                }
            }
        });
        
        // Buscar quando colar código (Ctrl+V)
        codigoInput.addEventListener('paste', (e) => {
            setTimeout(() => {
                const codigo = e.target.value.trim();
                if (codigo.length >= 3) {
                    window.ultimoCodigoBuscado = codigo;
                    e.target.value = '';
                    buscarProdutoNaPlanilha(codigo);
                }
            }, 50);
        });
    }
    
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

    function bindCampoBipagemDev(elId) {
        var codigoInput = document.getElementById(elId);
        if (!codigoInput) return;
        var timeoutBusca;
        codigoInput.addEventListener('input', function(e) {
            var codigo = e.target.value.trim();
            clearTimeout(timeoutBusca);
            if (codigo.length >= 3 && codigo !== window.ultimoCodigoBuscado) {
                timeoutBusca = setTimeout(function() {
                    window.ultimoCodigoBuscado = codigo;
                    buscarProdutoNaPlanilha(codigo);
                }, 60);
            }
        });
        codigoInput.addEventListener('blur', function(e) {
            var dest = e.relatedTarget;
            if (dest && (dest.tagName === 'BUTTON' || dest.type === 'submit' || (dest.getAttribute && dest.getAttribute('onclick')))) return;
            setTimeout(function() {
                var active = document.activeElement;
                if (active && (active.tagName === 'BUTTON' || active.type === 'submit' || (active.getAttribute && active.getAttribute('onclick')))) return;
                var codigo = (e.target && e.target.value) ? e.target.value.trim() : '';
                if (codigo.length >= 3 && codigo !== window.ultimoCodigoBuscado) {
                    window.ultimoCodigoBuscado = codigo;
                    buscarProdutoNaPlanilha(codigo);
                }
            }, 0);
        });
        codigoInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(timeoutBusca);
                var codigo = (e.target.value || '').trim();
                if (codigo.length > 0) {
                    window.ultimoCodigoBuscado = codigo;
                    var qEl = window._elBipagem('quantidade');
                    var qtdForm = parseInt(qEl && qEl.value, 10);
                    var qtdEnter = (typeof qtdForm === 'number' && !isNaN(qtdForm) && qtdForm >= 1 && qtdForm <= 99999) ? qtdForm : 1;
                    var atualizouEnter = atualizarQuantidadeBipadaNaTabela(codigo, qtdEnter, '');
                    if (atualizouEnter) atualizarEstatisticasOtimista(qtdEnter, false);
                    if (!window._pendingEnterUpdates) window._pendingEnterUpdates = [];
                    window._pendingEnterUpdates.push({ codigo: codigo, qtd: qtdEnter, updated: !!atualizouEnter });
                    e.target.value = '';
                    focarCampoCodigoBarras();
                    buscarProdutoNaPlanilha(codigo);
                }
            }
        });
        codigoInput.addEventListener('paste', function(e) {
            setTimeout(function() {
                var codigo = e.target.value.trim();
                if (codigo.length >= 3) {
                    window.ultimoCodigoBuscado = codigo;
                    e.target.value = '';
                    buscarProdutoNaPlanilha(codigo);
                }
            }, 50);
        });
    }
    bindCampoBipagemDev('dev-codigo-barras');

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

// Buscar produto na planilha Excel. quantidadeParaAdicionarOpcional: se passado, usa essa qtd no add; skipAtualizarTabelaOpcional: true = não chama atualizarQuantidadeBipadaNaTabela (já atualizado na UI).
async function buscarProdutoNaPlanilha(codigoBarras, quantidadeParaAdicionarOpcional, skipAtualizarTabelaOpcional) {
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
                window.bipagemEmAndamento = window.bipagemEmAndamento.then(function() { return addProduto(true, override); }).catch(function() {});
                // Não aguardar o POST terminar: permite bipar o próximo item sem travar
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
                window.bipagemEmAndamento = window.bipagemEmAndamento.then(function() { return addProduto(false, overrideNaoEncontrado); }).catch(function() {});
                // Não aguardar o POST terminar: permite bipar o próximo item sem travar
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
        const response = await fetch(`${API_BASE}${endpoint}`, {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...(isWrite && typeof options.keepalive === 'undefined' ? { keepalive: true } : {}),
            ...(method === 'POST' && typeof options.priority === 'undefined' ? { priority: 'high' } : {}),
            ...options
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
            return { ok: false, erro: 'Tempo esgotado ao contactar o servidor.', _timeout: true };
        }
        console.error('Erro na API:', error);
        showMessage('Erro ao conectar com o servidor', 'error');
        return null;
    }
}

// Carregar Estatísticas (usado após bip, etc.)
async function loadEstatisticas() {
    const stats = await fetchAPI('/estatisticas');
    if (stats) paintEstatisticas(stats);
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

// Um único request: painel inteiro (estatísticas + viagens + gráficos) = carregamento instantâneo na rede
async function loadPainelCompleto() {
    const data = await fetchAPI('/painel-completo');
    if (!data) return;
    if (data.estatisticas) paintEstatisticas(data.estatisticas);
    if (data.erro) showMessage('Painel: ' + data.erro, 'error');
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
                    <td>${escapeHtml(v.inicio || '-')}</td>
                    <td>${escapeHtml(v.fim || '-')}</td>
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
    const [data, extras] = await Promise.all([
        fetchAPI('/painel-graficos'),
        fetchAPI('/painel-graficos-extras')
    ]);
    if (!data || !data.viagens) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading">Nenhuma viagem com bipagem ainda.</td></tr>';
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
                    <td>${escapeHtml(v.inicio || '-')}</td>
                    <td>${escapeHtml(v.fim || '-')}</td>
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
}

// Carregar BASE da Planilha (todas as colunas, com filtros)
// Não usa overlay full-screen para permitir trocar de aba enquanto carrega; loading só na área da tabela.
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
        const data = await fetchAPI(url);

        if (!thead || !tbody) return;

        if (data && data.headers && Array.isArray(data.headers)) {
            var dataHeaders = data.headers.filter(function(h) { return h !== '_id'; });
            thead.innerHTML = '<tr>' + dataHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '<th>Ações</th></tr>';
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
            tbody.innerHTML = '<tr><td class="loading">' + (data && data.erro ? escapeHtml(data.erro) : 'Erro ao carregar dados. Configure DATABASE_URL para usar as tabelas.') + '</td></tr>';
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
        return '<div class="form-group" style="margin-bottom: 0.5rem;"><label for="' + id + '">' + escapeHtml(h) + '</label><input type="text" id="' + id + '" name="' + escapeHtml(h) + '" value="' + escapeHtml(val) + '" style="width: 100%; max-width: 100%;"></div>';
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
    if (!dadosOverride) {
        atualizarQuantidadeBipadaNaTabela(codigoBarras, quantidade, codigoProdutoParaTabela);
        atualizarEstatisticasOtimista(quantidade, false);
        var qEl = window._elBipagem('quantidade');
        if (qEl) qEl.value = 1;
    }
    var hidV = window._elBipagem('id-viagem-hidden');
    if (hidV) hidV.value = idViagem;
    if (window.ultimoCodigoBuscado) window.ultimoCodigoBuscado = '';
    focarCampoCodigoBarras();

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
        document.getElementById('modal-produto-nao-cadastrado').style.display = 'block';
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
function atualizarQuantidadeBipadaNaTabela(codigoBarras, quantidade, codigoProdutoOpcional) {
    const tbody = document.getElementById(window._fluxoBipagemAtivo === 'devolucao' ? 'dev-tbody-conferencia' : 'tbody-conferencia');
    if (!tbody || (!codigoBarras && !codigoProdutoOpcional)) return false;
    const rows = tbody.querySelectorAll('tr');
    const delta = parseInt(quantidade, 10) || 0;
    const codigoBarrasStr = (codigoBarras || '').toString().trim();
    const codigoProdutoStr = (codigoProdutoOpcional || '').toString().trim();
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.cells || row.cells.length < 12) continue;
        const dataCodigo = (row.getAttribute && row.getAttribute('data-codigo')) || '';
        const cellCodigoBarras = row.cells[2];
        const cellCodigoProduto = row.cells[3];
        const codigoBarrasLinha = (cellCodigoBarras && cellCodigoBarras.textContent) ? (cellCodigoBarras.textContent || '').trim() : '';
        const codigoProdutoLinha = (cellCodigoProduto && cellCodigoProduto.textContent) ? (cellCodigoProduto.textContent || '').trim() : '';
        const match = (codigoProdutoStr && (codigoProdutoLinha === codigoProdutoStr || dataCodigo === codigoProdutoStr)) || (codigoBarrasStr && codigoBarrasLinha === codigoBarrasStr);
        if (!match) continue;
        const cellQtdBipada = row.cells[9];
        const cellQtdFalta = row.cells[10];
        const cellAviso = row.cells[8];
        const cellStatus = row.cells[0];
        const cellQtdProduto = row.cells[5];
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
        if (cellAviso && qtdProduto > 0) {
            const sobra = novaQtdBipada - qtdProduto;
            if (sobra > 0) {
                cellAviso.textContent = 'Bipou ' + sobra + ' a mais';
                cellAviso.style.color = '#d32f2f';
                cellAviso.style.fontWeight = 'bold';
            } else {
                cellAviso.textContent = '';
                cellAviso.style.color = '';
                cellAviso.style.fontWeight = '';
            }
        }
        if (cellStatus && row.classList) {
            if (novaQtdBipada > 0 && qtdProduto > 0 && novaQtdBipada > qtdProduto) {
                row.classList.remove('row-completo', 'row-pendente', 'row-parcial');
                row.classList.add('row-excedente');
                cellStatus.innerHTML = '<span class="status-badge status-EXCEDENTE">📦 EXCEDENTE</span>';
            } else if (novaQtdFalta <= 0 && novaQtdBipada > 0) {
                row.classList.remove('row-excedente', 'row-pendente', 'row-parcial');
                row.classList.add('row-completo');
                cellStatus.innerHTML = '<span class="status-badge status-OK">✅ COMPLETO</span>';
            }
        }
        if (novaQtdBipada > 0 && codigoBarrasLinha && codigoBarrasLinha !== '-') {
            const cellAcao = row.cells[11];
            if (cellAcao) {
                const div = cellAcao.querySelector('div');
                const codigoEsc = (codigoBarrasLinha || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const btnTirar1 = '<button type="button" class="btn btn-secondary" onclick="tirarBipado(\'' + codigoEsc + '\', 1)" style="padding: 4px 8px; font-size: 11px;" title="Remover 1 unidade bipada">➖ Tirar 1</button>';
                const btnTirarTudo = '<button type="button" class="btn btn-secondary" onclick="tirarBipado(\'' + codigoEsc + '\', \'tudo\')" style="padding: 4px 8px; font-size: 11px;" title="Remover todas as unidades bipadas deste item">🗑️ Tirar tudo</button>';
                if (div && !div.querySelector('button[onclick*="tirarBipado"]')) {
                    div.insertAdjacentHTML('afterbegin', btnTirar1 + ' ' + btnTirarTudo);
                }
            }
        }
        // Item bipado: sempre vai para o primeiro lugar; só status COMPLETO vai para o último
        if (delta > 0) {
            var primeiro = tbody.querySelector('tr');
            if (primeiro && row !== primeiro) {
                tbody.insertBefore(row, primeiro);
            }
            if (row.classList.contains('row-completo')) {
                tbody.appendChild(row);
            }
        }
        atualizarTotaisConferenciaFromDOM();
        focarCampoCodigoBarras();
        return true;
    }
    return false;
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
        const qtdProduto = parseInt(row.cells[5] && row.cells[5].textContent ? row.cells[5].textContent.replace(/\s/g, '') : 0, 10) || 0;
        const qtdBipada = parseInt(row.cells[9] && row.cells[9].textContent ? row.cells[9].textContent.replace(/\s/g, '') : 0, 10) || 0;
        const qtdFalta = parseInt(row.cells[10] && row.cells[10].textContent ? row.cells[10].textContent.replace(/\s/g, '') : 0, 10) || 0;
        totalItens += qtdProduto;
        totalBipado += qtdBipada;
        totalFalta += qtdFalta;
        if (row.classList && row.classList.contains('row-excedente')) temExcedente = true;
    });
    elTotal.textContent = 'Total: ' + totalItens;
    elBipado.textContent = 'Bipado: ' + totalBipado;
    atualizarStatusResumoConferencia(totalItens, totalBipado, totalFalta, temExcedente, isDev ? 'devolucao' : 'carregamento');
}

function atualizarTotaisConferenciaFromData(conferenciaArray, fluxoTab) {
    fluxoTab = fluxoTab || 'carregamento';
    const isDev = fluxoTab === 'devolucao';
    const elTotal = document.getElementById(isDev ? 'dev-conferencia-total-itens' : 'conferencia-total-itens');
    const elBipado = document.getElementById(isDev ? 'dev-conferencia-total-bipado' : 'conferencia-total-bipado');
    if (!elTotal || !elBipado || !conferenciaArray || !conferenciaArray.length) {
        if (elTotal) elTotal.textContent = 'Total: 0';
        if (elBipado) elBipado.textContent = 'Bipado: 0';
        atualizarStatusResumoConferencia(0, 0, 0, false, fluxoTab);
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
    elTotal.textContent = 'Total: ' + totalItens;
    elBipado.textContent = 'Bipado: ' + totalBipado;
    atualizarStatusResumoConferencia(totalItens, totalBipado, totalFalta, temExcedente, fluxoTab);
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
    const codigoInput = document.getElementById('codigo-barras');
    if (codigoInput) codigoInput.focus();
};

// Abre o modal de cadastro do item (preenchido com dados atuais do formulário)
window.confirmarAdicionarProdutoNaoCadastrado = function() {
    const codigoBarras = document.getElementById('codigo-barras').value.trim();
    if (!codigoBarras) {
        showMessage('Digite ou escaneie o código de barras.', 'error');
        document.getElementById('codigo-barras').focus();
        return;
    }
    document.getElementById('modal-produto-nao-cadastrado').style.display = 'none';
    const produto = document.getElementById('produto-nome').value.trim();
    const quantidade = parseInt(document.getElementById('quantidade').value) || 1;
    const idViagem = document.getElementById('id-viagem-hidden').value.trim();
    const status = document.getElementById('status').value;
    document.getElementById('cadastro-item-descricao').value = produto;
    document.getElementById('cadastro-item-codigo-ean').value = codigoBarras;
    document.getElementById('cadastro-item-quantidade').value = quantidade;
    document.getElementById('cadastro-item-id-viagem').value = idViagem;
    document.getElementById('cadastro-item-status').value = status;
    document.getElementById('modal-cadastro-item').style.display = 'block';
    setTimeout(function() { document.getElementById('cadastro-item-descricao').focus(); }, 100);
};

window.fecharModalCadastroItem = function() {
    document.getElementById('modal-cadastro-item').style.display = 'none';
    const codigoInput = document.getElementById('codigo-barras');
    if (codigoInput) codigoInput.focus();
};

window.confirmarCadastroItem = function() {
    const descricao = document.getElementById('cadastro-item-descricao').value.trim();
    if (!descricao) {
        showMessage('Informe a descrição do produto', 'error');
        document.getElementById('cadastro-item-descricao').focus();
        return;
    }
    const quantidade = parseInt(document.getElementById('cadastro-item-quantidade').value) || 1;
    if (quantidade < 1) {
        showMessage('Quantidade deve ser pelo menos 1', 'error');
        return;
    }
    const codigoEan = document.getElementById('cadastro-item-codigo-ean').value.trim();
    if (!codigoEan) {
        showMessage('Informe o código EAN', 'error');
        document.getElementById('cadastro-item-codigo-ean').focus();
        return;
    }
    const docaEl = document.getElementById('doca');
    const unidadeEl = document.getElementById('cadastro-item-unidade');
    const unidade = (unidadeEl && unidadeEl.value !== undefined) ? String(unidadeEl.value).trim() : '';
    const pesoEl = document.getElementById('cadastro-item-peso');
    const peso = pesoEl ? pesoEl.value.trim() : '';
    const dados = {
        codigo_barras: codigoEan,
        produto: descricao,
        quantidade: quantidade,
        codigo_interno: document.getElementById('cadastro-item-codigo-interno').value.trim(),
        codigo_dun: document.getElementById('cadastro-item-codigo-dun').value.trim(),
        unidade: unidade,
        peso: peso,
        veiculo: '',
        status: document.getElementById('cadastro-item-status').value,
        id_viagem: document.getElementById('cadastro-item-id-viagem').value.trim(),
        doca: docaEl ? docaEl.value : ''
    };
    addProduto(true, dados);
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
        set('periodo-inicio-carregamento', data && data.inicio_carregamento);
        set('periodo-fim-carregamento', data && data.fim_carregamento);
    } catch (e) {
        const set = (id) => { const el = document.getElementById(id); if (el) el.textContent = '-'; };
        set('periodo-inicio-carregamento'); set('periodo-fim-carregamento');
    }
}

// Carregar lista de colaboradores (TRANSPORTE GRU/PPY) para sugestões do campo Motorista
let listaColaboradoresMotoristas = [];
async function loadColaboradoresMotoristas() {
    try {
        const data = await fetchAPI('/colaboradores-motoristas');
        if (data && Array.isArray(data.nomes)) {
            listaColaboradoresMotoristas = data.nomes;
            const datalist = document.getElementById('datalist-motoristas');
            if (datalist) {
                datalist.innerHTML = listaColaboradoresMotoristas.map(n => '<option value="' + String(n).replace(/"/g, '&quot;') + '">').join('');
            }
        }
    } catch (e) {
        listaColaboradoresMotoristas = [];
    }
}

// Carregar lista de placas (aba Todas as placas Coluna B ou ROMANEIO POR ITEM) para sugestões do campo Placa
let listaPlacas = [];
async function loadPlacas() {
    try {
        const data = await fetchAPI('/placas');
        if (data && Array.isArray(data.placas)) {
            listaPlacas = data.placas;
            const datalist = document.getElementById('datalist-placas');
            if (datalist) {
                datalist.innerHTML = listaPlacas.map(p => '<option value="' + String(p).replace(/"/g, '&quot;') + '">').join('');
            }
        }
    } catch (e) {
        listaPlacas = [];
    }
}

const COORDENADOR_PADRAO = 'ASTROGILDO RODRIGUES DOS SANTOS';

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
    function showOverlay(msg) {
        if (overlayEl && overlayText) {
            overlayText.textContent = msg || 'Carregando conferência... Aguarde.';
            if (overlayBox) overlayBox.classList.remove('ravex-loading-box--error');
            if (barTrack) barTrack.style.display = '';
            if (errorActions) errorActions.style.display = 'none';
            overlayEl.style.display = 'flex';
        }
    }
    function hideOverlay() {
        if (overlayEl) overlayEl.style.display = 'none';
    }
    showOverlay('Carregando conferência da base de dados (romaneio por item)... Aguarde.');
    showMessage('Buscando itens na base...', 'success');
    
    var idViagem = idInput;
    try {
        await loadConferencia(idInput);
        hideOverlay();
        idViagem = (document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value.trim()) || document.getElementById('id-viagem').value.trim() || idInput;
        loadPeriodoCarregamento(idViagem);
        loadViagemInfo(idViagem);
    } catch (e) {
        showMessage('Erro ao conectar. Tente novamente.', 'error');
        if (overlayEl && overlayText) {
            overlayText.textContent = 'Erro: ' + (e.message || 'Não foi possível carregar');
            if (overlayBox) overlayBox.classList.add('ravex-loading-box--error');
            if (barTrack) barTrack.style.display = 'none';
            if (errorActions) errorActions.style.display = 'block';
            var okBtn = document.getElementById('ravex-overlay-ok');
            if (okBtn) okBtn.onclick = function() { hideOverlay(); };
        }
    } finally {
        hideOverlay();
    }
    
    document.getElementById('id-viagem-hidden').value = idViagem;
    document.getElementById('id-viagem').value = idViagem;
    
    var formBip = document.getElementById('form-bipagem-container');
    if (formBip) formBip.classList.remove('conferencia-blocos-bloqueado');
    var bloco4Wrap = document.getElementById('conferencia-bloco-4-wrapper');
    if (bloco4Wrap) bloco4Wrap.classList.remove('conferencia-blocos-bloqueado');
    var tituloWrap = document.getElementById('titulo-lista-wrapper');
    if (tituloWrap) tituloWrap.style.display = 'flex';
    document.getElementById('tabela-conferencia-container').style.display = 'block';
    const periodoBox = document.getElementById('periodo-carregamento-box');
    if (periodoBox) periodoBox.style.display = 'block';
    const btnVoltarBipar = document.getElementById('btn-voltar-bipar');
    if (btnVoltarBipar) btnVoltarBipar.style.display = 'inline-block';
    
    window.atualizarEstadoCampoBipar();
    
    loadColaboradoresMotoristas();
    loadPlacas();
    
    setTimeout(() => {
        const docaSelect = document.getElementById('doca');
        const codigoBarrasInput = document.getElementById('codigo-barras');
        const docaVal = docaSelect ? docaSelect.value.trim() : '';
        const docaOk = ['1','2','3','4'].includes(docaVal);
        if (docaSelect && !docaOk) docaSelect.focus();
        else if (codigoBarrasInput && !codigoBarrasInput.disabled) codigoBarrasInput.focus();
    }, 300);
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
    function showOverlay(msg) {
        if (overlayEl && overlayText) {
            overlayText.textContent = msg || 'Carregando devolução... Aguarde.';
            if (overlayBox) overlayBox.classList.remove('ravex-loading-box--error');
            if (barTrack) barTrack.style.display = '';
            if (errorActions) errorActions.style.display = 'none';
            overlayEl.style.display = 'flex';
        }
    }
    function hideOverlay() {
        if (overlayEl) overlayEl.style.display = 'none';
    }
    showOverlay('Carregando romaneio da viagem (contagem de devolução)... Aguarde.');
    showMessage('Buscando itens na base...', 'success');
    var idViagem = idInput;
    try {
        await loadConferencia(idInput, { fluxo: 'devolucao' });
        hideOverlay();
        idViagem = (document.getElementById('dev-id-viagem-hidden') && document.getElementById('dev-id-viagem-hidden').value.trim()) || (idInputEl && idInputEl.value.trim()) || idInput;
    } catch (e) {
        showMessage('Erro ao conectar. Tente novamente.', 'error');
        if (overlayEl && overlayText) {
            overlayText.textContent = 'Erro: ' + (e.message || 'Não foi possível carregar');
            if (overlayBox) overlayBox.classList.add('ravex-loading-box--error');
            if (barTrack) barTrack.style.display = 'none';
            if (errorActions) errorActions.style.display = 'block';
            var okBtn = document.getElementById('ravex-overlay-ok');
            if (okBtn) okBtn.onclick = function() { hideOverlay(); };
        }
    } finally {
        hideOverlay();
    }
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

// Abrir modal de aceite para zerar todos os itens
window.abrirModalZerarItens = function() {
    const idViagem = window._getIdViagemAtivo();
    if (!idViagem) {
        showMessage('Selecione uma viagem primeiro', 'error');
        return;
    }
    const modal = document.getElementById('modal-zerar-itens');
    const checkbox = document.getElementById('aceite-zerar-itens');
    const btnConfirmar = document.getElementById('btn-confirmar-zerar');
    if (checkbox) checkbox.checked = false;
    if (btnConfirmar) btnConfirmar.disabled = true;
    if (modal) modal.style.display = 'block';
};

// Fechar modal zerar itens
window.fecharModalZerarItens = function() {
    const modal = document.getElementById('modal-zerar-itens');
    if (modal) modal.style.display = 'none';
};

// Habilitar botão Confirmar quando marcar o aceite
document.addEventListener('DOMContentLoaded', function() {
    const aceite = document.getElementById('aceite-zerar-itens');
    const btnConfirmar = document.getElementById('btn-confirmar-zerar');
    if (aceite && btnConfirmar) {
        aceite.addEventListener('change', function() {
            btnConfirmar.disabled = !aceite.checked;
        });
        btnConfirmar.addEventListener('click', executarZerarItens);
    }
    // Fechar modal ao clicar fora
    const modalZerar = document.getElementById('modal-zerar-itens');
    if (modalZerar) {
        modalZerar.addEventListener('click', function(e) {
            if (e.target === modalZerar) fecharModalZerarItens();
        });
    }
});

// Modal excluir item da conferência
window.abrirModalExcluirItem = function(btn) {
    const codigo = btn.getAttribute('data-codigo') || '';
    const produto = btn.getAttribute('data-produto') || '';
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
            reloadConferenciaAtiva(idViagem);
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
async function executarZerarItens() {
    const idViagem = window._getIdViagemAtivo();
    const aceite = document.getElementById('aceite-zerar-itens');
    if (!aceite || !aceite.checked) return;
    fecharModalZerarItens();
    var fluxoQ = (window._fluxoBipagemAtivo === 'devolucao') ? '?fluxo=devolucao' : '';
    try {
        const result = await fetchAPI(`/conferencia/${encodeURIComponent(idViagem)}/zerar` + fluxoQ, {
            method: 'DELETE'
        });
        if (result && result.success) {
            showMessage(result.mensagem || 'Todos os itens foram zerados. Pode bipar novamente.', 'success');
            await reloadConferenciaAtiva(idViagem);
            await loadPeriodoCarregamento(idViagem);
            loadEstatisticas();
            var cbZ = window._elBipagem('codigo-barras');
            if (cbZ) cbZ.value = '';
            var cpZ = window._elBipagem('codigo-produto');
            if (cpZ) cpZ.value = '';
            var pnZ = window._elBipagem('produto-nome');
            if (pnZ) pnZ.value = '';
            var qZ = window._elBipagem('quantidade');
            if (qZ) qZ.value = '1';
            if (cbZ) cbZ.focus();
            if (window.ultimoCodigoBuscado) window.ultimoCodigoBuscado = '';
        } else {
            showMessage('Não foi possível zerar os itens', 'error');
        }
    } catch (error) {
        showMessage('Erro ao zerar itens', 'error');
    }
}

// Carregar Conferência (itens da viagem com status de bipado)
function agruparConferenciaPorCodigoProduto(conferencia) {
    if (!Array.isArray(conferencia) || conferencia.length === 0) return [];
    const grupos = new Map();

    conferencia.forEach(function(item, idx) {
        const codigoProduto = (item && item.codigo_produto != null) ? item.codigo_produto.toString().trim() : '';
        const codigoBarras = (item && item.codigo_barras != null) ? item.codigo_barras.toString().trim() : '';
        const chave = (codigoProduto || codigoBarras || ('__idx__' + idx)).toString();

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

        g.quantidade_produto += (parseInt(item.quantidade_produto, 10) || 0);
        g.quantidade_bipada += (parseInt(item.quantidade_bipada, 10) || 0);
    });

    return Array.from(grupos.values()).map(function(g) {
        const totalProduto = parseInt(g.quantidade_produto, 10) || 0;
        const totalBipada = parseInt(g.quantidade_bipada, 10) || 0;
        const sobra = Math.max(0, totalBipada - totalProduto);
        const falta = Math.max(0, totalProduto - totalBipada);

        // Código de barras: se houver mais de um, usa o primeiro e avisa.
        const codigos = Array.from(g._codigos_barras);
        if (codigos.length === 1) {
            g.codigo_barras = codigos[0];
        } else if (codigos.length > 1) {
            g.codigo_barras = codigos[0];
            g.aviso_sobra = '⚠️ Múltiplos códigos de barras';
        } else {
            g.codigo_barras = g.codigo_barras || '-';
        }

        g.quantidade_falta = falta;

        if (totalBipada > totalProduto) {
            g.status_bipado = 'EXCEDENTE';
            if (!g.aviso_sobra) g.aviso_sobra = 'Bipou ' + sobra + ' a mais';
            else g.aviso_sobra = g.aviso_sobra + ' — Bipou ' + sobra + ' a mais';
        } else if (totalBipada === totalProduto && totalProduto > 0) {
            g.status_bipado = 'COMPLETO';
        } else if (totalBipada > 0) {
            g.status_bipado = 'PARCIAL';
        } else {
            g.status_bipado = 'PENDENTE';
        }

        delete g._codigos_barras;
        return g;
    });
}

// Atualiza caixa "Gerar comprovante completo" (verde) vs "Gerar comprovante divergente" (laranja). Se conferenciaUI for passado, usa os dados; senão lê da tabela (DOM) para atualização imediata após Bipar/Tirar 1.
function atualizarBoxesComprovante(conferenciaUI, fluxoTab) {
    if (fluxoTab === 'devolucao') return;
    var todosCompletos = false;
    var temItens = false;
    if (conferenciaUI && Array.isArray(conferenciaUI) && conferenciaUI.length > 0) {
        temItens = true;
        todosCompletos = conferenciaUI.every(function(item) { return (item.status_bipado || '') === 'COMPLETO'; });
    } else {
        var tbody = document.getElementById('tbody-conferencia');
        if (tbody) {
            var rows = tbody.querySelectorAll('tr');
            todosCompletos = true;
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (!row.cells || row.cells.length < 11 || row.querySelector('td[colspan]')) continue;
                temItens = true;
                var qtdFalta = parseInt(row.cells[10].textContent, 10) || 0;
                var statusText = (row.cells[0].textContent || '').trim();
                if (qtdFalta !== 0 || statusText.indexOf('EXCEDENTE') >= 0) {
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
        var q = '?_=' + Date.now();
        if (isDev) q += '&fluxo=devolucao';
        const conferencia = await fetchAPI('/conferencia/' + encodeURIComponent(idViagem) + q);
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
            }
            const conferenciaUI = agruparConferenciaPorCodigoProduto(listaParaUI);
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
                tbody.innerHTML = '<tr><td colspan="12" class="loading">Nenhum item encontrado para esta viagem no romaneio.</td></tr>';
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
            tbody.innerHTML = conferenciaOrdenada.map(item => {
                const statusClass = item.status_bipado === 'COMPLETO' ? 'status-OK' : 
                                   item.status_bipado === 'EXCEDENTE' ? 'status-EXCEDENTE' : 
                                   item.status_bipado === 'PARCIAL' ? 'status-SOBRA' : 'status-FALTA';
                const statusText = item.status_bipado === 'COMPLETO' ? '✅ COMPLETO' : 
                                  item.status_bipado === 'EXCEDENTE' ? '📦 EXCEDENTE' : 
                                  item.status_bipado === 'PARCIAL' ? '⚠️ PARCIAL' : '❌ PENDENTE';
                
                const rowClass = item.status_bipado === 'COMPLETO' ? 'row-completo' : 
                                item.status_bipado === 'EXCEDENTE' ? 'row-excedente' : 
                                item.status_bipado === 'PENDENTE' ? 'row-pendente' : 'row-parcial';
                
                const produtoEscapado = (item.produto || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const codigoBarras = item.codigo_barras || '-';
                const codigoBarrasEscapado = (codigoBarras !== '-' ? codigoBarras.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '');
                const unidade = (item.unidade || '-').toString();
                const qtdBipada = item.quantidade_bipada || 0;
                const qtdProdutoItem = item.quantidade_produto || 0;
                const sobraItem = Math.max(0, (parseInt(qtdBipada, 10) || 0) - (parseInt(qtdProdutoItem, 10) || 0));
                const avisoSobra = (item.aviso_sobra && item.aviso_sobra.trim()) ? item.aviso_sobra : (sobraItem > 0 ? 'Bipou ' + sobraItem + ' a mais' : '');
                const qtdProduto = item.quantidade_produto || 0;
                const qtdFaltaParaBipar = Math.max(1, item.quantidade_falta || 0);
                const botoesTirar = qtdBipada > 0 && codigoBarras !== '-' ? `
                            <button type="button" class="btn btn-secondary" onclick="tirarBipado(this, '${codigoBarrasEscapado}', 1)" style="padding: 4px 8px; font-size: 11px;" title="Remover 1 unidade bipada">➖ Tirar 1</button>
                            <button type="button" class="btn btn-secondary" onclick="tirarBipado(this, '${codigoBarrasEscapado}', 'tudo')" style="padding: 4px 8px; font-size: 11px;" title="Remover todas as unidades bipadas deste item">🗑️ Tirar tudo</button>
                        ` : '';
                const produtoAttr = (item.produto || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                const btnExcluir = codigoBarras !== '-' ? `<button type="button" class="btn btn-secondary" onclick="abrirModalExcluirItem(this)" data-codigo="${codigoBarrasEscapado.replace(/"/g, '&quot;')}" data-produto="${produtoAttr}" style="padding: 4px 8px; font-size: 11px; color: #c62828;" title="Excluir item da conferência">🗑️ Excluir</button>` : '';
                const btnBipar = codigoBarras !== '-' ? `<button type="button" class="btn btn-primary" onclick="biparItem(this, '${codigoBarras}', '${produtoEscapado}', ${qtdFaltaParaBipar})" style="padding: 6px 12px; font-size: 12px;">📱 Bipar</button>` : (item.quantidade_falta > 0 ? '<span style="color: #ff9800;" title="Adicione o código do produto ' + (item.codigo_produto || '') + ' na aba BASE da planilha com o código de barras correspondente.">⚠️ Sem código de barras</span>' : '');
                const motivoBruto = motivosEmEdicao[idViagem + '|' + (item.codigo_produto || '')] !== undefined ? motivosEmEdicao[idViagem + '|' + (item.codigo_produto || '')] : (item.motivo_divergencia || '');
                const motivoVal = (motivoBruto || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const codigoProdutoEsc = (item.codigo_produto || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                return `
                <tr class="${rowClass}" data-codigo="${item.codigo_produto || ''}">
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td><input type="text" class="input-motivo-divergencia" data-id-viagem="${escHtml(idViagem)}" data-codigo-produto="${codigoProdutoEsc}" value="${motivoVal}" placeholder="Motivo da divergência" onblur="salvarMotivoDivergencia(this)" title="Escreva o motivo e saia do campo para salvar"></td>
                    <td><strong>${codigoBarras}</strong></td>
                    <td><strong style="color: #1976D2;">${item.codigo_produto || '-'}</strong></td>
                    <td>${item.produto || '-'}</td>
                    <td><strong>${item.quantidade_produto || 0}</strong></td>
                    <td>${unidade}</td>
                    <td>${(item.peso_bruto != null && item.peso_bruto !== '') ? item.peso_bruto : '-'}</td>
                    <td style="color: #d32f2f; font-weight: bold;">${avisoSobra}</td>
                    <td><strong style="color: ${qtdBipada > 0 ? '#4caf50' : '#666'}">${qtdBipada}</strong></td>
                    <td><strong style="color: ${item.quantidade_falta > 0 ? '#f44336' : '#4caf50'}">${item.quantidade_falta || 0}</strong></td>
                    <td style="max-width: 280px;"><div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                        ${btnBipar}
                        ${botoesTirar}
                        ${btnExcluir}
                        ${item.quantidade_falta <= 0 && item.status_bipado !== 'EXCEDENTE' ? '<span style="color: #4caf50; font-weight: bold;">✓ Completo</span>' : ''}
                        ${item.status_bipado === 'EXCEDENTE' ? '<span style="color: #e65100; font-weight: bold;">Bipado a mais</span>' : ''}
                    </div></td>
                </tr>
            `;
            }).join('');
            atualizarTotaisConferenciaFromData(conferenciaOrdenada, fluxoTab);
            // Adicionar animação de atualização
            const rows = tbody.querySelectorAll('tr');
            rows.forEach((row, index) => {
                row.style.opacity = '0';
                setTimeout(() => {
                    row.style.transition = 'opacity 0.3s';
                    row.style.opacity = '1';
                }, index * 20);
            });
            }
            var tituloWrap = L('titulo-lista-wrapper');
            var tabContainer = L('tabela-conferencia-container');
            if (tituloWrap) tituloWrap.style.display = 'flex';
            if (tabContainer) tabContainer.style.display = 'block';
            var btnZ = isDev ? document.getElementById('dev-btn-zerar-bipados') : document.getElementById('btn-voltar-bipar');
            if (btnZ) btnZ.style.display = 'inline-block';
            atualizarBoxesComprovante(conferenciaUI, fluxoTab);
            return conferencia;
        } else if (conferencia && conferencia.erro) {
            const tbodyE = L('tbody-conferencia');
            if (tbodyE) tbodyE.innerHTML = `<tr><td colspan="12" class="loading" style="color: #f44336;">Erro: ${conferencia.erro}</td></tr>`;
            showMessage(conferencia.erro, 'error');
            return undefined;
        } else {
            const tbodyE = L('tbody-conferencia');
            if (tbodyE) tbodyE.innerHTML = '<tr><td colspan="12" class="loading">Erro ao carregar dados. Verifique o ID (roteiro ou viagem) e se os dados foram importados pela aba Importar Ravex.</td></tr>';
            return undefined;
        }
    } catch (error) {
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
            showMessage(result.mensagem || n + ' unidade(s) removida(s).', 'success');
            reloadConferenciaAtiva(idViagem);
            loadPeriodoCarregamento(idViagem);
            loadEstatisticas();
        } else {
            showMessage(result && result.erro ? result.erro : 'Não foi possível remover', 'error');
            reloadConferenciaAtiva(idViagem);
        }
    }).catch(function() {
        showMessage('Erro ao remover item', 'error');
        reloadConferenciaAtiva(idViagem);
    });
}
function _flushAdd(codigoBarras) {
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
        setTimeout(function() { reloadConferenciaAtiva(idViagem); }, 400);
    }).catch(function() {
        reloadConferenciaAtiva(idViagem);
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
        if (!confirm('Remover todas as unidades bipadas deste item?')) return;
        if (cells) {
            var qtdProduto = parseInt(cells[5].textContent, 10) || 0;
            cells[9].textContent = '0';
            cells[10].textContent = String(qtdProduto);
            atualizarBoxesComprovante();
        }
        try {
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
                reloadConferenciaAtiva(idViagem);
                loadPeriodoCarregamento(idViagem);
                loadEstatisticas();
            } else {
                showMessage(result && result.erro ? result.erro : 'Não foi possível remover', 'error');
                reloadConferenciaAtiva(idViagem);
            }
        } catch (e) {
            showMessage('Erro ao remover item', 'error');
            reloadConferenciaAtiva(idViagem);
        }
        return;
    }

    if (cells) {
        var qtdBipada = parseInt(cells[9].textContent, 10) || 0;
        var qtdFalta = parseInt(cells[10].textContent, 10) || 0;
        if (qtdBipada <= 0) return;
        cells[9].textContent = String(Math.max(0, qtdBipada - 1));
        cells[10].textContent = String(qtdFalta + 1);
        atualizarBoxesComprovante();
    }
    window._conferenciaPending.removes[codigoBarras] = (window._conferenciaPending.removes[codigoBarras] || 0) + 1;
    if (window._conferenciaPending.removeTimers[codigoBarras]) clearTimeout(window._conferenciaPending.removeTimers[codigoBarras]);
    window._conferenciaPending.removeTimers[codigoBarras] = setTimeout(function() {
        _flushRemove(codigoBarras);
    }, window._conferenciaPending.DEBOUNCE_MS);
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
    if (cb) cb.value = '';
    document.getElementById(dev ? 'dev-codigo-barras' : 'codigo-barras').value = codigoBarras;
    document.getElementById(dev ? 'dev-produto-nome' : 'produto-nome').value = produto;
    document.getElementById(dev ? 'dev-quantidade' : 'quantidade').value = 1;
    var row = btn ? btn.closest('tr') : null;
    var cells = row && row.cells && row.cells.length >= 11 ? row.cells : null;
    var qtdFaltaAtual = cells ? (parseInt(cells[10].textContent, 10) || 0) : 0;
    if (qtdFaltaAtual <= 0) return;
    if (cells) {
        var qtdBipada = parseInt(cells[9].textContent, 10) || 0;
        cells[9].textContent = String(qtdBipada + 1);
        cells[10].textContent = String(qtdFaltaAtual - 1);
        atualizarBoxesComprovante();
    }
    if (!window._conferenciaPending.adds[codigoBarras]) window._conferenciaPending.adds[codigoBarras] = { qtd: 0 };
    window._conferenciaPending.adds[codigoBarras].qtd += 1;
    if (window._conferenciaPending.addTimers[codigoBarras]) clearTimeout(window._conferenciaPending.addTimers[codigoBarras]);
    window._conferenciaPending.addTimers[codigoBarras] = setTimeout(function() {
        _flushAdd(codigoBarras);
    }, window._conferenciaPending.DEBOUNCE_MS);
    if (cb) cb.focus();
}

// Gerar comprovante de carregamento (vai para aba Extrato com a viagem atual e atualiza o extrato na hora)
window.gerarComprovanteCarregamento = function() {
    const idViagem = (document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value || '').trim();
    if (!idViagem) {
        showMessage('Nenhuma viagem selecionada', 'error');
        return;
    }
    const inputExtrato = document.getElementById('extrato-id-viagem');
    const inputRelatorio = document.getElementById('relatorio-extrato-id-viagem');
    if (inputExtrato) inputExtrato.value = idViagem;
    if (inputRelatorio) inputRelatorio.value = idViagem;
    // Trocar para aba Extrato (sem usar .click() para evitar chamar loadExtrato duas vezes)
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(function(btn) { btn.classList.remove('active'); });
    tabContents.forEach(function(c) { c.classList.remove('active'); });
    const btnExtrato = document.querySelector('.tab-button[data-tab="extrato"]');
    const contentExtrato = document.getElementById('extrato');
    if (btnExtrato) btnExtrato.classList.add('active');
    if (contentExtrato) contentExtrato.classList.add('active');
    // Carregar extrato com o ID já definido (atualização imediata)
    loadExtrato(idViagem);
};

// Comprovante divergente: modal de confirmação
window.abrirModalComprovanteDivergente = function() {
    const modal = document.getElementById('modal-comprovante-divergente');
    if (modal) modal.style.display = 'block';
};

window.fecharModalComprovanteDivergente = function() {
    const modal = document.getElementById('modal-comprovante-divergente');
    if (modal) modal.style.display = 'none';
};

window.confirmarGerarComprovanteDivergente = function() {
    fecharModalComprovanteDivergente();
    gerarComprovanteCarregamento();
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
    fetchAPI('/conferencia/' + encodeURIComponent(idViagem) + '/zerar', { method: 'DELETE' }).then(function(result) {
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

// Helper: baixar relatório por URL
function downloadRelatorio(url, nomeArquivo) {
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo || 'relatorio.xlsx';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showMessage('Download do relatório iniciado.', 'success');
}

window.exportarExtratoExcel = function() {
    const idViagem = (document.getElementById('relatorio-extrato-id-viagem') && document.getElementById('relatorio-extrato-id-viagem').value || '').trim();
    if (!idViagem) {
        showMessage('Digite o ID do roteiro para exportar o extrato em Excel', 'error');
        return;
    }
    let url = API_BASE + '/relatorios/excel/extrato?id_viagem=' + encodeURIComponent(idViagem);
    url = appendParamsDataExpedicao(url);
    fetch(url).then(function(r) {
        if (!r.ok) {
            return r.json().then(function(d) { showMessage(d.erro || 'Erro ao exportar extrato', 'error'); }).catch(function() { showMessage('Erro ao exportar extrato', 'error'); });
        }
        return r.blob();
    }).then(function(blob) {
        if (!blob || blob.type.indexOf('sheet') === -1) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'extrato_roteiro_' + idViagem.replace(/[/\\]/g, '_') + '.xlsx';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showMessage('Download do extrato em Excel iniciado.', 'success');
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
    fetch(url).then(function(r) {
        if (!r.ok) {
            return r.json().then(function(d) { showMessage(d.erro || 'Erro ao exportar extrato de devolução', 'error'); }).catch(function() { showMessage('Erro ao exportar extrato de devolução', 'error'); });
        }
        return r.blob();
    }).then(function(blob) {
        if (!blob || blob.type.indexOf('sheet') === -1) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'extrato_devolucao_roteiro_' + idViagem.replace(/[/\\]/g, '_') + '.xlsx';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showMessage('Download do extrato de devolução iniciado.', 'success');
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

window.gerarRelatorioTerceirosResumoNf = function() {
    downloadRelatorio(appendParamsDataCriacaoTerceiros(API_BASE + '/terceiros/relatorios/excel/resumo_nf'), 'relatorio_terceiros_resumo_nf.xlsx');
};

window.gerarRelatorioTerceirosItensBipados = function() {
    downloadRelatorio(appendParamsDataCriacaoTerceiros(API_BASE + '/terceiros/relatorios/excel/itens_bipados'), 'relatorio_terceiros_itens_bipados.xlsx');
};

window.gerarRelatorioTerceirosItensMaisBipados = function() {
    downloadRelatorio(appendParamsDataCriacaoTerceiros(API_BASE + '/terceiros/relatorios/excel/itens_mais_bipados'), 'relatorio_terceiros_itens_mais_bipados.xlsx');
};

window.gerarRelatorioTerceirosDivergencias = function() {
    downloadRelatorio(appendParamsDataCriacaoTerceiros(API_BASE + '/terceiros/relatorios/excel/divergencias'), 'relatorio_terceiros_divergencias.xlsx');
};

window.gerarRelatorioTerceirosCarreta = function() {
    downloadRelatorio(appendParamsDataCriacaoTerceiros(API_BASE + '/terceiros/relatorios/excel/carreta'), 'relatorio_terceiros_carreta.xlsx');
};

window.exportarRelatorioTerceirosNf = function() {
    const docId = (document.getElementById('ter-relatorio-nf-id') && document.getElementById('ter-relatorio-nf-id').value || '').trim();
    if (!docId) {
        showMessage('Digite o ID da NF para exportar.', 'error');
        return;
    }
    const url = API_BASE + '/terceiros/relatorios/excel/nf?documento_id=' + encodeURIComponent(docId);
    fetch(url, { credentials: 'same-origin' }).then(function(r) {
        if (!r.ok) {
            return r.json().then(function(d) { showMessage((d && d.erro) || 'Erro ao exportar NF', 'error'); }).catch(function() { showMessage('Erro ao exportar NF', 'error'); });
        }
        return r.blob();
    }).then(function(blob) {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'relatorio_terceiros_nf_' + docId + '.xlsx';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showMessage('Download do relatório da NF iniciado.', 'success');
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

// Carregar Extrato (mesmas colunas da Conferência: status, código barras, código produto, produto, qtd produto, unidade, aviso, qtd bipada, qtd falta)
// idViagemOpcional: quando passado (ex.: ao clicar em Gerar comprovante), usa esse ID e atualiza o input
async function loadExtrato(idViagemOpcional) {
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
    const btnExcluir = document.getElementById('btn-excluir-extrato');
    const avisoDivergenteEl = document.getElementById('extrato-aviso-divergente');
    if (!idViagem) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Digite o ID do roteiro e clique em Buscar para ver o comprovante (extrato) com as informações da carga.</td></tr>';
        if (resumoEl) resumoEl.style.display = 'none';
        if (btnExcluir) btnExcluir.style.display = 'none';
        if (avisoDivergenteEl) avisoDivergenteEl.style.display = 'none';
        return;
    }
    tbody.innerHTML = '<tr><td colspan="11" class="loading">Carregando extrato...</td></tr>';
    if (resumoEl) resumoEl.style.display = 'none';
    const [extratoResp, periodo, viagemInfo] = await Promise.all([
        fetchAPI(`/conferencia/${encodeURIComponent(idViagem)}`),
        fetchAPI(`/viagem/${encodeURIComponent(idViagem)}/periodo`),
        fetchAPI(`/viagem/${encodeURIComponent(idViagem)}/info`)
    ]);
    const extrato = (extratoResp && extratoResp.lista && Array.isArray(extratoResp.lista)) ? extratoResp.lista : [];
    if (!extratoResp || extratoResp.erro || extrato.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Nenhum item encontrado para esta viagem. Bipe os itens na aba Conferência primeiro.</td></tr>';
        if (resumoEl) resumoEl.style.display = 'none';
        if (btnExcluir) btnExcluir.style.display = 'none';
        if (avisoDivergenteEl) avisoDivergenteEl.style.display = 'none';
        // Mesmo sem itens, preencher assinaturas com os dados da viagem (motorista, conferente, ajudantes)
        (function preencherAssinaturasSozinho() {
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = (val != null && String(val).trim() !== '') ? String(val).trim() : '-'; };
            const idHidden = (document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value || '').trim();
            const mesmoRoteiro = idHidden === idViagem;
            const formMotorista = mesmoRoteiro && document.getElementById('viagem-motorista') ? document.getElementById('viagem-motorista').value.trim() : '';
            const formConferente = mesmoRoteiro && document.getElementById('viagem-conferente') ? document.getElementById('viagem-conferente').value.trim() : '';
            const formAjudante1 = mesmoRoteiro && document.getElementById('viagem-ajudante1') ? document.getElementById('viagem-ajudante1').value.trim() : '';
            const formAjudante2 = mesmoRoteiro && document.getElementById('viagem-ajudante2') ? document.getElementById('viagem-ajudante2').value.trim() : '';
            set('assinatura-nome-motorista', (viagemInfo && viagemInfo.motorista && String(viagemInfo.motorista).trim()) ? viagemInfo.motorista.trim() : formMotorista);
            set('assinatura-nome-conferente', (viagemInfo && viagemInfo.conferente && String(viagemInfo.conferente).trim()) ? viagemInfo.conferente.trim() : formConferente);
            set('assinatura-nome-ajudante1', (viagemInfo && viagemInfo.ajudante1 && String(viagemInfo.ajudante1).trim()) ? viagemInfo.ajudante1.trim() : formAjudante1);
            set('assinatura-nome-ajudante2', (viagemInfo && viagemInfo.ajudante2 && String(viagemInfo.ajudante2).trim()) ? viagemInfo.ajudante2.trim() : formAjudante2);
        })();
        return;
    }
    let totalQtdBipada = 0;
    let pesoTotal = 0;
    extrato.forEach(item => {
        totalQtdBipada += parseInt(item.quantidade_bipada) || 0;
        const p = item.peso_bruto;
        if (p != null && p !== '' && p !== '-') {
            const num = parseFloat(String(p).replace(',', '.').replace(/\s/g, ''));
            if (!isNaN(num)) pesoTotal += num;
        }
    });
    if (resumoEl) {
        resumoEl.style.display = 'block';
        const totalItens = document.getElementById('extrato-total-itens');
        const totalQtdEl = document.getElementById('extrato-total-qtd');
        const pesoTotalEl = document.getElementById('extrato-peso-total');
        const idViagemDisplay = document.getElementById('extrato-id-viagem-display');
        const inicioCarreg = document.getElementById('extrato-inicio-carregamento');
        const fimCarreg = document.getElementById('extrato-fim-carregamento');
        const dataExpedicaoEl = document.getElementById('extrato-data-expedicao');
        const placaEl = document.getElementById('extrato-placa');
        const identificadorRotaEl = document.getElementById('extrato-identificador-rota');
        const motoristaEl = document.getElementById('extrato-motorista');
        if (totalItens) totalItens.textContent = extrato.length;
        if (totalQtdEl) totalQtdEl.textContent = totalQtdBipada;
        if (pesoTotalEl) pesoTotalEl.textContent = pesoTotal > 0 ? pesoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '-';
        if (idViagemDisplay) idViagemDisplay.textContent = idViagem;
        if (dataExpedicaoEl) dataExpedicaoEl.textContent = (viagemInfo && viagemInfo.data_expedicao && String(viagemInfo.data_expedicao).trim()) ? viagemInfo.data_expedicao : '-';
        if (placaEl) placaEl.textContent = (viagemInfo && viagemInfo.placa && String(viagemInfo.placa).trim()) ? viagemInfo.placa : '-';
        if (identificadorRotaEl) identificadorRotaEl.textContent = (viagemInfo && viagemInfo.identificador_rota && String(viagemInfo.identificador_rota).trim()) ? viagemInfo.identificador_rota : '-';
        if (motoristaEl) motoristaEl.textContent = (viagemInfo && viagemInfo.motorista && String(viagemInfo.motorista).trim()) ? viagemInfo.motorista : '-';
        const coordenadorEl = document.getElementById('extrato-coordenador');
        const conferenteEl = document.getElementById('extrato-conferente');
        const ajudante1El = document.getElementById('extrato-ajudante1');
        const ajudante2El = document.getElementById('extrato-ajudante2');
        if (coordenadorEl) coordenadorEl.textContent = (viagemInfo && viagemInfo.coordenador && String(viagemInfo.coordenador).trim()) ? viagemInfo.coordenador : '-';
        if (conferenteEl) conferenteEl.textContent = (viagemInfo && viagemInfo.conferente && String(viagemInfo.conferente).trim()) ? viagemInfo.conferente : '-';
        if (ajudante1El) ajudante1El.textContent = (viagemInfo && viagemInfo.ajudante1 && String(viagemInfo.ajudante1).trim()) ? viagemInfo.ajudante1 : '-';
        if (ajudante2El) ajudante2El.textContent = (viagemInfo && viagemInfo.ajudante2 && String(viagemInfo.ajudante2).trim()) ? viagemInfo.ajudante2 : '-';
        if (inicioCarreg) inicioCarreg.textContent = (periodo && periodo.inicio_carregamento) ? periodo.inicio_carregamento : '-';
        // Preencher nomes na seção de assinaturas (Extrato) — da API e, se vazio, do formulário da Conferência (mesma viagem)
        const setAssinaturaNome = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = (val != null && String(val).trim() !== '') ? String(val).trim() : '-';
        };
        const idHidden = (document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value || '').trim();
        const mesmoRoteiro = idHidden === idViagem;
        const formMotorista = mesmoRoteiro && document.getElementById('viagem-motorista') ? document.getElementById('viagem-motorista').value.trim() : '';
        const formConferente = mesmoRoteiro && document.getElementById('viagem-conferente') ? document.getElementById('viagem-conferente').value.trim() : '';
        const formAjudante1 = mesmoRoteiro && document.getElementById('viagem-ajudante1') ? document.getElementById('viagem-ajudante1').value.trim() : '';
        const formAjudante2 = mesmoRoteiro && document.getElementById('viagem-ajudante2') ? document.getElementById('viagem-ajudante2').value.trim() : '';
        const motorista = (viagemInfo && viagemInfo.motorista && String(viagemInfo.motorista).trim()) ? viagemInfo.motorista.trim() : formMotorista;
        const conferente = (viagemInfo && viagemInfo.conferente && String(viagemInfo.conferente).trim()) ? viagemInfo.conferente.trim() : formConferente;
        const ajudante1 = (viagemInfo && viagemInfo.ajudante1 && String(viagemInfo.ajudante1).trim()) ? viagemInfo.ajudante1.trim() : formAjudante1;
        const ajudante2 = (viagemInfo && viagemInfo.ajudante2 && String(viagemInfo.ajudante2).trim()) ? viagemInfo.ajudante2.trim() : formAjudante2;
        setAssinaturaNome('assinatura-nome-motorista', motorista);
        setAssinaturaNome('assinatura-nome-conferente', conferente);
        setAssinaturaNome('assinatura-nome-ajudante1', ajudante1);
        setAssinaturaNome('assinatura-nome-ajudante2', ajudante2);
        if (fimCarreg) fimCarreg.textContent = (periodo && periodo.fim_carregamento) ? periodo.fim_carregamento : '-';
    }
    if (btnExcluir) btnExcluir.style.display = 'inline-block';
    tbody.innerHTML = extrato.map(item => {
        const statusClass = item.status_bipado === 'COMPLETO' ? 'status-OK' : item.status_bipado === 'EXCEDENTE' ? 'status-EXCEDENTE' : item.status_bipado === 'PARCIAL' ? 'status-SOBRA' : 'status-FALTA';
        const statusText = item.status_bipado === 'COMPLETO' ? '✅ COMPLETO' : item.status_bipado === 'EXCEDENTE' ? '📦 EXCEDENTE' : item.status_bipado === 'PARCIAL' ? '⚠️ PARCIAL' : '❌ PENDENTE';
        const motivo = (item.motivo_divergencia || '').trim();
        return `
        <tr>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${motivo ? escHtml(motivo) : '-'}</td>
            <td><strong>${item.codigo_barras || '-'}</strong></td>
            <td><strong style="color: #1976D2;">${item.codigo_produto || '-'}</strong></td>
            <td>${item.produto || '-'}</td>
            <td><strong>${item.quantidade_produto || 0}</strong></td>
            <td>${item.unidade || '-'}</td>
            <td>${(item.peso_bruto != null && item.peso_bruto !== '') ? item.peso_bruto : '-'}</td>
            <td style="color: #d32f2f; font-weight: bold;">${item.aviso_sobra || ''}</td>
            <td><strong style="color: ${(item.quantidade_bipada || 0) > 0 ? '#4caf50' : '#666'}">${item.quantidade_bipada || 0}</strong></td>
            <td><strong style="color: ${(item.quantidade_falta || 0) > 0 ? '#f44336' : '#4caf50'}">${item.quantidade_falta || 0}</strong></td>
        </tr>
    `;
    }).join('');

    // Mostrar aviso "Comprovante divergente" quando há itens com falta ou status não completo
    const temDivergencia = extrato.some(item => (item.quantidade_falta || 0) > 0 || (item.status_bipado !== 'COMPLETO'));
    if (avisoDivergenteEl) avisoDivergenteEl.style.display = temDivergencia ? 'block' : 'none';
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
        return;
    }

    tbody.innerHTML = '<tr><td colspan="11" class="loading">Carregando extrato de devoluções...</td></tr>';
    if (resumoEl) resumoEl.style.display = 'none';

    const [extratoResp, periodo, viagemInfo] = await Promise.all([
        fetchAPI('/conferencia/' + encodeURIComponent(idViagem) + '?fluxo=devolucao'),
        fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/periodo?fluxo=devolucao'),
        fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/info')
    ]);
    const extrato = (extratoResp && extratoResp.lista && Array.isArray(extratoResp.lista)) ? extratoResp.lista : [];
    if (!extratoResp || extratoResp.erro || extrato.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Nenhum item encontrado para esta viagem no fluxo de devoluções.</td></tr>';
        if (resumoEl) resumoEl.style.display = 'none';
        return;
    }

    let totalQtdBipada = 0;
    let pesoTotal = 0;
    extrato.forEach(function(item) {
        totalQtdBipada += parseInt(item.quantidade_bipada) || 0;
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
        set('dev-extrato-total-qtd', totalQtdBipada);
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
        const statusClass = item.status_bipado === 'COMPLETO' ? 'status-OK' : item.status_bipado === 'EXCEDENTE' ? 'status-EXCEDENTE' : item.status_bipado === 'PARCIAL' ? 'status-SOBRA' : 'status-FALTA';
        const statusText = item.status_bipado === 'COMPLETO' ? '✅ COMPLETO' : item.status_bipado === 'EXCEDENTE' ? '📦 EXCEDENTE' : item.status_bipado === 'PARCIAL' ? '⚠️ PARCIAL' : '❌ PENDENTE';
        const motivo = (item.motivo_divergencia || '').trim();
        return '<tr>'
            + '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>'
            + '<td>' + (motivo ? escHtml(motivo) : '-') + '</td>'
            + '<td><strong>' + escHtml(item.codigo_barras || '-') + '</strong></td>'
            + '<td><strong style="color: #1976D2;">' + escHtml(item.codigo_produto || '-') + '</strong></td>'
            + '<td>' + escHtml(item.produto || '-') + '</td>'
            + '<td><strong>' + (item.quantidade_produto || 0) + '</strong></td>'
            + '<td>' + escHtml(item.unidade || '-') + '</td>'
            + '<td>' + ((item.peso_bruto != null && item.peso_bruto !== '') ? escHtml(item.peso_bruto) : '-') + '</td>'
            + '<td style="color: #d32f2f; font-weight: bold;">' + escHtml(item.aviso_sobra || '') + '</td>'
            + '<td><strong style="color: ' + ((item.quantidade_bipada || 0) > 0 ? '#4caf50' : '#666') + '">' + (item.quantidade_bipada || 0) + '</strong></td>'
            + '<td><strong style="color: ' + ((item.quantidade_falta || 0) > 0 ? '#f44336' : '#4caf50') + '">' + (item.quantidade_falta || 0) + '</strong></td>'
            + '</tr>';
    }).join('');
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
        const resp = await fetchAPI(url);
        if (!thead || !tbody) return;
        if (!resp || resp.erro) {
            thead.innerHTML = '<tr><th>Erro</th></tr>';
            tbody.innerHTML = '<tr><td colspan="10" class="loading">' + (resp && resp.erro ? resp.erro : 'Erro ao carregar. Configure DATABASE_URL para usar as tabelas.') + '</td></tr>';
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
    conteudoEl.innerHTML = '<p class="loading">Carregando divergências de todos os roteiros...</p>';
    let divergencias;
    try {
        divergencias = await fetchAPI('/divergencias');
    } catch (e) {
        divergenciasJaCarregado = false;
        conteudoEl.innerHTML = '<p class="loading" style="color: #c62828;">Erro ao carregar. Clique em Atualizar para tentar novamente.</p>';
        return;
    }
    if (!divergencias || divergencias.length === 0) {
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
                fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/info'),
                fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/periodo')
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
                            const statusClass = item.status_bipado === 'COMPLETO' ? 'status-OK' : item.status_bipado === 'EXCEDENTE' ? 'status-EXCEDENTE' : item.status_bipado === 'PARCIAL' ? 'status-SOBRA' : 'status-FALTA';
                            const statusText = item.status_bipado === 'COMPLETO' ? '✅ COMPLETO' : item.status_bipado === 'EXCEDENTE' ? '📦 EXCEDENTE' : item.status_bipado === 'PARCIAL' ? '⚠️ PARCIAL' : '❌ PENDENTE';
                            const qtdSobra = item.quantidade_sobra != null ? item.quantidade_sobra : 0;
                            const motivoBrutoDiv = motivosEmEdicaoDiv[idViagem + '|' + (item.codigo_produto || '')] !== undefined ? motivosEmEdicaoDiv[idViagem + '|' + (item.codigo_produto || '')] : (item.motivo_divergencia || '');
                            const motivoVal = (motivoBrutoDiv || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            const codigoProdutoEsc = (item.codigo_produto || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            return `<tr>
                                <td><input type="text" class="input-motivo-divergencia" data-id-viagem="${escHtml(idViagem)}" data-codigo-produto="${codigoProdutoEsc}" value="${motivoVal}" placeholder="Escreva o motivo" onblur="salvarMotivoDivergencia(this)" title="Escreva o motivo da divergência e saia do campo para salvar"></td>
                                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
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
        divergencias = await fetchAPI('/divergencias?fluxo=devolucao');
    } catch (e) {
        divergenciasDevolucaoJaCarregado = false;
        conteudoEl.innerHTML = '<p class="loading" style="color: #c62828;">Erro ao carregar. Clique em Atualizar para tentar novamente.</p>';
        return;
    }
    if (!divergencias || divergencias.length === 0) {
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
                fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/info'),
                fetchAPI('/viagem/' + encodeURIComponent(idViagem) + '/periodo?fluxo=devolucao')
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
                const statusClass = item.status_bipado === 'COMPLETO' ? 'status-OK' : item.status_bipado === 'EXCEDENTE' ? 'status-EXCEDENTE' : item.status_bipado === 'PARCIAL' ? 'status-SOBRA' : 'status-FALTA';
                const statusText = item.status_bipado === 'COMPLETO' ? '✅ COMPLETO' : item.status_bipado === 'EXCEDENTE' ? '📦 EXCEDENTE' : item.status_bipado === 'PARCIAL' ? '⚠️ PARCIAL' : '❌ PENDENTE';
                const qtdSobra = item.quantidade_sobra != null ? item.quantidade_sobra : 0;
                return '<tr>'
                    + '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>'
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

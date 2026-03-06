// Variáveis globais
const API_BASE = '/api';

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
    initTabs();
    initForms();
    initFiltrosBase();
    // Primeira carga após um tick para a tela pintar antes (resposta mais rápida percebida)
    setTimeout(function() { loadAllData(); }, 0);
    initEventosStream();
    var btnSair = document.getElementById('btn-sair');
    if (btnSair) {
        btnSair.addEventListener('click', function() {
            // Redireciona na hora; envia logout em segundo plano (sendBeacon não bloqueia)
            try {
                if (navigator.sendBeacon && typeof navigator.sendBeacon === 'function') {
                    navigator.sendBeacon(API_BASE + '/logout', '');
                } else {
                    fetch(API_BASE + '/logout', { method: 'POST', keepalive: true }).catch(function() {});
                }
            } catch (e) {}
            window.location.replace('/login');
        });
    }
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

    // Fallback: atualizar a cada 10 segundos se o stream falhar (reduz carga no servidor)
    setInterval(loadAllData, 10000);
});

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
        case 'divergencias':
            return loadDivergencias(false);
        default:
            return Promise.resolve();
    }
}

// Carregar todos os dados
function loadAllData() {
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

// Inicializar formulários
function initForms() {
    // Formulário de adicionar produto
    const formProduto = document.getElementById('form-produto');
    formProduto.addEventListener('submit', async (e) => {
        e.preventDefault();
        await addProduto();
    });
    
    // Formulário de editar produto
    const editForm = document.getElementById('edit-form');
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateProduto();
    });
    
    // Fechar modal ao clicar no X
    document.querySelector('.close').addEventListener('click', closeModal);
    
    // Fechar modal ao clicar fora
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('edit-modal');
        if (e.target === modal) {
            closeModal();
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
    if (btnImportarRavex && resultadoImportarRavex) {
        btnImportarRavex.addEventListener('click', async function() {
            const dataInicio = (document.getElementById('importar-ravex-data-inicio') || {}).value || '';
            const dataFim = (document.getElementById('importar-ravex-data-fim') || {}).value || '';
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
            resultadoImportarRavex.style.display = 'block';
            resultadoImportarRavex.style.background = '#e3f2fd';
            resultadoImportarRavex.style.border = '1px solid #2196f3';
            resultadoImportarRavex.innerHTML = 'Puxando roteiros da API Ravex... Aguarde.';
            try {
                const r = await fetch(API_BASE + '/ravex/sincronizar-periodo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data_inicio: dataInicio, data_fim: dataFim })
                });
                const data = await r.json().catch(function() { return {}; });
                if (r.ok && data.ok) {
                    resultadoImportarRavex.style.background = '#e8f5e9';
                    resultadoImportarRavex.style.border = '1px solid #4caf50';
                    resultadoImportarRavex.innerHTML = 'Sincronização concluída. Viagens processadas: <strong>' + (data.viagens_processadas || 0) + '</strong>. Total de itens gravados: <strong>' + (data.total_itens || 0) + '</strong>. Viagens listadas no período: ' + (data.viagens_listadas || 0) + (data.erros && data.erros.length ? '. Erros em algumas viagens: ' + data.erros.length : '') + '.';
                    loadAllData();
                } else {
                    resultadoImportarRavex.style.background = '#ffebee';
                    resultadoImportarRavex.style.border = '1px solid #f44336';
                    resultadoImportarRavex.innerHTML = 'Erro: ' + (data.erro || r.statusText || 'Falha na sincronização');
                }
            } catch (e) {
                resultadoImportarRavex.style.background = '#ffebee';
                resultadoImportarRavex.style.border = '1px solid #f44336';
                resultadoImportarRavex.innerHTML = 'Erro de rede: ' + (e.message || 'Não foi possível conectar');
            }
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
            resultadoImportarRavex.style.display = 'block';
            resultadoImportarRavex.style.background = '#e3f2fd';
            resultadoImportarRavex.style.border = '1px solid #2196f3';
            resultadoImportarRavex.innerHTML = 'Puxando roteiro/viagem da API Ravex...';
            try {
                const r = await fetch(API_BASE + '/ravex/importar-romaneio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: idUnico.trim() })
                });
                const data = await r.json().catch(function() { return {}; });
                if (r.ok && data.ok) {
                    resultadoImportarRavex.style.background = '#e8f5e9';
                    resultadoImportarRavex.style.border = '1px solid #4caf50';
                    resultadoImportarRavex.innerHTML = 'Importado. ID viagem: <strong>' + (data.id_viagem || '') + '</strong>. Total de itens: <strong>' + (data.total_itens || 0) + '</strong>.';
                    loadAllData();
                } else {
                    resultadoImportarRavex.style.background = '#ffebee';
                    resultadoImportarRavex.style.border = '1px solid #f44336';
                    resultadoImportarRavex.innerHTML = 'Erro: ' + (data.erro || r.statusText || 'Falha ao importar');
                }
            } catch (e) {
                resultadoImportarRavex.style.background = '#ffebee';
                resultadoImportarRavex.style.border = '1px solid #f44336';
                resultadoImportarRavex.innerHTML = 'Erro de rede: ' + (e.message || 'Não foi possível conectar');
            }
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
            resultadoImportarRavex.style.display = 'block';
            resultadoImportarRavex.style.background = '#e3f2fd';
            resultadoImportarRavex.style.border = '1px solid #2196f3';
            resultadoImportarRavex.innerHTML = 'Puxando ' + ids.length + ' roteiro(s)/viagem(ns) da API Ravex... Aguarde.';
            try {
                const r = await fetch(API_BASE + '/ravex/importar-lista', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: ids })
                });
                const data = await r.json().catch(function() { return {}; });
                if (r.ok && data.ok) {
                    resultadoImportarRavex.style.background = '#e8f5e9';
                    resultadoImportarRavex.style.border = '1px solid #4caf50';
                    resultadoImportarRavex.innerHTML = 'Lista processada. Viagens importadas: <strong>' + (data.viagens_processadas || 0) + '</strong>. Total de itens: <strong>' + (data.total_itens || 0) + '</strong>. IDs na lista: ' + (data.ids_recebidos || 0) + (data.erros && data.erros.length ? '. Erros: ' + data.erros.length : '') + '.';
                    loadAllData();
                } else {
                    resultadoImportarRavex.style.background = '#ffebee';
                    resultadoImportarRavex.style.border = '1px solid #f44336';
                    resultadoImportarRavex.innerHTML = 'Erro: ' + (data.erro || r.statusText || 'Falha ao importar lista');
                }
            } catch (e) {
                resultadoImportarRavex.style.background = '#ffebee';
                resultadoImportarRavex.style.border = '1px solid #f44336';
                resultadoImportarRavex.innerHTML = 'Erro de rede: ' + (e.message || 'Não foi possível conectar');
            }
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
        if (codigoInput && document.getElementById('conferencia').classList.contains('active') && idViagem && idViagem.value) {
            codigoInput.focus();
        }
    });
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
    const aviso = document.getElementById('aviso-produto-fora-relacao');
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
    var cb = document.getElementById('codigo-barras');
    if (cb && !cb.disabled) cb.focus();
    function rolarBlocoParaTopo() {
        var content = document.querySelector('main.content');
        if (content) content.scrollTop = 0;
    }
    requestAnimationFrame(function() { requestAnimationFrame(rolarBlocoParaTopo); });
}

// Buscar produto na planilha Excel
async function buscarProdutoNaPlanilha(codigoBarras) {
    codigoBarras = normalizarCodigoBarrasDuplicado((codigoBarras || '').toString().trim());
    if (!codigoBarras || codigoBarras.length < 3) {
        return;
    }
    
    const codigoInput = document.getElementById('codigo-barras');
    const produtoNomeInput = document.getElementById('produto-nome');
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
        
        const idViagem = document.getElementById('id-viagem-hidden').value.trim();
        const docaEl = document.getElementById('doca');
        const doca = docaEl && docaEl.value ? docaEl.value.trim() : '';
        const veiculoInput = document.getElementById('veiculo');
        const statusSelect = document.getElementById('status');
        const quantidadeInput = document.getElementById('quantidade');
        
        if (resultado.encontrado && resultado.produto) {
            const produto = resultado.produto;
            
            const codigoProdutoInput = document.getElementById('codigo-produto');
            
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
                if (quantidadeInput) {
                    const qRaw = parseInt(quantidadeInput.value, 10);
                    if (!isNaN(qRaw) && qRaw >= 1 && qRaw <= 99999) qtd = qRaw;
                }
                var codigoNorm = (codigoBarras || '').toString().trim();
                var idxPend = (window._pendingEnterUpdates || []).findIndex(function(p) { return (p.codigo || '').toString().trim() === codigoNorm; });
                var pend = idxPend >= 0 ? window._pendingEnterUpdates[idxPend] : null;
                if (pend && pend.qtd !== undefined) {
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
                if (!pend || !pend.updated) {
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
            document.getElementById('aviso-produto-fora-relacao').style.display = 'none';
            if (idViagem) {
                var qtdNaoEnc = (quantidadeInput && parseInt(quantidadeInput.value, 10)) ? Math.max(1, parseInt(quantidadeInput.value, 10)) : 1;
                var codigoNormNao = (codigoBarras || '').toString().trim();
                var idxPendNao = (window._pendingEnterUpdates || []).findIndex(function(p) { return (p.codigo || '').toString().trim() === codigoNormNao; });
                var pendNao = idxPendNao >= 0 ? window._pendingEnterUpdates[idxPendNao] : null;
                if (pendNao && pendNao.qtd !== undefined) {
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
                if (!pendNao || !pendNao.updated) {
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
    const codigoProdutoEl = document.getElementById('codigo-produto');
    const codigoBarrasEl = document.getElementById('codigo-barras');
    const produtoNomeInput = document.getElementById('produto-nome');
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
            const v = document.getElementById('veiculo');
            if (v && p.veiculo) v.value = p.veiculo;
            const s = document.getElementById('status');
            if (s && p.status) s.value = p.status;
            if (codigoProdutoEl) {
                codigoProdutoEl.style.borderColor = '#4caf50';
                codigoProdutoEl.style.backgroundColor = '#e8f5e9';
                setTimeout(() => { codigoProdutoEl.style.borderColor = ''; codigoProdutoEl.style.backgroundColor = ''; }, 2000);
            }
            if (codigoBarrasEl) window.ultimoCodigoBuscado = (p.codigo_barras || '').trim();
            const idViagem = document.getElementById('id-viagem-hidden') && document.getElementById('id-viagem-hidden').value.trim();
            if (idViagem && p.codigo_produto) {
                const naLista = await produtoNaListaViagem(idViagem, p.codigo_produto, null);
                mostrarAvisoProdutoForaRelacao(!naLista);
                if (naLista) window.cadastrarExtraAoBipar = false;
            }
        } else {
            document.getElementById('aviso-produto-fora-relacao').style.display = 'none';
            if (codigoProdutoEl) {
                codigoProdutoEl.style.borderColor = '#ff9800';
                codigoProdutoEl.style.backgroundColor = '#fff3e0';
                setTimeout(() => { codigoProdutoEl.style.borderColor = ''; codigoProdutoEl.style.backgroundColor = ''; }, 2000);
            }
        }
    } catch (err) {
        document.getElementById('aviso-produto-fora-relacao').style.display = 'none';
        if (codigoProdutoEl) {
            codigoProdutoEl.style.borderColor = '#f44336';
            codigoProdutoEl.style.backgroundColor = '#ffebee';
            setTimeout(() => { codigoProdutoEl.style.borderColor = ''; codigoProdutoEl.style.backgroundColor = ''; }, 2000);
        }
    }
}

// API Calls
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
        return await response.json();
    } catch (error) {
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
async function loadBasePlanilha() {
    const codigo = document.getElementById('filtro-base-codigo')?.value?.trim() || '';
    const descricao = document.getElementById('filtro-base-descricao')?.value?.trim() || '';
    const params = new URLSearchParams();
    if (codigo) params.set('codigo_barras', codigo);
    if (descricao) params.set('descricao', descricao);
    const url = '/base-planilha' + (params.toString() ? '?' + params.toString() : '');
    const data = await fetchAPI(url);
    
    const thead = document.getElementById('thead-base');
    const tbody = document.getElementById('tbody-base');
    if (!thead || !tbody) return;
    
    if (data && data.headers && Array.isArray(data.headers)) {
        thead.innerHTML = '<tr>' + data.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr>';
        const cols = data.headers.length;
        if (!data.rows || data.rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="' + cols + '" class="loading">Nenhum dado encontrado na base de produtos.</td></tr>';
        } else {
            tbody.innerHTML = data.rows.map(row => {
                return '<tr>' + data.headers.map(h => `<td>${escapeHtml(row[h] != null ? String(row[h]) : '')}</td>`).join('') + '</tr>';
            }).join('');
        }
    } else if (data === null || (data && data.erro)) {
        thead.innerHTML = '<tr><th>Erro</th></tr>';
        tbody.innerHTML = '<tr><td class="loading">' + (data && data.erro ? escapeHtml(data.erro) : 'Erro ao carregar dados. Configure DATABASE_URL para usar as tabelas.') + '</td></tr>';
    }
}

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function initFiltrosBase() {
    document.getElementById('btn-filtrar-base')?.addEventListener('click', () => loadBasePlanilha());
    document.getElementById('btn-limpar-filtros-base')?.addEventListener('click', () => {
        const cod = document.getElementById('filtro-base-codigo');
        const desc = document.getElementById('filtro-base-descricao');
        if (cod) cod.value = '';
        if (desc) desc.value = '';
        loadBasePlanilha();
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
        const inputCodigo = document.getElementById('codigo-barras');
        codigoBarras = (inputCodigo && inputCodigo.value || '').trim();
        codigoBarras = normalizarCodigoBarrasDuplicado(codigoBarras);
        // Não limpar o campo aqui: só limpar após sucesso, para não aparecer modal com campo vazio
        produto = document.getElementById('produto-nome').value.trim();
        let qRaw = parseInt(document.getElementById('quantidade').value, 10);
        quantidade = (typeof qRaw === 'number' && !isNaN(qRaw) && qRaw >= 1 && qRaw <= 99999) ? qRaw : 1;
        veiculo = document.getElementById('veiculo').value.trim();
        status = document.getElementById('status').value;
        idViagem = document.getElementById('id-viagem-hidden').value.trim();
    }
    
    let doca = (dadosOverride && dadosOverride.doca !== undefined) ? String(dadosOverride.doca).trim() : (document.getElementById('doca') && document.getElementById('doca').value || '').trim();
    
    if (!codigoBarras) {
        showMessage('Código de barras é obrigatório', 'error');
        return;
    }
    if (!idViagem) {
        showMessage('Por favor, selecione uma viagem primeiro', 'error');
        if (!dadosOverride) {
            document.getElementById('codigo-barras').value = codigoBarras;
            document.getElementById('codigo-barras').focus();
        }
        return;
    }
    
    const docasValidas = ['1', '2', '3', '4'];
    if (!doca || !docasValidas.includes(doca)) {
        showMessage('Selecione a doca antes de bipar', 'error');
        if (!dadosOverride) document.getElementById('codigo-barras').value = codigoBarras;
        const codigoInput = document.getElementById('codigo-barras');
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
        doca: doca
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

    const codigoProdutoEl = document.getElementById('codigo-produto');
    const codigoProdutoParaTabela = dadosOverride && (dadosOverride.codigo_interno !== undefined || dadosOverride.codigo_produto !== undefined)
        ? String(dadosOverride.codigo_interno || dadosOverride.codigo_produto || '').trim()
        : (codigoProdutoEl && codigoProdutoEl.value) ? codigoProdutoEl.value.trim() : '';
    if (!dadosOverride) {
        atualizarQuantidadeBipadaNaTabela(codigoBarras, quantidade, codigoProdutoParaTabela);
        atualizarEstatisticasOtimista(quantidade, false);
        document.getElementById('quantidade').value = 1;
    }
    document.getElementById('id-viagem-hidden').value = idViagem;
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
            document.getElementById('codigo-barras').value = codigoBarras;
            document.getElementById('produto-nome').value = produto;
            document.getElementById('quantidade').value = quantidade;
            if (codigoProdutoEl) codigoProdutoEl.value = codigoProdutoParaTabela;
        }
        document.getElementById('id-viagem-hidden').value = idViagem;
        focarCampoCodigoBarras();
        return;
    }

    if (result && result.produto_nao_cadastrado) {
        atualizarQuantidadeBipadaNaTabela(codigoBarras, -quantidade, codigoProdutoParaTabela);
        atualizarEstatisticasOtimista(quantidade, true);
        if (!dadosOverride) {
            document.getElementById('codigo-barras').value = codigoBarras;
            document.getElementById('produto-nome').value = produto;
            document.getElementById('quantidade').value = quantidade;
            if (codigoProdutoEl) codigoProdutoEl.value = codigoProdutoParaTabela;
        }
        document.getElementById('id-viagem-hidden').value = idViagem;
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
            document.getElementById('codigo-barras').value = codigoBarras;
            document.getElementById('produto-nome').value = produto;
            document.getElementById('quantidade').value = quantidade;
            if (codigoProdutoEl) codigoProdutoEl.value = codigoProdutoParaTabela;
        }
        document.getElementById('id-viagem-hidden').value = idViagem;
        showMessage(result.mensagem, 'error');
        focarCampoCodigoBarras();
        return;
    }

    if (result && result.success) {
        if (document.getElementById('modal-cadastro-item')) document.getElementById('modal-cadastro-item').style.display = 'none';
        // Limpar e focar só quando não veio de override (para não apagar o próximo código já digitado)
        if (!dadosOverride) {
            const qtdEl = document.getElementById('quantidade');
            if (qtdEl) qtdEl.value = '1';
            const cb = document.getElementById('codigo-barras');
            if (cb) cb.value = '';
            if (codigoProdutoEl) codigoProdutoEl.value = '';
            const pn = document.getElementById('produto-nome');
            if (pn) pn.value = '';
        }
        agendarAtualizacoesPosBipagem(idViagem);
        focarCampoCodigoBarras();
    }
}

// codigoProdutoOpcional: quando bipamos EAN ou DUN, a linha na tabela pode mostrar outro código; usar código do produto para achar a linha
function atualizarQuantidadeBipadaNaTabela(codigoBarras, quantidade, codigoProdutoOpcional) {
    const tbody = document.getElementById('tbody-conferencia');
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
    const elTotal = document.getElementById('conferencia-total-itens');
    const elBipado = document.getElementById('conferencia-total-bipado');
    if (!elTotal || !elBipado) return;
    const tbody = document.getElementById('tbody-conferencia');
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
    atualizarStatusResumoConferencia(totalItens, totalBipado, totalFalta, temExcedente);
}

function atualizarTotaisConferenciaFromData(conferenciaArray) {
    const elTotal = document.getElementById('conferencia-total-itens');
    const elBipado = document.getElementById('conferencia-total-bipado');
    if (!elTotal || !elBipado || !conferenciaArray || !conferenciaArray.length) {
        if (elTotal) elTotal.textContent = 'Total: 0';
        if (elBipado) elBipado.textContent = 'Bipado: 0';
        atualizarStatusResumoConferencia(0, 0, 0, false);
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
    atualizarStatusResumoConferencia(totalItens, totalBipado, totalFalta, temExcedente);
}

function atualizarStatusResumoConferencia(totalItens, totalBipado, totalFalta, temExcedente) {
    const elStatus = document.getElementById('conferencia-resumo-status');
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
            setVal('data-expedicao', data.data_expedicao);
            setPlaca(data.placa);
            setVal('viagem-identificador-rota', data.identificador_rota);
            setMotorista(data.motorista);
            setInput('viagem-coordenador', (data.coordenador && String(data.coordenador).trim()) ? data.coordenador : COORDENADOR_PADRAO);
            setInput('viagem-conferente', data.conferente || '');
            setInput('viagem-ajudante1', data.ajudante1 || '');
            setInput('viagem-ajudante2', data.ajudante2 || '');
            setVal('display-id-roteiro', data.id_roteiro || '-');
            setVal('display-id-viagem', data.id_viagem || idViagem || '-');
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

// Buscar Itens da Viagem (aceita ID do roteiro ou ID da viagem; quando DATABASE_URL, importa da API Ravex)
window.buscarItensViagem = async function() {
    const idInput = document.getElementById('id-viagem').value.trim();
    
    if (!idInput) {
        showMessage('Por favor, digite o ID do roteiro ou o ID da viagem', 'error');
        document.getElementById('id-viagem').focus();
        return;
    }
    
    showMessage('Buscando itens...', 'success');
    
    var idViagem = idInput;
    try {
        const res = await fetch(API_BASE + '/ravex/importar-romaneio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: idInput })
        });
        const data = await res.json().catch(function() { return {}; });
        if (res.ok && data.ok && data.id_viagem) {
            idViagem = data.id_viagem;
            if (data.mensagem) showMessage(data.mensagem, 'success');
            var setVal = function(id, val) {
                var el = document.getElementById(id);
                if (el) el.textContent = (val && String(val).trim()) ? val : '-';
            };
            setVal('display-id-roteiro', data.id_roteiro || '-');
            setVal('display-id-viagem', data.id_viagem || idViagem);
        } else if (res.status === 400 && data.erro && (data.erro.indexOf('Configure DATABASE_URL') >= 0 || data.erro.indexOf('Nenhum dataset') >= 0)) {
            idViagem = idInput;
        } else if (!res.ok && data.erro) {
            showMessage(data.erro, 'error');
            return;
        }
    } catch (e) {
        idViagem = idInput;
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
    await loadConferencia(idViagem);
    await loadPeriodoCarregamento(idViagem);
    await loadViagemInfo(idViagem);
    
    setTimeout(() => {
        const docaSelect = document.getElementById('doca');
        const codigoBarrasInput = document.getElementById('codigo-barras');
        const docaVal = docaSelect ? docaSelect.value.trim() : '';
        const docaOk = ['1','2','3','4'].includes(docaVal);
        if (docaSelect && !docaOk) docaSelect.focus();
        else if (codigoBarrasInput && !codigoBarrasInput.disabled) codigoBarrasInput.focus();
    }, 300);
}

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

// Abrir modal de aceite para zerar todos os itens
window.abrirModalZerarItens = function() {
    const idViagem = document.getElementById('id-viagem-hidden').value.trim();
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
    const idViagem = document.getElementById('id-viagem-hidden').value.trim();
    if (!codigoBarras || !idViagem) {
        showMessage('Dados inválidos para excluir', 'error');
        return;
    }
    fecharModalExcluirItem();
    try {
        const result = await fetchAPI('/conferencia/remover', {
            method: 'POST',
            body: JSON.stringify({ id_viagem: idViagem, codigo_barras: codigoBarras, quantidade: 'tudo' })
        });
        if (result && result.success) {
            showMessage(result.mensagem || 'Item excluído da conferência.', 'success');
            await loadConferencia(idViagem);
            await loadPeriodoCarregamento(idViagem);
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
    const idViagem = document.getElementById('id-viagem-hidden').value.trim();
    const aceite = document.getElementById('aceite-zerar-itens');
    if (!aceite || !aceite.checked) return;
    fecharModalZerarItens();
    try {
        const result = await fetchAPI(`/conferencia/${encodeURIComponent(idViagem)}/zerar`, {
            method: 'DELETE'
        });
        if (result && result.success) {
            showMessage(result.mensagem || 'Todos os itens foram zerados. Pode bipar novamente.', 'success');
            await loadConferencia(idViagem);
            await loadPeriodoCarregamento(idViagem);
            loadEstatisticas();
            document.getElementById('codigo-barras').value = '';
            const cpZ = document.getElementById('codigo-produto');
            if (cpZ) cpZ.value = '';
            document.getElementById('produto-nome').value = '';
            document.getElementById('quantidade').value = '1';
            document.getElementById('codigo-barras').focus();
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

async function loadConferencia(idViagem = null) {
    if (!idViagem) {
        const idViagemInput = document.getElementById('id-viagem');
        if (idViagemInput) {
            idViagem = idViagemInput.value.trim();
        }
    }
    
    if (!idViagem) {
        return;
    }
    
    try {
        const conferencia = await fetchAPI(`/conferencia/${encodeURIComponent(idViagem)}?_=${Date.now()}`);
        if (conferencia && !conferencia.erro) {
            const conferenciaUI = agruparConferenciaPorCodigoProduto(conferencia);
            const tbody = document.getElementById('tbody-conferencia');
            // Preservar texto que o usuário está digitando nos campos Motivo ao atualizar a tabela (ex.: refresh a cada 5s)
            const motivosEmEdicao = {};
            if (tbody) {
                tbody.querySelectorAll('.input-motivo-divergencia').forEach(function(inp) {
                    var cod = unescapeHtml(inp.getAttribute('data-codigo-produto') || '');
                    var chave = idViagem + '|' + cod;
                    motivosEmEdicao[chave] = inp.value;
                });
            }
            if (conferenciaUI.length === 0) {
                tbody.innerHTML = '<tr><td colspan="12" class="loading">Nenhum item encontrado para esta viagem no romaneio.</td></tr>';
                atualizarTotaisConferenciaFromData([]);
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
                            <button type="button" class="btn btn-secondary" onclick="tirarBipado('${codigoBarrasEscapado}', 1)" style="padding: 4px 8px; font-size: 11px;" title="Remover 1 unidade bipada">➖ Tirar 1</button>
                            <button type="button" class="btn btn-secondary" onclick="tirarBipado('${codigoBarrasEscapado}', 'tudo')" style="padding: 4px 8px; font-size: 11px;" title="Remover todas as unidades bipadas deste item">🗑️ Tirar tudo</button>
                        ` : '';
                const produtoAttr = (item.produto || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                const btnExcluir = codigoBarras !== '-' ? `<button type="button" class="btn btn-secondary" onclick="abrirModalExcluirItem(this)" data-codigo="${codigoBarrasEscapado.replace(/"/g, '&quot;')}" data-produto="${produtoAttr}" style="padding: 4px 8px; font-size: 11px; color: #c62828;" title="Excluir item da conferência">🗑️ Excluir</button>` : '';
                const btnBipar = codigoBarras !== '-' ? `<button type="button" class="btn btn-primary" onclick="biparItem('${codigoBarras}', '${produtoEscapado}', ${qtdFaltaParaBipar})" style="padding: 6px 12px; font-size: 12px;">📱 Bipar</button>` : (item.quantidade_falta > 0 ? '<span style="color: #ff9800;" title="Adicione o código do produto ' + (item.codigo_produto || '') + ' na aba BASE da planilha com o código de barras correspondente.">⚠️ Sem código de barras</span>' : '');
                const motivoBruto = motivosEmEdicao[idViagem + '|' + (item.codigo_produto || '')] !== undefined ? motivosEmEdicao[idViagem + '|' + (item.codigo_produto || '')] : (item.motivo_divergencia || '');
                const motivoVal = (motivoBruto || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const codigoProdutoEsc = (item.codigo_produto || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                return `
                <tr class="${rowClass}" data-codigo="${item.codigo_produto || ''}">
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td><input type="text" class="input-motivo-divergencia" data-id-viagem="${escHtml(idViagem)}" data-codigo-produto="${codigoProdutoEsc}" value="${motivoVal}" placeholder="Motivo da divergência" style="width: 100%; min-width: 120px; padding: 6px 8px; box-sizing: border-box;" onblur="salvarMotivoDivergencia(this)" title="Escreva o motivo e saia do campo para salvar"></td>
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
            atualizarTotaisConferenciaFromData(conferenciaOrdenada);
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
            // Mostrar opção "Gerar comprovante" quando todos os itens estiverem COMPLETO (sem EXCEDENTE)
            const todosCompletos = conferenciaUI.length > 0 && conferenciaUI.every(item => item.status_bipado === 'COMPLETO');
            const boxCompleto = document.getElementById('conferencia-completa-box');
            if (boxCompleto) boxCompleto.style.display = todosCompletos ? 'block' : 'none';
            // Mostrar opção "Gerar comprovante divergente" quando há itens mas não todos completos
            const boxDivergente = document.getElementById('conferencia-divergente-box');
            if (boxDivergente) boxDivergente.style.display = (conferenciaUI.length > 0 && !todosCompletos) ? 'block' : 'none';
            return conferencia;
        } else if (conferencia && conferencia.erro) {
            const tbody = document.getElementById('tbody-conferencia');
            tbody.innerHTML = `<tr><td colspan="12" class="loading" style="color: #f44336;">Erro: ${conferencia.erro}</td></tr>`;
            showMessage(conferencia.erro, 'error');
            return undefined;
        } else {
            const tbody = document.getElementById('tbody-conferencia');
            tbody.innerHTML = '<tr><td colspan="12" class="loading">Erro ao carregar dados. Verifique se a planilha está no diretório.</td></tr>';
            return undefined;
        }
    } catch (error) {
        const tbody = document.getElementById('tbody-conferencia');
        tbody.innerHTML = '<tr><td colspan="12" class="loading" style="color: #f44336;">Erro ao buscar itens da viagem.</td></tr>';
        showMessage('Erro ao buscar itens da viagem', 'error');
        return undefined;
    }
}

// Tirar itens bipados (quando bipou errado)
window.tirarBipado = async function(codigoBarras, quantidade) {
    if (window._tirarBipadoEmAndamento) return;
    window._tirarBipadoEmAndamento = true;
    var cb = document.getElementById('codigo-barras');
    if (cb) cb.value = '';
    const idViagem = document.getElementById('id-viagem-hidden').value.trim();
    if (!idViagem) {
        window._tirarBipadoEmAndamento = false;
        showMessage('Nenhuma viagem selecionada', 'error');
        return;
    }
    if (!codigoBarras || codigoBarras === '-') {
        window._tirarBipadoEmAndamento = false;
        showMessage('Item sem código de barras', 'error');
        return;
    }
    const qtd = quantidade === 'tudo' || quantidade === 'all' ? 'tudo' : (parseInt(quantidade, 10) || 1);
    const msgConfirmar = qtd === 'tudo'
        ? 'Remover todas as unidades bipadas deste item?'
        : 'Remover 1 unidade bipada?';
    if (!confirm(msgConfirmar)) {
        window._tirarBipadoEmAndamento = false;
        return;
    }
    try {
        const result = await fetchAPI('/conferencia/remover', {
            method: 'POST',
            body: JSON.stringify({ id_viagem: idViagem, codigo_barras: codigoBarras, quantidade: qtd })
        });
        if (result && result.success) {
            showMessage(result.mensagem || 'Item(s) removido(s).', 'success');
            await loadConferencia(idViagem);
            await loadPeriodoCarregamento(idViagem);
            loadEstatisticas();
        } else {
            showMessage(result?.erro || 'Não foi possível remover', 'error');
        }
    } catch (e) {
        showMessage('Erro ao remover item', 'error');
    } finally {
        window._tirarBipadoEmAndamento = false;
    }
};

// Bipar Item diretamente da lista — uma única bipagem por clique
window.biparItem = async function(codigoBarras, produto, quantidadeFalta) {
    if (window._biparItemEmAndamento) return;
    window._biparItemEmAndamento = true;
    const cb = document.getElementById('codigo-barras');
    if (cb) cb.value = '';
    document.getElementById('codigo-barras').value = codigoBarras;
    document.getElementById('produto-nome').value = produto;
    document.getElementById('quantidade').value = 1;
    try {
        window._ultimoBipadoCodigo = (codigoBarras || '').toString().trim();
        await buscarProdutoNaPlanilha(codigoBarras);
    } finally {
        window._biparItemEmAndamento = false;
    }
    if (cb) cb.focus();
}

// Gerar comprovante de carregamento (vai para aba Extrato com a viagem atual)
window.gerarComprovanteCarregamento = function() {
    const idViagem = document.getElementById('id-viagem-hidden').value.trim();
    if (!idViagem) {
        showMessage('Nenhuma viagem selecionada', 'error');
        return;
    }
    document.getElementById('extrato-id-viagem').value = idViagem;
    document.querySelector('.tab-button[data-tab="extrato"]').click();
    loadExtrato();
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
async function loadExtrato() {
    const inputBusca = document.getElementById('extrato-id-viagem');
    const idViagemHidden = document.getElementById('id-viagem-hidden');
    let idViagem = inputBusca && inputBusca.value.trim();
    if (!idViagem && idViagemHidden && idViagemHidden.value.trim()) {
        idViagem = idViagemHidden.value.trim();
        if (inputBusca) inputBusca.value = idViagem;
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
    const [extrato, periodo, viagemInfo] = await Promise.all([
        fetchAPI(`/conferencia/${encodeURIComponent(idViagem)}`),
        fetchAPI(`/viagem/${encodeURIComponent(idViagem)}/periodo`),
        fetchAPI(`/viagem/${encodeURIComponent(idViagem)}/info`)
    ]);
    if (!extrato || extrato.erro || extrato.length === 0) {
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

// Carregar Romaneio da Planilha (todas as colunas, com filtros por id_viagem, id_roteiro, codigo_cliente, codigo_produto, endereco, cidade)
async function loadRomaneio() {
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
    const resp = await fetchAPI(url);
    const thead = document.getElementById('thead-romaneio');
    const tbody = document.getElementById('tbody-romaneio');
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
}

window.limparFiltrosRomaneio = function() {
    const ids = ['romaneio-filtro-id-viagem', 'romaneio-filtro-id-roteiro', 'romaneio-filtro-codigo-cliente', 'romaneio-filtro-codigo-produto', 'romaneio-filtro-endereco', 'romaneio-filtro-cidade'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    loadRomaneio();
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
                                <td><input type="text" class="input-motivo-divergencia" data-id-viagem="${escHtml(idViagem)}" data-codigo-produto="${codigoProdutoEsc}" value="${motivoVal}" placeholder="Escreva o motivo" style="width: 100%; min-width: 160px; padding: 6px 8px; box-sizing: border-box;" onblur="salvarMotivoDivergencia(this)" title="Escreva o motivo da divergência e saia do campo para salvar"></td>
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

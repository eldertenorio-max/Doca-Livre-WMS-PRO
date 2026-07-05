/**
 * Ícones SVG do menu lateral — estilo Ultrafrio / Doca Livre
 */
(function (global) {
    'use strict';

    function svg(inner, viewBox) {
        return (
            '<svg class="sidebar-icon-svg" viewBox="' + (viewBox || '0 0 24 24') + '" fill="none" aria-hidden="true">' +
            inner +
            '</svg>'
        );
    }

    var stroke = ' stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

    var ICONS = {
        painel: svg('<path' + stroke + ' d="M4 19V5M4 19h16M8 19v-6M12 19V9M16 19v-3"/>'),
        conferencia: svg('<path' + stroke + ' d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect' + stroke + ' x="9" y="3" width="6" height="4" rx="1"/><path' + stroke + ' d="M9 12h6M9 16h4"/>'),
        extrato: svg('<path' + stroke + ' d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path' + stroke + ' d="M14 2v6h6M8 13h8M8 17h5"/>'),
        relatorios: svg('<path' + stroke + ' d="M9 17V7M15 17v-4M12 17V4M5 19h14"/>'),
        divergencias: svg('<path' + stroke + ' d="M12 9v4M12 17h.01"/><path' + stroke + ' d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>'),
        'importar-ravex': svg('<path' + stroke + ' d="M12 3v12M8 11l4 4 4-4"/><path' + stroke + ' d="M4 19h16"/>'),
        'baixa-ravex': svg('<path' + stroke + ' d="M20 6L9 17l-5-5"/>'),
        romaneio: svg('<path' + stroke + ' d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path' + stroke + ' d="M3.3 7l8.7 5 8.7-5M12 22V12"/>'),
        base: svg('<path' + stroke + ' d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/>'),
        'enviar-xml': svg('<path' + stroke + ' d="M12 19V5M16 9l-4-4-4 4"/><path' + stroke + ' d="M4 19h16"/>'),
        'pendencia-recebimento': svg('<circle cx="12" cy="12" r="9"' + stroke + '/><path' + stroke + ' d="M12 7v5l3 2"/>'),
        'fornecedores-recebidos': svg('<path' + stroke + ' d="M20 6L9 17l-5-5"/>'),
        'pendentes-lancamento': svg('<path' + stroke + ' d="M12 20h9"/><path' + stroke + ' d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
        'notas-lancadas': svg('<path' + stroke + ' d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path' + stroke + ' d="M14 2v6h6"/>'),
        'pendencias-mg': svg('<path' + stroke + ' d="M1 3h15v13H1z"/><path' + stroke + ' d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"' + stroke + '/><circle cx="18.5" cy="18.5" r="2.5"' + stroke + '/>'),
        'notas-enviadas-mg': svg('<path' + stroke + ' d="M22 2L11 13"/><path' + stroke + ' d="M22 2l-7 20-4-9-9-4 20-7z"/>'),
        'recebimentos-mg': svg('<path' + stroke + ' d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path' + stroke + ' d="M22 6l-10 7L2 6"/>'),
        historico: svg('<circle cx="12" cy="12" r="9"' + stroke + '/><path' + stroke + ' d="M12 7v5l3 2"/>'),
        'estoque-atual': svg('<path' + stroke + ' d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>'),
        saida: svg('<path' + stroke + ' d="M12 19V5M16 15l-4 4-4-4"/>'),
        'entrada-devolucao': svg('<path' + stroke + ' d="M12 5v14M8 9l4-4 4 4"/>'),
        'entrada-terceiros': svg('<path' + stroke + ' d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path' + stroke + ' d="M9 22V12h6v10"/>'),
        reentregas: svg('<path' + stroke + ' d="M21 12a9 9 0 11-3-6.7"/><path' + stroke + ' d="M21 3v6h-6"/>'),
        avaria: svg('<path' + stroke + ' d="M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z"/>'),
        'descarte-perdas': svg('<path' + stroke + ' d="M3 6h18"/><path' + stroke + ' d="M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
        'palete-bloqueado': svg('<rect x="5" y="11" width="14" height="10" rx="2"' + stroke + '/><path' + stroke + ' d="M8 11V7a4 4 0 118 0v4"/>'),
        'etiquetas-longarina': svg('<path' + stroke + ' d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>'),
        localizacoes: svg('<path' + stroke + ' d="M12 21s7-4.35 7-11a7 7 0 10-14 0c0 6.65 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"' + stroke + '/>'),
        'mapa-3d': svg('<path' + stroke + ' d="M12 3l9 4.5v9L12 21 3 16.5v-9L12 3z"/><path' + stroke + ' d="M12 12l9-4.5M12 12v9M12 12L3 7.5"/>'),
        produtos: svg('<path' + stroke + ' d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>'),
        movimentacoes: svg('<path' + stroke + ' d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4"/>'),
        recebimento: svg('<path' + stroke + ' d="M12 5v14M8 9l4-4 4 4"/>'),
        'controle-paletes': svg('<rect x="3" y="3" width="7" height="7"' + stroke + '/><rect x="14" y="3" width="7" height="7"' + stroke + '/><rect x="3" y="14" width="7" height="7"' + stroke + '/><rect x="14" y="14" width="7" height="7"' + stroke + '/>'),
        'historico-nf': svg('<circle cx="12" cy="12" r="9"' + stroke + '/><path' + stroke + ' d="M12 7v5l3 2"/>'),
        separacao: svg('<path' + stroke + ' d="M6 3v18M18 3v18M6 12h12"/>'),
        enderecamento: svg('<path' + stroke + ' d="M12 21s7-4.35 7-11a7 7 0 10-14 0c0 6.65 7 11 7 11z"/>'),
        ocupacao: svg('<path' + stroke + ' d="M3 3v18h18"/><path' + stroke + ' d="M7 16V9M12 16V5M17 16v-3"/>'),
        'estoque-seguranca': svg('<path' + stroke + ' d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
        'shelf-life': svg('<circle cx="12" cy="12" r="9"' + stroke + '/><path' + stroke + ' d="M12 7v5l3 2"/>'),
        'visao-cruzada': svg('<path' + stroke + ' d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7"/>'),
        inventario: svg('<path' + stroke + ' d="M4 7h16M4 12h16M4 17h10"/>'),
        pesquisa: svg('<circle cx="11" cy="11" r="7"' + stroke + '/><path' + stroke + ' d="M20 20l-3-3"/>'),
        home: svg('<path' + stroke + ' d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path' + stroke + ' d="M9 22V12h6v10"/>'),
        modulo: svg('<rect x="3" y="3" width="7" height="7"' + stroke + '/><rect x="14" y="3" width="7" height="7"' + stroke + '/><rect x="3" y="14" width="7" height="7"' + stroke + '/><rect x="14" y="14" width="7" height="7"' + stroke + '/>'),
        default: svg('<path' + stroke + ' d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path' + stroke + ' d="M14 2v6h6"/>')
    };

    function iconFor(key) {
        return ICONS[key] || ICONS.default;
    }

    function labelDoca(text) {
        if (!text) return text;
        return String(text)
            .toLowerCase()
            .replace(/(^|[\s/])([^\s/])/g, function (_, sep, ch) {
                return sep + ch.toUpperCase();
            });
    }

    global.docaLivreSidebarIcon = iconFor;
    global.docaLivreSidebarLabel = labelDoca;
})(window);

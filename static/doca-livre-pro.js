/**
 * Topbar DOCA LIVRE PRO — relógio + toggle do menu lateral
 */
(function (global) {
    'use strict';

    var SIDEBAR_LS_KEY = 'dl-modulo-sidebar-wide';
    var toggleBtn = null;
    var isWide = false;

    function formatClock(now) {
        return {
            time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            date: now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        };
    }

    function tickClock() {
        var c = formatClock(new Date());
        var timeEl = document.getElementById('dl-clock-time');
        var dateEl = document.getElementById('dl-clock-date');
        if (timeEl) timeEl.textContent = c.time;
        if (dateEl) dateEl.textContent = c.date;
    }

    function readSidebarWide() {
        try {
            var raw = localStorage.getItem(SIDEBAR_LS_KEY);
            if (raw === '0') return false;
            if (raw === '1') return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    function storeSidebarWide(wide) {
        try { localStorage.setItem(SIDEBAR_LS_KEY, wide ? '1' : '0'); } catch (e) { /* ignore */ }
    }

    function setModuloSidebarsWide(wide) {
        isWide = !!wide;
        document.querySelectorAll('.modulo-sidebar').forEach(function (nav) {
            nav.classList.toggle('modulo-sidebar--wide', isWide);
        });
        updateSidebarToggleUi();
    }

    function updateSidebarToggleUi() {
        if (!toggleBtn) return;
        toggleBtn.setAttribute('aria-pressed', isWide ? 'true' : 'false');
        toggleBtn.setAttribute('aria-label', isWide ? 'Recolher menu lateral' : 'Abrir menu lateral');
        toggleBtn.title = isWide ? 'Recolher menu lateral' : 'Abrir menu lateral';
    }

    function initModuloSidebarToggle() {
        toggleBtn = document.getElementById('btn-sidebar-toggle');
        if (!toggleBtn || toggleBtn._dlSidebarInit) return;
        toggleBtn._dlSidebarInit = true;
        setModuloSidebarsWide(readSidebarWide());
        toggleBtn.addEventListener('click', function () {
            setModuloSidebarsWide(!isWide);
            storeSidebarWide(isWide);
        });
    }

    global.docaLivreSyncSidebarWide = function () {
        if (!toggleBtn) initModuloSidebarToggle();
        setModuloSidebarsWide(readSidebarWide());
    };

    tickClock();
    setInterval(tickClock, 30000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModuloSidebarToggle);
    } else {
        initModuloSidebarToggle();
    }
})(window);

/**
 * Relógio topbar — igual Ultrafrio AppTopBar
 */
(function () {
    'use strict';

    function formatClock(now) {
        return {
            time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            date: now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        };
    }

    function tick() {
        var c = formatClock(new Date());
        var timeEl = document.getElementById('dl-clock-time');
        var dateEl = document.getElementById('dl-clock-date');
        if (timeEl) timeEl.textContent = c.time;
        if (dateEl) dateEl.textContent = c.date;
    }

    tick();
    setInterval(tick, 30000);
})();

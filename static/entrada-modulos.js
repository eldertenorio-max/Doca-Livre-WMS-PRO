(function () {
    'use strict';

    var MODULOS = window.SS_HUB_MODULOS || [];
    var LS_RECENT = 'ss_hub_recent_v1';
    var LS_FAV = 'ss_hub_fav_v1';
    var MAX_RECENT = 5;

    var ICONS = {
        truck: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="14" width="22" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M28 18h8l6 8v4H28V18z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="32" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="36" cy="32" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
        return: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M28 10H14a4 4 0 00-4 4v20a4 4 0 004 4h20a4 4 0 004-4V22" fill="none" stroke="currentColor" stroke-width="2"/><path d="M18 24l-6-6 6-6M12 18h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        inbound: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8v22M24 30l-8-8M24 30l8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="10" y="32" width="28" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
        stock: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 18l16-8 16 8v16l-16 8-16-8V18z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M24 26v16M8 18l16 8 16-8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
        wms: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="8" width="14" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="26" y="8" width="14" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8" y="26" width="14" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="26" y="26" width="14" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
        menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
    };

    function readJson(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeJson(key, val) {
        try {
            localStorage.setItem(key, JSON.stringify(val));
        } catch (e) { /* ignore */ }
    }

    function getRecent() {
        return readJson(LS_RECENT, []);
    }

    function getFav() {
        return readJson(LS_FAV, ['enderecamento-wms']);
    }

    function pushRecent(id) {
        var list = getRecent().filter(function (x) { return x !== id; });
        list.unshift(id);
        writeJson(LS_RECENT, list.slice(0, MAX_RECENT));
    }

    function toggleFav(id) {
        var list = getFav();
        var i = list.indexOf(id);
        if (i >= 0) list.splice(i, 1);
        else list.push(id);
        writeJson(LS_FAV, list);
        renderAll(document.getElementById('hub-search').value.trim().toLowerCase());
    }

    function byId(id) {
        return MODULOS.find(function (m) { return m.id === id; });
    }

    function modIcon(name) {
        return ICONS[name] || ICONS.menu;
    }

    function sidebarItem(mod) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = mod.href;
        a.className = 'ss-hub-sidebar-link';
        a.innerHTML = '<span class="ss-hub-sidebar-link-ico">' + modIcon(mod.icon) + '</span><span>' + mod.label + '</span>';
        a.addEventListener('click', function () { pushRecent(mod.id); });
        li.appendChild(a);
        return li;
    }

    function moduleCard(mod, opts) {
        opts = opts || {};
        var fav = getFav().indexOf(mod.id) >= 0;
        var card = document.createElement('a');
        card.href = mod.href;
        card.className = 'ss-hub-card';
        card.setAttribute('data-mod-id', mod.id);
        card.setAttribute('data-label', mod.label.toLowerCase());
        card.innerHTML =
            '<span class="ss-hub-card-ico">' + modIcon(mod.icon) + '</span>' +
            '<span class="ss-hub-card-label">' + mod.label + '</span>' +
            '<button type="button" class="ss-hub-card-star' + (fav ? ' is-on' : '') + '" title="Favorito" aria-label="Favorito">' +
            (fav ? '★' : '☆') + '</button>';
        card.addEventListener('click', function (ev) {
            if (ev.target.closest('.ss-hub-card-star')) {
                ev.preventDefault();
                toggleFav(mod.id);
                return;
            }
            pushRecent(mod.id);
        });
        return card;
    }

    function fillGrid(el, ids, query) {
        if (!el) return;
        el.innerHTML = '';
        var shown = 0;
        ids.forEach(function (id) {
            var mod = byId(id);
            if (!mod) return;
            if (query && mod.label.toLowerCase().indexOf(query) < 0) return;
            el.appendChild(moduleCard(mod));
            shown++;
        });
        return shown;
    }

    function fillSidebarList(el, ids) {
        if (!el) return;
        el.innerHTML = '';
        ids.forEach(function (id) {
            var mod = byId(id);
            if (mod) el.appendChild(sidebarItem(mod));
        });
    }

    function renderAll(query) {
        query = query || '';
        var recentIds = getRecent();
        var favIds = getFav();
        var maisIds = MODULOS.map(function (m) { return m.id; });

        var nRecent = fillGrid(document.getElementById('grid-recentes'), recentIds, query);
        fillGrid(document.getElementById('grid-mais'), maisIds, query);
        var nFav = fillGrid(document.getElementById('grid-favoritos'), favIds, query);

        var emptyRecent = document.getElementById('empty-recentes');
        var emptyFav = document.getElementById('empty-favoritos');
        if (emptyRecent) emptyRecent.hidden = !!(nRecent || query);
        if (emptyFav) emptyFav.hidden = !!(nFav || query);

        fillSidebarList(document.getElementById('sidebar-mais'), maisIds.slice(0, 5));
        fillSidebarList(document.getElementById('sidebar-fav'), favIds);
        fillSidebarList(document.getElementById('sidebar-all'), maisIds);

        document.querySelectorAll('.ss-hub-section').forEach(function (sec) {
            var grid = sec.querySelector('.ss-hub-grid');
            if (!grid) return;
            var visible = grid.querySelectorAll('.ss-hub-card').length;
            sec.hidden = query && visible === 0;
        });
    }

    function initClock() {
        var el = document.getElementById('ss-hub-clock');
        if (!el) return;
        function tick() {
            var d = new Date();
            el.textContent = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        tick();
        setInterval(tick, 30000);
    }

    function initSearch() {
        var input = document.getElementById('hub-search');
        if (!input) return;
        input.addEventListener('input', function () {
            renderAll(input.value.trim().toLowerCase());
        });
    }

    function initMenuCompleto() {
        var btn = document.getElementById('btn-menu-completo');
        var list = document.getElementById('sidebar-all');
        if (!btn || !list) return;
        btn.addEventListener('click', function () {
            var open = list.hidden;
            list.hidden = !open;
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    }

    renderAll();
    initClock();
    initSearch();
    initMenuCompleto();
})();

/**
 * Ao recarregar (F5) qualquer página autenticada, volta para /login
 * para exibir a intro e a tela de login.
 */
(function () {
    'use strict';

    var path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    if (path === '/login') return;

    function isBrowserReload() {
        try {
            var nav = performance.getEntriesByType('navigation')[0];
            if (nav && nav.type === 'reload') return true;
        } catch (e) {}
        try {
            if (performance.navigation && performance.navigation.type === 1) return true;
        } catch (e2) {}
        return false;
    }

    if (isBrowserReload()) {
        window.location.replace('/login');
    }
})();

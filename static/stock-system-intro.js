/**
 * Stock System — intro em 2 telas na abertura:
 *   1) logo SVG (stock-system-logo.svg)
 *   2) título, tagline e barra de carregamento
 *
 * Apenas na tela de login, uma vez por sessão (sessionStorage).
 */
(function () {
    'use strict';

    var SPLASH_ID = 'stock-system-splash';
    var STORAGE_KEY = 'stock_system_intro_v2';
    var LOGO_MS = 2000;
    var LOAD_MS = 2600;
    var FADE_MS = 500;

    function qs(sel, root) { return (root || document).querySelector(sel); }

    function removeSplash(splash) {
        if (!splash) return;
        document.body.classList.remove('ss-splash-active');
        if (splash.parentNode) splash.parentNode.removeChild(splash);
    }

    function hideSplash(splash) {
        if (!splash) return;
        splash.classList.add('ss-splash--out');
        document.body.classList.remove('ss-splash-active');
        try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
        setTimeout(function () { removeSplash(splash); }, FADE_MS + 80);
    }

    function skipSplashIfSeen() {
        try {
            if (sessionStorage.getItem(STORAGE_KEY) !== '1') return false;
        } catch (e) {
            return false;
        }
        removeSplash(document.getElementById(SPLASH_ID));
        return true;
    }

    function goToLoadStep(splash) {
        var stepLogo = qs('.ss-splash-step--logo', splash);
        var stepLoad = qs('.ss-splash-step--load', splash);
        if (!stepLogo || !stepLoad) {
            hideSplash(splash);
            return;
        }
        stepLogo.classList.remove('ss-splash-step--active');
        stepLogo.setAttribute('aria-hidden', 'true');
        stepLoad.classList.add('ss-splash-step--active');
        stepLoad.setAttribute('aria-hidden', 'false');

        var bar = qs('.ss-splash-loader-bar', splash);
        var loader = qs('.ss-splash-loader', splash);
        if (bar) {
            bar.style.width = '0%';
            void bar.offsetWidth;
            bar.classList.add('ss-splash-loader-bar--run');
        }

        var startLoad = Date.now();
        var tick = setInterval(function () {
            if (!loader) return;
            var pct = Math.min(100, Math.round(((Date.now() - startLoad) / LOAD_MS) * 100));
            loader.setAttribute('aria-valuenow', String(pct));
            if (pct >= 100) clearInterval(tick);
        }, 50);

        setTimeout(function () {
            clearInterval(tick);
            hideSplash(splash);
        }, LOAD_MS);
    }

    function runIntro(splash) {
        document.body.classList.add('ss-splash-active');
        setTimeout(function () { goToLoadStep(splash); }, LOGO_MS);
    }

    function initStockSystemIntro(opts) {
        opts = opts || {};
        var splash = document.getElementById(SPLASH_ID);
        if (!splash) return;

        if (!opts.force && skipSplashIfSeen()) return;

        runIntro(splash);
    }

    window.initStockSystemIntro = initStockSystemIntro;
    window.skipStockSystemSplashIfSeen = skipSplashIfSeen;

    skipSplashIfSeen();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { initStockSystemIntro(); });
    } else {
        initStockSystemIntro();
    }
})();

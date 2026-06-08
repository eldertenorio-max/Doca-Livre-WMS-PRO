/**
 * Stock System — intro em 2 telas:
 *   1) logo
 *   2) tagline + barra de carregamento
 *
 * Exibida a cada recarregamento da página (sem sessionStorage de "já vi").
 * Handoff único: após login redirecionar para /entrada sem repetir a intro.
 */
(function () {
    'use strict';

    var SPLASH_ID = 'stock-system-splash';
    var NAV_SKIP_KEY = 'stock_system_intro_nav';
    var LOGO_MS = 2000;
    var LOAD_MS = 2600;
    var FADE_MS = 500;

    function qs(sel, root) { return (root || document).querySelector(sel); }

    function clearSplashPending() {
        document.documentElement.classList.remove('ss-splash-pending');
    }

    function removeSplash(splash) {
        if (!splash) return;
        document.body.classList.remove('ss-splash-active');
        clearSplashPending();
        if (splash.parentNode) splash.parentNode.removeChild(splash);
    }

    function hideSplash(splash) {
        if (!splash) return;
        splash.classList.add('ss-splash--out');
        document.body.classList.remove('ss-splash-active');
        clearSplashPending();
        setTimeout(function () { removeSplash(splash); }, FADE_MS + 80);
    }

    function shouldSkipHandoffOnce() {
        try {
            if (sessionStorage.getItem(NAV_SKIP_KEY) === '1') {
                sessionStorage.removeItem(NAV_SKIP_KEY);
                return true;
            }
        } catch (e) {}
        return false;
    }

    function resetSplashSteps(splash) {
        var stepLogo = qs('.ss-splash-step--logo', splash);
        var stepLoad = qs('.ss-splash-step--load', splash);
        if (stepLogo) {
            stepLogo.classList.add('ss-splash-step--active');
            stepLogo.setAttribute('aria-hidden', 'false');
        }
        if (stepLoad) {
            stepLoad.classList.remove('ss-splash-step--active');
            stepLoad.setAttribute('aria-hidden', 'true');
        }
        var bar = qs('.ss-splash-loader-bar', splash);
        var loader = qs('.ss-splash-loader', splash);
        if (bar) {
            bar.classList.remove('ss-splash-loader-bar--run');
            bar.style.width = '0%';
        }
        if (loader) loader.setAttribute('aria-valuenow', '0');
        splash.classList.remove('ss-splash--out');
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
            bar.classList.remove('ss-splash-loader-bar--run');
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
        resetSplashSteps(splash);
        clearSplashPending();
        document.body.classList.add('ss-splash-active');
        setTimeout(function () { goToLoadStep(splash); }, LOGO_MS);
    }

    function initStockSystemIntro(opts) {
        opts = opts || {};
        var splash = document.getElementById(SPLASH_ID);
        if (!splash) {
            clearSplashPending();
            return;
        }

        if (!opts.force && shouldSkipHandoffOnce()) {
            removeSplash(splash);
            return;
        }

        runIntro(splash);
    }

    window.initStockSystemIntro = initStockSystemIntro;
    window.markStockSystemIntroNavHandoff = function () {
        try { sessionStorage.setItem(NAV_SKIP_KEY, '1'); } catch (e) {}
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { initStockSystemIntro(); });
    } else {
        initStockSystemIntro();
    }
})();

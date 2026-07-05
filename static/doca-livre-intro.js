/**
 * Splash DOCA LIVRE — intro no login; pula após Entrar / Acessar painel.
 */
(function () {
    'use strict';

    var MIN_INTRO_MS = 2200;
    var FADE_MS = 650;
    var INTRO_SHOWN_KEY = 'dl-wms-intro-shown';
    var INTRO_SKIP_KEY = 'dl-wms-skip-intro';
    var LEGACY_KEY = 'dl-splash-done';
    var startRef = Date.now();
    var finished = false;
    var isLoginPage = document.body.classList.contains('login-page-body');

    function qs(id) { return document.getElementById(id); }

    function shouldSkipIntro() {
        try {
            if (sessionStorage.getItem(INTRO_SKIP_KEY) === '1') return true;
            /* chave legada — tratar como skip até logout */
            if (sessionStorage.getItem(LEGACY_KEY) === '1') return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    function markIntroShown() {
        /* reservado — intro só é pulada após autenticação */
    }

    function markIntroSkipAfterAuth() {
        try {
            sessionStorage.setItem(INTRO_SKIP_KEY, '1');
            sessionStorage.setItem(INTRO_SHOWN_KEY, '1');
            sessionStorage.removeItem(LEGACY_KEY);
        } catch (e) { /* ignore */ }
    }

    function clearIntroFlags() {
        try {
            sessionStorage.removeItem(INTRO_SKIP_KEY);
            sessionStorage.removeItem(INTRO_SHOWN_KEY);
            sessionStorage.removeItem(LEGACY_KEY);
        } catch (e) { /* ignore */ }
    }

    function clearPending() {
        document.documentElement.classList.remove('dl-splash-pending');
    }

    function hideSplash(splash) {
        if (!splash) return;
        splash.classList.add('intro-splash--exit');
        markIntroShown();
        setTimeout(function () {
            document.body.classList.remove('dl-splash-active');
            clearPending();
            if (splash.parentNode) splash.parentNode.removeChild(splash);
        }, FADE_MS + 40);
    }

    function skipSplash() {
        document.body.classList.remove('dl-splash-active');
        clearPending();
        var splash = qs('doca-livre-splash');
        if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    }

    function runSplash() {
        if (!isLoginPage) {
            skipSplash();
            return;
        }

        var splash = qs('doca-livre-splash');
        if (!splash) {
            clearPending();
            return;
        }

        if (shouldSkipIntro()) {
            skipSplash();
            return;
        }

        document.documentElement.classList.add('dl-splash-pending');
        document.body.classList.add('dl-splash-active');

        var bar = qs('dl-splash-bar-fill');
        var pctEl = qs('dl-splash-pct');
        var progress = splash.querySelector('.intro-progress-track');
        var progressVal = 0;

        startRef = Date.now();

        var tick = setInterval(function () {
            var elapsed = Date.now() - startRef;
            var minDone = elapsed >= MIN_INTRO_MS;

            if (minDone) {
                progressVal = Math.min(100, progressVal + 6);
            } else {
                progressVal = Math.min(88, progressVal + 1.2 + Math.random() * 2.5);
            }

            if (bar) bar.style.width = progressVal + '%';
            if (pctEl) pctEl.textContent = String(Math.round(progressVal));
            if (progress) progress.setAttribute('aria-valuenow', String(Math.round(progressVal)));

            if (!finished && minDone && progressVal >= 100) {
                finished = true;
                clearInterval(tick);
                setTimeout(function () { hideSplash(splash); }, 350);
            }
        }, 60);
    }

    function scheduleRunSplash() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runSplash);
            return;
        }
        /* Defer 1 tick: scripts inline após intro.js (ex.: ?sair=1) rodam antes */
        setTimeout(runSplash, 0);
    }

    window.dlMarkSplashDone = markIntroSkipAfterAuth;
    window.dlClearIntroFlags = clearIntroFlags;

    scheduleRunSplash();
})();

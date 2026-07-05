/**
 * Splash DOCA LIVRE — intro sempre ao abrir /login; some após animação.
 * Não usa sessionStorage para pular (evita intro nunca aparecer por flags antigas).
 */
(function () {
    'use strict';

    var MIN_INTRO_MS = 2200;
    var FADE_MS = 650;
    var startRef = Date.now();
    var finished = false;

    function qs(id) { return document.getElementById(id); }

    function clearPending() {
        document.documentElement.classList.remove('dl-splash-pending');
    }

    function hideSplash(splash) {
        if (!splash) return;
        splash.classList.add('intro-splash--exit');
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
        if (!document.body || !document.body.classList.contains('login-page-body')) {
            skipSplash();
            return;
        }

        var splash = qs('doca-livre-splash');
        if (!splash) {
            clearPending();
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

    function markIntroSkipAfterAuth() {
        /* reservado — intro não depende mais de sessionStorage */
    }

    function clearIntroFlags() {
        try {
            sessionStorage.removeItem('dl-wms-skip-intro');
            sessionStorage.removeItem('dl-wms-intro-shown');
            sessionStorage.removeItem('dl-splash-done');
        } catch (e) { /* ignore */ }
    }

    window.dlMarkSplashDone = markIntroSkipAfterAuth;
    window.dlClearIntroFlags = clearIntroFlags;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runSplash);
    } else {
        runSplash();
    }
})();

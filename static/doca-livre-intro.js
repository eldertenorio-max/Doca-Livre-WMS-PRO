/**
 * Splash DOCA LIVRE — apenas na primeira abertura do login (uma vez por sessão).
 */
(function () {
    'use strict';

    var MIN_INTRO_MS = 2200;
    var FADE_MS = 650;
    var SPLASH_DONE_KEY = 'dl-splash-done';
    var startRef = Date.now();
    var finished = false;
    var isLoginPage = document.body.classList.contains('login-page-body');

    function qs(id) { return document.getElementById(id); }

    function markSplashDone() {
        try { sessionStorage.setItem(SPLASH_DONE_KEY, '1'); } catch (e) { /* ignore */ }
    }

    function isSplashDone() {
        try { return sessionStorage.getItem(SPLASH_DONE_KEY) === '1'; } catch (e) { return false }
    }

    function clearPending() {
        document.documentElement.classList.remove('dl-splash-pending');
    }

    function hideSplash(splash) {
        if (!splash) return;
        splash.classList.add('intro-splash--exit');
        markSplashDone();
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

        if (isSplashDone()) {
            skipSplash();
            return;
        }

        var bar = qs('dl-splash-bar-fill');
        var pctEl = qs('dl-splash-pct');
        var progress = splash.querySelector('.intro-progress-track');
        var progressVal = 0;

        document.body.classList.add('dl-splash-active');
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

    window.dlMarkSplashDone = markSplashDone;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runSplash);
    } else {
        runSplash();
    }
})();

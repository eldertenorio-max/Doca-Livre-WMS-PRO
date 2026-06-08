/**
 * Stock System — intro na abertura da página.
 *
 * Substitua os arquivos no Canva e salve em static/:
 *   stock-system-logo.png   (recomendado: 560×160 px, fundo transparente)
 *   stock-system-intro.mp4  (opcional: vídeo curto 2–4 s, sem áudio)
 *
 * A intro aparece uma vez por sessão do navegador (sessionStorage).
 */
(function () {
    'use strict';

    var SPLASH_ID = 'stock-system-splash';
    var STORAGE_KEY = 'stock_system_intro_v1';
    var MIN_MS = 1800;
    var MAX_MS = 6000;

    function qs(sel) { return document.querySelector(sel); }

    function hideSplash(splash) {
        if (!splash) return;
        splash.classList.add('ss-splash--out');
        document.body.classList.remove('ss-splash-active');
        try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
        setTimeout(function () {
            if (splash.parentNode) splash.parentNode.removeChild(splash);
        }, 600);
    }

    function finishSplash(splash, startTs) {
        var elapsed = Date.now() - startTs;
        var wait = Math.max(0, MIN_MS - elapsed);
        setTimeout(function () { hideSplash(splash); }, wait);
    }

    function tryVideo(splash, startTs) {
        var video = qs('#ss-splash-video');
        if (!video) {
            finishSplash(splash, startTs);
            return;
        }
        var srcMp4 = video.getAttribute('data-src-mp4');
        if (!srcMp4) {
            finishSplash(splash, startTs);
            return;
        }
        var probe = document.createElement('video');
        probe.muted = true;
        probe.preload = 'metadata';
        probe.src = srcMp4;
        probe.onloadeddata = function () {
            splash.classList.add('ss-splash--video');
            video.style.display = 'block';
            video.src = srcMp4;
            video.muted = true;
            video.playsInline = true;
            video.play().catch(function () { finishSplash(splash, startTs); });
            video.onended = function () { finishSplash(splash, startTs); };
            setTimeout(function () { hideSplash(splash); }, MAX_MS);
        };
        probe.onerror = function () {
            finishSplash(splash, startTs);
        };
    }

    function initStockSystemIntro(opts) {
        opts = opts || {};
        if (!opts.force) {
            try {
                if (sessionStorage.getItem(STORAGE_KEY) === '1') return;
            } catch (e) {}
        }

        var splash = document.getElementById(SPLASH_ID);
        if (!splash) return;

        document.body.classList.add('ss-splash-active');
        var startTs = Date.now();
        tryVideo(splash, startTs);
        setTimeout(function () {
            if (document.getElementById(SPLASH_ID)) hideSplash(splash);
        }, MAX_MS + 500);
    }

    window.initStockSystemIntro = initStockSystemIntro;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { initStockSystemIntro(); });
    } else {
        initStockSystemIntro();
    }
})();

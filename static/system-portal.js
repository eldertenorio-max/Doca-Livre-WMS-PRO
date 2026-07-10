/**
 * Portal Doca Livre Sistemas — fluxo splash → seletor → entrada/login (WMS Pro)
 */
(function () {
    'use strict';

    var CURRENT_SYSTEM_ID = 'pro';
    var MIN_INTRO_MS = 2200;
    var FADE_MS = 650;

    var PRODUCTION_URLS = {
        light: 'https://doca-livre-wms-light.onrender.com/',
        plus: 'https://wms.docalivre.com.br/',
        pro: 'https://doca-livre-wms-pro.onrender.com/',
        original: 'https://sistema.docalivre.com.br/login'
    };

    var SYSTEMS = [
        {
            id: 'light',
            variant: 'Light',
            productName: 'WMS',
            logoSrc: '/static/systems/logo-wms-light.png',
            url: PRODUCTION_URLS.light
        },
        {
            id: 'plus',
            variant: 'Plus',
            productName: 'WMS',
            logoSrc: '/static/systems/logo-wms-plus.png',
            url: PRODUCTION_URLS.plus
        },
        {
            id: 'pro',
            variant: 'Pro',
            productName: 'WMS',
            logoSrc: '/static/systems/logo-wms-pro.png',
            url: null
        },
        {
            id: 'original',
            variant: 'Original',
            logoSrc: '/static/systems/logo-original.png',
            logoOnly: true,
            url: PRODUCTION_URLS.original
        }
    ];

    var state = {
        companyIntroDone: false,
        selectedSystemId: null
    };

    function qs(sel, root) {
        return (root || document).querySelector(sel);
    }

    function getSystemById(id) {
        for (var i = 0; i < SYSTEMS.length; i++) {
            if (SYSTEMS[i].id === id) return SYSTEMS[i];
        }
        return null;
    }

    function systemTitle(system) {
        if (system.productName) {
            return 'Doca Livre ' + system.productName + ' ' + system.variant;
        }
        return 'Doca Livre ' + system.variant;
    }

    function renderBrandMark(system, compact) {
        var wrap = document.createElement('div');
        wrap.className = 'brand-mark brand-mark--system' +
            (system.logoOnly ? ' brand-mark--logo-only' : '') +
            (compact ? ' brand-mark--compact' : '');
        wrap.setAttribute('aria-label', systemTitle(system));

        var img = document.createElement('img');
        img.src = system.logoSrc;
        img.alt = '';
        img.className = 'brand-mark__logo';
        wrap.appendChild(img);

        if (!system.logoOnly) {
            var name = document.createElement('p');
            name.className = 'brand-mark__name';
            name.setAttribute('aria-hidden', 'true');
            if (system.productName) {
                var wms = document.createElement('span');
                wms.className = 'brand-mark__wms';
                wms.textContent = system.productName;
                name.appendChild(wms);
            }
            var variant = document.createElement('span');
            variant.className = 'brand-mark__variant';
            variant.textContent = system.variant;
            name.appendChild(variant);
            wrap.appendChild(name);
        }
        return wrap;
    }

    function buildSelector() {
        var grid = qs('#portal-system-grid');
        if (!grid) return;
        grid.innerHTML = '';
        SYSTEMS.forEach(function (system) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'system-selector__card' +
                (system.logoOnly ? ' system-selector__card--original' : '');
            btn.setAttribute('data-system-id', system.id);
            btn.appendChild(renderBrandMark(system, true));
            btn.addEventListener('click', function () {
                handleSystemSelect(system.id);
            });
            grid.appendChild(btn);
        });
    }

    function showStage(stageId) {
        ['portal-splash', 'portal-selector', 'portal-entry', 'portal-login'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            if (id === stageId) {
                el.hidden = false;
            } else {
                el.hidden = true;
            }
        });
        document.body.classList.toggle('portal-splash-active', stageId === 'portal-splash');
    }

    function handleSystemSelect(id) {
        state.selectedSystemId = id;
        var system = getSystemById(id);
        if (!system) return;

        if (system.url) {
            showEntryScreen(system);
        } else {
            showLoginScreen();
        }
    }

    function showEntryScreen(system) {
        var brand = qs('#portal-entry-brand');
        var enterBtn = qs('#portal-entry-enter');
        var titleEl = qs('#portal-entry-title');
        if (brand) {
            brand.innerHTML = '';
            brand.className = 'system-entry__brand' +
                (system.logoOnly ? ' system-entry__brand--original' : '');
            brand.appendChild(renderBrandMark(system, false));
        }
        if (enterBtn) {
            enterBtn.textContent = 'Acessar ' + systemTitle(system);
            enterBtn.onclick = function () {
                window.location.assign(system.url);
            };
        }
        if (titleEl) titleEl.textContent = systemTitle(system);
        showStage('portal-entry');
    }

    function showLoginScreen() {
        showStage('portal-login');
        var userInput = document.getElementById('usuario');
        if (userInput) {
            try { userInput.focus(); } catch (e) { /* ignore */ }
        }
    }

    function handleBackToSelector() {
        state.selectedSystemId = null;
        showStage('portal-selector');
    }

    function runCompanySplash() {
        var splash = document.getElementById('portal-splash');
        if (!splash) {
            state.companyIntroDone = true;
            showStage('portal-selector');
            return;
        }

        showStage('portal-splash');
        var bar = document.getElementById('portal-splash-bar');
        var pctEl = document.getElementById('portal-splash-pct');
        var startRef = Date.now();
        var progressVal = 0;
        var finished = false;

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

            if (!finished && minDone && progressVal >= 100) {
                finished = true;
                clearInterval(tick);
                setTimeout(function () {
                    splash.classList.add('intro-splash--exit');
                    setTimeout(function () {
                        state.companyIntroDone = true;
                        splash.hidden = true;
                        showStage('portal-selector');
                    }, FADE_MS);
                }, 350);
            }
        }, 60);
    }

    function bindBackButtons() {
        document.querySelectorAll('[data-portal-back]').forEach(function (btn) {
            btn.addEventListener('click', handleBackToSelector);
        });
    }

    window.portalBackToSelector = handleBackToSelector;

    function init() {
        if (!document.body.classList.contains('portal-page-body')) return;
        buildSelector();
        bindBackButtons();
        runCompanySplash();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

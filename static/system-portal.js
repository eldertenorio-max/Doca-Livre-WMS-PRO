/**
 * Portal Doca Livre Sistemas — splash → login → hub Light/Plus/Pro
 */
(function () {
    'use strict';

    var MIN_INTRO_MS = 2200;
    var FADE_MS = 650;

    var cfg = window.PORTAL_CONFIG || {};
    var SYSTEM_URLS = Object.assign({
        light: 'https://doca-livre-wms-light.onrender.com/',
        plus: 'https://wms.docalivre.com.br/'
    }, cfg.systemUrls || {});

    var SYSTEMS = [
        {
            id: 'light',
            variant: 'Light',
            productName: 'WMS',
            logoSrc: '/static/systems/logo-wms-light.png',
            kind: 'sso'
        },
        {
            id: 'plus',
            variant: 'Plus',
            productName: 'WMS',
            logoSrc: '/static/systems/logo-wms-plus.png',
            kind: 'sso'
        },
        {
            id: 'pro',
            variant: 'Pro',
            productName: 'WMS',
            logoSrc: '/static/systems/logo-wms-pro.png',
            kind: 'local',
            href: '/entrada'
        }
    ];

    var state = {
        companyIntroDone: false,
        loggedIn: Boolean(cfg.usuario),
        usuario: (cfg.usuario || '').trim(),
        busySystemId: null
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
            (compact ? ' brand-mark--compact' : '');
        wrap.setAttribute('aria-label', systemTitle(system));

        var img = document.createElement('img');
        img.src = system.logoSrc;
        img.alt = '';
        img.className = 'brand-mark__logo';
        wrap.appendChild(img);

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
        return wrap;
    }

    function updateHubHeader() {
        var sub = qs('.system-selector__subtitle');
        var title = qs('.system-selector__title');
        if (title) title.textContent = 'Escolha o sistema';
        if (sub) {
            sub.textContent = state.usuario
                ? ('Olá, ' + state.usuario + ' — selecione Light, Plus ou Pro')
                : 'Selecione Light, Plus ou Pro';
        }
        var sair = qs('#portal-hub-sair');
        if (sair) sair.hidden = !state.loggedIn;
    }

    function buildSelector() {
        var grid = qs('#portal-system-grid');
        if (!grid) return;
        grid.innerHTML = '';
        SYSTEMS.forEach(function (system) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'system-selector__card';
            btn.setAttribute('data-system-id', system.id);
            btn.appendChild(renderBrandMark(system, true));
            btn.addEventListener('click', function () {
                handleSystemSelect(system.id);
            });
            grid.appendChild(btn);
        });
        updateHubHeader();
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
        document.body.classList.toggle('portal-hub-active', stageId === 'portal-selector');
    }

    function showLoginScreen() {
        showStage('portal-login');
        var back = qs('#portal-login [data-portal-back]');
        if (back) back.hidden = true;
        var userInput = document.getElementById('usuario');
        if (userInput) {
            try { userInput.focus(); } catch (e) { /* ignore */ }
        }
    }

    function showHub() {
        state.loggedIn = true;
        updateHubHeader();
        showStage('portal-selector');
    }

    function setHubError(msg) {
        var el = qs('#portal-hub-erro');
        if (!el) return;
        el.textContent = msg || '';
        el.hidden = !msg;
    }

    function handleSystemSelect(id) {
        var system = getSystemById(id);
        if (!system || state.busySystemId) return;
        setHubError('');

        if (system.kind === 'local') {
            window.location.assign(system.href || '/entrada');
            return;
        }

        state.busySystemId = id;
        fetch((window.API_BASE || '/api') + '/sso/issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ system: id })
        }).then(function (r) {
            return r.json().catch(function () {
                return { ok: false, erro: 'Resposta inválida do servidor.' };
            }).then(function (data) {
                if (!r.ok && !data.erro) data.erro = 'Falha ao abrir o sistema.';
                return data;
            });
        }).then(function (data) {
            if (data && data.ok && data.url) {
                window.location.assign(data.url);
                return;
            }
            setHubError((data && data.erro) || 'Não foi possível abrir o sistema.');
        }).catch(function () {
            setHubError('Falha de conexão ao emitir acesso SSO.');
        }).finally(function () {
            state.busySystemId = null;
        });
    }

    function runCompanySplash() {
        var splash = document.getElementById('portal-splash');
        var afterSplash = function () {
            state.companyIntroDone = true;
            if (state.loggedIn) {
                showHub();
            } else {
                showLoginScreen();
            }
        };

        if (!splash) {
            afterSplash();
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
                        splash.hidden = true;
                        afterSplash();
                    }, FADE_MS);
                }, 350);
            }
        }, 60);
    }

    function bindHubChrome() {
        var sair = qs('#portal-hub-sair');
        if (sair) {
            sair.addEventListener('click', function () {
                window.location.assign('/login?sair=1');
            });
        }
    }

    /** Chamado após login AJAX sem reload completo. */
    window.portalShowHub = function (usuario) {
        state.usuario = (usuario || '').trim();
        state.loggedIn = Boolean(state.usuario);
        if (cfg) cfg.usuario = state.usuario;
        showHub();
    };

    window.portalBackToSelector = function () {
        if (state.loggedIn) showHub();
        else showLoginScreen();
    };

    function init() {
        if (!document.body.classList.contains('portal-page-body')) return;
        buildSelector();
        bindHubChrome();
        runCompanySplash();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

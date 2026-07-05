/**
 * PWA — instalação no mobile e desktop (igual Ultrafrio / Doca Livre).
 */
(function () {
  'use strict';

  var DISMISS_SESSION_KEY = 'dl-wms-pwa-install-dismissed-session'
  var deferred = null
  var installed = isStandalone()
  var dismissed = readDismissed()
  var showHelp = false
  var root = null

  function isStandalone() {
    if (typeof window === 'undefined') return false
    var mq = window.matchMedia('(display-mode: standalone)').matches
    var iosStandalone = window.navigator.standalone === true
    return mq || iosStandalone
  }

  function readDismissed() {
    try { return sessionStorage.getItem(DISMISS_SESSION_KEY) === '1' } catch (e) { return false }
  }

  function isIos() {
    var ua = navigator.userAgent || ''
    var iOSDevice = /iphone|ipad|ipod/i.test(ua)
    var iPadOs = /Macintosh/.test(ua) && 'ontouchend' in document
    return iOSDevice || iPadOs
  }

  function isSafari() {
    var ua = navigator.userAgent || ''
    return /safari/i.test(ua) && !/chrome|crios|fxios|edgios/i.test(ua)
  }

  function isAndroidChrome() {
    var ua = navigator.userAgent || ''
    return /android/i.test(ua) && /chrome/i.test(ua) && !/edga|opr|samsungbrowser|firefox/i.test(ua)
  }

  function isDesktopChrome() {
    var ua = navigator.userAgent || ''
    return !/android|iphone|ipad|ipod/i.test(ua) && /chrome/i.test(ua) && !/edg|opr|firefox/i.test(ua)
  }

  function canInstall() {
    return deferred != null && !installed
  }

  function shouldShowBanner() {
    if (installed || dismissed) return false
    if (canInstall()) return true
    if (isIos() && isSafari()) return true
    if (isAndroidChrome()) return true
    if (isDesktopChrome()) return true
    return false
  }

  function dismiss() {
    dismissed = true
    try { sessionStorage.setItem(DISMISS_SESSION_KEY, '1') } catch (e) { /* ignore */ }
    render()
  }

  function promptInstall() {
    if (!deferred) return Promise.resolve()
    return deferred.prompt().then(function () {
      return deferred.userChoice
    }).then(function (choice) {
      if (choice && choice.outcome === 'accepted') installed = true
      deferred = null
      render()
    }).catch(function () { /* ignore */ })
  }

  function helpHtml() {
    if (!showHelp) return ''
    if (isIos() && isSafari()) {
      return '<span class="pwa-install-ios-help">Toque em <span class="pwa-ios-share" aria-hidden="true">⎋</span> Compartilhar e depois em “Adicionar à Tela de Início”.</span>'
    }
    if (isAndroidChrome() && !canInstall()) {
      return '<span class="pwa-install-ios-help">Se a opção não aparecer, feche e abra o Chrome, toque nos 3 pontos e escolha “Instalar app” ou “Adicionar à tela inicial”.</span>'
    }
    if (isDesktopChrome() && !canInstall()) {
      return '<span class="pwa-install-ios-help">Se a opção não aparecer, clique no ícone de instalação na barra de endereço ou vá em ⋮ &gt; Instalar página como app.</span>'
    }
    return ''
  }

  function render() {
    if (!root) return
    if (!shouldShowBanner()) {
      root.innerHTML = ''
      root.hidden = true
      return
    }
    root.hidden = false
    var iconSrc = (window.DL_PWA_ICON || '/static/icons/icon-192.png')
    var actionBtn = canInstall()
      ? '<button type="button" class="pwa-install-btn" id="pwa-install-btn">Instalar</button>'
      : '<button type="button" class="pwa-install-btn" id="pwa-install-help-btn">Como instalar</button>'

    root.innerHTML =
      '<div class="pwa-install-banner" role="dialog" aria-label="Instalar aplicativo">' +
        '<div class="pwa-install-icon" aria-hidden="true"><img src="' + iconSrc + '" alt="" width="40" height="40"></div>' +
        '<div class="pwa-install-text">' +
          '<strong>Instalar WMS DOCA LIVRE PRO</strong>' +
          '<span>Adicione o app à tela inicial para abrir mais rápido e em tela cheia.</span>' +
          helpHtml() +
        '</div>' +
        '<div class="pwa-install-actions">' +
          actionBtn +
          '<button type="button" class="pwa-install-close" id="pwa-install-close" aria-label="Dispensar">✕</button>' +
        '</div>' +
      '</div>'

    var installBtn = document.getElementById('pwa-install-btn')
    var helpBtn = document.getElementById('pwa-install-help-btn')
    var closeBtn = document.getElementById('pwa-install-close')
    if (installBtn) installBtn.addEventListener('click', function () { void promptInstall() })
    if (helpBtn) helpBtn.addEventListener('click', function () { showHelp = !showHelp; render() })
    if (closeBtn) closeBtn.addEventListener('click', dismiss)
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* ignore */ })
    })
  }

  function init() {
    root = document.getElementById('pwa-install-root')
    if (!root) return

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault()
      deferred = e
      dismissed = false
      try { sessionStorage.removeItem(DISMISS_SESSION_KEY) } catch (err) { /* ignore */ }
      render()
    })

    window.addEventListener('appinstalled', function () {
      installed = true
      deferred = null
      render()
    })

    var mq = window.matchMedia('(display-mode: standalone)')
    var syncStandalone = function () {
      installed = isStandalone()
      render()
    }
    if (mq.addEventListener) mq.addEventListener('change', syncStandalone)
    else if (mq.addListener) mq.addListener(syncStandalone)
    window.addEventListener('focus', syncStandalone)
    document.addEventListener('visibilitychange', syncStandalone)

    registerServiceWorker()
    render()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()

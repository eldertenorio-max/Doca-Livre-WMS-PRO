/**
 * Formulários de login/cadastro no portal WMS Pro
 * Após login bem-sucedido: hub de sistemas (não vai direto ao /entrada).
 */
(function () {
    'use strict';

    var cardLogin = document.getElementById('card-login');
    var cardCadastro = document.getElementById('card-cadastro');
    var formLogin = document.getElementById('form-login');
    var formCadastro = document.getElementById('form-cadastro');
    if (!formLogin || !cardLogin) return;

    var msgErroLogin = document.getElementById('msg-erro-login');
    var msgErroCadastro = document.getElementById('msg-erro-cadastro');
    var btnEntrar = document.getElementById('btn-entrar');
    var btnCadastrar = document.getElementById('btn-cadastrar');

    function mostrarErro(el, texto) {
        if (!el) return;
        el.textContent = texto || '';
        el.hidden = !texto;
    }

    function showCard(show, hide) {
        hide.setAttribute('aria-hidden', 'true');
        hide.classList.remove('login-card-visible');
        hide.classList.add('login-card-hidden');
        show.setAttribute('aria-hidden', 'false');
        show.classList.remove('login-card-hidden');
        show.classList.add('login-card-visible');
    }

    var btnCadastro = document.getElementById('mostrar-cadastro');
    var btnLogin = document.getElementById('mostrar-login');
    if (btnCadastro) {
        btnCadastro.addEventListener('click', function () {
            mostrarErro(msgErroCadastro);
            showCard(cardCadastro, cardLogin);
        });
    }
    if (btnLogin) {
        btnLogin.addEventListener('click', function () {
            mostrarErro(msgErroLogin);
            showCard(cardLogin, cardCadastro);
        });
    }

    function toggleSenha(inputId, btnId) {
        var input = document.getElementById(inputId);
        var btn = document.getElementById(btnId);
        if (!input || !btn) return;
        var open = btn.querySelector('.icon-eye-open');
        var closed = btn.querySelector('.icon-eye-closed');
        if (input.type === 'password') {
            input.type = 'text';
            btn.setAttribute('aria-label', 'Ocultar senha');
            btn.title = 'Ocultar senha';
            if (open) open.hidden = true;
            if (closed) closed.hidden = false;
        } else {
            input.type = 'password';
            btn.setAttribute('aria-label', 'Mostrar senha');
            btn.title = 'Mostrar senha';
            if (open) open.hidden = false;
            if (closed) closed.hidden = true;
        }
    }

    var toggleSenhaBtn = document.getElementById('toggle-senha');
    if (toggleSenhaBtn) toggleSenhaBtn.addEventListener('click', function () { toggleSenha('senha', 'toggle-senha'); });
    var toggleCadSenha = document.getElementById('toggle-cad-senha');
    if (toggleCadSenha) toggleCadSenha.addEventListener('click', function () { toggleSenha('cad-senha', 'toggle-cad-senha'); });
    var toggleCadConfirmar = document.getElementById('toggle-cad-confirmar');
    if (toggleCadConfirmar) toggleCadConfirmar.addEventListener('click', function () { toggleSenha('cad-confirmar', 'toggle-cad-confirmar'); });

    formLogin.addEventListener('submit', function (e) {
        e.preventDefault();
        mostrarErro(msgErroLogin);
        btnEntrar.disabled = true;
        var usuarioVal = document.getElementById('usuario').value.trim();
        fetch((window.API_BASE || '/api') + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                usuario: usuarioVal,
                senha: document.getElementById('senha').value
            })
        }).then(function (r) { return r.json(); }).then(function (data) {
            if (data.ok) {
                if (data.access_token) {
                    try { localStorage.setItem('access_token', data.access_token); } catch (err) {}
                    try { localStorage.setItem('usuario', data.usuario || usuarioVal); } catch (err) {}
                }
                if (data.hub && typeof window.portalShowHub === 'function') {
                    window.portalShowHub(data.usuario || usuarioVal);
                    return;
                }
                window.location.href = (data.redirect || '/');
                return;
            }
            mostrarErro(msgErroLogin, data.erro || 'Erro ao entrar.');
        }).catch(function () {
            mostrarErro(msgErroLogin, 'Falha de conexão. Tente novamente.');
        }).finally(function () {
            btnEntrar.disabled = false;
        });
    });

    if (formCadastro) {
        formCadastro.addEventListener('submit', function (e) {
            e.preventDefault();
            mostrarErro(msgErroCadastro);
            var senha = document.getElementById('cad-senha').value;
            var confirmar = document.getElementById('cad-confirmar').value;
            if (senha !== confirmar) {
                mostrarErro(msgErroCadastro, 'As senhas não coincidem.');
                return;
            }
            btnCadastrar.disabled = true;
            fetch((window.API_BASE || '/api') + '/cadastrar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usuario: document.getElementById('cad-usuario').value.trim(),
                    senha: senha,
                    confirmar_senha: confirmar
                })
            }).then(function (r) {
                return r.json().catch(function () { return { ok: false, erro: 'Erro inesperado no cadastro.' }; }).then(function (data) {
                    if (!r.ok && !data.erro) data.erro = 'Erro ao cadastrar.';
                    return data;
                });
            }).then(function (data) {
                if (data.ok) {
                    showCard(cardLogin, cardCadastro);
                    mostrarErro(msgErroLogin);
                    msgErroLogin.textContent = data.mensagem || 'Cadastro realizado. Faça login.';
                    msgErroLogin.hidden = false;
                    msgErroLogin.classList.remove('msg-erro');
                    msgErroLogin.classList.add('msg-sucesso');
                    setTimeout(function () {
                        msgErroLogin.classList.add('msg-erro');
                        msgErroLogin.classList.remove('msg-sucesso');
                    }, 5000);
                    return;
                }
                mostrarErro(msgErroCadastro, data.erro || 'Erro ao cadastrar.');
            }).catch(function () {
                mostrarErro(msgErroCadastro, 'Falha de conexão. Tente novamente.');
            }).finally(function () {
                btnCadastrar.disabled = false;
            });
        });
    }
})();

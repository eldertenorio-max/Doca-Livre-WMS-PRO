/* Agendamentos do Hub de Integração destinados ao WMS Pro. */
(function () {
  function hubApiBase() {
    var raw = (window.WMS_HUB_API_URL || '').toString().trim();
    if (!raw) raw = 'https://dockhub-api.onrender.com';
    return raw.replace(/\/$/, '');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDataHora(data, hora) {
    if (!data && !hora) return '—';
    if (!data) return hora || '—';
    var d = new Date(data);
    var dia = isNaN(d.getTime()) ? String(data).slice(0, 10) : d.toLocaleDateString('pt-BR');
    return hora ? dia + ' ' + hora : dia;
  }

  function labelStatus(status) {
    var map = {
      agendado: 'Agendado',
      na_fila: 'Na fila',
      processando: 'Processando',
      em_analise: 'Em análise',
      reagendando: 'Reagendando',
      rejeitado: 'Rejeitado',
      erro: 'Erro',
      cancelado: 'Cancelado',
      rascunho: 'Rascunho',
    };
    return map[status] || status || '—';
  }

  async function loadWmsHubTab() {
    var tbody = document.getElementById('wms-tbody-hub');
    var msg = document.getElementById('wms-hub-msg');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Carregando agendamentos do Hub...</td></tr>';
    if (msg) msg.textContent = '';
    try {
      var res = await fetch(hubApiBase() + '/api/public/wms/previsoes?wms=pro', {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('Hub indisponível (' + res.status + ').');
      var items = await res.json();
      if (!Array.isArray(items) || items.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="7" class="loading">Nenhum agendamento destinado ao Pro. No Hub, use a aba Integração WMS.</td></tr>';
        return;
      }
      tbody.innerHTML = items
        .map(function (prev) {
          var nf = prev.nota_fiscal ? 'NF ' + prev.nota_fiscal : 'Pedido ' + (prev.numero_pedido || prev.id);
          var cliente = (prev.cliente || '—') + (prev.portal ? ' · ' + prev.portal : '');
          var quando = formatDataHora(prev.data_confirmada, prev.hora_confirmada);
          if (quando === '—') quando = formatDataHora(prev.data_solicitada, prev.hora_solicitada);
          return (
            '<tr>' +
            '<td>' +
            esc(nf) +
            '</td>' +
            '<td>' +
            esc(cliente) +
            '</td>' +
            '<td>' +
            esc(labelStatus(prev.status)) +
            '</td>' +
            '<td>' +
            esc(quando) +
            '</td>' +
            '<td>' +
            esc(prev.placa || '—') +
            '</td>' +
            '<td>' +
            esc(prev.volumes != null ? prev.volumes : '—') +
            '</td>' +
            '<td>' +
            esc(prev.protocolo || '—') +
            '</td>' +
            '</tr>'
          );
        })
        .join('');
    } catch (err) {
      var texto = err && err.message ? err.message : 'Falha ao ler o Hub.';
      tbody.innerHTML = '<tr><td colspan="7" class="loading">' + esc(texto) + '</td></tr>';
      if (msg) msg.textContent = texto + ' Confira HUB_API_URL no Render e CORS_ORIGINS no Hub.';
    }
  }

  window.loadWmsHubTab = loadWmsHubTab;

  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('#btn-wms-hub-atualizar') : null;
    if (btn) loadWmsHubTab();
  });
})();

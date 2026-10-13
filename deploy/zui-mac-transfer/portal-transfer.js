/* zui-mac-transfer: "Transferir ativação" in /minhas-listas (presentation + one API call). */
(function (w, d) {
  function el(tag, attrs, text) { var e = d.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; }
  function fmt(v) { var x = v.replace(/[^0-9a-f]/gi, '').slice(0, 12).toUpperCase(); return (x.match(/.{1,2}/g) || []).join(':'); }
  function build() {
    var account = d.getElementById('accountView'), logout = d.getElementById('logout');
    if (!account || !logout || d.getElementById('macTransferOpen')) return;
    var open = el('button', {type: 'button', id: 'macTransferOpen', class: logout.className || ''}, 'Transferir ativação');
    logout.parentNode.insertBefore(open, logout);
    var dlg = el('dialog', {id: 'macTransferDialog', style: 'max-width:480px;width:92%;border:1px solid rgba(255,255,255,.15);border-radius:16px;background:#111827;color:#e5e7eb;padding:22px'});
    dlg.innerHTML = '<h3 style="margin:0 0 10px">Transferir ativação para outro aparelho</h3>' +
      '<p style="background:rgba(59,130,246,.12);border-radius:10px;padding:10px;font-size:14px">A licença e as playlists deste aparelho passam para o aparelho novo. Os dados do aparelho novo (se houver) vêm para este. Reinicie o app nos dois aparelhos depois.</p>' +
      '<form id="macTransferForm"><label>MAC atual<input id="mtFrom" disabled style="width:100%"></label>' +
      '<label>MAC do aparelho novo<input id="mtMac" required autocomplete="off" placeholder="00:00:00:00:00:00" style="width:100%"></label>' +
      '<label>Chave do aparelho novo<input id="mtKey" required autocomplete="off" placeholder="Exibida na tela do app" style="width:100%"></label>' +
      '<p id="mtInfo" style="background:rgba(234,179,8,.12);border-radius:10px;padding:10px;font-size:14px"></p><p id="mtMsg" role="alert"></p>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" id="mtCancel">Cancelar</button><button type="submit" id="mtSend">Transferir</button></div></form>';
    d.body.appendChild(dlg);
    var mac = d.getElementById('mtMac'), msg = d.getElementById('mtMsg'), send = d.getElementById('mtSend');
    mac.addEventListener('input', function () { mac.value = fmt(mac.value); });
    d.getElementById('mtCancel').onclick = function () { dlg.close(); };
    open.onclick = function () {
      msg.textContent = ''; send.disabled = false;
      fetch('/api/client/transfer', {credentials: 'same-origin', headers: {'X-ZUI-Session': 'cookie'}}).then(function (r) { return r.json().then(function (j) { return {ok: r.ok, j: j}; }); }).then(function (r) {
        if (!r.ok) { alert(r.j.error || 'Não foi possível abrir a transferência.'); return; }
        d.getElementById('mtFrom').value = r.j.mac;
        d.getElementById('mtInfo').textContent = 'Cada ativação pode ser transferida até 3 vezes. Restam ' + r.j.remaining + '.';
        send.disabled = r.j.remaining < 1; dlg.showModal();
      });
    };
    d.getElementById('macTransferForm').onsubmit = function (e) {
      e.preventDefault();
      if (!confirm('Confirma transferir a ativação para ' + mac.value + '?')) return;
      send.disabled = true; msg.textContent = 'Transferindo...';
      fetch('/api/client/transfer', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'X-ZUI-Session': 'cookie'},
        body: JSON.stringify({newMac: mac.value, newKey: d.getElementById('mtKey').value})})
        .then(function (r) { return r.json().then(function (j) { return {ok: r.ok, j: j}; }); })
        .then(function (r) {
          if (!r.ok) { msg.textContent = r.j.error || 'Falha na transferência.'; send.disabled = false; return; }
          msg.textContent = 'Ativação transferida para ' + r.j.newMac + '. Reinicie o app nos dois aparelhos.';
          setTimeout(function () { w.location.reload(); }, 3500);
        }, function () { msg.textContent = 'Falha de conexão.'; send.disabled = false; });
    };
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', build); else build();
})(window, document);

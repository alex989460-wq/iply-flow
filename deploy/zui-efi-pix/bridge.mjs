// ZUI Efí Pix bridge: implements ZUI's "external" payment provider using the
// Super Gestor admin Efí account. Polls Efí for payment (does not register a
// webhook, so Super Gestor's existing Efí webhook stays untouched) and notifies
// ZUI through its HMAC-signed /api/payments/webhook/external endpoint.
import http from 'node:http';
import https from 'node:https';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const env = (k, d) => process.env[k] ?? d;
const PORT = Number(env('PORT', '18790'));
const STATE = env('STATE_FILE', '/var/lib/zui-efi-pix/orders.json');
const ZUI = env('ZUI_WEBHOOK', 'http://127.0.0.1:18787/api/payments/webhook/external');
const SECRET = env('ZUI_WEBHOOK_SECRET');
const PIX_KEY = env('EFI_PIX_KEY');
const CID = env('EFI_CLIENT_ID'), CSEC = env('EFI_CLIENT_SECRET');
const BASE = env('EFI_BASE', 'https://pix.api.efipay.com.br');
const RETURN_ORIGIN = env('RETURN_ORIGIN', 'https://zuiplayer.com');
export const ALLOWED = new Map([[1990, 'Licença anual'], [3490, 'Licença vitalícia']]);
const agent = new https.Agent({ cert: readFileSync(env('EFI_CERT')), key: readFileSync(env('EFI_KEY')), keepAlive: true });

let state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => { writeFileSync(STATE + '.tmp', JSON.stringify(state)); renameSync(STATE + '.tmp', STATE); };

function efi(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    else headers.Authorization = 'Basic ' + Buffer.from(CID + ':' + CSEC).toString('base64');
    const req = https.request(BASE + path, { method, agent, headers, timeout: 15000 }, (r) => {
      let s = ''; r.on('data', (c) => (s += c)); r.on('end', () => { let j = {}; try { j = JSON.parse(s); } catch {} resolve({ status: r.statusCode, body: j }); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    if (data) req.write(data); req.end();
  });
}
let tok = null, tokExp = 0;
async function token() {
  if (tok && Date.now() < tokExp) return tok;
  const r = await efi('POST', '/oauth/token', { grant_type: 'client_credentials' });
  if (r.status !== 200) throw new Error('efi_auth_' + r.status);
  tok = r.body.access_token; tokExp = Date.now() + (r.body.expires_in - 60) * 1000; return tok;
}

export function validInput(q) {
  const orderId = String(q.get('orderId') || ''), amount = Number(q.get('amount')), currency = String(q.get('currency') || '');
  const returnUrl = String(q.get('returnUrl') || '');
  if (!/^[a-f0-9]{32}$/.test(orderId) || !ALLOWED.has(amount) || currency !== 'brl') return null;
  let ret; try { ret = new URL(returnUrl); } catch { return null; }
  if (ret.origin !== RETURN_ORIGIN) return null;
  return { orderId, amount, returnUrl: ret.href };
}

async function createCob(o) {
  const t = await token(), txid = 'ZUI' + o.orderId;
  const cob = await efi('PUT', '/v2/cob/' + txid, { calendario: { expiracao: 86400 }, valor: { original: (o.amount / 100).toFixed(2) }, chave: PIX_KEY, solicitacaoPagador: 'ZUI Player - ' + ALLOWED.get(o.amount) }, t);
  if (cob.status < 200 || cob.status >= 300) throw new Error('cob_' + cob.status);
  let qr = '';
  if (cob.body.loc?.id) { const q = await efi('GET', '/v2/loc/' + cob.body.loc.id + '/qrcode', null, t); qr = q.body.imagemQrcode || ''; }
  return { txid, copia: cob.body.pixCopiaECola || '', qr };
}

async function notify(o) {
  const raw = JSON.stringify({ orderId: o.orderId, status: 'paid', amount: o.amount, currency: 'brl' });
  const sig = createHmac('sha256', SECRET).update(raw).digest('hex');
  const r = await fetch(ZUI, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-payment-signature': sig }, body: raw, signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (r.ok && (j.ok || j.duplicate)) { o.notified = Date.now(); save(); }
  else console.error('[zui-efi-pix] notify failed', o.orderId, r.status, JSON.stringify(j));
}

async function check(o) {
  if (o.notified) return true;
  if (!o.paid) {
    const r = await efi('GET', '/v2/cob/' + o.txid, null, await token());
    const paidOk = r.status === 200 && r.body.status === 'CONCLUIDA' && Math.round(Number(r.body.valor?.original) * 100) === o.amount && (r.body.pix || []).length > 0;
    if (!paidOk) return false;
    o.paid = Date.now(); save();
  }
  await notify(o); return !!o.notified;
}

setInterval(async () => {
  for (const o of Object.values(state)) {
    if (o.notified || Date.now() - o.created > 26 * 3600e3) continue;
    try { await check(o); } catch (e) { console.error('[zui-efi-pix] poll', o.orderId, e.message); }
  }
}, 30000).unref?.();

const hits = new Map();
function limited(ip) { const now = Date.now(), a = (hits.get(ip) || []).filter((t) => now - t < 600000); a.push(now); hits.set(ip, a); return a.length > 20; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const SEC = { 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' };

function page(o) {
  const price = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.amount / 100);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZUI Player · Pagar com Pix</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080B12;color:#EEF2F8;font-family:system-ui,sans-serif;padding:20px;box-sizing:border-box}
.c{width:100%;max-width:420px;background:#111827;border:1px solid #1F2A3D;border-radius:20px;padding:28px;text-align:center}
h1{font-size:20px;margin:0 0 4px}.p{font-size:30px;font-weight:800;color:#34D399;margin:8px 0 16px}
img{width:240px;height:240px;background:#fff;border-radius:12px;padding:8px}
textarea{width:100%;box-sizing:border-box;margin-top:14px;background:#0B1220;color:#C9D3E3;border:1px solid #1F2A3D;border-radius:10px;padding:10px;font-size:12px;resize:none}
button{margin-top:10px;width:100%;padding:13px;border:0;border-radius:12px;background:#3B82F6;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
#s{margin-top:14px;color:#9AA6B8;font-size:14px}.ok{color:#34D399!important;font-weight:700}small{display:block;margin-top:16px;color:#6B778A}
</style></head><body><main class="c"><h1>${esc(ALLOWED.get(o.amount))}</h1><div class="p">${price}</div>
${o.qr ? `<img alt="QR Code Pix" src="${esc(o.qr)}">` : ''}
<textarea id="cc" rows="4" readonly>${esc(o.copia)}</textarea><button id="cp">Copiar código Pix</button>
<p id="s" role="status">Aguardando pagamento…</p><small>A licença é liberada automaticamente após a confirmação. A ativação licencia apenas o aplicativo.</small></main>
<script>const R=${JSON.stringify(o.returnUrl)},O=${JSON.stringify(o.orderId)};
document.getElementById('cp').onclick=async()=>{const t=document.getElementById('cc');try{await navigator.clipboard.writeText(t.value)}catch{t.select();document.execCommand('copy')}document.getElementById('cp').textContent='Copiado ✓'};
async function p(){try{const r=await fetch('/pix/status?orderId='+O);const j=await r.json();if(j.paid){const s=document.getElementById('s');s.textContent='Pagamento confirmado! Redirecionando…';s.className='ok';setTimeout(()=>location.assign(R),1500);return}}catch{}setTimeout(p,4000)}p();</script></body></html>`;
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress);
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', ...SEC }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
  try {
    if (req.method !== 'GET') return send(405, { error: 'method' });
    if (url.pathname === '/pix/pagar') {
      const v = validInput(url.searchParams);
      if (!v) return send(400, '<p>Link de pagamento inválido.</p>', 'text/html');
      let o = state[v.orderId];
      if (!o) {
        if (limited(ip)) return send(429, '<p>Muitas tentativas. Aguarde alguns minutos.</p>', 'text/html');
        o = { ...v, created: Date.now(), ...(await createCob(v)) }; state[v.orderId] = o; save();
      }
      if (o.amount !== v.amount) return send(400, '<p>Link de pagamento inválido.</p>', 'text/html');
      return send(200, page(o), 'text/html');
    }
    if (url.pathname === '/pix/status') {
      const o = state[String(url.searchParams.get('orderId') || '')];
      if (!o) return send(404, { error: 'not_found' });
      if (!o.notified && Date.now() - (o.lastCheck || 0) > 3000) { o.lastCheck = Date.now(); await check(o).catch((e) => console.error('[zui-efi-pix] check', e.message)); }
      return send(200, { paid: !!o.notified });
    }
    send(404, { error: 'not_found' });
  } catch (e) { console.error('[zui-efi-pix]', e.message); send(502, '<p>Pagamento indisponível no momento. Tente novamente.</p>', 'text/html'); }
});
if (process.env.NODE_ENV !== 'test') server.listen(PORT, '127.0.0.1', () => console.log('zui-efi-pix on', PORT));

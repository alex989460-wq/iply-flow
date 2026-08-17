#!/usr/bin/env python3
"""
SuperGestor - Agente SeleniumBase (UC Mode)
===========================================
Substitui/complementa o mini-proxy Node quando o painel exige CAPTCHA
(Cloudflare Turnstile, "Just a moment", reCAPTCHA/hCaptcha em checkbox).
Usado por: Duplecast, IBO Sol e Uniplay (e qualquer painel com Cloudflare).

O UC Mode do SeleniumBase abre um Chrome real "não detectável" e clica no
captcha sozinho (uc_gui_click_captcha), sem precisar de 2Captcha nem proxy
residencial pago. Captchas de imagem (selecione os ônibus) NÃO são resolvidos.

Instalação (VPS Ubuntu ou PC):
    sudo apt update && sudo apt install -y python3-pip xvfb chromium-browser
    pip3 install seleniumbase
    export SIGMA_PROXY_SECRET="a-mesma-chave-do-supergestor"
    python3 seleniumbase_agent.py          # porta 8788

Depois aponte SIGMA_PROXY_URL do SuperGestor para http://SEU_IP:8788
(ou mantenha o proxy Node e use este agente como fallback).

Contrato HTTP (idêntico ao mini-proxy Node):
  POST /  header: x-sigma-proxy-secret
  1) Relay simples:   {"url","method","headers","body"}
     -> {"status","body"}
  2) Sessão navegador: {"browser":true,"url","steps":[{selector,value?,click?,wait_ms?}],
                        "wait_ms","capture","final_url_contains"}
     -> {"final_url","cookies","html","captcha","storage","captured","steps","fields"}
  GET /health -> {"ok":true,"engine":"seleniumbase"}
"""

import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from seleniumbase import SB
except Exception as exc:  # pragma: no cover
    raise SystemExit(f"Instale o SeleniumBase antes: pip3 install seleniumbase ({exc})")

PORT = int(os.environ.get("PORT", "8788"))
SECRET = os.environ.get("SIGMA_PROXY_SECRET", "")
HEADLESS = os.environ.get("HEADLESS", "1") not in ("0", "false", "False")
MAX_BODY = 2 * 1024 * 1024

if len(SECRET) < 12:
    raise SystemExit("Defina SIGMA_PROXY_SECRET com pelo menos 12 caracteres.")

# Um navegador por vez: o UC Mode não gosta de sessões paralelas.
BROWSER_LOCK = threading.Lock()


def new_sb():
    """Chrome real em UC Mode. Em VPS sem tela usamos Xvfb (xvfb=True)."""
    return SB(uc=True, headless=False, xvfb=HEADLESS, locale_code="pt-BR",
              incognito=False, page_load_strategy="eager")


def _page(sb, limit=4000):
    try:
        return sb.get_page_source()[:limit]
    except Exception:
        return ""


def try_solve_captcha(sb, attempts=4):
    """Tenta passar pelo Cloudflare/Turnstile. Retorna o status para o SuperGestor."""
    marks = r"just a moment|cf-chl|challenge-platform|cf-turnstile|g-recaptcha|h-captcha|verify you are human"
    html = _page(sb)
    if not re.search(marks, html, re.I):
        return {"status": "not_detected"}

    last_error = ""
    for attempt in range(attempts):
        for handler in ("uc_gui_click_captcha", "uc_gui_handle_captcha", "uc_gui_handle_cf"):
            fn = getattr(sb, handler, None)
            if not fn:
                continue
            try:
                fn()
                sb.sleep(4)
            except Exception as exc:
                last_error = str(exc)
                continue
            if not re.search(r"just a moment|verify you are human|cf-chl", _page(sb), re.I):
                return {"status": "solve_finished", "provider": "seleniumbase",
                        "handler": handler, "attempt": attempt + 1}
        # Recarrega em UC mode: às vezes o desafio só passa no segundo open.
        try:
            sb.uc_open_with_reconnect(sb.get_current_url(), reconnect_time=6)
            sb.sleep(3)
        except Exception as exc:
            last_error = str(exc)
        if not re.search(r"just a moment|verify you are human|cf-chl", _page(sb), re.I):
            return {"status": "solve_finished", "provider": "seleniumbase",
                    "handler": "reconnect", "attempt": attempt + 1}

    return {"status": "failed", "provider": "seleniumbase",
            "message": "O desafio do Cloudflare continuou na tela após várias tentativas."
                       + (f" Último erro: {last_error}" if last_error else "")}



def browser_session(payload):
    url = str(payload.get("url") or "")
    steps = payload.get("steps") or []
    capture = payload.get("capture")
    wait_ms = int(payload.get("wait_ms") or 5000)

    with BROWSER_LOCK, new_sb() as sb:
        sb.uc_open_with_reconnect(url, reconnect_time=8)
        captcha = try_solve_captcha(sb)

        steps_log = []
        for step in steps:
            selector = step.get("selector")
            try:
                if selector:
                    sb.wait_for_element_visible(selector, timeout=30)
                    if isinstance(step.get("value"), str):
                        sb.clear(selector)
                        sb.type(selector, step["value"])
                    if step.get("click"):
                        if captcha.get("status") not in ("solve_finished", "not_detected"):
                            captcha = try_solve_captcha(sb)
                        sb.click(selector)
                    steps_log.append({"selector": selector, "ok": True})
                if step.get("wait_ms"):
                    sb.sleep(int(step["wait_ms"]) / 1000.0)
            except Exception as exc:
                steps_log.append({"selector": selector, "ok": False, "error": str(exc)})

        # Alguns painéis só mostram o captcha depois do submit.
        retry = try_solve_captcha(sb)
        if retry.get("status") == "solve_finished":
            captcha = retry
            submit = next((s for s in steps if s.get("click") and s.get("selector")), None)
            if submit:
                try:
                    sb.click(submit["selector"])
                    sb.sleep(6)
                except Exception:
                    pass

        sb.sleep(max(wait_ms, 1000) / 1000.0)

        try:
            cookies = sb.get_cookies()
        except Exception:
            cookies = []
        try:
            html = sb.get_page_source()[:150000]
        except Exception:
            html = ""
        try:
            final_url = sb.get_current_url()
        except Exception:
            final_url = url

        storage = {}
        try:
            storage = sb.execute_script(
                "const o={};try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);"
                "o[k]=localStorage.getItem(k);}}catch(e){};"
                "try{for(let i=0;i<sessionStorage.length;i++){const k=sessionStorage.key(i);"
                "o['ss:'+k]=sessionStorage.getItem(k);}}catch(e){};return o;"
            ) or {}
        except Exception:
            storage = {}

        # Respostas de rede (equivalente ao "capture" do proxy Node).
        captured = []
        if capture:
            try:
                entries = sb.execute_script(
                    "return performance.getEntriesByType('resource').map(e=>e.name).slice(-200);"
                ) or []
                rx = re.compile(str(capture), re.I)
                captured = [{"url": u, "status": 0, "body": ""} for u in entries if rx.search(u)]
            except Exception:
                captured = []

        fields = []
        try:
            fields = sb.execute_script(
                "return [...document.querySelectorAll('input,button,[type=submit]')].slice(0,40)"
                ".map(el=>({tag:el.tagName.toLowerCase(),type:el.getAttribute('type')||'',"
                "name:el.getAttribute('name')||'',id:el.id||'',"
                "placeholder:el.getAttribute('placeholder')||'',text:(el.innerText||'').trim().slice(0,40)}));"
            ) or []
        except Exception:
            fields = []

        return {"final_url": final_url, "cookies": cookies, "html": html, "captcha": captcha,
                "storage": storage, "captured": captured, "steps": steps_log, "fields": fields,
                "engine": "seleniumbase"}


def relay_fetch(payload):
    """Chamada de API feita de dentro do navegador (herda cookies do Cloudflare)."""
    url = str(payload.get("url") or "")
    method = str(payload.get("method") or "GET").upper()
    headers = payload.get("headers") or {}
    body = payload.get("body")
    origin = re.match(r"^https?://[^/]+", url)
    origin = origin.group(0) if origin else url

    with BROWSER_LOCK, new_sb() as sb:
        sb.uc_open_with_reconnect(origin, reconnect_time=8)
        try_solve_captcha(sb)
        script = (
            "const done = arguments[arguments.length-1];"
            "fetch(arguments[0],{method:arguments[1],headers:arguments[2],"
            "body:(arguments[1]==='GET'||arguments[1]==='HEAD')?undefined:arguments[3],"
            "credentials:'include'})"
            ".then(r=>r.text().then(t=>done({status:r.status,body:t})))"
            ".catch(e=>done({status:0,body:String(e)}));"
        )
        try:
            sb.driver.set_script_timeout(120)
            out = sb.driver.execute_async_script(script, url, method, headers, body)
        except Exception as exc:
            return {"status": 0, "body": f"falha no relay: {exc}"}
        return {"status": int(out.get("status") or 0), "body": out.get("body") or ""}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type, x-sigma-proxy-secret")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        print(f"[agent] {fmt % args}")

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path.startswith("/diag"):
            started = time.time()
            try:
                with BROWSER_LOCK, new_sb() as sb:
                    sb.uc_open_with_reconnect("https://example.com", reconnect_time=3)
                    title = sb.get_title()
                return self._send(200, {"ok": True, "browser": "ok", "title": title,
                                        "elapsed_ms": int((time.time() - started) * 1000)})
            except BaseException as exc:  # SeleniumBase pode chamar sys.exit()
                return self._send(502, {"ok": False, "browser": "falhou",
                                        "error": f"{type(exc).__name__}: {exc}"})
        self._send(200, {"ok": True, "engine": "seleniumbase", "version": "1.2.0"})

    def do_POST(self):
        if self.headers.get("x-sigma-proxy-secret", "") != SECRET:
            return self._send(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self._send(413, {"error": "corpo_muito_grande"})
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            payload = json.loads(raw or "{}")
        except Exception:
            return self._send(400, {"error": "json_invalido"})

        started = time.time()
        try:
            if payload.get("browser"):
                result = browser_session(payload)
            elif payload.get("url"):
                result = relay_fetch(payload)
            else:
                return self._send(400, {"error": "informe url"})
            result["elapsed_ms"] = int((time.time() - started) * 1000)
            self._send(200, result)
        except BaseException as exc:  # inclui SystemExit do SeleniumBase
            try:
                self._send(502, {"error": "agent_error",
                                 "message": f"{type(exc).__name__}: {exc}"})
            except Exception:
                pass


if __name__ == "__main__":
    print(f"[agent] SeleniumBase UC Mode na porta {PORT} (xvfb={HEADLESS})")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()

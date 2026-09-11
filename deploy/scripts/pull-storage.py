#!/usr/bin/env python3
"""Copia os arquivos (storage) do ambiente atual para a VPS.

Uso: EXPORT_URL=... EXPORT_KEY=... TARGET_URL=... TARGET_KEY=... python3 pull-storage.py
Reexecutável: pula arquivos já enviados (registro em /var/lib/supergestor-migstorage.done).
"""
import json, os, sys, urllib.request, urllib.error, threading, queue, time

EXPORT_URL = os.environ["EXPORT_URL"]
EXPORT_KEY = os.environ["EXPORT_KEY"]
TARGET_URL = os.environ["TARGET_URL"].rstrip("/")
TARGET_KEY = os.environ["TARGET_KEY"]
DONE_PATH = os.environ.get("DONE_PATH", "/var/lib/supergestor-migstorage.done")
WORKERS = int(os.environ.get("WORKERS", "8"))

lock = threading.Lock()
done = set()
if os.path.exists(DONE_PATH):
    with open(DONE_PATH) as f:
        done = {l.strip() for l in f if l.strip()}
done_file = open(DONE_PATH, "a")


def api(payload, tries=3):
    data = json.dumps(payload).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(EXPORT_URL, data=data, headers={
                "Content-Type": "application/json", "x-migration-secret": EXPORT_KEY})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def target(method, path, body=None, headers=None, tries=3):
    for i in range(tries):
        try:
            h = {"Authorization": f"Bearer {TARGET_KEY}", "apikey": TARGET_KEY}
            h.update(headers or {})
            req = urllib.request.Request(TARGET_URL + path, data=body, headers=h, method=method)
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


# 1) buckets
buckets = api({"action": "buckets"})["buckets"]
for b in buckets:
    body = json.dumps({"name": b["id"], "id": b["id"], "public": b.get("public", False)}).encode()
    st, _ = target("POST", "/storage/v1/bucket", body, {"Content-Type": "application/json"})
    print(f"bucket {b['id']} publico={b.get('public')} -> {st}", flush=True)

# 2) objetos
q = queue.Queue(maxsize=2000)
stats = {"ok": 0, "skip": 0, "fail": 0}


def worker():
    while True:
        item = q.get()
        if item is None:
            q.task_done(); return
        bucket, name, url = item
        key = f"{bucket}/{name}"
        try:
            with urllib.request.urlopen(url, timeout=300) as r:
                content = r.read()
                ctype = r.headers.get("Content-Type", "application/octet-stream")
            path = "/storage/v1/object/" + bucket + "/" + urllib.parse.quote(name)
            st, resp = target("POST", path, content, {"Content-Type": ctype, "x-upsert": "true"})
            with lock:
                if st in (200, 201):
                    stats["ok"] += 1
                    done_file.write(key + "\n")
                    if stats["ok"] % 200 == 0:
                        done_file.flush()
                        print(f"   enviados={stats['ok']} pulados={stats['skip']} falhas={stats['fail']}", flush=True)
                else:
                    stats["fail"] += 1
                    if stats["fail"] < 20:
                        print(f"   falha {key}: {st} {resp[:120]}", flush=True)
        except Exception as e:
            with lock:
                stats["fail"] += 1
                if stats["fail"] < 20:
                    print(f"   erro {key}: {e}", flush=True)
        finally:
            q.task_done()


threads = [threading.Thread(target=worker, daemon=True) for _ in range(WORKERS)]
for t in threads:
    t.start()

offset = 0
BATCH = 200
while True:
    objs = api({"action": "storage-list", "offset": offset, "limit": BATCH})["objects"]
    if not objs:
        break
    offset += len(objs)
    bybucket = {}
    for o in objs:
        key = f"{o['bucket_id']}/{o['name']}"
        if key in done:
            stats["skip"] += 1
            continue
        bybucket.setdefault(o["bucket_id"], []).append(o["name"])
    for bucket, names in bybucket.items():
        for i in range(0, len(names), 100):
            chunk = names[i:i + 100]
            urls = api({"action": "storage-urls", "bucket": bucket, "names": chunk})["urls"]
            for u in urls:
                if u.get("signedUrl") and not u.get("error"):
                    q.put((bucket, u["path"], u["signedUrl"]))
    print(f"lidos={offset} enviados={stats['ok']} pulados={stats['skip']} falhas={stats['fail']}", flush=True)

q.join()
for _ in threads:
    q.put(None)
done_file.flush()
print(f"==> Concluído: enviados={stats['ok']} pulados={stats['skip']} falhas={stats['fail']}", flush=True)

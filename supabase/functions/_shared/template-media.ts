// Resolve a mídia do header de templates oficiais para um link público estável.
//
// Problema: a Meta devolve o header_handle como URL assinada em
// scontent.whatsapp.net / lookaside.fbsbx.com. Essas URLs expiram e passam a
// responder 500, e a Meta rejeita o envio com:
//   "Media upload error — Downloading media from weblink failed with http code 500"
// Nesse caso a mensagem inteira falha e o cliente não recebe nada.
//
// Solução: re-hospedar a mídia no nosso Storage público (cache determinístico
// por nome do arquivo) e só usar o link depois de confirmar que ele responde 200.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "reseller-assets";
const PREFIX = "template-headers";

export function toPublicHttpsUrl(url: string): string {
  const publicBase = (Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("PUBLIC_SUPABASE_URL") || "").replace(/\/+$/, "");
  if (!publicBase) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname.includes(".") && !/^(api-gw|kong|supabase|localhost)/.test(parsed.hostname)) {
      return url;
    }
    return `${publicBase}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function isUsableMediaLink(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (!host.includes(".")) return false;
    if (/^(localhost|127\.|0\.0\.0\.0|api-gw|kong|supabase)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isMetaCdnMediaUrl(url?: string): boolean {
  return !!url && /scontent\.whatsapp\.net|lookaside\.fbsbx\.com|scontent\.xx\.fbcdn\.net/i.test(url);
}

async function urlIsReachable(url: string): Promise<boolean> {
  for (const method of ["HEAD", "GET"]) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { method, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        if (method === "GET") await res.body?.cancel().catch(() => {});
        return true;
      }
      if (res.status === 404 || res.status >= 500) return false;
    } catch {
      // tenta o próximo método
    }
  }
  return false;
}

function extForContentType(contentType: string): string {
  if (contentType.includes("video/mp4")) return "mp4";
  if (contentType.includes("pdf")) return "pdf";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

function cacheKeyFromUrl(url: string, label: string): string {
  try {
    const base = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
    const clean = base.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (clean) return clean;
  } catch { /* ignore */ }
  return `${label.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}`;
}

/**
 * Devolve um link público estável para a mídia do header, ou "" quando não
 * for possível obter nenhuma mídia válida (quem chama decide o fallback).
 */
export async function resolvePublicTemplateMedia(rawUrl: string, label = "template"): Promise<string> {
  const url = String(rawUrl || "").trim();
  if (!url) return "";

  // Link já público e nosso (ou de terceiros estável): valida e devolve.
  if (!isMetaCdnMediaUrl(url)) {
    const direct = toPublicHttpsUrl(url);
    if (!isUsableMediaLink(direct)) return "";
    return (await urlIsReachable(direct)) ? direct : "";
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return (await urlIsReachable(url)) ? url : "";
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const key = cacheKeyFromUrl(url, label);
  const basePath = `${PREFIX}/${key}`;

  // 1) Cache: o arquivo já pode ter sido re-hospedado antes.
  const cachedPublic = toPublicHttpsUrl(admin.storage.from(BUCKET).getPublicUrl(basePath).data?.publicUrl || "");
  if (isUsableMediaLink(cachedPublic) && (await urlIsReachable(cachedPublic))) return cachedPublic;

  // 2) Baixa da CDN da Meta (com tentativas) e re-hospeda.
  let bytes: Uint8Array | null = null;
  let contentType = "image/jpeg";
  for (let attempt = 0; attempt < 3 && !bytes; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        contentType = res.headers.get("content-type") || contentType;
        bytes = new Uint8Array(await res.arrayBuffer());
        break;
      }
      await res.body?.cancel().catch(() => {});
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }

  if (!bytes || !bytes.length) {
    console.warn(`[template-media] não foi possível baixar a mídia de "${label}" (${url.slice(0, 90)})`);
    return "";
  }

  const path = basePath.includes(".") ? basePath : `${basePath}.${extForContentType(contentType)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (!error) break;
    if (attempt === 2) {
      console.warn(`[template-media] upload falhou para "${label}":`, error.message);
      return (await urlIsReachable(url)) ? url : "";
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }

  const publicUrl = toPublicHttpsUrl(admin.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl || "");
  if (isUsableMediaLink(publicUrl) && (await urlIsReachable(publicUrl))) return publicUrl;

  return (await urlIsReachable(url)) ? url : "";
}

// Efí (Gerencianet) Pix client for Supabase Edge Functions.
//
// - Extracts the certificate + private key from the reseller's `.p12` bundle
//   (stored base64-encoded in `efi_settings.cert_p12_base64`) using node-forge.
// - Performs mTLS calls via `Deno.createHttpClient({ cert, key })` — required
//   by every Efí Pix endpoint.
// - Exposes OAuth token, register webhook, create Pix charge, and get charge
//   status helpers, plus a small in-memory token cache per (owner_id, env).
//
// Reference: https://dev.efipay.com.br/docs/api-pix/credenciais/

// @ts-ignore - esm.sh types are fine at runtime
import forge from "https://esm.sh/node-forge@1.3.1";

export type EfiEnv = "sandbox" | "production";

export interface EfiSettings {
  user_id: string;
  environment: EfiEnv;
  client_id: string;
  client_secret: string;
  pix_key: string;
  cert_p12_base64: string;
  cert_password?: string | null;
}

export interface EfiCredentials {
  cert: string; // PEM
  key: string;  // PEM
  clientId: string;
  clientSecret: string;
  pixKey: string;
  env: EfiEnv;
  baseUrl: string;
}

export function efiBaseUrl(env: EfiEnv): string {
  return env === "production"
    ? "https://pix.api.efipay.com.br"
    : "https://pix-h.api.efipay.com.br";
}

/**
 * Decode a base64 string to a binary string that node-forge can consume.
 */
function b64ToBinary(b64: string): string {
  // node-forge expects a "binary string" (each char is one byte).
  const bytes = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return bin;
}

/**
 * Extract PEM cert + PEM private key from the base64-encoded .p12 bundle.
 * Efí certificates are often issued without a password; we still support one.
 */
export function extractPemFromP12(
  p12Base64: string,
  password: string = "",
): { cert: string; key: string } {
  const binary = b64ToBinary(p12Base64);
  const p12Asn1 = forge.asn1.fromDer(binary);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  // ----- Private key -----
  let keyObj: any = null;
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const shrouded = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  if (shrouded.length > 0) keyObj = shrouded[0].key;

  if (!keyObj) {
    const rawBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
    const raw = rawBags[forge.pki.oids.keyBag] || [];
    if (raw.length > 0) keyObj = raw[0].key;
  }
  if (!keyObj) {
    throw new Error("Certificado .p12 não contém chave privada legível. Senha errada ou arquivo inválido.");
  }

  // ----- Certificate -----
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certs = certBags[forge.pki.oids.certBag] || [];
  if (certs.length === 0) {
    throw new Error("Certificado .p12 não contém certificado X.509.");
  }
  const certObj = certs[0].cert;

  return {
    cert: forge.pki.certificateToPem(certObj),
    key: forge.pki.privateKeyToPem(keyObj),
  };
}

/**
 * Build mTLS-ready credentials from a settings row.
 */
export function buildCredentials(s: EfiSettings): EfiCredentials {
  if (!s.client_id || !s.client_secret || !s.pix_key || !s.cert_p12_base64) {
    throw new Error("Configuração Efí incompleta (client_id, client_secret, pix_key e certificado .p12 são obrigatórios).");
  }
  const { cert, key } = extractPemFromP12(s.cert_p12_base64, s.cert_password || "");
  return {
    cert,
    key,
    clientId: s.client_id,
    clientSecret: s.client_secret,
    pixKey: s.pix_key,
    env: s.environment,
    baseUrl: efiBaseUrl(s.environment),
  };
}

// ---------- Token cache (per credential set) ----------
const tokenCache = new Map<string, { token: string; exp: number }>();

function cacheKey(c: EfiCredentials) {
  return `${c.env}:${c.clientId}`;
}

/**
 * mTLS fetch: builds a Deno HTTP client that presents the Efí cert.
 * Returns the raw Response so the caller can inspect status + body.
 */
async function mtlsFetch(
  c: EfiCredentials,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  // deno-lint-ignore no-explicit-any
  const client = (Deno as any).createHttpClient({
    cert: c.cert,
    key: c.key,
  });
  return await fetch(`${c.baseUrl}${path}`, {
    ...init,
    // @ts-ignore - Deno-only field on RequestInit
    client,
  });
}

export async function getAccessToken(c: EfiCredentials): Promise<string> {
  const key = cacheKey(c);
  const cached = tokenCache.get(key);
  const now = Date.now();
  if (cached && cached.exp - 60_000 > now) return cached.token;

  const basic = btoa(`${c.clientId}:${c.clientSecret}`);
  const resp = await mtlsFetch(c, "/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basic}`,
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Efí OAuth falhou [${resp.status}]: ${text.slice(0, 500)}`);
  }
  const json = JSON.parse(text);
  const token: string = json.access_token;
  const expiresIn: number = json.expires_in ?? 3600;
  tokenCache.set(key, { token, exp: now + expiresIn * 1000 });
  return token;
}

async function authedRequest(
  c: EfiCredentials,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const token = await getAccessToken(c);
  const resp = await mtlsFetch(c, path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  return { status: resp.status, body: parsed };
}

/**
 * Register (or replace) the webhook URL for a given Pix key.
 * Efí normally requires mTLS on the receiving side too — Supabase Edge
 * terminates TLS at the platform, so we send `x-skip-mtls-checking: true`
 * to bypass that check (documented by Efí).
 */
export async function registerWebhook(c: EfiCredentials, webhookUrl: string) {
  const token = await getAccessToken(c);
  const resp = await mtlsFetch(c, `/v2/webhook/${encodeURIComponent(c.pixKey)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-skip-mtls-checking": "true",
    },
    body: JSON.stringify({ webhookUrl }),
  });
  const text = await resp.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  return { status: resp.status, body: parsed };
}

export async function getWebhook(c: EfiCredentials) {
  return await authedRequest(c, "GET", `/v2/webhook/${encodeURIComponent(c.pixKey)}`);
}

/** Immediate Pix charge (`cob`). Expiration in seconds. */
export async function createCharge(c: EfiCredentials, params: {
  txid: string;
  amount: number;
  description?: string;
  payer?: { cpf?: string; cnpj?: string; nome?: string };
  expiresInSec?: number;
}) {
  const value = params.amount.toFixed(2);
  const body: any = {
    calendario: { expiracao: params.expiresInSec ?? 3600 },
    valor: { original: value },
    chave: c.pixKey,
    solicitacaoPagador: (params.description || "Assinatura").slice(0, 140),
  };
  if (params.payer && (params.payer.cpf || params.payer.cnpj) && params.payer.nome) {
    body.devedor = params.payer.cpf
      ? { cpf: params.payer.cpf.replace(/\D/g, ""), nome: params.payer.nome }
      : { cnpj: params.payer.cnpj!.replace(/\D/g, ""), nome: params.payer.nome };
  }
  return await authedRequest(c, "PUT", `/v2/cob/${encodeURIComponent(params.txid)}`, body);
}

export async function getChargeStatus(c: EfiCredentials, txid: string) {
  return await authedRequest(c, "GET", `/v2/cob/${encodeURIComponent(txid)}`);
}

/**
 * Fetch and render the QR Code PNG (base64) for a given locId returned by
 * createCharge. Efí exposes it under `/v2/loc/{id}/qrcode`.
 */
export async function getQrCode(c: EfiCredentials, locId: number | string) {
  return await authedRequest(c, "GET", `/v2/loc/${locId}/qrcode`);
}

/** Generate a 26–35 char alphanumeric txid (Efí requirement). */
export function newTxid(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 32; i++) out += chars[bytes[i] % chars.length];
  return out;
}

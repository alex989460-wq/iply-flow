import mysql from "npm:mysql2@3.9.7/promise";

type DeliveryResult = {
  ok: boolean;
  status: "delivered" | "delivery_failed" | "manual_required" | "already_processed";
  provider?: string;
  message: string;
};

const cleanBase = (value: unknown) => String(value || "").trim().replace(/\/+$/, "");

const responseBody = async (response: Response) => {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { detail: text || `HTTP ${response.status}` }; }
};

const errorMessage = (body: any, fallback: string) =>
  String(body?.detail || body?.message || body?.error || fallback);

async function recordExternalSuccess(
  admin: any,
  order: any,
  provider: string,
  externalId: string,
  response: any,
  before: number,
  after: number,
): Promise<DeliveryResult> {
  const completed = await admin.rpc("complete_credit_order_delivery", {
    _order_id: order.id,
    _provider: provider,
    _external_id: externalId,
    _response: response,
    _balance_before: before,
    _balance_after: after,
  });
  if (completed.error) {
    await admin.from("credit_orders").update({
      status: "delivery_unknown",
      delivery_provider: provider,
      external_delivery_id: externalId,
      delivery_response: response,
      delivery_error: `Painel confirmou a recarga, mas o registro local falhou: ${completed.error.message}`,
      balance_before: before,
      balance_after: after,
      updated_at: new Date().toISOString(),
    }).eq("id", order.id).eq("status", "delivering");
    return { ok: false, status: "delivery_failed", provider, message: "O painel confirmou a recarga; a conferência local ficou pendente. Não reenvie." };
  }
  return {
    ok: completed.data === true,
    status: completed.data === true ? "delivered" : "already_processed",
    provider,
    message: completed.data === true ? "Créditos enviados automaticamente ao painel." : "Pedido já processado.",
  };
}

async function deliverNatv(admin: any, order: any, server: any): Promise<DeliveryResult> {
  const { data: settings } = await admin
    .from("reseller_api_settings")
    .select("natv_api_key, natv_base_url, natv2_api_key, natv2_base_url")
    .eq("user_id", order.seller_id)
    .maybeSingle();

  const haystack = `${server?.panel_type || ""} ${server?.server_name || ""} ${server?.host || ""}`.toLowerCase();
  const isNatv2 = haystack.includes("natv2") || haystack.includes("natv²");
  const apiKey = String(isNatv2 ? settings?.natv2_api_key : settings?.natv_api_key || "").trim();
  const baseUrl = cleanBase(isNatv2 ? settings?.natv2_base_url : settings?.natv_base_url);
  const provider = isNatv2 ? "natv2" : "natv";

  if (!apiKey || !baseUrl) {
    return { ok: false, status: "delivery_failed", provider, message: `Conexão ${isNatv2 ? "NATV²" : "NATV"} não configurada pelo vendedor.` };
  }

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
  const username = String(order.panel_username || "").trim();
  const search = await fetch(`${baseUrl}/reseller/subreseller/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username }),
  });
  const searchBody = await responseBody(search);
  if (!search.ok) {
    return { ok: false, status: "delivery_failed", provider, message: errorMessage(searchBody, "Falha ao localizar a sub-revenda no painel.") };
  }
  const matches = Array.isArray(searchBody) ? searchBody : Array.isArray(searchBody?.data) ? searchBody.data : [];
  const recipient = matches.find((item: any) => String(item?.username || "").toLowerCase() === username.toLowerCase());
  if (!recipient) {
    return { ok: false, status: "delivery_failed", provider, message: "Usuário não é uma sub-revenda direta desta conta NATV." };
  }

  const before = Number(recipient.credits || 0);
  const quantity = Number(order.quantity || 0);
  const minimum = before === 1 ? 4 : 5;
  if (quantity < minimum) {
    return { ok: false, status: "delivery_failed", provider, message: `O NATV exige no mínimo ${minimum} créditos para esta conta.` };
  }

  let transfer: Response;
  let transferBody: any;
  try {
    transfer = await fetch(`${baseUrl}/reseller/credits`, {
      method: "POST",
      headers,
      body: JSON.stringify({ username, amount: quantity }),
    });
    transferBody = await responseBody(transfer);
  } catch (error) {
    return { ok: false, status: "delivery_failed", provider, message: error instanceof Error ? error.message : "Falha de conexão com o NATV." };
  }
  if (!transfer.ok) {
    return { ok: false, status: "delivery_failed", provider, message: errorMessage(transferBody, `Transferência recusada pelo NATV (HTTP ${transfer.status}).`) };
  }

  return await recordExternalSuccess(
    admin, order, provider, String(transferBody?.recipient_id || recipient.id || username), transferBody,
    before, Number(transferBody?.recipient_credits ?? before + quantity),
  );
}

async function deliverTheBest(admin: any, order: any): Promise<DeliveryResult> {
  const provider = "thebest";
  const { data: settings } = await admin.from("reseller_api_settings")
    .select("the_best_base_url, the_best_username, the_best_password, the_best_api_key")
    .eq("user_id", order.seller_id).maybeSingle();
  const base = cleanBase(settings?.the_best_base_url || "https://api.painel.best");
  const apiKey = String(settings?.the_best_api_key || "").trim();
  const username = String(settings?.the_best_username || "").trim();
  const password = String(settings?.the_best_password || "");
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (apiKey) {
    headers["Api-Key"] = apiKey;
  } else {
    if (!username || !password) return { ok: false, status: "delivery_failed", provider, message: "Conexão The Best não configurada pelo vendedor." };
    const auth = await fetch(`${base}/auth/token/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const authBody = await responseBody(auth);
    const token = authBody?.access || authBody?.token || authBody?.access_token;
    if (!auth.ok || !token) return { ok: false, status: "delivery_failed", provider, message: errorMessage(authBody, "Falha no login do The Best.") };
    headers.Authorization = `Bearer ${token}`;
  }

  const target = String(order.panel_username || "").trim();
  const list = await fetch(`${base}/resellers/?search=${encodeURIComponent(target)}&per_page=100`, { headers });
  const listBody = await responseBody(list);
  if (!list.ok) return { ok: false, status: "delivery_failed", provider, message: errorMessage(listBody, "Falha ao localizar o revendedor no The Best.") };
  const rows = Array.isArray(listBody) ? listBody : Array.isArray(listBody?.results) ? listBody.results : Array.isArray(listBody?.data) ? listBody.data : [];
  const recipient = rows.find((item: any) => String(item?.username || "").trim().toLowerCase() === target.toLowerCase());
  if (!recipient?.id) return { ok: false, status: "delivery_failed", provider, message: "Usuário não é um revendedor desta conta The Best." };
  const before = Number(recipient.credits || 0);
  const quantity = Math.max(1, Math.round(Number(order.quantity || 0)));
  const transfer = await fetch(`${base}/resellers/${recipient.id}/transfer-credits/`, {
    method: "POST", headers, body: JSON.stringify({ amount: quantity }),
  });
  const transferBody = await responseBody(transfer);
  if (!transfer.ok) return { ok: false, status: "delivery_failed", provider, message: errorMessage(transferBody, `Transferência recusada pelo The Best (HTTP ${transfer.status}).`) };
  return await recordExternalSuccess(admin, order, provider, String(recipient.id), transferBody, before, Number(transferBody?.credits ?? before + quantity));
}

async function deliverVplay(admin: any, order: any): Promise<DeliveryResult> {
  const provider = "vplay";
  const { data: settings } = await admin.from("reseller_api_settings")
    .select("vplay_mysql_host, vplay_mysql_port, vplay_mysql_user, vplay_mysql_password, vplay_mysql_database, vplay_panel_username")
    .eq("user_id", order.seller_id).maybeSingle();
  const host = String(settings?.vplay_mysql_host || Deno.env.get("VPLAY_MYSQL_HOST") || "").trim();
  const user = String(settings?.vplay_mysql_user || Deno.env.get("VPLAY_MYSQL_USER") || "").trim();
  const password = String(settings?.vplay_mysql_password || Deno.env.get("VPLAY_MYSQL_PASSWORD") || "");
  const database = String(settings?.vplay_mysql_database || Deno.env.get("VPLAY_MYSQL_DATABASE") || "").trim();
  const sellerUsername = String(settings?.vplay_panel_username || Deno.env.get("VPLAY_PANEL_USERNAME") || "").trim();
  const target = String(order.panel_username || "").trim();
  if (!host || !user || !password || !database || !sellerUsername) {
    return { ok: false, status: "delivery_failed", provider, message: "Conexão MySQL e usuário do painel VPlay não estão completos." };
  }

  const connection = await mysql.createConnection({ host, user, password, database, port: Number(settings?.vplay_mysql_port || Deno.env.get("VPLAY_MYSQL_PORT")) || 3306, connectTimeout: 10000 });
  try {
    const [columnsResult]: any = await connection.query("SHOW COLUMNS FROM `users`");
    const columns = new Set((columnsResult || []).map((column: any) => String(column.Field)));
    const balanceColumn = ["credits", "credit", "balance", "wallet", "money", "saldo"].find((column) => columns.has(column));
    const ownerColumn = ["member_id", "admin_id", "user_id", "owner_id", "reseller_id"].find((column) => columns.has(column));
    if (!columns.has("id") || !columns.has("username") || !balanceColumn || !ownerColumn) throw new Error("Estrutura de revendedores VPlay incompatível com recarga automática.");

    await connection.beginTransaction();
    const [sellerRows]: any = await connection.execute("SELECT `id` FROM `users` WHERE TRIM(`username`) = TRIM(?) LIMIT 1 FOR UPDATE", [sellerUsername]);
    const [recipientRows]: any = await connection.execute(
      `SELECT \`id\`, \`${balanceColumn}\`, \`${ownerColumn}\` FROM \`users\` WHERE TRIM(\`username\`) = TRIM(?) LIMIT 1 FOR UPDATE`, [target],
    );
    const seller = sellerRows?.[0];
    const recipient = recipientRows?.[0];
    if (!seller?.id || !recipient?.id || String(recipient[ownerColumn]) !== String(seller.id)) {
      await connection.rollback();
      return { ok: false, status: "delivery_failed", provider, message: "Usuário não é uma sub-revenda direta desta conta VPlay." };
    }
    const before = Number(recipient[balanceColumn] || 0);
    const quantity = Math.max(1, Math.round(Number(order.quantity || 0)));
    await connection.execute(`UPDATE \`users\` SET \`${balanceColumn}\` = \`${balanceColumn}\` + ? WHERE \`id\` = ? LIMIT 1`, [quantity, recipient.id]);
    await connection.commit();
    return await recordExternalSuccess(admin, order, provider, String(recipient.id), { recipient_id: recipient.id, recipient_username: target, credits_added: quantity }, before, before + quantity);
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    return { ok: false, status: "delivery_failed", provider, message: error instanceof Error ? error.message : "Falha ao transferir créditos no VPlay." };
  } finally {
    await connection.end().catch(() => undefined);
  }
}

export async function deliverCreditOrder(admin: any, orderId: string): Promise<DeliveryResult> {
  const { data: claimed, error: claimError } = await admin.rpc("claim_credit_order_delivery", { _order_id: orderId });
  if (claimError) throw claimError;
  const order = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!order?.id) return { ok: true, status: "already_processed", message: "Pedido já processado." };

  const { data: server } = await admin
    .from("servers")
    .select("id, server_name, host, panel_type, created_by")
    .eq("id", order.server_id)
    .eq("created_by", order.seller_id)
    .maybeSingle();

  if (!server) {
    await admin.from("credit_orders").update({ status: "delivery_failed", delivery_error: "Servidor não pertence ao vendedor.", updated_at: new Date().toISOString() }).eq("id", order.id).eq("status", "delivering");
    return { ok: false, status: "delivery_failed", message: "Servidor não pertence ao vendedor." };
  }

  const panel = `${server.panel_type || ""} ${server.server_name || ""} ${server.host || ""}`.toLowerCase();
  if (panel.includes("natv") || panel.includes("pixbot")) {
    const result = await deliverNatv(admin, order, server);
    if (!result.ok && result.status === "delivery_failed") {
      await admin.from("credit_orders").update({
        status: "delivery_failed",
        delivery_provider: result.provider,
        delivery_error: result.message,
        updated_at: new Date().toISOString(),
      }).eq("id", order.id).eq("status", "delivering");
    }
    return result;
  }

  if (panel.includes("thebest") || panel.includes("the best") || panel.includes("painel.best")) {
    const result = await deliverTheBest(admin, order);
    if (!result.ok && result.status === "delivery_failed") {
      await admin.from("credit_orders").update({ status: "delivery_failed", delivery_provider: result.provider, delivery_error: result.message, updated_at: new Date().toISOString() }).eq("id", order.id).eq("status", "delivering");
    }
    return result;
  }

  if (panel.includes("vplay")) {
    const result = await deliverVplay(admin, order);
    if (!result.ok && result.status === "delivery_failed") {
      await admin.from("credit_orders").update({ status: "delivery_failed", delivery_provider: result.provider, delivery_error: result.message, updated_at: new Date().toISOString() }).eq("id", order.id).eq("status", "delivering");
    }
    return result;
  }

  const message = "Este painel ainda não possui uma API de transferência de créditos confirmada. Faça a entrega manual.";
  await admin.from("credit_orders").update({
    status: "manual_required",
    delivery_provider: String(server.panel_type || "manual"),
    delivery_error: message,
    updated_at: new Date().toISOString(),
  }).eq("id", order.id).eq("status", "delivering");
  return { ok: false, status: "manual_required", provider: String(server.panel_type || "manual"), message };
}
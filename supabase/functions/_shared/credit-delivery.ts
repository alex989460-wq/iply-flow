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

  const transfer = await fetch(`${baseUrl}/reseller/credits`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username, amount: quantity }),
  });
  const transferBody = await responseBody(transfer);
  if (!transfer.ok) {
    return { ok: false, status: "delivery_failed", provider, message: errorMessage(transferBody, `Transferência recusada pelo NATV (HTTP ${transfer.status}).`) };
  }

  const completed = await admin.rpc("complete_credit_order_delivery", {
    _order_id: order.id,
    _provider: provider,
    _external_id: String(transferBody?.recipient_id || recipient.id || username),
    _response: transferBody,
    _balance_before: before,
    _balance_after: Number(transferBody?.recipient_credits ?? before + quantity),
  });
  if (completed.error) throw completed.error;
  return {
    ok: completed.data === true,
    status: completed.data === true ? "delivered" : "already_processed",
    provider,
    message: completed.data === true ? "Créditos enviados automaticamente ao painel." : "Pedido já processado.",
  };
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

  const message = "Este painel ainda não possui uma API de transferência de créditos confirmada. Faça a entrega manual.";
  await admin.from("credit_orders").update({
    status: "manual_required",
    delivery_provider: String(server.panel_type || "manual"),
    delivery_error: message,
    updated_at: new Date().toISOString(),
  }).eq("id", order.id).eq("status", "delivering");
  return { ok: false, status: "manual_required", provider: String(server.panel_type || "manual"), message };
}
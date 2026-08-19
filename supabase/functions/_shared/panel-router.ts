import { ResolvedPanel } from "./panel-router.ts";

// ResolvedPanel type is already imported, we just need to provide the implementation for the router.
// The previous code had some syntax errors after sed deletions.

export type RouterContext = {
  kind: string;
  fn: string;
  extra: Record<string, unknown>;
};

function normHost(raw: unknown): string {
  let s = String(raw || "").trim().toLowerCase().replace(/\/+$/, "");
  if (!s) return "";
  if (!/^https?:\/\//.test(s)) s = `https://${s}`;
  try {
    return new URL(s).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function resolvePanel(
  admin: any,
  server: {
    id?: string | null;
    server_name?: string | null;
    host?: string | null;
    panel_type?: string | null;
    koffice_connection_id?: string | null;
  } | null,
  ownerId: string | null,
): Promise<ResolvedPanel> {
  const name = String(server?.server_name || "");
  const host = String(server?.host || "");
  const haystack = `${name} ${host}`.toLowerCase();
  const panelType = String(server?.panel_type || "").toLowerCase();

  let kofficeConnectionId = String(server?.koffice_connection_id || "");
  let kofficeBaseUrl = "";

  // Descoberta automática pela URL do servidor × conexões do revendedor.
  const wanted = normHost(host);
  if (wanted && ownerId) {
    const { data: kofficeConns } = await admin
      .from("koffice_panel_connections")
      .select("id, base_url")
      .eq("user_id", ownerId)
      .eq("is_active", true);

    const kofficeHit = (kofficeConns || []).find((c: any) => normHost(c.base_url) === wanted);

    if (kofficeHit) {
      kofficeConnectionId = kofficeHit.id;
      kofficeBaseUrl = kofficeHit.base_url;
      
      // Salva o vínculo para as próximas renovações desse servidor.
      if (server?.id) {
        try {
          await admin.from("servers").update({ 
            koffice_connection_id: kofficeHit.id, 
            panel_type: "koffice" 
          }).eq("id", server.id);
        } catch { /* vínculo é apenas cache */ }
      }
    }
  }

  const isKoffice = !!kofficeConnectionId ||
    ["koffice", "p2cine", "koffice_panel"].includes(panelType) ||
    haystack.includes("p2cine") || haystack.includes("daily3") ||
    haystack.includes("painelacesso") || haystack.includes("koffice") ||
    /\bp2c\b/.test(haystack);

  if (isKoffice) {
    if (!kofficeBaseUrl && kofficeConnectionId) {
      const { data: conn } = await admin
        .from("koffice_panel_connections").select("base_url").eq("id", kofficeConnectionId).maybeSingle();
      kofficeBaseUrl = String(conn?.base_url || "");
    }
    if (!kofficeBaseUrl && ownerId) {
      const { data: conns } = await admin
        .from("koffice_panel_connections").select("base_url")
        .eq("user_id", ownerId).eq("is_active", true).order("created_at").limit(1);
      kofficeBaseUrl = String(conns?.[0]?.base_url || "");
    }
    return {
      kind: "koffice",
      fn: "p2cine-renew",
      extra: { p2cine_base_url: kofficeBaseUrl || host || undefined },
    };
  }

  if (panelType === "the_best" || haystack.includes("the best") || haystack.includes("the-best") || haystack.includes("painel.best")) {
    return { kind: "the_best", fn: "the-best-renew", extra: {} };
  }
  if (panelType === "natv" || haystack.includes("natv") || haystack.includes("pixbot")) {
    return { kind: "natv", fn: "natv-renew", extra: {} };
  }
  if (panelType === "vplay" || haystack.includes("vplay")) {
    return { kind: "vplay", fn: "vplay-renew", extra: {} };
  }
  if (panelType === "rush" || haystack.includes("rush")) {
    return { kind: "rush", fn: "rush-renew", extra: {} };
  }
  if (
    panelType === "uniplay" || haystack.includes("uniplay") ||
    haystack.includes("searchdefense") || haystack.includes("gesapioffice")
  ) {
    return { kind: "uniplay", fn: "uniplay-renew", extra: {} };
  }

  return { kind: "xui", fn: "xui-renew", extra: {} };
}

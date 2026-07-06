// Aprovar / rejeitar / mesclar itens de conhecimento (nova arquitetura)
// Aprovação copia o item para ai_knowledge_entries (consumida pelo bot).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function formatSolution(item: any): string {
  const parts: string[] = [];
  if (item.solution) parts.push(item.solution);
  const steps: string[] = Array.isArray(item.steps) ? item.steps : [];
  if (steps.length) {
    parts.push("\n\n📋 Passo a passo:");
    steps.forEach((s: string, i: number) => parts.push(`${i + 1}. ${s}`));
  }
  return parts.join("\n").slice(0, 4000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { item_id, action, patch, target_id } = await req.json();
    if (!item_id || !action) return json({ error: "item_id and action required" }, 400);

    if (action === "reject") {
      await supabase.from("ai_knowledge_items")
        .update({ status: "rejected" }).eq("id", item_id).eq("user_id", userId);
      return json({ ok: true });
    }

    if (action === "merge") {
      if (!target_id) return json({ error: "target_id required" }, 400);
      // Marca origem como merged e agrega no destino
      const { data: src } = await supabase.from("ai_knowledge_items")
        .select("*").eq("id", item_id).eq("user_id", userId).single();
      const { data: tgt } = await supabase.from("ai_knowledge_items")
        .select("*").eq("id", target_id).eq("user_id", userId).single();
      if (!src || !tgt) return json({ error: "not found" }, 404);

      const usage = (tgt.usage_count || 0) + (src.usage_count || 0);
      const resolved = (tgt.resolved_count || 0) + (src.resolved_count || 0);
      const rate = usage > 0 ? resolved / usage : 0;

      await supabase.from("ai_knowledge_items").update({
        usage_count: usage,
        resolved_count: resolved,
        success_rate: rate,
        steps: Array.from(new Set([...(tgt.steps || []), ...(src.steps || [])])).slice(0, 20),
        devices: Array.from(new Set([...(tgt.devices || []), ...(src.devices || [])])).slice(0, 8),
        apps: Array.from(new Set([...(tgt.apps || []), ...(src.apps || [])])).slice(0, 8),
        keywords: Array.from(new Set([...(tgt.keywords || []), ...(src.keywords || [])])).slice(0, 20),
        source_conversation_ids: Array.from(new Set([
          ...(tgt.source_conversation_ids || []), ...(src.source_conversation_ids || []),
        ])).slice(0, 200),
      }).eq("id", target_id);

      await supabase.from("ai_knowledge_items")
        .update({ status: "merged", merged_into_id: target_id }).eq("id", item_id);
      return json({ ok: true });
    }

    if (action === "approve") {
      const { data: item } = await supabase.from("ai_knowledge_items")
        .select("*").eq("id", item_id).eq("user_id", userId).single();
      if (!item) return json({ error: "not found" }, 404);

      const merged = { ...item, ...(patch ?? {}) };
      const title = String(merged.subject || "Sem título").slice(0, 200);
      const response = formatSolution(merged);

      const { data: entry, error: entryErr } = await supabase.from("ai_knowledge_entries").insert({
        user_id: userId,
        title,
        category: merged.category ?? "outros",
        keywords: merged.keywords ?? [],
        response_template: response,
        requires_human: false,
        is_enabled: true,
        sort_order: 0,
        canonical_question: merged.problem || title,
        embedding: item.embedding,
        usage_count: item.usage_count ?? 0,
        success_rate: item.success_rate ?? 0,
      } as any).select().single();
      if (entryErr) return json({ error: entryErr.message }, 500);

      await supabase.from("ai_knowledge_items").update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: userId,
        knowledge_entry_id: entry?.id,
        ...(patch ?? {}),
      }).eq("id", item_id);

      return json({ ok: true, entry_id: entry?.id });
    }

    if (action === "update") {
      await supabase.from("ai_knowledge_items")
        .update(patch ?? {}).eq("id", item_id).eq("user_id", userId);
      return json({ ok: true });
    }

    return json({ error: "invalid action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }
});

function json(p: unknown, s = 200) {
  return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

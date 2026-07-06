// Aprova um candidato: move para ai_knowledge_entries com embedding preservado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { candidate_id, action, patch } = await req.json();
    if (!candidate_id || !action) return json({ error: "candidate_id and action required" }, 400);

    if (action === "reject") {
      await supabase.from("ai_knowledge_candidates").update({ status: "rejected" }).eq("id", candidate_id).eq("user_id", userId);
      return json({ ok: true });
    }

    if (action === "approve") {
      const { data: c } = await supabase.from("ai_knowledge_candidates")
        .select("*").eq("id", candidate_id).eq("user_id", userId).single();
      if (!c) return json({ error: "not found" }, 404);

      const merged = { ...c, ...(patch ?? {}) };

      await supabase.from("ai_knowledge_entries").insert({
        user_id: userId,
        title: (merged.canonical_question ?? "Sem título").slice(0, 200),
        category: merged.category ?? "outros",
        keywords: merged.keywords ?? [],
        response_template: merged.best_answer ?? "",
        requires_human: false,
        is_enabled: true,
        sort_order: 0,
        canonical_question: merged.canonical_question,
        embedding: c.embedding,
        usage_count: c.usage_count ?? 0,
        success_rate: c.success_rate ?? 0,
      } as any);

      await supabase.from("ai_knowledge_candidates").update({ status: "approved" }).eq("id", candidate_id);
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

// Programa de indicação de clientes (por revendedor).
// Regras: recompensa em desconto na próxima renovação, liberada somente após
// pagamento confirmado do indicado, com limite mensal de indicações premiadas.

export interface ReferralSettings {
  owner_id: string;
  enabled: boolean;
  reward_amount: number;
  referee_discount: number;
  max_rewards_per_month: number;
  min_order_amount: number;
  max_discount_percent: number;
  credit_expire_days: number;
  headline: string | null;
  terms: string | null;
}

const DEFAULTS: Omit<ReferralSettings, "owner_id"> = {
  enabled: false,
  reward_amount: 10,
  referee_discount: 0,
  max_rewards_per_month: 10,
  min_order_amount: 0,
  max_discount_percent: 50,
  credit_expire_days: 90,
  headline: null,
  terms: null,
};

export async function getReferralSettings(admin: any, ownerId: string): Promise<ReferralSettings> {
  const { data } = await admin
    .from("referral_settings")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  return { owner_id: ownerId, ...DEFAULTS, ...(data || {}) } as ReferralSettings;
}

export function cleanCode(s: unknown) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

/** Saldo disponível (créditos não expirados) de um cliente. */
export async function getReferralBalance(admin: any, customerId: string): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("referral_credits")
    .select("amount, kind, expires_at")
    .eq("customer_id", customerId)
    .limit(1000);
  let total = 0;
  for (const row of data || []) {
    const amount = Number(row.amount || 0);
    if (amount > 0 && row.expires_at && row.expires_at < nowIso) continue; // crédito expirado
    total += amount;
  }
  return Math.max(0, Math.round(total * 100) / 100);
}

/** Garante que o cliente tenha um código de indicação. */
export async function ensureReferralCode(admin: any, customer: { id: string; referral_code?: string | null }) {
  if (customer.referral_code) return customer.referral_code;
  const code = cleanCode(crypto.randomUUID().replace(/-/g, "")).slice(0, 8);
  await admin.from("customers").update({ referral_code: code }).eq("id", customer.id);
  return code;
}

/** Quantidade de indicações já premiadas no mês corrente. */
async function rewardsThisMonth(admin: any, referrerId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_customer_id", referrerId)
    .eq("status", "rewarded")
    .gte("qualified_at", start.toISOString());
  return Number(count || 0);
}

/**
 * Chamado quando um pagamento é confirmado. Se o cliente que pagou foi indicado
 * por outro cliente e ainda não gerou recompensa, credita quem indicou.
 */
export async function settleReferralOnPayment(
  admin: any,
  opts: { ownerId: string; customerId: string; amount: number },
) {
  try {
    const settings = await getReferralSettings(admin, opts.ownerId);
    if (!settings.enabled || Number(settings.reward_amount) <= 0) return;
    if (opts.amount < Number(settings.min_order_amount || 0)) return;

    const { data: customer } = await admin
      .from("customers")
      .select("id, name, phone, username, referred_by, created_by")
      .eq("id", opts.customerId)
      .maybeSingle();
    if (!customer?.referred_by) return;
    if (customer.referred_by === customer.id) return;

    const { data: existing } = await admin
      .from("referrals")
      .select("id, status")
      .eq("referee_customer_id", customer.id)
      .maybeSingle();
    if (existing && existing.status === "rewarded") return;

    const { data: referrer } = await admin
      .from("customers")
      .select("id, name, phone, created_by")
      .eq("id", customer.referred_by)
      .eq("created_by", opts.ownerId)
      .maybeSingle();
    if (!referrer) return;

    const used = await rewardsThisMonth(admin, referrer.id);
    const capped = used >= Number(settings.max_rewards_per_month || 10);
    const reward = capped ? 0 : Math.round(Number(settings.reward_amount) * 100) / 100;

    let referralId = existing?.id || null;
    if (referralId) {
      await admin.from("referrals").update({
        status: capped ? "capped" : "rewarded",
        reward_amount: reward,
        qualified_at: new Date().toISOString(),
      }).eq("id", referralId);
    } else {
      const { data: created } = await admin.from("referrals").insert({
        owner_id: opts.ownerId,
        referrer_customer_id: referrer.id,
        referee_customer_id: customer.id,
        referee_name: customer.name,
        status: capped ? "capped" : "rewarded",
        reward_amount: reward,
        qualified_at: new Date().toISOString(),
      }).select("id").single();
      referralId = created?.id || null;
    }

    if (capped || reward <= 0) return;

    const expiresAt = new Date(Date.now() + Number(settings.credit_expire_days || 90) * 86400000).toISOString();
    await admin.from("referral_credits").insert({
      owner_id: opts.ownerId,
      customer_id: referrer.id,
      referral_id: referralId,
      amount: reward,
      kind: "earn",
      note: `Indicação paga: ${customer.name || ""}`.trim(),
      expires_at: expiresAt,
    });

    // Aviso no WhatsApp para quem indicou (melhor esforço).
    try {
      const [{ data: zap }, { data: billing }] = await Promise.all([
        admin.from("zap_responder_settings").select("selected_department_id").eq("user_id", opts.ownerId).maybeSingle(),
        admin.from("billing_settings").select("meta_phone_number_id").eq("user_id", opts.ownerId).maybeSingle(),
      ]);
      if (zap?.selected_department_id && referrer.phone) {
        const balance = await getReferralBalance(admin, referrer.id);
        const text = `🎁 Sua indicação foi confirmada!\n\nVocê ganhou R$ ${reward.toFixed(2).replace(".", ",")} de desconto na sua próxima renovação.\nSaldo disponível: R$ ${balance.toFixed(2).replace(".", ",")}`;
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-oficial-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({
            action: "enviar-mensagem",
            department_id: zap.selected_department_id,
            number: referrer.phone,
            text,
            user_id: opts.ownerId,
            phone_number_id: (billing as any)?.meta_phone_number_id || undefined,
          }),
        });
      }
    } catch (notifyErr) {
      console.error("[referral] notify error", notifyErr);
    }
  } catch (err) {
    console.error("[referral] settle error", err);
  }
}

/** Consome o crédito reservado numa cobrança paga (idempotente pelo txid). */
export async function consumeReferralCredit(
  admin: any,
  opts: { ownerId: string; customerId: string; amount: number; txid: string },
) {
  if (!opts.amount || opts.amount <= 0) return;
  try {
    await admin.from("referral_credits").insert({
      owner_id: opts.ownerId,
      customer_id: opts.customerId,
      amount: -Math.abs(Math.round(opts.amount * 100) / 100),
      kind: "spend",
      txid: opts.txid,
      note: "Desconto usado no pagamento",
    });
  } catch (err) {
    console.error("[referral] consume error", err);
  }
}

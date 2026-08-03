// Shared helper: sends the billing/renewal reminder by e-mail using the
// project's transactional email pipeline. Plan A: one shared sending domain,
// per-reseller display name and reply-to configured in billing_settings.

export interface BillingEmailSettings {
  use_email_billing?: boolean | null;
  email_from_name?: string | null;
  email_reply_to?: string | null;
  email_subject?: string | null;
  email_logo_url?: string | null;
  email_msg_d_minus_1?: string | null;
  email_msg_d0?: string | null;
  email_msg_d_plus_1?: string | null;
  pix_key?: string | null;
}

const DEFAULT_MSGS: Record<string, string> = {
  'D-1': 'Seu plano vence amanhã ({{vencimento}}).\nRenove hoje para não ficar sem acesso.',
  'D0': 'Seu plano vence hoje ({{vencimento}}).\nRenove agora para continuar assistindo sem interrupções.',
  'D+1': 'Seu plano venceu em {{vencimento}}.\nRegularize para reativar o acesso imediatamente.',
};

function formatBRL(v: any): string {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatBRDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

function applyVars(text: string, customer: any): string {
  const price = customer?.custom_price ?? customer?.plan?.price ?? 0;
  const map: Record<string, string> = {
    nome: customer?.name || '',
    usuario: customer?.username || '',
    vencimento: formatBRDate(customer?.due_date),
    valor: formatBRL(price),
    plano: customer?.plan?.plan_name || '',
    servidor: customer?.server?.server_name || '',
    telefone: customer?.phone || '',
  };
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, k) => map[k] ?? '');
}

/**
 * Sends the billing reminder e-mail. Returns true when the email was queued.
 * Never throws — e-mail is a secondary channel and must not break WhatsApp sending.
 */
export async function sendBillingEmail(
  supabase: any,
  settings: BillingEmailSettings | null | undefined,
  customer: any,
  billingType: 'D-1' | 'D0' | 'D+1',
  opts?: { paymentUrl?: string | null; supportPhone?: string | null; todayStr?: string },
): Promise<boolean> {
  try {
    if (!settings?.use_email_billing) return false;
    const to = String(customer?.email || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;

    const raw =
      (billingType === 'D-1' && settings.email_msg_d_minus_1) ||
      (billingType === 'D0' && settings.email_msg_d0) ||
      (billingType === 'D+1' && settings.email_msg_d_plus_1) ||
      DEFAULT_MSGS[billingType];

    const brandName = settings.email_from_name?.trim() || 'Sua Assinatura';
    const price = customer?.custom_price ?? customer?.plan?.price ?? 0;

    // Link de renovação do PRÓPRIO revendedor (fallback quando a mensagem não traz link)
    let resellerUrl: string | undefined;
    try {
      if (customer?.created_by) {
        const { data: rcs } = await supabase
          .from('reseller_checkout_settings')
          .select('slug')
          .eq('user_id', customer.created_by)
          .maybeSingle();
        if (rcs?.slug) resellerUrl = `https://supergestor.top/r/${rcs.slug}`;
      }
    } catch (_) { /* ignore */ }

    const { error } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'billing-reminder',
        recipientEmail: to,
        idempotencyKey: `billing-${customer.id}-${billingType}-${opts?.todayStr || new Date().toISOString().slice(0, 10)}`,
        fromName: brandName,
        replyTo: settings.email_reply_to || undefined,
        templateData: {
          brandName,
          logoUrl: settings.email_logo_url || undefined,
          subjectOverride: settings.email_subject || undefined,
          customerName: customer?.name || '',
          username: customer?.username || '',
          planName: customer?.plan?.plan_name || '',
          serverName: customer?.server?.server_name || '',
          dueDate: formatBRDate(customer?.due_date),
          amount: formatBRL(price),
          messageBody: applyVars(String(raw), customer),
          paymentUrl: opts?.paymentUrl || resellerUrl || undefined,
          supportPhone: opts?.supportPhone || undefined,
        },
      },
    });

    if (error) {
      console.error('[billing-email] send failed', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[billing-email] unexpected error', e);
    return false;
  }
}

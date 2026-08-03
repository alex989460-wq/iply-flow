// Shared helper: sends the "payment confirmed" e-mail to the customer, using
// the reseller branding configured in billing_settings (same pipeline as the
// billing reminder). Never throws — e-mail is a secondary channel.

export interface ConfirmationEmailInput {
  ownerId: string;
  email?: string | null;
  customerName?: string | null;
  username?: string | null;
  planName?: string | null;
  serverName?: string | null;
  dueDate?: string | null; // dd/mm/yyyy
  amount?: number | null;
  paymentRef?: string | null; // used for idempotency
  supportPhone?: string | null;
}

export async function sendPaymentConfirmationEmail(
  supabase: any,
  input: ConfirmationEmailInput,
): Promise<boolean> {
  try {
    const to = String(input.email || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;

    const { data: settings } = await supabase
      .from('billing_settings')
      .select('use_email_billing, email_from_name, email_reply_to, email_logo_url')
      .eq('user_id', input.ownerId)
      .maybeSingle();

    if (!settings?.use_email_billing) return false;

    const brandName = settings.email_from_name?.trim() || 'Sua Assinatura';
    const amountBR = Number(input.amount || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    const { error } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'payment-confirmation',
        recipientEmail: to,
        idempotencyKey: `payconf-${input.paymentRef || `${input.username || to}-${Date.now()}`}`,
        fromName: brandName,
        replyTo: settings.email_reply_to || undefined,
        ownerId: input.ownerId,
        templateData: {
          brandName,
          logoUrl: settings.email_logo_url || undefined,
          customerName: input.customerName || '',
          username: input.username || '',
          planName: input.planName || '',
          serverName: input.serverName && input.serverName !== '-' ? input.serverName : '',
          dueDate: input.dueDate || '',
          amount: amountBR,
          supportPhone: input.supportPhone || undefined,
        },
      },
    });

    if (error) {
      console.error('[payment-confirmation-email] send failed', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[payment-confirmation-email] unexpected error', e);
    return false;
  }
}

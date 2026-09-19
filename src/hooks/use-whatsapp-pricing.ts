import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type WhatsAppPriceCategory = 'marketing' | 'utility' | 'authentication' | 'service' | 'business_agent' | 'other';

export interface ActiveWhatsAppPrice {
  id: string;
  category: WhatsAppPriceCategory;
  market: string;
  currency: string;
  unitPrice: number;
  brlExchangeRate: number | null;
  unitPriceBrl: number | null;
  pricingType: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  sourceUrl: string | null;
}

export function useWhatsappPricing(market = 'BR') {
  return useQuery({
    queryKey: ['whatsapp-pricing', market],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('whatsapp_pricing')
        .select('id, category, market, currency, unit_price, brl_exchange_rate, pricing_type, effective_from, effective_until, source_url')
        .eq('market', market)
        .eq('active', true)
        .lte('effective_from', now)
        .order('effective_from', { ascending: false });

      if (error) throw error;

      const byCategory = new Map<WhatsAppPriceCategory, ActiveWhatsAppPrice>();
      for (const row of data ?? []) {
        const category = row.category as WhatsAppPriceCategory;
        if (byCategory.has(category)) continue;
        if (row.effective_until && row.effective_until <= now) continue;
        const unitPrice = Number(row.unit_price);
        const exchangeRate = row.brl_exchange_rate == null ? null : Number(row.brl_exchange_rate);
        byCategory.set(category, {
          id: row.id,
          category,
          market: row.market,
          currency: row.currency,
          unitPrice,
          brlExchangeRate: exchangeRate,
          unitPriceBrl: row.currency === 'BRL' ? unitPrice : exchangeRate ? unitPrice * exchangeRate : null,
          pricingType: row.pricing_type,
          effectiveFrom: row.effective_from,
          effectiveUntil: row.effective_until,
          sourceUrl: row.source_url,
        });
      }
      return byCategory;
    },
    staleTime: 5 * 60 * 1000,
  });
}

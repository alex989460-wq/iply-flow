import { supabase } from "@/integrations/supabase/client";

/**
 * Limpa os campos do Sigma nos servidores e nas configurações de API.
 */
export async function cleanupSigmaData() {
  // Limpar referências em servidores
  const { error: serverError } = await supabase
    .from('servers')
    .update({
      panel_type: null,
      sigma_connection_id: null
    } as any)
    .not('sigma_connection_id', 'is', null);

  if (serverError) console.error('Erro ao limpar servidores Sigma:', serverError);

  // Limpar tabelas de conexão e ponte
  await supabase.from('sigma_panel_connections' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('sigma_bridge_tokens' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

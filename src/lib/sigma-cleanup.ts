import { supabase } from "@/integrations/supabase/client";

/**
 * Cleanly removes Sigma panel from a server record.
 */
export async function removeSigmaFromServer(serverId: string) {
  const { error } = await supabase
    .from('servers')
    .update({
      panel_type: null,
      sigma_connection_id: null
    } as any)
    .eq('id', serverId);
  
  if (error) throw error;
}

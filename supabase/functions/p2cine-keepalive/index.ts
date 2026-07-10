// P2Cine bloqueado: usar o mesmo PHPSESSID do navegador no backend derruba a sessão ativa.
// Esta função permanece inofensiva caso ainda exista agendamento antigo apontando para ela.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const jh = { ...cors, "Content-Type": "application/json" };
  return new Response(
    JSON.stringify({
      disabled: true,
      pinged: 0,
      reason: "p2cine_cookie_reuse_invalidates_browser_session",
      message: "Keepalive P2Cine desativado para não derrubar a sessão aberta no navegador.",
    }),
    { headers: jh },
  );
});

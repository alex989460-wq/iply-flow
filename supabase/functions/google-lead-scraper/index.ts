
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, limit = 20 } = await req.json()
    
    if (!query) throw new Error("Search query is required")

    console.log(`Searching for leads: ${query}`)

    const cities = ["Curitiba", "São Paulo", "Rio de Janeiro", "Londrina", "Florianópolis"];
    const city = cities.find(c => query.toLowerCase().includes(c.toLowerCase())) || "Brasil";
    const category = query.split(" em ")[0] || "Empresa";

    const mockLeads = Array.from({ length: limit }).map((_, i) => {
      const isHot = Math.random() > 0.6;
      const hasSite = Math.random() > 0.4;
      const id = i + 1;
      
      return {
        name: `${category} ${i + 1} S.A.`,
        phone: `55419${String(90000000 + i).slice(-8)}`,
        address: `Rua das Flores, ${100 + i}`,
        city: city,
        category: category,
        site: hasSite ? `https://www.${category.toLowerCase().replace(/\s/g, '')}${id}.com.br` : null,
        whatsapp_available: true,
        score: isHot ? 'quente' : (Math.random() > 0.5 ? 'morno' : 'frio')
      };
    });

    return new Response(
      JSON.stringify({ leads: mockLeads }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

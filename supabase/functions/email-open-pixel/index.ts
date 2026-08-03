import { createClient } from 'npm:@supabase/supabase-js@2'

// 1x1 transparent GIF
const PIXEL = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (c) => c.charCodeAt(0),
)

const imageHeaders = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Access-Control-Allow-Origin': '*',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...imageHeaders, 'Access-Control-Allow-Headers': '*' } })
  }

  // Always answer with the pixel, even on failure — never break the email.
  try {
    const url = new URL(req.url)
    const messageId = (url.searchParams.get('m') || '').trim()

    if (messageId && /^[0-9a-f-]{16,64}$/i.test(messageId)) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )

      const { data: existing } = await supabase
        .from('email_opens')
        .select('id, open_count')
        .eq('message_id', messageId)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('email_opens')
          .update({
            open_count: (existing.open_count || 0) + 1,
            last_opened_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        const { data: log } = await supabase
          .from('email_send_log')
          .select('recipient_email, template_name, metadata')
          .eq('message_id', messageId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        await supabase.from('email_opens').insert({
          message_id: messageId,
          owner_id: (log?.metadata as any)?.owner_id ?? null,
          recipient_email: log?.recipient_email ?? null,
          template_name: log?.template_name ?? null,
          user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
        })
      }
    }
  } catch (e) {
    console.error('[email-open-pixel] error', e)
  }

  return new Response(PIXEL, { headers: imageHeaders })
})

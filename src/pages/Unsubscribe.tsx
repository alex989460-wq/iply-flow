import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MailX, CheckCircle2, AlertTriangle } from 'lucide-react';

type State = 'loading' | 'valid' | 'invalid' | 'already' | 'success';

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<State>('loading');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setState('invalid');
        return;
      }
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
        });
        const data = await res.json();
        if (data?.valid) setState('valid');
        else if (data?.reason === 'already_unsubscribed') setState('already');
        else setState('invalid');
      } catch {
        setState('invalid');
      }
    };
    run();
  }, [token]);

  const confirm = async () => {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', {
      body: { token },
    });
    setSubmitting(false);
    if (error) return setState('invalid');
    if (data?.success) setState('success');
    else if (data?.reason === 'already_unsubscribed') setState('already');
    else setState('invalid');
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailX className="h-5 w-5 text-primary" />
            Cancelar recebimento de e-mails
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'loading' && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando link...
            </div>
          )}

          {state === 'valid' && (
            <>
              <p className="text-sm text-muted-foreground">
                Confirme abaixo para parar de receber avisos de vencimento e cobrança por e-mail.
              </p>
              <Button className="w-full" onClick={confirm} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirmar cancelamento
              </Button>
            </>
          )}

          {state === 'success' && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <span>Pronto! Você não receberá mais e-mails deste sistema.</span>
            </div>
          )}

          {state === 'already' && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <span>Este e-mail já estava cancelado. Nada mais a fazer.</span>
            </div>
          )}

          {state === 'invalid' && (
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <span>Link inválido ou expirado. Solicite um novo e-mail e tente novamente.</span>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

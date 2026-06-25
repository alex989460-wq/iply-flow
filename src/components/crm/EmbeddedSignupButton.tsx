import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const FB_APP_ID = '1499507967794395';
const CONFIG_ID = '1225471016210896';
const GRAPH_VERSION = 'v21.0';

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

interface Props {
  apiKey: string;
  onCreated?: () => void;
}

export default function EmbeddedSignupButton({ apiKey, onCreated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const sessionInfoRef = useRef<any>(null);

  useEffect(() => {
    // Listener for the embedded signup session_info_response postMessage
    const onMessage = (event: MessageEvent) => {
      if (!event.origin?.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          sessionInfoRef.current = data;
          // eslint-disable-next-line no-console
          console.log('[Embedded Signup] event', data);
        }
      } catch {
        // ignore non-json messages
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (window.FB) {
      setSdkReady(true);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB.init({
        appId: FB_APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: GRAPH_VERSION,
      });
      setSdkReady(true);
    };
    const id = 'facebook-jssdk';
    if (!document.getElementById(id)) {
      const s = document.createElement('script');
      s.id = id;
      s.async = true;
      s.defer = true;
      s.crossOrigin = 'anonymous';
      s.src = 'https://connect.facebook.net/en_US/sdk.js';
      document.body.appendChild(s);
    }
  }, []);

  const launch = () => {
    if (!window.FB) {
      toast({ title: 'SDK do Facebook ainda carregando', description: 'Aguarde um instante e tente novamente.' });
      return;
    }
    if (!apiKey) {
      toast({ title: 'Configure a API Key', description: 'Cadastre a chave do CRM Oficial em Configurações primeiro.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    sessionInfoRef.current = null;

    window.FB.login(
      async (response: any) => {
        try {
          const code = response?.authResponse?.code;
          if (!code) {
            toast({ title: 'Cadastro cancelado', description: 'Você fechou o popup sem concluir.', variant: 'destructive' });
            return;
          }
          const session = sessionInfoRef.current?.data || {};
          const phone_number_id = session?.phone_number_id || '';
          const waba_id = session?.waba_id || '';

          const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
            body: {
              action: 'embedded-signup',
              data: {
                apiKey,
                code,
                phone_number_id,
                waba_id,
                config_id: CONFIG_ID,
                app_id: FB_APP_ID,
              },
            },
          });

          if (error) throw error;
          const ok = !!(data?.results?.embedded?.ok ?? data?.ok);
          if (ok) {
            toast({ title: 'Canal criado via Embedded Signup', description: 'WhatsApp Cloud conectado com coexistência.' });
            onCreated?.();
          } else {
            const status = data?.results?.embedded?.status ?? data?.status ?? '?';
            toast({
              title: 'Cadastro recebido — finalização pendente',
              description: `Status ${status}. Code: ${code.slice(0, 12)}… Phone: ${phone_number_id || 'n/a'}`,
              variant: 'destructive',
            });
          }
        } catch (e: any) {
          toast({ title: 'Erro', description: e.message, variant: 'destructive' });
        } finally {
          setLoading(false);
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: 3,
        },
      },
    );
  };

  return (
    <Button
      onClick={launch}
      disabled={loading || !sdkReady}
      className="bg-[#1877F2] hover:bg-[#166FE5] text-white"
    >
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
      {sdkReady ? 'Conectar com Facebook (Coexistência)' : 'Carregando SDK…'}
    </Button>
  );
}

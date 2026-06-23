import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  /** Caminho dentro do CRM Oficial (ex.: "/chat", "/templates"). */
  path: string;
  /** Título mostrado no topo. */
  title: string;
  /** Subtítulo opcional. */
  subtitle?: string;
}

const CRM_BASE = 'https://crmapioficial.lovable.app';

function extractToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  for (const key of ['sso_token', 'token', 'access_token', 'jwt']) {
    const v = b[key];
    if (typeof v === 'string' && v.length > 8) return v;
  }
  const nested = b.data ?? b.sso;
  if (nested && typeof nested === 'object') return extractToken(nested);
  return null;
}

export default function CrmOficialEmbed({ path, title, subtitle }: Props) {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ssoUnavailable, setSsoUnavailable] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('crm_oficial_settings')
        .select('api_key, enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      setApiKey(data?.api_key ?? null);
      setEnabled(!!data?.enabled);
      setBootLoading(false);
    })();
  }, [user]);

  const buildUrl = useCallback(async () => {
    if (!apiKey) return null;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'sso-token', data: { apiKey, redirect: path } },
      });
      if (error) throw error;
      const ssoBody = data?.results?.sso?.body;
      const ok = data?.results?.sso?.ok;
      const token = ok ? extractToken(ssoBody) : null;
      if (token) {
        setSsoUnavailable(false);
        return `${CRM_BASE}${path}?sso_token=${encodeURIComponent(token)}`;
      }
      setSsoUnavailable(true);
      return `${CRM_BASE}${path}`;
    } catch {
      setSsoUnavailable(true);
      return `${CRM_BASE}${path}`;
    } finally {
      setRefreshing(false);
    }
  }, [apiKey, path]);

  useEffect(() => {
    if (!apiKey) return;
    let alive = true;
    buildUrl().then((url) => { if (alive && url) setIframeUrl(url); });
    return () => { alive = false; };
  }, [apiKey, buildUrl]);

  const refresh = async () => {
    const url = await buildUrl();
    if (url) {
      setIframeUrl(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`);
    } else if (iframeRef.current) {
      // eslint-disable-next-line no-self-assign
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  if (bootLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Configure sua chave de API em{' '}
            <Link to="/settings" className="underline font-semibold">Configurações → CRM Oficial</Link>{' '}
            antes de abrir esta tela.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-border/60 bg-card/50">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!enabled && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-amber-500/15 text-amber-500">
              Integração desativada
            </span>
          )}
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(iframeUrl || `${CRM_BASE}${path}`, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="w-4 h-4 mr-1.5" />
            Abrir em nova aba
          </Button>
        </div>
      </div>

      {ssoUnavailable && (
        <Alert className="rounded-none border-x-0 border-t-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            SSO automático ainda não disponível. Faça login no CRM Oficial dentro do quadro abaixo —
            você só precisa fazer isso uma vez por navegador.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex-1 bg-background">
        {iframeUrl ? (
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            title={title}
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write; microphone; camera; autoplay; encrypted-media"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

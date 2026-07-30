import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DashboardLayout from '@/components/layout/DashboardLayout';

const BANNER_URL = 'https://banner.alexunder.net/';

export default function BannerGenerator() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);
    // Se em 8s nada carregou, tratamos como bloqueio de incorporação.
    const blockTimer = setTimeout(() => setBlocked((b) => b || loading), 8000);
    return () => { clearTimeout(timer); clearTimeout(blockTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-1rem)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Gerador de Banner</h1>
            <p className="text-xs text-muted-foreground">Crie banners automáticos de futebol</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBlocked(false);
                setLoading(true);
                if (iframeRef.current) iframeRef.current.src = BANNER_URL;
              }}
            >
              Recarregar
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => window.open(BANNER_URL, '_blank', 'noopener')}
              className="gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir em nova aba
            </Button>
          </div>
        </div>

        {/* Iframe container */}
        <div className="relative flex-1 bg-muted/30 min-h-[500px]">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/90">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Carregando gerador de banners...</span>
            </div>
          )}
          {blocked && !loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/95 p-6 text-center">
              <p className="text-sm text-muted-foreground max-w-md">
                O site do gerador não permite ser exibido dentro do painel. Abra em uma nova aba para usá-lo.
              </p>
              <Button onClick={() => window.open(BANNER_URL, '_blank', 'noopener')} className="gap-1.5">
                <ExternalLink className="w-4 h-4" /> Abrir gerador
              </Button>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={BANNER_URL}
            title="Gerador de Banner"
            className="w-full h-full border-0"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
            allow="clipboard-read; clipboard-write"
            onLoad={() => { setLoading(false); setBlocked(false); }}
            onError={() => { setLoading(false); setBlocked(true); }}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}

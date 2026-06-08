import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BannerGenerator() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Gerador de Banner</h1>
          <p className="text-xs text-muted-foreground">Crie banners automáticos de futebol via banner.alexunder.net</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => iframeRef.current?.contentWindow?.location.reload()}
          >
            Recarregar
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => window.open('https://banner.alexunder.net/', '_blank')}
            className="gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir externo
          </Button>
        </div>
      </div>

      {/* Iframe container */}
      <div className="relative flex-1 bg-muted/30">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/90">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Carregando gerador de banners...</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src="https://banner.alexunder.net/"
          title="Gerador de Banner"
          className="w-full h-full border-0"
          allow="clipboard-read; clipboard-write"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  );
}

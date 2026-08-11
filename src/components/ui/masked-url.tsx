import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MaskedUrlProps {
  url: string;
  label?: string;
  className?: string;
}

/** Oculta a infraestrutura do backend na tela; a cópia continua enviando a URL real. */
export function maskUrl(url: string) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const tail = u.pathname.split('/').filter(Boolean).pop() || '';
    return `https://••••••••••••/${tail}${u.search ? '?•••' : ''}`;
  } catch {
    return '••••••••••••';
  }
}

export default function MaskedUrlField({ url, label = 'URL', className }: MaskedUrlProps) {
  const [revealed, setRevealed] = useState(false);
  const { toast } = useToast();

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Input
        readOnly
        value={revealed ? url : maskUrl(url)}
        className="h-8 text-[11px] font-mono bg-muted/30"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        title={revealed ? 'Ocultar' : 'Revelar'}
        onClick={() => setRevealed((v) => !v)}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        title="Copiar"
        onClick={() => {
          navigator.clipboard.writeText(url);
          toast({ title: 'Copiado', description: `${label} copiada para a área de transferência.` });
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

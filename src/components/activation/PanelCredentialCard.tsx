import { ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, CheckCircle2, CircleDashed, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  subtitle?: ReactNode;
  logo?: ReactNode;
  connected?: boolean;
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
  hint?: ReactNode;
  saving?: boolean;
  onSave?: () => void;
  saveLabel?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function PanelCredentialCard({
  title,
  subtitle,
  logo,
  connected = false,
  enabled,
  onEnabledChange,
  hint,
  saving,
  onSave,
  saveLabel = 'Salvar',
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [showHint, setShowHint] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        'group rounded-2xl border bg-card/60 backdrop-blur transition-all',
        connected ? 'border-primary/30 shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]' : 'border-border/60',
        open && 'shadow-lg',
      )}
    >
      <div className="flex items-center gap-3 p-3.5">
        <div className="w-10 h-10 rounded-xl bg-muted/60 border border-border/50 flex items-center justify-center overflow-hidden shrink-0">
          {logo}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm truncate">{title}</h3>
            <Badge
              variant={connected ? 'default' : 'secondary'}
              className="h-5 gap-1 px-1.5 text-[10px] font-medium"
            >
              {connected ? <CheckCircle2 className="w-3 h-3" /> : <CircleDashed className="w-3 h-3" />}
              {connected ? 'Configurado' : 'Pendente'}
            </Badge>
          </div>
          {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
        </div>

        {onEnabledChange && (
          <Switch
            checked={!!enabled}
            onCheckedChange={onEnabledChange}
            aria-label={`Ativação automática ${title}`}
            className="shrink-0"
          />
        )}

        <CollapsibleTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
            <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="space-y-3 border-t border-border/50 p-3.5">
          {children}

          {hint && (
            <div>
              <button
                type="button"
                onClick={() => setShowHint((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Info className="w-3 h-3" /> {showHint ? 'Ocultar instruções' : 'Como obter estes dados?'}
              </button>
              {showHint && (
                <div className="mt-2 rounded-lg bg-muted/50 border border-border/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {hint}
                </div>
              )}
            </div>
          )}

          {onSave && (
            <div className="flex justify-end">
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? 'Salvando...' : saveLabel}
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

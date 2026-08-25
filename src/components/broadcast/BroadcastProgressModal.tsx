import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, Phone, Send, AlertCircle, Gauge, Timer, StopCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BroadcastResult {
  customer: string;
  phone: string;
  status: 'sent' | 'error' | 'pending' | 'skipped';
  error?: string;
}

interface BroadcastProgressModalProps {
  open: boolean;
  onClose: () => void;
  templateName: string;
  totalToSend: number;
  results: BroadcastResult[];
  isComplete: boolean;
  sent: number;
  errors: number;
  skipped: number;
  isSending?: boolean;
  startedAt?: Date | null;
  isPaused?: boolean;
  onPause?: () => void;
  onCancel?: () => void;
}

const MAX_VISIBLE_ROWS = 300;

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '--';
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

export function BroadcastProgressModal({
  open,
  onClose,
  templateName,
  totalToSend,
  results,
  isComplete,
  sent,
  errors,
  skipped,
  isSending,
  startedAt,
  onCancel,
}: BroadcastProgressModalProps) {
  const [now, setNow] = useState(() => Date.now());

  // Ticker independente do envio: a barra nunca "congela" mesmo sem eventos novos.
  useEffect(() => {
    if (!open || isComplete) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, isComplete]);

  const processedCount = sent + errors + skipped;
  const progress = totalToSend > 0 ? Math.min(100, (processedCount / totalToSend) * 100) : 0;

  const { elapsedSeconds, perMinute, etaSeconds } = useMemo(() => {
    const started = startedAt ? startedAt.getTime() : now;
    const elapsed = Math.max(1, (now - started) / 1000);
    const rate = processedCount / elapsed; // msgs por segundo
    const remaining = Math.max(0, totalToSend - processedCount);
    return {
      elapsedSeconds: elapsed,
      perMinute: rate * 60,
      etaSeconds: rate > 0 ? remaining / rate : NaN,
    };
  }, [now, startedAt, processedCount, totalToSend]);

  const avgPerMessage = processedCount > 0 ? elapsedSeconds / processedCount : 0;

  const visibleResults = useMemo(() => {
    if (results.length <= MAX_VISIBLE_ROWS) return results;
    return results.slice(-MAX_VISIBLE_ROWS);
  }, [results]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col mx-2 sm:mx-auto border-primary/20 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15">
              <Send className="w-4 h-4 text-primary" />
            </span>
            <span className="truncate">Disparo em Massa — {templateName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Progresso */}
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {isComplete ? 'Disparo concluído' : 'Enviando mensagens'}
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {progress.toFixed(1)}
                  <span className="text-base font-medium text-muted-foreground">%</span>
                </p>
              </div>
              <p className="text-sm font-medium tabular-nums text-muted-foreground">
                {processedCount} / {totalToSend}
              </p>
            </div>

            <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-500 ease-out',
                  isComplete ? 'bg-success' : 'bg-primary',
                )}
                style={{ width: `${Math.max(progress, processedCount > 0 ? 2 : 0)}%` }}
              />
              {!isComplete && (
                <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Timer className="w-3.5 h-3.5" />
                <span>Decorrido: <strong className="text-foreground">{formatDuration(elapsedSeconds)}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Timer className="w-3.5 h-3.5" />
                <span>Restante: <strong className="text-foreground">{isComplete ? '0s' : formatDuration(etaSeconds)}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Gauge className="w-3.5 h-3.5" />
                <span>Ritmo: <strong className="text-foreground">{perMinute.toFixed(0)}/min</strong></span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Gauge className="w-3.5 h-3.5" />
                <span>Média: <strong className="text-foreground">{avgPerMessage.toFixed(1)}s/msg</strong></span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 rounded-xl bg-success/10 border border-success/20 text-center">
              <div className="flex items-center justify-center gap-1 text-success">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-base sm:text-lg font-bold tabular-nums">{sent}</span>
              </div>
              <p className="text-[10px] sm:text-xs text-success/80">Enviados</p>
            </div>
            <div className="p-2 sm:p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-center">
              <div className="flex items-center justify-center gap-1 text-destructive">
                <XCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-base sm:text-lg font-bold tabular-nums">{errors}</span>
              </div>
              <p className="text-[10px] sm:text-xs text-destructive/80">Erros</p>
            </div>
            <div className="p-2 sm:p-3 rounded-xl bg-muted/50 border border-border text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-base sm:text-lg font-bold tabular-nums">{skipped}</span>
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Ignorados</p>
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs sm:text-sm font-medium">Detalhes do envio</p>
              {results.length > MAX_VISIBLE_ROWS && (
                <span className="text-[10px] text-muted-foreground">
                  exibindo os últimos {MAX_VISIBLE_ROWS} de {results.length}
                </span>
              )}
            </div>
            <ScrollArea className="h-[190px] sm:h-[280px] border rounded-xl">
              <div className="p-2 space-y-1">
                {visibleResults.length === 0 && !isComplete && (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Preparando fila de envio...
                  </div>
                )}
                {visibleResults.map((result, index) => (
                  <div
                    key={`${result.phone}-${index}`}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-lg text-sm',
                      result.status === 'sent' && 'bg-success/5',
                      result.status === 'error' && 'bg-destructive/5',
                      result.status === 'skipped' && 'bg-muted/50',
                      result.status === 'pending' && 'bg-muted/30'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {result.status === 'sent' && (
                        <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                      )}
                      {result.status === 'error' && (
                        <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                      )}
                      {result.status === 'skipped' && (
                        <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      {result.status === 'pending' && (
                        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{result.customer}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {result.phone}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge
                        variant={
                          result.status === 'sent' ? 'default' :
                          result.status === 'error' ? 'destructive' :
                          'secondary'
                        }
                        className="text-xs"
                      >
                        {result.status === 'sent' ? 'Enviado' :
                         result.status === 'error' ? 'Erro' :
                         result.status === 'skipped' ? 'Ignorado' : 'Pendente'}
                      </Badge>
                      {result.error && (
                        <span className="text-xs text-destructive max-w-[150px] truncate" title={result.error}>
                          {result.error}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Ações */}
          <div className="flex gap-2">
            {isSending && onCancel && (
              <Button variant="destructive" onClick={onCancel} className="flex-1">
                <StopCircle className="w-4 h-4 mr-2" />
                Parar disparo
              </Button>
            )}
            <Button onClick={onClose} variant={isSending ? 'outline' : 'default'} className="flex-1">
              {isComplete ? 'Fechar' : 'Fechar (continua enviando)'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

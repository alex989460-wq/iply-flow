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
import { CheckCircle, XCircle, Loader2, Phone, Send, AlertCircle, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SendResult {
  customer: string;
  phone: string;
  billingType: string;
  template: string;
  status: 'sent' | 'error' | 'pending' | 'skipped';
  error?: string;
}

interface SendProgressModalProps {
  open: boolean;
  onClose: () => void;
  billingType: string;
  totalToSend: number;
  results: SendResult[];
  isComplete: boolean;
  sent: number;
  errors: number;
  skipped: number;
  onCancel?: () => void;
  isCancelling?: boolean;
  cancelled?: boolean;
}

export function SendProgressModal({
  open,
  onClose,
  billingType,
  totalToSend,
  results,
  isComplete,
  sent,
  errors,
  skipped,
  onCancel,
  isCancelling,
  cancelled,
}: SendProgressModalProps) {
  const processedCount = sent + errors + skipped;
  const progress = totalToSend > 0 ? Math.min(100, (processedCount / totalToSend) * 100) : 0;

  const getBillingTypeLabel = (type: string) => {
    switch (type) {
      case 'D-1': return 'D-1 (Vencem Amanhã)';
      case 'D0': return 'D0 (Vencem Hoje)';
      case 'D+1': return 'D+1 (Venceram Ontem)';
      case 'all': return 'Todas as Cobranças';
      default: return type;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && isComplete && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col mx-2 sm:mx-auto border-border/60 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Send className="w-4 h-4" />
            </span>
            <span className="truncate">{getBillingTypeLabel(billingType)}</span>
            {cancelled && (
              <Badge variant="secondary" className="ml-1 text-[10px]">Cancelado</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Progress Section */}
          <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/20 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                {!isComplete && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                {isComplete
                  ? (cancelled ? 'Envio cancelado' : 'Envio concluído!')
                  : (isCancelling ? 'Cancelando após o lote atual…' : 'Enviando…')}
              </span>
              <span className="font-medium tabular-nums">
                {processedCount} / {totalToSend} · {Math.round(progress)}%
              </span>
            </div>
            <Progress value={progress} className="h-2.5" />
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

          {/* Results List */}
          <div className="flex-1 overflow-hidden">
            <p className="text-xs sm:text-sm font-medium mb-2">Detalhes do envio:</p>
            <ScrollArea className="h-[200px] sm:h-[300px] border border-border/60 rounded-xl bg-background/40">
              <div className="p-2 space-y-1">
                {results.length === 0 && !isComplete && (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Aguardando...
                  </div>
                )}
                {results.map((result, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-lg text-sm border border-transparent',
                      result.status === 'sent' && 'bg-success/5 border-success/20',
                      result.status === 'error' && 'bg-destructive/5 border-destructive/20',
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
                        <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
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
                        {result.status === 'pending' ? 'Enviando...' : result.billingType}
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

          {/* Actions */}
          {isComplete ? (
            <Button onClick={onClose} className="w-full">
              Fechar
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={onCancel}
              disabled={!onCancel || isCancelling}
              className="w-full"
            >
              {isCancelling ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cancelando…</>
              ) : (
                <><Ban className="w-4 h-4 mr-2" /> Cancelar envio</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

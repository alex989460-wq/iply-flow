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
import { CheckCircle, XCircle, Loader2, Phone, Send, AlertCircle } from 'lucide-react';
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
}: BroadcastProgressModalProps) {
  const processedCount = sent + errors + skipped;
  const progress = totalToSend > 0 ? (processedCount / totalToSend) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && isComplete && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] sm:max-h-[80vh] flex flex-col mx-2 sm:mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Send className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            <span className="truncate">Disparo em Massa - {templateName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Progress Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {isComplete ? 'Disparo concluído!' : 'Enviando...'}
              </span>
              <span className="font-medium">
                {processedCount} / {totalToSend}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 rounded-lg bg-success/10 border border-success/20 text-center">
              <div className="flex items-center justify-center gap-1 text-success">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-base sm:text-lg font-bold">{sent}</span>
              </div>
              <p className="text-[10px] sm:text-xs text-success/80">Enviados</p>
            </div>
            <div className="p-2 sm:p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-center">
              <div className="flex items-center justify-center gap-1 text-destructive">
                <XCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-base sm:text-lg font-bold">{errors}</span>
              </div>
              <p className="text-[10px] sm:text-xs text-destructive/80">Erros</p>
            </div>
            <div className="p-2 sm:p-3 rounded-lg bg-muted/50 border border-border text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-base sm:text-lg font-bold">{skipped}</span>
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Ignorados</p>
            </div>
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-hidden">
            <p className="text-xs sm:text-sm font-medium mb-2">Detalhes do envio:</p>
            <ScrollArea className="h-[200px] sm:h-[300px] border rounded-lg">
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

          {/* Close Button */}
          {isComplete && (
            <Button onClick={onClose} className="w-full">
              Fechar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

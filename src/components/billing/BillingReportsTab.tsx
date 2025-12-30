import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckCircle, 
  XCircle, 
  Phone, 
  FileText, 
  Search,
  Filter,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SendResult {
  customer: string;
  phone: string;
  billingType: string;
  template: string;
  status: 'sent' | 'error';
  error?: string;
  timestamp?: string;
}

interface BillingReportsTabProps {
  lastResults: SendResult[];
  lastBillingType: string;
  lastSentAt?: Date;
}

export function BillingReportsTab({ 
  lastResults, 
  lastBillingType,
  lastSentAt 
}: BillingReportsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'error'>('all');

  const filteredResults = lastResults.filter(result => {
    const matchesSearch = 
      result.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      result.phone.includes(searchTerm);
    
    const matchesStatus = statusFilter === 'all' || result.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const sentCount = lastResults.filter(r => r.status === 'sent').length;
  const errorCount = lastResults.filter(r => r.status === 'error').length;

  const getBillingTypeLabel = (type: string) => {
    switch (type) {
      case 'D-1': return 'D-1 (Vencem Amanhã)';
      case 'D0': return 'D0 (Vencem Hoje)';
      case 'D+1': return 'D+1 (Venceram Ontem)';
      case 'all': return 'Todas as Cobranças';
      default: return type;
    }
  };

  const exportToCSV = () => {
    if (filteredResults.length === 0) return;
    
    const headers = ['Cliente', 'Telefone', 'Tipo', 'Template', 'Status', 'Erro'];
    const rows = filteredResults.map(r => [
      r.customer,
      r.phone,
      r.billingType,
      r.template,
      r.status === 'sent' ? 'Enviado' : 'Erro',
      r.error || ''
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-cobrancas-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (lastResults.length === 0) {
    return (
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Relatório do Último Envio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum envio realizado ainda.</p>
            <p className="text-sm mt-2">Os resultados aparecerão aqui após enviar cobranças.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-border/50">
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Relatório do Último Envio
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {getBillingTypeLabel(lastBillingType)} 
              {lastSentAt && ` • ${lastSentAt.toLocaleString('pt-BR')}`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-lg bg-success/10 border border-success/20">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-success" />
              <span className="text-2xl font-bold text-success">{sentCount}</span>
            </div>
            <p className="text-sm text-success/80 mt-1">Enviados com sucesso</p>
          </div>
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="text-2xl font-bold text-destructive">{errorCount}</span>
            </div>
            <p className="text-sm text-destructive/80 mt-1">Erros no envio</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sent">Enviados</SelectItem>
              <SelectItem value="error">Erros</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results Table */}
        <ScrollArea className="h-[400px] border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum resultado encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredResults.map((result, index) => (
                  <TableRow 
                    key={index}
                    className={cn(
                      result.status === 'error' && 'bg-destructive/5'
                    )}
                  >
                    <TableCell>
                      {result.status === 'sent' ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{result.customer}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        {result.phone}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        result.billingType === 'D-1' ? 'secondary' :
                        result.billingType === 'D0' ? 'default' : 'destructive'
                      }>
                        {result.billingType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {result.template}
                    </TableCell>
                    <TableCell>
                      {result.error && (
                        <span className="text-sm text-destructive" title={result.error}>
                          {result.error.length > 40 
                            ? result.error.substring(0, 40) + '...' 
                            : result.error}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

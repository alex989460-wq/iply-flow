import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Upload,
  FileUp,
  Home,
  CreditCard,
  Car,
  Wifi,
  Phone,
  ShoppingCart,
  Heart,
  GraduationCap,
  Utensils,
  Dumbbell,
  Briefcase,
  Receipt,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Loader2,
} from 'lucide-react';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string; keywords: string[] }> = {
  casa: { icon: Home, color: 'bg-amber-500', label: 'Casa', keywords: ['aluguel', 'condominio', 'energia', 'luz', 'agua', 'gas', 'iptu'] },
  cartao: { icon: CreditCard, color: 'bg-purple-500', label: 'Cartão', keywords: ['nubank', 'inter', 'itau', 'bradesco', 'santander', 'c6', 'fatura', 'cartao'] },
  carro: { icon: Car, color: 'bg-blue-500', label: 'Carro', keywords: ['combustivel', 'gasolina', 'etanol', 'posto', 'ipva', 'seguro auto', 'estacionamento', 'uber', '99'] },
  internet: { icon: Wifi, color: 'bg-cyan-500', label: 'Internet', keywords: ['internet', 'fibra', 'vivo', 'claro', 'tim', 'oi', 'net'] },
  telefone: { icon: Phone, color: 'bg-green-500', label: 'Telefone', keywords: ['telefone', 'celular', 'recarga', 'credito celular'] },
  mercado: { icon: ShoppingCart, color: 'bg-orange-500', label: 'Mercado', keywords: ['mercado', 'supermercado', 'atacado', 'carrefour', 'extra', 'pao de acucar', 'assai'] },
  saude: { icon: Heart, color: 'bg-red-500', label: 'Saúde', keywords: ['farmacia', 'drogaria', 'hospital', 'clinica', 'medico', 'consulta', 'exame', 'plano saude', 'unimed'] },
  educacao: { icon: GraduationCap, color: 'bg-indigo-500', label: 'Educação', keywords: ['escola', 'faculdade', 'curso', 'mensalidade', 'material escolar', 'livro'] },
  alimentacao: { icon: Utensils, color: 'bg-yellow-500', label: 'Alimentação', keywords: ['restaurante', 'lanchonete', 'ifood', 'rappi', 'delivery', 'padaria', 'cafe'] },
  academia: { icon: Dumbbell, color: 'bg-pink-500', label: 'Academia', keywords: ['academia', 'smart fit', 'bluefit', 'crossfit', 'pilates'] },
  trabalho: { icon: Briefcase, color: 'bg-slate-500', label: 'Trabalho', keywords: ['material escritorio', 'coworking', 'software', 'assinatura'] },
  outros: { icon: Receipt, color: 'bg-gray-500', label: 'Outros', keywords: [] },
};

interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  selected: boolean;
}

interface BankStatementImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (transactions: { category: string; description: string; amount: number; due_date: string }[]) => void;
}

export default function BankStatementImportModal({ open, onOpenChange, onImport }: BankStatementImportModalProps) {
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [dateColumn, setDateColumn] = useState('0');
  const [descColumn, setDescColumn] = useState('1');
  const [amountColumn, setAmountColumn] = useState('2');
  const [dateFormat, setDateFormat] = useState('dd/MM/yyyy');
  const [headerRow, setHeaderRow] = useState(true);
  const [rawData, setRawData] = useState<string[][]>([]);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectCategory = (description: string): string => {
    const lowerDesc = description.toLowerCase();
    for (const [category, config] of Object.entries(CATEGORY_CONFIG)) {
      if (config.keywords.some(keyword => lowerDesc.includes(keyword))) {
        return category;
      }
    }
    return 'outros';
  };

  const parseDate = (dateStr: string): string | null => {
    const formats = [
      'dd/MM/yyyy',
      'dd-MM-yyyy',
      'yyyy-MM-dd',
      'MM/dd/yyyy',
      'd/M/yyyy',
      'dd/MM/yy',
    ];
    
    for (const fmt of formats) {
      try {
        const parsed = parse(dateStr.trim(), fmt, new Date());
        if (isValid(parsed)) {
          return format(parsed, 'yyyy-MM-dd');
        }
      } catch {
        continue;
      }
    }
    return null;
  };

  const parseAmount = (amountStr: string): number => {
    // Remove currency symbols and spaces
    let cleaned = amountStr.replace(/[R$\s]/g, '').trim();
    // Handle Brazilian format (1.234,56) vs American format (1,234.56)
    if (cleaned.includes(',') && cleaned.includes('.')) {
      if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        // Brazilian format: 1.234,56
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        // American format: 1,234.56
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      // Only comma: assume decimal separator
      cleaned = cleaned.replace(',', '.');
    }
    const value = Math.abs(parseFloat(cleaned));
    return isNaN(value) ? 0 : value;
  };

  const parsePdfText = (text: string): string[][] => {
    // Parse bank statement PDF text into structured data
    const lines = text.split('\n').filter(line => line.trim());
    const data: string[][] = [];
    
    // Common patterns for Brazilian bank statements
    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
    const amountPattern = /R?\$?\s*([\d.,]+(?:,\d{2})?)/;
    
    // Add header row
    data.push(['Data', 'Descrição', 'Valor']);
    
    for (const line of lines) {
      const dateMatch = line.match(datePattern);
      const amountMatches = line.match(new RegExp(amountPattern.source, 'g'));
      
      if (dateMatch && amountMatches && amountMatches.length > 0) {
        const date = dateMatch[1];
        // Get the last amount match (usually the transaction value)
        const amountStr = amountMatches[amountMatches.length - 1];
        // Extract description (remove date and amounts from the line)
        let description = line
          .replace(datePattern, '')
          .replace(new RegExp(amountPattern.source, 'g'), '')
          .replace(/[R$]/g, '')
          .trim();
        
        // Clean up excessive whitespace
        description = description.replace(/\s+/g, ' ').trim();
        
        if (description && description.length > 3) {
          data.push([date, description, amountStr]);
        }
      }
    }
    
    return data;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Handle PDF files
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setIsLoadingPdf(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
          fullText += pageText + '\n';
        }
        
        const data = parsePdfText(fullText);
        
        if (data.length < 2) {
          toast.error('Não foi possível extrair transações do PDF. Tente CSV ou Excel.');
          setIsLoadingPdf(false);
          return;
        }
        
        setRawData(data);
        setDateColumn('0');
        setDescColumn('1');
        setAmountColumn('2');
        setHeaderRow(true);
        
        toast.success(`PDF processado! ${data.length - 1} linhas encontradas.`);
      } catch (error) {
        console.error('Error parsing PDF:', error);
        toast.error('Erro ao processar PDF. Tente outro formato.');
      } finally {
        setIsLoadingPdf(false);
      }
      return;
    }

    // Handle Excel and CSV files
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        let data: string[][] = [];
        
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          // Parse Excel file
          const workbook = XLSX.read(text, { type: 'binary' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as string[][];
        } else {
          // Parse CSV
          const lines = text.split(/\r?\n/).filter(line => line.trim());
          data = lines.map(line => {
            // Handle both comma and semicolon delimiters
            const delimiter = line.includes(';') ? ';' : ',';
            return line.split(delimiter).map(cell => cell.replace(/^["']|["']$/g, '').trim());
          });
        }
        
        if (data.length < 2) {
          toast.error('Arquivo vazio ou inválido');
          return;
        }
        
        setRawData(data);
        
        // Auto-detect columns based on header
        const header = data[0].map(h => String(h).toLowerCase());
        header.forEach((col, idx) => {
          if (col.includes('data') || col.includes('date')) setDateColumn(idx.toString());
          if (col.includes('descri') || col.includes('histor') || col.includes('memo')) setDescColumn(idx.toString());
          if (col.includes('valor') || col.includes('amount') || col.includes('quantia')) setAmountColumn(idx.toString());
        });
        
        toast.success('Arquivo carregado! Configure as colunas.');
      } catch (error) {
        console.error('Error parsing file:', error);
        toast.error('Erro ao processar arquivo');
      }
    };
    
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file);
    }
  };

  const processTransactions = () => {
    if (rawData.length === 0) {
      toast.error('Nenhum dado para processar');
      return;
    }

    const startIdx = headerRow ? 1 : 0;
    const parsed: ParsedTransaction[] = [];
    
    for (let i = startIdx; i < rawData.length; i++) {
      const row = rawData[i];
      const dateStr = row[parseInt(dateColumn)] || '';
      const desc = row[parseInt(descColumn)] || '';
      const amountStr = row[parseInt(amountColumn)] || '';
      
      const date = parseDate(dateStr);
      const amount = parseAmount(amountStr);
      
      if (date && desc && amount > 0) {
        parsed.push({
          id: `${i}-${Date.now()}`,
          date,
          description: desc.substring(0, 100),
          amount,
          category: detectCategory(desc),
          selected: true,
        });
      }
    }
    
    if (parsed.length === 0) {
      toast.error('Nenhuma transação válida encontrada. Verifique as colunas selecionadas.');
      return;
    }
    
    setTransactions(parsed);
    setStep('review');
    toast.success(`${parsed.length} transações identificadas!`);
  };

  const handleToggleSelect = (id: string) => {
    setTransactions(prev =>
      prev.map(t => t.id === id ? { ...t, selected: !t.selected } : t)
    );
  };

  const handleToggleAll = () => {
    const allSelected = transactions.every(t => t.selected);
    setTransactions(prev => prev.map(t => ({ ...t, selected: !allSelected })));
  };

  const handleCategoryChange = (id: string, category: string) => {
    setTransactions(prev =>
      prev.map(t => t.id === id ? { ...t, category } : t)
    );
  };

  const handleImport = () => {
    const selected = transactions.filter(t => t.selected);
    if (selected.length === 0) {
      toast.error('Selecione pelo menos uma transação');
      return;
    }
    
    onImport(selected.map(t => ({
      category: t.category,
      description: t.description,
      amount: t.amount,
      due_date: t.date,
    })));
    
    // Reset state
    setStep('upload');
    setTransactions([]);
    setRawData([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    setStep('upload');
    setTransactions([]);
    setRawData([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onOpenChange(false);
  };

  const selectedCount = transactions.filter(t => t.selected).length;
  const totalAmount = transactions.filter(t => t.selected).reduce((sum, t) => sum + t.amount, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Importar Extrato Bancário
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' 
              ? 'Carregue seu extrato bancário (PDF, CSV ou Excel) e configure as colunas'
              : 'Revise as transações e ajuste as categorias antes de importar'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-6 py-4">
            {/* File Upload */}
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.pdf"
                onChange={handleFileUpload}
                className="hidden"
                id="bank-statement-upload"
                disabled={isLoadingPdf}
              />
              <label htmlFor="bank-statement-upload" className={cn("cursor-pointer", isLoadingPdf && "pointer-events-none")}>
                {isLoadingPdf ? (
                  <>
                    <Loader2 className="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
                    <p className="text-lg font-medium">Processando PDF...</p>
                    <p className="text-sm text-muted-foreground mt-1">Extraindo transações do documento</p>
                  </>
                ) : (
                  <>
                    <FileUp className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">Clique para selecionar o arquivo</p>
                    <p className="text-sm text-muted-foreground mt-1">PDF, CSV, Excel (.xlsx, .xls)</p>
                  </>
                )}
              </label>
            </div>

            {rawData.length > 0 && (
              <>
                {/* Preview */}
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    Prévia do arquivo ({rawData.length} linhas)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full">
                      <tbody>
                        {rawData.slice(0, 4).map((row, i) => (
                          <tr key={i} className={i === 0 && headerRow ? 'font-semibold bg-muted' : ''}>
                            {row.slice(0, 6).map((cell, j) => (
                              <td key={j} className="px-2 py-1 border-b truncate max-w-[120px]">
                                <span className="text-muted-foreground mr-1">[{j}]</span>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Column Configuration */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Coluna Data</Label>
                    <Select value={dateColumn} onValueChange={setDateColumn}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {rawData[0]?.map((_, i) => (
                          <SelectItem key={i} value={i.toString()}>Coluna {i}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Coluna Descrição</Label>
                    <Select value={descColumn} onValueChange={setDescColumn}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {rawData[0]?.map((_, i) => (
                          <SelectItem key={i} value={i.toString()}>Coluna {i}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Coluna Valor</Label>
                    <Select value={amountColumn} onValueChange={setAmountColumn}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {rawData[0]?.map((_, i) => (
                          <SelectItem key={i} value={i.toString()}>Coluna {i}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox 
                        checked={headerRow} 
                        onCheckedChange={(checked) => setHeaderRow(checked === true)}
                      />
                      Tem cabeçalho
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'review' && (
          <div className="flex-1 min-h-0 space-y-4">
            {/* Summary Bar */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox 
                    checked={transactions.every(t => t.selected)}
                    onCheckedChange={handleToggleAll}
                  />
                  Selecionar tudo
                </label>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {selectedCount} de {transactions.length}
                </Badge>
              </div>
              <div className="text-sm font-medium">
                Total: <span className="text-primary">R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Transactions List */}
            <ScrollArea className="flex-1 h-[350px] pr-4">
              <div className="space-y-2">
                {transactions.map((transaction) => {
                  const config = CATEGORY_CONFIG[transaction.category];
                  const Icon = config.icon;
                  
                  return (
                    <div 
                      key={transaction.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                        transaction.selected 
                          ? "bg-background border-primary/30" 
                          : "bg-muted/30 border-transparent opacity-60"
                      )}
                    >
                      <Checkbox 
                        checked={transaction.selected}
                        onCheckedChange={() => handleToggleSelect(transaction.id)}
                      />
                      
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0", config.color)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{transaction.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(transaction.date + 'T12:00:00'), "dd 'de' MMM, yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      
                      <Select 
                        value={transaction.category} 
                        onValueChange={(v) => handleCategoryChange(transaction.id, v)}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORY_CONFIG).map(([key, { icon: CatIcon, label, color }]) => (
                            <SelectItem key={key} value={key}>
                              <div className="flex items-center gap-2">
                                <div className={cn("w-4 h-4 rounded flex items-center justify-center text-white", color)}>
                                  <CatIcon className="w-2.5 h-2.5" />
                                </div>
                                {label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <span className="text-sm font-semibold w-24 text-right">
                        R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'review' && (
            <Button variant="outline" onClick={() => setStep('upload')}>
              Voltar
            </Button>
          )}
          {step === 'upload' ? (
            <Button 
              onClick={processTransactions} 
              disabled={rawData.length === 0}
              className="gap-2"
            >
              Processar
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button 
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="gap-2 bg-gradient-to-r from-primary to-primary/80"
            >
              <CheckCircle2 className="w-4 h-4" />
              Importar {selectedCount} despesas
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

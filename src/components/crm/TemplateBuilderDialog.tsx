import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  X, Hash, Image as ImageIcon, Video, FileText, Type as TypeIcon, Loader2, Send,
  Bold, Italic, Strikethrough, Code, Phone, Link2, Reply, Trash2, Plus, Upload,
} from 'lucide-react';

type HeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

interface BtnDef { id: string; type: ButtonType; text: string; url?: string; phone?: string }

type VarType = 'NUMBER' | 'NAME';

interface FormState {
  name: string;
  category: string;
  language: string;
  headerType: HeaderType;
  headerText: string;
  headerMediaUrl: string;
  headerHandle: string;
  body: string;
  footer: string;
  buttons: BtnDef[];
  allowCategoryChange: boolean;
  bodyExamples: Record<string, string>;
  varType: VarType;
}

const empty: FormState = {
  name: '', category: 'UTILITY', language: 'pt_BR',
  headerType: 'NONE', headerText: '', headerMediaUrl: '', headerHandle: '',
  body: '', footer: '', buttons: [], allowCategoryChange: false,
  bodyExamples: {},
  varType: 'NAME',
};

// Extracts variable tokens — supports both numeric ({{1}}) and named ({{name}}) parameters.
function extractVarTokens(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = m[1];
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  // Numeric tokens sorted; named keep insertion order after.
  const nums = out.filter(v => /^\d+$/.test(v)).sort((a, b) => Number(a) - Number(b));
  const names = out.filter(v => !/^\d+$/.test(v));
  return [...nums, ...names];
}

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

function renderWhatsAppText(raw: string) {
  if (!raw) return null;
  // Basic WhatsApp formatting: *bold* _italic_ ~strike~ `code`
  const esc = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = esc
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/`([^`\n]+)`/g, '<code class="bg-black/10 px-1 rounded">$1</code>')
    .replace(/\n/g, '<br/>');
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export interface TemplateBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial?: Partial<FormState> & { metaId?: string };
  onSaved: () => void;
}

export default function TemplateBuilderDialog({ open, onOpenChange, mode, initial, onSaved }: TemplateBuilderDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setForm({ ...empty, ...initial } as FormState);
  }, [open]); // eslint-disable-line

  const slug = useMemo(() => slugify(form.name), [form.name]);

  const update = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  const headerTypes: { id: HeaderType; label: string; icon: any }[] = [
    { id: 'NONE', label: 'Nenhum', icon: X },
    { id: 'TEXT', label: 'Texto', icon: TypeIcon },
    { id: 'IMAGE', label: 'Imagem', icon: ImageIcon },
    { id: 'VIDEO', label: 'Vídeo', icon: Video },
    { id: 'DOCUMENT', label: 'PDF', icon: FileText },
  ];

  const wrapSelection = (before: string, after = before) => {
    const ta = bodyRef.current; if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const txt = form.body;
    const sel = txt.slice(start, end) || 'texto';
    const next = txt.slice(0, start) + before + sel + after + txt.slice(end);
    update({ body: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + sel.length);
    });
  };

  const onPickFile = async (file: File) => {
    if (!file) return;
    const maxByType: Record<HeaderType, number> = {
      NONE: 0,
      TEXT: 0,
      IMAGE: 5 * 1024 * 1024,
      VIDEO: 16 * 1024 * 1024,
      DOCUMENT: 20 * 1024 * 1024,
    };
    const maxSize = maxByType[form.headerType] || 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: 'Arquivo muito grande',
        description: `Limite para ${form.headerType === 'IMAGE' ? 'imagem' : form.headerType === 'VIDEO' ? 'vídeo' : 'PDF'}: ${Math.round(maxSize / 1024 / 1024)}MB.`,
        variant: 'destructive',
      });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      // 1) Upload to storage to get a stable URL (avoids multipart issues in edge invoke)
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
      const path = `meta-template-uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('reseller-assets')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from('reseller-assets').getPublicUrl(path);
      const fileUrl = pub.publicUrl;

      // 2) Ask edge function to fetch the URL and run resumable upload to Meta
      const uploadPromise = supabase.functions.invoke('meta-templates', {
        body: {
          action: 'upload-media',
          file_url: fileUrl,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          header_type: form.headerType,
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('Upload demorou demais. Tente um arquivo menor.')), 90_000);
      });
      const { data: res, error } = await Promise.race([uploadPromise, timeoutPromise]) as any;
      if (error || res?.error) throw new Error(res?.error || error?.message);
      update({ headerHandle: res.header_handle, headerMediaUrl: fileUrl });
      toast({ title: 'Mídia enviada à Meta', description: 'Handle pronto para o template.' });
    } catch (e: any) {
      toast({ title: 'Falha no upload', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };


  const buildComponents = () => {
    const comps: any[] = [];
    if (form.headerType === 'TEXT' && form.headerText.trim()) {
      comps.push({ type: 'HEADER', format: 'TEXT', text: form.headerText.trim() });
    } else if (form.headerType !== 'NONE' && form.headerType !== 'TEXT') {
      const fmt = form.headerType; // IMAGE | VIDEO | DOCUMENT
      if (!form.headerHandle) throw new Error(`Envie o arquivo do cabeçalho (${fmt.toLowerCase()}).`);
      comps.push({ type: 'HEADER', format: fmt, example: { header_handle: [form.headerHandle] } });
    }
    const bodyVars = extractVarTokens(form.body);
    const bodyComp: any = { type: 'BODY', text: form.body.trim() };
    if (bodyVars.length) {
      const allNumeric = bodyVars.every(v => /^\d+$/.test(v));
      if (allNumeric) {
        const examples = bodyVars.map((v, i) => (form.bodyExamples[v] || '').trim() || `exemplo${i + 1}`);
        bodyComp.example = { body_text: [examples] };
      } else {
        bodyComp.example = {
          body_text_named_params: bodyVars.map(v => ({
            param_name: v,
            example: (form.bodyExamples[v] || '').trim() || v,
          })),
        };
      }
    }
    comps.push(bodyComp);
    if (form.footer.trim()) comps.push({ type: 'FOOTER', text: form.footer.trim() });
    if (form.buttons.length) {
      comps.push({
        type: 'BUTTONS',
        buttons: form.buttons.map(b => {
          if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
          if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone };
          return { type: 'QUICK_REPLY', text: b.text };
        }),
      });
    }
    return comps;
  };

  const bodyVars = extractVarTokens(form.body);

  const save = async () => {
    if (!form.name.trim() || !form.body.trim()) {
      toast({ title: 'Campos obrigatórios', description: 'Nome e corpo são obrigatórios.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const components = buildComponents();
      const payload: any = mode === 'edit' && (initial as any)?.metaId
        ? { action: 'update', template_id: (initial as any).metaId, components }
        : { action: 'create', name: slug, category: form.category, language: form.language, components, allow_category_change: form.allowCategoryChange };
      const { data: res, error } = await supabase.functions.invoke('meta-templates', { body: payload });
      if (error || res?.error) throw new Error(res?.error || error?.message || 'Falha na Meta API');
      toast({ title: mode === 'edit' ? 'Template atualizado' : 'Template enviado', description: 'Aguarde validação da Meta.' });
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addButton = (type: ButtonType) => {
    if (form.buttons.length >= 10) return;
    update({ buttons: [...form.buttons, { id: crypto.randomUUID(), type, text: '' }] });
  };
  const updateButton = (id: string, patch: Partial<BtnDef>) =>
    update({ buttons: form.buttons.map(b => b.id === id ? { ...b, ...patch } : b) });
  const removeButton = (id: string) => update({ buttons: form.buttons.filter(b => b.id !== id) });

  const acceptByType = form.headerType === 'IMAGE' ? 'image/*'
    : form.headerType === 'VIDEO' ? 'video/*'
    : form.headerType === 'DOCUMENT' ? 'application/pdf' : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 overflow-hidden gap-0 bg-card border-border/60">
        <div className="grid md:grid-cols-[1fr_400px]">
          {/* FORM */}
          <div className="p-6 md:p-8 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start gap-2 mb-1">
              <Hash className="w-6 h-6 text-emerald-500 mt-1" />
              <div>
                <h2 className="text-2xl font-bold">{mode === 'edit' ? 'Editar template' : 'Novo template'}</h2>
                <p className="text-sm text-muted-foreground">Modelo de mensagem oficial. Após criado, passa por validação da Meta.</p>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Nome</Label>
                <Input placeholder="Ex: Confirmação de pedido" value={form.name} onChange={e => update({ name: e.target.value })} disabled={mode === 'edit'} />
                <p className="text-xs text-muted-foreground">Vira slug automaticamente: <span className="text-emerald-500 font-mono">{slug || 'nome_do_template'}</span></p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Idioma</Label>
                  <Select value={form.language} onValueChange={v => update({ language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                      <SelectItem value="en_US">English (US)</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Categoria</Label>
                  <Select value={form.category} onValueChange={v => update({ category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTILITY">Utility (transacional)</SelectItem>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Cabeçalho <span className="text-muted-foreground font-normal">opcional</span></Label>
                <div className="flex flex-wrap gap-2">
                  {headerTypes.map(h => {
                    const Icon = h.icon;
                    const active = form.headerType === h.id;
                    return (
                      <button key={h.id} type="button"
                        onClick={() => update({ headerType: h.id, headerHandle: '', headerMediaUrl: '' })}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition',
                          active ? 'bg-emerald-500 text-white border-emerald-500 shadow' : 'bg-background border-border/60 hover:border-emerald-500/50',
                        )}>
                        <Icon className="w-4 h-4" /> {h.label}
                      </button>
                    );
                  })}
                </div>
                {form.headerType === 'TEXT' && (
                  <Input className="mt-2" placeholder="Texto do cabeçalho (máx 60)" maxLength={60}
                    value={form.headerText} onChange={e => update({ headerText: e.target.value })} />
                )}
                {(form.headerType === 'IMAGE' || form.headerType === 'VIDEO' || form.headerType === 'DOCUMENT') && (
                  <div className="mt-2 rounded-xl border border-dashed border-border/60 p-4 flex items-center gap-3">
                    <input ref={fileRef} type="file" accept={acceptByType} className="hidden"
                      onChange={e => e.target.files?.[0] && onPickFile(e.target.files[0])} />
                    <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                      {form.headerHandle ? 'Trocar arquivo' : 'Escolher arquivo'}
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      {form.headerHandle ? '✓ Arquivo enviado à Meta' : 'Envie a mídia que será exibida no topo do template'}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label className="text-sm font-semibold">Corpo</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Tipo de variável:</Label>
                    <Select value={form.varType} onValueChange={(v: VarType) => update({ varType: v })}>
                      <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NAME">Nome</SelectItem>
                        <SelectItem value="NUMBER">Número</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">{form.body.length}/1024</span>
                  </div>
                </div>
                <div className="flex gap-1 mb-1 flex-wrap">
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => wrapSelection('*')}><Bold className="w-4 h-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => wrapSelection('_')}><Italic className="w-4 h-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => wrapSelection('~')}><Strikethrough className="w-4 h-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => wrapSelection('`')}><Code className="w-4 h-4" /></Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 ml-auto" onClick={addVariable}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar variável
                  </Button>
                </div>
                <Textarea ref={bodyRef} rows={7} maxLength={1024} value={form.body}
                  onChange={e => update({ body: e.target.value })}
                  placeholder={form.varType === 'NAME'
                    ? `Ex: Olá {{name}}, seu plano {{plan}} vence em {{data}}.\n\nObrigado!`
                    : `Ex: Olá {{1}}, seu plano {{2}} vence em {{3}}.\n\nObrigado!`} />
                <p className="text-xs text-muted-foreground">
                  {form.varType === 'NAME'
                    ? <>Use variáveis nomeadas: <code className="font-mono text-emerald-500">{`{{name}}`}</code>, <code className="font-mono text-emerald-500">{`{{user}}`}</code>, <code className="font-mono text-emerald-500">{`{{price}}`}</code>.</>
                    : <>Use variáveis numeradas em ordem: <code className="font-mono text-emerald-500">{`{{1}}`}</code>, <code className="font-mono text-emerald-500">{`{{2}}`}</code>, <code className="font-mono text-emerald-500">{`{{3}}`}</code>.</>}
                  {' '}Formatação: <code>*negrito*</code>, <code>_itálico_</code>, <code>~tachado~</code>, <code>`código`</code>.
                </p>
              </div>

              {bodyVars.length > 0 && (
                <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Hash className="w-4 h-4 text-emerald-500" />
                    Amostras das variáveis
                    <span className="text-[10px] font-normal text-muted-foreground">(obrigatório pela Meta para aprovar)</span>
                  </Label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {bodyVars.map((n) => (
                      <div key={n} className="space-y-1">
                        <Label className="text-xs font-mono text-emerald-500">{`{{${n}}}`}</Label>
                        <Input
                          placeholder={`Exemplo para ${n}`}
                          value={form.bodyExamples[n] || ''}
                          onChange={e => {
                            update({ bodyExamples: { ...form.bodyExamples, [n]: e.target.value } });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}


              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Rodapé <span className="text-muted-foreground font-normal">opcional</span></Label>
                  <span className="text-xs text-muted-foreground">{form.footer.length}/60</span>
                </div>
                <Input placeholder="Ex: Para parar de receber, responda STOP" maxLength={60}
                  value={form.footer} onChange={e => update({ footer: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Botões <span className="text-muted-foreground font-normal">opcional · {form.buttons.length}/10</span></Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => addButton('QUICK_REPLY')} disabled={form.buttons.length >= 10}>
                    <Reply className="w-4 h-4 mr-2" /> Resposta rápida
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addButton('URL')} disabled={form.buttons.length >= 10}>
                    <Link2 className="w-4 h-4 mr-2" /> URL
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addButton('PHONE_NUMBER')} disabled={form.buttons.length >= 10}>
                    <Phone className="w-4 h-4 mr-2" /> Telefone
                  </Button>
                </div>
                {form.buttons.map(b => (
                  <div key={b.id} className="flex gap-2 items-center rounded-lg border border-border/50 p-2">
                    <span className="text-[10px] font-bold px-2 py-1 rounded bg-muted">{b.type === 'QUICK_REPLY' ? 'RESP' : b.type === 'URL' ? 'URL' : 'TEL'}</span>
                    <Input placeholder="Rótulo do botão" value={b.text} onChange={e => updateButton(b.id, { text: e.target.value })} className="flex-1" />
                    {b.type === 'URL' && (
                      <Input placeholder="https://..." value={b.url || ''} onChange={e => updateButton(b.id, { url: e.target.value })} className="flex-1" />
                    )}
                    {b.type === 'PHONE_NUMBER' && (
                      <Input placeholder="+5511..." value={b.phone || ''} onChange={e => updateButton(b.id, { phone: e.target.value })} className="flex-1" />
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400" onClick={() => removeButton(b.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-border/60 p-4 cursor-pointer">
                <Checkbox checked={form.allowCategoryChange} onCheckedChange={v => update({ allowCategoryChange: !!v })} className="mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Permitir Meta reclassificar</p>
                  <p className="text-xs text-muted-foreground">Se a Meta achar que sua categoria está errada, ela ajusta automaticamente em vez de rejeitar.</p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-8 pt-4 border-t border-border/40">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving} className="bg-emerald-500 hover:bg-emerald-600">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                {mode === 'edit' ? 'Salvar alterações' : 'Criar template'}
              </Button>
            </div>
          </div>

          {/* PREVIEW */}
          <div className="hidden md:flex flex-col items-center bg-muted/30 border-l border-border/40 p-6">
            <button onClick={() => onOpenChange(false)} className="self-end text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Pré-visualização</p>
            <div className="relative w-[260px] h-[520px] rounded-[40px] bg-black border-[10px] border-black shadow-2xl overflow-hidden">
              {/* notch */}
              <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-b-2xl z-20" />
              {/* status bar */}
              <div className="absolute top-0 left-0 right-0 h-7 flex items-center justify-between px-5 text-[10px] text-white z-10 font-semibold">
                <span>9:41</span><span>···</span>
              </div>
              <div className="absolute inset-0 top-7 flex flex-col">
                {/* chat header */}
                <div className="bg-emerald-700 text-white px-3 py-2 flex items-center gap-2">
                  <span className="text-lg">‹</span>
                  <div className="w-7 h-7 rounded-full bg-emerald-300 flex items-center justify-center text-emerald-800 text-xs font-bold">T</div>
                  <div className="leading-tight">
                    <p className="text-xs font-semibold">teste</p>
                    <p className="text-[10px] opacity-80">online</p>
                  </div>
                </div>
                {/* chat bg */}
                <div className="flex-1 bg-[#ECE5DD] p-2 overflow-y-auto">
                  <div className="text-center mb-2">
                    <span className="bg-white/80 text-[9px] px-2 py-0.5 rounded">HOJE</span>
                  </div>
                  <div className="bg-white rounded-lg p-2 max-w-[85%] shadow text-[11px] text-gray-900 space-y-1">
                    {form.headerType === 'TEXT' && form.headerText && (
                      <p className="font-bold">{form.headerText}</p>
                    )}
                    {form.headerType === 'IMAGE' && (
                      form.headerMediaUrl
                        ? <img src={form.headerMediaUrl} className="w-full h-24 object-cover rounded" alt="" />
                        : <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center"><ImageIcon className="w-6 h-6 text-gray-400" /></div>
                    )}
                    {form.headerType === 'VIDEO' && (
                      <div className="w-full h-24 bg-black/80 rounded flex items-center justify-center"><Video className="w-6 h-6 text-white" /></div>
                    )}
                    {form.headerType === 'DOCUMENT' && (
                      <div className="w-full h-12 bg-gray-100 rounded flex items-center gap-2 px-2"><FileText className="w-5 h-5 text-red-500" /><span className="text-[10px]">documento.pdf</span></div>
                    )}
                    <div className="italic text-gray-700">
                      {form.body ? renderWhatsAppText(form.body) : 'O texto da mensagem aparece aqui...'}
                    </div>
                    {form.footer && <p className="text-[9px] text-gray-500">{form.footer}</p>}
                    <p className="text-[9px] text-gray-400 text-right">10:42 ✓✓</p>
                  </div>
                  {form.buttons.length > 0 && (
                    <div className="mt-1 space-y-0.5 max-w-[85%]">
                      {form.buttons.map(b => (
                        <div key={b.id} className="bg-white rounded text-center text-[11px] py-1.5 text-emerald-600 font-semibold shadow-sm">
                          {b.text || (b.type === 'URL' ? '🔗 Link' : b.type === 'PHONE_NUMBER' ? '📞 Ligar' : 'Resposta')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-3 max-w-[260px]">Pré-visualização ao vivo · Renderiza igual ao WhatsApp do cliente.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

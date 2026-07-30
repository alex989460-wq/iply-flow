import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Play,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Upload,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  ListOrdered,
  Search,
  X,
} from 'lucide-react';

type Step = { title: string; description: string };

type Tutorial = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  steps: Step[];
  sort_order: number;
  is_published: boolean;
};

const emptyForm = {
  id: '' as string | null,
  title: '',
  description: '',
  category: 'Geral',
  video_url: '',
  thumbnail_url: '',
  sort_order: 0,
  is_published: true,
  steps: [] as Step[],
};

function parseSteps(raw: unknown): Step[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === 'object')
    .map((s: any) => ({ title: String(s.title ?? ''), description: String(s.description ?? '') }));
}

export default function Tutorials() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [search, setSearch] = useState('');
  const [player, setPlayer] = useState<{ tutorial: Tutorial; url: string } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'video' | 'thumb' | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tutorials')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      toast.error('Erro ao carregar tutoriais: ' + error.message);
    } else {
      setTutorials((data ?? []).map((t: any) => ({ ...t, steps: parseSteps(t.steps) })));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Signed URLs for thumbnails (private bucket)
  useEffect(() => {
    const paths = tutorials
      .map((t) => t.thumbnail_url)
      .filter((p): p is string => !!p && !p.startsWith('http'));
    if (!paths.length) return;
    supabase.storage
      .from('tutorials')
      .createSignedUrls(paths, 60 * 60)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach((d: any) => {
          if (d.signedUrl && d.path) map[d.path] = d.signedUrl;
        });
        setThumbUrls((prev) => ({ ...prev, ...map }));
      });
  }, [tutorials]);

  const thumbFor = (t: Tutorial) => {
    if (!t.thumbnail_url) return null;
    return t.thumbnail_url.startsWith('http') ? t.thumbnail_url : thumbUrls[t.thumbnail_url] ?? null;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tutorials;
    return tutorials.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [tutorials, search]);

  const categories = useMemo(() => {
    const map = new Map<string, Tutorial[]>();
    filtered.forEach((t) => {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const featured = filtered[0] ?? null;

  const openPlayer = async (t: Tutorial) => {
    if (!t.video_url) {
      toast.error('Este tutorial ainda não tem vídeo.');
      return;
    }
    if (t.video_url.startsWith('http')) {
      setPlayer({ tutorial: t, url: t.video_url });
      return;
    }
    const { data, error } = await supabase.storage.from('tutorials').createSignedUrl(t.video_url, 60 * 60 * 4);
    if (error || !data?.signedUrl) {
      toast.error('Não foi possível abrir o vídeo.');
      return;
    }
    setPlayer({ tutorial: t, url: data.signedUrl });
  };

  const openEditor = (t?: Tutorial) => {
    if (t) {
      setForm({
        id: t.id,
        title: t.title,
        description: t.description ?? '',
        category: t.category,
        video_url: t.video_url ?? '',
        thumbnail_url: t.thumbnail_url ?? '',
        sort_order: t.sort_order,
        is_published: t.is_published,
        steps: t.steps.length ? t.steps : [],
      });
    } else {
      setForm({ ...emptyForm, steps: [{ title: 'Etapa 1', description: '' }] });
    }
    setEditorOpen(true);
  };

  const uploadFile = async (file: File, kind: 'video' | 'thumb') => {
    setUploading(kind);
    try {
      const ext = file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg');
      const path = `${kind}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('tutorials').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) throw error;
      setForm((f) => (kind === 'video' ? { ...f, video_url: path } : { ...f, thumbnail_url: path }));
      toast.success(kind === 'video' ? 'Vídeo enviado!' : 'Capa enviada!');
    } catch (e: any) {
      toast.error('Falha no upload: ' + (e?.message ?? 'erro desconhecido'));
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('Informe o título do tutorial.');
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || 'Geral',
      video_url: form.video_url || null,
      thumbnail_url: form.thumbnail_url || null,
      sort_order: Number(form.sort_order) || 0,
      is_published: form.is_published,
      steps: form.steps.filter((s) => s.title.trim() || s.description.trim()) as any,
    };
    const { error } = form.id
      ? await supabase.from('tutorials').update(payload).eq('id', form.id)
      : await supabase.from('tutorials').insert(payload);
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }
    toast.success('Tutorial salvo!');
    setEditorOpen(false);
    load();
  };

  const remove = async (t: Tutorial) => {
    if (!confirm(`Excluir o tutorial "${t.title}"?`)) return;
    const { error } = await supabase.from('tutorials').delete().eq('id', t.id);
    if (error) {
      toast.error('Erro ao excluir: ' + error.message);
      return;
    }
    if (t.video_url && !t.video_url.startsWith('http')) {
      await supabase.storage.from('tutorials').remove([t.video_url]);
    }
    toast.success('Tutorial excluído.');
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center shadow-lg shadow-primary/30">
              <GraduationCap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Tutoriais</h1>
              <p className="text-sm text-muted-foreground">Aprenda o sistema passo a passo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tutorial..."
                className="pl-9 w-full sm:w-64"
              />
            </div>
            {isAdmin && (
              <Button onClick={() => openEditor()} className="gap-2 shrink-0">
                <Plus className="w-4 h-4" /> Novo
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : tutorials.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-16 text-center">
            <GraduationCap className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Nenhum tutorial cadastrado</p>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? 'Clique em "Novo" para subir seu primeiro vídeo.' : 'Em breve novos conteúdos.'}
            </p>
          </div>
        ) : (
          <>
            {/* Hero */}
            {featured && (
              <div className="relative overflow-hidden rounded-3xl border border-border/50 min-h-[260px] sm:min-h-[340px] flex items-end">
                {thumbFor(featured) ? (
                  <img
                    src={thumbFor(featured)!}
                    alt={featured.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-background to-background" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
                <div className="relative p-6 sm:p-10 max-w-2xl space-y-3">
                  <Badge className="bg-primary/20 text-primary border-primary/30">{featured.category}</Badge>
                  <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">{featured.title}</h2>
                  {featured.description && (
                    <p className="text-sm sm:text-base text-muted-foreground line-clamp-3">{featured.description}</p>
                  )}
                  <div className="flex items-center gap-2 pt-2">
                    <Button size="lg" className="gap-2" onClick={() => openPlayer(featured)}>
                      <Play className="w-5 h-5 fill-current" /> Assistir
                    </Button>
                    {featured.steps.length > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <ListOrdered className="w-3.5 h-3.5" /> {featured.steps.length} etapas
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Rows */}
            {categories.map(([category, items]) => (
              <Row
                key={category}
                title={category}
                items={items}
                isAdmin={isAdmin}
                thumbFor={thumbFor}
                onPlay={openPlayer}
                onEdit={openEditor}
                onDelete={remove}
              />
            ))}
          </>
        )}
      </div>

      {/* Player */}
      <Dialog open={!!player} onOpenChange={(o) => !o && setPlayer(null)}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden gap-0">
          {player && (
            <div className="max-h-[85vh] overflow-y-auto">
              <video src={player.url} controls autoPlay className="w-full bg-black aspect-video" />
              <div className="p-6 space-y-5">
                <div>
                  <Badge className="mb-2 bg-primary/15 text-primary border-primary/30">
                    {player.tutorial.category}
                  </Badge>
                  <h3 className="text-xl font-bold">{player.tutorial.title}</h3>
                  {player.tutorial.description && (
                    <p className="text-sm text-muted-foreground mt-1">{player.tutorial.description}</p>
                  )}
                </div>
                {player.tutorial.steps.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <ListOrdered className="w-4 h-4 text-primary" /> Passo a passo
                    </p>
                    <ol className="space-y-3">
                      {player.tutorial.steps.map((s, i) => (
                        <li
                          key={i}
                          className="flex gap-3 rounded-xl border border-border/60 bg-secondary/30 p-3"
                        >
                          <span className="w-7 h-7 shrink-0 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{s.title || `Etapa ${i + 1}`}</p>
                            {s.description && (
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.description}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar tutorial' : 'Novo tutorial'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Título</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Ex: Primeiros passos"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Descrição</Label>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Vídeo</Label>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], 'video')}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={uploading === 'video'}
                  onClick={() => videoInputRef.current?.click()}
                >
                  {uploading === 'video' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {form.video_url ? 'Trocar vídeo' : 'Enviar vídeo'}
                </Button>
                {form.video_url && (
                  <p className="text-xs text-muted-foreground truncate">{form.video_url}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Capa (opcional)</Label>
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], 'thumb')}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={uploading === 'thumb'}
                  onClick={() => thumbInputRef.current?.click()}
                >
                  {uploading === 'thumb' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {form.thumbnail_url ? 'Trocar capa' : 'Enviar capa'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-primary" /> Etapas
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() =>
                    setForm({
                      ...form,
                      steps: [...form.steps, { title: `Etapa ${form.steps.length + 1}`, description: '' }],
                    })
                  }
                >
                  <Plus className="w-3.5 h-3.5" /> Etapa
                </Button>
              </div>
              {form.steps.map((s, i) => (
                <div key={i} className="rounded-xl border border-border/60 p-3 space-y-2 bg-secondary/20">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 shrink-0 rounded-md bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <Input
                      value={s.title}
                      placeholder="Título da etapa"
                      onChange={(e) => {
                        const steps = [...form.steps];
                        steps[i] = { ...steps[i], title: e.target.value };
                        setForm({ ...form, steps });
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive shrink-0"
                      onClick={() => setForm({ ...form, steps: form.steps.filter((_, x) => x !== i) })}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    value={s.description}
                    placeholder="Descrição da etapa"
                    onChange={(e) => {
                      const steps = [...form.steps];
                      steps[i] = { ...steps[i], description: e.target.value };
                      setForm({ ...form, steps });
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
              <div>
                <p className="text-sm font-medium">Publicado</p>
                <p className="text-xs text-muted-foreground">Visível para todas as revendas</p>
              </div>
              <Switch
                checked={form.is_published}
                onCheckedChange={(v) => setForm({ ...form, is_published: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function Row({
  title,
  items,
  isAdmin,
  thumbFor,
  onPlay,
  onEdit,
  onDelete,
}: {
  title: string;
  items: Tutorial[];
  isAdmin: boolean;
  thumbFor: (t: Tutorial) => string | null;
  onPlay: (t: Tutorial) => void;
  onEdit: (t: Tutorial) => void;
  onDelete: (t: Tutorial) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * 400, behavior: 'smooth' });

  return (
    <div className="space-y-3 group/row">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <div className="hidden sm:flex gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" onClick={() => scroll(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => scroll(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div ref={ref} className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin snap-x">
        {items.map((t) => {
          const thumb = thumbFor(t);
          return (
            <div
              key={t.id}
              className={cn(
                'group relative w-[260px] shrink-0 snap-start rounded-2xl overflow-hidden border border-border/50 bg-card',
                'transition-all duration-300 hover:scale-[1.03] hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 cursor-pointer',
              )}
              onClick={() => onPlay(t)}
            >
              <div className="relative aspect-video bg-gradient-to-br from-primary/30 to-secondary">
                {thumb && <img src={thumb} alt={t.title} className="w-full h-full object-cover" />}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-lg">
                    <Play className="w-5 h-5 text-primary-foreground fill-current" />
                  </div>
                </div>
                {!t.is_published && (
                  <Badge className="absolute top-2 left-2 bg-muted text-muted-foreground">Rascunho</Badge>
                )}
              </div>
              <div className="p-3 space-y-1">
                <p className="text-sm font-semibold truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{t.description}</p>
                {t.steps.length > 0 && (
                  <span className="text-[11px] text-primary flex items-center gap-1">
                    <ListOrdered className="w-3 h-3" /> {t.steps.length} etapas
                  </span>
                )}
              </div>
              {isAdmin && (
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="w-7 h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(t);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="w-7 h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(t);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, MapPin, Globe2 } from 'lucide-react';
import { aggregateGeo } from '@/lib/phone-geo';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
}

interface TooltipState {
  uf: string;
  name: string;
  count: number;
  x: number;
  y: number;
}

const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso',
  PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima',
  RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo',
  TO: 'Tocantins',
};



export default function CustomerGeoMap({ className }: Props) {
  const { user, isAdmin } = useAuth();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const { data: phones, isLoading } = useQuery({
    queryKey: ['customer-geo-phones', user?.id, isAdmin],
    queryFn: async () => {
      // Paginate to get all active customer phones (DB rule: use .range())
      const all: string[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        let q = supabase
          .from('customers')
          .select('phone', { count: 'exact' })
          .eq('status', 'ativa')
          .range(from, from + pageSize - 1);
        if (!isAdmin && user) q = q.eq('created_by', user.id);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const r of data as any[]) if (r.phone) all.push(r.phone);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const stats = useMemo(() => aggregateGeo(phones || []), [phones]);

  const maxUf = useMemo(
    () => Math.max(1, ...Object.values(stats.byUf)),
    [stats.byUf],
  );

  // Color scale: dark surface → primary glow
  const colorFor = (count: number) => {
    if (!count) return 'hsl(var(--muted) / 0.25)';
    const t = Math.min(1, Math.log(count + 1) / Math.log(maxUf + 1));
    // interpolate between two HSL stops
    const h1 = 220, s1 = 25, l1 = 18; // dim base
    const h2 = 200, s2 = 95, l2 = 55; // vivid cyan/primary
    const h = h1 + (h2 - h1) * t;
    const s = s1 + (s2 - s1) * t;
    const l = l1 + (l2 - l1) * t;
    return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
  };

  if (isLoading) {
    return (
      <Card className={cn('p-6 flex items-center justify-center min-h-[300px]', className)}>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </Card>
    );
  }

  const topUfList = Object.entries(stats.byUf)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <Card
      className={cn(
        'relative overflow-hidden border-border/40',
        'bg-gradient-to-br from-card via-card to-secondary/10',
        className,
      )}
    >
      {/* glow accent */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 w-72 h-72 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Clientes Ativos por Região
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Distribuição geográfica baseada no DDI / DDD do telefone
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums text-primary">{stats.total.toLocaleString('pt-BR')}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">clientes</div>
          </div>
        </div>

        <Tabs defaultValue="brasil" className="w-full">
          <TabsList className="grid grid-cols-2 mb-3 h-8">
            <TabsTrigger value="brasil" className="text-xs gap-1.5">
              🇧🇷 Brasil <span className="text-muted-foreground">({stats.brTotal})</span>
            </TabsTrigger>
            <TabsTrigger value="mundo" className="text-xs gap-1.5">
              <Globe2 className="w-3 h-3" /> Internacional <span className="text-muted-foreground">({stats.foreignTotal})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="brasil" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-4">
              {/* MAP */}
              <div className="relative rounded-xl bg-background/40 border border-border/40 overflow-hidden">
                <ComposableMap
                  projection="geoMercator"
                  projectionConfig={{ scale: 600, center: [-54, -15] }}
                  width={500}
                  height={500}
                  style={{ width: '100%', height: 'auto' }}
                >
                  <Geographies geography="/br-states.geojson">
                    {({ geographies }) =>
                      geographies.map((geo) => {
                        const uf = geo.properties.sigla as string;
                        const count = stats.byUf[uf] || 0;
                        const isTop = stats.topUf?.uf === uf && count > 0;
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            onMouseEnter={(e) =>
                              setTooltip({
                                uf,
                                name: UF_NAMES[uf] || uf,
                                count,
                                x: (e as any).clientX,
                                y: (e as any).clientY,
                              })
                            }
                            onMouseMove={(e) =>
                              setTooltip((t) =>
                                t ? { ...t, x: (e as any).clientX, y: (e as any).clientY } : t,
                              )
                            }
                            onMouseLeave={() => setTooltip(null)}
                            style={{
                              default: {
                                fill: colorFor(count),
                                stroke: isTop ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                                strokeWidth: isTop ? 1.4 : 0.5,
                                outline: 'none',
                                transition: 'all 200ms',
                              },
                              hover: {
                                fill: 'hsl(var(--primary))',
                                stroke: 'hsl(var(--primary))',
                                strokeWidth: 1.2,
                                outline: 'none',
                                cursor: 'pointer',
                              },
                              pressed: { fill: 'hsl(var(--primary))', outline: 'none' },
                            }}
                          />
                        );
                      })
                    }
                  </Geographies>
                </ComposableMap>

                {/* Scale legend */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>0</span>
                  <div
                    className="flex-1 h-1.5 rounded-full"
                    style={{
                      background:
                        'linear-gradient(90deg, hsl(220 25% 18%), hsl(210 60% 35%), hsl(200 95% 55%))',
                    }}
                  />
                  <span className="tabular-nums">{maxUf}</span>
                </div>
              </div>

              {/* TOP STATES LIST */}
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 pb-1">
                  Top Estados
                </div>
                {topUfList.length === 0 && (
                  <div className="text-xs text-muted-foreground italic p-3">
                    Nenhum cliente brasileiro identificado.
                  </div>
                )}
                {topUfList.map(([uf, count]) => {
                  const pct = stats.brTotal > 0 ? (count / stats.brTotal) * 100 : 0;
                  return (
                    <div
                      key={uf}
                      className="flex items-center gap-2 rounded-lg bg-background/40 border border-border/30 px-2.5 py-1.5 hover:border-primary/40 transition-colors"
                    >
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center font-bold text-[11px] shrink-0"
                        style={{
                          background: colorFor(count),
                          color: count / maxUf > 0.5 ? 'hsl(var(--background))' : 'hsl(var(--foreground))',
                        }}
                      >
                        {uf}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{UF_NAMES[uf] || uf}</div>
                        <div className="h-1 rounded-full bg-secondary/50 overflow-hidden mt-0.5">
                          <div
                            className="h-full bg-primary/70 rounded-full transition-all"
                            style={{ width: `${pct.toFixed(1)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold tabular-nums">{count}</div>
                        <div className="text-[9px] text-muted-foreground tabular-nums">
                          {pct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="mundo" className="mt-0">
            {stats.byCountry.length === 0 ? (
              <div className="text-xs text-muted-foreground italic p-6 text-center">
                Nenhum cliente cadastrado ainda.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {stats.byCountry.map((c) => {
                  const pct = stats.total > 0 ? (c.count / stats.total) * 100 : 0;
                  return (
                    <div
                      key={c.iso}
                      className="group relative rounded-xl border border-border/40 bg-background/40 p-3 hover:border-primary/50 hover:bg-background/60 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <div className="text-2xl leading-none">{c.flag}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">{c.name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">+{c.ddi}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-end justify-between">
                        <div className="text-xl font-bold tabular-nums">{c.count}</div>
                        <div className="text-[10px] text-muted-foreground tabular-nums pb-1">
                          {pct.toFixed(1)}%
                        </div>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 h-0.5 rounded-b-xl overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary/40 to-primary transition-all"
                          style={{ width: `${pct.toFixed(1)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 px-3 py-2 rounded-lg bg-popover/95 border border-border shadow-xl backdrop-blur-md text-xs"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          <div className="font-semibold">{tooltip.name}</div>
          <div className="text-muted-foreground">
            <span className="text-primary font-bold tabular-nums">{tooltip.count}</span> cliente(s) ativo(s)
          </div>
        </div>
      )}
    </Card>
  );
}

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetaLogo } from "@/components/ui/meta-logo";
import { WhatsAppLogo } from "@/components/ui/whatsapp-logo";
import { cn } from "@/lib/utils";
import EvolutionInstances from "./EvolutionInstances";
import CrmOficialChannels from "./CrmOficialChannels";

type TabKey = "oficial" | "whatsapp";

export default function WhatsappConnections() {
  const [params, setParams] = useSearchParams();
  const initial: TabKey = params.get("tab") === "whatsapp" ? "whatsapp" : "oficial";
  const [tab, setTab] = useState<TabKey>(initial);
  const [mounted, setMounted] = useState<Record<TabKey, boolean>>({
    oficial: initial === "oficial",
    whatsapp: initial === "whatsapp",
  });

  useEffect(() => {
    setMounted((c) => (c[tab] ? c : { ...c, [tab]: true }));
    const next = new URLSearchParams(params);
    if (next.get("tab") !== tab) {
      next.set("tab", tab);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const tabs: Array<{ key: TabKey; label: string; hint: string; icon: JSX.Element; ring: string }> = [
    {
      key: "oficial",
      label: "API Oficial",
      hint: "Canais Meta / Cloud API",
      icon: <MetaLogo className="w-5 h-5" />,
      ring: "ring-blue-500/40 shadow-blue-500/20",
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      hint: "Conexão por QR Code",
      icon: <WhatsAppLogo className="w-5 h-5" />,
      ring: "ring-emerald-500/40 shadow-emerald-500/20",
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-5">
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/50 backdrop-blur-xl p-5 sm:p-6">
          <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          <div className="relative">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Central de conexões
            </span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">Conexões WhatsApp</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Gerencie em um só lugar os números da API Oficial e as conexões por QR Code.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:inline-flex sm:gap-2 p-1.5 rounded-2xl bg-background/50 border border-border/60 shadow-inner">
              {tabs.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "relative inline-flex items-center gap-2.5 px-3.5 sm:px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300",
                      active
                        ? cn("bg-card text-foreground shadow-lg ring-1 scale-[1.01]", t.ring)
                        : "text-muted-foreground hover:text-foreground hover:bg-card/50",
                    )}
                  >
                    <span className={cn("transition-transform duration-300", active && "scale-110")}>{t.icon}</span>
                    <span className="flex flex-col items-start leading-tight">
                      <span className="tracking-tight">{t.label}</span>
                      <span className="text-[10px] font-normal text-muted-foreground hidden sm:block">{t.hint}</span>
                    </span>
                    {active && (
                      <span className="absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>


      <div className="relative">
        <div className={cn(tab === "oficial" ? "block animate-fade-in" : "hidden")}>
          {mounted.oficial && <CrmOficialChannels embed />}
        </div>
        <div className={cn(tab === "whatsapp" ? "block animate-fade-in" : "hidden")}>
          {mounted.whatsapp && <EvolutionInstances embed />}
        </div>
      </div>
    </DashboardLayout>
  );
}

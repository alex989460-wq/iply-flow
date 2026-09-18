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
        <div className="mb-1">
          <h1 className="text-2xl font-bold tracking-tight">Conexões WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie em um só lugar os números da API Oficial e as conexões por QR Code.
          </p>
        </div>

        <div className="mt-4 inline-flex p-1.5 rounded-2xl bg-muted/40 border border-border/60 shadow-inner gap-1">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative inline-flex items-center gap-2.5 px-4 sm:px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-300",
                  active
                    ? cn("bg-card text-foreground shadow-lg ring-1", t.ring)
                    : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                )}
              >
                <span className={cn("transition-transform duration-300", active && "scale-110")}>{t.icon}</span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="tracking-tight">{t.label}</span>
                  <span className="text-[10px] font-normal text-muted-foreground hidden sm:block">{t.hint}</span>
                </span>
              </button>
            );
          })}
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

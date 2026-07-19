import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetaLogo } from "@/components/ui/meta-logo";
import { WhatsAppLogo } from "@/components/ui/whatsapp-logo";
import { cn } from "@/lib/utils";
import EvolutionChat from "./EvolutionChat";
import CrmOficialChat from "./CrmOficialChat";

type TabKey = "oficial" | "evolution";

export default function UnifiedChat() {
  const [params, setParams] = useSearchParams();
  const initial = (params.get("tab") as TabKey) === "evolution" ? "evolution" : "oficial";
  const [tab, setTab] = useState<TabKey>(initial);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (next.get("tab") !== tab) {
      next.set("tab", tab);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const tabs: Array<{ key: TabKey; label: string; icon: JSX.Element; activeRing: string }> = [
    {
      key: "oficial",
      label: "API Oficial",
      icon: <MetaLogo className="w-5 h-5" />,
      activeRing: "ring-blue-500/40 shadow-blue-500/20",
    },
    {
      key: "evolution",
      label: "WhatsApp",
      icon: <WhatsAppLogo className="w-5 h-5" />,
      activeRing: "ring-emerald-500/40 shadow-emerald-500/20",
    },
  ];

  return (
    <DashboardLayout noPadding>
      <div className="flex flex-col h-[calc(100svh-4rem)] lg:h-screen overflow-hidden bg-background">
        {/* Premium segmented switcher */}
        <div className="px-3 sm:px-5 pt-3 pb-3 border-b border-border/40 bg-gradient-to-b from-background to-background/60 backdrop-blur-xl shrink-0">
          <div className="inline-flex p-1.5 rounded-2xl bg-muted/40 border border-border/60 shadow-inner gap-1">
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "relative inline-flex items-center gap-2.5 px-5 sm:px-6 py-2 text-sm font-semibold rounded-xl transition-all duration-300 ease-out",
                    active
                      ? cn(
                          "bg-card text-foreground shadow-lg ring-1",
                          t.activeRing
                        )
                      : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                  )}
                >
                  <span className={cn("transition-transform duration-300", active && "scale-110")}>{t.icon}</span>
                  <span className="tracking-tight">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 relative">
          <div
            className={cn(
              "absolute inset-0 overflow-hidden",
              tab === "oficial" ? "block" : "hidden"
            )}
          >
            <CrmOficialChat embed active={tab === "oficial"} />
          </div>
          <div
            className={cn(
              "absolute inset-0 overflow-hidden",
              tab === "evolution" ? "block" : "hidden"
            )}
          >
            <EvolutionChat embed />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

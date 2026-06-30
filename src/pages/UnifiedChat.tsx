import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetaLogo } from "@/components/ui/meta-logo";
import { MessageCircleMore } from "lucide-react";
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

  const tabs: Array<{ key: TabKey; label: string; icon: JSX.Element }> = [
    { key: "oficial", label: "API Oficial", icon: <MetaLogo className="w-4 h-4" /> },
    { key: "evolution", label: "API Não Oficial", icon: <MessageCircleMore className="w-4 h-4" /> },
  ];

  return (
    <DashboardLayout noPadding>
      <div className="flex flex-col h-[100dvh] bg-background">
        {/* Sleek segmented switcher */}
        <div className="px-3 sm:px-4 pt-2 pb-2 border-b border-border/40 bg-background/80 backdrop-blur-md shrink-0">
          <div className="inline-flex p-1 rounded-full bg-muted/60 border border-border/50 shadow-sm relative">
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "relative z-10 inline-flex items-center gap-2 px-4 sm:px-5 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-all duration-300",
                    active
                      ? "bg-background text-foreground shadow-md ring-1 ring-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className={cn("transition-transform", active && "scale-110")}>{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 relative">
          <div
            key={tab}
            className="absolute inset-0 animate-in fade-in-50 slide-in-from-bottom-1 duration-300"
          >
            {tab === "oficial" ? <CrmOficialChat embed /> : <EvolutionChat embed />}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

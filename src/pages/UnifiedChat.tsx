import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MetaLogo } from "@/components/ui/meta-logo";
import { MessageCircleMore } from "lucide-react";
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

  return (
    <DashboardLayout noPadding>
      <div className="flex flex-col h-[100dvh]">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex flex-col flex-1 min-h-0">
          <div className="px-2 sm:px-3 pt-2 pb-1 border-b border-border bg-background/60 backdrop-blur shrink-0">
            <TabsList className="h-9">
              <TabsTrigger value="oficial" className="gap-2 text-xs sm:text-sm">
                <MetaLogo className="w-3.5 h-3.5" />
                API Oficial
              </TabsTrigger>
              <TabsTrigger value="evolution" className="gap-2 text-xs sm:text-sm">
                <MessageCircleMore className="w-3.5 h-3.5" />
                API Não Oficial
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="oficial" className="flex-1 min-h-0 mt-0 outline-none">
            {tab === "oficial" && <CrmOficialChat embed />}
          </TabsContent>
          <TabsContent value="evolution" className="flex-1 min-h-0 mt-0 outline-none">
            {tab === "evolution" && <EvolutionChat embed />}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

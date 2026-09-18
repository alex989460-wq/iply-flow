import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import CrmOficialChat from "./CrmOficialChat";

export default function UnifiedChat() {
  const [params, setParams] = useSearchParams();

  // Aba antiga (Evolution) foi descontinuada — limpa o parâmetro da URL
  useEffect(() => {
    if (params.get("tab")) {
      const next = new URLSearchParams(params);
      next.delete("tab");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardLayout noPadding>
      <div className="flex flex-col h-[calc(100svh-4rem)] lg:h-screen overflow-hidden bg-background">
        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0 overflow-hidden">
            <CrmOficialChat embed active />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

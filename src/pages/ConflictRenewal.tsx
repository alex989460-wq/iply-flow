import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Users, CheckCircle, AlertTriangle, User, Calendar, CreditCard, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoSg from "@/assets/logo-sg.png";

interface ConflictCustomer {
  id: string;
  name: string;
  username: string | null;
  due_date: string;
  server_name: string | null;
  plan_name: string | null;
}

interface ConflictData {
  payment_id: string;
  amount: number;
  plan_name: string;
  customers: ConflictCustomer[];
}

export default function ConflictRenewal() {
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get("payment_id");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ConflictData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ name: string; newDueDate: string } | null>(null);

  useEffect(() => {
    if (!paymentId) {
      setError("Parâmetro payment_id ausente.");
      setLoading(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    fetch(`${supabaseUrl}/functions/v1/confirm-conflict-renewal?payment_id=${paymentId}&action=list`, {
      headers: { "Content-Type": "application/json" },
    })
      .then(async (res) => {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          if (json.error) {
            setError(json.error);
          } else {
            setData(json);
          }
        } catch {
          setError("Resposta inválida do servidor.");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Erro ao carregar dados.");
        setLoading(false);
      });
  }, [paymentId]);

  const handleConfirm = async (customerId: string) => {
    if (!paymentId) return;
    setConfirming(customerId);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/confirm-conflict-renewal?payment_id=${paymentId}&customer_id=${customerId}`,
      );
      const text = await res.text();
      // The function returns HTML on success - parse name/date from response or use local data
      const customer = data?.customers.find((c) => c.id === customerId);
      setConfirmed({
        name: customer?.name || "Cliente",
        newDueDate: "", // will show generic success
      });
    } catch {
      setError("Erro ao confirmar renovação.");
    } finally {
      setConfirming(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-6 text-center">
          <div className="flex justify-center">
            <img src={logoSg} alt="Logo" className="h-10 object-contain" />
          </div>
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-green-400">Renovação Confirmada! ✅</h1>
          <p className="text-slate-300">
            O cliente <strong>{confirmed.name}</strong> foi renovado com sucesso. A confirmação e notificação já foram enviadas via WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          <h1 className="text-xl font-bold text-slate-200">Erro</h1>
          <p className="text-slate-400">{error || "Dados não encontrados."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 sm:p-8 max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="flex justify-center">
          <img src={logoSg} alt="Logo" className="h-10 object-contain" />
        </div>

        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-14 h-14 bg-amber-900/30 rounded-full flex items-center justify-center">
              <Users className="w-8 h-8 text-amber-400" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-slate-100">Pagamento requer decisão</h1>
          <p className="text-slate-400 text-sm">
            Múltiplos clientes com o mesmo vencimento. Selecione qual deseja renovar.
          </p>
        </div>

        {/* Payment info */}
        <div className="bg-slate-700/50 rounded-xl p-4 flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="text-xs text-slate-400">Valor do pagamento</p>
            <p className="font-bold text-slate-100 text-lg">
              R$ {data.amount.toFixed(2).replace(".", ",")}
            </p>
          </div>
          {data.plan_name && (
            <div className="ml-auto text-right">
              <p className="text-xs text-slate-400">Plano</p>
              <p className="font-semibold text-slate-200 text-sm">{data.plan_name}</p>
            </div>
          )}
        </div>

        {/* Customer cards */}
        <div className="space-y-3">
          {data.customers.map((customer) => (
            <div
              key={customer.id}
              className="bg-slate-700/30 border border-slate-600 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-100 truncate">{customer.name}</p>
                  {customer.username && (
                    <p className="text-sm text-slate-400">👤 {customer.username}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Venc: {customer.due_date ? customer.due_date.split("-").reverse().join("/") : "-"}
                </span>
                {customer.server_name && (
                  <span className="flex items-center gap-1">
                    <Server className="w-3.5 h-3.5" />
                    {customer.server_name}
                  </span>
                )}
              </div>

              <Button
                className="w-full"
                variant="success"
                onClick={() => handleConfirm(customer.id)}
                disabled={confirming !== null}
              >
                {confirming === customer.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Confirmando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Renovar {customer.name}
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

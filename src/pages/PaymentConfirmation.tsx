import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, Calendar, CreditCard, User, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import logoSg from "@/assets/logo-sg.png";

interface PaymentData {
  id: string;
  customer_name: string;
  amount: number;
  plan_name: string | null;
  duration_days: number;
  new_due_date: string;
  status: string;
  created_at: string;
}

export default function PaymentConfirmation() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("payment_confirmations")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row) setData(row as PaymentData);
        else setNotFound(true);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800">
        <Loader2 className="w-10 h-10 animate-spin text-green-600" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <p className="text-lg text-muted-foreground">Pedido não encontrado.</p>
        </div>
      </div>
    );
  }

  const formattedDate = (() => {
    try {
      return format(new Date(data.new_due_date + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return data.new_due_date;
    }
  })();

  const formattedCreatedAt = (() => {
    try {
      return format(new Date(data.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return "";
    }
  })();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <img src={logoSg} alt="Logo" className="h-12 object-contain" />
        </div>

        {/* Success icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-green-700 dark:text-green-400">
          Pagamento Aprovado! ✅
        </h1>

        <p className="text-center text-muted-foreground text-sm">
          Seu pagamento foi confirmado e sua conta já foi renovada automaticamente.
        </p>

        {/* Details card */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Cliente</p>
              <p className="font-semibold">{data.customer_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Valor Pago</p>
              <p className="font-semibold">
                R$ {data.amount.toFixed(2).replace(".", ",")}
              </p>
            </div>
          </div>

          {data.plan_name && (
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Plano</p>
                <p className="font-semibold">{data.plan_name} ({data.duration_days} dias)</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Novo Vencimento</p>
              <p className="font-semibold">{formattedDate}</p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Confirmado em {formattedCreatedAt}
        </p>
      </div>
    </div>
  );
}

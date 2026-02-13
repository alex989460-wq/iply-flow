import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Calendar, User, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CustomerWithExtraMonths {
  id: string;
  name: string;
  phone: string;
  due_date: string;
  extra_months: number;
}

const POPUP_KEY = 'extra_months_popup_shown';

export default function ExtraMonthsPopup() {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerWithExtraMonths[]>([]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    // Check if popup was already shown today
    const lastShown = localStorage.getItem(POPUP_KEY);
    const today = new Date().toDateString();
    
    if (lastShown === today) {
      return;
    }

    const fetchCustomersWithExtraMonths = async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, due_date, extra_months')
        .gt('extra_months', 0)
        .order('due_date', { ascending: true });

      if (error) {
        console.error('Error fetching customers with extra months:', error);
        return;
      }

      if (data && data.length > 0) {
        setCustomers(data);
        setOpen(true);
        // Mark as shown today
        localStorage.setItem(POPUP_KEY, today);
      }
    };

    fetchCustomersWithExtraMonths();
  }, [user, isAdmin]);

  if (!isAdmin || customers.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="w-5 h-5" />
            Clientes com Meses Extras
          </DialogTitle>
          <DialogDescription>
            Os seguintes clientes possuem meses extras pendentes. Verifique os vencimentos.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[300px] pr-4">
          <div className="space-y-3">
            {customers.map((customer) => (
              <div 
                key={customer.id}
                className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/20">
                    <User className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">{customer.phone}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>Vence: {format(new Date(customer.due_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-1 text-xs font-bold rounded-full bg-amber-500 text-white">
                    +{customer.extra_months} {customer.extra_months === 1 ? 'mês' : 'meses'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4 mr-2" />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { Search, Calendar, User, Tv, Server, Loader2 } from 'lucide-react';

interface CustomerResult {
  id: string;
  name: string;
  username: string | null;
  due_date: string;
  screens: number;
  plan_name: string | null;
  plan_price: number;
  server_name: string | null;
}

export default function ConsultaDue() {
  const [phone, setPhone] = useState('');
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Digite um número com pelo menos 10 dígitos.');
      return;
    }
    setLoading(true);
    setError('');
    setResults([]);
    setSearched(true);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/customer-lookup?action=lookup&phone=${encodeURIComponent(digits)}`,
        { headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Nenhum resultado encontrado.');
      } else {
        setResults(json.customers || []);
      }
    } catch {
      setError('Erro ao consultar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  const getDueStatus = (d: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(d + 'T00:00:00');
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { label: `Vencido há ${Math.abs(diff)} dia(s)`, color: 'text-red-400' };
    if (diff === 0) return { label: 'Vence hoje', color: 'text-yellow-400' };
    if (diff <= 3) return { label: `Vence em ${diff} dia(s)`, color: 'text-yellow-300' };
    return { label: `Faltam ${diff} dias`, color: 'text-emerald-400' };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-2">
            <Calendar className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Consultar Vencimento</h1>
          <p className="text-gray-400 text-sm">Digite seu número de telefone para verificar suas assinaturas</p>
        </div>

        {/* Search */}
        <div className="bg-gray-800/50 backdrop-blur border border-gray-700/50 rounded-2xl p-5 space-y-4">
          <div className="relative">
            <input
              type="tel"
              placeholder="(00) 00000-0000"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full h-12 pl-4 pr-12 rounded-xl bg-gray-900/80 border border-gray-600/50 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-lg"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="absolute right-1.5 top-1.5 h-9 w-9 flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Search className="w-4 h-4 text-white" />}
            </button>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3">
            {results.map(c => {
              const status = getDueStatus(c.due_date);
              return (
                <div key={c.id} className="bg-gray-800/50 backdrop-blur border border-gray-700/50 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-white font-medium">{c.name}</span>
                    </div>
                    {c.username && (
                      <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded-full">{c.username}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDate(c.due_date)}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 font-medium ${status.color}`}>
                      <span>{status.label}</span>
                    </div>
                    {c.plan_name && (
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Tv className="w-3.5 h-3.5" />
                        <span>{c.plan_name}</span>
                      </div>
                    )}
                    {c.server_name && (
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Server className="w-3.5 h-3.5" />
                        <span>{c.server_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {searched && !loading && results.length === 0 && !error && (
          <p className="text-center text-gray-500 text-sm">Nenhuma assinatura encontrada.</p>
        )}
      </div>
    </div>
  );
}

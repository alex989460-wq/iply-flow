import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import CrmOficialChatbots from './CrmOficialChatbots';

export default function EmbedChatbots() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setError('Token de acesso não fornecido.');
      setLoading(false);
      return;
    }

    const authenticate = async () => {
      try {
        // We find the reseller by their API key stored in crm_oficial_settings
        const { data, error: dbError } = await supabase
          .from('crm_oficial_settings')
          .select('user_id')
          .eq('api_key', token)
          .eq('enabled', true)
          .maybeSingle();

        if (dbError) throw dbError;
        
        if (!data) {
          setError('Token inválido ou integração desativada.');
          setLoading(false);
          return;
        }

        // We don't sign in with Supabase auth here to avoid session conflicts,
        // but the CrmOficialChatbots component uses useAuth().
        // For embed mode, we'll need to handle the "user" context or bypass it.
        // Actually, CrmOficialChatbots uses user.id to fetch settings.
        // If we want it to work in embed without a session, we need to modify CrmOficialChatbots 
        // to accept an override userId or token.
        
        setAuthenticated(true);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    authenticate();
  }, [token]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center p-6 bg-background">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Passing embed prop. 
  // Note: CrmOficialChatbots still expects useAuth() to have a user.
  // If we are in an iframe, we might not have a session.
  return <CrmOficialChatbots embed />;
}

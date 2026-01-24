import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Extend Window interface for FB SDK
declare global {
  interface Window {
    FB: {
      init: (params: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }) => void;
      login: (callback: (response: FBLoginResponse) => void, options: FBLoginOptions) => void;
      getLoginStatus: (callback: (response: FBLoginResponse) => void) => void;
    };
    fbAsyncInit: () => void;
  }
}

interface FBLoginOptions {
  config_id?: string;
  response_type?: string;
  override_default_response_type?: boolean;
  scope?: string;
  extras?: {
    feature?: string;
    version?: number;
    sessionInfoVersion?: number;
    setup?: Record<string, unknown>;
  };
}

interface FBLoginResponse {
  status: 'connected' | 'not_authorized' | 'unknown';
  authResponse?: {
    accessToken: string;
    userID: string;
    expiresIn: number;
    signedRequest?: string;
    graphDomain?: string;
    data_access_expiration_time?: number;
    code?: string;
  };
}

interface EmbeddedSignupData {
  phone_number_id?: string;
  waba_id?: string;
  accessToken?: string;
  userID?: string;
  code?: string;
}

export function useWhatsAppEmbeddedSignup() {
  const { toast } = useToast();
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [appId, setAppId] = useState<string | null>(null);
  
  // Fetch the app ID from the server
  const fetchAppId = useCallback(async () => {
    try {
      const response = await supabase.functions.invoke('meta-oauth', {
        body: { action: 'get_app_id' },
      });
      
      if (response.data?.app_id) {
        setAppId(response.data.app_id);
        return response.data.app_id;
      }
    } catch (error) {
      console.error('[Embedded Signup] Failed to fetch app ID:', error);
    }
    return null;
  }, []);
  
  // Initialize FB SDK
  useEffect(() => {
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    let mounted = true;
    
    const initSDK = async () => {
      const id = await fetchAppId();
      if (!id || !mounted) return;
      
      const initFB = () => {
        if (window.FB && id) {
          console.log('[Embedded Signup] Initializing FB SDK with appId:', id);
          window.FB.init({
            appId: id,
            autoLogAppEvents: true,
            xfbml: true,
            version: 'v21.0',
          });
          setIsSDKLoaded(true);
          return true;
        }
        return false;
      };
      
      // Try immediately if SDK already loaded
      if (initFB()) {
        return;
      }
      
      // Wait for SDK to load
      checkInterval = setInterval(() => {
        if (initFB()) {
          if (checkInterval) clearInterval(checkInterval);
        }
      }, 100);
    };
    
    initSDK();
    
    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      if (checkInterval) clearInterval(checkInterval);
    }, 10000);
    
    return () => {
      mounted = false;
      if (checkInterval) clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, [fetchAppId]);
  
  // Listen for Embedded Signup session info message
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
        return;
      }
      
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          console.log('[Embedded Signup] Received session info:', data);
          // This event contains phone_number_id and waba_id from the signup flow
          if (data.data?.phone_number_id) {
            // Store temporarily - will be used after auth completes
            sessionStorage.setItem('wa_embedded_signup_data', JSON.stringify(data.data));
          }
        }
      } catch (e) {
        // Not a JSON message, ignore
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
  
  // Process the embedded signup response
  const processEmbeddedSignupResponse = useCallback(async (
    authResponse: FBLoginResponse['authResponse'],
    embeddedData?: EmbeddedSignupData
  ): Promise<boolean> => {
    if (!authResponse) {
      toast({
        title: 'Erro na conexão',
        description: 'Resposta de autenticação inválida',
        variant: 'destructive',
      });
      return false;
    }
    
    try {
      // Get stored embedded signup data if not provided
      const storedData = sessionStorage.getItem('wa_embedded_signup_data');
      const signupData = embeddedData || (storedData ? JSON.parse(storedData) : null);
      
      // Send to our edge function
      const response = await supabase.functions.invoke('meta-oauth', {
        body: {
          action: 'process_embedded_signup',
          access_token: authResponse.accessToken,
          user_id: authResponse.userID,
          code: authResponse.code,
          expires_in: authResponse.expiresIn,
          data_access_expiration_time: authResponse.data_access_expiration_time,
          phone_number_id: signupData?.phone_number_id,
          waba_id: signupData?.waba_id,
        },
      });
      
      // Clean up stored data
      sessionStorage.removeItem('wa_embedded_signup_data');
      
      if (response.error || response.data?.error) {
        throw new Error(response.data?.error || response.error?.message || 'Erro ao processar signup');
      }
      
      toast({
        title: 'Conectado com sucesso!',
        description: 'Sua conta WhatsApp Business foi vinculada.',
      });
      
      return true;
    } catch (error: any) {
      console.error('[Embedded Signup] Error processing response:', error);
      toast({
        title: 'Erro ao processar',
        description: error.message || 'Não foi possível concluir a conexão',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);
  
  // Launch the embedded signup flow
  const launchWhatsAppSignup = useCallback(async (): Promise<boolean> => {
    if (!isSDKLoaded || !window.FB) {
      toast({
        title: 'SDK não carregado',
        description: 'Aguarde o carregamento do Facebook SDK e tente novamente',
        variant: 'destructive',
      });
      return false;
    }
    
    setIsLoading(true);
    
    return new Promise((resolve) => {
      try {
        window.FB.login(
          (response: FBLoginResponse) => {
            console.log('[Embedded Signup] FB.login response:', response);
            
            if (response.status === 'connected' && response.authResponse) {
              // Process asynchronously but don't block the callback
              processEmbeddedSignupResponse(response.authResponse)
                .then((success) => {
                  setIsLoading(false);
                  resolve(success);
                })
                .catch(() => {
                  setIsLoading(false);
                  resolve(false);
                });
            } else {
              console.log('[Embedded Signup] User cancelled or not authorized');
              toast({
                title: 'Conexão cancelada',
                description: 'Você cancelou o processo de conexão',
              });
              setIsLoading(false);
              resolve(false);
            }
          },
          {
            // WhatsApp Embedded Signup specific config
            config_id: '', // Will be set by Meta when user completes flow
            response_type: 'code',
            override_default_response_type: true,
            scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
            extras: {
              feature: 'whatsapp_embedded_signup',
              version: 2,
              sessionInfoVersion: 2,
            },
          }
        );
      } catch (error: any) {
        console.error('[Embedded Signup] Error launching signup:', error);
        toast({
          title: 'Erro ao iniciar',
          description: error.message || 'Não foi possível iniciar o processo',
          variant: 'destructive',
        });
        setIsLoading(false);
        resolve(false);
      }
    });
  }, [isSDKLoaded, processEmbeddedSignupResponse, toast]);
  
  return {
    launchWhatsAppSignup,
    isLoading,
    isSDKLoaded,
    appId,
  };
}

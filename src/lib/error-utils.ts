import { supabase } from "@/integrations/supabase/client";

/**
 * Extracts a user-friendly error message from a Supabase Edge Function response.
 * Handles both the 'error' object (FunctionsHttpError) and the 'data' payload.
 */
export async function getFunctionErrorMessage(error: any, data?: any, defaultMessage: string = 'Ocorreu um erro inesperado'): Promise<string> {
  // 1. Check the data payload first (some functions return errors with 200 OK)
  if (data) {
    if (data.success === false && (data.error || data.message)) {
      return String(data.error || data.message);
    }
    if (data.error && typeof data.error === 'string') return data.error;
    if (data.message && typeof data.message === 'string') return data.message;
  }

  // 2. Check if the error is a Supabase FunctionsHttpError (has a context/Response object)
  if (error?.context instanceof Response || (error?.context && typeof error.context.clone === 'function')) {
    try {
      const res = error.context.clone();
      const contentType = res.headers.get('Content-Type') || '';
      
      if (contentType.includes('application/json')) {
        const json = await res.json();
        const msg = json?.error || json?.message || json?.details;
        if (msg) return String(msg);
      } else {
        const text = await res.text();
        if (text && text.length > 0 && text.length < 300 && !text.includes('<!DOCTYPE')) {
          return text;
        }
      }
    } catch (e) {
      console.error('[error-utils] Failed to parse function error context:', e);
    }
  }

  // 3. Fallback to the error object's message
  const errorMsg = error?.message || '';
  
  // If it's the generic Supabase error message, return the default instead
  if (errorMsg.includes('Edge Function returned a non-2xx status code')) {
    return defaultMessage;
  }

  return errorMsg || defaultMessage;
}

/**
 * Enhanced version of supabase.functions.invoke that automatically parses error messages.
 */
export async function safeInvoke(functionName: string, options?: any) {
  const { data, error } = await supabase.functions.invoke(functionName, options);
  
  if (error || (data && data.success === false)) {
    const message = await getFunctionErrorMessage(error, data);
    throw new Error(message);
  }
  
  return data;
}

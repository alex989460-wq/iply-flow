export async function getFunctionErrorMessage(error: any, data?: any, defaultMessage: string = 'Ocorreu um erro inesperado'): Promise<string> {
  // 1. Check if the error is a Supabase FunctionsHttpError (has a context/Response object)
  if (error?.context instanceof Response) {
    try {
      const res = error.context.clone();
      const contentType = res.headers.get('Content-Type');
      
      if (contentType?.includes('application/json')) {
        const json = await res.json();
        if (json?.error) return String(json.error);
        if (json?.message) return String(json.message);
      } else {
        const text = await res.text();
        if (text && text.length < 200) return text; // Avoid huge HTML dumps
      }
    } catch (e) {
      console.error('[error-utils] Failed to parse function error context:', e);
    }
  }

  // 2. Check function response data for success: false and an error message
  if (data) {
    if (data.success === false && (data.error || data.message)) {
      return String(data.error || data.message);
    }
    if (data.error) return String(data.error);
  }

  // 3. Fallback to the standard error message or the provided default
  return error?.message || defaultMessage;
}

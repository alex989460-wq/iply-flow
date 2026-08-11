const GENERIC_FUNCTION_ERRORS = [
  'edge function returned a non-2xx status code',
  'failed to send a request to the edge function',
  'failed to fetch',
  'functionshttperror',
];

const ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/permission denied for table\s+([\w.]+)/i, 'Sem permissão para acessar os dados de "$1".'],
  [/new row violates row-level security policy/i, 'Você não tem permissão para cadastrar ou alterar este registro.'],
  [/duplicate key value violates unique constraint/i, 'Este registro já existe. Verifique os dados informados.'],
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/jwt expired/i, 'Sua sessão expirou. Entre novamente.'],
  [/network request failed|failed to fetch/i, 'Falha de conexão com o servidor. Verifique sua internet e tente novamente.'],
  [/all media endpoints failed/i, 'O provedor conectado recusou o envio da mídia em todos os formatos disponíveis.'],
  [/all endpoints failed/i, 'O provedor conectado não aceitou a solicitação em nenhum endpoint disponível.'],
];

function valueToMessage(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(valueToMessage).filter(Boolean).join(' | ');
  if (!value || typeof value !== 'object') return '';

  const obj = value as Record<string, unknown>;
  for (const key of ['error_description', 'error', 'message', 'detail', 'details', 'hint', 'reason']) {
    const message = valueToMessage(obj[key]);
    if (message) return message;
  }
  return '';
}

export function translateErrorMessage(message: string, fallback = 'Ocorreu um erro inesperado.'): string {
  const clean = String(message || '').trim();
  if (!clean) return fallback;
  for (const [pattern, replacement] of ERROR_TRANSLATIONS) {
    if (pattern.test(clean)) return clean.replace(pattern, replacement);
  }
  return clean;
}

export async function getErrorMessage(
  error: unknown,
  data?: unknown,
  fallback = 'Não foi possível concluir a operação.',
): Promise<string> {
  const payloadMessage = valueToMessage(data);
  if (payloadMessage) return translateErrorMessage(payloadMessage, fallback);

  const err = error as { message?: string; context?: Response } | null;
  const response = err?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const raw = await response.clone().text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const parsedMessage = valueToMessage(parsed);
          if (parsedMessage) return translateErrorMessage(parsedMessage, fallback);
        } catch {
          return translateErrorMessage(raw, fallback);
        }
      }
      if (response.status) return `O servidor respondeu com erro HTTP ${response.status}.`;
    } catch {
      // The response body may already have been consumed; use the original error below.
    }
  }

  const original = String(err?.message || '').trim();
  if (original && !GENERIC_FUNCTION_ERRORS.some((item) => original.toLowerCase().includes(item))) {
    return translateErrorMessage(original, fallback);
  }
  return fallback;
}

type InvokeResult = { data: unknown; error: unknown };
type Invoke = (...args: any[]) => Promise<InvokeResult>;

export function installFunctionErrorDetails(functionsClient: { invoke: Invoke }): void {
  const client = functionsClient as { invoke: Invoke; __realErrorsInstalled?: boolean };
  if (client.__realErrorsInstalled) return;

  const originalInvoke = client.invoke.bind(client);
  client.invoke = async (...args: any[]) => {
    const result = await originalInvoke(...args);
    if (result?.error) {
      const detailedMessage = await getErrorMessage(result.error, result.data);
      try {
        (result.error as { message?: string }).message = detailedMessage;
      } catch {
        // Keep the SDK error object when it is immutable.
      }
    }
    return result;
  };
  client.__realErrorsInstalled = true;
}
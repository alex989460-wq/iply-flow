DELETE FROM public.ai_knowledge_items
WHERE status = 'pending'
  AND kind IN ('procedure','intent')
  AND (
    COALESCE(length(problem),0) < 80
    OR problem ~* '(paguei|pix|cakto|kakito|comprovante|manda o pix|me envi[ae] .*pix|gostaria de renovar|quero renovar|renovar meu|confirma[çc][ãa]o de pagamento|meu amigo|quero contratar|gostaria de adquirir|quero volta|poderia ver|assinatura com vcs|data de vencimento|quero saber|vencimento do aplicativo|fazer o pagamento|nao to conseg|desistalou|desinstalou|volta com o aplicativo|quero fazer um teste)'
    OR solution ~* '(cdnfull|gestorvplay|m3u_plus|get\.php\?username|http://cdn|https://apps\.gestor|Pagamento Aprovado|R\$ ?[0-9]+.*confirmado)'
    OR subject ~* '(paguei|manda o pix|me envi[ae] .*pix|gostaria de renovar|quero renovar|confirma[çc][ãa]o de pagamento|meu amigo|quero contratar|quero volta|poderia ver|ver pra mim|assinatura com vcs|data de vencimento|desistalou|nao to conseg)'
  );
# Roadmap

## Em andamento
- [x] Gerar aplicativo Android Super Gestor, conectado ao site em produção, pronto para Android Studio e Play Store
- [x] Padronizar visualmente todas as ferramentas com o mesmo sistema do Dashboard
- [x] Corrigir geração de teste Uniplay: evitar carregamento infinito e usar acesso protegido com fallback
- [x] Modernizar o Dashboard mantendo todos os dados e ações atuais
- [x] Corrigir renovação manual rápida do Uniplay para chamar a API antes de criar pendência
- [x] Corrigir renovação Clouddy para descobrir a tarifa real do cliente e explicar quando o plano não está vinculado
- [ ] Automatizar compra e transferência de créditos por painel, com isolamento por revendedor e novo visual da loja
- [ ] Concluir cópia e validação da VPS sem alterar o DNS ou interromper a produção
- [ ] Executar sincronização delta, SSL, webhooks e ativação dos jobs somente na virada combinada
- [x] Troca de senha do cliente diretamente nos painéis NATV, Rush, P2Cine e Vplay
- [x] Sincronização manual 100% das senhas dos clientes pelas APIs dos painéis
- [ ] Agendamento diário automático de sincronização de senhas
- [ ] Integração Uniplay API (aguardando documentação/credenciais do usuário)

- [ ] Recarga externa: NATV, Rush, The Best e VPlay automáticos; Uniplay/P2Cine aguardam endpoint comprovado de transferência de saldo.
- [x] Calculadora de custos: exibir dados reais (mensagens oficiais, não oficiais e custo estimado)
- [x] ZapCRM: corrigir "[mensagem não suportada] — Message type unknown" em mensagens recebidas pela API Oficial

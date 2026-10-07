# Roadmap

## Em andamento
- [ ] Publicar a Política de Privacidade do ZUI, com link no rodapé e aviso explícito de que o player não fornece conteúdos nem playlists, preservando todas as funções.
- [x] ZUI 1.2.17: API idêntica, só frontend atualizado sem reiniciar; 57 arquivos do site/API iguais por hash; TV LG pendente.
- [x] ZUI 1.2.16: frontend atualizado sem reiniciar, 287 arquivos do site/API iguais por hash; TV LG pendente.
- [x] ZUI 1.2.15: atualizador completo (API media.mjs + app), só zuiplayer reiniciado; site público recolocado e idêntico por hash; TV LG pendente.
- [x] ZUI 1.2.14: frontend atualizado, 259 arquivos do site/API iguais por hash, sem reiniciar; TV LG pendente.
- [x] ZUI 1.2.13: frontend atualizado, 259 arquivos do site/API iguais por hash, sem reiniciar; TV LG pendente.
- [x] ZUI 1.2.12: frontend atualizado, site intacto por hash (55 arquivos), sem reiniciar; TV LG pendente.
- [x] ZUI 1.2.11: frontend atualizado pelo instalador validado, site e logo intactos por hash, API e configurações preservadas, sem reiniciar serviços; teste na TV LG pendente.
- [x] Logo verde substituída pelo arquivo azul enviado, idêntico por hash; topo 40×40 (36×36 no celular), ilustração e ícone da aba atualizados; quatro páginas e menus conferidos, arquivos operacionais intactos.
- [x] Logo do topo reduzida a 88×40 (80×36 no celular), mesma logo oficial inteira na ilustração; referência do script atualizada para evitar cache antigo, quatro páginas e menus conferidos, arquivos operacionais preservados.
- [x] Corrigir logo oficial no cabeçalho e na ilustração do app: proporções e imagens conferidas nas quatro páginas e no celular, menus/idiomas funcionando; backup criado e arquivos operacionais intactos por hash, sem reiniciar serviços.
- [x] ZUI 1.2.10: frontend atualizado pelo instalador validado, sem reiniciar API; logo oficial no cabeçalho, opções de idiomas com contraste testadas nas quatro páginas; HTML preservado exceto CSS solicitado, 30 arquivos API/configurações protegidos por hash e backup disponível.
- [x] Auditar segurança do ZUI: revisão do código efetivamente servido e testes públicos de autorização/traversal; proxy confiável, cookies seguros e bloqueios local/private ativos, sem falha explorável comprovada nesta revisão. CSP com scripts inline merece endurecimento planejado após testes de compatibilidade; não foi alterada. Reprodução, transações e painel autenticado não testados; aviso preexistente de API não configurada permanece no app.
- [x] Aplicar somente cores e efeitos CAMOshield ao ZUI: quatro páginas publicadas, menus/idiomas/FAQ conferidos, 88 arquivos operacionais preservados por hash e comandos HTML intactos; painel autenticado e transações não testados.
- [x] Atualizar ZUI para 1.2.9: site, painel, API e configurações preservados por hashes; navegação e interface verificadas, sem reiniciar serviços. Aviso de conexão preexistente permanece; reprodução em TV não testada.
- [x] Atualizar ZUI para 1.2.8 preservando o site e os dados; painel autenticado, modal sem salvar e serviços existentes conferidos.
- [x] Aplicar Essencial moderno: imagem antiga sem sobreposição no desktop, fontes Sora/Manrope e painel organizado; site e painel conferidos no desktop e celular, sem alterar handlers.
- [x] Atualizar ZUI para 1.2.7: login, menu compacto e atualização do painel conferidos; 18 arquivos do site preservados integralmente e os três sites abrindo normalmente.
- [x] Refazer o visual rejeitado do ZUI com a TV antiga e Cinema moderno, sem alterar funções; páginas e menu conferidos.
- [x] Corrigir visual do ZUI Player sem alterar funções: azul/verde, títulos centralizados, efeitos modernos e celular.
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

- [x] Conexão individual do Google Drive por revenda

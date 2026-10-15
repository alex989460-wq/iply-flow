# Roadmap

## ZUI (15/10/2026)
- [x] Compactar Servidores parceiros, seleção de parceiro e menu de ações; nove servidores reais conferidos, busca e consulta de aparelhos funcionando, sem erros ou overflow. Aplicado somente no admin com backup; 1459 arquivos protegidos, nenhum serviço reiniciado ou dado alterado.

## ZUI (14/10/2026)
- [x] Contraste corrigido em Disponível e Parceiros: cores completas para os templates, ícones claros de 36×28, cartões compactos, brilho nas bordas e movimento discreto com redução de movimento respeitada. Duas páginas verificadas em 1280/390, filtros funcionando, imagens carregadas e sem erros/overflow. Backup /root/zui-refined-before-1792017888; 1458 arquivos protegidos intactos, apenas duas páginas alteradas, nenhum serviço reiniciado.
- [x] Fundo público trocado para o degradê preto+azul estilo zuxoplayer.com solicitado: base hsl(222 38% 5%) com dois brilhos radiais nos azuis da logo (azure #0080F0 e marinho #002050) no topo, superfícies/bordas/textos invertidos para tema escuro em todas as 8 páginas públicas (home, minhas-listas, ativar, privacidade, termos, client, Pool, Disponível); títulos/botões fantasma/rodapé das páginas de parceiro que tinham preto fixo corrigidos; botões primários com texto branco e azul da logo; color-scheme dark. Painel admin intocado (login conferido igual ao anterior). Seis páginas verificadas em 390/1280 sem overflow e sem erros de página. Backups /root/zui-refined-before-1792016669 a 1792016821; 1452 arquivos protegidos intactos; nenhum serviço reiniciado.
- [x] Fundo público trocado do cinza (rejeitado) para azul suave hsl(215 32% 87%) com brilho radial discreto no topo; faixas, bordas e textos escurecidos para manter leitura; rodapé/cabeçalho com linha de separação. Cabeçalho das páginas de parceiro agora desbota para a cor do site e no celular recebe painel fosco, eliminando a faixa escura atrás do título. Menu e rodapé sem links repetidos (deduplicação no script de navegação). Seis páginas conferidas em 390/1280 sem overflow, sem erros de página; painel administrativo intacto (7 cartões, tabela de aparelhos, 183 dispositivos). Backups /root/zui-refined-before-1792014947 a /root/zui-refined-before-1792015376; 1452 arquivos protegidos intactos; nenhum serviço reiniciado.
- [x] Fundo público cinza suave um pouco mais escuro, superfícies claras preservadas; Roku salvo disponível no painel e relido no catálogo público. Cinco páginas verificadas em 390/1280 sem overflow/erros, seis testes passaram; backup /root/zui-refined-before-1792013116, 1452 arquivos protegidos intactos, serviços ativos sem reiniciar.
- [x] Revisar presença LG/Roku/demais: mesma evidência de contato/lease; nenhum online durante esta consulta, sem fabricar estado. Oito páginas modernizadas com divisões, contraste, efeitos leves e foco; 20 abas conferidas em computador/celular, pagamentos sem overflow, filtros Windows corretos, editor preservado por 16s e fechado por Esc; Pool/Disponibilidade mantêm aba no reload. Backup /root/zui-refined-before-1792012411; 1452 arquivos protegidos intactos, nenhum serviço reiniciado. Sessão real de revenda/TV e transações não testadas.
- [x] Presença corrigida: contato recente ou reprodução válida; listagem atualiza a cada 15s sem interromper editor. Painel autenticado mostrou Android online, API confirmou online=1/playing=1 e atualização preservou filtro; três testes passaram. Backup /root/zui-presence-light-before-1792011303; só ZUI reiniciado, ZapCRM ativo; TV/revenda real não testadas.
- [x] Site público, Disponível e Pool com superfícies claras e azul discreto; computador/celular sem overflow ou erros de página, identidade preservada. 84 arquivos operacionais protegidos intactos, sem alterações de licenças/listas.
- [x] Página inicial com Disponível e Parceiros no menu e rodapé, mais link Xbox e computadores; Xbox habilitado via controle admin no mesmo link Microsoft, conforme confirmação do usuário. Navegação e catálogo verificados em computador/celular, sem erros ou overflow. Backup /root/zui-home-links-before-1791989349; 1458 arquivos protegidos intactos; nenhum serviço reiniciado.
- [ ] Limpeza antiga: zero MACs restantes no manifesto do estresse ou nos identificadores históricos comprovados; 173 aparelhos preservados. Para excluir outros inativos há mais de três dias falta identificação confiável de quais eram testes; não inferir pelo nome genérico ou lista vazia.
- [x] Disponível e Parceiros modernizados; Abrir player retirado dessas páginas sem desativar app Web. Windows disponível no link Microsoft fornecido; Xbox editável, em confirmação pois loja informa apenas PC. Nove testes passaram; painel autenticado salvou/releu Windows e catálogo público confirmou. Computador/celular sem overflow/imagens quebradas/erros de página. Backup /root/zui-platform-refresh-before-1791988855, 1452 arquivos protegidos intactos; apenas ZUI reiniciado, ZapCRM ativo.

## Em andamento
- [x] Diagnosticar HTTP 502 do código 4101 no Web Player: rota Direto; navegador HTTPS envia catálogo HTTP pelo relay da VPS; provedor respondeu 403 via HTTP e HTTPS no teste público, sem credenciais. Não alterado nenhum aplicativo/lista/serviço. Windows não é identificado como cliente nativo pela versão web analisada.
- [ ] Correção Web/Windows 4101 depende de DNS HTTPS com CORS acessível ao cliente ou liberação do IP da VPS pelo provedor; alternativa Windows exige identificar o pacote e suporte a transporte nativo, sem simplesmente desativar segurança do navegador.
- [ ] Testes LG: VPS já permite todos os IPs fornecidos em HTTP/HTTPS; nenhuma regra adicional necessária na VPS. App e catálogo retornaram 200, ZUI/ZapCRM ativos. Exceção Cloudflare pendente de autorização/acesso; domínio usa proxy Cloudflare, regras externas ainda não verificadas. Manter autenticação e portas privadas.
- [ ] Investigação da lentidão do ZapCRM pausada por solicitação do usuário em 13/10/2026; nenhuma correção aplicada nesta investigação.
- [x] Organizar site ZUI, painel e edição de playlists; apresentação com backup e fluxos de consulta/edição sem salvar verificados em 14/10/2026.
- [ ] Fechar portas públicas de bancos após mapear dependências; revisar outras exposições. Autorizado em 12/10/2026.
- [x] ZUI 2.1.14/API 1.2.35 atualizado com backup validado; site e painel reorganizados com quatro grupos de navegação, logo oficial e demonstração preservadas. Gestão do Sistema e Jogos do Dia verificados em consulta; desktop/celular sem overflow ou erros de página. 519 arquivos operacionais intactos por hash; apresentação sem reiniciar serviços.
- [x] Imagem inicial publicada como demonstração navegável: categorias, detalhes, favoritos temporários, busca e ampliação verificados no navegador; celular sem overflow, nenhum erro. 482 arquivos protegidos intactos, backup /root/zui-interactive-before-1791639051; nenhum serviço reiniciado.
- [x] Bloqueio de backup superado antes da atualização 2.1.13: limite de descompressão aumentado de 128 para 192 MiB, criptografia e rejeição de adulteração preservadas, três testes passando; seleção de campeonatos instalada com API 1.2.34.
- [x] Logo 3D fornecida publicada idêntica por hash; imagem inicial recriada conforme print, com capas ilustrativas originais sem catálogo fornecido. Cinco páginas e idioma/menu mobile conferidos sem overflow nem erros; 476 arquivos operacionais e cinco corpos HTML intactos. Backup inicial /root/zui-app-preview-before-1791637800; ajuste de apresentação /root/zui-app-preview-before-1791637876. Nada reiniciado; reprodução/transações não testadas.
- [x] Aplicar efeitos de vidro, brilho e movimento inspirados no RXPurple às cinco páginas do ZUI, usando a logo atual do app; 476 arquivos operacionais intactos por hash, backup /root/zui-rx-before-1791637252, sem reiniciar API. Páginas e idioma verificados no navegador sem erros; movimento reduzido respeitado. CSP/anti-frame/referrer adicionados à política e caminhos internos bloqueados no Nginx com reload validado. Não testados: painel autenticado, transações, playback e TV.
- [ ] Concluir endurecimento de segurança sem quebrar clientes legados: portal aceita chave curta de 8 caracteres (fluxo intencional da TV), rever proteção por alvo no login do portal; manter autenticação atual até testes. Portas públicas dos bancos/root SSH ainda pendentes; não foram modificados. Não é possível impedir cópia completa de frontend público.
- [x] Promover ZUI Leve 2.1.0 ao app oficial em /app/: 20 arquivos conferidos, 58 arquivos site/API/configurações preservados por hash, backup em /root/zui-official-before-1791549539, sem reiniciar; entrada do app e cinco páginas verificadas, login autenticado/reprodução/TV não testados.
- [x] ZUI 1.2.23: só frontend, sem reiniciar; 58 arquivos do site/API iguais por hash; TV LG pendente.
- [x] ZUI 1.2.20: só frontend, sem reiniciar; 58 arquivos do site/API iguais por hash; TV LG pendente.
- [x] ZUI 1.2.19 Legacy: só frontend, sem reiniciar; 58 arquivos do site/API iguais por hash; TV LG pendente.
- [x] Política de Privacidade do ZUI publicada com link no rodapé, aviso explícito de que o player não fornece conteúdos nem playlists, visual conferido no computador e celular, página inicial e arquivos operacionais preservados por hash.
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
- [x] ZUI 2.1.15/API 1.2.36 + Pix Efí para licenças (anual/vitalícia)

## Em andamento (10/10/2026)
- [x] Reconectar à VPS 167.114.208.135 (acesso refeito).
- [x] Publicar correção rush-renew (painel sem crédito não conta mais como renovado).
- [ ] Conferir resultado da comparação SG vs Rush (/tmp/rush_out.txt, /tmp/rush_report.json; script /tmp/rush_check.py ainda rodando).
- [ ] Carregar clientes afetados no painel Pendências para renovação em massa (aguarda lista confirmada).
- [x] ZUI 2.1.20 / painel 1.2.40 aplicado.
- [x] Backup ZUI para Telegram a cada 10 min.
- [x] /app adaptado para celular (iPhone/Android).
- [ ] Fechar portas de banco 5432/6543/8000/8100 (autorizado); endurecer SSH somente após validar acesso por chave e recuperação.

## ZUI (13/10/2026)
- [x] Modernizar painéis admin/revenda e Pool; aparelhos agrupados por plataforma e ações compactas; Web retirado da vitrine sem apagar aparelhos; disponibilidade, descrição e link editáveis no admin. Salvamento/leitura verificados no painel real.
- [x] Gestão de códigos com edição/exclusão e validade; exclusão bloqueada para códigos vinculados, confirmação digitada e auditoria; troca de código/DNS em uso bloqueada no editor, mantendo migração confirmada. Sete testes passaram; painel admin autenticado e páginas públicas sem erros/overflow. Backup /root/zui-management-before-1791898771, 1449 arquivos protegidos intactos; só ZUI reiniciado.
- [ ] Verificação final com sessão real de revendedor e TV: não há sessão/senha da revenda disponível neste teste; TV requer teste do usuário. Revisão não garante ausência de golpes.
- [x] Vencimento opcional da delegação: salvar/ler/remover testado no servidor Tester e restaurado; quatro testes de data/permissão passaram. Reprodução e licenças intactas.
- [x] Páginas https://zuiplayer.com/pool e /disponivel publicadas; logos em aparelhos; computador/celular sem overflow/imagens quebradas; painel autenticado sem erros. Backup /root/zui-partner-expiry-before-1791895003; 1440 arquivos protegidos intactos, somente ZUI reiniciado. Demais plataformas ficam como não confirmadas, sem inventar aprovação em lojas.
- [x] Login por código em servidores "Direto" com provedor bloqueando a VPS.
- [x] Versão web (/app no navegador): listas HTTP agora passam pelo servidor ZUI (só no navegador).
- [x] Painel admin: adicionar/remover dias da licença do app (números negativos removem).
- [ ] Cloudflare Turnstile no login do painel ZUI: suporte já existe; aguarda usuário liberar zuiplayer.com no widget do Cloudflare.
- [x] Painel admin/revenda reorganizado: contas, saldo, aparelhos, sub-revendas e servidores com validade na mesma tabela; criação reutiliza permissões existentes.
- [ ] Legenda LG antiga: extração progressiva pelo servidor (aguarda autorização).

- [x] ZUI Pool (contagem), Parceiros: DNS e aparelhos, Contatos no painel
- [ ] Bloqueio do Pool quando lotar (aguarda decisão)
- [ ] Contatos reais (usuário vai cadastrar)
- [x] Transferência de MAC em /minhas-listas: troca licença+playlists entre aparelhos, exige MAC+chave do novo, limite 3, auditado; testado em cópia isolada. Backup /root/zui-mac-transfer-before-1791917825.

## ZUI (14/10/2026 tarde)
- [x] Admin/revenda: ver, trocar, editar e excluir playlists do MAC (testado em cópia e publicado).
- [x] Admin/revenda no celular: menu fecha, aparelhos em cartões, menus ••• e janelas fecham.
- [ ] Roku 7 dias: códigos 4100/4101 não estão marcados como parceiro (só 002) — aguarda decisão do usuário.
- [ ] XUI One VPLAYSERVICO2: abertura de canais mais rápida (aguarda escopo).

# Redesign Moderno do Painel de Renovação Rápida

O objetivo deste plano é restaurar e elevar o visual do `QuickRenewalPanel` para uma estética "High-End Glassmorphism", garantindo que todas as funcionalidades solicitadas (renovação, apps, mensagens rápidas, meses extras) estejam integradas de forma elegante e funcional.

## Alterações Visuais e de UI

- **Estética Glassmorphism**: Aplicação de `backdrop-blur-xl`, `bg-background/40`, bordas semi-transparentes (`border-border/30`) e sombras suaves para criar profundidade.
- **Botão "Renovar" Premium**: Implementação de um gradiente animado (`bg-gradient-to-r from-primary via-primary/90 to-primary/80`), efeito de brilho e escala no hover.
- **Grids Otimizados**: Reorganização dos dados do cliente (Usuário, Senha, Telas, Vencimento) em grids de 2 colunas com tipografia refinada e ícones consistentes da `lucide-react`.
- **Seção de Mensagens Rápidas**: Redesenho dos chips de mensagem com indicadores coloridos por categoria e animações de entrada.
- **Painel de Apps e Ferramentas**: Modernização dos botões de ação lateral (Playlist, Clouddy, Configurações) com tooltips e feedback visual imediato.

## Funcionalidades Técnicas

- **Persistência de Estados**: Garantir que as edições de `editedUsername`, `editedPhone` e `selectedPlan` reflitam instantaneamente na UI e sejam salvas corretamente.
- **Lógica de Mês Extra**: Refinamento do alerta de pendência e confirmação de abate de meses extras para evitar confusão.
- **Integração com Servidores**: Manutenção de todos os fluxos de renovação automática (Sigma, kOffice, VPlay, NATV, etc.) com tratamento de erro em português.
- **Responsividade**: Garantir que o painel se comporte de forma fluida tanto no desktop (colapsável) quanto no mobile (sheet/drawer).

## Detalhes Técnicos

- **Componentes**: Edição do `src/components/chat/QuickRenewalPanel.tsx`.
- **Estilos**: Uso de classes utilitárias Tailwind (`animate-pulse-slow`, `shadow-2xl`, `backdrop-blur-3xl`).
- **Hooks**: Sincronização rigorosa com `useMutation` para garantir que o feedback de "Salvar" e "Renovar" seja visível.

import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { 
  BookOpen, 
  CheckCircle2, 
  Circle, 
  ExternalLink, 
  Key, 
  MessageSquare, 
  Settings, 
  Users, 
  Zap, 
  ChevronRight,
  Play,
  Copy,
  Server,
  Package,
  Send,
  CreditCard,
  FileText,
  HelpCircle,
  Lightbulb,
  Target,
  Rocket,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface TutorialStep {
  id: string;
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  content: {
    overview: string;
    steps: {
      title: string;
      description: string;
      tip?: string;
      image?: string;
    }[];
    tips?: string[];
    warning?: string;
  };
}

const Tutorial = () => {
  const { toast } = useToast();
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  
  const tutorialSteps: TutorialStep[] = [
    {
      id: 'templates',
      number: 4,
      title: 'Criando Templates de Mensagem',
      description: 'Configure mensagens automáticas para cobranças e avisos',
      icon: <MessageSquare className="h-5 w-5" />,
      completed: completedSteps.includes('templates'),
      content: {
        overview: 'Os templates são mensagens pré-configuradas que serão enviadas automaticamente aos seus clientes. É importante criar mensagens profissionais e claras.',
        steps: [
          {
            title: 'Acesse o Zap Responder',
            description: 'Entre no painel do Zap Responder e procure por "Templates", "Modelos" ou "Mensagens Automáticas".'
          },
          {
            title: 'Crie um template de cobrança D-1',
            description: 'Este template será enviado 1 dia ANTES do vencimento. Use um tom amigável lembrando que o plano vence amanhã.',
            tip: 'Exemplo: "Olá {nome}! 👋 Seu plano vence amanhã ({vencimento}). Renove agora e continue aproveitando! Chave PIX: xxxxx"'
          },
          {
            title: 'Crie um template de cobrança D0',
            description: 'Este template será enviado no DIA do vencimento. Seja direto mas cordial.',
            tip: 'Exemplo: "Olá {nome}! Hoje é o último dia do seu plano. Efetue o pagamento para não ficar sem acesso. PIX: xxxxx"'
          },
          {
            title: 'Crie um template de cobrança D+1',
            description: 'Este template será enviado 1 dia DEPOIS do vencimento. O cliente já está inadimplente.',
            tip: 'Exemplo: "Olá {nome}! Seu plano venceu ontem. Regularize agora para reativar seu acesso. PIX: xxxxx"'
          },
          {
            title: 'Use variáveis dinâmicas',
            description: 'Os templates podem incluir variáveis que serão substituídas pelos dados do cliente: {nome}, {usuario}, {servidor}, {plano}, {vencimento}, etc.'
          },
          {
            title: 'Salve e ative os templates',
            description: 'Após criar cada template, salve e verifique se estão ativos para uso.'
          }
        ],
        tips: [
          'Use emojis com moderação para tornar a mensagem mais amigável',
          'Inclua sempre a forma de pagamento (PIX) na mensagem',
          'Teste os templates enviando para seu próprio número primeiro',
          'Mantenha as mensagens curtas e objetivas'
        ],
        warning: 'Evite mensagens muito longas ou com muita pressão. Isso pode resultar em bloqueio do número.'
      }
    },
    {
      id: 'register-server',
      number: 5,
      title: 'Cadastrando Servidores',
      description: 'Adicione os servidores de IPTV disponíveis',
      icon: <Server className="h-5 w-5" />,
      completed: completedSteps.includes('register-server'),
      content: {
        overview: 'Os servidores são os sistemas de IPTV que você revende. Cadastre cada servidor para poder associar clientes a eles.',
        steps: [
          {
            title: 'Acesse a página de Servidores',
            description: 'No menu lateral, clique em "Servidores".'
          },
          {
            title: 'Clique em "Novo Servidor"',
            description: 'No canto superior direito, clique no botão para adicionar um novo servidor.'
          },
          {
            title: 'Preencha os dados',
            description: 'Insira o nome do servidor (ex: "NATV", "StreamMax"), o host (URL do painel) e uma descrição opcional.'
          },
          {
            title: 'Defina o status',
            description: 'Escolha se o servidor está Online, Offline ou em Manutenção. Isso ajuda a gerenciar seus servidores.'
          },
          {
            title: 'Salve o servidor',
            description: 'Clique em salvar para adicionar o servidor à sua lista.'
          }
        ],
        tips: [
          'Use nomes curtos e fáceis de identificar',
          'Mantenha o status atualizado para facilitar a gestão',
          'Você pode ter vários servidores cadastrados'
        ]
      }
    },
    {
      id: 'register-plans',
      number: 6,
      title: 'Cadastrando Planos',
      description: 'Configure os planos e preços que você oferece',
      icon: <Package className="h-5 w-5" />,
      completed: completedSteps.includes('register-plans'),
      content: {
        overview: 'Os planos definem o período de assinatura e o valor cobrado. Você pode criar diferentes planos para diferentes durações.',
        steps: [
          {
            title: 'Acesse a página de Planos',
            description: 'No menu lateral, clique em "Planos".'
          },
          {
            title: 'Clique em "Novo Plano"',
            description: 'Adicione um novo plano clicando no botão correspondente.'
          },
          {
            title: 'Defina o nome do plano',
            description: 'Use nomes descritivos como "Mensal", "Trimestral", "Semestral" ou "Anual".'
          },
          {
            title: 'Configure a duração',
            description: 'Insira a quantidade de dias do plano: 30 para mensal, 90 para trimestral, 180 para semestral, 365 para anual.'
          },
          {
            title: 'Defina o preço',
            description: 'Insira o valor em reais que será cobrado pelo plano.'
          },
          {
            title: 'Salve o plano',
            description: 'Confirme para adicionar o plano à lista disponível.'
          }
        ],
        tips: [
          'Ofereça descontos para planos mais longos para fidelizar clientes',
          'Você pode criar planos especiais (ex: "Promoção Black Friday")',
          'O preço pode ser personalizado por cliente se necessário'
        ]
      }
    },
    {
      id: 'register-customers',
      number: 7,
      title: 'Cadastrando Clientes',
      description: 'Adicione seus clientes e acompanhe os vencimentos',
      icon: <Users className="h-5 w-5" />,
      completed: completedSteps.includes('register-customers'),
      content: {
        overview: 'Aqui você cadastra cada cliente com seus dados, plano, servidor e data de vencimento. O sistema vai gerenciar os lembretes automaticamente.',
        steps: [
          {
            title: 'Acesse a página de Clientes',
            description: 'No menu lateral, clique em "Clientes".'
          },
          {
            title: 'Clique em "Novo Cliente"',
            description: 'Adicione um novo cliente clicando no botão correspondente.'
          },
          {
            title: 'Preencha os dados pessoais',
            description: 'Insira o nome completo e telefone (com DDD). O telefone é essencial para os envios automáticos.'
          },
          {
            title: 'Adicione o usuário',
            description: 'Insira o nome de usuário do cliente no sistema de IPTV. Isso ajuda na identificação.'
          },
          {
            title: 'Selecione servidor e plano',
            description: 'Escolha o servidor e o plano contratado pelo cliente.'
          },
          {
            title: 'Defina a data de vencimento',
            description: 'Insira a data em que o plano do cliente vence. O sistema calculará automaticamente os D-1, D0 e D+1.'
          },
          {
            title: 'Salve o cliente',
            description: 'Confirme para adicionar o cliente à sua base.'
          }
        ],
        tips: [
          'Mantenha os telefones sempre atualizados',
          'Use o campo de notas para informações extras',
          'Você pode importar clientes via CSV'
        ]
      }
    },
    {
      id: 'billing',
      number: 8,
      title: 'Sistema de Cobranças',
      description: 'Configure e gerencie as cobranças automáticas',
      icon: <Send className="h-5 w-5" />,
      completed: completedSteps.includes('billing'),
      content: {
        overview: 'O sistema de cobranças envia automaticamente mensagens para clientes com base no vencimento. Você pode configurar quando e como esses envios acontecem.',
        steps: [
          {
            title: 'Acesse a página de Cobranças',
            description: 'No menu lateral, clique em "Cobranças".'
          },
          {
            title: 'Entenda os tipos de cobrança',
            description: 'D-1: 1 dia antes do vencimento | D0: No dia do vencimento | D+1: 1 dia após o vencimento'
          },
          {
            title: 'Configure o agendamento',
            description: 'Defina os horários e quais tipos de cobrança serão enviados automaticamente.'
          },
          {
            title: 'Visualize os clientes por categoria',
            description: 'A aba de cada tipo mostra quantos clientes se enquadram naquela categoria de cobrança.'
          },
          {
            title: 'Envie cobranças manualmente',
            description: 'Se preferir, você pode selecionar clientes específicos e enviar a cobrança manualmente.'
          },
          {
            title: 'Acompanhe o relatório',
            description: 'Verifique quais mensagens foram enviadas e o status de cada uma.'
          }
        ],
        tips: [
          'Evite horários muito cedo ou muito tarde para não incomodar',
          'Monitore as taxas de resposta para ajustar suas mensagens',
          'Use o disparo em massa para campanhas especiais'
        ]
      }
    },
    {
      id: 'payments',
      number: 9,
      title: 'Registrando Pagamentos',
      description: 'Controle financeiro dos seus recebimentos',
      icon: <CreditCard className="h-5 w-5" />,
      completed: completedSteps.includes('payments'),
      content: {
        overview: 'Registre cada pagamento recebido para ter controle financeiro e histórico de cada cliente.',
        steps: [
          {
            title: 'Acesse a página de Pagamentos',
            description: 'No menu lateral, clique em "Pagamentos".'
          },
          {
            title: 'Registre um novo pagamento',
            description: 'Clique em "Novo Pagamento" e selecione o cliente que efetuou o pagamento.'
          },
          {
            title: 'Informe o valor',
            description: 'Digite o valor recebido. Pode ser diferente do valor do plano em casos especiais.'
          },
          {
            title: 'Selecione a forma de pagamento',
            description: 'Escolha entre PIX, Dinheiro ou Transferência.'
          },
          {
            title: 'Confirme o pagamento',
            description: 'Marque como confirmado se o pagamento já foi verificado.'
          },
          {
            title: 'Renove o cliente',
            description: 'Após registrar o pagamento, você pode renovar o vencimento do cliente automaticamente.'
          }
        ],
        tips: [
          'Sempre confirme o pagamento antes de renovar o cliente',
          'Use o painel rápido no Chat para agilizar renovações',
          'O dashboard mostra um resumo dos seus recebimentos'
        ]
      }
    },
    {
      id: 'chat',
      number: 10,
      title: 'Usando o Chat',
      description: 'Atenda seus clientes e faça renovações rápidas',
      icon: <MessageSquare className="h-5 w-5" />,
      completed: completedSteps.includes('chat'),
      content: {
        overview: 'O Chat integra o Zap Responder com um painel de renovação rápida, permitindo atender clientes e renovar assinaturas sem sair da tela.',
        steps: [
          {
            title: 'Acesse o Chat',
            description: 'No menu lateral, clique em "Chat" para abrir a interface de atendimento.'
          },
          {
            title: 'Use o painel de Renovação Rápida',
            description: 'Na lateral direita, você tem acesso rápido para pesquisar clientes e realizar renovações.'
          },
          {
            title: 'Pesquise clientes',
            description: 'Digite o telefone ou usuário do cliente para encontrá-lo rapidamente.'
          },
          {
            title: 'Visualize os dados',
            description: 'Veja servidor, plano, vencimento e status do cliente de forma rápida.'
          },
          {
            title: 'Use mensagens rápidas',
            description: 'Clique nas mensagens pré-configuradas para copiá-las e colar no chat.'
          },
          {
            title: 'Copie cobrança de vencidos',
            description: 'Para clientes vencidos, use o botão de copiar cobrança para enviar a mensagem completa.'
          }
        ],
        tips: [
          'Configure suas mensagens rápidas nas Configurações',
          'O painel mostra automaticamente se o cliente está vencido',
          'Use "Abrir em nova aba" para tela cheia do Zap Responder'
        ]
      }
    }
  ];

  const toggleStepComplete = (stepId: string) => {
    setCompletedSteps(prev => 
      prev.includes(stepId) 
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    );
  };

  const progressPercentage = (completedSteps.length / tutorialSteps.length) * 100;

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "Texto copiado para a área de transferência",
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Tutorial Completo</h1>
              <p className="text-muted-foreground">
                Aprenda a usar todas as funcionalidades do Super Gestor
              </p>
            </div>
          </div>
          
          {/* Progress Card */}
          <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Seu progresso</span>
                <span className="text-sm text-muted-foreground">
                  {completedSteps.length} de {tutorialSteps.length} etapas concluídas
                </span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
              <div className="flex items-center gap-2 mt-3">
                <Rocket className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">
                  {progressPercentage === 100 
                    ? "🎉 Parabéns! Você completou todo o tutorial!" 
                    : "Continue aprendendo para dominar o sistema!"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Tips */}
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              Dicas Importantes
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Nunca compartilhe seu token da API com terceiros
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Target className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Mantenha seus dados de clientes sempre atualizados
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Teste as cobranças automáticas com seu próprio número primeiro
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tutorial Steps */}
        <div className="space-y-4">
          <Accordion type="single" collapsible className="space-y-3">
            {tutorialSteps.map((step) => (
              <AccordionItem 
                key={step.id} 
                value={step.id}
                className="border rounded-xl overflow-hidden bg-card"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4 w-full">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8 rounded-full shrink-0 transition-all",
                        step.completed 
                          ? "bg-green-500/20 text-green-500 hover:bg-green-500/30" 
                          : "bg-muted hover:bg-muted"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStepComplete(step.id);
                      }}
                    >
                      {step.completed ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <span className="text-sm font-semibold">{step.number}</span>
                      )}
                    </Button>
                    
                    <div className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                      step.completed ? "bg-green-500/20 text-green-500" : "bg-primary/10 text-primary"
                    )}>
                      {step.icon}
                    </div>
                    
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <h3 className={cn(
                          "font-semibold",
                          step.completed && "text-green-500"
                        )}>
                          {step.title}
                        </h3>
                        {step.completed && (
                          <Badge variant="outline" className="text-green-500 border-green-500/30 text-xs">
                            Concluído
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                    
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform duration-200 shrink-0" />
                  </div>
                </AccordionTrigger>
                
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-6 pt-4 border-t">
                    {/* Overview */}
                    <div className="bg-muted/50 rounded-lg p-4">
                      <p className="text-sm leading-relaxed">
                        {step.content.overview}
                      </p>
                    </div>

                    {/* Steps */}
                    <div className="space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Play className="h-4 w-4 text-primary" />
                        Passo a Passo
                      </h4>
                      <div className="space-y-3">
                        {step.content.steps.map((subStep, idx) => (
                          <div 
                            key={idx} 
                            className="flex gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                              {idx + 1}
                            </div>
                            <div className="space-y-2 flex-1">
                              <h5 className="font-medium">{subStep.title}</h5>
                              <p className="text-sm text-muted-foreground">
                                {subStep.description}
                              </p>
                              {subStep.tip && (
                                <div className="flex items-start gap-2 mt-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
                                  <Lightbulb className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                                  <p className="text-xs text-blue-600 dark:text-blue-400">
                                    {subStep.tip}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tips */}
                    {step.content.tips && step.content.tips.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-semibold flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-amber-500" />
                          Dicas Extras
                        </h4>
                        <ul className="space-y-2">
                          {step.content.tips.map((tip, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Warning */}
                    {step.content.warning && (
                      <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                        <Shield className="h-5 w-5 text-red-500 shrink-0" />
                        <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                          {step.content.warning}
                        </p>
                      </div>
                    )}

                    {/* Mark as complete button */}
                    <Button
                      variant={step.completed ? "outline" : "default"}
                      className="w-full"
                      onClick={() => toggleStepComplete(step.id)}
                    >
                      {step.completed ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Marcar como não concluído
                        </>
                      ) : (
                        <>
                          <Circle className="h-4 w-4 mr-2" />
                          Marcar como concluído
                        </>
                      )}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* FAQ Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Perguntas Frequentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="space-y-2">
              <AccordionItem value="faq-1" className="border-b-0">
                <AccordionTrigger className="text-sm hover:no-underline py-3">
                  O que fazer se a mensagem não foi enviada?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  Verifique se: 1) Sua sessão do WhatsApp está conectada no Zap Responder; 
                  2) O token da API está correto nas configurações; 
                  3) O número do cliente está no formato correto (com código do país).
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="faq-2" className="border-b-0">
                <AccordionTrigger className="text-sm hover:no-underline py-3">
                  Posso usar meu WhatsApp pessoal?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  Não recomendamos. É melhor ter um número exclusivo para o negócio. Isso evita que mensagens 
                  pessoais se misturem com as de trabalho e reduz o risco de bloqueio por spam.
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="faq-3" className="border-b-0">
                <AccordionTrigger className="text-sm hover:no-underline py-3">
                  Como evitar que meu número seja bloqueado?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  Envie mensagens apenas para clientes que já têm relacionamento com você. 
                  Evite textos muito longos ou com muita pressão. Use intervalos entre os envios em massa.
                  Sempre tenha o consentimento do cliente para receber mensagens.
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="faq-4" className="border-b-0">
                <AccordionTrigger className="text-sm hover:no-underline py-3">
                  O sistema funciona 24 horas?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  Sim, as cobranças agendadas funcionam 24 horas. Porém, recomendamos configurar os envios 
                  para horários comerciais (entre 8h e 20h) para melhor recepção dos clientes.
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="faq-5" className="border-b-0">
                <AccordionTrigger className="text-sm hover:no-underline py-3">
                  Preciso de ajuda, como contatar o suporte?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  Entre em contato com o administrador do sistema através do WhatsApp ou email fornecido 
                  durante seu cadastro como revendedor.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Help Card */}
        <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center">
                <HelpCircle className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="font-semibold text-lg">Precisa de mais ajuda?</h3>
                <p className="text-muted-foreground text-sm">
                  Se você ainda tem dúvidas ou encontrou algum problema, entre em contato com o administrador.
                </p>
              </div>
              <Button variant="default" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Contatar Suporte
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Tutorial;

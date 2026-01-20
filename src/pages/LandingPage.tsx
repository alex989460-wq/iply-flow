import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Zap, Users, MessageSquare, BarChart3, Clock, CheckCircle2, ArrowRight, Star, ChevronDown, Smartphone, Lock, Server, CreditCard, Send, FileText, Bot, Sparkles, Play, Menu, X } from 'lucide-react';
import logoSg from '@/assets/logo-sg.png';
const features = [{
  icon: Shield,
  title: 'API Oficial META',
  description: 'Integração 100% oficial com a API do WhatsApp Business. Sem riscos de banimentos ou bloqueios.',
  color: 'from-emerald-500 to-teal-500'
}, {
  icon: Users,
  title: 'Gestão de Clientes',
  description: 'Cadastre, organize e acompanhe todos os seus clientes em um só lugar com informações detalhadas.',
  color: 'from-blue-500 to-cyan-500'
}, {
  icon: MessageSquare,
  title: 'Cobranças Automáticas',
  description: 'Envie cobranças D-1, D0 e D+1 automaticamente. Configure uma vez e deixe o sistema trabalhar.',
  color: 'from-orange-500 to-amber-500'
}, {
  icon: BarChart3,
  title: 'Dashboard Completo',
  description: 'Visualize métricas em tempo real: faturamento, clientes ativos, vencimentos e muito mais.',
  color: 'from-purple-500 to-pink-500'
}, {
  icon: Server,
  title: 'Multi-Servidor',
  description: 'Gerencie múltiplos servidores e organize seus clientes por servidor facilmente.',
  color: 'from-red-500 to-rose-500'
}, {
  icon: CreditCard,
  title: 'Controle de Pagamentos',
  description: 'Registre pagamentos, acompanhe inadimplência e tenha controle total do seu financeiro.',
  color: 'from-indigo-500 to-violet-500'
}];
const screenshots = [{
  title: 'Dashboard Intuitivo',
  description: 'Visão geral completa do seu negócio com gráficos e métricas em tempo real',
  gradient: 'from-primary/20 to-primary/5'
}, {
  title: 'Gestão de Clientes',
  description: 'Cadastro completo com planos, servidores e datas de vencimento',
  gradient: 'from-blue-500/20 to-blue-500/5'
}, {
  title: 'Chat Integrado',
  description: 'Envie mensagens e renovações diretamente pelo sistema',
  gradient: 'from-emerald-500/20 to-emerald-500/5'
}, {
  title: 'Cobranças Automáticas',
  description: 'Configure e esqueça - o sistema envia automaticamente',
  gradient: 'from-orange-500/20 to-orange-500/5'
}];
const benefits = ['Sem risco de banimento - API Oficial META', 'Cobranças automáticas programadas', 'Suporte a múltiplos revendedores', 'Dashboard com métricas em tempo real', 'Controle financeiro completo', 'Mensagens ilimitadas', 'Suporte técnico dedicado', 'Atualizações constantes'];
const testimonials = [{
  name: 'Carlos Silva',
  role: 'Revendedor IPTV',
  content: 'Desde que comecei a usar o Super Gestor, minha organização melhorou 100%. As cobranças automáticas me economizam horas por dia!',
  rating: 5
}, {
  name: 'Amanda Santos',
  role: 'Revendedora',
  content: 'A melhor decisão que tomei foi migrar para o Super Gestor. Zero preocupação com banimentos e tudo funciona perfeitamente.',
  rating: 5
}, {
  name: 'Ricardo Oliveira',
  role: 'Administrador',
  content: 'O dashboard é incrível! Consigo ver tudo sobre meu negócio em segundos. Recomendo demais!',
  rating: 5
}];
export default function LandingPage() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-background/95 backdrop-blur-xl shadow-lg border-b border-border' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            <div className="flex items-center gap-3">
              <img src={logoSg} alt="Super Gestor" className="h-10 w-10 md:h-12 md:w-12" />
              <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent">
                Super Gestor
              </span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#recursos" className="text-muted-foreground hover:text-foreground transition-colors">Recursos</a>
              <a href="#como-funciona" className="text-muted-foreground hover:text-foreground transition-colors">Como Funciona</a>
              <a href="#depoimentos" className="text-muted-foreground hover:text-foreground transition-colors">Depoimentos</a>
              <Button variant="outline" onClick={() => navigate('/auth')}>
                Entrar
              </Button>
              <Button onClick={() => navigate('/auth')} className="bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90">
                Começar Agora
              </Button>
            </nav>

            {/* Mobile Menu Button */}
            <button className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && <div className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border animate-slide-down">
            <nav className="flex flex-col gap-4 p-4">
              <a href="#recursos" className="text-muted-foreground hover:text-foreground transition-colors py-2">Recursos</a>
              <a href="#como-funciona" className="text-muted-foreground hover:text-foreground transition-colors py-2">Como Funciona</a>
              <a href="#depoimentos" className="text-muted-foreground hover:text-foreground transition-colors py-2">Depoimentos</a>
              <Button variant="outline" onClick={() => navigate('/auth')} className="w-full">
                Entrar
              </Button>
              <Button onClick={() => navigate('/auth')} className="w-full bg-gradient-to-r from-primary to-orange-500">
                Começar Agora
              </Button>
            </nav>
          </div>}
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 md:pt-32 pb-16 md:pb-24 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-primary/20 to-orange-500/10 blur-3xl" />
          <div className="absolute -bottom-1/4 -left-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-blue-500/10 to-primary/10 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <Badge className="mb-6 px-4 py-2 text-sm font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">
              <Shield className="w-4 h-4 mr-2" />
              API Oficial META - 100% Seguro
            </Badge>

            {/* Title */}
            <h1 className="text-4xl md:text-5xl lg:text-7xl font-extrabold tracking-tight mb-6">
              Gerencie seu negócio de
              <span className="block bg-gradient-to-r from-primary via-orange-500 to-amber-500 bg-clip-text text-transparent">
                forma inteligente
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              O sistema completo para revendedores que querem automatizar cobranças, 
              organizar clientes e crescer sem preocupações. <strong>Sem risco de banimentos.</strong>
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Button size="lg" onClick={() => navigate('/auth')} className="bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 text-lg px-8 py-6 shadow-xl shadow-primary/25">
                Começar Gratuitamente
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                <Play className="mr-2 w-5 h-5" />
                Ver Demonstração
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-12 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>API Oficial META</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>Sem Banimentos</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>Suporte 24/7</span>
              </div>
            </div>
          </div>

          {/* Hero Image/Mockup */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
            <div className="relative rounded-2xl overflow-hidden border border-border/50 shadow-2xl shadow-primary/10 bg-card">
              <div className="bg-gradient-to-r from-card to-muted/50 p-2 border-b border-border flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 text-center text-xs text-muted-foreground">Super Gestor - Dashboard</div>
              </div>
              <div className="aspect-[16/9] bg-gradient-to-br from-muted/30 to-muted/10 flex items-center justify-center">
                <div className="text-center p-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[{
                    label: 'Clientes Ativos',
                    value: '1.234',
                    icon: Users,
                    color: 'text-blue-500'
                  }, {
                    label: 'Faturamento',
                    value: 'R$ 45.670',
                    icon: CreditCard,
                    color: 'text-emerald-500'
                  }, {
                    label: 'Vencendo Hoje',
                    value: '23',
                    icon: Clock,
                    color: 'text-orange-500'
                  }, {
                    label: 'Mensagens Enviadas',
                    value: '5.678',
                    icon: Send,
                    color: 'text-purple-500'
                  }].map((stat, i) => <Card key={i} className="p-4 bg-background/80 backdrop-blur">
                        <stat.icon className={`w-8 h-8 ${stat.color} mb-2`} />
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <div className="text-xs text-muted-foreground">{stat.label}</div>
                      </Card>)}
                  </div>
                  <p className="text-muted-foreground">Dashboard em tempo real com todas as métricas do seu negócio</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* API META Section */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-emerald-500/5 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                <Lock className="w-4 h-4 mr-2" />
                Segurança Garantida
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                API Oficial META:
                <span className="block text-emerald-500">Zero Risco de Banimentos</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-6">
                Diferente de soluções não-oficiais que usam engenharia reversa, 
                o Super Gestor utiliza exclusivamente a <strong>API Cloud oficial do WhatsApp Business</strong>, 
                garantindo total conformidade com as políticas da META.
              </p>
              <ul className="space-y-4">
                {['Integração oficial aprovada pela META', 'Conta comercial verificada e protegida', 'Templates de mensagem aprovados', 'Sem risco de bloqueio ou banimento', 'Suporte técnico da própria META'].map((item, i) => <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>)}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-3xl blur-3xl" />
              <Card className="relative p-8 bg-card/80 backdrop-blur border-emerald-500/20">
                <div className="flex items-center justify-center mb-6">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-500/25">
                    <Shield className="w-12 h-12 text-white" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-center mb-4">WhatsApp Business API</h3>
                <p className="text-center text-muted-foreground mb-6">
                  Integração oficial com a plataforma de negócios da META
                </p>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-emerald-500">100%</div>
                    <div className="text-xs text-muted-foreground">Oficial</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-emerald-500">0</div>
                    <div className="text-xs text-muted-foreground">Banimentos</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-emerald-500">24/7</div>
                    <div className="text-xs text-muted-foreground">Uptime</div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="recursos" className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-4">
              <Sparkles className="w-4 h-4 mr-2" />
              Recursos Completos
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-lg text-muted-foreground">
              Ferramentas profissionais para gerenciar seu negócio de forma eficiente e automatizada.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => <Card key={i} className="group relative overflow-hidden p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border-border/50">
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </Card>)}
          </div>
        </div>
      </section>

      {/* Screenshots Section */}
      <section id="como-funciona" className="py-16 md:py-24 bg-gradient-to-b from-muted/30 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-4">
              <Smartphone className="w-4 h-4 mr-2" />
              Interface Moderna
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Conheça o Sistema
            </h2>
            <p className="text-lg text-muted-foreground">
              Uma interface intuitiva e moderna que facilita todas as suas operações diárias.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {screenshots.map((screen, i) => <Card key={i} className={`group relative overflow-hidden p-8 bg-gradient-to-br ${screen.gradient} border-border/50 hover:shadow-xl transition-all duration-300`}>
                <div className="aspect-video bg-card/80 backdrop-blur rounded-xl border border-border/50 flex items-center justify-center mb-4 overflow-hidden">
                  <div className="text-center p-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center mx-auto mb-4">
                      {i === 0 && <BarChart3 className="w-8 h-8 text-white" />}
                      {i === 1 && <Users className="w-8 h-8 text-white" />}
                      {i === 2 && <MessageSquare className="w-8 h-8 text-white" />}
                      {i === 3 && <Clock className="w-8 h-8 text-white" />}
                    </div>
                    <p className="text-sm text-muted-foreground">Preview da funcionalidade</p>
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2">{screen.title}</h3>
                <p className="text-muted-foreground">{screen.description}</p>
              </Card>)}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="mb-4">
                <Zap className="w-4 h-4 mr-2" />
                Benefícios
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Por que escolher o Super Gestor?
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Desenvolvido por revendedores, para revendedores. Entendemos suas necessidades 
                e criamos a solução perfeita para o seu negócio.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {benefits.map((benefit, i) => <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <span className="text-sm">{benefit}</span>
                  </div>)}
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-orange-500/20 rounded-3xl blur-3xl" />
              <Card className="relative p-8 bg-card/80 backdrop-blur">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary to-orange-500 mb-6">
                    <Bot className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Automatização Total</h3>
                  <p className="text-muted-foreground mb-6">
                    Configure uma vez e deixe o sistema fazer o trabalho pesado por você.
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="text-sm">Cobrança D-1</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Automático</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="text-sm">Cobrança D0</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Automático</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="text-sm">Cobrança D+1</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Automático</Badge>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="depoimentos" className="py-16 md:py-24 bg-gradient-to-b from-muted/30 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-4">
              <Star className="w-4 h-4 mr-2" />
              Depoimentos
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              O que nossos clientes dizem
            </h2>
            <p className="text-lg text-muted-foreground">
              Veja o que revendedores como você estão falando sobre o Super Gestor.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, i) => <Card key={i} className="p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <div className="flex gap-1 mb-4">
                  {Array.from({
                length: testimonial.rating
              }).map((_, j) => <Star key={j} className="w-5 h-5 fill-amber-500 text-amber-500" />)}
                </div>
                <p className="text-muted-foreground mb-6 italic">"{testimonial.content}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center text-white font-bold">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  </div>
                </div>
              </Card>)}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="relative overflow-hidden p-8 md:p-16 bg-gradient-to-br from-primary/10 via-orange-500/10 to-amber-500/10 border-primary/20">
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-1/2 -right-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-primary/10 to-orange-500/5 blur-3xl" />
            </div>
            <div className="relative text-center max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
                Pronto para transformar seu negócio?
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Junte-se a centenas de revendedores que já automatizaram suas operações 
                e estão crescendo com o Super Gestor.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" onClick={() => navigate('/auth')} className="bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 text-lg px-8 py-6 shadow-xl shadow-primary/25">
                  Começar Agora - É Grátis
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                  <MessageSquare className="mr-2 w-5 h-5" />
                  Falar com Suporte
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src={logoSg} alt="Super Gestor" className="h-10 w-10" />
              <span className="text-xl font-bold">Super Gestor</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Termos de Uso</a>
              <a href="#" className="hover:text-foreground transition-colors">Privacidade</a>
              <a href="#" className="hover:text-foreground transition-colors">Suporte</a>
            </div>
            <div className="text-sm text-muted-foreground">© 2026 Super Gestor. Todos os direitos reservados.</div>
          </div>
        </div>
      </footer>
    </div>;
}
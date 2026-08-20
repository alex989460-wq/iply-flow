import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/** Evita "tela preta": captura erros de render e mostra uma tela de recuperação. */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[PageErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d] px-6">
          <div className="max-w-md w-full text-center space-y-4 rounded-2xl border border-white/10 bg-[#151515] p-8 text-white">
            <h1 className="text-xl font-bold">Ops, algo deu errado</h1>
            <p className="text-sm text-white/60">
              Não foi possível carregar esta etapa. Recarregue a página e tente novamente.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full h-11 rounded-xl bg-white/10 hover:bg-white/20 font-bold transition-colors"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default PageErrorBoundary;

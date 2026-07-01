import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Catches any runtime error in the React tree so a crash shows a branded,
 * recoverable screen instead of a blank white page. The reload button also
 * clears caches / service workers, which self-heals the "I have to clear the
 * cache every time" problem.
 */
export default class ErrorBoundary extends Component<Props, State> {
  declare props: Props;
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Surface the real error in the console for diagnosis.
    console.error('[ErrorBoundary] Uncaught error:', error, info);
  }

  handleReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch {
      // ignore — reload regardless
    }
    // Cache-busting reload so a stale index.html can't come back.
    const url = new URL(window.location.href);
    url.searchParams.set('_r', Date.now().toString());
    window.location.replace(url.toString());
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6 text-center"
        style={{ background: 'linear-gradient(160deg, #011a0d 0%, #022b15 50%, #011a0d 100%)' }}
      >
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6" style={{ background: 'rgba(200,240,32,0.12)' }}>
          <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="#c8f020" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h1 className="text-white font-black text-xl mb-2">Algo deu errado</h1>
        <p className="text-white/40 text-sm max-w-xs mb-8">
          Ocorreu um erro ao carregar o aplicativo. Toque no botão abaixo para recarregar.
        </p>

        <button
          onClick={this.handleReload}
          className="px-8 py-3 rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all"
          style={{ background: '#c8f020', color: '#011a0d' }}
        >
          Recarregar
        </button>

        {this.state.message && (
          <p className="text-white/20 text-[10px] font-mono mt-8 max-w-xs break-words">
            {this.state.message}
          </p>
        )}
      </div>
    );
  }
}

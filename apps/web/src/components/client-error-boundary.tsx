'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import Button from '@/tailadmin/components/ui/button/Button';

type Props = { children: ReactNode };

type State = { error: Error | null };

export class ClientErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ClientErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      const message = this.state.error.message;
      return (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 bg-gray-50 px-6 py-12 dark:bg-gray-950">
          <div className="max-w-lg text-center">
            <p className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Sayfa yüklenirken bir hata oluştu.
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-error-500/10 p-4 text-sm text-error-700 dark:text-error-400">
              {message}
            </p>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Tarayıcı konsolunu (⌥⌘I / F12) açıp daha fazla detay görebilirsiniz.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Yeniden dene
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

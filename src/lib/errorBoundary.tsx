import { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from './logger';

interface Props {
  name: string;       // e.g. "sidebar", "editor", "canvas"
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Per-panel error boundary. A crash in one panel shows an inline error
 * rather than blanking the whole window.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(`Error boundary caught crash in ${this.props.name}`, {
      message: error.message,
      componentStack: info.componentStack?.slice(0, 200) ?? '',
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <h3>Something went wrong in {this.props.name}</h3>
          <p>{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

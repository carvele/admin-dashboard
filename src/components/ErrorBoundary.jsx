import React from 'react';
import { AlertOctagon, RotateCcw, Home } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-main)',
            fontFamily: 'var(--font-primary)',
            padding: '2rem',
          }}
        >
          <div
            style={{
              maxWidth: '500px',
              width: '100%',
              backgroundColor: 'var(--white)',
              borderRadius: '16px',
              padding: '2.5rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.06)',
              textAlign: 'center',
              border: '1px solid var(--border-color)',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                backgroundColor: 'var(--status-cancelled-bg)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
                color: 'var(--color-danger)',
              }}
            >
              <AlertOctagon size={32} />
            </div>

            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: '700',
                color: 'var(--text-main)',
                marginBottom: '0.75rem',
              }}
            >
              System Error Encountered
            </h1>

            <p
              style={{
                fontSize: '0.95rem',
                color: 'var(--text-secondary)',
                lineHeight: '1.6',
                marginBottom: '2rem',
              }}
            >
              The application encountered an unexpected fault and was unable to recover.
              {this.state.error && (
                <span
                  style={{
                    display: 'block',
                    marginTop: '0.5rem',
                    fontSize: '0.85rem',
                    padding: '0.75rem',
                    backgroundColor: 'var(--cream)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    textAlign: 'left',
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                  }}
                >
                  {this.state.error.toString()}
                </span>
              )}
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'var(--accent)',
                  color: 'var(--white)',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
              >
                <RotateCcw size={18} /> Reload App
              </button>

              <button
                onClick={() => (window.location.href = '/')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'var(--white)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--cream)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--white)')}
                onFocus={(e) => (e.currentTarget.style.backgroundColor = 'var(--cream)')}
                onBlur={(e) => (e.currentTarget.style.backgroundColor = 'var(--white)')}
              >
                <Home size={18} /> Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

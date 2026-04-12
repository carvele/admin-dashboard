import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
            return (_jsx("div", { style: {
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'var(--bg-main)',
                    fontFamily: 'var(--font-primary)',
                    padding: '2rem',
                }, children: _jsxs("div", { style: {
                        maxWidth: '500px',
                        width: '100%',
                        backgroundColor: 'var(--white)',
                        borderRadius: '16px',
                        padding: '2.5rem',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.06)',
                        textAlign: 'center',
                        border: '1px solid var(--border-color)',
                    }, children: [_jsx("div", { style: {
                                width: '64px',
                                height: '64px',
                                backgroundColor: '#FEF2F2',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 1.5rem',
                                color: '#EF4444',
                            }, children: _jsx(AlertOctagon, { size: 32 }) }), _jsx("h1", { style: {
                                fontSize: '1.5rem',
                                fontWeight: '700',
                                color: 'var(--text-main)',
                                marginBottom: '0.75rem',
                            }, children: "System Error Encountered" }), _jsxs("p", { style: {
                                fontSize: '0.95rem',
                                color: 'var(--text-secondary)',
                                lineHeight: '1.6',
                                marginBottom: '2rem',
                            }, children: ["The application encountered an unexpected fault and was unable to recover.", this.state.error && (_jsx("span", { style: {
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
                                    }, children: this.state.error.toString() }))] }), _jsxs("div", { style: { display: 'flex', gap: '1rem', justifyContent: 'center' }, children: [_jsxs("button", { onClick: () => window.location.reload(), style: {
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
                                    }, children: [_jsx(RotateCcw, { size: 18 }), " Reload App"] }), _jsxs("button", { onClick: () => (window.location.href = '/'), style: {
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
                                    }, onMouseOver: (e) => (e.currentTarget.style.backgroundColor = 'var(--cream)'), onMouseOut: (e) => (e.currentTarget.style.backgroundColor = 'var(--white)'), children: [_jsx(Home, { size: 18 }), " Dashboard"] })] })] }) }));
        }
        return this.props.children;
    }
}
export default ErrorBoundary;

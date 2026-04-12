import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AuthProvider } from './context/AuthContext';
import { AppRouter } from './router/AppRouter';
import { Toaster } from 'sonner';
import ErrorBoundary from './components/ErrorBoundary';
function App() {
    return (_jsx(ErrorBoundary, { children: _jsxs(AuthProvider, { children: [_jsx(AppRouter, {}), _jsx(Toaster, { position: "top-right", richColors: true, closeButton: true })] }) }));
}
export default App;

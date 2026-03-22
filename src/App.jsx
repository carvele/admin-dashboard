import { AuthProvider } from './context/AuthContext';
import { AppRouter } from './router/AppRouter';
import { Toaster } from 'sonner';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRouter />
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

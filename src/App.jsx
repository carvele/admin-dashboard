import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AppRouter } from './router/AppRouter';
import { Toaster } from 'sonner';
import ErrorBoundary from './components/ErrorBoundary';

// sonner scopes its own CSS vars under its own [data-theme] attribute, so it
// can't see :root.dark -- needs the theme prop passed explicitly. Split out
// so this can call useTheme(), which requires being under ThemeProvider.
function AppInner() {
  const { theme } = useTheme();
  return (
    <AuthProvider>
      <AppRouter />
      <Toaster position="top-right" richColors closeButton dismissible duration={4000} theme={theme} />
    </AuthProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

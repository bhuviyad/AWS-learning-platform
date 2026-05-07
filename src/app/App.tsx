import { useEffect, useState } from 'react';
import { Book, FlaskConical, LogOut } from 'lucide-react';
import LearningPage from './components/LearningPage';
import HandsOnLabPage from './components/HandsOnLabPage';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import { Button } from './components/ui/button';
import { Avatar, AvatarFallback } from './components/ui/avatar';
import { authenticateUser, registerUser } from './auth';
import { hasSupabaseConfig, supabase } from './lib/supabaseClient';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'learning' | 'lab'>('learning');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    const supabaseClient = supabase;

    if (!hasSupabaseConfig || !supabaseClient) {
      return;
    }

    let isMounted = true;

    const syncSession = async () => {
      const { data } = await supabaseClient.auth.getSession();
      const sessionUser = data.session?.user;

      if (!isMounted || !sessionUser) {
        return;
      }

      setUser({
        name:
          (sessionUser.user_metadata?.full_name as string | undefined) ||
          (sessionUser.user_metadata?.name as string | undefined) ||
          sessionUser.email ||
          'User',
        email: sessionUser.email ?? '',
      });
      setIsAuthenticated(true);
    };

    syncSession();

    const { data: authListener } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user;

      if (!isMounted || !sessionUser) {
        return;
      }

      setUser({
        name:
          (sessionUser.user_metadata?.full_name as string | undefined) ||
          (sessionUser.user_metadata?.name as string | undefined) ||
          sessionUser.email ||
          'User',
        email: sessionUser.email ?? '',
      });
      setIsAuthenticated(true);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (email: string, password: string) => {
    const result = await authenticateUser(email, password);

    if (result.success && result.user) {
      setUser(result.user);
      setIsAuthenticated(true);
    }

    return result;
  };

  const handleSignup = async (name: string, email: string, password: string) => {
    return registerUser(name, email, password);
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setIsAuthenticated(false);
    setAuthView('login');
  };

  if (!isAuthenticated) {
    return authView === 'login' ? (
      <LoginPage onLogin={handleLogin} onSwitchToSignup={() => setAuthView('signup')} />
    ) : (
      <SignupPage onSignup={handleSignup} onSwitchToLogin={() => setAuthView('login')} />
    );
  }

  return (
    <div className="size-full flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
              <FlaskConical className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-slate-900">AWS Learning Lab</h1>
              <p className="text-xs text-slate-500">Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-orange-100 text-orange-700">
                  {user?.name.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="text-sm">
                <p className="font-medium text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage('learning')}
              className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors ${
                currentPage === 'learning'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Book className="w-4 h-4" />
              <span className="font-medium">Learning</span>
            </button>
            <button
              onClick={() => setCurrentPage('lab')}
              className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors ${
                currentPage === 'lab'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <FlaskConical className="w-4 h-4" />
              <span className="font-medium">Hands-on Lab</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6">
          {currentPage === 'learning' ? <LearningPage /> : <HandsOnLabPage />}
        </div>
      </main>
    </div>
  );
}

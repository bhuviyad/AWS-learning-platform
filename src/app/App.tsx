import { useEffect, useState } from 'react';
import { Book, FlaskConical, HelpCircle, ShieldAlert, Users } from 'lucide-react';
import LearningPage from './components/LearningPage';
import HandsOnLabPage from './components/HandsOnLabPage';
import HelpPage from './components/HelpPage';
import InternsPage from './components/InternsPage';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import { Avatar, AvatarFallback } from './components/ui/avatar';
import { Badge } from './components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './components/ui/sheet';
import { readCurrentUser, writeCurrentUser, clearCurrentUser, registerUser, authenticateUser } from './auth';
import { isAdminEmail } from './lib/admin';
import { signOutUserPresence, updateUserPresence } from './lib/presenceApi';

export default function App() {
  const stored = readCurrentUser();
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string } | null>(stored);
  const [currentPage, setCurrentPage] = useState<'learning' | 'lab' | 'interns'>('learning');
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [helpOpen, setHelpOpen] = useState(false);

  const handleLogin = async (email: string, password: string) => {
    const result = await authenticateUser(email, password);
    if (result.success && result.user) {
      writeCurrentUser(result.user);
      setCurrentUser(result.user);
      void updateUserPresence(result.user, { currentPage: 'learning', login: true });
    }
    return result;
  };

  const handleSignup = async (name: string, email: string, password: string) => {
    const result = await registerUser(name, email, password);
    if (result.success && result.user) {
      writeCurrentUser(result.user);
      setCurrentUser(result.user);
      void updateUserPresence(result.user, { currentPage: 'learning', login: true });
    }
    return result;
  };

  const handleLogout = () => {
    if (currentUser) void signOutUserPresence(currentUser);
    clearCurrentUser();
    setCurrentUser(null);
    setAuthView('login');
    setCurrentPage('learning');
  };

  useEffect(() => {
    if (!currentUser) return;

    const sendHeartbeat = () => {
      void updateUserPresence(currentUser, { currentPage: helpOpen ? 'help' : currentPage });
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUser, currentPage, helpOpen]);

  if (!currentUser) {
    return authView === 'login' ? (
      <LoginPage onLogin={handleLogin} onSwitchToSignup={() => setAuthView('signup')} />
    ) : (
      <SignupPage onSignup={handleSignup} onSwitchToLogin={() => setAuthView('login')} />
    );
  }

  const adminAllowed = isAdminEmail(currentUser.email);
  const canAccessInterns = adminAllowed;

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
                  {currentUser?.name.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="text-sm">
                <p className="font-medium text-slate-900">{currentUser?.name}</p>
                <p className="text-xs text-slate-500">{currentUser?.email}</p>
              </div>
            </div>
            {adminAllowed && <Badge variant="outline" className="border-orange-200 text-orange-700">Admin</Badge>}
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              Sign out
            </button>
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
            {canAccessInterns && (
              <button
                onClick={() => setCurrentPage('interns')}
                className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors ${
                  currentPage === 'interns'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="font-medium">Interns</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6">
          {currentPage === 'learning' ? (
            <LearningPage currentUser={currentUser} />
          ) : currentPage === 'lab' ? (
            <HandsOnLabPage currentUser={currentUser} />
          ) : canAccessInterns ? (
            <InternsPage currentUser={currentUser} />
          ) : (
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-orange-600" />
                  Admin only
                </CardTitle>
                <CardDescription>
                  The Interns page is restricted to the admin account.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-slate-600 space-y-2">
                <p>You can use the Learning and Hands-on Lab tabs, but intern profile management is hidden for non-admin users.</p>
                <p>If you should have admin access, set the admin email in <span className="font-mono">VITE_ADMIN_EMAIL</span> and sign in with that account.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetTrigger asChild>
          <button
            className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full bg-orange-600 px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
            aria-label="Open AWS Lab Help"
          >
            <HelpCircle className="h-5 w-5" />
            Help
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[94vw] overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>AWS Lab Help</SheetTitle>
            <SheetDescription>Resource creation, exact tags, cleanup rules, and troubleshooting.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-8">
            <HelpPage />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

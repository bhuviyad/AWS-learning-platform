import { useState } from 'react';
import { FlaskConical, Lock, Mail } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  onSwitchToSignup: () => void;
}

export default function LoginPage({ onLogin, onSwitchToSignup }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    const result = await onLogin(email, password);

    if (!result.success) {
      setErrorMessage(result.message);
    }

    setIsLoading(false);
  };

  return (
    <div className="size-full flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-orange-50">
      <div className="w-full max-w-md p-8">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl mb-4">
            <FlaskConical className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">AWS Learning Lab</h1>
          <p className="text-slate-600">Sign in to access your learning platform</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-4 text-center space-y-3">
            {errorMessage ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : (
              <p className="text-sm text-slate-600">Use a registered account to sign in.</p>
            )}
            <button
              type="button"
              onClick={onSwitchToSignup}
              className="text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              Don&apos;t have an account? Sign up
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 text-center text-sm text-slate-500">
          <p>Secure access to AWS hands-on labs</p>
        </div>
      </div>
    </div>
  );
}

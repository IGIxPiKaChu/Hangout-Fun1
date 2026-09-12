import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Chrome, Apple, MessageCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useApp } from '../context/AppContext.tsx';

export const LoginScreen: React.FC = () => {
  const { login, loginWithGoogle, error, clearError } = useAuth();
  const { navigate, goBack } = useApp();

  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (!emailOrUsername.trim() || !password) {
      setLocalError('Please enter both your email/username and password.');
      return;
    }

    setIsSubmitting(true);
    const success = await login(emailOrUsername.trim(), password);
    setIsSubmitting(false);

    if (success) {
      navigate('home');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0b14] flex flex-col justify-between px-6 py-8">
      <div>
        {/* Back Button */}
        <button
          onClick={goBack}
          id="login-back-button"
          aria-label="Go back"
          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Welcome back <span className="text-xl">👋</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">Login to continue</p>
        </div>

        {/* Error Alert */}
        {(error || localError) && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-xs leading-relaxed">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error || localError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Email / Username
            </label>
            <input
              id="login-email-input"
              type="text"
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
              placeholder="Enter your email or username"
              className="w-full px-4 py-3.5 rounded-xl bg-[#141628] border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Password
              </label>
              <button
                type="button"
                onClick={() => setLocalError('Self-service password recovery is currently not configured. Please contact support or register a new account.')}
                className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
              >
                Forgot?
              </button>
            </div>
            <div className="relative">
              <input
                id="login-password-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3.5 pr-11 rounded-xl bg-[#141628] border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-[#141628] text-purple-600 focus:ring-purple-500"
            />
            <label htmlFor="remember-me" className="text-xs text-slate-400 cursor-pointer">
              Remember me
            </label>
          </div>

          <button
            id="login-submit-button"
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-4 py-3.5 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-purple-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Logging in...</span>
              </>
            ) : (
              <span>Login</span>
            )}
          </button>
        </form>

        {/* Social Authentication */}
        <div className="mt-8">
          <div className="relative flex items-center justify-center py-2">
            <div className="border-t border-white/10 w-full" />
            <span className="bg-[#0a0b14] px-3 text-xs text-slate-400">or continue with</span>
            <div className="border-t border-white/10 w-full" />
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              disabled={isGoogleSubmitting || isSubmitting}
              onClick={async () => {
                clearError();
                setLocalError(null);
                setIsGoogleSubmitting(true);
                const ok = await loginWithGoogle();
                setIsGoogleSubmitting(false);
                if (ok) {
                  navigate('home');
                }
              }}
              className="w-full py-3 px-4 rounded-xl bg-[#141628] border border-white/10 hover:border-purple-500/40 text-white text-sm font-medium transition-all flex items-center justify-center gap-3 active:scale-[0.99] disabled:opacity-60 shadow-sm"
              title="Sign in with Google"
              aria-label="Google sign in"
            >
              {isGoogleSubmitting ? (
                <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              ) : (
                <Chrome className="w-5 h-5 text-red-400" />
              )}
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center justify-center gap-4 mt-1">
              <button
                type="button"
                onClick={() => setLocalError('Apple OAuth is not configured for this Firebase project.')}
                className="w-12 h-10 rounded-xl bg-[#141628] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-purple-500/40 transition-colors"
                title="Sign in with Apple"
                aria-label="Apple sign in"
              >
                <Apple className="w-4.5 h-4.5 text-white" />
              </button>
              <button
                type="button"
                onClick={() => setLocalError('Discord OAuth is not configured for this Firebase project.')}
                className="w-12 h-10 rounded-xl bg-[#141628] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-purple-500/40 transition-colors"
                title="Sign in with Discord"
                aria-label="Discord sign in"
              >
                <MessageCircle className="w-4.5 h-4.5 text-indigo-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer link to Sign Up */}
      <div className="text-center pt-8">
        <p className="text-xs text-slate-400">
          Don't have an account?{' '}
          <button
            onClick={() => navigate('signup')}
            className="text-purple-400 hover:text-purple-300 font-semibold transition-colors"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
};

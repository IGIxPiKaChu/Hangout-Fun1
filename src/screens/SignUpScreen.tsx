import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, AlertCircle, Loader2, Chrome } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useApp } from '../context/AppContext.tsx';

export const SignUpScreen: React.FC = () => {
  const { signup, loginWithGoogle, error, clearError } = useAuth();
  const { navigate, goBack } = useApp();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (!fullName.trim() || !username.trim() || !email.trim() || !password) {
      setLocalError('Please fill out all required fields.');
      return;
    }

    if (!agreeTerms) {
      setLocalError('You must agree to the Terms & Privacy Policy to sign up.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);
    const success = await signup(fullName.trim(), username.trim(), email.trim(), password);
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
          id="signup-back-button"
          aria-label="Go back"
          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white tracking-tight">Create your account</h1>
          <p className="text-sm text-slate-400 mt-1">Join and start your journey</p>
        </div>

        {/* Error Alert */}
        {(error || localError) && (
          <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error || localError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Full Name
            </label>
            <input
              id="signup-fullname-input"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 rounded-xl bg-[#141628] border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <input
              id="signup-username-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username (e.g. alex)"
              className="w-full px-4 py-3 rounded-xl bg-[#141628] border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              id="signup-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full px-4 py-3 rounded-xl bg-[#141628] border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="signup-password-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password (min 6 characters)"
                className="w-full px-4 py-3 pr-11 rounded-xl bg-[#141628] border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
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

          <div className="flex items-center gap-2 pt-2">
            <input
              id="agree-terms"
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-[#141628] text-purple-600 focus:ring-purple-500"
            />
            <label htmlFor="agree-terms" className="text-xs text-slate-400 cursor-pointer">
              I agree to <span className="text-purple-400 underline">Terms & Privacy Policy</span>
            </label>
          </div>

          <button
            id="signup-submit-button"
            type="submit"
            disabled={isSubmitting || isGoogleSubmitting}
            className="w-full mt-4 py-3.5 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-purple-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating account...</span>
              </>
            ) : (
              <span>Sign Up</span>
            )}
          </button>
        </form>

        {/* Alternative Google Sign-in */}
        <div className="mt-6">
          <div className="relative flex items-center justify-center py-2">
            <div className="border-t border-white/10 w-full" />
            <span className="bg-[#0a0b14] px-3 text-xs text-slate-400">or continue with</span>
            <div className="border-t border-white/10 w-full" />
          </div>

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
            className="w-full mt-3 py-3 px-4 rounded-xl bg-[#141628] border border-white/10 hover:border-purple-500/40 text-white text-sm font-medium transition-all flex items-center justify-center gap-3 active:scale-[0.99] disabled:opacity-60 shadow-sm"
            title="Sign up with Google"
            aria-label="Google sign up"
          >
            {isGoogleSubmitting ? (
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            ) : (
              <Chrome className="w-5 h-5 text-red-400" />
            )}
            <span>Continue with Google</span>
          </button>
        </div>
      </div>

      {/* Footer link to Login */}
      <div className="text-center pt-6">
        <p className="text-xs text-slate-400">
          Already have an account?{' '}
          <button
            onClick={() => navigate('login')}
            className="text-purple-400 hover:text-purple-300 font-semibold transition-colors"
          >
            Login
          </button>
        </p>
      </div>
    </div>
  );
};

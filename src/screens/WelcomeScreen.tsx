import React from 'react';
import { Users, Chrome, Apple, MessageCircle } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';

export const WelcomeScreen: React.FC = () => {
  const { navigate } = useApp();

  return (
    <div className="relative min-h-screen flex flex-col justify-between px-6 py-12 bg-[#0a0b14] overflow-hidden">
      {/* Ambient background glow & waves */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/3 -right-20 w-80 h-80 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Decorative floating social elements */}
      <div className="relative z-10 flex flex-col items-center text-center mt-12">
        {/* Animated Brand Logo Icon */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-purple-600/40 ring-4 ring-purple-500/20">
            <Users className="w-10 h-10 text-white" />
          </div>
          {/* Subtle orbiting user badges */}
          <div className="absolute -top-2 -right-4 w-9 h-9 rounded-full border-2 border-[#0a0b14] bg-indigo-800 overflow-hidden shadow-md">
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop"
              alt="Community member"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute -bottom-2 -left-4 w-9 h-9 rounded-full border-2 border-[#0a0b14] bg-purple-800 overflow-hidden shadow-md">
            <img
              src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop"
              alt="Community member"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Brand Name & Tagline */}
        <h1 className="text-3xl font-black tracking-widest text-white uppercase mb-2">
          Social <span className="text-purple-400">Hangout</span>
        </h1>
        <p className="text-sm font-medium text-slate-400 tracking-wide max-w-xs">
          Connect. Hangout. Chat. Share. Together.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="relative z-10 w-full max-w-sm mx-auto space-y-3.5 mb-4">
        <button
          id="welcome-get-started-btn"
          onClick={() => navigate('signup')}
          className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-purple-600/30 active:scale-[0.98] transition-all"
        >
          Get Started
        </button>

        <button
          id="welcome-login-btn"
          onClick={() => navigate('login')}
          className="w-full py-3.5 px-6 rounded-2xl bg-[#17192c] hover:bg-[#1f223d] text-slate-200 font-semibold text-sm border border-purple-500/20 active:scale-[0.98] transition-all"
        >
          Login
        </button>

        <div className="relative flex items-center justify-center py-2">
          <div className="border-t border-white/10 w-full" />
          <span className="bg-[#0a0b14] px-3 text-xs text-slate-400 font-medium">
            or continue with
          </span>
          <div className="border-t border-white/10 w-full" />
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => navigate('login')}
            className="w-12 h-12 rounded-xl bg-[#141628] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-purple-500/40 transition-colors"
            aria-label="Continue with Google"
          >
            <Chrome className="w-5 h-5 text-red-400" />
          </button>
          <button
            onClick={() => navigate('login')}
            className="w-12 h-12 rounded-xl bg-[#141628] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-purple-500/40 transition-colors"
            aria-label="Continue with Apple"
          >
            <Apple className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => navigate('login')}
            className="w-12 h-12 rounded-xl bg-[#141628] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-purple-500/40 transition-colors"
            aria-label="Continue with Discord"
          >
            <MessageCircle className="w-5 h-5 text-indigo-400" />
          </button>
        </div>
      </div>
    </div>
  );
};

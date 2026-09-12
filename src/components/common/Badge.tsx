import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'purple' | 'gold' | 'emerald' | 'slate' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'purple',
  size = 'sm',
  className = '',
}) => {
  const variantStyles = {
    purple: 'bg-purple-900/40 text-purple-300 border border-purple-500/30',
    gold: 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium',
    emerald: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    slate: 'bg-slate-800/60 text-slate-300 border border-slate-700/50',
    outline: 'bg-transparent text-slate-300 border border-white/15',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 rounded-full',
    md: 'text-xs px-2.5 py-1 rounded-md',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium tracking-wide whitespace-nowrap ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {children}
    </span>
  );
};

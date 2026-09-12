import React from 'react';
import type { TypingUser } from '../../types/index.ts';
import { Avatar } from '../common/Avatar.tsx';

interface TypingIndicatorProps {
  users: TypingUser[];
  variant?: 'bubble' | 'bar';
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  users,
  variant = 'bubble',
}) => {
  if (!users || users.length === 0) return null;

  // Format typing message text
  const getTypingText = () => {
    if (users.length === 1) {
      return (
        <span>
          <strong className="font-semibold text-slate-200">{users[0].fullName}</strong> is typing
        </span>
      );
    }
    if (users.length === 2) {
      return (
        <span>
          <strong className="font-semibold text-slate-200">{users[0].fullName}</strong> and{' '}
          <strong className="font-semibold text-slate-200">{users[1].fullName}</strong> are typing
        </span>
      );
    }
    return (
      <span>
        <strong className="font-semibold text-slate-200">Several people</strong> are typing
      </span>
    );
  };

  const dots = (
    <span className="inline-flex items-center gap-1 shrink-0 ml-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 typing-dot-1 inline-block" />
      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 typing-dot-2 inline-block" />
      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 typing-dot-3 inline-block" />
    </span>
  );

  if (variant === 'bar') {
    return (
      <div className="w-full px-4 py-1 bg-[#0b0c16]/80 backdrop-blur-xs border-t border-white/5 flex items-center gap-2 text-xs text-purple-300 animate-in fade-in slide-in-from-bottom-1 duration-150">
        <div className="flex -space-x-1.5 items-center shrink-0">
          {users.slice(0, 3).map((u) => (
            <Avatar
              key={u.userId}
              src={u.avatarUrl}
              alt={u.fullName}
              size="xs"
              className="ring-1 ring-[#0b0c16]"
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate">{getTypingText()}</span>
          {dots}
        </div>
      </div>
    );
  }

  // 'bubble' variant (appears inside the message stream)
  return (
    <div className="flex flex-col items-start max-w-[85%] mr-auto animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl rounded-bl-xs bg-[#181a2f] border border-white/5 shadow-sm text-xs text-slate-300">
        <div className="flex -space-x-1.5 items-center shrink-0">
          {users.slice(0, 3).map((u) => (
            <Avatar
              key={u.userId}
              src={u.avatarUrl}
              alt={u.fullName}
              size="xs"
              className="ring-1 ring-[#181a2f]"
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-300">{getTypingText()}</span>
          {dots}
        </div>
      </div>
    </div>
  );
};

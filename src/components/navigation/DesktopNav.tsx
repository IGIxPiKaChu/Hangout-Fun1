import React from 'react';
import { Home, Compass, MessageSquare, Bell, User, Plus, Settings, LogOut, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Avatar } from '../common/Avatar.tsx';

export const DesktopNav: React.FC = () => {
  const { currentScreen, navigate, unreadNotificationsCount, unreadChatsCount, openCreateRoom, t } = useApp();
  const { currentUser, logout } = useAuth();

  if (!currentUser) return null;

  const navItems = [
    {
      id: 'home',
      label: t('nav.home', 'Home'),
      icon: Home,
      screen: 'home' as const,
      isActive: currentScreen === 'home',
    },
    {
      id: 'rooms',
      label: t('nav.rooms', 'Rooms'),
      icon: Compass,
      screen: 'rooms' as const,
      isActive: currentScreen === 'rooms' || currentScreen === 'room-details',
    },
    {
      id: 'chats',
      label: t('nav.messages', 'Messages'),
      icon: MessageSquare,
      screen: 'chats' as const,
      badge: unreadChatsCount,
      isActive: currentScreen === 'chats' || currentScreen === 'direct-chat',
    },
    {
      id: 'notifications',
      label: t('nav.notifications', 'Notifications'),
      icon: Bell,
      screen: 'notifications' as const,
      badge: unreadNotificationsCount,
      isActive: currentScreen === 'notifications',
    },
    {
      id: 'friends',
      label: t('nav.friends', 'Friends'),
      icon: Users,
      screen: 'friends' as const,
      isActive: currentScreen === 'friends',
    },
    {
      id: 'profile',
      label: t('nav.profile', 'Profile'),
      icon: User,
      screen: 'profile' as const,
      isActive: currentScreen === 'profile',
    },
    {
      id: 'settings',
      label: t('nav.settings', 'Settings'),
      icon: Settings,
      screen: 'settings' as const,
      isActive: currentScreen === 'settings',
    },
  ];

  return (
    <aside
      id="desktop-sidebar-navigation"
      className="hidden md:flex flex-col w-64 shrink-0 bg-[#0d0f1c] border-r border-white/5 h-screen sticky top-0 px-4 py-6 justify-between select-none"
    >
      <div className="space-y-6">
        {/* Brand Logo */}
        <div
          onClick={() => navigate('home')}
          className="flex items-center gap-3 px-2 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-900/30 group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-wider text-white uppercase block leading-none">
              Social
            </span>
            <span className="font-semibold text-xs tracking-widest text-purple-400 uppercase block">
              Hangout
            </span>
          </div>
        </div>

        {/* Create Room Button */}
        <button
          id="desktop-create-room-btn"
          onClick={openCreateRoom}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-md shadow-purple-900/30 transition-all active:scale-[0.99]"
        >
          <Plus className="w-4 h-4" />
          <span>{t('rooms.create_room', 'Create Room')}</span>
        </button>

        {/* Navigation Items */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                id={`desktop-nav-${item.id}`}
                onClick={() => navigate(item.screen)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  item.isActive
                    ? 'bg-purple-600/15 text-purple-300 border border-purple-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4.5 h-4.5 ${item.isActive ? 'text-purple-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && item.badge > 0 ? (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-pink-500 text-[10px] font-bold text-white flex items-center justify-center">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Footer */}
      <div className="pt-4 border-t border-white/5 flex items-center justify-between">
        <div
          onClick={() => navigate('profile')}
          className="flex items-center gap-3 cursor-pointer p-1.5 rounded-xl hover:bg-white/5 transition-colors overflow-hidden"
        >
          <Avatar
            src={currentUser.avatarUrl}
            alt={currentUser.fullName}
            size="sm"
            isOnline={currentUser.isOnline}
          />
          <div className="truncate">
            <p className="text-xs font-semibold text-white truncate leading-tight">
              {currentUser.fullName}
            </p>
            <p className="text-[11px] text-slate-400 truncate leading-none">
              @{currentUser.username}
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          title="Log out"
          aria-label="Log out"
          className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};

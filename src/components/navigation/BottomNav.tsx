import React from 'react';
import { Home, Compass, MessageSquare, Bell, User } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

export const BottomNav: React.FC = () => {
  const { currentScreen, navigate, unreadNotificationsCount, unreadChatsCount, t } = useApp();
  const { currentUser } = useAuth();

  if (!currentUser) return null;

  // Don't show bottom nav inside active room hangout view or direct chat to provide maximum screen real estate
  if (currentScreen === 'room-view' || currentScreen === 'direct-chat') {
    return null;
  }

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
      label: t('nav.chat', 'Chat'),
      icon: MessageSquare,
      screen: 'chats' as const,
      badge: unreadChatsCount,
      isActive: currentScreen === 'chats',
    },
    {
      id: 'notifications',
      label: t('nav.alerts', 'Alerts'),
      icon: Bell,
      screen: 'notifications' as const,
      badge: unreadNotificationsCount,
      isActive: currentScreen === 'notifications',
    },
    {
      id: 'you',
      label: t('nav.you', 'You'),
      icon: User,
      screen: 'profile' as const,
      isActive: currentScreen === 'profile' || currentScreen === 'settings' || currentScreen === 'friends' || currentScreen === 'my-rooms',
    },
  ];

  return (
    <nav
      id="mobile-bottom-navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#0e101d]/95 backdrop-blur-lg border-t border-purple-900/20 px-2 py-1.5 md:hidden safe-area-pb"
    >
      <div className="flex items-center justify-between max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              id={`nav-tab-${item.id}`}
              onClick={() => navigate(item.screen)}
              className={`relative flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-200 active:scale-95 ${
                item.isActive
                  ? 'text-purple-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${item.isActive ? 'scale-110' : ''}`} />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-pink-500 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-[#0e101d]">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">{item.label}</span>
              {item.isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-0.5 shadow-sm shadow-purple-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

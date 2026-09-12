import React from 'react';
import { ArrowLeft, Plus, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useApp } from '../../context/AppContext.tsx';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, showBack, rightAction }) => {
  const { currentUser } = useAuth();
  const {
    currentScreen,
    navigate,
    goBack,
    canGoBack,
    openCreateRoom,
    settingsSubPage,
    t,
  } = useApp();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greeting_morning', 'Good morning,');
    if (hour < 18) return t('home.greeting_afternoon', 'Good afternoon,');
    return t('home.greeting_evening', 'Good evening,');
  };

  const isHomeScreen = currentScreen === 'home';
  const isProfileScreen = currentScreen === 'profile';
  const isSubScreen = [
    'settings',
    'friends',
    'notifications',
    'profile',
    'room-details',
    'other-profile',
  ].includes(currentScreen);

  return (
    <header className="sticky top-0 z-40 bg-[#0a0b14]/90 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {(showBack || canGoBack || isSubScreen) && !isHomeScreen && (
          <button
            id="header-back-button"
            onClick={goBack}
            aria-label="Go back"
            className="shrink-0 w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {isHomeScreen && currentUser ? (
          <div className="min-w-0">
            <p className="text-xs text-slate-400 font-medium tracking-wide">
              {getGreeting()}
            </p>
            <h1 className="text-lg font-bold text-white flex items-center gap-1.5 leading-tight truncate">
              {currentUser.fullName.split(' ')[0]} <span>👋</span>
            </h1>
          </div>
        ) : (
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white tracking-tight truncate">
              {title || (
                currentScreen === 'settings' && settingsSubPage ? (
                  settingsSubPage === 'profile' ? t('settings.edit_profile', 'Edit Profile') :
                  settingsSubPage === 'account' ? t('settings.account', 'Account & Credentials') :
                  settingsSubPage === 'privacy_security' ? t('settings.privacy', 'Privacy & Security') :
                  settingsSubPage === 'appearance' ? t('settings.appearance', 'Appearance & Themes') :
                  settingsSubPage === 'app' ? t('settings.app_preferences', 'App Preferences') :
                  settingsSubPage === 'notifications' ? t('settings.notifications', 'Notification Center') :
                  settingsSubPage === 'about' ? t('settings.about', 'About VibeSphere') :
                  settingsSubPage === 'ai_config' ? 'Configure AI' :
                  settingsSubPage === 'ai_model' ? 'Set AI Model' :
                  settingsSubPage === 'ai_apis' ? 'AI Management' :
                  settingsSubPage === 'ai_playground' ? 'AI Playground' : t('nav.settings', 'Settings')
                ) : (
                  currentScreen.charAt(0).toUpperCase() + currentScreen.slice(1).replace('-', ' ')
                )
              )}
            </h1>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {rightAction}

        {isHomeScreen && (
          <button
            id="header-create-room-btn"
            onClick={openCreateRoom}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-semibold border border-purple-400/30 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('rooms.create_room', 'Create Room')}</span>
          </button>
        )}

        {/* Settings gear icon when on the Profile screen */}
        {isProfileScreen && (
          <button
            id="header-settings-button"
            onClick={() => navigate('settings')}
            aria-label="Open settings"
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <Settings className="w-4.5 h-4.5" />
          </button>
        )}
      </div>
    </header>
  );
};

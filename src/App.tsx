/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { Header } from './components/navigation/Header.tsx';
import { BottomNav } from './components/navigation/BottomNav.tsx';
import { DesktopNav } from './components/navigation/DesktopNav.tsx';

// Screens
import { WelcomeScreen } from './screens/WelcomeScreen.tsx';
import { LoginScreen } from './screens/LoginScreen.tsx';
import { SignUpScreen } from './screens/SignUpScreen.tsx';
import { HomeScreen } from './screens/HomeScreen.tsx';
import { RoomsScreen } from './screens/RoomsScreen.tsx';
import { RoomDetailsScreen } from './screens/RoomDetailsScreen.tsx';
import { RoomHangoutScreen } from './screens/RoomHangoutScreen.tsx';
import { ChatsScreen } from './screens/ChatsScreen.tsx';
import { DirectChatScreen } from './screens/DirectChatScreen.tsx';
import { NotificationsScreen } from './screens/NotificationsScreen.tsx';
import { ProfileScreen } from './screens/ProfileScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { FriendsScreen } from './screens/FriendsScreen.tsx';
import { OtherUserProfileScreen } from './screens/OtherUserProfileScreen.tsx';

// Modals
import { CreateRoomModal } from './components/modals/CreateRoomModal.tsx';
import { JoinRoomModal } from './components/modals/JoinRoomModal.tsx';
import { MembersModal } from './components/modals/MembersModal.tsx';
import { threeClickFX } from './lib/threeClickFX.ts';
import { threeTransitionFX } from './lib/threeTransitionFX.ts';

function MainApp() {
  const { currentUser, isLoading } = useAuth();
  const { currentScreen, toastMessage } = useApp();

  // Initialize Three.js interactive click and transition FX on mount
  React.useEffect(() => {
    threeClickFX.init();
    threeTransitionFX.init();

    return () => {
      threeClickFX.destroy();
      threeTransitionFX.destroy();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0b14] flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wider text-slate-300">
          Loading Social Hangout...
        </p>
      </div>
    );
  }

  // Unauthenticated Flow
  if (!currentUser) {
    if (currentScreen === 'signup') return <SignUpScreen />;
    if (currentScreen === 'login') return <LoginScreen />;
    return <WelcomeScreen />;
  }

  // Authenticated Application Shell
  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen />;
      case 'rooms':
        return <RoomsScreen />;
      case 'room-details':
        return <RoomDetailsScreen />;
      case 'room-view':
        return <RoomHangoutScreen />;
      case 'chats':
        return <ChatsScreen />;
      case 'direct-chat':
        return <DirectChatScreen />;
      case 'notifications':
        return <NotificationsScreen />;
      case 'profile':
        return <ProfileScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'friends':
        return <FriendsScreen />;
      case 'other-profile':
        return <OtherUserProfileScreen />;
      default:
        return <HomeScreen />;
    }
  };

  const isFullScreenView = currentScreen === 'room-view' || currentScreen === 'direct-chat';

  return (
    <div
      className={`min-h-screen bg-[#0a0b14] text-slate-100 flex flex-row antialiased relative ${
        isFullScreenView ? 'h-screen overflow-hidden' : ''
      }`}
    >
      {/* Sidebar for tablets and desktop (hidden on full screen room / chat) */}
      {!isFullScreenView && <DesktopNav />}

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 relative ${
          isFullScreenView ? 'h-screen overflow-hidden' : 'min-h-screen'
        }`}
      >
        {!isFullScreenView && <Header />}

        <main
          className={`flex-1 min-w-0 w-full overflow-x-hidden ${
            isFullScreenView ? 'h-full overflow-hidden' : ''
          }`}
        >
          {renderScreen()}
        </main>

        <BottomNav />
      </div>

      {/* Global Modals */}
      <CreateRoomModal />
      <JoinRoomModal />
      <MembersModal />

      {/* Global Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-purple-600/90 text-white font-medium text-xs shadow-2xl backdrop-blur-md border border-purple-400/40 animate-in fade-in slide-in-from-bottom-3 duration-200">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <MainApp />
      </AppProvider>
    </AuthProvider>
  );
}

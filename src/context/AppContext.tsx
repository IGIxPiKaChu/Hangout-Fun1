import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import type { ScreenType, Room, User, UserSettings, CallSession, PresenceInfo } from '../types/index.ts';
import { useAuth } from './AuthContext.tsx';
import { api } from '../services/api.ts';
import { threeTransitionFX } from '../lib/threeTransitionFX.ts';
import { requestMediaStream, stopMediaStream, WebRTCCallManager } from '../services/webrtc.ts';
import { CallModal } from '../components/call/CallModal.tsx';
import { getTranslation } from '../i18n/index.ts';
import { soundManager } from '../services/sound.ts';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';
export type AccentColor = 'purple' | 'cyan' | 'emerald' | 'rose' | 'amber';
export type FontSize = 'sm' | 'md' | 'lg';

function resolveEffectiveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }
  return mode;
}

function applyThemeToDOM(
  resolved: ResolvedTheme,
  accent: AccentColor = 'purple',
  fontSize: FontSize = 'md',
  reduceMotion = false
) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  }
  root.setAttribute('data-accent', accent);
  root.setAttribute('data-font-size', fontSize);
  if (reduceMotion) {
    root.classList.add('reduce-motion');
  } else {
    root.classList.remove('reduce-motion');
  }
}

interface AppContextType {
  currentScreen: ScreenType;
  navigate: (screen: ScreenType, params?: { roomId?: string; userId?: string; conversationId?: string; targetUser?: User }) => void;
  goBack: () => void;
  canGoBack: boolean;

  // Selected entities
  selectedRoomId: string | null;
  selectedRoom: Room | null;
  selectedModalRoom: Room | null;
  setSelectedRoom: (room: Room | null) => void;
  selectedUserId: string | null;
  setSelectedUserId: (userId: string | null) => void;
  selectedConversationId: string | null;
  selectedConversationUser: User | null;

  // Modals
  isCreateRoomOpen: boolean;
  openCreateRoom: () => void;
  closeCreateRoom: () => void;

  isJoinRoomOpen: boolean;
  openJoinRoom: () => void;
  closeJoinRoom: () => void;

  isMembersModalOpen: boolean;
  openMembersModal: (room?: Room) => void;
  closeMembersModal: () => void;

  isEditProfileOpen: boolean;
  openEditProfile: () => void;
  closeEditProfile: () => void;

  // Badges
  unreadNotificationsCount: number;
  unreadChatsCount: number;
  refreshUnreadCounts: () => Promise<void>;

  // Global Toast / Feedback
  toastMessage: string | null;
  showToast: (msg: string) => void;

  // Settings Sub-Page navigation
  settingsSubPage: string | null;
  setSettingsSubPage: (page: string | null) => void;

  // Theme & Preferences
  appLanguage: string;
  setAppLanguage: (lang: string) => Promise<void>;
  t: (key: string, fallback?: string) => string;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  compactChat: boolean;
  setCompactChat: (compact: boolean) => void;
  reduceMotion: boolean;
  setReduceMotion: (reduce: boolean) => void;
  userSettings: UserSettings | null;
  updateAccountSettings: (settings: Partial<UserSettings>) => Promise<boolean>;
  isLoadingSettings: boolean;

  // Real Presence
  presenceMap: Record<string, PresenceInfo>;
  isUserOnline: (userId: string) => boolean;
  getUserLastSeen: (userId: string) => string | undefined;

  // WebRTC 1-to-1 Calling
  activeCall: CallSession | null;
  incomingCall: CallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMicMuted: boolean;
  isVideoMuted: boolean;
  callError: string | null;
  isLocalScreenSharing: boolean;
  isPeerScreenSharing: boolean;
  localScreenStream: MediaStream | null;
  hasScreenAudio: boolean;
  startCall: (recipientId: string, type?: 'audio' | 'video') => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  declineIncomingCall: () => Promise<void>;
  endActiveCall: (reason?: string) => Promise<void>;
  toggleCallMic: () => void;
  toggleCallVideo: () => void;
  startCallScreenShare: () => Promise<boolean>;
  stopCallScreenShare: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [historyStack, setHistoryStack] = useState<ScreenType[]>([]);
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('welcome');

  // Real Presence state
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});

  // WebRTC Call state
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isLocalScreenSharing, setIsLocalScreenSharing] = useState(false);
  const [isPeerScreenSharing, setIsPeerScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [hasScreenAudio, setHasScreenAudio] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const callManagerRef = useRef<WebRTCCallManager | null>(null);
  const activeCallRef = useRef<CallSession | null>(null);
  activeCallRef.current = activeCall;
  const incomingCallRef = useRef<CallSession | null>(null);
  incomingCallRef.current = incomingCall;

  // Device & Account preferences state
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('vibesphere_theme_mode');
      if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
      try {
        const raw = localStorage.getItem('vibesphere_user_pref_v2');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (['dark', 'light', 'system'].includes(parsed.themeMode)) return parsed.themeMode;
        }
      } catch {}
    }
    return 'dark';
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveEffectiveTheme(themeMode));

  const [accentColor, setAccentColorState] = useState<AccentColor>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('vibesphere_accent_color');
      if (stored && ['purple', 'cyan', 'emerald', 'rose', 'amber'].includes(stored)) {
        return stored as AccentColor;
      }
    }
    return 'purple';
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('vibesphere_font_size');
      if (stored && ['sm', 'md', 'lg'].includes(stored)) return stored as FontSize;
    }
    return 'md';
  });

  const [compactChat, setCompactChatState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('vibesphere_compact_chat') === 'true';
    }
    return false;
  });

  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('vibesphere_reduce_motion') === 'true';
    }
    return false;
  });

  const [appLanguage, setAppLanguageState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('vibesphere_app_language');
      if (stored) return stored;
    }
    return 'en';
  });

  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(false);

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedConversationUser, setSelectedConversationUser] = useState<User | null>(null);

  // Modals
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [isJoinRoomOpen, setIsJoinRoomOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  // Badges
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const [unreadChatsCount, setUnreadChatsCount] = useState<number>(0);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Settings Sub-Page state
  const [settingsSubPage, setSettingsSubPage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // When auth state changes, set initial screen
  useEffect(() => {
    if (currentUser) {
      if (currentScreen === 'welcome' || currentScreen === 'login' || currentScreen === 'signup') {
        setCurrentScreen('home');
        setHistoryStack([]);
      }
    } else {
      if (currentScreen !== 'login' && currentScreen !== 'signup') {
        setCurrentScreen('welcome');
        setHistoryStack([]);
      }
    }
  }, [currentUser]);

  // Handle browser / Android back button
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // If modal is open, close modal first
      if (isCreateRoomOpen) {
        setIsCreateRoomOpen(false);
        return;
      }
      if (isJoinRoomOpen) {
        setIsJoinRoomOpen(false);
        return;
      }
      if (isMembersModalOpen) {
        setIsMembersModalOpen(false);
        return;
      }
      if (isEditProfileOpen) {
        setIsEditProfileOpen(false);
        return;
      }

      setHistoryStack((prev) => {
        if (prev.length > 0) {
          const next = [...prev];
          const previousScreen = next.pop()!;
          setCurrentScreen(previousScreen);
          return next;
        }
        return prev;
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isCreateRoomOpen, isJoinRoomOpen, isMembersModalOpen, isEditProfileOpen]);

  const navigate = useCallback(
    (
      screen: ScreenType,
      params?: {
        roomId?: string;
        userId?: string;
        conversationId?: string;
        targetUser?: User;
      },
    ) => {
      if (params?.roomId) {
        setSelectedRoomId(params.roomId);
        if (selectedRoom?.id !== params.roomId) {
          api.getRoom(params.roomId).then((res) => setSelectedRoom(res.room)).catch(() => {});
        }
      }
      if (params?.userId) {
        setSelectedUserId(params.userId);
      }
      if (params?.conversationId) {
        setSelectedConversationId(params.conversationId);
      }
      if (params?.targetUser) {
        setSelectedConversationUser(params.targetUser);
      }

      setHistoryStack((prev) => [...prev, currentScreen]);
      threeTransitionFX.triggerTransition();
      setCurrentScreen(screen);
      window.history.pushState({ screen }, '');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [currentScreen, selectedRoom],
  );

  const goBack = useCallback(() => {
    threeTransitionFX.triggerTransition();
    // Check if in a settings sub-page first
    if (currentScreen === 'settings' && settingsSubPage) {
      setSettingsSubPage(null);
      return;
    }

    // Check modals next
    if (isCreateRoomOpen) {
      setIsCreateRoomOpen(false);
      return;
    }
    if (isJoinRoomOpen) {
      setIsJoinRoomOpen(false);
      return;
    }
    if (isMembersModalOpen) {
      setIsMembersModalOpen(false);
      return;
    }
    if (isEditProfileOpen) {
      setIsEditProfileOpen(false);
      return;
    }

    if (historyStack.length > 0) {
      setHistoryStack((prev) => {
        const next = [...prev];
        const previousScreen = next.pop()!;
        setCurrentScreen(previousScreen);
        return next;
      });
    } else {
      // Default fallback
      if (currentScreen === 'room-view' || currentScreen === 'room-details') {
        setCurrentScreen('rooms');
      } else if (currentScreen === 'direct-chat') {
        setCurrentScreen('chats');
      } else if (currentScreen === 'other-profile' || currentScreen === 'settings' || currentScreen === 'friends' || currentScreen === 'my-rooms') {
        setCurrentScreen('profile');
      } else {
        setCurrentScreen('home');
      }
    }
  }, [historyStack, isCreateRoomOpen, isJoinRoomOpen, isMembersModalOpen, isEditProfileOpen, currentScreen, settingsSubPage]);

  const refreshUnreadCounts = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [notifRes, chatRes] = await Promise.all([
        api.getNotifications(),
        api.getConversations(),
      ]);
      const unreadNotifs = typeof notifRes.unreadCount === 'number'
        ? notifRes.unreadCount
        : notifRes.notifications.filter((n) => !n.isRead).length;
      setUnreadNotificationsCount(unreadNotifs);

      // Total unread chat count
      let unreadChats = 0;
      chatRes.conversations.forEach((c) => {
        if (c.unreadCount) unreadChats += c.unreadCount;
      });
      setUnreadChatsCount(unreadChats);
    } catch (err) {
      console.warn('Failed to refresh unread counts:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      refreshUnreadCounts();
    }
  }, [currentUser, refreshUnreadCounts]);

  const cleanupCall = useCallback(() => {
    if (callManagerRef.current) {
      callManagerRef.current.destroy();
      callManagerRef.current = null;
    }
    stopMediaStream(localStream);
    stopMediaStream(localScreenStream);
    setLocalStream(null);
    setLocalScreenStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setIncomingCall(null);
    setIsMicMuted(false);
    setIsVideoMuted(false);
    setIsLocalScreenSharing(false);
    setIsPeerScreenSharing(false);
    setHasScreenAudio(false);
    setCallError(null);
  }, [localStream, localScreenStream]);

  const startCall = useCallback(
    async (recipientId: string, type: 'audio' | 'video' = 'audio') => {
      try {
        setCallError(null);
        // Request genuine device permissions
        const { stream, error } = await requestMediaStream({ audio: true, video: type === 'video' });
        if (error || !stream) {
          showToast(error || 'Microphone/Camera permission required.');
          setCallError(error || 'Permission denied.');
          return;
        }
        setLocalStream(stream);

        // Initiate call on server
        const res = await api.initiateCall(recipientId, type);
        setActiveCall(res.call);

        // WebRTC Call Manager setup
        const manager = new WebRTCCallManager(res.call.id, true, {
          onRemoteStream: (remStream) => {
            setRemoteStream(remStream);
          },
          onConnectionStateChange: (state) => {
            if (state === 'connected') {
              setActiveCall((prev) => (prev ? { ...prev, status: 'connected', connectedAt: Date.now() } : null));
            } else if (state === 'failed' || state === 'disconnected') {
              setCallError('Call connection lost.');
            }
          },
          onError: (err) => {
            setCallError(err);
            showToast(err);
          },
          onEnded: () => {
            cleanupCall();
          },
          onLocalScreenShareChange: (isSharing, scrStream, hasAudioVal) => {
            setIsLocalScreenSharing(isSharing);
            setLocalScreenStream(scrStream);
            setHasScreenAudio(Boolean(hasAudioVal));
          },
          onPeerScreenShareChange: (isSharing) => {
            setIsPeerScreenSharing(isSharing);
          },
        });

        callManagerRef.current = manager;
        await manager.initialize(stream);
      } catch (err: any) {
        console.error('Failed to initiate call:', err);
        const msg = err?.message || 'Failed to start call';
        showToast(msg);
        setCallError(msg);
        cleanupCall();
      }
    },
    [cleanupCall, showToast],
  );

  const acceptIncomingCall = useCallback(async () => {
    const callToAccept = incomingCallRef.current;
    if (!callToAccept) return;
    try {
      setCallError(null);
      const { stream, error } = await requestMediaStream({ audio: true, video: callToAccept.type === 'video' });
      if (error || !stream) {
        showToast(error || 'Media permission required.');
        await api.respondToCall(callToAccept.id, 'decline');
        setIncomingCall(null);
        return;
      }
      setLocalStream(stream);

      await api.respondToCall(callToAccept.id, 'accept');
      setActiveCall({ ...callToAccept, status: 'connecting' });
      const currentCallId = callToAccept.id;
      setIncomingCall(null);

      const manager = new WebRTCCallManager(currentCallId, false, {
        onRemoteStream: (remStream) => {
          setRemoteStream(remStream);
        },
        onConnectionStateChange: (state) => {
          if (state === 'connected') {
            setActiveCall((prev) => (prev ? { ...prev, status: 'connected', connectedAt: Date.now() } : null));
          } else if (state === 'failed' || state === 'disconnected') {
            setCallError('Call connection lost.');
          }
        },
        onError: (err) => {
          setCallError(err);
          showToast(err);
        },
        onEnded: () => {
          cleanupCall();
        },
        onLocalScreenShareChange: (isSharing, scrStream, hasAudioVal) => {
          setIsLocalScreenSharing(isSharing);
          setLocalScreenStream(scrStream);
          setHasScreenAudio(Boolean(hasAudioVal));
        },
        onPeerScreenShareChange: (isSharing) => {
          setIsPeerScreenSharing(isSharing);
        },
      });

      callManagerRef.current = manager;
      await manager.initialize(stream);
    } catch (err: any) {
      console.error('Failed to accept call:', err);
      showToast(err?.message || 'Failed to accept call');
      cleanupCall();
    }
  }, [cleanupCall, showToast]);

  const declineIncomingCall = useCallback(async () => {
    const callToDecline = incomingCallRef.current;
    if (!callToDecline) return;
    try {
      await api.respondToCall(callToDecline.id, 'decline');
    } catch (e) {
      console.warn('Error declining call:', e);
    }
    setIncomingCall(null);
  }, []);

  const endActiveCall = useCallback(
    async (reason = 'hung_up') => {
      const callToEnd = activeCallRef.current;
      if (callToEnd) {
        try {
          await api.endCall(callToEnd.id, reason);
        } catch (e) {
          console.warn('Error ending call:', e);
        }
      }
      cleanupCall();
    },
    [cleanupCall],
  );

  const toggleCallMic = useCallback(() => {
    const next = !isMicMuted;
    setIsMicMuted(next);
    if (callManagerRef.current) {
      callManagerRef.current.toggleMicrophone(!next);
    }
  }, [isMicMuted]);

  const toggleCallVideo = useCallback(() => {
    const next = !isVideoMuted;
    setIsVideoMuted(next);
    if (callManagerRef.current) {
      callManagerRef.current.toggleCamera(!next);
    }
  }, [isVideoMuted]);

  const startCallScreenShare = useCallback(async (): Promise<boolean> => {
    if (!callManagerRef.current) {
      showToast('No active call connection to share screen.');
      return false;
    }
    setCallError(null);
    const res = await callManagerRef.current.startScreenShare();
    if (!res.success) {
      if (res.error) {
        showToast(res.error);
        setCallError(res.error);
      }
      return false;
    }
    return true;
  }, [showToast]);

  const stopCallScreenShare = useCallback(async (): Promise<void> => {
    if (callManagerRef.current) {
      await callManagerRef.current.stopScreenShare();
    }
  }, []);

  // Real presence helper methods
  const isUserOnline = useCallback(
    (userId: string): boolean => {
      if (!userId) return false;
      if (currentUser && userId === currentUser.id) return true;
      const p = presenceMap[userId];
      return Boolean(p && (p.isOnline || p.status === 'online' || p.status === 'away'));
    },
    [currentUser, presenceMap],
  );

  const getUserLastSeen = useCallback(
    (userId: string): string | undefined => {
      if (!userId) return undefined;
      return presenceMap[userId]?.lastSeen;
    },
    [presenceMap],
  );

  // Presence heartbeat & initial fetch
  useEffect(() => {
    if (!currentUser) {
      setPresenceMap({});
      return;
    }

    // Load initial presence map
    api
      .getPresence()
      .then((res) => {
        if (res && res.presence) {
          setPresenceMap(res.presence);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch initial presence:', err);
      });

    // Periodic heartbeat every 20 seconds
    const interval = setInterval(() => {
      const status = document.visibilityState === 'visible' ? 'online' : 'away';
      api.sendPresenceHeartbeat(status).catch(() => {});
    }, 20000);

    const handleVisibilityChange = () => {
      const status = document.visibilityState === 'visible' ? 'online' : 'away';
      api.sendPresenceHeartbeat(status).catch(() => {});
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser]);

  // Real-time notification, presence & WebRTC call SSE listener
  useEffect(() => {
    if (!currentUser) return;

    const cleanup = api.createNotificationStream({
      onUnreadCount: (data) => {
        if (typeof data.unreadCount === 'number') {
          setUnreadNotificationsCount(data.unreadCount);
        }
      },
      onNotification: (notif) => {
        refreshUnreadCounts();
        try {
          const pref = localStorage.getItem('hangout_user_settings');
          const parsed = pref ? JSON.parse(pref) : {};
          const isDnd = parsed.doNotDisturb ?? userSettings?.doNotDisturb;
          if (!isDnd && parsed.notificationsEnabled !== false) {
            let allowAlert = true;
            if (notif?.type === 'direct_message' && parsed.dmAlerts === false) allowAlert = false;
            if (notif?.type === 'invite' && parsed.roomInviteAlerts === false) allowAlert = false;
            if (notif?.type === 'friend_request' && parsed.friendRequestAlerts === false) allowAlert = false;

            if (allowAlert) {
              if (parsed.soundEffects !== false) {
                soundManager.playNotificationSound();
              }
              if (parsed.hapticFeedback && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                navigator.vibrate(20);
              }
              if (notif?.description) {
                showToast(notif.title ? `${notif.title}: ${notif.description}` : notif.description);
              }
            }
          }
        } catch {}
      },
      onPresenceUpdate: (data) => {
        setPresenceMap((prev) => ({
          ...prev,
          [data.userId]: {
            isOnline: data.isOnline,
            status: data.status || (data.isOnline ? 'online' : 'offline'),
            lastSeen: data.lastSeen,
          },
        }));
      },
      onIncomingCall: (call) => {
        setIncomingCall(call);
      },
      onCallAccepted: (data) => {
        const current = activeCallRef.current;
        if (current && current.id === data.callId) {
          setActiveCall((prev) => (prev ? { ...prev, status: 'connecting' } : null));
          if (callManagerRef.current) {
            callManagerRef.current.createAndSendOffer();
          }
        }
      },
      onCallDeclined: (data) => {
        const current = activeCallRef.current;
        if (current && current.id === data.callId) {
          showToast('Call was declined');
          cleanupCall();
        }
      },
      onCallSignal: (signal) => {
        const current = activeCallRef.current;
        if (current && current.id === signal.callId && callManagerRef.current) {
          if (signal.type === 'offer') {
            callManagerRef.current.handleIncomingOffer(signal.data);
          } else if (signal.type === 'answer') {
            callManagerRef.current.handleIncomingAnswer(signal.data);
            setActiveCall((prev) => (prev ? { ...prev, status: 'connected', connectedAt: Date.now() } : null));
          } else if (signal.type === 'ice-candidate') {
            callManagerRef.current.handleIncomingIceCandidate(signal.data);
          } else if (signal.type === 'screenshare-started') {
            setIsPeerScreenSharing(true);
            callManagerRef.current.handlePeerScreenShareSignal(true);
            showToast('Remote participant is sharing their screen');
          } else if (signal.type === 'screenshare-stopped') {
            setIsPeerScreenSharing(false);
            callManagerRef.current.handlePeerScreenShareSignal(false);
            showToast('Remote participant stopped sharing screen');
          }
        }
      },
      onCallEnded: (data) => {
        const current = activeCallRef.current;
        const incoming = incomingCallRef.current;
        if ((current && current.id === data.callId) || (incoming && incoming.id === data.callId)) {
          showToast(`Call ended${data.reason ? ` (${data.reason})` : ''}`);
          cleanupCall();
        }
      },
    });

    return () => {
      cleanup();
    };
  }, [currentUser, refreshUnreadCounts, showToast, cleanupCall]);

  // Apply theme to DOM whenever themeMode, accentColor, fontSize, or reduceMotion change
  useEffect(() => {
    const resolved = resolveEffectiveTheme(themeMode);
    setResolvedTheme(resolved);
    applyThemeToDOM(resolved, accentColor, fontSize, reduceMotion);
  }, [themeMode, accentColor, fontSize, reduceMotion]);

  // System theme dynamic change listener
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      if (themeMode === 'system') {
        const nextResolved: ResolvedTheme = e.matches ? 'dark' : 'light';
        setResolvedTheme(nextResolved);
        applyThemeToDOM(nextResolved, accentColor, fontSize, reduceMotion);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    } else if ((mediaQuery as any).addListener) {
      (mediaQuery as any).addListener(handleSystemThemeChange);
      return () => (mediaQuery as any).removeListener(handleSystemThemeChange);
    }
  }, [themeMode, accentColor, fontSize, reduceMotion]);

  // Load account-backed settings from authoritative backend when user is logged in
  useEffect(() => {
    if (!currentUser) {
      setUserSettings(null);
      return;
    }
    let isMounted = true;
    setIsLoadingSettings(true);

    api.getSettings(currentUser.id)
      .then((res) => {
        if (!isMounted) return;
        if (res.settings) {
          setUserSettings(res.settings);
          // If no local preference set by user on this device, align with account appearance
          const localStored = localStorage.getItem('vibesphere_theme_mode');
          if (!localStored && res.settings.appearance) {
            setThemeModeState(res.settings.appearance);
          }
          if (res.settings.language) {
            setAppLanguageState(res.settings.language);
            localStorage.setItem('vibesphere_app_language', res.settings.language);
            if (typeof document !== 'undefined') {
              document.documentElement.lang = res.settings.language;
            }
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to load user settings from backend:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingSettings(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const t = useCallback((key: string, fallback?: string): string => {
    return getTranslation(key, appLanguage, fallback);
  }, [appLanguage]);

  const setAppLanguage = useCallback(async (newLang: string) => {
    const langCode = (newLang || 'en').toLowerCase().trim();
    setAppLanguageState(langCode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibesphere_app_language', langCode);
      try {
        const raw = localStorage.getItem('vibesphere_user_pref_v2');
        const obj = raw ? JSON.parse(raw) : {};
        obj.language = langCode;
        localStorage.setItem('vibesphere_user_pref_v2', JSON.stringify(obj));
      } catch {}
      if (typeof document !== 'undefined') {
        document.documentElement.lang = langCode;
      }
    }

    if (currentUser) {
      try {
        const res = await api.updateSettings(currentUser.id, { language: langCode });
        if (res.settings) {
          setUserSettings(res.settings);
        }
      } catch (err) {
        console.warn('Failed to sync language to account settings:', err);
      }
    }
  }, [currentUser]);

  const setThemeMode = useCallback(async (newMode: ThemeMode) => {
    setThemeModeState(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibesphere_theme_mode', newMode);
      // Keep backward-compatible key updated
      try {
        const raw = localStorage.getItem('vibesphere_user_pref_v2');
        const obj = raw ? JSON.parse(raw) : {};
        obj.themeMode = newMode;
        localStorage.setItem('vibesphere_user_pref_v2', JSON.stringify(obj));
      } catch {}
    }

    const resolved = resolveEffectiveTheme(newMode);
    setResolvedTheme(resolved);
    applyThemeToDOM(resolved, accentColor, fontSize, reduceMotion);

    // Sync to backend if authenticated
    if (currentUser) {
      try {
        const res = await api.updateSettings(currentUser.id, { appearance: newMode });
        if (res.settings) {
          setUserSettings(res.settings);
        }
      } catch (err) {
        console.warn('Failed to sync theme preference to account:', err);
      }
    }
  }, [currentUser, accentColor, fontSize, reduceMotion]);

  const setAccentColor = useCallback((color: AccentColor) => {
    setAccentColorState(color);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibesphere_accent_color', color);
      try {
        const raw = localStorage.getItem('vibesphere_user_pref_v2');
        const obj = raw ? JSON.parse(raw) : {};
        obj.accentColor = color;
        localStorage.setItem('vibesphere_user_pref_v2', JSON.stringify(obj));
      } catch {}
    }
    applyThemeToDOM(resolvedTheme, color, fontSize, reduceMotion);
  }, [resolvedTheme, fontSize, reduceMotion]);

  const setFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibesphere_font_size', size);
      try {
        const raw = localStorage.getItem('vibesphere_user_pref_v2');
        const obj = raw ? JSON.parse(raw) : {};
        obj.fontSize = size;
        localStorage.setItem('vibesphere_user_pref_v2', JSON.stringify(obj));
      } catch {}
    }
    applyThemeToDOM(resolvedTheme, accentColor, size, reduceMotion);
  }, [resolvedTheme, accentColor, reduceMotion]);

  const setCompactChat = useCallback((compact: boolean) => {
    setCompactChatState(compact);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibesphere_compact_chat', compact ? 'true' : 'false');
      try {
        const raw = localStorage.getItem('vibesphere_user_pref_v2');
        const obj = raw ? JSON.parse(raw) : {};
        obj.compactChat = compact;
        localStorage.setItem('vibesphere_user_pref_v2', JSON.stringify(obj));
      } catch {}
    }
  }, []);

  const setReduceMotion = useCallback((reduce: boolean) => {
    setReduceMotionState(reduce);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibesphere_reduce_motion', reduce ? 'true' : 'false');
      try {
        const raw = localStorage.getItem('vibesphere_user_pref_v2');
        const obj = raw ? JSON.parse(raw) : {};
        obj.reduceMotion = reduce;
        localStorage.setItem('vibesphere_user_pref_v2', JSON.stringify(obj));
      } catch {}
    }
    applyThemeToDOM(resolvedTheme, accentColor, fontSize, reduce);
  }, [resolvedTheme, accentColor, fontSize]);

  const updateAccountSettings = useCallback(async (settingsToUpdate: Partial<UserSettings>): Promise<boolean> => {
    if (!currentUser) {
      showToast('You must be signed in to save settings.');
      return false;
    }
    try {
      const res = await api.updateSettings(currentUser.id, settingsToUpdate);
      if (res.settings) {
        setUserSettings(res.settings);
        if (settingsToUpdate.appearance) {
          setThemeModeState(settingsToUpdate.appearance);
          localStorage.setItem('vibesphere_theme_mode', settingsToUpdate.appearance);
        }
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Failed to update account settings:', err);
      showToast(err.message || 'Failed to save settings.');
      return false;
    }
  }, [currentUser, showToast]);

  return (
    <AppContext.Provider
      value={{
        currentScreen,
        navigate,
        goBack,
        canGoBack: historyStack.length > 0,
        selectedRoomId,
        selectedRoom,
        selectedModalRoom: selectedRoom,
        setSelectedRoom,
        selectedUserId,
        setSelectedUserId,
        selectedConversationId,
        selectedConversationUser,
        isCreateRoomOpen,
        openCreateRoom: () => setIsCreateRoomOpen(true),
        closeCreateRoom: () => setIsCreateRoomOpen(false),
        isJoinRoomOpen,
        openJoinRoom: () => setIsJoinRoomOpen(true),
        closeJoinRoom: () => setIsJoinRoomOpen(false),
        isMembersModalOpen,
        openMembersModal: (room?: Room) => {
          if (room) setSelectedRoom(room);
          setIsMembersModalOpen(true);
        },
        closeMembersModal: () => setIsMembersModalOpen(false),
        isEditProfileOpen,
        openEditProfile: () => setIsEditProfileOpen(true),
        closeEditProfile: () => setIsEditProfileOpen(false),
        unreadNotificationsCount,
        unreadChatsCount,
        refreshUnreadCounts,
        toastMessage,
        showToast,
        settingsSubPage,
        setSettingsSubPage,
        appLanguage,
        setAppLanguage,
        t,
        themeMode,
        resolvedTheme,
        setThemeMode,
        accentColor,
        setAccentColor,
        fontSize,
        setFontSize,
        compactChat,
        setCompactChat,
        reduceMotion,
        setReduceMotion,
        userSettings,
        updateAccountSettings,
        isLoadingSettings,
        presenceMap,
        isUserOnline,
        getUserLastSeen,
        activeCall,
        incomingCall,
        localStream,
        remoteStream,
        isMicMuted,
        isVideoMuted,
        callError,
        isLocalScreenSharing,
        isPeerScreenSharing,
        localScreenStream,
        hasScreenAudio,
        startCall,
        acceptIncomingCall,
        declineIncomingCall,
        endActiveCall,
        toggleCallMic,
        toggleCallVideo,
        startCallScreenShare,
        stopCallScreenShare,
      }}
    >
      {children}
      <CallModal
        activeCall={activeCall}
        incomingCall={incomingCall}
        localStream={localStream}
        remoteStream={remoteStream}
        isMicMuted={isMicMuted}
        isVideoMuted={isVideoMuted}
        callError={callError}
        isLocalScreenSharing={isLocalScreenSharing}
        isPeerScreenSharing={isPeerScreenSharing}
        localScreenStream={localScreenStream}
        hasScreenAudio={hasScreenAudio}
        onStartScreenShare={startCallScreenShare}
        onStopScreenShare={stopCallScreenShare}
        onAccept={acceptIncomingCall}
        onDecline={declineIncomingCall}
        onEndCall={endActiveCall}
        onToggleMic={toggleCallMic}
        onToggleVideo={toggleCallVideo}
        currentUserId={currentUser?.id}
      />
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

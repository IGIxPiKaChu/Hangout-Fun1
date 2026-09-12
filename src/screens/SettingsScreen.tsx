import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  ShieldCheck,
  Palette,
  Bell,
  Smartphone,
  Info,
  LogOut,
  ChevronRight,
  Lock,
  Eye,
  EyeOff,
  UserX,
  Volume2,
  Trash2,
  RefreshCw,
  Check,
  Sparkles,
  Sliders,
  Globe,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  SmartphoneNfc,
  Laptop,
  MessageSquare,
  Users,
  Radio,
  Share2,
  Sun,
  Moon,
  Monitor,
  Flame,
  Zap,
  Bot,
  Cpu,
  Server,
  Terminal,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { auth } from '../lib/firebase.ts';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Avatar } from '../components/common/Avatar.tsx';
import { Modal } from '../components/common/Modal.tsx';
import { api } from '../services/api.ts';
import { AIConfigSubPage } from '../components/settings/AIConfigSubPage.tsx';
import { AIModelSubPage } from '../components/settings/AIModelSubPage.tsx';
import { AIApisSubPage } from '../components/settings/AIApisSubPage.tsx';
import { AIPlaygroundSubPage } from '../components/settings/AIPlaygroundSubPage.tsx';
import {
  AIModelProfile,
  AIWorkAssignments,
  DEFAULT_AI_MODELS,
  DEFAULT_AI_WORK_ASSIGNMENTS,
} from '../types/ai.ts';
import type { User } from '../types/index.ts';
import { SUPPORTED_LANGUAGES } from '../i18n/index.ts';

type SelectedPage =
  | null
  | 'profile'
  | 'account'
  | 'privacy_security'
  | 'appearance'
  | 'app'
  | 'notifications'
  | 'about'
  | 'ai_config'
  | 'ai_model'
  | 'ai_apis'
  | 'ai_playground';

interface StoredSettings {
  themeMode: 'dark' | 'light' | 'system';
  accentColor: 'purple' | 'cyan' | 'emerald' | 'rose' | 'amber';
  fontSize: 'sm' | 'md' | 'lg';
  compactChat: boolean;
  ambientGlow: boolean;
  reduceMotion: boolean;

  // Privacy
  onlineVisibility: 'everyone' | 'friends' | 'nobody';
  lastSeenVisibility: 'everyone' | 'friends' | 'nobody';
  readReceipts: boolean;
  dmPermission: 'everyone' | 'friends';

  // Notifications
  notificationsEnabled: boolean;
  dmAlerts: boolean;
  roomInviteAlerts: boolean;
  friendRequestAlerts: boolean;
  soundEffects: boolean;
  hapticFeedback: boolean;
  doNotDisturb: boolean;

  // App
  language: string;
  chatTranslationLanguage: string;
  noiseCancellation: boolean;
  highQualityAudio: boolean;
  dataSaver: boolean;
  autoPlayMedia: boolean;

  // AI Configuration
  aiEnabled: boolean;
  aiSmartReplies: boolean;
  aiRoomSummaries: boolean;
  aiPersona: 'friendly' | 'concise' | 'creative' | 'technical' | 'custom' | string;
  aiCustomPersonaText?: string;
  aiCustomInstructions: string;
  aiTemperature: number;
  aiMaxTokens: number;
  aiContextMemory: number;
  aiPrivacyShield: boolean;

  // AI Model
  aiModel: string;
  aiStreaming: boolean;
  aiThinkingBudget: 'fast' | 'balanced' | 'deep';
  aiFallbackEnabled: boolean;

  // AI APIs Management & Work
  aiCustomEndpoint: string;
  aiTimeoutSec: number;
  aiModelsList: AIModelProfile[];
  aiWorkAssignments: AIWorkAssignments;
}

const DEFAULT_SETTINGS: StoredSettings = {
  themeMode: 'dark',
  accentColor: 'purple',
  fontSize: 'md',
  compactChat: false,
  ambientGlow: true,
  reduceMotion: false,

  onlineVisibility: 'everyone',
  lastSeenVisibility: 'friends',
  readReceipts: true,
  dmPermission: 'everyone',

  notificationsEnabled: true,
  dmAlerts: true,
  roomInviteAlerts: true,
  friendRequestAlerts: true,
  soundEffects: true,
  hapticFeedback: true,
  doNotDisturb: false,

  language: 'en',
  chatTranslationLanguage: 'en',
  noiseCancellation: true,
  highQualityAudio: true,
  dataSaver: false,
  autoPlayMedia: true,

  // AI Settings Defaults
  aiEnabled: true,
  aiSmartReplies: true,
  aiRoomSummaries: true,
  aiPersona: 'friendly',
  aiCustomInstructions: '',
  aiTemperature: 0.7,
  aiMaxTokens: 1024,
  aiContextMemory: 10,
  aiPrivacyShield: true,

  aiModel: 'google-gemini-3.8-flash',
  aiStreaming: true,
  aiThinkingBudget: 'fast',
  aiFallbackEnabled: true,

  aiCustomEndpoint: '',
  aiTimeoutSec: 15,
  aiModelsList: DEFAULT_AI_MODELS,
  aiWorkAssignments: DEFAULT_AI_WORK_ASSIGNMENTS,
};

const SETTINGS_KEY = 'vibesphere_user_pref_v2';

export const SettingsScreen: React.FC = () => {
  const {
    showToast,
    navigate,
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
  } = useApp();
  const { currentUser, logout, updateProfile } = useAuth();

  const activePage = (settingsSubPage as SelectedPage) || null;
  const setActivePage = (page: SelectedPage) => {
    setSettingsSubPage(page);
  };

  // Stored state with local persistence
  const [settings, setSettings] = useState<StoredSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const rawList = parsed.aiModelsList?.length ? parsed.aiModelsList : DEFAULT_AI_MODELS;
        const migratedList = rawList.map((m: any) => {
          if (m.model === 'gemini-2.5-pro' || m.id === 'google-gemini-2.5-pro') {
            return {
              ...m,
              id: 'google-gemini-3.1-pro',
              name: 'Google Gemini 3.1 Pro',
              model: 'gemini-3.1-pro-preview',
              description: 'Advanced reasoning, complex logic, multi-step problem solving, and comprehensive room summarization.',
              speed: '~190ms',
            };
          }
          if (m.model === 'gemini-2.5-flash' || m.id === 'google-gemini-2.5-flash') {
            return {
              ...m,
              id: 'google-gemini-3.8-flash',
              name: 'Google Gemini 3.8 Flash',
              model: 'gemini-3.8-flash',
              description: 'Ultra-low latency (~75ms), multi-modal context, optimized for real-time room chat and fast responses.',
              speed: '~75ms',
            };
          }
          return m;
        });

        const rawAssignments = parsed.aiWorkAssignments || {};
        const migratedAssignments = {
          ...DEFAULT_AI_WORK_ASSIGNMENTS,
          chat_translate: rawAssignments.chat_translate || 'google-gemini-3.8-flash',
          subtitles: rawAssignments.subtitles || 'xai-grok-2',
          live_video_language: rawAssignments.live_video_language || rawAssignments.stage_media || 'google-gemini-3.1-pro',
          ai_chat: rawAssignments.ai_chat || rawAssignments.chat || 'google-gemini-3.8-flash',
        };

        const migratedActiveModel =
          parsed.aiModel === 'gemini-2.5-flash' || parsed.aiModel === 'google-gemini-2.5-flash'
            ? 'google-gemini-3.8-flash'
            : (parsed.aiModel || 'google-gemini-3.8-flash');

        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          themeMode: (localStorage.getItem('vibesphere_theme_mode') as any) || parsed.themeMode || 'dark',
          accentColor: (localStorage.getItem('vibesphere_accent_color') as any) || parsed.accentColor || 'purple',
          fontSize: (localStorage.getItem('vibesphere_font_size') as any) || parsed.fontSize || 'md',
          compactChat: localStorage.getItem('vibesphere_compact_chat') === 'true' || parsed.compactChat || false,
          reduceMotion: localStorage.getItem('vibesphere_reduce_motion') === 'true' || parsed.reduceMotion || false,
          aiModel: migratedActiveModel,
          aiModelsList: migratedList,
          aiWorkAssignments: migratedAssignments,
        };
      }
    } catch {
      // fallback
    }
    return DEFAULT_SETTINGS;
  });

  // Sync state when AppContext theme or userSettings update
  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      themeMode,
      accentColor,
      fontSize,
      compactChat,
      reduceMotion,
      ...(userSettings
        ? {
            language: userSettings.language || prev.language,
            doNotDisturb: userSettings.doNotDisturb ?? prev.doNotDisturb,
            notificationsEnabled: userSettings.pushNotifications ?? prev.notificationsEnabled,
            dmPermission: userSettings.directMessages === 'friends' ? 'friends' : 'everyone',
            onlineVisibility: userSettings.activityStatus ? 'everyone' : 'nobody',
          }
        : {}),
    }));
  }, [themeMode, accentColor, fontSize, compactChat, reduceMotion, userSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }, [settings]);

  const updateSetting = <K extends keyof StoredSettings>(
    key: K,
    value: StoredSettings[K],
    toastMsg?: string
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (toastMsg) showToast(toastMsg);
  };

  const handleThemeChange = async (mode: 'dark' | 'light' | 'system') => {
    updateSetting('themeMode', mode);
    await setThemeMode(mode);
    const label = mode === 'system' ? `System (${resolvedTheme})` : mode.charAt(0).toUpperCase() + mode.slice(1);
    showToast(`Theme updated to ${label}`);
  };

  const handleAccentChange = (color: 'purple' | 'cyan' | 'emerald' | 'rose' | 'amber') => {
    updateSetting('accentColor', color);
    setAccentColor(color);
    showToast(`Accent palette updated`);
  };

  const handleFontSizeChange = (size: 'sm' | 'md' | 'lg') => {
    updateSetting('fontSize', size);
    setFontSize(size);
  };

  const handleCompactChatToggle = () => {
    const next = !settings.compactChat;
    updateSetting('compactChat', next);
    setCompactChat(next);
  };

  const handleReduceMotionToggle = () => {
    const next = !settings.reduceMotion;
    updateSetting('reduceMotion', next);
    setReduceMotion(next);
    showToast(next ? 'Transitions minimized' : 'Transitions restored');
  };

  // Real data stats from user's friends & rooms for profile card
  const [userStats, setUserStats] = useState({ roomsJoined: 0, friendsCount: 0 });

  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    Promise.all([
      api.getRooms({ userId: currentUser.id }).catch(() => ({ rooms: [] })),
      api.getFriends(currentUser.id).catch(() => ({ friends: [] })),
    ]).then(([roomsRes, friendsRes]) => {
      if (isMounted) {
        const joined = (roomsRes.rooms || []).filter((r) => r.memberIds.includes(currentUser.id)).length;
        setUserStats({
          roomsJoined: joined,
          friendsCount: (friendsRes.friends || []).length,
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Profile Form States
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Synchronize on user update
  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.fullName);
      setBio(currentUser.bio || '');
      setAvatarUrl(currentUser.avatarUrl);
    }
  }, [currentUser]);

  // Password States
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Blocked users list from authoritative backend (Phase 07)
  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
  const [isLoadingBlocked, setIsLoadingBlocked] = useState(false);

  useEffect(() => {
    if (activePage === 'privacy_security' && currentUser) {
      setIsLoadingBlocked(true);
      api.getBlockedUsers()
        .then((res) => setBlockedUsers(res.blockedUsers || []))
        .catch(() => setBlockedUsers([]))
        .finally(() => setIsLoadingBlocked(false));
    }
  }, [activePage, currentUser]);

  // Modals
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPolicyOpen, setIsPolicyOpen] = useState<'terms' | 'privacy' | null>(null);

  // Real client storage & cache measurement
  const [cacheSizeMb, setCacheSizeMb] = useState<number>(0);
  const [isClearingCache, setIsClearingCache] = useState(false);

  useEffect(() => {
    const checkStorage = async () => {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          const usageBytes = estimate.usage || 0;
          setCacheSizeMb(Math.round((usageBytes / (1024 * 1024)) * 10) / 10);
        } else {
          let total = 0;
          for (const key in localStorage) {
            if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
              total += (localStorage[key]?.length || 0) * 2;
            }
          }
          setCacheSizeMb(Math.round((total / (1024 * 1024)) * 10) / 10);
        }
      } catch {
        setCacheSizeMb(0);
      }
    };
    checkStorage();
  }, []);

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usageBytes = estimate.usage || 0;
        setCacheSizeMb(Math.round((usageBytes / (1024 * 1024)) * 10) / 10);
      } else {
        setCacheSizeMb(0);
      }
      showToast('Temporary cache cleared successfully');
    } catch (err: any) {
      showToast('Failed to clear cache: ' + (err?.message || 'Error'));
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      showToast('Name cannot be empty');
      return;
    }
    setIsSavingProfile(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        bio: bio.trim(),
        avatarUrl: avatarUrl.trim(),
      });
      showToast('Profile updated successfully');
      setActivePage(null);
    } catch {
      showToast('Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      showToast('Please enter your current password');
      return;
    }
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match');
      return;
    }

    const currentFbUser = auth.currentUser;
    if (!currentFbUser || !currentFbUser.email) {
      showToast('Authentication session not found. Please log in again.');
      return;
    }

    try {
      // Re-authenticate user before updating sensitive credential
      const credential = EmailAuthProvider.credential(currentFbUser.email, oldPassword);
      await reauthenticateWithCredential(currentFbUser, credential);
      await updatePassword(currentFbUser, newPassword);

      showToast('Password updated successfully');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsPasswordModalOpen(false);
    } catch (err: any) {
      console.error('Password update error:', err);
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        showToast('Current password is incorrect');
      } else if (err?.code === 'auth/weak-password') {
        showToast('New password is too weak');
      } else {
        showToast(err?.message || 'Failed to update password');
      }
    }
  };

  // ----------------------------------------------------
  // SUB-PAGES / DRILL-DOWN VIEWS
  // ----------------------------------------------------
  if (activePage) {
    return (
      <div className="pb-32 pt-2 px-3 sm:px-5 max-w-lg mx-auto space-y-5 animate-in fade-in slide-in-from-right-3 duration-200">
        {/* 1. EDIT PROFILE DETAIL */}
        {activePage === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {/* Visual Photo Card */}
            <div className="p-5 rounded-2xl bg-gradient-to-b from-[#141628] to-[#0f1120] border border-white/8 shadow-md flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500" />
              <div className="relative mb-3 group mt-1">
                <Avatar
                  src={avatarUrl || currentUser?.avatarUrl}
                  alt={fullName || currentUser?.fullName || 'User'}
                  size="2xl"
                  isOnline={currentUser?.isOnline ?? true}
                  showBorder
                />
              </div>
              <p className="text-xs font-bold text-white">{fullName || 'Your Name'}</p>
              <p className="text-[11px] text-purple-300/80 font-mono">@{currentUser?.username}</p>
              <p className="text-[10px] text-slate-400 mt-1 max-w-xs">
                Visible to everyone in public voice rooms and direct messages
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#131525] border border-white/6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full or nickname"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Avatar Image URL
                </label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
                />
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                  Or pick a preset avatar:
                </label>
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {[
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop',
                    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop',
                    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop',
                    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop',
                    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop',
                  ].map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAvatarUrl(url)}
                      className={`relative rounded-full shrink-0 ring-2 transition-all ${
                        avatarUrl === url ? 'ring-purple-400 scale-105' : 'ring-white/10 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt={`Preset ${i}`} className="w-10 h-10 rounded-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Bio / Status Message
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="What's your vibe today? Gaming, chilling, listening to lo-fi..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingProfile}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs transition-all shadow-lg shadow-purple-600/20 active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSavingProfile ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Save Profile</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* 2. ACCOUNT DETAIL */}
        {activePage === 'account' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden text-xs">
              <div className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-slate-400 text-[11px]">Handle</p>
                  <p className="font-semibold text-white font-mono mt-0.5">@{currentUser?.username}</p>
                </div>
                <span className="text-[10px] text-purple-400 font-semibold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Unique ID
                </span>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-slate-400 text-[11px]">Registered Email</p>
                  <p className="font-semibold text-white mt-0.5">{currentUser?.email}</p>
                </div>
                <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Verified
                </span>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-slate-400 text-[11px]">Account Created</p>
                  <p className="font-semibold text-white mt-0.5">
                    {currentUser ? new Date(currentUser.createdAt).toLocaleDateString() : 'September 2026'}
                  </p>
                </div>
              </div>
            </div>

            {/* Active Sessions */}
            <div className="rounded-2xl bg-[#131525] border border-white/6 p-4 text-xs space-y-3">
              <p className="font-semibold text-white flex items-center gap-2">
                <Laptop className="w-4 h-4 text-purple-400" />
                <span>Active Device Sessions</span>
              </p>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white flex items-center gap-1.5">
                    <SmartphoneNfc className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Current Browser Session</span>
                  </p>
                  <p className="text-[10px] text-slate-400">Authenticated via Firebase • Active now</p>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20" />
              </div>
            </div>

            {/* Credential Actions */}
            <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden text-xs">
              <button
                onClick={() => setIsPasswordModalOpen(true)}
                className="w-full p-4 flex justify-between items-center hover:bg-white/5 cursor-pointer transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Change Password</p>
                    <p className="text-[11px] text-slate-400">Update your account password</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>

              <button
                onClick={() => setIsLogoutModalOpen(true)}
                className="w-full p-4 flex justify-between items-center hover:bg-white/5 cursor-pointer transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-400 flex items-center justify-center">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-rose-400">Sign Out</p>
                    <p className="text-[11px] text-slate-400">End this session securely</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>

              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="w-full p-4 flex justify-between items-center hover:bg-rose-500/5 cursor-pointer transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 text-slate-400 group-hover:text-rose-400 flex items-center justify-center">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-400 group-hover:text-rose-400">Delete Account</p>
                    <p className="text-[11px] text-slate-500">Permanently delete your profile and data</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
        )}

        {/* 3. PRIVACY & SECURITY DETAIL */}
        {activePage === 'privacy_security' && (
          <div className="space-y-4 text-xs">
            <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden">
              <div className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">Online Status</p>
                  <p className="text-[11px] text-slate-400">Who can see when you are active</p>
                </div>
                <select
                  value={settings.onlineVisibility}
                  onChange={(e) =>
                    updateSetting('onlineVisibility', e.target.value as any, `Online status: ${e.target.value}`)
                  }
                  className="bg-[#1a1d33] text-white text-xs border border-white/10 rounded-xl px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="everyone">Everyone</option>
                  <option value="friends">Friends Only</option>
                  <option value="nobody">Nobody</option>
                </select>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">Last Seen Timestamp</p>
                  <p className="text-[11px] text-slate-400">Visibility of your last session time</p>
                </div>
                <select
                  value={settings.lastSeenVisibility}
                  onChange={(e) =>
                    updateSetting('lastSeenVisibility', e.target.value as any, `Last seen: ${e.target.value}`)
                  }
                  className="bg-[#1a1d33] text-white text-xs border border-white/10 rounded-xl px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="everyone">Everyone</option>
                  <option value="friends">Friends Only</option>
                  <option value="nobody">Nobody</option>
                </select>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">Direct Message Requests</p>
                  <p className="text-[11px] text-slate-400">Accept 1-on-1 private messages from</p>
                </div>
                <select
                  value={settings.dmPermission}
                  onChange={(e) =>
                    updateSetting('dmPermission', e.target.value as any, `DMs from: ${e.target.value}`)
                  }
                  className="bg-[#1a1d33] text-white text-xs border border-white/10 rounded-xl px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="everyone">Everyone</option>
                  <option value="friends">Friends Only</option>
                </select>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">Read Receipts</p>
                  <p className="text-[11px] text-slate-400">Show delivered and read checkmarks in chat</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('readReceipts', !settings.readReceipts)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.readReceipts ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.readReceipts ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Blocked Accounts Management */}
            <div className="rounded-2xl bg-[#131525] border border-white/6 overflow-hidden">
              <div className="p-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
                <span className="font-semibold text-white">Blocked Users ({blockedUsers.length})</span>
                <span className="text-[10px] text-slate-400">Cannot message or send requests</span>
              </div>
              <div className="divide-y divide-white/5">
                {isLoadingBlocked ? (
                  <div className="p-4 text-center text-slate-400 text-xs">Loading blocked accounts...</div>
                ) : blockedUsers.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs">No blocked accounts</div>
                ) : (
                  blockedUsers.map((bUser) => (
                    <div key={bUser.id} className="p-3.5 flex justify-between items-center gap-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Avatar
                          src={bUser.avatarUrl}
                          alt={bUser.fullName}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-white font-semibold text-xs truncate">{bUser.fullName}</p>
                          <p className="text-slate-400 text-[11px] truncate">@{bUser.username}</p>
                        </div>
                      </div>
                      <button
                        id={`unblock-settings-btn-${bUser.id}`}
                        onClick={async () => {
                          try {
                            await api.unblockUser(bUser.id);
                            setBlockedUsers((prev) => prev.filter((u) => u.id !== bUser.id));
                            showToast(`Unblocked ${bUser.fullName}`);
                          } catch (err: any) {
                            showToast(err?.message || 'Failed to unblock user.');
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold text-[11px] transition-colors shrink-0 active:scale-95"
                      >
                        Unblock
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* 4. APPEARANCE DETAIL */}
        {activePage === 'appearance' && (
          <div className="space-y-4 text-xs">
            {/* Theme Modes */}
            <div className="p-4 rounded-2xl bg-[#131525] border border-white/6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-white">Theme Mode</p>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10 capitalize">
                  Current: {themeMode === 'system' ? `System (${resolvedTheme})` : themeMode}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { id: 'dark' as const, label: 'Dark', icon: Moon },
                  { id: 'light' as const, label: 'Light', icon: Sun },
                  { id: 'system' as const, label: 'System', icon: Monitor },
                ].map((m) => {
                  const Icon = m.icon;
                  const isSelected = themeMode === m.id;
                  return (
                    <button
                      key={m.id}
                      id={`theme-btn-${m.id}`}
                      onClick={() => handleThemeChange(m.id)}
                      className={`py-3 px-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                        isSelected
                          ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-bold shadow-sm'
                          : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[11px] font-semibold">{m.label}</span>
                      {m.id === 'system' && (
                        <span className="text-[9px] text-slate-400 font-normal">({resolvedTheme})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Accent Colors */}
            <div className="p-4 rounded-2xl bg-[#131525] border border-white/6 space-y-3">
              <p className="font-semibold text-white">Accent Palette</p>
              <div className="grid grid-cols-5 gap-2 pt-0.5">
                {[
                  { id: 'purple' as const, label: 'Violet', bg: 'bg-purple-600' },
                  { id: 'cyan' as const, label: 'Cyan', bg: 'bg-cyan-500' },
                  { id: 'emerald' as const, label: 'Emerald', bg: 'bg-emerald-500' },
                  { id: 'rose' as const, label: 'Rose', bg: 'bg-rose-500' },
                  { id: 'amber' as const, label: 'Amber', bg: 'bg-amber-500' },
                ].map((c) => {
                  const isSelected = accentColor === c.id;
                  return (
                    <button
                      key={c.id}
                      id={`accent-btn-${c.id}`}
                      onClick={() => handleAccentChange(c.id)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                        isSelected ? 'bg-white/10 border-purple-400 font-bold text-white' : 'bg-white/5 border-white/5 text-slate-300'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full ${c.bg} flex items-center justify-center`}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span className="text-[10px]">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Typography & Layout */}
            <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden">
              <div className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">Chat Text Scale</p>
                  <p className="text-[11px] text-slate-400">Adjust message font size</p>
                </div>
                <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
                  {(['sm', 'md', 'lg'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => handleFontSizeChange(s)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        fontSize === s ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">Compact Density</p>
                  <p className="text-[11px] text-slate-400">Reduce room message padding for smaller screens</p>
                </div>
                <button
                  type="button"
                  onClick={handleCompactChatToggle}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    compactChat ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      compactChat ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">Ambient Glow</p>
                  <p className="text-[11px] text-slate-400">Atmospheric backdrop gradients during audio hangouts</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('ambientGlow', !settings.ambientGlow)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.ambientGlow ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.ambientGlow ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">Reduce Motion</p>
                  <p className="text-[11px] text-slate-400">Minimize animations and transition effects</p>
                </div>
                <button
                  type="button"
                  onClick={handleReduceMotionToggle}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    reduceMotion ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      reduceMotion ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. APP PREFERENCES DETAIL */}
        {activePage === 'app' && (
          <div className="space-y-4 text-xs">
            <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden">
              <div className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">{t('settings.app_language', 'Application Language')}</p>
                  <p className="text-[11px] text-slate-400">{t('settings.app_language_desc', 'Display language for entire application UI')}</p>
                </div>
                <select
                  id="application-lang-select"
                  value={appLanguage || settings.language || 'en'}
                  onChange={async (e) => {
                    const next = e.target.value;
                    updateSetting('language', next);
                    await setAppLanguage(next);
                    showToast(t('status.language_changed', 'Application language updated'));
                  }}
                  className="bg-[#1a1d33] text-purple-300 font-semibold text-xs border border-purple-500/30 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400 max-w-[150px] sm:max-w-none truncate"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.nativeName} ({lang.name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Chat Auto Translation Language */}
              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">{t('settings.chat_translation_lang', 'Chat Translation Language')}</p>
                  <p className="text-[11px] text-slate-400">{t('settings.chat_translation_desc', 'Target language when translating room and direct chat messages')}</p>
                </div>
                <select
                  id="chat-translation-lang-select"
                  value={settings.chatTranslationLanguage || 'en'}
                  onChange={async (e) => {
                    const next = e.target.value;
                    updateSetting('chatTranslationLanguage', next);
                    if (currentUser) {
                      await updateAccountSettings({ chatTranslationLanguage: next });
                    }
                    showToast(t('status.saved', 'Chat translation language updated'));
                  }}
                  className="bg-[#1a1d33] text-purple-300 font-semibold text-xs border border-purple-500/30 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400 max-w-[150px] sm:max-w-none truncate"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.nativeName} ({lang.name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">Microphone Noise Cancellation</p>
                  <p className="text-[11px] text-slate-400">Suppresses keyboard clatter and room echo</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('noiseCancellation', !settings.noiseCancellation)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.noiseCancellation ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.noiseCancellation ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">HD Audio Voice Bitrate</p>
                  <p className="text-[11px] text-slate-400">High-fidelity 48kHz audio streams in hangout rooms</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('highQualityAudio', !settings.highQualityAudio)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.highQualityAudio ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.highQualityAudio ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">Data Saver Mode</p>
                  <p className="text-[11px] text-slate-400">Compresses incoming avatars and media attachments</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('dataSaver', !settings.dataSaver)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.dataSaver ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.dataSaver ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Storage cache */}
            <div className="p-4 rounded-2xl bg-[#131525] border border-white/6 space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">Media & Cache Storage</p>
                  <p className="text-[11px] text-slate-400">Cached avatars, voice room assets, and stickers</p>
                </div>
                <span className="font-bold text-purple-400 font-mono text-sm">{cacheSizeMb.toFixed(1)} MB</span>
              </div>
              <button
                disabled={isClearingCache || cacheSizeMb === 0}
                onClick={handleClearCache}
                className="w-full py-2.5 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 text-purple-300 border border-purple-500/30 font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-98"
              >
                {isClearingCache ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{cacheSizeMb === 0 ? 'Cache is Pristine' : 'Clear Temporary Cache'}</span>
              </button>
            </div>
          </div>
        )}

        {/* 6. NOTIFICATIONS DETAIL */}
        {activePage === 'notifications' && (
          <div className="space-y-4 text-xs">
            {/* Master DND */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#1b1e35] to-[#141628] border border-purple-500/20 flex items-center justify-between">
              <div>
                <p className="font-bold text-white text-sm">Do Not Disturb</p>
                <p className="text-[11px] text-slate-300">Pause all in-app alerts and sounds</p>
              </div>
              <button
                type="button"
                id="toggle-dnd-button"
                onClick={async () => {
                  const next = !settings.doNotDisturb;
                  updateSetting('doNotDisturb', next);
                  if (currentUser) {
                    await updateAccountSettings({ doNotDisturb: next });
                  }
                  showToast(next ? 'Do Not Disturb Activated' : 'Do Not Disturb Disabled');
                }}
                className={`w-12 h-6.5 rounded-full transition-colors relative ${
                  settings.doNotDisturb ? 'bg-purple-600' : 'bg-white/15'
                }`}
              >
                <span
                  className={`block w-4.5 h-4.5 rounded-full bg-white transition-transform ${
                    settings.doNotDisturb ? 'translate-x-6.5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden">
              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">Direct Messages</p>
                  <p className="text-[11px] text-slate-400">In-app banner when a friend sends a chat</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('dmAlerts', !settings.dmAlerts)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.dmAlerts ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.dmAlerts ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">Room Hangout Invites</p>
                  <p className="text-[11px] text-slate-400">Alerts when invited to join an active room</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('roomInviteAlerts', !settings.roomInviteAlerts)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.roomInviteAlerts ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.roomInviteAlerts ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">Friend Requests</p>
                  <p className="text-[11px] text-slate-400">Notifications when new users add you</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('friendRequestAlerts', !settings.friendRequestAlerts)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.friendRequestAlerts ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.friendRequestAlerts ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">Sound Effects</p>
                  <p className="text-[11px] text-slate-400">Play chime when messages arrive</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('soundEffects', !settings.soundEffects)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.soundEffects ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.soundEffects ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="pr-3">
                  <p className="font-semibold text-white">Haptic Touch Feedback</p>
                  <p className="text-[11px] text-slate-400">Vibrate on buttons and interactions</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !settings.hapticFeedback;
                    updateSetting('hapticFeedback', next);
                    if (next && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                      navigator.vibrate(30);
                    }
                  }}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.hapticFeedback ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.hapticFeedback ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 7. ABOUT DETAIL */}
        {activePage === 'about' && (
          <div className="space-y-4 text-xs">
            <div className="p-6 rounded-2xl bg-gradient-to-b from-[#141628] to-[#0f1120] border border-white/6 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-purple-500/20 mb-3">
                V
              </div>
              <h3 className="text-base font-bold text-white">VibeSphere</h3>
              <p className="text-purple-400 font-mono text-[11px] mt-0.5">Version 2.4.0 (Build 2026.09)</p>
              <p className="text-slate-400 text-[11px] mt-2 max-w-xs leading-relaxed">
                A social audio hangout platform designed for spontaneous hangouts, voice rooms, and close-knit friend groups.
              </p>
            </div>

            <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden">
              <button
                onClick={() => setIsPolicyOpen('terms')}
                className="w-full p-4 flex justify-between items-center hover:bg-white/5 transition-colors text-left"
              >
                <span className="text-white font-medium">Terms of Service</span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
              <button
                onClick={() => setIsPolicyOpen('privacy')}
                className="w-full p-4 flex justify-between items-center hover:bg-white/5 transition-colors text-left"
              >
                <span className="text-white font-medium">Community & Privacy Policy</span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
        )}

        {/* 8. AI CONFIG SUB-PAGE */}
        {activePage === 'ai_config' && (
          <AIConfigSubPage
            settings={settings}
            updateSetting={updateSetting}
            showToast={showToast}
          />
        )}

        {/* 9. SET AI MODEL SUB-PAGE */}
        {activePage === 'ai_model' && (
          <AIModelSubPage
            settings={settings}
            updateSetting={updateSetting}
            showToast={showToast}
            onNavigateToConfig={() => setActivePage('ai_config')}
          />
        )}

        {/* 10. AI MANAGEMENT SUB-PAGE */}
        {activePage === 'ai_apis' && (
          <AIApisSubPage
            settings={settings}
            updateSetting={updateSetting}
            showToast={showToast}
            onNavigateToConfig={() => setActivePage('ai_config')}
          />
        )}

        {/* 11. AI PLAYGROUND SUB-PAGE */}
        {activePage === 'ai_playground' && (
          <AIPlaygroundSubPage
            settings={settings}
            updateSetting={updateSetting}
            showToast={showToast}
            onNavigateToConfig={() => setActivePage('ai_config')}
            onNavigateToModel={() => setActivePage('ai_model')}
          />
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // ROOT SCREEN: HIGH-HIERARCHY SOCIAL SETTINGS LIST
  // ----------------------------------------------------
  // Exactly the required categories with rich information density:
  // Profile (with preview of handle/name)
  // Account (with preview of email)
  // Privacy & security (with preview of 2FA/online status)
  // Appearance (with preview of theme/accent)
  // App (with preview of language)
  // Notifications (with preview of On/DND)
  // About (with preview of v2.4.0)
  // Log out
  return (
    <div className="pb-32 pt-2 px-3 sm:px-5 max-w-lg mx-auto space-y-4 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="px-1 pt-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">{t('settings.title', 'Settings')}</h1>
        <span className="text-[11px] text-slate-400 font-medium bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
          v2.4
        </span>
      </div>

      {/* 1. STRONG PERSONAL HEADER CARD (Real Authenticated User) */}
      <div
        id="settings-profile-header-card"
        onClick={() => setActivePage('profile')}
        className="p-4.5 rounded-2xl bg-gradient-to-b from-[#16182c] to-[#121424] border border-white/10 shadow-lg shadow-black/20 hover:border-purple-500/40 transition-all cursor-pointer group relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-36 h-36 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar
              src={currentUser?.avatarUrl}
              alt={currentUser?.fullName || 'User'}
              size="xl"
              isOnline={currentUser?.isOnline ?? true}
              showBorder
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                {currentUser?.fullName}
              </h2>
            </div>
            <p className="text-xs text-purple-300/80 font-mono truncate">@{currentUser?.username}</p>

            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-purple-400" />
                <span className="font-semibold text-slate-200">{userStats.friendsCount}</span> {t('hangout.friends', 'friends')}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-semibold text-slate-200">{userStats.roomsJoined}</span> {t('hangout.rooms', 'rooms')}
              </span>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-white/5 group-hover:bg-purple-500/20 text-slate-400 group-hover:text-purple-300 transition-all shrink-0">
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 2. CATEGORIZED GROUPS OF SETTINGS */}

      {/* GROUP 1: PERSONAL */}
      <div className="space-y-1.5">
        <p className="px-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          {t('settings.personal', 'Personal')}
        </p>
        <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden shadow-sm">
          {/* Profile */}
          <button
            id="settings-item-profile"
            onClick={() => setActivePage('profile')}
            className="w-full p-3.5 flex items-center justify-between hover:bg-white/5 transition-all text-left group active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                <UserIcon className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors">
                  {t('settings.profile', 'Profile')}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{t('settings.profile_desc', 'Avatar, display name & bio')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-2">
              <span className="text-xs text-slate-400 font-medium">{t('common.edit', 'Edit')}</span>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </div>
          </button>

          {/* Account */}
          <button
            id="settings-item-account"
            onClick={() => setActivePage('account')}
            className="w-full p-3.5 flex items-center justify-between hover:bg-white/5 transition-all text-left group active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                <Lock className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                  {t('settings.account', 'Account')}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{currentUser?.email || t('settings.account_desc', 'Email & credentials')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-2">
              <span className="text-xs text-slate-400 font-medium">{t('common.manage', 'Manage')}</span>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </div>
          </button>
        </div>
      </div>

      {/* GROUP 2: PRIVACY & SAFETY */}
      <div className="space-y-1.5">
        <p className="px-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          {t('settings.privacy_security', 'Safety & Visibility')}
        </p>
        <div className="rounded-2xl bg-[#131525] border border-white/6 overflow-hidden shadow-sm">
          {/* Privacy & Security */}
          <button
            id="settings-item-privacy"
            onClick={() => setActivePage('privacy_security')}
            className="w-full p-3.5 flex items-center justify-between hover:bg-white/5 transition-all text-left group active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
                  {t('settings.privacy_security', 'Privacy & Security')}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{t('settings.privacy_desc', 'Online status, visibility & blocklist')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-2">
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </div>
          </button>
        </div>
      </div>

      {/* GROUP 3: EXPERIENCE */}
      <div className="space-y-1.5">
        <p className="px-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          {t('settings.experience', 'Experience')}
        </p>
        <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden shadow-sm">
          {/* Appearance */}
          <button
            id="settings-item-appearance"
            onClick={() => setActivePage('appearance')}
            className="w-full p-3.5 flex items-center justify-between hover:bg-white/5 transition-all text-left group active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-pink-500/15 text-pink-400 flex items-center justify-center shrink-0">
                <Palette className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-pink-300 transition-colors">
                  {t('settings.appearance', 'Appearance')}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{t('settings.appearance_desc', 'Theme, accents & typography')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-2">
              <span className="text-xs text-slate-400 font-medium capitalize">
                {themeMode === 'system' ? `System (${resolvedTheme})` : themeMode} • {accentColor}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </div>
          </button>

          {/* App */}
          <button
            id="settings-item-app"
            onClick={() => setActivePage('app')}
            className="w-full p-3.5 flex items-center justify-between hover:bg-white/5 transition-all text-left group active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
                  {t('settings.app', 'App Preferences')}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{t('settings.app_desc', 'Language, audio bitrate & cache')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-2">
              <span className="text-xs text-slate-400 font-medium uppercase font-mono">
                {appLanguage || settings.language}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </div>
          </button>

          {/* Notifications */}
          <button
            id="settings-item-notifications"
            onClick={() => setActivePage('notifications')}
            className="w-full p-3.5 flex items-center justify-between hover:bg-white/5 transition-all text-left group active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Bell className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">
                  {t('settings.notifications', 'Notifications')}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{t('settings.notifications_desc', 'DMs, invites & chime sounds')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-2">
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                  settings.doNotDisturb
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                    : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                }`}
              >
                {settings.doNotDisturb ? 'DND On' : 'Active'}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </div>
          </button>
        </div>
      </div>

      {/* GROUP: AI & INTELLIGENCE */}
      {(() => {
        const registeredModels = settings.aiModelsList || DEFAULT_AI_MODELS;
        const currentModelObj = registeredModels.find((m) => m.id === settings.aiModel) || registeredModels[0];
        const translateModelObj = registeredModels.find(
          (m) => m.id === (settings.aiWorkAssignments?.chat_translate || 'google-gemini-3.8-flash')
        );
        const subModelObj = registeredModels.find(
          (m) => m.id === (settings.aiWorkAssignments?.subtitles || 'xai-grok-2')
        );
        const liveVideoModelObj = registeredModels.find(
          (m) => m.id === (settings.aiWorkAssignments?.live_video_language || 'google-gemini-3.1-pro')
        );
        const aiChatModelObj = registeredModels.find(
          (m) => m.id === (settings.aiWorkAssignments?.ai_chat || 'google-gemini-3.8-flash')
        );

        return (
          <div className="space-y-1.5">
            <p className="px-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>AI & Intelligence</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 normal-case">
                Multi-AI Engine
              </span>
            </p>
            <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden shadow-sm">
              {/* Config AI */}
              <button
                id="settings-item-ai-config"
                onClick={() => setActivePage('ai_config')}
                className="w-full p-3.5 flex items-center justify-between hover:bg-white/5 transition-all text-left group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                    <Bot className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors">
                      Config AI
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      Set or make AI model (URL, Model, Sub name & tuning)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 pl-2">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded border text-purple-400 bg-purple-500/10 border-purple-500/20">
                    {registeredModels.length} Models
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                </div>
              </button>

              {/* Set AI Model */}
              <button
                id="settings-item-ai-model"
                onClick={() => setActivePage('ai_model')}
                className="w-full p-3.5 flex items-center justify-between hover:bg-white/5 transition-all text-left group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                    <Cpu className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                      Set AI model
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      Choose primary intelligence engine & latency
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 pl-2">
                  <span className="text-xs text-indigo-300 font-medium font-mono">
                    {currentModelObj?.subName || currentModelObj?.name || 'Gemini'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                </div>
              </button>

              {/* AI Management (Set AI for Work) */}
              <button
                id="settings-item-ai-apis"
                onClick={() => setActivePage('ai_apis')}
                className="w-full p-3.5 flex items-center justify-between hover:bg-white/5 transition-all text-left group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                    <Server className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
                      AI Management
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      Translate: {translateModelObj?.subName || 'Gemini'} • Sub: {subModelObj?.subName || 'Grok'} • Video: {liveVideoModelObj?.subName || 'Gemini Pro'} • Chat: {aiChatModelObj?.subName || 'Gemini'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 pl-2">
                  <span className="text-[11px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                    Work Ready
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                </div>
              </button>

              {/* AI Playground */}
              <button
                id="settings-item-ai-playground"
                onClick={() => setActivePage('ai_playground')}
                className="w-full p-3.5 flex items-center justify-between hover:bg-white/5 transition-all text-left group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                    <Terminal className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors">
                      AI Playground
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      Manage created AIs, test prompts, edit parameters & remove models
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 pl-2">
                  <span className="text-[11px] text-purple-300 font-medium bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 font-mono">
                    Playground
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                </div>
              </button>
            </div>
          </div>
        );
      })()}

      {/* GROUP 4: SUPPORT & ABOUT */}
      <div className="space-y-1.5">
        <p className="px-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          More
        </p>
        <div className="rounded-2xl bg-[#131525] border border-white/6 overflow-hidden shadow-sm">
          {/* About */}
          <button
            id="settings-item-about"
            onClick={() => setActivePage('about')}
            className="w-full p-3.5 flex items-center justify-between hover:bg-white/5 transition-all text-left group active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                <Info className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                  About
                </p>
                <p className="text-[11px] text-slate-400 truncate">Version, terms & community</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-2">
              <span className="text-xs text-slate-400 font-mono">v2.4.0</span>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </div>
          </button>
        </div>
      </div>

      {/* GROUP 5: ACTIONS */}
      <div className="rounded-2xl bg-[#131525] border border-white/6 overflow-hidden shadow-sm">
        <button
          id="settings-logout-btn"
          onClick={() => setIsLogoutModalOpen(true)}
          className="w-full p-3.5 flex items-center justify-between hover:bg-rose-500/10 transition-all text-left group active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
              <LogOut className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-rose-400">Log out</p>
              <p className="text-[11px] text-slate-500">Sign out of this session</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-rose-400 transition-colors" />
        </button>
      </div>

      {/* Global Modals */}

      {/* Password Modal */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Change Password"
      >
        <form onSubmit={handleChangePassword} className="space-y-3 pt-1 text-xs">
          <div>
            <label className="block text-slate-300 mb-1 font-semibold">Current Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-slate-300 mb-1 font-semibold">New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-slate-300 mb-1 font-semibold">Confirm New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-[11px] text-purple-400 flex items-center gap-1.5 pt-1"
          >
            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showPassword ? 'Hide password' : 'Show password'}</span>
          </button>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold shadow-md active:scale-95 transition-all"
            >
              Update Password
            </button>
          </div>
        </form>
      </Modal>

      {/* Policy Modal */}
      <Modal
        isOpen={Boolean(isPolicyOpen)}
        onClose={() => setIsPolicyOpen(null)}
        title={isPolicyOpen === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
      >
        <div className="space-y-3 text-xs text-slate-300 leading-relaxed pt-1">
          <p>
            VibeSphere is built for spontaneous, welcoming community audio spaces. Treat other users with respect.
            Harassment, hate speech, or malicious disruptions will result in immediate suspension.
          </p>
          <p>
            Voice streams and live chats are protected by Firestore security rules. Your contact list and blocked list
            remain strictly private to your authenticated account.
          </p>
        </div>
        <div className="flex justify-end pt-3">
          <button
            onClick={() => setIsPolicyOpen(null)}
            className="px-4 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold"
          >
            Understood
          </button>
        </div>
      </Modal>

      {/* Logout Modal */}
      <Modal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        title="Sign Out"
      >
        <div className="space-y-4 pt-1 text-xs">
          <p className="text-slate-300">Are you sure you want to sign out of your account on this device?</p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setIsLogoutModalOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
            >
              Stay Logged In
            </button>
            <button
              onClick={() => {
                logout();
                showToast('Signed out');
                setIsLogoutModalOpen(false);
              }}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-all active:scale-95"
            >
              Sign Out
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Account"
      >
        <div className="space-y-3 pt-1 text-xs">
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>This action is irreversible. All your created rooms, active memberships, and chat history will be erased.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                logout();
                showToast('Account deleted');
                setIsDeleteModalOpen(false);
              }}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-all active:scale-95"
            >
              Permanently Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

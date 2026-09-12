import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  UserPlus,
  Check,
  Trash2,
  Sparkles,
  MessageSquare,
  Info,
  CheckCheck,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Clock,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { AppNotification } from '../types/index.ts';
import { EmptyState } from '../components/common/EmptyState.tsx';
import { Avatar } from '../components/common/Avatar.tsx';

type TabType = 'all' | 'mentions' | 'invites' | 'system';

export const NotificationsScreen: React.FC = () => {
  const { navigate, refreshUnreadCounts, showToast } = useApp();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchNotifications = useCallback(
    async (showLoadingSpinner = true) => {
      if (!currentUser) return;
      if (showLoadingSpinner) setIsLoading(true);
      try {
        const res = await api.getNotifications({
          type: activeTab === 'all' ? undefined : activeTab,
          limit: 50,
          offset: 0,
        });
        setNotifications(res.notifications);
        if (typeof res.unreadCount === 'number') {
          setUnreadCount(res.unreadCount);
        }
      } catch (err: any) {
        console.error('Failed to load notifications:', err);
        showToast(err?.message || 'Failed to load notifications.');
      } finally {
        if (showLoadingSpinner) setIsLoading(false);
      }
    },
    [currentUser, activeTab, showToast],
  );

  useEffect(() => {
    fetchNotifications(true);
  }, [fetchNotifications]);

  // Real-time notification updates for this screen
  useEffect(() => {
    if (!currentUser) return;

    const cleanup = api.createNotificationStream({
      onNotification: (newNotif) => {
        // Only append if it matches the current tab filter
        const matchesTab =
          activeTab === 'all' ||
          (activeTab === 'mentions' && (newNotif.type === 'mention' || newNotif.type === 'direct_message')) ||
          (activeTab === 'invites' && (newNotif.type === 'invite' || newNotif.type === 'friend_request')) ||
          (activeTab === 'system' && newNotif.type === 'system');

        if (matchesTab) {
          setNotifications((prev) => {
            const exists = prev.some((n) => n.id === newNotif.id);
            if (exists) {
              return prev.map((n) => (n.id === newNotif.id ? newNotif : n));
            }
            return [newNotif, ...prev];
          });
        }
      },
      onUnreadCount: (data) => {
        if (typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
      },
    });

    return () => {
      cleanup();
    };
  }, [currentUser, activeTab]);

  const handleMarkAllRead = async () => {
    if (!currentUser) return;
    try {
      await api.markAllNotificationsRead(currentUser.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      refreshUnreadCounts();
      showToast('All notifications marked as read.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to mark notifications as read.');
    }
  };

  const handleNotificationClick = async (n: AppNotification) => {
    if (!n.isRead) {
      try {
        await api.markNotificationRead(n.id);
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        refreshUnreadCounts();
      } catch (err) {
        console.error(err);
      }
    }

    if (n.type === 'invite' && n.targetRoomId) {
      navigate('room-details', { roomId: n.targetRoomId });
    } else if (n.type === 'friend_request' && n.actorId) {
      navigate('other-profile', { userId: n.actorId });
    } else if ((n.type === 'mention' || n.type === 'direct_message') && n.targetConversationId) {
      navigate('direct-chat', {
        conversationId: n.targetConversationId,
        userId: n.actorId,
      });
    } else if (n.actorId) {
      navigate('other-profile', { userId: n.actorId });
    }
  };

  const handleAcceptFriend = async (n: AppNotification, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser || !n.actorId) return;
    setActionLoadingId(n.id);
    try {
      await api.acceptFriendRequest(n.actorId, currentUser.id, n.id);
      showToast('Friend request accepted!');
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, status: 'accepted', isRead: true } : item,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      refreshUnreadCounts();
    } catch (err: any) {
      showToast(err?.message || 'Failed to accept request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeclineFriend = async (n: AppNotification, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser || !n.actorId) return;
    setActionLoadingId(n.id);
    try {
      await api.markNotificationRead(n.id);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, status: 'declined', isRead: true } : item,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      refreshUnreadCounts();
      showToast('Friend request declined.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to decline request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleJoinInvitedRoom = async (n: AppNotification, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser || !n.targetRoomId) return;
    setActionLoadingId(n.id);
    try {
      await api.joinRoom(n.targetRoomId, currentUser.id);
      if (!n.isRead) {
        await api.markNotificationRead(n.id);
      }
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, status: 'accepted', isRead: true } : item,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      refreshUnreadCounts();
      navigate('room-view', { roomId: n.targetRoomId });
    } catch (err: any) {
      showToast(err?.message || 'Failed to join room.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteNotification = async (n: AppNotification, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteNotification(n.id);
      setNotifications((prev) => prev.filter((item) => item.id !== n.id));
      if (!n.isRead) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
        refreshUnreadCounts();
      }
      showToast('Notification removed.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete notification.');
    }
  };

  const formatNotificationTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus className="w-4 h-4 text-emerald-400" />;
      case 'invite':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'mention':
      case 'direct_message':
        return <MessageSquare className="w-4 h-4 text-amber-400" />;
      case 'system':
      default:
        return <Bell className="w-4 h-4 text-slate-400" />;
    }
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'mentions', label: 'Mentions & DMs' },
    { id: 'invites', label: 'Invites & Friends' },
    { id: 'system', label: 'System' },
  ];

  return (
    <div id="notifications_screen" className="pb-28 pt-2 px-4 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold text-white tracking-tight">Notifications</h1>
          {unreadCount > 0 && (
            <span
              id="unread_notifications_badge"
              className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30"
            >
              {unreadCount} unread
            </span>
          )}
        </div>
        {notifications.some((n) => !n.isRead) && (
          <button
            id="mark_all_read_btn"
            onClick={handleMarkAllRead}
            className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-purple-950/30 transition-all"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {/* Tabs Filter */}
      <div
        id="notification_tabs"
        className="flex items-center gap-1 p-1 bg-[#121424] rounded-2xl border border-white/5 overflow-x-auto no-scrollbar"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`tab_${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-20 rounded-2xl bg-[#141628]/60 border border-white/5 animate-pulse flex items-center gap-3.5 px-4"
            >
              <div className="w-10 h-10 rounded-full bg-slate-800/60" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 bg-slate-800/60 rounded" />
                <div className="h-2.5 w-3/4 bg-slate-800/40 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={
            activeTab === 'all'
              ? 'All caught up!'
              : activeTab === 'mentions'
                ? 'No mentions yet'
                : activeTab === 'invites'
                  ? 'No invites or requests'
                  : 'No system updates'
          }
          description={
            activeTab === 'all'
              ? "You don't have any notifications right now. Room invites, friend requests, and direct messages will appear here."
              : 'Notifications in this category will appear here as real activity happens.'
          }
          className="mt-6"
        />
      ) : (
        <div id="notifications_list" className="space-y-2.5 pt-1">
          {notifications.map((n) => {
            const isProcessing = actionLoadingId === n.id;

            return (
              <div
                key={n.id}
                id={`notification_item_${n.id}`}
                onClick={() => handleNotificationClick(n)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 group relative ${
                  n.isRead
                    ? 'bg-[#121424]/70 border-white/5 opacity-85 hover:opacity-100 hover:border-white/10'
                    : 'bg-[#171a33] border-purple-500/30 shadow-md shadow-purple-950/20 hover:border-purple-500/50'
                }`}
              >
                {/* Avatar / Icon */}
                {n.actorAvatar ? (
                  <div className="relative shrink-0">
                    <Avatar src={n.actorAvatar} alt={n.actorName || 'User'} size="md" />
                    <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[#171a33] border border-white/10 shadow-sm">
                      {getIcon(n.type)}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      n.isRead
                        ? 'bg-slate-800/40 border-white/5'
                        : 'bg-purple-950/60 border-purple-500/30 text-purple-300'
                    }`}
                  >
                    {getIcon(n.type)}
                  </div>
                )}

                {/* Body */}
                <div className="flex-1 min-w-0 pr-6">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                      {n.title}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 shrink-0">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{formatNotificationTime(n.timestamp)}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 mt-1 leading-relaxed break-words">
                    {n.description}
                  </p>

                  {/* Friend Request Interactive Actions */}
                  {n.type === 'friend_request' && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {n.status === 'accepted' ? (
                        <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5 bg-emerald-950/30 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                          <Check className="w-3.5 h-3.5" />
                          <span>Friends</span>
                        </span>
                      ) : n.status === 'declined' ? (
                        <span className="text-[11px] font-medium text-slate-400 px-2.5 py-1 rounded-lg bg-white/5">
                          Declined
                        </span>
                      ) : (
                        <>
                          <button
                            id={`accept_friend_notif_${n.id}`}
                            disabled={isProcessing}
                            onClick={(e) => handleAcceptFriend(n, e)}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1 disabled:opacity-50"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Accept</span>
                          </button>
                          <button
                            id={`decline_friend_notif_${n.id}`}
                            disabled={isProcessing}
                            onClick={(e) => handleDeclineFriend(n, e)}
                            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-semibold transition-all disabled:opacity-50"
                          >
                            Decline
                          </button>
                          <button
                            id={`view_profile_notif_${n.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNotificationClick(n);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-purple-300 text-xs font-semibold transition-all flex items-center gap-1"
                          >
                            <span>Profile</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Room Invite Interactive Actions */}
                  {n.type === 'invite' && n.targetRoomId && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {n.status === 'accepted' ? (
                        <span className="text-[11px] font-semibold text-purple-300 flex items-center gap-1 bg-purple-950/40 px-2.5 py-1 rounded-lg border border-purple-500/20">
                          <Check className="w-3.5 h-3.5" />
                          <span>Joined Room</span>
                        </span>
                      ) : (
                        <>
                          <button
                            id={`join_room_notif_${n.id}`}
                            disabled={isProcessing}
                            onClick={(e) => handleJoinInvitedRoom(n, e)}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            <span>Join Room</span>
                          </button>
                          <button
                            id={`view_room_details_notif_${n.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNotificationClick(n);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-all"
                          >
                            View Details
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Mention / DM Direct Navigation Button */}
                  {(n.type === 'mention' || n.type === 'direct_message') && n.targetConversationId && (
                    <div className="mt-2.5">
                      <button
                        id={`open_dm_notif_${n.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNotificationClick(n);
                        }}
                        className="px-3 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[11px] font-semibold transition-all flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Reply in Chat</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Action Icons: Delete & Unread indicator */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  {!n.isRead && (
                    <span
                      id={`unread_dot_${n.id}`}
                      className="w-2 h-2 rounded-full bg-purple-500 shrink-0"
                      title="Unread"
                    />
                  )}
                  <button
                    id={`delete_notif_${n.id}`}
                    onClick={(e) => handleDeleteNotification(n, e)}
                    className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all"
                    title="Dismiss"
                    aria-label="Dismiss notification"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

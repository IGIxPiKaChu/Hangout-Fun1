import React, { useState, useEffect } from 'react';
import { Search, MessageSquare, Plus, Users, UserPlus, Check, CheckCheck } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { DirectConversation, User } from '../types/index.ts';
import { Avatar } from '../components/common/Avatar.tsx';
import { EmptyState } from '../components/common/EmptyState.tsx';

export const ChatsScreen: React.FC = () => {
  const { navigate, showToast, isUserOnline } = useApp();
  const { currentUser } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [conversations, setConversations] = useState<
    (DirectConversation & {
      otherUser?: User;
      isOtherUserTyping?: boolean;
      isBlocked?: boolean;
      unreadCount?: number;
    })[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadChats(showLoader = false) {
      if (!currentUser) return;
      if (showLoader) setIsLoading(true);
      try {
        const res = await api.getConversations(currentUser.id);
        if (isMounted) {
          setConversations(res.conversations);
        }
      } catch (err) {
        console.error('Failed to load conversations:', err);
      } finally {
        if (isMounted && showLoader) {
          setIsLoading(false);
        }
      }
    }

    loadChats(true);
    const interval = setInterval(() => loadChats(false), 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser]);

  const handleOpenNewChatModal = async () => {
    try {
      const res = await api.getFriends().catch(() => ({ friends: [] }));
      setAllUsers(Array.isArray(res?.friends) ? res.friends : []);
      setShowNewChatModal(true);
    } catch {
      setAllUsers([]);
      setShowNewChatModal(true);
    }
  };

  const handleStartConversation = async (targetUser: User) => {
    if (!currentUser) return;
    try {
      const res = await api.getOrCreateConversation(currentUser.id, targetUser.id);
      setShowNewChatModal(false);
      navigate('direct-chat', {
        conversationId: res.conversation.id,
        targetUser,
      });
    } catch (err: any) {
      showToast(err?.message || 'Failed to start conversation.');
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const name = c.otherUser?.fullName || '';
    const lastMsg = c.lastMessage?.content || '';
    const q = searchQuery.toLowerCase();
    return name.toLowerCase().includes(q) || lastMsg.toLowerCase().includes(q);
  });

  return (
    <div className="pb-24 pt-2 px-4 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h1 className="text-xl font-bold text-white tracking-tight">Chats</h1>
        <button
          onClick={handleOpenNewChatModal}
          className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          id="chats-search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#141628] border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
        />
      </div>

      {/* Conversations List */}
      {isLoading ? (
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-18 rounded-2xl bg-[#141628]/60 border border-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : filteredConversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={searchQuery ? 'No conversations found' : 'No messages yet'}
          description="Connect with friends or members from hangout rooms to start a direct chat."
          actionText="Start a Chat"
          onAction={handleOpenNewChatModal}
          className="mt-6"
        />
      ) : (
        <div className="space-y-2 pt-1">
          {filteredConversations.map((conv) => {
            const other = conv.otherUser;
            if (!other) return null;

            return (
              <div
                key={conv.id}
                onClick={() =>
                  navigate('direct-chat', {
                    conversationId: conv.id,
                    targetUser: other,
                  })
                }
                className="p-3.5 rounded-2xl bg-[#141628] border border-white/5 hover:border-purple-500/30 cursor-pointer transition-all flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <Avatar
                    src={other.avatarUrl}
                    alt={other.fullName}
                    size="md"
                    isOnline={isUserOnline(other.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white truncate group-hover:text-purple-300 transition-colors">
                        {other.fullName}
                      </h3>
                      {conv.isBlocked && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-950/60 text-rose-400 border border-rose-500/20 font-medium">
                          Blocked
                        </span>
                      )}
                    </div>
                    {conv.isOtherUserTyping ? (
                      <p className="text-xs text-purple-400 font-medium truncate mt-0.5 flex items-center gap-1.5 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block animate-ping" />
                        <span>typing...</span>
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 truncate mt-0.5 flex items-center gap-1">
                        {conv.lastMessage?.senderId === currentUser?.id && (
                          <span className="shrink-0">
                            {conv.lastMessage?.read ? (
                              <CheckCheck className="w-3.5 h-3.5 text-cyan-400 inline" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-slate-400 inline" />
                            )}
                          </span>
                        )}
                        <span className="truncate">{conv.lastMessage?.content || 'No messages yet.'}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-[11px] text-slate-400">
                    {conv.lastMessage?.timestamp
                      ? new Date(conv.lastMessage.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </span>
                  {conv.unreadCount && conv.unreadCount > 0 ? (
                    <span className="min-w-4 h-4 px-1 rounded-full bg-purple-600 text-[10px] font-bold text-white flex items-center justify-center shadow-sm shadow-purple-950">
                      {conv.unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Chat Modal: Select User */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-[#141628] border border-purple-500/30 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                Start a New Chat
              </h3>
              <button
                onClick={() => {
                  setShowNewChatModal(false);
                  setModalSearchQuery('');
                }}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            {/* Modal search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={modalSearchQuery}
                onChange={(e) => setModalSearchQuery(e.target.value)}
                placeholder="Search by name or @username..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#0e101d] border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1">
              {allUsers.length === 0 ? (
                <div className="text-center py-6 px-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-2.5 text-purple-400">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-200">No friends added yet</p>
                  <p className="text-[11px] text-slate-400 mt-1 mb-3">
                    You can only direct message mutual friends. Add friends to start chatting.
                  </p>
                  <button
                    onClick={() => {
                      setShowNewChatModal(false);
                      navigate('friends');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md shadow-purple-900/30 transition-all active:scale-95"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Find Friends</span>
                  </button>
                </div>
              ) : allUsers.filter((u) => {
                if (!modalSearchQuery.trim()) return true;
                const q = modalSearchQuery.toLowerCase();
                return u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
              }).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  No matching friends found.
                </p>
              ) : (
                allUsers
                  .filter((u) => {
                    if (!modalSearchQuery.trim()) return true;
                    const q = modalSearchQuery.toLowerCase();
                    return u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
                  })
                  .map((user) => {
                    const isFriend = currentUser?.friends?.includes(user.id);
                    const isBlocked = currentUser?.blockedUsers?.includes(user.id);
                    return (
                      <div
                        key={user.id}
                        onClick={() => {
                          setModalSearchQuery('');
                          handleStartConversation(user);
                        }}
                        className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3 truncate min-w-0">
                          <Avatar
                            src={user.avatarUrl}
                            alt={user.fullName}
                            size="sm"
                            isOnline={isUserOnline(user.id)}
                          />
                          <div className="truncate">
                            <p className="text-xs font-semibold text-white truncate">{user.fullName}</p>
                            <p className="text-[10px] text-slate-400 truncate">@{user.username}</p>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5 ml-2">
                          {isBlocked ? (
                            <span className="text-[10px] text-rose-400 bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-500/20">
                              Blocked
                            </span>
                          ) : isFriend ? (
                            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              Friend
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  UserPlus,
  MessageSquare,
  Trash2,
  Users,
  Check,
  X,
  Clock,
  ShieldAlert,
  UserCheck,
  AlertTriangle,
  Phone,
  Video,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { User, FriendRequest } from '../types/index.ts';
import { Avatar } from '../components/common/Avatar.tsx';
import { EmptyState } from '../components/common/EmptyState.tsx';

type TabType = 'friends' | 'requests' | 'find';

export const FriendsScreen: React.FC = () => {
  const { navigate, showToast, isUserOnline, startCall } = useApp();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('friends');
  const [friends, setFriends] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Action states to disable buttons during in-flight operations
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'remove' | 'block';
    targetUser: User | null;
  }>({
    isOpen: false,
    type: 'remove',
    targetUser: null,
  });

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const [friendsRes, requestsRes, usersRes] = await Promise.all([
        api.getFriends().catch(() => ({ friends: [] as User[] })),
        api.getFriendRequests().catch(() => ({ incoming: [] as FriendRequest[], outgoing: [] as FriendRequest[] })),
        api.getUsers().catch(() => ({ users: [] as User[] })),
      ]);
      setFriends(Array.isArray(friendsRes?.friends) ? friendsRes.friends : []);
      setIncomingRequests(Array.isArray(requestsRes?.incoming) ? requestsRes.incoming : []);
      setOutgoingRequests(Array.isArray(requestsRes?.outgoing) ? requestsRes.outgoing : []);
      setAllUsers((Array.isArray(usersRes?.users) ? usersRes.users : []).filter((u) => u.id !== currentUser.id));
    } catch (err) {
      console.error('Failed to load friends and social graph:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Send a new friend request
  const handleSendRequest = async (targetUser: User) => {
    if (!currentUser || actionLoadingId) return;
    setActionLoadingId(`send_${targetUser.id}`);
    try {
      const res = await api.sendFriendRequest(targetUser.id);
      if (res.relationship === 'friends') {
        // Mutual request was accepted immediately
        setFriends((prev) => [...prev, targetUser]);
        setIncomingRequests((prev) => prev.filter((r) => r.senderId !== targetUser.id));
        showToast(`You and ${targetUser.fullName} are now friends!`);
      } else {
        setOutgoingRequests((prev) => [...prev, res.request]);
        showToast(`Friend request sent to ${targetUser.fullName}`);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to send friend request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Accept an incoming request
  const handleAcceptRequest = async (request: FriendRequest) => {
    if (!currentUser || actionLoadingId) return;
    setActionLoadingId(`accept_${request.id}`);
    try {
      await api.acceptFriendRequest(request.id);
      await loadData();
      showToast(`Accepted friend request from ${request.senderName}!`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to accept request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reject an incoming request
  const handleRejectRequest = async (request: FriendRequest) => {
    if (!currentUser || actionLoadingId) return;
    setActionLoadingId(`reject_${request.id}`);
    try {
      await api.rejectFriendRequest(request.id);
      setIncomingRequests((prev) => prev.filter((r) => r.id !== request.id));
      showToast(`Declined request from ${request.senderName}.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to decline request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Cancel an outgoing request
  const handleCancelRequest = async (requestId: string) => {
    if (!currentUser || actionLoadingId) return;
    setActionLoadingId(`cancel_${requestId}`);
    try {
      await api.cancelFriendRequest(requestId);
      setOutgoingRequests((prev) => prev.filter((r) => r.id !== requestId));
      showToast('Friend request cancelled.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to cancel request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Remove a friend
  const handleConfirmRemove = async () => {
    const targetUser = confirmModal.targetUser;
    if (!currentUser || !targetUser) return;
    setActionLoadingId(`remove_${targetUser.id}`);
    setConfirmModal({ isOpen: false, type: 'remove', targetUser: null });
    try {
      await api.removeFriend(targetUser.id);
      setFriends((prev) => prev.filter((f) => f.id !== targetUser.id));
      showToast(`Removed ${targetUser.fullName} from friends.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to remove friend.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Block a user
  const handleConfirmBlock = async () => {
    const targetUser = confirmModal.targetUser;
    if (!currentUser || !targetUser) return;
    setActionLoadingId(`block_${targetUser.id}`);
    setConfirmModal({ isOpen: false, type: 'block', targetUser: null });
    try {
      await api.blockUser(targetUser.id);
      setFriends((prev) => prev.filter((f) => f.id !== targetUser.id));
      setIncomingRequests((prev) => prev.filter((r) => r.senderId !== targetUser.id));
      setOutgoingRequests((prev) => prev.filter((r) => r.receiverId !== targetUser.id));
      showToast(`Blocked ${targetUser.fullName}.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to block user.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStartChat = async (targetUser: User) => {
    if (!currentUser) return;
    try {
      const res = await api.getOrCreateConversation(currentUser.id, targetUser.id);
      navigate('direct-chat', {
        conversationId: res.conversation.id,
        targetUser,
      });
    } catch (err: any) {
      showToast(err?.message || 'Failed to open chat.');
    }
  };

  const totalRequestsCount = incomingRequests.length + outgoingRequests.length;

  // Filtered lists
  const filteredFriends = friends.filter(
    (f) =>
      f.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMembers = allUsers.filter(
    (u) =>
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="pb-24 pt-2 px-4 max-w-xl mx-auto space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#141628] border border-white/5">
        <button
          id="friends-tab-my-friends"
          onClick={() => setActiveTab('friends')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'friends'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Friends</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeTab === 'friends' ? 'bg-purple-800/60 text-white' : 'bg-white/5 text-slate-400'
            }`}
          >
            {friends.length}
          </span>
        </button>

        <button
          id="friends-tab-requests"
          onClick={() => setActiveTab('requests')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 relative ${
            activeTab === 'requests'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Requests</span>
          {totalRequestsCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-black font-black animate-pulse">
              {totalRequestsCount}
            </span>
          )}
        </button>

        <button
          id="friends-tab-find"
          onClick={() => setActiveTab('find')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'find'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Find Members
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          id="friends-search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            activeTab === 'friends'
              ? 'Search friends...'
              : activeTab === 'requests'
              ? 'Search pending requests...'
              : 'Search all members...'
          }
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#141628] border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500 transition-colors"
        />
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-2xl bg-[#141628]/60 animate-pulse" />
          ))}
        </div>
      ) : activeTab === 'friends' ? (
        /* FRIENDS TAB */
        filteredFriends.length === 0 ? (
          <EmptyState
            icon={Users}
            title={searchQuery ? 'No friends matched' : 'No friends yet'}
            description="Connect with members of the community to hang out and chat!"
            actionText="Discover Members"
            onAction={() => setActiveTab('find')}
            className="mt-6"
          />
        ) : (
          <div className="space-y-2 pt-1">
            {filteredFriends.map((friend) => (
              <div
                key={friend.id}
                id={`friend-card-${friend.id}`}
                className="p-3.5 rounded-2xl bg-[#141628] border border-white/5 flex items-center justify-between gap-3 hover:border-purple-500/20 transition-all"
              >
                <div
                  onClick={() => navigate('other-profile', { userId: friend.id })}
                  className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                >
                  <Avatar
                    src={friend.avatarUrl}
                    alt={friend.fullName}
                    size="md"
                    isOnline={isUserOnline(friend.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-white truncate">{friend.fullName}</h4>
                    <p className="text-[11px] text-slate-400 truncate">@{friend.username}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    id={`voice-call-friend-btn-${friend.id}`}
                    onClick={() => startCall(friend.id, 'audio')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-emerald-400 transition-all shrink-0"
                    title="Voice call"
                  >
                    <Phone className="w-4 h-4" />
                  </button>

                  <button
                    id={`video-call-friend-btn-${friend.id}`}
                    onClick={() => startCall(friend.id, 'video')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-purple-400 transition-all shrink-0"
                    title="Video call"
                  >
                    <Video className="w-4 h-4" />
                  </button>

                  <button
                    id={`chat-friend-btn-${friend.id}`}
                    onClick={() => handleStartChat(friend)}
                    className="p-2 rounded-xl bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white transition-all shrink-0"
                    title="Send message"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>

                  <button
                    id={`remove-friend-btn-${friend.id}`}
                    onClick={() =>
                      setConfirmModal({
                        isOpen: true,
                        type: 'remove',
                        targetUser: friend,
                      })
                    }
                    className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all shrink-0"
                    title="Remove friend"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : activeTab === 'requests' ? (
        /* REQUESTS TAB */
        <div className="space-y-6 pt-1">
          {/* Incoming Requests */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Incoming Requests ({incomingRequests.length})
              </h3>
            </div>

            {incomingRequests.length === 0 ? (
              <div className="p-5 rounded-2xl bg-[#141628]/60 border border-white/5 text-center text-xs text-slate-400">
                No incoming friend requests.
              </div>
            ) : (
              <div className="space-y-2">
                {incomingRequests.map((req) => (
                  <div
                    key={req.id}
                    id={`incoming-req-${req.id}`}
                    className="p-3.5 rounded-2xl bg-[#141628] border border-purple-500/20 flex items-center justify-between gap-3 shadow-md"
                  >
                    <div
                      onClick={() => navigate('other-profile', { userId: req.senderId })}
                      className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                    >
                      <Avatar
                        src={req.senderAvatar}
                        alt={req.senderName}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-white truncate">{req.senderName}</h4>
                        <p className="text-[11px] text-purple-300 truncate">@{req.senderUsername}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        id={`accept-req-btn-${req.id}`}
                        disabled={actionLoadingId === `accept_${req.id}`}
                        onClick={() => handleAcceptRequest(req)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept</span>
                      </button>

                      <button
                        id={`reject-req-btn-${req.id}`}
                        disabled={actionLoadingId === `reject_${req.id}`}
                        onClick={() => handleRejectRequest(req)}
                        className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-medium flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Decline</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outgoing / Sent Requests */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Sent Requests ({outgoingRequests.length})
              </h3>
            </div>

            {outgoingRequests.length === 0 ? (
              <div className="p-5 rounded-2xl bg-[#141628]/60 border border-white/5 text-center text-xs text-slate-400">
                No pending sent requests.
              </div>
            ) : (
              <div className="space-y-2">
                {outgoingRequests.map((req) => {
                  const targetUser = allUsers.find((u) => u.id === req.receiverId);
                  return (
                    <div
                      key={req.id}
                      id={`outgoing-req-${req.id}`}
                      className="p-3.5 rounded-2xl bg-[#141628] border border-white/5 flex items-center justify-between gap-3"
                    >
                      <div
                        onClick={() => navigate('other-profile', { userId: req.receiverId })}
                        className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                      >
                        <Avatar
                          src={targetUser?.avatarUrl || ''}
                          alt={targetUser?.fullName || 'User'}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-white truncate">
                            {targetUser?.fullName || 'User'}
                          </h4>
                          <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>Pending response</span>
                          </p>
                        </div>
                      </div>

                      <button
                        id={`cancel-req-btn-${req.id}`}
                        disabled={actionLoadingId === `cancel_${req.id}`}
                        onClick={() => handleCancelRequest(req.id)}
                        className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <span>Cancel</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* FIND MEMBERS TAB */
        filteredMembers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members found"
            description="No members matched your search query."
            className="mt-6"
          />
        ) : (
          <div className="space-y-2 pt-1">
            {filteredMembers.map((user) => {
              const isAlreadyFriend = friends.some((f) => f.id === user.id);
              const outgoingReq = outgoingRequests.find((r) => r.receiverId === user.id);
              const incomingReq = incomingRequests.find((r) => r.senderId === user.id);

              return (
                <div
                  key={user.id}
                  id={`member-card-${user.id}`}
                  className="p-3.5 rounded-2xl bg-[#141628] border border-white/5 flex items-center justify-between gap-3 hover:border-purple-500/20 transition-all"
                >
                  <div
                    onClick={() => navigate('other-profile', { userId: user.id })}
                    className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                  >
                    <Avatar
                      src={user.avatarUrl}
                      alt={user.fullName}
                      size="md"
                      isOnline={isUserOnline(user.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-white truncate">{user.fullName}</h4>
                      <p className="text-[11px] text-slate-400 truncate">@{user.username}</p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isAlreadyFriend ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Friends</span>
                      </span>
                    ) : outgoingReq ? (
                      <button
                        id={`cancel-member-req-${user.id}`}
                        disabled={actionLoadingId === `cancel_${outgoingReq.id}`}
                        onClick={() => handleCancelRequest(outgoingReq.id)}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-xs font-semibold flex items-center gap-1 transition-all active:scale-95"
                        title="Click to cancel pending request"
                      >
                        <Clock className="w-3 h-3" />
                        <span>Requested</span>
                      </button>
                    ) : incomingReq ? (
                      <button
                        id={`accept-member-req-${user.id}`}
                        disabled={actionLoadingId === `accept_${incomingReq.id}`}
                        onClick={() => handleAcceptRequest(incomingReq)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 transition-all active:scale-95"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept</span>
                      </button>
                    ) : (
                      <button
                        id={`add-member-btn-${user.id}`}
                        disabled={actionLoadingId === `send_${user.id}`}
                        onClick={() => handleSendRequest(user)}
                        className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && confirmModal.targetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            id="social-action-confirm-dialog"
            className="w-full max-w-sm rounded-3xl bg-[#141628] border border-white/10 p-6 shadow-2xl space-y-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-400">
              {confirmModal.type === 'remove' ? (
                <Trash2 className="w-6 h-6" />
              ) : (
                <ShieldAlert className="w-6 h-6" />
              )}
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-white">
                {confirmModal.type === 'remove' ? 'Remove Friend?' : 'Block User?'}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {confirmModal.type === 'remove'
                  ? `Are you sure you want to remove ${confirmModal.targetUser.fullName} from your friends?`
                  : `Are you sure you want to block ${confirmModal.targetUser.fullName}? They will no longer be able to message you or send friend requests.`}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                id="confirm-action-cancel-btn"
                onClick={() =>
                  setConfirmModal({ isOpen: false, type: 'remove', targetUser: null })
                }
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                id="confirm-action-execute-btn"
                onClick={
                  confirmModal.type === 'remove' ? handleConfirmRemove : handleConfirmBlock
                }
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-all shadow-md active:scale-95"
              >
                {confirmModal.type === 'remove' ? 'Remove' : 'Block'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

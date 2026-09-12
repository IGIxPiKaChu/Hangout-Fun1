import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  UserPlus,
  UserCheck,
  ArrowLeft,
  UserX,
  Edit3,
  Clock,
  Check,
  X,
  ShieldAlert,
  MoreVertical,
  Trash2,
  Lock,
  Phone,
  Video,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { User, Room, RelationshipStatus } from '../types/index.ts';
import { Avatar } from '../components/common/Avatar.tsx';

export const OtherUserProfileScreen: React.FC = () => {
  const { selectedUserId, navigate, goBack, showToast, isUserOnline, getUserLastSeen, startCall } = useApp();
  const { currentUser } = useAuth();

  const [user, setUser] = useState<User | null>(null);
  const [hostedRooms, setHostedRooms] = useState<Room[]>([]);
  const [relationship, setRelationship] = useState<RelationshipStatus>('none');
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Dropdown menu state
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'remove' | 'block';
  }>({
    isOpen: false,
    type: 'remove',
  });

  const loadUserData = useCallback(async () => {
    if (!selectedUserId) {
      setIsLoading(false);
      setNotFound(true);
      return;
    }
    setIsLoading(true);
    setNotFound(false);
    try {
      const [userRes, roomsRes, relRes] = await Promise.all([
        api.getUser(selectedUserId).catch(() => ({ user: null as any })),
        api.getRooms({ userId: selectedUserId }).catch(() => ({ rooms: [] })),
        currentUser
          ? api.getRelationship(selectedUserId).catch(() => ({ relationship: 'none' as RelationshipStatus, requestId: undefined }))
          : Promise.resolve({ relationship: 'none' as RelationshipStatus, requestId: undefined }),
      ]);

      if (!userRes?.user) {
        setUser(null);
        setNotFound(true);
      } else {
        setUser(userRes.user);
        setHostedRooms(roomsRes.rooms.filter((r) => r.hostId === selectedUserId));
        setRelationship(relRes.relationship);
        if (relRes.requestId) {
          setPendingRequestId(relRes.requestId);
        }
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [selectedUserId, currentUser]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Send Friend Request
  const handleSendFriendRequest = async () => {
    if (!currentUser || !user || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await api.sendFriendRequest(user.id);
      setRelationship(res.relationship);
      if (res.request) {
        setPendingRequestId(res.request.id);
      }
      if (res.relationship === 'friends') {
        showToast(`You and ${user.fullName} are now friends!`);
      } else {
        showToast(`Friend request sent to ${user.fullName}!`);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to send friend request.');
    } finally {
      setActionLoading(false);
    }
  };

  // Accept incoming friend request
  const handleAcceptRequest = async () => {
    if (!currentUser || !pendingRequestId || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await api.acceptFriendRequest(pendingRequestId);
      setRelationship(res.relationship);
      showToast(`Accepted friend request from ${user?.fullName}!`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to accept request.');
    } finally {
      setActionLoading(false);
    }
  };

  // Reject incoming friend request
  const handleRejectRequest = async () => {
    if (!currentUser || !pendingRequestId || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await api.rejectFriendRequest(pendingRequestId);
      setRelationship(res.relationship);
      setPendingRequestId(null);
      showToast(`Declined friend request.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to decline request.');
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel outgoing friend request
  const handleCancelRequest = async () => {
    if (!currentUser || !pendingRequestId || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await api.cancelFriendRequest(pendingRequestId);
      setRelationship(res.relationship);
      setPendingRequestId(null);
      showToast('Cancelled friend request.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to cancel request.');
    } finally {
      setActionLoading(false);
    }
  };

  // Remove Friend
  const handleConfirmRemoveFriend = async () => {
    if (!currentUser || !user || actionLoading) return;
    setActionLoading(true);
    setConfirmModal({ isOpen: false, type: 'remove' });
    try {
      const res = await api.removeFriend(user.id);
      setRelationship(res.relationship);
      showToast(`Removed ${user.fullName} from friends.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to remove friend.');
    } finally {
      setActionLoading(false);
    }
  };

  // Block User
  const handleConfirmBlock = async () => {
    if (!currentUser || !user || actionLoading) return;
    setActionLoading(true);
    setConfirmModal({ isOpen: false, type: 'block' });
    try {
      const res = await api.blockUser(user.id);
      setRelationship(res.relationship);
      showToast(`Blocked ${user.fullName}.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to block user.');
    } finally {
      setActionLoading(false);
    }
  };

  // Unblock User
  const handleUnblock = async () => {
    if (!currentUser || !user || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await api.unblockUser(user.id);
      setRelationship(res.relationship);
      showToast(`Unblocked ${user.fullName}.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to unblock user.');
    } finally {
      setActionLoading(false);
    }
  };

  // Start Direct Chat
  const handleStartChat = async () => {
    if (!currentUser || !user) return;
    if (relationship === 'blocked' || relationship === 'blocked_by') {
      showToast('Cannot chat with a blocked user.');
      return;
    }
    try {
      const res = await api.getOrCreateConversation(currentUser.id, user.id);
      navigate('direct-chat', {
        conversationId: res.conversation.id,
        targetUser: user,
      });
    } catch (err: any) {
      showToast(err?.message || 'Failed to open chat.');
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 px-4 text-center text-slate-400 max-w-md mx-auto">
        <div className="w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-medium text-slate-300">Loading member profile...</p>
      </div>
    );
  }

  if (notFound || !user) {
    return (
      <div className="py-16 px-4 max-w-md mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400 shadow-lg">
          <UserX className="w-8 h-8 text-slate-400" />
        </div>
        <h2 className="text-lg font-black text-white">Member Not Found</h2>
        <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
          The requested user profile does not exist or has been removed from the platform.
        </p>
        <button
          onClick={goBack}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md transition-all active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go Back</span>
        </button>
      </div>
    );
  }

  const isSelf = currentUser?.id === user.id;

  return (
    <div className="pb-24 pt-4 px-4 max-w-xl mx-auto space-y-6">
      {/* User Header Card */}
      <div className="p-6 rounded-3xl bg-[#141628] border border-purple-500/20 shadow-xl flex flex-col items-center text-center relative overflow-hidden">
        {/* Back and Options Top Bar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20">
          <button
            id="profile-back-btn"
            onClick={goBack}
            className="p-2 rounded-xl bg-black/40 hover:bg-black/60 text-white border border-white/10 backdrop-blur-xs transition-all"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {!isSelf && (
            <div className="relative">
              <button
                id="profile-options-menu-btn"
                onClick={() => setShowOptionsMenu((prev) => !prev)}
                className="p-2 rounded-xl bg-black/40 hover:bg-black/60 text-white border border-white/10 backdrop-blur-xs transition-all"
                title="Options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showOptionsMenu && (
                <div
                  id="profile-dropdown-menu"
                  className="absolute right-0 top-10 w-44 rounded-2xl bg-[#1c1f36] border border-white/10 p-1.5 shadow-2xl z-30 space-y-1 text-left"
                >
                  {relationship === 'friends' && (
                    <button
                      id="dropdown-remove-friend-btn"
                      onClick={() => {
                        setShowOptionsMenu(false);
                        setConfirmModal({ isOpen: true, type: 'remove' });
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove Friend</span>
                    </button>
                  )}

                  {relationship !== 'blocked' && (
                    <button
                      id="dropdown-block-user-btn"
                      onClick={() => {
                        setShowOptionsMenu(false);
                        setConfirmModal({ isOpen: true, type: 'block' });
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-all"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Block Member</span>
                    </button>
                  )}

                  {relationship === 'blocked' && (
                    <button
                      id="dropdown-unblock-user-btn"
                      onClick={() => {
                        setShowOptionsMenu(false);
                        handleUnblock();
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-medium text-amber-400 hover:bg-amber-500/10 flex items-center gap-2 transition-all"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Unblock Member</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {user.coverUrl && (
          <div className="absolute top-0 left-0 right-0 h-24 overflow-hidden opacity-30 pointer-events-none">
            <img src={user.coverUrl} alt="Profile banner" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#141628]" />
          </div>
        )}

        <div className="relative z-10 mt-6">
          <Avatar
            src={user.avatarUrl}
            alt={user.fullName}
            size="2xl"
            isOnline={isUserOnline(user.id)}
            showBorder
          />
        </div>

        <h2 className="text-lg font-black text-white mt-4 relative z-10">{user.fullName}</h2>
        <p className="text-xs text-purple-400 font-semibold relative z-10">@{user.username}</p>
        
        {/* Real Presence Status */}
        <div className="flex items-center gap-1.5 mt-1.5 relative z-10">
          <span
            className={`w-2 h-2 rounded-full ${
              isUserOnline(user.id) ? 'bg-emerald-400' : 'bg-slate-500'
            }`}
          />
          <span className="text-[11px] font-medium text-slate-300">
            {isUserOnline(user.id)
              ? 'Online'
              : getUserLastSeen(user.id)
              ? `Last seen ${new Date(getUserLastSeen(user.id)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Offline'}
          </span>
        </div>

        <p className="text-xs text-slate-300 max-w-xs mt-2 leading-relaxed relative z-10">
          {user.bio || 'Hangout member and community enthusiast.'}
        </p>

        {/* Action buttons */}
        {isSelf ? (
          <div className="mt-6 w-full max-w-xs relative z-10">
            <button
              onClick={() => navigate('profile')}
              className="w-full py-2.5 px-4 rounded-xl bg-purple-600/20 border border-purple-500/40 hover:bg-purple-600/30 text-purple-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Your Profile</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 mt-6 w-full max-w-xs relative z-10">
            <div className="flex items-center gap-2.5 w-full">
              {/* Dynamic Relationship State Button */}
              {relationship === 'friends' ? (
                <button
                  id="profile-relationship-friends-btn"
                  onClick={() => setConfirmModal({ isOpen: true, type: 'remove' })}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all group"
                  title="Click to remove friend"
                >
                  <UserCheck className="w-3.5 h-3.5 group-hover:hidden" />
                  <Trash2 className="w-3.5 h-3.5 hidden group-hover:inline-block" />
                  <span className="group-hover:hidden">Friends</span>
                  <span className="hidden group-hover:inline">Unfriend</span>
                </button>
              ) : relationship === 'outgoing_request' ? (
                <button
                  id="profile-relationship-cancel-btn"
                  disabled={actionLoading}
                  onClick={handleCancelRequest}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 group"
                  title="Click to cancel request"
                >
                  <Clock className="w-3.5 h-3.5 group-hover:hidden" />
                  <X className="w-3.5 h-3.5 hidden group-hover:inline-block" />
                  <span className="group-hover:hidden">Requested</span>
                  <span className="hidden group-hover:inline">Cancel</span>
                </button>
              ) : relationship === 'incoming_request' ? (
                <div className="flex items-center gap-1.5 flex-1">
                  <button
                    id="profile-accept-req-btn"
                    disabled={actionLoading}
                    onClick={handleAcceptRequest}
                    className="flex-1 py-2.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1 transition-all shadow-md active:scale-95 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept</span>
                  </button>
                  <button
                    id="profile-decline-req-btn"
                    disabled={actionLoading}
                    onClick={handleRejectRequest}
                    className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-medium flex items-center justify-center transition-all disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : relationship === 'blocked' ? (
                <button
                  id="profile-unblock-btn"
                  disabled={actionLoading}
                  onClick={handleUnblock}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-amber-600/20 border border-amber-500/40 text-amber-300 hover:bg-amber-600/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Unblock Member</span>
                </button>
              ) : relationship === 'blocked_by' ? (
                <div className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 text-slate-500 text-xs font-semibold flex items-center justify-center gap-1.5 border border-white/5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Unavailable</span>
                </div>
              ) : (
                <button
                  id="profile-add-friend-btn"
                  disabled={actionLoading}
                  onClick={handleSendFriendRequest}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Friend</span>
                </button>
              )}

              {/* Message button */}
              <button
                id="profile-start-chat-btn"
                disabled={relationship === 'blocked' || relationship === 'blocked_by'}
                onClick={handleStartChat}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border ${
                  relationship === 'blocked' || relationship === 'blocked_by'
                    ? 'bg-white/5 text-slate-500 border-white/5 cursor-not-allowed'
                    : 'bg-white/10 hover:bg-white/15 text-white border-white/10 active:scale-95'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Message</span>
              </button>
            </div>

            {/* If friends, enable Voice & Video Calling */}
            {relationship === 'friends' && (
              <div className="grid grid-cols-2 gap-2 w-full mt-2">
                <button
                  id="profile-voice-call-btn"
                  onClick={() => startCall(user.id, 'audio')}
                  className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 hover:text-emerald-400 border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Voice Call</span>
                </button>
                <button
                  id="profile-video-call-btn"
                  onClick={() => startCall(user.id, 'video')}
                  className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 hover:text-purple-400 border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                >
                  <Video className="w-3.5 h-3.5 text-purple-400" />
                  <span>Video Call</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hosted Rooms */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">
          Rooms by {user.fullName.split(' ')[0]} ({hostedRooms.length})
        </h3>

        {hostedRooms.length === 0 ? (
          <div className="p-4 rounded-2xl bg-[#141628]/60 border border-white/5 text-center text-xs text-slate-400">
            No public rooms hosted yet.
          </div>
        ) : (
          <div className="space-y-3">
            {hostedRooms.map((room) => (
              <div
                key={room.id}
                id={`user-hosted-room-${room.id}`}
                onClick={() => navigate('room-details', { roomId: room.id })}
                className="p-3.5 rounded-2xl bg-[#141628] border border-white/5 hover:border-purple-500/30 cursor-pointer transition-all flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-white/10">
                    <img src={room.bannerUrl} alt={room.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-white truncate">{room.name}</h4>
                    <p className="text-[11px] text-slate-400 truncate">{room.type} room</p>
                  </div>
                </div>
                <span className="text-xs text-purple-400 font-semibold shrink-0">&rarr;</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            id="profile-confirm-dialog"
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
                {confirmModal.type === 'remove' ? 'Remove Friend?' : 'Block Member?'}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {confirmModal.type === 'remove'
                  ? `Are you sure you want to remove ${user.fullName} from your friends list?`
                  : `Are you sure you want to block ${user.fullName}? They will be removed from your friends and won't be able to message you.`}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                id="profile-modal-cancel-btn"
                onClick={() => setConfirmModal({ isOpen: false, type: 'remove' })}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                id="profile-modal-confirm-btn"
                onClick={
                  confirmModal.type === 'remove' ? handleConfirmRemoveFriend : handleConfirmBlock
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

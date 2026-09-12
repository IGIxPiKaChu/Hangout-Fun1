import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';
import { firestoreSocial } from '../../lib/firestoreSocial.ts';
import type { User, RoomMemberUser, FriendRequest } from '../../types/index.ts';
import { Modal } from '../common/Modal.tsx';
import { Avatar } from '../common/Avatar.tsx';
import {
  UserPlus,
  Users,
  Search,
  Check,
  Clock,
  UserCheck,
  Share2,
  Copy,
  Send,
  Loader2,
  Sparkles,
  MessageSquare,
} from 'lucide-react';

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  roomCode?: string;
  roomMembers: RoomMemberUser[];
}

type TabType = 'room-members' | 'search' | 'invite-friends';

export const AddFriendModal: React.FC<AddFriendModalProps> = ({
  isOpen,
  onClose,
  roomId,
  roomCode,
  roomMembers,
}) => {
  const { showToast, isUserOnline, navigate } = useApp();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('room-members');
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Load friends, requests, and all users
  useEffect(() => {
    if (!isOpen || !currentUser) return;

    let isMounted = true;
    const loadSocialData = async () => {
      setIsLoading(true);
      try {
        let loadedFriends: User[] = [];
        let loadedIncoming: FriendRequest[] = [];
        let loadedOutgoing: FriendRequest[] = [];
        let loadedUsers: User[] = [];

        try {
          const [friendsRes, requestsRes, usersRes] = await Promise.all([
            api.getFriends().catch(() => null),
            api.getFriendRequests().catch(() => null),
            api.getUsers({ limit: 60 }).catch(() => null),
          ]);
          if (friendsRes?.friends) loadedFriends = friendsRes.friends;
          if (requestsRes?.incoming) loadedIncoming = requestsRes.incoming;
          if (requestsRes?.outgoing) loadedOutgoing = requestsRes.outgoing;
          if (usersRes?.users) loadedUsers = usersRes.users;
        } catch {
          // Backend not reachable
        }

        if (loadedUsers.length === 0) {
          loadedUsers = await firestoreSocial.searchUsers();
        }
        if (loadedFriends.length === 0) {
          loadedFriends = await firestoreSocial.getFriends(currentUser.id);
        }
        if (loadedIncoming.length === 0 && loadedOutgoing.length === 0) {
          const fsReqs = await firestoreSocial.getFriendRequests(currentUser.id);
          loadedIncoming = fsReqs.incoming;
          loadedOutgoing = fsReqs.outgoing;
        }

        if (!isMounted) return;
        setFriends(loadedFriends);
        setOutgoingRequests(loadedOutgoing);
        setIncomingRequests(loadedIncoming);
        setAllUsers(loadedUsers.filter((u) => u.id !== currentUser.id));
      } catch (err) {
        console.error('Failed to load social data in AddFriendModal:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadSocialData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentUser]);

  const friendIdsSet = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);
  const outgoingRequestUserIds = useMemo(
    () => new Set(outgoingRequests.map((r) => r.receiverId)),
    [outgoingRequests]
  );
  const incomingRequestMap = useMemo(() => {
    const map = new Map<string, FriendRequest>();
    incomingRequests.forEach((r) => map.set(r.senderId, r));
    return map;
  }, [incomingRequests]);

  // Non-friend room members (excluding current user)
  const nonFriendRoomMembers = useMemo(() => {
    if (!currentUser) return [];
    return roomMembers.filter((m) => m.id !== currentUser.id);
  }, [roomMembers, currentUser]);

  // Filtered search results
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim().replace(/^@+/, '');
    if (!q) {
      return allUsers.slice(0, 15);
    }
    return allUsers.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.bio && u.bio.toLowerCase().includes(q))
    );
  }, [allUsers, searchQuery]);

  // Friends who are not currently in the room
  const friendsNotInRoom = useMemo(() => {
    const roomMemberIds = new Set(roomMembers.map((m) => m.id));
    return friends.filter((f) => !roomMemberIds.has(f.id));
  }, [friends, roomMembers]);

  // Handle Send Friend Request
  const handleSendFriendRequest = async (targetUser: User) => {
    if (!currentUser || actionLoadingId) return;
    setActionLoadingId(`add_${targetUser.id}`);
    try {
      let sentSuccessfully = false;
      try {
        const res = await api.sendFriendRequest(targetUser.id);
        if (res.relationship === 'friends') {
          setFriends((prev) => [...prev, targetUser]);
          setIncomingRequests((prev) => prev.filter((r) => r.senderId !== targetUser.id));
          showToast(`You and ${targetUser.fullName} are now friends!`);
          sentSuccessfully = true;
        } else if (res?.request) {
          setOutgoingRequests((prev) => [...prev, res.request]);
          showToast(`Friend request sent to ${targetUser.fullName}`);
          sentSuccessfully = true;
        }
      } catch {
        // Fallback to Firestore
      }

      if (!sentSuccessfully) {
        const fsRes = await firestoreSocial.sendFriendRequest(currentUser, targetUser);
        if (fsRes.relationship === 'friends') {
          setFriends((prev) => [...prev, targetUser]);
          setIncomingRequests((prev) => prev.filter((r) => r.senderId !== targetUser.id));
          showToast(`You and ${targetUser.fullName} are now friends!`);
        } else {
          setOutgoingRequests((prev) => [...prev, fsRes.request]);
          showToast(`Friend request sent to ${targetUser.fullName}`);
        }
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to send friend request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Accept Incoming Friend Request
  const handleAcceptFriendRequest = async (request: FriendRequest, senderUser: User) => {
    if (!currentUser || actionLoadingId) return;
    setActionLoadingId(`accept_${request.id}`);
    try {
      try {
        await api.acceptFriendRequest(request.id);
      } catch {
        await firestoreSocial.acceptFriendRequest(request.id, currentUser.id);
      }
      setIncomingRequests((prev) => prev.filter((r) => r.id !== request.id));
      setFriends((prev) => [...prev, senderUser]);
      showToast(`Accepted friend request from ${senderUser.fullName}!`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to accept friend request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Invite Friend to Current Live Room
  const handleInviteToRoom = async (friend: User) => {
    if (actionLoadingId || !roomId) return;
    setActionLoadingId(`invite_${friend.id}`);
    try {
      await api.inviteToRoom(roomId, friend.id);
      setInvitedFriendIds((prev) => new Set(prev).add(friend.id));
      showToast(`Room invitation sent to ${friend.fullName}!`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to send room invite.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCopyRoomCode = () => {
    if (!roomCode) return;
    navigator.clipboard?.writeText(roomCode);
    showToast(`Room code copied: ${roomCode}`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Friends & Invite"
      maxWidth="md"
    >
      <div className="flex flex-col h-[520px] max-h-[80vh]">
        {/* Quick Room Code Share Bar */}
        {roomCode && (
          <div className="px-5 py-3 bg-[#16182c] border-b border-white/5 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Share2 className="w-4 h-4 text-purple-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-xs text-slate-400">Room Code: </span>
                <span className="text-xs font-mono font-bold text-purple-300 tracking-wider">
                  {roomCode}
                </span>
              </div>
            </div>
            <button
              type="button"
              id="copy-room-code-btn"
              onClick={handleCopyRoomCode}
              className="px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors active:scale-95 shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Code</span>
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-white/5 bg-[#121424] px-4 pt-2 shrink-0">
          <button
            type="button"
            id="tab-room-members-btn"
            onClick={() => setActiveTab('room-members')}
            className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'room-members'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Room Members</span>
            {nonFriendRoomMembers.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                {nonFriendRoomMembers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            id="tab-search-users-btn"
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'search'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Search Users</span>
          </button>

          <button
            type="button"
            id="tab-invite-friends-btn"
            onClick={() => setActiveTab('invite-friends')}
            className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'invite-friends'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Friends</span>
            {friendsNotInRoom.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                {friendsNotInRoom.length}
              </span>
            )}
          </button>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* TAB 1: Room Members */}
          {activeTab === 'room-members' && (
            <div className="space-y-2">
              <div className="text-[11px] text-slate-400 px-1 mb-1">
                People currently in this live room:
              </div>

              {nonFriendRoomMembers.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-3 text-purple-400">
                    <Users className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-200">No other members in this room yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Invite your friends or share the room code to start hanging out!
                  </p>
                </div>
              ) : (
                nonFriendRoomMembers.map((member) => {
                  const isFriend = friendIdsSet.has(member.id);
                  const isOutgoing = outgoingRequestUserIds.has(member.id);
                  const incomingReq = incomingRequestMap.get(member.id);
                  const isActing = actionLoadingId === `add_${member.id}` || actionLoadingId === `accept_${incomingReq?.id}`;
                  const online = isUserOnline(member.id);

                  return (
                    <div
                      key={member.id}
                      className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <Avatar
                            src={member.avatarUrl}
                            name={member.fullName}
                            size="md"
                          />
                          {online && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#121424]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-white truncate">
                              {member.fullName}
                            </span>
                            {member.isHost && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold">
                                Host
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 block truncate">
                            @{member.username}
                          </span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="shrink-0">
                        {isFriend ? (
                          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Friends</span>
                          </div>
                        ) : incomingReq ? (
                          <button
                            type="button"
                            id={`accept-member-req-${member.id}`}
                            disabled={isActing}
                            onClick={() => handleAcceptFriendRequest(incomingReq, member)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all active:scale-95 disabled:opacity-50"
                          >
                            {isActing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Accept</span>
                          </button>
                        ) : isOutgoing ? (
                          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-semibold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Pending</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            id={`add-member-friend-${member.id}`}
                            disabled={isActing}
                            onClick={() => handleSendFriendRequest(member)}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-900/30 transition-all active:scale-95 disabled:opacity-50"
                          >
                            {isActing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UserPlus className="w-3.5 h-3.5" />
                            )}
                            <span>Add Friend</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: Search All Users */}
          {activeTab === 'search' && (
            <div className="space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  id="search-users-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users by name or @username..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Search Results */}
              <div className="space-y-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    <span>Loading users...</span>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    No users found matching "{searchQuery}"
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isFriend = friendIdsSet.has(user.id);
                    const isOutgoing = outgoingRequestUserIds.has(user.id);
                    const incomingReq = incomingRequestMap.get(user.id);
                    const isActing = actionLoadingId === `add_${user.id}` || actionLoadingId === `accept_${incomingReq?.id}`;
                    const online = isUserOnline(user.id);

                    return (
                      <div
                        key={user.id}
                        className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative">
                            <Avatar
                              src={user.avatarUrl}
                              name={user.fullName}
                              size="md"
                            />
                            {online && (
                              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#121424]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-white truncate block">
                              {user.fullName}
                            </span>
                            <span className="text-xs text-slate-400 truncate block">
                              @{user.username}
                            </span>
                          </div>
                        </div>

                        {/* Action Button */}
                        <div className="shrink-0">
                          {isFriend ? (
                            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Friends</span>
                            </div>
                          ) : incomingReq ? (
                            <button
                              type="button"
                              id={`search-accept-${user.id}`}
                              disabled={isActing}
                              onClick={() => handleAcceptFriendRequest(incomingReq, user)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all active:scale-95 disabled:opacity-50"
                            >
                              {isActing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              <span>Accept</span>
                            </button>
                          ) : isOutgoing ? (
                            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-semibold">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Pending</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              id={`search-add-${user.id}`}
                              disabled={isActing}
                              onClick={() => handleSendFriendRequest(user)}
                              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-900/30 transition-all active:scale-95 disabled:opacity-50"
                            >
                              {isActing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <UserPlus className="w-3.5 h-3.5" />
                              )}
                              <span>Add Friend</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Invite Existing Friends to this Room */}
          {activeTab === 'invite-friends' && (
            <div className="space-y-2">
              <div className="text-[11px] text-slate-400 px-1 mb-1">
                Invite your friends to join this live hangout room:
              </div>

              {friendsNotInRoom.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-3 text-purple-400">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-200">
                    {friends.length === 0 ? 'No friends added yet' : 'All your friends are already here!'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {friends.length === 0
                      ? 'Search for users in the "Search Users" tab to add friends first.'
                      : 'Everyone on your friends list is already participating in this room.'}
                  </p>
                </div>
              ) : (
                friendsNotInRoom.map((friend) => {
                  const isInvited = invitedFriendIds.has(friend.id);
                  const isActing = actionLoadingId === `invite_${friend.id}`;
                  const online = isUserOnline(friend.id);

                  return (
                    <div
                      key={friend.id}
                      className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <Avatar
                            src={friend.avatarUrl}
                            name={friend.fullName}
                            size="md"
                          />
                          {online && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#121424]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-white truncate block">
                            {friend.fullName}
                          </span>
                          <span className="text-xs text-slate-400 truncate block">
                            @{friend.username} {online && '• Online now'}
                          </span>
                        </div>
                      </div>

                      {/* Invite Button */}
                      <div className="shrink-0">
                        {isInvited ? (
                          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
                            <Check className="w-3.5 h-3.5" />
                            <span>Invited</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            id={`invite-friend-btn-${friend.id}`}
                            disabled={isActing}
                            onClick={() => handleInviteToRoom(friend)}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-900/30 transition-all active:scale-95 disabled:opacity-50"
                          >
                            {isActing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>Invite</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

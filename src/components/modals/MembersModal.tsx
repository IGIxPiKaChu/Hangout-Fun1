import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';
import type { User, RoomMemberUser } from '../../types/index.ts';
import { Modal } from '../common/Modal.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { Badge } from '../common/Badge.tsx';
import {
  Users,
  Search,
  MessageSquare,
  Shield,
  ShieldCheck,
  ShieldOff,
  Mic,
  MicOff,
  UserMinus,
  Ban,
  UserCheck,
  UserPlus,
  Crown,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
  Film,
  Check,
} from 'lucide-react';

export const MembersModal: React.FC = () => {
  const { isMembersModalOpen, closeMembersModal, selectedModalRoom, setSelectedRoom, navigate, showToast, isUserOnline } =
    useApp();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'members' | 'banned' | 'invite'>('members');
  const [searchQuery, setSearchQuery] = useState('');
  const [members, setMembers] = useState<RoomMemberUser[]>([]);
  const [bannedUsers, setBannedUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Selected user for expanded moderation tools
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Confirmation prompt state: 'kick' | 'ban' | null
  const [confirmAction, setConfirmAction] = useState<{
    type: 'kick' | 'ban';
    user: RoomMemberUser;
  } | null>(null);

  const isHost = selectedModalRoom?.hostId === currentUser?.id;
  const isAdmin = (selectedModalRoom?.adminIds || []).includes(currentUser?.id || '');
  const canModerate = isHost || isAdmin;

  const loadMembersAndBanned = async () => {
    if (!selectedModalRoom) return;
    setIsLoading(true);
    try {
      const [membersRes, bannedRes] = await Promise.all([
        api.getRoomMembers(selectedModalRoom.id),
        canModerate ? api.getBannedMembers(selectedModalRoom.id) : Promise.resolve({ bannedUsers: [] }),
      ]);
      setMembers(membersRes.members);
      setBannedUsers(bannedRes.bannedUsers || []);
    } catch (err) {
      console.error('Failed to load room members:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFriends = async () => {
    if (!currentUser) return;
    try {
      const res = await api.getFriends();
      setFriends(res.friends || []);
    } catch (err) {
      console.error('Failed to load friends for invite:', err);
    }
  };

  const handleInviteFriend = async (friend: User) => {
    if (!selectedModalRoom) return;
    setActionLoadingId(friend.id);
    try {
      await api.inviteToRoom(selectedModalRoom.id, friend.id);
      setInvitedFriendIds((prev) => new Set(prev).add(friend.id));
      showToast(`Invited ${friend.fullName} to room!`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to send invite.');
    } finally {
      setActionLoadingId(null);
    }
  };

  useEffect(() => {
    if (isMembersModalOpen && selectedModalRoom) {
      loadMembersAndBanned();
      loadFriends();
      setSearchQuery('');
      setExpandedUserId(null);
      setConfirmAction(null);
      setActiveTab('members');
    }
  }, [isMembersModalOpen, selectedModalRoom?.id]);

  const handleMessage = async (user: User) => {
    if (!currentUser) return;
    try {
      const res = await api.getOrCreateConversation(currentUser.id, user.id);
      closeMembersModal();
      navigate('direct-chat', {
        conversationId: res.conversation.id,
        targetUser: user,
      });
    } catch {
      showToast('Could not open chat.');
    }
  };

  const handleViewProfile = (user: User) => {
    closeMembersModal();
    if (user.id === currentUser?.id) {
      navigate('profile');
    } else {
      navigate('other-profile', { userId: user.id });
    }
  };

  // Moderation: Toggle Admin / Co-Host permission
  const handleToggleAdmin = async (member: RoomMemberUser) => {
    if (!selectedModalRoom || !currentUser) return;
    setActionLoadingId(member.id);
    const newRole = member.isAdmin ? 'member' : 'admin';
    try {
      const res = await api.updateMemberPermission(selectedModalRoom.id, {
        userId: member.id,
        requesterId: currentUser.id,
        role: newRole,
      });
      setSelectedRoom(res.room);
      showToast(newRole === 'admin' ? `${member.fullName} is now a Co-Host` : `${member.fullName} is no longer a Co-Host`);
      await loadMembersAndBanned();
    } catch (err: any) {
      showToast(err.message || 'Failed to update permissions.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Moderation: Toggle Mute
  const handleToggleMute = async (member: RoomMemberUser) => {
    if (!selectedModalRoom || !currentUser) return;
    setActionLoadingId(member.id);
    const newMuted = !member.isMuted;
    try {
      const res = await api.updateMemberPermission(selectedModalRoom.id, {
        userId: member.id,
        requesterId: currentUser.id,
        isMuted: newMuted,
      });
      setSelectedRoom(res.room);
      showToast(newMuted ? `Muted ${member.fullName} in this room` : `Unmuted ${member.fullName}`);
      await loadMembersAndBanned();
    } catch (err: any) {
      showToast(err.message || 'Failed to update mute state.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Moderation: Toggle Media Permission (Host & Co-Host)
  const handleToggleMediaPermission = async (member: RoomMemberUser) => {
    if (!selectedModalRoom || !currentUser) return;
    setActionLoadingId(member.id);
    const newAllowed = !member.canAddMedia;
    try {
      const res = await api.updateMemberPermission(selectedModalRoom.id, {
        userId: member.id,
        requesterId: currentUser.id,
        canAddMedia: newAllowed,
      });
      setSelectedRoom(res.room);
      showToast(
        newAllowed
          ? `Media permission granted to ${member.fullName}`
          : `Media permission revoked for ${member.fullName}`,
      );
      await loadMembersAndBanned();
    } catch (err: any) {
      showToast(err.message || 'Failed to update media permissions.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Moderation: Execute Kick
  const handleExecuteKick = async () => {
    if (!selectedModalRoom || !currentUser || !confirmAction) return;
    const targetUser = confirmAction.user;
    setActionLoadingId(targetUser.id);
    try {
      const res = await api.kickMember(selectedModalRoom.id, targetUser.id, currentUser.id);
      setSelectedRoom(res.room);
      showToast(`Removed ${targetUser.fullName} from the room.`);
      setConfirmAction(null);
      setExpandedUserId(null);
      await loadMembersAndBanned();
    } catch (err: any) {
      showToast(err.message || 'Failed to kick user.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Moderation: Execute Ban
  const handleExecuteBan = async () => {
    if (!selectedModalRoom || !currentUser || !confirmAction) return;
    const targetUser = confirmAction.user;
    setActionLoadingId(targetUser.id);
    try {
      const res = await api.banMember(selectedModalRoom.id, targetUser.id, currentUser.id);
      setSelectedRoom(res.room);
      showToast(`Banned ${targetUser.fullName} from this room.`);
      setConfirmAction(null);
      setExpandedUserId(null);
      await loadMembersAndBanned();
    } catch (err: any) {
      showToast(err.message || 'Failed to ban user.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Moderation: Unban user
  const handleUnban = async (user: User) => {
    if (!selectedModalRoom || !currentUser) return;
    setActionLoadingId(user.id);
    try {
      const res = await api.unbanMember(selectedModalRoom.id, user.id, currentUser.id);
      setSelectedRoom(res.room);
      showToast(`Unbanned ${user.fullName}. They can now rejoin.`);
      await loadMembersAndBanned();
    } catch (err: any) {
      showToast(err.message || 'Failed to unban user.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const query = searchQuery.toLowerCase().trim();
    return members.filter(
      (m) => m.fullName.toLowerCase().includes(query) || m.username.toLowerCase().includes(query),
    );
  }, [members, searchQuery]);

  const filteredBanned = useMemo(() => {
    if (!searchQuery.trim()) return bannedUsers;
    const query = searchQuery.toLowerCase().trim();
    return bannedUsers.filter(
      (u) => u.fullName.toLowerCase().includes(query) || u.username.toLowerCase().includes(query),
    );
  }, [bannedUsers, searchQuery]);

  const filteredFriends = useMemo(() => {
    const existingMemberIds = new Set(members.map((m) => m.id));
    const nonMembers = friends.filter((f) => !existingMemberIds.has(f.id));
    if (!searchQuery.trim()) return nonMembers;
    const query = searchQuery.toLowerCase().trim();
    return nonMembers.filter(
      (f) => f.fullName.toLowerCase().includes(query) || f.username.toLowerCase().includes(query),
    );
  }, [friends, members, searchQuery]);

  return (
    <Modal
      isOpen={isMembersModalOpen}
      onClose={closeMembersModal}
      title={selectedModalRoom ? `${selectedModalRoom.name} Members` : 'Room Members'}
      maxWidth="md"
    >
      <div className="space-y-3.5">
        {/* Host Status Bar & Role Pill */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/20 text-xs">
          <div className="flex items-center gap-2 text-purple-300">
            <span className="font-semibold text-white">Your Role:</span>
            {isHost ? (
              <Badge variant="gold" size="sm">👑 Room Host (Full Control)</Badge>
            ) : isAdmin ? (
              <Badge variant="purple" size="sm">🛡️ Co-Host / Admin</Badge>
            ) : (
              <Badge variant="gray" size="sm">Member</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-[11px]">
            <span>Capacity: {members.length} / {selectedModalRoom?.maxMembers || 50}</span>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1.5 p-1 bg-[#121424] rounded-xl border border-white/5">
          <button
            onClick={() => {
              setActiveTab('members');
              setExpandedUserId(null);
              setConfirmAction(null);
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'members'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Members ({members.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('invite');
              setExpandedUserId(null);
              setConfirmAction(null);
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'invite'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite Friends
          </button>
          {canModerate && (
            <button
              onClick={() => {
                setActiveTab('banned');
                setExpandedUserId(null);
                setConfirmAction(null);
              }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'banned'
                  ? 'bg-red-600/80 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Ban className="w-3.5 h-3.5 text-red-400" />
              Banned ({bannedUsers.length})
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'members'
                ? 'Search members by name or @username...'
                : activeTab === 'invite'
                  ? 'Search friends to invite...'
                  : 'Search banned users...'
            }
            className="w-full pl-9 pr-3 py-2 bg-[#121424] border border-white/10 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition-all"
          />
        </div>

        {/* Confirmation Modal Overlay (Kick or Ban) */}
        {confirmAction && (
          <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-500/40 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white">
                  {confirmAction.type === 'kick' ? 'Remove Member from Room?' : 'Ban Member from Room?'}
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  {confirmAction.type === 'kick'
                    ? `Are you sure you want to kick ${confirmAction.user.fullName}? They will be removed from this room session immediately, but can rejoin if they have the code or link.`
                    : `Are you sure you want to ban ${confirmAction.user.fullName}? They will be kicked out and permanently prevented from joining this room until unbanned.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-red-500/20">
              <button
                type="button"
                disabled={actionLoadingId === confirmAction.user.id}
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoadingId === confirmAction.user.id}
                onClick={confirmAction.type === 'kick' ? handleExecuteKick : handleExecuteBan}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 transition-all ${
                  confirmAction.type === 'kick'
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {actionLoadingId === confirmAction.user.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {confirmAction.type === 'kick' ? 'Confirm Kick' : 'Confirm Ban'}
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        {isLoading ? (
          <div className="py-10 text-center flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            Loading participants...
          </div>
        ) : activeTab === 'members' ? (
          /* Members Tab List */
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {filteredMembers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {searchQuery ? 'No members match your search.' : 'No members found in this room.'}
              </div>
            ) : (
              filteredMembers.map((member) => {
                const isMemberHost = member.id === selectedModalRoom?.hostId;
                const isMe = member.id === currentUser?.id;
                const isMemberAdmin = member.isAdmin;
                const isMemberMuted = member.isMuted;
                const isExpanded = expandedUserId === member.id;

                // Host can moderate anyone except themselves.
                // Admin can moderate regular members, but not the host or other admins.
                const canModerateThisMember =
                  canModerate &&
                  !isMe &&
                  !isMemberHost &&
                  (isHost || !isMemberAdmin);

                return (
                  <div
                    key={member.id}
                    className="p-2.5 rounded-xl bg-[#14172a]/60 hover:bg-[#14172a] border border-white/5 transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      {/* Avatar & User Info */}
                      <div
                        onClick={() => handleViewProfile(member)}
                        className="flex items-center gap-3 cursor-pointer overflow-hidden flex-1 min-w-0"
                      >
                        <Avatar
                          src={member.avatarUrl}
                          alt={member.fullName}
                          size="sm"
                          isOnline={isUserOnline(member.id)}
                        />
                        <div className="min-w-0 truncate">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-white truncate">
                              {member.fullName}
                            </span>
                            {isMe && <Badge variant="purple" size="sm">You</Badge>}
                            {isMemberHost && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <Crown className="w-2.5 h-2.5" /> Host
                              </span>
                            )}
                            {!isMemberHost && isMemberAdmin && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                <Shield className="w-2.5 h-2.5" /> Co-Host
                              </span>
                            )}
                            {!isMemberHost && !isMemberAdmin && member.canAddMedia && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                <Film className="w-2.5 h-2.5" /> Media
                              </span>
                            )}
                            {isMemberMuted && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                                <MicOff className="w-2.5 h-2.5" /> Muted
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">@{member.username}</p>
                        </div>
                      </div>

                      {/* Right Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isMe && (
                          <button
                            onClick={() => handleMessage(member)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-purple-600/30 text-slate-400 hover:text-white transition-colors"
                            title="Direct message"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canModerateThisMember && (
                          <button
                            type="button"
                            onClick={() => setExpandedUserId(isExpanded ? null : member.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                              isExpanded
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'bg-white/5 hover:bg-white/10 text-purple-300 hover:text-white border border-purple-500/20'
                            }`}
                            title="Moderation Tools (Permissions, Kick, Ban)"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            <span>Manage</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3 ml-0.5" />
                            ) : (
                              <ChevronDown className="w-3 h-3 ml-0.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Host Moderation Tools Accordion */}
                    {isExpanded && canModerateThisMember && (
                      <div className="pt-2 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs animate-in fade-in duration-150">
                        {/* 1. Give Permission: Co-Host Role (Host only) */}
                        {isHost && (
                          <button
                            type="button"
                            disabled={actionLoadingId === member.id}
                            onClick={() => handleToggleAdmin(member)}
                            className={`p-2 rounded-xl flex items-center gap-2 border text-left transition-all ${
                              isMemberAdmin
                                ? 'bg-purple-950/40 border-purple-500/40 text-purple-200 hover:bg-purple-900/40'
                                : 'bg-[#1a1d33] border-white/10 text-slate-300 hover:text-white hover:border-purple-500/40'
                            }`}
                          >
                            {isMemberAdmin ? (
                              <ShieldOff className="w-4 h-4 text-purple-400 shrink-0" />
                            ) : (
                              <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold block truncate">
                                {isMemberAdmin ? 'Revoke Co-Host' : 'Make Co-Host'}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate">
                                {isMemberAdmin ? 'Demote to regular member' : 'Give room admin powers'}
                              </span>
                            </div>
                          </button>
                        )}

                        {/* 2. Media Permission: Allow / Revoke Add Media */}
                        <button
                          type="button"
                          disabled={actionLoadingId === member.id}
                          onClick={() => handleToggleMediaPermission(member)}
                          className={`p-2 rounded-xl flex items-center gap-2 border text-left transition-all ${
                            member.canAddMedia
                              ? 'bg-blue-950/40 border-blue-500/40 text-blue-200 hover:bg-blue-900/40'
                              : 'bg-[#1a1d33] border-white/10 text-slate-300 hover:text-white hover:border-blue-500/40'
                          }`}
                        >
                          <Film className="w-4 h-4 text-blue-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold block truncate">
                              {member.canAddMedia ? 'Revoke Media Perm' : 'Allow Add Media'}
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate">
                              {member.canAddMedia ? 'Revoke right to play videos' : 'Allow playing YouTube & videos'}
                            </span>
                          </div>
                        </button>

                        {/* 3. Audio Permission: Mute / Unmute */}
                        <button
                          type="button"
                          disabled={actionLoadingId === member.id}
                          onClick={() => handleToggleMute(member)}
                          className={`p-2 rounded-xl flex items-center gap-2 border text-left transition-all ${
                            isMemberMuted
                              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200 hover:bg-emerald-900/40'
                              : 'bg-[#1a1d33] border-white/10 text-slate-300 hover:text-white hover:border-white/20'
                          }`}
                        >
                          {isMemberMuted ? (
                            <Mic className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <MicOff className="w-4 h-4 text-amber-400 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold block truncate">
                              {isMemberMuted ? 'Unmute Audio' : 'Mute in Room'}
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate">
                              {isMemberMuted ? 'Allow user to speak' : 'Silence microphone'}
                            </span>
                          </div>
                        </button>

                        {/* 3. Kick / Remove */}
                        <button
                          type="button"
                          disabled={actionLoadingId === member.id}
                          onClick={() => setConfirmAction({ type: 'kick', user: member })}
                          className="p-2 rounded-xl bg-amber-950/30 hover:bg-amber-900/40 border border-amber-500/30 text-amber-200 flex items-center gap-2 text-left transition-all"
                        >
                          <UserMinus className="w-4 h-4 text-amber-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold block truncate">Kick from Room</span>
                            <span className="text-[10px] text-amber-300/70 block truncate">
                              Remove from this hangout
                            </span>
                          </div>
                        </button>

                        {/* 4. Ban */}
                        <button
                          type="button"
                          disabled={actionLoadingId === member.id}
                          onClick={() => setConfirmAction({ type: 'ban', user: member })}
                          className="p-2 rounded-xl bg-red-950/30 hover:bg-red-900/40 border border-red-500/30 text-red-200 flex items-center gap-2 text-left transition-all"
                        >
                          <Ban className="w-4 h-4 text-red-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold block truncate">Ban from Room</span>
                            <span className="text-[10px] text-red-300/70 block truncate">
                              Kick and block from rejoining
                            </span>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : activeTab === 'invite' ? (
          /* Invite Tab List */
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {filteredFriends.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {searchQuery
                  ? 'No friends match your search.'
                  : friends.length === 0
                    ? 'You have no friends yet. Add friends from their profile to invite them!'
                    : 'All your friends are already in this room!'}
              </div>
            ) : (
              filteredFriends.map((friend) => {
                const isInvited = invitedFriendIds.has(friend.id);
                const isProcessing = actionLoadingId === friend.id;

                return (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-purple-950/20 border border-purple-500/20 gap-3"
                  >
                    <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                      <Avatar
                        src={friend.avatarUrl}
                        alt={friend.fullName}
                        size="sm"
                        isOnline={isUserOnline(friend.id)}
                      />
                      <div className="min-w-0 truncate">
                        <span className="text-xs font-bold text-white truncate block">
                          {friend.fullName}
                        </span>
                        <p className="text-[10px] text-slate-400 truncate">@{friend.username}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isInvited || isProcessing}
                      onClick={() => handleInviteFriend(friend)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 ${
                        isInvited
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-purple-600 hover:bg-purple-500 text-white shadow-sm'
                      }`}
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isInvited ? (
                        <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      <span>{isInvited ? 'Invited' : 'Invite'}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : activeTab === 'invite' ? (
          /* Invite Friends Tab List */
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {filteredFriends.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                <p className="font-semibold text-slate-300">
                  {friends.length === 0
                    ? 'No friends yet'
                    : searchQuery
                      ? 'No friends match your search'
                      : 'All your friends are already in this room!'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {friends.length === 0
                    ? 'Add friends from the Friends page or member profiles to invite them here.'
                    : searchQuery
                      ? 'Try searching with another name or @username.'
                      : 'You can share the room code with others to join.'}
                </p>
              </div>
            ) : (
              filteredFriends.map((friend) => {
                const isInvited = invitedFriendIds.has(friend.id);
                const isProcessing = actionLoadingId === friend.id;

                return (
                  <div
                    key={friend.id}
                    id={`invite_friend_row_${friend.id}`}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#141628] border border-white/5 gap-3"
                  >
                    <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                      <Avatar
                        src={friend.avatarUrl}
                        alt={friend.fullName}
                        size="sm"
                        isOnline={isUserOnline(friend.id)}
                      />
                      <div className="min-w-0 truncate">
                        <span className="text-xs font-bold text-white truncate block">
                          {friend.fullName}
                        </span>
                        <p className="text-[10px] text-slate-400 truncate">@{friend.username}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      id={`send_invite_btn_${friend.id}`}
                      disabled={isInvited || isProcessing}
                      onClick={() => handleInviteFriend(friend)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 ${
                        isInvited
                          ? 'bg-purple-950/40 text-purple-300 border border-purple-500/30 cursor-default'
                          : 'bg-purple-600 hover:bg-purple-500 text-white shadow-sm disabled:opacity-50'
                      }`}
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isInvited ? (
                        <Check className="w-3.5 h-3.5 text-purple-300" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      <span>{isInvited ? 'Invited' : 'Invite'}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Banned Tab List */
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {filteredBanned.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {searchQuery ? 'No banned users match your search.' : 'There are no banned users in this room.'}
              </div>
            ) : (
              filteredBanned.map((bannedUser) => (
                <div
                  key={bannedUser.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-red-950/20 border border-red-500/20 gap-3"
                >
                  <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                    <Avatar
                      src={bannedUser.avatarUrl}
                      alt={bannedUser.fullName}
                      size="sm"
                      isOnline={isUserOnline(bannedUser.id)}
                    />
                    <div className="min-w-0 truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">
                          {bannedUser.fullName}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                          Banned
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">@{bannedUser.username}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={actionLoadingId === bannedUser.id}
                    onClick={() => handleUnban(bannedUser)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-emerald-600/30 text-slate-300 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0"
                  >
                    {actionLoadingId === bannedUser.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>Unban</span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

import React, { useState, useEffect } from 'react';
import { Users, Globe, Lock, Clock, Share2, Calendar, Zap, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Room, User } from '../types/index.ts';
import { Avatar } from '../components/common/Avatar.tsx';
import { Badge } from '../components/common/Badge.tsx';

export const RoomDetailsScreen: React.FC = () => {
  const { selectedRoomId, goBack, navigate, openMembersModal, openJoinRoom, showToast } = useApp();
  const { currentUser } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [showDisbandConfirmation, setShowDisbandConfirmation] = useState(false);
  const [isDisbanding, setIsDisbanding] = useState(false);

  useEffect(() => {
    async function loadRoomDetails() {
      if (!selectedRoomId) return;
      setIsLoading(true);
      try {
        const [roomRes, membersRes] = await Promise.all([
          api.getRoom(selectedRoomId),
          api.getRoomMembers(selectedRoomId),
        ]);
        setRoom(roomRes.room);
        setMembers(membersRes.members);
      } catch (err) {
        console.error('Failed to load room details:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadRoomDetails();
  }, [selectedRoomId]);

  if (isLoading || !room) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm">Loading room details...</p>
      </div>
    );
  }

  const isMember = currentUser && room.memberIds.includes(currentUser.id);

  const handleJoinOrEnter = async () => {
    if (!currentUser) return;
    if (isMember) {
      navigate('room-view', { roomId: room.id });
      return;
    }

    if (room.type === 'private') {
      openJoinRoom();
      showToast('This is a private room. Enter the room code to join.');
      return;
    }

    setIsJoining(true);
    try {
      await api.joinRoom(room.id, currentUser.id);
      showToast(`Welcome to ${room.name}!`);
      navigate('room-view', { roomId: room.id });
    } catch (err: any) {
      if (err?.requiresCode) {
        openJoinRoom();
      }
      showToast(err?.message || 'Failed to join room.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    showToast(`Room code copied: ${room.code}`);
  };

  const isHost = room?.hostId === currentUser?.id;

  const handleConfirmDisband = async () => {
    if (!room || !currentUser) return;
    if (!isHost) {
      showToast('Action not allowed to users');
      return;
    }
    setIsDisbanding(true);
    try {
      await api.disbandRoom(room.id, currentUser.id);
      showToast('Room has been disbanded.');
      setShowDisbandConfirmation(false);
      navigate('rooms');
    } catch (err: any) {
      showToast(err?.message || 'Action not allowed to users');
    } finally {
      setIsDisbanding(false);
    }
  };

  return (
    <div className="pb-24 max-w-xl mx-auto px-4 pt-2 space-y-6">
      {/* Top Action */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleShare}
          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          title="Share room"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* Banner & Title */}
      <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#141628] shadow-2xl">
        <div className="h-48 w-full relative">
          <img
            src={room.bannerUrl}
            alt={room.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141628] via-[#141628]/40 to-transparent" />
          <div className="absolute top-3 right-3">
            <Badge variant="purple">Room Code: {room.code}</Badge>
          </div>
        </div>

        <div className="p-6 -mt-10 relative z-10 space-y-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">{room.name}</h1>
            <p className="text-xs text-purple-300 font-medium mt-1">
              Hosted by <span className="text-white font-semibold">{room.hostName}</span>
            </p>
          </div>

          {/* Quick Stat Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1.5 text-xs text-slate-300 font-medium">
              <Users className="w-3.5 h-3.5 text-purple-400" />
              <span>{room.memberIds.length} / {room.maxMembers} Members</span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1.5 text-xs text-slate-300 font-medium">
              {room.type === 'public' ? (
                <>
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Public Room</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Private Room</span>
                </>
              )}
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1.5 text-xs text-slate-300 font-medium">
              <span>{room.language} Language</span>
            </div>
          </div>

          {/* Description */}
          {room.description && (
            <div className="pt-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                About Room
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">{room.description}</p>
            </div>
          )}

          {/* Tags */}
          {room.tags && room.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {room.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-3 py-1 rounded-full bg-purple-900/30 text-purple-300 border border-purple-500/20 font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Upcoming Session */}
          <div className="p-4 rounded-2xl bg-[#1a1e36] border border-purple-500/20 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">
                {room.isScheduled ? 'Scheduled Session' : 'Hangout Status'}
              </p>
              <h4 className="text-sm font-bold text-white mt-0.5 flex items-center gap-1.5">
                {room.isScheduled ? (
                  <Calendar className="w-4 h-4 text-purple-400" />
                ) : (
                  <Clock className="w-4 h-4 text-emerald-400" />
                )}
                {room.upcomingSessionTime || (room.isScheduled ? 'Scheduled Soon' : 'Live Now')}
              </h4>
            </div>
            {room.isScheduled ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-purple-600/30 text-purple-300 border border-purple-500/30">
                <Clock className="w-3 h-3" />
                Scheduled
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Active Live
              </span>
            )}
          </div>

          {/* Join / Enter Room Button */}
          <button
            id="room-details-join-btn"
            onClick={handleJoinOrEnter}
            disabled={isJoining}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-purple-600/30 active:scale-[0.98] transition-all disabled:opacity-70"
          >
            {isJoining ? 'Joining Room...' : isMember ? 'Enter Room Hangout' : 'Join Room'}
          </button>

          {/* Host Disband Room Action */}
          {isHost && (
            <button
              id="room-details-disband-btn"
              type="button"
              onClick={() => setShowDisbandConfirmation(true)}
              className="w-full py-3 px-6 rounded-2xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 hover:text-white font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>Disband Room (Host Only)</span>
            </button>
          )}

          {/* Members Preview */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Members ({room.memberIds.length})
              </h3>
              <button
                onClick={() => openMembersModal(room)}
                className="text-xs text-purple-400 hover:text-purple-300 font-semibold"
              >
                View all &rarr;
              </button>
            </div>

            <div
              onClick={() => openMembersModal(room)}
              className="flex items-center gap-2 cursor-pointer p-2 rounded-xl hover:bg-white/5 transition-colors overflow-hidden"
            >
              <div className="flex -space-x-2.5 overflow-hidden">
                {members.slice(0, 5).map((m) => (
                  <Avatar
                    key={m.id}
                    src={m.avatarUrl}
                    alt={m.fullName}
                    size="sm"
                    showBorder
                  />
                ))}
              </div>
              {members.length > 5 && (
                <span className="text-xs text-slate-400 font-semibold pl-1">
                  +{members.length - 5}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Disband Confirmation Modal */}
      {showDisbandConfirmation && room && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowDisbandConfirmation(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#0f1122] border border-red-500/30 p-5 sm:p-6 shadow-2xl shadow-black/90 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="details-disband-modal-title"
          >
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shadow-inner">
                <Trash2 className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => setShowDisbandConfirmation(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <h3 id="details-disband-modal-title" className="text-base font-bold text-white tracking-wide">
                Disband Room?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                As the room host, disbanding <span className="font-semibold text-white">"{room.name}"</span> will permanently delete this room and disconnect all members.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowDisbandConfirmation(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-semibold text-white transition-all border border-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-details-disband-btn"
                onClick={handleConfirmDisband}
                disabled={isDisbanding}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 text-xs font-semibold text-white shadow-md shadow-red-900/40 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDisbanding ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Disbanding...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Disband Room</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

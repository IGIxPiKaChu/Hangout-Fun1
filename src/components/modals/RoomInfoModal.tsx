import React, { useState } from 'react';
import { Modal } from '../common/Modal.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { Badge } from '../common/Badge.tsx';
import type { Room, RoomMemberUser, User } from '../../types/index.ts';
import {
  Info,
  Users,
  Globe,
  Lock,
  Film,
  Shield,
  ShieldCheck,
  Crown,
  Share2,
  Copy,
  Check,
  LogOut,
  Trash2,
  VolumeX,
  Sparkles,
  ChevronRight,
  Clock,
  Calendar,
} from 'lucide-react';

interface RoomInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  members: RoomMemberUser[];
  currentUser: User | null;
  onOpenMembersModal: () => void;
  onShare: () => void;
  onLeaveRoom: () => void;
  onDisbandRoom: () => void;
}

export const RoomInfoModal: React.FC<RoomInfoModalProps> = ({
  isOpen,
  onClose,
  room,
  members,
  currentUser,
  onOpenMembersModal,
  onShare,
  onLeaveRoom,
  onDisbandRoom,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeSection, setActiveSection] = useState<'details' | 'permissions' | 'members'>('details');

  const isHost = room.hostId === currentUser?.id;
  const isAdmin = (room.adminIds || []).includes(currentUser?.id || '');
  const isCurrentUserMuted = (room.mutedUserIds || []).includes(currentUser?.id || '');
  const hasMediaPerm = isHost || isAdmin || (room.allowedMediaUserIds || []).includes(currentUser?.id || '');

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const allowedMediaCount = members.filter(
    (m) => m.isHost || m.isAdmin || (room.allowedMediaUserIds || []).includes(m.id)
  ).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Room Info & Settings" maxWidth="lg">
      <div className="space-y-4 pt-1">
        {/* Banner & Room Header Card */}
        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#121424]">
          <div className="h-28 sm:h-32 w-full relative">
            <img
              src={room.bannerUrl || 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800&auto=format&fit=crop'}
              alt={room.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#121424] via-[#121424]/60 to-transparent" />
            
            {/* Quick Status Pill */}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
              <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white flex items-center gap-1">
                {room.type === 'public' ? (
                  <>
                    <Globe className="w-3 h-3 text-emerald-400" />
                    <span>Public</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3 text-amber-400" />
                    <span>Private</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Room Icon & Identity */}
          <div className="px-4 pb-4 -mt-8 relative z-10 flex items-start justify-between gap-3">
            <div className="flex items-end gap-3 min-w-0">
              <div className="w-14 h-14 rounded-2xl border-2 border-[#121424] bg-[#1a1d33] overflow-hidden shrink-0 shadow-xl flex items-center justify-center">
                <img
                  src={room.hostAvatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${room.id}`}
                  alt={room.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 pb-0.5">
                <h2 className="text-base sm:text-lg font-bold text-white truncate leading-tight">
                  {room.name}
                </h2>
                <p className="text-[11px] text-purple-300 flex items-center gap-1 mt-0.5">
                  <span>Host:</span>
                  <span className="font-semibold text-white truncate">{room.hostName}</span>
                  {isHost && (
                    <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-semibold text-[9px] border border-purple-500/30">
                      You
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Room Code Badge + Copy */}
            <button
              type="button"
              id="btn-copy-room-code"
              onClick={handleCopyCode}
              className="shrink-0 mt-8 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 flex items-center gap-1.5 text-xs text-white transition-all active:scale-95"
              title="Click to copy room code"
            >
              <span className="font-mono font-bold tracking-wider text-[11px] text-purple-300">
                {room.code}
              </span>
              {copiedCode ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400 hover:text-white" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/10 text-xs">
          <button
            type="button"
            onClick={() => setActiveSection('details')}
            className={`flex-1 py-1.5 px-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeSection === 'details'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('permissions')}
            className={`flex-1 py-1.5 px-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeSection === 'permissions'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Permissions</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('members')}
            className={`flex-1 py-1.5 px-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeSection === 'members'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Members ({members.length})</span>
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeSection === 'details' && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            {/* Description */}
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Description
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                {room.description || 'No description provided for this room.'}
              </p>
            </div>

            {/* Quick Metadata Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                  <Users className="w-3 h-3 text-purple-400" />
                  <span>Participants</span>
                </div>
                <div className="text-xs font-bold text-white mt-1">
                  {members.length} / {room.maxMembers}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                  <Film className="w-3 h-3 text-indigo-400" />
                  <span>Stage Media</span>
                </div>
                <div className="text-xs font-bold text-white mt-1 truncate">
                  {room.currentMedia ? room.currentMedia.title : 'No active media'}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 col-span-2 sm:col-span-1">
                <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  <span>Hangout Status</span>
                </div>
                <div className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {room.upcomingSessionTime || 'Live Now'}
                </div>
              </div>
            </div>

            {/* Tags */}
            {room.tags && room.tags.length > 0 && (
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Tags & Category
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {room.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-0.5 rounded-full bg-purple-900/30 text-purple-300 border border-purple-500/20 text-[11px] font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
                  <span className="px-2.5 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10 text-[11px]">
                    {room.language || 'English'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ROOM PERMISSIONS */}
        {activeSection === 'permissions' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            {/* Media Permission Summary */}
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Film className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Stage Media Playback</h4>
                    <p className="text-[10px] text-slate-400">Who is permitted to stream videos to the player</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-purple-600/20 border border-purple-500/30 text-[10px] font-bold text-purple-300">
                  {allowedMediaCount} Allowed
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 text-[11px] text-slate-300 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span><strong>Host & Admins:</strong> Full authority to add, switch, or stop stage media.</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span><strong>Specific Members:</strong> Can be granted permission via the Members panel.</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-300 font-medium">Your media status:</span>
                {hasMediaPerm ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Can Add Media
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-slate-500/20 border border-slate-500/30 text-slate-400 text-[10px] font-bold">
                    View Only
                  </span>
                )}
              </div>
            </div>

            {/* Chat & Moderation Permissions */}
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Chat & Moderation</h4>
                  <p className="text-[10px] text-slate-400">Rules and privileges within the chat stream</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-black/30 border border-white/5">
                  <div className="text-slate-400 text-[10px]">Your Chat Access</div>
                  <div className="font-semibold text-white mt-0.5 flex items-center gap-1">
                    {isCurrentUserMuted ? (
                      <span className="text-red-400 flex items-center gap-1">
                        <VolumeX className="w-3 h-3" /> Muted
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Active (Can send chat & photos)
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-black/30 border border-white/5">
                  <div className="text-slate-400 text-[10px]">Your Role</div>
                  <div className="font-semibold text-white mt-0.5">
                    {isHost ? '👑 Room Host' : isAdmin ? '🛡️ Room Admin' : 'Participant'}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick shortcut to open full members management */}
            {isHost && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMembersModal();
                }}
                className="w-full py-2.5 px-3.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-200 text-xs font-semibold flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" />
                  <span>Configure Member Media & Mod Permissions</span>
                </div>
                <ChevronRight className="w-4 h-4 text-purple-400" />
              </button>
            )}
          </div>
        )}

        {/* TAB 3: MEMBERS LIST */}
        {activeSection === 'members' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-slate-400 font-medium">
                Active Participants in Room ({members.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMembersModal();
                }}
                className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
              >
                <span>Manage All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {members.map((member) => {
                const isMemberHost = member.isHost || member.id === room.hostId;
                const isMemberAdmin = member.isAdmin || (room.adminIds || []).includes(member.id);
                const isMemberMediaAllowed =
                  isMemberHost || isMemberAdmin || (room.allowedMediaUserIds || []).includes(member.id);
                const isMemberMuted = member.isMuted || (room.mutedUserIds || []).includes(member.id);

                return (
                  <div
                    key={member.id}
                    className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        src={member.avatarUrl}
                        alt={member.fullName}
                        size="sm"
                        showBorder={isMemberHost}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                          <span>{member.fullName}</span>
                          {member.id === currentUser?.id && (
                            <span className="text-[9px] text-slate-400 font-normal">(You)</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          @{member.username}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isMemberHost && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[9px] font-bold flex items-center gap-1">
                          <Crown className="w-2.5 h-2.5 text-amber-400" /> Host
                        </span>
                      )}
                      {!isMemberHost && isMemberAdmin && (
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/20 border border-sky-500/30 text-sky-300 text-[9px] font-bold">
                          Admin
                        </span>
                      )}
                      {isMemberMediaAllowed && !isMemberHost && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[9px] font-bold flex items-center gap-1">
                          <Film className="w-2.5 h-2.5" /> Media
                        </span>
                      )}
                      {isMemberMuted && (
                        <span className="px-2 py-0.5 rounded-md bg-red-500/20 border border-red-500/30 text-red-300 text-[9px] font-bold flex items-center gap-1">
                          <VolumeX className="w-2.5 h-2.5" /> Muted
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons (Share, Leave, Disband) */}
        <div className="pt-2 border-t border-white/10 space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="room-info-share-btn"
              onClick={() => {
                onShare();
              }}
              className="flex-1 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <Share2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Share Room Code</span>
            </button>

            <button
              type="button"
              id="room-info-leave-btn"
              onClick={() => {
                onClose();
                onLeaveRoom();
              }}
              className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>Leave</span>
            </button>
          </div>

          {/* Host Disband Option */}
          {isHost && (
            <button
              type="button"
              id="room-info-disband-btn"
              onClick={() => {
                onClose();
                onDisbandRoom();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-bold text-red-400 hover:text-red-300 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Disband Room (Host Only)</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

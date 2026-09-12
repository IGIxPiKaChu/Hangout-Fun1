import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, Plus, Users, Lock, Globe, Clock, Calendar } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Room } from '../types/index.ts';
import { EmptyState } from '../components/common/EmptyState.tsx';

export const RoomsScreen: React.FC = () => {
  const { navigate, openCreateRoom, showToast } = useApp();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'discover' | 'active' | 'mine'>('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'public' | 'private'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const fetchRooms = async () => {
    setIsLoading(true);
    try {
      const res = await api.getRooms({
        tab: activeTab,
        q: searchQuery,
        userId: currentUser?.id,
      }).catch((err) => {
        console.warn('Rooms fetch fallback:', err);
        return { rooms: [] as Room[] };
      });
      let list = Array.isArray(res?.rooms) ? res.rooms : [];
      if (filterType === 'public') list = list.filter((r) => r.type === 'public');
      if (filterType === 'private') list = list.filter((r) => r.type === 'private');
      setRooms(list);
    } catch (err) {
      console.error('Failed to load rooms:', err);
      setRooms([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [activeTab, filterType, currentUser]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRooms();
  };

  const handleJoin = async (room: Room) => {
    if (!currentUser) return;
    try {
      await api.joinRoom(room.id, currentUser.id);
      showToast(`Joined ${room.name}!`);
      navigate('room-view', { roomId: room.id });
    } catch (err: any) {
      showToast(err?.message || 'Failed to join room.');
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-120px)] pb-24 pt-2 px-4 max-w-2xl mx-auto space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between px-1">
        <h1 className="text-xl font-bold text-white tracking-tight">Rooms</h1>
        <button
          onClick={openCreateRoom}
          className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Room</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 rounded-xl bg-[#141628] border border-white/5">
        {(['discover', 'active', 'mine'] as const).map((tab) => (
          <button
            key={tab}
            id={`rooms-tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg capitalize transition-all ${
              activeTab === tab
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="rooms-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rooms..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#141628] border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilterMenu(!showFilterMenu)}
          className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${
            filterType !== 'all' || showFilterMenu
              ? 'bg-purple-600/20 border-purple-500 text-purple-400'
              : 'bg-[#141628] border-white/10 text-slate-300 hover:text-white'
          }`}
          aria-label="Filter rooms"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </form>

      {/* Filter Menu Dropdown */}
      {showFilterMenu && (
        <div className="p-3 rounded-xl bg-[#141628] border border-purple-500/20 flex items-center gap-2 animate-in fade-in duration-150 text-xs">
          <span className="text-slate-400 font-medium">Type:</span>
          {(['all', 'public', 'private'] as const).map((type) => (
            <button
              key={type}
              onClick={() => {
                setFilterType(type);
                setShowFilterMenu(false);
              }}
              className={`px-3 py-1 rounded-lg capitalize font-medium transition-all ${
                filterType === type
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {/* Rooms List */}
      {isLoading ? (
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 rounded-2xl bg-[#141628]/60 border border-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            activeTab === 'mine'
              ? "You haven't joined any rooms yet"
              : searchQuery
              ? 'No matching rooms found'
              : 'No rooms available'
          }
          description={
            activeTab === 'mine'
              ? 'Create your own room or discover public hangouts to join.'
              : 'Start a new room and invite your friends to hang out.'
          }
          actionText="Create Room"
          onAction={openCreateRoom}
          className="mt-6"
        />
      ) : (
        <div className="space-y-3 pt-1">
          {rooms.map((room) => {
            const isJoined = currentUser && room.memberIds.includes(currentUser.id);
            const isBanned = currentUser && (room.bannedUserIds || []).includes(currentUser.id);
            const isHost = currentUser && room.hostId === currentUser.id;
            const isAdmin = currentUser && (room.adminIds || []).includes(currentUser.id);

            return (
              <div
                key={room.id}
                className="p-3.5 rounded-2xl bg-[#141628] border border-white/5 hover:border-purple-500/30 transition-all flex items-center justify-between gap-3 group"
              >
                <div
                  onClick={() => {
                    if (isBanned) {
                      showToast('You are banned from this room by the host.');
                    } else {
                      navigate('room-details', { roomId: room.id });
                    }
                  }}
                  className="flex items-center gap-3.5 cursor-pointer min-w-0 flex-1"
                >
                  <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-purple-950/40 relative">
                    <img
                      src={room.bannerUrl}
                      alt={room.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute top-1 right-1 p-0.5 rounded-md bg-black/60 text-slate-300">
                      {room.type === 'private' ? (
                        <Lock className="w-2.5 h-2.5 text-amber-400" />
                      ) : (
                        <Globe className="w-2.5 h-2.5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                        {room.name}
                      </h3>
                      {isHost && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold shrink-0">
                          👑 Host
                        </span>
                      )}
                      {!isHost && isAdmin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold shrink-0">
                          🛡️ Co-Host
                        </span>
                      )}
                      {room.tags[0] && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-500/20 shrink-0">
                          {room.tags[0]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      Hosted by {room.hostName}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                        <Users className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>{room.memberIds.length}/{room.maxMembers}</span>
                      </span>
                      {room.upcomingSessionTime && (
                        <>
                          <span className="text-slate-600 shrink-0">•</span>
                          <span className="flex items-center gap-1 text-purple-300 shrink-0 whitespace-nowrap">
                            {room.isScheduled ? (
                              <Calendar className="w-3 h-3 text-purple-400 shrink-0" />
                            ) : (
                              <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                            )}
                            <span>{room.upcomingSessionTime}</span>
                          </span>
                        </>
                      )}
                      {room.language && (
                        <>
                          <span className="hidden sm:inline text-slate-600 shrink-0">•</span>
                          <span className="hidden sm:inline text-slate-400 shrink-0 whitespace-nowrap">{room.language}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (isBanned) {
                      showToast('You are banned from joining this room by the host.');
                    } else if (isJoined) {
                      navigate('room-view', { roomId: room.id });
                    } else {
                      handleJoin(room);
                    }
                  }}
                  disabled={isBanned}
                  className={`shrink-0 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-all active:scale-95 ${
                    isBanned
                      ? 'bg-red-950/40 text-red-400 border border-red-500/30 cursor-not-allowed opacity-80'
                      : isJoined
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/30'
                  }`}
                >
                  {isBanned ? 'Banned' : isJoined ? 'Enter' : 'Join'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Action Button for Create Room */}
      <button
        id="rooms-floating-create-btn"
        onClick={openCreateRoom}
        aria-label="Create a room"
        className="fixed bottom-20 right-6 md:bottom-8 md:right-8 z-30 w-13 h-13 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-xl shadow-purple-900/50 active:scale-95 transition-all"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
};

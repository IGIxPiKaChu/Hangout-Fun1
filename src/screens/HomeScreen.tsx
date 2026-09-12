import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  ChevronRight,
  Users,
  UserPlus,
  Sparkles,
  Plus,
  Radio,
  Shield,
  MessageSquare,
  Bell,
  Smartphone,
  RefreshCw,
  X,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Room, User } from '../types/index.ts';
import { Avatar } from '../components/common/Avatar.tsx';
import { EmptyState } from '../components/common/EmptyState.tsx';

export const HomeScreen: React.FC = () => {
  const { navigate, openCreateRoom, openJoinRoom, showToast, isUserOnline } = useApp();
  const { currentUser } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [upcomingRooms, setUpcomingRooms] = useState<Room[]>([]);
  const [allFriends, setAllFriends] = useState<User[]>([]);
  const [totalFriendsCount, setTotalFriendsCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Derive online friends from allFriends using live presence
  const activeFriends = allFriends.filter((u) => u.id !== currentUser?.id && isUserOnline(u.id));

  // Search results state
  const [isSearching, setIsSearching] = useState(false);
  const [searchRooms, setSearchRooms] = useState<Room[]>([]);
  const [searchUsers, setSearchUsers] = useState<User[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadHomeData = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [roomsRes, friendsRes] = await Promise.all([
        api.getRooms({ tab: 'active', limit: 10 }).catch(async (roomsErr) => {
          console.warn('Initial getRooms attempt failed, retrying once...', roomsErr);
          try {
            return await api.getRooms({ tab: 'active', limit: 10 });
          } catch (retryErr) {
            console.warn('Fallback: empty rooms list due to network error:', retryErr);
            return { rooms: [] as Room[] };
          }
        }),
        currentUser
          ? api.getFriends().catch(() => ({ friends: [] as User[] }))
          : Promise.resolve({ friends: [] as User[] }),
      ]);

      setUpcomingRooms(roomsRes?.rooms || []);
      const userFriends = friendsRes?.friends || [];
      setTotalFriendsCount(userFriends.length);
      setAllFriends(userFriends);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load home feed:', err);
      const isNetwork =
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('Load failed');
      setError(
        isNetwork
          ? 'Unable to reach the server. Please check your connection or tap retry.'
          : (err?.message || 'Unable to load content. Please try again.')
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  // Handle live debounced search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setIsSearching(false);
      setSearchRooms([]);
      setSearchUsers([]);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      return;
    }

    setIsSearching(true);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const [roomsRes, usersRes] = await Promise.all([
          api.getRooms({ q: trimmed, limit: 20 }),
          api.getUsers({ q: trimmed, limit: 20 }),
        ]);
        setSearchRooms(roomsRes.rooms || []);
        setSearchUsers((usersRes.users || []).filter((u) => u.id !== currentUser?.id));
      } catch (err) {
        console.error('Home search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, currentUser?.id]);

  const handleJoinRoom = async (room: Room) => {
    if (!currentUser) {
      showToast('Please log in to join rooms.');
      return;
    }
    try {
      await api.joinRoom(room.id, currentUser.id);
      showToast(`Joined ${room.name}!`);
      navigate('room-view', { roomId: room.id });
    } catch (err: any) {
      showToast(err?.message || 'Could not join room.');
    }
  };

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div className="pb-24 pt-2 px-4 max-w-2xl mx-auto space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          id="home-search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search rooms, people..."
          className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-[#141628] border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all shadow-inner"
        />
        {searchQuery.trim() && (
          <button
            id="home-search-clear"
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
            title="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Global Error Banner with Retry */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex items-start gap-3 text-xs text-rose-200">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-rose-100">Failed to load content</p>
            <p className="text-rose-300/90 mt-0.5">{error}</p>
          </div>
          <button
            id="home-retry-btn"
            onClick={() => loadHomeData(false)}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors shrink-0 shadow"
          >
            Retry
          </button>
        </div>
      )}

      {/* SEARCH RESULTS VIEW */}
      {isSearchActive ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-white tracking-wide">
              Search Results for &ldquo;{searchQuery.trim()}&rdquo;
            </h2>
            <button
              id="home-search-clear-link"
              onClick={() => setSearchQuery('')}
              className="text-xs text-purple-400 hover:text-purple-300 font-semibold"
            >
              Clear
            </button>
          </div>

          {isSearching ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-20 rounded-2xl bg-[#141628]/60 border border-white/5 animate-pulse"
                />
              ))}
            </div>
          ) : searchRooms.length === 0 && searchUsers.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No results found"
              description={`We couldn't find any rooms or members matching "${searchQuery.trim()}". Try another keyword.`}
              actionText="Clear Search"
              onAction={() => setSearchQuery('')}
            />
          ) : (
            <>
              {/* Matching Members */}
              {searchUsers.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Members ({searchUsers.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {searchUsers.map((user) => (
                      <button
                        key={user.id}
                        id={`search-user-${user.id}`}
                        onClick={() => navigate('other-profile', { userId: user.id })}
                        className="p-3 rounded-2xl bg-[#141628] border border-white/5 hover:border-purple-500/30 transition-all flex items-center gap-3 text-left group"
                      >
                        <Avatar
                          src={user.avatarUrl}
                          alt={user.fullName}
                          size="md"
                          isOnline={isUserOnline(user.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                            {user.fullName}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">@{user.username}</p>
                        </div>
                        <span className="text-[10px] text-purple-400 font-semibold shrink-0">
                          View &rarr;
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Matching Rooms */}
              {searchRooms.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Rooms ({searchRooms.length})
                    </span>
                  </div>
                  <div className="space-y-3">
                    {searchRooms.map((room) => {
                      const isJoined = currentUser && room.memberIds.includes(currentUser.id);
                      return (
                        <div
                          key={room.id}
                          className="p-3.5 rounded-2xl bg-[#141628] border border-white/5 hover:border-purple-500/30 transition-all flex items-center justify-between gap-3 group"
                        >
                          <div
                            onClick={() => navigate('room-details', { roomId: room.id })}
                            className="flex items-center gap-3.5 cursor-pointer min-w-0 flex-1"
                          >
                            <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-purple-950/40">
                              <img
                                src={room.bannerUrl}
                                alt={room.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                                  {room.name}
                                </h4>
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
                                  <span>
                                    {room.memberIds.length}/{room.maxMembers}
                                  </span>
                                </span>
                                {room.upcomingSessionTime && (
                                  <>
                                    <span className="text-slate-600 shrink-0">•</span>
                                    <span className="text-purple-300 shrink-0 whitespace-nowrap">
                                      {room.upcomingSessionTime}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            id={`search-join-room-${room.id}`}
                            onClick={() => {
                              if (isJoined) {
                                navigate('room-view', { roomId: room.id });
                              } else {
                                handleJoinRoom(room);
                              }
                            }}
                            className={`shrink-0 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-all active:scale-95 ${
                              isJoined
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/30'
                            }`}
                          >
                            {isJoined ? 'Enter' : 'Join'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* STANDARD FEED VIEW */
        <>
          {/* Active Now Avatars Rail (Friends Only) */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Active Now
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {activeFriends.length > 0 && (
                  <span className="text-xs text-purple-400 font-semibold">
                    {activeFriends.length} online
                  </span>
                )}
                <button
                  id="home-refresh-btn"
                  onClick={() => loadHomeData(true)}
                  disabled={isLoading || isRefreshing}
                  title="Refresh home data"
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-40"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-purple-400' : ''}`}
                  />
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-3 overflow-hidden py-1">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className="w-12 h-12 rounded-full bg-[#141628]/60 border border-white/5 animate-pulse" />
                    <div className="w-10 h-2 rounded bg-white/5 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : !currentUser ? (
              <div className="p-4 rounded-2xl bg-[#141628]/60 border border-white/5 flex items-center justify-between text-xs text-slate-400">
                <span>Sign in to see which friends are online.</span>
                <button
                  id="home-login-friends-btn"
                  onClick={() => navigate('login')}
                  className="text-purple-400 hover:text-purple-300 font-semibold"
                >
                  Log In &rarr;
                </button>
              </div>
            ) : totalFriendsCount === 0 ? (
              /* User has 0 friends */
              <div className="p-4 rounded-2xl bg-[#141628]/60 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 text-purple-400">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-200">No friends added yet</p>
                    <p className="text-slate-400 text-[11px]">
                      Add friends to see who is active and hang out together.
                    </p>
                  </div>
                </div>
                <button
                  id="home-add-friends-btn"
                  onClick={() => navigate('friends')}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/30 shrink-0 transition-all active:scale-95"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Friends</span>
                </button>
              </div>
            ) : activeFriends.length === 0 ? (
              /* User has friends, but none are online right now */
              <div className="p-4 rounded-2xl bg-[#141628]/60 border border-white/5 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  <span>None of your friends are online right now.</span>
                </div>
                <button
                  id="home-view-all-friends-btn"
                  onClick={() => navigate('friends')}
                  className="text-purple-400 hover:text-purple-300 font-semibold shrink-0"
                >
                  View Friends &rarr;
                </button>
              </div>
            ) : (
              /* Active friends rail */
              <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-none">
                {activeFriends.map((friend) => (
                  <button
                    key={friend.id}
                    id={`active-friend-${friend.id}`}
                    onClick={() => navigate('other-profile', { userId: friend.id })}
                    className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none"
                  >
                    <div className="p-0.5 rounded-full ring-2 ring-purple-500/40 group-hover:ring-purple-400 transition-all">
                      <Avatar
                        src={friend.avatarUrl}
                        alt={friend.fullName}
                        size="md"
                        isOnline={isUserOnline(friend.id)}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-slate-300 truncate max-w-[64px]">
                      {friend.fullName.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Action Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-purple-900/40 border border-purple-500/30 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Host Your Own Hangout
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Create a public room or start a private session with code.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                id="home-enter-code-btn"
                onClick={openJoinRoom}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all shrink-0"
              >
                Enter Code
              </button>
              <button
                id="home-create-room-btn"
                onClick={openCreateRoom}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-900/40 transition-all flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create</span>
              </button>
            </div>
          </div>

          {/* Upcoming / Active Rooms */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-sm font-bold text-white tracking-wide">Upcoming Rooms</h2>
              <button
                id="home-view-all-rooms-btn"
                onClick={() => navigate('rooms')}
                className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-0.5 transition-colors"
              >
                <span>View all</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((n) => (
                  <div
                    key={n}
                    className="h-24 rounded-2xl bg-[#141628]/60 border border-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : upcomingRooms.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No active rooms yet"
                description="Be the first to start a hangout room! Watch, talk, and invite friends."
                actionText="Create a Room"
                onAction={openCreateRoom}
              />
            ) : (
              <div className="space-y-3">
                {upcomingRooms.slice(0, 4).map((room) => {
                  const isJoined = currentUser && room.memberIds.includes(currentUser.id);
                  return (
                    <div
                      key={room.id}
                      className="p-3.5 rounded-2xl bg-[#141628] border border-white/5 hover:border-purple-500/30 transition-all flex items-center justify-between gap-3 group"
                    >
                      <div
                        onClick={() => navigate('room-details', { roomId: room.id })}
                        className="flex items-center gap-3.5 cursor-pointer min-w-0 flex-1"
                      >
                        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-purple-950/40">
                          <img
                            src={room.bannerUrl}
                            alt={room.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                              {room.name}
                            </h4>
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
                              <span>
                                {room.memberIds.length}/{room.maxMembers}
                              </span>
                            </span>
                            {room.upcomingSessionTime && (
                              <>
                                <span className="text-slate-600 shrink-0">•</span>
                                <span className="text-purple-300 shrink-0 whitespace-nowrap">
                                  {room.upcomingSessionTime}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        id={`home-room-btn-${room.id}`}
                        onClick={() => {
                          if (isJoined) {
                            navigate('room-view', { roomId: room.id });
                          } else {
                            handleJoinRoom(room);
                          }
                        }}
                        className={`shrink-0 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-all active:scale-95 ${
                          isJoined
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/30'
                        }`}
                      >
                        {isJoined ? 'Enter' : 'Join'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Why You'll Love Social Hangout Features */}
          <div className="mt-8 pt-6 border-t border-white/5">
            <div className="text-center mb-5">
              <h3 className="text-base font-bold text-white">Why You&apos;ll Love Social Hangout</h3>
              <p className="text-xs text-slate-400 mt-1">
                Built for real connections and unforgettable moments
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-[#121424] border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-950/60 text-purple-400 shrink-0">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Real-time Hangouts</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Watch, listen and hangout together in real-time.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#121424] border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-950/60 text-indigo-400 shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Instant Messaging</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Chat privately or in groups with anyone.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#121424] border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-pink-950/60 text-pink-400 shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Smart Notifications</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Never miss important updates and room invites.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#121424] border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-950/60 text-blue-400 shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Secure & Private</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Your data is safe with zero-leak permissions.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#121424] border border-white/5 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-950/60 text-emerald-400 shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Cross Platform</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Use anywhere on mobile, tablet or desktop.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

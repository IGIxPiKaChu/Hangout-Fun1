import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../common/Modal.tsx';
import { Youtube, Search, Play, X, Film, Loader2 } from 'lucide-react';
import type { SelectedMediaPayload } from './SelectMediaModal.tsx';
import { api } from '../../services/api.ts';

export interface YouTubeVideoItem {
  id: string;
  title: string;
  channel: string;
  duration: string;
  views?: string;
  category?: string;
}

const RANDOM_VIDEOS: YouTubeVideoItem[] = [
  {
    id: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio 📚 - beats to relax/study to',
    channel: 'Lofi Girl',
    duration: 'LIVE',
    category: 'Music',
  },
  {
    id: 'LXb3EKWsInQ',
    title: '4K Ocean Life & Coral Reef Wonders - Calming Underwater World',
    channel: 'Nature Relaxation',
    duration: '3:15:20',
    category: 'Nature',
  },
  {
    id: '4xDzrJKXOOY',
    title: 'synthwave radio 🌌 - chill / retro cyberpunk beats',
    channel: 'Lofi Girl Synthwave',
    duration: 'LIVE',
    category: 'Music',
  },
  {
    id: 'zSWdZVtXT7E',
    title: 'Interstellar - Official Main Trailer',
    channel: 'Warner Bros. Pictures',
    duration: '2:32',
    category: 'Movies',
  },
  {
    id: 'QdBZY2fkU-0',
    title: 'Grand Theft Auto VI Trailer 1',
    channel: 'Rockstar Games',
    duration: '1:31',
    category: 'Gaming',
  },
  {
    id: 'BO8lX3hDU30',
    title: 'Cyberpunk 2077: Phantom Liberty - Official Launch Trailer',
    channel: 'Cyberpunk 2077',
    duration: '2:45',
    category: 'Gaming',
  },
  {
    id: 'lTRiuFIWV54',
    title: 'Relaxing Piano Music with Soft Gentle Rain',
    channel: 'Quiet Quest',
    duration: '3:00:00',
    category: 'Relax',
  },
  {
    id: 'a3U_F_i0P58',
    title: 'Minecraft Volume Alpha (Full Calming OST Mix)',
    channel: 'C418',
    duration: '59:31',
    category: 'Gaming',
  },
  {
    id: 'e3L1I7i4Zq4',
    title: 'Cozy Coffee Shop Ambience - Warm Jazz & Bookstore Rain',
    channel: 'Calm Soundscapes',
    duration: '4:00:00',
    category: 'Ambience',
  },
  {
    id: 'BHACKCNDMW8',
    title: 'Most Beautiful Places on Earth in 4K Ultra HD',
    channel: 'Scenic Relaxation',
    duration: '1:02:18',
    category: 'Travel',
  },
  {
    id: 'P4Uv6m2V-wU',
    title: 'Deep Space Galaxy Voyage - Cosmic Ambient Soundscapes',
    channel: 'Space Sounds',
    duration: '2:30:15',
    category: 'Space',
  },
  {
    id: 'x7vN5eL46qU',
    title: 'Epic Motivational & Orchestral Soundtrack Mix',
    channel: 'Epic Music World',
    duration: '1:15:40',
    category: 'Epic',
  },
];

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/,
  );
  if (match && match[1]) {
    return match[1];
  }
  if (/^[\w-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

interface YouTubeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVideo: (media: SelectedMediaPayload) => void;
}

export const YouTubeModal: React.FC<YouTubeModalProps> = ({
  isOpen,
  onClose,
  onSelectVideo,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeVideoItem[] | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Detect direct YouTube link or ID typed in search
  const directId = useMemo(() => {
    return extractYouTubeId(searchQuery);
  }, [searchQuery]);

  // Debounced live search via server API
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setNextPageToken(null);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.searchYouTubeVideos(q, { limit: 25 });
        if (Array.isArray(res.videos)) {
          setSearchResults(res.videos);
          setNextPageToken(res.nextPageToken || null);
        }
      } catch (err) {
        console.warn('YouTube search fetch failed:', err);
        // Fall back to catalog filtering on error
        const matched = RANDOM_VIDEOS.filter(
          (v) =>
            v.title.toLowerCase().includes(q.toLowerCase()) ||
            v.channel.toLowerCase().includes(q.toLowerCase())
        );
        setSearchResults(matched);
        setNextPageToken(null);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleLoadMore = async () => {
    const q = searchQuery.trim();
    if (!q || !nextPageToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await api.searchYouTubeVideos(q, { limit: 25, pageToken: nextPageToken });
      if (Array.isArray(res.videos)) {
        setSearchResults((prev) => [...(prev || []), ...res.videos]);
        setNextPageToken(res.nextPageToken || null);
      }
    } catch (err) {
      console.warn('Failed to load more YouTube search results:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const displayedVideos = useMemo(() => {
    if (searchResults !== null) {
      return searchResults;
    }
    return RANDOM_VIDEOS;
  }, [searchResults]);

  const handleSelect = (video: { id: string; title: string }) => {
    onSelectVideo({
      type: 'youtube',
      url: `https://www.youtube.com/watch?v=${video.id}`,
      title: video.title,
    });
    handleClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults(null);
    setNextPageToken(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="YouTube" maxWidth="lg" zIndex="z-[60]">
      <div className="space-y-4">
        {/* Search option input: | ______________search_____________| */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            id="youtube-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search videos or paste YouTube link..."
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#0f1120] border border-white/10 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-red-500 transition-all"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              id="youtube-search-clear"
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* If direct YouTube link / ID detected */}
        {directId && (
          <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/30 flex items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-16 h-10 rounded-lg overflow-hidden bg-black shrink-0 relative">
                <img
                  src={`https://img.youtube.com/vi/${directId}/hqdefault.jpg`}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">YouTube Video ({directId})</p>
                <p className="text-[11px] text-red-300">Custom link detected</p>
              </div>
            </div>
            <button
              type="button"
              id="youtube-select-direct"
              onClick={() => handleSelect({ id: directId, title: `YouTube Video (${directId})` })}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-xs font-bold text-white shrink-0 transition-all"
            >
              Select
            </button>
          </div>
        )}

        {/* Videos section: | videos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              {searchQuery ? `Search Results (${displayedVideos.length})` : 'Popular & Curated Videos'}
              {isSearching && <Loader2 className="w-3 h-3 text-red-500 animate-spin" />}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[52vh] overflow-y-auto pr-1">
            {displayedVideos.length === 0 && !directId ? (
              <div className="col-span-full py-8 text-center text-slate-400 text-xs">
                <Film className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p>No videos found for "{searchQuery}"</p>
                <p className="text-[11px] text-slate-500 mt-1">Try another search term or paste a direct YouTube link</p>
              </div>
            ) : (
              displayedVideos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  id={`youtube-video-${video.id}`}
                  onClick={() => handleSelect(video)}
                  className="group flex flex-col p-2 rounded-xl bg-[#141628] border border-white/5 hover:border-red-500/40 hover:bg-[#171a2e] text-left transition-all relative overflow-hidden"
                >
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-black/50 mb-2">
                    <img
                      src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                    <div className="absolute right-1.5 bottom-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[10px] font-mono text-white">
                      {video.duration}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg shadow-black/50 transform group-hover:scale-110 transition-transform">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                    </div>
                  </div>

                  <h4 className="text-xs font-semibold text-white line-clamp-2 group-hover:text-red-300 transition-colors leading-snug">
                    {video.title}
                  </h4>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <span className="truncate">{video.channel}</span>
                    {video.category && (
                      <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-400 shrink-0 ml-1">
                        {video.category}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}

            {searchResults !== null && nextPageToken && (
              <div className="col-span-full py-2 flex justify-center">
                <button
                  type="button"
                  id="youtube-load-more"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-semibold text-white border border-white/10 flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {isLoadingMore && <Loader2 className="w-3.5 h-3.5 text-red-500 animate-spin" />}
                  {isLoadingMore ? 'Loading more videos...' : 'Load more results'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

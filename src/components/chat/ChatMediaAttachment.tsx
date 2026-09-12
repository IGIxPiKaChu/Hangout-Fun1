import React, { useState } from 'react';
import {
  Youtube,
  Play,
  ExternalLink,
  Volume2,
  Film,
  Image as ImageIcon,
  Maximize2,
  Tv,
} from 'lucide-react';
import { extractYouTubeId } from '../modals/SelectMediaModal.tsx';
import type { CurrentMedia } from '../../types/index.ts';

interface ChatMediaAttachmentProps {
  url: string;
  mediaType?: 'youtube' | 'image' | 'video' | 'audio' | 'link';
  mediaTitle?: string;
  isMe?: boolean;
  onPlayInPlayer?: (media: CurrentMedia) => void;
}

export const ChatMediaAttachment: React.FC<ChatMediaAttachmentProps> = ({
  url,
  mediaType,
  mediaTitle,
  isMe = false,
  onPlayInPlayer,
}) => {
  const [isPlayingInline, setIsPlayingInline] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  // Auto-detect YouTube even if mediaType wasn't explicitly stored
  const youtubeId = extractYouTubeId(url);
  const isYoutube = mediaType === 'youtube' || !!youtubeId;

  const handlePlayInChatPlayer = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (onPlayInPlayer) {
      onPlayInPlayer({
        type: isYoutube ? 'youtube' : (mediaType === 'audio' ? 'audio' : 'video'),
        url,
        title: mediaTitle || (isYoutube ? 'YouTube Video' : mediaType === 'audio' ? 'Audio Track' : 'Video Clip'),
        youtubeId: youtubeId || undefined,
        startedAt: Date.now(),
      });
    } else {
      setIsPlayingInline(true);
    }
  };

  // YouTube Attachment
  if (isYoutube && youtubeId) {
    const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

    return (
      <div className="mt-2 w-full max-w-sm rounded-xl overflow-hidden border border-white/10 bg-[#0d0f1c] shadow-lg">
        {isPlayingInline && !onPlayInPlayer ? (
          <div className="relative aspect-video w-full bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
              title={mediaTitle || 'YouTube video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          </div>
        ) : (
          <div
            onClick={handlePlayInChatPlayer}
            className="relative aspect-video w-full cursor-pointer group bg-black/60 overflow-hidden"
          >
            <img
              src={thumbnailUrl}
              alt={mediaTitle || 'YouTube Video'}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90 group-hover:opacity-100"
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-red-600 group-hover:bg-red-500 text-white flex items-center justify-center shadow-xl shadow-red-950/80 group-hover:scale-110 transition-all">
                <Play className="w-5 h-5 fill-current ml-0.5" />
              </div>
            </div>
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-xs text-[10px] font-bold text-white flex items-center gap-1">
              <Youtube className="w-3 h-3 text-red-500" />
              <span>YouTube</span>
            </div>
          </div>
        )}

        <div className="p-2.5 flex items-center justify-between gap-2 bg-[#121424]">
          <div className="min-w-0 flex-1">
            <h5 className="text-xs font-bold text-white truncate">
              {mediaTitle || 'YouTube Video'}
            </h5>
            <p className="text-[10px] text-slate-400 truncate">
              {onPlayInPlayer ? 'Tap to play in top Chat Player' : 'Tap to play'}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onPlayInPlayer && (
              <button
                type="button"
                onClick={handlePlayInChatPlayer}
                className="px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white text-[10px] font-semibold flex items-center gap-1 transition-colors"
                title="Play in Chat Player"
              >
                <Tv className="w-3 h-3" />
                <span>Play</span>
              </button>
            )}
            <a
              href={`https://www.youtube.com/watch?v=${youtubeId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title="Open on YouTube"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Audio player attachment
  if (mediaType === 'audio') {
    return (
      <div className="mt-2 p-2.5 rounded-xl bg-[#111322] border border-white/10 w-full max-w-xs space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0">
              <Volume2 className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-200 truncate">
              {mediaTitle || 'Audio Track'}
            </span>
          </div>

          {onPlayInPlayer && (
            <button
              type="button"
              onClick={handlePlayInChatPlayer}
              className="px-2 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white text-[10px] font-semibold flex items-center gap-1 transition-colors shrink-0"
              title="Play in Chat Player"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Player</span>
            </button>
          )}
        </div>

        <audio controls src={url} className="w-full h-8" />
      </div>
    );
  }

  // Video player attachment
  if (mediaType === 'video') {
    return (
      <div className="mt-2 w-full max-w-sm rounded-xl overflow-hidden border border-white/10 bg-black">
        <div className="relative group">
          <video controls src={url} className="w-full max-h-56 object-contain bg-black" />
          {onPlayInPlayer && (
            <button
              type="button"
              onClick={handlePlayInChatPlayer}
              className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 hover:bg-purple-600 text-white text-[10px] font-semibold flex items-center gap-1.5 backdrop-blur-xs transition-colors shadow-lg"
              title="Dock in Chat Player"
            >
              <Tv className="w-3 h-3" />
              <span>Play in Player</span>
            </button>
          )}
        </div>
        {mediaTitle && (
          <div className="p-2 text-[11px] text-slate-300 font-medium bg-[#121424] flex items-center justify-between gap-2">
            <span className="truncate">{mediaTitle}</span>
            {onPlayInPlayer && (
              <button
                type="button"
                onClick={handlePlayInChatPlayer}
                className="text-purple-400 hover:text-purple-300 text-[10px] font-semibold shrink-0"
              >
                Dock to Top
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Image attachment
  return (
    <>
      <div className="mt-2 max-w-xs rounded-xl overflow-hidden border border-white/10 bg-black/40 group relative">
        <img
          src={url}
          alt={mediaTitle || 'Shared image'}
          onClick={() => setIsImageModalOpen(true)}
          className="max-h-56 w-auto object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
        />
        {mediaTitle && (
          <div className="p-1.5 text-[10px] text-slate-300 bg-[#121424]/90 truncate">
            {mediaTitle}
          </div>
        )}
      </div>

      {isImageModalOpen && (
        <div
          onClick={() => setIsImageModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm cursor-zoom-out"
        >
          <img
            src={url}
            alt={mediaTitle || 'Full image'}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}
    </>
  );
};

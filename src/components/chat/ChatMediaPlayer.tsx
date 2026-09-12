import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  Maximize2,
  Minimize2,
  X,
  ExternalLink,
  Youtube,
  Music,
  Film,
  AlertTriangle,
  RefreshCw,
  Sliders,
  PictureInPicture,
  ChevronDown,
  ChevronUp,
  Radio,
  Crown,
  Info,
} from 'lucide-react';
import type { CurrentMedia, MediaSyncState, User } from '../../types/index.ts';
import { extractYouTubeId } from '../modals/SelectMediaModal.tsx';

export interface ChatMediaPlayerProps {
  media: CurrentMedia;
  onClose: () => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  isStage?: boolean;
  canControl?: boolean;
  className?: string;
  // Phase 13 Watch Party Synchronized Media Props:
  roomId?: string;
  mediaSync?: MediaSyncState | null;
  serverTime?: number;
  onSyncAction?: (action: 'play' | 'pause' | 'seek' | 'sync', position: number, duration?: number) => Promise<void>;
  currentUser?: User | null;
  streamStatus?: 'connecting' | 'connected' | 'reconnecting' | 'error';
}

function formatMediaTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const ChatMediaPlayer: React.FC<ChatMediaPlayerProps> = ({
  media,
  onClose,
  onPlayStateChange,
  isStage = false,
  canControl = true,
  className = '',
  roomId,
  mediaSync,
  serverTime,
  onSyncAction,
  currentUser,
  streamStatus = 'connected',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Core real media playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Scrubber seeking state
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  // Audio / volume state (strictly LOCAL to every participant)
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Extended controls state (LOCAL)
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Synchronization & Watch Party State (Phase 13)
  const isWatchParty = Boolean(roomId);
  const [syncStatus, setSyncStatus] = useState<'synchronized' | 'syncing' | 'reconnecting' | 'offline'>('synchronized');
  const [driftSeconds, setDriftSeconds] = useState(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocalActionTimestamp = useRef<number>(0);
  const lastProcessedRevision = useRef<number>(-1);
  const serverOffsetRef = useRef<number>(0);

  // Keep server clock offset updated to accurately estimate time elapsed since updatedAt
  useEffect(() => {
    if (serverTime) {
      serverOffsetRef.current = Date.now() - serverTime;
    }
  }, [serverTime]);

  // Update syncStatus based on stream status
  useEffect(() => {
    if (streamStatus === 'reconnecting') {
      setSyncStatus('reconnecting');
    } else if (streamStatus === 'error') {
      setSyncStatus('offline');
    }
  }, [streamStatus]);

  // Active HTML media element getter
  const getMediaElement = useCallback((): HTMLMediaElement | null => {
    if (media.type === 'video') return videoRef.current;
    if (media.type === 'audio') return audioRef.current;
    return null;
  }, [media.type]);

  // Handle YouTube media type
  const isYoutube = media.type === 'youtube';
  const youtubeVideoId = media.youtubeId || (isYoutube ? extractYouTubeId(media.url) : null);

  // Send command to YouTube iframe via postMessage
  const sendYouTubeCommand = useCallback((func: string, args: any[] = []) => {
    try {
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func,
            args,
          }),
          '*'
        );
      }
    } catch {
      // Guard against iframe message exception
    }
  }, []);

  // Time Model: calculate expected authoritative position based on server timestamp and elapsed time
  const getExpectedPlaybackPosition = useCallback((sync: MediaSyncState): number => {
    const estimatedServerNow = Date.now() - serverOffsetRef.current;
    const elapsedSec = Math.max(0, (estimatedServerNow - sync.updatedAt) / 1000);
    if (!sync.isPlaying) {
      return sync.position;
    }
    const pos = sync.position + elapsedSec;
    return sync.duration ? Math.min(sync.duration, pos) : pos;
  }, []);

  // Auto-hide controls during active video playback
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying && !isYoutube) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setShowSpeedMenu(false);
      }, 3500);
    }
  }, [isPlaying, isYoutube]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Cleanup on unmount or media change
  useEffect(() => {
    setMediaError(null);
    setIsBuffering(true);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setAutoplayBlocked(false);
    lastProcessedRevision.current = -1;

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      const el = getMediaElement();
      if (el) {
        try {
          el.pause();
        } catch {
          // Ignore
        }
      }
    };
  }, [media.url, media.type, getMediaElement]);

  // Propagate play state change
  useEffect(() => {
    onPlayStateChange?.(isPlaying);
  }, [isPlaying, onPlayStateChange]);

  // =========================================================================
  // WATCH PARTY SYNCHRONIZATION ENGINE (Phase 13)
  // =========================================================================

  // Handle incoming remote mediaSync updates (Join-in-progress, Reconnect, Remote actions)
  useEffect(() => {
    if (!isWatchParty || !mediaSync) return;

    // Determine if this update was triggered by the current user locally
    const isOwnRecentAction = currentUser && mediaSync.controllerId === currentUser.id && (Date.now() - lastLocalActionTimestamp.current < 1500);
    if (isOwnRecentAction) {
      lastProcessedRevision.current = mediaSync.revision;
      return;
    }

    // Monotonic revision check to discard out-of-order stale network packets
    if (mediaSync.revision <= lastProcessedRevision.current) {
      return;
    }
    lastProcessedRevision.current = mediaSync.revision;

    const targetPos = getExpectedPlaybackPosition(mediaSync);

    // 1. YouTube iframe synchronization
    if (isYoutube) {
      if (mediaSync.isPlaying) {
        sendYouTubeCommand('seekTo', [targetPos, true]);
        sendYouTubeCommand('playVideo');
        setIsPlaying(true);
      } else {
        sendYouTubeCommand('pauseVideo');
        sendYouTubeCommand('seekTo', [targetPos, true]);
        setIsPlaying(false);
      }
      setCurrentTime(targetPos);
      setSyncStatus('synchronized');
      return;
    }

    // 2. HTML5 Media (Video / Audio) synchronization
    const el = getMediaElement();
    if (!el) return;

    if (mediaSync.isPlaying) {
      const currentDrift = Math.abs(el.currentTime - targetPos);
      setDriftSeconds(currentDrift);

      if (el.paused) {
        // Element is paused: seek to authoritative target and start playing
        el.currentTime = targetPos;
        setCurrentTime(targetPos);
        el.play().then(() => {
          setAutoplayBlocked(false);
          setIsPlaying(true);
          setSyncStatus('synchronized');
        }).catch((err) => {
          console.warn('Autoplay prevented by browser:', err);
          setAutoplayBlocked(true);
          setSyncStatus('syncing');
        });
      } else {
        // Element is already playing: reconcile position
        if (currentDrift > 2.0) {
          // Moderate/large drift: seek directly to authoritative target
          el.currentTime = targetPos;
          setCurrentTime(targetPos);
          el.playbackRate = 1.0;
          setSyncStatus('synchronized');
        } else if (currentDrift > 0.8) {
          // Small drift: smoothly nudge rate to avoid audible/visible jitter
          el.playbackRate = el.currentTime < targetPos ? 1.06 : 0.94;
          setSyncStatus('syncing');
        } else {
          // Within tight sync threshold (<= 0.8s)
          el.playbackRate = 1.0;
          setSyncStatus('synchronized');
        }
      }
    } else {
      // Shared state is paused
      if (!el.paused) {
        el.pause();
        setIsPlaying(false);
      }
      if (Math.abs(el.currentTime - targetPos) > 0.3) {
        el.currentTime = targetPos;
        setCurrentTime(targetPos);
      }
      el.playbackRate = 1.0;
      setSyncStatus('synchronized');
    }
  }, [mediaSync, isWatchParty, isYoutube, currentUser, getExpectedPlaybackPosition, sendYouTubeCommand, getMediaElement]);

  // Periodic Drift Check (Runs every 2.5s to gently maintain continuous sync)
  useEffect(() => {
    if (!isWatchParty || !mediaSync || !mediaSync.isPlaying || isSeeking) return;

    const interval = setInterval(() => {
      const el = getMediaElement();
      if (!el || el.paused || el.seeking) return;

      const targetPos = getExpectedPlaybackPosition(mediaSync);
      const currentDrift = Math.abs(el.currentTime - targetPos);
      setDriftSeconds(currentDrift);

      if (currentDrift <= 0.8) {
        setSyncStatus('synchronized');
        if (el.playbackRate !== 1.0) el.playbackRate = 1.0;
      } else if (currentDrift <= 2.5) {
        setSyncStatus('syncing');
        el.playbackRate = el.currentTime < targetPos ? 1.06 : 0.94;
      } else {
        // Substantial drift detected: authoritative seek
        setSyncStatus('syncing');
        el.currentTime = targetPos;
        el.playbackRate = 1.0;
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isWatchParty, mediaSync, isSeeking, getMediaElement, getExpectedPlaybackPosition]);

  // Manual Force Re-sync (user explicitly clicks Resync)
  const handleForceResync = useCallback(() => {
    if (!mediaSync) return;
    const targetPos = getExpectedPlaybackPosition(mediaSync);
    setCurrentTime(targetPos);
    setAutoplayBlocked(false);

    if (isYoutube) {
      sendYouTubeCommand('seekTo', [targetPos, true]);
      if (mediaSync.isPlaying) {
        sendYouTubeCommand('playVideo');
        setIsPlaying(true);
      } else {
        sendYouTubeCommand('pauseVideo');
        setIsPlaying(false);
      }
      setSyncStatus('synchronized');
      return;
    }

    const el = getMediaElement();
    if (el) {
      el.currentTime = targetPos;
      el.playbackRate = 1.0;
      if (mediaSync.isPlaying) {
        el.play().then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
          setSyncStatus('synchronized');
        }).catch(() => {
          setAutoplayBlocked(true);
        });
      } else {
        el.pause();
        setIsPlaying(false);
        setSyncStatus('synchronized');
      }
    }
  }, [mediaSync, getExpectedPlaybackPosition, isYoutube, sendYouTubeCommand, getMediaElement]);

  // Unblock autoplay if browser prevented audio context startup
  const handleUnblockAutoplay = useCallback(() => {
    setAutoplayBlocked(false);
    handleForceResync();
  }, [handleForceResync]);

  // Keyboard navigation & control shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting if user is typing in an input/textarea
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      const el = getMediaElement();
      if (!el || isYoutube) return;

      if (e.code === 'Space' || e.key === 'k') {
        e.preventDefault();
        if (canControl) handleTogglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault();
        if (canControl) handleSkip(-10);
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        if (canControl) handleSkip(10);
      } else if (e.key === 'm') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === 'f') {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleVolumeChange(Math.min(1, volume + 0.1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleVolumeChange(Math.max(0, volume - 0.1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [getMediaElement, isYoutube, canControl, volume]);

  // Play / Pause toggle
  const handleTogglePlay = async () => {
    if (isWatchParty && !canControl) return;

    const el = getMediaElement();
    const nextPlaying = !isPlaying;

    // Send authoritative realtime update to room
    if (isWatchParty && onSyncAction) {
      lastLocalActionTimestamp.current = Date.now();
      const currentPos = el ? el.currentTime : currentTime;
      const dur = el && isFinite(el.duration) ? el.duration : duration;
      onSyncAction(nextPlaying ? 'play' : 'pause', currentPos, dur).catch(() => {});
    }

    if (isYoutube) {
      if (nextPlaying) {
        sendYouTubeCommand('playVideo');
        setIsPlaying(true);
      } else {
        sendYouTubeCommand('pauseVideo');
        setIsPlaying(false);
      }
      return;
    }

    if (!el) return;

    if (nextPlaying) {
      el.play()
        .then(() => {
          setIsPlaying(true);
          resetControlsTimer();
        })
        .catch((err) => {
          console.warn('Playback request was prevented or failed:', err);
        });
    } else {
      el.pause();
      setIsPlaying(false);
      setShowControls(true);
    }
  };

  // Skip relative seconds (+10s / -10s)
  const handleSkip = async (seconds: number) => {
    if (isWatchParty && !canControl) return;

    const el = getMediaElement();
    const cur = el ? el.currentTime : currentTime;
    const dur = el && isFinite(el.duration) ? el.duration : duration;
    const newTime = Math.max(0, Math.min(dur || 99999, cur + seconds));

    if (isWatchParty && onSyncAction) {
      lastLocalActionTimestamp.current = Date.now();
      onSyncAction('seek', newTime, dur).catch(() => {});
    }

    if (isYoutube) {
      sendYouTubeCommand('seekTo', [newTime, true]);
      setCurrentTime(newTime);
      return;
    }

    if (el) {
      el.currentTime = newTime;
      setCurrentTime(newTime);
      resetControlsTimer();
    }
  };

  // Scrubber seeking handlers
  const handleSeekStart = (val: number) => {
    if (isWatchParty && !canControl) return;
    setIsSeeking(true);
    setSeekValue(val);
  };

  const handleSeekChange = (val: number) => {
    if (isWatchParty && !canControl) return;
    setSeekValue(val);
  };

  const handleSeekCommit = async (val: number) => {
    if (isWatchParty && !canControl) {
      setIsSeeking(false);
      return;
    }

    setIsSeeking(false);
    setCurrentTime(val);

    if (isWatchParty && onSyncAction) {
      lastLocalActionTimestamp.current = Date.now();
      onSyncAction('seek', val, duration).catch(() => {});
    }

    if (isYoutube) {
      sendYouTubeCommand('seekTo', [val, true]);
      return;
    }

    const el = getMediaElement();
    if (el) {
      el.currentTime = val;
    }
    resetControlsTimer();
  };

  // Volume & Mute handlers (Strictly Local)
  const handleVolumeChange = (newVol: number) => {
    const el = getMediaElement();
    if (el) {
      el.volume = newVol;
      el.muted = newVol === 0;
    }
    setVolume(newVol);
    setIsMuted(newVol === 0);
  };

  const handleToggleMute = () => {
    const el = getMediaElement();
    if (!el) return;
    const nextMute = !isMuted;
    el.muted = nextMute;
    setIsMuted(nextMute);
    if (!nextMute && volume === 0) {
      el.volume = 0.5;
      setVolume(0.5);
    }
  };

  // Speed menu
  const handleSetSpeed = (rate: number) => {
    const el = getMediaElement();
    if (el) {
      el.playbackRate = rate;
      setPlaybackRate(rate);
    }
    setShowSpeedMenu(false);
  };

  // Picture in Picture
  const handleTogglePiP = async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('Picture-in-picture failed:', err);
    }
  };

  // Fullscreen toggle
  const handleToggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
    }
  };

  // Retry loading upon error
  const handleRetry = () => {
    setMediaError(null);
    setIsBuffering(true);
    const el = getMediaElement();
    if (el) {
      el.load();
      el.play().catch(() => {});
    }
  };

  // Native HTMLMediaElement event handlers
  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    if (isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
    }
    setIsBuffering(false);

    // Initial reconcile if joining an active watch party
    if (isWatchParty && mediaSync) {
      const target = getExpectedPlaybackPosition(mediaSync);
      el.currentTime = target;
      setCurrentTime(target);
      if (mediaSync.isPlaying) {
        el.play().then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
        }).catch(() => {
          setAutoplayBlocked(true);
        });
      }
    }
  };

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    if (!isSeeking) {
      setCurrentTime(e.currentTarget.currentTime);
    }
    if (!duration && isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) {
      setDuration(e.currentTarget.duration);
    }
  };

  const onPlay = () => {
    setIsPlaying(true);
    setIsBuffering(false);
  };

  const onPause = () => {
    setIsPlaying(false);
  };

  const onWaiting = () => {
    setIsBuffering(true);
  };

  const onPlaying = () => {
    setIsBuffering(false);
  };

  const onCanPlay = () => {
    setIsBuffering(false);
  };

  const onSeekingEvent = () => {
    setIsBuffering(true);
  };

  const onSeekedEvent = () => {
    setIsBuffering(false);
  };

  const onErrorEvent = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    setIsBuffering(false);
    setIsPlaying(false);
    const err = e.currentTarget.error;
    let message = 'Unable to play media. The file may be corrupt, inaccessible, or in an unsupported format.';
    if (err) {
      switch (err.code) {
        case 1:
          message = 'Playback was aborted.';
          break;
        case 2:
          message = 'A network error caused the media download to fail.';
          break;
        case 3:
          message = 'Media playback was aborted due to a corruption or decoding issue.';
          break;
        case 4:
          message = 'The media format or source is not supported by your browser.';
          break;
      }
    }
    setMediaError(message);
  };

  const onEndedEvent = () => {
    setIsPlaying(false);
    setCurrentTime(duration);
  };

  // Controller label
  const controllerDisplayName = mediaSync?.controllerName || media.addedByName || 'Host';

  // Watch Party Status Header Element
  const renderWatchPartyPill = () => {
    if (!isWatchParty) return null;
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Sync Status Badge */}
        <div
          id="watch-party-sync-badge"
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1 transition-colors ${
            streamStatus === 'reconnecting'
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              : streamStatus === 'error'
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              : syncStatus === 'synchronized'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
          }`}
          title={
            syncStatus === 'synchronized'
              ? `Synchronized with room stage (drift: ${driftSeconds.toFixed(1)}s)`
              : `Aligning playback (${driftSeconds.toFixed(1)}s drift)`
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              streamStatus === 'reconnecting'
                ? 'bg-amber-400 animate-ping'
                : streamStatus === 'error'
                ? 'bg-rose-400'
                : syncStatus === 'synchronized'
                ? 'bg-emerald-400'
                : 'bg-indigo-400 animate-pulse'
            }`}
          />
          <span className="font-semibold">
            {streamStatus === 'reconnecting'
              ? 'Reconnecting'
              : streamStatus === 'error'
              ? 'Offline'
              : syncStatus === 'synchronized'
              ? 'Watch Party • Synced'
              : 'Syncing...'}
          </span>
        </div>

        {/* Controller Badge */}
        <div
          id="watch-party-controller-badge"
          className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${
            canControl
              ? 'bg-purple-500/15 border-purple-500/30 text-purple-200'
              : 'bg-white/5 border-white/10 text-slate-300'
          }`}
          title={canControl ? 'You have permission to control shared playback' : `Playback controlled by ${controllerDisplayName}`}
        >
          <Crown className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="truncate max-w-[110px]">
            {canControl ? 'You Control' : controllerDisplayName}
          </span>
        </div>

        {/* Resync Button */}
        <button
          type="button"
          id="watch-party-resync-btn"
          onClick={handleForceResync}
          className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white text-[10px] flex items-center gap-1 transition-colors"
          title="Force re-align player with authoritative room host position"
          aria-label="Force re-sync"
        >
          <RefreshCw className="w-3 h-3 text-purple-400" />
          <span className="hidden sm:inline">Resync</span>
        </button>
      </div>
    );
  };

  // Autoplay Blocked Banner Overlay
  const renderAutoplayBanner = () => {
    if (!autoplayBlocked) return null;
    return (
      <div
        id="watch-party-autoplay-banner"
        className="p-2.5 bg-gradient-to-r from-purple-950 via-indigo-950 to-purple-950 border-b border-purple-500/30 flex items-center justify-between gap-3 text-xs text-purple-200 z-30 shadow-lg"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Radio className="w-4 h-4 text-purple-400 animate-pulse shrink-0" />
          <span className="truncate">
            Watch Party is playing! Click to enable audio/video sync.
          </span>
        </div>
        <button
          type="button"
          id="watch-party-autoplay-unblock-btn"
          onClick={handleUnblockAutoplay}
          className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all shadow-md shadow-purple-950/60 active:scale-95"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Join Playback</span>
        </button>
      </div>
    );
  };

  // =========================================================================
  // RENDER: YouTube Embed Mode
  // =========================================================================
  if (isYoutube) {
    return (
      <div
        ref={containerRef}
        className={`w-full bg-[#080911] border-b border-white/10 shrink-0 transition-all ${className}`}
      >
        {/* Autoplay block notification */}
        {renderAutoplayBanner()}

        {/* Header Bar */}
        <div className="px-3 py-2 bg-[#0e101f] border-b border-white/5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 rounded-md bg-red-600/20 text-red-400 border border-red-500/30 text-[10px] font-bold flex items-center gap-1 shrink-0 uppercase tracking-wider">
              <Youtube className="w-3 h-3 text-red-500" />
              <span>YouTube</span>
            </span>
            <h4 className="text-xs font-semibold text-white truncate max-w-[160px] sm:max-w-xs" title={media.title}>
              {media.title || 'YouTube Player'}
            </h4>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {renderWatchPartyPill()}

            {/* Minimize / Expand Toggle */}
            <button
              type="button"
              id="player-youtube-collapse-btn"
              onClick={() => setIsCompact(!isCompact)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title={isCompact ? 'Expand Video' : 'Compact Player'}
              aria-label={isCompact ? 'Expand Video' : 'Compact Player'}
            >
              {isCompact ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>

            {/* Open in YouTube External Link */}
            {youtubeVideoId && (
              <a
                href={`https://www.youtube.com/watch?v=${youtubeVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="Open directly on YouTube"
                aria-label="Open directly on YouTube"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {/* Close Player */}
            <button
              type="button"
              id="player-youtube-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-red-600 text-slate-400 hover:text-white transition-colors"
              title="Close Player"
              aria-label="Close Player"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Video Frame */}
        {!isCompact && (
          <div className="relative aspect-video max-h-64 sm:max-h-72 w-full mx-auto bg-black overflow-hidden flex items-center justify-center">
            {youtubeVideoId ? (
              <iframe
                ref={iframeRef}
                id="chat-player-youtube-frame"
                src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?autoplay=1&enablejsapi=1&rel=0&iv_load_policy=3`}
                title={media.title || 'YouTube Video Player'}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
                <p>Invalid or missing YouTube Video URL.</p>
              </div>
            )}
          </div>
        )}

        {/* Host Control Bar for Watch Party in YouTube Mode */}
        {isWatchParty && canControl && !isCompact && (
          <div className="px-3 py-1.5 bg-[#0b0c16] border-t border-white/5 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-purple-300 font-semibold flex items-center gap-1">
                <Crown className="w-3 h-3 text-amber-400" /> Host Controls:
              </span>
              <button
                type="button"
                id="yt-sync-play-btn"
                onClick={handleTogglePlay}
                className="px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-medium flex items-center gap-1"
              >
                {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                <span>{isPlaying ? 'Pause All' : 'Play All'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleSkip(-10)}
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px]"
                title="Seek backward 10s"
              >
                -10s
              </button>
              <button
                type="button"
                onClick={() => handleSkip(10)}
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px]"
                title="Seek forward 10s"
              >
                +10s
              </button>
            </div>
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              Actions are broadcast in real-time to all room participants
            </span>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // RENDER: HTML5 Audio Player Mode
  // =========================================================================
  if (media.type === 'audio') {
    return (
      <div
        ref={containerRef}
        className={`w-full bg-[#0d1021] border-b border-white/10 px-3 py-2.5 shrink-0 ${className}`}
      >
        {/* Hidden Native Audio Element */}
        <audio
          ref={audioRef}
          src={media.url}
          autoPlay
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onPlay={onPlay}
          onPause={onPause}
          onWaiting={onWaiting}
          onPlaying={onPlaying}
          onCanPlay={onCanPlay}
          onSeeking={onSeekingEvent}
          onSeeked={onSeekedEvent}
          onError={onErrorEvent}
          onEnded={onEndedEvent}
          className="hidden"
        />

        {/* Autoplay block banner */}
        {renderAutoplayBanner()}

        {mediaError ? (
          <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{mediaError}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRetry}
                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-[11px] flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Top Info Bar */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-purple-950/40">
                  <Music className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-bold uppercase tracking-wider">
                      Audio
                    </span>
                    <h4 className="text-xs font-bold text-white truncate" title={media.title}>
                      {media.title || 'Audio Stream'}
                    </h4>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">
                    {media.addedByName ? `Added by ${media.addedByName}` : 'Playing in chat player'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {renderWatchPartyPill()}

                {/* Close Button */}
                <button
                  type="button"
                  id="player-audio-close-btn"
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-red-600 text-slate-400 hover:text-white transition-colors"
                  title="Close Player"
                  aria-label="Close Player"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Controls Bar & Scrub Line */}
            <div className="flex items-center gap-3 pt-0.5">
              {/* Play / Pause */}
              <button
                type="button"
                id="player-audio-play-btn"
                onClick={handleTogglePlay}
                disabled={isWatchParty && !canControl}
                className="w-8 h-8 rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-md transition-colors active:scale-95 disabled:opacity-50"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title={isWatchParty && !canControl ? 'Controlled by room host' : isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              {/* Progress Scrub Bar */}
              <div className="flex-1 flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-400 shrink-0 w-8 text-right">
                  {formatMediaTime(isSeeking ? seekValue : currentTime)}
                </span>
                <input
                  type="range"
                  id="player-audio-seek-slider"
                  min={0}
                  max={Math.max(1, duration)}
                  step={0.1}
                  value={isSeeking ? seekValue : currentTime}
                  disabled={isWatchParty && !canControl}
                  onChange={(e) => handleSeekChange(parseFloat(e.target.value))}
                  onMouseDown={(e) => handleSeekStart(parseFloat((e.target as HTMLInputElement).value))}
                  onTouchStart={(e) => handleSeekStart(parseFloat((e.target as HTMLInputElement).value))}
                  onMouseUp={(e) => handleSeekCommit(parseFloat((e.target as HTMLInputElement).value))}
                  onTouchEnd={(e) => handleSeekCommit(parseFloat((e.target as HTMLInputElement).value))}
                  className={`flex-1 h-1.5 bg-white/10 rounded-lg appearance-none accent-purple-500 hover:bg-white/20 transition-all ${
                    isWatchParty && !canControl ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                  }`}
                  title={isWatchParty && !canControl ? 'Playback position is synchronized by the room host' : 'Seek'}
                />
                <span className="text-[10px] font-mono text-slate-400 shrink-0 w-8">
                  {formatMediaTime(duration)}
                </span>
              </div>

              {/* Volume & Mute (Strictly Local) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="text-slate-400 hover:text-white transition-colors p-1"
                  title={isMuted ? 'Unmute (local)' : 'Mute (local)'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : volume > 0.5 ? (
                    <Volume2 className="w-4 h-4" />
                  ) : (
                    <Volume1 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-14 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500 hidden sm:inline-block"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // RENDER: Real HTML5 Video Player Mode
  // =========================================================================
  return (
    <div
      ref={containerRef}
      onPointerMove={resetControlsTimer}
      onClick={resetControlsTimer}
      className={`w-full bg-black border-b border-white/10 shrink-0 relative group select-none transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 h-screen border-none' : ''
      } ${className}`}
    >
      {/* Autoplay block overlay */}
      {renderAutoplayBanner()}

      {/* Video Element */}
      <div
        className={`relative w-full mx-auto bg-black flex items-center justify-center overflow-hidden ${
          isCompact ? 'h-14 sm:h-16' : 'aspect-video max-h-60 sm:max-h-72'
        }`}
      >
        <video
          ref={videoRef}
          src={media.url}
          autoPlay
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onPlay={onPlay}
          onPause={onPause}
          onWaiting={onWaiting}
          onPlaying={onPlaying}
          onCanPlay={onCanPlay}
          onSeeking={onSeekingEvent}
          onSeeked={onSeekedEvent}
          onError={onErrorEvent}
          onEnded={onEndedEvent}
          onClick={canControl ? handleTogglePlay : undefined}
          className={`w-full h-full object-contain ${canControl ? 'cursor-pointer' : 'cursor-default'}`}
        />

        {/* Buffering Spinner Overlay */}
        {isBuffering && !mediaError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-20">
            <div className="w-12 h-12 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
          </div>
        )}

        {/* Real Error State Overlay */}
        {mediaError && (
          <div className="absolute inset-0 z-30 bg-black/85 flex flex-col items-center justify-center p-4 text-center">
            <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mb-2">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-white mb-1">Playback Error</h4>
            <p className="text-[11px] text-slate-300 max-w-sm leading-relaxed mb-3">
              {mediaError}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRetry}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Top Floating Bar (Title, Watch Party Badges & Dismiss Controls) */}
        <div
          className={`absolute top-0 inset-x-0 p-2.5 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between gap-2 z-20 transition-opacity duration-200 ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <span className="px-2 py-0.5 rounded-md bg-purple-600/30 border border-purple-400/30 text-purple-300 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Film className="w-2.5 h-2.5" />
              <span>Video</span>
            </span>
            <span className="text-xs font-semibold text-white truncate drop-shadow max-w-[140px] sm:max-w-xs" title={media.title}>
              {media.title || 'Video Player'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {renderWatchPartyPill()}

            {/* Compact / Expand Toggle */}
            <button
              type="button"
              id="video-player-compact-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsCompact(!isCompact);
              }}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-white/10 text-white transition-colors"
              title={isCompact ? 'Expand Video' : 'Compact Player'}
              aria-label={isCompact ? 'Expand Video' : 'Compact Player'}
            >
              {isCompact ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              id="video-player-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-red-600 text-white transition-colors"
              title="Close Player"
              aria-label="Close Player"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Center Big Play Button (when paused, if controller) */}
        {!isPlaying && !isBuffering && !mediaError && !isCompact && canControl && (
          <button
            type="button"
            onClick={handleTogglePlay}
            className="absolute z-20 w-14 h-14 rounded-full bg-purple-600/90 hover:bg-purple-500 text-white flex items-center justify-center shadow-2xl shadow-black/80 hover:scale-110 active:scale-95 transition-all"
            aria-label="Play video"
          >
            <Play className="w-6 h-6 fill-current ml-1" />
          </button>
        )}

        {/* Non-controller Stage Notice banner if paused */}
        {!isPlaying && !isBuffering && !mediaError && !isCompact && isWatchParty && !canControl && (
          <div className="absolute z-20 px-3 py-1.5 rounded-full bg-black/70 border border-white/20 text-slate-200 text-xs flex items-center gap-2 backdrop-blur-md">
            <Info className="w-4 h-4 text-purple-400" />
            <span>Paused by {controllerDisplayName}. Waiting for host to play...</span>
          </div>
        )}

        {/* Bottom Interactive Controls Bar */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute bottom-0 inset-x-0 p-2 sm:p-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col gap-1.5 z-20 transition-opacity duration-200 ${
            showControls || !isPlaying || isCompact ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Seek Scrubber */}
          <div className="w-full flex items-center gap-2 group/slider">
            <span className="text-[10px] font-mono text-slate-300 w-8 text-right shrink-0">
              {formatMediaTime(isSeeking ? seekValue : currentTime)}
            </span>
            <input
              type="range"
              id="video-seek-slider"
              min={0}
              max={Math.max(1, duration)}
              step={0.1}
              value={isSeeking ? seekValue : currentTime}
              disabled={(isWatchParty && !canControl) || !duration}
              onChange={(e) => handleSeekChange(parseFloat(e.target.value))}
              onMouseDown={(e) => handleSeekStart(parseFloat((e.target as HTMLInputElement).value))}
              onTouchStart={(e) => handleSeekStart(parseFloat((e.target as HTMLInputElement).value))}
              onMouseUp={(e) => handleSeekCommit(parseFloat((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => handleSeekCommit(parseFloat((e.target as HTMLInputElement).value))}
              className={`flex-1 h-1.5 bg-white/20 rounded-lg appearance-none accent-purple-500 hover:h-2 transition-all ${
                isWatchParty && !canControl ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
              title={isWatchParty && !canControl ? 'Controlled by room host' : 'Seek'}
            />
            <span className="text-[10px] font-mono text-slate-300 w-8 shrink-0">
              {formatMediaTime(duration)}
            </span>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Play / Pause button */}
              <button
                type="button"
                id="video-play-btn"
                onClick={handleTogglePlay}
                disabled={isWatchParty && !canControl}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-purple-600 text-white flex items-center justify-center transition-colors active:scale-95 disabled:opacity-40"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title={isWatchParty && !canControl ? 'Playback controlled by room host' : isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              {/* Jump -10s / +10s (Controllers only in watch party) */}
              {(!isWatchParty || canControl) && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSkip(-10)}
                    className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                    title="Rewind 10 seconds"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSkip(10)}
                    className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                    title="Forward 10 seconds"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              {/* Volume & Mute (Strictly Local) */}
              <div className="flex items-center gap-1.5 ml-1">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                  title={isMuted ? 'Unmute (local)' : 'Mute (local)'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : volume > 0.5 ? (
                    <Volume2 className="w-4 h-4" />
                  ) : (
                    <Volume1 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-14 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500 hidden sm:inline-block"
                  title="Local volume"
                />
              </div>
            </div>

            {/* Right Tools (Speed, PiP, Fullscreen) */}
            <div className="flex items-center gap-1 sm:gap-1.5 relative">
              {/* Playback Speed Selector (Local) */}
              <div className="relative">
                <button
                  type="button"
                  id="video-speed-btn"
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white transition-colors flex items-center gap-1"
                  title="Playback Speed"
                >
                  <span>{playbackRate}x</span>
                </button>

                {showSpeedMenu && (
                  <div className="absolute right-0 bottom-full mb-1.5 py-1 bg-[#161828] border border-white/15 rounded-xl shadow-xl z-40 flex flex-col w-20">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => handleSetSpeed(rate)}
                        className={`px-3 py-1 text-[11px] text-left hover:bg-purple-600 hover:text-white transition-colors ${
                          playbackRate === rate ? 'text-purple-400 font-bold bg-white/5' : 'text-slate-300'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Picture in Picture */}
              {document.pictureInPictureEnabled && (
                <button
                  type="button"
                  id="video-pip-btn"
                  onClick={handleTogglePiP}
                  className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors hidden sm:flex"
                  title="Picture in Picture"
                >
                  <PictureInPicture className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Fullscreen */}
              <button
                type="button"
                id="video-fullscreen-btn"
                onClick={handleToggleFullscreen}
                className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

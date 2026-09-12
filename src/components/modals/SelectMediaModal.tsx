import React, { useState, useRef } from 'react';
import { Modal } from '../common/Modal.tsx';
import { YouTubeModal } from './YouTubeModal.tsx';
import {
  Link2,
  HardDrive,
  Youtube,
  Clock,
  Play,
  UploadCloud,
  Check,
  AlertCircle,
  Film,
  Music,
  Image as ImageIcon,
  Sparkles,
  ExternalLink,
  X,
  Tv,
} from 'lucide-react';
import { api } from '../../services/api.ts';

export interface SelectedMediaPayload {
  type: 'youtube' | 'image' | 'video' | 'audio' | 'link';
  url: string;
  localBlobUrl?: string;
  rawFile?: File;
  title?: string;
  caption?: string;
  actionTarget?: 'stage' | 'chat_player' | 'chat_message';
}

interface SelectMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia: (media: SelectedMediaPayload) => void;
}

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  // Standard full or short YouTube patterns
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/,
  );
  if (match && match[1]) {
    return match[1];
  }
  // If user just typed the 11 character ID directly
  if (/^[\w-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export const SelectMediaModal: React.FC<SelectMediaModalProps> = ({
  isOpen,
  onClose,
  onSelectMedia,
}) => {
  // Tabs: 'load_url' | 'load_media'
  const [activeTab, setActiveTab] = useState<'load_url' | 'load_media'>('load_url');

  // Load URL Options: 'youtube' | 'soon1' | 'soon2' | 'soon3'
  const [selectedUrlOption, setSelectedUrlOption] = useState<'youtube' | 'soon1' | 'soon2' | 'soon3'>('youtube');
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = useState(false);

  // Load media local file state
  const [localFilePreview, setLocalFilePreview] = useState<{
    url: string;
    file: File;
    type: 'image' | 'video' | 'audio';
    name: string;
    rawMime: string;
    sizeFormatted: string;
  } | null>(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notice/alert state for "Soon" options
  const [soonNotice, setSoonNotice] = useState<string | null>(null);

  const handleOpenSoonOption = (optionKey: 'soon1' | 'soon2' | 'soon3', name: string) => {
    setSelectedUrlOption(optionKey);
    setSoonNotice(`${name} is in development and will be available in the upcoming update!`);
  };

  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let mediaType: 'image' | 'video' | 'audio' = 'image';
    if (file.type.startsWith('video/')) {
      mediaType = 'video';
    } else if (file.type.startsWith('audio/')) {
      mediaType = 'audio';
    }

    const formatSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Create immediate zero-delay object URL for preview and instant playback
    const objectUrl = URL.createObjectURL(file);
    setLocalFilePreview({
      url: objectUrl,
      file,
      type: mediaType,
      name: file.name,
      rawMime: file.type || (mediaType === 'video' ? 'video/mp4' : mediaType === 'audio' ? 'audio/mp3' : 'image/png'),
      sizeFormatted: formatSize(file.size),
    });
  };

  // Instant Play on Stage (Watch Party / Cast Together)
  const handlePlayOnStage = () => {
    if (!localFilePreview) return;
    onSelectMedia({
      type: localFilePreview.type,
      url: localFilePreview.url,
      localBlobUrl: localFilePreview.url,
      rawFile: localFilePreview.file,
      title: localFilePreview.name,
      caption: mediaCaption.trim() || undefined,
      actionTarget: 'stage',
    });
    handleClose();
  };

  // Instant Play in Chat Player
  const handlePlayInChatPlayer = () => {
    if (!localFilePreview) return;
    onSelectMedia({
      type: localFilePreview.type,
      url: localFilePreview.url,
      localBlobUrl: localFilePreview.url,
      rawFile: localFilePreview.file,
      title: localFilePreview.name,
      caption: mediaCaption.trim() || undefined,
      actionTarget: 'chat_player',
    });
    handleClose();
  };

  // Send to Chat (Chunked upload + chat message)
  const handleConfirmSendToChat = async () => {
    if (!localFilePreview || isUploading) return;

    setIsUploading(true);
    setUploadPercent(0);
    setUploadStatusText('Uploading media chunks...');

    let finalUrl = localFilePreview.url;
    try {
      if (localFilePreview.file) {
        const res = await api.uploadMediaChunked(
          localFilePreview.file,
          localFilePreview.name,
          localFilePreview.rawMime,
          (pct) => {
            setUploadPercent(pct);
            setUploadStatusText(`Uploading in chunks: ${pct}%`);
          }
        );
        if (res && res.url) {
          finalUrl = res.url;
        }
      }
    } catch (err: any) {
      console.warn('Chunk upload fallback:', err);
    } finally {
      setIsUploading(false);
    }

    onSelectMedia({
      type: localFilePreview.type,
      url: finalUrl,
      localBlobUrl: localFilePreview.url,
      rawFile: localFilePreview.file,
      title: localFilePreview.name,
      caption: mediaCaption.trim() || undefined,
      actionTarget: 'chat_message',
    });

    handleClose();
  };

  const handleClose = () => {
    setLocalFilePreview(null);
    setMediaCaption('');
    setSoonNotice(null);
    setIsYouTubeModalOpen(false);
    setIsUploading(false);
    setUploadPercent(0);
    setUploadStatusText('');
    onClose();
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="Select Media" maxWidth="md">
      <div className="space-y-4">
        {/* Top Segmented Option Buttons: [ Load url ]  [ load media ] */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#0f1120] rounded-xl border border-white/5">
          <button
            type="button"
            id="media-tab-load-url"
            onClick={() => {
              setActiveTab('load_url');
              setSoonNotice(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'load_url'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Load url</span>
          </button>

          <button
            type="button"
            id="media-tab-load-media"
            onClick={() => {
              setActiveTab('load_media');
              setSoonNotice(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'load_media'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>load media</span>
          </button>
        </div>

        {/* Option Content Body */}
        {activeTab === 'load_url' ? (
          <div className="space-y-4">
            {/* The 2x2 Options Grid as requested:
                YouTube   |  soon 1
                Soon 2    |  soon 3 */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block px-0.5">
                Choose Provider
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {/* 1. YouTube */}
                <button
                  type="button"
                  id="media-provider-youtube"
                  onClick={() => {
                    setSelectedUrlOption('youtube');
                    setSoonNotice(null);
                    setIsYouTubeModalOpen(true);
                  }}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all relative overflow-hidden group ${
                    selectedUrlOption === 'youtube'
                      ? 'bg-red-950/30 border-red-500/60 ring-2 ring-red-500/20 shadow-lg shadow-red-950/40'
                      : 'bg-[#141628] border-white/10 hover:border-red-500/40 hover:bg-[#171a2e]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-md shadow-red-900/50">
                      <Youtube className="w-4 h-4" />
                    </div>
                    {selectedUrlOption === 'youtube' ? (
                      <span className="w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Ready
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    <h4 className="text-xs font-bold text-white group-hover:text-red-300 transition-colors">
                      YouTube
                    </h4>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      Stream videos & music
                    </p>
                  </div>
                </button>

                {/* 2. Soon 1 */}
                <button
                  type="button"
                  id="media-provider-soon1"
                  onClick={() => handleOpenSoonOption('soon1', 'Soon 1')}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all group ${
                    selectedUrlOption === 'soon1'
                      ? 'bg-purple-950/30 border-purple-500/60 ring-2 ring-purple-500/20'
                      : 'bg-[#141628] border-white/10 hover:border-white/20 hover:bg-[#171a2e]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center">
                      <Music className="w-4 h-4" />
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-white/10 text-slate-300 border border-white/10">
                      Soon
                    </span>
                  </div>
                  <div className="mt-3">
                    <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                      soon 1
                    </h4>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      Audio & playlist stream
                    </p>
                  </div>
                </button>

                {/* 3. Soon 2 */}
                <button
                  type="button"
                  id="media-provider-soon2"
                  onClick={() => handleOpenSoonOption('soon2', 'Soon 2')}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all group ${
                    selectedUrlOption === 'soon2'
                      ? 'bg-indigo-950/30 border-indigo-500/60 ring-2 ring-indigo-500/20'
                      : 'bg-[#141628] border-white/10 hover:border-white/20 hover:bg-[#171a2e]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center">
                      <Film className="w-4 h-4" />
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-white/10 text-slate-300 border border-white/10">
                      Soon
                    </span>
                  </div>
                  <div className="mt-3">
                    <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                      Soon 2
                    </h4>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      Live broadcast link
                    </p>
                  </div>
                </button>

                {/* 4. Soon 3 */}
                <button
                  type="button"
                  id="media-provider-soon3"
                  onClick={() => handleOpenSoonOption('soon3', 'Soon 3')}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all group ${
                    selectedUrlOption === 'soon3'
                      ? 'bg-pink-950/30 border-pink-500/60 ring-2 ring-pink-500/20'
                      : 'bg-[#141628] border-white/10 hover:border-white/20 hover:bg-[#171a2e]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-300 border border-pink-500/30 flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-white/10 text-slate-300 border border-white/10">
                      Soon
                    </span>
                  </div>
                  <div className="mt-3">
                    <h4 className="text-xs font-bold text-white group-hover:text-pink-300 transition-colors">
                      soon 3
                    </h4>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      Interactive community stream
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* If Soon option selected, show friendly banner */}
            {soonNotice && selectedUrlOption !== 'youtube' && (
              <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/30 flex items-start gap-2.5 animate-in fade-in duration-150">
                <Clock className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="text-purple-200 font-semibold">{soonNotice}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* load media Option Tab */
          <div className="space-y-3.5">
            {/* File Upload Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-5 border-2 border-dashed border-purple-500/30 hover:border-purple-500/60 rounded-2xl bg-[#13162b]/50 hover:bg-[#13162b] cursor-pointer flex flex-col items-center justify-center text-center transition-all group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-11 h-11 rounded-2xl bg-purple-600/20 border border-purple-500/30 text-purple-300 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <h4 className="text-xs font-bold text-white">Click or drag & drop to upload</h4>
              <p className="text-[10px] text-slate-400 mt-1">
                Images (PNG, JPG, GIF), Videos (MP4), or Audio (MP3)
              </p>
            </div>

            {/* Selected Local Media Preview */}
            {localFilePreview && (
              <div className="p-3 rounded-xl bg-[#171a2e] border border-white/10 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-semibold truncate max-w-[200px]">{localFilePreview.name}</span>
                  <button
                    type="button"
                    onClick={() => setLocalFilePreview(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {localFilePreview.type === 'image' && (
                  <div className="relative max-h-48 rounded-lg overflow-hidden bg-black/40 flex items-center justify-center">
                    <img
                      src={localFilePreview.url}
                      alt="Preview"
                      className="max-h-48 w-auto object-contain rounded-lg"
                    />
                  </div>
                )}

                {localFilePreview.type === 'video' && (
                  <video
                    src={localFilePreview.url}
                    controls
                    className="w-full max-h-48 rounded-lg bg-black"
                  />
                )}

                {localFilePreview.type === 'audio' && (
                  <audio src={localFilePreview.url} controls className="w-full mt-1" />
                )}

                <input
                  type="text"
                  value={mediaCaption}
                  onChange={(e) => setMediaCaption(e.target.value)}
                  placeholder="Add a caption (optional)..."
                  className="w-full px-3 py-2 rounded-xl bg-[#121424] border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
                />

                {/* Uploading progress bar indicator if uploading */}
                {isUploading && (
                  <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-purple-200">
                      <span className="font-semibold flex items-center gap-1.5">
                        <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                        {uploadStatusText || 'Streaming media chunks...'}
                      </span>
                      <span className="font-mono font-bold text-purple-300">{uploadPercent}%</span>
                    </div>
                    <div className="w-full bg-purple-950/60 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-200"
                        style={{ width: `${uploadPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Primary Action Buttons */}
                <div className="space-y-2 pt-1">
                  {(localFilePreview.type === 'video' || localFilePreview.type === 'audio') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* Play on Stage (Watch Party / Cast Together) */}
                      <button
                        type="button"
                        id="btn-play-on-stage"
                        disabled={isUploading}
                        onClick={handlePlayOnStage}
                        className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 text-xs font-bold text-white flex flex-col items-center justify-center gap-0.5 transition-all shadow-md shadow-purple-950/50 disabled:opacity-50"
                      >
                        <div className="flex items-center gap-1.5">
                          <Tv className="w-4 h-4 text-purple-200" />
                          <span>Cast & Watch Together</span>
                        </div>
                        <span className="text-[10px] text-purple-200 font-normal">Play on screen in sync with friends</span>
                      </button>

                      {/* Play in Chat Player */}
                      <button
                        type="button"
                        id="btn-play-in-chat-player"
                        disabled={isUploading}
                        onClick={handlePlayInChatPlayer}
                        className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-bold text-white flex flex-col items-center justify-center gap-0.5 transition-all border border-white/10 disabled:opacity-50"
                      >
                        <div className="flex items-center gap-1.5">
                          <Play className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Play in Chat Player</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal">Instant pop-up player</span>
                      </button>
                    </div>
                  )}

                  {/* Send to Chat message button */}
                  <button
                    type="button"
                    id="btn-send-media-to-chat"
                    disabled={isUploading}
                    onClick={handleConfirmSendToChat}
                    className="w-full py-2.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 active:scale-95 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all border border-purple-500/30 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Uploading ({uploadPercent}%)...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-3.5 h-3.5 text-purple-300" />
                        <span>Send to Chat as Message</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>

    {/* YouTube Popup Modal */}
    <YouTubeModal
      isOpen={isYouTubeModalOpen}
      onClose={() => setIsYouTubeModalOpen(false)}
      onSelectVideo={(media) => {
        setIsYouTubeModalOpen(false);
        onSelectMedia(media);
        handleClose();
      }}
    />
    </>
  );
};

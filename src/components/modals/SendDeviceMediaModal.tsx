import React, { useState, useRef } from 'react';
import { Modal } from '../common/Modal.tsx';
import { Image as ImageIcon, Film, Music, UploadCloud, X, Send, AlertCircle, Check } from 'lucide-react';
import { api } from '../../services/api.ts';

interface SendDeviceMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMedia: (payload: {
    dataUrl: string;
    mediaType: 'image' | 'video' | 'audio';
    mediaTitle: string;
    caption: string;
  }) => Promise<void>;
  isSending?: boolean;
}

export const SendDeviceMediaModal: React.FC<SendDeviceMediaModalProps> = ({
  isOpen,
  onClose,
  onSendMedia,
  isSending = false,
}) => {
  const [selectedFile, setSelectedFile] = useState<{
    dataUrl: string;
    mediaType: 'image' | 'video' | 'audio';
    rawMime: string;
    name: string;
    sizeFormatted: string;
  } | null>(null);

  const [caption, setCaption] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = () => {
    setSelectedFile(null);
    setCaption('');
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleModalClose = () => {
    if (isSending || isUploading) return;
    handleReset();
    onClose();
  };

  const processFile = (file: File) => {
    setErrorMessage(null);

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');

    if (!isImage && !isVideo && !isAudio) {
      setErrorMessage('Please select a valid image, video, or audio file from your device.');
      return;
    }

    const maxSizeBytes = 45 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setErrorMessage('File size exceeds 45MB limit. Please select a smaller media file.');
      return;
    }

    const formatSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setSelectedFile({
        dataUrl,
        mediaType: isVideo ? 'video' : isAudio ? 'audio' : 'image',
        rawMime: file.type,
        name: file.name,
        sizeFormatted: formatSize(file.size),
      });
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read file from device. Please try again.');
    };

    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleSend = async () => {
    if (!selectedFile || isSending || isUploading) return;

    setIsUploading(true);
    setErrorMessage(null);

    let finalUrl = selectedFile.dataUrl;
    try {
      // Upload to real server storage
      const res = await api.uploadMedia(selectedFile.dataUrl, selectedFile.rawMime, selectedFile.name);
      if (res && res.url) {
        finalUrl = res.url;
      }
    } catch {
      // Graceful fallback to dataUrl if server storage is offline
    }

    try {
      await onSendMedia({
        dataUrl: finalUrl,
        mediaType: selectedFile.mediaType,
        mediaTitle: selectedFile.name,
        caption: caption.trim(),
      });
      handleModalClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to send media in chat.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleModalClose} title="Send Media in Chat" maxWidth="md">
      <div className="space-y-4 pt-1">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!selectedFile ? (
          <div className="space-y-4">
            {/* Drag & Drop Upload Box */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? 'border-purple-500 bg-purple-500/10 scale-[1.01]'
                  : 'border-white/15 bg-white/[0.02] hover:border-purple-500/50 hover:bg-white/[0.04]'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-purple-600/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <UploadCloud className="w-7 h-7" />
              </div>

              <div>
                <p className="text-sm font-semibold text-white">
                  Choose Media file from device
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Drag & drop or click to browse files
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] text-slate-400">
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3 text-emerald-400" />
                  Photos
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 flex items-center gap-1">
                  <Film className="w-3 h-3 text-indigo-400" />
                  Videos
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 flex items-center gap-1">
                  <Music className="w-3 h-3 text-purple-400" />
                  Audio Tracks
                </span>
              </div>
            </div>

            {/* Quick selection buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="btn-choose-device-photo"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'image/*';
                    fileInputRef.current.click();
                  }
                }}
                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex flex-col items-center gap-1.5 transition-all text-center active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Photo</div>
                  <div className="text-[9px] text-slate-400 truncate">Camera roll</div>
                </div>
              </button>

              <button
                type="button"
                id="btn-choose-device-video"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'video/*';
                    fileInputRef.current.click();
                  }
                }}
                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex flex-col items-center gap-1.5 transition-all text-center active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Video</div>
                  <div className="text-[9px] text-slate-400 truncate">MP4, WebM</div>
                </div>
              </button>

              <button
                type="button"
                id="btn-choose-device-audio"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'audio/*';
                    fileInputRef.current.click();
                  }
                }}
                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex flex-col items-center gap-1.5 transition-all text-center active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                  <Music className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Audio</div>
                  <div className="text-[9px] text-slate-400 truncate">MP3, WAV</div>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* Preview and Caption Form */
          <div className="space-y-3.5">
            {/* Media Preview Container */}
            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/60 max-h-64 flex items-center justify-center">
              {selectedFile.mediaType === 'image' ? (
                <img
                  src={selectedFile.dataUrl}
                  alt={selectedFile.name}
                  className="max-h-64 w-full object-contain rounded-xl"
                />
              ) : selectedFile.mediaType === 'video' ? (
                <video
                  src={selectedFile.dataUrl}
                  controls
                  className="max-h-64 w-full object-contain rounded-xl"
                />
              ) : (
                <div className="p-6 w-full flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Music className="w-6 h-6" />
                  </div>
                  <audio src={selectedFile.dataUrl} controls className="w-full" />
                </div>
              )}

              {/* Remove / Replace button */}
              <button
                type="button"
                onClick={handleReset}
                className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/75 hover:bg-red-600 text-white flex items-center justify-center transition-colors backdrop-blur-xs shadow-lg"
                title="Remove and pick another file"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Tag pill */}
              <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-xs text-[10px] font-bold text-white flex items-center gap-1.5 shadow">
                {selectedFile.mediaType === 'image' ? (
                  <>
                    <ImageIcon className="w-3 h-3 text-emerald-400" />
                    <span>Photo</span>
                  </>
                ) : selectedFile.mediaType === 'video' ? (
                  <>
                    <Film className="w-3 h-3 text-indigo-400" />
                    <span>Video</span>
                  </>
                ) : (
                  <>
                    <Music className="w-3 h-3 text-purple-400" />
                    <span>Audio</span>
                  </>
                )}
                <span className="text-slate-400">({selectedFile.sizeFormatted})</span>
              </div>
            </div>

            {/* File Info Bar */}
            <div className="flex items-center justify-between text-xs px-1 text-slate-300">
              <span className="truncate max-w-[220px] font-medium">{selectedFile.name}</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold"
              >
                Change File
              </button>
            </div>

            {/* Caption Input */}
            <div className="space-y-1.5">
              <label htmlFor="device-media-caption" className="block text-xs font-semibold text-slate-300">
                Message or Caption (Optional)
              </label>
              <input
                id="device-media-caption"
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Say something about this media..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141628] border border-white/10 text-white placeholder-slate-400 text-xs focus:outline-none focus:border-purple-500 transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleModalClose}
                disabled={isSending || isUploading}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-all border border-white/5 active:scale-95 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-send-device-media"
                onClick={handleSend}
                disabled={isSending || isUploading}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-semibold text-white shadow-lg shadow-purple-900/30 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {isSending || isUploading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{isUploading ? 'Uploading media...' : 'Sending in chat...'}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send in Chat</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

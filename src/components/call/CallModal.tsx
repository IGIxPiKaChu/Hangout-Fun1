import React, { useEffect, useRef, useState } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  Minimize2,
  Maximize2,
  AlertCircle,
  Monitor,
  MonitorOff,
} from 'lucide-react';
import type { CallSession } from '../../types/index.ts';

interface CallModalProps {
  activeCall: CallSession | null;
  incomingCall: CallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMicMuted: boolean;
  isVideoMuted: boolean;
  callError: string | null;
  isLocalScreenSharing: boolean;
  isPeerScreenSharing: boolean;
  localScreenStream: MediaStream | null;
  hasScreenAudio?: boolean;
  onStartScreenShare: () => Promise<boolean> | void;
  onStopScreenShare: () => Promise<void> | void;
  onAccept: () => void;
  onDecline: () => void;
  onEndCall: () => void;
  onToggleMic: () => void;
  onToggleVideo: () => void;
  currentUserId?: string;
}

export const CallModal: React.FC<CallModalProps> = ({
  activeCall,
  incomingCall,
  localStream,
  remoteStream,
  isMicMuted,
  isVideoMuted,
  callError,
  isLocalScreenSharing,
  isPeerScreenSharing,
  localScreenStream,
  hasScreenAudio,
  onStartScreenShare,
  onStopScreenShare,
  onAccept,
  onDecline,
  onEndCall,
  onToggleMic,
  onToggleVideo,
  currentUserId,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localScreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isStartingScreenShare, setIsStartingScreenShare] = useState(false);

  // Bind local camera stream to local video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Bind local screen share stream to local preview video element
  useEffect(() => {
    if (localScreenVideoRef.current && localScreenStream) {
      localScreenVideoRef.current.srcObject = localScreenStream;
    }
  }, [localScreenStream]);

  // Bind remote stream to remote video and audio elements
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Live call duration timer
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'connected') {
      setDurationSeconds(0);
      return;
    }
    const startTime = activeCall.connectedAt || Date.now();
    const interval = setInterval(() => {
      setDurationSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall?.status, activeCall?.connectedAt]);

  const handleScreenShareClick = async () => {
    if (isLocalScreenSharing) {
      await onStopScreenShare();
    } else {
      setIsStartingScreenShare(true);
      try {
        await onStartScreenShare();
      } finally {
        setIsStartingScreenShare(false);
      }
    }
  };

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 1. Incoming Call Banner / Dialog
  if (incomingCall && !activeCall) {
    return (
      <div
        id="incoming-call-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
      >
        <div
          id="incoming-call-card"
          className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl flex flex-col items-center text-center space-y-5"
        >
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-purple-500/40 animate-pulse">
              <img
                src={incomingCall.callerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                alt={incomingCall.callerName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute bottom-0 right-0 p-2 rounded-full bg-purple-600 text-white shadow-lg">
              {incomingCall.type === 'video' ? (
                <Video className="w-4 h-4" />
              ) : (
                <Phone className="w-4 h-4" />
              )}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">{incomingCall.callerName}</h3>
            <p className="text-sm text-neutral-400 mt-0.5">
              Incoming {incomingCall.type === 'video' ? 'Video' : 'Voice'} Call...
            </p>
          </div>

          <div className="flex items-center justify-center space-x-6 w-full pt-2">
            <button
              id="decline-call-button"
              type="button"
              onClick={onDecline}
              aria-label="Decline incoming call"
              className="flex flex-col items-center space-y-1.5 focus:outline-none group"
            >
              <div className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg transition-transform transform active:scale-95">
                <PhoneOff className="w-6 h-6" />
              </div>
              <span className="text-xs font-medium text-neutral-400 group-hover:text-white">Decline</span>
            </button>

            <button
              id="accept-call-button"
              type="button"
              onClick={onAccept}
              aria-label="Accept incoming call"
              className="flex flex-col items-center space-y-1.5 focus:outline-none group"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg transition-transform transform active:scale-95 animate-bounce">
                <Phone className="w-6 h-6" />
              </div>
              <span className="text-xs font-medium text-neutral-400 group-hover:text-white">Accept</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Active Call UI
  if (!activeCall) return null;

  const isCaller = activeCall.callerId === currentUserId;
  const peerName = isCaller ? activeCall.recipientName : activeCall.callerName;
  const peerAvatar = isCaller ? activeCall.recipientAvatar : activeCall.callerAvatar;
  const isVideoCall = activeCall.type === 'video';

  // Minimized floating pip bar
  if (isMinimized) {
    return (
      <aside
        id="minimized-call-pill"
        aria-label="Active call widget"
        className="fixed bottom-20 right-4 z-50 flex items-center space-x-3 bg-neutral-900 border border-neutral-700 shadow-2xl rounded-full px-4 py-2 text-white animate-in slide-in-from-bottom duration-200"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-emerald-500/50">
          <img
            src={peerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
            alt={peerName}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="text-xs">
          <p className="font-semibold leading-none">{peerName}</p>
          <p className="text-emerald-400 font-mono mt-0.5">
            {activeCall.status === 'connected' ? formatDuration(durationSeconds) : activeCall.status}
          </p>
        </div>
        <button
          id="maximize-call-button"
          type="button"
          onClick={() => setIsMinimized(false)}
          aria-label="Maximize call window"
          className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          id="end-call-minimized-button"
          type="button"
          onClick={onEndCall}
          aria-label="End call"
          className="p-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  // Full Screen / Modal Active Call Window
  return (
    <div
      id="active-call-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-lg p-3 sm:p-6 animate-in fade-in duration-200"
    >
      <div
        id="active-call-container"
        className="relative w-full max-w-2xl h-[85vh] max-h-[640px] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-900/80 border-b border-neutral-800/80 z-20">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-neutral-700">
              <img
                src={peerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                alt={peerName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white leading-tight">{peerName}</h4>
              <p className="text-xs text-neutral-400 flex items-center space-x-1.5">
                {activeCall.status === 'connected' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-mono text-emerald-400">{formatDuration(durationSeconds)}</span>
                  </>
                ) : activeCall.status === 'ringing' || activeCall.status === 'calling' ? (
                  <span className="text-purple-400 animate-pulse">Ringing...</span>
                ) : (
                  <span className="text-neutral-400 capitalize">{activeCall.status}...</span>
                )}
              </p>
            </div>
          </div>

          <button
            id="minimize-call-button"
            type="button"
            onClick={() => setIsMinimized(true)}
            aria-label="Minimize call window"
            className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>

        {/* Call Error Banner if any */}
        {callError && (
          <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center space-x-2 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{callError}</span>
          </div>
        )}

        {/* Video / Audio Stage */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          {/* Always render remote audio element so audio plays regardless of video mode */}
          <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

          {isVideoCall || isPeerScreenSharing || isLocalScreenSharing ? (
            <>
              {/* Screen Sharing Active Badges */}
              {isPeerScreenSharing && (
                <div
                  id="peer-screenshare-badge"
                  className="absolute top-4 left-4 z-20 flex items-center space-x-2 bg-purple-950/90 border border-purple-500/50 rounded-full px-3 py-1.5 text-xs text-purple-200 backdrop-blur-md shadow-lg"
                >
                  <Monitor className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="font-medium">{peerName} is sharing their screen</span>
                  {hasScreenAudio && (
                    <span className="bg-purple-800 text-[10px] px-1.5 py-0.5 rounded text-purple-200 font-mono">
                      Audio
                    </span>
                  )}
                </div>
              )}

              {isLocalScreenSharing && (
                <div
                  id="local-screenshare-badge"
                  className="absolute top-4 left-4 z-20 flex items-center space-x-2 bg-emerald-950/90 border border-emerald-500/50 rounded-full px-3 py-1.5 text-xs text-emerald-200 backdrop-blur-md shadow-lg"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="font-medium">You are sharing your screen</span>
                  {hasScreenAudio && (
                    <span className="bg-emerald-800 text-[10px] px-1.5 py-0.5 rounded text-emerald-200 font-mono">
                      With Audio
                    </span>
                  )}
                  <button
                    onClick={onStopScreenShare}
                    className="ml-2 bg-red-600/80 hover:bg-red-600 text-white text-[11px] px-2 py-0.5 rounded-full transition-colors font-medium"
                  >
                    Stop
                  </button>
                </div>
              )}

              {/* Remote Video / Shared Screen Display */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`w-full h-full ${isPeerScreenSharing ? 'object-contain bg-neutral-950' : 'object-cover'}`}
              />

              {/* Local Video Camera PiP (when not sharing screen) */}
              {isVideoCall && !isLocalScreenSharing && (
                <div className="absolute top-4 right-4 w-28 h-40 sm:w-36 sm:h-48 rounded-xl overflow-hidden border-2 border-neutral-700 shadow-2xl bg-neutral-950 z-10">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isVideoMuted ? 'hidden' : 'block'}`}
                  />
                  {isVideoMuted && (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900 text-neutral-400 p-2 text-center">
                      <VideoOff className="w-6 h-6 mb-1 text-neutral-500" />
                      <span className="text-[10px]">Camera Off</span>
                    </div>
                  )}
                </div>
              )}

              {/* Local Screen Share Preview PiP (when actively presenting screen) */}
              {isLocalScreenSharing && (
                <div className="absolute top-4 right-4 w-36 h-24 sm:w-52 sm:h-32 rounded-xl overflow-hidden border-2 border-emerald-500/70 shadow-2xl bg-neutral-950 z-20">
                  <video
                    ref={localScreenVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain bg-black"
                  />
                  <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between text-[10px] text-emerald-300 bg-black/75 px-2 py-0.5 rounded backdrop-blur">
                    <span className="truncate">Your Screen</span>
                    <button
                      onClick={onStopScreenShare}
                      className="text-red-400 hover:text-red-300 font-semibold ml-1 shrink-0"
                    >
                      Stop
                    </button>
                  </div>
                </div>
              )}

              {/* Remote Stream fallback placeholder if peer has not sent video/screen yet */}
              {activeCall.status !== 'connected' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900/95 space-y-4">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-purple-500/40 animate-pulse">
                    <img
                      src={peerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                      alt={peerName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-center">
                    <h3 className="text-lg font-bold text-white">{peerName}</h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      {activeCall.status === 'calling' || activeCall.status === 'ringing'
                        ? 'Waiting for answer...'
                        : 'Establishing secure WebRTC connection...'}
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Audio Call Centered Stage */
            <div className="flex flex-col items-center justify-center space-y-5 p-6 text-center">
              <div className="relative">
                <div
                  className={`w-32 h-32 rounded-full overflow-hidden border-4 transition-all ${
                    activeCall.status === 'connected'
                      ? 'border-emerald-500/60 shadow-[0_0_40px_rgba(16,185,129,0.2)]'
                      : 'border-purple-500/50 animate-pulse'
                  }`}
                >
                  <img
                    src={peerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt={peerName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                {activeCall.status === 'connected' && (
                  <div className="absolute -bottom-2 -right-2 p-2.5 rounded-full bg-emerald-600 text-white shadow-lg">
                    <Volume2 className="w-4 h-4" />
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-xl font-bold text-white">{peerName}</h3>
                <p className="text-sm text-neutral-400 mt-1 font-mono">
                  {activeCall.status === 'connected'
                    ? formatDuration(durationSeconds)
                    : activeCall.status === 'ringing' || activeCall.status === 'calling'
                    ? 'Calling...'
                    : 'Connecting audio...'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom In-Call Controls Bar */}
        <div className="px-6 py-5 bg-neutral-900/90 border-t border-neutral-800 flex items-center justify-center space-x-4 sm:space-x-6 z-20">
          {/* Mute Microphone */}
          <button
            id="toggle-mic-button"
            type="button"
            onClick={onToggleMic}
            aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-md focus:outline-none ${
              isMicMuted
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-neutral-800 text-white hover:bg-neutral-700'
            }`}
          >
            {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Toggle Camera (for video calls) */}
          {isVideoCall && (
            <button
              id="toggle-video-button"
              type="button"
              onClick={onToggleVideo}
              aria-label={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-md focus:outline-none ${
                isVideoMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                  : 'bg-neutral-800 text-white hover:bg-neutral-700'
              }`}
            >
              {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>
          )}

          {/* Screen Sharing Toggle Button */}
          {activeCall.status === 'connected' && (
            <button
              id="toggle-screenshare-button"
              type="button"
              onClick={handleScreenShareClick}
              disabled={isStartingScreenShare}
              aria-label={isLocalScreenSharing ? 'Stop sharing screen' : 'Share screen'}
              title={isLocalScreenSharing ? 'Stop sharing screen' : 'Share screen'}
              className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md focus:outline-none ${
                isLocalScreenSharing
                  ? 'bg-amber-500/20 text-amber-300 border-2 border-amber-500/60 hover:bg-amber-500/30'
                  : 'bg-neutral-800 text-white hover:bg-neutral-700 hover:text-purple-300'
              }`}
            >
              {isLocalScreenSharing ? (
                <MonitorOff className="w-5 h-5 text-amber-400" />
              ) : (
                <Monitor className="w-5 h-5" />
              )}
              {isLocalScreenSharing && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-neutral-900" />
              )}
            </button>
          )}

          {/* End Call Button */}
          <button
            id="end-call-button"
            type="button"
            onClick={onEndCall}
            aria-label="End active call"
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg transition-transform transform active:scale-95 focus:outline-none"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

import { api } from './api.ts';
import type { CallSession, CallSignalPayload } from '../types/index.ts';

export let RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export async function fetchRtcConfiguration(): Promise<RTCConfiguration> {
  try {
    const res = await api.getIceServers();
    if (res && res.iceServers && res.iceServers.length > 0) {
      RTC_CONFIG = {
        iceServers: res.iceServers,
      };
    }
  } catch (err) {
    console.warn('Using default STUN configuration:', err);
  }
  return RTC_CONFIG;
}

// Prefetch ICE configuration from server
fetchRtcConfiguration().catch(() => {});

function getAudioVideoPreferences(): { noiseSuppression: boolean; dataSaver: boolean } {
  try {
    const raw = localStorage.getItem('hangout_user_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        noiseSuppression: typeof parsed.noiseCancellation === 'boolean' ? parsed.noiseCancellation : true,
        dataSaver: typeof parsed.dataSaver === 'boolean' ? parsed.dataSaver : false,
      };
    }
  } catch {}
  return { noiseSuppression: true, dataSaver: false };
}

export async function requestMediaStream(constraints: {
  audio: boolean | MediaTrackConstraints;
  video: boolean | MediaTrackConstraints;
}): Promise<{ stream?: MediaStream; error?: string }> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { error: 'Media devices are not accessible in this environment. Please ensure camera/microphone permissions are granted.' };
    }

    const { noiseSuppression, dataSaver } = getAudioVideoPreferences();

    const audioConstraint = typeof constraints.audio === 'boolean'
      ? (constraints.audio ? {
          echoCancellation: true,
          noiseSuppression,
          autoGainControl: true,
        } : false)
      : constraints.audio;

    let videoConstraint = constraints.video;
    if (typeof videoConstraint === 'boolean' && videoConstraint) {
      videoConstraint = dataSaver
        ? { width: { max: 640 }, height: { max: 480 }, frameRate: { max: 15 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraint,
      video: videoConstraint,
    });
    return { stream };
  } catch (err: any) {
    let message = 'Unable to access microphone or camera.';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      message = `${constraints.video ? 'Camera' : 'Microphone'} permission was denied by your browser. Please allow permission to proceed.`;
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      message = `No ${constraints.video ? 'camera' : 'microphone'} device found on this system.`;
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      message = 'Device is currently locked or in use by another application.';
    } else if (err.message) {
      message = err.message;
    }
    return { error: message };
  }
}

export function isScreenCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  );
}

export async function requestScreenStream(): Promise<{
  stream?: MediaStream;
  error?: string;
  hasAudio?: boolean;
}> {
  if (!isScreenCaptureSupported()) {
    return {
      error:
        'BLOCKED — PLATFORM CAPABILITY REQUIRED: Screen sharing is not supported by your browser or operating system on this device. Mobile browsers do not expose display capture APIs.',
    };
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor',
      } as any,
      audio: true, // request system/tab audio if supported by browser
    });

    const videoTracks = stream.getVideoTracks();
    if (!videoTracks || videoTracks.length === 0) {
      stopMediaStream(stream);
      return { error: 'No video track found in captured screen.' };
    }

    // Set content hint to 'detail' for crisp text rendering across WebRTC
    if ('contentHint' in videoTracks[0]) {
      try {
        videoTracks[0].contentHint = 'detail';
      } catch {}
    }

    const hasAudio = stream.getAudioTracks().length > 0;
    return { stream, hasAudio };
  } catch (err: any) {
    let message = 'Unable to capture screen.';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      message = 'Screen capture was cancelled or permission was denied.';
    } else if (err.name === 'AbortError') {
      message = 'Screen selection prompt was cancelled.';
    } else if (err.name === 'NotSupportedError') {
      message = 'Screen sharing is not supported in this environment.';
    } else if (err.name === 'InvalidStateError') {
      message = 'Screen capture could not be initialized.';
    } else if (err.message) {
      message = err.message;
    }
    return { error: message };
  }
}

export function stopMediaStream(stream?: MediaStream | null) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (err) {
        console.warn('Failed to stop media track:', err);
      }
    });
  } catch (e) {
    console.warn('Failed to iterate media tracks:', e);
  }
}

export class AudioActivityDetector {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animFrame: number | null = null;
  private onSpeakingChange: (isSpeaking: boolean) => void;
  private isSpeaking = false;
  private threshold = 18;

  constructor(
    streamOrCallback: MediaStream | ((isSpeaking: boolean) => void),
    onSpeakingChange?: (isSpeaking: boolean) => void
  ) {
    if (typeof streamOrCallback === 'function') {
      this.onSpeakingChange = streamOrCallback;
    } else {
      this.onSpeakingChange = onSpeakingChange || (() => {});
      this.start(streamOrCallback);
    }
  }

  start(stream: MediaStream) {
    if (this.source || this.audioCtx) {
      this.stop();
    }
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      this.audioCtx = new AudioCtxClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3;
      this.source = this.audioCtx.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const checkAudio = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const speaking = average > this.threshold;
        if (speaking !== this.isSpeaking) {
          this.isSpeaking = speaking;
          this.onSpeakingChange(speaking);
        }
        this.animFrame = requestAnimationFrame(checkAudio);
      };
      checkAudio();
    } catch (err) {
      console.warn('AudioActivityDetector initialization skipped:', err);
    }
  }

  stop() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {}
      this.source = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
    this.analyser = null;
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.onSpeakingChange(false);
    }
  }

  destroy() {
    this.stop();
  }
}

export interface CallControllerCallbacks {
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onError?: (errorMessage: string) => void;
  onEnded?: (reason?: string) => void;
  onLocalScreenShareChange?: (isSharing: boolean, stream: MediaStream | null, hasAudio?: boolean) => void;
  onPeerScreenShareChange?: (isSharing: boolean) => void;
}

export class WebRTCCallManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private isScreenSharing = false;
  private originalVideoTrack: MediaStreamTrack | null = null;
  private wasCameraEnabledBeforeShare = false;
  private callId: string;
  private callbacks: CallControllerCallbacks;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private isCaller: boolean;
  private isDestroyed = false;

  constructor(callId: string, isCaller: boolean, callbacks: CallControllerCallbacks) {
    this.callId = callId;
    this.isCaller = isCaller;
    this.callbacks = callbacks;
  }

  async initialize(localStream: MediaStream) {
    this.localStream = localStream;
    this.remoteStream = new MediaStream();

    try {
      this.pc = new RTCPeerConnection(RTC_CONFIG);

      // Add local tracks to peer connection
      this.localStream.getTracks().forEach((track) => {
        if (this.pc && this.localStream) {
          this.pc.addTrack(track, this.localStream);
        }
      });

      // Track incoming remote tracks
      this.pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          event.streams[0].getTracks().forEach((t) => {
            if (this.remoteStream && !this.remoteStream.getTracks().some((x) => x.id === t.id)) {
              this.remoteStream.addTrack(t);
            }
          });
        } else if (event.track && this.remoteStream) {
          this.remoteStream.addTrack(event.track);
        }
        if (this.remoteStream) {
          this.callbacks.onRemoteStream?.(this.remoteStream);
        }
      };

      // Send local ICE candidates to peer via server
      this.pc.onicecandidate = (event) => {
        if (event.candidate && !this.isDestroyed) {
          api.sendCallSignal(this.callId, 'ice-candidate', event.candidate.toJSON()).catch((e) => {
            console.warn('Failed to send ICE candidate:', e);
          });
        }
      };

      this.pc.onconnectionstatechange = () => {
        if (this.pc && !this.isDestroyed) {
          const state = this.pc.connectionState;
          this.callbacks.onConnectionStateChange?.(state);
          if (state === 'failed' || state === 'disconnected' || state === 'closed') {
            if (state === 'failed') {
              this.callbacks.onError?.('Call connection failed or lost.');
            }
          }
        }
      };

      // Process any early candidates
      if (this.pendingCandidates.length > 0) {
        for (const cand of this.pendingCandidates) {
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.warn('Failed to add queued candidate:', e);
          }
        }
        this.pendingCandidates = [];
      }
    } catch (err: any) {
      console.error('Failed to create RTCPeerConnection:', err);
      this.callbacks.onError?.(err?.message || 'Failed to initialize WebRTC connection.');
    }
  }

  async createAndSendOffer() {
    if (!this.pc) return;
    try {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await this.pc.setLocalDescription(offer);
      await api.sendCallSignal(this.callId, 'offer', offer);
    } catch (err: any) {
      console.error('Error creating WebRTC offer:', err);
      this.callbacks.onError?.('Failed to create call offer.');
    }
  }

  async handleIncomingOffer(offer: RTCSessionDescriptionInit) {
    if (!this.pc) return;
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await api.sendCallSignal(this.callId, 'answer', answer);
    } catch (err: any) {
      console.error('Error handling incoming WebRTC offer:', err);
      this.callbacks.onError?.('Failed to accept incoming call signal.');
    }
  }

  async handleIncomingAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.pc) return;
    try {
      if (this.pc.signalingState !== 'stable') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (err: any) {
      console.error('Error handling WebRTC answer:', err);
    }
  }

  async handleIncomingIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err: any) {
      console.warn('Failed to add ICE candidate:', err);
    }
  }

  toggleMicrophone(enabled: boolean) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  toggleCamera(enabled: boolean) {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getIsScreenSharing(): boolean {
    return this.isScreenSharing;
  }

  getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  async startScreenShare(): Promise<{ success: boolean; error?: string; hasAudio?: boolean }> {
    if (this.isDestroyed || !this.pc) {
      return { success: false, error: 'WebRTC connection is not active.' };
    }
    if (this.isScreenSharing && this.screenStream) {
      return {
        success: true,
        hasAudio: this.screenStream.getAudioTracks().length > 0,
      };
    }

    const { stream, error, hasAudio } = await requestScreenStream();
    if (error || !stream) {
      return { success: false, error: error || 'Failed to capture screen.' };
    }

    const screenVideoTrack = stream.getVideoTracks()[0];
    if (!screenVideoTrack) {
      stopMediaStream(stream);
      return { success: false, error: 'Captured stream has no video track.' };
    }

    // Critical: Listen for OS or browser native "Stop sharing" event
    screenVideoTrack.onended = () => {
      this.stopScreenShare();
    };

    try {
      this.screenStream = stream;
      this.isScreenSharing = true;

      // Remember current camera track so it can be restored when screen sharing ends
      const currentCamTrack = this.localStream ? this.localStream.getVideoTracks()[0] : null;
      this.originalVideoTrack = currentCamTrack || null;
      this.wasCameraEnabledBeforeShare = !!currentCamTrack && currentCamTrack.enabled && currentCamTrack.readyState === 'live';

      const senders = this.pc.getSenders();
      let videoSender = senders.find((s) => s.track && s.track.kind === 'video');
      if (!videoSender) {
        videoSender = senders.find((s) => s.track === null && !('dtmf' in s));
      }

      if (videoSender) {
        await videoSender.replaceTrack(screenVideoTrack);
      } else {
        // Add track and renegotiate WebRTC connection
        this.pc.addTrack(screenVideoTrack, stream);
        await this.createAndSendOffer();
      }

      // Handle optional captured audio track from tab/system
      const screenAudioTrack = stream.getAudioTracks()[0];
      if (screenAudioTrack) {
        screenAudioTrack.onended = () => {
          // Audio track ended
        };
        try {
          this.pc.addTrack(screenAudioTrack, stream);
        } catch (e) {
          console.warn('Could not add screen audio track:', e);
        }
      }

      // Send signaling to remote peer
      await api.sendCallSignal(this.callId, 'screenshare-started', {
        isSharing: true,
        hasAudio: !!hasAudio,
      });

      this.callbacks.onLocalScreenShareChange?.(true, stream, hasAudio);
      return { success: true, hasAudio };
    } catch (err: any) {
      console.error('Error starting screen share on peer connection:', err);
      stopMediaStream(stream);
      this.screenStream = null;
      this.isScreenSharing = false;
      return { success: false, error: err?.message || 'Failed to attach screen share track to call.' };
    }
  }

  async stopScreenShare(): Promise<void> {
    if (!this.isScreenSharing && !this.screenStream) return;

    const streamToStop = this.screenStream;
    this.screenStream = null;
    this.isScreenSharing = false;

    // Stop real display tracks
    stopMediaStream(streamToStop);

    // Restore original video sender
    if (this.pc && !this.isDestroyed) {
      try {
        const senders = this.pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video') || senders.find((s) => s.track === null);

        if (videoSender) {
          if (this.originalVideoTrack && this.originalVideoTrack.readyState === 'live') {
            this.originalVideoTrack.enabled = this.wasCameraEnabledBeforeShare;
            await videoSender.replaceTrack(this.originalVideoTrack);
          } else {
            await videoSender.replaceTrack(null);
          }
        }
      } catch (err) {
        console.warn('Error restoring camera track after screen share:', err);
      }
    }

    // Send stop signal to remote peer
    try {
      await api.sendCallSignal(this.callId, 'screenshare-stopped', { isSharing: false });
    } catch (e) {
      console.warn('Failed to send screenshare-stopped signal:', e);
    }

    this.callbacks.onLocalScreenShareChange?.(false, null, false);
  }

  handlePeerScreenShareSignal(isSharing: boolean) {
    this.callbacks.onPeerScreenShareChange?.(isSharing);
  }

  destroy() {
    this.isDestroyed = true;

    if (this.screenStream) {
      stopMediaStream(this.screenStream);
      this.screenStream = null;
    }
    this.isScreenSharing = false;
    this.originalVideoTrack = null;

    stopMediaStream(this.localStream);
    this.localStream = null;

    stopMediaStream(this.remoteStream);
    this.remoteStream = null;

    if (this.pc) {
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }
    this.pendingCandidates = [];
  }
}

export interface MediaSyncPayload {
  type: 'media_sync';
  action: 'play' | 'pause' | 'seek' | 'sync';
  position: number;
  duration?: number;
  controllerId: string;
  timestamp: number;
  revision: number;
}

export interface RoomVoiceMeshCallbacks {
  onPeerSpeakingChange?: (userId: string, isSpeaking: boolean) => void;
  onPeerConnectionStateChange?: (userId: string, state: RTCPeerConnectionState) => void;
  onError?: (err: string) => void;
  onLocalSpeakingChange?: (isSpeaking: boolean) => void;
  onPeerMediaSync?: (payload: MediaSyncPayload) => void;
  onDataChannelStateChange?: (peerId: string, state: RTCDataChannelState) => void;
}

interface PeerAudioSession {
  pc: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  audioEl?: HTMLAudioElement;
  remoteStream?: MediaStream;
  detector?: AudioActivityDetector;
  pendingCandidates: RTCIceCandidateInit[];
}

export class RoomVoiceMeshManager {
  private roomId: string;
  private currentUserId: string;
  private localStream: MediaStream | null = null;
  private isMuted: boolean = false;
  private callbacks: RoomVoiceMeshCallbacks;
  private peers = new Map<string, PeerAudioSession>();
  private localAudioDetector: AudioActivityDetector | null = null;
  private isDestroyed = false;
  private lastSpeakingSent = 0;
  private volume: number = 1.0;
  private mediaRevision: number = 0;

  constructor(roomId: string, currentUserId: string, callbacks: RoomVoiceMeshCallbacks = {}) {
    this.roomId = roomId;
    this.currentUserId = currentUserId;
    this.callbacks = callbacks;
  }

  setLocalStream(stream: MediaStream | null) {
    if (this.isDestroyed) return;
    this.localStream = stream;

    // Local speaking activity detection
    if (this.localAudioDetector) {
      this.localAudioDetector.destroy();
      this.localAudioDetector = null;
    }

    if (stream && !this.isMuted) {
      this.localAudioDetector = new AudioActivityDetector(stream, (isSpeaking) => {
        if (this.isDestroyed) return;
        this.callbacks.onLocalSpeakingChange?.(isSpeaking);
        this.callbacks.onPeerSpeakingChange?.(this.currentUserId, isSpeaking);

        // Throttle server speaking broadcast
        const now = Date.now();
        if (now - this.lastSpeakingSent > 600 || !isSpeaking) {
          this.lastSpeakingSent = now;
          api.setRoomSpeaking(this.roomId, isSpeaking).catch(() => {});
        }
      });
    } else {
      this.callbacks.onLocalSpeakingChange?.(false);
      this.callbacks.onPeerSpeakingChange?.(this.currentUserId, false);
      api.setRoomSpeaking(this.roomId, false).catch(() => {});
    }

    // Update track on all active peer connections
    const audioTrack = stream ? stream.getAudioTracks()[0] : null;
    this.peers.forEach((peer, peerId) => {
      try {
        const senders = peer.pc.getSenders();
        const audioSender = senders.find((s) => s.track && s.track.kind === 'audio') || senders.find((s) => s.track === null);

        if (audioSender) {
          if (audioTrack) {
            audioTrack.enabled = !this.isMuted;
            audioSender.replaceTrack(audioTrack).catch((err) => {
              console.warn(`Failed to replace audio track for peer ${peerId}:`, err);
            });
          } else {
            audioSender.replaceTrack(null).catch(() => {});
          }
        } else if (audioTrack) {
          peer.pc.addTrack(audioTrack, stream!);
          this.initiateOffer(peerId, peer.pc).catch((err) => {
            console.warn(`Failed to renegotiate offer for peer ${peerId}:`, err);
          });
        }
      } catch (err) {
        console.warn(`Error updating tracks for peer ${peerId}:`, err);
      }
    });
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    if (muted) {
      if (this.localAudioDetector) {
        this.localAudioDetector.stop();
      }
      this.callbacks.onLocalSpeakingChange?.(false);
      this.callbacks.onPeerSpeakingChange?.(this.currentUserId, false);
      api.setRoomSpeaking(this.roomId, false).catch(() => {});
    } else if (this.localStream) {
      if (this.localAudioDetector) {
        this.localAudioDetector.start(this.localStream);
      } else {
        this.setLocalStream(this.localStream);
      }
    }
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.peers.forEach((peer) => {
      if (peer.audioEl) {
        peer.audioEl.volume = this.volume;
      }
    });
  }

  syncMembers(memberIds: string[]) {
    if (this.isDestroyed) return;

    const currentMemberSet = new Set(memberIds);

    // Remove left members
    this.peers.forEach((_, peerId) => {
      if (!currentMemberSet.has(peerId)) {
        this.removePeer(peerId);
      }
    });

    // Connect to current room members
    memberIds.forEach((memberId) => {
      if (memberId !== this.currentUserId && !this.peers.has(memberId)) {
        const pc = this.createPeerConnection(memberId);
        // Lexicographical ordering for deterministic offer creation
        if (this.currentUserId > memberId) {
          this.initiateOffer(memberId, pc).catch((err) => {
            console.warn(`Failed to initiate offer to peer ${memberId}:`, err);
          });
        }
      }
    });
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerSession: PeerAudioSession = {
      pc,
      pendingCandidates: [],
    };
    this.peers.set(peerId, peerSession);

    // Create DataChannel for media synchronization if current user is the offering peer
    if (this.currentUserId > peerId) {
      try {
        const dc = pc.createDataChannel('media_sync', { ordered: true });
        this.setupDataChannel(peerId, peerSession, dc);
      } catch (err) {
        console.warn(`Failed to create data channel for peer ${peerId}:`, err);
      }
    }

    // Listen for incoming DataChannel from offering peer
    pc.ondatachannel = (event) => {
      if (event.channel) {
        this.setupDataChannel(peerId, peerSession, event.channel);
      }
    };

    // Add local tracks if available
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted;
        try {
          pc.addTrack(track, this.localStream!);
        } catch (e) {
          console.warn(`Failed to add track to peer ${peerId}:`, e);
        }
      });
    } else {
      // Add receive-only transceiver so incoming audio can be received even if local mic is muted
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch {}
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && !this.isDestroyed) {
        api.sendRoomVoiceSignal(this.roomId, peerId, 'ice-candidate', event.candidate.toJSON()).catch((err) => {
          console.warn(`Failed to send ICE candidate to ${peerId}:`, err);
        });
      }
    };

    pc.ontrack = (event) => {
      if (this.isDestroyed) return;
      const remoteStream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      peerSession.remoteStream = remoteStream;

      // Create or reuse HTMLAudioElement for playback
      if (!peerSession.audioEl) {
        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        (audioEl as any).playsInline = true;
        audioEl.volume = this.volume;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        peerSession.audioEl = audioEl;
      }

      peerSession.audioEl.srcObject = remoteStream;
      peerSession.audioEl.play().catch((err) => {
        console.warn(`Auto-play prevented for peer ${peerId} audio:`, err);
      });

      // Hook audio activity detector for remote speaking indicator
      if (peerSession.detector) {
        peerSession.detector.destroy();
      }
      peerSession.detector = new AudioActivityDetector(remoteStream, (isSpeaking) => {
        if (!this.isDestroyed) {
          this.callbacks.onPeerSpeakingChange?.(peerId, isSpeaking);
        }
      });
    };

    pc.onconnectionstatechange = () => {
      if (this.isDestroyed) return;
      this.callbacks.onPeerConnectionStateChange?.(peerId, pc.connectionState);
      if (pc.connectionState === 'failed') {
        console.warn(`Connection to peer ${peerId} failed, restarting ICE...`);
        this.initiateOffer(peerId, pc, true).catch(() => {});
      }
    };

    return pc;
  }

  private setupDataChannel(peerId: string, peerSession: PeerAudioSession, dc: RTCDataChannel) {
    peerSession.dataChannel = dc;

    dc.onopen = () => {
      if (this.isDestroyed) return;
      this.callbacks.onDataChannelStateChange?.(peerId, dc.readyState);
    };

    dc.onclose = () => {
      if (this.isDestroyed) return;
      this.callbacks.onDataChannelStateChange?.(peerId, dc.readyState);
    };

    dc.onerror = (err) => {
      console.warn(`DataChannel error with peer ${peerId}:`, err);
    };

    dc.onmessage = (event) => {
      if (this.isDestroyed) return;
      try {
        if (typeof event.data === 'string') {
          const payload = JSON.parse(event.data);
          if (payload && payload.type === 'media_sync') {
            this.callbacks.onPeerMediaSync?.(payload as MediaSyncPayload);
          }
        }
      } catch (err) {
        console.warn('Failed to parse DataChannel message:', err);
      }
    };
  }

  broadcastMediaAction(
    action: 'play' | 'pause' | 'seek' | 'sync',
    position: number,
    duration?: number
  ): MediaSyncPayload {
    this.mediaRevision += 1;
    const payload: MediaSyncPayload = {
      type: 'media_sync',
      action,
      position,
      duration,
      controllerId: this.currentUserId,
      timestamp: Date.now(),
      revision: this.mediaRevision,
    };

    const message = JSON.stringify(payload);
    this.peers.forEach((peer) => {
      if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
        try {
          peer.dataChannel.send(message);
        } catch (err) {
          console.warn('Failed to send media sync payload via DataChannel:', err);
        }
      }
    });

    return payload;
  }

  private async initiateOffer(peerId: string, pc: RTCPeerConnection, iceRestart = false) {
    try {
      const offer = await pc.createOffer({
        iceRestart,
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);
      await api.sendRoomVoiceSignal(this.roomId, peerId, 'offer', offer);
    } catch (err: any) {
      console.warn(`Error creating offer for peer ${peerId}:`, err);
    }
  }

  async handleVoiceSignal(
    fromUserId: string,
    targetUserId: string | undefined,
    type: 'offer' | 'answer' | 'ice-candidate',
    data: any
  ) {
    if (this.isDestroyed) return;
    if (fromUserId === this.currentUserId) return;
    if (targetUserId && targetUserId !== this.currentUserId) return;

    let peer = this.peers.get(fromUserId);
    if (!peer) {
      const pc = this.createPeerConnection(fromUserId);
      peer = this.peers.get(fromUserId)!;
    }

    const { pc } = peer;

    try {
      if (type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data));

        // Process any queued ICE candidates
        if (peer.pendingCandidates.length > 0) {
          for (const cand of peer.pendingCandidates) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.warn('Failed to add queued candidate:', e);
            }
          }
          peer.pendingCandidates = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await api.sendRoomVoiceSignal(this.roomId, fromUserId, 'answer', answer);
      } else if (type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          if (peer.pendingCandidates.length > 0) {
            for (const cand of peer.pendingCandidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.warn('Failed to add queued candidate:', e);
              }
            }
            peer.pendingCandidates = [];
          }
        }
      } else if (type === 'ice-candidate') {
        if (data) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(data));
          } else {
            peer.pendingCandidates.push(data);
          }
        }
      }
    } catch (err: any) {
      console.error(`Error processing voice signal (${type}) from ${fromUserId}:`, err);
    }
  }

  private removePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    if (peer.dataChannel) {
      try {
        peer.dataChannel.close();
      } catch {}
    }
    if (peer.detector) {
      peer.detector.destroy();
    }
    if (peer.audioEl) {
      try {
        peer.audioEl.srcObject = null;
        peer.audioEl.remove();
      } catch {}
    }
    try {
      peer.pc.close();
    } catch {}

    this.peers.delete(peerId);
    this.callbacks.onPeerSpeakingChange?.(peerId, false);
  }

  destroy() {
    this.isDestroyed = true;

    if (this.localAudioDetector) {
      this.localAudioDetector.destroy();
      this.localAudioDetector = null;
    }

    this.peers.forEach((peer, peerId) => {
      if (peer.dataChannel) {
        try {
          peer.dataChannel.close();
        } catch {}
      }
      if (peer.detector) {
        peer.detector.destroy();
      }
      if (peer.audioEl) {
        try {
          peer.audioEl.srcObject = null;
          peer.audioEl.remove();
        } catch {}
      }
      try {
        peer.pc.close();
      } catch {}
    });
    this.peers.clear();

    if (this.localStream) {
      stopMediaStream(this.localStream);
      this.localStream = null;
    }
  }
}


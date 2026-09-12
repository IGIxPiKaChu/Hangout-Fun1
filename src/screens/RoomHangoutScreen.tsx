import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Users,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Send,
  Smile,
  PhoneOff,
  Share2,
  Volume2,
  LogOut,
  X,
  Crown,
  Shield,
  ShieldAlert,
  Film,
  Play,
  Trash2,
  AlertTriangle,
  Image as ImageIcon,
  MoreVertical,
  Menu,
  UserPlus,
  Info,
  ArrowDown,
  RefreshCw,
  WifiOff,
  Monitor,
  MonitorOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Room, RoomMessage, RoomMemberUser, TypingUser, CurrentMedia, MediaSyncState } from '../types/index.ts';
import { Avatar } from '../components/common/Avatar.tsx';
import { SelectMediaModal, type SelectedMediaPayload } from '../components/modals/SelectMediaModal.tsx';
import { SendDeviceMediaModal } from '../components/modals/SendDeviceMediaModal.tsx';
import { RoomInfoModal } from '../components/modals/RoomInfoModal.tsx';
import { AddFriendModal } from '../components/modals/AddFriendModal.tsx';
import { extractYouTubeId } from '../components/modals/YouTubeModal.tsx';
import { ChatMediaAttachment } from '../components/chat/ChatMediaAttachment.tsx';
import { ChatMediaPlayer } from '../components/chat/ChatMediaPlayer.tsx';
import { TypingIndicator } from '../components/chat/TypingIndicator.tsx';
import { TranslatableMessageContent } from '../components/chat/TranslatableMessageContent.tsx';
import {
  requestMediaStream,
  requestScreenStream,
  stopMediaStream,
  AudioActivityDetector,
  RoomVoiceMeshManager,
} from '../services/webrtc.ts';

interface ReactionBubble {
  id: string;
  emoji: string;
  x: number;
}

export const RoomHangoutScreen: React.FC = () => {
  const { selectedRoomId, navigate, openMembersModal, showToast, isUserOnline, userSettings } = useApp();
  const { currentUser } = useAuth();
  const targetLanguage = userSettings?.chatTranslationLanguage || userSettings?.language || 'en';

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMemberUser[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [inputText, setInputText] = useState('');
  const [isMicOn, setIsMicOn] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [activeReactions, setActiveReactions] = useState<ReactionBubble[]>([]);
  const [speakingUserId, setSpeakingUserId] = useState<string | null>(null);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [showDisbandConfirmation, setShowDisbandConfirmation] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isDisbanding, setIsDisbanding] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isDeviceMediaModalOpen, setIsDeviceMediaModalOpen] = useState(false);
  const [isSendingDeviceMedia, setIsSendingDeviceMedia] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRoomInfoModalOpen, setIsRoomInfoModalOpen] = useState(false);
  const [isAddFriendModalOpen, setIsAddFriendModalOpen] = useState(false);

  // Real-time Chat SSE Stream State
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'error'>('connecting');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [unseenNewMessagesCount, setUnseenNewMessagesCount] = useState(0);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  // Synchronized Media Playback State (Phase 13 Watch Party)
  const [mediaSync, setMediaSync] = useState<MediaSyncState | null>(null);
  const [serverTime, setServerTime] = useState<number>(Date.now());

  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const stageScreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioDetectorRef = useRef<AudioActivityDetector | null>(null);
  const voiceMeshManagerRef = useRef<RoomVoiceMeshManager | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Authoritative moderation evaluation
  const isCurrentUserMuted = !!(room && currentUser && (room.mutedUserIds || []).includes(currentUser.id));
  const isHost = room?.hostId === currentUser?.id;
  const isAdmin = (room?.adminIds || []).includes(currentUser?.id || '');
  const hasMediaPermission = isHost || isAdmin || (room?.allowedMediaUserIds || []).includes(currentUser?.id || '');

  // Initialize and clean up Room Voice Mesh Manager
  useEffect(() => {
    if (!selectedRoomId || !currentUser) return;

    const voiceMesh = new RoomVoiceMeshManager(selectedRoomId, currentUser.id, {
      onPeerSpeakingChange: (userId, isSpeaking) => {
        setSpeakingUserId(isSpeaking ? userId : null);
      },
      onLocalSpeakingChange: (isSpeaking) => {
        setSpeakingUserId(isSpeaking ? currentUser.id : null);
      },
      onPeerMediaSync: (payload) => {
        // Direct WebRTC DataChannel P2P synchronization handler (no database dependency)
        if (payload.controllerId === currentUser.id) return;
        setMediaSync({
          isPlaying: payload.action === 'play',
          position: payload.position,
          duration: payload.duration,
          updatedAt: payload.timestamp || Date.now(),
          controllerId: payload.controllerId,
          revision: payload.revision || Date.now(),
        });
        setServerTime(Date.now());
      },
      onError: (err) => {
        console.warn('Room voice mesh error:', err);
      },
    });

    voiceMeshManagerRef.current = voiceMesh;

    return () => {
      voiceMesh.destroy();
      voiceMeshManagerRef.current = null;
    };
  }, [selectedRoomId, currentUser]);

  // Synchronize room members with voice mesh
  useEffect(() => {
    if (voiceMeshManagerRef.current && members.length > 0) {
      voiceMeshManagerRef.current.syncMembers(members.map((m) => m.id));
    }
  }, [members]);

  // Cleanup media devices on unmount
  useEffect(() => {
    return () => {
      stopMediaStream(localAudioStreamRef.current);
      localAudioStreamRef.current = null;
      stopMediaStream(localVideoStreamRef.current);
      localVideoStreamRef.current = null;
      stopMediaStream(localScreenStreamRef.current);
      localScreenStreamRef.current = null;
      if (audioDetectorRef.current) {
        audioDetectorRef.current.destroy();
        audioDetectorRef.current = null;
      }
      if (voiceMeshManagerRef.current) {
        voiceMeshManagerRef.current.destroy();
        voiceMeshManagerRef.current = null;
      }
    };
  }, []);

  const handleToggleMic = async () => {
    if (isCurrentUserMuted) {
      showToast('You cannot unmute: You were muted by the room host.');
      return;
    }
    if (isMicOn) {
      if (voiceMeshManagerRef.current) {
        voiceMeshManagerRef.current.setMuted(true);
        voiceMeshManagerRef.current.setLocalStream(null);
      }
      stopMediaStream(localAudioStreamRef.current);
      localAudioStreamRef.current = null;
      if (audioDetectorRef.current) {
        audioDetectorRef.current.destroy();
        audioDetectorRef.current = null;
      }
      setSpeakingUserId((prev) => (prev === currentUser?.id ? null : prev));
      setIsMicOn(false);
      showToast('Live chat mic turned OFF');
    } else {
      const { stream, error } = await requestMediaStream({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (error || !stream) {
        showToast(error || 'Microphone access denied or unavailable.');
        return;
      }
      localAudioStreamRef.current = stream;
      if (voiceMeshManagerRef.current) {
        voiceMeshManagerRef.current.setLocalStream(stream);
        voiceMeshManagerRef.current.setMuted(false);
        voiceMeshManagerRef.current.syncMembers(members.map((m) => m.id));
      }
      if (audioDetectorRef.current) {
        audioDetectorRef.current.destroy();
      }
      audioDetectorRef.current = new AudioActivityDetector(stream, (speaking) => {
        setSpeakingUserId(speaking ? (currentUser?.id || null) : null);
      });
      setIsMicOn(true);
      showToast('Live chat mic ON — your voice is live in the room');
    }
  };

  const handleToggleVideo = async () => {
    if (isVideoOn) {
      stopMediaStream(localVideoStreamRef.current);
      localVideoStreamRef.current = null;
      setIsVideoOn(false);
      showToast('Camera turned off');
    } else {
      const { stream, error } = await requestMediaStream({ audio: false, video: true });
      if (error || !stream) {
        showToast(error || 'Camera access denied or unavailable.');
        return;
      }
      localVideoStreamRef.current = stream;
      setIsVideoOn(true);
      showToast('Camera turned on');
    }
  };

  const handleStopScreenShare = useCallback(() => {
    if (localScreenStreamRef.current) {
      stopMediaStream(localScreenStreamRef.current);
      localScreenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    showToast('Screen sharing stopped.');
  }, [showToast]);

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      handleStopScreenShare();
      return;
    }

    if (!currentUser) {
      showToast('You must be logged in to share screen.');
      return;
    }

    if (isCurrentUserMuted) {
      showToast('You are muted by the host and cannot share screen.');
      return;
    }

    if (!hasMediaPermission) {
      showToast('Screen sharing is restricted to room hosts and co-hosts.');
      return;
    }

    const { stream, error } = await requestScreenStream();
    if (error || !stream) {
      showToast(error || 'Screen capture could not be initialized.');
      return;
    }

    const screenTrack = stream.getVideoTracks()[0];
    if (!screenTrack) {
      stopMediaStream(stream);
      showToast('No video track available in captured screen.');
      return;
    }

    // Handle OS or browser native "Stop sharing" button
    screenTrack.onended = () => {
      handleStopScreenShare();
    };

    localScreenStreamRef.current = stream;
    setIsScreenSharing(true);
    showToast('Screen sharing live on stage!');
  };

  useEffect(() => {
    if (stageScreenVideoRef.current && localScreenStreamRef.current) {
      stageScreenVideoRef.current.srcObject = localScreenStreamRef.current;
    }
  }, [isScreenSharing]);

  const handleOpenAddMedia = () => {
    if (!hasMediaPermission) {
      showToast('Action not allowed to users');
      return;
    }
    setIsMediaModalOpen(true);
  };

  const handleOpenDisband = () => {
    if (!isHost) {
      showToast('Action not allowed to users');
      return;
    }
    setShowDisbandConfirmation(true);
  };

  const handleConfirmDisband = async () => {
    if (!selectedRoomId || !currentUser) return;
    if (!isHost) {
      showToast('Action not allowed to users');
      return;
    }
    setIsDisbanding(true);
    try {
      await api.disbandRoom(selectedRoomId, currentUser.id);
      showToast('Room has been disbanded.');
      setShowDisbandConfirmation(false);
      navigate('rooms');
    } catch (err: any) {
      showToast(err?.message || 'Action not allowed to users');
    } finally {
      setIsDisbanding(false);
    }
  };

  // Intercept back button and hardware back to prevent accidental exit
  useEffect(() => {
    window.history.pushState({ inRoomView: true }, '');

    const handlePopState = () => {
      window.history.pushState({ inRoomView: true }, '');
      setShowLeaveConfirmation(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Dismiss confirmation or menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isMenuOpen) {
          setIsMenuOpen(false);
        } else if (showLeaveConfirmation) {
          setShowLeaveConfirmation(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLeaveConfirmation, isMenuOpen]);

  // Click outside to close three-dots dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef<boolean>(true);
  const prevMessagesLengthRef = useRef<number>(0);
  const prevTypingCountRef = useRef<number>(0);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  const scrollToBottom = useCallback((smooth = true) => {
    if (!chatContainerRef.current) return;
    chatContainerRef.current.scrollTo({
      top: chatContainerRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  const handleChatScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    // Considered at bottom if within 80px
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 80;
    isUserAtBottomRef.current = isAtBottom;
    if (isAtBottom) {
      setUnseenNewMessagesCount(0);
    }
  };

  // Connect to genuine SSE Realtime Stream for room messages and typing
  const connectRealtimeStream = useCallback(() => {
    if (!selectedRoomId) return;

    if (streamCleanupRef.current) {
      streamCleanupRef.current();
      streamCleanupRef.current = null;
    }

    const cleanup = api.createRoomMessageStream(selectedRoomId, {
      onMessage: (newMsg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (isUserAtBottomRef.current) {
          scrollToBottom(true);
        } else {
          setUnseenNewMessagesCount((prev) => prev + 1);
        }
      },
      onTyping: (allTypingUsers) => {
        const othersTyping = allTypingUsers.filter((u) => u.userId !== currentUser?.id);
        setTypingUsers(othersTyping);
      },
      onMediaSync: (data) => {
        setMediaSync(data.mediaSync);
        if (data.serverTime) {
          setServerTime(data.serverTime);
        }
      },
      onRoomUpdate: (updatedRoom) => {
        setRoom(updatedRoom);
        if (updatedRoom.mediaSync !== undefined) {
          setMediaSync(updatedRoom.mediaSync);
        }
        if (currentUser) {
          if ((updatedRoom.bannedUserIds || []).includes(currentUser.id)) {
            showToast('You have been banned from this room by the host.');
            navigate('rooms');
            return;
          }
          if (!updatedRoom.memberIds.includes(currentUser.id)) {
            showToast('You were removed from this room by the host.');
            navigate('rooms');
            return;
          }
          if ((updatedRoom.mutedUserIds || []).includes(currentUser.id)) {
            setIsMicOn((prev) => {
              if (prev) showToast('Your microphone was muted by the host.');
              return false;
            });
          }
        }
        api.getRoomMembers(selectedRoomId).then((res) => {
          setMembers(res.members);
        }).catch(() => {});
      },
      onDisband: () => {
        showToast('This room was disbanded by the host.');
        navigate('rooms');
      },
      onUserSpeaking: (data) => {
        if (data.userId !== currentUser?.id) {
          setSpeakingUserId(data.isSpeaking ? data.userId : null);
        }
      },
      onRoomVoiceSignal: (data) => {
        if (voiceMeshManagerRef.current) {
          voiceMeshManagerRef.current.handleVoiceSignal(
            data.fromUserId,
            data.targetUserId,
            data.type,
            data.data
          );
        }
      },
      onReaction: (reaction) => {
        // Show reaction bubble for reaction sent by another user (or broadcast)
        const newReaction: ReactionBubble = {
          id: reaction.id || Math.random().toString(),
          emoji: reaction.emoji,
          x: Math.random() * 80 + 10,
        };
        setActiveReactions((prev) => [...prev, newReaction]);
        setTimeout(() => {
          setActiveReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
        }, 2000);
      },
      onStatusChange: (status) => {
        setStreamStatus(status);
      },
    });

    streamCleanupRef.current = cleanup;
  }, [selectedRoomId, currentUser, navigate, showToast, scrollToBottom]);

  // Initial Data Fetch and Realtime Stream Subscription
  useEffect(() => {
    if (!selectedRoomId) return;

    let isMounted = true;

    const init = async () => {
      try {
        const [roomRes, membersRes, messagesRes] = await Promise.all([
          api.getRoom(selectedRoomId),
          api.getRoomMembers(selectedRoomId),
          api.getRoomMessages(selectedRoomId),
        ]);

        if (!isMounted) return;

        setRoom(roomRes.room);
        setMembers(membersRes.members);
        const rawMsgs = messagesRes.messages || [];
        const uniqueMessages: RoomMessage[] = [];
        const seenIds = new Set<string>();
        for (const m of rawMsgs) {
          if (m?.id && !seenIds.has(m.id)) {
            seenIds.add(m.id);
            uniqueMessages.push(m);
          }
        }
        setMessages(uniqueMessages);
        if (roomRes.room.mediaSync) {
          setMediaSync(roomRes.room.mediaSync);
        }

        // Fetch authoritative initial media sync state
        api.getRoomMediaSync(selectedRoomId).then((syncRes) => {
          if (isMounted) {
            setMediaSync(syncRes.mediaSync);
            if (syncRes.serverTime) {
              setServerTime(syncRes.serverTime);
            }
          }
        }).catch(() => {});

        if (currentUser && roomRes.room) {
          if ((roomRes.room.bannedUserIds || []).includes(currentUser.id)) {
            showToast('You have been banned from this room by the host.');
            navigate('rooms');
            return;
          }
          if (!roomRes.room.memberIds.includes(currentUser.id)) {
            showToast('You were removed from this room by the host.');
            navigate('rooms');
            return;
          }
          if ((roomRes.room.mutedUserIds || []).includes(currentUser.id)) {
            setIsMicOn((prev) => {
              if (prev) showToast('Your microphone was muted by the host.');
              return false;
            });
          }
        }

        // Connect authoritative SSE Stream
        connectRealtimeStream();
      } catch (err: any) {
        console.error('Failed to initialize room data:', err);
        const errMsg = err?.message?.toLowerCase() || '';
        if (errMsg.includes('not found') || errMsg.includes('no longer active')) {
          showToast('This room was disbanded or is no longer available.');
          navigate('rooms');
        } else if (errMsg.includes('banned')) {
          showToast('You have been banned from this room by the host.');
          navigate('rooms');
        } else if (errMsg.includes('private')) {
          showToast('You must join this private room with a valid room code.');
          navigate('rooms');
        }
      }
    };

    init();

    return () => {
      isMounted = false;
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
        streamCleanupRef.current = null;
      }
    };
  }, [selectedRoomId, currentUser?.id, connectRealtimeStream, navigate, showToast]);

  // Clean up typing status on unmount or room leave
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (selectedRoomId && currentUser) {
        api.sendRoomTyping(selectedRoomId, currentUser.id, false).catch(() => {});
      }
    };
  }, [selectedRoomId, currentUser]);

  // Only auto-scroll on initial load or if user is already at the bottom when a new message arrives or typing changes
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      if (prevMessagesLengthRef.current === 0) {
        scrollToBottom(false);
      } else if (isUserAtBottomRef.current) {
        scrollToBottom(true);
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (typingUsers.length > prevTypingCountRef.current && isUserAtBottomRef.current) {
      scrollToBottom(true);
    }
    prevTypingCountRef.current = typingUsers.length;
  }, [typingUsers, scrollToBottom]);

  // Speaking indicator tracks real local mic state or authoritative peer audio stream
  useEffect(() => {
    if (isMicOn && currentUser) {
      setSpeakingUserId(currentUser.id);
    } else {
      setSpeakingUserId(null);
    }
  }, [isMicOn, currentUser]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputText(value);

    if (!selectedRoomId || !currentUser) return;

    if (value.trim().length > 0) {
      const now = Date.now();
      // Throttle typing updates to server every 1800ms
      if (now - lastTypingSentRef.current > 1800) {
        lastTypingSentRef.current = now;
        api.sendRoomTyping(selectedRoomId, currentUser.id, true).catch(() => {});
      }

      // Reset auto-expiration timer (turns typing off after 2.5s of inactivity)
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        api.sendRoomTyping(selectedRoomId, currentUser.id, false).catch(() => {});
      }, 2500);
    } else {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      lastTypingSentRef.current = 0;
      api.sendRoomTyping(selectedRoomId, currentUser.id, false).catch(() => {});
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId || !currentUser) return;
    const content = inputText.trim();
    if (!content || isSendingMessage) return;

    if (isCurrentUserMuted) {
      showToast('You are muted by the host and cannot send messages.');
      return;
    }

    // Immediately cancel typing indicator on submit
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    lastTypingSentRef.current = 0;
    api.sendRoomTyping(selectedRoomId, currentUser.id, false).catch(() => {});

    setIsSendingMessage(true);

    try {
      const res = await api.sendRoomMessage(selectedRoomId, {
        senderId: currentUser.id,
        content,
      });
      // Deduplicate append
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      // Reset input only upon real server success
      setInputText('');
      isUserAtBottomRef.current = true;
      setUnseenNewMessagesCount(0);
      scrollToBottom(true);
    } catch (err: any) {
      showToast(err?.message || 'Failed to send message.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleSelectMedia = async (payload: SelectedMediaPayload) => {
    if (!selectedRoomId || !currentUser) return;

    if (!hasMediaPermission) {
      showToast('Action not allowed to users');
      return;
    }

    // Clear typing
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    lastTypingSentRef.current = 0;
    api.sendRoomTyping(selectedRoomId, currentUser.id, false).catch(() => {});

    // Target: Chat Message attachment
    if (payload.actionTarget === 'chat_message') {
      try {
        const res = await api.sendRoomMessage(selectedRoomId, {
          senderId: currentUser.id,
          content: payload.caption || payload.title || 'Shared media attachment',
          attachmentUrl: payload.url,
          mediaType: payload.type,
          mediaTitle: payload.title,
        });
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message.id)) return prev;
          return [...prev, res.message];
        });
        scrollToBottom(true);
        showToast('Media shared to room chat!');
      } catch (err: any) {
        showToast(err?.message || 'Failed to share media.');
      }
      return;
    }

    // Target: Play on Stage / Chat Player / Watch Party (Synchronized with friend's screen)
    if (payload.type === 'youtube' || payload.type === 'video' || payload.type === 'audio' || payload.actionTarget === 'stage' || payload.actionTarget === 'chat_player') {
      const ytId = payload.type === 'youtube' ? extractYouTubeId(payload.url) : undefined;
      const mediaType = payload.type === 'link' ? 'video' : payload.type;
      const initialPlayUrl = payload.localBlobUrl || payload.url;

      const currentMedia: CurrentMedia = {
        type: mediaType,
        url: initialPlayUrl,
        title: payload.title || (payload.type === 'youtube' ? 'YouTube Video' : 'Media Player'),
        youtubeId: ytId || undefined,
        startedAt: Date.now(),
        addedBy: currentUser.id,
        addedByName: currentUser.fullName,
      };

      // 1. Instantly start playing on host's screen with zero lag
      setRoom((prev) => prev ? { ...prev, currentMedia } : null);
      showToast(`Playing on stage: ${currentMedia.title}`);

      // 2. If it's a device file with rawFile, stream chunks in background and synchronize with friends
      if (payload.rawFile) {
        showToast('Streaming media chunks in background — syncing with friends...');
        api.uploadMediaChunked(
          payload.rawFile,
          payload.rawFile.name,
          payload.rawFile.type
        ).then(async (uploaded) => {
          if (uploaded && uploaded.url) {
            const syncedMedia: CurrentMedia = {
              ...currentMedia,
              url: uploaded.url,
            };
            const res = await api.updateRoomMedia(selectedRoomId, syncedMedia, currentUser.id);
            if (res.room) {
              setRoom((prev) => {
                if (!prev) return res.room;
                return {
                  ...res.room,
                  currentMedia: {
                    ...res.room.currentMedia!,
                    // Keep host's existing active playback element smooth
                    url: prev.currentMedia?.url || res.room.currentMedia!.url,
                  },
                };
              });
            }
            if (res.mediaSync) setMediaSync(res.mediaSync);
            if (res.serverTime) setServerTime(res.serverTime);
            showToast('Media is now synchronized live with all room participants!');
          }
        }).catch((err) => {
          console.warn('Background media sync upload:', err);
        });
      } else {
        // Direct URL / YouTube
        try {
          const res = await api.updateRoomMedia(selectedRoomId, currentMedia, currentUser.id);
          setRoom(res.room);
          if (res.mediaSync) {
            setMediaSync(res.mediaSync);
          }
          if (res.serverTime) {
            setServerTime(res.serverTime);
          }
        } catch (err: any) {
          showToast(err?.message || 'Action not allowed to users');
        }
      }
      return;
    }

    // Other media fallback
    try {
      const res = await api.sendRoomMessage(selectedRoomId, {
        senderId: currentUser.id,
        content: payload.caption || payload.title || 'Shared media attachment',
        attachmentUrl: payload.url,
        mediaType: payload.type,
        mediaTitle: payload.title,
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      scrollToBottom(true);
      showToast('Media shared to room!');
    } catch (err: any) {
      showToast(err?.message || 'Failed to share media.');
    }
  };

  const handlePlayMedia = async (mediaItem: {
    type: 'youtube' | 'video' | 'audio' | 'link';
    url: string;
    title?: string;
  }) => {
    if (!selectedRoomId || !currentUser) return;
    if (!hasMediaPermission) {
      showToast('Action not allowed to users');
      return;
    }

    const ytId = mediaItem.type === 'youtube' ? extractYouTubeId(mediaItem.url) : undefined;
    const currentMedia: CurrentMedia = {
      type: mediaItem.type === 'link' ? 'video' : mediaItem.type,
      url: mediaItem.url,
      title: mediaItem.title || 'Media Player',
      startedAt: Date.now(),
      addedBy: currentUser.id,
      addedByName: currentUser.fullName,
      youtubeId: ytId,
    };

    try {
      const res = await api.updateRoomMedia(selectedRoomId, currentMedia, currentUser.id);
      setRoom(res.room);
      if (res.mediaSync) {
        setMediaSync(res.mediaSync);
      }
      if (res.serverTime) {
        setServerTime(res.serverTime);
      }
      showToast(`Playing on stage player: ${currentMedia.title}`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to play media on stage.');
    }
  };

  // Phase 13 Watch Party Synchronized Control Action Handler (WebRTC DataChannel + Server Fallback)
  const handleMediaSyncAction = useCallback(async (
    action: 'play' | 'pause' | 'seek' | 'sync',
    position: number,
    duration?: number
  ) => {
    if (!selectedRoomId || !currentUser) return;
    if (!hasMediaPermission) {
      showToast('Action not allowed to users');
      return;
    }

    // 1. WebRTC DataChannel P2P broadcast (Immediate direct peer sync without database delay)
    if (voiceMeshManagerRef.current) {
      const payload = voiceMeshManagerRef.current.broadcastMediaAction(action, position, duration);
      setMediaSync({
        isPlaying: action === 'play',
        position,
        duration,
        updatedAt: payload.timestamp,
        controllerId: currentUser.id,
        revision: payload.revision,
      });
      setServerTime(Date.now());
    }

    // 2. Asynchronous backend persistence (ensures late joiners get latest state)
    api.sendMediaSyncAction(selectedRoomId, {
      action,
      position,
      duration,
    }).catch((err: any) => {
      console.warn('Background server sync notification:', err);
    });
  }, [selectedRoomId, currentUser, hasMediaPermission, showToast]);

  const handleStopMedia = async () => {
    if (!selectedRoomId || !currentUser) return;
    if (!hasMediaPermission) {
      showToast('Action not allowed to users');
      return;
    }

    // Broadcast pause/stop to all peers via WebRTC DataChannel
    if (voiceMeshManagerRef.current) {
      voiceMeshManagerRef.current.broadcastMediaAction('pause', 0, 0);
    }

    try {
      const res = await api.updateRoomMedia(selectedRoomId, null, currentUser.id);
      setRoom(res.room);
      setMediaSync(null);
      showToast('Video playback stopped.');
    } catch (err: any) {
      showToast(err?.message || 'Action not allowed to users');
    }
  };

  const handleSendDeviceMedia = async ({
    dataUrl,
    mediaType,
    mediaTitle,
    caption,
  }: {
    dataUrl: string;
    mediaType: 'image' | 'video' | 'audio';
    mediaTitle: string;
    caption: string;
  }) => {
    if (!selectedRoomId || !currentUser) return;
    setIsSendingDeviceMedia(true);
    try {
      const res = await api.sendRoomMessage(selectedRoomId, {
        senderId: currentUser.id,
        content: caption || (mediaType === 'video' ? 'Shared a video' : mediaType === 'audio' ? 'Shared audio' : 'Shared a photo'),
        attachmentUrl: dataUrl,
        mediaType,
        mediaTitle,
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      scrollToBottom(true);
      showToast(mediaType === 'video' ? 'Video sent to chat!' : mediaType === 'audio' ? 'Audio sent to chat!' : 'Photo sent to chat!');
    } catch (err: any) {
      showToast(err?.message || 'Failed to send media in chat.');
      throw err;
    } finally {
      setIsSendingDeviceMedia(false);
    }
  };

  const handleSendReaction = async (emoji: string) => {
    // Send to backend so all room members receive it via SSE
    if (selectedRoomId) {
      api.sendRoomReaction(selectedRoomId, emoji).catch((err) => {
        console.warn('Failed to broadcast reaction:', err);
      });
    }

    // Also display immediately for instantaneous local responsiveness
    const newReaction: ReactionBubble = {
      id: Math.random().toString(),
      emoji,
      x: Math.random() * 80 + 10, // random percentage across width
    };
    setActiveReactions((prev) => [...prev, newReaction]);

    // Cleanup reaction after animation
    setTimeout(() => {
      setActiveReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
    }, 2000);
  };

  const handleConfirmLeave = async () => {
    setIsLeaving(true);
    if (selectedRoomId && currentUser) {
      try {
        await api.leaveRoom(selectedRoomId, currentUser.id);
      } catch (err) {
        console.error('Error leaving room:', err);
      }
    }
    setShowLeaveConfirmation(false);
    setIsLeaving(false);
    showToast('You left the room.');
    navigate('rooms');
  };

  if (!room) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm">Connecting to hangout stage...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-[#080911] text-white relative overflow-hidden">
      {/* Floating Reactions Overlay */}
      <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
        {activeReactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-24 text-3xl animate-bounce"
            style={{ left: `${r.x}%`, animationDuration: '1.5s' }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* Top Bar */}
      <header className="px-3 sm:px-4 py-2.5 bg-[#0d0f1c] border-b border-white/5 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            onClick={() => setShowLeaveConfirmation(true)}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-colors shrink-0"
            title="Leave room"
            aria-label="Leave room"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Room Identity Clickable to Open Room Info */}
          <button
            type="button"
            id="room-header-identity-btn"
            onClick={() => setIsRoomInfoModalOpen(true)}
            className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-90 active:scale-[0.99] transition-all p-1 rounded-xl hover:bg-white/5"
            title="View Room Info & Settings"
          >
            <div className="w-8 h-8 rounded-xl bg-[#14172b] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
              <img
                src={room.bannerUrl || room.hostAvatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${room.id}`}
                alt={room.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white truncate max-w-[130px] xs:max-w-[190px] sm:max-w-xs md:max-w-md leading-tight">
                {room.name}
              </h1>
              <div className="text-[11px] text-purple-300 flex items-center gap-1.5 leading-none mt-0.5">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-purple-400" />
                  <span>{members.length}</span>
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 truncate">
                  {isHost ? 'Host (You)' : room.hostName}
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      streamStatus === 'connected'
                        ? 'bg-emerald-400 animate-pulse'
                        : streamStatus === 'reconnecting'
                        ? 'bg-amber-400 animate-ping'
                        : 'bg-rose-400'
                    }`}
                  />
                  <span className="text-[10px] text-slate-400 capitalize">
                    {streamStatus === 'connected' ? 'Live' : streamStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}
                  </span>
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Add Media Button - Kept prominently in top navigation bar */}
          <button
            type="button"
            id="room-header-add-media-btn"
            onClick={handleOpenAddMedia}
            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-900/30 flex items-center gap-1.5 transition-all active:scale-95"
            title="Add Media to Stage Player"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Add Media</span>
          </button>

          {/* Three Line More Options Menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              id="room-header-more-btn"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all active:scale-95 ${
                isMenuOpen
                  ? 'bg-white/15 border-white/30 text-white'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
              }`}
              title="More options"
              aria-label="More options"
              aria-expanded={isMenuOpen}
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-[#121424] border border-white/10 shadow-2xl shadow-black/80 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl">
                {/* 1. Add Friend */}
                <button
                  type="button"
                  id="menu-add-friend-btn"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsAddFriendModalOpen(true);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors"
                >
                  <UserPlus className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div>Add Friend</div>
                    <div className="text-[10px] text-slate-400 font-normal">Add members & search users</div>
                  </div>
                </button>

                {/* 2. Room Info */}
                <button
                  type="button"
                  id="menu-room-info-btn"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsRoomInfoModalOpen(true);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors"
                >
                  <Info className="w-4 h-4 text-purple-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div>Room Info</div>
                    <div className="text-[10px] text-slate-400 font-normal">Permissions, members & code</div>
                  </div>
                </button>

                {/* 3. Share */}
                <button
                  type="button"
                  id="menu-share-btn"
                  onClick={() => {
                    setIsMenuOpen(false);
                    navigator.clipboard?.writeText(room.code);
                    showToast(`Room code copied: ${room.code}`);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors"
                >
                  <Share2 className="w-4 h-4 text-sky-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div>Share Room</div>
                    <div className="text-[10px] text-slate-400 font-normal">Copy code {room.code}</div>
                  </div>
                </button>

                {/* 4. Leave Room */}
                <button
                  type="button"
                  id="menu-leave-btn"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setShowLeaveConfirmation(true);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors"
                >
                  <LogOut className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div>Leave Room</div>
                    <div className="text-[10px] text-slate-400 font-normal">Exit back to room list</div>
                  </div>
                </button>

                {/* 5. Host Disband */}
                {isHost && (
                  <>
                    <div className="h-px bg-white/10 my-1 mx-2" />
                    <button
                      type="button"
                      id="menu-disband-btn"
                      onClick={() => {
                        setIsMenuOpen(false);
                        handleOpenDisband();
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div>Disband Room</div>
                        <div className="text-[10px] text-red-400/70 font-normal">Permanently close (Host)</div>
                      </div>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Stage Video / Visual Canvas */}
      <div className="relative bg-[#0d1021] border-b border-white/5 shrink-0 overflow-hidden">
        {isScreenSharing ? (
          /* Real Screen Share Stage Canvas */
          <div className="h-64 sm:h-80 w-full relative bg-black flex items-center justify-center overflow-hidden">
            <video
              ref={stageScreenVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
            {/* Status overlay */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-neutral-900/90 border border-emerald-500/50 rounded-full px-3 py-1 text-xs text-emerald-200 backdrop-blur-md shadow-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <Monitor className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-medium">Screen Share Live on Stage</span>
            </div>
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              <button
                type="button"
                id="stop-stage-screenshare-btn"
                onClick={handleStopScreenShare}
                className="bg-red-600/90 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-xl font-semibold shadow-md transition-all flex items-center gap-1.5 active:scale-95"
              >
                <MonitorOff className="w-3.5 h-3.5" />
                <span>Stop Sharing</span>
              </button>
            </div>
          </div>
        ) : room.currentMedia ? (
          /* Real Interactive Media Stage Player with Phase 13 Watch Party Synchronized Playback */
          <ChatMediaPlayer
            media={room.currentMedia}
            onClose={handleStopMedia}
            isStage={true}
            canControl={hasMediaPermission}
            roomId={selectedRoomId}
            mediaSync={mediaSync}
            serverTime={serverTime}
            onSyncAction={handleMediaSyncAction}
            currentUser={currentUser}
            streamStatus={streamStatus}
          />
        ) : (
          /* Main Cinema/Stream Stage Banner */
          <div className="h-44 sm:h-52 w-full relative overflow-hidden flex items-center justify-center">
            <img
              src={room.bannerUrl}
              alt={room.name}
              className="w-full h-full object-cover filter brightness-[0.4] blur-xs"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d1021] via-[#0d1021]/60 to-black/50" />

            {/* Center Stage Presentation Badge */}
            <div className="absolute flex flex-col items-center text-center p-4 z-20 pointer-events-none">
              <div className="p-2.5 rounded-full bg-purple-600/40 border border-purple-400/50 text-purple-200 mb-1.5 backdrop-blur-md shadow-lg shadow-purple-500/20">
                <Volume2 className="w-5 h-5 animate-pulse" />
              </div>
              <h2 className="text-sm font-bold text-white drop-shadow-md">{room.name} Live Session</h2>
              <p className="text-[11px] text-slate-300 drop-shadow-sm">Host: {room.hostName}</p>
            </div>
          </div>
        )}

        {/* Participants Mini Stage Tiles */}
        <div className="p-3 bg-[#0d0f1e]/90 flex items-center gap-3 overflow-x-auto scrollbar-none border-t border-white/5">
          {members.slice(0, 10).map((member) => {
            const isSpeaking = member.id === speakingUserId || (member.id === currentUser?.id && isMicOn);
            const isMe = member.id === currentUser?.id;
            const isMemberHost = member.id === room.hostId;
            const isMemberAdmin = (room.adminIds || []).includes(member.id);
            const isMemberMuted = (room.mutedUserIds || []).includes(member.id);
            const isModerator = room.hostId === currentUser?.id || (room.adminIds || []).includes(currentUser?.id || '');

            return (
              <div
                key={member.id}
                onClick={() => {
                  if (isModerator && room) {
                    openMembersModal(room);
                  } else {
                    navigate('other-profile', { userId: member.id });
                  }
                }}
                className={`flex flex-col items-center gap-1 shrink-0 p-1.5 rounded-xl bg-[#14172a] border transition-all cursor-pointer hover:bg-[#1a1d35] ${
                  isSpeaking && !isMemberMuted
                    ? 'border-emerald-500 shadow-md shadow-emerald-500/20 ring-2 ring-emerald-500/30'
                    : 'border-white/5'
                }`}
                title={`${member.fullName}${isMemberHost ? ' (Host)' : isMemberAdmin ? ' (Co-Host)' : ''}${isMemberMuted ? ' (Muted)' : ''}${isModerator ? ' - Click to manage' : ''}`}
              >
                <div className="relative">
                  <Avatar
                    src={member.avatarUrl}
                    alt={member.fullName}
                    size="sm"
                    isOnline={isUserOnline(member.id)}
                  />
                  {isMemberHost && (
                    <span className="absolute -top-1 -left-1 w-4 h-4 bg-amber-500 text-black rounded-full flex items-center justify-center text-[9px] shadow font-bold" title="Host">
                      <Crown className="w-2.5 h-2.5" />
                    </span>
                  )}
                  {!isMemberHost && isMemberAdmin && (
                    <span className="absolute -top-1 -left-1 w-4 h-4 bg-purple-500 text-white rounded-full flex items-center justify-center text-[9px] shadow" title="Co-Host">
                      <Shield className="w-2.5 h-2.5" />
                    </span>
                  )}
                  {isMemberMuted && (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[9px] shadow" title="Muted by host">
                      <MicOff className="w-2.5 h-2.5" />
                    </span>
                  )}
                  {isSpeaking && !isMemberMuted && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#14172a] flex items-center justify-center">
                      <span className="w-1 h-1 bg-white rounded-full animate-ping" />
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium text-slate-300 max-w-[56px] truncate text-center">
                  {isMe ? 'You' : member.fullName.split(' ')[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat Stream Connection Notice */}
      {streamStatus !== 'connected' && (
        <div
          className={`px-3 py-1.5 text-[11px] flex items-center justify-between border-b shrink-0 ${
            streamStatus === 'reconnecting'
              ? 'bg-amber-950/40 border-amber-500/20 text-amber-300'
              : 'bg-rose-950/40 border-rose-500/20 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {streamStatus === 'reconnecting' ? (
              <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-rose-400" />
            )}
            <span>
              {streamStatus === 'reconnecting'
                ? 'Reconnecting live chat stream...'
                : 'Chat connection lost.'}
            </span>
          </div>
          {streamStatus === 'error' && (
            <button
              type="button"
              onClick={connectRealtimeStream}
              className="underline hover:text-white font-medium ml-2 text-xs"
            >
              Reconnect
            </button>
          )}
        </div>
      )}

      {/* Live Room Chat Stream */}
      <div
        ref={chatContainerRef}
        onScroll={handleChatScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2.5 relative"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
            <p>Welcome to the room chat!</p>
            <p className="text-slate-400 mt-1">Send a message to say hello to everyone.</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderId === currentUser?.id || (msg as any).authorId === currentUser?.id;
            const authorName = msg.senderName || (msg as any).authorName || 'Member';
            const authorAvatar = msg.senderAvatar || (msg as any).authorAvatar || '';

            return (
              <div key={`${msg.id}_${index}`} className="flex items-start gap-2.5">
                <Avatar
                  src={authorAvatar}
                  alt={authorName}
                  size="xs"
                />
                <div className="bg-[#141628]/80 border border-white/5 rounded-2xl px-3 py-1.5 max-w-[85%]">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold ${isMe ? 'text-purple-400' : 'text-slate-300'}`}>
                      {authorName} {isMe && '(You)'}
                    </span>
                    <span className="text-[9px] text-slate-400">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {msg.content && (
                    <TranslatableMessageContent
                      text={msg.content}
                      targetLanguage={targetLanguage}
                      isMe={isMe}
                      className="text-xs text-slate-200 mt-0.5 leading-relaxed"
                    />
                  )}
                  {msg.attachmentUrl && (
                    <ChatMediaAttachment
                      url={msg.attachmentUrl}
                      mediaType={msg.mediaType}
                      mediaTitle={msg.mediaTitle}
                      isMe={isMe}
                      onPlayInPlayer={(mediaItem) => {
                        handlePlayMedia(mediaItem);
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator bubble */}
        {typingUsers.length > 0 && (
          <div className="py-1">
            <TypingIndicator users={typingUsers} variant="bubble" />
          </div>
        )}
      </div>

      {/* Floating Unread Messages Button */}
      {unseenNewMessagesCount > 0 && !isUserAtBottomRef.current && (
        <div className="relative w-full flex justify-center pointer-events-none z-30">
          <button
            type="button"
            onClick={() => {
              scrollToBottom(true);
              setUnseenNewMessagesCount(0);
            }}
            className="pointer-events-auto absolute -top-10 px-3.5 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-black/60 flex items-center gap-1.5 transition-all active:scale-95 animate-in fade-in slide-in-from-bottom-2"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>{unseenNewMessagesCount} new message{unseenNewMessagesCount > 1 ? 's' : ''}</span>
          </button>
        </div>
      )}

      {/* Floating Emoji Reactions Bar */}
      <div className="px-4 py-1.5 flex items-center justify-center gap-4 bg-black/40 backdrop-blur-xs border-t border-white/5">
        {['❤️', '🔥', '👏', '😂', '🎉', '🍿'].map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleSendReaction(emoji)}
            className="text-xl hover:scale-125 active:scale-95 transition-transform"
            aria-label={`Send reaction ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Bottom Stage Control Bar */}
      <div className="w-full px-3 py-2.5 bg-[#0d0f1c] border-t border-white/5 flex items-center gap-1.5 sm:gap-2 shrink-0">
        {(() => {
          const isCurrentUserMuted = !!(room && currentUser && (room.mutedUserIds || []).includes(currentUser.id));
          return (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                id="room-toggle-live-mic-btn"
                onClick={handleToggleMic}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-semibold transition-all active:scale-95 ${
                  isCurrentUserMuted
                    ? 'bg-red-950/60 border-red-500/50 text-red-400 opacity-60 cursor-not-allowed'
                    : isMicOn
                    ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/40'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
                }`}
                aria-label={isMicOn ? 'Turn Live Chat Mic OFF' : 'Turn Live Chat Mic ON'}
                title={
                  isCurrentUserMuted
                    ? 'Muted by room host'
                    : isMicOn
                    ? 'Live Chat Mic is ON (Transmitting voice to room - click to mute)'
                    : 'Turn on Live Chat Mic (Chat with your friends while watching)'
                }
              >
                {isCurrentUserMuted ? (
                  <>
                    <MicOff className="w-4 h-4 text-red-400" />
                    <span className="hidden sm:inline text-[11px] font-medium text-red-400">Muted</span>
                  </>
                ) : isMicOn ? (
                  <>
                    <Mic className="w-4 h-4 text-white animate-pulse" />
                    <span className="hidden xs:inline text-[11px] font-bold text-white tracking-wide">LIVE MIC ON</span>
                    {speakingUserId === currentUser?.id && (
                      <span className="w-2 h-2 rounded-full bg-white animate-ping ml-0.5" />
                    )}
                  </>
                ) : (
                  <>
                    <MicOff className="w-4 h-4 text-slate-400" />
                    <span className="hidden xs:inline text-[11px] font-medium text-slate-300">Live Mic OFF</span>
                  </>
                )}
              </button>

              {isCurrentUserMuted && (
                <span className="hidden sm:inline-flex shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30 items-center gap-1">
                  <MicOff className="w-2.5 h-2.5" />
                  Muted by Host
                </span>
              )}
            </div>
          );
        })()}

        <button
          onClick={handleToggleVideo}
          className={`shrink-0 p-2 sm:p-2.5 rounded-full border transition-all active:scale-95 ${
            isVideoOn
              ? 'bg-purple-600 border-purple-500 text-white'
              : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
          }`}
          aria-label={isVideoOn ? 'Turn off video' : 'Turn on video'}
        >
          {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </button>

        <button
          type="button"
          id="room-toggle-screenshare-btn"
          onClick={handleToggleScreenShare}
          className={`shrink-0 p-2 sm:p-2.5 rounded-full border transition-all active:scale-95 ${
            isScreenSharing
              ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
              : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
          }`}
          aria-label={isScreenSharing ? 'Stop sharing screen' : 'Share screen to stage'}
          title={isScreenSharing ? 'Stop sharing screen' : 'Share screen to stage'}
        >
          {isScreenSharing ? <MonitorOff className="w-4 h-4 text-amber-400" /> : <Monitor className="w-4 h-4" />}
        </button>

        <button
          type="button"
          id="room-select-media-btn"
          onClick={() => {
            const isCurrentUserMuted = !!(room && currentUser && (room.mutedUserIds || []).includes(currentUser.id));
            if (isCurrentUserMuted) {
              showToast('You are muted by the host and cannot send media.');
              return;
            }
            setIsDeviceMediaModalOpen(true);
          }}
          className="shrink-0 p-2 sm:p-2.5 rounded-full bg-white/5 border border-white/10 text-purple-400 hover:text-white hover:bg-purple-600/20 active:scale-95 transition-all"
          aria-label="Send photo or video from device in chat"
          title="Send photo or video from device in chat"
        >
          <ImageIcon className="w-4 h-4" />
        </button>

        <form onSubmit={handleSendMessage} className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            disabled={isCurrentUserMuted || isSendingMessage}
            placeholder={isCurrentUserMuted ? 'You are muted by the host...' : isSendingMessage ? 'Sending message...' : 'Say something...'}
            className="flex-1 min-w-0 px-3.5 sm:px-4 py-2 rounded-full bg-[#17192c] border border-white/10 text-white placeholder-slate-400 text-xs focus:outline-none focus:border-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isCurrentUserMuted || isSendingMessage}
            className="shrink-0 w-8 h-8 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center disabled:opacity-40 transition-all active:scale-95"
            aria-label="Send message to room"
          >
            {isSendingMessage ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 ml-0.5" />
            )}
          </button>
        </form>
      </div>

      {/* Leave Room Confirmation Modal */}
      {showLeaveConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowLeaveConfirmation(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#0f1122] border border-white/10 p-5 sm:p-6 shadow-2xl shadow-black/90 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-modal-title"
          >
            {/* Header / Icon */}
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shadow-inner">
                <LogOut className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => setShowLeaveConfirmation(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <h3 id="leave-modal-title" className="text-base font-bold text-white tracking-wide">
                Leave Room?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isHost ? (
                  <>
                    Are you sure you want to leave <span className="font-semibold text-white">"{room.name}"</span>? As the room host, leaving will transfer host ownership to another active member (or close the room if no members remain).
                  </>
                ) : (
                  <>
                    Are you sure you want to leave <span className="font-semibold text-white">"{room.name}"</span>? Your audio connection will be disconnected and you'll return to the rooms list.
                  </>
                )}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowLeaveConfirmation(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-semibold text-white transition-all border border-white/5"
              >
                Stay in Room
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                disabled={isLeaving}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 text-xs font-semibold text-white shadow-md shadow-red-900/40 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isLeaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Leaving...</span>
                  </>
                ) : (
                  <>
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>Leave Room</span>
                  </>
                )}
              </button>
            </div>

            {/* Host Disband Option */}
            {isHost && (
              <div className="pt-2 border-t border-white/5 text-center">
                <button
                  type="button"
                  id="host-disband-shortcut-btn"
                  onClick={() => {
                    setShowLeaveConfirmation(false);
                    setShowDisbandConfirmation(true);
                  }}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center justify-center gap-1.5 mx-auto transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Disband room for all participants instead</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disband Room Confirmation Modal (Host Only) */}
      {showDisbandConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowDisbandConfirmation(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#0f1122] border border-red-500/30 p-5 sm:p-6 shadow-2xl shadow-black/90 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="disband-modal-title"
          >
            {/* Header / Icon */}
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shadow-inner">
                <Trash2 className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => setShowDisbandConfirmation(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <h3 id="disband-modal-title" className="text-base font-bold text-white tracking-wide">
                Disband Room?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                As the room host, disbanding <span className="font-semibold text-white">"{room.name}"</span> will immediately end the hangout session and close the room for everyone.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowDisbandConfirmation(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-semibold text-white transition-all border border-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-disband-room-btn"
                onClick={handleConfirmDisband}
                disabled={isDisbanding}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 text-xs font-semibold text-white shadow-md shadow-red-900/40 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDisbanding ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Disbanding...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Disband Room</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Select Media Modal (Stage Player) */}
      <SelectMediaModal
        isOpen={isMediaModalOpen}
        onClose={() => setIsMediaModalOpen(false)}
        onSelectMedia={handleSelectMedia}
      />

      {/* Send Device Media Modal (Photo & Video for Chat) */}
      <SendDeviceMediaModal
        isOpen={isDeviceMediaModalOpen}
        onClose={() => setIsDeviceMediaModalOpen(false)}
        onSendMedia={handleSendDeviceMedia}
        isSending={isSendingDeviceMedia}
      />

      {/* Add Friend & Invite Modal */}
      {room && (
        <AddFriendModal
          isOpen={isAddFriendModalOpen}
          onClose={() => setIsAddFriendModalOpen(false)}
          roomId={selectedRoomId}
          roomCode={room.code}
          roomMembers={members}
        />
      )}

      {/* Room Info & Settings Modal */}
      <RoomInfoModal
        isOpen={isRoomInfoModalOpen}
        onClose={() => setIsRoomInfoModalOpen(false)}
        room={room}
        members={members}
        currentUser={currentUser}
        onOpenMembersModal={() => openMembersModal(room)}
        onShare={() => {
          navigator.clipboard?.writeText(room.code);
          showToast(`Room code copied: ${room.code}`);
        }}
        onLeaveRoom={() => setShowLeaveConfirmation(true)}
        onDisbandRoom={() => handleOpenDisband()}
      />
    </div>
  );
};

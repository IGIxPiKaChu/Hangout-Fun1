import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Send,
  Paperclip,
  Mic,
  Smile,
  Image,
  Check,
  CheckCheck,
  Play,
  X,
  ArrowDown,
  RefreshCw,
  WifiOff,
  ShieldAlert,
  UserPlus,
  UserCheck,
  Clock,
  Lock,
  Phone,
  Video,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { DirectMessage, TypingUser, CurrentMedia, RelationshipStatus } from '../types/index.ts';
import { Avatar } from '../components/common/Avatar.tsx';
import { SelectMediaModal, type SelectedMediaPayload } from '../components/modals/SelectMediaModal.tsx';
import { extractYouTubeId } from '../components/modals/YouTubeModal.tsx';
import { ChatMediaAttachment } from '../components/chat/ChatMediaAttachment.tsx';
import { ChatMediaPlayer } from '../components/chat/ChatMediaPlayer.tsx';
import { TypingIndicator } from '../components/chat/TypingIndicator.tsx';
import { TranslatableMessageContent } from '../components/chat/TranslatableMessageContent.tsx';

export const DirectChatScreen: React.FC = () => {
  const {
    selectedConversationId,
    selectedConversationUser,
    goBack,
    navigate,
    showToast,
    isUserOnline,
    getUserLastSeen,
    startCall,
    userSettings,
  } = useApp();
  const { currentUser } = useAuth();
  const targetLanguage = userSettings?.chatTranslationLanguage || userSettings?.language || 'en';

  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [relationship, setRelationship] = useState<RelationshipStatus>('none');
  const [requestId, setRequestId] = useState<string | undefined>();
  const [isFriendActionLoading, setIsFriendActionLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [activePlayingMedia, setActivePlayingMedia] = useState<CurrentMedia | null>(null);
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'error'>('connecting');
  const [unseenNewMessagesCount, setUnseenNewMessagesCount] = useState(0);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef<boolean>(true);
  const prevMessagesLengthRef = useRef<number>(0);
  const prevTypingCountRef = useRef<number>(0);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  const CHAT_STICKERS = ['🍿', '✨', '🔥', '🎉', '👋', '❤️', '🎬', '☕'];

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

  // Fetch relationship to enforce friend-only chatting and blocking states
  useEffect(() => {
    if (!selectedConversationUser) return;
    let isMounted = true;
    api
      .getRelationship(selectedConversationUser.id)
      .then((res) => {
        if (isMounted) {
          setRelationship(res.relationship);
          setRequestId(res.requestId);
        }
      })
      .catch((err) => {
        console.error('Failed to get relationship:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedConversationUser]);

  const handleAddFriendInChat = async () => {
    if (!selectedConversationUser) return;
    setIsFriendActionLoading(true);
    try {
      const res = await api.sendFriendRequest(selectedConversationUser.id);
      setRelationship('outgoing_request');
      setRequestId(res.request?.id);
      showToast(`Friend request sent to ${selectedConversationUser.fullName}`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to send friend request.');
    } finally {
      setIsFriendActionLoading(false);
    }
  };

  const handleAcceptFriendInChat = async () => {
    if (!selectedConversationUser) return;
    setIsFriendActionLoading(true);
    try {
      if (requestId) {
        await api.acceptFriendRequest(requestId);
      } else {
        await api.sendFriendRequest(selectedConversationUser.id);
      }
      setRelationship('friends');
      showToast(`You and ${selectedConversationUser.fullName} are now friends! You can now chat.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to accept friend request.');
    } finally {
      setIsFriendActionLoading(false);
    }
  };

  const connectRealtimeStream = useCallback(() => {
    if (!selectedConversationId) return;

    if (streamCleanupRef.current) {
      streamCleanupRef.current();
      streamCleanupRef.current = null;
    }

    setStreamStatus('connecting');

    const cleanup = api.createConversationMessageStream(selectedConversationId, {
      onMessage: (newMsg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        const isMe = newMsg.senderId === currentUser?.id;
        if (isMe || isUserAtBottomRef.current) {
          setTimeout(() => scrollToBottom(true), 50);
          setUnseenNewMessagesCount(0);
        } else {
          setUnseenNewMessagesCount((cnt) => cnt + 1);
        }

        // If an incoming message arrives while viewing conversation, mark it as read
        if (!isMe && selectedConversationId) {
          api.markConversationRead(selectedConversationId).catch(() => {});
        }
      },
      onTyping: (rawTypingUsers) => {
        const filtered = rawTypingUsers.filter((u) => u.userId !== currentUser?.id);
        setTypingUsers(filtered);
      },
      onReadReceipt: (receipt) => {
        if (receipt.readerId !== currentUser?.id) {
          // Other participant read our messages -> update checkmarks to read!
          setMessages((prev) =>
            prev.map((m) => (m.senderId === currentUser?.id ? { ...m, read: true } : m)),
          );
        }
      },
      onStatusChange: (status) => {
        setStreamStatus(status);
      },
    });

    streamCleanupRef.current = cleanup;
  }, [selectedConversationId, currentUser?.id, scrollToBottom]);

  // Initial load of direct messages + realtime stream subscription + mark read
  useEffect(() => {
    if (!selectedConversationId) return;

    let isMounted = true;

    // Initial message fetch
    api
      .getDirectMessages(selectedConversationId)
      .then((res) => {
        if (!isMounted) return;
        const raw = res.messages || [];
        const uniqueMessages: DirectMessage[] = [];
        const seenIds = new Set<string>();
        for (const m of raw) {
          if (m?.id && !seenIds.has(m.id)) {
            seenIds.add(m.id);
            uniqueMessages.push(m);
          }
        }
        setMessages(uniqueMessages);
        setTimeout(() => scrollToBottom(false), 50);
        // Mark conversation messages read on server
        api.markConversationRead(selectedConversationId).catch(() => {});
      })
      .catch((err) => {
        console.error('Failed to load initial direct messages:', err);
      });

    // Periodic sync interval to ensure read receipts and messages stay in sync even across network reconnects
    const syncInterval = setInterval(() => {
      if (!isMounted || document.visibilityState === 'hidden') return;
      api
        .getDirectMessages(selectedConversationId)
        .then((res) => {
          if (!isMounted) return;
          const raw = res.messages || [];
          setMessages((prev) => {
            // Check if any message read status or content changed
            let hasChanged = false;
            const prevMap = new Map<string, DirectMessage>(prev.map((m) => [m.id, m]));
            if (raw.length !== prev.length) {
              hasChanged = true;
            } else {
              for (const m of raw) {
                const existing = prevMap.get(m.id);
                if (!existing || existing.read !== m.read || existing.content !== m.content) {
                  hasChanged = true;
                  break;
                }
              }
            }
            return hasChanged ? raw : prev;
          });
        })
        .catch(() => {});
    }, 3000);

    // Start SSE stream
    connectRealtimeStream();

    return () => {
      isMounted = false;
      clearInterval(syncInterval);
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
        streamCleanupRef.current = null;
      }
    };
  }, [selectedConversationId, connectRealtimeStream, scrollToBottom]);

  // Clean up typing status when screen unmounts or conversation changes
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (selectedConversationId && currentUser) {
        api.sendConversationTyping(selectedConversationId, currentUser.id, false).catch(() => {});
      }
    };
  }, [selectedConversationId, currentUser]);

  // Mark conversation read on window focus / visibility change
  useEffect(() => {
    const handleFocus = () => {
      if (selectedConversationId && document.visibilityState === 'visible') {
        api.markConversationRead(selectedConversationId).catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [selectedConversationId]);

  // Auto-scroll on initial load or if user is at bottom
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputText(value);

    if (!selectedConversationId || !currentUser) return;

    if (value.trim().length > 0) {
      const now = Date.now();
      // Throttle typing updates to server every 1800ms
      if (now - lastTypingSentRef.current > 1800) {
        lastTypingSentRef.current = now;
        api.sendConversationTyping(selectedConversationId, currentUser.id, true).catch(() => {});
      }

      // Reset auto-expiration timer (turns typing off after 2.5s of inactivity)
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        api.sendConversationTyping(selectedConversationId, currentUser.id, false).catch(() => {});
      }, 2500);
    } else {
      // Empty input -> clear typing state immediately
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      lastTypingSentRef.current = 0;
      api.sendConversationTyping(selectedConversationId, currentUser.id, false).catch(() => {});
    }
  };

  const handleSendMessage = async (sticker?: string) => {
    if (!selectedConversationId || !currentUser || !selectedConversationUser) return;
    if (relationship !== 'friends') {
      showToast('This user is not in your friend list. Add them as a friend to chat.');
      return;
    }
    if (!inputText.trim() && !sticker) return;

    // Immediately cancel typing indicator on submit
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    lastTypingSentRef.current = 0;
    api.sendConversationTyping(selectedConversationId, currentUser.id, false).catch(() => {});

    setIsSending(true);
    isUserAtBottomRef.current = true;
    try {
      const res = await api.sendDirectMessage(selectedConversationId, {
        senderId: currentUser.id,
        receiverId: selectedConversationUser.id,
        content: (sticker ? '' : inputText).trim(),
        sticker,
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      setInputText('');
      setShowStickerPicker(false);
      scrollToBottom(true);
    } catch (err: any) {
      showToast(err?.message || 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectMedia = async (payload: SelectedMediaPayload) => {
    if (!currentUser || !selectedConversationId || !selectedConversationUser) return;
    if (relationship !== 'friends') {
      showToast('This user is not in your friend list. Add them as a friend to chat.');
      return;
    }
    isUserAtBottomRef.current = true;

    // Clear typing
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    lastTypingSentRef.current = 0;
    api.sendConversationTyping(selectedConversationId, currentUser.id, false).catch(() => {});

    // Immediate instant playback for video / youtube / audio
    if (payload.type === 'youtube' || payload.type === 'video' || payload.type === 'audio' || payload.actionTarget === 'stage' || payload.actionTarget === 'chat_player') {
      const ytId = payload.type === 'youtube' ? extractYouTubeId(payload.url) : undefined;
      const initialUrl = payload.localBlobUrl || payload.url;

      const mediaItem: CurrentMedia = {
        type: payload.type === 'image' || payload.type === 'link' ? 'video' : payload.type,
        url: initialUrl,
        title: payload.title || (payload.type === 'youtube' ? 'YouTube Video' : payload.type === 'audio' ? 'Audio Track' : 'Video Clip'),
        youtubeId: ytId || undefined,
        startedAt: Date.now(),
        addedBy: currentUser.id,
        addedByName: currentUser.fullName,
      };

      // 1. Instant zero-lag playback in player for current user
      setActivePlayingMedia(mediaItem);
      showToast(`Playing on Chat Player: ${mediaItem.title}`);

      // 2. If rawFile provided, stream in background chunks and send message to friend with streamable link
      if (payload.rawFile) {
        showToast('Streaming media chunks to friend in background...');
        api.uploadMediaChunked(
          payload.rawFile,
          payload.rawFile.name,
          payload.rawFile.type
        ).then(async (uploaded) => {
          if (uploaded && uploaded.url) {
            try {
              const res = await api.sendDirectMessage(selectedConversationId, {
                senderId: currentUser.id,
                receiverId: selectedConversationUser.id,
                content: payload.caption || `🎬 Watch together: ${payload.title || 'Video clip'}`,
                attachmentUrl: uploaded.url,
                mediaType: payload.type,
                mediaTitle: payload.title,
              });
              setMessages((prev) => {
                if (prev.some((m) => m.id === res.message.id)) return prev;
                return [...prev, res.message];
              });
              scrollToBottom(true);
              showToast('Media chunk stream uploaded and shared with friend!');
            } catch (err: any) {
              console.warn('Failed to send uploaded stream to friend:', err);
            }
          }
        }).catch((err) => {
          console.warn('Background chunked upload error in DM:', err);
        });
      } else if (payload.caption || payload.actionTarget === 'chat_message') {
        // Direct URL / YouTube
        try {
          setIsSending(true);
          const res = await api.sendDirectMessage(selectedConversationId, {
            senderId: currentUser.id,
            receiverId: selectedConversationUser.id,
            content: payload.caption || `Shared ${payload.title || 'media'}`,
            attachmentUrl: payload.url,
            mediaType: payload.type,
            mediaTitle: payload.title,
          });
          setMessages((prev) => {
            if (prev.some((m) => m.id === res.message.id)) return prev;
            return [...prev, res.message];
          });
          scrollToBottom(true);
        } catch {
          // Non-blocking
        } finally {
          setIsSending(false);
        }
      }
      return;
    }

    try {
      setIsSending(true);
      const res = await api.sendDirectMessage(selectedConversationId, {
        senderId: currentUser.id,
        receiverId: selectedConversationUser.id,
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
      showToast('Media shared to chat!');
    } catch (err: any) {
      showToast(err?.message || 'Failed to share media.');
    } finally {
      setIsSending(false);
    }
  };

  if (!selectedConversationUser) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p>No conversation selected.</p>
        <button onClick={goBack} className="mt-3 text-purple-400 font-semibold">
          &larr; Back to chats
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-[#0a0b14] max-w-2xl mx-auto overflow-hidden">
      {/* Top Conversation Header */}
      <header className="px-4 py-3 bg-[#0e101d] border-b border-white/5 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div
            onClick={() => navigate('other-profile', { userId: selectedConversationUser.id })}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <Avatar
              src={selectedConversationUser.avatarUrl}
              alt={selectedConversationUser.fullName}
              size="sm"
              isOnline={isUserOnline(selectedConversationUser.id)}
            />
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">
                {selectedConversationUser.fullName}
              </h2>
              {typingUsers.length > 0 ? (
                <p className="text-[11px] text-purple-400 font-medium flex items-center gap-1.5 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block animate-ping" />
                  <span>typing...</span>
                </p>
              ) : isUserOnline(selectedConversationUser.id) ? (
                <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Online</span>
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 font-medium">
                  {getUserLastSeen(selectedConversationUser.id)
                    ? `Last seen ${new Date(getUserLastSeen(selectedConversationUser.id)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Offline'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {relationship === 'friends' && (
            <>
              <button
                id="voice-call-button"
                type="button"
                onClick={() => startCall(selectedConversationUser.id, 'audio')}
                aria-label="Start voice call"
                title="Start Voice Call"
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-emerald-400 transition-colors"
              >
                <Phone className="w-4 h-4" />
              </button>

              <button
                id="video-call-button"
                type="button"
                onClick={() => startCall(selectedConversationUser.id, 'video')}
                aria-label="Start video call"
                title="Start Video Call"
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-purple-400 transition-colors"
              >
                <Video className="w-4 h-4" />
              </button>

              <button
                id="select-media-header-btn"
                type="button"
                onClick={() => setIsMediaModalOpen(true)}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-purple-950/40 transition-all active:scale-95 border border-purple-400/20"
              >
                <Image className="w-3.5 h-3.5" />
                <span>Select Media</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Real Media & Chat Player Dock (Sits strictly between Chat Header and Chat Content) */}
      {activePlayingMedia && (
        <ChatMediaPlayer
          media={activePlayingMedia}
          onClose={() => setActivePlayingMedia(null)}
        />
      )}

      {/* Blocked Relationship Banner */}
      {relationship === 'blocked' && (
        <div className="px-4 py-2.5 bg-rose-950/40 border-b border-rose-500/20 text-rose-300 text-xs flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>You have blocked this user. Unblock them to chat.</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await api.unblockUser(selectedConversationUser.id);
                setRelationship('none');
                showToast(`Unblocked ${selectedConversationUser.fullName}`);
              } catch (err: any) {
                showToast(err?.message || 'Failed to unblock user.');
              }
            }}
            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-colors shrink-0"
          >
            Unblock
          </button>
        </div>
      )}
      {relationship === 'blocked_by' && (
        <div className="px-4 py-2.5 bg-slate-900 border-b border-white/10 text-slate-400 text-xs flex items-center gap-2 z-10 shrink-0">
          <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0" />
          <span>You cannot send messages to this user.</span>
        </div>
      )}

      {/* Realtime Stream Connection Status */}
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
                : 'Live chat connection offline.'}
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

      {/* Messages Stream */}
      <div
        ref={chatContainerRef}
        onScroll={handleChatScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <p className="text-sm">
              {relationship === 'friends'
                ? `Start your conversation with ${selectedConversationUser.fullName} 👋`
                : `${selectedConversationUser.fullName} is not in your friend list`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {relationship === 'friends'
                ? 'Send a message or a fun sticker below.'
                : 'Add this user to your friends list to start chatting.'}
            </p>
          </div>
        ) : (
          (() => {
            const lastSentMsgIndex = messages.reduce((lastIdx, m, idx) => {
              return m.senderId === currentUser?.id ? idx : lastIdx;
            }, -1);

            return messages.map((msg, index) => {
              const isMe = msg.senderId === currentUser?.id;
              const isLastSentMsg = index === lastSentMsgIndex;
              const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const readAtFormatted = msg.readAt
                ? new Date(msg.readAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null;

              return (
                <div
                  key={`${msg.id}_${index}`}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] ${
                    isMe ? 'ml-auto' : 'mr-auto'
                  }`}
                >
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMe
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-br-xs shadow-md shadow-purple-900/30'
                        : 'bg-[#181a2f] text-slate-200 rounded-bl-xs border border-white/5'
                    }`}
                  >
                    {msg.sticker && (
                      <div className="text-4xl py-1 select-none">{msg.sticker}</div>
                    )}
                    {msg.content && (
                      <TranslatableMessageContent
                        text={msg.content}
                        targetLanguage={targetLanguage}
                        isMe={isMe}
                      />
                    )}
                    {msg.attachmentUrl && (
                      <ChatMediaAttachment
                        url={msg.attachmentUrl}
                        mediaType={msg.mediaType}
                        mediaTitle={msg.mediaTitle}
                        isMe={isMe}
                        onPlayInPlayer={(mediaItem) => {
                          setActivePlayingMedia(mediaItem);
                          showToast(`Playing on Chat Player: ${mediaItem.title}`);
                        }}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-slate-400 select-none">
                    <span>{formattedTime}</span>
                    {isMe && (
                      <div
                        className="inline-flex items-center gap-1 ml-0.5 cursor-default"
                        title={
                          msg.read
                            ? readAtFormatted
                              ? `Seen by ${selectedConversationUser?.fullName || 'recipient'} at ${readAtFormatted}`
                              : `Seen by ${selectedConversationUser?.fullName || 'recipient'}`
                            : 'Delivered'
                        }
                      >
                        {msg.read ? (
                          <span className="inline-flex items-center gap-0.5 text-cyan-400 font-medium">
                            <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                            {isLastSentMsg && (
                              <span className="text-[10px] font-semibold tracking-tight text-cyan-300">Seen</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-slate-400">
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            {isLastSentMsg && (
                              <span className="text-[10px] tracking-tight">Delivered</span>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()
        )}

        {/* Typing indicator bubble */}
        {typingUsers.length > 0 && (
          <TypingIndicator users={typingUsers} variant="bubble" />
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

      {/* Sticker Picker Drawer */}
      {showStickerPicker && (
        <div className="p-3 bg-[#141628] border-t border-white/10 flex items-center gap-4 overflow-x-auto">
          {CHAT_STICKERS.map((sticker) => (
            <button
              key={sticker}
              onClick={() => handleSendMessage(sticker)}
              className="text-2xl hover:scale-125 transition-transform p-1"
            >
              {sticker}
            </button>
          ))}
        </div>
      )}

      {/* Bottom Message Input Bar */}
      {relationship === 'blocked' || relationship === 'blocked_by' ? (
        <div className="px-4 py-3 bg-[#0e101d] border-t border-white/5 text-center text-xs text-slate-400 shrink-0">
          Direct messaging is unavailable due to privacy restrictions.
        </div>
      ) : relationship === 'none' ? (
        <div className="p-3 sm:p-4 bg-[#0e101d] border-t border-white/10 shrink-0 w-full">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#141628] border border-white/10 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 text-purple-400">
                <UserPlus className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-200">
                  This user is not in your friend list
                </p>
                <p className="text-[11px] text-slate-400">
                  Add {selectedConversationUser.fullName} to your friends list to send messages.
                </p>
              </div>
            </div>
            <button
              id="chat-add-friend-btn"
              type="button"
              disabled={isFriendActionLoading}
              onClick={handleAddFriendInChat}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/40 transition-all active:scale-95 disabled:opacity-50 shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isFriendActionLoading ? 'Sending...' : 'Add Friend'}</span>
            </button>
          </div>
        </div>
      ) : relationship === 'outgoing_request' ? (
        <div className="p-3 sm:p-4 bg-[#0e101d] border-t border-white/10 shrink-0 w-full">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#141628] border border-amber-500/20 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-400">
                <Clock className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-200">Friend request pending</p>
                <p className="text-[11px] text-slate-400">
                  You can chat once @{selectedConversationUser.username} accepts your request.
                </p>
              </div>
            </div>
            <div className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0">
              <Clock className="w-3.5 h-3.5" />
              <span>Requested</span>
            </div>
          </div>
        </div>
      ) : relationship === 'incoming_request' ? (
        <div className="p-3 sm:p-4 bg-[#0e101d] border-t border-white/10 shrink-0 w-full">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#141628] border border-emerald-500/20 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-200">
                  {selectedConversationUser.fullName} sent you a friend request
                </p>
                <p className="text-[11px] text-slate-400">
                  Accept their request to start direct chatting together.
                </p>
              </div>
            </div>
            <button
              id="chat-accept-friend-btn"
              type="button"
              disabled={isFriendActionLoading}
              onClick={handleAcceptFriendInChat}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-900/40 transition-all active:scale-95 disabled:opacity-50 shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isFriendActionLoading ? 'Accepting...' : 'Accept to Chat'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 sm:py-2.5 bg-[#0e101d] border-t border-white/5 shrink-0 w-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-1.5 sm:gap-2 w-full"
          >
            <button
              type="button"
              onClick={() => setIsMediaModalOpen(true)}
              className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/5 active:scale-95 transition-all"
              aria-label="Select media or attachment"
              title="Select Media (YouTube & upload)"
            >
              <Paperclip className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </button>

            <button
              type="button"
              onClick={() => setShowStickerPicker(!showStickerPicker)}
              className={`shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                showStickerPicker ? 'text-purple-400 bg-purple-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              aria-label="Add emoji or sticker"
            >
              <Smile className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </button>

            <input
              type="text"
              value={inputText}
              onChange={handleInputChange}
              placeholder="Type a message..."
              className="flex-1 min-w-0 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full bg-[#171a30] border border-white/10 text-white placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:border-purple-500 transition-all"
            />

            <button
              type="button"
              onClick={() => showToast('Voice messages will be enabled in next release.')}
              className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/5 active:scale-95 transition-all"
              aria-label="Record voice note"
            >
              <Mic className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </button>

            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-md shadow-purple-900/40 disabled:opacity-40 transition-all active:scale-95"
              aria-label="Send message"
            >
              <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5" />
            </button>
          </form>
        </div>
      )}

      {/* Select Media Popup Modal (Strictly only accessible to confirmed friends) */}
      {relationship === 'friends' && (
        <SelectMediaModal
          isOpen={isMediaModalOpen}
          onClose={() => setIsMediaModalOpen(false)}
          onSelectMedia={handleSelectMedia}
        />
      )}
    </div>
  );
};

import type {
  User,
  Room,
  RoomMemberUser,
  RoomMessage,
  DirectConversation,
  DirectMessage,
  AppNotification,
  UserSettings,
  TypingUser,
  FriendRequest,
  RelationshipStatus,
  CallSession,
  CallSignalPayload,
  PresenceInfo,
  CurrentMedia,
  MediaSyncState,
} from '../types/index.ts';
import { auth } from '../lib/firebase.ts';

async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 2): Promise<Response> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      // If server returns temporary 502/503/504 while restarting, retry after backoff
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  let token: string | null = null;
  try {
    if (auth.currentUser) {
      token = await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn('Failed to retrieve Firebase ID token for request:', err);
  }
  if (!token && typeof window !== 'undefined') {
    token = localStorage.getItem('vibesphere_auth_token');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };

  const res = await fetchWithRetry(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg = 'An error occurred';
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
    } catch {
      errorMsg = res.statusText || errorMsg;
    }
    throw new Error(errorMsg);
  }

  // Handle case where non-JSON was returned (e.g. fallback HTML page)
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Unexpected non-JSON response from ${url}`);
    }
  }

  return res.json();
}

export const api = {
  // Auth
  async syncAuthUser(data: Partial<User>) {
    return fetchJson<{ user: User }>('/api/auth/sync', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async loginWithUsername(username: string, password: string) {
    return fetchJson<{ success: boolean; idToken: string; user: User }>('/api/auth/login-with-username', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async logout() {
    return fetchJson<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  },

  // Users
  async getUsers(params?: string | { q?: string; limit?: number; onlineOnly?: boolean }) {
    if (typeof params === 'string') {
      const url = params ? `/api/users?q=${encodeURIComponent(params)}` : '/api/users';
      return fetchJson<{ users: User[] }>(url);
    }
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set('q', params.q);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.onlineOnly !== undefined) searchParams.set('onlineOnly', String(params.onlineOnly));
    const query = searchParams.toString();
    const url = query ? `/api/users?${query}` : '/api/users';
    return fetchJson<{ users: User[] }>(url);
  },

  async getUser(id: string) {
    return fetchJson<{ user: User }>(`/api/users/${id}`);
  },

  async updateUser(id: string, updates: Partial<User>) {
    return fetchJson<{ user: User }>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async uploadAvatar(userId: string, imageBase64: string, mimeType: string) {
    return fetchJson<{ user: User; avatarUrl: string }>(`/api/users/${userId}/avatar`, {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mimeType }),
    });
  },

  async uploadMedia(base64Data: string, mimeType?: string, filename?: string) {
    return fetchJson<{ url: string; filename: string; mimeType: string; size: number }>(
      '/api/media/upload',
      {
        method: 'POST',
        body: JSON.stringify({ base64Data, mimeType, filename }),
      },
    );
  },

  async uploadMediaChunked(
    file: File | Blob,
    filename: string,
    mimeType?: string,
    onProgress?: (percent: number) => void
  ): Promise<{ url: string; filename: string; mimeType: string; size: number }> {
    const chunkSize = 1024 * 1024; // 1MB chunks
    const totalChunks = Math.ceil(file.size / chunkSize);
    const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const actualMime = mimeType || file.type || 'video/mp4';

    let finalResult: any = null;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const chunkBlob = file.slice(start, end);

      const chunkBuffer = await chunkBlob.arrayBuffer();
      // Convert buffer to base64
      let binary = '';
      const bytes = new Uint8Array(chunkBuffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const chunkData = btoa(binary);

      const res = await fetchJson<{
        done: boolean;
        url?: string;
        filename?: string;
        mimeType?: string;
        size?: number;
        percent?: number;
      }>('/api/media/upload-chunk', {
        method: 'POST',
        body: JSON.stringify({
          uploadId,
          chunkIndex,
          totalChunks,
          chunkData,
          mimeType: actualMime,
          filename,
        }),
      });

      if (onProgress) {
        const currentPercent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        onProgress(currentPercent);
      }

      if (res.done && res.url) {
        finalResult = {
          url: res.url,
          filename: res.filename || filename,
          mimeType: res.mimeType || actualMime,
          size: res.size || file.size,
        };
      }
    }

    if (!finalResult) {
      throw new Error('Chunked upload completed without receiving final media URL.');
    }

    return finalResult;
  },

  // Friends & Social Graph (Phase 07)
  async getFriends(userId?: string) {
    const url = userId ? `/api/users/${userId}/friends` : '/api/friends';
    return fetchJson<{ friends: User[] }>(url);
  },

  async getRelationship(targetUserId: string) {
    return fetchJson<{ relationship: RelationshipStatus; requestId?: string }>(
      `/api/relationships/${targetUserId}`,
    );
  },

  async getFriendRequests() {
    return fetchJson<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/api/friend-requests');
  },

  async sendFriendRequest(targetUserId: string) {
    return fetchJson<{ success: boolean; request: FriendRequest; relationship: RelationshipStatus }>(
      '/api/friend-requests',
      {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      },
    );
  },

  async acceptFriendRequest(requestIdOrActorId: string, currentUserId?: string, notificationId?: string) {
    if (currentUserId) {
      return fetchJson<{ success: boolean; relationship?: RelationshipStatus }>(
        `/api/users/${requestIdOrActorId}/accept-friend`,
        {
          method: 'POST',
          body: JSON.stringify({ currentUserId, notificationId }),
        },
      );
    }
    return fetchJson<{ success: boolean; relationship: RelationshipStatus }>(
      `/api/friend-requests/${requestIdOrActorId}/accept`,
      {
        method: 'POST',
      },
    );
  },

  async rejectFriendRequest(requestId: string) {
    return fetchJson<{ success: boolean; relationship: RelationshipStatus }>(
      `/api/friend-requests/${requestId}/reject`,
      {
        method: 'POST',
      },
    );
  },

  async cancelFriendRequest(requestId: string) {
    return fetchJson<{ success: boolean; relationship: RelationshipStatus }>(
      `/api/friend-requests/${requestId}/cancel`,
      {
        method: 'POST',
      },
    );
  },

  async removeFriend(targetUserId: string) {
    return fetchJson<{ success: boolean; relationship: RelationshipStatus }>(
      `/api/friends/${targetUserId}/remove`,
      {
        method: 'POST',
      },
    );
  },

  async blockUser(targetUserId: string) {
    return fetchJson<{ success: boolean; relationship: RelationshipStatus }>(
      `/api/users/${targetUserId}/block`,
      {
        method: 'POST',
      },
    );
  },

  async unblockUser(targetUserId: string) {
    return fetchJson<{ success: boolean; relationship: RelationshipStatus }>(
      `/api/users/${targetUserId}/unblock`,
      {
        method: 'POST',
      },
    );
  },

  async getBlockedUsers() {
    return fetchJson<{ blockedUsers: User[] }>('/api/blocked-users');
  },

  // Backward compatibility helpers
  async addFriend(currentUserId: string, targetUserId: string) {
    return fetchJson<{ success: boolean }>(`/api/users/${currentUserId}/add-friend`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
  },

  // Rooms
  async getRooms(params?: { tab?: string; q?: string; userId?: string; limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.tab) searchParams.set('tab', params.tab);
    if (params?.q) searchParams.set('q', params.q);
    if (params?.userId) searchParams.set('userId', params.userId);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));

    const query = searchParams.toString();
    const url = query ? `/api/rooms?${query}` : '/api/rooms';
    return fetchJson<{ rooms: Room[]; total?: number }>(url);
  },

  async getRoom(id: string) {
    return fetchJson<{ room: Room }>(`/api/rooms/${id}`);
  },

  async getRoomByCode(code: string) {
    return fetchJson<{ room: Room }>(`/api/rooms/by-code/${encodeURIComponent(code)}`);
  },

  async createRoom(data: {
    name: string;
    description?: string;
    bannerUrl?: string;
    type?: 'public' | 'private';
    maxMembers?: number;
    allowJoinRequests?: boolean;
    tags?: string[];
    language?: string;
    hostId: string;
    upcomingSessionTime?: string | null;
    scheduledAt?: string | null;
    isScheduled?: boolean;
  }) {
    return fetchJson<{ room: Room }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async joinRoomByCode(code: string, userId: string) {
    return fetchJson<{ room: Room }>('/api/rooms/join-by-code', {
      method: 'POST',
      body: JSON.stringify({ code, userId }),
    });
  },

  async joinRoom(roomId: string, userId: string) {
    return fetchJson<{ room: Room }>(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  async leaveRoom(roomId: string, userId: string) {
    return fetchJson<{ room: Room }>(`/api/rooms/${roomId}/leave`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  async updateRoomMedia(roomId: string, currentMedia: CurrentMedia | null, requesterId?: string) {
    return fetchJson<{ room: Room; mediaSync?: MediaSyncState | null; serverTime?: number }>(`/api/rooms/${roomId}/media`, {
      method: 'POST',
      body: JSON.stringify({ currentMedia, requesterId }),
    });
  },

  async sendMediaSyncAction(
    roomId: string,
    payload: {
      action: 'play' | 'pause' | 'seek' | 'sync';
      position: number;
      duration?: number;
      revision?: number;
    },
  ) {
    return fetchJson<{ success: boolean; mediaSync: MediaSyncState; serverTime: number }>(
      `/api/rooms/${roomId}/media/sync`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  async getRoomMediaSync(roomId: string) {
    return fetchJson<{ mediaSync: MediaSyncState | null; currentMedia: CurrentMedia | null; serverTime: number }>(
      `/api/rooms/${roomId}/media/sync`,
    );
  },

  async disbandRoom(roomId: string, requesterId: string) {
    return fetchJson<{ success: boolean; message: string }>(`/api/rooms/${roomId}/disband`, {
      method: 'POST',
      body: JSON.stringify({ requesterId }),
    });
  },

  async getRoomMembers(roomId: string) {
    return fetchJson<{ members: RoomMemberUser[] }>(`/api/rooms/${roomId}/members`);
  },

  async getBannedMembers(roomId: string) {
    return fetchJson<{ bannedUsers: User[] }>(`/api/rooms/${roomId}/banned`);
  },

  async kickMember(roomId: string, userId: string, requesterId: string) {
    return fetchJson<{ room: Room; message: string }>(`/api/rooms/${roomId}/kick`, {
      method: 'POST',
      body: JSON.stringify({ userId, requesterId }),
    });
  },

  async banMember(roomId: string, userId: string, requesterId: string, reason?: string) {
    return fetchJson<{ room: Room; message: string }>(`/api/rooms/${roomId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ userId, requesterId, reason }),
    });
  },

  async unbanMember(roomId: string, userId: string, requesterId: string) {
    return fetchJson<{ room: Room; message: string }>(`/api/rooms/${roomId}/unban`, {
      method: 'POST',
      body: JSON.stringify({ userId, requesterId }),
    });
  },

  async updateMemberPermission(
    roomId: string,
    data: {
      userId: string;
      requesterId: string;
      role?: 'admin' | 'member';
      isMuted?: boolean;
      canAddMedia?: boolean;
    },
  ) {
    return fetchJson<{ room: Room; message: string }>(`/api/rooms/${roomId}/permissions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async inviteToRoom(roomId: string, targetUserId: string) {
    return fetchJson<{ success: boolean; notification: AppNotification }>(
      `/api/rooms/${roomId}/invite`,
      {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      },
    );
  },

  async getRoomMessages(roomId: string, limit = 50) {
    return fetchJson<{ messages: RoomMessage[]; total?: number }>(
      `/api/rooms/${roomId}/messages?limit=${limit}`,
    );
  },

  createRoomMessageStream(
    roomId: string,
    callbacks: {
      onMessage: (message: RoomMessage) => void;
      onTyping: (typingUsers: TypingUser[]) => void;
      onRoomUpdate?: (room: Room, extra?: any) => void;
      onMediaSync?: (data: { mediaSync: MediaSyncState | null; serverTime: number }) => void;
      onUserSpeaking?: (data: { userId: string; isSpeaking: boolean }) => void;
      onRoomVoiceSignal?: (data: { roomId: string; fromUserId: string; targetUserId?: string; type: 'offer' | 'answer' | 'ice-candidate'; data: any }) => void;
      onReaction?: (reaction: { id: string; emoji: string; userId: string; userName: string; timestamp: string }) => void;
      onDisband?: (info: { message: string }) => void;
      onStatusChange: (status: 'connecting' | 'connected' | 'reconnecting' | 'error') => void;
    },
  ): () => void {
    let active = true;
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (!active) return;
      callbacks.onStatusChange('connecting');

      // If auth is still initializing, wait briefly for authStateChanged
      if (!auth.currentUser) {
        await new Promise((resolve) => {
          const unsubscribe = auth.onAuthStateChanged((u) => {
            unsubscribe();
            resolve(u);
          });
          setTimeout(() => {
            unsubscribe();
            resolve(null);
          }, 2500);
        });
      }

      let token = '';
      try {
        if (auth.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
      } catch (err) {
        console.warn('Failed to retrieve Firebase ID token for stream:', err);
      }

      if (!token) {
        callbacks.onStatusChange('reconnecting');
        if (!reconnectTimeout && active) {
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            if (active) connect();
          }, 3000);
        }
        return;
      }

      const streamUrl = `/api/rooms/${encodeURIComponent(roomId)}/stream?token=${encodeURIComponent(token)}`;
      eventSource = new EventSource(streamUrl);

      eventSource.addEventListener('connected', () => {
        if (!active) return;
        callbacks.onStatusChange('connected');
      });

      eventSource.addEventListener('message', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onMessage(data);
        } catch (err) {
          console.error('Failed to parse SSE message payload:', err);
        }
      });

      eventSource.addEventListener('typing', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onTyping(data.typingUsers || []);
        } catch (err) {
          console.error('Failed to parse SSE typing payload:', err);
        }
      });

      eventSource.addEventListener('room_update', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          if (data.room && callbacks.onRoomUpdate) {
            callbacks.onRoomUpdate(data.room, data);
          }
        } catch (err) {
          console.error('Failed to parse SSE room_update payload:', err);
        }
      });

      eventSource.addEventListener('media_sync', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onMediaSync?.(data);
        } catch (err) {
          console.error('Failed to parse SSE media_sync payload:', err);
        }
      });

      eventSource.addEventListener('user_speaking', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onUserSpeaking?.(data);
        } catch (err) {
          console.error('Failed to parse SSE user_speaking payload:', err);
        }
      });

      eventSource.addEventListener('room_voice_signal', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onRoomVoiceSignal?.(data);
        } catch (err) {
          console.error('Failed to parse SSE room_voice_signal payload:', err);
        }
      });

      eventSource.addEventListener('reaction', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onReaction?.(data);
        } catch (err) {
          console.error('Failed to parse SSE reaction payload:', err);
        }
      });

      eventSource.addEventListener('disband', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onDisband?.(data);
        } catch (err) {
          console.error('Failed to parse SSE disband payload:', err);
        }
      });

      eventSource.onerror = () => {
        if (!active) return;
        callbacks.onStatusChange('reconnecting');
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            if (active) connect();
          }, 3000);
        }
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (eventSource) {
        eventSource.close();
      }
    };
  },

  async sendRoomMessage(
    roomId: string,
    data: {
      senderId?: string;
      content: string;
      sticker?: string;
      attachmentUrl?: string;
      mediaType?: 'youtube' | 'image' | 'video' | 'audio' | 'link';
      mediaTitle?: string;
    },
  ) {
    return fetchJson<{ message: RoomMessage }>(`/api/rooms/${roomId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async sendRoomReaction(roomId: string, emoji: string) {
    return fetchJson<{ success: boolean; reaction: any }>(`/api/rooms/${roomId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  },

  async searchYouTubeVideos(query: string, options?: { limit?: number; pageToken?: string }) {
    const params = new URLSearchParams();
    params.set('q', query);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.pageToken) params.set('pageToken', options.pageToken);
    return fetchJson<{
      videos: Array<{
        id: string;
        title: string;
        channel: string;
        duration: string;
        category?: string;
        thumbnail?: string;
      }>;
      nextPageToken?: string | null;
      prevPageToken?: string | null;
      totalResults?: number;
      suggestions?: string[];
    }>(`/api/media/youtube/search?${params.toString()}`);
  },

  async getRoomTyping(roomId: string, excludeUserId?: string) {
    const url = excludeUserId
      ? `/api/rooms/${roomId}/typing?excludeUserId=${encodeURIComponent(excludeUserId)}`
      : `/api/rooms/${roomId}/typing`;
    return fetchJson<{ typingUsers: TypingUser[] }>(url);
  },

  async sendRoomTyping(roomId: string, arg2: string | boolean, arg3?: boolean) {
    const isTyping = typeof arg2 === 'boolean' ? arg2 : !!arg3;
    const userId = typeof arg2 === 'string' ? arg2 : undefined;
    return fetchJson<{ success: boolean }>(`/api/rooms/${roomId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ userId, isTyping }),
    });
  },

  // Direct conversations
  async getConversations(userId?: string) {
    return fetchJson<{
      conversations: (DirectConversation & {
        otherUser?: User;
        isOtherUserTyping?: boolean;
        isBlocked?: boolean;
        unreadCount?: number;
      })[];
    }>('/api/conversations');
  },

  async getOrCreateConversation(userId: string, targetUserId: string) {
    return fetchJson<{ conversation: DirectConversation & { otherUser?: User } }>(
      '/api/conversations',
      {
        method: 'POST',
        body: JSON.stringify({ userId, targetUserId }),
      },
    );
  },

  async getDirectMessages(conversationId: string) {
    return fetchJson<{ messages: DirectMessage[] }>(
      `/api/conversations/${conversationId}/messages`,
    );
  },

  async markConversationRead(conversationId: string) {
    return fetchJson<{ success: boolean; updatedCount: number }>(
      `/api/conversations/${conversationId}/read`,
      {
        method: 'POST',
      },
    );
  },

  async getConversationTyping(conversationId: string, excludeUserId?: string) {
    const url = excludeUserId
      ? `/api/conversations/${conversationId}/typing?excludeUserId=${encodeURIComponent(excludeUserId)}`
      : `/api/conversations/${conversationId}/typing`;
    return fetchJson<{ typingUsers: TypingUser[] }>(url);
  },

  async sendConversationTyping(conversationId: string, userId: string, isTyping: boolean) {
    return fetchJson<{ success: boolean }>(`/api/conversations/${conversationId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ userId, isTyping }),
    });
  },

  createConversationMessageStream(
    conversationId: string,
    callbacks: {
      onMessage: (message: DirectMessage) => void;
      onTyping: (typingUsers: TypingUser[]) => void;
      onReadReceipt?: (data: { conversationId: string; readerId: string; readCount: number; timestamp: string }) => void;
      onStatusChange: (status: 'connecting' | 'connected' | 'reconnecting' | 'error') => void;
    },
  ): () => void {
    let active = true;
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (!active) return;
      callbacks.onStatusChange('connecting');

      if (!auth.currentUser) {
        await new Promise((resolve) => {
          const unsubscribe = auth.onAuthStateChanged((u) => {
            unsubscribe();
            resolve(u);
          });
          setTimeout(() => {
            unsubscribe();
            resolve(null);
          }, 2500);
        });
      }

      let token = '';
      try {
        if (auth.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
      } catch (err) {
        console.warn('Failed to retrieve Firebase ID token for conversation stream:', err);
      }

      if (!token) {
        callbacks.onStatusChange('reconnecting');
        if (!reconnectTimeout && active) {
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            if (active) connect();
          }, 3000);
        }
        return;
      }

      const streamUrl = `/api/conversations/${encodeURIComponent(conversationId)}/stream?token=${encodeURIComponent(token)}`;
      eventSource = new EventSource(streamUrl);

      eventSource.addEventListener('connected', () => {
        if (!active) return;
        callbacks.onStatusChange('connected');
      });

      eventSource.addEventListener('message', (event) => {
        if (!active) return;
        try {
          const newMsg: DirectMessage = JSON.parse(event.data);
          callbacks.onMessage(newMsg);
        } catch (err) {
          console.error('Failed to parse SSE conversation message:', err);
        }
      });

      eventSource.addEventListener('typing', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data.typingUsers)) {
            callbacks.onTyping(data.typingUsers);
          }
        } catch (err) {
          console.error('Failed to parse SSE conversation typing payload:', err);
        }
      });

      eventSource.addEventListener('read_receipt', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onReadReceipt?.(data);
        } catch (err) {
          console.error('Failed to parse SSE conversation read_receipt payload:', err);
        }
      });

      eventSource.onerror = () => {
        if (!active) return;
        callbacks.onStatusChange('reconnecting');
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            if (active) connect();
          }, 3000);
        }
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (eventSource) {
        eventSource.close();
      }
    };
  },

  async sendDirectMessage(
    conversationId: string,
    data: {
      senderId?: string;
      receiverId?: string;
      content: string;
      sticker?: string;
      attachmentUrl?: string;
      mediaType?: 'youtube' | 'image' | 'video' | 'audio' | 'link';
      mediaTitle?: string;
    },
  ) {
    return fetchJson<{ message: DirectMessage }>(
      `/api/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  },

  // Notifications
  async getNotifications(
    userIdOrOptions?: string | { type?: string; limit?: number; offset?: number },
    typeArg?: string,
  ) {
    const params = new URLSearchParams();
    if (typeof userIdOrOptions === 'string') {
      if (typeArg && typeArg !== 'all') {
        params.set('type', typeArg);
      }
    } else if (userIdOrOptions && typeof userIdOrOptions === 'object') {
      if (userIdOrOptions.type && userIdOrOptions.type !== 'all') {
        params.set('type', userIdOrOptions.type);
      }
      if (typeof userIdOrOptions.limit === 'number') {
        params.set('limit', userIdOrOptions.limit.toString());
      }
      if (typeof userIdOrOptions.offset === 'number') {
        params.set('offset', userIdOrOptions.offset.toString());
      }
    }

    const query = params.toString();
    const url = query ? `/api/notifications?${query}` : '/api/notifications';
    return fetchJson<{
      notifications: AppNotification[];
      total?: number;
      unreadCount?: number;
    }>(url);
  },

  async getUnreadNotificationCount() {
    return fetchJson<{ unreadCount: number }>('/api/notifications/unread-count');
  },

  async markNotificationRead(id: string) {
    return fetchJson<{ notification: AppNotification; unreadCount?: number }>(
      `/api/notifications/${id}/read`,
      {
        method: 'PUT',
      },
    );
  },

  async markAllNotificationsRead(userId?: string) {
    return fetchJson<{ success: boolean; count?: number }>('/api/notifications/read-all', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  async deleteNotification(id: string) {
    return fetchJson<{ success: boolean; unreadCount?: number }>(`/api/notifications/${id}`, {
      method: 'DELETE',
    });
  },

  createNotificationStream(callbacks: {
    onConnected?: (data: { status: string; unreadCount: number }) => void;
    onNotification?: (notification: AppNotification) => void;
    onUnreadCount?: (data: { unreadCount: number }) => void;
    onPresenceUpdate?: (data: { userId: string; isOnline: boolean; status?: 'online' | 'away' | 'offline'; lastSeen?: string }) => void;
    onIncomingCall?: (call: CallSession) => void;
    onCallAccepted?: (data: { callId: string }) => void;
    onCallDeclined?: (data: { callId: string }) => void;
    onCallSignal?: (signal: CallSignalPayload) => void;
    onCallEnded?: (data: { callId: string; reason?: string }) => void;
    onRoomVoiceSignal?: (data: { roomId: string; fromUserId: string; type: string; data: any }) => void;
    onStatusChange?: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
  }): () => void {
    let active = true;
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (!active) return;
      callbacks.onStatusChange?.('connecting');

      let token: string | null = null;
      try {
        if (auth.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
      } catch (err) {
        console.warn('Failed to retrieve Firebase ID token for notification stream:', err);
      }

      if (!token) {
        callbacks.onStatusChange?.('reconnecting');
        if (active && !reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            if (active) connect();
          }, 3000);
        }
        return;
      }

      const streamUrl = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
      eventSource = new EventSource(streamUrl);

      eventSource.addEventListener('connected', (event) => {
        if (!active) return;
        callbacks.onStatusChange?.('connected');
        try {
          const data = JSON.parse(event.data);
          callbacks.onConnected?.(data);
          if (typeof data.unreadCount === 'number') {
            callbacks.onUnreadCount?.({ unreadCount: data.unreadCount });
          }
        } catch (err) {
          console.error('Failed to parse SSE notification connected event:', err);
        }
      });

      eventSource.addEventListener('notification', (event) => {
        if (!active) return;
        try {
          const notif: AppNotification = JSON.parse(event.data);
          callbacks.onNotification?.(notif);
        } catch (err) {
          console.error('Failed to parse SSE notification payload:', err);
        }
      });

      eventSource.addEventListener('unread_count', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onUnreadCount?.(data);
        } catch (err) {
          console.error('Failed to parse SSE unread_count payload:', err);
        }
      });

      eventSource.addEventListener('presence_update', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onPresenceUpdate?.(data);
        } catch (err) {
          console.error('Failed to parse SSE presence_update payload:', err);
        }
      });

      eventSource.addEventListener('incoming_call', (event) => {
        if (!active) return;
        try {
          const call: CallSession = JSON.parse(event.data);
          callbacks.onIncomingCall?.(call);
        } catch (err) {
          console.error('Failed to parse SSE incoming_call payload:', err);
        }
      });

      eventSource.addEventListener('call_accepted', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onCallAccepted?.(data);
        } catch (err) {
          console.error('Failed to parse SSE call_accepted payload:', err);
        }
      });

      eventSource.addEventListener('call_declined', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onCallDeclined?.(data);
        } catch (err) {
          console.error('Failed to parse SSE call_declined payload:', err);
        }
      });

      eventSource.addEventListener('call_signal', (event) => {
        if (!active) return;
        try {
          const signal: CallSignalPayload = JSON.parse(event.data);
          callbacks.onCallSignal?.(signal);
        } catch (err) {
          console.error('Failed to parse SSE call_signal payload:', err);
        }
      });

      eventSource.addEventListener('call_ended', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onCallEnded?.(data);
        } catch (err) {
          console.error('Failed to parse SSE call_ended payload:', err);
        }
      });

      eventSource.addEventListener('room_voice_signal', (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          callbacks.onRoomVoiceSignal?.(data);
        } catch (err) {
          console.error('Failed to parse SSE room_voice_signal payload:', err);
        }
      });

      eventSource.onerror = () => {
        if (!active) return;
        callbacks.onStatusChange?.('reconnecting');
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            if (active) connect();
          }, 3000);
        }
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (eventSource) {
        eventSource.close();
      }
    };
  },

  // Presence API
  async getPresence() {
    return fetchJson<{ presence: Record<string, PresenceInfo> }>('/api/presence');
  },

  async sendPresenceHeartbeat(status?: 'online' | 'away') {
    return fetchJson<{ success: boolean; status: string; lastSeen: string }>('/api/presence/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  // WebRTC 1-to-1 Calling API
  async initiateCall(recipientId: string, type: 'audio' | 'video' = 'audio') {
    return fetchJson<{ call: CallSession }>('/api/calls/initiate', {
      method: 'POST',
      body: JSON.stringify({ recipientId, type }),
    });
  },

  async respondToCall(callId: string, action: 'accept' | 'decline') {
    return fetchJson<{ success: boolean; status: string }>(`/api/calls/${callId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },

  async sendCallSignal(
    callId: string,
    type: 'offer' | 'answer' | 'ice-candidate' | 'screenshare-started' | 'screenshare-stopped',
    data: any,
  ) {
    return fetchJson<{ success: boolean }>(`/api/calls/${callId}/signal`, {
      method: 'POST',
      body: JSON.stringify({ type, data }),
    });
  },

  async endCall(callId: string, reason?: string) {
    return fetchJson<{ success: boolean; status: string }>(`/api/calls/${callId}/end`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getCall(callId: string) {
    return fetchJson<{ call: CallSession }>(`/api/calls/${callId}`);
  },

  // Room Voice Speaking & Signaling
  async setRoomSpeaking(roomId: string, isSpeaking: boolean) {
    return fetchJson<{ success: boolean }>(`/api/rooms/${roomId}/speaking`, {
      method: 'POST',
      body: JSON.stringify({ isSpeaking }),
    });
  },

  async sendRoomVoiceSignal(
    roomId: string,
    targetUserId: string,
    type: 'offer' | 'answer' | 'ice-candidate',
    data: any,
  ) {
    return fetchJson<{ success: boolean }>(`/api/rooms/${roomId}/voice/signal`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId, type, data }),
    });
  },

  // Settings
  async getSettings(userId: string) {
    return fetchJson<{ settings: UserSettings }>(`/api/settings?userId=${userId}`);
  },

  async updateSettings(userId: string, settings: Partial<UserSettings>) {
    return fetchJson<{ settings: UserSettings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ userId, settings }),
    });
  },

  // AI Playground Test
  async testAIPlayground(data: {
    prompt: string;
    modelId: string;
    modelName: string;
    provider: string;
    apiKey?: string;
    url?: string;
    temperature?: number;
    persona?: string;
    customPersona?: string;
    systemInstruction?: string;
  }) {
    return fetchJson<{
      response: string;
      latencyMs: number;
      model: string;
      provider: string;
      tokens?: number;
    }>('/api/ai/playground-test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Chat Message Auto Translation
  async translateChatMessage(
    text: string,
    targetLanguage: string = 'en',
    sourceLanguage?: string,
    modelConfig?: {
      modelId?: string;
      modelName?: string;
      provider?: string;
      apiKey?: string;
      url?: string;
      temperature?: number;
    }
  ) {
    let effectiveConfig = modelConfig;
    if (!effectiveConfig && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('vibesphere_user_pref_v2');
        if (saved) {
          const parsed = JSON.parse(saved);
          const assignedId = parsed.aiWorkAssignments?.chat_translate || 'google-gemini-3.8-flash';
          const found = (parsed.aiModelsList || []).find((m: any) => m.id === assignedId);
          if (found) {
            effectiveConfig = {
              modelId: found.id,
              modelName: found.model || found.id,
              provider: found.provider,
              apiKey: found.apiKey,
              url: found.url,
              temperature: found.temperature,
            };
          }
        }
      } catch {}
    }

    return fetchJson<{
      success: boolean;
      translatedText?: string;
      detectedSourceLanguage?: string;
      targetLanguage?: string;
      provider?: string;
      error?: string;
    }>('/api/chat/translate', {
      method: 'POST',
      body: JSON.stringify({
        text,
        targetLanguage,
        sourceLanguage,
        ...(effectiveConfig || {}),
      }),
    });
  },

  async getIceServers(): Promise<{ iceServers: RTCIceServer[]; turnConfigured: boolean }> {
    try {
      const res = await fetchJson<{ iceServers: RTCIceServer[]; turnConfigured: boolean }>('/api/webrtc/ice-servers');
      if (res && Array.isArray(res.iceServers)) {
        return res;
      }
    } catch (err) {
      console.warn('Failed to fetch ICE servers from backend, using defaults:', err);
    }
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      turnConfigured: false,
    };
  },
};

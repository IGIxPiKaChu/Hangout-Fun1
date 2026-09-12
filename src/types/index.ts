export interface User {
  id: string;
  fullName: string;
  username: string;
  email: string;
  avatarUrl: string;
  coverUrl?: string;
  bio?: string;
  createdAt: string;
  isOnline: boolean;
  lastSeen: string;
  friends: string[]; // array of user IDs
  followersCount: number;
  blockedUsers: string[];
  savedMessageIds: string[];
}

export interface CurrentMedia {
  type: 'youtube' | 'video' | 'audio' | 'image';
  url: string;
  title: string;
  youtubeId?: string;
  startedAt?: number;
  addedBy?: string;
  addedByName?: string;
}

export interface MediaSyncState {
  roomId: string;
  media: CurrentMedia | null;
  isPlaying: boolean;
  position: number; // in seconds (authoritative position at updatedAt)
  updatedAt: number; // server timestamp in ms
  revision: number; // monotonic revision number
  controllerId: string; // user ID who initiated the sync action
  controllerName: string;
  action: 'play' | 'pause' | 'seek' | 'change_media' | 'stop_media' | 'sync';
  duration?: number;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  description: string;
  bannerUrl: string;
  type: 'public' | 'private';
  hostId: string;
  hostName: string;
  hostUsername: string;
  hostAvatar: string;
  maxMembers: number;
  allowJoinRequests: boolean;
  memberIds: string[];
  adminIds: string[];
  bannedUserIds?: string[];
  mutedUserIds?: string[];
  allowedMediaUserIds?: string[];
  tags: string[];
  language: string;
  upcomingSessionTime?: string | null;
  scheduledAt?: string | null;
  isScheduled?: boolean;
  createdAt: string;
  isActive: boolean;
  currentMedia?: CurrentMedia | null;
  mediaSync?: MediaSyncState | null;
}

export interface RoomMemberUser extends User {
  isHost: boolean;
  isAdmin: boolean;
  isMuted?: boolean;
  canAddMedia?: boolean;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderAvatar: string;
  content: string;
  attachmentUrl?: string;
  mediaType?: 'youtube' | 'image' | 'video' | 'audio' | 'link';
  mediaTitle?: string;
  sticker?: string;
  timestamp: string;
}

export interface DirectConversation {
  id: string;
  participantIds: string[];
  lastMessage?: {
    senderId: string;
    content: string;
    timestamp: string;
    read?: boolean;
    readAt?: string;
  };
  unreadCount?: number;
  updatedAt: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  attachmentUrl?: string;
  mediaType?: 'youtube' | 'image' | 'video' | 'audio' | 'link';
  mediaTitle?: string;
  sticker?: string;
  timestamp: string;
  read: boolean;
  readAt?: string;
}

export type NotificationType = 'all' | 'mentions' | 'invites' | 'system';

export interface TypingUser {
  userId: string;
  fullName: string;
  username: string;
  avatarUrl?: string;
  timestamp: number;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderAvatar: string;
  receiverId: string;
  receiverName?: string;
  receiverUsername?: string;
  receiverAvatar?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export type RelationshipStatus =
  | 'none'
  | 'friends'
  | 'outgoing_request'
  | 'incoming_request'
  | 'blocked'
  | 'blocked_by';

export interface AppNotification {
  id: string;
  userId: string;
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  actorUsername?: string;
  type: 'mention' | 'invite' | 'friend_request' | 'system' | 'direct_message';
  title: string;
  description: string;
  targetRoomId?: string;
  targetRoomName?: string;
  targetConversationId?: string;
  timestamp: string;
  isRead: boolean;
  status?: 'pending' | 'accepted' | 'declined';
}

export interface UserSettings {
  appearance: 'dark' | 'light' | 'system';
  pushNotifications: boolean;
  emailNotifications: boolean;
  roomInvites: boolean;
  directMessages: 'everyone' | 'friends' | 'none';
  activityStatus: boolean;
  language: string;
  chatTranslationLanguage?: string;
  doNotDisturb?: boolean;
}

export type ScreenType =
  | 'welcome'
  | 'login'
  | 'signup'
  | 'home'
  | 'rooms'
  | 'room-details'
  | 'chats'
  | 'direct-chat'
  | 'notifications'
  | 'profile'
  | 'other-profile'
  | 'room-view'
  | 'settings'
  | 'friends'
  | 'my-rooms';

export interface PresenceInfo {
  isOnline: boolean;
  status: 'online' | 'away' | 'offline';
  lastSeen?: string;
}

export type CallStatus =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'declined'
  | 'failed';

export interface CallSession {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  recipientId: string;
  recipientName: string;
  recipientAvatar: string;
  type: 'audio' | 'video';
  status: CallStatus;
  createdAt: number;
  connectedAt?: number;
  endedAt?: number;
  endReason?: string;
  isScreenSharing?: boolean;
  screenSharingUserId?: string;
}

export interface CallSignalPayload {
  callId: string;
  fromUserId: string;
  type: 'offer' | 'answer' | 'ice-candidate' | 'screenshare-started' | 'screenshare-stopped';
  data: any;
}

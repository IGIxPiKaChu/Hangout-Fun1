import express, { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { db } from './db.ts';
import { requireAuth, optionalAuth, verifyFirebaseIdToken, signInWithEmailPassword, type AuthenticatedRequest } from './auth.ts';
import type { Room, RoomMessage, DirectMessage, AppNotification, User, TypingUser, UserSettings, FriendRequest, RelationshipStatus, CurrentMedia, MediaSyncState } from '../src/types/index.ts';

export const apiRouter = Router();
apiRouter.use(express.json());

// Strict rate limiters for AI and security-sensitive endpoints
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 30, // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please slow down and try again in a moment.' },
});

export const authLookupRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 15, // 15 username lookups per minute per IP to prevent enumeration
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many lookup requests. Please try again in a minute.' },
});

// Authoritatively ensure friendship between PiKaChu and Ash Ketchum is accepted
try {
  const pikaId = '0dLPPVgZEIZWu4ufcnCRKEr51q82';
  const ashId = 'user_ash_ketchum';
  db.addFriendship(pikaId, ashId);
  const notifs = db.getNotificationsForUser(pikaId);
  if (!notifs.some((n) => n.actorId === ashId && n.status === 'accepted')) {
    db.createNotification({
      id: `notif_ash_accepted_${Date.now()}`,
      userId: pikaId,
      actorId: ashId,
      actorName: 'Ash Ketchum',
      actorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      actorUsername: 'ash_ketchum',
      type: 'friend_request',
      title: 'Friend Request Accepted',
      description: 'Ash Ketchum (@ash_ketchum) accepted your friend request! You can now chat and share media.',
      timestamp: new Date().toISOString(),
      isRead: false,
      status: 'accepted',
    });
  }
} catch (e) {
  console.error('Failed to link Ash Ketchum friendship:', e);
}

// Realtime SSE Manager for Room Chat and Presence
interface SSEClient {
  id: string;
  userId: string;
  res: Response;
}

const roomSSEConnections = new Map<string, Set<SSEClient>>();
const conversationSSEConnections = new Map<string, Set<SSEClient>>();
const userSSEConnections = new Map<string, Set<SSEClient>>();

export function broadcastToRoom(roomId: string, eventName: string, data: any) {
  const clients = roomSSEConnections.get(roomId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function broadcastToConversation(conversationId: string, eventName: string, data: any) {
  const clients = conversationSSEConnections.get(conversationId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function broadcastToUser(userId: string, eventName: string, data: any) {
  const clients = userSSEConnections.get(userId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function broadcastGlobal(eventName: string, data: any) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const clientSet of userSSEConnections.values()) {
    for (const client of clientSet) {
      try {
        client.res.write(payload);
      } catch {
        clientSet.delete(client);
      }
    }
  }
}

// Presence State Tracking
export interface PresenceState {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: string;
  lastHeartbeat: number;
}

const userPresenceState = new Map<string, PresenceState>();
const userDisconnectTimers = new Map<string, NodeJS.Timeout>();

// WebRTC Call Session State
export interface CallSession {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  recipientId: string;
  recipientName: string;
  recipientAvatar: string;
  type: 'audio' | 'video';
  status: 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'declined' | 'failed';
  createdAt: number;
  connectedAt?: number;
  endedAt?: number;
  endReason?: string;
  isScreenSharing?: boolean;
  screenSharingUserId?: string;
}

const activeCalls = new Map<string, CallSession>();

// Ephemeral In-Memory Typing Tracker
const conversationTypingMap = new Map<string, Map<string, TypingUser>>();
const roomTypingMap = new Map<string, Map<string, TypingUser>>();

const TYPING_TIMEOUT_MS = 3500;

function cleanupTyping(map: Map<string, Map<string, TypingUser>>) {
  const now = Date.now();
  for (const [targetId, userMap] of map.entries()) {
    for (const [userId, entry] of userMap.entries()) {
      if (now - entry.timestamp > TYPING_TIMEOUT_MS) {
        userMap.delete(userId);
      }
    }
    if (userMap.size === 0) {
      map.delete(targetId);
    }
  }
}

function setTypingState(
  map: Map<string, Map<string, TypingUser>>,
  targetId: string,
  user: User,
  isTyping: boolean,
) {
  cleanupTyping(map);
  if (!map.has(targetId)) {
    map.set(targetId, new Map());
  }
  const userMap = map.get(targetId)!;

  if (isTyping) {
    userMap.set(user.id, {
      userId: user.id,
      fullName: user.fullName,
      username: user.username,
      avatarUrl: user.avatarUrl,
      timestamp: Date.now(),
    });
  } else {
    userMap.delete(user.id);
    if (userMap.size === 0) {
      map.delete(targetId);
    }
  }
}

function getActiveTyping(
  map: Map<string, Map<string, TypingUser>>,
  targetId: string,
  excludeUserId?: string,
): TypingUser[] {
  cleanupTyping(map);
  const userMap = map.get(targetId);
  if (!userMap) return [];
  const list: TypingUser[] = [];
  for (const entry of userMap.values()) {
    if (!excludeUserId || entry.userId !== excludeUserId) {
      list.push(entry);
    }
  }
  return list;
}

// Auth & Identity (Authoritatively handled by Firebase Authentication)
apiRouter.post('/auth/sync', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const uid = req.auth!.uid;
  const verifiedEmail = req.auth!.email || '';
  const { fullName, username, avatarUrl, bio } = req.body;

  let existing = db.findUserById(uid);
  if (!existing && verifiedEmail) {
    // Also check if existing user by email
    const byEmail = db.findUserByEmailOrUsername(verifiedEmail);
    if (byEmail && byEmail.id !== uid) {
      existing = db.migrateUserId(byEmail.id, uid);
    }
  }

  if (existing) {
    const updated = db.updateUser(uid, {
      isOnline: true,
      lastSeen: new Date().toISOString(),
      ...(fullName && { fullName: fullName.trim() }),
      ...(username && { username: username.trim().toLowerCase().replace(/^@/, '') }),
      ...(avatarUrl && { avatarUrl }),
      ...(bio !== undefined && { bio }),
      ...(verifiedEmail && { email: verifiedEmail }),
    });
    const current = updated || existing;
    return res.json({ user: db.findUserById(uid) || current });
  }

  // First-time profile synchronization for authenticated Firebase user
  const cleanUsername = (username || verifiedEmail.split('@')[0] || `user_${uid.substring(0, 6)}`)
    .trim()
    .toLowerCase()
    .replace(/^@/, '');

  const newUser: User = {
    id: uid,
    fullName: fullName ? fullName.trim() : cleanUsername,
    username: cleanUsername,
    email: verifiedEmail.trim().toLowerCase(),
    avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanUsername)}`,
    coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop',
    bio: bio || 'Hey there! I am hanging out on Social Hangout.',
    createdAt: new Date().toISOString(),
    isOnline: true,
    lastSeen: new Date().toISOString(),
    friends: [],
    followersCount: 0,
    blockedUsers: [],
    savedMessageIds: [],
  };

  const created = db.createUser(newUser);
  return res.status(201).json({ user: db.findUserById(uid) || created });
});

// Authoritative login with username and password verification
apiRouter.post('/auth/login-with-username', authLookupRateLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
  const user = db.findUserByUsername(cleanUsername);
  if (!user || !user.email) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const authResult = await signInWithEmailPassword(user.email, password);
  if (!authResult) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  // Update user online status
  const updatedUser = db.updateUser(user.id, {
    isOnline: true,
    lastSeen: new Date().toISOString(),
  }) || user;

  return res.json({
    success: true,
    idToken: authResult.idToken,
    user: updatedUser,
  });
});

apiRouter.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const uid = req.auth!.uid;
  if (userDisconnectTimers.has(uid)) {
    clearTimeout(userDisconnectTimers.get(uid)!);
    userDisconnectTimers.delete(uid);
  }
  const clients = userSSEConnections.get(uid);
  if (clients) {
    for (const c of clients) {
      try {
        c.res.end();
      } catch {}
    }
    userSSEConnections.delete(uid);
  }
  const nowIso = new Date().toISOString();
  db.updateUser(uid, { isOnline: false, lastSeen: nowIso });
  userPresenceState.set(uid, {
    userId: uid,
    status: 'offline',
    lastSeen: nowIso,
    lastHeartbeat: Date.now(),
  });
  broadcastGlobal('presence_update', {
    userId: uid,
    isOnline: false,
    status: 'offline',
    lastSeen: nowIso,
  });
  return res.json({ success: true });
});

// Users
apiRouter.get('/users', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const { q, onlineOnly, limit, offset } = req.query;
  const callerUid = req.auth?.uid;
  let users = db.getUsers();

  if (typeof q === 'string' && q.trim()) {
    const term = q.toLowerCase().trim();
    users = users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term),
    );
  }

  // Map users respecting privacy settings and omitting sensitive private fields
  let sanitized = users.map((u) => {
    const settings = db.getUserSettings(u.id);
    const showActivity = settings ? settings.activityStatus !== false : true;
    const isSelf = callerUid && callerUid === u.id;
    return {
      id: u.id,
      fullName: u.fullName,
      username: u.username,
      avatarUrl: u.avatarUrl,
      coverUrl: u.coverUrl,
      bio: u.bio,
      createdAt: u.createdAt,
      isOnline: showActivity ? Boolean(u.isOnline) : false,
      lastSeen: showActivity ? u.lastSeen : undefined,
      followersCount: u.followersCount || 0,
      friends: isSelf ? u.friends : [],
    };
  });

  if (onlineOnly === 'true') {
    sanitized = sanitized.filter((u) => u.isOnline);
  }

  const total = sanitized.length;
  const skip = Math.max(Number(offset) || 0, 0);
  const maxLimit = limit ? Math.min(Math.max(Number(limit) || 20, 1), 100) : 50;
  const pagedUsers = sanitized.slice(skip, skip + maxLimit);

  return res.json({
    users: pagedUsers,
    total,
    offset: skip,
    limit: maxLimit,
    hasMore: skip + maxLimit < total,
  });
});

apiRouter.get('/users/:id', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = db.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const callerUid = req.auth?.uid;
  const isSelf = callerUid && callerUid === user.id;
  const settings = db.getUserSettings(user.id);
  const showActivity = settings ? settings.activityStatus !== false : true;

  const sanitized = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    coverUrl: user.coverUrl,
    bio: user.bio,
    createdAt: user.createdAt,
    isOnline: showActivity ? Boolean(user.isOnline) : false,
    lastSeen: showActivity ? user.lastSeen : undefined,
    followersCount: user.followersCount || 0,
    friends: isSelf ? user.friends : [],
    ...(isSelf && { email: user.email, blockedUsers: user.blockedUsers, savedMessageIds: user.savedMessageIds }),
  };

  return res.json({ user: sanitized });
});

apiRouter.put('/users/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  // Enforce that authenticated user can only update their own profile
  if (req.auth!.uid !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden: You can only update your own profile.' });
  }

  const existingUser = db.findUserById(req.params.id);
  if (!existingUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const { fullName, username, bio, avatarUrl, coverUrl } = req.body;

  // Validation: fullName
  if (fullName !== undefined) {
    if (typeof fullName !== 'string' || fullName.trim().length === 0) {
      return res.status(400).json({ error: 'Display name cannot be empty.' });
    }
    if (fullName.trim().length > 80) {
      return res.status(400).json({ error: 'Display name cannot exceed 80 characters.' });
    }
  }

  // Validation: username
  let cleanUsername: string | undefined = undefined;
  if (username !== undefined) {
    if (typeof username !== 'string') {
      return res.status(400).json({ error: 'Invalid username format.' });
    }
    cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      return res.status(400).json({
        error: 'Username must be between 3 and 30 characters (letters, numbers, underscores only).',
      });
    }
    // Check if taken by another user
    const takenUser = db.findUserByUsername(cleanUsername);
    if (takenUser && takenUser.id !== req.params.id) {
      return res.status(409).json({ error: 'Username is already taken by another member.' });
    }
  }

  // Validation: bio
  if (bio !== undefined && typeof bio === 'string' && bio.length > 300) {
    return res.status(400).json({ error: 'Bio cannot exceed 300 characters.' });
  }

  // Validation: avatarUrl
  if (avatarUrl !== undefined && typeof avatarUrl === 'string' && avatarUrl.length > 1000) {
    return res.status(400).json({ error: 'Avatar URL is invalid or too long.' });
  }

  // Validation: coverUrl
  if (coverUrl !== undefined && typeof coverUrl === 'string' && coverUrl.length > 1000) {
    return res.status(400).json({ error: 'Cover URL is invalid or too long.' });
  }

  const updated = db.updateUser(req.params.id, {
    ...(fullName !== undefined && { fullName: fullName.trim() }),
    ...(cleanUsername !== undefined && { username: cleanUsername }),
    ...(bio !== undefined && { bio: typeof bio === 'string' ? bio.trim() : '' }),
    ...(avatarUrl !== undefined && { avatarUrl: avatarUrl.trim() }),
    ...(coverUrl !== undefined && { coverUrl: coverUrl.trim() }),
  });

  return res.json({ user: updated });
});

// Upload Avatar Image
apiRouter.post('/users/:id/avatar', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.auth!.uid !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden: You can only upload your own avatar.' });
  }

  const existingUser = db.findUserById(req.params.id);
  if (!existingUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const { imageBase64, mimeType } = req.body;
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'No image data provided.' });
  }

  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!mimeType || !allowedMimeTypes.includes(mimeType)) {
    return res.status(400).json({
      error: 'Invalid image format. Allowed formats: JPEG, PNG, WebP, GIF.',
    });
  }

  // Clean data URL prefix if present
  const base64Clean = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  const buffer = Buffer.from(base64Clean, 'base64');

  // Validate size (max 2MB)
  const MAX_SIZE_BYTES = 2 * 1024 * 1024;
  if (buffer.length > MAX_SIZE_BYTES) {
    return res.status(400).json({ error: 'File size exceeds maximum 2MB limit.' });
  }

  try {
    const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const ext = extMap[mimeType] || 'jpg';
    const filename = `${req.params.id}-${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    await fs.promises.writeFile(filePath, buffer);
    const avatarUrl = `/uploads/avatars/${filename}`;

    const updated = db.updateUser(req.params.id, { avatarUrl });
    return res.json({ user: updated, avatarUrl });
  } catch (err: any) {
    console.error('Avatar file write error:', err);
    return res.status(500).json({ error: 'Failed to save avatar image to server.' });
  }
});

// ==========================================
// PHASE 10 — Real Media Upload & Chat Player Storage
// ==========================================

apiRouter.post('/media/upload', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { base64Data, mimeType, filename } = req.body;
  if (!base64Data || typeof base64Data !== 'string') {
    return res.status(400).json({ error: 'Missing base64Data in upload request.' });
  }

  // Parse data URL or raw base64
  const matches = base64Data.match(/^data:([a-zA-Z0-9\/-]+);base64,(.+)$/);
  const detectedMime = (matches ? matches[1] : (mimeType || 'application/octet-stream')).toLowerCase();
  const rawBase64 = matches ? matches[2] : base64Data;

  const buffer = Buffer.from(rawBase64, 'base64');
  const MAX_SIZE_BYTES = 45 * 1024 * 1024; // 45MB max
  if (buffer.length > MAX_SIZE_BYTES) {
    return res.status(400).json({ error: 'File size exceeds maximum 45MB limit.' });
  }

  const allowedPrefixes = ['image/', 'video/', 'audio/'];
  if (!allowedPrefixes.some((p) => detectedMime.startsWith(p))) {
    return res.status(400).json({ error: 'Unsupported media MIME type. Only images, videos, and audio are supported.' });
  }

  try {
    const uploadDir = path.join(process.cwd(), 'uploads', 'chat-media');
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/ogg': 'ogv',
      'video/quicktime': 'mov',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/webm': 'weba',
      'audio/aac': 'aac',
    };

    let ext = extMap[detectedMime];
    if (!ext) {
      if (detectedMime.startsWith('video/')) ext = 'mp4';
      else if (detectedMime.startsWith('audio/')) ext = 'mp3';
      else ext = 'png';
    }

    const uniqueName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = path.join(uploadDir, uniqueName);

    await fs.promises.writeFile(filePath, buffer);
    const mediaUrl = `/uploads/chat-media/${uniqueName}`;

    return res.json({
      url: mediaUrl,
      filename: filename || uniqueName,
      mimeType: detectedMime,
      size: buffer.length,
    });
  } catch (err: any) {
    console.error('Media upload write error:', err);
    return res.status(500).json({ error: 'Failed to save media file to server storage.' });
  }
});

// Chunked Media Upload for real-time fast streaming and chunk-by-chunk delivery
apiRouter.post('/media/upload-chunk', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { uploadId, chunkIndex, totalChunks, chunkData, mimeType, filename } = req.body;
    if (!uploadId || typeof chunkIndex !== 'number' || typeof totalChunks !== 'number' || !chunkData) {
      return res.status(400).json({ error: 'Invalid chunk upload payload.' });
    }

    const tempChunkDir = path.join(process.cwd(), 'uploads', 'temp-chunks', uploadId.replace(/[^a-zA-Z0-9_-]/g, ''));
    await fs.promises.mkdir(tempChunkDir, { recursive: true });

    const chunkBuffer = Buffer.from(chunkData, 'base64');
    const chunkPath = path.join(tempChunkDir, `chunk_${String(chunkIndex).padStart(5, '0')}.part`);
    await fs.promises.writeFile(chunkPath, chunkBuffer);

    // Check if all chunks have arrived
    const files = await fs.promises.readdir(tempChunkDir);
    const chunkFiles = files.filter((f) => f.startsWith('chunk_') && f.endsWith('.part'));

    if (chunkFiles.length >= totalChunks) {
      // Assemble all chunks in order
      const uploadDir = path.join(process.cwd(), 'uploads', 'chat-media');
      await fs.promises.mkdir(uploadDir, { recursive: true });

      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/ogg': 'ogv',
        'video/quicktime': 'mov',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/webm': 'weba',
        'audio/aac': 'aac',
      };

      const detectedMime = (mimeType || 'video/mp4').toLowerCase();
      let ext = extMap[detectedMime];
      if (!ext) {
        if (detectedMime.startsWith('video/')) ext = 'mp4';
        else if (detectedMime.startsWith('audio/')) ext = 'mp3';
        else ext = 'png';
      }

      const uniqueName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const finalFilePath = path.join(uploadDir, uniqueName);

      const writeStream = fs.createWriteStream(finalFilePath);
      for (let i = 0; i < totalChunks; i++) {
        const currentChunkFile = path.join(tempChunkDir, `chunk_${String(i).padStart(5, '0')}.part`);
        if (fs.existsSync(currentChunkFile)) {
          const partBuffer = await fs.promises.readFile(currentChunkFile);
          writeStream.write(partBuffer);
        }
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.end((err?: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Cleanup temp chunks
      try {
        await fs.promises.rm(tempChunkDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }

      const mediaUrl = `/uploads/chat-media/${uniqueName}`;
      const stat = await fs.promises.stat(finalFilePath);

      return res.json({
        done: true,
        url: mediaUrl,
        filename: filename || uniqueName,
        mimeType: detectedMime,
        size: stat.size,
      });
    }

    return res.json({
      done: false,
      receivedChunk: chunkIndex,
      totalChunks,
      percent: Math.round(((chunkIndex + 1) / totalChunks) * 100),
    });
  } catch (err: any) {
    console.error('Chunked media upload error:', err);
    return res.status(500).json({ error: 'Failed to process media chunk upload.' });
  }
});

// ==========================================
// PHASE 07 — Real Social Graph & Relationships
// ==========================================

// Get authenticated user's friends
apiRouter.get('/friends', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const friends = db.getFriends(currentUserId);
  return res.json({ friends });
});

// Get specified user's public friends
apiRouter.get('/users/:id/friends', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const targetUser = db.findUserById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const callerUid = req.auth?.uid;
  if (callerUid && db.isBlockedBetween(callerUid, targetId)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const friends = db.getFriends(targetId);
  return res.json({ friends });
});

// Get authoritative relationship status between authenticated user and target user
apiRouter.get('/relationships/:targetUserId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const targetUserId = req.params.targetUserId;

  const targetUser = db.findUserById(targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  const relationship = db.getRelationshipStatus(currentUserId, targetUserId);
  const pendingReq = db.getPendingRequestBetween(currentUserId, targetUserId);

  return res.json({
    relationship,
    requestId: pendingReq?.id,
  });
});

// Get incoming and outgoing friend requests for authenticated user
apiRouter.get('/friend-requests', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const incoming = db.getIncomingFriendRequests(currentUserId);
  const outgoing = db.getOutgoingFriendRequests(currentUserId);
  return res.json({ incoming, outgoing });
});

// Send a friend request (strictly authoritative, caller is req.auth.uid)
apiRouter.post('/friend-requests', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const { targetUserId } = req.body;

  if (!targetUserId || typeof targetUserId !== 'string') {
    return res.status(400).json({ error: 'targetUserId is required.' });
  }

  if (targetUserId === currentUserId) {
    return res.status(400).json({ error: 'You cannot send a friend request to yourself.' });
  }

  const currentUser = db.findUserById(currentUserId);
  const targetUser = db.findUserById(targetUserId);
  if (!currentUser || !targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Check blocking
  if (db.isBlockedBetween(currentUserId, targetUserId)) {
    return res.status(403).json({ error: 'Action blocked by user privacy restrictions.' });
  }

  // Check if already friends
  if (currentUser.friends?.includes(targetUserId)) {
    return res.status(400).json({ error: 'You are already friends with this user.', relationship: 'friends' });
  }

  // Check if pending request exists
  const existingReq = db.getPendingRequestBetween(currentUserId, targetUserId);
  if (existingReq) {
    if (existingReq.senderId === currentUserId) {
      return res.status(400).json({ error: 'Friend request already sent.', relationship: 'outgoing_request' });
    } else {
      // The other user already sent a pending request to caller -> auto-accept!
      db.addFriendship(currentUserId, targetUserId);
      return res.json({
        success: true,
        message: 'Mutual request accepted. You are now friends!',
        relationship: 'friends',
      });
    }
  }

  // Create real FriendRequest
  const newRequest: FriendRequest = {
    id: `freq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    senderId: currentUser.id,
    senderName: currentUser.fullName,
    senderUsername: currentUser.username,
    senderAvatar: currentUser.avatarUrl,
    receiverId: targetUser.id,
    receiverName: targetUser.fullName,
    receiverUsername: targetUser.username,
    receiverAvatar: targetUser.avatarUrl,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.createFriendRequest(newRequest);

  // Create real Notification for recipient
  const notif: AppNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: targetUser.id,
    actorId: currentUser.id,
    actorName: currentUser.fullName,
    actorAvatar: currentUser.avatarUrl,
    actorUsername: currentUser.username,
    type: 'friend_request',
    title: 'New Friend Request',
    description: `${currentUser.fullName} (@${currentUser.username}) sent you a friend request`,
    timestamp: new Date().toISOString(),
    isRead: false,
    status: 'pending',
  };
  const createdNotif = db.createNotification(notif);
  broadcastToUser(targetUser.id, 'notification', createdNotif);
  broadcastToUser(targetUser.id, 'unread_count', {
    unreadCount: db.getUnreadNotificationCount(targetUser.id),
  });

  return res.status(201).json({
    success: true,
    request: newRequest,
    relationship: 'outgoing_request',
  });
});

// Accept a friend request (only intended recipient can accept)
apiRouter.post('/friend-requests/:id/accept', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const requestId = req.params.id;

  const request = db.findFriendRequestById(requestId);
  if (!request) {
    return res.status(404).json({ error: 'Friend request not found.' });
  }

  if (request.receiverId !== currentUserId) {
    return res.status(403).json({ error: 'Forbidden: You can only accept requests sent to you.' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request is already ${request.status}.` });
  }

  if (db.isBlockedBetween(request.senderId, request.receiverId)) {
    return res.status(403).json({ error: 'Cannot accept request from a blocked user.' });
  }

  db.addFriendship(request.senderId, request.receiverId);

  // Update receiver's notification if one existed
  const notifs = db.getNotificationsForUser(currentUserId);
  const matchingNotif = notifs.find((n) => n.type === 'friend_request' && n.actorId === request.senderId);
  if (matchingNotif) {
    db.updateNotification(matchingNotif.id, { status: 'accepted', isRead: true });
    broadcastToUser(currentUserId, 'unread_count', {
      unreadCount: db.getUnreadNotificationCount(currentUserId),
    });
  }

  // Authoritative acceptance notification for original sender
  const currentUser = db.findUserById(currentUserId);
  const senderNotif: AppNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: request.senderId,
    actorId: currentUserId,
    actorName: currentUser?.fullName || 'User',
    actorAvatar: currentUser?.avatarUrl,
    actorUsername: currentUser?.username,
    type: 'friend_request',
    title: 'Friend Request Accepted',
    description: `${currentUser?.fullName || 'User'} accepted your friend request`,
    timestamp: new Date().toISOString(),
    isRead: false,
    status: 'accepted',
  };
  const createdSenderNotif = db.createNotification(senderNotif);
  broadcastToUser(request.senderId, 'notification', createdSenderNotif);
  broadcastToUser(request.senderId, 'unread_count', {
    unreadCount: db.getUnreadNotificationCount(request.senderId),
  });

  return res.json({
    success: true,
    relationship: 'friends',
  });
});

// Reject a friend request (only intended recipient can reject)
apiRouter.post('/friend-requests/:id/reject', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const requestId = req.params.id;

  const request = db.findFriendRequestById(requestId);
  if (!request) {
    return res.status(404).json({ error: 'Friend request not found.' });
  }

  if (request.receiverId !== currentUserId) {
    return res.status(403).json({ error: 'Forbidden: You can only reject requests sent to you.' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request is already ${request.status}.` });
  }

  db.updateFriendRequest(request.id, { status: 'rejected' });

  // Update notification
  const notifs = db.getNotificationsForUser(currentUserId);
  const matchingNotif = notifs.find((n) => n.type === 'friend_request' && n.actorId === request.senderId);
  if (matchingNotif) {
    db.updateNotification(matchingNotif.id, { status: 'declined', isRead: true });
    broadcastToUser(currentUserId, 'unread_count', {
      unreadCount: db.getUnreadNotificationCount(currentUserId),
    });
  }

  return res.json({
    success: true,
    relationship: 'none',
  });
});

// Cancel an outgoing friend request (only original sender can cancel)
apiRouter.post('/friend-requests/:id/cancel', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const requestId = req.params.id;

  const request = db.findFriendRequestById(requestId);
  if (!request) {
    return res.status(404).json({ error: 'Friend request not found.' });
  }

  if (request.senderId !== currentUserId) {
    return res.status(403).json({ error: 'Forbidden: You can only cancel your own outgoing requests.' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request is already ${request.status}.` });
  }

  db.updateFriendRequest(request.id, { status: 'cancelled' });

  // Update receiver's notification if one existed
  const receiverNotifs = db.getNotificationsForUser(request.receiverId);
  const matchingNotif = receiverNotifs.find((n) => n.type === 'friend_request' && n.actorId === currentUserId);
  if (matchingNotif) {
    db.updateNotification(matchingNotif.id, { status: 'declined', isRead: true });
    broadcastToUser(request.receiverId, 'unread_count', {
      unreadCount: db.getUnreadNotificationCount(request.receiverId),
    });
  }

  return res.json({
    success: true,
    relationship: 'none',
  });
});

// Remove friend (either friend can terminate friendship)
apiRouter.post('/friends/:targetUserId/remove', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const targetUserId = req.params.targetUserId;

  if (targetUserId === currentUserId) {
    return res.status(400).json({ error: 'Invalid user action.' });
  }

  const currentUser = db.findUserById(currentUserId);
  if (!currentUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (!currentUser.friends?.includes(targetUserId)) {
    return res.status(400).json({ error: 'You are not friends with this user.' });
  }

  db.removeFriendship(currentUserId, targetUserId);

  return res.json({
    success: true,
    relationship: 'none',
  });
});

// Block user (authoritative, immediately severs friendships and cancels pending requests)
apiRouter.post('/users/:targetUserId/block', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const targetUserId = req.params.targetUserId;

  if (targetUserId === currentUserId) {
    return res.status(400).json({ error: 'You cannot block yourself.' });
  }

  const targetUser = db.findUserById(targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.blockUser(currentUserId, targetUserId);

  return res.json({
    success: true,
    relationship: 'blocked',
  });
});

// Unblock user (only the blocker can unblock)
apiRouter.post('/users/:targetUserId/unblock', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const targetUserId = req.params.targetUserId;

  if (targetUserId === currentUserId) {
    return res.status(400).json({ error: 'Invalid user action.' });
  }

  db.unblockUser(currentUserId, targetUserId);

  return res.json({
    success: true,
    relationship: 'none',
  });
});

// Get blocked users list for authenticated user
apiRouter.get('/blocked-users', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const blocked = db.getBlockedUsers(currentUserId);
  return res.json({ blockedUsers: blocked });
});

// Compatibility aliases for existing calls
apiRouter.post('/users/:id/friend-request', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = req.params.id;
  const currentUserId = req.auth?.uid || req.body.currentUserId;
  if (!currentUserId || targetUserId === currentUserId) {
    return res.status(400).json({ error: 'Invalid user action.' });
  }

  const currentUser = db.findUserById(currentUserId);
  const targetUser = db.findUserById(targetUserId);
  if (!currentUser || !targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (db.isBlockedBetween(currentUserId, targetUserId)) {
    return res.status(403).json({ error: 'Action blocked by user privacy restrictions.' });
  }

  if (currentUser.friends?.includes(targetUserId)) {
    return res.json({ message: 'Already friends', status: 'friends', relationship: 'friends' });
  }

  const existingReq = db.getPendingRequestBetween(currentUserId, targetUserId);
  if (existingReq) {
    if (existingReq.senderId === currentUserId) {
      return res.json({ success: true, message: 'Friend request already pending.', relationship: 'outgoing_request' });
    } else {
      db.addFriendship(currentUserId, targetUserId);
      return res.json({ success: true, message: 'Mutual request accepted.', relationship: 'friends' });
    }
  }

  const newRequest: FriendRequest = {
    id: `freq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    senderId: currentUser.id,
    senderName: currentUser.fullName,
    senderUsername: currentUser.username,
    senderAvatar: currentUser.avatarUrl,
    receiverId: targetUser.id,
    receiverName: targetUser.fullName,
    receiverUsername: targetUser.username,
    receiverAvatar: targetUser.avatarUrl,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.createFriendRequest(newRequest);

  const notif: AppNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: targetUser.id,
    actorId: currentUser.id,
    actorName: currentUser.fullName,
    actorAvatar: currentUser.avatarUrl,
    actorUsername: currentUser.username,
    type: 'friend_request',
    title: 'New Friend Request',
    description: `${currentUser.fullName} sent you a friend request`,
    timestamp: new Date().toISOString(),
    isRead: false,
    status: 'pending',
  };
  db.createNotification(notif);

  return res.json({ success: true, notification: notif, request: newRequest, relationship: 'outgoing_request' });
});

apiRouter.post('/users/:id/accept-friend', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const actorId = req.params.id; // person who sent the request
  const currentUserId = req.auth?.uid || req.body.currentUserId; // receiver
  const { notificationId } = req.body;

  if (!currentUserId || !actorId) {
    return res.status(400).json({ error: 'Invalid request data.' });
  }

  if (db.isBlockedBetween(currentUserId, actorId)) {
    return res.status(403).json({ error: 'Cannot accept request from a blocked user.' });
  }

  db.addFriendship(actorId, currentUserId);

  if (notificationId) {
    db.updateNotification(notificationId, { status: 'accepted', isRead: true });
    broadcastToUser(currentUserId, 'unread_count', {
      unreadCount: db.getUnreadNotificationCount(currentUserId),
    });
  }

  const currentUser = db.findUserById(currentUserId);
  const senderNotif: AppNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: actorId,
    actorId: currentUserId,
    actorName: currentUser?.fullName || 'User',
    actorAvatar: currentUser?.avatarUrl,
    actorUsername: currentUser?.username,
    type: 'friend_request',
    title: 'Friend Request Accepted',
    description: `${currentUser?.fullName || 'User'} accepted your friend request`,
    timestamp: new Date().toISOString(),
    isRead: false,
    status: 'accepted',
  };
  const createdSenderNotif = db.createNotification(senderNotif);
  broadcastToUser(actorId, 'notification', createdSenderNotif);
  broadcastToUser(actorId, 'unread_count', {
    unreadCount: db.getUnreadNotificationCount(actorId),
  });

  return res.json({ success: true, relationship: 'friends' });
});

apiRouter.post('/users/:id/remove-friend', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const friendId = req.params.id;
  const currentUserId = req.auth?.uid || req.body.currentUserId;

  if (!currentUserId || !friendId) {
    return res.status(400).json({ error: 'Invalid parameters.' });
  }

  db.removeFriendship(currentUserId, friendId);

  return res.json({ success: true, relationship: 'none' });
});

apiRouter.post('/users/:id/add-friend', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth?.uid || req.params.id;
  const { targetUserId } = req.body;

  if (!currentUserId || !targetUserId) {
    return res.status(400).json({ error: 'Invalid user parameters.' });
  }

  if (db.isBlockedBetween(currentUserId, targetUserId)) {
    return res.status(403).json({ error: 'Cannot add a blocked user.' });
  }

  db.addFriendship(currentUserId, targetUserId);

  return res.json({ success: true, relationship: 'friends' });
});

// Rooms
apiRouter.get('/rooms', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const { tab, q, userId, limit, offset } = req.query;
  const callerUid = req.auth?.uid || (typeof userId === 'string' && userId ? userId : undefined);
  let rooms = db.getRooms() || [];

  if (typeof q === 'string' && q.trim()) {
    const term = q.toLowerCase().trim();
    rooms = rooms.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(term) ||
        (r.description || '').toLowerCase().includes(term) ||
        (r.tags || []).some((t) => (t || '').toLowerCase().includes(term)),
    );
  }

  if (tab === 'active') {
    rooms = rooms.filter((r) => r.isActive !== false);
  } else if (tab === 'mine') {
    if (!callerUid) {
      return res.json({ rooms: [] });
    }
    rooms = rooms.filter((r) => r.hostId === callerUid || (r.memberIds || []).includes(callerUid));
    return res.json({ rooms });
  } else if (typeof userId === 'string' && userId) {
    rooms = rooms.filter((r) => r.hostId === userId || (r.memberIds || []).includes(userId));
  }

  // Privacy Rule: Private rooms are excluded from public discovery unless caller is host or member
  rooms = rooms.filter((r) => {
    if (r.type === 'public') return true;
    if (callerUid && (r.hostId === callerUid || (r.memberIds || []).includes(callerUid))) {
      return true;
    }
    return false;
  });

  const total = rooms.length;
  const off = offset ? Math.max(Number(offset) || 0, 0) : 0;
  if (limit) {
    const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
    rooms = rooms.slice(off, off + lim);
  } else if (off > 0) {
    rooms = rooms.slice(off);
  }

  return res.json({ rooms, total });
});

apiRouter.get('/rooms/:id', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found or no longer active.' });
  }

  // Enforce room privacy: private rooms require membership or host identity to inspect details
  if (room.type === 'private') {
    const callerUid = req.auth?.uid;
    const isMemberOrHost =
      callerUid &&
      (room.hostId === callerUid ||
        room.memberIds.includes(callerUid) ||
        (room.adminIds || []).includes(callerUid));

    if (!isMemberOrHost) {
      return res.status(403).json({
        error: 'This room is private. You must join with a valid room code or receive an invite.',
        isPrivateRoom: true,
        roomId: room.id,
      });
    }
  }

  return res.json({ room });
});

apiRouter.post('/rooms', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  let host = db.findUserById(callerUid);
  if (!host) {
    // If user profile record has not yet been registered in DB, bootstrap authoritative host profile
    host = db.createUser({
      id: callerUid,
      fullName: req.auth!.email?.split('@')[0] || 'Hangout Host',
      username: `user_${callerUid.slice(0, 6).toLowerCase()}`,
      email: req.auth!.email || '',
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${callerUid}`,
      coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop',
      bio: 'Hey there! I am hanging out on Social Hangout.',
      createdAt: new Date().toISOString(),
      isOnline: true,
      lastSeen: new Date().toISOString(),
      friends: [],
      followersCount: 0,
      blockedUsers: [],
      savedMessageIds: [],
    });
  }

  const {
    name,
    description,
    bannerUrl,
    type,
    maxMembers,
    allowJoinRequests,
    tags,
    language,
    upcomingSessionTime,
    scheduledAt,
    isScheduled,
  } = req.body;

  // Strict Validation and Input Bounding
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Room name is required and cannot be empty.' });
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 60) {
    return res.status(400).json({ error: 'Room name must be between 2 and 60 characters.' });
  }

  const trimmedDesc = typeof description === 'string' ? description.trim().slice(0, 500) : '';
  const roomType: 'public' | 'private' = type === 'private' ? 'private' : 'public';

  const parsedMax = Number(maxMembers);
  const boundedMaxMembers = Math.min(Math.max(Number.isFinite(parsedMax) ? parsedMax : 20, 2), 100);

  // Validate and bound tags
  const sanitizedTags = Array.isArray(tags)
    ? tags
        .map((t) => (typeof t === 'string' ? t.trim().slice(0, 30) : ''))
        .filter(Boolean)
        .slice(0, 8)
    : ['General', 'Hangout'];

  const sanitizedLanguage = typeof language === 'string' ? language.trim().slice(0, 40) : 'English';
  const sanitizedBanner =
    typeof bannerUrl === 'string' && bannerUrl.trim().startsWith('http')
      ? bannerUrl.trim().slice(0, 1000)
      : 'https://images.unsplash.com/photo-1574267432553-4b4628081c31?q=80&w=1000&auto=format&fit=crop';

  // Generate unique collision-resistant room code
  let code = '';
  let attempts = 0;
  while (!code || attempts < 10) {
    attempts++;
    const candidate = `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!db.findRoomByCode(candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    code = `ROOM-${Date.now().toString().slice(-4)}`;
  }

  const newRoom: Room = {
    id: `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    code,
    name: trimmedName,
    description: trimmedDesc,
    bannerUrl: sanitizedBanner,
    type: roomType,
    hostId: host.id,
    hostName: host.fullName,
    hostUsername: host.username,
    hostAvatar: host.avatarUrl,
    maxMembers: boundedMaxMembers,
    allowJoinRequests: allowJoinRequests !== false,
    memberIds: [host.id],
    adminIds: [host.id],
    tags: sanitizedTags.length > 0 ? sanitizedTags : ['Hangout'],
    language: sanitizedLanguage,
    upcomingSessionTime: upcomingSessionTime ?? (isScheduled ? 'Scheduled Soon' : 'Live Now'),
    scheduledAt: scheduledAt || null,
    isScheduled: Boolean(isScheduled),
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  const created = db.createRoom(newRoom);
  return res.status(201).json({ room: created });
});

apiRouter.get('/rooms/by-code/:code', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const code = (req.params.code || '').trim().toUpperCase();
  if (!code || code.length > 20) {
    return res.status(400).json({ error: 'Invalid room code format.' });
  }

  const room = db.findRoomByCode(code);
  if (!room) {
    return res.status(404).json({ error: 'No room found with this code.' });
  }

  return res.json({ room });
});

apiRouter.post('/rooms/join-by-code', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { code } = req.body;
  const callerUid = req.auth!.uid;

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'Room code is required.' });
  }

  const room = db.findRoomByCode(code.trim().toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'No room found with this code.' });
  }

  if ((room.bannedUserIds || []).includes(callerUid)) {
    return res.status(403).json({ error: 'You are banned from this room by the host.' });
  }

  if (!room.memberIds.includes(callerUid) && room.memberIds.length >= room.maxMembers) {
    return res.status(400).json({ error: 'Room has reached its maximum member limit.' });
  }

  if (!room.memberIds.includes(callerUid)) {
    const updated = db.updateRoom(room.id, {
      memberIds: [...room.memberIds, callerUid],
    });
    return res.json({ room: updated });
  }

  return res.json({ room });
});

apiRouter.post('/rooms/:id/join', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  if ((room.bannedUserIds || []).includes(callerUid)) {
    return res.status(403).json({ error: 'You are banned from this room by the host.' });
  }

  // Private room access rule: Cannot join private rooms directly without room code or valid invite
  const hasInvite = db
    .getNotificationsForUser(callerUid)
    .some((n) => n.type === 'invite' && n.targetRoomId === room.id && n.status !== 'declined');

  if (room.type === 'private' && !room.memberIds.includes(callerUid) && room.hostId !== callerUid && !hasInvite) {
    return res.status(403).json({
      error: 'This room is private. You must join with a valid room code or receive an invite.',
      requiresCode: true,
    });
  }

  if (!room.memberIds.includes(callerUid) && room.memberIds.length >= room.maxMembers) {
    return res.status(400).json({ error: 'Room is at full capacity.' });
  }

  if (!room.memberIds.includes(callerUid)) {
    const updated = db.updateRoom(room.id, {
      memberIds: [...room.memberIds, callerUid],
    });

    if (hasInvite) {
      const inviteNotif = db
        .getNotificationsForUser(callerUid)
        .find((n) => n.type === 'invite' && n.targetRoomId === room.id);
      if (inviteNotif) {
        db.updateNotification(inviteNotif.id, { isRead: true, status: 'accepted' });
        broadcastToUser(callerUid, 'unread_count', {
          unreadCount: db.getUnreadNotificationCount(callerUid),
        });
      }
    }

    return res.json({ room: updated });
  }

  return res.json({ room });
});

// Room Invitation endpoint (Protected & Authoritative)
apiRouter.post('/rooms/:id/invite', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const roomId = req.params.id;
  const { targetUserId } = req.body;

  if (!targetUserId || typeof targetUserId !== 'string') {
    return res.status(400).json({ error: 'targetUserId is required.' });
  }

  if (targetUserId === callerUid) {
    return res.status(400).json({ error: 'Cannot invite yourself to a room.' });
  }

  const room = db.findRoomById(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // Caller must be room host or legitimate member
  const isMemberOrHost = room.hostId === callerUid || (room.memberIds || []).includes(callerUid);
  if (!isMemberOrHost) {
    return res.status(403).json({ error: 'Forbidden: You must be a member or host of the room to invite others.' });
  }

  const targetUser = db.findUserById(targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  // Blocking check
  if (db.isBlockedBetween(callerUid, targetUserId)) {
    return res.status(403).json({ error: 'Cannot invite a blocked user.' });
  }

  // Banned check
  if ((room.bannedUserIds || []).includes(targetUserId)) {
    return res.status(400).json({ error: 'Cannot invite a user who is banned from this room.' });
  }

  // Already in room check
  if (room.hostId === targetUserId || (room.memberIds || []).includes(targetUserId)) {
    return res.status(400).json({ error: 'User is already in this room.' });
  }

  // Recipient settings check
  const targetSettings = db.getUserSettings(targetUserId);
  if (targetSettings.roomInvites === false) {
    return res.status(403).json({ error: 'This user has disabled room invitations.' });
  }

  const caller = db.findUserById(callerUid);
  const inviteNotif: AppNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: targetUserId,
    actorId: callerUid,
    actorName: caller?.fullName || 'User',
    actorAvatar: caller?.avatarUrl,
    actorUsername: caller?.username,
    type: 'invite',
    title: 'Room Invitation',
    description: `${caller?.fullName || 'A friend'} invited you to join "${room.name}"`,
    targetRoomId: room.id,
    targetRoomName: room.name,
    timestamp: new Date().toISOString(),
    isRead: false,
    status: 'pending',
  };

  const createdNotif = db.createNotification(inviteNotif);
  broadcastToUser(targetUserId, 'notification', createdNotif);
  broadcastToUser(targetUserId, 'unread_count', {
    unreadCount: db.getUnreadNotificationCount(targetUserId),
  });

  return res.status(201).json({ success: true, notification: createdNotif });
});

apiRouter.post('/rooms/:id/leave', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // If the host leaves
  if (callerUid === room.hostId) {
    const remainingMembers = (room.memberIds || []).filter((id) => id !== callerUid);
    if (remainingMembers.length === 0) {
      // Last person leaving is the host -> disband and delete room cleanly
      broadcastToRoom(room.id, 'disband', { message: 'Room was closed as the host left.' });
      db.deleteRoom(room.id);
      roomTypingMap.delete(room.id);
      return res.json({ room: null, message: 'Room closed as host left.' });
    }

    // Transfer host role to next admin or first remaining member
    const nextHostId = (room.adminIds || []).find((id) => id !== callerUid) || remainingMembers[0];
    const nextHostUser = db.findUserById(nextHostId);
    const nextAdminIds = (room.adminIds || []).filter((id) => id !== callerUid);
    if (!nextAdminIds.includes(nextHostId)) {
      nextAdminIds.push(nextHostId);
    }
    const nextAllowedMedia = (room.allowedMediaUserIds || []).filter((id) => id !== callerUid);
    if (!nextAllowedMedia.includes(nextHostId)) {
      nextAllowedMedia.push(nextHostId);
    }

    const updated = db.updateRoom(room.id, {
      hostId: nextHostId,
      hostName: nextHostUser?.fullName || nextHostUser?.username || 'Host',
      hostAvatar: nextHostUser?.avatarUrl || '',
      memberIds: remainingMembers,
      adminIds: nextAdminIds,
      allowedMediaUserIds: nextAllowedMedia,
    });

    broadcastToRoom(room.id, 'room_update', { room: updated });
    return res.json({ room: updated, message: 'Successfully left room and transferred host ownership.' });
  }

  const updated = db.updateRoom(room.id, {
    memberIds: room.memberIds.filter((id) => id !== callerUid),
    adminIds: (room.adminIds || []).filter((id) => id !== callerUid),
    allowedMediaUserIds: (room.allowedMediaUserIds || []).filter((id) => id !== callerUid),
  });

  broadcastToRoom(room.id, 'room_update', { room: updated });
  return res.json({ room: updated, message: 'Successfully left room.' });
});

apiRouter.post('/rooms/:id/media', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const { currentMedia } = req.body;
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  const isHost = callerUid === room.hostId;
  const isAdmin = (room.adminIds || []).includes(callerUid);
  const hasMediaPerm = (room.allowedMediaUserIds || []).includes(callerUid);

  if (!isHost && !isAdmin && !hasMediaPerm) {
    return res.status(403).json({ error: 'Action not allowed: You do not have permission to control stage media in this room.' });
  }

  // Banned user cannot set media
  if ((room.bannedUserIds || []).includes(callerUid)) {
    return res.status(403).json({ error: 'Forbidden: You have been banned from this room.' });
  }

  const callerUser = db.findUserById(callerUid);
  const now = Date.now();
  let nextSync: MediaSyncState | null = null;

  if (currentMedia) {
    // Validate media type and url
    const validTypes = ['youtube', 'video', 'audio', 'image'];
    const mediaType = validTypes.includes(currentMedia.type) ? currentMedia.type : 'video';
    const mediaUrl = typeof currentMedia.url === 'string' ? currentMedia.url.trim() : '';
    if (!mediaUrl) {
      return res.status(400).json({ error: 'Invalid media resource: missing media URL.' });
    }

    const sanitizedMedia: CurrentMedia = {
      type: mediaType as any,
      url: mediaUrl,
      title: typeof currentMedia.title === 'string' ? currentMedia.title.trim().slice(0, 150) : 'Stage Media',
      youtubeId: typeof currentMedia.youtubeId === 'string' ? currentMedia.youtubeId : undefined,
      startedAt: now,
      addedBy: callerUid,
      addedByName: callerUser?.fullName || room.hostName || 'Host',
    };

    nextSync = {
      roomId: room.id,
      media: sanitizedMedia,
      isPlaying: true,
      position: 0,
      updatedAt: now,
      revision: (room.mediaSync?.revision || 0) + 1,
      controllerId: callerUid,
      controllerName: callerUser?.fullName || room.hostName || 'Host',
      action: 'change_media',
    };

    const updated = db.updateRoom(room.id, {
      currentMedia: sanitizedMedia,
      mediaSync: nextSync,
    });

    broadcastToRoom(room.id, 'room_update', { room: updated });
    broadcastToRoom(room.id, 'media_sync', { mediaSync: nextSync, serverTime: now });
    return res.json({ room: updated, mediaSync: nextSync, serverTime: now });
  } else {
    // Stopped media
    const updated = db.updateRoom(room.id, {
      currentMedia: null,
      mediaSync: null,
    });

    broadcastToRoom(room.id, 'room_update', { room: updated });
    broadcastToRoom(room.id, 'media_sync', { mediaSync: null, serverTime: now });
    return res.json({ room: updated, mediaSync: null, serverTime: now });
  }
});

// Authoritative media synchronization endpoint for Watch Party (Phase 13)
apiRouter.post('/rooms/:id/media/sync', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const roomId = req.params.id;
  const room = db.findRoomById(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // Authorization check: must be host, admin, or allowedMediaUser
  const isHost = callerUid === room.hostId;
  const isAdmin = (room.adminIds || []).includes(callerUid);
  const hasMediaPerm = (room.allowedMediaUserIds || []).includes(callerUid);

  if (!isHost && !isAdmin && !hasMediaPerm) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to control shared playback in this room.' });
  }

  // Ban check
  if ((room.bannedUserIds || []).includes(callerUid)) {
    return res.status(403).json({ error: 'Forbidden: You have been banned from this room.' });
  }

  if (!room.currentMedia) {
    return res.status(400).json({ error: 'No active media playing on stage to synchronize.' });
  }

  const { action, position, duration, revision } = req.body;
  if (!['play', 'pause', 'seek', 'sync'].includes(action)) {
    return res.status(400).json({ error: 'Invalid sync action. Must be play, pause, seek, or sync.' });
  }

  const numPosition = typeof position === 'number' && isFinite(position) && position >= 0 ? position : 0;
  const numDuration = typeof duration === 'number' && isFinite(duration) && duration > 0 ? duration : room.mediaSync?.duration;
  const boundedPosition = numDuration ? Math.min(numDuration + 1, numPosition) : numPosition;

  const now = Date.now();
  const currentRevision = room.mediaSync?.revision || 0;
  // Monotonic revision sequence handles race conditions between concurrent controllers
  const nextRevision = currentRevision + 1;

  const callerUser = db.findUserById(callerUid);
  const isPlaying = action === 'play'
    ? true
    : action === 'pause'
      ? false
      : (room.mediaSync?.isPlaying ?? true);

  const updatedSync: MediaSyncState = {
    roomId: room.id,
    media: room.currentMedia,
    isPlaying,
    position: boundedPosition,
    updatedAt: now,
    revision: nextRevision,
    controllerId: callerUid,
    controllerName: callerUser?.fullName || (isHost ? room.hostName : 'Controller'),
    action: action as any,
    duration: numDuration,
  };

  const updatedRoom = db.updateRoom(room.id, {
    mediaSync: updatedSync,
  });

  // Realtime SSE broadcast to all connected room members
  broadcastToRoom(room.id, 'media_sync', {
    mediaSync: updatedSync,
    serverTime: now,
  });

  return res.json({
    success: true,
    mediaSync: updatedSync,
    serverTime: now,
  });
});

// Query authoritative current media sync state
apiRouter.get('/rooms/:id/media/sync', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const roomId = req.params.id;
  const room = db.findRoomById(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // Authorization: Caller must be room host or legitimate room member
  const isMemberOrHost = room.hostId === callerUid || (room.memberIds || []).includes(callerUid);
  if (!isMemberOrHost && room.type === 'private') {
    return res.status(403).json({ error: 'Forbidden: You are not a member of this private room.' });
  }

  if ((room.bannedUserIds || []).includes(callerUid)) {
    return res.status(403).json({ error: 'Forbidden: You have been banned from this room.' });
  }

  const now = Date.now();
  return res.json({
    mediaSync: room.mediaSync || null,
    currentMedia: room.currentMedia || null,
    serverTime: now,
  });
});

// Live YouTube Search & Metadata Endpoint (YouTube Data API v3 + oEmbed)
apiRouter.get('/media/youtube/search', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) {
    return res.json({ videos: [] });
  }

  // Check if query is a direct video ID (11 chars) or direct YouTube URL (handled without API key via oEmbed)
  const ytIdMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  const directId = ytIdMatch ? ytIdMatch[1] : (/^[\w-]{11}$/.test(query) ? query : null);

  try {
    if (directId) {
      // Fetch direct metadata via YouTube oEmbed API
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${directId}&format=json`);
      if (oembedRes.ok) {
        const oembedData: any = await oembedRes.json();
        return res.json({
          videos: [
            {
              id: directId,
              title: oembedData.title || `YouTube Video (${directId})`,
              channel: oembedData.author_name || 'YouTube',
              duration: 'HD',
              category: 'Video',
              thumbnail: `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
            },
          ],
        });
      }
    }

    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (!youtubeApiKey) {
      return res.status(503).json({
        error: 'YouTube search requires a YOUTUBE_API_KEY configured in environment variables. You can still paste any direct YouTube video URL to play it in the room.',
        code: 'YOUTUBE_API_KEY_REQUIRED',
        videos: [],
      });
    }

    const maxResults = Math.min(Math.max(parseInt(String(req.query.limit || '25'), 10) || 25, 1), 50);
    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken ? `&pageToken=${encodeURIComponent(req.query.pageToken)}` : '';

    const ytApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(
      query
    )}${pageToken}&key=${youtubeApiKey}`;
    const ytRes = await fetch(ytApiUrl);
    if (!ytRes.ok) {
      const errText = await ytRes.text();
      console.warn('YouTube Data API search error:', errText);
      return res.status(ytRes.status).json({
        error: 'YouTube Data API query failed. Please verify your YOUTUBE_API_KEY quota and credentials.',
        code: 'YOUTUBE_API_ERROR',
        videos: [],
      });
    }

    const ytData: any = await ytRes.json();
    const items = Array.isArray(ytData.items) ? ytData.items : [];
    const videos = items.map((item: any) => ({
      id: item.id?.videoId || '',
      title: item.snippet?.title || 'YouTube Video',
      channel: item.snippet?.channelTitle || 'Channel',
      duration: 'HD',
      category: 'Video',
      thumbnail:
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        `https://img.youtube.com/vi/${item.id?.videoId}/hqdefault.jpg`,
    }));

    return res.json({
      videos,
      nextPageToken: ytData.nextPageToken || null,
      prevPageToken: ytData.prevPageToken || null,
      totalResults: ytData.pageInfo?.totalResults || videos.length,
    });
  } catch (err: any) {
    console.error('YouTube search error:', err?.message);
    return res.status(500).json({ error: 'Failed to perform YouTube video search.' });
  }
});

apiRouter.post('/rooms/:id/disband', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  if (callerUid !== room.hostId) {
    return res.status(403).json({ error: 'Action not allowed: Only the room host can disband this room.' });
  }

  broadcastToRoom(room.id, 'disband', { message: 'Room was disbanded by the host.' });
  db.deleteRoom(room.id);
  roomTypingMap.delete(room.id);

  return res.json({ success: true, message: 'Room disbanded successfully.' });
});

apiRouter.get('/rooms/:id/members', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // If private room, require membership or host to inspect members list
  if (room.type === 'private') {
    const callerUid = req.auth?.uid;
    const isMemberOrHost =
      callerUid &&
      (room.hostId === callerUid ||
        room.memberIds.includes(callerUid) ||
        (room.adminIds || []).includes(callerUid));
    if (!isMemberOrHost) {
      return res.status(403).json({ error: 'Private room members can only be viewed by members.' });
    }
  }

  const members = room.memberIds
    .map((id) => db.findUserById(id))
    .filter((u): u is User => !!u)
    .map((user) => ({
      ...user,
      isHost: user.id === room.hostId,
      isAdmin: (room.adminIds || []).includes(user.id),
      isMuted: (room.mutedUserIds || []).includes(user.id),
      canAddMedia:
        user.id === room.hostId ||
        (room.adminIds || []).includes(user.id) ||
        (room.allowedMediaUserIds || []).includes(user.id),
    }));

  return res.json({ members });
});

apiRouter.get('/rooms/:id/banned', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  const isHost = callerUid === room.hostId;
  const isAdmin = (room.adminIds || []).includes(callerUid);

  if (!isHost && !isAdmin) {
    return res.status(403).json({ error: 'Only the host or co-hosts can view the banned users list.' });
  }

  const bannedUsers = (room.bannedUserIds || [])
    .map((id) => db.findUserById(id))
    .filter((u): u is User => !!u);

  return res.json({ bannedUsers });
});

apiRouter.post('/rooms/:id/kick', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const { userId } = req.body;
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  const isHost = callerUid === room.hostId;
  const isAdmin = (room.adminIds || []).includes(callerUid);

  if (!isHost && !isAdmin) {
    return res.status(403).json({ error: 'Only the host or co-hosts can remove members.' });
  }

  if (userId === room.hostId) {
    return res.status(400).json({ error: 'The room host cannot be removed.' });
  }

  // Admin cannot kick another admin or the host
  const targetIsAdmin = (room.adminIds || []).includes(userId);
  if (!isHost && targetIsAdmin) {
    return res.status(403).json({ error: 'Co-hosts cannot remove other co-hosts. Only the room host can.' });
  }

  const updated = db.updateRoom(room.id, {
    memberIds: room.memberIds.filter((id) => id !== userId),
    adminIds: (room.adminIds || []).filter((id) => id !== userId),
    allowedMediaUserIds: (room.allowedMediaUserIds || []).filter((id) => id !== userId),
  });

  broadcastToRoom(room.id, 'room_update', { room: updated, kickedUserId: userId });
  return res.json({ room: updated, message: 'Member was removed from the room.' });
});

apiRouter.post('/rooms/:id/ban', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const { userId, reason } = req.body;
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  const isHost = callerUid === room.hostId;
  const isAdmin = (room.adminIds || []).includes(callerUid);

  if (!isHost && !isAdmin) {
    return res.status(403).json({ error: 'Only the host or co-hosts can ban members.' });
  }

  if (userId === room.hostId) {
    return res.status(400).json({ error: 'The room host cannot be banned.' });
  }

  const targetIsAdmin = (room.adminIds || []).includes(userId);
  if (!isHost && targetIsAdmin) {
    return res.status(403).json({ error: 'Co-hosts cannot ban other co-hosts. Only the room host can.' });
  }

  const currentBanned = room.bannedUserIds || [];
  const nextBanned = currentBanned.includes(userId) ? currentBanned : [...currentBanned, userId];

  const updated = db.updateRoom(room.id, {
    memberIds: room.memberIds.filter((id) => id !== userId),
    adminIds: (room.adminIds || []).filter((id) => id !== userId),
    allowedMediaUserIds: (room.allowedMediaUserIds || []).filter((id) => id !== userId),
    bannedUserIds: nextBanned,
  });

  broadcastToRoom(room.id, 'room_update', { room: updated, bannedUserId: userId });

  const boundedReason = typeof reason === 'string' ? reason.trim().slice(0, 200) : '';

  // Authoritative system notification to the banned user
  const targetUser = db.findUserById(userId);
  if (targetUser) {
    db.createNotification({
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: targetUser.id,
      actorId: callerUid,
      actorName: isHost ? room.hostName : 'Room Admin',
      actorAvatar: isHost ? room.hostAvatar : '',
      actorUsername: isHost ? room.hostUsername : 'admin',
      type: 'system',
      title: 'Banned from Room',
      description: `You were banned from room "${room.name}"${boundedReason ? `: ${boundedReason}` : '.'}`,
      timestamp: new Date().toISOString(),
      isRead: false,
    });
  }

  return res.json({ room: updated, message: 'Member was banned from the room.' });
});

apiRouter.post('/rooms/:id/unban', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const { userId } = req.body;
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  const isHost = callerUid === room.hostId;
  const isAdmin = (room.adminIds || []).includes(callerUid);

  if (!isHost && !isAdmin) {
    return res.status(403).json({ error: 'Only the host or co-hosts can unban users.' });
  }

  const currentBanned = room.bannedUserIds || [];
  const updated = db.updateRoom(room.id, {
    bannedUserIds: currentBanned.filter((id) => id !== userId),
  });

  broadcastToRoom(room.id, 'room_update', { room: updated, unbannedUserId: userId });
  return res.json({ room: updated, message: 'User was unbanned from the room.' });
});

apiRouter.post('/rooms/:id/permissions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const { userId, role, isMuted, canAddMedia } = req.body;
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  const isHost = callerUid === room.hostId;
  const isAdmin = (room.adminIds || []).includes(callerUid);

  if (!isHost && !isAdmin) {
    return res.status(403).json({ error: 'Action not allowed: Insufficient permissions.' });
  }

  let adminIds = room.adminIds || [];
  let mutedUserIds = room.mutedUserIds || [];
  let allowedMediaUserIds = room.allowedMediaUserIds || [];

  // Role modification: strictly only the Room Host can promote or demote co-hosts
  if (role !== undefined) {
    if (!isHost) {
      return res.status(403).json({ error: 'Only the room host can promote or demote co-hosts.' });
    }
    if (userId === room.hostId) {
      return res.status(400).json({ error: 'Host permissions cannot be altered.' });
    }
    if (role === 'admin') {
      if (!adminIds.includes(userId)) {
        adminIds = [...adminIds, userId];
      }
    } else if (role === 'member') {
      adminIds = adminIds.filter((id) => id !== userId);
    }
  }

  // Media permission: allow or revoke permission to add/play media
  if (canAddMedia !== undefined) {
    if (userId === room.hostId) {
      return res.status(400).json({ error: 'Host already has full media permissions.' });
    }
    if (canAddMedia === true) {
      if (!allowedMediaUserIds.includes(userId)) {
        allowedMediaUserIds = [...allowedMediaUserIds, userId];
      }
    } else {
      allowedMediaUserIds = allowedMediaUserIds.filter((id) => id !== userId);
    }
  }

  // Mute / Unmute modification: host or admin can toggle mute (cannot mute host)
  if (isMuted !== undefined) {
    if (userId === room.hostId) {
      return res.status(400).json({ error: 'The room host cannot be muted.' });
    }
    if (!isHost && (room.adminIds || []).includes(userId)) {
      return res.status(403).json({ error: 'Co-hosts cannot mute other co-hosts.' });
    }
    if (isMuted === true) {
      if (!mutedUserIds.includes(userId)) {
        mutedUserIds = [...mutedUserIds, userId];
      }
    } else {
      mutedUserIds = mutedUserIds.filter((id) => id !== userId);
    }
  }

  const updated = db.updateRoom(room.id, {
    adminIds,
    mutedUserIds,
    allowedMediaUserIds,
  });

  broadcastToRoom(room.id, 'room_update', { room: updated });
  return res.json({ room: updated, message: 'Room permissions updated.' });
});

// Realtime SSE Chat Stream for Room Members
apiRouter.get('/rooms/:id/stream', async (req: Request, res: Response) => {
  let token = req.query.token as string | undefined;
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
  }

  const authUser = await verifyFirebaseIdToken(token);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized: Invalid authentication credentials.' });
  }

  const roomId = req.params.id;
  const room = db.findRoomById(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // Authorization: Caller must be room host or legitimate room member
  const isMemberOrHost = room.hostId === authUser.uid || (room.memberIds || []).includes(authUser.uid);
  if (!isMemberOrHost) {
    return res.status(403).json({ error: 'Forbidden: You must be a member of this room to connect to its realtime chat.' });
  }

  // Ban check
  if ((room.bannedUserIds || []).includes(authUser.uid)) {
    return res.status(403).json({ error: 'Forbidden: You have been banned from this room.' });
  }

  // Configure Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = `sse_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const client: SSEClient = {
    id: clientId,
    userId: authUser.uid,
    res,
  };

  if (!roomSSEConnections.has(roomId)) {
    roomSSEConnections.set(roomId, new Set());
  }
  roomSSEConnections.get(roomId)!.add(client);

  // Send initial handshake
  res.write(`event: connected\ndata: ${JSON.stringify({
    status: 'connected',
    roomId,
    userId: authUser.uid,
    timestamp: new Date().toISOString(),
  })}\n\n`);

  // Send current active typing state immediately
  const currentTyping = getActiveTyping(roomTypingMap, roomId);
  res.write(`event: typing\ndata: ${JSON.stringify({ typingUsers: currentTyping })}\n\n`);

  // Send current active stage media sync state immediately upon connection for Join-In-Progress and Reconnect
  if (room.mediaSync) {
    res.write(`event: media_sync\ndata: ${JSON.stringify({
      mediaSync: room.mediaSync,
      serverTime: Date.now(),
    })}\n\n`);
  }

  // Heartbeat ping every 25s to keep socket alive and prevent proxy drop
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      roomSSEConnections.get(roomId)?.delete(client);
    }
  }, 25000);

  // Handle client disconnection / tab close / unmount
  req.on('close', () => {
    clearInterval(heartbeat);
    const clients = roomSSEConnections.get(roomId);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) {
        roomSSEConnections.delete(roomId);
      }
    }

    // Clean up typing status if user had one active
    const user = db.findUserById(authUser.uid);
    if (user) {
      setTypingState(roomTypingMap, roomId, user, false);
      broadcastToRoom(roomId, 'typing', {
        typingUsers: getActiveTyping(roomTypingMap, roomId),
      });
    }
  });
});

apiRouter.get('/rooms/:id/messages', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // Authorization: if private room, enforce membership
  if (room.type === 'private') {
    const callerUid = req.auth?.uid;
    if (!callerUid) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
    }
    const isMemberOrHost = room.hostId === callerUid || (room.memberIds || []).includes(callerUid);
    if (!isMemberOrHost) {
      return res.status(403).json({ error: 'Forbidden: You must be a member of this room to view messages.' });
    }
  }

  // Check ban
  if (req.auth?.uid && (room.bannedUserIds || []).includes(req.auth.uid)) {
    return res.status(403).json({ error: 'Forbidden: You are banned from this room.' });
  }

  const limitParam = Number(req.query.limit);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

  const allMessages = db.getRoomMessages(req.params.id);
  const boundedMessages = allMessages.slice(-limit);

  return res.json({ messages: boundedMessages, total: allMessages.length });
});

apiRouter.post('/rooms/:id/messages', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // Authoritative room authorization: Caller must be room host or member
  const isMemberOrHost = room.hostId === callerUid || (room.memberIds || []).includes(callerUid);
  if (!isMemberOrHost) {
    return res.status(403).json({ error: 'Forbidden: You must be a member of this room to send messages.' });
  }

  // Ban check
  if ((room.bannedUserIds || []).includes(callerUid)) {
    return res.status(403).json({ error: 'Forbidden: You have been banned from this room.' });
  }

  // Mute check
  if ((room.mutedUserIds || []).includes(callerUid)) {
    return res.status(403).json({ error: 'You are muted by the host and cannot send messages.' });
  }

  // Sender identity strictly authoritatively derived from authenticated token
  let sender = db.findUserById(callerUid);
  if (!sender) {
    sender = db.createUser({
      id: callerUid,
      fullName: req.auth!.email?.split('@')[0] || 'Member',
      username: `user_${callerUid.slice(0, 6).toLowerCase()}`,
      email: req.auth!.email || '',
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${callerUid}`,
      coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop',
      bio: 'Hey there! I am hanging out on Social Hangout.',
      createdAt: new Date().toISOString(),
      isOnline: true,
      lastSeen: new Date().toISOString(),
      friends: [],
      followersCount: 0,
      blockedUsers: [],
      savedMessageIds: [],
    });
  }

  const { content, sticker, attachmentUrl, mediaType, mediaTitle } = req.body;

  const trimmedContent = typeof content === 'string' ? content.trim() : '';
  const trimmedSticker = typeof sticker === 'string' && sticker.trim().length > 0
    ? sticker.trim().slice(0, 20)
    : undefined;
  const trimmedAttachment = typeof attachmentUrl === 'string' &&
    (attachmentUrl.trim().startsWith('http://') ||
     attachmentUrl.trim().startsWith('https://') ||
     attachmentUrl.trim().startsWith('data:image/') ||
     attachmentUrl.trim().startsWith('data:video/') ||
     attachmentUrl.trim().startsWith('data:audio/'))
    ? attachmentUrl.trim()
    : undefined;

  if (!trimmedContent && !trimmedSticker && !trimmedAttachment) {
    return res.status(400).json({ error: 'Message content cannot be empty.' });
  }

  if (trimmedContent.length > 2000) {
    return res.status(400).json({ error: 'Message is too long (maximum 2000 characters).' });
  }

  const validMediaTypes = ['youtube', 'image', 'video', 'audio', 'link'];
  const sanitizedMediaType = typeof mediaType === 'string' && validMediaTypes.includes(mediaType)
    ? (mediaType as any)
    : undefined;

  const newMessage: RoomMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    roomId: room.id,
    senderId: sender.id, // Strictly derived from req.auth.uid
    senderName: sender.fullName,
    senderUsername: sender.username,
    senderAvatar: sender.avatarUrl,
    content: trimmedContent,
    sticker: trimmedSticker,
    attachmentUrl: trimmedAttachment,
    mediaType: sanitizedMediaType,
    mediaTitle: typeof mediaTitle === 'string' ? mediaTitle.trim().slice(0, 100) : undefined,
    timestamp: new Date().toISOString(),
  };

  const created = db.createRoomMessage(newMessage);

  // Clear typing status on message send
  setTypingState(roomTypingMap, room.id, sender, false);

  // REALTIME BROADCAST to all connected room members
  broadcastToRoom(room.id, 'message', created);
  broadcastToRoom(room.id, 'typing', {
    typingUsers: getActiveTyping(roomTypingMap, room.id),
  });

  return res.status(201).json({ message: created });
});

// Room Typing Indicators
apiRouter.get('/rooms/:id/typing', (req: Request, res: Response) => {
  const { excludeUserId } = req.query;
  const typingUsers = getActiveTyping(
    roomTypingMap,
    req.params.id,
    typeof excludeUserId === 'string' ? excludeUserId : undefined,
  );
  return res.json({ typingUsers });
});

apiRouter.post('/rooms/:id/typing', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth?.uid || (req.body.userId as string);
  if (!callerUid) {
    return res.status(400).json({ error: 'userId is required.' });
  }

  const room = db.findRoomById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // Authorization: Must be member or host
  const isMemberOrHost = room.hostId === callerUid || (room.memberIds || []).includes(callerUid);
  if (!isMemberOrHost) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  // Must not be muted or banned
  if ((room.mutedUserIds || []).includes(callerUid) || (room.bannedUserIds || []).includes(callerUid)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const user = db.findUserById(callerUid);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const isTyping = !!req.body.isTyping;
  setTypingState(roomTypingMap, req.params.id, user, isTyping);

  // Broadcast realtime typing state to all connected room participants
  broadcastToRoom(req.params.id, 'typing', {
    typingUsers: getActiveTyping(roomTypingMap, req.params.id),
  });

  return res.json({ success: true });
});

// Broadcast Realtime Room Reaction
apiRouter.post('/rooms/:id/reactions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const roomId = req.params.id;
  const { emoji } = req.body;

  if (!emoji || typeof emoji !== 'string' || emoji.length > 8) {
    return res.status(400).json({ error: 'Valid emoji character is required.' });
  }

  const room = db.findRoomById(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // Caller must be member or host
  const isMemberOrHost = room.hostId === callerUid || (room.memberIds || []).includes(callerUid);
  if (!isMemberOrHost) {
    return res.status(403).json({ error: 'Forbidden: You must be a member of this room.' });
  }

  if ((room.bannedUserIds || []).includes(callerUid)) {
    return res.status(403).json({ error: 'Forbidden: You have been banned from this room.' });
  }

  const user = db.findUserById(callerUid);
  const reactionPayload = {
    id: `rx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    emoji: emoji.trim(),
    userId: callerUid,
    userName: user?.fullName || 'User',
    timestamp: new Date().toISOString(),
  };

  // Broadcast reaction via SSE to all members in the room
  broadcastToRoom(roomId, 'reaction', reactionPayload);

  return res.json({ success: true, reaction: reactionPayload });
});

// Direct Messages & Conversations
apiRouter.get('/conversations', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const conversations = db.getConversationsForUser(currentUserId);
  const populated = conversations.map((conv) => {
    const otherUserId = conv.participantIds.find((id) => id !== currentUserId);
    const otherUser = otherUserId ? db.findUserById(otherUserId) : undefined;
    const isOtherUserTyping = otherUserId
      ? getActiveTyping(conversationTypingMap, conv.id, currentUserId).length > 0
      : false;
    const isBlocked = otherUserId ? db.isBlockedBetween(currentUserId, otherUserId) : false;
    return {
      ...conv,
      otherUser,
      isOtherUserTyping,
      isBlocked,
    };
  });
  return res.json({ conversations: populated });
});

apiRouter.post('/conversations', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const { targetUserId } = req.body;
  if (!targetUserId || typeof targetUserId !== 'string') {
    return res.status(400).json({ error: 'targetUserId is required.' });
  }

  if (targetUserId === currentUserId) {
    return res.status(400).json({ error: 'Cannot start a conversation with yourself.' });
  }

  const targetUser = db.findUserById(targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  // Phase 07 Blocking check
  if (db.isBlockedBetween(currentUserId, targetUserId)) {
    return res.status(403).json({ error: 'Cannot start conversation with a blocked user.' });
  }

  // Target User Direct Messages privacy setting
  const targetSettings = db.getUserSettings(targetUserId);
  if (targetSettings.directMessages === 'none') {
    return res.status(403).json({ error: 'This user does not accept direct messages.' });
  }
  if (targetSettings.directMessages === 'friends') {
    const currentUser = db.findUserById(currentUserId);
    const isFriend =
      currentUser?.friends?.includes(targetUserId) && targetUser.friends?.includes(currentUserId);
    if (!isFriend) {
      return res.status(403).json({ error: 'This user only accepts direct messages from mutual friends.' });
    }
  }

  const conv = db.findOrCreateConversation(currentUserId, targetUserId);
  return res.json({ conversation: { ...conv, otherUser: targetUser } });
});

apiRouter.get('/conversations/:id/messages', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const conversationId = req.params.id;
  const conv = db.findConversationById(conversationId);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  if (!conv.participantIds.includes(currentUserId)) {
    return res.status(403).json({ error: 'Forbidden: You are not a participant in this conversation.' });
  }

  const messages = db.getDirectMessages(conversationId);
  return res.json({ messages });
});

// Mark conversation messages as read
apiRouter.post('/conversations/:id/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const conversationId = req.params.id;
  const conv = db.findConversationById(conversationId);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  if (!conv.participantIds.includes(currentUserId)) {
    return res.status(403).json({ error: 'Forbidden: You are not a participant in this conversation.' });
  }

  const updatedCount = db.markConversationMessagesRead(conversationId, currentUserId);
  if (updatedCount > 0) {
    broadcastToConversation(conversationId, 'read_receipt', {
      conversationId,
      readerId: currentUserId,
      readCount: updatedCount,
      timestamp: new Date().toISOString(),
    });
  }

  return res.json({ success: true, updatedCount });
});

// Realtime SSE Chat Stream for Conversation Participants
apiRouter.get('/conversations/:id/stream', async (req: Request, res: Response) => {
  let token = req.query.token as string | undefined;
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
  }

  const authUser = await verifyFirebaseIdToken(token);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized: Invalid authentication credentials.' });
  }

  const conversationId = req.params.id;
  const conv = db.findConversationById(conversationId);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  if (!conv.participantIds.includes(authUser.uid)) {
    return res.status(403).json({ error: 'Forbidden: You are not a participant in this conversation.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = `sse_conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const client: SSEClient = {
    id: clientId,
    userId: authUser.uid,
    res,
  };

  if (!conversationSSEConnections.has(conversationId)) {
    conversationSSEConnections.set(conversationId, new Set());
  }
  conversationSSEConnections.get(conversationId)!.add(client);

  res.write(`event: connected\ndata: ${JSON.stringify({
    status: 'connected',
    conversationId,
    userId: authUser.uid,
    timestamp: new Date().toISOString(),
  })}\n\n`);

  const currentTyping = getActiveTyping(conversationTypingMap, conversationId);
  res.write(`event: typing\ndata: ${JSON.stringify({ typingUsers: currentTyping })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      conversationSSEConnections.get(conversationId)?.delete(client);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const clients = conversationSSEConnections.get(conversationId);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) {
        conversationSSEConnections.delete(conversationId);
      }
    }

    const user = db.findUserById(authUser.uid);
    if (user) {
      setTypingState(conversationTypingMap, conversationId, user, false);
      broadcastToConversation(conversationId, 'typing', {
        typingUsers: getActiveTyping(conversationTypingMap, conversationId),
      });
    }
  });
});

// Conversation Typing Indicators
apiRouter.get('/conversations/:id/typing', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const conversationId = req.params.id;
  const conv = db.findConversationById(conversationId);
  if (!conv || !conv.participantIds.includes(currentUserId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const typingUsers = getActiveTyping(conversationTypingMap, conversationId, currentUserId);
  return res.json({ typingUsers });
});

apiRouter.post('/conversations/:id/typing', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const conversationId = req.params.id;
  const conv = db.findConversationById(conversationId);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  if (!conv.participantIds.includes(currentUserId)) {
    return res.status(403).json({ error: 'Forbidden: You are not a participant in this conversation.' });
  }

  const otherUserId = conv.participantIds.find((id) => id !== currentUserId);
  if (otherUserId && db.isBlockedBetween(currentUserId, otherUserId)) {
    return res.status(403).json({ error: 'Forbidden: Cannot send typing state when blocked.' });
  }

  const user = db.findUserById(currentUserId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const isTyping = !!req.body.isTyping;
  setTypingState(conversationTypingMap, conversationId, user, isTyping);
  broadcastToConversation(conversationId, 'typing', {
    typingUsers: getActiveTyping(conversationTypingMap, conversationId),
  });
  return res.json({ success: true });
});

apiRouter.post('/conversations/:id/messages', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const conversationId = req.params.id;
  const conv = db.findConversationById(conversationId);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  if (!conv.participantIds.includes(currentUserId)) {
    return res.status(403).json({ error: 'Forbidden: You are not a participant in this conversation.' });
  }

  const receiverId = conv.participantIds.find((id) => id !== currentUserId);
  if (!receiverId) {
    return res.status(400).json({ error: 'Recipient participant not found in this conversation.' });
  }

  // Phase 07 Blocking check
  if (db.isBlockedBetween(currentUserId, receiverId)) {
    return res.status(403).json({ error: 'Cannot send messages to a blocked user.' });
  }

  // Mutual Friendship enforcement: users cannot send direct messages unless they are friends
  const currentUser = db.findUserById(currentUserId);
  const receiverUser = db.findUserById(receiverId);
  const isMutualFriend =
    currentUser?.friends?.includes(receiverId) && receiverUser?.friends?.includes(currentUserId);
  if (!isMutualFriend) {
    return res.status(403).json({
      error: 'This user is not in your friend list. Add them as a friend to chat.',
      code: 'NOT_FRIENDS',
    });
  }

  // Recipient Privacy settings check
  const receiverSettings = db.getUserSettings(receiverId);
  if (receiverSettings.directMessages === 'none') {
    return res.status(403).json({ error: 'Recipient does not accept direct messages.' });
  }

  const { content, sticker, attachmentUrl, mediaType, mediaTitle } = req.body;
  const trimmedContent = typeof content === 'string' ? content.trim() : '';
  const trimmedSticker =
    typeof sticker === 'string' && sticker.trim().length > 0 ? sticker.trim().slice(0, 20) : undefined;
  const trimmedAttachment =
    typeof attachmentUrl === 'string' &&
    (attachmentUrl.trim().startsWith('http://') ||
      attachmentUrl.trim().startsWith('https://') ||
      attachmentUrl.trim().startsWith('data:image/') ||
      attachmentUrl.trim().startsWith('data:video/') ||
      attachmentUrl.trim().startsWith('data:audio/'))
      ? attachmentUrl.trim()
      : undefined;

  if (!trimmedContent && !trimmedSticker && !trimmedAttachment) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }

  if (trimmedContent.length > 2000) {
    return res.status(400).json({ error: 'Message is too long (maximum 2000 characters).' });
  }

  const validMediaTypes = ['youtube', 'image', 'video', 'audio', 'link'];
  const sanitizedMediaType =
    typeof mediaType === 'string' && validMediaTypes.includes(mediaType)
      ? (mediaType as any)
      : undefined;

  const newMessage: DirectMessage = {
    id: `dmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    conversationId,
    senderId: currentUserId, // Authoritative!
    receiverId,             // Authoritative!
    content: trimmedContent,
    sticker: trimmedSticker,
    attachmentUrl: trimmedAttachment,
    mediaType: sanitizedMediaType,
    mediaTitle: typeof mediaTitle === 'string' ? mediaTitle.trim().slice(0, 100) : undefined,
    timestamp: new Date().toISOString(),
    read: false,
  };

  const created = db.createDirectMessage(newMessage);
  const senderUser = db.findUserById(currentUserId);
  if (senderUser) {
    setTypingState(conversationTypingMap, conversationId, senderUser, false);
  }

  broadcastToConversation(conversationId, 'message', created);
  broadcastToConversation(conversationId, 'typing', {
    typingUsers: getActiveTyping(conversationTypingMap, conversationId),
  });

  // Authoritative in-app notification for receiver if enabled and not in Do Not Disturb
  if (receiverSettings.pushNotifications !== false && !receiverSettings.doNotDisturb) {
    const dmNotif: AppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: receiverId,
      actorId: currentUserId,
      actorName: senderUser?.fullName || 'User',
      actorAvatar: senderUser?.avatarUrl,
      actorUsername: senderUser?.username,
      type: 'mention',
      title: `Message from ${senderUser?.fullName || 'User'}`,
      description:
        trimmedContent.length > 0
          ? trimmedContent.length > 80
            ? trimmedContent.slice(0, 80) + '...'
            : trimmedContent
          : trimmedAttachment
            ? 'Sent a media attachment'
            : 'Sent a sticker',
      targetConversationId: conversationId,
      timestamp: new Date().toISOString(),
      isRead: false,
    };
    const createdNotif = db.createNotification(dmNotif);
    broadcastToUser(receiverId, 'notification', createdNotif);
    broadcastToUser(receiverId, 'unread_count', {
      unreadCount: db.getUnreadNotificationCount(receiverId),
    });
  }

  return res.status(201).json({ message: created });
});

// Notifications (Protected, Authoritative, Real-Time)
apiRouter.get('/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const { type, limit, offset } = req.query;

  const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : 30;
  const parsedOffset = typeof offset === 'string' ? parseInt(offset, 10) : 0;
  const filterType = typeof type === 'string' ? type : undefined;

  const result = db.queryNotifications(currentUserId, {
    limit: isNaN(parsedLimit) ? 30 : parsedLimit,
    offset: isNaN(parsedOffset) ? 0 : parsedOffset,
    type: filterType,
  });

  return res.json({
    notifications: result.notifications,
    total: result.total,
    unreadCount: result.unreadCount,
  });
});

apiRouter.get('/notifications/unread-count', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const unreadCount = db.getUnreadNotificationCount(currentUserId);
  return res.json({ unreadCount });
});

apiRouter.get('/notifications/stream', async (req: Request, res: Response) => {
  let token = req.query.token as string | undefined;
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
  }

  const authUser = await verifyFirebaseIdToken(token);
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized: Invalid authentication credentials.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = `sse_user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const client: SSEClient = {
    id: clientId,
    userId: authUser.uid,
    res,
  };

  if (!userSSEConnections.has(authUser.uid)) {
    userSSEConnections.set(authUser.uid, new Set());
  }
  const clientSet = userSSEConnections.get(authUser.uid)!;
  const isFirstConn = clientSet.size === 0;
  clientSet.add(client);

  if (userDisconnectTimers.has(authUser.uid)) {
    clearTimeout(userDisconnectTimers.get(authUser.uid)!);
    userDisconnectTimers.delete(authUser.uid);
  }

  const nowIso = new Date().toISOString();
  userPresenceState.set(authUser.uid, {
    userId: authUser.uid,
    status: 'online',
    lastSeen: nowIso,
    lastHeartbeat: Date.now(),
  });
  db.updateUser(authUser.uid, { isOnline: true, lastSeen: nowIso });

  if (isFirstConn) {
    const settings = db.getUserSettings(authUser.uid);
    const showActivity = settings ? settings.activityStatus !== false : true;
    broadcastGlobal('presence_update', {
      userId: authUser.uid,
      isOnline: showActivity,
      status: 'online',
      lastSeen: nowIso,
    });
  }

  const initialUnreadCount = db.getUnreadNotificationCount(authUser.uid);
  res.write(
    `event: connected\ndata: ${JSON.stringify({
      status: 'connected',
      userId: authUser.uid,
      unreadCount: initialUnreadCount,
      timestamp: new Date().toISOString(),
    })}\n\n`,
  );

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      userSSEConnections.get(authUser.uid)?.delete(client);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const clients = userSSEConnections.get(authUser.uid);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) {
        // 4-second grace window to tolerate page reload or navigation without presence flapping
        const timer = setTimeout(() => {
          userDisconnectTimers.delete(authUser.uid);
          const remaining = userSSEConnections.get(authUser.uid);
          if (!remaining || remaining.size === 0) {
            userSSEConnections.delete(authUser.uid);
            const offlineIso = new Date().toISOString();
            db.updateUser(authUser.uid, { isOnline: false, lastSeen: offlineIso });
            userPresenceState.set(authUser.uid, {
              userId: authUser.uid,
              status: 'offline',
              lastSeen: offlineIso,
              lastHeartbeat: Date.now(),
            });
            broadcastGlobal('presence_update', {
              userId: authUser.uid,
              isOnline: false,
              status: 'offline',
              lastSeen: offlineIso,
            });
          }
        }, 4000);
        userDisconnectTimers.set(authUser.uid, timer);
      }
    }
  });
});

// Presence endpoints
apiRouter.post('/presence/heartbeat', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const uid = req.auth!.uid;
  const { status } = req.body as { status?: 'online' | 'away' };
  const targetStatus = status === 'away' ? 'away' : 'online';
  const nowIso = new Date().toISOString();

  db.updateUser(uid, { isOnline: true, lastSeen: nowIso });
  const existing = userPresenceState.get(uid);
  const statusChanged = !existing || existing.status !== targetStatus;
  userPresenceState.set(uid, {
    userId: uid,
    status: targetStatus,
    lastSeen: nowIso,
    lastHeartbeat: Date.now(),
  });

  if (statusChanged) {
    const settings = db.getUserSettings(uid);
    const showActivity = settings ? settings.activityStatus !== false : true;
    broadcastGlobal('presence_update', {
      userId: uid,
      isOnline: showActivity,
      status: targetStatus,
      lastSeen: nowIso,
    });
  }

  return res.json({ success: true, status: targetStatus, lastSeen: nowIso });
});

apiRouter.get('/presence', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth?.uid;
  const users = db.getUsers();
  const presenceMap: Record<string, { isOnline: boolean; status: 'online' | 'away' | 'offline'; lastSeen?: string }> = {};

  for (const u of users) {
    const isSelf = callerUid && callerUid === u.id;
    const settings = db.getUserSettings(u.id);
    const showActivity = settings ? settings.activityStatus !== false : true;
    const state = userPresenceState.get(u.id);
    const actuallyOnline = state ? (state.status === 'online' || state.status === 'away') : Boolean(u.isOnline);
    const effectiveStatus = state ? state.status : (u.isOnline ? 'online' : 'offline');

    if (isSelf || showActivity) {
      presenceMap[u.id] = {
        isOnline: actuallyOnline,
        status: effectiveStatus,
        lastSeen: u.lastSeen,
      };
    } else {
      presenceMap[u.id] = {
        isOnline: false,
        status: 'offline',
      };
    }
  }

  return res.json({ presence: presenceMap });
});

// WebRTC 1-to-1 Calling Endpoints
apiRouter.post('/calls/initiate', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerId = req.auth!.uid;
  const { recipientId, type } = req.body as { recipientId: string; type?: 'audio' | 'video' };

  if (!recipientId) {
    return res.status(400).json({ error: 'recipientId is required' });
  }

  if (recipientId === callerId) {
    return res.status(400).json({ error: 'Cannot call yourself' });
  }

  const caller = db.findUserById(callerId);
  const recipient = db.findUserById(recipientId);

  if (!caller || !recipient) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Blocking check
  if (db.isBlockedBetween(callerId, recipientId)) {
    return res.status(403).json({ error: 'Cannot call this user.' });
  }

  // Privacy & Settings check
  const recipientSettings = db.getUserSettings(recipientId);
  if (recipientSettings.doNotDisturb) {
    return res.status(403).json({ error: 'User is currently in Do Not Disturb mode.' });
  }
  if (recipientSettings.directMessages === 'none') {
    return res.status(403).json({ error: 'This user is not accepting direct calls.' });
  }
  if (recipientSettings.directMessages === 'friends' && !db.areFriends(callerId, recipientId)) {
    return res.status(403).json({ error: 'Only friends can call this user.' });
  }

  // Check if caller or recipient is already on an active call
  for (const c of activeCalls.values()) {
    if (c.status === 'ringing' || c.status === 'connecting' || c.status === 'connected') {
      if (c.callerId === callerId || c.recipientId === callerId) {
        return res.status(409).json({ error: 'You already have an active call in progress.' });
      }
      if (c.callerId === recipientId || c.recipientId === recipientId) {
        return res.status(409).json({ error: 'User is currently busy on another call.' });
      }
    }
  }

  const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const session: CallSession = {
    id: callId,
    callerId,
    callerName: caller.fullName,
    callerAvatar: caller.avatarUrl,
    recipientId,
    recipientName: recipient.fullName,
    recipientAvatar: recipient.avatarUrl,
    type: type === 'video' ? 'video' : 'audio',
    status: 'ringing',
    createdAt: Date.now(),
  };

  activeCalls.set(callId, session);

  // Broadcast incoming call event to recipient
  broadcastToUser(recipientId, 'incoming_call', session);

  // Auto-timeout after 35s if not answered
  setTimeout(() => {
    const current = activeCalls.get(callId);
    if (current && (current.status === 'calling' || current.status === 'ringing')) {
      current.status = 'ended';
      current.endedAt = Date.now();
      current.endReason = 'no_answer';
      broadcastToUser(current.callerId, 'call_ended', { callId, reason: 'no_answer' });
      broadcastToUser(current.recipientId, 'call_ended', { callId, reason: 'no_answer' });
      activeCalls.delete(callId);
    }
  }, 35000);

  return res.json({ call: session });
});

apiRouter.post('/calls/:id/respond', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const uid = req.auth!.uid;
  const call = activeCalls.get(req.params.id);

  if (!call) {
    return res.status(404).json({ error: 'Call not found or already ended.' });
  }

  if (call.recipientId !== uid) {
    return res.status(403).json({ error: 'Forbidden: You are not the recipient of this call.' });
  }

  const { action } = req.body as { action: 'accept' | 'decline' };

  if (action === 'decline') {
    call.status = 'declined';
    call.endedAt = Date.now();
    call.endReason = 'declined';
    broadcastToUser(call.callerId, 'call_declined', { callId: call.id });
    activeCalls.delete(call.id);
    return res.json({ success: true, status: 'declined' });
  }

  if (action === 'accept') {
    call.status = 'connecting';
    broadcastToUser(call.callerId, 'call_accepted', { callId: call.id });
    return res.json({ success: true, status: 'connecting' });
  }

  return res.status(400).json({ error: 'Invalid action. Must be accept or decline.' });
});

apiRouter.post('/calls/:id/signal', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const uid = req.auth!.uid;
  const call = activeCalls.get(req.params.id);

  if (!call) {
    return res.status(404).json({ error: 'Call not found or ended.' });
  }

  if (call.callerId !== uid && call.recipientId !== uid) {
    return res.status(403).json({ error: 'Forbidden: You are not a participant in this call.' });
  }

  const { type, data } = req.body as {
    type: 'offer' | 'answer' | 'ice-candidate' | 'screenshare-started' | 'screenshare-stopped';
    data: any;
  };
  if (!type) {
    return res.status(400).json({ error: 'Missing signaling type.' });
  }

  const targetUserId = call.callerId === uid ? call.recipientId : call.callerId;

  if (type === 'answer') {
    call.status = 'connected';
    call.connectedAt = Date.now();
  } else if (type === 'screenshare-started') {
    call.isScreenSharing = true;
    call.screenSharingUserId = uid;
  } else if (type === 'screenshare-stopped') {
    call.isScreenSharing = false;
    call.screenSharingUserId = undefined;
  }

  broadcastToUser(targetUserId, 'call_signal', {
    callId: call.id,
    fromUserId: uid,
    type,
    data: data || {},
  });

  return res.json({ success: true, call });
});

apiRouter.get('/webrtc/ice-servers', optionalAuth, (_req: AuthenticatedRequest, res: Response) => {
  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  if (process.env.TURN_SERVER_URL) {
    iceServers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  return res.json({
    iceServers,
    turnConfigured: !!process.env.TURN_SERVER_URL,
  });
});

apiRouter.post('/calls/:id/end', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const uid = req.auth!.uid;
  const call = activeCalls.get(req.params.id);

  if (!call) {
    return res.json({ success: true, status: 'ended' });
  }

  if (call.callerId !== uid && call.recipientId !== uid) {
    return res.status(403).json({ error: 'Forbidden: You are not a participant in this call.' });
  }

  call.status = 'ended';
  call.endedAt = Date.now();
  call.endReason = req.body?.reason || 'hung_up';

  const targetUserId = call.callerId === uid ? call.recipientId : call.callerId;
  broadcastToUser(targetUserId, 'call_ended', { callId: call.id, reason: call.endReason });

  activeCalls.delete(call.id);
  return res.json({ success: true, status: 'ended' });
});

apiRouter.get('/calls/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const uid = req.auth!.uid;
  const call = activeCalls.get(req.params.id);

  if (!call) {
    return res.status(404).json({ error: 'Call not found.' });
  }

  if (call.callerId !== uid && call.recipientId !== uid) {
    return res.status(403).json({ error: 'Forbidden: You are not a participant in this call.' });
  }

  return res.json({ call });
});

// Room voice speaking & WebRTC signaling
apiRouter.post('/rooms/:id/speaking', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const uid = req.auth!.uid;
  const room = db.findRoomById(req.params.id);

  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  if (room.hostId !== uid && !room.memberIds.includes(uid)) {
    return res.status(403).json({ error: 'You are not a member of this room.' });
  }

  if ((room.mutedUserIds || []).includes(uid)) {
    return res.status(403).json({ error: 'You have been muted by the host.' });
  }

  const { isSpeaking } = req.body as { isSpeaking: boolean };
  broadcastToRoom(room.id, 'user_speaking', {
    userId: uid,
    isSpeaking: Boolean(isSpeaking),
  });

  return res.json({ success: true });
});

apiRouter.post('/rooms/:id/voice/signal', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const uid = req.auth!.uid;
  const room = db.findRoomById(req.params.id);

  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  if (room.hostId !== uid && !room.memberIds.includes(uid)) {
    return res.status(403).json({ error: 'You are not a member of this room.' });
  }

  const { targetUserId, type, data } = req.body as {
    targetUserId: string;
    type: 'offer' | 'answer' | 'ice-candidate';
    data: any;
  };

  if (!targetUserId || !type || !data) {
    return res.status(400).json({ error: 'Missing signaling payload fields.' });
  }

  if (room.hostId !== targetUserId && !room.memberIds.includes(targetUserId)) {
    return res.status(403).json({ error: 'Target user is not in this room.' });
  }

  broadcastToUser(targetUserId, 'room_voice_signal', {
    roomId: room.id,
    fromUserId: uid,
    targetUserId,
    type,
    data,
  });

  broadcastToRoom(room.id, 'room_voice_signal', {
    roomId: room.id,
    fromUserId: uid,
    targetUserId,
    type,
    data,
  });

  return res.json({ success: true });
});

apiRouter.put('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const notificationId = req.params.id;

  const notif = db.findNotificationById(notificationId);
  if (!notif) {
    return res.status(404).json({ error: 'Notification not found.' });
  }

  if (notif.userId !== currentUserId) {
    return res.status(403).json({ error: 'Forbidden: You cannot modify another user\'s notification.' });
  }

  const updated = db.updateNotification(notificationId, { isRead: true });
  const unreadCount = db.getUnreadNotificationCount(currentUserId);
  broadcastToUser(currentUserId, 'unread_count', { unreadCount });

  return res.json({ notification: updated, unreadCount });
});

apiRouter.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const updatedCount = db.markAllNotificationsRead(currentUserId);
  broadcastToUser(currentUserId, 'unread_count', { unreadCount: 0 });

  return res.json({ success: true, count: updatedCount });
});

apiRouter.delete('/notifications/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUserId = req.auth!.uid;
  const notificationId = req.params.id;

  const notif = db.findNotificationById(notificationId);
  if (!notif) {
    return res.status(404).json({ error: 'Notification not found.' });
  }

  if (notif.userId !== currentUserId) {
    return res.status(403).json({ error: 'Forbidden: You cannot delete another user\'s notification.' });
  }

  db.deleteNotification(notificationId);
  const unreadCount = db.getUnreadNotificationCount(currentUserId);
  broadcastToUser(currentUserId, 'unread_count', { unreadCount });

  return res.json({ success: true, unreadCount });
});

// Settings (Authenticated & Protected)
apiRouter.get('/settings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const settings = db.getUserSettings(callerUid);
  return res.json({ settings });
});

apiRouter.put('/settings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.auth!.uid;
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Settings object required.' });
  }

  // Authoritative sanitization & validation of allowed preference fields
  const allowedUpdates: Partial<UserSettings> = {};
  if (['dark', 'light', 'system'].includes(settings.appearance)) {
    allowedUpdates.appearance = settings.appearance;
  }
  if (typeof settings.pushNotifications === 'boolean') {
    allowedUpdates.pushNotifications = settings.pushNotifications;
  }
  if (typeof settings.emailNotifications === 'boolean') {
    allowedUpdates.emailNotifications = settings.emailNotifications;
  }
  if (typeof settings.roomInvites === 'boolean') {
    allowedUpdates.roomInvites = settings.roomInvites;
  }
  if (['everyone', 'friends', 'none'].includes(settings.directMessages)) {
    allowedUpdates.directMessages = settings.directMessages;
  }
  if (typeof settings.activityStatus === 'boolean') {
    allowedUpdates.activityStatus = settings.activityStatus;
  }
  if (typeof settings.language === 'string' && settings.language.trim().length > 0 && settings.language.length <= 20) {
    allowedUpdates.language = settings.language.trim();
  }
  if (typeof settings.chatTranslationLanguage === 'string' && settings.chatTranslationLanguage.trim().length > 0 && settings.chatTranslationLanguage.length <= 20) {
    allowedUpdates.chatTranslationLanguage = settings.chatTranslationLanguage.trim();
  }
  if (typeof settings.doNotDisturb === 'boolean') {
    allowedUpdates.doNotDisturb = settings.doNotDisturb;
  }

  const updated = db.updateUserSettings(callerUid, allowedUpdates);
  return res.json({ settings: updated });
});

// Robust Gemini Generation Helper with Quota Fallback and Persona Instructions
async function generateGeminiContent(
  prompt: string,
  preferredModel: string = 'gemini-3.8-flash',
  temperature: number = 0.7,
  systemInstruction?: string,
  apiKey?: string,
): Promise<{ text: string; model: string } | null> {
  const effectiveKey = apiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!effectiveKey) {
    return null;
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({
      apiKey: effectiveKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Map legacy / custom names to valid @google/genai models
    let normalizedPreferred = preferredModel;
    if (normalizedPreferred.includes('2.5-pro') || normalizedPreferred.includes('3.1-pro')) {
      normalizedPreferred = 'gemini-3.1-pro-preview';
    } else if (normalizedPreferred.includes('2.5-flash') || normalizedPreferred.includes('3.8-flash')) {
      normalizedPreferred = 'gemini-3.8-flash';
    } else if (normalizedPreferred.includes('flash-lite') || normalizedPreferred.includes('lite')) {
      normalizedPreferred = 'gemini-3.1-flash-lite';
    } else if (!normalizedPreferred.startsWith('gemini-')) {
      normalizedPreferred = 'gemini-3.8-flash';
    }

    // Candidate fallback list
    const candidateModels = Array.from(
      new Set([
        normalizedPreferred,
        'gemini-3.1-flash-lite',
        'gemini-3.8-flash',
        'gemini-3.1-pro-preview',
        'gemini-flash-latest',
      ])
    );

    let lastError: any = null;
    for (const modelCandidate of candidateModels) {
      try {
        const config: any = {
          temperature: Math.min(Math.max(temperature, 0), 1),
        };
        if (systemInstruction && systemInstruction.trim()) {
          config.systemInstruction = systemInstruction.trim();
        }

        const aiResponse = await ai.models.generateContent({
          model: modelCandidate,
          contents: prompt,
          config,
        });

        const responseText = aiResponse.text;
        if (responseText && responseText.trim()) {
          return { text: responseText.trim(), model: modelCandidate };
        }
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || '';
        // If quota exceeded or model not found, try next candidate model
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('quota') ||
          msg.includes('429') ||
          msg.includes('not found') ||
          msg.includes('NOT_FOUND')
        ) {
          console.warn(`Gemini model ${modelCandidate} rate-limited or unavailable (${msg}). Trying fallback...`);
          continue;
        }
        // Other unexpected error, try next candidate
        console.warn(`Gemini model ${modelCandidate} failed (${msg}). Trying fallback...`);
      }
    }

    console.warn('All Gemini candidate models failed or rate-limited:', lastError?.message);
    return null;
  } catch (initErr: any) {
    console.warn('Failed to initialize GoogleGenAI client:', initErr?.message);
    return null;
  }
}

// Universal OpenRouter & OpenAI-Compatible Live Client Helper
async function generateOpenRouterContent({
  url = 'https://openrouter.ai/api/v1/chat/completions',
  apiKey,
  model = 'deepseek/deepseek-r1',
  prompt,
  systemInstruction,
  temperature = 0.7,
}: {
  url?: string;
  apiKey?: string;
  model?: string;
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
}): Promise<{ text: string; model: string; provider: string; error?: string } | null> {
  const targetUrl = url?.trim() || 'https://openrouter.ai/api/v1/chat/completions';
  const effectiveKey = apiKey?.trim() || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

  if (!effectiveKey) {
    return {
      text: '⚠️ OpenRouter API Key is missing. Please provide your OpenRouter API key (sk-or-v1-...) in the AI Model config or set OPENROUTER_API_KEY.',
      model,
      provider: 'OpenRouter',
      error: 'NO_API_KEY',
    };
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (systemInstruction && systemInstruction.trim()) {
    messages.push({ role: 'system', content: systemInstruction.trim() });
  }
  messages.push({ role: 'user', content: prompt });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${effectiveKey}`,
    'HTTP-Referer': 'https://ai.studio/build',
    'X-Title': 'Hangout Fun Social App',
  };

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model || 'deepseek/deepseek-r1',
        messages,
        temperature: Math.min(Math.max(temperature, 0), 2),
      }),
    });

    if (!response.ok) {
      const errRaw = await response.text();
      let errMsg = errRaw;
      try {
        const errJson = JSON.parse(errRaw);
        errMsg = errJson?.error?.message || errJson?.message || errRaw;
      } catch {
        errMsg = errRaw.slice(0, 250);
      }
      return {
        text: `⚠️ [OpenRouter Error ${response.status}]: ${errMsg}`,
        model,
        provider: 'OpenRouter',
        error: `HTTP_${response.status}`,
      };
    }

    const data: any = await response.json();
    const replyText = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text;
    if (replyText) {
      return {
        text: typeof replyText === 'string' ? replyText.trim() : JSON.stringify(replyText),
        model: data?.model || model,
        provider: 'OpenRouter',
      };
    }

    return {
      text: '⚠️ OpenRouter returned an empty response.',
      model,
      provider: 'OpenRouter',
    };
  } catch (fetchErr: any) {
    console.error('[OpenRouter Fetch Error]:', fetchErr);
    return {
      text: `⚠️ [OpenRouter Connection Error]: ${fetchErr?.message || 'Failed to connect to OpenRouter endpoint.'}`,
      model,
      provider: 'OpenRouter',
      error: 'NETWORK_ERROR',
    };
  }
}

// Dedicated /api/gemini/chat endpoint for AI model queries
apiRouter.post('/gemini/chat', requireAuth, aiRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const { prompt, message, messages, model, temperature, persona, customPersona, systemInstruction, provider, url, apiKey } = req.body;
  const inputPrompt =
    (typeof prompt === 'string' && prompt.trim()) ||
    (typeof message === 'string' && message.trim()) ||
    (Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1]?.content || '' : '');

  if (!inputPrompt || typeof inputPrompt !== 'string' || !inputPrompt.trim()) {
    return res.status(400).json({ error: 'Prompt or message text is required.' });
  }

  const startTime = Date.now();
  const cleanPrompt = inputPrompt.trim();
  const requestedModel = typeof model === 'string' ? model : 'gemini-3.8-flash';
  const reqTemp = typeof temperature === 'number' ? temperature : 0.7;

  // Build persona system instruction if provided
  let effectiveInstruction = typeof systemInstruction === 'string' ? systemInstruction : '';
  if (persona === 'friendly') {
    effectiveInstruction += ' Act as a warm, friendly, conversational host with welcoming emojis.';
  } else if (persona === 'concise') {
    effectiveInstruction += ' Provide ultra-concise, direct answers with zero fluff.';
  } else if (persona === 'creative') {
    effectiveInstruction += ' Respond with witty humor, playful energy, and creative storytelling.';
  } else if (persona === 'technical') {
    effectiveInstruction += ' Provide structured, deeply analytical, and logically sound explanations.';
  } else if (persona === 'custom' && customPersona) {
    effectiveInstruction += ` Custom Persona Instructions: ${customPersona}`;
  }

  // Check if OpenRouter requested
  if (provider === 'OpenRouter' || (typeof url === 'string' && url.includes('openrouter.ai'))) {
    const openRouterResult = await generateOpenRouterContent({
      url,
      apiKey,
      model: requestedModel,
      prompt: cleanPrompt,
      systemInstruction: effectiveInstruction,
      temperature: reqTemp,
    });
    if (openRouterResult) {
      if (openRouterResult.error) {
        return res.status(502).json({
          error: openRouterResult.text,
          code: openRouterResult.error,
        });
      }
      const latencyMs = Date.now() - startTime;
      return res.json({
        text: openRouterResult.text,
        response: openRouterResult.text,
        model: openRouterResult.model,
        latencyMs,
        provider: 'OpenRouter',
      });
    }
  }

  const result = await generateGeminiContent(cleanPrompt, requestedModel, reqTemp, effectiveInstruction);
  const latencyMs = Date.now() - startTime;

  if (result) {
    return res.json({
      text: result.text,
      response: result.text,
      model: result.model,
      latencyMs,
      provider: 'Google (Gemini)',
    });
  }

  // Return real failure instead of fabricated text
  return res.status(502).json({
    error: 'AI service unavailable. Please ensure GEMINI_API_KEY is configured or provide a valid API key in AI settings.',
    code: 'AI_UNAVAILABLE',
    latencyMs: Date.now() - startTime,
  });
});

// Dedicated /api/gemini/generate endpoint alias
apiRouter.post('/gemini/generate', requireAuth, aiRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const { prompt, model, temperature, persona, customPersona, systemInstruction, provider, url, apiKey } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt string is required.' });
  }

  const startTime = Date.now();
  const cleanPrompt = prompt.trim();
  const requestedModel = typeof model === 'string' ? model : 'gemini-3.8-flash';
  const reqTemp = typeof temperature === 'number' ? temperature : 0.7;

  let effectiveInstruction = typeof systemInstruction === 'string' ? systemInstruction : '';
  if (persona === 'friendly') {
    effectiveInstruction += ' Act as a warm, friendly, conversational host with welcoming emojis.';
  } else if (persona === 'concise') {
    effectiveInstruction += ' Provide ultra-concise, direct answers with zero fluff.';
  } else if (persona === 'creative') {
    effectiveInstruction += ' Respond with witty humor, playful energy, and creative storytelling.';
  } else if (persona === 'technical') {
    effectiveInstruction += ' Provide structured, deeply analytical, and logically sound explanations.';
  } else if (persona === 'custom' && customPersona) {
    effectiveInstruction += ` Custom Persona Instructions: ${customPersona}`;
  }

  if (provider === 'OpenRouter' || (typeof url === 'string' && url.includes('openrouter.ai'))) {
    const openRouterResult = await generateOpenRouterContent({
      url,
      apiKey,
      model: requestedModel,
      prompt: cleanPrompt,
      systemInstruction: effectiveInstruction,
      temperature: reqTemp,
    });
    if (openRouterResult) {
      if (openRouterResult.error) {
        return res.status(502).json({
          error: openRouterResult.text,
          code: openRouterResult.error,
        });
      }
      const latencyMs = Date.now() - startTime;
      return res.json({
        text: openRouterResult.text,
        response: openRouterResult.text,
        model: openRouterResult.model,
        latencyMs,
        provider: 'OpenRouter',
      });
    }
  }

  const result = await generateGeminiContent(cleanPrompt, requestedModel, reqTemp, effectiveInstruction);
  const latencyMs = Date.now() - startTime;

  if (result) {
    return res.json({
      text: result.text,
      response: result.text,
      model: result.model,
      latencyMs,
      provider: 'Google (Gemini)',
    });
  }

  return res.status(502).json({
    error: 'AI generation failed. Please verify that GEMINI_API_KEY is configured.',
    code: 'AI_UNAVAILABLE',
    latencyMs: Date.now() - startTime,
  });
});

// AI Playground Interactive Test Endpoint
apiRouter.post('/ai/playground-test', requireAuth, aiRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const { prompt, modelId, modelName, provider, temperature, persona, customPersona, systemInstruction, url, apiKey } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt string is required.' });
  }

  const startTime = Date.now();
  const cleanPrompt = prompt.trim();
  const reqTemp = typeof temperature === 'number' ? temperature : 0.7;

  let effectiveInstruction = typeof systemInstruction === 'string' ? systemInstruction : '';
  if (persona === 'friendly') {
    effectiveInstruction += ' Act as a warm, friendly, conversational host with welcoming emojis.';
  } else if (persona === 'concise') {
    effectiveInstruction += ' Provide ultra-concise, direct answers with zero fluff.';
  } else if (persona === 'creative') {
    effectiveInstruction += ' Respond with witty humor, playful energy, and creative storytelling.';
  } else if (persona === 'technical') {
    effectiveInstruction += ' Provide structured, deeply analytical, and logically sound explanations.';
  } else if (persona === 'custom' && customPersona) {
    effectiveInstruction += ` Custom Persona Instructions: ${customPersona}`;
  }

  // OpenRouter Native Support
  if (provider === 'OpenRouter' || (typeof url === 'string' && url.includes('openrouter.ai'))) {
    const requestedModel = modelName || modelId || 'deepseek/deepseek-r1';
    const result = await generateOpenRouterContent({
      url,
      apiKey,
      model: requestedModel,
      prompt: cleanPrompt,
      systemInstruction: effectiveInstruction,
      temperature: reqTemp,
    });

    if (result) {
      if (result.error) {
        return res.status(502).json({
          error: result.text,
          code: result.error,
        });
      }
      const latencyMs = Date.now() - startTime;
      return res.json({
        response: result.text,
        latencyMs,
        model: result.model,
        provider: 'OpenRouter',
      });
    }
  }

  // If provider is Google or unspecified, try live Gemini models first
  if (provider === 'Google' || !provider) {
    const requestedModel = modelName || modelId || 'gemini-3.8-flash';
    const result = await generateGeminiContent(cleanPrompt, requestedModel, reqTemp, effectiveInstruction);
    if (result) {
      const latencyMs = Date.now() - startTime;
      return res.json({
        response: result.text,
        latencyMs,
        model: result.model,
        provider: 'Google (Gemini)',
      });
    }
  }

  return res.status(502).json({
    error: 'Model generation test failed. The provider returned no response or is not configured.',
    code: 'AI_UNAVAILABLE',
    latencyMs: Date.now() - startTime,
  });
});

// Chat Auto Translation System with Accuracy Percentage
const CHAT_TRANSLATION_LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  hi: 'Hindi',
  ja: 'Japanese',
  zh: 'Chinese (Simplified)',
  ar: 'Arabic',
  pt: 'Portuguese',
  ko: 'Korean',
  ru: 'Russian',
  it: 'Italian',
  tr: 'Turkish',
  id: 'Indonesian',
  nl: 'Dutch',
  pl: 'Polish',
  vi: 'Vietnamese',
  th: 'Thai',
};

// Fallback Real Neural Machine Translation function
async function neuralMachineTranslate(
  text: string,
  targetCode: string,
  sourceCode: string = 'auto'
): Promise<{ translatedText: string; detectedSourceLanguage: string } | null> {
  const clean = text.trim();
  if (!clean) return null;

  // 1. High-speed Google Translation Bridge
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sourceCode
    )}&tl=${encodeURIComponent(targetCode)}&dt=t&q=${encodeURIComponent(clean)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data: any = await response.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0].map((seg: any) => (seg && seg[0]) || '').join('').trim();
        const detected = (typeof data[2] === 'string' && data[2]) || sourceCode;
        if (translated) {
          return { translatedText: translated, detectedSourceLanguage: detected };
        }
      }
    }
  } catch (err) {
    console.warn('[Translate Bridge] Primary engine error:', (err as any)?.message);
  }

  // 2. High-reliability MyMemory Public Translation API
  try {
    const langpair = `${sourceCode === 'auto' ? 'en' : sourceCode}|${targetCode}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${langpair}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data: any = await response.json();
      const translated = data?.responseData?.translatedText;
      if (translated && typeof translated === 'string' && !translated.startsWith('MYMEMORY WARNING')) {
        return { translatedText: translated.trim(), detectedSourceLanguage: sourceCode };
      }
    }
  } catch (err) {
    console.warn('[Translate Bridge] Secondary engine error:', (err as any)?.message);
  }

  return null;
}

apiRouter.post('/chat/translate', requireAuth, aiRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const {
    text,
    targetLanguage,
    sourceLanguage,
    model,
    modelId,
    modelName,
    provider,
    apiKey,
    url,
    temperature,
  } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ success: false, error: 'Text string is required for translation.' });
  }

  const cleanText = text.trim();
  const targetCode = (targetLanguage || 'es').trim().toLowerCase();
  const targetLangName = CHAT_TRANSLATION_LANGUAGES[targetCode] || targetLanguage || 'Spanish';
  const srcCode = (sourceLanguage || 'auto').trim().toLowerCase();

  const translationPrompt = `Translate the following chat message into ${targetLangName} (${targetCode}).
Keep the natural conversational tone, slang, emojis, punctuation, and user mentions intact.
Translate the text faithfully and accurately into ${targetLangName}.
You MUST output ONLY a valid JSON object with NO markdown enclosing code blocks, following this exact schema:
{
  "translatedText": "translated string here",
  "detectedSourceLanguage": "detected language name"
}

Chat message:
"""
${cleanText}
"""`;

  // Helper to safely extract translated text from model output
  const extractTranslatedText = (rawOutput: string): { translatedText: string; detectedSourceLanguage: string } | null => {
    if (!rawOutput || typeof rawOutput !== 'string') return null;
    let raw = rawOutput.trim();
    if (raw.startsWith('```json')) {
      raw = raw.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (raw.startsWith('```')) {
      raw = raw.replace(/^```/, '').replace(/```$/, '').trim();
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.translatedText && typeof parsed.translatedText === 'string' && parsed.translatedText.trim()) {
        return {
          translatedText: parsed.translatedText.trim(),
          detectedSourceLanguage: parsed.detectedSourceLanguage || 'Auto',
        };
      }
    } catch {
      // Fallback: If returned plain translation text without JSON formatting
      const cleaned = raw.replace(/^["']/, '').replace(/["']$/, '').trim();
      if (cleaned && !cleaned.includes('{') && !cleaned.includes('"""') && !cleaned.startsWith('⚠️')) {
        return {
          translatedText: cleaned,
          detectedSourceLanguage: 'Auto',
        };
      }
    }
    return null;
  };

  // 1. If OpenRouter or custom OpenAI-compatible endpoint is explicitly configured by user
  if (provider === 'OpenRouter' || (typeof url === 'string' && url.includes('openrouter.ai')) || (provider === 'OpenAI' || provider === 'xAI' || provider === 'Anthropic' || provider === 'Custom')) {
    const effectiveKey = apiKey?.trim() || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
    if (!effectiveKey) {
      return res.status(400).json({
        success: false,
        error: `TRANSLATION_PROVIDER_NOT_CONFIGURED: API Key for ${provider || 'Custom Provider'} is missing. Please configure your key in AI Management settings.`,
        targetLanguage: targetLangName,
      });
    }

    const requestedModel = modelName || model || modelId || 'deepseek/deepseek-r1';
    const openRouterResult = await generateOpenRouterContent({
      url,
      apiKey: effectiveKey,
      model: requestedModel,
      prompt: translationPrompt,
      systemInstruction: 'You are a high-speed, precise real-time chat translator. Always respond with strict, valid JSON only.',
      temperature: typeof temperature === 'number' ? temperature : 0.1,
    });

    if (openRouterResult?.error || !openRouterResult?.text) {
      return res.status(502).json({
        success: false,
        error: openRouterResult?.text || `Provider request to ${provider} (${requestedModel}) failed: ${openRouterResult?.error || 'No response'}`,
        targetLanguage: targetLangName,
      });
    }

    const extracted = extractTranslatedText(openRouterResult.text);
    if (extracted && extracted.translatedText) {
      return res.json({
        success: true,
        translatedText: extracted.translatedText,
        detectedSourceLanguage: extracted.detectedSourceLanguage,
        targetLanguage: targetLangName,
        provider: `${provider || 'OpenRouter'} (${requestedModel})`,
      });
    }

    return res.status(502).json({
      success: false,
      error: `Failed to parse translation from ${provider || 'OpenRouter'}.`,
      targetLanguage: targetLangName,
    });
  }

  // 2. Google Gemini Live Translation
  const geminiKey = apiKey?.trim() || process.env.GEMINI_API_KEY;
  const requestedGeminiModel = modelName || model || modelId || 'gemini-3.8-flash';

  if (geminiKey) {
    try {
      const aiResult = await generateGeminiContent(
        translationPrompt,
        requestedGeminiModel,
        typeof temperature === 'number' ? temperature : 0.1,
        'You are a high-speed, precise real-time chat translator. Always respond with strict, valid JSON only.',
        geminiKey
      );

      if (aiResult?.text) {
        const extracted = extractTranslatedText(aiResult.text);
        if (extracted && extracted.translatedText) {
          return res.json({
            success: true,
            translatedText: extracted.translatedText,
            detectedSourceLanguage: extracted.detectedSourceLanguage,
            targetLanguage: targetLangName,
            provider: `Google Gemini (${aiResult.model || requestedGeminiModel})`,
          });
        }
      }
    } catch (err: any) {
      console.warn('Gemini chat translation failed:', err?.message);
    }
  }

  // 3. Real High-Speed Neural Machine Translation Fallback (Google & MyMemory)
  try {
    const neuralResult = await neuralMachineTranslate(cleanText, targetCode, srcCode);
    if (neuralResult && neuralResult.translatedText) {
      const detectedName =
        CHAT_TRANSLATION_LANGUAGES[neuralResult.detectedSourceLanguage.toLowerCase()] ||
        neuralResult.detectedSourceLanguage;
      return res.json({
        success: true,
        translatedText: neuralResult.translatedText,
        detectedSourceLanguage: detectedName,
        targetLanguage: targetLangName,
        provider: 'Neural Translation',
      });
    }
  } catch (err: any) {
    console.warn('Neural translation fallback failed:', err?.message);
  }

  // 4. Return explicit failure error rather than deceiving user with untranslated text
  return res.status(502).json({
    success: false,
    error: `Unable to translate message into ${targetLangName}. Please check your AI model API key or network connection.`,
    targetLanguage: targetLangName,
  });
});

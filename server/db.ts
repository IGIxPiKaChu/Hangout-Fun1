import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  User,
  Room,
  RoomMessage,
  DirectConversation,
  DirectMessage,
  AppNotification,
  UserSettings,
  FriendRequest,
  RelationshipStatus,
} from '../src/types/index.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'app.sqlite');

export class Database {
  private sqlite: DatabaseSync;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    this.sqlite = new DatabaseSync(SQLITE_FILE);
    this.initSchema();
    this.migrateInitialData();
  }

  private initSchema(): void {
    this.sqlite.exec('PRAGMA journal_mode = WAL;');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    this.sqlite.exec('PRAGMA synchronous = NORMAL;');

    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        email TEXT UNIQUE NOT NULL COLLATE NOCASE,
        avatar_url TEXT NOT NULL,
        cover_url TEXT,
        bio TEXT,
        created_at TEXT NOT NULL,
        is_online INTEGER NOT NULL DEFAULT 0,
        last_seen TEXT NOT NULL,
        friends_json TEXT NOT NULL DEFAULT '[]',
        followers_count INTEGER NOT NULL DEFAULT 0,
        blocked_users_json TEXT NOT NULL DEFAULT '[]',
        saved_message_ids_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        banner_url TEXT NOT NULL,
        type TEXT NOT NULL,
        host_id TEXT NOT NULL,
        host_name TEXT NOT NULL,
        host_username TEXT NOT NULL,
        host_avatar TEXT NOT NULL,
        max_members INTEGER NOT NULL DEFAULT 20,
        allow_join_requests INTEGER NOT NULL DEFAULT 1,
        member_ids_json TEXT NOT NULL DEFAULT '[]',
        admin_ids_json TEXT NOT NULL DEFAULT '[]',
        banned_user_ids_json TEXT NOT NULL DEFAULT '[]',
        muted_user_ids_json TEXT NOT NULL DEFAULT '[]',
        allowed_media_user_ids_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        language TEXT NOT NULL DEFAULT 'English',
        upcoming_session_time TEXT,
        scheduled_at TEXT,
        is_scheduled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        current_media_json TEXT,
        media_sync_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
      CREATE INDEX IF NOT EXISTS idx_rooms_host ON rooms(host_id);

      CREATE TABLE IF NOT EXISTS room_messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_username TEXT NOT NULL,
        sender_avatar TEXT NOT NULL,
        content TEXT NOT NULL,
        attachment_url TEXT,
        media_type TEXT,
        media_title TEXT,
        sticker TEXT,
        timestamp TEXT NOT NULL,
        is_pinned INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_room_messages_room ON room_messages(room_id, timestamp);

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        participant_ids_json TEXT NOT NULL,
        last_message_json TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        content TEXT NOT NULL,
        attachment_url TEXT,
        media_type TEXT,
        media_title TEXT,
        sticker TEXT,
        timestamp TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        read_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_dm_conversation ON direct_messages(conversation_id, timestamp);

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        actor_id TEXT,
        actor_name TEXT,
        actor_avatar TEXT,
        actor_username TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        target_room_id TEXT,
        target_room_name TEXT,
        target_conversation_id TEXT,
        timestamp TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        status TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, timestamp);

      CREATE TABLE IF NOT EXISTS friend_requests (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL DEFAULT '',
        sender_username TEXT NOT NULL DEFAULT '',
        sender_avatar TEXT NOT NULL DEFAULT '',
        receiver_id TEXT NOT NULL,
        receiver_name TEXT,
        receiver_username TEXT,
        receiver_avatar TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_freq_pair ON friend_requests(sender_id, receiver_id);

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        settings_json TEXT NOT NULL
      );
    `);
  }

  private migrateInitialData(): void {
    const userCountStmt = this.sqlite.prepare('SELECT COUNT(*) as count FROM users');
    const result = userCountStmt.get() as { count: number };

    // If database contains users, ensure online presence is reset on restart
    if (result && result.count > 0) {
      this.sqlite.exec('UPDATE users SET is_online = 0;');
    }
  }

  // --- Users ---
  private rowToUser(row: any): User {
    return {
      id: row.id,
      fullName: row.full_name,
      username: row.username,
      email: row.email,
      avatarUrl: row.avatar_url,
      coverUrl: row.cover_url || undefined,
      bio: row.bio || undefined,
      createdAt: row.created_at,
      isOnline: Boolean(row.is_online),
      lastSeen: row.last_seen,
      friends: JSON.parse(row.friends_json || '[]'),
      followersCount: row.followers_count || 0,
      blockedUsers: JSON.parse(row.blocked_users_json || '[]'),
      savedMessageIds: JSON.parse(row.saved_message_ids_json || '[]'),
    };
  }

  getUsers(): User[] {
    const rows = this.sqlite.prepare('SELECT * FROM users').all();
    return rows.map((r) => this.rowToUser(r));
  }

  findUserById(id: string): User | undefined {
    const row = this.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? this.rowToUser(row) : undefined;
  }

  findUserByEmailOrUsername(emailOrUsername: string): User | undefined {
    const lower = emailOrUsername.toLowerCase().trim();
    const row = this.sqlite
      .prepare('SELECT * FROM users WHERE lower(email) = ? OR lower(username) = ?')
      .get(lower, lower);
    return row ? this.rowToUser(row) : undefined;
  }

  findUserByUsername(username: string): User | undefined {
    const clean = username.trim().toLowerCase().replace(/^@/, '');
    const row = this.sqlite.prepare('SELECT * FROM users WHERE lower(username) = ?').get(clean);
    return row ? this.rowToUser(row) : undefined;
  }

  createUser(user: User): User {
    const stmt = this.sqlite.prepare(`
      INSERT INTO users (
        id, full_name, username, email, avatar_url, cover_url, bio,
        created_at, is_online, last_seen, friends_json, followers_count,
        blocked_users_json, saved_message_ids_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      user.id,
      user.fullName,
      user.username,
      user.email,
      user.avatarUrl,
      user.coverUrl || null,
      user.bio || null,
      user.createdAt,
      user.isOnline ? 1 : 0,
      user.lastSeen,
      JSON.stringify(user.friends || []),
      user.followersCount || 0,
      JSON.stringify(user.blockedUsers || []),
      JSON.stringify(user.savedMessageIds || []),
    );
    return user;
  }

  updateUser(id: string, updates: Partial<User>): User | undefined {
    const current = this.findUserById(id);
    if (!current) return undefined;

    const merged: User = { ...current, ...updates };
    const stmt = this.sqlite.prepare(`
      UPDATE users SET
        full_name = ?,
        username = ?,
        email = ?,
        avatar_url = ?,
        cover_url = ?,
        bio = ?,
        is_online = ?,
        last_seen = ?,
        friends_json = ?,
        followers_count = ?,
        blocked_users_json = ?,
        saved_message_ids_json = ?
      WHERE id = ?
    `);

    stmt.run(
      merged.fullName,
      merged.username,
      merged.email,
      merged.avatarUrl,
      merged.coverUrl || null,
      merged.bio || null,
      merged.isOnline ? 1 : 0,
      merged.lastSeen,
      JSON.stringify(merged.friends || []),
      merged.followersCount || 0,
      JSON.stringify(merged.blockedUsers || []),
      JSON.stringify(merged.savedMessageIds || []),
      id,
    );
    return merged;
  }

  upsertUser(user: User): User {
    const existing = this.findUserById(user.id);
    if (existing) {
      return this.updateUser(user.id, user)!;
    }
    return this.createUser(user);
  }

  migrateUserId(oldId: string, newId: string): User | undefined {
    if (oldId === newId) return this.findUserById(newId);
    const existing = this.findUserById(oldId);
    if (!existing) return this.findUserById(newId);

    const target = this.findUserById(newId);
    if (target) {
      // If target record already exists, just return target
      return target;
    }

    try {
      this.sqlite.prepare('UPDATE users SET id = ? WHERE id = ?').run(newId, oldId);
      this.sqlite.prepare('UPDATE rooms SET host_id = ? WHERE host_id = ?').run(newId, oldId);
      this.sqlite.prepare('UPDATE room_messages SET sender_id = ? WHERE sender_id = ?').run(newId, oldId);
      this.sqlite.prepare('UPDATE direct_messages SET sender_id = ? WHERE sender_id = ?').run(newId, oldId);
      this.sqlite.prepare('UPDATE direct_messages SET receiver_id = ? WHERE receiver_id = ?').run(newId, oldId);
      this.sqlite.prepare('UPDATE friend_requests SET sender_id = ? WHERE sender_id = ?').run(newId, oldId);
      this.sqlite.prepare('UPDATE friend_requests SET receiver_id = ? WHERE receiver_id = ?').run(newId, oldId);
      this.sqlite.prepare('UPDATE notifications SET user_id = ? WHERE user_id = ?').run(newId, oldId);
      this.sqlite.prepare('UPDATE user_settings SET user_id = ? WHERE user_id = ?').run(newId, oldId);

      // Also update any friends JSON referencing oldId
      const allUsers = this.getUsers();
      for (const u of allUsers) {
        if (u.friends && u.friends.includes(oldId)) {
          const updatedFriends = u.friends.map((f) => (f === oldId ? newId : f));
          this.updateUser(u.id, { friends: updatedFriends });
        }
      }

      // Also update any rooms memberIds referencing oldId
      const allRooms = this.getRooms();
      for (const r of allRooms) {
        if (r.memberIds && r.memberIds.includes(oldId)) {
          const updatedMembers = r.memberIds.map((m) => (m === oldId ? newId : m));
          this.updateRoom(r.id, { memberIds: updatedMembers });
        }
      }
    } catch (err) {
      console.warn('[SQLite DB] migrateUserId error:', err);
    }

    return this.findUserById(newId);
  }

  // --- Rooms ---
  private rowToRoom(row: any): Room {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description || '',
      bannerUrl: row.banner_url,
      type: row.type as 'public' | 'private',
      hostId: row.host_id,
      hostName: row.host_name,
      hostUsername: row.host_username,
      hostAvatar: row.host_avatar,
      maxMembers: row.max_members,
      allowJoinRequests: Boolean(row.allow_join_requests),
      memberIds: JSON.parse(row.member_ids_json || '[]'),
      adminIds: JSON.parse(row.admin_ids_json || '[]'),
      bannedUserIds: JSON.parse(row.banned_user_ids_json || '[]'),
      mutedUserIds: JSON.parse(row.muted_user_ids_json || '[]'),
      allowedMediaUserIds: JSON.parse(row.allowed_media_user_ids_json || '[]'),
      tags: JSON.parse(row.tags_json || '[]'),
      language: row.language || 'English',
      upcomingSessionTime: row.upcoming_session_time || undefined,
      scheduledAt: row.scheduled_at || undefined,
      isScheduled: Boolean(row.is_scheduled),
      createdAt: row.created_at,
      isActive: Boolean(row.is_active),
      currentMedia: row.current_media_json ? JSON.parse(row.current_media_json) : null,
      mediaSync: row.media_sync_json ? JSON.parse(row.media_sync_json) : null,
    };
  }

  getRooms(): Room[] {
    const rows = this.sqlite.prepare('SELECT * FROM rooms ORDER BY created_at DESC').all();
    return rows.map((r) => this.rowToRoom(r));
  }

  findRoomById(id: string): Room | undefined {
    const row = this.sqlite.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    return row ? this.rowToRoom(row) : undefined;
  }

  findRoomByCode(code: string): Room | undefined {
    const row = this.sqlite.prepare('SELECT * FROM rooms WHERE upper(code) = ?').get(code.toUpperCase());
    return row ? this.rowToRoom(row) : undefined;
  }

  createRoom(room: Room): Room {
    const stmt = this.sqlite.prepare(`
      INSERT INTO rooms (
        id, code, name, description, banner_url, type, host_id, host_name,
        host_username, host_avatar, max_members, allow_join_requests,
        member_ids_json, admin_ids_json, banned_user_ids_json, muted_user_ids_json,
        allowed_media_user_ids_json, tags_json, language, upcoming_session_time,
        scheduled_at, is_scheduled, created_at, is_active, current_media_json, media_sync_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      room.id,
      room.code,
      room.name,
      room.description || '',
      room.bannerUrl,
      room.type,
      room.hostId,
      room.hostName,
      room.hostUsername,
      room.hostAvatar,
      room.maxMembers,
      room.allowJoinRequests ? 1 : 0,
      JSON.stringify(room.memberIds || []),
      JSON.stringify(room.adminIds || []),
      JSON.stringify(room.bannedUserIds || []),
      JSON.stringify(room.mutedUserIds || []),
      JSON.stringify(room.allowedMediaUserIds || []),
      JSON.stringify(room.tags || []),
      room.language || 'English',
      room.upcomingSessionTime || null,
      room.scheduledAt || null,
      room.isScheduled ? 1 : 0,
      room.createdAt,
      room.isActive ? 1 : 0,
      room.currentMedia ? JSON.stringify(room.currentMedia) : null,
      room.mediaSync ? JSON.stringify(room.mediaSync) : null,
    );
    return room;
  }

  updateRoom(id: string, updates: Partial<Room>): Room | undefined {
    const current = this.findRoomById(id);
    if (!current) return undefined;

    const merged: Room = { ...current, ...updates };
    const stmt = this.sqlite.prepare(`
      UPDATE rooms SET
        name = ?,
        description = ?,
        banner_url = ?,
        type = ?,
        host_id = ?,
        host_name = ?,
        host_username = ?,
        host_avatar = ?,
        max_members = ?,
        allow_join_requests = ?,
        member_ids_json = ?,
        admin_ids_json = ?,
        banned_user_ids_json = ?,
        muted_user_ids_json = ?,
        allowed_media_user_ids_json = ?,
        tags_json = ?,
        language = ?,
        upcoming_session_time = ?,
        scheduled_at = ?,
        is_scheduled = ?,
        is_active = ?,
        current_media_json = ?,
        media_sync_json = ?
      WHERE id = ?
    `);

    stmt.run(
      merged.name,
      merged.description || '',
      merged.bannerUrl,
      merged.type,
      merged.hostId,
      merged.hostName,
      merged.hostUsername,
      merged.hostAvatar,
      merged.maxMembers,
      merged.allowJoinRequests ? 1 : 0,
      JSON.stringify(merged.memberIds || []),
      JSON.stringify(merged.adminIds || []),
      JSON.stringify(merged.bannedUserIds || []),
      JSON.stringify(merged.mutedUserIds || []),
      JSON.stringify(merged.allowedMediaUserIds || []),
      JSON.stringify(merged.tags || []),
      merged.language || 'English',
      merged.upcomingSessionTime || null,
      merged.scheduledAt || null,
      merged.isScheduled ? 1 : 0,
      merged.isActive ? 1 : 0,
      merged.currentMedia ? JSON.stringify(merged.currentMedia) : null,
      merged.mediaSync ? JSON.stringify(merged.mediaSync) : null,
      id,
    );
    return merged;
  }

  deleteRoom(id: string): boolean {
    const res = this.sqlite.prepare('DELETE FROM rooms WHERE id = ?').run(id);
    this.sqlite.prepare('DELETE FROM room_messages WHERE room_id = ?').run(id);
    return res.changes > 0;
  }

  // --- Room Messages ---
  private rowToRoomMessage(row: any): RoomMessage {
    return {
      id: row.id,
      roomId: row.room_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderUsername: row.sender_username,
      senderAvatar: row.sender_avatar,
      content: row.content,
      attachmentUrl: row.attachment_url || undefined,
      mediaType: row.media_type || undefined,
      mediaTitle: row.media_title || undefined,
      sticker: row.sticker || undefined,
      timestamp: row.timestamp,
    };
  }

  getRoomMessages(roomId: string): RoomMessage[] {
    const rows = this.sqlite
      .prepare('SELECT * FROM room_messages WHERE room_id = ? ORDER BY timestamp ASC')
      .all(roomId);
    return rows.map((r) => this.rowToRoomMessage(r));
  }

  createRoomMessage(message: RoomMessage): RoomMessage {
    const stmt = this.sqlite.prepare(`
      INSERT INTO room_messages (
        id, room_id, sender_id, sender_name, sender_username, sender_avatar,
        content, attachment_url, media_type, media_title, sticker, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.roomId,
      message.senderId,
      message.senderName,
      message.senderUsername,
      message.senderAvatar,
      message.content,
      message.attachmentUrl || null,
      message.mediaType || null,
      message.mediaTitle || null,
      message.sticker || null,
      message.timestamp,
    );
    return message;
  }

  // --- Direct Conversations ---
  private rowToConversation(row: any): DirectConversation {
    return {
      id: row.id,
      participantIds: JSON.parse(row.participant_ids_json || '[]'),
      lastMessage: row.last_message_json ? JSON.parse(row.last_message_json) : undefined,
      updatedAt: row.updated_at,
    };
  }

  getConversationsForUser(userId: string): (DirectConversation & { unreadCount: number })[] {
    const rows = this.sqlite.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();
    const convs = rows.map((r) => this.rowToConversation(r)).filter((c) => c.participantIds.includes(userId));

    const unreadStmt = this.sqlite.prepare(
      'SELECT COUNT(*) as count FROM direct_messages WHERE conversation_id = ? AND receiver_id = ? AND read = 0',
    );
    const latestMsgStmt = this.sqlite.prepare(
      'SELECT * FROM direct_messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT 1',
    );

    return convs.map((conv) => {
      const unreadRow = unreadStmt.get(conv.id, userId) as { count: number };
      const latestRow = latestMsgStmt.get(conv.id) as any;

      let lastMessage = conv.lastMessage;
      if (latestRow) {
        lastMessage = {
          senderId: latestRow.sender_id,
          content: latestRow.content || (latestRow.sticker ? latestRow.sticker : 'Attachment'),
          timestamp: latestRow.timestamp,
          read: Boolean(latestRow.read),
          readAt: latestRow.read_at || undefined,
        };
      }

      return {
        ...conv,
        lastMessage,
        unreadCount: unreadRow ? unreadRow.count : 0,
      };
    });
  }

  findConversationById(id: string): DirectConversation | undefined {
    const row = this.sqlite.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    return row ? this.rowToConversation(row) : undefined;
  }

  findOrCreateConversation(userId1: string, userId2: string): DirectConversation {
    const sortedIds = [userId1, userId2].sort();
    const convId = `conv_${sortedIds[0]}_${sortedIds[1]}`;

    const existing = this.findConversationById(convId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const newConv: DirectConversation = {
      id: convId,
      participantIds: sortedIds,
      updatedAt: now,
    };

    this.sqlite
      .prepare(
        'INSERT INTO conversations (id, participant_ids_json, last_message_json, updated_at) VALUES (?, ?, ?, ?)',
      )
      .run(newConv.id, JSON.stringify(newConv.participantIds), null, newConv.updatedAt);

    return newConv;
  }

  // --- Direct Messages ---
  private rowToDirectMessage(row: any): DirectMessage {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      content: row.content,
      attachmentUrl: row.attachment_url || undefined,
      mediaType: row.media_type || undefined,
      mediaTitle: row.media_title || undefined,
      sticker: row.sticker || undefined,
      timestamp: row.timestamp,
      read: Boolean(row.read),
      readAt: row.read_at || undefined,
    };
  }

  getDirectMessages(conversationId: string): DirectMessage[] {
    const rows = this.sqlite
      .prepare('SELECT * FROM direct_messages WHERE conversation_id = ? ORDER BY timestamp ASC')
      .all(conversationId);
    return rows.map((r) => this.rowToDirectMessage(r));
  }

  createDirectMessage(message: DirectMessage): DirectMessage {
    const stmt = this.sqlite.prepare(`
      INSERT INTO direct_messages (
        id, conversation_id, sender_id, receiver_id, content,
        attachment_url, media_type, media_title, sticker, timestamp, read, read_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.conversationId,
      message.senderId,
      message.receiverId,
      message.content,
      message.attachmentUrl || null,
      message.mediaType || null,
      message.mediaTitle || null,
      message.sticker || null,
      message.timestamp,
      message.read ? 1 : 0,
      message.readAt || null,
    );

    const lastMessage = {
      senderId: message.senderId,
      content: message.content || (message.sticker ? message.sticker : 'Attachment'),
      timestamp: message.timestamp,
      read: message.read,
      readAt: message.readAt,
    };

    this.sqlite
      .prepare('UPDATE conversations SET last_message_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(lastMessage), message.timestamp, message.conversationId);

    return message;
  }

  markConversationMessagesRead(conversationId: string, readerUserId: string): number {
    const nowIso = new Date().toISOString();
    const res = this.sqlite
      .prepare(
        'UPDATE direct_messages SET read = 1, read_at = ? WHERE conversation_id = ? AND receiver_id = ? AND read = 0',
      )
      .run(nowIso, conversationId, readerUserId);

    if (res.changes > 0) {
      const conv = this.findConversationById(conversationId);
      if (conv?.lastMessage && conv.lastMessage.senderId !== readerUserId) {
        conv.lastMessage.read = true;
        conv.lastMessage.readAt = nowIso;
        this.sqlite
          .prepare('UPDATE conversations SET last_message_json = ? WHERE id = ?')
          .run(JSON.stringify(conv.lastMessage), conversationId);
      }
    }

    return Number(res.changes);
  }

  // --- Notifications ---
  private rowToNotification(row: any): AppNotification {
    return {
      id: row.id,
      userId: row.user_id,
      actorId: row.actor_id || undefined,
      actorName: row.actor_name || undefined,
      actorAvatar: row.actor_avatar || undefined,
      actorUsername: row.actor_username || undefined,
      type: row.type as any,
      title: row.title,
      description: row.description,
      targetRoomId: row.target_room_id || undefined,
      targetRoomName: row.target_room_name || undefined,
      targetConversationId: row.target_conversation_id || undefined,
      timestamp: row.timestamp,
      isRead: Boolean(row.is_read),
      status: row.status || undefined,
    };
  }

  getNotificationsForUser(userId: string): AppNotification[] {
    const rows = this.sqlite
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY timestamp DESC')
      .all(userId);
    const list = rows.map((r) => this.rowToNotification(r));

    return list.map((notif) => {
      if (notif.actorId) {
        const actor = this.findUserById(notif.actorId);
        if (actor) {
          return {
            ...notif,
            actorName: actor.fullName || notif.actorName,
            actorUsername: actor.username || notif.actorUsername,
            actorAvatar: actor.avatarUrl || notif.actorAvatar,
          };
        }
      }
      return notif;
    });
  }

  queryNotifications(
    userId: string,
    options?: { limit?: number; offset?: number; type?: string },
  ): { notifications: AppNotification[]; total: number; unreadCount: number } {
    let baseSql = 'SELECT * FROM notifications WHERE user_id = ?';
    const params: any[] = [userId];

    if (options?.type && options.type !== 'all') {
      if (options.type === 'mentions') {
        baseSql += " AND (type = 'mention' OR type = 'direct_message')";
      } else if (options.type === 'invites') {
        baseSql += " AND (type = 'invite' OR type = 'friend_request')";
      } else if (options.type === 'system') {
        baseSql += " AND type = 'system'";
      } else {
        baseSql += ' AND type = ?';
        params.push(options.type);
      }
    }

    baseSql += ' ORDER BY timestamp DESC';
    const allRows = this.sqlite.prepare(baseSql).all(...params);
    const total = allRows.length;

    const unreadRow = this.sqlite
      .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(userId) as { count: number };
    const unreadCount = unreadRow ? unreadRow.count : 0;

    const offset = Math.max(0, options?.offset || 0);
    const limit = Math.min(100, Math.max(1, options?.limit || 30));
    const pagedRows = allRows.slice(offset, offset + limit);

    const hydrated = pagedRows.map((r) => {
      const notif = this.rowToNotification(r);
      if (notif.actorId) {
        const actor = this.findUserById(notif.actorId);
        if (actor) {
          return {
            ...notif,
            actorName: actor.fullName || notif.actorName,
            actorUsername: actor.username || notif.actorUsername,
            actorAvatar: actor.avatarUrl || notif.actorAvatar,
          };
        }
      }
      return notif;
    });

    return {
      notifications: hydrated,
      total,
      unreadCount,
    };
  }

  getUnreadNotificationCount(userId: string): number {
    const row = this.sqlite
      .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(userId) as { count: number };
    return row ? row.count : 0;
  }

  findNotificationById(id: string): AppNotification | undefined {
    const row = this.sqlite.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    return row ? this.rowToNotification(row) : undefined;
  }

  createNotification(notification: AppNotification): AppNotification {
    // Deduplication check for pending friend requests
    if (notification.type === 'friend_request' && notification.status === 'pending') {
      const existing = this.sqlite
        .prepare(
          "SELECT id FROM notifications WHERE user_id = ? AND actor_id = ? AND type = 'friend_request' AND status = 'pending'",
        )
        .get(notification.userId, notification.actorId || '') as { id: string } | undefined;

      if (existing) {
        this.sqlite
          .prepare('UPDATE notifications SET timestamp = ?, is_read = 0, description = ? WHERE id = ?')
          .run(notification.timestamp, notification.description, existing.id);
        return this.findNotificationById(existing.id)!;
      }
    }

    // Deduplication check for unread room invites
    if (notification.type === 'invite' && notification.targetRoomId) {
      const existing = this.sqlite
        .prepare(
          "SELECT id FROM notifications WHERE user_id = ? AND actor_id = ? AND target_room_id = ? AND type = 'invite' AND is_read = 0",
        )
        .get(notification.userId, notification.actorId || '', notification.targetRoomId) as { id: string } | undefined;

      if (existing) {
        this.sqlite
          .prepare('UPDATE notifications SET timestamp = ?, description = ? WHERE id = ?')
          .run(notification.timestamp, notification.description, existing.id);
        return this.findNotificationById(existing.id)!;
      }
    }

    const stmt = this.sqlite.prepare(`
      INSERT INTO notifications (
        id, user_id, actor_id, actor_name, actor_avatar, actor_username,
        type, title, description, target_room_id, target_room_name,
        target_conversation_id, timestamp, is_read, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      notification.id,
      notification.userId,
      notification.actorId || null,
      notification.actorName || null,
      notification.actorAvatar || null,
      notification.actorUsername || null,
      notification.type,
      notification.title,
      notification.description,
      notification.targetRoomId || null,
      notification.targetRoomName || null,
      notification.targetConversationId || null,
      notification.timestamp,
      notification.isRead ? 1 : 0,
      notification.status || null,
    );

    return notification;
  }

  updateNotification(id: string, updates: Partial<AppNotification>): AppNotification | undefined {
    const current = this.findNotificationById(id);
    if (!current) return undefined;

    const merged: AppNotification = { ...current, ...updates };
    this.sqlite
      .prepare(
        'UPDATE notifications SET title = ?, description = ?, is_read = ?, status = ? WHERE id = ?',
      )
      .run(merged.title, merged.description, merged.isRead ? 1 : 0, merged.status || null, id);

    return merged;
  }

  deleteNotification(id: string): boolean {
    const res = this.sqlite.prepare('DELETE FROM notifications WHERE id = ?').run(id);
    return res.changes > 0;
  }

  markAllNotificationsRead(userId: string): number {
    const res = this.sqlite
      .prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
      .run(userId);
    return Number(res.changes);
  }

  // --- Settings ---
  getUserSettings(userId: string): UserSettings {
    const row = this.sqlite.prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').get(userId) as
      | { settings_json: string }
      | undefined;

    if (row && row.settings_json) {
      try {
        return JSON.parse(row.settings_json);
      } catch {}
    }

    const defaults: UserSettings = {
      appearance: 'dark',
      pushNotifications: true,
      emailNotifications: true,
      roomInvites: true,
      directMessages: 'everyone',
      activityStatus: true,
      language: 'en',
      doNotDisturb: false,
    };

    this.sqlite
      .prepare('INSERT OR REPLACE INTO user_settings (user_id, settings_json) VALUES (?, ?)')
      .run(userId, JSON.stringify(defaults));

    return defaults;
  }

  updateUserSettings(userId: string, updates: Partial<UserSettings>): UserSettings {
    const current = this.getUserSettings(userId);
    const merged: UserSettings = { ...current, ...updates };

    this.sqlite
      .prepare('INSERT OR REPLACE INTO user_settings (user_id, settings_json) VALUES (?, ?)')
      .run(userId, JSON.stringify(merged));

    return merged;
  }

  // --- Friends & Social Graph ---
  getFriends(userId: string): User[] {
    const user = this.findUserById(userId);
    if (!user) return [];
    const friendsList = user.friends || [];
    const blocked = new Set(user.blockedUsers || []);

    return friendsList
      .map((fid) => this.findUserById(fid))
      .filter((u): u is User => {
        if (!u) return false;
        if (blocked.has(u.id)) return false;
        if (u.blockedUsers?.includes(userId)) return false;
        return true;
      });
  }

  getFriendRequests(): FriendRequest[] {
    const rows = this.sqlite.prepare('SELECT * FROM friend_requests ORDER BY created_at DESC').all();
    return rows.map((r: any) => ({
      id: r.id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderUsername: r.sender_username,
      senderAvatar: r.sender_avatar,
      receiverId: r.receiver_id,
      receiverName: r.receiver_name || undefined,
      receiverUsername: r.receiver_username || undefined,
      receiverAvatar: r.receiver_avatar || undefined,
      status: r.status as any,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  findFriendRequestById(id: string): FriendRequest | undefined {
    const r: any = this.sqlite.prepare('SELECT * FROM friend_requests WHERE id = ?').get(id);
    if (!r) return undefined;
    return {
      id: r.id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderUsername: r.sender_username,
      senderAvatar: r.sender_avatar,
      receiverId: r.receiver_id,
      receiverName: r.receiver_name || undefined,
      receiverUsername: r.receiver_username || undefined,
      receiverAvatar: r.receiver_avatar || undefined,
      status: r.status as any,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  getPendingRequestBetween(userAId: string, userBId: string): FriendRequest | undefined {
    const r: any = this.sqlite
      .prepare(
        "SELECT * FROM friend_requests WHERE status = 'pending' AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))",
      )
      .get(userAId, userBId, userBId, userAId);

    if (!r) return undefined;
    return {
      id: r.id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderUsername: r.sender_username,
      senderAvatar: r.sender_avatar,
      receiverId: r.receiver_id,
      receiverName: r.receiver_name || undefined,
      receiverUsername: r.receiver_username || undefined,
      receiverAvatar: r.receiver_avatar || undefined,
      status: r.status as any,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  getIncomingFriendRequests(userId: string): FriendRequest[] {
    const rows = this.sqlite
      .prepare("SELECT * FROM friend_requests WHERE receiver_id = ? AND status = 'pending' ORDER BY created_at DESC")
      .all(userId);
    return rows.map((r: any) => ({
      id: r.id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderUsername: r.sender_username,
      senderAvatar: r.sender_avatar,
      receiverId: r.receiver_id,
      receiverName: r.receiver_name || undefined,
      receiverUsername: r.receiver_username || undefined,
      receiverAvatar: r.receiver_avatar || undefined,
      status: r.status as any,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  getOutgoingFriendRequests(userId: string): FriendRequest[] {
    const rows = this.sqlite
      .prepare("SELECT * FROM friend_requests WHERE sender_id = ? AND status = 'pending' ORDER BY created_at DESC")
      .all(userId);
    return rows.map((r: any) => ({
      id: r.id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderUsername: r.sender_username,
      senderAvatar: r.sender_avatar,
      receiverId: r.receiver_id,
      receiverName: r.receiver_name || undefined,
      receiverUsername: r.receiver_username || undefined,
      receiverAvatar: r.receiver_avatar || undefined,
      status: r.status as any,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  createFriendRequest(request: Partial<FriendRequest> & { senderId: string; receiverId: string }): FriendRequest {
    const newRequest: FriendRequest = {
      id: request.id || `freq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      senderId: request.senderId,
      senderName: request.senderName || '',
      senderUsername: request.senderUsername || '',
      senderAvatar: request.senderAvatar || '',
      receiverId: request.receiverId,
      receiverName: request.receiverName,
      receiverUsername: request.receiverUsername,
      receiverAvatar: request.receiverAvatar,
      status: request.status || 'pending',
      createdAt: request.createdAt || new Date().toISOString(),
      updatedAt: request.updatedAt || new Date().toISOString(),
    };

    const stmt = this.sqlite.prepare(`
      INSERT INTO friend_requests (
        id, sender_id, sender_name, sender_username, sender_avatar,
        receiver_id, receiver_name, receiver_username, receiver_avatar,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      newRequest.id,
      newRequest.senderId,
      newRequest.senderName,
      newRequest.senderUsername,
      newRequest.senderAvatar,
      newRequest.receiverId,
      newRequest.receiverName || null,
      newRequest.receiverUsername || null,
      newRequest.receiverAvatar || null,
      newRequest.status,
      newRequest.createdAt,
      newRequest.updatedAt,
    );

    return newRequest;
  }

  updateFriendRequest(id: string, updates: Partial<FriendRequest>): FriendRequest | undefined {
    const current = this.findFriendRequestById(id);
    if (!current) return undefined;

    const merged: FriendRequest = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.sqlite
      .prepare('UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ?')
      .run(merged.status, merged.updatedAt, id);

    return merged;
  }

  deleteFriendRequest(id: string): boolean {
    const res = this.sqlite.prepare('DELETE FROM friend_requests WHERE id = ?').run(id);
    return res.changes > 0;
  }

  addFriendship(userAId: string, userBId: string): boolean {
    const userA = this.findUserById(userAId);
    const userB = this.findUserById(userBId);
    if (!userA || !userB) return false;

    if (userA.blockedUsers?.includes(userBId) || userB.blockedUsers?.includes(userAId)) {
      return false;
    }

    const nextAFriends = Array.from(new Set([...(userA.friends || []), userBId]));
    const nextBFriends = Array.from(new Set([...(userB.friends || []), userAId]));

    this.updateUser(userAId, { friends: nextAFriends });
    this.updateUser(userBId, { friends: nextBFriends });

    // Mark pending request as accepted
    this.sqlite
      .prepare(
        "UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE status = 'pending' AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))",
      )
      .run(new Date().toISOString(), userAId, userBId, userBId, userAId);

    return true;
  }

  removeFriendship(userAId: string, userBId: string): boolean {
    const userA = this.findUserById(userAId);
    const userB = this.findUserById(userBId);
    if (userA) {
      this.updateUser(userAId, { friends: (userA.friends || []).filter((id) => id !== userBId) });
    }
    if (userB) {
      this.updateUser(userBId, { friends: (userB.friends || []).filter((id) => id !== userAId) });
    }

    // Mark pending requests as cancelled
    this.sqlite
      .prepare(
        "UPDATE friend_requests SET status = 'cancelled', updated_at = ? WHERE status = 'pending' AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))",
      )
      .run(new Date().toISOString(), userAId, userBId, userBId, userAId);

    return true;
  }

  blockUser(blockerId: string, targetId: string): boolean {
    if (blockerId === targetId) return false;
    const blocker = this.findUserById(blockerId);
    if (!blocker) return false;

    const nextBlocked = Array.from(new Set([...(blocker.blockedUsers || []), targetId]));
    const nextBlockerFriends = (blocker.friends || []).filter((id) => id !== targetId);
    this.updateUser(blockerId, { blockedUsers: nextBlocked, friends: nextBlockerFriends });

    const target = this.findUserById(targetId);
    if (target) {
      const nextTargetFriends = (target.friends || []).filter((id) => id !== blockerId);
      this.updateUser(targetId, { friends: nextTargetFriends });
    }

    this.sqlite
      .prepare(
        "UPDATE friend_requests SET status = 'cancelled', updated_at = ? WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)",
      )
      .run(new Date().toISOString(), blockerId, targetId, targetId, blockerId);

    return true;
  }

  unblockUser(blockerId: string, targetId: string): boolean {
    const blocker = this.findUserById(blockerId);
    if (!blocker) return false;

    const nextBlocked = (blocker.blockedUsers || []).filter((id) => id !== targetId);
    this.updateUser(blockerId, { blockedUsers: nextBlocked });
    return true;
  }

  getBlockedUsers(userId: string): User[] {
    const user = this.findUserById(userId);
    if (!user || !user.blockedUsers) return [];
    return user.blockedUsers
      .map((id) => this.findUserById(id))
      .filter((u): u is User => u !== undefined);
  }

  isBlockedBetween(userAId: string, userBId: string): boolean {
    const userA = this.findUserById(userAId);
    const userB = this.findUserById(userBId);
    if (userA?.blockedUsers?.includes(userBId)) return true;
    if (userB?.blockedUsers?.includes(userAId)) return true;
    return false;
  }

  areFriends(userAId: string, userBId: string): boolean {
    const userA = this.findUserById(userAId);
    return Boolean(userA?.friends?.includes(userBId));
  }

  getRelationshipStatus(sourceUserId: string, targetUserId: string): RelationshipStatus {
    if (sourceUserId === targetUserId) return 'none';
    const source = this.findUserById(sourceUserId);
    const target = this.findUserById(targetUserId);
    if (!source || !target) return 'none';

    if (source.blockedUsers?.includes(targetUserId)) return 'blocked';
    if (target.blockedUsers?.includes(sourceUserId)) return 'blocked_by';
    if (source.friends?.includes(targetUserId) && target.friends?.includes(sourceUserId)) {
      return 'friends';
    }

    const pending = this.getPendingRequestBetween(sourceUserId, targetUserId);
    if (pending) {
      if (pending.senderId === sourceUserId) return 'outgoing_request';
      if (pending.receiverId === sourceUserId) return 'incoming_request';
    }

    return 'none';
  }
}

export const db = new Database();

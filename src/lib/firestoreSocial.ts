import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase.ts';
import type { User, FriendRequest, RelationshipStatus } from '../types/index.ts';

/**
 * Direct Firestore service to handle user searching, friends, and friend requests.
 * This ensures that on static deployments (like Vercel or any free hosting)
 * users can always search and add friends even if the Express backend is not accessible.
 */
export const firestoreSocial = {
  // 1. Sync / Save user profile to Firestore
  async saveUserProfile(user: User): Promise<void> {
    try {
      if (!user?.id) return;
      const userRef = doc(db, 'users', user.id);
      await setDoc(
        userRef,
        {
          id: user.id,
          fullName: user.fullName || 'User',
          username: user.username || user.id.substring(0, 8),
          email: user.email || '',
          avatarUrl: user.avatarUrl || '',
          bio: user.bio || '',
          coverUrl: user.coverUrl || '',
          role: user.role || 'user',
          status: user.status || 'online',
          isOnline: true,
          lastSeen: new Date().toISOString(),
          friends: Array.isArray(user.friends) ? user.friends : [],
          followersCount: user.followersCount || 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Firestore user profile save note:', err);
    }
  },

  // 2. Search / Get all registered users from Firestore
  async searchUsers(searchQuery?: string, limitCount = 50): Promise<User[]> {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, limit(limitCount));
      const snapshot = await getDocs(q);

      const users: User[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        users.push({
          id: docSnap.id,
          fullName: data.fullName || 'User',
          username: data.username || docSnap.id.substring(0, 8),
          email: data.email || '',
          avatarUrl: data.avatarUrl || '',
          bio: data.bio || '',
          coverUrl: data.coverUrl || '',
          role: data.role || 'user',
          status: data.status || 'online',
          isOnline: Boolean(data.isOnline),
          lastSeen: data.lastSeen,
          friends: Array.isArray(data.friends) ? data.friends : [],
          followersCount: data.followersCount || 0,
          createdAt: data.createdAt || new Date().toISOString(),
        });
      });

      if (searchQuery && searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase().trim().replace(/^@+/, '');
        if (!queryLower) return users;
        return users.filter(
          (u) =>
            u.fullName.toLowerCase().includes(queryLower) ||
            u.username.toLowerCase().includes(queryLower)
        );
      }

      return users;
    } catch (err) {
      console.warn('Firestore searchUsers note:', err);
      return [];
    }
  },

  // 3. Get friends for a user
  async getFriends(currentUserId: string): Promise<User[]> {
    try {
      const userRef = doc(db, 'users', currentUserId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return [];

      const friendIds: string[] = userSnap.data()?.friends || [];
      if (!friendIds || friendIds.length === 0) return [];

      const friends: User[] = [];
      for (const fId of friendIds) {
        const fSnap = await getDoc(doc(db, 'users', fId));
        if (fSnap.exists()) {
          const data = fSnap.data();
          friends.push({
            id: fSnap.id,
            fullName: data.fullName || 'User',
            username: data.username || fSnap.id.substring(0, 8),
            email: data.email || '',
            avatarUrl: data.avatarUrl || '',
            bio: data.bio || '',
            role: data.role || 'user',
            status: data.status || 'offline',
            isOnline: Boolean(data.isOnline),
            lastSeen: data.lastSeen,
            friends: data.friends || [],
            followersCount: data.followersCount || 0,
            createdAt: data.createdAt || new Date().toISOString(),
          });
        }
      }
      return friends;
    } catch (err) {
      console.warn('Firestore getFriends note:', err);
      return [];
    }
  },

  // 4. Get incoming and outgoing friend requests
  async getFriendRequests(currentUserId: string): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
    try {
      const requestsRef = collection(db, 'friendRequests');
      
      const inQuery = query(requestsRef, where('receiverId', '==', currentUserId));
      const outQuery = query(requestsRef, where('senderId', '==', currentUserId));

      const [inSnap, outSnap] = await Promise.all([getDocs(inQuery), getDocs(outQuery)]);

      const incoming: FriendRequest[] = [];
      inSnap.forEach((d) => {
        const data = d.data();
        incoming.push({
          id: d.id,
          senderId: data.senderId,
          receiverId: data.receiverId,
          senderName: data.senderName || 'User',
          senderUsername: data.senderUsername || 'user',
          senderAvatar: data.senderAvatar || '',
          createdAt: data.createdAt || new Date().toISOString(),
        });
      });

      const outgoing: FriendRequest[] = [];
      outSnap.forEach((d) => {
        const data = d.data();
        outgoing.push({
          id: d.id,
          senderId: data.senderId,
          receiverId: data.receiverId,
          senderName: data.senderName || 'User',
          senderUsername: data.senderUsername || 'user',
          senderAvatar: data.senderAvatar || '',
          createdAt: data.createdAt || new Date().toISOString(),
        });
      });

      return { incoming, outgoing };
    } catch (err) {
      console.warn('Firestore getFriendRequests note:', err);
      return { incoming: [], outgoing: [] };
    }
  },

  // 5. Send Friend Request
  async sendFriendRequest(
    currentUser: User,
    targetUser: User
  ): Promise<{ success: boolean; request: FriendRequest; relationship: RelationshipStatus }> {
    const requestId = `fr_${currentUser.id}_${targetUser.id}`;
    const reverseRequestId = `fr_${targetUser.id}_${currentUser.id}`;

    // Check if reverse request exists (auto-accept mutual request)
    const reverseSnap = await getDoc(doc(db, 'friendRequests', reverseRequestId));
    if (reverseSnap.exists()) {
      await deleteDoc(doc(db, 'friendRequests', reverseRequestId));
      
      // Make both users friends
      await updateDoc(doc(db, 'users', currentUser.id), {
        friends: arrayUnion(targetUser.id),
      });
      await updateDoc(doc(db, 'users', targetUser.id), {
        friends: arrayUnion(currentUser.id),
      });

      return {
        success: true,
        request: {
          id: requestId,
          senderId: currentUser.id,
          receiverId: targetUser.id,
          senderName: currentUser.fullName,
          senderUsername: currentUser.username,
          senderAvatar: currentUser.avatarUrl,
          createdAt: new Date().toISOString(),
        },
        relationship: 'friends',
      };
    }

    const reqData: FriendRequest = {
      id: requestId,
      senderId: currentUser.id,
      receiverId: targetUser.id,
      senderName: currentUser.fullName,
      senderUsername: currentUser.username,
      senderAvatar: currentUser.avatarUrl,
      createdAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'friendRequests', requestId), {
      ...reqData,
      timestamp: serverTimestamp(),
    });

    return {
      success: true,
      request: reqData,
      relationship: 'outgoing_request',
    };
  },

  // 6. Accept Friend Request
  async acceptFriendRequest(requestId: string, currentUserId: string): Promise<void> {
    const reqRef = doc(db, 'friendRequests', requestId);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) return;

    const data = reqSnap.data();
    const senderId = data.senderId;

    await deleteDoc(reqRef);

    // Mutual friendship update
    await updateDoc(doc(db, 'users', currentUserId), {
      friends: arrayUnion(senderId),
    });
    await updateDoc(doc(db, 'users', senderId), {
      friends: arrayUnion(currentUserId),
    });
  },

  // 7. Reject or Cancel Friend Request
  async deleteFriendRequest(requestId: string): Promise<void> {
    await deleteDoc(doc(db, 'friendRequests', requestId));
  },

  // 8. Remove Friend
  async removeFriend(currentUserId: string, targetUserId: string): Promise<void> {
    await updateDoc(doc(db, 'users', currentUserId), {
      friends: arrayRemove(targetUserId),
    });
    await updateDoc(doc(db, 'users', targetUserId), {
      friends: arrayRemove(currentUserId),
    });
  },
};

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile as firebaseUpdateProfile,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  type User as FirebaseUser,
} from 'firebase/auth';
import type { User } from '../types/index.ts';
import { auth } from '../lib/firebase.ts';
import { api } from '../services/api.ts';

interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  error: string | null;
  login: (emailOrUsername: string, password: string) => Promise<boolean>;
  signup: (fullName: string, username: string, email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<boolean>;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Clean legacy localStorage credentials if any exist
  useEffect(() => {
    localStorage.removeItem('social_hangout_session_user');
  }, []);

  // Listen to authoritative Firebase Authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        // If there's an active token stored from username login:
        const storedToken = localStorage.getItem('vibesphere_auth_token');
        if (storedToken) {
          try {
            const syncRes = await api.syncAuthUser({});
            if (syncRes?.user) {
              setCurrentUser(syncRes.user);
              setIsLoading(false);
              return;
            }
          } catch {
            localStorage.removeItem('vibesphere_auth_token');
          }
        }
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }

      try {
        // Authenticated user session active: sync verified profile with backend
        const syncRes = await api.syncAuthUser({
          fullName: fbUser.displayName || undefined,
          email: fbUser.email || undefined,
        });

        if (syncRes?.user) {
          setCurrentUser(syncRes.user);
        }
      } catch (err) {
        console.error('Failed to sync authenticated user profile:', err);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (emailOrUsername: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const input = emailOrUsername.trim();

      // If user provided a username without '@', log in via authoritative server route
      if (!input.includes('@')) {
        try {
          const authRes = await api.loginWithUsername(input, password);
          if (authRes?.idToken && authRes?.user) {
            localStorage.setItem('vibesphere_auth_token', authRes.idToken);
            setCurrentUser(authRes.user);
            return true;
          }
          setError('Invalid username or password.');
          return false;
        } catch (err: any) {
          setError(err?.message || 'Invalid username or password.');
          return false;
        }
      }

      // Authoritative credential verification by Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, input, password);
      const fbUser = userCredential.user;

      // Sync verified profile with backend using authoritative token
      const syncRes = await api.syncAuthUser({
        email: fbUser.email || undefined,
      });

      if (syncRes?.user) {
        setCurrentUser(syncRes.user);
      }

      return true;
    } catch (err: any) {
      let friendlyMessage = 'Login failed. Please check your credentials.';
      const code = err?.code || '';

      if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        friendlyMessage = 'Invalid email or password. Please try again.';
      } else if (code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      } else if (code === 'auth/user-disabled') {
        friendlyMessage = 'This account has been disabled. Please contact support.';
      } else if (code === 'auth/too-many-requests') {
        friendlyMessage = 'Too many failed attempts. Please wait a moment before trying again.';
      } else if (code === 'auth/operation-not-allowed') {
        friendlyMessage = 'Email/Password sign-in is disabled in Firebase Console. Please click "Continue with Google".';
      } else if (err?.message) {
        friendlyMessage = err.message;
      }

      setError(friendlyMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    fullName: string,
    username: string,
    email: string,
    password: string,
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    const cleanName = fullName.trim();
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      setError('Please enter your full name.');
      setIsLoading(false);
      return false;
    }

    if (!cleanUsername || cleanUsername.length < 3) {
      setError('Username must be at least 3 characters (letters, numbers, underscores).');
      setIsLoading(false);
      return false;
    }

    try {
      // 1. Authoritative user creation via Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const fbUser = userCredential.user;

      const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanUsername)}`;

      // 2. Set display name and photoURL in Firebase Auth profile
      try {
        await firebaseUpdateProfile(fbUser, {
          displayName: cleanName,
          photoURL: avatarUrl,
        });
      } catch (profileErr) {
        console.warn('Firebase profile update note:', profileErr);
      }

      // 3. Register user profile in backend database
      const syncRes = await api.syncAuthUser({
        fullName: cleanName,
        username: cleanUsername,
        email: cleanEmail,
        avatarUrl,
      });

      if (syncRes?.user) {
        setCurrentUser(syncRes.user);
      }

      return true;
    } catch (err: any) {
      let friendlyMessage = 'Failed to create account.';
      const code = err?.code || '';

      if (code === 'auth/operation-not-allowed') {
        friendlyMessage = 'Email/Password sign-in is not enabled in Firebase Console for this project. Please click "Continue with Google", or enable Email/Password in Firebase Console (Authentication > Sign-in method).';
      } else if (code === 'auth/email-already-in-use') {
        friendlyMessage = 'An account with this email address already exists.';
      } else if (code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      } else if (code === 'auth/weak-password') {
        friendlyMessage = 'Password should be at least 6 characters long.';
      } else if (err?.message) {
        friendlyMessage = err.message;
      }

      setError(friendlyMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCredential = await signInWithPopup(auth, provider);
      const fbUser = userCredential.user;

      const cleanUsername = (fbUser.displayName || fbUser.email?.split('@')[0] || `user_${fbUser.uid.substring(0, 6)}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');

      const syncRes = await api.syncAuthUser({
        fullName: fbUser.displayName || cleanUsername,
        username: cleanUsername,
        email: fbUser.email || undefined,
        avatarUrl: fbUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanUsername)}`,
      });

      if (syncRes?.user) {
        setCurrentUser(syncRes.user);
      }

      return true;
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        return false;
      }
      setError(err?.message || 'Google sign-in failed.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    localStorage.removeItem('vibesphere_auth_token');

    try {
      await api.logout();
    } catch (err) {
      console.warn('Backend logout notification note:', err);
    }

    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Firebase signOut error:', err);
    }

    setCurrentUser(null);
    setFirebaseUser(null);
  };

  const updateProfile = async (updates: Partial<User>): Promise<boolean> => {
    if (!currentUser) return false;
    try {
      const res = await api.updateUser(currentUser.id, updates);
      if (res?.user) {
        setCurrentUser(res.user);
      }

      // If updating displayName or avatar, sync with Firebase Auth
      if (auth.currentUser && (updates.fullName || updates.avatarUrl)) {
        await firebaseUpdateProfile(auth.currentUser, {
          ...(updates.fullName ? { displayName: updates.fullName } : {}),
          ...(updates.avatarUrl ? { photoURL: updates.avatarUrl } : {}),
        });
      }

      return true;
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile.');
      return false;
    }
  };

  const refreshUser = async () => {
    if (!currentUser) return;
    try {
      const res = await api.getUser(currentUser.id);
      if (res?.user) {
        setCurrentUser(res.user);
      }
    } catch (err) {
      console.warn('Failed to refresh user:', err);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        firebaseUser,
        isLoading,
        error,
        login,
        signup,
        loginWithGoogle,
        logout,
        updateProfile,
        clearError,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

import React, { useState, useEffect, useRef } from 'react';
import { Settings, LogOut, Compass, Users, Sparkles, Edit3, Upload, Image as ImageIcon, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useApp } from '../context/AppContext.tsx';
import { api } from '../services/api.ts';
import { Avatar } from '../components/common/Avatar.tsx';
import { Modal } from '../components/common/Modal.tsx';

export const ProfileScreen: React.FC = () => {
  const { currentUser, logout, updateProfile } = useAuth();
  const { navigate, showToast } = useApp();

  const [stats, setStats] = useState({ roomsJoined: 0, friendsCount: 0, hostedRooms: 0 });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState(currentUser?.fullName || '');
  const [editBio, setEditBio] = useState(currentUser?.bio || '');
  const [editAvatarUrl, setEditAvatarUrl] = useState(currentUser?.avatarUrl || '');
  const [editCoverUrl, setEditCoverUrl] = useState(currentUser?.coverUrl || '');
  const [isSaving, setIsSaving] = useState(false);

  // File upload states
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadStats() {
      if (!currentUser) return;
      try {
        const [roomsRes, friendsRes] = await Promise.all([
          api.getRooms({ userId: currentUser.id }).catch(() => ({ rooms: [] })),
          api.getFriends(currentUser.id).catch(() => ({ friends: [] })),
        ]);
        const roomsList = roomsRes?.rooms || [];
        const friendsList = friendsRes?.friends || [];
        const joined = roomsList.filter((r) => (r.memberIds || []).includes(currentUser.id)).length;
        const hosted = roomsList.filter((r) => r.hostId === currentUser.id).length;
        setStats({
          roomsJoined: joined,
          friendsCount: friendsList.length,
          hostedRooms: hosted,
        });
      } catch (err) {
        console.error('Failed to load profile stats:', err);
      }
    }
    loadStats();
  }, [currentUser]);

  if (!currentUser) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Please select a valid image file (JPEG, PNG, WebP, GIF).');
      return;
    }

    // Validate size (max 2MB)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('Image size exceeds 2MB limit. Please choose a smaller photo.');
      return;
    }

    setIsUploadingImage(true);
    try {
      // Read file as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      // Real upload to backend API
      const res = await api.uploadAvatar(currentUser.id, base64, file.type);
      if (res?.avatarUrl) {
        setEditAvatarUrl(res.avatarUrl);
        showToast('Photo uploaded successfully!');
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err?.message || 'Failed to upload photo. Please try again.');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFullName.trim()) {
      showToast('Display name cannot be empty.');
      return;
    }
    setIsSaving(true);
    try {
      await updateProfile({
        fullName: editFullName.trim(),
        bio: editBio.trim(),
        avatarUrl: editAvatarUrl.trim(),
        coverUrl: editCoverUrl.trim(),
      });
      showToast('Profile updated successfully!');
      setIsEditModalOpen(false);
    } catch (err: any) {
      showToast(err?.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const AVATAR_PRESETS = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop',
  ];

  const COVER_PRESETS = [
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1200&auto=format&fit=crop',
  ];

  return (
    <div className="pb-24 pt-2 px-4 max-w-xl mx-auto space-y-6">
      {/* Profile Card with Cover Banner */}
      <div className="rounded-3xl bg-[#141628] border border-purple-500/20 shadow-xl overflow-hidden relative">
        {/* Cover Photo */}
        <div className="h-32 w-full bg-gradient-to-r from-purple-900/60 to-indigo-900/60 relative overflow-hidden">
          <img
            src={currentUser.coverUrl || COVER_PRESETS[0]}
            alt="Profile cover banner"
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#141628]/40 to-[#141628]" />
        </div>

        {/* User Content */}
        <div className="px-6 pb-6 pt-0 flex flex-col items-center text-center -mt-14 relative z-10">
          <div className="relative mb-3 group">
            <Avatar
              src={currentUser.avatarUrl}
              alt={currentUser.fullName}
              size="2xl"
              isOnline={currentUser.isOnline}
              showBorder
            />
            <button
              onClick={() => {
                setEditFullName(currentUser.fullName);
                setEditBio(currentUser.bio || '');
                setEditAvatarUrl(currentUser.avatarUrl);
                setEditCoverUrl(currentUser.coverUrl || '');
                setUploadError(null);
                setIsEditModalOpen(true);
              }}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center border-2 border-[#141628] shadow-md transition-all active:scale-95"
              aria-label="Edit profile"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>

          <h2 className="text-lg font-black text-white">{currentUser.fullName}</h2>
          <p className="text-xs text-purple-400 font-semibold mt-0.5">@{currentUser.username}</p>
          <p className="text-xs text-slate-300 max-w-xs mt-2 leading-relaxed">
            {currentUser.bio || 'Exploring hangouts and connecting with friends! ✨'}
          </p>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2 w-full mt-6 pt-6 border-t border-white/5">
            <div className="text-center p-2 rounded-xl bg-white/5">
              <span className="block text-lg font-black text-white">{stats.roomsJoined}</span>
              <span className="text-[11px] text-slate-400">Rooms</span>
            </div>
            <div
              onClick={() => navigate('friends')}
              className="text-center p-2 rounded-xl bg-white/5 hover:bg-purple-600/10 cursor-pointer transition-colors"
            >
              <span className="block text-lg font-black text-purple-400">{stats.friendsCount}</span>
              <span className="text-[11px] text-slate-400">Friends</span>
            </div>
            <div className="text-center p-2 rounded-xl bg-white/5">
              <span className="block text-lg font-black text-white">{stats.hostedRooms}</span>
              <span className="text-[11px] text-slate-400">Hosted</span>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Options */}
      <div className="space-y-2">
        <button
          onClick={() => navigate('rooms')}
          className="w-full p-4 rounded-2xl bg-[#141628] border border-white/5 hover:border-purple-500/30 flex items-center justify-between text-slate-300 hover:text-white transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Compass className="w-4.5 h-4.5" />
            </div>
            <div className="text-left">
              <h3 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                My Rooms & Hangouts
              </h3>
              <p className="text-[11px] text-slate-400">Rooms you created or joined</p>
            </div>
          </div>
          <span className="text-slate-500 group-hover:text-purple-400 font-bold">&rarr;</span>
        </button>

        <button
          onClick={() => navigate('friends')}
          className="w-full p-4 rounded-2xl bg-[#141628] border border-white/5 hover:border-purple-500/30 flex items-center justify-between text-slate-300 hover:text-white transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Users className="w-4.5 h-4.5" />
            </div>
            <div className="text-left">
              <h3 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                Friends List
              </h3>
              <p className="text-[11px] text-slate-400">Manage connections and requests</p>
            </div>
          </div>
          <span className="text-slate-500 group-hover:text-purple-400 font-bold">&rarr;</span>
        </button>

        <button
          onClick={() => navigate('settings')}
          className="w-full p-4 rounded-2xl bg-[#141628] border border-white/5 hover:border-purple-500/30 flex items-center justify-between text-slate-300 hover:text-white transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800/60 border border-white/10 flex items-center justify-center text-slate-300">
              <Settings className="w-4.5 h-4.5" />
            </div>
            <div className="text-left">
              <h3 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                Account & Preferences
              </h3>
              <p className="text-[11px] text-slate-400">Sound, notifications, and security</p>
            </div>
          </div>
          <span className="text-slate-500 group-hover:text-purple-400 font-bold">&rarr;</span>
        </button>

        <button
          onClick={logout}
          className="w-full p-4 rounded-2xl bg-red-950/20 border border-red-500/20 hover:bg-red-950/30 flex items-center justify-between text-red-400 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400">
              <LogOut className="w-4.5 h-4.5" />
            </div>
            <div className="text-left">
              <h3 className="text-xs font-bold text-red-300">Log Out</h3>
              <p className="text-[11px] text-red-400/70">Sign out of your current session</p>
            </div>
          </div>
        </button>
      </div>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Profile"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          {/* Avatar Upload / Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Profile Avatar
            </label>

            {/* Current Avatar preview & Upload button */}
            <div className="flex items-center gap-4 p-3 rounded-2xl bg-[#17192c] border border-white/10 mb-3">
              <Avatar
                src={editAvatarUrl}
                alt="Selected avatar"
                size="lg"
                showBorder
              />
              <div className="flex-1 min-w-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="avatar-file-upload-input"
                />
                <button
                  type="button"
                  disabled={isUploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploadingImage ? 'Uploading...' : 'Upload Image'}</span>
                </button>
                <p className="text-[10px] text-slate-400 mt-1">JPEG, PNG, WebP or GIF up to 2MB</p>
              </div>
            </div>

            {uploadError && (
              <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Avatar Presets */}
            <span className="text-[11px] text-slate-400 font-medium block mb-1.5">Or choose a preset:</span>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {AVATAR_PRESETS.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => {
                    setEditAvatarUrl(url);
                    setUploadError(null);
                  }}
                  className={`w-10 h-10 rounded-full overflow-hidden shrink-0 border-2 transition-transform ${
                    editAvatarUrl === url
                      ? 'border-purple-500 scale-105 ring-2 ring-purple-500/40'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={url} alt="Preset avatar" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Avatar Image URL
            </label>
            <input
              type="url"
              value={editAvatarUrl}
              onChange={(e) => setEditAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#17192c] border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Cover Banner URL
            </label>
            <input
              type="url"
              value={editCoverUrl}
              onChange={(e) => setEditCoverUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#17192c] border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name</label>
            <input
              type="text"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              required
              maxLength={80}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#17192c] border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-300">Bio</label>
              <span className="text-[10px] text-slate-400">{editBio.length}/300</span>
            </div>
            <textarea
              rows={3}
              maxLength={300}
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder="Tell others what you love doing..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#17192c] border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isUploadingImage}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md transition-all disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

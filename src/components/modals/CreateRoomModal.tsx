import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';
import { Modal } from '../common/Modal.tsx';
import { Globe, Lock, Calendar, Clock, Zap, Bell, Sparkles } from 'lucide-react';

export const CreateRoomModal: React.FC = () => {
  const { isCreateRoomOpen, closeCreateRoom, navigate, showToast } = useApp();
  const { currentUser } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [tagInput, setTagInput] = useState('Chill, Music');
  const [bannerUrl, setBannerUrl] = useState(
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop'
  );
  const [maxMembers, setMaxMembers] = useState(20);
  const [language, setLanguage] = useState('English');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Scheduling options state
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now');

  const getTodayDateString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const [scheduledDate, setScheduledDate] = useState(getTodayDateString());
  const [scheduledTime, setScheduledTime] = useState('20:00'); // 8:00 PM default
  const [reminderNotification, setReminderNotification] = useState(true);

  const bannerPresets = [
    {
      label: 'Cinema',
      url: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=800&auto=format&fit=crop',
    },
    {
      label: 'Neon Lounge',
      url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop',
    },
    {
      label: 'Gaming Arena',
      url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop',
    },
    {
      label: 'Lo-fi Study',
      url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop',
    },
  ];

  // Helper to format date & time into a user-friendly label
  const formatUpcomingTime = (dateStr: string, timeStr: string): string => {
    if (!dateStr || !timeStr) return 'Scheduled Soon';
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      const targetDate = new Date(year, month - 1, day, hours, minutes);

      const today = new Date();
      const isToday =
        today.getFullYear() === targetDate.getFullYear() &&
        today.getMonth() === targetDate.getMonth() &&
        today.getDate() === targetDate.getDate();

      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);
      const isTomorrow =
        tomorrow.getFullYear() === targetDate.getFullYear() &&
        tomorrow.getMonth() === targetDate.getMonth() &&
        tomorrow.getDate() === targetDate.getDate();

      const timeFormatted = targetDate.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      if (isToday) {
        return `Today, ${timeFormatted}`;
      }
      if (isTomorrow) {
        return `Tomorrow, ${timeFormatted}`;
      }
      const monthName = targetDate.toLocaleDateString([], { month: 'short' });
      return `${monthName} ${targetDate.getDate()}, ${timeFormatted}`;
    } catch {
      return `${dateStr} at ${timeStr}`;
    }
  };

  // Helper to calculate relative time remaining
  const getTimeRemaining = (dateStr: string, timeStr: string): string => {
    if (!dateStr || !timeStr) return '';
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      const target = new Date(year, month - 1, day, hours, minutes).getTime();
      const now = Date.now();
      const diffMs = target - now;

      if (diffMs <= 0) return 'Starts now';
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return `in ${diffMins}m`;
      const diffHours = Math.floor(diffMins / 60);
      const remMins = diffMins % 60;
      if (diffHours < 24) {
        return `in ${diffHours}h ${remMins > 0 ? `${remMins}m` : ''}`;
      }
      const diffDays = Math.floor(diffHours / 24);
      return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } catch {
      return '';
    }
  };

  // Dynamic quick presets
  const getQuickPresets = () => {
    const now = new Date();

    // In 1 Hour
    const plusOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    const plusOneHourTime = `${String(plusOneHour.getHours()).padStart(2, '0')}:${String(
      plusOneHour.getMinutes()
    ).padStart(2, '0')}`;
    const plusOneHourDate = plusOneHour.toISOString().split('T')[0];

    // Tonight (or tomorrow if late)
    const tonightDate =
      now.getHours() >= 20
        ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : now.toISOString().split('T')[0];
    const tonightLabel = now.getHours() >= 20 ? 'Tomorrow 8 PM' : 'Tonight 8 PM';

    // Tomorrow 7 PM
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];

    // Weekend (Next Saturday 5 PM)
    const saturday = new Date(now);
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;
    saturday.setDate(now.getDate() + daysUntilSaturday);
    saturday.setHours(17, 0, 0, 0);
    const saturdayDate = saturday.toISOString().split('T')[0];

    return [
      { label: 'In 1 Hour', date: plusOneHourDate, time: plusOneHourTime },
      { label: tonightLabel, date: tonightDate, time: '20:00' },
      { label: 'Tomorrow 7 PM', date: tomorrowDate, time: '19:00' },
      { label: 'Saturday 5 PM', date: saturdayDate, time: '17:00' },
    ];
  };

  const quickPresets = getQuickPresets();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Please enter a room name.');
      return;
    }
    if (trimmedName.length < 2) {
      showToast('Room name must be at least 2 characters.');
      return;
    }
    if (trimmedName.length > 60) {
      showToast('Room name cannot exceed 60 characters.');
      return;
    }
    if (description.trim().length > 500) {
      showToast('Room description cannot exceed 500 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const tags = tagInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const isScheduled = scheduleMode === 'scheduled';
      const scheduledIso = isScheduled
        ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
        : null;
      const upcomingSessionTime = isScheduled
        ? formatUpcomingTime(scheduledDate, scheduledTime)
        : 'Live Now';

      const res = await api.createRoom({
        name: name.trim(),
        description: description.trim(),
        type,
        tags: tags.length > 0 ? tags : ['Hangout'],
        bannerUrl,
        hostId: currentUser.id,
        maxMembers,
        language,
        isScheduled,
        scheduledAt: scheduledIso,
        upcomingSessionTime,
      });

      if (isScheduled) {
        showToast(`Scheduled room "${res.room.name}" for ${upcomingSessionTime}!`);
      } else {
        showToast(`Created room "${res.room.name}"!`);
      }

      closeCreateRoom();
      setName('');
      setDescription('');
      setScheduleMode('now');
      setScheduledDate(getTodayDateString());
      setScheduledTime('20:00');

      if (isScheduled) {
        navigate('room-details', { roomId: res.room.id });
      } else {
        navigate('room-view', { roomId: res.room.id });
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to create room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isCreateRoomOpen}
      onClose={closeCreateRoom}
      title="Create Hangout Room"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Room Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Room Name
          </label>
          <input
            id="create-room-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Movie Night, Anime Club, Chill Beats"
            required
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#17192c] border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Schedule System Option */}
        <div className="p-3 rounded-2xl bg-[#141628] border border-purple-500/25 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-xs font-bold text-white flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-purple-400" />
                Schedule Options
              </label>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Start immediately or plan a future session
              </p>
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                scheduleMode === 'now'
                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30'
                  : 'bg-purple-900/40 text-purple-300 border-purple-500/30'
              }`}
            >
              {scheduleMode === 'now' ? 'Instant' : 'Scheduled'}
            </span>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#0e101d] border border-white/5">
            <button
              id="schedule-mode-now-btn"
              type="button"
              onClick={() => setScheduleMode('now')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                scheduleMode === 'now'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Go Live Now</span>
            </button>

            <button
              id="schedule-mode-later-btn"
              type="button"
              onClick={() => setScheduleMode('scheduled')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                scheduleMode === 'scheduled'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-purple-300" />
              <span>Schedule for Later</span>
            </button>
          </div>

          {/* Schedule Configuration Details */}
          {scheduleMode === 'scheduled' && (
            <div className="pt-1.5 space-y-3 animate-in fade-in duration-150">
              {/* Quick Presets */}
              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mb-1.5">
                  Quick Presets
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {quickPresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setScheduledDate(preset.date);
                        setScheduledTime(preset.time);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[#1c1f36] hover:bg-purple-600/30 text-slate-300 hover:text-white border border-white/10 hover:border-purple-500/40 transition-all text-left flex items-center justify-between"
                    >
                      <span>{preset.label}</span>
                      <Sparkles className="w-3 h-3 text-purple-400/60" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Time Selectors */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Session Date
                  </label>
                  <input
                    id="schedule-room-date"
                    type="date"
                    min={getTodayDateString()}
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    required={scheduleMode === 'scheduled'}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Start Time
                  </label>
                  <input
                    id="schedule-room-time"
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    required={scheduleMode === 'scheduled'}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Scheduled Status Banner */}
              <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-purple-200">
                  <Clock className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="font-semibold">
                    {formatUpcomingTime(scheduledDate, scheduledTime)}
                  </span>
                </div>
                <span className="text-[10px] text-purple-300 font-medium px-2 py-0.5 rounded-md bg-purple-900/40">
                  {getTimeRemaining(scheduledDate, scheduledTime)}
                </span>
              </div>

              {/* Reminder toggle */}
              <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={reminderNotification}
                  onChange={(e) => setReminderNotification(e.target.checked)}
                  className="rounded accent-purple-600 w-3.5 h-3.5"
                />
                <span className="text-xs text-slate-300 flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-slate-400" />
                  Send reminder notification to members before start
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Description
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this hangout about?"
            className="w-full px-3.5 py-2 rounded-xl bg-[#17192c] border border-white/10 text-white placeholder-slate-400 text-xs focus:outline-none focus:border-purple-500 resize-none"
          />
        </div>

        {/* Room Privacy */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Room Privacy
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType('public')}
              className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all text-left ${
                type === 'public'
                  ? 'bg-purple-600/20 border-purple-500 text-white'
                  : 'bg-[#17192c] border-white/10 text-slate-400'
              }`}
            >
              <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="block text-xs font-bold">Public</span>
                <span className="text-[10px] text-slate-400">Visible to everyone</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setType('private')}
              className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all text-left ${
                type === 'private'
                  ? 'bg-purple-600/20 border-purple-500 text-white'
                  : 'bg-[#17192c] border-white/10 text-slate-400'
              }`}
            >
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="block text-xs font-bold">Private</span>
                <span className="text-[10px] text-slate-400">Requires room code</span>
              </div>
            </button>
          </div>
        </div>

        {/* Cover Artwork Preset */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Cover Artwork Preset
          </label>
          <div className="grid grid-cols-4 gap-2">
            {bannerPresets.map((preset) => (
              <div
                key={preset.label}
                onClick={() => setBannerUrl(preset.url)}
                className={`h-16 rounded-xl overflow-hidden cursor-pointer border-2 transition-all relative ${
                  bannerUrl === preset.url
                    ? 'border-purple-500 ring-2 ring-purple-500/40'
                    : 'border-white/10 opacity-60 hover:opacity-100'
                }`}
              >
                <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/70 px-1 rounded text-white">
                  {preset.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tags & Max Members */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Chill, Tech, Music"
              className="w-full px-3.5 py-2 rounded-xl bg-[#17192c] border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Max Members ({maxMembers})
            </label>
            <input
              type="range"
              min={5}
              max={50}
              step={5}
              value={maxMembers}
              onChange={(e) => setMaxMembers(Number(e.target.value))}
              className="w-full mt-2 accent-purple-600"
            />
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={closeCreateRoom}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            id="create-room-submit-btn"
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSubmitting ? (
              'Creating...'
            ) : scheduleMode === 'scheduled' ? (
              <>
                <Calendar className="w-3.5 h-3.5" />
                <span>Schedule Room</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                <span>Create & Go Live</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

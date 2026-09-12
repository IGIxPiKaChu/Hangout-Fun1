import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';
import { Modal } from '../common/Modal.tsx';
import { KeyRound, ArrowRight } from 'lucide-react';

export const JoinRoomModal: React.FC = () => {
  const { isJoinRoomOpen, closeJoinRoom, navigate, showToast } = useApp();
  const { currentUser } = useAuth();

  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !code.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const formattedCode = code.trim().toUpperCase();
      const res = await api.joinRoomByCode(formattedCode, currentUser.id);

      showToast(`Joined ${res.room.name}!`);
      closeJoinRoom();
      setCode('');
      navigate('room-view', { roomId: res.room.id });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Invalid room code. Please verify and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isJoinRoomOpen}
      onClose={closeJoinRoom}
      title="Join Hangout with Code"
      maxWidth="sm"
    >
      <form onSubmit={handleJoinByCode} className="space-y-4">
        <div className="text-center py-2">
          <div className="w-12 h-12 rounded-2xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400 mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <p className="text-xs text-slate-300 max-w-xs mx-auto">
            Ask the room host for the 6-character room code to join their session.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center">
            {errorMsg}
          </div>
        )}

        <div>
          <input
            id="join-room-code-input"
            type="text"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. MOVIE8"
            className="w-full text-center tracking-widest text-lg font-mono font-bold uppercase px-4 py-3 rounded-xl bg-[#17192c] border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition-all"
            required
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={closeJoinRoom}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            id="join-room-code-submit-btn"
            type="submit"
            disabled={isSubmitting || !code.trim()}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Joining...' : 'Join Hangout'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </Modal>
  );
};

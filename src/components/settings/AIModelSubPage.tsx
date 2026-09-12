import React, { useState } from 'react';
import {
  Cpu,
  Zap,
  Check,
  Activity,
  Plus,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Globe,
  Radio,
} from 'lucide-react';
import { AIModelProfile, DEFAULT_AI_MODELS } from '../../types/ai.ts';

interface AIModelSubPageProps {
  settings: any;
  updateSetting: (key: string, value: any, toastMsg?: string) => void;
  showToast: (msg: string) => void;
  onNavigateToConfig?: () => void;
}

export const AIModelSubPage: React.FC<AIModelSubPageProps> = ({
  settings,
  updateSetting,
  showToast,
  onNavigateToConfig,
}) => {
  const [isTestingLatency, setIsTestingLatency] = useState(false);
  const [latencyResult, setLatencyResult] = useState<number | null>(null);

  const modelsList: AIModelProfile[] = settings.aiModelsList || DEFAULT_AI_MODELS;
  const currentModelId = settings.aiModel || 'google-gemini-3.8-flash';
  const activeModel = modelsList.find((m) => m.id === currentModelId) || modelsList[0];

  const handleTestLatency = async () => {
    setIsTestingLatency(true);
    setLatencyResult(null);
    const start = performance.now();
    try {
      const res = await fetch('/api/health');
      const elapsed = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLatencyResult(elapsed);
      showToast(`Gateway ping verified: ${elapsed}ms`);
    } catch (err: any) {
      showToast(`Gateway ping failed: ${err.message || 'Network error'}`);
    } finally {
      setIsTestingLatency(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Active Model Status Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-900/30 via-[#141628] to-[#0f1120] border border-indigo-500/20 shadow-lg relative overflow-hidden">
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Primary Intelligence Model
              </p>
              <h2 className="text-base font-bold text-white truncate leading-tight mt-0.5">
                {activeModel.name}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[11px] text-indigo-300 font-medium">
                  {activeModel.provider}
                </span>
                {activeModel.subName && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Sub: {activeModel.subName}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-mono">
                  {activeModel.speed || '~85ms'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            id="test-model-latency-btn"
            onClick={handleTestLatency}
            disabled={isTestingLatency}
            className="shrink-0 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs text-white font-medium flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
            title="Ping model latency"
          >
            {isTestingLatency ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
            ) : (
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>
              {latencyResult ? `${latencyResult}ms` : isTestingLatency ? 'Testing...' : 'Test Ping'}
            </span>
          </button>
        </div>
      </div>

      {/* 1. Model Selection List */}
      <div className="space-y-1.5">
        <div className="px-1 flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Select Active AI Model ({modelsList.length})
          </p>
          {onNavigateToConfig && (
            <button
              type="button"
              onClick={onNavigateToConfig}
              className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Make New AI</span>
            </button>
          )}
        </div>

        <div className="space-y-2">
          {modelsList.map((m) => {
            const isSelected = currentModelId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                id={`model-select-${m.id}`}
                onClick={() =>
                  updateSetting('aiModel', m.id, `Active model switched to ${m.subName || m.name}`)
                }
                className={`w-full p-3.5 rounded-2xl text-left border transition-all relative ${
                  isSelected
                    ? 'bg-purple-600/15 border-purple-500/50 shadow-md shadow-purple-900/20'
                    : 'bg-[#131525] border-white/6 hover:bg-white/5'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{m.name}</span>
                      {m.subName && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Sub: {m.subName}
                        </span>
                      )}
                      {m.badge && (
                        <span
                          className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
                            m.badgeColor || 'bg-white/5 text-slate-300 border-white/10'
                          }`}
                        >
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {m.provider} • <span className="font-mono text-slate-300">{m.model}</span>
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                      {m.speed || '~100ms'}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                        isSelected
                          ? 'bg-purple-600 border-purple-500 text-white'
                          : 'border-white/20 bg-black/40'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-300 mt-2 leading-relaxed">{m.description}</p>

                <div className="flex items-center justify-between gap-3 mt-2.5 pt-2 border-t border-white/5 text-[10px] text-slate-400 font-mono">
                  <span className="truncate">URL: {m.url}</span>
                  <span className="shrink-0 text-slate-500">{m.contextWindow || '128K'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Model Performance Options */}
      <div className="space-y-1.5">
        <p className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Performance & Execution
        </p>
        <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden shadow-sm">
          {/* Streaming Mode */}
          <div className="p-3.5 flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Stream Word-by-Word</span>
              </p>
              <p className="text-[11px] text-slate-400">
                Stream responses progressively as tokens generate for instant reading
              </p>
            </div>
            <button
              type="button"
              id="toggle-ai-streaming"
              onClick={() =>
                updateSetting(
                  'aiStreaming',
                  !settings.aiStreaming,
                  settings.aiStreaming ? 'Streaming disabled' : 'Streaming enabled'
                )
              }
              className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                settings.aiStreaming ? 'bg-purple-600' : 'bg-white/10'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.aiStreaming ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Reasoning Budget */}
          <div className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Reasoning Profile</p>
              <p className="text-[11px] text-slate-400">Thinking depth before answering</p>
            </div>
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
              {[
                { id: 'fast', label: 'Fast' },
                { id: 'balanced', label: 'Balanced' },
                { id: 'deep', label: 'Deep' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateSetting('aiThinkingBudget', opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    (settings.aiThinkingBudget || 'fast') === opt.id
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Automatic Fallback */}
          <div className="p-3.5 flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <p className="text-sm font-semibold text-white">Auto Fallback Protection</p>
              <p className="text-[11px] text-slate-400">
                Fallback to Gemini 3.8 Flash if custom endpoint or model encounters a rate limit
              </p>
            </div>
            <button
              type="button"
              id="toggle-ai-fallback"
              onClick={() =>
                updateSetting(
                  'aiFallbackEnabled',
                  !settings.aiFallbackEnabled,
                  settings.aiFallbackEnabled ? 'Fallback disabled' : 'Fallback enabled'
                )
              }
              className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                settings.aiFallbackEnabled ? 'bg-purple-600' : 'bg-white/10'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.aiFallbackEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

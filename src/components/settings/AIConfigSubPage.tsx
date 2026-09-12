import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  Plus,
  Check,
  RotateCcw,
  ShieldCheck,
  Globe,
  Cpu,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Tag,
  Zap,
  Sliders,
  Radio,
  Key,
  Eye,
  EyeOff,
  PenTool,
  Lock,
} from 'lucide-react';
import { AIModelProfile, DEFAULT_AI_MODELS } from '../../types/ai.ts';

interface AIConfigSubPageProps {
  settings: any;
  updateSetting: (key: string, value: any, toastMsg?: string) => void;
  showToast: (msg: string) => void;
}

export const AIConfigSubPage: React.FC<AIConfigSubPageProps> = ({
  settings,
  updateSetting,
  showToast,
}) => {
  const [isCreatingModel, setIsCreatingModel] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // New / Edit Model Form State
  const [formData, setFormData] = useState<{
    name: string;
    subName: string;
    apiKey: string;
    model: string;
    url: string;
    provider: 'Google' | 'OpenAI' | 'OpenRouter' | 'xAI' | 'Anthropic' | 'Ollama' | 'Custom';
    persona: 'friendly' | 'concise' | 'creative' | 'technical' | 'custom' | string;
    customPersona: string;
    badge: string;
    description: string;
    temperature: number;
    speed: string;
    contextWindow: string;
  }>({
    name: '',
    subName: '',
    apiKey: '',
    model: '',
    url: '',
    provider: 'Google',
    persona: 'friendly',
    customPersona: '',
    badge: 'Custom',
    description: '',
    temperature: 0.7,
    speed: '~90ms',
    contextWindow: '128K Tokens',
  });

  const modelsList: AIModelProfile[] = settings.aiModelsList || DEFAULT_AI_MODELS;

  // 4 Predefined Personas + 1 Custom
  const PERSONA_OPTIONS = [
    {
      id: 'friendly',
      name: 'Friendly Host',
      desc: 'Warm, conversational, empathetic, and welcoming with social emojis.',
      emoji: '🌟',
      presetPrompt: 'Act as a friendly, warm, and welcoming hangout host with empathetic, supportive tone.',
    },
    {
      id: 'concise',
      name: 'Concise & Direct',
      desc: 'Short, clean, action-oriented answers with rapid response and zero fluff.',
      emoji: '⚡',
      presetPrompt: 'Provide ultra-concise, direct, and factual answers without unnecessary greetings or fluff.',
    },
    {
      id: 'creative',
      name: 'Creative & Playful',
      desc: 'Witty, storytelling-focused, rich brainstorming, jokes, and lively room vibes.',
      emoji: '🎨',
      presetPrompt: 'Respond with witty humor, playful commentary, creative metaphors, and vibrant energy.',
    },
    {
      id: 'technical',
      name: 'Technical & Expert',
      desc: 'Structured logic, deep reasoning, precise explanations, and code accuracy.',
      emoji: '🔬',
      presetPrompt: 'Provide deep analytical breakdowns, structured explanations, and expert technical insights.',
    },
    {
      id: 'custom',
      name: 'Custom Persona',
      desc: 'Define your own unique persona, personality rules, roleplay, or custom voice.',
      emoji: '✍️',
      presetPrompt: '',
    },
  ];

  const handlePreFill = (type: 'grok' | 'openai' | 'gemini' | 'ollama' | 'claude' | 'openrouter') => {
    if (type === 'openrouter') {
      setFormData((prev) => ({
        ...prev,
        name: 'OpenRouter DeepSeek R1',
        subName: 'OpenRouter R1',
        apiKey: prev.apiKey || '',
        model: 'deepseek/deepseek-r1',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        provider: 'OpenRouter',
        persona: 'technical',
        badge: 'Reasoning',
        description: 'Universal OpenRouter gateway supporting hundreds of multi-modal & reasoning models.',
        temperature: 0.6,
        speed: '~180ms',
        contextWindow: '128K Tokens',
      }));
    } else if (type === 'grok') {
      setFormData((prev) => ({
        ...prev,
        name: 'xAI Grok Subtitles',
        subName: 'Grok Sub',
        apiKey: prev.apiKey || '',
        model: 'grok-2',
        url: 'https://api.x.ai/v1/chat/completions',
        provider: 'xAI',
        persona: 'creative',
        badge: 'Real-Time',
        description: 'Ultra-fast contextual intelligence tuned for live stream captions and commentary.',
        temperature: 0.7,
        speed: '~110ms',
        contextWindow: '128K Tokens',
      }));
    } else if (type === 'openai') {
      setFormData((prev) => ({
        ...prev,
        name: 'OpenAI GPT-4o Mini',
        subName: 'GPT Fast',
        apiKey: prev.apiKey || '',
        model: 'gpt-4o-mini',
        url: 'https://api.openai.com/v1/chat/completions',
        provider: 'OpenAI',
        persona: 'friendly',
        badge: 'Efficient',
        description: 'Lightweight multi-modal engine for rapid chat and translations.',
        temperature: 0.5,
        speed: '~90ms',
        contextWindow: '128K Tokens',
      }));
    } else if (type === 'gemini') {
      setFormData((prev) => ({
        ...prev,
        name: 'Google Gemini 3.8 Flash',
        subName: 'Google Chat',
        apiKey: prev.apiKey || '',
        model: 'gemini-3.8-flash',
        url: '/api/gemini/chat',
        provider: 'Google',
        persona: 'friendly',
        badge: 'Ultra Fast',
        description: 'Built-in server gateway with low latency and 1M token context.',
        temperature: 0.7,
        speed: '~75ms',
        contextWindow: '1M Tokens',
      }));
    } else if (type === 'ollama') {
      setFormData((prev) => ({
        ...prev,
        name: 'Local Ollama Mistral',
        subName: 'Ollama Local',
        apiKey: prev.apiKey || '',
        model: 'mistral:latest',
        url: 'http://localhost:11434/v1/chat/completions',
        provider: 'Ollama',
        persona: 'technical',
        badge: 'Local/Private',
        description: 'Private offline model running on local workstation.',
        temperature: 0.7,
        speed: '~50ms',
        contextWindow: '32K Tokens',
      }));
    } else if (type === 'claude') {
      setFormData((prev) => ({
        ...prev,
        name: 'Claude 3.5 Haiku',
        subName: 'Claude Fast',
        apiKey: prev.apiKey || '',
        model: 'claude-3-5-haiku',
        url: 'https://api.anthropic.com/v1/messages',
        provider: 'Anthropic',
        persona: 'concise',
        badge: 'High Speed',
        description: 'Fast responsive Claude model with concise analytical reasoning.',
        temperature: 0.7,
        speed: '~95ms',
        contextWindow: '200K Tokens',
      }));
    }
  };

  const handleSaveModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.model.trim()) {
      showToast('Please provide an AI Name and Model ID');
      return;
    }

    const subNameClean = formData.subName.trim() || formData.name.trim().slice(0, 14);
    const newId = editingModelId || `custom-ai-${Date.now()}`;

    const newModel: AIModelProfile = {
      id: newId,
      name: formData.name.trim(),
      subName: subNameClean,
      apiKey: formData.apiKey.trim() || undefined,
      model: formData.model.trim(),
      url: formData.url.trim() || '/api/gemini/chat',
      provider: formData.provider,
      persona: formData.persona,
      customPersona: formData.persona === 'custom' ? formData.customPersona.trim() : undefined,
      badge: formData.badge.trim() || 'Custom',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      description: formData.description.trim() || `${formData.provider} AI model ready for work.`,
      isCustom: true,
      status: 'ready',
      temperature: formData.temperature,
      speed: formData.speed || '~120ms',
      contextWindow: formData.contextWindow || '128K Tokens',
    };

    let updatedList: AIModelProfile[];
    if (editingModelId) {
      updatedList = modelsList.map((m) => (m.id === editingModelId ? newModel : m));
      showToast(`AI Model "${newModel.subName}" updated!`);
    } else {
      updatedList = [...modelsList, newModel];
      showToast(`AI Model "${newModel.subName}" registered and ready for work!`);
    }

    updateSetting('aiModelsList', updatedList);
    setIsCreatingModel(false);
    setEditingModelId(null);
    setFormData({
      name: '',
      subName: '',
      apiKey: '',
      model: '',
      url: '',
      provider: 'Google',
      persona: 'friendly',
      customPersona: '',
      badge: 'Custom',
      description: '',
      temperature: 0.7,
      speed: '~90ms',
      contextWindow: '128K Tokens',
    });
  };

  const handleEditModel = (model: AIModelProfile) => {
    setEditingModelId(model.id);
    setFormData({
      name: model.name,
      subName: model.subName || model.name,
      apiKey: model.apiKey || '',
      model: model.model,
      url: model.url,
      provider: model.provider,
      persona: model.persona || 'friendly',
      customPersona: model.customPersona || '',
      badge: model.badge || 'Custom',
      description: model.description || '',
      temperature: model.temperature ?? 0.7,
      speed: model.speed || '~100ms',
      contextWindow: model.contextWindow || '128K Tokens',
    });
    setIsCreatingModel(true);
  };

  const handleDeleteModel = (id: string, name: string) => {
    const updatedList = modelsList.filter((m) => m.id !== id);
    updateSetting('aiModelsList', updatedList, `Model "${name}" removed`);

    // Also sanitize work assignments if this model was assigned
    if (settings.aiWorkAssignments) {
      const wa = { ...settings.aiWorkAssignments };
      let changed = false;
      const fallbackId = 'google-gemini-3.8-flash';
      if (wa.chat_translate === id) {
        wa.chat_translate = fallbackId;
        changed = true;
      }
      if (wa.subtitles === id) {
        wa.subtitles = 'xai-grok-2';
        changed = true;
      }
      if (wa.live_video_language === id) {
        wa.live_video_language = 'google-gemini-3.1-pro';
        changed = true;
      }
      if (wa.ai_chat === id) {
        wa.ai_chat = fallbackId;
        changed = true;
      }
      if (changed) {
        updateSetting('aiWorkAssignments', wa);
      }
    }
  };

  // Global Persona Selection
  const currentGlobalPersona = settings.aiPersona || 'friendly';
  const isGlobalCustomPersona = currentGlobalPersona === 'custom';

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-900/30 via-[#141628] to-[#0f1120] border border-purple-500/20 shadow-lg relative overflow-hidden">
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>API & Model Configuration</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {modelsList.length} Configured
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                Manage your API credentials, endpoint URLs, model parameters, and customizable AI personas for seamless real-time hangouts.
              </p>
            </div>
          </div>

          <button
            type="button"
            id="open-make-ai-model-btn"
            onClick={() => {
              if (isCreatingModel) {
                setIsCreatingModel(false);
                setEditingModelId(null);
              } else {
                setIsCreatingModel(true);
                setEditingModelId(null);
              }
            }}
            className="shrink-0 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow-md shadow-purple-900/40 transition-all active:scale-95"
          >
            {isCreatingModel ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Close</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Add AI Model</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 1. API MODEL CONFIGURATION FORM (Expandable / Inline) */}
      {isCreatingModel && (
        <form
          onSubmit={handleSaveModel}
          id="make-ai-model-form"
          className="p-4 rounded-2xl bg-[#131525] border border-purple-500/40 shadow-xl space-y-4 animate-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span>{editingModelId ? 'Edit AI Model Profile' : 'Configure New AI Model'}</span>
            </h3>

            {/* Quick pre-fill pills */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-slate-500 mr-1">Pre-fill:</span>
              <button
                type="button"
                onClick={() => handlePreFill('openrouter')}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-cyan-300 border border-cyan-500/20"
              >
                + OpenRouter
              </button>
              <button
                type="button"
                onClick={() => handlePreFill('gemini')}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-purple-300 border border-purple-500/20"
              >
                + Gemini
              </button>
              <button
                type="button"
                onClick={() => handlePreFill('openai')}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-sky-300 border border-sky-500/20"
              >
                + GPT
              </button>
              <button
                type="button"
                onClick={() => handlePreFill('grok')}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-amber-300 border border-amber-500/20"
              >
                + Grok
              </button>
              <button
                type="button"
                onClick={() => handlePreFill('claude')}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-orange-300 border border-orange-500/20"
              >
                + Claude
              </button>
              <button
                type="button"
                onClick={() => handlePreFill('ollama')}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-emerald-300 border border-emerald-500/20"
              >
                + Ollama
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Field: Name */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                <span>Name *</span>
                <span className="text-[10px] text-slate-500">Display Label</span>
              </label>
              <input
                type="text"
                id="ai-form-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Google Gemini 3.8 Flash, xAI Grok"
                required
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {/* Field: Sub Name */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                <span>Sub Name / Alias</span>
                <span className="text-[10px] text-purple-400">Assignment Tag</span>
              </label>
              <input
                type="text"
                id="ai-form-subname"
                value={formData.subName}
                onChange={(e) => setFormData({ ...formData, subName: e.target.value })}
                placeholder="e.g. Google Chat, Grok Sub"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {/* Field: API / API Key */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>API (API Key / Token)</span>
                </span>
                <span className="text-[10px] text-slate-500">Optional for local gateway</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  id="ai-form-apikey"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="e.g. sk-..., AIzaSy..., or Bearer token"
                  className="w-full pl-3 pr-9 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-white transition-colors"
                  title={showApiKey ? 'Hide API Key' : 'Show API Key'}
                >
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Field: Model */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                <span>Model *</span>
                <span className="text-[10px] text-slate-500">Model Identifier</span>
              </label>
              <input
                type="text"
                id="ai-form-model"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="e.g. gemini-3.8-flash, gpt-4o, grok-2"
                required
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {/* Field: Bearer or say URL */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                <span>Bearer or URL *</span>
                <span className="text-[10px] text-slate-500">Endpoint / Proxy</span>
              </label>
              <input
                type="text"
                id="ai-form-url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="e.g. /api/gemini/chat or https://api.openai.com/v1/chat/completions"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {/* Field: Provider */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Provider</label>
              <select
                id="ai-form-provider"
                value={formData.provider}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    provider: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="Google">Google (Gemini)</option>
                <option value="OpenRouter">OpenRouter (Universal Gateway)</option>
                <option value="OpenAI">OpenAI (ChatGPT / GPT-4o)</option>
                <option value="xAI">xAI (Grok)</option>
                <option value="Anthropic">Anthropic (Claude)</option>
                <option value="Ollama">Ollama (Local AI)</option>
                <option value="Custom">Custom Provider</option>
              </select>
            </div>
          </div>

          {/* Persona Options: 4 Options + 1 Custom with Dynamic Blank Bar */}
          <div className="space-y-2 pt-1 border-t border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Persona (4 Options + 1 Custom)</span>
              </label>
              <span className="text-[10px] text-purple-300 font-medium">
                {formData.persona === 'custom' ? 'Custom Persona Active' : 'Preset Selected'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PERSONA_OPTIONS.map((opt) => {
                const isSelected = formData.persona === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        persona: opt.id,
                        description:
                          opt.id !== 'custom' && !formData.description
                            ? opt.desc
                            : formData.description,
                      });
                    }}
                    className={`p-2.5 rounded-xl text-left border transition-all relative ${
                      isSelected
                        ? 'bg-purple-600/20 border-purple-500 shadow-md shadow-purple-900/30'
                        : 'bg-black/30 border-white/10 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base">{opt.emoji}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                    </div>
                    <div className="mt-1">
                      <p className="text-[11px] font-bold text-white leading-tight">{opt.name}</p>
                      <p className="text-[9px] text-slate-400 line-clamp-1 mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Blank Bar visible when Custom Persona is clicked */}
            {formData.persona === 'custom' && (
              <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/40 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <label className="text-[11px] font-semibold text-purple-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <PenTool className="w-3.5 h-3.5 text-purple-400" />
                    <span>Enter Your Custom Persona Instructions</span>
                  </span>
                  <span className="text-[10px] text-purple-300/70">Dynamic Custom Bar</span>
                </label>
                <textarea
                  id="ai-form-custom-persona-input"
                  rows={2}
                  value={formData.customPersona}
                  onChange={(e) => setFormData({ ...formData, customPersona: e.target.value })}
                  placeholder="e.g. You are a chill DJ who speaks in music analogies and recommends tracks for every mood, or a witty gamer..."
                  className="w-full p-2.5 rounded-lg bg-black/60 border border-purple-500/30 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-400 transition-colors resize-none"
                />
              </div>
            )}
          </div>

          {/* Extra Specs (Speed, Temperature, Description) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-white/5">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Speed / Latency Tag</label>
              <input
                type="text"
                id="ai-form-speed"
                value={formData.speed}
                onChange={(e) => setFormData({ ...formData, speed: e.target.value })}
                placeholder="e.g. ~75ms or Ultra-Fast"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-semibold">Temperature (Creativity)</span>
                <span className="text-purple-400 font-mono font-bold">{formData.temperature}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={formData.temperature}
                onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                className="w-full accent-purple-500 cursor-pointer pt-1"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => {
                setIsCreatingModel(false);
                setEditingModelId(null);
              }}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="save-ai-model-submit-btn"
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white shadow-md shadow-purple-900/40 flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{editingModelId ? 'Save Changes' : 'Save & Register Model'}</span>
            </button>
          </div>
        </form>
      )}

      {/* 2. CONFIGURED AI MODELS LIST */}
      <div className="space-y-2">
        <div className="px-1 flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Configured AI Models ({modelsList.length})
          </p>
          <span className="text-[10px] text-purple-400 font-medium">
            Available for Room Chat & Media Tasks
          </span>
        </div>

        <div className="space-y-2">
          {modelsList.map((m) => (
            <div
              key={m.id}
              className="p-3.5 rounded-2xl bg-[#131525] border border-white/6 hover:border-white/10 transition-all space-y-2.5 shadow-sm"
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
                    {m.persona && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 capitalize">
                        Persona: {m.persona}
                      </span>
                    )}
                    {m.apiKey && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                        <Key className="w-2.5 h-2.5" /> Key Saved
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {m.provider} • <span className="font-mono text-slate-300">{m.model}</span> • {m.speed}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEditModel(m)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                  {m.isCustom && (
                    <button
                      type="button"
                      onClick={() => handleDeleteModel(m.id, m.name)}
                      className="p-1 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                      title="Delete Model"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Endpoint URL & Specs */}
              <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-400 truncate">
                <span className="truncate flex items-center gap-1">
                  <Globe className="w-3 h-3 text-purple-400 shrink-0" />
                  <span className="truncate">{m.url}</span>
                </span>
                <span className="shrink-0 pl-2 text-slate-500">{m.contextWindow || '128K'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Global Assistant Persona Selection (4 Options + 1 Custom with Dynamic Blank Bar) */}
      <div className="space-y-2 pt-2">
        <div className="px-1 flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Assistant Persona & Tone (4 Presets + Custom)
          </p>
          <span className="text-[10px] text-purple-300 font-medium">
            Active: {PERSONA_OPTIONS.find((p) => p.id === currentGlobalPersona)?.name || 'Custom'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {PERSONA_OPTIONS.map((p) => {
            const isSelected = currentGlobalPersona === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  updateSetting('aiPersona', p.id, `Persona set to ${p.name}`);
                }}
                className={`p-3 rounded-2xl text-left border transition-all relative ${
                  isSelected
                    ? 'bg-purple-600/15 border-purple-500/60 shadow-md shadow-purple-900/20'
                    : 'bg-[#131525] border-white/6 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg">{p.emoji}</span>
                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>{p.name}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 leading-snug">{p.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Dynamic Blank Bar when Global Persona is Custom */}
        {isGlobalCustomPersona && (
          <div className="p-3.5 rounded-2xl bg-purple-950/20 border border-purple-500/40 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                <PenTool className="w-3.5 h-3.5 text-purple-400" />
                <span>Your Custom Persona Instructions</span>
              </label>
              <span className="text-[10px] text-purple-300/80">Custom Bar Visible</span>
            </div>
            <textarea
              id="global-custom-persona-input"
              value={settings.aiCustomPersonaText || ''}
              onChange={(e) => updateSetting('aiCustomPersonaText', e.target.value)}
              placeholder="Type your custom persona prompt here (e.g., 'You are a warm, witty movie buff who always speaks like a cinema host, recommends indie flicks, and uses movie quotes')..."
              rows={2}
              className="w-full p-3 rounded-xl bg-black/60 border border-purple-500/30 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-400 transition-colors resize-none"
            />
          </div>
        )}
      </div>

      {/* 4. Custom System Instructions */}
      <div className="space-y-1.5">
        <p className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          System Instructions & Behavioral Rules
        </p>
        <div className="p-3.5 rounded-2xl bg-[#131525] border border-white/6 space-y-2 shadow-sm">
          <p className="text-[11px] text-slate-400">
            Format responses, enforce room rules, or specify general behavior:
          </p>
          <textarea
            id="ai-custom-instructions"
            value={settings.aiCustomInstructions || ''}
            onChange={(e) => updateSetting('aiCustomInstructions', e.target.value)}
            placeholder="e.g. Keep answers concise, recommend indie music in rooms, speak casually with gaming slang..."
            rows={2}
            className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
          />
        </div>
      </div>

      {/* 5. Privacy Safeguards */}
      <div className="space-y-1.5">
        <p className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Privacy & Memory
        </p>
        <div className="rounded-2xl bg-[#131525] border border-white/6 divide-y divide-white/5 overflow-hidden shadow-sm">
          <div className="p-3.5 flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>AI Privacy Shield</span>
              </p>
              <p className="text-[11px] text-slate-400">
                Never train public models on private room conversations or voice notes
              </p>
            </div>
            <button
              type="button"
              id="toggle-ai-privacy-shield"
              onClick={() =>
                updateSetting(
                  'aiPrivacyShield',
                  !settings.aiPrivacyShield,
                  settings.aiPrivacyShield ? 'Privacy shield disabled' : 'Privacy shield active'
                )
              }
              className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                settings.aiPrivacyShield ? 'bg-purple-600' : 'bg-white/10'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.aiPrivacyShield ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Reset AI Memory</p>
              <p className="text-[11px] text-slate-400">
                Clears cached session context and personalization history
              </p>
            </div>
            <button
              type="button"
              onClick={() => showToast('AI conversation memory cleared!')}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-all active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

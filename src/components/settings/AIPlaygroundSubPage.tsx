import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  Plus,
  Trash2,
  Edit2,
  Play,
  Check,
  X,
  AlertTriangle,
  Cpu,
  Globe,
  Sliders,
  Send,
  Terminal,
  RotateCcw,
  Copy,
  ExternalLink,
  Layers,
  Zap,
  Key,
  Eye,
  EyeOff,
  PenTool,
} from 'lucide-react';
import { AIModelProfile, DEFAULT_AI_MODELS } from '../../types/ai.ts';
import { api } from '../../services/api.ts';

interface AIPlaygroundSubPageProps {
  settings: any;
  updateSetting: (key: string, value: any, toastMsg?: string) => void;
  showToast: (msg: string) => void;
  onNavigateToConfig?: () => void;
  onNavigateToModel?: () => void;
}

export const AIPlaygroundSubPage: React.FC<AIPlaygroundSubPageProps> = ({
  settings,
  updateSetting,
  showToast,
  onNavigateToConfig,
  onNavigateToModel,
}) => {
  const modelsList: AIModelProfile[] = settings.aiModelsList || DEFAULT_AI_MODELS;

  // Active testing model in playground
  const [selectedPlaygroundModelId, setSelectedPlaygroundModelId] = useState<string>(
    modelsList[0]?.id || 'google-gemini-3.8-flash'
  );

  // Playground Prompt State
  const [promptInput, setPromptInput] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testMetrics, setTestMetrics] = useState<{
    latencyMs: number;
    model: string;
    provider: string;
    tokens?: number;
  } | null>(null);
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Modal States: Delete Confirmation
  const [modelToDelete, setModelToDelete] = useState<AIModelProfile | null>(null);

  // Modal States: Create / Edit
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [showModalApiKey, setShowModalApiKey] = useState(false);
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
    speed: '~100ms',
    contextWindow: '128K Tokens',
  });

  const selectedModel =
    modelsList.find((m) => m.id === selectedPlaygroundModelId) || modelsList[0] || DEFAULT_AI_MODELS[0];

  // 4 Predefined Personas + 1 Custom Option
  const PERSONA_OPTIONS = [
    {
      id: 'friendly',
      name: 'Friendly Host',
      desc: 'Warm, conversational, empathetic, and welcoming.',
      emoji: '🌟',
    },
    {
      id: 'concise',
      name: 'Concise & Direct',
      desc: 'Short, clean, action-oriented, zero fluff.',
      emoji: '⚡',
    },
    {
      id: 'creative',
      name: 'Creative & Playful',
      desc: 'Witty, storytelling, brainstorming, humor.',
      emoji: '🎨',
    },
    {
      id: 'technical',
      name: 'Technical & Expert',
      desc: 'Deep reasoning, structured explanations, accuracy.',
      emoji: '🔬',
    },
    {
      id: 'custom',
      name: 'Custom Persona',
      desc: 'Define your own unique persona and personality.',
      emoji: '✍️',
    },
  ];

  // Quick prompt presets
  const samplePrompts = [
    '👋 Write an engaging welcome message for a movie night hangout room.',
    '🍿 Suggest 3 sci-fi movie recommendations for a group watch party.',
    '⚡ Give a concise 2-sentence summary of artificial intelligence in social apps.',
    '🎉 Generate a fun trivia question with 4 options for room participants.',
  ];

  const handleOpenCreateModal = () => {
    setEditingModelId(null);
    setShowModalApiKey(false);
    setFormData({
      name: '',
      subName: '',
      apiKey: '',
      model: '',
      url: '/api/gemini/chat',
      provider: 'Google',
      persona: 'friendly',
      customPersona: '',
      badge: 'Custom',
      description: '',
      temperature: 0.7,
      speed: '~90ms',
      contextWindow: '128K Tokens',
    });
    setIsEditModalOpen(true);
  };

  const handleOpenEditModal = (model: AIModelProfile) => {
    setEditingModelId(model.id);
    setShowModalApiKey(false);
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
    setIsEditModalOpen(true);
  };

  const handlePreFill = (type: 'gemini' | 'grok' | 'openai' | 'claude' | 'ollama' | 'openrouter') => {
    if (type === 'openrouter') {
      setFormData((prev) => ({
        ...prev,
        name: 'OpenRouter DeepSeek R1',
        subName: 'OpenRouter R1',
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
    } else if (type === 'gemini') {
      setFormData((prev) => ({
        ...prev,
        name: 'Google Gemini 3.8 Flash',
        subName: 'Google Fast',
        model: 'gemini-3.8-flash',
        url: '/api/gemini/chat',
        provider: 'Google',
        persona: 'friendly',
        badge: 'Ultra Fast',
        description: 'Multi-modal low latency model optimized for real-time room communication.',
        temperature: 0.7,
        speed: '~75ms',
        contextWindow: '1M Tokens',
      }));
    } else if (type === 'grok') {
      setFormData((prev) => ({
        ...prev,
        name: 'xAI Grok-2',
        subName: 'Grok Sub',
        model: 'grok-2',
        url: 'https://api.x.ai/v1/chat/completions',
        provider: 'xAI',
        persona: 'creative',
        badge: 'Real-Time',
        description: 'Real-time contextual commentary and fast live stream captions.',
        temperature: 0.7,
        speed: '~140ms',
        contextWindow: '128K Tokens',
      }));
    } else if (type === 'openai') {
      setFormData((prev) => ({
        ...prev,
        name: 'OpenAI GPT-4o Mini',
        subName: 'GPT Fast',
        model: 'gpt-4o-mini',
        url: 'https://api.openai.com/v1/chat/completions',
        provider: 'OpenAI',
        persona: 'friendly',
        badge: 'Efficient',
        description: 'Lightweight multi-modal engine for rapid chat and translations.',
        temperature: 0.5,
        speed: '~95ms',
        contextWindow: '128K Tokens',
      }));
    } else if (type === 'claude') {
      setFormData((prev) => ({
        ...prev,
        name: 'Claude 3.5 Haiku',
        subName: 'Claude Fast',
        model: 'claude-3-5-haiku',
        url: 'https://api.anthropic.com/v1/messages',
        provider: 'Anthropic',
        persona: 'concise',
        badge: 'High Speed',
        description: 'Fast responsive Claude model with concise analytical reasoning.',
        temperature: 0.7,
        speed: '~105ms',
        contextWindow: '200K Tokens',
      }));
    } else if (type === 'ollama') {
      setFormData((prev) => ({
        ...prev,
        name: 'Local Ollama Llama 3',
        subName: 'Ollama Local',
        model: 'llama3:latest',
        url: 'http://localhost:11434/v1/chat/completions',
        provider: 'Ollama',
        persona: 'technical',
        badge: 'Local/Private',
        description: 'Private offline model running on local workstation.',
        temperature: 0.7,
        speed: '~60ms',
        contextWindow: '32K Tokens',
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
      speed: formData.speed || '~100ms',
      contextWindow: formData.contextWindow || '128K Tokens',
    };

    let updatedList: AIModelProfile[];
    if (editingModelId) {
      updatedList = modelsList.map((m) => (m.id === editingModelId ? newModel : m));
      showToast(`AI Model "${newModel.subName}" updated successfully!`);
    } else {
      updatedList = [...modelsList, newModel];
      showToast(`AI Model "${newModel.subName}" created and added to Playground!`);
      // Select the newly created model for testing
      setSelectedPlaygroundModelId(newModel.id);
    }

    updateSetting('aiModelsList', updatedList);
    setIsEditModalOpen(false);
    setEditingModelId(null);
  };

  const handleConfirmDelete = () => {
    if (!modelToDelete) return;
    const deletedId = modelToDelete.id;
    const deletedName = modelToDelete.name;

    const updatedList = modelsList.filter((m) => m.id !== deletedId);
    updateSetting('aiModelsList', updatedList, `AI model "${deletedName}" has been deleted.`);

    // If active in playground, fallback to first available
    if (selectedPlaygroundModelId === deletedId) {
      setSelectedPlaygroundModelId(updatedList[0]?.id || 'google-gemini-3.8-flash');
    }

    // Clean work assignments if assigned
    if (settings.aiWorkAssignments) {
      const wa = { ...settings.aiWorkAssignments };
      let changed = false;
      const fallbackId = 'google-gemini-3.8-flash';
      if (wa.chat_translate === deletedId) {
        wa.chat_translate = fallbackId;
        changed = true;
      }
      if (wa.subtitles === deletedId) {
        wa.subtitles = 'xai-grok-2';
        changed = true;
      }
      if (wa.live_video_language === deletedId) {
        wa.live_video_language = 'google-gemini-3.1-pro';
        changed = true;
      }
      if (wa.ai_chat === deletedId) {
        wa.ai_chat = fallbackId;
        changed = true;
      }
      if (changed) {
        updateSetting('aiWorkAssignments', wa);
      }
    }

    // Clean primary model if deleted
    if (settings.aiModel === deletedId) {
      updateSetting('aiModel', updatedList[0]?.id || 'google-gemini-3.8-flash');
    }

    setModelToDelete(null);
  };

  const handleRunPrompt = async (promptToRun?: string) => {
    const prompt = (promptToRun ?? promptInput).trim();
    if (!prompt) {
      showToast('Please type a prompt to test in the playground.');
      return;
    }

    setPromptLoading(true);
    setTestOutput(null);
    setTestMetrics(null);
    setCopiedResponse(false);

    try {
      const startTime = performance.now();
      const res = await api.testAIPlayground({
        prompt,
        modelId: selectedModel.id,
        modelName: selectedModel.model,
        provider: selectedModel.provider,
        apiKey: selectedModel.apiKey,
        url: selectedModel.url,
        temperature: selectedModel.temperature ?? 0.7,
        persona: selectedModel.persona || settings.aiPersona || 'friendly',
        customPersona:
          selectedModel.persona === 'custom'
            ? selectedModel.customPersona || settings.aiCustomPersonaText
            : undefined,
      });

      const elapsed = Math.round(performance.now() - startTime);

      setTestOutput(res.response);
      setTestMetrics({
        latencyMs: res.latencyMs || elapsed,
        model: res.model || selectedModel.model,
        provider: res.provider || selectedModel.provider,
        tokens: res.tokens,
      });
      showToast(`Response generated in ${res.latencyMs || elapsed}ms!`);
    } catch (err: any) {
      console.error('Playground test failed:', err);
      showToast(err?.message || 'Failed to generate playground response.');
    } finally {
      setPromptLoading(false);
    }
  };

  const handleCopyResponse = () => {
    if (!testOutput) return;
    navigator.clipboard.writeText(testOutput);
    setCopiedResponse(true);
    showToast('AI response copied to clipboard!');
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  return (
    <div className="space-y-6 pb-8 animate-fadeIn">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-[#141628] border border-white/10 shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Terminal className="w-4.5 h-4.5" />
            </div>
            <h2 className="text-base font-bold text-white tracking-tight">AI Playground</h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
              {modelsList.length} AIs Registered
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-xl">
            View, test, edit, and manage all your configured AI intelligence models in one unified interactive workspace.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="playground-create-ai-btn"
            onClick={handleOpenCreateModal}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-900/30 transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create AI</span>
          </button>
        </div>
      </div>

      {/* CREATED AI MODELS LIST */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              All Created AI Models ({modelsList.length})
            </h3>
          </div>
          {modelsList.length === 0 && (
            <button
              onClick={() => updateSetting('aiModelsList', DEFAULT_AI_MODELS, 'Defaults restored')}
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Defaults</span>
            </button>
          )}
        </div>

        {modelsList.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#141628]/60 border border-white/5 text-center space-y-3">
            <Bot className="w-10 h-10 text-slate-500 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-slate-200">No AI Models Found</p>
              <p className="text-xs text-slate-400 mt-1">
                You haven't created any custom AI models yet, or all were deleted.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={handleOpenCreateModal}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First AI</span>
              </button>
              <button
                onClick={() => updateSetting('aiModelsList', DEFAULT_AI_MODELS, 'Default models restored')}
                className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-white/10"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Defaults</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {modelsList.map((model) => {
              const isCurrentActive = selectedPlaygroundModelId === model.id;
              const isPrimaryEngine = settings.aiModel === model.id;
              const isTranslateWork = settings.aiWorkAssignments?.chat_translate === model.id;
              const isSubWork = settings.aiWorkAssignments?.subtitles === model.id;
              const isVideoWork = settings.aiWorkAssignments?.live_video_language === model.id;
              const isChatWork = settings.aiWorkAssignments?.ai_chat === model.id;

              return (
                <div
                  key={model.id}
                  id={`playground-ai-card-${model.id}`}
                  className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                    isCurrentActive
                      ? 'bg-[#181a33] border-purple-500/50 shadow-md shadow-purple-950/20 ring-1 ring-purple-500/30'
                      : 'bg-[#131525] border-white/5 hover:border-white/15'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Top Row: Info & Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-xs ${
                            model.provider === 'Google'
                              ? 'bg-gradient-to-br from-blue-600 to-indigo-600'
                              : model.provider === 'OpenAI'
                              ? 'bg-gradient-to-br from-emerald-600 to-teal-700'
                              : model.provider === 'xAI'
                              ? 'bg-gradient-to-br from-amber-600 to-orange-600'
                              : model.provider === 'Anthropic'
                              ? 'bg-gradient-to-br from-orange-600 to-rose-600'
                              : 'bg-gradient-to-br from-purple-600 to-pink-600'
                          }`}
                        >
                          {model.provider.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-sm font-bold text-white truncate">{model.name}</h4>
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {model.subName}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono truncate">
                            {model.provider} • {model.model}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                        {isPrimaryEngine && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Primary
                          </span>
                        )}
                        {isTranslateWork && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Translate
                          </span>
                        )}
                        {isSubWork && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Subtitles
                          </span>
                        )}
                        {isVideoWork && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            Video Lang
                          </span>
                        )}
                        {isChatWork && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            AI Chat
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    {model.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {model.description}
                      </p>
                    )}

                    {/* Metadata Specs */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap text-[10px] font-mono text-slate-400">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400" />
                        {model.speed || '~100ms'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-indigo-400" />
                        {model.contextWindow || '128K'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 flex items-center gap-1">
                        <Sliders className="w-3 h-3 text-purple-400" />
                        Temp: {model.temperature ?? 0.7}
                      </span>
                    </div>
                  </div>

                  {/* Actions: Edit, Delete, Select for Playground */}
                  <div className="flex items-center justify-between gap-2 pt-3.5 mt-3 border-t border-white/5">
                    <button
                      id={`playground-select-${model.id}`}
                      onClick={() => {
                        setSelectedPlaygroundModelId(model.id);
                        showToast(`Selected "${model.subName}" for Playground testing.`);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        isCurrentActive
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                      }`}
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>{isCurrentActive ? 'Active in Tester' : 'Test Model'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        id={`playground-edit-btn-${model.id}`}
                        onClick={() => handleOpenEditModal(model)}
                        className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors flex items-center gap-1 text-xs px-2.5"
                        title="Edit AI Model"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Edit</span>
                      </button>

                      <button
                        id={`playground-delete-btn-${model.id}`}
                        onClick={() => setModelToDelete(model)}
                        className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 transition-colors flex items-center gap-1 text-xs px-2.5"
                        title="Delete AI Model"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* INTERACTIVE PLAYGROUND CONSOLE */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#141628] border border-white/10 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4.5 h-4.5 text-purple-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Live Playground Console</h3>
              <p className="text-[11px] text-slate-400">
                Run prompts directly against the active AI model to inspect responses and latency.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Target Model:</span>
            <select
              id="playground-target-model-select"
              value={selectedPlaygroundModelId}
              onChange={(e) => setSelectedPlaygroundModelId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[#0f111e] border border-white/15 text-xs text-white font-semibold focus:outline-none focus:border-purple-500"
            >
              {modelsList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.subName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Sample Prompts */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Quick Sample Prompts:
          </p>
          <div className="flex flex-wrap gap-2">
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setPromptInput(p);
                  handleRunPrompt(p);
                }}
                className="text-left text-[11px] px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all active:scale-95 truncate max-w-xs"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt Input Form */}
        <div className="space-y-2">
          <div className="relative">
            <textarea
              id="playground-prompt-input"
              rows={3}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder={`Enter a prompt to test with ${selectedModel?.name || 'the model'}...`}
              className="w-full px-4 py-3 rounded-xl bg-[#0f111e] border border-white/15 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-purple-500 leading-relaxed resize-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>Endpoint:</span>
              <span className="font-mono text-purple-300 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                {selectedModel?.url || '/api/gemini/chat'}
              </span>
            </div>

            <button
              id="playground-run-prompt-btn"
              type="button"
              disabled={promptLoading || !promptInput.trim()}
              onClick={() => handleRunPrompt()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-md shadow-purple-900/30 transition-all active:scale-95 disabled:opacity-50"
            >
              {promptLoading ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Run in Playground</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Output Box */}
        {testOutput && (
          <div className="space-y-2 pt-2 animate-fadeIn">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  AI Output:
                </span>
                {testMetrics && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    ⚡ {testMetrics.latencyMs}ms • {testMetrics.provider} ({testMetrics.model})
                  </span>
                )}
              </div>

              <button
                id="playground-copy-output-btn"
                onClick={handleCopyResponse}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-semibold"
              >
                {copiedResponse ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedResponse ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#0e101c] border border-white/10 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans max-h-80 overflow-y-auto">
              {testOutput}
            </div>
          </div>
        )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {modelToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div
            id="playground-delete-modal"
            className="w-full max-w-md p-6 rounded-2xl bg-[#141628] border border-rose-500/30 shadow-2xl shadow-rose-950/40 space-y-4 animate-scaleUp"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete AI Model?</h3>
                <p className="text-xs text-slate-400">Confirm model removal</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/15 text-xs text-slate-300 leading-relaxed space-y-1">
              <p>
                Are you sure you want to delete{' '}
                <strong className="text-white font-semibold">{modelToDelete.name}</strong> (
                <span className="text-purple-300">{modelToDelete.subName}</span>)?
              </p>
              <p className="text-[11px] text-slate-400">
                This will permanently remove this AI from your AI Playground and unassign it from any
                active chat or subtitle work pipelines.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                id="playground-cancel-delete-btn"
                type="button"
                onClick={() => setModelToDelete(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                id="playground-confirm-delete-btn"
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-rose-900/40 transition-all active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete AI</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT AI MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div
            id="playground-edit-modal"
            className="w-full max-w-lg p-6 rounded-2xl bg-[#141628] border border-white/15 shadow-2xl my-8 space-y-5 animate-scaleUp"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  {editingModelId ? <Edit2 className="w-4.5 h-4.5" /> : <Plus className="w-4.5 h-4.5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingModelId ? 'Edit AI Model' : 'Create AI Model'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingModelId
                      ? 'Modify existing AI configuration parameters'
                      : 'Configure and add a new model to AI Playground'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Template Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Quick Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePreFill('openrouter')}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs border border-cyan-500/20 font-medium"
                >
                  🌐 OpenRouter
                </button>
                <button
                  type="button"
                  onClick={() => handlePreFill('gemini')}
                  className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs border border-blue-500/20 font-medium"
                >
                  ⚡ Gemini Flash
                </button>
                <button
                  type="button"
                  onClick={() => handlePreFill('grok')}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs border border-amber-500/20 font-medium"
                >
                  🚀 Grok-2
                </button>
                <button
                  type="button"
                  onClick={() => handlePreFill('openai')}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs border border-emerald-500/20 font-medium"
                >
                  🧠 GPT-4o Mini
                </button>
                <button
                  type="button"
                  onClick={() => handlePreFill('claude')}
                  className="px-2.5 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 text-xs border border-orange-500/20 font-medium"
                >
                  🎭 Claude Haiku
                </button>
                <button
                  type="button"
                  onClick={() => handlePreFill('ollama')}
                  className="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs border border-purple-500/20 font-medium"
                >
                  💻 Local Ollama
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveModel} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Google Gemini 3.8 Flash"
                    className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-white/15 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Sub Name / Tag</label>
                  <input
                    type="text"
                    value={formData.subName}
                    onChange={(e) => setFormData({ ...formData, subName: e.target.value })}
                    placeholder="e.g. Google Chat, Grok Sub"
                    className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-white/15 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* API Key */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-purple-400" />
                    API Key / Secret Token
                  </label>
                  <span className="text-[10px] text-slate-500">Optional for local or default env</span>
                </div>
                <div className="relative">
                  <input
                    type={showModalApiKey ? 'text' : 'password'}
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder="sk-... or AIzaSy..."
                    className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#0e101d] border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-purple-500 placeholder:text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowModalApiKey(!showModalApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showModalApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Model *</label>
                  <input
                    type="text"
                    required
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="e.g. gemini-3.8-flash, grok-2, gpt-4o-mini"
                    className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Provider</label>
                  <select
                    value={formData.provider}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        provider: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-white/15 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="Google">Google (Gemini)</option>
                    <option value="OpenRouter">OpenRouter (Universal Gateway)</option>
                    <option value="OpenAI">OpenAI (ChatGPT)</option>
                    <option value="xAI">xAI (Grok)</option>
                    <option value="Anthropic">Anthropic (Claude)</option>
                    <option value="Ollama">Ollama (Local)</option>
                    <option value="Custom">Custom Provider</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Bearer or URL / API Gateway</label>
                <input
                  type="text"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="/api/gemini/chat or https://api.openai.com/v1"
                  className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Persona Selection: 4 Options + 1 Custom Option */}
              <div className="space-y-2 pt-1 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <PenTool className="w-3.5 h-3.5 text-purple-400" />
                    Choose Persona (4 Options + 1 Custom)
                  </label>
                  <span className="text-[10px] text-purple-400 font-medium">
                    {formData.persona === 'custom' ? 'Custom Persona Selected' : 'Standard Preset'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PERSONA_OPTIONS.map((p) => {
                    const isSelected = formData.persona === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, persona: p.id })}
                        className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-purple-500/20 border-purple-500/60 shadow-sm shadow-purple-500/20'
                            : 'bg-[#0e101d] border-white/10 hover:border-white/20 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 w-full">
                          <span className="text-sm">{p.emoji}</span>
                          <span className="text-xs font-bold text-white truncate flex-1">{p.name}</span>
                          {isSelected && <Check className="w-3 h-3 text-purple-400 shrink-0" />}
                        </div>
                        <span className="text-[10px] text-slate-400 line-clamp-1 mt-1">{p.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Blank bar gets visible when user clicks custom persona */}
                {formData.persona === 'custom' && (
                  <div className="mt-2 space-y-1.5 p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-purple-300 flex items-center gap-1.5">
                        <PenTool className="w-3.5 h-3.5 text-purple-400" />
                        Custom Persona Prompt Instructions
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono">Dynamic Bar</span>
                    </div>
                    <textarea
                      rows={3}
                      value={formData.customPersona}
                      onChange={(e) => setFormData({ ...formData, customPersona: e.target.value })}
                      placeholder="Add your custom persona here... e.g. 'You are a lively anime commentator who loves gaming trivia and always uses hype phrases!'"
                      className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-purple-500/40 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400 resize-none font-sans shadow-inner"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Badge</label>
                  <input
                    type="text"
                    value={formData.badge}
                    onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                    placeholder="Ultra Fast"
                    className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-white/15 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Latency Speed</label>
                  <input
                    type="text"
                    value={formData.speed}
                    onChange={(e) => setFormData({ ...formData, speed: e.target.value })}
                    placeholder="~85ms"
                    className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-white/15 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Context Window</label>
                  <input
                    type="text"
                    value={formData.contextWindow}
                    onChange={(e) => setFormData({ ...formData, contextWindow: e.target.value })}
                    placeholder="1M Tokens"
                    className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-white/15 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-300">Temperature (Creativity)</span>
                  <span className="font-mono text-purple-400">{formData.temperature}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                  className="w-full accent-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what this AI model specializes in..."
                  className="w-full px-3 py-2 rounded-xl bg-[#0e101d] border border-white/15 text-xs text-white focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-purple-900/30 transition-all active:scale-95"
                >
                  {editingModelId ? 'Save Changes' : 'Create AI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

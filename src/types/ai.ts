export interface AIModelProfile {
  id: string;
  name: string; // e.g. "Google Gemini 3.8 Flash"
  subName: string; // e.g. "Google Chat", "Grok Sub", "GPT Subtitles"
  url: string; // Bearer / URL endpoint e.g. "/api/gemini/chat", "https://api.openai.com/v1/chat/completions"
  model: string; // e.g. "gemini-3.8-flash", "grok-2", "gpt-4o"
  provider: 'Google' | 'OpenAI' | 'OpenRouter' | 'xAI' | 'Anthropic' | 'Ollama' | 'Custom';
  apiKey?: string; // API Key / Bearer Auth Token
  apiKeyRef?: string; // Key reference or secret identifier
  persona?: 'friendly' | 'concise' | 'creative' | 'technical' | 'custom' | string;
  customPersona?: string; // User-added custom persona instructions when persona is 'custom'
  badge?: string;
  badgeColor?: string;
  description?: string;
  isCustom?: boolean;
  status: 'active' | 'ready' | 'standby';
  temperature?: number;
  contextWindow?: string;
  speed?: string;
}

export interface AIWorkAssignments {
  chat_translate: string; // Chat translate ai selection (default: "google-gemini-3.8-flash")
  subtitles: string; // Subtitles ai selection (default: "xai-grok-2")
  live_video_language: string; // Live video language ai selection (default: "google-gemini-3.1-pro")
  ai_chat: string; // Ai chat ai selection (default: "google-gemini-3.8-flash")
}

export const DEFAULT_AI_MODELS: AIModelProfile[] = [
  {
    id: 'google-gemini-3.8-flash',
    name: 'Google Gemini 3.8 Flash',
    subName: 'Google Chat',
    url: '/api/gemini/chat',
    model: 'gemini-3.8-flash',
    provider: 'Google',
    badge: 'Ultra Fast',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    description: 'Ultra-low latency (~75ms), multi-modal context, optimized for real-time room chat and fast responses.',
    status: 'active',
    contextWindow: '1M Tokens',
    speed: '~75ms',
    temperature: 0.7,
  },
  {
    id: 'google-gemini-3.1-pro',
    name: 'Google Gemini 3.1 Pro',
    subName: 'Google Deep Think',
    url: '/api/gemini/chat',
    model: 'gemini-3.1-pro-preview',
    provider: 'Google',
    badge: 'Deep Reasoning',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    description: 'Advanced reasoning, complex logic, multi-step problem solving, and comprehensive room summarization.',
    status: 'ready',
    contextWindow: '2M Tokens',
    speed: '~190ms',
    temperature: 0.6,
  },
  {
    id: 'openai-gpt-4o',
    name: 'OpenAI GPT-4o',
    subName: 'GPT Subtitles',
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    provider: 'OpenAI',
    badge: 'Multi-Modal',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    description: 'High-precision language translation, video captions, and rapid transcript generation.',
    status: 'ready',
    contextWindow: '128K Tokens',
    speed: '~220ms',
    temperature: 0.5,
  },
  {
    id: 'xai-grok-2',
    name: 'xAI Grok-2',
    subName: 'Grok Sub',
    url: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-2',
    provider: 'xAI',
    badge: 'Real-Time',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    description: 'Real-time contextual comprehension, witty commentary, and high-speed live room subtitles.',
    status: 'ready',
    contextWindow: '128K Tokens',
    speed: '~140ms',
    temperature: 0.7,
  },
  {
    id: 'anthropic-claude-3-5',
    name: 'Claude 3.5 Sonnet',
    subName: 'Claude Prose',
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-sonnet',
    provider: 'Anthropic',
    badge: 'High Nuance',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    description: 'Renowned for human-like conversational warmth, creative prose, and deep analysis.',
    status: 'ready',
    contextWindow: '200K Tokens',
    speed: '~240ms',
    temperature: 0.7,
  },
  {
    id: 'local-ollama-llama3',
    name: 'Ollama Llama 3',
    subName: 'Local Offline AI',
    url: 'http://localhost:11434/v1/chat/completions',
    model: 'llama3.2:latest',
    provider: 'Ollama',
    badge: 'Local/Private',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    description: 'Runs entirely on local hardware with zero external API calls or latency.',
    status: 'ready',
    contextWindow: '128K Tokens',
    speed: '~60ms',
    temperature: 0.7,
  },
  {
    id: 'openrouter-deepseek-r1',
    name: 'OpenRouter DeepSeek R1',
    subName: 'OpenRouter R1',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-r1',
    provider: 'OpenRouter',
    badge: 'Reasoning',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    description: 'Universal OpenRouter gateway with top-tier deep reasoning and open model ecosystem.',
    status: 'ready',
    contextWindow: '128K Tokens',
    speed: '~180ms',
    temperature: 0.6,
  },
];

export const DEFAULT_AI_WORK_ASSIGNMENTS: AIWorkAssignments = {
  chat_translate: 'google-gemini-3.8-flash',
  subtitles: 'xai-grok-2',
  live_video_language: 'google-gemini-3.1-pro',
  ai_chat: 'google-gemini-3.8-flash',
};

import React, { useState, useEffect } from 'react';
import { Languages, RefreshCw, AlertCircle, ChevronDown } from 'lucide-react';
import { api } from '../../services/api.ts';
import { SUPPORTED_LANGUAGES } from '../../i18n/translations.ts';

interface ChatTranslateControlProps {
  originalText: string;
  targetLanguage?: string;
  onTextUpdate?: (text: string) => void;
  className?: string;
  isMe?: boolean;
}

export interface TranslationCacheItem {
  translatedText: string;
  detectedSourceLanguage?: string;
  targetLanguage: string;
  provider?: string;
}

// Memory cache across messages so re-translating is instant and respects text, target language, and model
const translationCache = new Map<string, TranslationCacheItem>();

export const ChatTranslateControl: React.FC<ChatTranslateControlProps> = ({
  originalText,
  targetLanguage: initialTargetLanguage = 'es',
  onTextUpdate,
  className = '',
  isMe = false,
}) => {
  const [selectedTargetLang, setSelectedTargetLang] = useState(initialTargetLanguage);
  const [isTranslated, setIsTranslated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Synchronize target language when prop changes
  useEffect(() => {
    if (initialTargetLanguage) {
      setSelectedTargetLang(initialTargetLanguage);
    }
  }, [initialTargetLanguage]);

  // Reset translation if originalText changes
  useEffect(() => {
    setIsTranslated(false);
    setErrorMsg(null);
  }, [originalText]);

  if (isMe || !originalText || !originalText.trim()) {
    return null;
  }

  const effectiveTargetLang = selectedTargetLang || 'es';

  const executeTranslation = async (langCode: string) => {
    setErrorMsg(null);
    const key = `${originalText.trim()}__${langCode.toLowerCase()}`;

    // Check if valid translation is cached
    const cached = translationCache.get(key);
    if (cached && cached.translatedText && cached.translatedText.trim()) {
      setIsTranslated(true);
      setProvider(cached.provider || null);
      onTextUpdate?.(cached.translatedText);
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.translateChatMessage(originalText, langCode);
      if (res && res.success && res.translatedText) {
        const item: TranslationCacheItem = {
          translatedText: res.translatedText,
          detectedSourceLanguage: res.detectedSourceLanguage,
          targetLanguage: res.targetLanguage || langCode,
          provider: res.provider,
        };
        translationCache.set(key, item);
        setIsTranslated(true);
        setProvider(item.provider || null);
        onTextUpdate?.(res.translatedText);
      } else {
        setErrorMsg(res?.error || 'Translation failed');
      }
    } catch (err: any) {
      console.warn('Chat translation failed:', err);
      setErrorMsg(err?.message || 'Translation unavailable');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTranslate = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // If currently translated, switch back to original
    if (isTranslated) {
      setIsTranslated(false);
      onTextUpdate?.(originalText);
      return;
    }

    await executeTranslation(effectiveTargetLang);
  };

  const handleSelectLanguage = async (e: React.MouseEvent, langCode: string) => {
    e.stopPropagation();
    setSelectedTargetLang(langCode);
    setShowLangMenu(false);
    await executeTranslation(langCode);
  };

  // State 1: Loading
  if (isLoading) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] text-purple-400 font-medium ${className}`}>
        <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
        <span>Translating ({effectiveTargetLang.toUpperCase()})...</span>
      </span>
    );
  }

  // State 2: Error -> show retry button with clear message
  if (errorMsg) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] text-rose-400 font-medium ${className}`}>
        <AlertCircle className="w-3 h-3 shrink-0" />
        <button
          type="button"
          onClick={handleToggleTranslate}
          className="hover:underline cursor-pointer font-semibold"
          title={errorMsg}
        >
          Retry
        </button>
      </span>
    );
  }

  // State 3: Translated -> show Language tag, Provider, & "(Original)" button
  if (isTranslated) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[10px] select-none ${className}`}>
        <span className="px-1.5 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold text-[9px] uppercase tracking-wider">
          {effectiveTargetLang}
        </span>
        {provider && (
          <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium text-[9px] tracking-tight">
            {provider}
          </span>
        )}
        <button
          type="button"
          onClick={handleToggleTranslate}
          className="font-semibold text-purple-400 hover:text-purple-300 transition-all hover:underline cursor-pointer active:scale-95 ml-0.5"
          title="Click to view original text"
        >
          (Original)
        </button>

        {/* Change language button while translated */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowLangMenu(!showLangMenu);
          }}
          className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-purple-300"
          title="Translate to another language"
        >
          <ChevronDown className="w-2.5 h-2.5 shrink-0" />
        </button>

        {/* Language dropdown menu */}
        {showLangMenu && (
          <div
            className="absolute bottom-full left-0 mb-1.5 z-50 w-36 max-h-48 overflow-y-auto rounded-xl bg-[#181a2f] border border-purple-500/30 shadow-2xl p-1 text-left space-y-0.5 custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={(e) => handleSelectLanguage(e, lang.code)}
                className={`w-full text-left px-2 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center justify-between ${
                  effectiveTargetLang === lang.code
                    ? 'bg-purple-600 text-white font-semibold'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="truncate">{lang.name}</span>
                <span className="text-[9px] uppercase font-mono opacity-60 ml-1">{lang.code}</span>
              </button>
            ))}
          </div>
        )}
      </span>
    );
  }

  // State 4: Untranslated -> clean, small translation icon button with language picker
  return (
    <span className="relative inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={handleToggleTranslate}
        className={`inline-flex items-center justify-center p-0.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-purple-300 transition-colors active:scale-90 ${className}`}
        title={`Translate message to ${effectiveTargetLang.toUpperCase()}`}
        aria-label="Translate message"
      >
        <Languages className="w-3.5 h-3.5 shrink-0" />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowLangMenu(!showLangMenu);
        }}
        className="text-[9px] font-bold text-slate-400 hover:text-purple-300 px-1 py-0.5 rounded hover:bg-white/10 flex items-center gap-0.5 uppercase tracking-wider"
        title="Select translation language"
      >
        <span>{effectiveTargetLang}</span>
        <ChevronDown className="w-2.5 h-2.5 shrink-0" />
      </button>

      {/* Language dropdown menu */}
      {showLangMenu && (
        <div
          className="absolute bottom-full left-0 mb-1.5 z-50 w-36 max-h-48 overflow-y-auto rounded-xl bg-[#181a2f] border border-purple-500/30 shadow-2xl p-1 text-left space-y-0.5 custom-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={(e) => handleSelectLanguage(e, lang.code)}
              className={`w-full text-left px-2 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center justify-between ${
                effectiveTargetLang === lang.code
                  ? 'bg-purple-600 text-white font-semibold'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="truncate">{lang.name}</span>
              <span className="text-[9px] uppercase font-mono opacity-60 ml-1">{lang.code}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
};

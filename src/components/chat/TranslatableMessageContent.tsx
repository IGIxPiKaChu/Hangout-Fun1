import React, { useState, useEffect } from 'react';
import { ChatTranslateControl } from './ChatTranslateControl.tsx';
import { useApp } from '../../context/AppContext.tsx';

interface TranslatableMessageContentProps {
  text: string;
  targetLanguage?: string;
  isMe?: boolean;
  className?: string;
}

export const TranslatableMessageContent: React.FC<TranslatableMessageContentProps> = ({
  text,
  targetLanguage: propTargetLanguage,
  isMe = false,
  className = '',
}) => {
  const { userSettings, appLanguage } = useApp();
  const effectiveTarget = propTargetLanguage || userSettings?.chatTranslationLanguage || userSettings?.language || appLanguage || 'es';
  const [displayText, setDisplayText] = useState(text);

  useEffect(() => {
    setDisplayText(text);
  }, [text]);

  if (!text) return null;

  // Do not show translation option on current user's own sent messages
  if (isMe) {
    return <div className={`break-words ${className}`}>{text}</div>;
  }

  return (
    <div className={`break-words ${className}`}>
      <span>{displayText}</span>
      <span className="inline-block align-middle ml-1.5">
        <ChatTranslateControl
          originalText={text}
          targetLanguage={effectiveTarget}
          onTextUpdate={setDisplayText}
          isMe={isMe}
        />
      </span>
    </div>
  );
};

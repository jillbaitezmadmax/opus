import React, { useState, useEffect, useRef } from 'react';
import { CodeBlockCopyButton } from './CodeBlockCopyButton';

// language detector unchanged
const detectLanguage = (code: string): string => {
  const trimmed = code.trim();
  if (trimmed.includes('interface ') ||
      trimmed.includes('type ') ||
      trimmed.includes('declare ') ||
      (trimmed.includes(': ') && trimmed.includes('=>'))) {
    return 'typescript';
  }
  if (trimmed.includes('const ') ||
      trimmed.includes('let ') ||
      trimmed.includes('function ') ||
      trimmed.includes('=>')) {
    return 'javascript';
  }
  return 'text';
};

interface CodeBlockWrapperProps {
  children: string;
  className?: string;
  style?: React.CSSProperties;
}

export const CodeBlockWrapper: React.FC<CodeBlockWrapperProps> = ({ children, className = '', style }) => {
  const text = children || '';
  // Regex:
  // - matches fenced code blocks: ```[language]? newline content ```
  // - language can be any non-newline sequence (so c++, c#, text-x etc. are allowed)
  // - captures inline code with single backticks `...`
  const codeBlockRegex = /```([^\n`]*)\n([\s\S]*?)```|`([^`]+)`/g;

  const parts: JSX.Element[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = codeBlockRegex.lastIndex;

    // push text before the code block
    if (matchStart > lastIndex) {
      const plain = text.slice(lastIndex, matchStart);
      parts.push(<span key={`text-${idx++}`}>{plain}</span>);
    }

    // If match[2] exists => fenced code block; else match[3] is inline code
    if (match[2] !== undefined) {
      const language = (match[1] || '').trim() || detectLanguage(match[2]);
      const codeText = match[2];

      parts.push(
        <div key={`code-${idx++}`} style={{ position: 'relative', margin: '8px 0' }}>
          <pre
            className={`language-${language}`}
            style={{
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              padding: '16px',
              color: '#e2e8f0',
              fontSize: '13px',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap', // preserve long lines but allow wrap if needed
              margin: 0,
            }}
          >
            {codeText}
          </pre>
          <CodeBlockCopyButton text={codeText} />
        </div>
      );
    } else {
      // inline code
      const inline = match[3] || '';
      parts.push(
        <code
          key={`inline-${idx++}`}
          style={{
            background: 'rgba(0,0,0,0.4)',
            borderRadius: 4,
            padding: '2px 6px',
            color: '#e2e8f0',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '13px',
          }}
        >
          {inline}
        </code>
      );
    }

    lastIndex = matchEnd;
  }

  // remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={`text-final`}>{text.slice(lastIndex)}</span>);
  }

  // if no code blocks matched, just render the original text
  if (parts.length === 0) {
    return <div className={className} style={style}>{text}</div>;
  }

  return <div className={className} style={style}>{parts}</div>;
};

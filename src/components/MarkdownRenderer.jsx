import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

function renderInline(text) {
  if (!text) return null;
  // Split by inline code `...` and bold **...**
  const tokens = String(text).split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length >= 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-neutral-800 border border-neutral-700 font-mono text-xs text-emerald-300 break-all"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length >= 4) {
      return (
        <strong key={i} className="font-bold text-white">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });
}

function CodeSnippet({ lang, code }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-neutral-700/90 bg-[#0b0c0b]">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-neutral-800 bg-neutral-900/90 text-xs">
        <span className="font-mono font-semibold text-neutral-300 uppercase">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-neutral-300 hover:text-emerald-300 font-medium transition"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">{t('ai.copied')}</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>{t('ai.copyCode')}</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs sm:text-sm font-mono text-neutral-100 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function MarkdownRenderer({ content = '' }) {
  if (!content) return null;

  // Split by fenced code blocks ```lang\n...\n```
  const segments = String(content).split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 text-sm sm:text-base text-neutral-200 leading-relaxed">
      {segments.map((seg, segIdx) => {
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const inner = seg.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const lang = firstNewline !== -1 ? inner.slice(0, firstNewline).trim() : '';
          const code = firstNewline !== -1 ? inner.slice(firstNewline + 1) : inner;
          return <CodeSnippet key={segIdx} lang={lang} code={code.replace(/\n$/, '')} />;
        }

        const lines = seg.split('\n');
        const elements = [];
        let listItems = [];
        let listOrdered = false;

        const flushList = (keySuffix) => {
          if (listItems.length === 0) return;
          const Tag = listOrdered ? 'ol' : 'ul';
          elements.push(
            <Tag
              key={`list-${segIdx}-${keySuffix}`}
              className={`space-y-1.5 pl-5 ${
                listOrdered ? 'list-decimal' : 'list-disc'
              } marker:text-emerald-400`}
            >
              {listItems.map((item, idx) => (
                <li key={idx} className="text-neutral-200 pl-1">
                  {renderInline(item)}
                </li>
              ))}
            </Tag>
          );
          listItems = [];
        };

        lines.forEach((rawLine, lineIdx) => {
          const trimmed = rawLine.trim();
          if (!trimmed) {
            flushList(lineIdx);
            return;
          }

          if (/^---+$/.test(trimmed)) {
            flushList(lineIdx);
            elements.push(<hr key={`hr-${lineIdx}`} className="border-neutral-800 my-3" />);
            return;
          }

          const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
          if (headingMatch) {
            flushList(lineIdx);
            const level = headingMatch[1].length;
            const titleText = headingMatch[2];
            const cls =
              level === 1
                ? 'text-lg sm:text-xl font-extrabold text-white pt-3'
                : level === 2
                ? 'text-base sm:text-lg font-extrabold text-white pt-3'
                : 'text-sm sm:text-base font-bold text-emerald-300 pt-2';
            elements.push(
              <div key={`h-${lineIdx}`} className={cls}>
                {renderInline(titleText)}
              </div>
            );
            return;
          }

          const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
          if (bulletMatch) {
            if (listItems.length > 0 && listOrdered) flushList(lineIdx);
            listOrdered = false;
            listItems.push(bulletMatch[1]);
            return;
          }

          const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
          if (orderedMatch) {
            if (listItems.length > 0 && !listOrdered) flushList(lineIdx);
            listOrdered = true;
            listItems.push(orderedMatch[1]);
            return;
          }

          flushList(lineIdx);
          elements.push(
            <p key={`p-${lineIdx}`} className="text-neutral-200 break-words">
              {renderInline(trimmed)}
            </p>
          );
        });

        flushList('end');
        return <React.Fragment key={segIdx}>{elements}</React.Fragment>;
      })}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Play,
  RotateCcw,
  FileCode2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertCircle,
  GitBranch,
  Loader2,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { formatDateTime } from '../lib/constants';
import { apiFetch } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';

const CUSTOM_SENTINEL = '__custom__';

export default function AiSuggestionBlock({ bug, onBugUpdated }) {
  const { t, language, locale } = useLanguage();
  const [models, setModels] = useState([]);
  const [endpointHint, setEndpointHint] = useState('');
  const [selectedModel, setSelectedModel] = useState(bug?.ai_model || '');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [customModel, setCustomModel] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState('');
  const [showFiles, setShowFiles] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadModels() {
      try {
        const data = await apiFetch('/api/ai/models');
        if (!active) return;
        const list = Array.isArray(data?.models) ? data.models : [];
        setModels(list);
        if (data?.apiUrl) {
          try {
            setEndpointHint(new URL(data.apiUrl).host);
          } catch {
            setEndpointHint(data.apiUrl);
          }
        }
        if (list.length > 0) {
          const matchBugModel = bug?.ai_model && list.some((m) => m.id === bug.ai_model);
          setSelectedModel((prev) => {
            if (prev && list.some((m) => m.id === prev)) return prev;
            return matchBugModel ? bug.ai_model : list[0].id;
          });
        } else {
          setUseCustomModel(true);
          if (bug?.ai_model) setCustomModel(bug.ai_model);
        }
      } catch {
        // Fallback if endpoint unreachable
      }
    }
    loadModels();
    return () => {
      active = false;
    };
  }, [bug?.ai_model]);

  let analyzedFiles = [];
  if (bug?.ai_analyzed_files) {
    try {
      analyzedFiles = JSON.parse(bug.ai_analyzed_files);
    } catch {}
  }

  const effectiveModel = useCustomModel ? customModel.trim() : selectedModel;

  const runAnalysis = async () => {
    setAnalyzing(true);
    setError('');
    setSteps([t('ai.initStep')]);

    try {
      const response = await fetch(`/api/bugs/${bug.id}/ai-analyze?stream=1`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: effectiveModel || undefined,
          language,
        }),
      });

      if (!response.ok || !response.body) {
        let errMsg = t('ai.startError', { status: response.status });
        try {
          const j = await response.json();
          if (j?.error) errMsg = j.error;
        } catch {}
        throw new Error(errMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const chunk of parts) {
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;

          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'step' && evt.message) {
              setSteps((prev) => [...prev, evt.message]);
            } else if (evt.type === 'done' && evt.bug) {
              onBugUpdated(evt.bug);
            } else if (evt.type === 'error') {
              setError(evt.error || t('ai.genericError'));
            }
          } catch {}
        }
      }
    } catch (err) {
      setError(err.message || t('ai.connectionError'));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCopyAll = async () => {
    if (!bug?.ai_suggestion) return;
    try {
      await navigator.clipboard.writeText(bug.ai_suggestion);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {}
  };

  return (
    <div className="card-surface border-emerald-500/30 p-5 sm:p-6 space-y-5 relative overflow-hidden">
      {/* Subtle emerald ambient accent */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/[0.06] rounded-full blur-3xl pointer-events-none" />

      {/* Header & Controls */}
      <div className="flex flex-col gap-4 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-emerald-300" />
              </div>
              <span>{t('ai.title')}</span>
            </h2>
            <p className="text-xs sm:text-sm text-neutral-300 mt-1 leading-relaxed">
              {t('ai.subtitle')}
            </p>
          </div>

          {bug?.project_github_repo ? (
            <span className="self-start inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-1 text-xs font-mono text-emerald-300 shrink-0">
              <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
              <span>{bug.project_github_repo}</span>
            </span>
          ) : (
            <span className="self-start inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs text-amber-200 shrink-0">
              <span>{t('ai.noRepoBadge')}</span>
            </span>
          )}
        </div>

        {/* Model Selector + Run Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-1">
          <div className="flex-1 min-w-0 space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              {t('ai.modelLabel')}
              {endpointHint ? ` • ${endpointHint}` : ''}
            </label>
            <select
              disabled={analyzing}
              value={useCustomModel ? CUSTOM_SENTINEL : selectedModel}
              onChange={(e) => {
                if (e.target.value === CUSTOM_SENTINEL) {
                  setUseCustomModel(true);
                } else {
                  setUseCustomModel(false);
                  setSelectedModel(e.target.value);
                }
              }}
              className="input-field py-2 text-xs sm:text-sm font-mono"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label || m.id}
                </option>
              ))}
              <option value={CUSTOM_SENTINEL}>{t('ai.customModelOption')}</option>
            </select>

            {useCustomModel && (
              <input
                type="text"
                disabled={analyzing}
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder={t('ai.customModelPlaceholder')}
                className="input-field py-2 text-xs sm:text-sm font-mono"
              />
            )}
          </div>

          <div className="shrink-0">
            <button
              type="button"
              disabled={analyzing}
              onClick={runAnalysis}
              className="btn-primary w-full sm:w-auto py-2.5 px-5"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('ai.analyzing')}</span>
                </>
              ) : bug?.ai_suggestion ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>{t('ai.rerunAnalysis')}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>{t('ai.runAnalysis')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-400/45 bg-red-500/15 px-4 py-3 text-sm text-red-200 relative z-10">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-300 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Live Agentic Steps Progress */}
      {analyzing && steps.length > 0 && (
        <div className="rounded-xl border border-emerald-500/35 bg-[#0b0d0c] p-4 space-y-2.5 relative z-10">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t('ai.liveProgress')}</span>
          </div>
          <div className="space-y-1.5 text-xs font-mono text-neutral-300 max-h-44 overflow-y-auto">
            {steps.map((stepMsg, i) => {
              const isLatest = i === steps.length - 1;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 ${
                    isLatest ? 'text-emerald-200 font-semibold' : 'text-neutral-400'
                  }`}
                >
                  <span className="text-emerald-500 shrink-0">{isLatest ? '▸' : '✓'}</span>
                  <span>{stepMsg}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Generated AI Suggestion Result */}
      {bug?.ai_suggestion && !analyzing && (
        <div className="space-y-4 pt-3 border-t border-neutral-800/90 relative z-10">
          {/* Metadata & Inspected Files Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-300">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-neutral-800 border border-neutral-700 font-mono text-emerald-300">
                {bug.ai_model}
              </span>
              {bug.ai_generated_at && (
                <span className="text-neutral-400">
                  {t('ai.generatedAt', { date: formatDateTime(bug.ai_generated_at, locale) })}
                </span>
              )}
              {analyzedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowFiles((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 font-medium transition"
                >
                  <FileCode2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>{t('ai.analyzedFiles', { count: analyzedFiles.length })}</span>
                  {showFiles ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 px-3 py-1 text-xs font-semibold text-neutral-200 transition"
            >
              {copiedAll ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">{t('ai.copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t('ai.copyAll')}</span>
                </>
              )}
            </button>
          </div>

          {showFiles && analyzedFiles.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/90 p-3.5 flex flex-wrap gap-1.5">
              {analyzedFiles.map((fp) => (
                <span
                  key={fp}
                  className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-[11px] text-neutral-300"
                >
                  {fp}
                </span>
              ))}
            </div>
          )}

          {/* Rendered Markdown Suggestion */}
          <div className="rounded-xl border border-neutral-800/90 bg-neutral-950/80 p-4 sm:p-6">
            <MarkdownRenderer content={bug.ai_suggestion} />
          </div>
        </div>
      )}
    </div>
  );
}

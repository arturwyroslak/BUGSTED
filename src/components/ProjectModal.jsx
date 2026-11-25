import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FolderPlus,
  AlertCircle,
  GitBranch,
  RefreshCw,
  Lock,
  Globe,
  Search,
  Sparkles,
} from 'lucide-react';
import { PROJECT_COLORS } from '../lib/constants';
import { apiFetch } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';

export default function ProjectModal({ project = null, onClose, onSaved }) {
  const { t } = useLanguage();
  const isEdit = Boolean(project?.id);
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [url, setUrl] = useState(project?.url || '');
  const [color, setColor] = useState(project?.color || PROJECT_COLORS[0]);

  // GitHub Repository & Issues Integration settings
  const [githubRepo, setGithubRepo] = useState(project?.github_repo || '');
  const [githubSyncEnabled, setGithubSyncEnabled] = useState(
    Boolean(project?.github_sync_enabled)
  );
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [reposError, setReposError] = useState('');
  const [repoSearch, setRepoSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fetchRepos = async (refresh = false) => {
    setLoadingRepos(true);
    setReposError('');
    try {
      const data = await apiFetch(
        `/api/admin/github/repos${refresh ? '?refresh=1' : ''}`
      );
      setRepos(data.repos || []);
    } catch (err) {
      setReposError(err.message || 'Failed to fetch repositories.');
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    fetchRepos(false);
  }, []);

  const filteredRepos = useMemo(() => {
    const q = repoSearch.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
    );
  }, [repos, repoSearch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (githubSyncEnabled && !githubRepo.trim()) {
      setError(t('projectModal.errSelectRepoForSync'));
      return;
    }

    setSaving(true);
    try {
      const data = await apiFetch(isEdit ? `/api/projects/${project.id}` : '/api/projects', {
        method: isEdit ? 'PUT' : 'POST',
        body: {
          name,
          description,
          url,
          color,
          github_sync_enabled: githubSyncEnabled,
          github_repo: githubRepo.trim(),
        },
      });
      onSaved(data.project);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl card-surface border-neutral-700/90 shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-neutral-800 bg-gradient-to-r from-emerald-500/[0.07] via-neutral-900/60 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/35 flex items-center justify-center">
              <FolderPlus className="w-4 h-4 text-emerald-300" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              {isEdit ? t('projectModal.editTitle') : t('projectModal.createTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-400/45 bg-red-500/15 px-4 py-3 text-sm text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-300" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
              {t('projectModal.nameLabel')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('projectModal.namePlaceholder')}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
              {t('projectModal.urlLabel')}{' '}
              <span className="text-neutral-400 font-normal">({t('common.optional')})</span>
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('projectModal.urlPlaceholder')}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
              {t('projectModal.descLabel')}{' '}
              <span className="text-neutral-400 font-normal">({t('common.optional')})</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('projectModal.descPlaceholder')}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-200 mb-2">
              {t('projectModal.colorLabel')}
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={`w-7 h-7 rounded-full transition transform ${
                    color === c
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900 scale-110'
                      : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* GitHub Repository (AI Analysis + Two-Way Issues Sync) */}
          <div className="rounded-xl border border-neutral-700/90 bg-gradient-to-b from-neutral-900 to-neutral-950 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{t('projectModal.githubSectionTitle')}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchRepos(true)}
                disabled={loadingRepos}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingRepos ? 'animate-spin' : ''}`} />
                <span>{loadingRepos ? t('projectModal.fetchingRepos') : t('projectModal.refreshRepos')}</span>
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed flex items-start gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>{t('projectModal.githubHint')}</span>
            </p>

            {reposError && (
              <div className="text-xs text-amber-200 bg-amber-500/15 border border-amber-400/35 rounded-lg px-3 py-2">
                {t('projectModal.reposErrorFallback', { error: reposError })}
              </div>
            )}

            {repos.length > 5 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  placeholder={t('projectModal.filterRepos')}
                  className="input-field pl-9 py-2 text-xs"
                />
              </div>
            )}

            {repos.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 divide-y divide-neutral-800/80">
                {filteredRepos.length === 0 ? (
                  <div className="p-3 text-xs text-neutral-400 text-center">
                    {t('projectModal.noMatchingRepos')}
                  </div>
                ) : (
                  filteredRepos.map((r) => {
                    const selected = githubRepo.toLowerCase() === r.full_name.toLowerCase();
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setGithubRepo(selected ? '' : r.full_name)}
                        className={`w-full text-left px-3.5 py-2 flex items-center justify-between gap-2 text-xs transition ${
                          selected
                            ? 'bg-emerald-500/15 text-emerald-200 font-bold'
                            : 'text-neutral-200 hover:bg-neutral-800/70'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {r.private ? (
                            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <Globe className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          )}
                          <span className="truncate">{r.full_name}</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 shrink-0">
                          {selected
                            ? t('projectModal.selected')
                            : r.private
                            ? t('projectModal.privateRepo')
                            : t('projectModal.publicRepo')}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                {t('projectModal.repoInputLabel')}
              </label>
              <input
                type="text"
                required={githubSyncEnabled}
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder={t('projectModal.repoInputPlaceholder')}
                className="input-field py-2 text-xs font-mono"
              />
            </div>

            {/* Two-Way GitHub Issues Toggle */}
            <div className="flex items-start justify-between gap-4 pt-3 border-t border-neutral-800">
              <div className="space-y-0.5">
                <div className="text-xs sm:text-sm font-bold text-white">
                  {t('projectModal.syncTitle')}
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  {t('projectModal.syncDesc')}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={githubSyncEnabled}
                onClick={() => setGithubSyncEnabled((v) => !v)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition duration-200 ${
                  githubSyncEnabled
                    ? 'bg-emerald-600 border-emerald-400/60 shadow-[0_0_14px_-2px_rgba(16,185,129,0.5)]'
                    : 'bg-neutral-800 border-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                    githubSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-4 border-t border-neutral-800">
            <button type="button" onClick={onClose} className="btn-secondary w-full sm:w-auto">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto">
              {saving
                ? t('common.saving')
                : isEdit
                ? t('projectModal.saveEdit')
                : t('projectModal.saveCreate')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  PlusCircle,
  Search,
  Image as ImageIcon,
  Video,
  MessageSquare,
  ExternalLink,
  ArrowLeft,
  Pencil,
  RotateCcw,
  GitBranch,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  STATUSES,
  STATUS_LIST,
  PRIORITIES,
  PRIORITY_LIST,
  formatDateTime,
} from '../lib/constants';
import ProjectModal from '../components/ProjectModal';

export default function ApplicationDashboardPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const canChangeStatus = user?.role === 'admin' || user?.role === 'dev';

  const [project, setProject] = useState(null);
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [editingProject, setEditingProject] = useState(false);
  const [syncingGithub, setSyncingGithub] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const params = new URLSearchParams({ projectId: id });
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (search.trim()) params.set('search', search.trim());

      const [projRes, bugsRes] = await Promise.all([
        apiFetch(`/api/projects/${id}`),
        apiFetch(`/api/bugs?${params.toString()}`),
      ]);
      setProject(projRes.project);
      setBugs(bugsRes.bugs || []);
      setError('');
    } catch (err) {
      setError(err.message || t('appDashboard.loadError'));
    } finally {
      setLoading(false);
    }
  }, [id, statusFilter, priorityFilter, search]);

  useEffect(() => {
    setLoading(true);
    loadDashboard();
  }, [loadDashboard]);

  const handleQuickStatusChange = async (bugId, newStatus) => {
    try {
      await apiFetch(`/api/bugs/${bugId}/status`, {
        method: 'PATCH',
        body: { status: newStatus },
      });
      loadDashboard();
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleManualGithubSync = async () => {
    setSyncingGithub(true);
    try {
      await apiFetch(`/api/projects/${id}/github-sync`, { method: 'POST' });
      await loadDashboard();
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err) {
      alert(err.message);
    } finally {
      setSyncingGithub(false);
    }
  };

  if (loading && !project) {
    return (
      <div className="py-20 text-center text-sm font-medium text-neutral-300">
        {t('appDashboard.loading')}
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="card-surface border-red-400/45 bg-red-500/15 p-8 text-center space-y-3">
        <div className="text-red-200 font-semibold">{error}</div>
        <Link to="/" className="inline-block text-sm font-semibold text-emerald-400 hover:underline">
          {t('appDashboard.backToAll')}
        </Link>
      </div>
    );
  }

  const hasFilters = Boolean(search.trim() || statusFilter || priorityFilter);

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb + Application Header */}
      <div className="card-surface p-5 sm:p-6 lg:p-7">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300 hover:text-emerald-300 mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('appDashboard.allReportsLink')}</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 sm:gap-4 min-w-0">
            <div
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl shrink-0 flex items-center justify-center text-white font-extrabold text-lg shadow-md"
              style={{ backgroundColor: project.color || '#10b981' }}
            >
              {project.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight break-words">
                  {project.name}
                </h1>
                {user?.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setEditingProject(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 px-2.5 py-1 text-xs font-semibold text-neutral-200 transition"
                  >
                    <Pencil className="w-3.5 h-3.5 text-neutral-300" />
                    <span>{t('appDashboard.settingsEdit')}</span>
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                {project.url && (
                  <a
                    href={project.url.startsWith('http') ? project.url : `https://${project.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:underline break-all"
                  >
                    <span>{project.url}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                )}
                {Boolean(project.github_sync_enabled) && project.github_repo && (
                  <div className="inline-flex items-center gap-1.5">
                    <a
                      href={`https://github.com/${project.github_repo}/issues`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1 text-xs font-mono font-semibold text-emerald-200 transition"
                    >
                      <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{project.github_repo}</span>
                    </a>
                    <button
                      type="button"
                      onClick={handleManualGithubSync}
                      disabled={syncingGithub}
                      title={t('appDashboard.syncNowTitle')}
                      className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 px-2.5 py-1 text-xs font-semibold text-neutral-200 disabled:opacity-50 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingGithub ? 'animate-spin' : ''}`} />
                      <span>{t('appDashboard.syncNow')}</span>
                    </button>
                  </div>
                )}
              </div>
              {project.description && (
                <p className="text-sm text-neutral-300 mt-2 max-w-3xl leading-relaxed">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          <Link
            to={`/zglos-blad?projectId=${project.id}`}
            className="btn-primary w-full sm:w-auto shrink-0 py-3"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{t('appDashboard.reportInApp')}</span>
          </Link>
        </div>

        {/* Clickable Project KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-neutral-800/90">
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={`text-left rounded-xl border px-4 py-3 transition ${
              statusFilter === ''
                ? 'bg-gradient-to-br from-neutral-800 to-neutral-900 text-white border-neutral-500 ring-1 ring-white/20 shadow-md'
                : 'bg-gradient-to-br from-neutral-900/90 to-neutral-950 hover:from-neutral-800/80 hover:to-neutral-900 border-neutral-800 text-neutral-200'
            }`}
          >
            <div className="text-xs font-semibold text-neutral-300">{t('appDashboard.kpiAll')}</div>
            <div className="text-2xl font-extrabold text-white mt-0.5">{project.total_bugs || 0}</div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'open' ? '' : 'open')}
            className={`text-left rounded-xl border px-4 py-3 transition ${
              statusFilter === 'open'
                ? 'bg-gradient-to-br from-red-500/30 to-red-950/50 text-white border-red-400 ring-1 ring-red-400/40 shadow-md'
                : 'bg-gradient-to-br from-red-500/12 to-neutral-950 hover:from-red-500/20 border-red-500/35 text-red-200'
            }`}
          >
            <div className="text-xs font-semibold text-red-200">{t('appDashboard.kpiOpen')}</div>
            <div className="text-2xl font-extrabold text-white mt-0.5">{project.open_bugs || 0}</div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'in_progress' ? '' : 'in_progress')}
            className={`text-left rounded-xl border px-4 py-3 transition ${
              statusFilter === 'in_progress'
                ? 'bg-gradient-to-br from-amber-500/30 to-amber-950/50 text-white border-amber-400 ring-1 ring-amber-400/40 shadow-md'
                : 'bg-gradient-to-br from-amber-500/12 to-neutral-950 hover:from-amber-500/20 border-amber-500/35 text-amber-200'
            }`}
          >
            <div className="text-xs font-semibold text-amber-200">{t('appDashboard.kpiInProgress')}</div>
            <div className="text-2xl font-extrabold text-white mt-0.5">{project.in_progress_bugs || 0}</div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'testing' ? '' : 'testing')}
            className={`text-left rounded-xl border px-4 py-3 transition ${
              statusFilter === 'testing'
                ? 'bg-gradient-to-br from-lime-500/30 to-lime-950/50 text-white border-lime-400 ring-1 ring-lime-400/40 shadow-md'
                : 'bg-gradient-to-br from-lime-500/12 to-neutral-950 hover:from-lime-500/20 border-lime-500/35 text-lime-200'
            }`}
          >
            <div className="text-xs font-semibold text-lime-200">{t('appDashboard.kpiTesting')}</div>
            <div className="text-2xl font-extrabold text-white mt-0.5">{project.testing_bugs || 0}</div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'resolved' ? '' : 'resolved')}
            className={`col-span-2 sm:col-span-1 text-left rounded-xl border px-4 py-3 transition ${
              statusFilter === 'resolved'
                ? 'bg-gradient-to-br from-emerald-500/30 to-emerald-950/50 text-white border-emerald-400 ring-1 ring-emerald-400/40 shadow-md'
                : 'bg-gradient-to-br from-emerald-500/12 to-neutral-950 hover:from-emerald-500/20 border-emerald-500/35 text-emerald-200'
            }`}
          >
            <div className="text-xs font-semibold text-emerald-200">{t('appDashboard.kpiResolved')}</div>
            <div className="text-2xl font-extrabold text-white mt-0.5">{project.resolved_bugs || 0}</div>
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="card-surface p-4 grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-3">
        <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-[240px]">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('appDashboard.searchPlaceholder')}
            className="input-field pl-10"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field lg:w-auto"
        >
          <option value="">{t('allBugs.allStatuses')}</option>
          {STATUS_LIST.map((st) => (
            <option key={st.value} value={st.value}>
              {t('allBugs.statusPrefix', { label: t(`statuses.${st.value}`) })}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="input-field lg:w-auto"
        >
          <option value="">{t('allBugs.allPriorities')}</option>
          {PRIORITY_LIST.map((pr) => (
            <option key={pr.value} value={pr.value}>
              {t('allBugs.priorityPrefix', { label: t(`priorities.${pr.value}`) })}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setPriorityFilter('');
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 px-3.5 py-2.5 text-xs font-semibold text-neutral-200 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('common.clearFilters')}</span>
          </button>
        )}
      </div>

      {/* Empty State or Responsive List */}
      {bugs.length === 0 ? (
        <div className="card-surface p-10 sm:p-14 text-center space-y-3">
          <p className="text-base font-bold text-white">
            {hasFilters ? t('appDashboard.emptyFilteredTitle') : t('appDashboard.emptyNoBugsTitle')}
          </p>
          <p className="text-sm text-neutral-300 max-w-md mx-auto">
            {hasFilters
              ? t('appDashboard.emptyFilteredSubtitle')
              : t('appDashboard.emptyNoBugsSubtitle')}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile & Tablet Cards (< lg) */}
          <div className="grid grid-cols-1 gap-3.5 lg:hidden">
            {bugs.map((bug) => {
              const statusKey = STATUSES[bug.status] ? bug.status : 'open';
              const stMeta = STATUSES[statusKey];
              const prioKey = PRIORITIES[bug.priority] ? bug.priority : 'medium';
              const prioMeta = PRIORITIES[prioKey];
              return (
                <div key={bug.id} className="card-surface p-4 sm:p-5 space-y-3.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-neutral-200 bg-neutral-800 border border-neutral-700 px-2.5 py-0.5 rounded-md">
                        #{bug.id}
                      </span>
                      {bug.github_issue_number && (
                        <a
                          href={bug.github_issue_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-mono font-semibold bg-neutral-800 hover:bg-neutral-700 text-emerald-300 border border-emerald-500/35 px-2 py-0.5 rounded-md transition"
                        >
                          <GitBranch className="w-3 h-3" />
                          <span>GH #{bug.github_issue_number}</span>
                        </a>
                      )}
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${prioMeta.badgeClass}`}
                    >
                      {t('allBugs.priorityPrefix', { label: t(`priorities.${prioKey}`) })}
                    </span>
                  </div>

                  <Link
                    to={`/bledy/${bug.id}`}
                    className="block text-base font-bold text-white hover:text-emerald-300 leading-snug"
                  >
                    {bug.title}
                  </Link>

                  <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    {bug.screenshots_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 font-semibold bg-neutral-800 text-neutral-200 px-2.5 py-1 rounded-lg border border-neutral-700">
                        <ImageIcon className="w-3.5 h-3.5 text-amber-300" />
                        <span>{t('common.screenshotsCount', { count: bug.screenshots_count })}</span>
                      </span>
                    )}
                    {bug.video_path && (
                      <span className="inline-flex items-center gap-1.5 font-semibold bg-emerald-500/20 text-emerald-200 px-2.5 py-1 rounded-lg border border-emerald-400/35">
                        <Video className="w-3.5 h-3.5 text-emerald-300" />
                        <span>{t('common.screenVideo')}</span>
                      </span>
                    )}
                    {bug.comments_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-neutral-300 font-medium">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{bug.comments_count}</span>
                      </span>
                    )}
                  </div>

                  <div className="pt-3 border-t border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-neutral-300">
                      {t('allBugs.reportedBy')}{' '}
                      <strong className="text-white">{bug.reporter_name || '—'}</strong> •{' '}
                      {formatDateTime(bug.created_at, locale)}
                    </div>

                    {canChangeStatus ? (
                      <select
                        value={bug.status}
                        onChange={(e) => handleQuickStatusChange(bug.id, e.target.value)}
                        className={`w-full sm:w-auto rounded-xl border px-3 py-2 text-xs font-bold bg-neutral-950 focus:outline-none cursor-pointer ${stMeta.badgeClass}`}
                      >
                        {STATUS_LIST.map((st) => (
                          <option key={st.value} value={st.value} className="bg-neutral-900 text-white">
                            {t('allBugs.statusPrefix', { label: t(`statuses.${st.value}`) })}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border ${stMeta.badgeClass}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${stMeta.dotClass}`} />
                        <span>{t(`statuses.${statusKey}`)}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (>= lg) */}
          <div className="hidden lg:block card-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 bg-gradient-to-r from-neutral-800/80 via-neutral-800/45 to-neutral-900/75 text-xs font-bold uppercase tracking-wider text-neutral-200">
                    <th className="py-4 px-5">{t('appDashboard.colIdTitle')}</th>
                    <th className="py-4 px-4">{t('allBugs.colPriority')}</th>
                    <th className="py-4 px-4">{t('allBugs.colAttachments')}</th>
                    <th className="py-4 px-4">{t('allBugs.colReporter')}</th>
                    <th className="py-4 px-4">{t('appDashboard.colDate')}</th>
                    <th className="py-4 px-5">{t('allBugs.colStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/80 text-sm">
                  {bugs.map((bug) => {
                    const statusKey = STATUSES[bug.status] ? bug.status : 'open';
                    const stMeta = STATUSES[statusKey];
                    const prioKey = PRIORITIES[bug.priority] ? bug.priority : 'medium';
                    const prioMeta = PRIORITIES[prioKey];
                    return (
                      <tr key={bug.id} className="hover:bg-white/[0.035] transition">
                        <td className="py-4 px-5 max-w-md">
                          <div className="flex items-start gap-2.5">
                            <span className="text-xs font-mono font-semibold text-neutral-200 bg-neutral-800 border border-neutral-700 px-2 py-0.5 rounded-md shrink-0 mt-0.5">
                              #{bug.id}
                            </span>
                            <div className="space-y-1">
                              <Link
                                to={`/bledy/${bug.id}`}
                                className="font-bold text-white hover:text-emerald-300 transition leading-snug block"
                              >
                                {bug.title}
                              </Link>
                              {bug.github_issue_number && (
                                <a
                                  href={bug.github_issue_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-300 hover:text-emerald-200"
                                >
                                  <GitBranch className="w-3 h-3" />
                                  <span>GitHub Issue #{bug.github_issue_number}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-lg border ${prioMeta.badgeClass}`}
                          >
                            {t(`priorities.${prioKey}`)}
                          </span>
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-xs">
                            {bug.screenshots_count > 0 && (
                              <span className="inline-flex items-center gap-1 font-semibold bg-neutral-800 text-neutral-200 px-2.5 py-1 rounded-lg border border-neutral-700">
                                <ImageIcon className="w-3.5 h-3.5 text-amber-300" />
                                <span>{bug.screenshots_count}</span>
                              </span>
                            )}
                            {bug.video_path && (
                              <span className="inline-flex items-center gap-1 font-semibold bg-emerald-500/20 text-emerald-200 px-2.5 py-1 rounded-lg border border-emerald-400/35">
                                <Video className="w-3.5 h-3.5 text-emerald-300" />
                                <span>{t('common.video')}</span>
                              </span>
                            )}
                            {bug.comments_count > 0 && (
                              <span className="inline-flex items-center gap-1 text-neutral-300 font-medium ml-1">
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>{bug.comments_count}</span>
                              </span>
                            )}
                            {bug.screenshots_count === 0 && !bug.video_path && bug.comments_count === 0 && (
                              <span className="text-neutral-500">—</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-sm font-medium text-neutral-200 whitespace-nowrap">
                          {bug.reporter_name || '—'}
                        </td>
                        <td className="py-4 px-4 text-sm text-neutral-300 whitespace-nowrap">
                          {formatDateTime(bug.created_at, locale)}
                        </td>
                        <td className="py-4 px-5 whitespace-nowrap">
                          {canChangeStatus ? (
                            <select
                              value={bug.status}
                              onChange={(e) => handleQuickStatusChange(bug.id, e.target.value)}
                              className={`rounded-xl border px-3 py-1.5 text-xs font-bold bg-neutral-950 focus:outline-none cursor-pointer ${stMeta.badgeClass}`}
                            >
                              {STATUS_LIST.map((st) => (
                                <option key={st.value} value={st.value} className="bg-neutral-900 text-white">
                                  {t(`statuses.${st.value}`)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border ${stMeta.badgeClass}`}
                            >
                              <span className={`w-2 h-2 rounded-full ${stMeta.dotClass}`} />
                              <span>{t(`statuses.${statusKey}`)}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {editingProject && (
        <ProjectModal
          project={project}
          onClose={() => setEditingProject(false)}
          onSaved={() => {
            setEditingProject(false);
            loadDashboard();
            window.dispatchEvent(new Event('projects-updated'));
          }}
        />
      )}
    </div>
  );
}

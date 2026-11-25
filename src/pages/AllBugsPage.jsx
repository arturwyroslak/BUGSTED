import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, PlusCircle, Image as ImageIcon, Video, RotateCcw, GitBranch } from 'lucide-react';
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

export default function AllBugsPage() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const canChangeStatus = user?.role === 'admin' || user?.role === 'dev';

  const [projects, setProjects] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [projectId, setProjectId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');

  const loadBugs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (search.trim()) params.set('search', search.trim());

      const [bugsRes, projRes] = await Promise.all([
        apiFetch(`/api/bugs?${params.toString()}`),
        apiFetch('/api/projects'),
      ]);
      setBugs(bugsRes.bugs || []);
      setProjects(projRes.projects || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, priorityFilter, search]);

  useEffect(() => {
    loadBugs();
  }, [loadBugs]);

  const handleStatusChange = async (bugId, status) => {
    try {
      await apiFetch(`/api/bugs/${bugId}/status`, {
        method: 'PATCH',
        body: { status },
      });
      loadBugs();
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err) {
      alert(err.message);
    }
  };

  const hasFilters = Boolean(projectId || statusFilter || priorityFilter || search.trim());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {t('allBugs.title')}
          </h1>
          <p className="text-sm sm:text-base text-neutral-300 mt-1">
            {t('allBugs.subtitle')}
          </p>
        </div>

        <Link to="/zglos-blad" className="btn-primary w-full sm:w-auto shrink-0 py-3">
          <PlusCircle className="w-4 h-4" />
          <span>{t('nav.reportNewBug')}</span>
        </Link>
      </div>

      {/* Filters Toolbar */}
      <div className="card-surface p-4 grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-3">
        <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-[240px]">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('allBugs.searchPlaceholder')}
            className="input-field pl-10"
          />
        </div>

        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="input-field lg:w-auto"
        >
          <option value="">{t('allBugs.allApplications')}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {t('allBugs.appPrefix', { name: p.name })}
            </option>
          ))}
        </select>

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
              setProjectId('');
              setStatusFilter('');
              setPriorityFilter('');
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 px-3.5 py-2.5 text-xs font-semibold text-neutral-200 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('common.clear')}</span>
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="card-surface py-16 text-center text-sm font-medium text-neutral-300">
          {t('allBugs.loading')}
        </div>
      ) : bugs.length === 0 ? (
        <div className="card-surface py-16 px-6 text-center space-y-2">
          <div className="text-base font-bold text-white">{t('allBugs.emptyTitle')}</div>
          <p className="text-sm text-neutral-300">{t('allBugs.emptySubtitle')}</p>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-semibold text-neutral-200 bg-neutral-800 border border-neutral-700 px-2 py-0.5 rounded-md">
                        #{bug.id}
                      </span>
                      <Link
                        to={`/aplikacje/${bug.project_id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-100 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-2.5 py-0.5 rounded-md transition"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: bug.project_color || '#10b981' }}
                        />
                        <span>{bug.project_name}</span>
                      </Link>
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
                      {t(`priorities.${prioKey}`)}
                    </span>
                  </div>

                  <Link
                    to={`/bledy/${bug.id}`}
                    className="block text-base font-bold text-white hover:text-emerald-300 leading-snug"
                  >
                    {bug.title}
                  </Link>

                  {(bug.screenshots_count > 0 || bug.video_path) && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
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
                    </div>
                  )}

                  <div className="pt-3 border-t border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-neutral-300">
                      {t('allBugs.reportedBy')}{' '}
                      <strong className="text-white">{bug.reporter_name || '—'}</strong> •{' '}
                      {formatDateTime(bug.created_at, locale)}
                    </div>

                    {canChangeStatus ? (
                      <select
                        value={bug.status}
                        onChange={(e) => handleStatusChange(bug.id, e.target.value)}
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
                    <th className="py-4 px-5">{t('allBugs.colReport')}</th>
                    <th className="py-4 px-4">{t('allBugs.colApplication')}</th>
                    <th className="py-4 px-4">{t('allBugs.colPriority')}</th>
                    <th className="py-4 px-4">{t('allBugs.colAttachments')}</th>
                    <th className="py-4 px-4">{t('allBugs.colReporter')}</th>
                    <th className="py-4 px-4">{t('allBugs.colDate')}</th>
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
                          <Link
                            to={`/aplikacje/${bug.project_id}`}
                            className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-100 hover:text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-2.5 py-1 rounded-lg transition"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: bug.project_color || '#10b981' }}
                            />
                            <span>{bug.project_name}</span>
                          </Link>
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
                            {bug.screenshots_count === 0 && !bug.video_path && (
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
                              onChange={(e) => handleStatusChange(bug.id, e.target.value)}
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
    </div>
  );
}

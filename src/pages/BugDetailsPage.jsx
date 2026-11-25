import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Video,
  Image as ImageIcon,
  MessageSquare,
  Send,
  Trash2,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Clock,
  CheckCircle2,
  GitBranch,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  STATUSES,
  STATUS_LIST,
  PRIORITIES,
  ROLES,
  formatDateTime,
  formatFileSize,
} from '../lib/constants';
import AiSuggestionBlock from '../components/AiSuggestionBlock';

export default function BugDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const canManageStatus = user?.role === 'admin' || user?.role === 'dev';

  const [bug, setBug] = useState(null);
  const [screenshots, setScreenshots] = useState([]);
  const [comments, setComments] = useState([]);
  const [devs, setDevs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [commentText, setCommentText] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [syncingGithub, setSyncingGithub] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const loadBug = useCallback(async () => {
    try {
      const [bugData, devsData] = await Promise.all([
        apiFetch(`/api/bugs/${id}`),
        apiFetch('/api/users/devs'),
      ]);
      setBug(bugData.bug);
      setScreenshots(bugData.screenshots || []);
      setComments(bugData.comments || []);
      setDevs(devsData.devs || []);
      setError('');
    } catch (err) {
      setError(err.message || t('bugDetails.notFound'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadBug();
  }, [loadBug]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowLeft' && screenshots.length > 1) {
        setLightboxIndex((prev) => (prev - 1 + screenshots.length) % screenshots.length);
      }
      if (e.key === 'ArrowRight' && screenshots.length > 1) {
        setLightboxIndex((prev) => (prev + 1) % screenshots.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, screenshots.length]);

  const handleStatusUpdate = async (newStatus) => {
    if (!bug || bug.status === newStatus) return;
    setUpdatingStatus(true);
    try {
      await apiFetch(`/api/bugs/${bug.id}/status`, {
        method: 'PATCH',
        body: { status: newStatus, comment: statusNote.trim() },
      });
      setStatusNote('');
      await loadBug();
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAssignChange = async (assignedTo) => {
    try {
      await apiFetch(`/api/bugs/${bug.id}/assign`, {
        method: 'PATCH',
        body: { assigned_to: assignedTo || null },
      });
      await loadBug();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleGithubSync = async () => {
    setSyncingGithub(true);
    try {
      await apiFetch(`/api/bugs/${bug.id}/github-sync`, { method: 'POST' });
      await loadBug();
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err) {
      alert(err.message);
    } finally {
      setSyncingGithub(false);
    }
  };

  const handleGithubExport = async () => {
    setSyncingGithub(true);
    try {
      await apiFetch(`/api/bugs/${bug.id}/github-export`, { method: 'POST' });
      await loadBug();
    } catch (err) {
      alert(err.message);
    } finally {
      setSyncingGithub(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      await apiFetch(`/api/bugs/${bug.id}/comments`, {
        method: 'POST',
        body: { content: commentText.trim() },
      });
      setCommentText('');
      await loadBug();
    } catch (err) {
      alert(err.message);
    } finally {
      setSendingComment(false);
    }
  };

  const handleDeleteBug = async () => {
    if (!window.confirm(t('bugDetails.deleteConfirm'))) return;
    try {
      await apiFetch(`/api/bugs/${bug.id}`, { method: 'DELETE' });
      window.dispatchEvent(new Event('projects-updated'));
      navigate(`/aplikacje/${bug.project_id}`);
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm font-medium text-neutral-300">
        {t('bugDetails.loading')}
      </div>
    );
  }

  if (error || !bug) {
    return (
      <div className="card-surface border-red-400/45 bg-red-500/15 p-8 text-center space-y-3">
        <div className="text-red-200 font-semibold">{error || t('bugDetails.doesNotExist')}</div>
        <Link to="/" className="inline-block text-sm font-semibold text-emerald-400 hover:underline">
          {t('bugDetails.backToDashboard')}
        </Link>
      </div>
    );
  }

  const statusKey = STATUSES[bug.status] ? bug.status : 'open';
  const stMeta = STATUSES[statusKey];
  const prioKey = PRIORITIES[bug.priority] ? bug.priority : 'medium';
  const prioMeta = PRIORITIES[prioKey];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          to={`/aplikacje/${bug.project_id}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-300 hover:text-emerald-300 transition"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span className="truncate">{t('bugDetails.backToAppList', { name: bug.project_name })}</span>
        </Link>

        {user?.role === 'admin' && (
          <button
            type="button"
            onClick={handleDeleteBug}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-xl border border-red-400/45 bg-red-500/15 hover:bg-red-500/25 px-3.5 py-2 text-xs font-semibold text-red-200 transition"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t('bugDetails.deleteReport')}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left / Main Column */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {/* Bug Title & Description */}
          <div className="card-surface p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-200">
                {t('bugDetails.reportNumber', { id: bug.id })}
              </span>
              <Link
                to={`/aplikacje/${bug.project_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white transition"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: bug.project_color || '#10b981' }}
                />
                <span>{bug.project_name}</span>
              </Link>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${stMeta.badgeClass}`}>
                {t(`statuses.${statusKey}`)}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${prioMeta.badgeClass}`}>
                {t('allBugs.priorityPrefix', { label: t(`priorities.${prioKey}`) })}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-snug break-words">
              {bug.title}
            </h1>

            {bug.description ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5 text-sm sm:text-base text-neutral-100 whitespace-pre-wrap leading-relaxed break-words">
                {bug.description}
              </div>
            ) : (
              <p className="text-sm text-neutral-400 italic">{t('bugDetails.noDescription')}</p>
            )}
          </div>

          {/* AI Agentic Codebase & Bug Suggestion Block */}
          <AiSuggestionBlock bug={bug} onBugUpdated={(updatedBug) => setBug(updatedBug)} />

          {/* Screen Video Recording Section */}
          {bug.video_path && (
            <div className="card-surface p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Video className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>{t('bugDetails.screenVideo')}</span>
                </h2>
                <a
                  href={bug.video_path}
                  download={bug.video_original_name || `bug-${bug.id}-video.webm`}
                  className="btn-secondary text-xs py-2 self-start sm:self-auto"
                >
                  <Download className="w-4 h-4" />
                  <span>{t('bugDetails.downloadVideo', { size: formatFileSize(bug.video_size) })}</span>
                </a>
              </div>

              <div className="rounded-xl overflow-hidden border border-neutral-700 bg-black">
                <video
                  src={bug.video_path}
                  controls
                  preload="metadata"
                  className="w-full max-h-[500px] object-contain bg-black"
                />
              </div>
            </div>
          )}

          {/* Screenshots Gallery */}
          {screenshots.length > 0 && (
            <div className="card-surface p-5 sm:p-6 space-y-4">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-amber-400 shrink-0" />
                <span>{t('bugDetails.attachedScreenshots', { count: screenshots.length })}</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {screenshots.map((shot, idx) => (
                  <button
                    key={shot.id}
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    className="group relative rounded-xl overflow-hidden border border-neutral-700 hover:border-emerald-500 bg-neutral-950 aspect-video text-left transition"
                  >
                    <img
                      src={shot.file_path}
                      alt={shot.original_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 py-2 text-xs text-neutral-100 flex justify-between font-medium">
                      <span>{t('bugDetails.screenshotLabel', { n: idx + 1 })}</span>
                      <span>{formatFileSize(shot.file_size)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Comments & Activity History */}
          <div className="card-surface p-5 sm:p-6 space-y-5">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{t('bugDetails.commentsTitle', { count: comments.length })}</span>
            </h2>

            {comments.length === 0 ? (
              <p className="text-sm text-neutral-400">{t('bugDetails.noComments')}</p>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => {
                  const cRoleKey = c.user_role && ROLES[c.user_role] ? c.user_role : 'user';
                  const roleBadge = ROLES[cRoleKey];
                  if (c.type === 'status_change') {
                    return (
                      <div
                        key={c.id}
                        className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-950/80 px-4 py-3 text-sm text-neutral-200"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-white">{c.user_name || t('common.user')}</span>{' '}
                          <span>— {c.content}</span>
                          <div className="text-xs text-neutral-400 mt-0.5">
                            {formatDateTime(c.created_at, locale)}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">
                            {c.user_name || t('common.user')}
                          </span>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded border ${roleBadge.badgeClass}`}
                          >
                            {t(`roles.${cRoleKey}.shortLabel`)}
                          </span>
                        </div>
                        <span className="text-xs text-neutral-400">
                          {formatDateTime(c.created_at, locale)}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-100 whitespace-pre-wrap leading-relaxed break-words">
                        {c.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Comment Form */}
            <form onSubmit={handleAddComment} className="pt-2 space-y-3">
              <textarea
                rows={3}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={t('bugDetails.commentPlaceholder')}
                className="input-field"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={sendingComment || !commentText.trim()}
                  className="btn-primary w-full sm:w-auto"
                >
                  <Send className="w-4 h-4" />
                  <span>{sendingComment ? t('bugDetails.addingComment') : t('bugDetails.addComment')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Sidebar: Status Control & Metadata */}
        <div className="space-y-5">
          {/* Status Control Card */}
          <div className="card-surface p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              {t('bugDetails.statusTitle')}
            </h3>

            {canManageStatus ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1.5">
                    {t('bugDetails.statusNoteLabel')}
                  </label>
                  <input
                    type="text"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder={t('bugDetails.statusNotePlaceholder')}
                    className="input-field py-2 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  {STATUS_LIST.map((st) => {
                    const active = bug.status === st.value;
                    return (
                      <button
                        key={st.value}
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => handleStatusUpdate(st.value)}
                        className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition ${
                          active
                            ? st.badgeClass + ' ring-1 ring-white/30'
                            : 'border-neutral-800 bg-neutral-950/80 text-neutral-300 hover:text-white hover:bg-neutral-800'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${st.dotClass}`} />
                          <span>{t(`statuses.${st.value}`)}</span>
                        </span>
                        {active && <span className="text-xs font-bold">{t('bugDetails.activeBadge')}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold ${stMeta.badgeClass}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${stMeta.dotClass}`} />
                  <span>{t(`statuses.${statusKey}`)}</span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  {t('bugDetails.statusRestricted')}
                </p>
              </div>
            )}
          </div>

          {/* GitHub Issue Integration Card */}
          {(bug.github_issue_number ||
            (Boolean(bug.project_github_sync_enabled) && bug.project_github_repo)) && (
            <div className="card-surface p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-emerald-400" />
                <span>{t('bugDetails.githubIssues')}</span>
              </h3>

              {bug.github_issue_number ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-300 truncate">
                        {bug.project_github_repo}
                      </div>
                      <div className="text-sm font-bold text-emerald-200 font-mono">
                        Issue #{bug.github_issue_number}
                      </div>
                    </div>
                    <a
                      href={bug.github_issue_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary text-xs py-1.5 px-3 shrink-0"
                    >
                      <span>{t('common.open')}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <button
                    type="button"
                    disabled={syncingGithub}
                    onClick={handleGithubSync}
                    className="btn-secondary w-full text-xs py-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingGithub ? 'animate-spin' : ''}`} />
                    <span>{syncingGithub ? t('bugDetails.syncing') : t('bugDetails.syncWithGithub')}</span>
                  </button>
                </div>
              ) : canManageStatus ? (
                <div className="space-y-2.5">
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    {t('bugDetails.preSyncNotice', { repo: bug.project_github_repo })}
                  </p>
                  <button
                    type="button"
                    disabled={syncingGithub}
                    onClick={handleGithubExport}
                    className="btn-primary w-full text-xs py-2"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>{syncingGithub ? t('bugDetails.creatingIssue') : t('bugDetails.exportToGithub')}</span>
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Developer Assignment */}
          <div className="card-surface p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>{t('bugDetails.assignedDev')}</span>
            </h3>
            {canManageStatus ? (
              <select
                value={bug.assigned_to || ''}
                onChange={(e) => handleAssignChange(e.target.value)}
                className="input-field"
              >
                <option value="">{t('bugDetails.unassigned')}</option>
                {devs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.email})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm text-white font-semibold break-words">
                {bug.assignee_name ? `${bug.assignee_name} (${bug.assignee_email})` : t('bugDetails.unassignedText')}
              </div>
            )}
          </div>

          {/* Metadata Card */}
          <div className="card-surface p-5 space-y-3 text-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>{t('bugDetails.infoTitle')}</span>
            </h3>
            <div className="space-y-3 pt-1">
              <div>
                <div className="text-xs text-neutral-400">{t('bugDetails.reporter')}</div>
                <div className="text-white font-semibold mt-0.5 break-words">
                  {bug.reporter_name || t('common.user')}
                </div>
                <div className="text-xs text-neutral-300 break-all">{bug.reporter_email || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">{t('bugDetails.reportedAt')}</div>
                <div className="text-white font-semibold mt-0.5">
                  {formatDateTime(bug.created_at, locale)}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">{t('bugDetails.updatedAt')}</div>
                <div className="text-white font-semibold mt-0.5">
                  {formatDateTime(bug.updated_at, locale)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Responsive Screenshot Lightbox Modal */}
      {lightboxIndex !== null && screenshots[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label={t('bugDetails.closePreview')}
            className="absolute top-3 right-3 sm:top-5 sm:right-5 z-20 p-2.5 rounded-full bg-neutral-800 border border-neutral-600 text-white hover:bg-neutral-700"
          >
            <X className="w-5 h-5" />
          </button>

          {screenshots.length > 1 && (
            <>
              <button
                type="button"
                aria-label={t('bugDetails.prevScreenshot')}
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev - 1 + screenshots.length) % screenshots.length);
                }}
                className="absolute left-2 sm:left-5 z-20 p-2.5 sm:p-3 rounded-full bg-neutral-800/90 border border-neutral-600 text-white hover:bg-neutral-700"
              >
                <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
              <button
                type="button"
                aria-label={t('bugDetails.nextScreenshot')}
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev + 1) % screenshots.length);
                }}
                className="absolute right-2 sm:right-5 z-20 p-2.5 sm:p-3 rounded-full bg-neutral-800/90 border border-neutral-600 text-white hover:bg-neutral-700"
              >
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </>
          )}

          <div
            className="max-w-6xl w-full max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={screenshots[lightboxIndex].file_path}
              alt={screenshots[lightboxIndex].original_name}
              className="max-h-[80vh] max-w-full object-contain rounded-xl border border-neutral-700"
            />
            <div className="text-xs sm:text-sm font-medium text-neutral-200 text-center px-4">
              {t('bugDetails.lightboxCounter', {
                current: lightboxIndex + 1,
                total: screenshots.length,
                name: screenshots[lightboxIndex].original_name,
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

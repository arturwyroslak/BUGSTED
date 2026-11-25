import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  MailPlus,
  Users,
  FolderKanban,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  FolderPlus,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Send,
  Server,
  HardDrive,
  GitBranch,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ROLES, formatDateTime } from '../lib/constants';
import ProjectModal from '../components/ProjectModal';

export default function AdminPanelPage() {
  const { user, refreshUser } = useAuth();
  const { t, locale } = useLanguage();
  const [activeTab, setActiveTab] = useState('invitations');

  const [invitations, setInvitations] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [smtpStatus, setSmtpStatus] = useState(null);
  const [storageStatus, setStorageStatus] = useState(null);
  const [githubStatus, setGithubStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const [updatingRoleId, setUpdatingRoleId] = useState(null);
  const [roleFeedback, setRoleFeedback] = useState(null);

  const [modalProject, setModalProject] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [invRes, usrRes, projRes] = await Promise.all([
        apiFetch('/api/admin/invitations'),
        apiFetch('/api/admin/users'),
        apiFetch('/api/projects'),
      ]);
      setInvitations(invRes.invitations || []);
      setUsers(usrRes.users || []);
      setProjects(projRes.projects || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkSmtp = useCallback(async () => {
    setSmtpStatus({ checking: true });
    try {
      const data = await apiFetch('/api/admin/smtp-status');
      setSmtpStatus(data);
    } catch (err) {
      setSmtpStatus({ connected: false, error: err.message });
    }
  }, []);

  const checkStorage = useCallback(async () => {
    setStorageStatus({ checking: true });
    try {
      const data = await apiFetch('/api/admin/minio-status');
      setStorageStatus(data);
    } catch (err) {
      setStorageStatus({ connected: false, error: err.message });
    }
  }, []);

  const checkGithub = useCallback(async () => {
    setGithubStatus({ checking: true });
    try {
      const data = await apiFetch('/api/admin/github-status');
      setGithubStatus(data);
    } catch (err) {
      setGithubStatus({ connected: false, error: err.message });
    }
  }, []);

  useEffect(() => {
    loadAll();
    checkSmtp();
    checkStorage();
    checkGithub();
  }, [loadAll, checkSmtp, checkStorage, checkGithub]);

  const handleSendInvitation = async (e) => {
    e.preventDefault();
    setInviteFeedback(null);
    setSendingInvite(true);
    try {
      const data = await apiFetch('/api/admin/invitations', {
        method: 'POST',
        body: { email: inviteEmail.trim(), role: inviteRole },
      });
      setInviteEmail('');
      await loadAll();

      if (data.emailSent) {
        setInviteFeedback({
          type: 'success',
          message: t('admin.inviteSuccess', { email: data.invitation.email }),
          inviteUrl: data.invitation.invite_url,
        });
      } else {
        setInviteFeedback({
          type: 'warning',
          message: t('admin.inviteWarning', { error: data.emailError || 'connection error' }),
          inviteUrl: data.invitation.invite_url,
        });
      }
    } catch (err) {
      setInviteFeedback({
        type: 'error',
        message: err.message || t('admin.inviteError'),
      });
    } finally {
      setSendingInvite(false);
    }
  };

  const handleResendInvite = async (inv) => {
    try {
      const res = await apiFetch(`/api/admin/invitations/${inv.id}/resend`, { method: 'POST' });
      await loadAll();
      if (res.emailSent) {
        alert(t('admin.resendSuccess', { email: inv.email }));
      } else {
        alert(t('admin.resendWarning', { error: res.emailError }));
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteInvite = async (id) => {
    if (!window.confirm(t('admin.confirmDeleteInvite'))) return;
    try {
      await apiFetch(`/api/admin/invitations/${id}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const copyLink = async (url, id) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleRoleChange = async (targetUser, newRole) => {
    if (targetUser.role === newRole) return;
    setRoleFeedback(null);
    setUpdatingRoleId(targetUser.id);
    try {
      await apiFetch(`/api/admin/users/${targetUser.id}/role`, {
        method: 'PATCH',
        body: { role: newRole },
      });
      await loadAll();
      if (targetUser.id === user?.id) {
        await refreshUser();
      }
      const roleLabel = ROLES[newRole] ? t(`roles.${newRole}.label`) : newRole;
      setRoleFeedback({
        type: 'success',
        message: t('admin.roleChangedSuccess', {
          name: targetUser.name,
          email: targetUser.email,
          role: roleLabel,
        }),
      });
    } catch (err) {
      setRoleFeedback({
        type: 'error',
        message: err.message || t('admin.roleChangedError'),
      });
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(t('admin.confirmDeleteUser', { name: u.name, email: u.email }))) return;
    try {
      await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteProject = async (p) => {
    if (!window.confirm(t('admin.confirmDeleteProject', { name: p.name }))) return;
    try {
      await apiFetch(`/api/projects/${p.id}`, { method: 'DELETE' });
      loadAll();
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Service Health */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Shield className="w-7 h-7 text-amber-400 shrink-0" />
            <span>{t('admin.title')}</span>
          </h1>
          <p className="text-sm sm:text-base text-neutral-300 mt-1">{t('admin.subtitle')}</p>
        </div>

        {/* GitHub, S3/MinIO & SMTP Status Badges */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
          <div className="flex items-center justify-between gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <GitBranch className="w-4 h-4 text-emerald-400 shrink-0" />
              {githubStatus?.checking ? (
                <span className="text-neutral-300">{t('admin.githubChecking')}</span>
              ) : githubStatus?.connected ? (
                <span className="text-emerald-300 font-semibold truncate">
                  {t('admin.githubConnected', { login: githubStatus.login })}
                </span>
              ) : (
                <span className="text-red-300 font-semibold" title={githubStatus?.error || ''}>
                  {t('admin.githubError')}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={checkGithub}
              title={t('admin.githubRefreshTitle')}
              className="p-1 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
              {storageStatus?.checking ? (
                <span className="text-neutral-300">{t('admin.storageChecking')}</span>
              ) : storageStatus?.connected ? (
                <span className="text-emerald-300 font-semibold truncate">
                  {t('admin.storageConnected', {
                    endPoint: storageStatus.endPoint,
                    bucket: storageStatus.bucket,
                  })}
                </span>
              ) : (
                <span className="text-red-300 font-semibold" title={storageStatus?.error || ''}>
                  {t('admin.storageError')}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={checkStorage}
              title={t('admin.storageRefreshTitle')}
              className="p-1 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Server className="w-4 h-4 text-amber-400 shrink-0" />
              {smtpStatus?.checking ? (
                <span className="text-neutral-300">{t('admin.smtpChecking')}</span>
              ) : smtpStatus?.connected ? (
                <span className="text-emerald-300 font-semibold truncate">
                  {t('admin.smtpConnected', { user: smtpStatus.user })}
                </span>
              ) : (
                <span className="text-amber-300 font-semibold" title={smtpStatus?.error || ''}>
                  {t('admin.smtpError')}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={checkSmtp}
              title={t('admin.smtpRefreshTitle')}
              className="p-1 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Responsive Tabs */}
      <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 border-b border-neutral-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('invitations')}
          className={`inline-flex items-center justify-center sm:justify-start gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            activeTab === 'invitations'
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-[0_6px_18px_-4px_rgba(16,185,129,0.45),inset_0_1px_0_0_rgba(255,255,255,0.2)]'
              : 'bg-gradient-to-b from-neutral-800/80 to-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
          }`}
        >
          <MailPlus className="w-4 h-4" />
          <span>{t('admin.tabInvitations', { count: invitations.filter((i) => !i.accepted_at).length })}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('projects')}
          className={`inline-flex items-center justify-center sm:justify-start gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            activeTab === 'projects'
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-[0_6px_18px_-4px_rgba(16,185,129,0.45),inset_0_1px_0_0_rgba(255,255,255,0.2)]'
              : 'bg-gradient-to-b from-neutral-800/80 to-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          <span>{t('admin.tabProjects', { count: projects.length })}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`inline-flex items-center justify-center sm:justify-start gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            activeTab === 'users'
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-[0_6px_18px_-4px_rgba(16,185,129,0.45),inset_0_1px_0_0_rgba(255,255,255,0.2)]'
              : 'bg-gradient-to-b from-neutral-800/80 to-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{t('admin.tabUsers', { count: users.length })}</span>
        </button>
      </div>

      {/* TAB 1: INVITATIONS */}
      {activeTab === 'invitations' && (
        <div className="space-y-6">
          {/* Send Invitation Card */}
          <div className="card-surface p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">{t('admin.sendInviteTitle')}</h2>
              <p className="text-sm text-neutral-300 mt-1">{t('admin.sendInviteDesc')}</p>
            </div>

            {inviteFeedback && (
              <div
                className={`rounded-xl border p-4 text-sm space-y-3 ${
                  inviteFeedback.type === 'success'
                    ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100'
                    : inviteFeedback.type === 'warning'
                    ? 'border-amber-400/45 bg-amber-500/15 text-amber-100'
                    : 'border-red-400/45 bg-red-500/15 text-red-100'
                }`}
              >
                <div className="flex items-start gap-2.5 font-semibold">
                  {inviteFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-300 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 shrink-0 text-red-300 mt-0.5" />
                  )}
                  <span>{inviteFeedback.message}</span>
                </div>
                {inviteFeedback.inviteUrl && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-neutral-950 rounded-xl px-3.5 py-2.5 border border-neutral-700">
                    <span className="font-mono text-xs sm:text-sm text-emerald-300 break-all flex-1">
                      {inviteFeedback.inviteUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyLink(inviteFeedback.inviteUrl, 'latest')}
                      className="btn-secondary text-xs py-1.5 px-3 shrink-0"
                    >
                      {copiedId === 'latest' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedId === 'latest' ? t('admin.copied') : t('admin.copyLink')}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSendInvitation} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-5">
                <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
                  {t('admin.inviteEmailLabel')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t('admin.inviteEmailPlaceholder')}
                  className="input-field"
                />
              </div>

              <div className="md:col-span-4">
                <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
                  {t('admin.inviteRoleLabel')} <span className="text-red-400">*</span>
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="input-field"
                >
                  <option value="user">{t('admin.roleOptionUser')}</option>
                  <option value="dev">{t('admin.roleOptionDev')}</option>
                  <option value="admin">{t('admin.roleOptionAdmin')}</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={sendingInvite}
                  className="btn-primary w-full py-2.5"
                >
                  <Send className="w-4 h-4" />
                  <span>{sendingInvite ? t('admin.sending') : t('admin.sendInviteBtn')}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Invitations List: Mobile Cards + Desktop Table */}
          <div className="card-surface overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-neutral-800">
              <h3 className="text-base font-bold text-white">{t('admin.invitesListTitle')}</h3>
            </div>
            {loading ? (
              <div className="p-8 text-center text-sm text-neutral-300">{t('common.loading')}</div>
            ) : invitations.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-300">{t('admin.noInvites')}</div>
            ) : (
              <>
                {/* Mobile Cards (< lg) */}
                <div className="divide-y divide-neutral-800 lg:hidden">
                  {invitations.map((inv) => {
                    const rKey = inv.role && ROLES[inv.role] ? inv.role : 'user';
                    const roleMeta = ROLES[rKey];
                    return (
                      <div key={inv.id} className="p-4 sm:p-5 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-bold text-white break-all">{inv.email}</div>
                          <span className={`text-xs px-2.5 py-0.5 rounded-md border font-semibold shrink-0 ${roleMeta.badgeClass}`}>
                            {t(`roles.${rKey}.shortLabel`)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-neutral-300">
                          <div>
                            {t('allBugs.colStatus')}:{' '}
                            {inv.accepted_at ? (
                              <span className="text-emerald-300 font-semibold">
                                {t('admin.registeredStatus', { date: formatDateTime(inv.accepted_at, locale) })}
                              </span>
                            ) : inv.is_expired ? (
                              <span className="text-red-300 font-semibold">{t('admin.expiredStatus')}</span>
                            ) : (
                              <span className="text-amber-200 font-semibold">{t('admin.pendingStatus')}</span>
                            )}
                          </div>
                          <div>
                            E-mail:{' '}
                            {inv.email_sent ? (
                              <span className="text-emerald-300 font-semibold">{t('admin.emailSentSmtp')}</span>
                            ) : (
                              <span className="text-red-300 font-semibold">{t('admin.emailSendError')}</span>
                            )}
                          </div>
                          <div className="sm:col-span-2 text-neutral-400">
                            {t('admin.expiresAt')} {formatDateTime(inv.expires_at, locale)}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {!inv.accepted_at && (
                            <>
                              <button
                                type="button"
                                onClick={() => copyLink(inv.invite_url, inv.id)}
                                className="btn-secondary text-xs py-1.5 px-3"
                              >
                                {copiedId === inv.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                                <span>{copiedId === inv.id ? t('admin.copied') : t('admin.copyLink')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResendInvite(inv)}
                                className="btn-secondary text-xs py-1.5 px-3"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>{t('admin.resend')}</span>
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteInvite(inv.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-red-400/45 bg-red-500/15 hover:bg-red-500/25 px-3 py-1.5 text-xs font-semibold text-red-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{t('common.delete')}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table (>= lg) */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-800 bg-gradient-to-r from-neutral-800/80 via-neutral-800/45 to-neutral-900/75 text-xs font-bold uppercase tracking-wider text-neutral-200">
                        <th className="py-3.5 px-5">{t('admin.colEmail')}</th>
                        <th className="py-3.5 px-4">{t('admin.colRole')}</th>
                        <th className="py-3.5 px-4">{t('admin.colRegStatus')}</th>
                        <th className="py-3.5 px-4">{t('admin.colEmailDelivery')}</th>
                        <th className="py-3.5 px-4">{t('admin.colExpires')}</th>
                        <th className="py-3.5 px-5 text-right">{t('admin.colActions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800 text-sm">
                      {invitations.map((inv) => {
                        const rKey = inv.role && ROLES[inv.role] ? inv.role : 'user';
                        const roleMeta = ROLES[rKey];
                        return (
                          <tr key={inv.id} className="hover:bg-white/[0.035]">
                            <td className="py-4 px-5 font-bold text-white">{inv.email}</td>
                            <td className="py-4 px-4">
                              <span className={`text-xs px-2.5 py-1 rounded-md border font-semibold ${roleMeta.badgeClass}`}>
                                {t(`roles.${rKey}.shortLabel`)}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-xs">
                              {inv.accepted_at ? (
                                <span className="text-emerald-300 font-semibold">
                                  {t('admin.registeredStatus', { date: formatDateTime(inv.accepted_at, locale) })}
                                </span>
                              ) : inv.is_expired ? (
                                <span className="text-red-300 font-semibold">{t('admin.expiredStatus')}</span>
                              ) : (
                                <span className="text-amber-200 font-semibold">{t('admin.pendingStatus')}</span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-xs">
                              {inv.email_sent ? (
                                <span className="text-emerald-300 font-semibold">{t('admin.emailSentSmtp')}</span>
                              ) : (
                                <span className="text-red-300 font-semibold" title={inv.email_error || ''}>
                                  {t('admin.emailSendError')}
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-xs text-neutral-300">
                              {formatDateTime(inv.expires_at, locale)}
                            </td>
                            <td className="py-4 px-5">
                              <div className="flex items-center justify-end gap-2">
                                {!inv.accepted_at && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => copyLink(inv.invite_url, inv.id)}
                                      className="btn-secondary text-xs py-1.5 px-3"
                                    >
                                      {copiedId === inv.id ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>{copiedId === inv.id ? t('admin.copied') : t('admin.linkShort')}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleResendInvite(inv)}
                                      className="btn-secondary text-xs py-1.5 px-3"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                      <span>{t('admin.resendShort')}</span>
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteInvite(inv.id)}
                                  title={t('common.delete')}
                                  className="p-2 rounded-lg text-neutral-300 hover:text-red-300 hover:bg-red-500/15 transition"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PROJECTS / APPLICATIONS */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">{t('admin.manageProjectsTitle')}</h2>
            <button
              type="button"
              onClick={() => setModalProject({})}
              className="btn-primary w-full sm:w-auto"
            >
              <FolderPlus className="w-4 h-4" />
              <span>{t('admin.addAppBtn')}</span>
            </button>
          </div>

          <div className="card-surface overflow-hidden">
            {projects.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-300">{t('admin.noProjects')}</div>
            ) : (
              <>
                {/* Mobile Cards (< lg) */}
                <div className="divide-y divide-neutral-800 lg:hidden">
                  {projects.map((p) => (
                    <div key={p.id} className="p-4 sm:p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          to={`/aplikacje/${p.id}`}
                          className="inline-flex items-center gap-2.5 font-bold text-base text-white hover:text-emerald-300"
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0"
                            style={{ backgroundColor: p.color || '#10b981' }}
                          />
                          <span>{p.name}</span>
                        </Link>
                      </div>
                      {p.url && <div className="text-xs text-emerald-300 break-all">{p.url}</div>}
                      <div className="text-xs text-neutral-300 flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        {p.github_sync_enabled && p.github_repo ? (
                          <a
                            href={`https://github.com/${p.github_repo}/issues`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono font-semibold text-emerald-300 hover:underline truncate"
                          >
                            {p.github_repo}
                          </a>
                        ) : (
                          <span className="text-neutral-400">{t('admin.githubIssuesDisabled')}</span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-300">
                        <span className="text-red-200 font-bold">
                          {t('admin.bugsCounts', { open: p.open_bugs || 0 })}
                        </span>{' '}
                        <span className="text-white font-semibold">
                          {t('admin.bugsTotal', { total: p.total_bugs || 0 })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setModalProject(p)}
                          className="btn-secondary text-xs py-1.5 px-3"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>{t('appDashboard.settingsEdit')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(p)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/45 bg-red-500/15 hover:bg-red-500/25 px-3 py-1.5 text-xs font-semibold text-red-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t('common.delete')}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table (>= lg) */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-800 bg-gradient-to-r from-neutral-800/80 via-neutral-800/45 to-neutral-900/75 text-xs font-bold uppercase tracking-wider text-neutral-200">
                        <th className="py-4 px-5">{t('admin.colAppName')}</th>
                        <th className="py-4 px-4">{t('admin.colGithubRepo')}</th>
                        <th className="py-4 px-4">{t('admin.colUrl')}</th>
                        <th className="py-4 px-4">{t('admin.colReportsStats')}</th>
                        <th className="py-4 px-5 text-right">{t('admin.colActions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800 text-sm">
                      {projects.map((p) => (
                        <tr key={p.id} className="hover:bg-white/[0.035]">
                          <td className="py-4 px-5">
                            <Link
                              to={`/aplikacje/${p.id}`}
                              className="inline-flex items-center gap-2.5 font-bold text-white hover:text-emerald-300"
                            >
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: p.color || '#10b981' }}
                              />
                              <span>{p.name}</span>
                            </Link>
                          </td>
                          <td className="py-4 px-4 text-xs">
                            {p.github_sync_enabled && p.github_repo ? (
                              <a
                                href={`https://github.com/${p.github_repo}/issues`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 font-mono font-semibold hover:bg-emerald-500/25 transition"
                              >
                                <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{p.github_repo}</span>
                              </a>
                            ) : (
                              <span className="text-neutral-500">{t('admin.githubDisconnected')}</span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-sm text-neutral-300">{p.url || '—'}</td>
                          <td className="py-4 px-4 text-sm">
                            <span className="text-red-200 font-bold">
                              {t('admin.bugsCounts', { open: p.open_bugs || 0 })}
                            </span>
                            <span className="text-neutral-400">
                              {' '}
                              {t('admin.bugsTotal', { total: p.total_bugs || 0 })}
                            </span>
                          </td>
                          <td className="py-4 px-5">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setModalProject(p)}
                                className="btn-secondary text-xs py-1.5 px-3"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>{t('nav.settings')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteProject(p)}
                                className="p-2 rounded-lg text-neutral-300 hover:text-red-300 hover:bg-red-500/15 transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: USERS & ROLES */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {roleFeedback && (
            <div
              className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold ${
                roleFeedback.type === 'success'
                  ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100'
                  : 'border-red-400/45 bg-red-500/15 text-red-100'
              }`}
            >
              {roleFeedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
              )}
              <span>{roleFeedback.message}</span>
            </div>
          )}

          <div className="card-surface overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-neutral-800">
              <h2 className="text-base font-bold text-white">{t('admin.usersTitle')}</h2>
              <p className="text-sm text-neutral-300 mt-1 leading-relaxed">{t('admin.usersDesc')}</p>
            </div>

            {(() => {
              const adminsCount = users.filter((x) => x.role === 'admin').length;
              return (
                <>
                  {/* Mobile Cards (< lg) */}
                  <div className="divide-y divide-neutral-800 lg:hidden">
                    {users.map((u) => {
                      const isSelf = u.id === user?.id;
                      const isLastAdmin = u.role === 'admin' && adminsCount <= 1;
                      const rKey = u.role && ROLES[u.role] ? u.role : 'user';
                      const roleMeta = ROLES[rKey];
                      return (
                        <div key={u.id} className="p-4 sm:p-5 space-y-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-white">{u.name}</span>
                                {isSelf && (
                                  <span className="text-xs text-emerald-400 font-semibold">
                                    {t('common.you')}
                                  </span>
                                )}
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${roleMeta.badgeClass}`}>
                                  {t(`roles.${rKey}.shortLabel`)}
                                </span>
                              </div>
                              <div className="text-xs text-neutral-300 break-all mt-0.5">{u.email}</div>
                            </div>
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                title={t('admin.deleteUserTooltip')}
                                className="p-2 rounded-lg text-neutral-300 hover:text-red-300 hover:bg-red-500/15 shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            {u.notify_new_bug && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">
                                {t('admin.badgeNewBugs')}
                              </span>
                            )}
                            {u.notify_status_change && (
                              <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700">
                                {t('admin.badgeStatusChange')}
                              </span>
                            )}
                            {u.notify_comments && (
                              <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700">
                                {t('admin.badgeComments')}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-neutral-800/80 text-xs text-neutral-300">
                            <span>
                              {t('admin.reportedBugsCount')}{' '}
                              <strong className="text-white">{u.reported_bugs_count || 0}</strong> •{' '}
                              {formatDateTime(u.created_at, locale)}
                            </span>

                            <div className="flex items-center gap-2">
                              <span className="text-neutral-400 font-medium shrink-0">
                                {t('admin.changeRoleLabel')}
                              </span>
                              <select
                                disabled={isLastAdmin || updatingRoleId === u.id}
                                title={isLastAdmin ? t('admin.lastAdminTooltip') : t('admin.changeRoleTooltip')}
                                value={u.role}
                                onChange={(e) => handleRoleChange(u, e.target.value)}
                                className="input-field sm:w-auto py-1.5 text-xs font-semibold disabled:opacity-60"
                              >
                                <option value="admin">{t('roles.admin.label')}</option>
                                <option value="dev">{t('roles.dev.label')}</option>
                                <option value="user">{t('roles.user.label')}</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Table (>= lg) */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-800 bg-gradient-to-r from-neutral-800/80 via-neutral-800/45 to-neutral-900/75 text-xs font-bold uppercase tracking-wider text-neutral-200">
                          <th className="py-4 px-5">{t('admin.colUser')}</th>
                          <th className="py-4 px-4">{t('admin.colRolePerm')}</th>
                          <th className="py-4 px-4">{t('admin.colActiveNotifs')}</th>
                          <th className="py-4 px-4">{t('admin.colReports')}</th>
                          <th className="py-4 px-4">{t('admin.colRegisteredAt')}</th>
                          <th className="py-4 px-5 text-right">{t('admin.colActions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800 text-sm">
                        {users.map((u) => {
                          const isSelf = u.id === user?.id;
                          const isLastAdmin = u.role === 'admin' && adminsCount <= 1;
                          const rKey = u.role && ROLES[u.role] ? u.role : 'user';
                          const roleMeta = ROLES[rKey];
                          return (
                            <tr key={u.id} className="hover:bg-white/[0.035]">
                              <td className="py-4 px-5">
                                <div className="font-bold text-white">
                                  {u.name}{' '}
                                  {isSelf && <span className="text-xs text-emerald-400">{t('common.you')}</span>}
                                </div>
                                <div className="text-xs text-neutral-300 mt-0.5">{u.email}</div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border shrink-0 ${roleMeta.badgeClass}`}>
                                    {t(`roles.${rKey}.shortLabel`)}
                                  </span>
                                  <select
                                    disabled={isLastAdmin || updatingRoleId === u.id}
                                    title={isLastAdmin ? t('admin.lastAdminTooltip') : t('admin.changeRoleTooltip')}
                                    value={u.role}
                                    onChange={(e) => handleRoleChange(u, e.target.value)}
                                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none disabled:opacity-50 cursor-pointer"
                                  >
                                    <option value="admin">{t('roles.admin.label')}</option>
                                    <option value="dev">{t('roles.dev.label')}</option>
                                    <option value="user">{t('roles.user.label')}</option>
                                  </select>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-wrap gap-1.5 text-[11px]">
                                  {u.notify_new_bug && (
                                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 font-medium">
                                      {t('admin.badgeNewBugsShort')}
                                    </span>
                                  )}
                                  {u.notify_status_change && (
                                    <span className="px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-200 border border-neutral-700 font-medium">
                                      {t('admin.badgeStatusShort')}
                                    </span>
                                  )}
                                  {u.notify_comments && (
                                    <span className="px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-200 border border-neutral-700 font-medium">
                                      {t('admin.badgeCommentsShort')}
                                    </span>
                                  )}
                                  {!u.notify_new_bug && !u.notify_status_change && !u.notify_comments && (
                                    <span className="text-neutral-500">{t('admin.notifsDisabled')}</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4 text-sm font-semibold text-white">
                                {u.reported_bugs_count || 0}
                              </td>
                              <td className="py-4 px-4 text-xs text-neutral-300 whitespace-nowrap">
                                {formatDateTime(u.created_at, locale)}
                              </td>
                              <td className="py-4 px-5 text-right">
                                {!isSelf && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u)}
                                    title={t('admin.deleteUserTooltip')}
                                    className="p-2 rounded-lg text-neutral-300 hover:text-red-300 hover:bg-red-500/15 transition"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {modalProject !== null && (
        <ProjectModal
          project={modalProject.id ? modalProject : null}
          onClose={() => setModalProject(null)}
          onSaved={() => {
            setModalProject(null);
            loadAll();
            window.dispatchEvent(new Event('projects-updated'));
          }}
        />
      )}
    </div>
  );
}

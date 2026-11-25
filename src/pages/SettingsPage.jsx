import React, { useState, useEffect } from 'react';
import {
  Settings,
  Bell,
  User,
  Lock,
  CheckCircle2,
  AlertCircle,
  Save,
  Globe,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import { ROLES } from '../lib/constants';

function ToggleRow({ title, description, badge, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-neutral-800/90 bg-gradient-to-r from-neutral-900/90 to-neutral-950/80 p-4 cursor-pointer hover:border-neutral-700 transition">
      <div className="space-y-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm sm:text-base font-bold text-white">{title}</span>
          {badge && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-300 border border-neutral-700">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">{description}</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition duration-200 mt-0.5 ${
          checked
            ? 'bg-emerald-600 border-emerald-400/60 shadow-[0_0_14px_-2px_rgba(16,185,129,0.5)]'
            : 'bg-neutral-800 border-neutral-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

export default function SettingsPage() {
  const { user, updateUserState } = useAuth();
  const { t, explicitLang, browserLang, languages, setLanguage } = useLanguage();

  // Language preference feedback
  const [savingLang, setSavingLang] = useState(false);
  const [langFeedback, setLangFeedback] = useState(null);

  // Notification toggles
  const [notifyNewBug, setNotifyNewBug] = useState(Boolean(user?.notify_new_bug));
  const [notifyStatusChange, setNotifyStatusChange] = useState(Boolean(user?.notify_status_change));
  const [notifyComments, setNotifyComments] = useState(Boolean(user?.notify_comments));
  const [notifyAssigned, setNotifyAssigned] = useState(Boolean(user?.notify_assigned));

  const [savingNotifs, setSavingNotifs] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState(null);

  // Profile & password
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState(null);

  useEffect(() => {
    if (user) {
      setNotifyNewBug(Boolean(user.notify_new_bug));
      setNotifyStatusChange(Boolean(user.notify_status_change));
      setNotifyComments(Boolean(user.notify_comments));
      setNotifyAssigned(Boolean(user.notify_assigned));
      setName(user.name || '');
    }
  }, [user]);

  const handleLanguageChange = async (code) => {
    setLangFeedback(null);
    setSavingLang(true);
    try {
      await setLanguage(code, { persistToServer: true });
      setLangFeedback({
        type: 'success',
        message: t('settings.languageSaved'),
      });
    } catch (err) {
      setLangFeedback({
        type: 'error',
        message: err.message || t('settings.languageError'),
      });
    } finally {
      setSavingLang(false);
    }
  };

  const handleSaveNotifications = async (e) => {
    e.preventDefault();
    setNotifFeedback(null);
    setSavingNotifs(true);
    try {
      const data = await apiFetch('/api/settings/notifications', {
        method: 'PUT',
        body: {
          notify_new_bug: notifyNewBug,
          notify_status_change: notifyStatusChange,
          notify_comments: notifyComments,
          notify_assigned: notifyAssigned,
        },
      });
      updateUserState(data.user);
      setNotifFeedback({
        type: 'success',
        message: t('settings.notifsSaved'),
      });
    } catch (err) {
      setNotifFeedback({
        type: 'error',
        message: err.message || t('settings.notifsError'),
      });
    } finally {
      setSavingNotifs(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileFeedback(null);

    if (newPassword && newPassword !== confirmNewPassword) {
      setProfileFeedback({
        type: 'error',
        message: t('settings.passwordMismatchError'),
      });
      return;
    }

    setSavingProfile(true);
    try {
      const data = await apiFetch('/api/settings/profile', {
        method: 'PUT',
        body: {
          name: name.trim(),
          ...(newPassword ? { currentPassword, newPassword } : {}),
        },
      });
      updateUserState(data.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setProfileFeedback({
        type: 'success',
        message: newPassword ? t('settings.profileSavedWithPwd') : t('settings.profileSavedNameOnly'),
      });
    } catch (err) {
      setProfileFeedback({
        type: 'error',
        message: err.message || t('settings.profileSaveError'),
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const roleKey = user?.role && ROLES[user.role] ? user.role : 'user';
  const roleMeta = ROLES[roleKey];
  const isStaff = user?.role === 'admin' || user?.role === 'dev';
  const browserLangName =
    languages.find((l) => l.code === browserLang)?.nativeName || browserLang;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <Settings className="w-7 h-7 text-emerald-400 shrink-0" />
          <span>{t('settings.title')}</span>
        </h1>
        <p className="text-sm sm:text-base text-neutral-300 mt-1">
          {t('settings.subtitlePrefix')}{' '}
          <strong className="text-white">{user?.email}</strong>
          {t('settings.subtitleSuffix')}
        </p>
      </div>

      {/* Interface Language Section */}
      <div className="card-surface p-5 sm:p-6 space-y-4">
        <div className="pb-4 border-b border-neutral-800">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-400" />
            <span>{t('settings.languageTitle')}</span>
          </h2>
          <p className="text-xs sm:text-sm text-neutral-300 mt-0.5">
            {t('settings.languageSubtitle')}
          </p>
        </div>

        {langFeedback && (
          <div
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium ${
              langFeedback.type === 'success'
                ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100'
                : 'border-red-400/45 bg-red-500/15 text-red-100'
            }`}
          >
            {langFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span>{langFeedback.message}</span>
          </div>
        )}

        <div className="max-w-md">
          <select
            disabled={savingLang}
            value={explicitLang}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="input-field font-semibold"
          >
            <option value="">{t('settings.languageOptionAuto', { lang: browserLangName })}</option>
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName} ({lang.code.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Email Notifications Preferences */}
      <form onSubmit={handleSaveNotifications} className="card-surface p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-neutral-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-emerald-400" />
              <span>{t('settings.notifsTitle')}</span>
            </h2>
            <p className="text-xs sm:text-sm text-neutral-300 mt-0.5">
              {t('settings.notifsSubtitle')}
            </p>
          </div>
          <span className={`self-start sm:self-auto text-xs font-semibold px-2.5 py-1 rounded-md border ${roleMeta.badgeClass}`}>
            {t('settings.yourRole', { role: t(`roles.${roleKey}.label`) })}
          </span>
        </div>

        {notifFeedback && (
          <div
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium ${
              notifFeedback.type === 'success'
                ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100'
                : 'border-red-400/45 bg-red-500/15 text-red-100'
            }`}
          >
            {notifFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span>{notifFeedback.message}</span>
          </div>
        )}

        <div className="space-y-3">
          <ToggleRow
            title={t('settings.toggleStatusTitle')}
            badge={t('settings.toggleStatusBadge')}
            description={t('settings.toggleStatusDesc')}
            checked={notifyStatusChange}
            onChange={setNotifyStatusChange}
          />

          <ToggleRow
            title={t('settings.toggleNewBugTitle')}
            badge={isStaff ? t('settings.toggleNewBugBadgeStaff') : t('settings.toggleNewBugBadgeOpt')}
            description={t('settings.toggleNewBugDesc')}
            checked={notifyNewBug}
            onChange={setNotifyNewBug}
          />

          <ToggleRow
            title={t('settings.toggleCommentsTitle')}
            description={t('settings.toggleCommentsDesc')}
            checked={notifyComments}
            onChange={setNotifyComments}
          />

          {isStaff && (
            <ToggleRow
              title={t('settings.toggleAssignedTitle')}
              badge={t('settings.toggleAssignedBadge')}
              description={t('settings.toggleAssignedDesc')}
              checked={notifyAssigned}
              onChange={setNotifyAssigned}
            />
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={savingNotifs} className="btn-primary w-full sm:w-auto px-5 py-2.5">
            <Save className="w-4 h-4" />
            <span>{savingNotifs ? t('common.saving') : t('settings.saveNotifs')}</span>
          </button>
        </div>
      </form>

      {/* Profile & Password Section */}
      <form onSubmit={handleSaveProfile} className="card-surface p-5 sm:p-6 space-y-5">
        <div className="pb-4 border-b border-neutral-800">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-amber-400" />
            <span>{t('settings.profileTitle')}</span>
          </h2>
          <p className="text-xs sm:text-sm text-neutral-300 mt-0.5">
            {t('settings.profileSubtitle')}
          </p>
        </div>

        {profileFeedback && (
          <div
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium ${
              profileFeedback.type === 'success'
                ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100'
                : 'border-red-400/45 bg-red-500/15 text-red-100'
            }`}
          >
            {profileFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span>{profileFeedback.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
              {t('settings.nameLabel')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
              {t('settings.emailLabel')}
            </label>
            <input
              type="email"
              disabled
              value={user?.email || ''}
              className="input-field opacity-60 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-neutral-800/80 space-y-4">
          <div className="text-sm font-bold text-neutral-200 flex items-center gap-2">
            <Lock className="w-4 h-4 text-neutral-400" />
            <span>
              {t('settings.passwordSectionTitle')}{' '}
              <span className="text-neutral-400 font-normal">{t('settings.passwordSectionHint')}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                {t('settings.currentPasswordLabel')}
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                {t('settings.newPasswordLabel')}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                {t('settings.confirmNewPasswordLabel')}
              </label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={savingProfile} className="btn-secondary w-full sm:w-auto px-5 py-2.5">
            <Save className="w-4 h-4 text-emerald-400" />
            <span>{savingProfile ? t('common.saving') : t('settings.saveProfile')}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Bug, UserCheck, Lock, User, AlertCircle, ArrowLeft, Globe } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ROLES } from '../lib/constants';

export default function RegisterInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { registerWithInvite } = useAuth();
  const { t, language, explicitLang, languages, setLanguage } = useLanguage();

  const [invitation, setInvitation] = useState(null);
  const [checking, setChecking] = useState(true);
  const [verifyError, setVerifyError] = useState('');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkToken() {
      setChecking(true);
      try {
        const data = await apiFetch(`/api/invitations/verify/${token}`);
        if (active) setInvitation(data.invitation);
      } catch (err) {
        if (active) setVerifyError(err.message || t('register.invalidInvite'));
      } finally {
        if (active) setChecking(false);
      }
    }
    checkToken();
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    if (password.length < 6) {
      setSubmitError(t('register.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError(t('register.passwordsMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      await registerWithInvite(token, name, password);
      navigate('/');
    } catch (err) {
      setSubmitError(err.message || t('register.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const roleKey = invitation?.role && ROLES[invitation.role] ? invitation.role : 'user';
  const roleMeta = ROLES[roleKey];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute -top-36 -left-36 w-[28rem] h-[28rem] bg-emerald-500/12 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-36 -right-36 w-[28rem] h-[28rem] bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />

      <div className="fixed top-4 right-4 z-20 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 shadow-lg">
        <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
        <select
          aria-label={t('common.languageLabel')}
          value={explicitLang || language}
          onChange={(e) => setLanguage(e.target.value, { persistToServer: false })}
          className="bg-transparent text-xs font-semibold text-neutral-100 focus:outline-none cursor-pointer"
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code} className="bg-neutral-900 text-neutral-100">
              {lang.nativeName}
            </option>
          ))}
        </select>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-600 to-emerald-800 shadow-[0_10px_28px_-6px_rgba(16,185,129,0.55),inset_0_1px_0_0_rgba(255,255,255,0.28)] mb-4">
            <Bug className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {t('register.title')}
          </h1>
          <p className="text-sm sm:text-base text-neutral-300 mt-1">
            {t('register.subtitle')}
          </p>
        </div>

        <div className="card-surface p-6 sm:p-8">
          {checking ? (
            <div className="py-8 text-center text-sm font-medium text-neutral-300">
              {t('register.verifying')}
            </div>
          ) : verifyError ? (
            <div className="space-y-5 text-center">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-red-400/45 bg-red-500/15 p-5 text-sm text-red-200">
                <AlertCircle className="w-7 h-7 text-red-300" />
                <span>{verifyError}</span>
              </div>
              <Link
                to="/logowanie"
                className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t('register.goToLogin')}</span>
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 rounded-xl border border-neutral-700 bg-neutral-950 p-4 space-y-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-neutral-300">{t('register.invitedEmail')}</span>
                  <span className="font-bold text-white break-all">{invitation.email}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-neutral-300">{t('register.assignedRole')}</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-md border font-semibold ${roleMeta.badgeClass}`}>
                    {t(`roles.${roleKey}.label`)}
                  </span>
                </div>
              </div>

              {submitError && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-400/45 bg-red-500/15 px-3.5 py-3 text-sm text-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-300" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
                    {t('register.nameLabel')} <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('register.namePlaceholder')}
                      className="input-field pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
                    {t('register.passwordLabel')} <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="input-field pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
                    {t('register.confirmPasswordLabel')} <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="input-field pl-10"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full py-3 mt-2"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{submitting ? t('register.submitting') : t('register.submit')}</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug, Lock, Mail, AlertCircle, ShieldCheck, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function LoginPage() {
  const { login } = useAuth();
  const { t, language, explicitLang, browserLang, languages, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || t('login.failed'));
    } finally {
      setLoading(false);
    }
  };

  const browserLangName =
    languages.find((l) => l.code === browserLang)?.nativeName || browserLang;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute -top-36 -left-36 w-[28rem] h-[28rem] bg-emerald-500/12 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-36 -right-36 w-[28rem] h-[28rem] bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />

      {/* Quick Language Selector */}
      <div className="fixed top-4 right-4 z-20 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 shadow-lg">
        <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
        <select
          aria-label={t('common.languageLabel')}
          value={explicitLang || language}
          onChange={(e) => setLanguage(e.target.value, { persistToServer: false })}
          className="bg-transparent text-xs font-semibold text-neutral-100 focus:outline-none cursor-pointer"
        >
          {!explicitLang && (
            <option value={language} className="bg-neutral-900 text-neutral-200">
              {t('common.browserAuto', { lang: browserLangName })}
            </option>
          )}
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
            {t('common.appName')}
          </h1>
          <p className="text-sm sm:text-base text-neutral-300 mt-1.5">
            {t('login.subtitle')}
          </p>
        </div>

        <div className="card-surface p-6 sm:p-8">
          {error && (
            <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-red-400/45 bg-red-500/15 px-4 py-3 text-sm text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-300" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
                {t('login.emailLabel')}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.emailPlaceholder')}
                  className="input-field pl-10"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
                {t('login.passwordLabel')}
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

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 mt-2"
            >
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-neutral-800 flex items-start gap-2.5 text-xs sm:text-sm text-neutral-300 leading-relaxed">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <span>{t('login.inviteNotice')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

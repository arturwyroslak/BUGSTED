import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  TRANSLATIONS,
  LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
  detectBrowserLanguage,
  getLanguageMeta,
} from '../i18n/translations';
import { useAuth } from './AuthContext';
import { apiFetch } from '../lib/api';

const STORAGE_KEY = 'bugsted_lang';
const LanguageContext = createContext(null);

function resolveNested(obj, path) {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

function interpolate(str, vars) {
  if (typeof str !== 'string' || !vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function LanguageProvider({ children }) {
  const { user, updateUserState } = useAuth();
  const browserLang = useMemo(() => detectBrowserLanguage(), []);

  // explicitLang is '' when set to browser auto-detect, or a code like 'en', 'pl', etc.
  const [explicitLang, setExplicitLang] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || '';
      return LANGUAGE_CODES.includes(saved) ? saved : '';
    } catch {
      return '';
    }
  });

  // Sync user.language from DB when logged in (if user explicitly saved one)
  useEffect(() => {
    if (user && typeof user.language === 'string') {
      if (user.language && LANGUAGE_CODES.includes(user.language)) {
        setExplicitLang(user.language);
        try {
          localStorage.setItem(STORAGE_KEY, user.language);
        } catch {}
      } else if (user.language === '') {
        // Respect local explicit override only if not explicitly cleared on server
      }
    }
  }, [user?.id, user?.language]);

  const language = explicitLang || browserLang;
  const meta = useMemo(() => getLanguageMeta(language), [language]);

  // Apply lang, dir (RTL for Arabic), and localized page title to document
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
      document.documentElement.dir = meta.rtl ? 'rtl' : 'ltr';
      const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
      if (dict?.common?.pageTitle) {
        document.title = dict.common.pageTitle;
      }
    }
  }, [language, meta.rtl]);

  const setLanguage = useCallback(
    async (nextCode, { persistToServer = true } = {}) => {
      const normalized = LANGUAGE_CODES.includes(nextCode) ? nextCode : '';
      setExplicitLang(normalized);
      try {
        if (normalized) {
          localStorage.setItem(STORAGE_KEY, normalized);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {}

      if (persistToServer && user) {
        const res = await apiFetch('/api/settings/language', {
          method: 'PUT',
          body: { language: normalized },
        });
        if (res?.user) {
          updateUserState(res.user);
        }
      }
    },
    [user, updateUserState]
  );

  const t = useCallback(
    (key, vars) => {
      const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
      let val = resolveNested(dict, key);
      if (val === undefined) {
        val = resolveNested(TRANSLATIONS.en, key);
      }
      if (val === undefined) return key;
      return interpolate(val, vars);
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      explicitLang,
      browserLang,
      locale: meta.locale,
      isRtl: meta.rtl,
      languages: SUPPORTED_LANGUAGES,
      setLanguage,
      t,
    }),
    [language, explicitLang, browserLang, meta.locale, meta.rtl, setLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}

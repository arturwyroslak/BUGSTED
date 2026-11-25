import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Bug,
  PlusCircle,
  Shield,
  LogOut,
  ListChecks,
  Menu,
  X,
  Plus,
  Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ROLES } from '../lib/constants';
import { apiFetch } from '../lib/api';
import ProjectModal from './ProjectModal';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const data = await apiFetch('/api/projects');
      setProjects(data.projects || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects, location.pathname]);

  useEffect(() => {
    const handler = () => loadProjects();
    window.addEventListener('projects-updated', handler);
    return () => window.removeEventListener('projects-updated', handler);
  }, [loadProjects]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/logowanie');
  };

  const roleKey = user?.role && ROLES[user.role] ? user.role : 'user';
  const roleMeta = ROLES[roleKey];

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition duration-200 ${
      isActive
        ? 'bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent text-emerald-200 border border-emerald-500/35 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.16)]'
        : 'text-neutral-300 hover:text-white hover:bg-white/[0.04] border border-transparent'
    }`;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#171918] via-[#111211] to-[#0a0b0a] border-r border-neutral-800/90 shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.03)] w-72 max-w-[85vw]">
      {/* Brand */}
      <div className="p-5 border-b border-neutral-800/80 bg-gradient-to-r from-emerald-500/[0.06] via-transparent to-transparent flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-3.5 group min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-600 to-emerald-800 flex items-center justify-center shadow-[0_6px_20px_-4px_rgba(16,185,129,0.5),inset_0_1px_0_0_rgba(255,255,255,0.28)] shrink-0">
            <Bug className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-extrabold leading-tight tracking-tight text-white group-hover:text-emerald-300 transition truncate">
              {t('common.appName')}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400/95 truncate">
              {t('common.appSubtitle')}
            </div>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label={t('nav.closeMenu')}
          className="lg:hidden p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Primary CTA */}
      <div className="p-4">
        <Link to="/zglos-blad" className="btn-primary w-full py-3">
          <PlusCircle className="w-4 h-4 shrink-0" />
          <span>{t('nav.reportNewBug')}</span>
        </Link>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-6 pb-6">
        <div className="space-y-1">
          <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
            {t('nav.mainMenu')}
          </div>
          <NavLink to="/" end className={navLinkClass}>
            <ListChecks className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{t('nav.allBugs')}</span>
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={navLinkClass}>
              <Shield className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{t('nav.adminPanel')}</span>
            </NavLink>
          )}
          <NavLink to="/ustawienia" className={navLinkClass}>
            <Settings className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{t('nav.settings')}</span>
          </NavLink>
        </div>

        {/* Applications List */}
        <div>
          <div className="px-3 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">
              {t('nav.applicationsCount', { count: projects.length })}
            </span>
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => setShowNewProjectModal(true)}
                title={t('nav.addNewApplication')}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          {projects.length === 0 ? (
            <div className="mx-2 rounded-xl bg-gradient-to-b from-neutral-900/90 to-neutral-950 border border-neutral-800 p-3.5 text-xs text-neutral-300">
              {t('nav.noApplications')}
              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(true)}
                  className="block mt-1.5 text-emerald-400 hover:text-emerald-300 font-semibold"
                >
                  {t('nav.addFirstApplication')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {projects.map((proj) => (
                <NavLink
                  key={proj.id}
                  to={`/aplikacje/${proj.id}`}
                  className={({ isActive }) =>
                    `flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm transition duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-neutral-800 via-neutral-800/80 to-neutral-900 text-white font-semibold border border-neutral-700/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]'
                        : 'text-neutral-300 hover:text-white hover:bg-white/[0.04] font-medium border border-transparent'
                    }`
                  }
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 ring-2 ring-neutral-950 shadow-sm"
                      style={{ backgroundColor: proj.color || '#10b981' }}
                    />
                    <span className="truncate">{proj.name}</span>
                  </div>
                  {proj.open_bugs > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-b from-red-500/25 to-red-600/15 text-red-200 border border-red-400/40 shrink-0">
                      {proj.open_bugs}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-neutral-800/90 bg-gradient-to-t from-black/60 to-neutral-950/30">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">{user?.name}</div>
            <div className="text-xs text-neutral-300 truncate">{user?.email}</div>
            <span
              className={`inline-block mt-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-md border ${roleMeta.badgeClass}`}
            >
              {t(`roles.${roleKey}.label`)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title={t('nav.logout')}
            className="p-2.5 rounded-xl text-neutral-300 hover:text-red-200 hover:bg-red-500/20 border border-transparent hover:border-red-400/35 transition shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen text-neutral-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0">{sidebarContent}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full shadow-2xl">{sidebarContent}</div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile & Tablet Header */}
        <header className="lg:hidden sticky top-0 z-30 bg-gradient-to-r from-[#161817]/95 via-[#111211]/95 to-[#141514]/95 backdrop-blur-md border-b border-neutral-800 px-3 sm:px-5 py-3 flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={t('nav.openMenu')}
              className="p-2 rounded-xl text-neutral-200 hover:bg-neutral-800 shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link to="/" className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center shadow-sm shrink-0">
                <Bug className="w-4 h-4 text-white" />
              </div>
              <div className="leading-tight truncate">
                <div className="font-extrabold text-sm text-white truncate">
                  {t('common.appName')}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 truncate">
                  {t('common.appSubtitle')}
                </div>
              </div>
            </Link>
          </div>
          <Link
            to="/zglos-blad"
            className="btn-primary px-3 py-2 text-xs sm:text-sm shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{t('nav.reportShort')}</span>
          </Link>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {showNewProjectModal && (
        <ProjectModal
          onClose={() => setShowNewProjectModal(false)}
          onSaved={(created) => {
            setShowNewProjectModal(false);
            loadProjects();
            window.dispatchEvent(new Event('projects-updated'));
            navigate(`/aplikacje/${created.id}`);
          }}
        />
      )}
    </div>
  );
}

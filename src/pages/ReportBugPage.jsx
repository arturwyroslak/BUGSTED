import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Bug,
  ImagePlus,
  X,
  Send,
  AlertCircle,
  ArrowLeft,
  ClipboardPaste,
  FolderPlus,
} from 'lucide-react';
import { apiFetch, uploadBugFormData } from '../lib/api';
import { PRIORITY_LIST, formatFileSize } from '../lib/constants';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import ScreenRecorder from '../components/ScreenRecorder';
import ProjectModal from '../components/ProjectModal';

const MAX_SCREENSHOTS = 10;

export default function ReportBugPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get('projectId') || '';

  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  const [projectId, setProjectId] = useState(preselectedProject);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [videoFile, setVideoFile] = useState(null);

  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const screenshotsInputRef = useRef(null);
  const screenshotsRef = useRef(screenshots);
  screenshotsRef.current = screenshots;

  useEffect(() => {
    async function fetchProjects() {
      try {
        const data = await apiFetch('/api/projects');
        const list = data.projects || [];
        setProjects(list);
        if (!projectId && list.length > 0) {
          const match = preselectedProject
            ? list.find((p) => String(p.id) === String(preselectedProject))
            : list[0];
          if (match) setProjectId(String(match.id));
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingProjects(false);
      }
    }
    fetchProjects();
  }, []);

  useEffect(() => {
    return () => {
      screenshotsRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
  }, []);

  const addScreenshots = (fileList) => {
    setError('');
    const incoming = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (incoming.length === 0) {
      setError(t('reportBug.errImageFilesOnly'));
      return;
    }

    setScreenshots((prev) => {
      const remainingSlots = MAX_SCREENSHOTS - prev.length;
      if (remainingSlots <= 0) {
        setError(t('reportBug.errLimitReached', { max: MAX_SCREENSHOTS }));
        return prev;
      }
      if (incoming.length > remainingSlots) {
        setError(
          t('reportBug.errLimitPartial', {
            max: MAX_SCREENSHOTS,
            added: remainingSlots,
          })
        );
      }
      const toAdd = incoming.slice(0, remainingSlots).map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...toAdd];
    });
  };

  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const ext = blob.type.split('/')[1] || 'png';
            const namedFile = new File([blob], `clipboard-${Date.now()}.${ext}`, { type: blob.type });
            imageFiles.push(namedFile);
          }
        }
      }
      if (imageFiles.length > 0) {
        addScreenshots(imageFiles);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const removeScreenshot = (id) => {
    setScreenshots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!projectId) {
      setError(t('reportBug.errSelectApp'));
      return;
    }
    if (!title.trim() || title.trim().length < 3) {
      setError(t('reportBug.errTitleShort'));
      return;
    }
    if (screenshots.length > MAX_SCREENSHOTS) {
      setError(t('reportBug.errMaxScreenshots', { max: MAX_SCREENSHOTS }));
      return;
    }

    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('title', title.trim());
    formData.append('priority', priority);
    formData.append('description', description.trim());

    screenshots.forEach((s) => {
      formData.append('screenshots', s.file);
    });

    if (videoFile) {
      formData.append('video', videoFile);
    }

    setSubmitting(true);
    setUploadProgress(0);
    try {
      const result = await uploadBugFormData(formData, (pct) => setUploadProgress(pct));
      window.dispatchEvent(new Event('projects-updated'));
      navigate(`/bledy/${result.bug.id}`);
    } catch (err) {
      setError(err.message || t('reportBug.errSubmitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          to={preselectedProject ? `/aplikacje/${preselectedProject}` : '/'}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300 hover:text-emerald-300 mb-3 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{preselectedProject ? t('reportBug.backToApp') : t('reportBug.backToList')}</span>
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <Bug className="w-7 h-7 text-emerald-400 shrink-0" />
          <span>{t('reportBug.title')}</span>
        </h1>
        <p className="text-sm sm:text-base text-neutral-300 mt-1.5 leading-relaxed">
          {t('reportBug.subtitle')}
        </p>
      </div>

      {!loadingProjects && projects.length === 0 ? (
        <div className="card-surface p-8 sm:p-12 text-center space-y-4">
          <p className="text-base text-white font-semibold">{t('reportBug.noAppsText')}</p>
          {user?.role === 'admin' ? (
            <button
              type="button"
              onClick={() => setShowNewProjectModal(true)}
              className="btn-primary"
            >
              <FolderPlus className="w-4 h-4" />
              <span>{t('reportBug.addFirstApp')}</span>
            </button>
          ) : (
            <p className="text-sm text-neutral-300">{t('reportBug.askAdmin')}</p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-400/45 bg-red-500/15 px-4 py-3.5 text-sm text-red-200">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-300" />
              <span>{error}</span>
            </div>
          )}

          {/* Main Fields Card */}
          <div className="card-surface p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
                  {t('reportBug.selectAppLabel')} <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="input-field"
                >
                  <option value="" disabled>
                    {t('reportBug.selectAppPlaceholder')}
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
                  {t('reportBug.priorityLabel')}
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="input-field"
                >
                  {PRIORITY_LIST.map((pr) => (
                    <option key={pr.value} value={pr.value}>
                      {t(`priorities.${pr.value}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
                {t('reportBug.titleLabel')} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('reportBug.titlePlaceholder')}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-200 mb-1.5">
                {t('reportBug.descriptionLabel')}{' '}
                <span className="text-neutral-400 font-normal">({t('common.optional')})</span>
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('reportBug.descriptionPlaceholder')}
                className="input-field"
              />
            </div>
          </div>

          {/* Screenshots Upload Card (Max 10) */}
          <div className="card-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ImagePlus className="w-5 h-5 text-amber-400 shrink-0" />
                  <span>{t('reportBug.screenshotsTitle')}</span>
                </h3>
                <p className="text-sm text-neutral-300 mt-1">
                  {t('reportBug.screenshotsHelpPrefix', { max: MAX_SCREENSHOTS })}{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-white border border-neutral-700 text-xs font-mono">
                    Ctrl+V
                  </kbd>
                  {t('reportBug.screenshotsHelpSuffix')}
                </p>
              </div>
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full border shrink-0 ${
                  screenshots.length >= MAX_SCREENSHOTS
                    ? 'bg-amber-500/20 text-amber-200 border-amber-400/45'
                    : 'bg-neutral-800 text-neutral-200 border-neutral-700'
                }`}
              >
                {screenshots.length} / {MAX_SCREENSHOTS}
              </span>
            </div>

            {screenshots.length < MAX_SCREENSHOTS && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addScreenshots(e.dataTransfer.files);
                }}
                onClick={() => screenshotsInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition ${
                  dragOver
                    ? 'border-emerald-400 bg-emerald-500/15'
                    : 'border-neutral-700 hover:border-emerald-500/70 bg-neutral-950/70'
                }`}
              >
                <ImagePlus className="w-8 h-8 text-emerald-400 mx-auto mb-2.5" />
                <div className="text-sm sm:text-base font-semibold text-white">
                  {t('reportBug.dropzoneTitle')}
                </div>
                <div className="mt-1.5 flex items-center justify-center gap-1.5 text-xs sm:text-sm text-neutral-300 flex-wrap">
                  <ClipboardPaste className="w-4 h-4 shrink-0 text-neutral-400" />
                  <span>
                    {t('reportBug.dropzoneHint', { remaining: MAX_SCREENSHOTS - screenshots.length })}
                  </span>
                </div>
                <input
                  ref={screenshotsInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    addScreenshots(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </div>
            )}

            {screenshots.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-4">
                {screenshots.map((shot, idx) => (
                  <div
                    key={shot.id}
                    className="group relative rounded-xl overflow-hidden border border-neutral-700 bg-neutral-950 aspect-video flex flex-col"
                  >
                    <img
                      src={shot.previewUrl}
                      alt={t('reportBug.screenshotAlt', { n: idx + 1 })}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2.5 py-1.5 flex items-center justify-between text-xs text-neutral-100 font-medium">
                      <span>#{idx + 1}</span>
                      <span>{formatFileSize(shot.file.size)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeScreenshot(shot.id)}
                      title={t('reportBug.removeScreenshot')}
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-neutral-900/90 hover:bg-red-600 text-white border border-neutral-700 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Screen Video Recorder Component */}
          <ScreenRecorder videoFile={videoFile} onVideoChange={setVideoFile} />

          {/* Upload Progress */}
          {submitting && (
            <div className="rounded-xl border border-emerald-400/45 bg-emerald-500/15 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm font-semibold text-emerald-100">
                <span>{t('reportBug.uploadingFiles')}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-3 pt-2">
            <Link
              to={preselectedProject ? `/aplikacje/${preselectedProject}` : '/'}
              className="btn-secondary w-full sm:w-auto py-3"
            >
              {t('common.cancel')}
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full sm:w-auto px-6 py-3"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? t('reportBug.submitting') : t('reportBug.submit')}</span>
            </button>
          </div>
        </form>
      )}

      {showNewProjectModal && (
        <ProjectModal
          onClose={() => setShowNewProjectModal(false)}
          onSaved={(created) => {
            setShowNewProjectModal(false);
            setProjects((prev) => [created, ...prev]);
            setProjectId(String(created.id));
            window.dispatchEvent(new Event('projects-updated'));
          }}
        />
      )}
    </div>
  );
}

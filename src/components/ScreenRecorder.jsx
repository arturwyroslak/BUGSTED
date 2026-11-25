import React, { useState, useRef, useEffect } from 'react';
import {
  Video,
  Square,
  Mic,
  MicOff,
  Trash2,
  Upload,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { formatFileSize } from '../lib/constants';
import { useLanguage } from '../context/LanguageContext';

function getSupportedMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

function formatDuration(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export default function ScreenRecorder({ videoFile, onVideoChange }) {
  const { t } = useLanguage();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [withMic, setWithMic] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  const liveVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamsToCleanupRef = useRef([]);
  const audioCtxRef = useRef(null);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  const isSupported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getDisplayMedia) &&
    typeof MediaRecorder !== 'undefined';

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl('');
    }
  }, [videoFile]);

  const cleanupStreams = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    for (const stream of streamsToCleanupRef.current) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
    }
    streamsToCleanupRef.current = [];
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupStreams();
    };
  }, []);

  const startRecording = async () => {
    setError('');
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
        },
        audio: true,
      });
      streamsToCleanupRef.current.push(displayStream);

      let finalStream = displayStream;

      if (withMic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamsToCleanupRef.current.push(micStream);

          const audioCtx = new AudioContext();
          audioCtxRef.current = audioCtx;
          const dest = audioCtx.createMediaStreamDestination();

          if (displayStream.getAudioTracks().length > 0) {
            const sysSource = audioCtx.createMediaStreamSource(displayStream);
            sysSource.connect(dest);
          }
          if (micStream.getAudioTracks().length > 0) {
            const micSource = audioCtx.createMediaStreamSource(micStream);
            micSource.connect(dest);
          }

          finalStream = new MediaStream([
            ...displayStream.getVideoTracks(),
            ...dest.stream.getAudioTracks(),
          ]);
        } catch (micErr) {
          console.warn('Microphone unavailable, continuing without mic:', micErr);
        }
      }

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = displayStream;
      }

      chunksRef.current = [];
      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(finalStream, { mimeType })
        : new MediaRecorder(finalStream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const usedMime = recorder.mimeType || 'video/webm';
        const ext = usedMime.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunksRef.current, { type: usedMime });

        if (blob.size > 0) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const file = new File([blob], `screen-recording-${timestamp}.${ext}`, {
            type: usedMime.split(';')[0] || 'video/webm',
          });
          onVideoChange(file);
        }

        setIsRecording(false);
        setIsPaused(false);
        cleanupStreams();
      };

      const [videoTrack] = displayStream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        };
      }

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setSeconds(0);
      setIsRecording(true);
      setIsPaused(false);

      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      cleanupStreams();
      if (err?.name === 'NotAllowedError') {
        setError(t('recorder.errNotAllowed'));
      } else {
        setError(t('recorder.errStartFailed', { error: err.message || 'Unknown error' }));
      }
    }
  };

  const togglePause = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } else if (rec.state === 'paused') {
      rec.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
  };

  const handleManualVideoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError(t('recorder.errInvalidVideo'));
      return;
    }
    setError('');
    onVideoChange(file);
    e.target.value = '';
  };

  return (
    <div className="card-surface p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Video className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{t('recorder.title')}</span>
          </h3>
          <p className="text-sm text-neutral-300 mt-1">{t('recorder.subtitle')}</p>
        </div>

        {!isRecording && !videoFile && isSupported && (
          <button
            type="button"
            onClick={() => setWithMic((v) => !v)}
            className={`self-start inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition shrink-0 ${
              withMic
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                : 'bg-neutral-800 border-neutral-700 text-neutral-200 hover:bg-neutral-700'
            }`}
          >
            {withMic ? <Mic className="w-4 h-4 text-emerald-300" /> : <MicOff className="w-4 h-4 text-neutral-400" />}
            <span>{withMic ? t('recorder.micOn') : t('recorder.micOff')}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-red-400/45 bg-red-500/15 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-300" />
          <span>{error}</span>
        </div>
      )}

      {/* Initial Controls */}
      {!isRecording && !videoFile && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {isSupported ? (
            <button
              type="button"
              onClick={startRecording}
              className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm px-5 py-3 shadow-md shadow-red-950/50 transition"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              <span>{t('recorder.startRecording')}</span>
            </button>
          ) : (
            <div className="text-sm text-amber-200 bg-amber-500/15 border border-amber-400/35 rounded-xl px-4 py-3">
              {t('recorder.unsupported')}
            </div>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary py-3"
          >
            <Upload className="w-4 h-4 text-neutral-300" />
            <span>{t('recorder.chooseFile')}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleManualVideoUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Active Recording State */}
      <div className={isRecording ? 'block' : 'hidden'}>
        <div className="relative rounded-xl overflow-hidden border-2 border-red-500/60 bg-black mb-4">
          <video
            ref={liveVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full max-h-80 object-contain bg-black"
          />
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-neutral-950/90 border border-red-400/50 px-3.5 py-1.5 text-xs font-bold text-red-200 backdrop-blur">
            <span className={`w-2.5 h-2.5 rounded-full bg-red-500 ${isPaused ? '' : 'animate-ping'}`} />
            <span>{isPaused ? t('recorder.pausedBadge') : t('recorder.recordingBadge')}</span>
            <span className="font-mono text-white ml-1">{formatDuration(seconds)}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-5 py-3 shadow-md shadow-emerald-950/50 transition"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>{t('recorder.stopAndAttach')}</span>
          </button>

          <button type="button" onClick={togglePause} className="btn-secondary py-3">
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            <span>{isPaused ? t('recorder.resume') : t('recorder.pause')}</span>
          </button>
        </div>
      </div>

      {/* Attached Video Preview */}
      {!isRecording && videoFile && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-emerald-500/15 border border-emerald-400/35 px-4 py-3">
            <div className="flex items-center gap-2.5 text-sm text-emerald-200 min-w-0">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <span className="truncate">
                {t('recorder.attachedVideo')}{' '}
                <strong className="font-semibold text-white">{videoFile.name}</strong> (
                {formatFileSize(videoFile.size)})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isSupported && (
                <button
                  type="button"
                  onClick={() => {
                    onVideoChange(null);
                    startRecording();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 px-3 py-1.5 text-xs font-semibold text-neutral-100 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('recorder.rerecord')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onVideoChange(null)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-400/45 px-3 py-1.5 text-xs font-semibold text-red-200 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('recorder.removeVideo')}</span>
              </button>
            </div>
          </div>

          {previewUrl && (
            <div className="rounded-xl overflow-hidden border border-neutral-700 bg-black">
              <video
                src={previewUrl}
                controls
                className="w-full max-h-96 object-contain bg-black"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

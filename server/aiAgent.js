import dotenv from 'dotenv';
import { ghFetch } from './github.js';

dotenv.config();

const LANGUAGE_NAMES = {
  pl: 'Polish (Polski)',
  en: 'English',
  es: 'Spanish (Español)',
  de: 'German (Deutsch)',
  fr: 'French (Français)',
  ar: 'Arabic (العربية)',
  zh: 'Simplified Chinese (简体中文)',
};

export function getConfiguredAiModels() {
  const raw = (
    process.env.AI_MODELS ||
    process.env.AI_MODEL ||
    'gpt-4o-mini,gpt-4o'
  ).trim();

  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const unique = [...new Set(ids)];
  return unique.map((id) => ({ id, label: id }));
}

export function getAiEndpointInfo() {
  const apiUrl = (
    process.env.AI_API_URL ||
    process.env.POLLINATIONS_API_URL ||
    'https://api.openai.com/v1/chat/completions'
  ).trim();

  const apiKey = (
    process.env.AI_API_KEY ||
    process.env.POLLINATIONS_API_KEY ||
    ''
  ).trim();

  return {
    apiUrl,
    hasApiKey: Boolean(apiKey),
    models: getConfiguredAiModels(),
  };
}

// In-memory LRU cache for GitHub git blobs by SHA (immutable content)
const blobCache = new Map();
const MAX_BLOB_CACHE = 400;

const IGNORED_PATH_PREFIXES = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  'out/',
  'coverage/',
  'vendor/',
  '.venv/',
  'venv/',
  '__pycache__/',
  '.idea/',
  '.vscode/',
  'target/',
  'bin/',
  'obj/',
];

const IGNORED_FILENAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'composer.lock',
  'cargo.lock',
  'poetry.lock',
  '.ds_store',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.bmp',
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.ogg',
  '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.sqlite', '.db',
  '.pyc', '.class', '.jar', '.map', '.min.js', '.min.css',
]);

function isAnalyzableSourceFile(filePath, size = 0) {
  const lower = filePath.toLowerCase();
  if (size > 180 * 1024) return false;
  for (const prefix of IGNORED_PATH_PREFIXES) {
    if (lower.startsWith(prefix) || lower.includes('/' + prefix)) return false;
  }
  const base = lower.split('/').pop() || '';
  if (IGNORED_FILENAMES.has(base)) return false;
  for (const ext of BINARY_EXTENSIONS) {
    if (lower.endsWith(ext)) return false;
  }
  return true;
}

export function stripThinkBlocks(text = '') {
  return String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^<think>[\s\S]*$/gi, '')
    .trim();
}

function extractJsonObject(rawText = '') {
  const cleaned = stripThinkBlocks(rawText);
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : cleaned;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  return null;
}

async function callChatCompletions({ model, messages, temperature = 0.2 }) {
  const apiUrl = (
    process.env.AI_API_URL ||
    process.env.POLLINATIONS_API_URL ||
    'https://api.openai.com/v1/chat/completions'
  ).trim();

  const apiKey = (
    process.env.AI_API_KEY ||
    process.env.POLLINATIONS_API_KEY ||
    ''
  ).trim();

  if (!apiUrl) {
    throw new Error('Missing AI_API_URL in .env configuration.');
  }

  const configuredModels = getConfiguredAiModels();
  const fallbackModel = configuredModels[0]?.id || 'gpt-4o-mini';
  const selectedModel = String(model || '').trim() || fallbackModel;

  const headers = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: selectedModel,
      messages,
      temperature,
    }),
  });

  const rawText = await res.text();
  let data = null;
  try {
    data = JSON.parse(rawText);
  } catch {}

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.error ||
      rawText.slice(0, 200) ||
      `AI endpoint error (${res.status})`;
    throw new Error(msg);
  }

  const content = data?.choices?.[0]?.message?.content || '';
  return {
    content: stripThinkBlocks(content),
    model: selectedModel,
  };
}

async function fetchRepoTree(repoFullName) {
  const repoInfo = await ghFetch(`/repos/${repoFullName}`);
  const defaultBranch = repoInfo.default_branch || 'main';
  const treeData = await ghFetch(
    `/repos/${repoFullName}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`
  );

  const files = (treeData.tree || [])
    .filter((item) => item.type === 'blob' && isAnalyzableSourceFile(item.path, item.size))
    .map((item) => ({
      path: item.path,
      sha: item.sha,
      size: item.size || 0,
    }));

  return { defaultBranch, files };
}

async function fetchBlobContent(repoFullName, fileEntry) {
  if (blobCache.has(fileEntry.sha)) {
    return blobCache.get(fileEntry.sha);
  }

  const blob = await ghFetch(`/repos/${repoFullName}/git/blobs/${fileEntry.sha}`);
  let content = '';
  if (blob?.encoding === 'base64' && blob.content) {
    content = Buffer.from(blob.content, 'base64').toString('utf8');
  } else if (typeof blob?.content === 'string') {
    content = blob.content;
  }

  if (content.includes('\u0000')) {
    content = '[Binary file — skipped]';
  }

  if (blobCache.size >= MAX_BLOB_CACHE) {
    const oldestKey = blobCache.keys().next().value;
    blobCache.delete(oldestKey);
  }
  blobCache.set(fileEntry.sha, content);
  return content;
}

function formatWithLineNumbers(content, maxChars = 14000) {
  const truncated =
    content.length > maxChars
      ? content.slice(0, maxChars) + '\n... [truncated]'
      : content;

  return truncated
    .split('\n')
    .map((line, idx) => `${idx + 1} | ${line}`)
    .join('\n');
}

async function fetchMultipleFiles(repoFullName, entries, concurrency = 6) {
  const results = new Map();
  let index = 0;

  async function worker() {
    while (index < entries.length) {
      const current = entries[index++];
      try {
        const text = await fetchBlobContent(repoFullName, current);
        results.set(current.path, text);
      } catch (err) {
        results.set(current.path, `[Read error: ${err.message}]`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, () => worker())
  );
  return results;
}

export async function runAgenticBugAnalysis({
  bug,
  project,
  comments = [],
  screenshots = [],
  model,
  language = 'en',
  onStep = () => {},
}) {
  const configuredModels = getConfiguredAiModels();
  const selectedModel = String(model || '').trim() || configuredModels[0]?.id || 'gpt-4o-mini';
  const targetLangName = LANGUAGE_NAMES[language] || LANGUAGE_NAMES.en;

  const bugSummaryBlock = [
    `Application / Project: ${project.name}`,
    project.url ? `Application URL: ${project.url}` : '',
    `Bug Title (#${bug.id}): ${bug.title}`,
    `Priority: ${bug.priority}`,
    `Current Status: ${bug.status}`,
    `Description:\n${bug.description || '(No additional text description)'}`,
    screenshots.length > 0
      ? `Attached screenshots (${screenshots.length}): ${screenshots.map((s) => s.original_name).join(', ')}`
      : '',
    bug.video_path ? `Attached screen recording video: ${bug.video_original_name || 'yes'}` : '',
    comments.length > 0
      ? `Comments:\n${comments
          .filter((c) => c.type === 'comment')
          .map((c) => `- ${c.user_name || 'User'}: ${c.content}`)
          .join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const repoFullName = (project.github_repo || '').trim();
  const analyzedFilesList = [];
  let codebaseContext = '';

  if (repoFullName) {
    onStep(`Connecting to GitHub repository: ${repoFullName}...`);
    const { defaultBranch, files } = await fetchRepoTree(repoFullName);
    const filesByPath = new Map(files.map((f) => [f.path, f]));

    onStep(
      `Indexed repository tree (${files.length} source files on branch "${defaultBranch}").`
    );

    const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

    if (files.length > 0 && files.length <= 28 && totalSize <= 95 * 1024) {
      onStep(`Fetching all ${files.length} source files for full analysis...`);
      const fetched = await fetchMultipleFiles(repoFullName, files);
      const chunks = [];
      for (const [fPath, content] of fetched.entries()) {
        analyzedFilesList.push(fPath);
        chunks.push(`=== FILE: ${fPath} ===\n${formatWithLineNumbers(content, 12000)}`);
      }
      codebaseContext = [
        `Full file contents in ${repoFullName} (branch ${defaultBranch}) — all ${files.length} files:`,
        '',
        ...chunks,
      ].join('\n\n');
    } else if (files.length > 0) {
      const treeListing = files
        .slice(0, 600)
        .map((f) => `- ${f.path} (${f.size} B)`)
        .join('\n');

      const readFilesMap = new Map();

      const manifestCandidates = [
        'package.json',
        'pyproject.toml',
        'requirements.txt',
        'Cargo.toml',
        'go.mod',
        'composer.json',
        'README.md',
      ]
        .map((p) => filesByPath.get(p))
        .filter(Boolean)
        .slice(0, 3);

      if (manifestCandidates.length > 0) {
        const initFetched = await fetchMultipleFiles(repoFullName, manifestCandidates);
        for (const [k, v] of initFetched.entries()) {
          readFilesMap.set(k, v);
          analyzedFilesList.push(k);
        }
      }

      const maxIterations = 3;
      for (let round = 1; round <= maxIterations; round++) {
        const prevReadCount = readFilesMap.size;
        onStep(
          `Agentic step ${round}/${maxIterations}: inspecting repository structure and selecting files...`
        );

        const alreadyReadSummary =
          readFilesMap.size > 0
            ? Array.from(readFilesMap.entries())
                .map(
                  ([p, c]) => `=== FILE: ${p} ===\n${formatWithLineNumbers(c, 9000)}`
                )
                .join('\n\n')
            : '(No files read yet)';

        const plannerPrompt = [
          'You are an autonomous software engineering agent analyzing a code repository to diagnose a bug.',
          'You have the full repository file tree and the files read so far.',
          '',
          '### REPORTED BUG:',
          bugSummaryBlock,
          '',
          `### ALL FILES IN REPOSITORY (${repoFullName}, total ${files.length}):`,
          treeListing,
          '',
          '### FILES READ SO FAR:',
          alreadyReadSummary,
          '',
          'Choose up to 10 unread files from the file tree that you need to inspect to locate the root cause.',
          'If you already have enough context to diagnose the exact root cause and fix, set "ready": true.',
          'Respond ONLY with valid JSON in this exact shape:',
          `{"ready": false, "files_to_read": ["path/file1.js"], "search_keywords": ["keyword1"], "thought": "short 1-sentence note in ${targetLangName}"}`,
        ].join('\n');

        const { content: planRaw } = await callChatCompletions({
          model: selectedModel,
          messages: [{ role: 'user', content: plannerPrompt }],
          temperature: 0.1,
        });

        const plan = extractJsonObject(planRaw);
        if (!plan) break;

        if (plan.thought) {
          onStep(`Agent: ${String(plan.thought).slice(0, 140)}`);
        }

        if (plan.ready === true && readFilesMap.size >= 2) {
          break;
        }

        const requestedPaths = Array.isArray(plan.files_to_read)
          ? plan.files_to_read
          : [];

        const toFetchEntries = [];
        for (const reqPath of requestedPaths) {
          const clean = String(reqPath || '').replace(/^\/+/, '').trim();
          const entry =
            filesByPath.get(clean) ||
            files.find((f) => f.path.toLowerCase() === clean.toLowerCase());
          if (entry && !readFilesMap.has(entry.path) && toFetchEntries.length < 10) {
            toFetchEntries.push(entry);
          }
        }

        const keywords = Array.isArray(plan.search_keywords)
          ? plan.search_keywords.map((k) => String(k || '').trim().toLowerCase()).filter((k) => k.length >= 3)
          : [];

        if (keywords.length > 0 && toFetchEntries.length < 10) {
          const unreadCandidates = files
            .filter((f) => !readFilesMap.has(f.path) && !toFetchEntries.includes(f) && f.size < 60000)
            .slice(0, 50);

          if (unreadCandidates.length > 0) {
            onStep(`Searching repository for keywords: ${keywords.join(', ')}...`);
            const scanned = await fetchMultipleFiles(repoFullName, unreadCandidates);
            for (const [p, text] of scanned.entries()) {
              const lowerText = text.toLowerCase();
              if (keywords.some((kw) => lowerText.includes(kw))) {
                readFilesMap.set(p, text);
                analyzedFilesList.push(p);
                if (readFilesMap.size >= 26) break;
              }
            }
          }
        }

        if (toFetchEntries.length > 0) {
          onStep(
            `Reading files (${toFetchEntries.length}): ${toFetchEntries
              .map((e) => e.path.split('/').pop())
              .join(', ')}...`
          );
          const newlyFetched = await fetchMultipleFiles(repoFullName, toFetchEntries);
          for (const [p, text] of newlyFetched.entries()) {
            readFilesMap.set(p, text);
            analyzedFilesList.push(p);
          }
        } else if (keywords.length === 0) {
          break;
        }

        if (readFilesMap.size === prevReadCount || readFilesMap.size >= 26) break;
      }

      if (readFilesMap.size === 0) {
        const fallbackEntries = files.slice(0, 12);
        const fallbackFetched = await fetchMultipleFiles(repoFullName, fallbackEntries);
        for (const [p, text] of fallbackFetched.entries()) {
          readFilesMap.set(p, text);
          analyzedFilesList.push(p);
        }
      }

      codebaseContext = [
        `Repository file tree in ${repoFullName} (branch ${defaultBranch}):`,
        treeListing,
        '',
        `Inspected source files (${readFilesMap.size} files):`,
        ...Array.from(readFilesMap.entries()).map(
          ([p, c]) => `=== FILE: ${p} ===\n${formatWithLineNumbers(c, 10000)}`
        ),
      ].join('\n\n');
    }
  } else {
    onStep(
      'No GitHub repository linked to this application — analyzing based on bug description and comments...'
    );
  }

  onStep(`Generating diagnosis and fix suggestion (${selectedModel})...`);

  const finalSystemPrompt = [
    'You are a Senior Staff Software Engineer and debugging expert.',
    `Write your ENTIRE response in ${targetLangName}, using clean Markdown formatting.`,
    'Analyze the reported bug and the repository source code to produce a concrete, actionable fix proposal for developers.',
    '',
    'Use this 4-section Markdown structure (translate headings to the target language):',
    '### 1. Diagnosis & Root Cause',
    '### 2. Code Location (exact file paths and line numbers)',
    '### 3. Proposed Fix (step-by-step with code blocks)',
    '### 4. Verification Steps',
  ].join('\n');

  const finalUserPrompt = [
    '### BUG REPORT:',
    bugSummaryBlock,
    '',
    codebaseContext
      ? `### REPOSITORY SOURCE CODE (${repoFullName}):\n\n${codebaseContext}`
      : 'Note: No GitHub repository is linked to this project yet, so base your suggestion on the report details.',
  ].join('\n');

  const { content: suggestion } = await callChatCompletions({
    model: selectedModel,
    messages: [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: finalUserPrompt },
    ],
    temperature: 0.2,
  });

  if (!suggestion) {
    throw new Error('AI model returned an empty response. Try again or pick another model.');
  }

  return {
    suggestion,
    model: selectedModel,
    analyzedFiles: [...new Set(analyzedFilesList)],
  };
}

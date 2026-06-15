import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

export function normalizeAuthorizationToken(token) {
  const trimmedToken = String(token || '').trim();
  return /^Bearer\s+/i.test(trimmedToken) ? trimmedToken : `Bearer ${trimmedToken}`;
}

export function resolveApiUrl(apiUrl, id) {
  if (String(apiUrl || '').includes('{id}')) {
    return new URL(String(apiUrl).replaceAll('{id}', encodeURIComponent(id)));
  }

  const url = new URL(String(apiUrl));
  const pathSegments = url.pathname.split('/');
  const idSegmentIndex = pathSegments.findIndex((segment) => segment === 'id');

  if (idSegmentIndex >= 0) {
    pathSegments[idSegmentIndex] = encodeURIComponent(id);
    url.pathname = pathSegments.join('/');
    return url;
  }

  url.searchParams.set('id', id);
  return url;
}

export async function fetchELearningResult({ apiUrl, id, token }) {
  if (!apiUrl) {
    return null;
  }

  const url = resolveApiUrl(apiUrl, id);

  const response = await fetch(url, {
    headers: {
      Authorization: normalizeAuthorizationToken(token),
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`E-learning API tra ve HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export function buildCmsAssetUrl(assetId) {
  const id = String(assetId ?? '').trim();
  return id ? `https://cms.youpass.vn/assets/${encodeURIComponent(id)}` : '';
}

export function guessExtensionFromMimeType(mimeType = '', fallback = 'bin') {
  const value = String(mimeType || '').toLowerCase();
  if (!value) {
    return fallback;
  }

  if (value.includes('image/png')) return 'png';
  if (value.includes('image/jpeg') || value.includes('image/jpg')) return 'jpg';
  if (value.includes('image/gif')) return 'gif';
  if (value.includes('image/webp')) return 'webp';
  if (value.includes('audio/mpeg') || value.includes('audio/mp3')) return 'mp3';
  if (value.includes('audio/mp4') || value.includes('audio/m4a')) return 'm4a';
  if (value.includes('audio/wav') || value.includes('audio/x-wav')) return 'wav';
  if (value.includes('audio/ogg')) return 'ogg';
  if (value.includes('audio/aac')) return 'aac';
  if (value.includes('application/pdf')) return 'pdf';
  return fallback;
}

export async function fetchBinaryAsset(assetUrl) {
  const url = String(assetUrl ?? '').trim();
  if (!url) {
    return null;
  }

  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    contentType,
    ext: guessExtensionFromMimeType(contentType)
  };
}

function ensureLogDir(filePath) {
  const directory = String(filePath || '').split('/').slice(0, -1).join('/');
  if (!directory) {
    return;
  }

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

export function resetTextLogFile(filePath, enableFileLogs = true) {
  if (!enableFileLogs) {
    return '';
  }

  try {
    ensureLogDir(filePath);
    writeFileSync(filePath, '', 'utf8');
    return filePath;
  } catch {
    return '';
  }
}

export function appendJsonLogLine(record, filePath, enableFileLogs = true) {
  if (!enableFileLogs) {
    return '';
  }

  try {
    ensureLogDir(filePath);
    appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
    return filePath;
  } catch {
    return '';
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function normalizeSkillValue(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return '';
  if (text === 'writing' || text === 'reading' || text === 'listening' || text === 'speaking') {
    return text;
  }
  return '';
}

export function extractQuizListItems(payload) {
  const candidates = [
    payload?.data?.items,
    payload?.data?.results,
    payload?.data?.rows,
    payload?.data?.quizzes,
    payload?.data?.data,
    payload?.items,
    payload?.results,
    payload?.rows,
    payload?.quizzes,
    payload?.data,
    payload
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

export function extractQuizListTotal(payload) {
  const candidates = [
    payload?.data?.total,
    payload?.data?.meta?.total,
    payload?.data?.pagination?.total,
    payload?.meta?.total,
    payload?.pagination?.total,
    payload?.total,
    payload?.count
  ];

  for (const candidate of candidates) {
    const total = Number(candidate);
    if (Number.isFinite(total) && total >= 0) {
      return total;
    }
  }

  return null;
}

export function extractMockTestGroupId(item) {
  return String(item?.id ?? item?.mock_test_id ?? item?.mockTestId ?? item?.quiz_id ?? item?.quizId ?? '').trim();
}

export function extractMockTestEntries(item, skill) {
  if (normalizeSkillValue(skill) === 'writing') {
    return [item];
  }

  const mockTests = Array.isArray(item?.mock_tests) ? item.mock_tests : [];
  return mockTests.length > 0 ? mockTests : [item];
}

export function extractMockTestFinalId(detailPayload) {
  const candidates = [
    detailPayload?.data?.quizzes?.full?.id,
    detailPayload?.data?.quizzes?.full?.quiz_id,
    detailPayload?.data?.quizzes?.full?.quizId,
    detailPayload?.data?.quiz?.id,
    detailPayload?.data?.quiz?.quiz_id,
    detailPayload?.data?.quiz?.quizId,
    detailPayload?.data?.id,
    detailPayload?.data?.quiz_id,
    detailPayload?.data?.quizId
  ];

  for (const candidate of candidates) {
    const id = String(candidate ?? '').trim();
    if (id) return id;
  }

  return '';
}

export function buildFixedBulkListUrl(params = {}, baseUrl = 'https://api.youpass.vn/v1/quizzes', allowedKeys = []) {
  const url = new URL(baseUrl);

  const defaults = {
    status: 'published',
    is_test: 'true',
    isLogin: 'true',
    sort: 'practice_listing_priority.desc,date_created.desc'
  };

  if (baseUrl.includes('/v1/quizzes')) {
    Object.entries(defaults).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  for (const key of allowedKeys.length > 0 ? allowedKeys : Object.keys(params)) {
    const value = String(params[key] ?? '').trim();
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  if (baseUrl.includes('/v1/mock-test')) {
    url.searchParams.set('sort', 'priority.desc');
  }

  return url.toString();
}

export function buildMockTestDetailUrl(id) {
  return `https://api.youpass.vn/v1/mock-test/${encodeURIComponent(String(id ?? '').trim())}`;
}

export function sanitizeFileNamePart(value) {
  return String(value ?? '')
    .replaceAll(/[\\/:*?"<>|]+/g, '_')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export async function fetchQuizList({ listUrl, token, normalizeAuthorizationToken }) {
  const response = await fetch(listUrl, {
    headers: {
      Authorization: normalizeAuthorizationToken(token),
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Danh sach quiz tra ve HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Danh sach quiz khong tra ve JSON');
  }

  return response.json();
}

export async function fetchMockTestDetail({ id, token, normalizeAuthorizationToken }) {
  const response = await fetch(buildMockTestDetailUrl(id), {
    headers: {
      Authorization: normalizeAuthorizationToken(token),
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Mock test detail tra ve HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Mock test detail khong tra ve JSON');
  }

  return response.json();
}

export function getBulkApiConfig(skill) {
  const normalizedSkill = normalizeSkillValue(skill);
  if (normalizedSkill === 'writing') {
    return {
      baseUrl: 'https://api.youpass.vn/v1/quizzes',
      allowedKeys: ['page_size', 'page', 'types', 'quiz_types', 'writing_task_type', 'submitted_status'],
      params: {
        status: 'published',
        is_test: 'true',
        isLogin: 'true',
        sort: 'practice_listing_priority.desc,date_created.desc'
      }
    };
  }

  const skillIdMap = {
    reading: '1',
    listening: '2',
    speaking: '8'
  };

  return {
    baseUrl: 'https://api.youpass.vn/v1/mock-test',
    allowedKeys: ['page_size', 'page', 'skill_id'],
    params: {
      skill_id: skillIdMap[normalizedSkill] || '1',
      sort: 'priority.desc'
    }
  };
}

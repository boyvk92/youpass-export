import {
  buildFixedBulkListUrl,
  buildCmsAssetUrl,
  extractMockTestEntries,
  extractMockTestFinalId,
  extractMockTestGroupId,
  extractQuizListItems,
  extractQuizListTotal,
  fetchMockTestDetail,
  fetchQuizList,
  fetchBinaryAsset,
  fetchELearningResult,
  resetTextLogFile,
  appendJsonLogLine,
  getBulkApiConfig,
  normalizeSkillValue,
  normalizeAuthorizationToken,
  sanitizeFileNamePart,
  resolveSkillApiUrl
} from './helper.js';
import { buildListeningVocabJsonEntries, normalizeListeningExportResult } from '../skill/listening.js';
import { buildSpeakingZipFiles } from './speaking-export.js';

function buildBulkFolderPath(title = '') {
  const segments = String(title ?? '')
    .replace(/^\s*\d+\s*[-–—]\s*/, '')
    .split(/\s+[–—-]\s+/)
    .map((segment) => sanitizeFileNamePart(segment))
    .filter(Boolean);

  if (segments.length <= 1) {
    return '';
  }

  return segments.join('/');
}

function splitListeningTitlePath(title = '') {
  const cleaned = String(title ?? '').trim().replace(/^\s*\d+\s*[-–—]\s*/, '');
  if (!cleaned) {
    return [];
  }

  return cleaned
    .split(/\s*[-–—]\s*/)
    .map((segment) => sanitizeFileNamePart(segment))
    .filter(Boolean);
}

function buildListeningBaseName(id, title = '') {
  return sanitizeFileNamePart(`${id} - ${title}`) || `quiz-${id}`;
}

function buildListeningPartFolderPath(titlePath, partIndex) {
  const path = String(titlePath || '').trim();
  const passFolder = `Pass ${partIndex + 1}`;
  return [path, passFolder].filter(Boolean).join('/');
}

function buildBulkDocxFileName({ id, partTitle = '', partIndex = 0 }) {
  const normalizedPartTitle = String(partTitle ?? '').trim();
  const passLabel = partIndex + 1;
  return `${sanitizeFileNamePart(`${id}-${passLabel}-${normalizedPartTitle || `Passage ${passLabel}`}`) || `quiz-${id}`}.docx`;
}

async function addListeningZipEntries(zip, { id, title, createDocx, result, quizTypeOverride, noAudio = false }) {
  const baseName = buildListeningBaseName(id, title);
  const titlePath = splitListeningTitlePath(title).join('/');
  const parts = Array.isArray(result?.data?.parts) && result.data.parts.length > 0
    ? result.data.parts
    : (Array.isArray(result?.data?.part) && result.data.part.length > 0 ? result.data.part : [null]);

  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex];
    const resultForDoc = part
      ? {
        ...result,
        data: {
          ...result.data,
          part: [part],
          parts: [part]
        }
      }
      : result;
    const docx = await createDocx({ id, result: resultForDoc, quizTypeOverride });
    const fileId = String(part?.file_id || part?.part?.file_id || result?.data?.file_id || '').trim();
    const folderPath = buildListeningPartFolderPath(titlePath, partIndex);
    const folder = zip.folder(folderPath);
    folder.file(`${baseName}.docx`, docx);
    folder.file(`Pass ${partIndex + 1}.json`, Buffer.from(JSON.stringify(buildListeningVocabJsonEntries(part?.vocabs), null, 2), 'utf8'));

    if (!noAudio && fileId) {
      const audioAsset = await fetchBinaryAsset(buildCmsAssetUrl(fileId));
      const audioExt = audioAsset?.ext || 'mp3';
      if (audioAsset?.buffer) {
        folder.file(`Pass ${partIndex + 1}.${audioExt}`, audioAsset.buffer);
      }
    }
  }
}

async function addSpeakingZipEntries(zip, { id, title, createDocx, result, quizTypeOverride, folderPrefix = '', nestPassFolders = true, noAudio = false }) {
  const files = await buildSpeakingZipFiles({ id, title, createDocx, result, quizTypeOverride, folderPrefix, nestPassFolders, noAudio });
  files.forEach((file) => {
    zip.file(file.name, file.data);
  });
}

export function createExportMultiCore(deps) {
  const {
    htmlToText,
    createDocx,
    apiUrl,
    buildCleanExportRecord,
    enableFileLogs = true,
    exportLogFile = 'logs/e-learning-export-log.log',
    renderLogFile = 'logs/e-learning-render-docx.log',
    questionTypesLogFile = 'logs/e-learning-question-types.log',
    unknownQuestionTypesLogFile = 'logs/e-learning-question-types-unknown.log'
  } = deps;

  async function buildBulkZip({ fixedParams = {}, skill, token }) {
    const createFolders = Boolean(fixedParams?.create_folders);
    const noAudio = Boolean(fixedParams?.no_audio);
    const isListening = normalizeSkillValue(skill) === 'listening';
    const isSpeaking = normalizeSkillValue(skill) === 'speaking';
    const skillApiUrl = resolveSkillApiUrl(apiUrl, skill);
    const JSZipClass = (await import('jszip')).default;
    const zip = new JSZipClass();
    const errors = [];
    const seenIds = new Set();
    let addedCount = 0;
    let currentPage = 1;
    const safePageSize = 20;
    const apiConfig = getBulkApiConfig(skill);
    const quizTypeOverride = normalizeSkillValue(skill);
    let total = null;
    let fetchedCount = 0;
    const buildSpeakingFolderPrefix = (id, title) => {
      if (!createFolders) {
        return '';
      }

      return sanitizeFileNamePart(title) || sanitizeFileNamePart(`${id} - ${title}`) || `quiz-${id}`;
    };

    resetTextLogFile(exportLogFile, enableFileLogs);
    resetTextLogFile(renderLogFile, enableFileLogs);
    resetTextLogFile(questionTypesLogFile, enableFileLogs);
    resetTextLogFile(unknownQuestionTypesLogFile, enableFileLogs);

    while (total === null || fetchedCount < total) {
      const listUrl = buildFixedBulkListUrl({
        ...apiConfig.params,
        ...fixedParams,
        page_size: safePageSize,
        page: currentPage
      }, apiConfig.baseUrl, apiConfig.allowedKeys);

      const listResult = await fetchQuizList({ listUrl, token, normalizeAuthorizationToken });
      const items = extractQuizListItems(listResult);

      if (total === null) {
        total = extractQuizListTotal(listResult);
      }

      if (items.length === 0) {
        break;
      }

      for (const item of items) {
        const isWriting = normalizeSkillValue(skill) === 'writing';
        if (!isWriting) {
          const entries = extractMockTestEntries(item, skill);
          for (const entry of entries) {
            const seedId = extractMockTestGroupId(entry);
            if (!seedId) {
              continue;
            }

            try {
              const detailResult = await fetchMockTestDetail({ id: seedId, token, normalizeAuthorizationToken });
              const finalId = extractMockTestFinalId(detailResult);
              const exportId = String(finalId || '').trim();
              if (!exportId) {
                errors.push(`${seedId}: khong tim thay data.quizzes.full.id`);
                continue;
              }

              if (seenIds.has(exportId)) {
                continue;
              }

              seenIds.add(exportId);
              const result = await fetchELearningResult({ apiUrl: skillApiUrl, id: exportId, token });
              const exportResult = isListening ? normalizeListeningExportResult(result) : result;
              const title = htmlToText(exportResult?.data?.title || entry?.title || item?.title || `quiz-${exportId}`);
              if (isSpeaking) {
                if (typeof buildCleanExportRecord === 'function') {
                  appendJsonLogLine(buildCleanExportRecord({ id: exportId, result, quizTypeOverride }), exportLogFile, enableFileLogs);
                }
                await addSpeakingZipEntries(zip, {
                  id: exportId,
                  title,
                  createDocx,
                  result,
                  quizTypeOverride,
                  folderPrefix: buildSpeakingFolderPrefix(exportId, title),
                  nestPassFolders: true,
                  noAudio
                });
                addedCount += 1;
                continue;
              }
              if (isListening) {
                if (typeof buildCleanExportRecord === 'function') {
                  appendJsonLogLine(buildCleanExportRecord({ id: exportId, result: exportResult, quizTypeOverride }), exportLogFile, enableFileLogs);
                }
                await addListeningZipEntries(zip, { id: exportId, title, createDocx, result: exportResult, quizTypeOverride, noAudio });
                addedCount += 1;
                continue;
              }

              const folderPath = createFolders && normalizeSkillValue(skill) === 'reading'
                ? buildBulkFolderPath(title)
                : '';
              const readingParts = normalizeSkillValue(skill) === 'reading' && Array.isArray(result?.data?.parts) && result.data.parts.length > 0
                ? result.data.parts
                : [null];
              if (typeof buildCleanExportRecord === 'function') {
                appendJsonLogLine(buildCleanExportRecord({ id: exportId, result, quizTypeOverride }), exportLogFile, enableFileLogs);
              }
              for (let partIndex = 0; partIndex < readingParts.length; partIndex += 1) {
                const part = readingParts[partIndex];
                const partTitle = part ? htmlToText(part.title || part.question_group_title || part.passage_title || `Passage ${partIndex + 1}`) : '';
                const resultForDoc = part
                  ? {
                    ...result,
                    data: {
                      ...result.data,
                      part: [part],
                      parts: [part]
                    }
                  }
                  : result;
                const docx = await createDocx({ id: exportId, result: resultForDoc, quizTypeOverride });
                const fileName = buildBulkDocxFileName({
                  id: exportId,
                  partTitle,
                  partIndex
                });

                if (folderPath) {
                  zip.folder(folderPath).file(fileName, docx);
                } else {
                  zip.file(fileName, docx);
                }
                addedCount += 1;
              }
            } catch (error) {
              errors.push(`${seedId}: ${error.message}`);
            }
          }
          continue;
        }

        const id = String(item?.id ?? item?.quiz_id ?? item?.quizId ?? '').trim();
        if (!id || seenIds.has(id)) {
          continue;
        }

        seenIds.add(id);

        try {
          const result = await fetchELearningResult({ apiUrl: skillApiUrl, id, token });
          const exportResult = isListening ? normalizeListeningExportResult(result) : result;
          const title = htmlToText(exportResult?.data?.title || item?.title || `quiz-${id}`);
          if (isSpeaking) {
            if (typeof buildCleanExportRecord === 'function') {
              appendJsonLogLine(buildCleanExportRecord({ id, result, quizTypeOverride }), exportLogFile, enableFileLogs);
            }
            await addSpeakingZipEntries(zip, {
              id,
              title,
              createDocx,
              result,
              quizTypeOverride,
              folderPrefix: buildSpeakingFolderPrefix(id, title),
              nestPassFolders: true,
              noAudio
            });
            addedCount += 1;
            continue;
          }
          if (isListening) {
            if (typeof buildCleanExportRecord === 'function') {
              appendJsonLogLine(buildCleanExportRecord({ id, result: exportResult, quizTypeOverride }), exportLogFile, enableFileLogs);
            }
            await addListeningZipEntries(zip, { id, title, createDocx, result: exportResult, quizTypeOverride, noAudio });
            addedCount += 1;
            continue;
          }

          const folderPath = createFolders && normalizeSkillValue(skill) === 'reading'
            ? buildBulkFolderPath(title)
            : '';
          const readingParts = normalizeSkillValue(skill) === 'reading' && Array.isArray(result?.data?.parts) && result.data.parts.length > 0
            ? result.data.parts
            : [null];
          if (typeof buildCleanExportRecord === 'function') {
            appendJsonLogLine(buildCleanExportRecord({ id, result, quizTypeOverride }), exportLogFile, enableFileLogs);
          }
          for (let partIndex = 0; partIndex < readingParts.length; partIndex += 1) {
            const part = readingParts[partIndex];
            const partTitle = part ? htmlToText(part.title || part.question_group_title || part.passage_title || `Passage ${partIndex + 1}`) : '';
            const resultForDoc = part
              ? {
                ...result,
                data: {
                  ...result.data,
                  part: [part],
                  parts: [part]
                }
              }
              : result;
            const docx = await createDocx({ id, result: resultForDoc, quizTypeOverride });
            const fileName = buildBulkDocxFileName({
              id,
              partTitle,
              partIndex
            });

            if (folderPath) {
              zip.folder(folderPath).file(fileName, docx);
            } else {
              zip.file(fileName, docx);
            }
            addedCount += 1;
          }
        } catch (error) {
          errors.push(`${id}: ${error.message}`);
        }
      }

      fetchedCount += items.length;

      if (total !== null && fetchedCount >= total) {
        break;
      }

      currentPage += 1;
    }

    if (addedCount === 0) {
      throw new Error('Khong tao duoc file DOCX nao tu danh sach quiz');
    }

    if (errors.length > 0) {
      zip.file('errors.txt', errors.join('\n'));
    }

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  return {
    buildBulkZip
  };
}

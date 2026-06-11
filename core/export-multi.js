import {
  buildFixedBulkListUrl,
  extractMockTestEntries,
  extractMockTestFinalId,
  extractMockTestGroupId,
  extractQuizListItems,
  extractQuizListTotal,
  fetchMockTestDetail,
  fetchQuizList,
  fetchELearningResult,
  getBulkApiConfig,
  normalizeSkillValue,
  normalizeAuthorizationToken,
  sanitizeFileNamePart
} from './helper.js';

export function createExportMultiCore(deps) {
  const {
    htmlToText,
    createDocx,
    apiUrl
  } = deps;

  async function buildBulkZip({ fixedParams = {}, skill, token }) {
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
              const exportId = finalId || seedId;
              if (!exportId || seenIds.has(exportId)) {
                continue;
              }

              seenIds.add(exportId);
              const result = await fetchELearningResult({ apiUrl, id: exportId, token });
              const title = htmlToText(result?.data?.title || entry?.title || item?.title || `quiz-${exportId}`);
              const docx = await createDocx({ id: exportId, result, quizTypeOverride });
              const fileName = `${sanitizeFileNamePart(`${exportId} - ${title}`) || `quiz-${exportId}`}.docx`;

              zip.file(fileName, docx);
              addedCount += 1;
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
          const result = await fetchELearningResult({ apiUrl, id, token });
          const title = htmlToText(result?.data?.title || item?.title || `quiz-${id}`);
          const docx = await createDocx({ id, result, quizTypeOverride });
          const fileName = `${sanitizeFileNamePart(`${id} - ${title}`) || `quiz-${id}`}.docx`;

          zip.file(fileName, docx);
          addedCount += 1;
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

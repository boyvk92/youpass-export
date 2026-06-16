import { buildCoverPageLines } from '../cover-page.js';
import { createDocxCore, buildImageRegistry, coverTitleParagraph, coverSubjectParagraph, coverCodeParagraph, pageBreakParagraph, heading, questionGroup, questionDescriptionHtml, questionTitle, questionTextParagraph, questionAnswerParagraph, questionTitleWithAnswer, questionTitleWithAnswerOnly, questionTitleWithTrailingAnswer, questionTitleWithHtml, readingTestTitle, passageLabel, passageTitle, passageParagraph, extractImageOnlyHtml, htmlToDocxParagraphs, questionKeywordsBlock, questionExplanationBlock, answerParagraph, choiceParagraph, questionInfoParagraph, paragraph, formatResult, appendDocxRenderLog, appendQuestionTypeLog, summarizeQuestionTypes, summarizeUnknownQuestionTypes, createZip } from '../skill/common.js';
import { createReadingCore, extractYouPassParts, splitPassageContent, getPartQuestions, isFillInTheBlankQuestion, getQuestionRawTypeKey, extractMarkedAnswers, pushQuestionGroupLines, addExplanationLines, getChoiceAnswer, getDirectAnswer, formatOptionText, labelIndexedOptions, pushSharedOptions, formatAreaOfInformation, extractQuestionKeywords, getQuestionTypeLabel, getQuestionRawTypeText, normalizeTypeKey, formatSingleChoiceRadio, formatMultipleChoiceManyOptions, formatSelectionQuestion, formatChoiceOptions, formatSharedOptions, getQuestionOrderRange, collectQuestionAnswerTokens, collectQuestionChoiceTextMap, collectGroupChoiceTextMap, buildExplanationMap } from '../skill/reading.js';
import { buildListeningPassageBlocks, buildListeningQuestionInfoText, buildListeningVocabJsonEntries, normalizeListeningExportResult } from '../skill/listening.js';
import { buildSpeakingZipFiles } from './speaking-export.js';
import { buildCmsAssetUrl, fetchBinaryAsset, fetchELearningResult, resetTextLogFile, appendJsonLogLine, sanitizeFileNamePart, normalizeSkillValue, resolveSkillApiUrl } from './helper.js';

function extractQuizInfo(source) {
  const value = String(source ?? '').trim();
  if (!value) {
    return { id: '', skill: '' };
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/\/practice\/([^/]+)\/(\d+)/i);
      if (match) {
        return {
          skill: String(match[1] || '').trim().toLowerCase(),
          id: String(match[2] || '').trim()
        };
      }
    } catch {
      return { id: value, skill: '' };
    }
  }

  return { id: value, skill: '' };
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

function buildListeningBaseName(id, title) {
  return sanitizeFileNamePart(`${id} - ${title}`) || `quiz-${id}`;
}

function buildListeningPartFolderPath(basePath, partIndex) {
  const passFolder = `Pass ${partIndex + 1}`;
  return [basePath, passFolder].filter(Boolean).join('/');
}

async function buildListeningZip({ id, title, createDocx, result, quizTypeOverride }) {
  const baseName = buildListeningBaseName(id, title);
  const titlePath = splitListeningTitlePath(title);
  const parts = Array.isArray(result?.data?.parts) && result.data.parts.length > 0
    ? result.data.parts
    : (Array.isArray(result?.data?.part) && result.data.part.length > 0 ? result.data.part : [null]);
  const files = [];

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
    const audioAsset = fileId ? await fetchBinaryAsset(buildCmsAssetUrl(fileId)) : null;
    const audioExt = audioAsset?.ext || 'mp3';
    const passFolder = buildListeningPartFolderPath(titlePath.join('/'), partIndex);
    const passFileName = `${baseName}.docx`;

    files.push({
      name: `${passFolder}/${passFileName}`,
      data: docx
    });

    files.push({
      name: `${passFolder}/Pass ${partIndex + 1}.json`,
      data: Buffer.from(JSON.stringify(buildListeningVocabJsonEntries(part?.vocabs), null, 2), 'utf8')
    });

    if (audioAsset?.buffer) {
      files.push({
        name: `${passFolder}/Pass ${partIndex + 1}.${audioExt}`,
        data: audioAsset.buffer
      });
    }
  }

  return createZip(files);
}

async function buildSpeakingZip({ id, title, createDocx, result, quizTypeOverride }) {
  return createZip(await buildSpeakingZipFiles({
    id,
    title,
    createDocx,
    result,
    quizTypeOverride,
    folderPrefix: title,
    nestPassFolders: true
  }));
}

export function createExportDocsCore(deps) {
  const {
    collectBody,
    send,
    contentTypes,
    renderForm,
    apiUrl,
    enableFileLogs = true,
    exportLogFile = 'logs/e-learning-export-log.log',
    renderLogFile = 'logs/e-learning-render-docx.log',
    questionTypesLogFile = 'logs/e-learning-question-types.log',
    unknownQuestionTypesLogFile = 'logs/e-learning-question-types-unknown.log'
  } = deps;

  const readingCore = createReadingCore({
    buildPassageBlocks: (part, data, quizTypeKey) => (quizTypeKey === 'listening' ? buildListeningPassageBlocks(part?.vocabs) : []),
    buildQuestionInfoText: (question, context = {}, rowIndex = 0) => {
      const part = context?.part || {};
      return buildListeningQuestionInfoText(question, part?.vocabs, rowIndex);
    },
    extractYouPassParts,
    splitPassageContent,
    getPartQuestions,
    isFillInTheBlankQuestion,
    getQuestionRawTypeKey,
    extractMarkedAnswers,
    pushQuestionGroupLines,
    addExplanationLines,
    getChoiceAnswer,
    getDirectAnswer,
    formatOptionText,
    labelIndexedOptions,
    pushSharedOptions,
    buildExplanationMap,
    formatAreaOfInformation,
    extractQuestionKeywords,
    getQuestionTypeLabel,
    getQuestionRawTypeText,
    normalizeTypeKey,
    formatSingleChoiceRadio,
    formatMultipleChoiceManyOptions,
    formatSelectionQuestion,
    formatChoiceOptions,
    formatSharedOptions,
    getQuestionOrderRange,
    collectQuestionAnswerTokens,
    collectQuestionChoiceTextMap,
    collectGroupChoiceTextMap
  });
  const docxCore = createDocxCore({
    buildCoverPageLines,
    buildImageRegistry,
    coverTitleParagraph,
    coverSubjectParagraph,
    coverCodeParagraph,
    pageBreakParagraph,
    heading,
    questionGroup,
    questionDescriptionHtml,
    questionTitle,
    questionTitleWithHtml,
    questionTextParagraph,
    questionAnswerParagraph,
    questionTitleWithAnswer,
    questionTitleWithAnswerOnly,
    questionTitleWithTrailingAnswer,
    readingTestTitle,
    passageLabel,
    passageTitle,
    passageParagraph,
    extractImageOnlyHtml,
    htmlToDocxParagraphs,
    questionKeywordsBlock,
    questionExplanationBlock,
    answerParagraph,
    choiceParagraph,
    questionInfoParagraph,
    paragraph,
    formatResult,
    appendDocxRenderLog,
    appendQuestionTypeLog,
    summarizeQuestionTypes,
    summarizeUnknownQuestionTypes,
    questionTypesLogFile,
    unknownQuestionTypesLogFile,
    createZip,
    formatYouPassResult: readingCore.formatYouPassResult
  });

  async function handleExportRequest(request, response) {
    const requestUrl = new URL(request.url || '/', 'http://localhost');

    try {
      if (request.method !== 'POST' || requestUrl.pathname !== '/export') {
        return false;
      }

      const body = await collectBody(request);
      const form = new URLSearchParams(body);
      const source = String(form.get('source') || '').trim();
      const id = String(form.get('id') || '').trim();
      const skill = String(form.get('skill') || '').trim();
      const token = String(form.get('token') || '').trim();
      const sourceInfo = extractQuizInfo(source);
      const resolvedId = sourceInfo.id || id;
      const resolvedSkill = sourceInfo.skill || skill;

      if (!resolvedId || !resolvedSkill || !token) {
        send(response, 400, renderForm('Vui long nhap day du ID/URL, ky nang va token.'), contentTypes.html);
        return true;
      }

      resetTextLogFile(exportLogFile, enableFileLogs);
      resetTextLogFile(renderLogFile, enableFileLogs);
      resetTextLogFile(questionTypesLogFile, enableFileLogs);
      resetTextLogFile(unknownQuestionTypesLogFile, enableFileLogs);

      const isListening = normalizeSkillValue(resolvedSkill) === 'listening';
      const isSpeaking = normalizeSkillValue(resolvedSkill) === 'speaking';
      const result = await fetchELearningResult({ apiUrl: resolveSkillApiUrl(apiUrl, resolvedSkill), id: resolvedId, token });
      const exportResult = isListening ? normalizeListeningExportResult(result) : result;
      appendJsonLogLine(readingCore.buildCleanExportRecord({ id: resolvedId, result: exportResult, quizTypeOverride: resolvedSkill }), exportLogFile, enableFileLogs);
      if (isListening) {
        const title = String(exportResult?.data?.title || `quiz-${resolvedId}`).trim();
        const zip = await buildListeningZip({ id: resolvedId, title, createDocx: docxCore.createDocx, result: exportResult, quizTypeOverride: resolvedSkill });
        const fileName = `${buildListeningBaseName(resolvedId, title)}.zip`;

        send(response, 200, zip, 'application/zip', {
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': zip.length
        });
        return true;
      }
      if (isSpeaking) {
        const title = String(exportResult?.data?.title || `quiz-${resolvedId}`).trim();
        const zip = await buildSpeakingZip({
          id: resolvedId,
          title,
          createDocx: docxCore.createDocx,
          result: exportResult,
          quizTypeOverride: resolvedSkill
        });
        const fileName = `${sanitizeFileNamePart(`${resolvedId} - ${title}`) || `quiz-${resolvedId}`}.zip`;

        send(response, 200, zip, 'application/zip', {
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': zip.length
        });
        return true;
      }
      const docx = await docxCore.createDocx({ id: resolvedId, result: exportResult, quizTypeOverride: resolvedSkill });
      const fileName = `e-learning-${resolvedId.replaceAll(/[^a-zA-Z0-9_-]/g, '_')}.docx`;

      send(response, 200, docx, contentTypes.docx, {
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': docx.length
      });
      return true;
    } catch (error) {
      send(response, 500, renderForm(error.message), contentTypes.html);
      return true;
    }
  }

  return {
    handleExportRequest,
    createDocx: docxCore.createDocx,
    buildCleanExportRecord: readingCore.buildCleanExportRecord
  };
}

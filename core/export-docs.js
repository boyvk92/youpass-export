import { buildCoverPageLines } from '../cover-page.js';
import { createDocxCore, buildImageRegistry, coverTitleParagraph, coverSubjectParagraph, coverCodeParagraph, pageBreakParagraph, heading, questionGroup, questionDescriptionHtml, questionTitle, questionTextParagraph, questionAnswerParagraph, questionTitleWithAnswer, questionTitleWithAnswerOnly, questionTitleWithTrailingAnswer, questionTitleWithHtml, readingTestTitle, passageLabel, passageTitle, passageParagraph, extractImageOnlyHtml, htmlToDocxParagraphs, questionKeywordsBlock, questionExplanationBlock, answerParagraph, choiceParagraph, questionInfoParagraph, paragraph, formatResult, appendDocxRenderLog, appendQuestionTypeLog, summarizeQuestionTypes, summarizeUnknownQuestionTypes, createZip } from '../skill/common.js';
import { createReadingCore, extractYouPassParts, splitPassageContent, getPartQuestions, isFillInTheBlankQuestion, getQuestionRawTypeKey, extractMarkedAnswers, pushQuestionGroupLines, addExplanationLines, getChoiceAnswer, getDirectAnswer, formatOptionText, labelIndexedOptions, pushSharedOptions, formatAreaOfInformation, extractQuestionKeywords, getQuestionTypeLabel, getQuestionRawTypeText, normalizeTypeKey, formatSingleChoiceRadio, formatMultipleChoiceManyOptions, formatSelectionQuestion, formatChoiceOptions, formatSharedOptions, getQuestionOrderRange, collectQuestionAnswerTokens, collectQuestionChoiceTextMap, collectGroupChoiceTextMap, buildExplanationMap } from '../skill/reading.js';
import { fetchELearningResult, resetTextLogFile, appendJsonLogLine } from './helper.js';

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

      const result = await fetchELearningResult({ apiUrl, id: resolvedId, token });
      appendJsonLogLine(readingCore.buildCleanExportRecord({ id: resolvedId, result, quizTypeOverride: resolvedSkill }), exportLogFile, enableFileLogs);
      const docx = await docxCore.createDocx({ id: resolvedId, result, quizTypeOverride: resolvedSkill });
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

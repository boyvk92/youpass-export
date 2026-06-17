import { decodeHtmlEntities, htmlToText, htmlToTextWithBlankPlaceholders, htmlWithBlankPlaceholders, splitTextLines } from './helper.js';
import { escapeHtml, normalizeExplanationHtml, resolveEffectiveQuizType } from './common.js';
import { buildSpeakingExportLines } from './speaking.js';
import { QUIZ_TYPE_LABELS, QUIZ_TYPE_KEYS, resolveQuizType } from '../quiz-types.js';

function collectHtmlContent(value, htmlToText) {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map((item) => collectHtmlContent(item, htmlToText)).filter(Boolean).join('\n');
  }

  if (typeof value === 'string') {
    return htmlToText(value);
  }

  if (typeof value !== 'object') {
    return htmlToText(String(value));
  }

  return collectHtmlContent(
    value.html
      ?? value.content
      ?? value.text
      ?? value.value
      ?? value.children
      ?? '',
    htmlToText
  );
}

function collectHtmlMarkup(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map((item) => collectHtmlMarkup(item)).filter(Boolean).join('<br>');
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value !== 'object') {
    return String(value).trim();
  }

  return collectHtmlMarkup(
    value.html
      ?? value.content
      ?? value.text
      ?? value.value
      ?? value.children
      ?? ''
  );
}

function combineHtmlMarkup(...values) {
  return values.map((value) => collectHtmlMarkup(value)).filter(Boolean).join('<br>');
}

function getSummaryCompletionAnswerText(question) {
  const answerSource = collectHtmlContent(
    question?.answer
      ?? question?.correct_answer
      ?? question?.correct_answers
      ?? '',
    htmlToText
  );
  return htmlToText(answerSource || getDirectAnswer(question) || '');
}

function buildSummaryCompletionAnswerMap(questions = []) {
  const answerMap = new Map();

  questions.forEach((question) => {
    const order = Number.parseInt(question?.order, 10);
    const answer = getSummaryCompletionAnswerText(question);
    if (Number.isInteger(order) && order > 0 && answer) {
      answerMap.set(String(order), answer);
    }
  });

  return answerMap;
}

function injectSummaryCompletionAnswers(html, answerMap) {
  const source = String(html ?? '');
  if (!(answerMap instanceof Map) || answerMap.size === 0) {
    return source;
  }

  const orderedEntries = [...answerMap.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  let blankIndex = 0;

  return source.replace(/___\[(\d+)\]___|\[__([^\]]+)__\]|_{4,}|[-–—]{4,}/g, (match, orderA, orderB) => {
    const explicitOrder = String(orderA || orderB || '').trim();
    const entry = explicitOrder
      ? orderedEntries.find(([order]) => order === explicitOrder)
      : orderedEntries[blankIndex];

    if (!entry) {
      blankIndex += 1;
      return match;
    }

    const [order, answer] = entry;
    blankIndex += 1;
    return `<strong>[[${order}]]</strong>-> <font color="C00000">${answer}</font>`;
  });
}

function injectMapDiagramLabelAnswers(html, answerMap) {
  const source = String(html ?? '');
  if (!(answerMap instanceof Map) || answerMap.size === 0) {
    return source;
  }

  const orderedEntries = [...answerMap.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  let blankIndex = 0;

  return source.replace(/<span\b([^>]*class="[^"]*gap-placeholder[^"]*"[^>]*)>([\s\S]*?)<\/span>/gi, (match, attrs) => {
    const explicitOrderMatch = attrs.match(/data-question-id="gf_(\d+)"/i)
      || attrs.match(/data-question-order="(\d+)"/i)
      || attrs.match(/data-order="(\d+)"/i);
    const explicitOrder = String(explicitOrderMatch?.[1] || '').trim();
    const entry = explicitOrder
      ? orderedEntries.find(([order]) => order === explicitOrder)
      : orderedEntries[blankIndex];

    if (!entry) {
      blankIndex += 1;
      return match;
    }

    const [, answer] = entry;
    blankIndex += 1;
    const orderLabel = explicitOrder || String(blankIndex);
    return `<span${attrs}><strong>[[${orderLabel}]]</strong> -> <font color="C00000">${answer}</font></span>`;
  });
}

function buildSummaryCompletionAnswerListHtml(answerMap) {
  if (!(answerMap instanceof Map) || answerMap.size === 0) {
    return '';
  }

  const entries = [...answerMap.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  return entries.map(([order, answer]) => `<p><strong>[[${escapeHtml(order)}]]</strong> -> <font color="C00000">${escapeHtml(answer)}</font></p>`).join('');
}

function buildMatchingInfoContentHtml(questions = []) {
  const rowsByOrder = new Map();

  questions.forEach((question) => {
    const order = String(question?.order ?? '').trim();
    if (!order) {
      return;
    }

    const row = rowsByOrder.get(order) || { order, text: '', answer: '' };
    const text = htmlToText(question?.text || question?.content || question?.title || '');
    const answer = htmlToText(getDirectAnswer(question) || question?.answer || question?.correct_answer || '');

    if (!row.text && text) {
      row.text = text;
    }

    if (!row.answer && answer) {
      row.answer = answer;
    }

    rowsByOrder.set(order, row);
  });

  return [...rowsByOrder.values()]
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((row) => {
      const parts = [];
      if (row.order) {
        parts.push(`<strong>${row.order}</strong>.`);
      }
      if (row.text) {
        parts.push(row.text);
      }
      if (row.answer) {
        parts.push(`<font color="C00000">${row.answer}</font>`);
      }
      return `<p>${parts.join(' ')}</p>`;
    })
    .join('');
}

function stripChoiceLabelPrefix(value) {
  return String(value ?? '')
    .replace(/^[A-Z0-9IVXLCDM]+\s*[.)-:]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildMatchingFeatureChoiceTextMap(questions = []) {
  const map = new Map();

  questions.forEach((question) => {
    const sharedOptions = formatSharedOptions(question);
    const selectionOptions = formatSelectionOptions(question);
    const options = sharedOptions.length > 0 ? sharedOptions : selectionOptions;

    labelIndexedOptions(options).forEach((option) => {
      const key = normalizeChoiceLabel(option.option);
      const value = stripChoiceLabelPrefix(htmlToText(option.text || option.displayText || ''));

      if (key && value && !map.has(key)) {
        map.set(key, value);
      }
    });
  });

  return map;
}

function resolveMatchingFeatureAnswerText(question, choiceTextMap) {
  const candidates = [
    question?.answer?.text,
    question?.answer?.content,
    question?.answer?.value,
    question?.correct_answer?.text,
    question?.correct_answer?.content,
    question?.correct_answer?.value,
    getDirectAnswer(question),
    question?.answer,
    question?.correct_answer
  ]
    .map((value) => htmlToText(value))
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeChoiceLabel(candidate);
    if (normalizedCandidate && choiceTextMap instanceof Map && choiceTextMap.has(normalizedCandidate)) {
      return choiceTextMap.get(normalizedCandidate);
    }

    const strippedCandidate = stripChoiceLabelPrefix(candidate);
    const normalizedStrippedCandidate = normalizeChoiceLabel(strippedCandidate);
    if (normalizedStrippedCandidate && choiceTextMap instanceof Map && choiceTextMap.has(normalizedStrippedCandidate)) {
      return choiceTextMap.get(normalizedStrippedCandidate);
    }
  }

  return stripChoiceLabelPrefix(candidates[0] || '');
}

function buildMatchingFeatureOptionsHtml(questions = []) {
  const options = [];
  const seen = new Set();

  questions.forEach((question) => {
    const sharedOptions = formatSharedOptions(question);
    const selectionOptions = formatSelectionOptions(question);
    const sourceOptions = sharedOptions.length > 0 ? sharedOptions : selectionOptions;

    sourceOptions.forEach((option) => {
      const label = normalizeChoiceLabel(option.option);
      const text = String(formatOptionText(option) || '').trim();
      const signature = text || `${label}|${String(option.text || '').trim()}`;

      if (signature && !seen.has(signature)) {
        seen.add(signature);
        options.push(text);
      }
    });
  });

  return options.length > 0
    ? options.map((optionText) => `<p>${optionText}</p>`).join('')
    : '';
}

function buildMultipleChoiceManyOptionsHtml(questions = []) {
  const options = [];
  const seen = new Set();

  questions.forEach((question) => {
    const sourceOptions = formatMultipleChoiceManyOptions(question);

    sourceOptions.forEach((option) => {
      const label = normalizeChoiceLabel(option.option);
      const text = String(formatOptionText(option) || '').trim();
      const signature = text || `${label}|${String(option.text || '').trim()}`;

      if (signature && !seen.has(signature)) {
        seen.add(signature);
        options.push(text);
      }
    });
  });

  return options.length > 0
    ? options.map((optionText) => `<p>${optionText}</p>`).join('')
    : '';
}

function buildMultipleChoiceManyPromptHtml(questions = []) {
  const firstQuestion = questions.find((question) => String(question?.text || question?.content || question?.title || '').trim()) || null;
  if (!firstQuestion) {
    return '';
  }

  return String(firstQuestion.text || firstQuestion.content || firstQuestion.title || '').trim();
}

function buildMultipleChoiceManyOrderRange(question) {
  const order = Number.parseInt(question?.order, 10);
  const correctCount = formatMultipleChoiceManyOptions(question).filter((option) => option.correct).length;

  if (!Number.isInteger(order) || order <= 0) {
    return '';
  }

  if (correctCount <= 1) {
    return String(order);
  }

  return `${order}-${order + correctCount - 1}`;
}

function extractMultipleChoiceManyExplanationChunks(explanationHtml = '') {
  const source = String(explanationHtml || '');
  const pattern = /Giải thích\s+đáp\s+án\s+([A-Z0-9IVXLCDM]+)\s*:/gi;
  const matches = [...source.matchAll(pattern)];
  const chunks = new Map();

  if (matches.length === 0) {
    return chunks;
  }

  matches.forEach((match, index) => {
    const label = normalizeChoiceLabel(match[1]);
    if (!label || chunks.has(label)) {
      return;
    }

    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? source.length) : source.length;
    const chunk = source.slice(start, end).trim();
    if (chunk) {
      chunks.set(label, chunk);
    }
  });

  return chunks;
}

function trimMultipleChoiceManyExplanationToFirstBlock(explanationHtml = '') {
  const source = String(explanationHtml || '').trim();
  if (!source) {
    return '';
  }

  const nextBlockIndex = source.search(/\n\s*Giải thích\s+đáp\s+án\s+/i);
  if (nextBlockIndex > 0) {
    return source.slice(0, nextBlockIndex).trim();
  }

  return source;
}

function buildMatchingFeaturesContentHtml(questions = []) {
  const rowsByOrder = new Map();
  const choiceTextMap = buildMatchingFeatureChoiceTextMap(questions);

  questions.forEach((question) => {
    const order = String(question?.order ?? '').trim();
    if (!order) {
      return;
    }

    const row = rowsByOrder.get(order) || { order, text: '', answer: '' };
    const text = htmlToText(question?.text || question?.content || question?.title || '');
    const answer = resolveMatchingFeatureAnswerText(question, choiceTextMap);

    if (!row.text && text) {
      row.text = text;
    }

    if (!row.answer && answer) {
      row.answer = answer;
    }

    rowsByOrder.set(order, row);
  });

  return [...rowsByOrder.values()]
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((row) => {
      const parts = [];
      if (row.order) {
        parts.push(`<strong>${row.order}</strong>.`);
      }
      if (row.answer) {
        parts.push(`<font color="C00000">${row.answer}</font>`);
      }
      if (row.text) {
        parts.push(row.text);
      }
      return `<p>${parts.join(' ')}</p>`;
    })
    .join('');
}

function buildMatchingEndingsContentHtml(questions = []) {
  const rowsByOrder = new Map();
  const choiceTextMap = buildMatchingFeatureChoiceTextMap(questions);

  questions.forEach((question) => {
    const order = String(question?.order ?? '').trim();
    if (!order) {
      return;
    }

    const row = rowsByOrder.get(order) || { order, text: '', answer: '' };
    const text = htmlToText(question?.text || question?.content || question?.title || '');
    const answer = resolveMatchingFeatureAnswerText(question, choiceTextMap);

    if (!row.text && text) {
      row.text = text;
    }

    if (!row.answer && answer) {
      row.answer = answer;
    }

    rowsByOrder.set(order, row);
  });

  return [...rowsByOrder.values()]
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((row) => {
      const parts = [];
      if (row.order) {
        parts.push(`<strong>${row.order}</strong>.`);
      }
      if (row.text) {
        parts.push(row.text);
      }
      if (row.answer) {
        parts.push(`<font color="C00000">${row.answer}</font>`);
      }
      return `<p>${parts.join(' ')}</p>`;
    })
    .join('');
}

const IELTS_TYPES = {
  1: 'Multiple Choice',
  2: 'True/False/Not Given',
  3: 'Matching Headings',
  4: 'Short Answer',
  5: 'Sentence Completion',
  6: 'Sentence Matching',
  7: 'Labeling Diagram',
  8: 'Summary Completion',
  9: 'Diagram Completion',
  10: 'Note / Table / Flow Completion'
};

export const READING_RAW_TYPE_DEFINITIONS = Object.freeze([
  { rawType: 'MULTIPLE_CHOICE', label: IELTS_TYPES[1], ieltsType: 1 },
  { rawType: 'MULTIPLE_CHOICE_ONE', label: IELTS_TYPES[1], ieltsType: 1 },
  { rawType: 'MULTIPLE_SELECTION', label: IELTS_TYPES[1], ieltsType: 1 },
  { rawType: 'SINGLE_CHOICE', label: IELTS_TYPES[1], ieltsType: 1 },
  { rawType: 'SINGLE_SELECTION', label: IELTS_TYPES[1], ieltsType: 1 },
  { rawType: 'TRUE_FALSE_NOT_GIVEN', label: IELTS_TYPES[2], ieltsType: 2 },
  { rawType: 'YES_NO_NOT_GIVEN', label: IELTS_TYPES[2], ieltsType: 2 },
  { rawType: 'MATCHING_HEADINGS', label: IELTS_TYPES[3], ieltsType: 3 },
  { rawType: 'MATCHING_HEADING', label: IELTS_TYPES[3], ieltsType: 3 },
  { rawType: 'MATCHING_NAMES', label: IELTS_TYPES[6], ieltsType: 6 },
  { rawType: 'MATCHING_INFO', label: IELTS_TYPES[6], ieltsType: 6 },
  { rawType: 'SENTENCE_MATCHING', label: IELTS_TYPES[6], ieltsType: 6 },
  { rawType: 'FILL_BLANK', label: IELTS_TYPES[5], ieltsType: 5 },
  { rawType: 'FILL_IN_THE_BLANK', label: IELTS_TYPES[5], ieltsType: 5 },
  { rawType: 'GAP_FILLING', label: IELTS_TYPES[5], ieltsType: 5 },
  { rawType: 'SENTENCE_COMPLETION', label: IELTS_TYPES[5], ieltsType: 5 },
  { rawType: 'SHORT_ANSWER', label: IELTS_TYPES[4], ieltsType: 4 },
  { rawType: 'LABELING_DIAGRAM', label: IELTS_TYPES[7], ieltsType: 7 },
  { rawType: 'LABELLING_DIAGRAM', label: IELTS_TYPES[7], ieltsType: 7 },
  { rawType: 'SUMMARY_COMPLETION', label: IELTS_TYPES[8], ieltsType: 8 },
  { rawType: 'DIAGRAM_COMPLETION', label: IELTS_TYPES[9], ieltsType: 9 },
  { rawType: 'NOTE_COMPLETION', label: IELTS_TYPES[10], ieltsType: 10 },
  { rawType: 'TABLE_COMPLETION', label: IELTS_TYPES[10], ieltsType: 10 },
  { rawType: 'FLOW_COMPLETION', label: IELTS_TYPES[10], ieltsType: 10 },
  { rawType: 'MATCHING_FEATURES', label: 'Matching Features', ieltsType: 6 },
  { rawType: 'MATCHING_ENDINGS', label: 'Matching Endings', ieltsType: 6 },
  { rawType: 'MULTIPLE_CHOICE_MANY', label: IELTS_TYPES[1], ieltsType: 1 },
  { rawType: 'MAP_DIAGRAM_LABEL', label: IELTS_TYPES[7], ieltsType: 7 },
  { rawType: 'YES_NO', label: IELTS_TYPES[2], ieltsType: 2 },
  { rawType: 'TRUE_FALSE', label: IELTS_TYPES[2], ieltsType: 2 },
  { rawType: 'OTHERS', label: IELTS_TYPES[4], ieltsType: 4 }
]);

export const YOUPASS_QUESTION_TYPES = Object.freeze(
  Object.fromEntries(READING_RAW_TYPE_DEFINITIONS.map(({ rawType, label }) => [rawType, label]))
);

export function getReadingRawTypeDefinition(rawType) {
  const normalizedRawType = normalizeTypeKey(rawType);
  if (!normalizedRawType) {
    return null;
  }

  return READING_RAW_TYPE_DEFINITIONS.find((definition) => definition.rawType === normalizedRawType) || null;
}

export function isReadingRawType(rawType) {
  return Boolean(getReadingRawTypeDefinition(rawType));
}

export function splitPassageContent(part, data) {
  const bodyLines = extractVocabPassageLines(part.vocabs);
  const partTitle = String(part.title ?? '').trim();
  const fallbackTitle = cleanQuizTitle(data?.title);
  const isQuestionGroupTitle = /^Questions?\s+\d+(?:\s*[-–—]\s*\d+)?/i.test(partTitle);
  const title = partTitle && !isQuestionGroupTitle ? partTitle : fallbackTitle;

  return {
    title,
    questionGroupTitle: isQuestionGroupTitle ? `${partTitle.match(/^Questions?\s+\d+(?:\s*[-–—]\s*\d+)?/i)?.[0] || partTitle.replaceAll(/:\s*$/g, '')}:` : '',
    bodyLines
  };
}

export function extractYouPassParts(data) {
  const rawParts = data?.part ?? data?.parts ?? [];
  if (Array.isArray(rawParts)) {
    return rawParts;
  }

  return rawParts ? [rawParts] : [];
}

export function cleanQuizTitle(title) {
  return String(title || '').replace(/^\[[^\]]+\]\s*-\s*/, '').trim();
}

export function extractVocabPassageLines(vocabs) {
  if (!Array.isArray(vocabs)) {
    return extractTextLines(vocabs);
  }

  const lines = vocabs
    .map((item) => {
      if (!item) {
        return '';
      }

      if (typeof item === 'string') {
        return htmlToText(item);
      }

      const children = Array.isArray(item.children) && item.children.length > 0
        ? item.children
        : [item];

      const parts = children
        .flatMap((child) => {
          if (!child) {
            return [];
          }

          if (typeof child === 'string') {
            return [htmlToText(child)];
          }

          return [child.value, child.text, child.content, child.html]
            .map((value) => htmlToText(value))
            .filter(Boolean);
        })
        .filter(Boolean);

      return parts.join(' ').replace(/\s+/g, ' ').trim();
    })
    .map((line) => line.trim())
    .filter(Boolean);

  const firstParagraphIndex = lines.findIndex((line) => /^[A-Z]\.\s/.test(line) || /^[A-Z]\.$/.test(line));
  return firstParagraphIndex >= 0 ? lines.slice(firstParagraphIndex) : lines;
}

export function numberGapPlaceholdersInHtml(html, startOrder = 1) {
  const source = String(html ?? '');
  let current = Number(startOrder) || 1;

  return source
    .replace(/<span\b[^>]*class="[^"]*gap-placeholder[^"]*"[^>]*>[\s_-]*<\/span>/gi, () => `___[${current++}]___`)
    .replace(/_{6,}/g, () => `___[${current++}]___`)
    .replace(/[-–—]{6,}/g, () => `___[${current++}]___`);
}

export function extractTextLines(node) {
  const lines = [];

  const pushText = (value) => {
    const text = htmlToText(value);
    if (text) {
      lines.push(...splitTextLines(text));
    }
  };

  const walk = (value) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (typeof value === 'string') {
      pushText(value);
      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    if (value.value !== undefined) {
      walk(value.value);
    }

    if (value.text !== undefined) {
      walk(value.text);
    }

    if (value.content !== undefined) {
      walk(value.content);
    }

    if (value.html !== undefined) {
      walk(value.html);
    }

    if (value.children !== undefined) {
      walk(value.children);
    }
  };

  walk(node);

  return lines.filter(Boolean);
}

export function normalizeTypeKey(value) {
  return String(value ?? '')
    .trim()
    .replaceAll(/[^a-z0-9]+/gi, '_')
    .replaceAll(/^_+|_+$/g, '')
    .toUpperCase();
}

export function getQuestionRawTypeKey(question) {
  return normalizeTypeKey(
    question?.question_type
      || question?.type
      || question?.kind
      || question?.question_type_id
      || question?.type_id
      || ''
  );
}

export function getQuestionRawTypeText(question) {
  const typeCandidates = [
    question.question_type,
    question.type,
    question.kind,
    question.question_type_id,
    question.type_id
  ];

  for (const candidate of typeCandidates) {
    if (candidate === null || candidate === undefined || candidate === '') {
      continue;
    }

    return String(candidate).trim();
  }

  return '';
}

export function getQuestionTypeLabel(question) {
  const typeCandidates = [
    question.question_type_id,
    question.type_id,
    question.kind,
    question.question_type,
    question.type
  ];

  for (const candidate of typeCandidates) {
    if (candidate === null || candidate === undefined || candidate === '') {
      continue;
    }

    const numericType = Number(candidate);
    if (Number.isInteger(numericType) && IELTS_TYPES[numericType]) {
      return IELTS_TYPES[numericType];
    }

    const definition = getReadingRawTypeDefinition(candidate);
    if (definition) {
      return definition.label;
    }
  }

  return '';
}

function isInstructionQuestionGroupType(rawTypeKey) {
  const normalizedRawTypeKey = normalizeTypeKey(rawTypeKey);
  return normalizedRawTypeKey === 'TRUE_FALSE'
    || normalizedRawTypeKey === 'TRUE_FALSE_NOT_GIVEN'
    || normalizedRawTypeKey === 'YES_NO'
    || normalizedRawTypeKey === 'YES_NO_NOT_GIVEN';
}

function isStatementQuestionType(rawTypeKey) {
  return isInstructionQuestionGroupType(rawTypeKey);
}

function getStatementChoiceText(rawTypeKey, answerText = '') {
  const normalizedRawTypeKey = normalizeTypeKey(rawTypeKey);
  const normalizedAnswerText = String(answerText ?? '').trim().replace(/\s+/g, ' ');

  if (normalizedRawTypeKey === 'TRUE_FALSE' || normalizedRawTypeKey === 'TRUE_FALSE_NOT_GIVEN') {
    return normalizedAnswerText === 'TRUE' || normalizedAnswerText === 'FALSE' || normalizedAnswerText === 'NOT GIVEN'
      ? normalizedAnswerText
      : '';
  }

  if (normalizedRawTypeKey === 'YES_NO' || normalizedRawTypeKey === 'YES_NO_NOT_GIVEN') {
    return normalizedAnswerText === 'YES' || normalizedAnswerText === 'NO' || normalizedAnswerText === 'NOT GIVEN'
      ? normalizedAnswerText
      : '';
  }

  return normalizedAnswerText;
}

function buildStatementChoiceOptions(rawTypeKey, answerText = '') {
  const normalizedRawTypeKey = normalizeTypeKey(rawTypeKey);
  const normalizedAnswerText = getStatementChoiceText(normalizedRawTypeKey, answerText);

  if (normalizedRawTypeKey === 'TRUE_FALSE' || normalizedRawTypeKey === 'TRUE_FALSE_NOT_GIVEN') {
    return [
      { option: 'A', text: 'TRUE', correct: normalizedAnswerText === 'TRUE' },
      { option: 'B', text: 'FALSE', correct: normalizedAnswerText === 'FALSE' },
      { option: 'C', text: 'NOT GIVEN', correct: normalizedAnswerText === 'NOT GIVEN' }
    ];
  }

  if (normalizedRawTypeKey === 'YES_NO' || normalizedRawTypeKey === 'YES_NO_NOT_GIVEN') {
    return [
      { option: 'A', text: 'YES', correct: normalizedAnswerText === 'YES' },
      { option: 'B', text: 'NO', correct: normalizedAnswerText === 'NO' },
      { option: 'C', text: 'NOT GIVEN', correct: normalizedAnswerText === 'NOT GIVEN' }
    ];
  }

  return [];
}

function formatQuestionPromptLine(order, text, rawTypeKey) {
  const questionText = String(text ?? '').trim();
  const normalizedRawTypeKey = normalizeTypeKey(rawTypeKey);

  if ((normalizedRawTypeKey === 'TRUE_FALSE'
    || normalizedRawTypeKey === 'TRUE_FALSE_NOT_GIVEN'
    || normalizedRawTypeKey === 'YES_NO'
    || normalizedRawTypeKey === 'YES_NO_NOT_GIVEN') && questionText) {
    return `Question ${order}. ${questionText}`;
  }

  return `Question ${order}.`;
}

export function isFillInTheBlankQuestion(question) {
  return normalizeTypeKey(question.type) === 'FILL_IN_THE_BLANK'
    || (normalizeTypeKey(question.question_type) === 'FILL_BLANK' && Boolean(question.gap_fill_in_blank))
    || (normalizeTypeKey(question.question_type) === 'GAP_FILLING' && Boolean(question.gap_fill_in_blank));
}

export function normalizeChoiceLabel(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }

  if (/^[a-z]+$/i.test(text)) {
    return text.toUpperCase();
  }

  return text;
}

export function formatOptionText(option) {
  if (!option.option) {
    return String(option.text ?? '');
  }

  const text = String(option.text ?? '').replaceAll(/\s+/g, ' ').trim();
  const optionPattern = new RegExp(`^${option.option}\\b[.)]?\\s*`, 'i');

  if (optionPattern.test(text)) {
    return text.replace(optionPattern, `${option.option}. `);
  }

  return `${option.option}. ${text}`;
}

export function formatSelectionQuestion(question) {
  const baseOrder = Number.parseInt(question?.order, 10);
  return (question.selection || []).map((item, index) => {
    const explicitOrder = Number.parseInt(item?.order, 10);
    const fallbackOrder = Number.isInteger(baseOrder) ? String(baseOrder + index) : String(question.order || '');

    return {
      order: Number.isInteger(explicitOrder) && explicitOrder > 0
        ? String(explicitOrder)
        : fallbackOrder,
      questionText: htmlToText(item.text),
      answer: htmlToText(item.answer)
    };
  });
}

export function formatChoiceOptions(question) {
  return (question.options || []).map((option) => ({
    option: htmlToText(option.option),
    text: htmlToText(option.text),
    correct: Boolean(option.is_correct)
  }));
}

export function formatMultipleChoiceManyOptions(question) {
  const candidates = [
    question.selection_option,
    question.multiple_choice,
    question.mutilple_choice,
    question.multipleChoice,
    question.multiple_choices,
    question.options,
    question.choices,
    question.choice_options,
    question.answer?.multiple_choice,
    question.answers?.multiple_choice,
    question.answer?.multipleChoice,
    question.answers?.multipleChoice,
    question.answer?.choices,
    question.answers?.choices,
    question.answer?.options,
    question.answers?.options
  ].filter(Boolean);

  for (const candidate of candidates) {
    const items = Array.isArray(candidate) ? candidate : [candidate];
    const options = items.flatMap((item, index) => {
      if (!item) {
        return [];
      }

      if (typeof item === 'string') {
        const text = htmlToText(item);
        return [{ option: String.fromCharCode(65 + index), text, correct: false }];
      }

      if (typeof item !== 'object') {
        return [];
      }

      const label = normalizeChoiceLabel(htmlToText(item.option ?? item.key ?? item.label ?? item.letter ?? item.answer ?? ''));
      const text = htmlToText(item.text ?? item.value ?? item.content ?? item.description ?? item.title ?? '');
      const correct = Boolean(item.correct || item.is_correct || item.isCorrect || item.answer === true);
      return [{
        option: label || String.fromCharCode(65 + index),
        text: text || label,
        correct
      }];
    }).filter((option) => option.option || option.text);

    if (options.length > 0) {
      return options;
    }
  }

  return [];
}

export function formatSingleChoiceRadio(question) {
  const candidates = [
    question.single_choice_radio,
    question.answer?.single_choice_radio,
    question.answers?.single_choice_radio,
    question.answer?.choices,
    question.answer?.options
  ].filter(Boolean);

  for (const candidate of candidates) {
    const items = Array.isArray(candidate) ? candidate : [candidate];
    const options = items.flatMap((item, index) => {
      if (!item) {
        return [];
      }

      if (typeof item === 'string') {
        return [{ option: String.fromCharCode(65 + index), text: htmlToText(item), correct: false }];
      }

      if (typeof item !== 'object') {
        return [];
      }

      const label = htmlToText(item.option ?? item.key ?? item.label ?? item.text ?? item.value);
      const text = htmlToText(item.text ?? item.value ?? item.label ?? item.option ?? item.key);
      return [{
        option: label || String.fromCharCode(65 + index),
        text,
        correct: Boolean(item.correct || item.is_correct || item.isCorrect)
      }];
    }).filter((option) => option.option || option.text);

    if (options.length > 0) {
      return options;
    }
  }

  return [];
}

export function formatSharedOptions(question) {
  return (question.shared_options || []).map((option) => ({
    option: htmlToText(option.option),
    text: htmlToText(option.text),
    correct: false
  }));
}

export function labelIndexedOptions(options = []) {
  return options.map((option, index) => ({
    ...option,
    option: /^[A-D]$/i.test(String(option.option ?? '').trim())
      ? String(option.option).trim().toUpperCase()
      : String.fromCharCode(65 + index),
    index
  }));
}

export function getChoiceAnswer(question, choiceOptions) {
  return htmlToText(question.correct_answer)
    || choiceOptions.find((option) => option.correct)?.option
    || '';
}

export function getDirectAnswer(question) {
  const correctAnswer = htmlToText(question.correct_answer);
  if (correctAnswer) {
    return correctAnswer;
  }

  if (Array.isArray(question.correct_answers) && question.correct_answers.length > 0) {
    return question.correct_answers.map(htmlToText).filter(Boolean).join(' | ');
  }

  return '';
}

export function extractMarkedAnswers(html) {
  const answers = [];
  const textWithMarkers = decodeHtmlEntities(
    String(html ?? '')
      .replaceAll(/<script[\s\S]*?<\/script>/gi, '')
      .replaceAll(/<style[\s\S]*?<\/style>/gi, '')
      .replaceAll(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)>/gi, '\n')
      .replaceAll(/<li[^>]*>/gi, '- ')
      .replaceAll(/<t[dh][^>]*>/gi, ' ')
      .replaceAll(/<[^>]+>/g, '')
  );
  const pattern = /\{\[([\s\S]*?)\]\[([^\]]+)\]\}/g;

  for (const line of splitTextLines(textWithMarkers)) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(line)) !== null) {
      const answerValue = htmlToText(match[1]);
      const order = htmlToText(match[2]);
      const questionText = htmlToText(line.replaceAll(/\{\[[\s\S]*?\]\[[^\]]+\]\}/g, ''));

      if (questionText || answerValue) {
        answers.push({
          order,
          questionText,
          answer: answerValue
        });
      }
    }
  }

  return answers;
}

export function formatSelectionOptions(question) {
  return formatMultipleChoiceManyOptions(question);
}

export function getQuestionOrderRange(answers, fallbackOrder) {
  const orders = answers
    .map((answer) => Number.parseInt(answer.order, 10))
    .filter((order) => Number.isInteger(order))
    .sort((a, b) => a - b);

  if (orders.length === 0) {
    return fallbackOrder ? String(fallbackOrder) : '';
  }

  const firstOrder = orders[0];
  const lastOrder = orders[orders.length - 1];
  return firstOrder === lastOrder ? String(firstOrder) : `${firstOrder} - ${lastOrder}`;
}

export function formatQuestionGroupLines(question, answers) {
  const typeLabel = getQuestionRawTypeText(question);
  const rawTypeKey = getQuestionRawTypeKey(question);
  const questionOrder = getQuestionOrderRange(answers, question.order);
  const descriptionHtml = String(question.description ?? '').trim();
  const descriptionLines = splitTextLines(htmlToText(descriptionHtml));
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(descriptionHtml);
  if (descriptionLines.length > 0) {
    if (typeLabel && /^Questions?\s+\d/i.test(descriptionLines[0])) {
      const firstLine = descriptionLines[0].replaceAll(/:\s*$/g, '');
      return [
        {
          type: 'questionGroup',
          text: firstLine,
          rawTypeKey,
          questionOrder
        },
        ...(hasHtml ? [{ type: 'questionDescriptionHtml', html: descriptionHtml }] : descriptionLines.slice(1))
      ];
    }

    if (typeLabel) {
      return [
        {
          type: 'questionGroup',
          text: `Questions ${questionOrder}`,
          rawTypeKey,
          questionOrder
        },
        ...(hasHtml ? [{ type: 'questionDescriptionHtml', html: descriptionHtml }] : descriptionLines)
      ];
    }

    if (hasHtml) {
      return [{ type: 'questionDescriptionHtml', html: descriptionHtml }];
    }

    return descriptionLines;
  }

  if (!typeLabel) {
    return [];
  }

  const orderRange = getQuestionOrderRange(answers, question.order);
  if (!orderRange.includes('-')) {
    return [{
      type: 'questionGroup',
      text: `Questions ${orderRange}`,
      rawTypeKey,
      questionOrder: orderRange
    }];
  }

  return [{
    type: 'questionGroup',
    text: `Questions ${orderRange}`,
    rawTypeKey,
    questionOrder: orderRange
  }];
}

export function pushQuestionGroupLines(lines, question, answers) {
  formatQuestionGroupLines(question, answers).forEach((line) => {
    if (typeof line === 'string') {
      lines.push({
        type: /^Questions?\s+\d/i.test(line) ? 'questionGroup' : 'text',
        text: line
      });
      return;
    }

    lines.push(line);
  });
}

export function extractMarkedExplanations(html) {
  const explanations = new Map();
  const source = String(html || '');
  const markerPattern = /\]\[([^\]]+)\]\}/g;
  let cursor = 0;
  let match;

  while ((match = markerPattern.exec(source)) !== null) {
    const order = htmlToText(match[1]);
    const chunk = source
      .slice(cursor, match.index)
      .replaceAll(/<p>\s*(\{\[|\{\{)\s*<\/p>/gi, '')
      .replace(/^\s*(\{\[|\{\{)\s*/i, '');

    if (order && chunk.trim()) {
      explanations.set(String(order), chunk);
    }

    cursor = markerPattern.lastIndex;
  }

  return explanations;
}

export function buildExplanationMap(questions) {
  const explanations = new Map();

  for (const question of questions) {
    const markedExplanations = extractMarkedExplanations(question.explain);
    markedExplanations.forEach((explanation, order) => {
      explanations.set(String(order), explanation);
    });

    const explanation = String(question.explain ?? '');
    if (markedExplanations.size === 0 && question.order && explanation.trim()) {
      explanations.set(String(question.order), explanation);
    }
  }

  return explanations;
}

export function collectQuestionAnswerTokens(question, details = {}) {
  const tokens = [];
  const pushToken = (value) => {
    const text = htmlToText(value).trim();
    if (text) {
      tokens.push(text);
    }
  };

  pushToken(details.answer);
  pushToken(question.correct_answer);

  if (Array.isArray(question.correct_answers)) {
    question.correct_answers.forEach(pushToken);
  }

  if (Array.isArray(question.selection)) {
    question.selection.forEach((item) => {
      pushToken(item?.answer);
    });
  }

  if (Array.isArray(details.choices)) {
    details.choices.forEach((choice) => {
      if (choice?.correct) {
        pushToken(choice.option);
      }
    });
  }

  return [...new Set(tokens)];
}

export function collectQuestionChoiceTextMap(details = {}) {
  const map = new Map();
  const choices = Array.isArray(details.choices)
    ? details.choices
    : (Array.isArray(details.options) ? details.options : []);

  choices.forEach((choice, index) => {
    if (!choice) {
      return;
    }

    const rawValue = String(choice.rawText ?? choice.text ?? choice.displayText ?? '').trim();
    const value = rawValue.replace(/^[A-Z0-9IVXLCDM]+\s*[.)]\s*/i, '').trim();
    const fallbackKey = String.fromCharCode(65 + index);
    const rawKey = normalizeChoiceLabel(choice.option ?? choice.key ?? choice.label ?? '');
    const key = rawKey || fallbackKey;

    if (key && value) {
      map.set(key, value);
      if (rawKey && rawKey !== key) {
        map.set(rawKey, value);
      }
    }
  });

  return map;
}

export function collectGroupChoiceTextMap(question = {}) {
  const map = new Map();
  const lines = [];

  if (Array.isArray(question.group?.description)) {
    lines.push(...question.group.description);
  }

  const descriptionHtml = String(question.description ?? question.group?.html ?? question.group?.descriptionHtml ?? '').trim();
  if (descriptionHtml) {
    splitTextLines(htmlToText(descriptionHtml)).forEach((line) => lines.push(line));
  }

  for (const line of lines) {
    const text = htmlToText(line).replace(/\u00a0/g, ' ').trim();
    if (!text) {
      continue;
    }

    const match = text.match(/^((?:[A-Za-z])|(?:\d+)|(?:[ivxlcdm]{1,6}))\b(?:\s*[.)\-:]?\s+|\s+)(.+)$/i);
    if (!match) {
      continue;
    }

    const key = normalizeChoiceLabel(match[1]);
    const value = String(match[2] ?? '').trim();
    if (key && value && !/^questions?\b/i.test(text)) {
      map.set(key, value);
    }
  }

  return map;
}

export function addExplanationLines(lines, question, order, explanationsByOrder, details = {}, enabled = true) {
  if (!enabled) {
    return;
  }

  const rawTypeKey = getQuestionRawTypeKey(question);
  const isStatementQuestionType = rawTypeKey === 'TRUE_FALSE'
    || rawTypeKey === 'TRUE_FALSE_NOT_GIVEN'
    || rawTypeKey === 'YES_NO'
    || rawTypeKey === 'YES_NO_NOT_GIVEN';
  const answerTokens = collectQuestionAnswerTokens(question, details);
  const choiceTextMap = new Map([
    ...collectGroupChoiceTextMap(question).entries(),
    ...collectQuestionChoiceTextMap(details).entries()
  ]);
  const explanationHtml = normalizeExplanationHtml(
    (order && explanationsByOrder.get(String(order))) || question.explain,
    answerTokens,
    choiceTextMap,
    rawTypeKey
  );
  const keywords = extractQuestionKeywords(question);
  const answer = rawTypeKey === 'MULTIPLE_CHOICE_MANY' ? '' : htmlToText(details.answer);

  if (!answer && keywords.length === 0 && !String(explanationHtml ?? '').trim()) {
    return;
  }

  const isMatchingSharedQuestionType = rawTypeKey === 'MATCHING_FEATURES'
    || rawTypeKey === 'MATCHING_ENDINGS';

  if (answer && rawTypeKey !== 'MULTIPLE_CHOICE_ONE' && rawTypeKey !== 'MULTIPLE_CHOICE_MANY' && !isStatementQuestionType && !isMatchingSharedQuestionType) {
    lines.push({
      type: 'questionAnswerBlock',
      answer
    });
  }

  if (keywords.length > 0) {
    lines.push({
      type: 'questionKeywordsBlock',
      keywords
    });
  }

  if (String(explanationHtml ?? '').trim()) {
    lines.push({
      type: 'questionExplanationBlock',
      explanationHtml,
      answerTokens,
      answerTextMap: choiceTextMap,
      rawTypeKey
    });
  }
}

function formatGapQuestionLabel(questionText, order, rawTypeKey) {
  const text = String(questionText ?? '').trim();
  const blankLabel = order ? `___[${order}]___` : '___[ ]___';
  if (!text) {
    return blankLabel;
  }

  if (/^[_\-\s–—]+$/.test(text)) {
    return blankLabel;
  }

  if (rawTypeKey === 'GAP_FILLING') {
    return text.replace(/_{3,}|-{3,}|—{3,}|–{3,}/g, blankLabel);
  }

  return text;
}

export function formatAreaOfInformation(question) {
  const ranges = question.locate_info?.paragraph_ranges;
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return '';
  }

  return ranges.map((range) => {
    const start = range.start || {};
    const end = range.end || {};
    const paragraph = start.paragraph && end.paragraph && start.paragraph !== end.paragraph
      ? `Paragraphs ${start.paragraph}-${end.paragraph}`
      : `Paragraph ${start.paragraph || end.paragraph}`;
    const sentence = start.sentence && end.sentence && start.sentence !== end.sentence
      ? `sentences ${start.sentence}-${end.sentence}`
      : start.sentence || end.sentence
        ? `sentence ${start.sentence || end.sentence}`
        : '';

    return [paragraph, sentence].filter(Boolean).join(', ');
  }).filter(Boolean).join('; ');
}

export function extractQuestionKeywords(question) {
  const explanationLines = splitTextLines(htmlToText(question.explain));
  const keywords = [];
  let collecting = false;

  for (const line of explanationLines) {
    if (/^Bước\s+\d+\s*:/i.test(line) && collecting) {
      break;
    }

    if (/keywords?/i.test(line)) {
      collecting = true;
      continue;
    }

    if (!collecting) {
      continue;
    }

    const cleanedLine = line.replace(/^[-•]\s*/, '').trim();
    if (cleanedLine && !/^Bước\s+\d+\s*:/i.test(cleanedLine)) {
      keywords.push(cleanedLine);
    }
  }

  return keywords;
}

export function pushSharedOptions(lines, sharedOptions, emittedSharedOptionGroups, groupKey) {
  if (!Array.isArray(sharedOptions) || sharedOptions.length === 0) {
    return;
  }

  const key = String(groupKey || '');
  if (key && emittedSharedOptionGroups.has(key)) {
    return;
  }

  sharedOptions.forEach((option) => {
    lines.push({
      type: 'choice',
      text: formatOptionText(option),
      correct: false
    });
  });

  if (key) {
    emittedSharedOptionGroups.add(key);
  }
}

export function getPartQuestions(part) {
  const collectHtmlContent = (value) => {
    if (value === null || value === undefined) {
      return '';
    }

    if (Array.isArray(value)) {
      return value.map((item) => collectHtmlContent(item)).filter(Boolean).join('<br>');
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value !== 'object') {
      return String(value);
    }

    return collectHtmlContent(
      value.html
        ?? value.content
        ?? value.text
        ?? value.value
        ?? value.children
        ?? ''
    );
  };

  const normalizeFromSet = (questionSet, question, index) => {
    const questionStartOrder = (questionSet.questions || [])
      .map((item) => Number(item?.order))
      .find((value) => Number.isFinite(value) && value > 0) || 1;
    const locateInfoSource = questionSet.locate_info;
    const resolvedLocateInfo = Array.isArray(locateInfoSource)
      ? (locateInfoSource[index]?.questions?.[0]?.locate_info
        || locateInfoSource[index]?.locate_info
        || locateInfoSource[index]
        || null)
      : (question.locate_info || locateInfoSource || null);
    const sharedQuestionContent = numberGapPlaceholdersInHtml(
      collectHtmlContent(questionSet.content),
      questionStartOrder
    );
    const sharedQuestionGroupKey = questionSet.id || questionSet.title || questionSet.question_set_id || '';

    return {
      ...question,
      question_type: question.question_type || questionSet.question_type,
      description: index === 0
        ? String(questionSet.description ?? '').trim()
        : question.description,
      shared_question_content: index === 0 ? sharedQuestionContent : '',
      shared_question_group_key: sharedQuestionGroupKey,
      shared_options: Array.isArray(questionSet.options) && questionSet.options.length > 0 ? questionSet.options : null,
      shared_option_group_key: sharedQuestionGroupKey,
      locate_info: resolvedLocateInfo
    };
  };

  const normalizedQuestions = [];
  const seen = new Map();

  const isPresent = (value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return value !== null && value !== undefined && String(value).trim() !== '';
  };

  const mergeQuestionRecords = (target, source) => {
    if (!target) {
      return source;
    }

    const merged = { ...target };

    for (const [key, value] of Object.entries(source || {})) {
      if (key === 'shared_question_content' || key === 'shared_question_group_key' || key === 'shared_options' || key === 'shared_option_group_key') {
        if (!isPresent(merged[key]) && isPresent(value)) {
          merged[key] = value;
        }
        continue;
      }

      if (!isPresent(merged[key]) && isPresent(value)) {
        merged[key] = value;
      }
    }

    return merged;
  };

  const pushUnique = (question) => {
    if (!question) {
      return;
    }

    const signature = [
      String(question.order ?? '').trim(),
      htmlToText(question.text || question.content || question.title),
      htmlToText(question.question_text || question.questionText || ''),
      getQuestionRawTypeKey(question)
    ].join('|');

    if (seen.has(signature)) {
      const index = seen.get(signature);
      normalizedQuestions[index] = mergeQuestionRecords(normalizedQuestions[index], question);
      return;
    }

    seen.set(signature, normalizedQuestions.length);
    normalizedQuestions.push(question);
  };

  if (Array.isArray(part.question_sets) && part.question_sets.length > 0) {
    part.question_sets.forEach((questionSet) => {
      (questionSet.questions || []).forEach((question, index) => {
        pushUnique(normalizeFromSet(questionSet, question, index));
      });
    });
  }

  const rawQuestions = Array.isArray(part.questions) ? part.questions : [];
  rawQuestions.forEach((question) => pushUnique(question));

  return normalizedQuestions;
}

export function createReadingCore(deps = {}) {
  const { buildPassageBlocks } = deps;
  function formatYouPassResult(result, quizTypeOverride, options = {}) {
    const { testMode = false } = options;
    const data = result?.data ?? result;
    const parts = extractYouPassParts(data);
    const quizTypeKey = resolveQuizType(resolveEffectiveQuizType(quizTypeOverride, data?.quiz_type)).key;
    if (quizTypeKey === 'speaking') {
      return buildSpeakingExportLines(result);
    }
    const useReadingExplanation = quizTypeKey === 'reading';
    const buildQuestionInfoText = typeof deps.buildQuestionInfoText === 'function' ? deps.buildQuestionInfoText : null;
    const lines = [];

    if (!testMode) {
      lines.push({ type: 'readingTestTitle', text: 'Test 1' });
    }

    if (!testMode && data?.instruction) {
      lines.push({ type: 'heading', text: 'Instruction' });
      splitTextLines(htmlToText(data.instruction)).forEach((line) => lines.push({ type: 'text', text: line }));
    }

    parts.forEach((part, partIndex) => {
      const passageNumber = part.passage || part.sort || partIndex + 1;
      if (!testMode && partIndex > 0) {
        lines.push({ type: 'pageBreak', text: '' });
      }
      if (!testMode) {
        lines.push({ type: 'passageLabel', text: `PASSAGE ${passageNumber}` });

        const passage = splitPassageContent(part, data);
        const passageBlocks = typeof buildPassageBlocks === 'function'
          ? buildPassageBlocks(part, data, quizTypeKey)
          : [];
        if (passageBlocks.length > 0) {
          if (passage.title) {
            lines.push({ type: 'passageTitle', text: passage.title });
          }
          lines.push({ type: 'passageListeningTable', blocks: passageBlocks });
        } else if (passage.title || passage.bodyLines.length > 0) {
          if (passage.title) {
            lines.push({ type: 'passageTitle', text: passage.title });
          }
          passage.bodyLines.forEach((line) => lines.push({ type: 'passageText', text: line }));
        }
      }

      const partQuestions = getPartQuestions(part);
      if (partQuestions.length > 0) {
        if (!testMode) {
          lines.push({ type: 'heading', text: 'Questions and answers' });
        }
        const emittedQuestionOrders = new Set();
        const emittedSharedOptionGroups = new Set();
        const emittedSelectionOptionGroups = new Set();
        const emittedSharedQuestionGroups = new Set();
        const emittedSharedQuestionDescriptions = new Set();
        const emittedSharedQuestionContents = new Set();
        const emittedMatchingFeatureGroups = new Set();
        const explanationsByOrder = buildExplanationMap(partQuestions);
        const questionGroupMetaByKey = new Map();
        const summaryCompletionAnswerMapByGroupKey = new Map();
        const questionInfoTextFor = (question, rowIndex = 0) => (
          buildQuestionInfoText ? buildQuestionInfoText(question, { part, data, quizTypeKey }, rowIndex) : ''
        );
        const withQuestionInfo = (payload, question, rowIndex = 0) => {
          const questionInfoText = questionInfoTextFor(question, rowIndex);
          return questionInfoText
            ? { ...payload, questionInfoText }
            : payload;
        };

        const registerSummaryAnswer = (groupKey, question) => {
          const normalizedGroupKey = String(groupKey || '').trim();
          if (!normalizedGroupKey) {
            return;
          }

          const order = Number.parseInt(question?.order, 10);
          const answer = getSummaryCompletionAnswerText(question);
          if (!Number.isInteger(order) || order <= 0 || !answer) {
            return;
          }

          if (!summaryCompletionAnswerMapByGroupKey.has(normalizedGroupKey)) {
            summaryCompletionAnswerMapByGroupKey.set(normalizedGroupKey, new Map());
          }

          summaryCompletionAnswerMapByGroupKey.get(normalizedGroupKey).set(String(order), answer);
        };

        if (Array.isArray(part.question_sets)) {
          part.question_sets.forEach((questionSet) => {
            const groupKey = String(questionSet?.id || questionSet?.title || questionSet?.question_set_id || '').trim();
            const summaryQuestions = Array.isArray(questionSet?.questions) ? questionSet.questions : [];
            summaryQuestions.forEach((question) => registerSummaryAnswer(groupKey, question));
          });
        }

        if (Array.isArray(part.questions)) {
          part.questions.forEach((question) => {
            const groupKey = String(question?.shared_question_group_key || question?.question_set_id || question?.group?.id || question?.group?.type || '').trim();
            registerSummaryAnswer(groupKey, question);
          });
        }

        if (Array.isArray(part.question_sets)) {
          part.question_sets.forEach((questionSet) => {
            const key = String(questionSet?.id || questionSet?.title || questionSet?.question_set_id || '').trim();
            if (!key) {
              return;
            }

            const rawTypeKey = normalizeTypeKey(
              questionSet?.question_type
              || questionSet?.type
              || questionSet?.kind
              || questionSet?.question_type_id
              || ''
            );
            questionGroupMetaByKey.set(key, {
              title: String(questionSet?.title || '').trim(),
              description: collectHtmlMarkup(questionSet?.description),
              content: collectHtmlMarkup(questionSet?.content),
              rawTypeKey
            });
          });
        }

        for (const question of partQuestions) {
          if (testMode && lines.length > 0) {
            lines.push({ type: 'pageBreak', text: '' });
          }

          if (testMode) {
            const testTypeText = String(
              question?.type
              || question?.question_type
              || getQuestionRawTypeKey(question)
              || 'Question'
            ).trim();
            lines.push({ type: 'heading', text: `Questions and answers => ${testTypeText}` });
          }

          const questionGroupKey = String(question.shared_question_group_key || '').trim();
          const questionGroupMeta = questionGroupMetaByKey.get(questionGroupKey) || {};
          const questionGroupTitle = String(questionGroupMeta.title || '').trim();
          const questionGroupDescription = String(questionGroupMeta.description || '').trim();
          const questionGroupContent = String(questionGroupMeta.content || '').trim();
          const questionGroupRawTypeKey = String(questionGroupMeta.rawTypeKey || '').trim();
          const currentRawTypeKey = getQuestionRawTypeKey(question);
          const multipleChoiceManyOptions = currentRawTypeKey === 'MULTIPLE_CHOICE_MANY'
            ? formatMultipleChoiceManyOptions(question)
            : [];

          if (questionGroupKey && questionGroupTitle && !emittedSharedQuestionGroups.has(questionGroupKey)) {
            lines.push({
              type: 'questionGroup',
              text: `${questionGroupTitle.replaceAll(/:\s*$/g, '')}:`,
              rawTypeKey: currentRawTypeKey,
              questionOrder: String(question.order || '').trim()
            });
            emittedSharedQuestionGroups.add(questionGroupKey);
          }

          if (questionGroupKey && questionGroupDescription && !emittedSharedQuestionDescriptions.has(questionGroupKey)) {
            lines.push({
              type: 'questionDescriptionHtml',
              html: questionGroupDescription,
              options: { size: '26', color: '2A5A78' }
            });
            emittedSharedQuestionDescriptions.add(questionGroupKey);
          }

          const sharedQuestionContentKey = currentRawTypeKey === 'MULTIPLE_CHOICE_MANY'
            ? questionGroupKey
            : questionGroupKey;

          if (questionGroupKey && !emittedSharedQuestionContents.has(sharedQuestionContentKey)) {
            const matchingSharedQuestions = partQuestions.filter((item) => String(item.shared_question_group_key || item.question_set_id || '').trim() === questionGroupKey && getQuestionRawTypeKey(item) === currentRawTypeKey);
            const renderedContentHtml = currentRawTypeKey === 'MATCHING_INFO'
              ? buildMatchingInfoContentHtml(
                partQuestions.filter((item) => String(item.shared_question_group_key || item.question_set_id || '').trim() === questionGroupKey && getQuestionRawTypeKey(item) === 'MATCHING_INFO')
              )
              : (currentRawTypeKey === 'MATCHING_FEATURES'
                ? buildMatchingFeaturesContentHtml(matchingSharedQuestions)
                : (currentRawTypeKey === 'MATCHING_ENDINGS'
                  ? buildMatchingEndingsContentHtml(matchingSharedQuestions)
                : ((questionGroupContent && (questionGroupRawTypeKey === 'SUMMARY_COMPLETION' || currentRawTypeKey === 'SUMMARY_COMPLETION' || questionGroupRawTypeKey === 'SENTENCE_COMPLETION' || currentRawTypeKey === 'SENTENCE_COMPLETION' || questionGroupRawTypeKey === 'SHORT_ANSWER' || currentRawTypeKey === 'SHORT_ANSWER'))
                ? injectSummaryCompletionAnswers(questionGroupContent, summaryCompletionAnswerMapByGroupKey.get(questionGroupKey) || new Map())
                : ((questionGroupContent && (questionGroupRawTypeKey === 'MAP_DIAGRAM_LABEL' || currentRawTypeKey === 'MAP_DIAGRAM_LABEL'))
                  ? injectMapDiagramLabelAnswers(questionGroupContent, summaryCompletionAnswerMapByGroupKey.get(questionGroupKey) || new Map())
                  : questionGroupContent))));

            if (currentRawTypeKey === 'MATCHING_FEATURES' || currentRawTypeKey === 'MATCHING_ENDINGS' || currentRawTypeKey === 'MATCHING_HEADINGS' || currentRawTypeKey === 'MATCHING_HEADING' || currentRawTypeKey === 'MULTIPLE_CHOICE_MANY') {
              const renderedOptionsHtml = currentRawTypeKey === 'MULTIPLE_CHOICE_MANY'
                ? ''
                : buildMatchingFeatureOptionsHtml(matchingSharedQuestions);
              const renderedPromptHtml = currentRawTypeKey === 'MULTIPLE_CHOICE_MANY'
                ? `<strong>${buildMultipleChoiceManyOrderRange(question)}</strong> ${buildMultipleChoiceManyPromptHtml([question])}`.trim()
                : '';
              if (renderedPromptHtml) {
                lines.push({
                  type: 'questionDescriptionHtml',
                  html: renderedPromptHtml,
                  options: { size: '26' }
                });
              }
              if (renderedOptionsHtml) {
                lines.push({
                  type: 'questionDescriptionHtml',
                  html: renderedOptionsHtml,
                  options: { size: '26', color: '2A5A78' }
                });
              }
              if (currentRawTypeKey === 'MULTIPLE_CHOICE_MANY') {
                labelIndexedOptions(multipleChoiceManyOptions)
                  .forEach((option) => {
                    lines.push({
                      type: 'choice',
                      text: formatOptionText(option),
                      correct: option.correct
                    });
                  });
              }
            }

            if (renderedContentHtml) {
              lines.push({
                type: 'questionDescriptionHtml',
                html: renderedContentHtml,
                  options: (currentRawTypeKey === 'MATCHING_INFO' || currentRawTypeKey === 'MATCHING_FEATURES' || currentRawTypeKey === 'MATCHING_HEADINGS' || currentRawTypeKey === 'MATCHING_HEADING')
                  ? { size: '24', indentLeft: '720' }
                  : undefined
                });
            }

            if (renderedContentHtml || currentRawTypeKey === 'MATCHING_FEATURES' || currentRawTypeKey === 'MATCHING_ENDINGS' || currentRawTypeKey === 'MATCHING_HEADINGS' || currentRawTypeKey === 'MATCHING_HEADING' || currentRawTypeKey === 'MULTIPLE_CHOICE_MANY') {
              emittedSharedQuestionContents.add(sharedQuestionContentKey);
            }
          }

          if (getQuestionRawTypeKey(question) === 'MATCHING_INFO') {
            if (!emittedQuestionOrders.has(String(question.order))) {
              lines.push({
                type: 'questionTitle',
                questionInfoText: questionInfoTextFor(question),
                text: `Question ${question.order}.`,
                order: question.order,
                rawTypeKey: 'MATCHING_INFO'
              });
              addExplanationLines(lines, question, question.order, explanationsByOrder, {
                answer: '',
                questionText: ''
              }, useReadingExplanation);
              emittedQuestionOrders.add(String(question.order));
            }
            continue;
          }

          if (isFillInTheBlankQuestion(question)) {
            const rawTypeKey = getQuestionRawTypeKey(question);
            const answers = extractMarkedAnswers(question.gap_fill_in_blank);

            lines.push({
              type: 'questionGapHtml',
              rawTypeKey,
              html: htmlWithBlankPlaceholders(question.gap_fill_in_blank)
            });

            answers.forEach((answer) => {
              const order = answer.order || question.order;
              if (order && emittedQuestionOrders.has(String(order))) {
                return;
              }

              const questionLabel = rawTypeKey === 'MAP_DIAGRAM_LABEL' && String(answer.questionText || '').trim() === '-' && order
                ? `- [__${order}__]`
                : formatGapQuestionLabel(answer.questionText, order, rawTypeKey);

              lines.push({ type: 'questionTitle',
                questionInfoText: questionInfoTextFor(question), text: order ? `Question ${order}.` : 'Question', order, rawTypeKey });
              lines.push({ type: 'questionText', text: questionLabel });
              addExplanationLines(lines, question, order, explanationsByOrder, { answer: answer.answer }, useReadingExplanation);
              if (order) {
                emittedQuestionOrders.add(String(order));
              }
            });

            continue;
          }

          const markedAnswers = extractMarkedAnswers(question.gap_fill_in_blank);
          const selectionAnswers = formatSelectionQuestion(question);
          const rawAnswers = markedAnswers.length > 0 ? markedAnswers : selectionAnswers;
          const answers = rawAnswers.filter((answer) => !answer.order || !emittedQuestionOrders.has(String(answer.order)));
          const fallback = htmlToText(question.text || question.content || question.title);
          const rawTypeKey = getQuestionRawTypeKey(question);
          const isMultipleChoiceOne = rawTypeKey === 'MULTIPLE_CHOICE_ONE';
          const isMatchingFeatures = rawTypeKey === 'MATCHING_FEATURES';
          const isMatchingHeadings = rawTypeKey === 'MATCHING_HEADINGS' || rawTypeKey === 'MATCHING_HEADING';
          const isSharedOptionGroup = isMatchingFeatures || isMatchingHeadings || rawTypeKey === 'MATCHING_ENDINGS';
          const singleChoiceOptions = normalizeTypeKey(question.question_type) === 'MULTIPLE_CHOICE_ONE'
            || normalizeTypeKey(question.type) === 'MULTIPLE_CHOICE_ONE'
            ? formatSingleChoiceRadio(question)
            : [];
          const sharedOptions = formatSharedOptions(question);
          const selectionOptions = (isMatchingFeatures || isMatchingHeadings)
            ? formatSelectionOptions(question)
            : [];
          const matchingFeatureOptions = isSharedOptionGroup
            ? (sharedOptions.length > 0 ? sharedOptions : selectionOptions)
            : [];
          const renderSharedOptions = isSharedOptionGroup ? matchingFeatureOptions : sharedOptions;
          const matchingFeatureGroupKey = isSharedOptionGroup
            ? String(question.shared_option_group_key || question.shared_question_group_key || question.question_set_id || question.group?.id || question.group?.type || question.order || '').trim()
            : '';
          const choiceOptions = singleChoiceOptions.length > 0
            ? singleChoiceOptions
            : (multipleChoiceManyOptions.length > 0
              ? multipleChoiceManyOptions
              : (isSharedOptionGroup && matchingFeatureOptions.length > 0
                ? matchingFeatureOptions
                : (selectionOptions.length > 0 ? selectionOptions : formatChoiceOptions(question))));
          const choiceAnswer = getChoiceAnswer(question, choiceOptions);
          const directAnswer = getDirectAnswer(question);
          const statementChoiceOptions = isStatementQuestionType(rawTypeKey)
            ? buildStatementChoiceOptions(rawTypeKey, directAnswer || fallback)
            : (choiceOptions.length > 0 ? choiceOptions : []);
          const renderedChoiceOptions = isMultipleChoiceOne
            ? (singleChoiceOptions.length > 0 ? singleChoiceOptions : choiceOptions)
              : (rawTypeKey === 'MULTIPLE_CHOICE_MANY' && multipleChoiceManyOptions.length > 0
                ? multipleChoiceManyOptions
                : (isSharedOptionGroup && matchingFeatureOptions.length > 0
                  ? matchingFeatureOptions
                  : (sharedOptions.length > 0 ? sharedOptions : choiceOptions)));

          if (isSharedOptionGroup) {
            if (!emittedMatchingFeatureGroups.has(matchingFeatureGroupKey)) {
              emittedMatchingFeatureGroups.add(matchingFeatureGroupKey);
            }

            if (rawTypeKey === 'MATCHING_FEATURES' || rawTypeKey === 'MATCHING_ENDINGS') {
              if (!emittedQuestionOrders.has(String(question.order))) {
                lines.push({
                  type: 'questionTitle',
                questionInfoText: questionInfoTextFor(question),
                  text: `Question ${question.order}.`,
                  order: question.order,
                  rawTypeKey
                });
                addExplanationLines(lines, question, question.order, explanationsByOrder, {
                  answer: (rawTypeKey === 'MATCHING_HEADINGS' || rawTypeKey === 'MATCHING_HEADING') ? '' : choiceAnswer,
                  questionText: fallback,
                  choices: renderedChoiceOptions.map((option) => ({
                    ...option,
                    displayText: formatOptionText(option),
                    rawText: option.text,
                    correct: option.correct || option.option === choiceAnswer
                  }))
                }, useReadingExplanation);
                emittedQuestionOrders.add(String(question.order));
              }
              continue;
            }

            if ((fallback || directAnswer) && !emittedQuestionOrders.has(String(question.order))) {
              lines.push({
                type: 'questionTitle',
                questionInfoText: questionInfoTextFor(question),
                text: `Question ${question.order}.`,
                questionText: isStatementQuestionType(rawTypeKey) ? (fallback || directAnswer || '') : '',
                order: question.order,
                rawTypeKey
              });
              if (fallback && !isStatementQuestionType(rawTypeKey) && !isMatchingHeadings) {
                lines.push({ type: 'questionText', text: fallback });
              }
              addExplanationLines(lines, question, question.order, explanationsByOrder, {
                answer: choiceAnswer,
                questionText: fallback,
                choices: renderedChoiceOptions.map((option) => ({
                  ...option,
                  displayText: formatOptionText(option),
                  rawText: option.text,
                  correct: isStatementQuestionType(rawTypeKey)
                    ? option.correct
                    : (option.correct || option.option === choiceAnswer)
                }))
              }, useReadingExplanation);
              emittedQuestionOrders.add(String(question.order));
            }
            continue;
          }

          if (rawTypeKey === 'MULTIPLE_CHOICE_MANY') {
            const baseOrder = Number.parseInt(question.order, 10);
            const correctOptions = renderedChoiceOptions.filter((option) => option.correct);
            const multiAnswers = correctOptions.length > 0
              ? correctOptions.map((option, index) => ({
                option,
                order: Number.isInteger(baseOrder) ? baseOrder + index : question.order
              }))
              : [{
                option: {
                  option: choiceAnswer || '',
                  text: '',
                  correct: true
                },
                order: question.order || ''
              }];
            const explanationChunks = extractMultipleChoiceManyExplanationChunks(question.explain);

            multiAnswers.forEach(({ option, order }, index) => {
              const resolvedOrder = order || (multiAnswers.length === 1 ? question.order : Number.parseInt(question.order, 10) + index);
              const orderKey = String(resolvedOrder || '');
              if (orderKey && emittedQuestionOrders.has(orderKey)) {
                return;
              }

              const optionLabel = normalizeChoiceLabel(option.option);
              const rowExplain = trimMultipleChoiceManyExplanationToFirstBlock(explanationChunks.get(optionLabel) || question.explain || '');
              const rowQuestion = {
                ...question,
                explain: rowExplain,
                correct_answer: option.option,
                correct_answers: [option.option]
              };

              lines.push({
                type: 'questionTitle',
                questionInfoText: questionInfoTextFor(question, index),
                text: resolvedOrder ? `Question ${resolvedOrder}.` : 'Question',
                questionText: '',
                order: resolvedOrder,
                rawTypeKey
              });
              const keywords = extractQuestionKeywords(rowQuestion);
              const answerText = String(option.rawText ?? option.text ?? '').trim() || formatOptionText(option);
              const choiceTextMap = new Map([
                ...collectGroupChoiceTextMap(question).entries(),
                ...collectQuestionChoiceTextMap(question).entries()
              ]);
              const normalizedExplanation = normalizeExplanationHtml(
                rowExplain,
                [option.option],
                choiceTextMap,
                rawTypeKey
              );

              if (String(process.env.E_LEARNING_DEBUG_READING || '').trim().toLowerCase() === 'true' && (String(question.order || '') === '23' || /Đáp\s*án\s+[A-Z0-9IVXLCDM]+/i.test(String(rowExplain || '')) || /Đáp\s*án\s+[A-Z0-9IVXLCDM]+/i.test(String(normalizedExplanation || '')))) {
                console.log('[reading][MULTIPLE_CHOICE_MANY]', {
                  order: question.order,
                  option: option.option,
                  answerText,
                  rowExplain,
                  normalizedExplanation
                });
              }

              if (keywords.length > 0) {
                lines.push({
                  type: 'questionKeywordsBlock',
                  keywords
                });
              }

              if (String(normalizedExplanation ?? '').trim()) {
                lines.push({
                  type: 'questionExplanationBlock',
                  explanationHtml: normalizedExplanation,
                  answerTokens: [option.option],
                  answerTextMap: new Map([[normalizeChoiceLabel(option.option), answerText]]),
                  rawTypeKey
                });
              }
              if (orderKey) {
                emittedQuestionOrders.add(orderKey);
              }
            });
            continue;
          }

          if (rawTypeKey === 'SUMMARY_COMPLETION' && !emittedQuestionOrders.has(String(question.order))) {
            lines.push({
              type: 'questionTitle',
                questionInfoText: questionInfoTextFor(question),
              text: `Question ${question.order}.`,
              questionText: '',
              order: question.order,
              rawTypeKey
            });
            addExplanationLines(lines, question, question.order, explanationsByOrder, {
              answer: '',
              questionText: fallback
            }, useReadingExplanation);
            emittedQuestionOrders.add(String(question.order));
            continue;
          }

          if (answers.length === 0 && choiceOptions.length > 0 && !isStatementQuestionType(rawTypeKey) && !isMatchingHeadings) {
            if (!emittedQuestionOrders.has(String(question.order))) {
              const promptHtml = String(question.text || question.content || question.title || '').trim();
              lines.push({
                type: 'questionTitle',
                questionInfoText: questionInfoTextFor(question),
                text: `Question ${question.order}`,
                questionHtml: isMultipleChoiceOne ? promptHtml : '',
                order: question.order,
                rawTypeKey
              });
              if (!isMultipleChoiceOne && fallback && !isInstructionQuestionGroupType(rawTypeKey)) {
                lines.push({ type: 'questionText', text: fallback });
              }
              if (isMultipleChoiceOne) {
                labelIndexedOptions(renderedChoiceOptions).forEach((option) => {
                  lines.push({
                    type: 'choice',
                    text: formatOptionText(option),
                    correct: option.correct || option.option === choiceAnswer
                  });
                });
              } else if (!isSharedOptionGroup) {
                pushSharedOptions(lines, renderSharedOptions, emittedSharedOptionGroups, question.shared_option_group_key);
                if (renderSharedOptions.length === 0) {
                  choiceOptions.forEach((option) => {
                    lines.push({
                      type: 'choice',
                      text: formatOptionText(option),
                      correct: option.correct || option.option === choiceAnswer
                    });
                  });
                }
              }
              addExplanationLines(lines, question, question.order, explanationsByOrder, {
                answer: (isMultipleChoiceOne || rawTypeKey === 'MULTIPLE_CHOICE_MANY') ? '' : choiceAnswer,
                questionText: fallback,
                choices: renderedChoiceOptions.map((option) => ({
                  ...option,
                  displayText: formatOptionText(option),
                    rawText: option.text,
                    correct: option.correct || option.option === choiceAnswer
                }))
              }, useReadingExplanation);
              emittedQuestionOrders.add(String(question.order));
            }
            continue;
          }

          if (answers.length === 0 && (statementChoiceOptions.length > 0 || choiceOptions.length > 0) && isStatementQuestionType(rawTypeKey)) {
            if (!emittedQuestionOrders.has(String(question.order))) {
              const promptHtml = String(question.text || question.content || question.title || fallback || '').trim();
              lines.push({
                type: 'questionTitle',
                questionInfoText: questionInfoTextFor(question),
                text: `Question ${question.order}`,
                questionHtml: promptHtml,
                order: question.order,
                rawTypeKey
              });
              if (statementChoiceOptions.length > 0) {
                labelIndexedOptions(statementChoiceOptions).forEach((option) => {
                  lines.push({
                    type: 'choice',
                    text: formatOptionText(option),
                    correct: option.correct
                  });
                });
              }
              addExplanationLines(lines, question, question.order, explanationsByOrder, {
                answer: '',
                questionText: fallback,
                choices: renderedChoiceOptions.map((option) => ({
                  ...option,
                  displayText: formatOptionText(option),
                  rawText: option.text,
                  correct: option.correct
                }))
              }, useReadingExplanation);
              emittedQuestionOrders.add(String(question.order));
            }
            continue;
          }

          if (answers.length === 0 && !isMatchingHeadings) {
            if ((fallback || directAnswer) && !emittedQuestionOrders.has(String(question.order))) {
              const questionTitleText = `Question ${question.order}.`;
              lines.push({
                type: 'questionTitle',
                questionInfoText: questionInfoTextFor(question),
                text: questionTitleText,
                questionText: isStatementQuestionType(rawTypeKey) ? (fallback || directAnswer || `- [__${question.order}__]`) : '',
                order: question.order,
                rawTypeKey
              });
              if (fallback && !isStatementQuestionType(rawTypeKey)) {
                lines.push({
                  type: 'questionText',
                  text: fallback
                });
              }
              if (statementChoiceOptions.length > 0) {
                labelIndexedOptions(statementChoiceOptions).forEach((option) => {
                  lines.push({
                    type: 'choice',
                    text: formatOptionText(option),
                    correct: option.correct
                  });
                });
              }
              addExplanationLines(lines, question, question.order, explanationsByOrder, {
                answer: '',
                questionText: fallback
              }, useReadingExplanation);
              emittedQuestionOrders.add(String(question.order));
            }
            continue;
          }

          if (answers.length === 0 && isMatchingHeadings) {
            if ((fallback || directAnswer) && !emittedQuestionOrders.has(String(question.order))) {
              const questionTitleText = `Question ${question.order}.`;
              lines.push({
                type: 'questionTitle',
                questionInfoText: questionInfoTextFor(question),
                text: questionTitleText,
                questionHtml: String(question.text || question.content || question.title || fallback || '').trim(),
                order: question.order,
                rawTypeKey
              });
              addExplanationLines(lines, question, question.order, explanationsByOrder, {
                answer: '',
                questionText: fallback,
                choices: renderedChoiceOptions.map((option) => ({
                  ...option,
                  displayText: formatOptionText(option),
                  correct: option.correct
                }))
              }, useReadingExplanation);
              emittedQuestionOrders.add(String(question.order));
            }
            continue;
          }

          answers.forEach((answer, index) => {
            const order = answer.order || (answers.length === 1 ? question.order : question.order + index);
            const promptText = formatGapQuestionLabel(
              answer.questionText || (rawTypeKey === 'SUMMARY_COMPLETION' ? fallback : ''),
              order,
              rawTypeKey
            );
            const questionTitleText = `Question ${order}.`;
            lines.push({
              type: 'questionTitle',
                questionInfoText: questionInfoTextFor(question),
              text: order ? questionTitleText : 'Question',
              questionText: (isStatementQuestionType(rawTypeKey) || rawTypeKey === 'SUMMARY_COMPLETION') ? promptText : '',
              answerText: rawTypeKey === 'SUMMARY_COMPLETION' ? String(answer.answer || directAnswer || '').trim() : '',
              order,
              rawTypeKey
            });
            if (!isStatementQuestionType(rawTypeKey) && rawTypeKey !== 'SUMMARY_COMPLETION' && rawTypeKey !== 'MULTIPLE_CHOICE_MANY') {
              lines.push({ type: 'questionText', text: promptText });
            }
            if (isMultipleChoiceOne) {
              labelIndexedOptions(renderedChoiceOptions).forEach((option) => {
                lines.push({
                  type: 'choice',
                  text: formatOptionText(option),
                  correct: option.correct || option.option === choiceAnswer
                });
              });
            } else if (statementChoiceOptions.length > 0) {
              labelIndexedOptions(statementChoiceOptions).forEach((option) => {
                lines.push({
                  type: 'choice',
                  text: formatOptionText(option),
                  correct: option.correct
                });
              });
            } else if (rawTypeKey !== 'MULTIPLE_CHOICE_MANY' && !isSharedOptionGroup) {
              pushSharedOptions(lines, renderSharedOptions, emittedSharedOptionGroups, question.shared_option_group_key);
            }
            addExplanationLines(lines, question, order, explanationsByOrder, {
              answer: (isMultipleChoiceOne || rawTypeKey === 'MULTIPLE_CHOICE_MANY' || isStatementQuestionType(rawTypeKey)) ? '' : answer.answer,
              questionText: answer.questionText,
              choices: renderedChoiceOptions.map((option) => ({
                ...option,
                displayText: formatOptionText(option),
                rawText: option.text,
                correct: option.correct || option.option === choiceAnswer
              }))
            }, useReadingExplanation);
            if (order) {
              emittedQuestionOrders.add(String(order));
            }
          });
        }
      }
    });

    if (lines.length > 0) {
      return lines;
    }

    return [{ type: 'text', text: JSON.stringify(result, null, 2) }];
  }

  function buildCleanExportRecord({ id, result, quizTypeOverride }) {
    const data = result?.data ?? result ?? {};
    const quizType = resolveQuizType(resolveEffectiveQuizType(quizTypeOverride, data?.quiz_type));

    const parts = extractYouPassParts(data).map((part, partIndex) => {
      const passage = splitPassageContent(part, data);
      const questionSets = Array.isArray(part.question_sets) ? part.question_sets.map((questionSet, setIndex) => ({
        index: setIndex + 1,
        id: questionSet.id || '',
        title: htmlToText(questionSet.title),
        description: splitTextLines(htmlToText(questionSet.description)),
        content: splitTextLines(collectHtmlContent(questionSet.content, htmlToText)),
        question_type: getQuestionTypeLabel(questionSet) || '',
        question_type_raw: getQuestionRawTypeText(questionSet),
        questions: (questionSet.questions || []).map((question) => ({
          order: question.order || '',
          questionText: htmlToText(question.text || question.content || question.title),
          rawType: question.question_type || question.type || question.kind || question.question_type_id || '',
          type: getQuestionTypeLabel(question) || '',
          selection: formatSelectionQuestion(question),
          choices: formatChoiceOptions(question),
          sharedOptions: formatSharedOptions(question),
          gap_fill_in_blank: isFillInTheBlankQuestion(question)
            ? splitTextLines(htmlToTextWithBlankPlaceholders(question.gap_fill_in_blank))
            : []
        }))
      })) : [];

      const questions = getPartQuestions(part).flatMap((question) => {
        const rawType = question.question_type || question.type || question.kind || question.question_type_id || '';
        const typeLabel = getQuestionTypeLabel(question);
        const groupDescription = splitTextLines(htmlToText(question.description));
        const questionText = htmlToText(question.text || question.content || question.title);
        const blankText = isFillInTheBlankQuestion(question)
          ? htmlToTextWithBlankPlaceholders(question.gap_fill_in_blank)
          : '';
        const areaOfInformation = formatAreaOfInformation(question);
        const keywords = extractQuestionKeywords(question);
        const explanation = splitTextLines(htmlToText(question.explain));
        const choiceOptions = formatChoiceOptions(question);
        const sharedOptions = formatSharedOptions(question);
        const selectionOptions = rawType === 'MATCHING_FEATURES' ? formatSelectionOptions(question) : [];
        const matchingFeatureOptions = rawType === 'MATCHING_FEATURES'
          ? (sharedOptions.length > 0 ? sharedOptions : selectionOptions)
          : [];
        const selectionAnswers = formatSelectionQuestion(question);
        const markedAnswers = extractMarkedAnswers(question.gap_fill_in_blank);
        const directAnswer = getDirectAnswer(question);
        const choiceAnswer = getChoiceAnswer(question, choiceOptions);

        const baseQuestion = {
          partIndex: partIndex + 1,
          passageNumber: part.passage || part.sort || partIndex + 1,
          order: question.order || '',
          group: {
            type: typeLabel,
            description: groupDescription
          },
          rawType,
          type: typeLabel,
          questionText,
          blankText,
          selection: selectionAnswers,
          choices: rawType === 'MATCHING_FEATURES'
            ? matchingFeatureOptions
            : (selectionOptions.length > 0 ? selectionOptions : choiceOptions),
          sharedOptions: rawType === 'MATCHING_FEATURES' && matchingFeatureOptions.length > 0
            ? matchingFeatureOptions
            : sharedOptions,
          areaOfInformation,
          keywords,
          explanation
        };

        if (markedAnswers.length > 0) {
          return markedAnswers.map((answer) => ({
            ...baseQuestion,
            order: answer.order || question.order || '',
            questionText: answer.questionText || questionText || blankText,
            answer: answer.answer || '',
            answers: markedAnswers.map((item) => ({
              order: item.order || '',
              questionText: item.questionText || '',
              answer: item.answer || ''
            }))
          }));
        }

        if (selectionAnswers.length > 0) {
          return selectionAnswers.map((answer) => ({
            ...baseQuestion,
            order: answer.order || question.order || '',
            questionText: answer.questionText || questionText || blankText,
            answer: answer.answer || '',
            answers: selectionAnswers.map((item) => ({
              order: item.order || '',
              questionText: item.questionText || '',
              answer: item.answer || ''
            }))
          }));
        }

        if (choiceOptions.length > 0) {
          return [{
            ...baseQuestion,
            answer: choiceAnswer || '',
            answers: [{
              order: question.order || '',
              questionText,
              answer: choiceAnswer || ''
            }]
          }];
        }

        return [{
          ...baseQuestion,
          answer: directAnswer || '',
          answers: [{
            order: question.order || '',
            questionText: questionText || blankText,
            answer: directAnswer || ''
          }]
        }];
      });

      return {
        index: partIndex + 1,
        passageNumber: part.passage || part.sort || partIndex + 1,
        passage: {
          title: passage.title,
          content: passage.bodyLines
        },
        questionSets,
        questions
      };
    });

    return {
      exportedAt: new Date().toISOString(),
      id: String(id ?? ''),
      skill: quizType,
      title: htmlToText(data.title),
      parts
    };
  }

  return {
    formatYouPassResult,
    buildCleanExportRecord
  };
}

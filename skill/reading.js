import { decodeHtmlEntities, htmlToText, htmlToTextWithBlankPlaceholders, htmlWithBlankPlaceholders, splitTextLines } from './helper.js';
import { normalizeExplanationHtml } from './common.js';
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

const YOUPASS_QUESTION_TYPES = {
  MULTIPLE_CHOICE: IELTS_TYPES[1],
  MULTIPLE_CHOICE_ONE: IELTS_TYPES[1],
  MULTIPLE_SELECTION: IELTS_TYPES[1],
  SINGLE_CHOICE: IELTS_TYPES[1],
  SINGLE_SELECTION: IELTS_TYPES[1],
  TRUE_FALSE_NOT_GIVEN: IELTS_TYPES[2],
  YES_NO_NOT_GIVEN: IELTS_TYPES[2],
  MATCHING_HEADINGS: IELTS_TYPES[3],
  MATCHING_HEADING: IELTS_TYPES[3],
  MATCHING_NAMES: IELTS_TYPES[6],
  MATCHING_INFO: IELTS_TYPES[6],
  SENTENCE_MATCHING: IELTS_TYPES[6],
  FILL_BLANK: IELTS_TYPES[5],
  FILL_IN_THE_BLANK: IELTS_TYPES[5],
  SENTENCE_COMPLETION: IELTS_TYPES[5],
  SHORT_ANSWER: IELTS_TYPES[4],
  LABELING_DIAGRAM: IELTS_TYPES[7],
  LABELLING_DIAGRAM: IELTS_TYPES[7],
  SUMMARY_COMPLETION: IELTS_TYPES[8],
  DIAGRAM_COMPLETION: IELTS_TYPES[9],
  NOTE_COMPLETION: IELTS_TYPES[10],
  TABLE_COMPLETION: IELTS_TYPES[10],
  FLOW_COMPLETION: IELTS_TYPES[10],
  OTHERS: IELTS_TYPES[4]
};

export function splitPassageContent(part, data) {
  const bodyLines = extractVocabPassageLines(part.vocabs);
  const fallbackTitle = part.title || cleanQuizTitle(data?.title);
  const title = fallbackTitle;

  return {
    title,
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

    const key = normalizeTypeKey(candidate);
    if (YOUPASS_QUESTION_TYPES[key]) {
      return YOUPASS_QUESTION_TYPES[key];
    }
  }

  return '';
}

export function isFillInTheBlankQuestion(question) {
  return normalizeTypeKey(question.type) === 'FILL_IN_THE_BLANK'
    || (normalizeTypeKey(question.question_type) === 'FILL_BLANK' && Boolean(question.gap_fill_in_blank));
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
  return (question.selection || []).map((item) => ({
    order: question.order,
    questionText: htmlToText(item.text),
    answer: htmlToText(item.answer)
  }));
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
  const descriptionHtml = String(question.description ?? '').trim();
  const descriptionLines = splitTextLines(htmlToText(descriptionHtml));
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(descriptionHtml);

  if (descriptionLines.length > 0) {
    if (typeLabel && /^Questions?\s+\d/i.test(descriptionLines[0])) {
      const firstLine = descriptionLines[0].replaceAll(/:\s*$/g, '');
      return [
        `${firstLine}: ${typeLabel}`,
        ...(hasHtml ? [{ type: 'questionDescriptionHtml', html: descriptionHtml }] : descriptionLines.slice(1))
      ];
    }

    if (typeLabel) {
      return [
        `Type: ${typeLabel}`,
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
    return [`Type: ${typeLabel}`];
  }

  return [`Questions ${orderRange}: ${typeLabel}`];
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
  const choices = Array.isArray(details.choices) ? details.choices : [];

  choices.forEach((choice, index) => {
    if (!choice) {
      return;
    }

    const rawValue = String(choice.text ?? choice.displayText ?? '').trim();
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

  if (answer && rawTypeKey !== 'MULTIPLE_CHOICE_ONE' && rawTypeKey !== 'MULTIPLE_CHOICE_MANY') {
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
    const sharedQuestionContent = collectHtmlContent(questionSet.content);
    const sharedQuestionGroupKey = questionSet.id || questionSet.title || questionSet.question_set_id || '';

    return {
      ...question,
      question_type: question.question_type || questionSet.question_type,
      description: index === 0
        ? [questionSet.title, htmlToText(questionSet.description)].filter(Boolean).join('<br>')
        : question.description,
      shared_question_content: index === 0 ? sharedQuestionContent : '',
      shared_question_group_key: sharedQuestionGroupKey,
      shared_options: Array.isArray(questionSet.options) && questionSet.options.length > 0 ? questionSet.options : null,
      shared_option_group_key: sharedQuestionGroupKey
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

export function createReadingCore() {
  function formatYouPassResult(result, quizTypeOverride) {
    const data = result?.data ?? result;
    const parts = extractYouPassParts(data);
    const quizTypeKey = resolveQuizType(quizTypeOverride ?? data?.quiz_type).key;
    const useReadingExplanation = quizTypeKey === 'reading';
    const lines = [];

    lines.push({ type: 'readingTestTitle', text: 'Test 1' });

    if (data?.instruction) {
      lines.push({ type: 'heading', text: 'Instruction' });
      splitTextLines(htmlToText(data.instruction)).forEach((line) => lines.push({ type: 'text', text: line }));
    }

    parts.forEach((part, partIndex) => {
      const passageNumber = part.passage || part.sort || partIndex + 1;
      if (partIndex > 0) {
        lines.push({ type: 'pageBreak', text: '' });
      }
      lines.push({ type: 'passageLabel', text: `PASSAGE ${passageNumber}` });

      const passage = splitPassageContent(part, data);
      if (passage.title || passage.bodyLines.length > 0) {
        if (passage.title) {
          lines.push({ type: 'passageTitle', text: passage.title });
        }
        passage.bodyLines.forEach((line) => lines.push({ type: 'passageText', text: line }));
      }

      const partQuestions = getPartQuestions(part);
      if (partQuestions.length > 0) {
        lines.push({ type: 'heading', text: 'Questions and answers' });
        const emittedQuestionOrders = new Set();
        const emittedSharedOptionGroups = new Set();
        const emittedSharedQuestionGroups = new Set();
        const explanationsByOrder = buildExplanationMap(partQuestions);

        for (const question of partQuestions) {
          if (isFillInTheBlankQuestion(question)) {
            const rawTypeKey = getQuestionRawTypeKey(question);
            const answers = extractMarkedAnswers(question.gap_fill_in_blank);

            pushQuestionGroupLines(lines, question, answers);

            const sharedQuestionGroupKey = String(question.shared_question_group_key || '').trim();
            if (sharedQuestionGroupKey && question.shared_question_content && !emittedSharedQuestionGroups.has(sharedQuestionGroupKey)) {
              lines.push({
                type: 'questionDescriptionHtml',
                html: question.shared_question_content
              });
              emittedSharedQuestionGroups.add(sharedQuestionGroupKey);
            }

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
                : answer.questionText;

              lines.push({ type: 'questionTitle', text: order ? `Question ${order}` : 'Question' });
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
          const singleChoiceOptions = normalizeTypeKey(question.question_type) === 'MULTIPLE_CHOICE_ONE'
            || normalizeTypeKey(question.type) === 'MULTIPLE_CHOICE_ONE'
            ? formatSingleChoiceRadio(question)
            : [];
          const multipleChoiceManyOptions = rawTypeKey === 'MULTIPLE_CHOICE_MANY'
            ? formatMultipleChoiceManyOptions(question)
            : [];
          const choiceOptions = singleChoiceOptions.length > 0
            ? singleChoiceOptions
            : (multipleChoiceManyOptions.length > 0 ? multipleChoiceManyOptions : formatChoiceOptions(question));
          const sharedOptions = formatSharedOptions(question);
          const renderedChoiceOptions = isMultipleChoiceOne
            ? (singleChoiceOptions.length > 0 ? singleChoiceOptions : choiceOptions)
              : (rawTypeKey === 'MULTIPLE_CHOICE_MANY' && multipleChoiceManyOptions.length > 0
                ? multipleChoiceManyOptions
                : (sharedOptions.length > 0 ? sharedOptions : choiceOptions))
            ;
          const choiceAnswer = getChoiceAnswer(question, choiceOptions);
          const directAnswer = getDirectAnswer(question);

          if (answers.length === 0 && choiceOptions.length > 0) {
            if (!emittedQuestionOrders.has(String(question.order))) {
              pushQuestionGroupLines(lines, question, [{ order: question.order }]);
              lines.push({ type: 'questionTitle', text: `Question ${question.order}` });
              if (fallback) {
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
              } else {
                pushSharedOptions(lines, sharedOptions, emittedSharedOptionGroups, question.shared_option_group_key);
                if (sharedOptions.length === 0) {
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
                  correct: option.correct || option.option === choiceAnswer
                }))
              }, useReadingExplanation);
              emittedQuestionOrders.add(String(question.order));
            }
            continue;
          }

          if (answers.length === 0) {
            if ((fallback || directAnswer) && !emittedQuestionOrders.has(String(question.order))) {
              pushQuestionGroupLines(lines, question, [{ order: question.order }]);
              const sharedQuestionGroupKey = String(question.shared_question_group_key || '').trim();
              if (sharedQuestionGroupKey && question.shared_question_content && !emittedSharedQuestionGroups.has(sharedQuestionGroupKey)) {
                lines.push({
                  type: 'questionDescriptionHtml',
                  html: question.shared_question_content
                });
                emittedSharedQuestionGroups.add(sharedQuestionGroupKey);
              }
              lines.push({ type: 'questionTitle', text: `Question ${question.order}` });
              lines.push({
                type: 'questionText',
                text: fallback || `- [__${question.order}__]`
              });
              addExplanationLines(lines, question, question.order, explanationsByOrder, {
                answer: directAnswer,
                questionText: fallback
              }, useReadingExplanation);
              emittedQuestionOrders.add(String(question.order));
            }
            continue;
          }

          pushQuestionGroupLines(lines, question, answers);

          if (rawTypeKey === 'MULTIPLE_CHOICE_MANY' && !emittedQuestionOrders.has(String(question.order))) {
            renderedChoiceOptions.forEach((option) => {
              lines.push({
                type: 'choice',
                text: formatOptionText(option),
                correct: option.correct
              });
            });
          }

          answers.forEach((answer, index) => {
            const order = answer.order || (answers.length === 1 ? question.order : question.order + index);
            lines.push({ type: 'questionTitle', text: order ? `Question ${order}` : 'Question' });
            lines.push({ type: 'questionText', text: answer.questionText });
            if (isMultipleChoiceOne) {
              labelIndexedOptions(renderedChoiceOptions).forEach((option) => {
                lines.push({
                  type: 'choice',
                  text: formatOptionText(option),
                  correct: option.correct || option.option === choiceAnswer
                });
              });
            } else if (rawTypeKey !== 'MULTIPLE_CHOICE_MANY') {
              pushSharedOptions(lines, sharedOptions, emittedSharedOptionGroups, question.shared_option_group_key);
            }
            addExplanationLines(lines, question, order, explanationsByOrder, {
              answer: (isMultipleChoiceOne || rawTypeKey === 'MULTIPLE_CHOICE_MANY') ? '' : answer.answer,
              questionText: answer.questionText,
              choices: renderedChoiceOptions.map((option) => ({
                ...option,
                displayText: formatOptionText(option),
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
    const quizType = resolveQuizType(quizTypeOverride ?? data?.quiz_type);

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
          choices: choiceOptions,
          sharedOptions,
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

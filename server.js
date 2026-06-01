import http from 'node:http';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_API_URL = 'https://api.youpass.vn/v1/quizzes/id?included_vocabs=true';

function readConfig() {
  if (!existsSync('config.json')) {
    return {};
  }

  return JSON.parse(readFileSync('config.json', 'utf8'));
}

const config = readConfig();
const PORT = Number(process.env.PORT || config.port || 3001);
const HOST = process.env.HOST || config.host || '127.0.0.1';
const API_URL = process.env.E_LEARNING_API_URL || config.apiUrl || DEFAULT_API_URL;

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

const contentTypes = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html; charset=utf-8',
  text: 'text/plain; charset=utf-8'
};

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
    hellip: '...',
    ndash: '-',
    mdash: '-',
    aacute: 'á',
    acirc: 'â',
    agrave: 'à',
    aring: 'å',
    atilde: 'ã',
    auml: 'ä',
    eacute: 'é',
    ecirc: 'ê',
    egrave: 'è',
    euml: 'ë',
    iacute: 'í',
    icirc: 'î',
    igrave: 'ì',
    iuml: 'ï',
    oacute: 'ó',
    ocirc: 'ô',
    ograve: 'ò',
    otilde: 'õ',
    ouml: 'ö',
    uacute: 'ú',
    ucirc: 'û',
    ugrave: 'ù',
    uuml: 'ü',
    yacute: 'ý',
    yuml: 'ÿ',
    ccedil: 'ç',
    ntilde: 'ñ'
  };

  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const key = entity.toLowerCase();

    if (key.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    }

    if (key.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    }

    return namedEntities[key] ?? match;
  });
}

function htmlToText(value) {
  return decodeHtmlEntities(
    String(value ?? '')
      .replaceAll(/\{\[([\s\S]*?)\]\[[^\]]+\]\}/g, '$1')
      .replaceAll(/<script[\s\S]*?<\/script>/gi, '')
      .replaceAll(/<style[\s\S]*?<\/style>/gi, '')
      .replaceAll(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)>/gi, '\n')
      .replaceAll(/<li[^>]*>/gi, '- ')
      .replaceAll(/<t[dh][^>]*>/gi, ' ')
      .replaceAll(/<[^>]+>/g, '')
  )
    .replaceAll(/\r/g, '')
    .replaceAll(/[ \t]+\n/g, '\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .replaceAll(/[ \t]{2,}/g, ' ')
    .trim();
}

function htmlToTextWithBlankPlaceholders(value) {
  return decodeHtmlEntities(
    String(value ?? '')
      .replaceAll(/\{\[[\s\S]*?\]\[([^\]]+)\]\}/g, (_match, order) => `[__${htmlToText(order)}__]`)
      .replaceAll(/<script[\s\S]*?<\/script>/gi, '')
      .replaceAll(/<style[\s\S]*?<\/style>/gi, '')
      .replaceAll(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)>/gi, '\n')
      .replaceAll(/<li[^>]*>/gi, '- ')
      .replaceAll(/<t[dh][^>]*>/gi, ' ')
      .replaceAll(/<[^>]+>/g, '')
  )
    .replaceAll(/\r/g, '')
    .replaceAll(/[ \t]+\n/g, '\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .replaceAll(/[ \t]{2,}/g, ' ')
    .trim();
}

function splitTextLines(value) {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime();

  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const checksum = crc32(data);

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name
    ]);

    localParts.push(localHeader, data);

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0)
  ]);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function paragraph(text) {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function styledParagraph(text, options = {}) {
  const { align = '', bold = false, color = '', size = '', before = '', after = '' } = options;
  const paragraphProps = [
    align ? `<w:jc w:val="${align}"/>` : '',
    before || after ? `<w:spacing${before ? ` w:before="${before}"` : ''}${after ? ` w:after="${after}"` : ''}/>` : ''
  ].join('');
  const runProps = [
    bold ? '<w:b/>' : '',
    color ? `<w:color w:val="${color}"/>` : '',
    size ? `<w:sz w:val="${size}"/>` : ''
  ].join('');

  return `<w:p>${paragraphProps ? `<w:pPr>${paragraphProps}</w:pPr>` : ''}<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function readingTestTitle(text) {
  return styledParagraph(text, { align: 'center', bold: true, size: '34', after: '360' });
}

function passageLabel(text) {
  return styledParagraph(text, { bold: true, color: '0F4C5C', size: '36', before: '160', after: '220' });
}

function passageTitle(text) {
  return styledParagraph(text, { align: 'center', bold: true, size: '28', after: '260' });
}

function passageParagraph(text) {
  return styledParagraph(text, { size: '26', before: '80', after: '80' });
}

function questionGroup(text) {
  return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1F6FEB"/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function questionTitle(text) {
  return `<w:p><w:pPr><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function answerParagraph(text) {
  return `<w:p><w:pPr><w:spacing w:before="20" w:after="40"/><w:shd w:fill="00FFFF"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function choiceParagraph(line) {
  const shading = line.correct ? '<w:shd w:fill="00FFFF"/>' : '';
  const bold = line.correct ? '<w:b/>' : '';
  return `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${shading}</w:pPr><w:r><w:rPr>${bold}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(line.text)}</w:t></w:r></w:p>`;
}

function runXml(text, options = {}) {
  const { bold = false, color = '', size = '' } = options;
  const runProps = [
    bold ? '<w:b/>' : '',
    color ? `<w:color w:val="${color}"/>` : '',
    size ? `<w:sz w:val="${size}"/>` : ''
  ].join('');

  return `<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function explanationRuns(text) {
  const stepMatch = String(text).match(/^(Bước\s+\d+\s*:)(.*)$/i);

  if (stepMatch) {
    return [
      runXml(stepMatch[1], { bold: true, color: '444444', size: '22' }),
      runXml(stepMatch[2], { color: '444444', size: '22' })
    ].join('');
  }

  return runXml(text, { color: '444444', size: '22' });
}

function explanationParagraph(line) {
  const text = typeof line === 'string' ? line : line.text;
  const boxPosition = typeof line === 'string' ? 'single' : line.boxPosition;
  const isSpacer = typeof line !== 'string' && line.spacer;
  const isFirst = boxPosition === 'first' || boxPosition === 'single';
  const isLast = boxPosition === 'last' || boxPosition === 'single';
  const borders = [
    isFirst ? '<w:top w:val="single" w:sz="12" w:space="1" w:color="D6B656"/>' : '',
    '<w:left w:val="single" w:sz="12" w:space="4" w:color="D6B656"/>',
    '<w:right w:val="single" w:sz="12" w:space="4" w:color="D6B656"/>',
    isLast ? '<w:bottom w:val="single" w:sz="12" w:space="1" w:color="D6B656"/>' : ''
  ].join('');
  const shading = isFirst ? '<w:shd w:fill="FFF2CC"/>' : '';
  const spacing = `<w:spacing w:before="${isFirst ? '120' : '0'}" w:after="${isSpacer ? '180' : isLast ? '120' : '0'}"/>`;
  const content = text.startsWith('Giải thích:')
    ? [
      runXml('Giải thích:', { bold: true, color: '333333', size: '22' }),
      runXml(' ', { color: '444444', size: '22' }),
      explanationRuns(text.replace(/^Giải thích:\s*/, ''))
    ].join('')
    : isSpacer
      ? runXml(' ', { color: '444444', size: '22' })
      : explanationRuns(text);

  return `<w:p><w:pPr>${spacing}<w:pBdr>${borders}</w:pBdr>${shading}</w:pPr>${content}</w:p>`;
}

function heading(text) {
  return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

function extractYouPassParts(data) {
  const rawParts = data?.part ?? data?.parts ?? [];
  if (Array.isArray(rawParts)) {
    return rawParts;
  }

  return rawParts ? [rawParts] : [];
}

function cleanQuizTitle(title) {
  return String(title || '').replace(/^\[[^\]]+\]\s*-\s*/, '').trim();
}

function splitPassageContent(part, data) {
  const contentLines = splitTextLines(htmlToText(part.content));
  const vocabLines = extractVocabPassageLines(part.vocabs);
  const passageLines = contentLines.length > 0 ? contentLines : vocabLines;
  const fallbackTitle = part.title || cleanQuizTitle(data?.title);

  if (passageLines.length === 0) {
    return { title: fallbackTitle, bodyLines: [] };
  }

  const firstLine = passageLines[0];
  const firstLineLooksLikeTitle = contentLines.length > 0
    && firstLine.length <= 90
    && !/[.!?]$/.test(firstLine)
    && !/^[A-Z]\.\s/.test(firstLine);

  if (firstLineLooksLikeTitle) {
    return {
      title: firstLine,
      bodyLines: passageLines.slice(1)
    };
  }

  return {
    title: fallbackTitle,
    bodyLines: passageLines
  };
}

function extractVocabPassageLines(vocabs) {
  if (!Array.isArray(vocabs)) {
    return [];
  }

  return vocabs
    .map((group) => (group.children || [])
      .map((child) => htmlToText(child.value))
      .filter(Boolean)
      .join(' '))
    .filter(Boolean);
}

function getPartQuestions(part) {
  if (Array.isArray(part.questions) && part.questions.length > 0) {
    return part.questions;
  }

  if (!Array.isArray(part.question_sets)) {
    return [];
  }

  return part.question_sets.flatMap((questionSet) => (questionSet.questions || []).map((question, index) => ({
    ...question,
    question_type: question.question_type || questionSet.question_type,
    description: index === 0
      ? [questionSet.title, htmlToText(questionSet.description)].filter(Boolean).join('<br>')
      : question.description,
    shared_options: Array.isArray(questionSet.options) && questionSet.options.length > 0 ? questionSet.options : null,
    shared_option_group_key: questionSet.id || questionSet.title || question.question_set_id || ''
  })));
}

function extractMarkedAnswers(html) {
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

function formatSelectionQuestion(question) {
  return (question.selection || []).map((item) => ({
    order: question.order,
    questionText: htmlToText(item.text),
    answer: htmlToText(item.answer)
  }));
}

function formatChoiceOptions(question) {
  return (question.options || []).map((option) => ({
    option: htmlToText(option.option),
    text: htmlToText(option.text),
    correct: Boolean(option.is_correct)
  }));
}

function formatSharedOptions(question) {
  return (question.shared_options || []).map((option) => ({
    option: htmlToText(option.option),
    text: htmlToText(option.text),
    correct: false
  }));
}

function formatOptionText(option) {
  if (!option.option) {
    return option.text;
  }

  const text = option.text.replaceAll(/\s+/g, ' ').trim();
  const optionPattern = new RegExp(`^${option.option}\\b[.)]?\\s*`, 'i');

  if (optionPattern.test(text)) {
    return text.replace(optionPattern, `${option.option}. `);
  }

  return `${option.option}. ${text}`;
}

function getChoiceAnswer(question, choiceOptions) {
  return htmlToText(question.correct_answer)
    || choiceOptions.find((option) => option.correct)?.option
    || '';
}

function isFillInTheBlankQuestion(question) {
  return normalizeTypeKey(question.type) === 'FILL_IN_THE_BLANK'
    || normalizeTypeKey(question.question_type) === 'FILL_BLANK';
}

function normalizeTypeKey(value) {
  return String(value ?? '')
    .trim()
    .replaceAll(/[^a-z0-9]+/gi, '_')
    .replaceAll(/^_+|_+$/g, '')
    .toUpperCase();
}

function getQuestionTypeLabel(question) {
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

function getQuestionOrderRange(answers, fallbackOrder) {
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

function formatQuestionGroupLines(question, answers) {
  const typeLabel = getQuestionTypeLabel(question);
  const descriptionLines = splitTextLines(htmlToText(question.description));

  if (descriptionLines.length > 0) {
    if (typeLabel && /^Questions?\s+\d/i.test(descriptionLines[0])) {
      const firstLine = descriptionLines[0].replaceAll(/:\s*$/g, '');
      return [`${firstLine}: ${typeLabel}`, ...descriptionLines.slice(1)];
    }

    if (typeLabel) {
      return [`Type: ${typeLabel}`, ...descriptionLines];
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

function extractMarkedExplanations(html) {
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
    const explanation = htmlToText(chunk);

    if (order && explanation) {
      explanations.set(String(order), explanation);
    }

    cursor = markerPattern.lastIndex;
  }

  return explanations;
}

function buildExplanationMap(questions) {
  const explanations = new Map();

  for (const question of questions) {
    const markedExplanations = extractMarkedExplanations(question.explain);
    markedExplanations.forEach((explanation, order) => {
      explanations.set(String(order), explanation);
    });

    const explanation = htmlToText(question.explain);
    if (markedExplanations.size === 0 && question.order && explanation) {
      explanations.set(String(question.order), explanation);
    }
  }

  return explanations;
}

function addExplanationLines(lines, question, order, explanationsByOrder) {
  const explanation = (order && explanationsByOrder.get(String(order))) || htmlToText(question.explain);
  const explanationLines = splitTextLines(explanation);
  const formattedLines = [{ text: 'Giải thích:' }];
  let stepCount = 0;

  explanationLines.forEach((line) => {
    const stepMatch = line.match(/^(Bước\s+\d+\s*:)\s*(.*)$/i);

    if (stepMatch) {
      stepCount += 1;
      if (stepCount > 1) {
        formattedLines.push({ text: '', spacer: true });
      }
      formattedLines.push({ text: stepMatch[1] });
      if (stepMatch[2]) {
        formattedLines.push({ text: stepMatch[2] });
      }
      return;
    }

    formattedLines.push({ text: line });
  });

  formattedLines.forEach((line, index) => {
    lines.push({
      type: 'explanation',
      text: line.text,
      spacer: line.spacer,
      boxPosition: formattedLines.length === 1
        ? 'single'
        : index === 0
          ? 'first'
          : index === formattedLines.length - 1
            ? 'last'
            : 'middle'
    });
  });
}

export function formatYouPassResult(result) {
  const data = result?.data ?? result;
  const parts = extractYouPassParts(data);
  const lines = [];

  lines.push({ type: 'readingTestTitle', text: 'Test 1' });

  if (data?.instruction) {
    lines.push({ type: 'heading', text: 'Instruction' });
    splitTextLines(htmlToText(data.instruction)).forEach((line) => lines.push({ type: 'text', text: line }));
  }

  parts.forEach((part, partIndex) => {
    const passageNumber = part.passage || part.sort || partIndex + 1;
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
      const explanationsByOrder = buildExplanationMap(partQuestions);

      for (const question of partQuestions) {
        if (isFillInTheBlankQuestion(question)) {
          const answers = extractMarkedAnswers(question.gap_fill_in_blank);

          formatQuestionGroupLines(question, answers).forEach((line) => {
            lines.push({
              type: /^Questions?\s+\d/i.test(line) ? 'questionGroup' : 'text',
              text: line
            });
          });

          splitTextLines(htmlToTextWithBlankPlaceholders(question.gap_fill_in_blank))
            .forEach((line, lineIndex) => {
              lines.push({
                type: lineIndex === 0 ? 'passageTitle' : 'passageText',
                text: line
              });
            });

          answers.forEach((answer) => {
            const order = answer.order || question.order;
            if (order && emittedQuestionOrders.has(String(order))) {
              return;
            }

            lines.push({ type: 'questionTitle', text: order ? `Question ${order}` : 'Question' });
            if (answer.answer) {
              lines.push({ type: 'answer', text: `A: ${answer.answer}` });
            }
            addExplanationLines(lines, question, order, explanationsByOrder);
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
        const choiceOptions = formatChoiceOptions(question);
        const sharedOptions = formatSharedOptions(question);
        const choiceAnswer = getChoiceAnswer(question, choiceOptions);

        if (answers.length === 0 && choiceOptions.length > 0) {
          if (!emittedQuestionOrders.has(String(question.order))) {
            formatQuestionGroupLines(question, [{ order: question.order }]).forEach((line) => {
              lines.push({
                type: /^Questions?\s+\d/i.test(line) ? 'questionGroup' : 'text',
                text: line
              });
            });
            if (sharedOptions.length > 0 && !emittedSharedOptionGroups.has(String(question.shared_option_group_key))) {
              sharedOptions.forEach((option) => {
                lines.push({
                  type: 'choice',
                  text: formatOptionText(option),
                  correct: false
                });
              });
              emittedSharedOptionGroups.add(String(question.shared_option_group_key));
            }
            lines.push({ type: 'questionTitle', text: `Question ${question.order}` });
            if (fallback) {
              lines.push({ type: 'text', text: `Q: ${fallback}` });
            }
            if (sharedOptions.length === 0) {
              choiceOptions.forEach((option) => {
                lines.push({
                  type: 'choice',
                  text: formatOptionText(option),
                  correct: option.correct || option.option === choiceAnswer
                });
              });
            }
            if (choiceAnswer) {
              lines.push({ type: 'answer', text: `A: ${choiceAnswer}` });
            }
            addExplanationLines(lines, question, question.order, explanationsByOrder);
            emittedQuestionOrders.add(String(question.order));
          }
          continue;
        }

        if (answers.length === 0) {
          if (fallback && !emittedQuestionOrders.has(String(question.order))) {
            lines.push({ type: 'questionTitle', text: `Question ${question.order}` });
            lines.push({ type: 'text', text: `Q: ${fallback}` });
            addExplanationLines(lines, question, question.order, explanationsByOrder);
          }
          continue;
        }

        formatQuestionGroupLines(question, answers).forEach((line) => {
          lines.push({
            type: /^Questions?\s+\d/i.test(line) ? 'questionGroup' : 'text',
            text: line
          });
        });

        answers.forEach((answer, index) => {
          const order = answer.order || (answers.length === 1 ? question.order : question.order + index);
          lines.push({ type: 'questionTitle', text: order ? `Question ${order}` : 'Question' });
          lines.push({ type: 'text', text: `Q: ${answer.questionText}` });
          if (answer.answer) {
            lines.push({ type: 'answer', text: `A: ${answer.answer}` });
          }
          addExplanationLines(lines, question, order, explanationsByOrder);
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

function formatResult(result) {
  if (!result) {
    return ['Chua co endpoint e-learning. Dat bien moi truong E_LEARNING_API_URL de tool tu dong lay du lieu.'];
  }

  if (Array.isArray(result)) {
    return result.map((item, index) => `${index + 1}. ${JSON.stringify(item)}`);
  }

  if (typeof result === 'object') {
    return Object.entries(result).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  }

  return [String(result)];
}

export function createDocx({ id, result }) {
  const resultLines = formatYouPassResult(result);
  const lines = [
    ...(
      resultLines.length > 0
        ? resultLines.map((line) => {
          if (line.type === 'heading') {
            return heading(line.text);
          }

          if (line.type === 'questionGroup') {
            return questionGroup(line.text);
          }

          if (line.type === 'questionTitle') {
            return questionTitle(line.text);
          }

          if (line.type === 'readingTestTitle') {
            return readingTestTitle(line.text);
          }

          if (line.type === 'passageLabel') {
            return passageLabel(line.text);
          }

          if (line.type === 'passageTitle') {
            return passageTitle(line.text);
          }

          if (line.type === 'passageText') {
            return passageParagraph(line.text);
          }

          if (line.type === 'explanation') {
            return explanationParagraph(line);
          }

          if (line.type === 'answer') {
            return answerParagraph(line.text);
          }

          if (line.type === 'choice') {
            return choiceParagraph(line);
          }

          return paragraph(line.text);
        })
        : [heading('Noi dung'), ...formatResult(result).map(paragraph)]
    )
  ].join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${lines}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  return createZip([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    },
    {
      name: 'word/document.xml',
      data: documentXml
    }
  ]);
}

async function collectBody(request) {
  if (typeof request.body === 'string') {
    return request.body;
  }

  if (request.body && typeof request.body === 'object') {
    return new URLSearchParams(request.body).toString();
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

async function fetchELearningResult({ id, token }) {
  if (!API_URL) {
    return null;
  }

  const url = resolveApiUrl(API_URL, id);

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

function normalizeAuthorizationToken(token) {
  const trimmedToken = String(token || '').trim();
  return /^Bearer\s+/i.test(trimmedToken) ? trimmedToken : `Bearer ${trimmedToken}`;
}

function resolveApiUrl(apiUrl, id) {
  if (apiUrl.includes('{id}')) {
    return new URL(apiUrl.replaceAll('{id}', encodeURIComponent(id)));
  }

  const url = new URL(apiUrl);
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

function renderForm(error = '') {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>E-learning Export</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Arial, sans-serif;
      background: #f4f6f8;
      color: #1d2733;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }

    main {
      width: min(100%, 420px);
      background: #ffffff;
      border: 1px solid #d8dee6;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 8px 24px rgba(29, 39, 51, 0.08);
    }

    h1 {
      margin: 0 0 20px;
      font-size: 24px;
      line-height: 1.25;
    }

    label {
      display: block;
      margin: 14px 0 6px;
      font-weight: 700;
    }

    input {
      box-sizing: border-box;
      width: 100%;
      height: 42px;
      border: 1px solid #b8c1cc;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 16px;
    }

    button {
      width: 100%;
      height: 44px;
      margin-top: 20px;
      border: 0;
      border-radius: 6px;
      background: #1f6feb;
      color: white;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
    }

    .error {
      margin: 0 0 14px;
      padding: 10px 12px;
      border: 1px solid #e5534b;
      border-radius: 6px;
      background: #fff1f0;
      color: #8a1f17;
    }
  </style>
</head>
<body>
  <main>
    <h1>Export ket qua e-learning</h1>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/export">
      <label for="id">ID</label>
      <input id="id" name="id" autocomplete="off" required>

      <label for="token">Token</label>
      <input id="token" name="token" type="text" autocomplete="off" required>

      <button type="submit">Xuat file DOCX</button>
    </form>
  </main>
</body>
</html>`;
}

function send(response, statusCode, body, contentType = contentTypes.text, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    ...headers
  });
  response.end(body);
}

export async function handleRequest(request, response) {
  const requestUrl = new URL(request.url || '/', 'http://localhost');

  try {
    if (request.method === 'GET' && requestUrl.pathname === '/') {
      send(response, 200, renderForm(), contentTypes.html);
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/export') {
      const body = await collectBody(request);
      const form = new URLSearchParams(body);
      const id = String(form.get('id') || '').trim();
      const token = String(form.get('token') || '').trim();

      if (!id || !token) {
        send(response, 400, renderForm('Vui long nhap day du ID va token.'), contentTypes.html);
        return;
      }

      const result = await fetchELearningResult({ id, token });
      const docx = createDocx({ id, result });
      const fileName = `e-learning-${id.replaceAll(/[^a-zA-Z0-9_-]/g, '_')}.docx`;

      send(response, 200, docx, contentTypes.docx, {
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': docx.length
      });
      return;
    }

    send(response, 404, 'Not found');
  } catch (error) {
    send(response, 500, renderForm(error.message), contentTypes.html);
  }
}

export function createAppServer() {
  return http.createServer(handleRequest);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createAppServer();
  server.listen(PORT, HOST, () => {
    console.log(`E-learning export tool: http://${HOST}:${PORT}`);
    if (!API_URL) {
      console.log('E_LEARNING_API_URL is not set; DOCX will contain a setup note instead of fetched data.');
    }
  });
}

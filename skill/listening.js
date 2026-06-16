import { htmlToText, splitTextLines } from './helper.js';

function getListeningChildren(item) {
  if (!item) {
    return [];
  }

  if (Array.isArray(item.children) && item.children.length > 0) {
    return item.children;
  }

  if (Array.isArray(item.childrens) && item.childrens.length > 0) {
    return item.childrens;
  }

  return [item];
}

function extractTextLines(node) {
  const lines = [];

  const pushText = (value) => {
    const text = htmlToText(value);
    if (text) {
      lines.push(text);
    }
  };

  const visit = (value) => {
    if (value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (typeof value === 'string') {
      pushText(value);
      return;
    }

    if (typeof value !== 'object') {
      pushText(String(value));
      return;
    }

    if (Array.isArray(value.children) && value.children.length > 0) {
      value.children.forEach(visit);
      return;
    }

    pushText(value.value ?? value.text ?? value.content ?? value.html ?? '');
  };

  visit(node);

  return lines
    .map((line) => String(line ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function collectListeningTurnLines(node) {
  const lines = extractTextLines(node);
  if (lines.length > 0) {
    return lines;
  }

  return splitTextLines(htmlToText(node?.value ?? node?.text ?? node?.content ?? node?.html ?? ''));
}

export function buildListeningPassageBlocks(vocabs) {
  if (!Array.isArray(vocabs) || vocabs.length === 0) {
    return [];
  }

  const blocks = [];

  vocabs.forEach((item) => {
    if (!item) {
      return;
    }

    const children = getListeningChildren(item);

    const speaker = String(
      item?.meta?.speaker
      || children.find((child) => child?.meta?.speaker)?.meta?.speaker
      || item?.speaker
      || ''
    ).trim();

    const lines = children.flatMap((child) => collectListeningTurnLines(child))
      .map((line) => String(line ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    if (!speaker && lines.length === 0) {
      return;
    }

    blocks.push({
      speaker,
      lines
    });
  });

  return blocks;
}

function normalizeListeningVocabEntry(node, fallbackMeta = {}) {
  const meta = node && typeof node === 'object' ? node.meta || fallbackMeta : fallbackMeta;
  return {
    from: String(meta?.from ?? '').trim(),
    to: String(meta?.to ?? '').trim(),
    value: String(node?.value ?? node?.text ?? node?.content ?? node?.html ?? node ?? '').trim()
  };
}

export function buildListeningVocabJsonEntries(vocabs) {
  if (!Array.isArray(vocabs) || vocabs.length === 0) {
    return [];
  }

  const entries = [];

  vocabs.forEach((item) => {
    if (!item) {
      return;
    }

    const fallbackMeta = item?.meta || {};
    const children = getListeningChildren(item);

    if (children.length === 0) {
      entries.push(normalizeListeningVocabEntry(item, fallbackMeta));
      return;
    }

    children.forEach((child) => {
      entries.push(normalizeListeningVocabEntry(child, fallbackMeta));
    });
  });

  return entries;
}

function buildListeningTranscriptSegments(vocabs) {
  if (!Array.isArray(vocabs) || vocabs.length === 0) {
    return [];
  }

  const segments = [];

  vocabs.forEach((item, paragraphIndex) => {
    const children = getListeningChildren(item);
    let sentenceIndex = 1;

    children.forEach((child) => {
      const lines = collectListeningTurnLines(child);
      const text = lines.join(' ').replace(/\s+/g, ' ').trim();
      if (!text) {
        return;
      }

      segments.push({
        paragraph: paragraphIndex + 1,
        sentence: sentenceIndex,
        text
      });
      sentenceIndex += 1;
    });
  });

  return segments;
}

function comparePosition(a = {}, b = {}) {
  if (a.paragraph !== b.paragraph) {
    return (Number(a.paragraph) || 0) - (Number(b.paragraph) || 0);
  }

  if (a.sentence !== b.sentence) {
    return (Number(a.sentence) || 0) - (Number(b.sentence) || 0);
  }

  return (Number(a.index) || 0) - (Number(b.index) || 0);
}

function compareParagraphSentence(a = {}, b = {}) {
  if (a.paragraph !== b.paragraph) {
    return (Number(a.paragraph) || 0) - (Number(b.paragraph) || 0);
  }

  if (a.sentence !== b.sentence) {
    return (Number(a.sentence) || 0) - (Number(b.sentence) || 0);
  }

  return 0;
}

function normalizeLocatePoint(point = {}, fallbackParagraph = 1) {
  return {
    paragraph: Number.parseInt(point.paragraph, 10) || fallbackParagraph,
    sentence: Number.parseInt(point.sentence, 10) || 1,
    index: Number.parseInt(point.index, 10) || 1
  };
}

function splitWords(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function sliceSegmentText(text, startIndex, endIndex, isStart, isEnd) {
  const words = splitWords(text);
  if (words.length === 0) {
    return '';
  }

  const safeStart = isStart ? Math.max(0, (Number(startIndex) || 1) - 1) : 0;
  const safeEnd = isEnd
    ? Math.min(words.length, Number.isFinite(endIndex) ? Number(endIndex) : words.length)
    : words.length;

  return words.slice(safeStart, safeEnd).join(' ').trim();
}

function buildRangeSnippet(segments, startPoint, endPoint) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return '';
  }

  const start = normalizeLocatePoint(startPoint, segments[0]?.paragraph || 1);
  const end = normalizeLocatePoint(endPoint, start.paragraph);
  const ordered = [...segments].sort(comparePosition);
  const snippets = ordered
    .filter((segment) => compareParagraphSentence(segment, start) >= 0 && compareParagraphSentence(segment, end) <= 0)
    .map((segment) => {
      const isStart = segment.paragraph === start.paragraph && segment.sentence === start.sentence;
      const isEnd = segment.paragraph === end.paragraph && segment.sentence === end.sentence;
      return sliceSegmentText(segment.text, start.index, end.index, isStart, isEnd);
    })
    .filter(Boolean);

  return snippets.join(' ').replace(/\s+/g, ' ').trim();
}

function resolveLocateInfoSource(source, rowIndex = 0) {
  if (Array.isArray(source)) {
    const directItem = source[rowIndex] || source[0] || null;
    return directItem?.questions?.[0]?.locate_info
      || directItem?.locate_info
      || directItem
      || null;
  }

  if (source && typeof source === 'object') {
    const directItem = source[rowIndex] || source[String(rowIndex)] || source[0] || source['0'] || null;
    if (directItem) {
      return directItem?.questions?.[0]?.locate_info
        || directItem?.locate_info
        || directItem
        || null;
    }
  }

  return source || null;
}

export function buildListeningQuestionInfoText(question, vocabs = [], rowIndex = 0) {
  const locateInfo = resolveLocateInfoSource(question?.locate_info, rowIndex);
  const ranges = locateInfo?.paragraph_ranges || [];
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return '';
  }

  const segments = buildListeningTranscriptSegments(vocabs);
  if (segments.length === 0) {
    return '';
  }

  const range = ranges[0] || {};
  const start = normalizeLocatePoint(range.start || {}, segments[0]?.paragraph || 1);
  const end = normalizeLocatePoint(range.end || {}, start.paragraph);
  return buildRangeSnippet(segments, start, end);
}

function questionSetKey(questionSet = {}) {
  return String(questionSet.id || questionSet.title || questionSet.question_set_id || '').trim();
}

function questionSetOrderRange(questionSet = {}) {
  const orders = (Array.isArray(questionSet.questions) ? questionSet.questions : [])
    .map((question) => Number.parseInt(question?.order, 10))
    .filter((order) => Number.isInteger(order) && order > 0)
    .sort((a, b) => a - b);

  if (orders.length === 0) {
    return null;
  }

  return {
    first: orders[0],
    last: orders[orders.length - 1]
  };
}

function normalizeListeningPartQuestionSets(part = {}) {
  const questionSets = Array.isArray(part.question_sets) ? part.question_sets : [];
  const optionGroups = questionSets
    .map((questionSet) => ({
      key: questionSetKey(questionSet),
      range: questionSetOrderRange(questionSet),
      options: Array.isArray(questionSet.options) ? questionSet.options : []
    }))
    .filter((group) => group.options.length > 0);

  const normalizeQuestion = (question = {}, questionSet = null) => {
    const key = questionSet ? questionSetKey(questionSet) : String(question.shared_question_group_key || question.question_set_id || '').trim();
    const order = Number.parseInt(question.order, 10);
    const questionSetType = String(questionSet?.question_type || questionSet?.type || questionSet?.kind || questionSet?.question_type_id || '').trim();
    const questionType = String(question.question_type || question.type || question.kind || question.question_type_id || '').trim();
    const group = questionSet
      ? optionGroups.find((item) => item.key === key)
      : optionGroups.find((item) => {
        if (key && item.key === key) {
          return true;
        }

        return item.range
          && Number.isInteger(order)
          && order >= item.range.first
          && order <= item.range.last;
      });

    if (!group) {
      return question;
    }

    return {
      ...question,
      question_type: questionSetType === 'MATCHING_ENDINGS' && questionType === 'MATCHING'
        ? questionSetType
        : question.question_type,
      shared_options: Array.isArray(question.shared_options) && question.shared_options.length > 0
        ? question.shared_options
        : group.options,
      shared_question_group_key: question.shared_question_group_key || group.key,
      shared_option_group_key: question.shared_option_group_key || group.key
    };
  };

  return {
    ...part,
    question_sets: questionSets.map((questionSet) => ({
      ...questionSet,
      questions: Array.isArray(questionSet.questions)
        ? questionSet.questions.map((question) => normalizeQuestion(question, questionSet))
        : questionSet.questions
    })),
    questions: Array.isArray(part.questions)
      ? part.questions.map((question) => normalizeQuestion(question))
      : part.questions
  };
}

export function normalizeListeningExportResult(result) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  const data = result.data && typeof result.data === 'object' ? result.data : result;
  const normalizeParts = (parts) => Array.isArray(parts)
    ? parts.map((part) => normalizeListeningPartQuestionSets(part))
    : parts;

  if (result.data && typeof result.data === 'object') {
    return {
      ...result,
      data: {
        ...result.data,
        parts: normalizeParts(result.data.parts),
        part: normalizeParts(result.data.part)
      }
    };
  }

  return {
    ...data,
    parts: normalizeParts(data.parts),
    part: normalizeParts(data.part)
  };
}

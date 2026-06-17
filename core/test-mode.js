import { extractYouPassParts } from '../skill/reading.js';

const ID_KEYS = ['id', 'quiz_id', 'quizId', 'code', 'ma_de', 'maDe', 'test_id', 'testId', 'exam_id', 'examId'];
const ORDER_KEYS = ['questions', 'question', 'question_orders', 'questionOrder', 'question_numbers', 'questionNumbers', 'orders', 'order', 'cau', 'câu'];

function extractFirstStringValue(source, keys) {
  if (!source || typeof source !== 'object') {
    return '';
  }

  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined) {
      continue;
    }

    const text = String(value).trim();
    if (text) {
      return text;
    }
  }

  return '';
}

function collectOrdersFromValue(value, target = []) {
  if (value === null || value === undefined) {
    return target;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectOrdersFromValue(item, target));
    return target;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    target.push(Math.trunc(value));
    return target;
  }

  if (typeof value === 'string') {
    const matches = value.match(/\d+/g) || [];
    matches.forEach((match) => {
      const parsed = Number.parseInt(match, 10);
      if (Number.isFinite(parsed)) {
        target.push(parsed);
      }
    });
    return target;
  }

  if (typeof value === 'object') {
    const order = value.order ?? value.question ?? value.question_order ?? value.cau ?? value.number ?? value.index;
    if (order !== undefined) {
      collectOrdersFromValue(order, target);
    }
    return target;
  }

  return target;
}

function normalizeConfigRecord(record) {
  const id = extractFirstStringValue(record, ID_KEYS);
  const orders = [...new Set(collectOrdersFromValue(ORDER_KEYS.map((key) => record?.[key]).filter((value) => value !== undefined), []))]
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);

  return { id, orders };
}

function normalizeConfigGroup(records) {
  const groups = new Map();

  records.forEach((record) => {
    if (!record || typeof record !== 'object') {
      return;
    }

    const normalized = normalizeConfigRecord(record);
    if (!normalized.id) {
      return;
    }

    const current = groups.get(normalized.id) || [];
    current.push(...normalized.orders);
    groups.set(normalized.id, current);
  });

  return [...groups.entries()].map(([id, orders]) => ({
    id,
    orders: [...new Set(orders)].filter((value) => Number.isInteger(value) && value > 0).sort((a, b) => a - b)
  })).filter((group) => group.orders.length > 0);
}

export function parseTestModeConfig(text) {
  const groups = parseTestModeConfigGroups(text);
  if (groups.length === 0) {
    throw new Error('Khong tim thay danh sach cau trong file JSON.');
  }

  return {
    id: groups[0].id,
    orders: [...new Set(groups.flatMap((group) => group.orders))]
      .filter((value) => Number.isInteger(value) && value > 0)
      .sort((a, b) => a - b)
  };
}

export function parseTestModeConfigGroups(text) {
  const source = String(text ?? '').trim();
  if (!source) {
    throw new Error('File JSON khong duoc trong.');
  }

  let payload;
  try {
    payload = JSON.parse(source);
  } catch {
    throw new Error('File JSON khong hop le.');
  }

  const records = Array.isArray(payload) ? payload : [payload];
  const groups = normalizeConfigGroup(records);

  if (groups.length === 0) {
    throw new Error('Khong tim thay ma de trong file JSON.');
  }

  return groups;
}

function cloneResult(result) {
  return typeof structuredClone === 'function'
    ? structuredClone(result)
    : JSON.parse(JSON.stringify(result));
}

function getQuestionGroupKey(question = {}) {
  return String(
    question?.shared_question_group_key
    || question?.question_set_id
    || question?.group?.id
    || question?.group?.type
    || ''
  ).trim();
}

function getQuestionClusterKey(question = {}) {
  const rawTypeKey = String(question?.question_type || question?.type || question?.kind || question?.question_type_id || '').trim().toUpperCase();
  const isClusterType = rawTypeKey === 'MATCHING_NAMES'
    || rawTypeKey === 'MATCHING_INFO'
    || rawTypeKey === 'MATCHING_FEATURES'
    || rawTypeKey === 'MATCHING_ENDINGS'
    || rawTypeKey === 'MATCHING_HEADING'
    || rawTypeKey === 'MATCHING_HEADINGS'
    || rawTypeKey === 'SUMMARY_COMPLETION'
    || rawTypeKey === 'SENTENCE_COMPLETION'
    || rawTypeKey === 'SHORT_ANSWER';

  if (!isClusterType) {
    return getQuestionGroupKey(question);
  }

  const groupDescription = Array.isArray(question?.group?.description)
    ? question.group.description.join(' \n ')
    : String(question?.group?.description || '').trim();

  return [
    rawTypeKey,
    getQuestionGroupKey(question),
    String(question?.shared_question_content || '').trim(),
    String(question?.description || '').trim(),
    groupDescription
  ].filter(Boolean).join('||');
}

function filterQuestionArray(questions = [], selectedOrders, selectedGroupKeys = new Set()) {
  const selectedSet = new Set(selectedOrders);
  return Array.isArray(questions)
    ? questions.filter((question) => {
      const order = Number.parseInt(question?.order, 10);
      return (Number.isInteger(order) && selectedSet.has(order))
        || selectedGroupKeys.has(getQuestionClusterKey(question));
    })
    : questions;
}

function filterQuestionSet(questionSet = {}, selectedOrders, selectedGroupKeys = new Set()) {
  const filteredQuestions = filterQuestionArray(questionSet.questions, selectedOrders, selectedGroupKeys);
  if (filteredQuestions.length === 0) {
    return null;
  }

  return {
    ...questionSet,
    questions: filteredQuestions
  };
}

function filterPart(part = {}, selectedOrders) {
  const selectedSet = new Set(selectedOrders);
  const selectedGroupKeys = new Set(
    (Array.isArray(part.questions) ? part.questions : [])
      .filter((question) => {
        const order = Number.parseInt(question?.order, 10);
        return Number.isInteger(order) && selectedSet.has(order);
      })
      .map((question) => getQuestionClusterKey(question))
      .filter(Boolean)
  );

  const filteredQuestionSets = Array.isArray(part.question_sets)
    ? part.question_sets
      .map((questionSet) => filterQuestionSet(questionSet, selectedOrders, selectedGroupKeys))
      .filter(Boolean)
    : part.question_sets;

  const filteredQuestions = filterQuestionArray(part.questions, selectedOrders, selectedGroupKeys);
  if (filteredQuestions.length === 0 && (!Array.isArray(filteredQuestionSets) || filteredQuestionSets.length === 0)) {
    return null;
  }

  return {
    ...part,
    questions: filteredQuestions,
    question_sets: filteredQuestionSets
  };
}

export function filterResultByQuestionOrders(result, selectedOrders = []) {
  const orders = [...new Set((Array.isArray(selectedOrders) ? selectedOrders : [selectedOrders])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b);

  if (orders.length === 0) {
    return result;
  }

  const cloned = cloneResult(result);
  const data = cloned?.data && typeof cloned.data === 'object' ? cloned.data : cloned;
  const parts = extractYouPassParts(data);

  if (!Array.isArray(parts) || parts.length === 0) {
    return result;
  }

  const filteredParts = parts
    .map((part) => filterPart(part, orders))
    .filter(Boolean);

  if (cloned?.data && typeof cloned.data === 'object') {
    cloned.data = {
      ...cloned.data,
      part: filteredParts,
      parts: filteredParts
    };
    return cloned;
  }

  return {
    ...cloned,
    part: filteredParts,
    parts: filteredParts
  };
}

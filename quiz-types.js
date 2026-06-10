export const QUIZ_TYPE_LABELS = {
  1: 'Nghe',
  2: 'Đọc',
  3: 'Writing',
  4: 'Nói'
};

export const QUIZ_TYPE_KEYS = {
  1: 'listening',
  2: 'reading',
  3: 'writing',
  4: 'speaking'
};

function normalizeSkillKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function resolveQuizType(quizType) {
  const numeric = Number(quizType);
  if (Number.isInteger(numeric) && QUIZ_TYPE_KEYS[numeric]) {
    return {
      key: QUIZ_TYPE_KEYS[numeric],
      label: QUIZ_TYPE_LABELS[numeric]
    };
  }

  const key = normalizeSkillKey(quizType);
  const normalizedKey = Object.values(QUIZ_TYPE_KEYS).includes(key) ? key : '';
  const labelByKey = {
    listening: 'Nghe',
    reading: 'Đọc',
    writing: 'Writing',
    speaking: 'Nói'
  };

  return {
    key: normalizedKey || 'unknown',
    label: normalizedKey ? labelByKey[normalizedKey] : String(quizType ?? 'Đề')
  };
}

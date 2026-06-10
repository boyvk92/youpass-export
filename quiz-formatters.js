import { resolveQuizType } from './quiz-types.js';

const QUIZ_FORMATTERS = {
  listening: {
    name: 'listening',
    coverLabel: 'Listening'
  },
  reading: {
    name: 'reading',
    coverLabel: 'Reading'
  },
  writing: {
    name: 'writing',
    coverLabel: 'Writing'
  },
  speaking: {
    name: 'speaking',
    coverLabel: 'Speaking'
  },
  unknown: {
    name: 'unknown',
    coverLabel: 'Đề'
  }
};

export function resolveQuizFormatter(quizType) {
  const meta = resolveQuizType(quizType);
  return {
    ...meta,
    ...(QUIZ_FORMATTERS[meta.key] || QUIZ_FORMATTERS.unknown)
  };
}

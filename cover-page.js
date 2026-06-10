import { resolveQuizFormatter } from './quiz-formatters.js';

export function buildCoverPageLines({ quizType, id, title }) {
  const formatter = resolveQuizFormatter(quizType);

  return [
    { type: 'coverSubject', text: formatter.coverLabel },
    { type: 'coverTitle', text: String(title ?? '') },
    { type: 'coverCode', text: String(id ?? '') },
    { type: 'pageBreak', text: '' }
  ];
}

import { htmlToText } from './helper.js';

function getSpeakingParts(result) {
  const data = result?.data ?? result ?? {};
  if (Array.isArray(data.parts) && data.parts.length > 0) {
    return data.parts;
  }

  if (Array.isArray(data.part) && data.part.length > 0) {
    return data.part;
  }

  return [];
}

function getSpeakingQuestions(part) {
  if (!part || !Array.isArray(part.questions) || part.questions.length === 0) {
    return [];
  }

  return part.questions;
}

export function buildSpeakingExportLines(result) {
  const data = result?.data ?? result ?? {};
  const parts = getSpeakingParts(result);

  if (parts.length === 0) {
    return [{ type: 'text', text: JSON.stringify(result, null, 2) }];
  }

  const lines = [];

  parts.forEach((part, partIndex) => {
    if (partIndex > 0) {
      lines.push({ type: 'pageBreak', text: '' });
    }

    lines.push({
      type: 'heading',
      text: `Pass ${partIndex + 1}`
    });

    const questions = getSpeakingQuestions(part);
    questions.forEach((question, questionIndex) => {
      const title = htmlToText(question?.title || question?.text || question?.content || `Question ${questionIndex + 1}`);
      const descriptionHtml = String(question?.description ?? '').trim();

      lines.push({
        type: 'text',
        text: `Question ${questionIndex + 1}: ${title ? String(title).trim() : `Question ${questionIndex + 1}`}`
      });

      if (descriptionHtml) {
        lines.push({
          type: 'questionDescriptionHtml',
          html: descriptionHtml,
          options: { size: '26' }
        });
      }
    });
  });

  return lines.length > 0 ? lines : [{ type: 'text', text: JSON.stringify(data, null, 2) }];
}

export function collectSpeakingAudioSources(result) {
  const parts = getSpeakingParts(result);
  const sources = [];

  parts.forEach((part, partIndex) => {
    getSpeakingQuestions(part).forEach((question, questionIndex) => {
      const audioUrl = String(question?.audio_url || question?.audioUrl || '').trim();
      if (!audioUrl) {
        return;
      }

      sources.push({
        partIndex,
        questionIndex,
        audioUrl
      });
    });
  });

  return sources;
}

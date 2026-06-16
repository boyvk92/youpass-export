import { fetchBinaryAsset } from './helper.js';
import { collectSpeakingAudioSources } from '../skill/speaking.js';

function buildSpeakingPassTitle(title = '', partIndex = 0) {
  const prefix = String(title ?? '').trim().replace(/\s*-\s*Full test\s*$/i, '').trim();
  return `${prefix || 'Speaking'} - Passage ${partIndex + 1}`;
}

function resolveAudioExtension(audioAsset, audioUrl) {
  const assetExt = String(audioAsset?.ext || '').trim();
  if (assetExt && assetExt !== 'bin') {
    return assetExt;
  }

  const match = String(audioUrl || '').match(/\.([a-z0-9]+)(?:[?#]|$)/i);
  if (match) {
    return match[1].toLowerCase();
  }

  return 'mp3';
}

export async function buildSpeakingZipFiles({ id, title, createDocx, result, quizTypeOverride, folderPrefix = '', nestPassFolders = true, noAudio = false }) {
  const files = [];
  const prefix = String(folderPrefix || '').trim();
  const root = prefix ? `${prefix}/` : '';
  const parts = Array.isArray(result?.data?.parts) && result.data.parts.length > 0
    ? result.data.parts
    : (Array.isArray(result?.data?.part) && result.data.part.length > 0 ? result.data.part : [null]);

  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex];
    const resultForDoc = part
      ? {
        ...result,
        data: {
          ...result.data,
          title: buildSpeakingPassTitle(title, partIndex),
          part: [part],
          parts: [part]
        }
      }
      : result;
    const docx = await createDocx({ id, result: resultForDoc, quizTypeOverride });
    const passFolder = nestPassFolders ? `Pass ${partIndex + 1}/` : '';
    const fileLabel = `Pass ${partIndex + 1}.docx`;
    const audioSources = collectSpeakingAudioSources(resultForDoc);

    files.push({
      name: `${root}${passFolder}${fileLabel}`,
      data: docx
    });

    if (noAudio) {
      continue;
    }

    for (const source of audioSources) {
      const audioAsset = await fetchBinaryAsset(source.audioUrl);
      if (!audioAsset?.buffer) {
        continue;
      }

      const audioExt = resolveAudioExtension(audioAsset, source.audioUrl);
      const audioName = `question${partIndex + 1}-${source.questionIndex + 1}.${audioExt}`;
      files.push({
        name: `${root}${passFolder}${audioName}`,
        data: audioAsset.buffer
      });
    }
  }

  return files;
}

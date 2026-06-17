import { Buffer } from 'node:buffer';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { decodeHtmlEntities, htmlToText, splitTextLines } from './helper.js';
import { formatOptionText, isReadingRawType, normalizeChoiceLabel } from './reading.js';

export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function resolveEffectiveQuizType(quizTypeOverride, fallbackQuizType) {
  const normalizedOverride = String(quizTypeOverride ?? '').trim();
  return normalizedOverride || fallbackQuizType;
}

export function paragraph(text) {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function styledParagraph(text, options = {}) {
  const { align = '', bold = false, color = '', size = '', before = '', after = '', indentLeft = '', pStyle = '' } = options;
  const paragraphProps = [
    pStyle ? `<w:pStyle w:val="${pStyle}"/>` : '',
    align ? `<w:jc w:val="${align}"/>` : '',
    before || after ? `<w:spacing${before ? ` w:before="${before}"` : ''}${after ? ` w:after="${after}"` : ''}/>` : '',
    indentLeft !== '' ? `<w:ind w:left="${indentLeft}"/>` : ''
  ].join('');
  const runProps = [
    bold ? '<w:b/>' : '',
    color ? `<w:color w:val="${color}"/>` : '',
    size ? `<w:sz w:val="${size}"/>` : ''
  ].join('');

  return `<w:p>${paragraphProps ? `<w:pPr>${paragraphProps}</w:pPr>` : ''}<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function readingTestTitle(text) {
  return styledParagraph(text, { align: 'center', bold: true, size: '34', after: '360' });
}

export function passageLabel(text) {
  return styledParagraph(text, { pStyle: 'Heading1', bold: true, color: '0F4C5C', size: '36', before: '160', after: '220' });
}

export function passageTitle(text) {
  return styledParagraph(text, { align: 'left', bold: true, size: '28', after: '260' });
}

export function passageParagraph(text) {
  return styledParagraph(text, { size: '26', before: '80', after: '80' });
}

function buildListeningParagraph(text, options = {}) {
  const { bold = false, indentLeft = '', before = '0', after = '0' } = options;
  const indentXml = indentLeft !== '' ? `<w:ind w:left="${indentLeft}"/>` : '';
  return `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}"/>${indentXml}</w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function passageListeningTable(blocks = []) {
  const rows = Array.isArray(blocks) ? blocks : [];
  if (rows.length === 0) {
    return '';
  }

  const speakerWidth = 2300;
  const contentWidth = 6900;

  const rowXml = rows.map((block) => {
    const speaker = String(block?.speaker || '').trim().replace(/:\s*$/, '');
    const lines = Array.isArray(block?.lines) ? block.lines : [];
    const speakerCell = buildListeningParagraph(speaker, { bold: true });
    const contentCell = lines.length > 0
      ? lines.map((line, index) => buildListeningParagraph(String(line || '').trim(), {
        indentLeft: index === 0 ? '' : '0',
        after: '0'
      })).join('')
      : buildListeningParagraph('', {});

    return `<w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="${speakerWidth}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>
        ${speakerCell}
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="${contentWidth}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>
        ${contentCell}
      </w:tc>
    </w:tr>`;
  }).join('');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblLayout w:type="fixed"/>
      <w:tblBorders>
        <w:top w:val="nil"/>
        <w:left w:val="nil"/>
        <w:bottom w:val="nil"/>
        <w:right w:val="nil"/>
        <w:insideH w:val="nil"/>
        <w:insideV w:val="nil"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>
      <w:gridCol w:w="${speakerWidth}"/>
      <w:gridCol w:w="${contentWidth}"/>
    </w:tblGrid>
    ${rowXml}
  </w:tbl>`;
}

export function coverTitleParagraph(text) {
  return styledParagraph(text, { align: 'center', bold: true, size: '64', before: '180', after: '200' });
}

export function coverSubjectParagraph(text) {
  return styledParagraph(text, { align: 'center', bold: true, size: '32', before: '260', after: '200' });
}

export function coverCodeParagraph(text) {
  return styledParagraph(text, { align: 'center', size: '28', before: '200', after: '120' });
}

export function pageBreakParagraph() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

export function questionGroup(text) {
  return `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1F6FEB"/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function questionTitle(text) {
  return `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function questionTitleWithText(title, text, separator = '. ') {
  return `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r><w:r><w:rPr><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(separator)}${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function questionTitleWithHtml(title, html, separator = '. ', options = {}) {
  const { size = '26', color = '', imageRegistry = [] } = options;
  return `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r><w:r><w:rPr><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escapeXml(separator)}</w:t></w:r>${htmlToDocxInlineRuns(html, { size, color, imageRegistry })}</w:p>`;
}

export function questionTitleWithAnswer(title, text, answerText, separator = '. ', answerSeparator = ' -> ') {
  return `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r><w:r><w:rPr><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(separator)}${escapeXml(text)}</w:t></w:r><w:r><w:rPr><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(answerSeparator)}</w:t></w:r><w:r><w:rPr><w:color w:val="C00000"/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(answerText)}</w:t></w:r></w:p>`;
}

export function questionTitleWithTrailingAnswer(title, text, answerText, separator = '. ') {
  return `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r><w:r><w:rPr><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(separator)}${escapeXml(text)}</w:t></w:r><w:r><w:rPr><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r><w:r><w:rPr><w:color w:val="C00000"/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(answerText)}</w:t></w:r></w:p>`;
}

export function questionTitleWithAnswerOnly(title, answerText, separator = '. ', answerSeparator = ' -> ') {
  return `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r><w:r><w:rPr><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(separator)}${escapeXml(answerSeparator)}</w:t></w:r><w:r><w:rPr><w:color w:val="C00000"/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(answerText)}</w:t></w:r></w:p>`;
}

export function questionTextParagraph(text) {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/><w:ind w:left="720"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function answerParagraph(text) {
  return `<w:p><w:pPr><w:spacing w:before="20" w:after="40"/><w:ind w:left="720"/><w:shd w:fill="00FFFF"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function choiceParagraph(line) {
  const shading = line.correct ? '<w:shd w:fill="00FFFF"/>' : '';
  const bold = line.correct ? '<w:b/>' : '';
  return `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/><w:ind w:left="720"/>${shading}</w:pPr><w:r><w:rPr>${bold}<w:color w:val="2A5A78"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(line.text)}</w:t></w:r></w:p>`;
}

export function questionInfoParagraph(text) {
  const value = String(text ?? '').trim();
  const content = value ? `<w:r><w:br/></w:r><w:r><w:rPr><w:color w:val="555555"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>` : '';
  return `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/><w:ind w:left="720"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="555555"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">Vị trí:</w:t></w:r>${content}</w:p>`;
}

export function heading(text) {
  return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function explanationParagraph(line = {}) {
  const explanationHtml = String(line.explanationHtml || '');
  const answerTokens = Array.isArray(line.answerTokens) ? line.answerTokens : [];
  const answerTextMap = line.answerTextMap instanceof Map ? line.answerTextMap : new Map();

  return `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/><w:ind w:left="1440"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escapeXml(explanationHtml || answerTokens.join(', ') || Array.from(answerTextMap.keys()).join(', '))}</w:t></w:r></w:p>`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function createZip(files) {
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

export function extractImageOnlyHtml(source) {
  const html = String(source ?? '');
  const wrappedImageBlocks = [...html.matchAll(/<p\b[^>]*>[\s\S]*?<img\b[\s\S]*?<\/p>/gi)].map((match) => match[0]);
  if (wrappedImageBlocks.length > 0) {
    return wrappedImageBlocks.join('');
  }

  const standaloneImages = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => `<p>${match[0]}</p>`);
  if (standaloneImages.length > 0) {
    return standaloneImages.join('');
  }

  return html;
}

export function emuToPx(value) {
  return Number(value || 0) / 9525;
}

export function pxToEmu(value) {
  return Math.max(1, Math.round(Number(value || 0) * 9525));
}

export function escapeXmlAttr(value) {
  return escapeXml(value).replaceAll('`', '&apos;');
}

export function parseImageAttributes(tag) {
  const source = String(tag ?? '');
  const attrs = {};
  for (const match of source.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    attrs[match[1].toLowerCase()] = decodeHtmlEntities(match[3]);
  }
  return attrs;
}

export function guessImageExtensionFromMimeType(mimeType = '') {
  const value = String(mimeType || '').toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpg';
  if (value.includes('gif')) return 'gif';
  if (value.includes('webp')) return 'webp';
  if (value.includes('bmp')) return 'bmp';
  return '';
}

export function guessImageExtensionFromUrl(src = '') {
  const clean = String(src || '').split('?')[0].split('#')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'jpg';
  if (clean.endsWith('.gif')) return 'gif';
  if (clean.endsWith('.webp')) return 'webp';
  if (clean.endsWith('.bmp')) return 'bmp';
  return '';
}

export function parsePngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

export function parseGifDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 10) return null;
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8)
  };
}

export function parseJpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) {
      offset += 1;
      continue;
    }

    let marker = buffer[offset + 1];
    while (marker === 0xFF) {
      offset += 1;
      marker = buffer[offset + 1];
    }

    if (marker === 0xD9 || marker === 0xDA) {
      break;
    }

    const size = buffer.readUInt16BE(offset + 2);
    if (size < 2) {
      break;
    }

    const isSof = (
      (marker >= 0xC0 && marker <= 0xC3) ||
      (marker >= 0xC5 && marker <= 0xC7) ||
      (marker >= 0xC9 && marker <= 0xCB) ||
      (marker >= 0xCD && marker <= 0xCF)
    );

    if (isSof && offset + 7 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }

    offset += 2 + size;
  }

  return null;
}

export function parseImageDimensions(buffer, ext = '') {
  const format = String(ext || '').toLowerCase();
  if (format === 'png') return parsePngDimensions(buffer);
  if (format === 'gif') return parseGifDimensions(buffer);
  if (format === 'jpg' || format === 'jpeg') return parseJpegDimensions(buffer);
  return parsePngDimensions(buffer) || parseGifDimensions(buffer) || parseJpegDimensions(buffer);
}

export async function loadImageAsset(src) {
  const url = String(src ?? '').trim();
  if (!url) {
    return null;
  }

  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i);
    if (!match) {
      return null;
    }

    const mimeType = match[1] || 'image/png';
    const isBase64 = Boolean(match[2]);
    const data = isBase64 ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]), 'utf8');
    const ext = guessImageExtensionFromMimeType(mimeType) || 'png';
    return {
      buffer: data,
      ext,
      mimeType,
      width: 0,
      height: 0
    };
  }

  let resolvedUrl;
  try {
    resolvedUrl = new URL(url);
  } catch {
    return null;
  }

  if (!/^https?:$/i.test(resolvedUrl.protocol)) {
    return null;
  }

  const response = await fetch(resolvedUrl);
  if (!response.ok) {
    return null;
  }

  const mimeType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = guessImageExtensionFromMimeType(mimeType) || guessImageExtensionFromUrl(url) || 'png';
  const dimensions = parseImageDimensions(buffer, ext) || {};

  return {
    buffer,
    ext,
    mimeType,
    width: dimensions.width || 0,
    height: dimensions.height || 0
  };
}

export async function buildImageRegistry(result) {
  const sources = new Set();
  const visited = new WeakSet();

  const visit = (value) => {
    if (!value) {
      return;
    }

    if (typeof value === 'string') {
      const html = value;
      for (const match of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)["']?[^>]*>/gi)) {
        sources.add(decodeHtmlEntities(match[1]));
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (typeof value === 'object') {
      if (visited.has(value)) {
        return;
      }
      visited.add(value);
      Object.entries(value).forEach(([key, child]) => {
        if (typeof child === 'string' && /^(src|url|image|image_url|imageUrl)$/i.test(key)) {
          const trimmed = child.trim();
          if (trimmed) {
            sources.add(trimmed);
          }
        }
        visit(child);
      });
    }
  };

  visit(result);

  const items = [];
  let index = 1;
  for (const src of sources) {
    const asset = await loadImageAsset(src);
    if (!asset?.buffer) {
      continue;
    }

    const ext = asset.ext || guessImageExtensionFromUrl(src) || 'png';
    const dimensions = parseImageDimensions(asset.buffer, ext) || {};
    items.push({
      src,
      ext,
      buffer: asset.buffer,
      width: dimensions.width || asset.width || 0,
      height: dimensions.height || asset.height || 0,
      relId: `rIdImage${index}`,
      name: `image${index}.${ext}`
    });
    index += 1;
  }

  return items;
}

export function imageParagraph(meta, options = {}) {
  if (!meta?.relId) {
    return '';
  }

  const { alt = 'image' } = options;
  const maxWidthPx = 520;
  const widthPx = meta.width > 0 ? Math.min(meta.width, maxWidthPx) : maxWidthPx;
  const ratio = meta.width > 0 && meta.height > 0 ? meta.height / meta.width : 0.75;
  const heightPx = Math.max(60, Math.round(widthPx * (ratio || 0.75)));
  const cx = pxToEmu(widthPx);
  const cy = pxToEmu(heightPx);

  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="80"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${meta.relId.replace(/[^\d]/g, '') || '1'}" name="${escapeXmlAttr(alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${meta.relId.replace(/[^\d]/g, '') || '1'}" name="${escapeXmlAttr(alt)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${meta.relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

export function htmlToDocxParagraphs(html, options = {}) {
  const source = String(html ?? '');
  if (/<table[\s>]/i.test(source)) {
    return htmlToDocxBlocks(source, options);
  }

  return htmlToDocxInlineParagraphs(source, options);
}

export function htmlToDocxInlineRuns(source, options = {}) {
  const { size = '24', color = '', bold = false, imageRegistry = [] } = options;
  const tokens = String(source ?? '').match(/<[^>]+>|[^<]+/g) || [];
  const images = Array.isArray(imageRegistry) ? imageRegistry : [];
  let runs = [];
  let style = { bold, italic: false, underline: false, color: '' };

  const findImageMeta = (src) => {
    const normalized = decodeHtmlEntities(String(src ?? '')).trim();
    if (!normalized) {
      return null;
    }

    return images.find((item) => item.src === normalized) || null;
  };

  const pushRun = (text) => {
    const value = decodeHtmlEntities(String(text ?? '').replace(/\s+/g, ' '));
    if (!value.trim()) {
      if (runs.length > 0) {
        runs.push(runXml(' ', { bold: style.bold, italic: style.italic, underline: style.underline, color, size }));
      }
      return;
    }

    runs.push(runXml(value, {
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
      color: style.color || color,
      size
    }));
  };

  for (const token of tokens) {
    if (token.startsWith('<')) {
      const tag = token.replace(/[<>]/g, '').trim();
      const lower = tag.toLowerCase();

      if (/^img\b/i.test(lower)) {
        const attrs = parseImageAttributes(token);
        const meta = findImageMeta(attrs.src || attrs['data-src'] || attrs['data-lazy-src'] || '');
        if (meta) {
          runs.push(imageParagraph(meta, { alt: attrs.alt || attrs.title || 'image' }));
        }
        continue;
      }

      if (/^br\b/i.test(lower)) {
        runs.push('<w:r><w:br/></w:r>');
        continue;
      }

      if (/^\/?(strong|b)\b/i.test(lower)) {
        style = { ...style, bold: !lower.startsWith('/') };
        continue;
      }

      if (/^\/?(em|i)\b/i.test(lower)) {
        style = { ...style, italic: !lower.startsWith('/') };
        continue;
      }

      if (/^\/?u\b/i.test(lower)) {
        style = { ...style, underline: !lower.startsWith('/') };
        continue;
      }

      if (/^\/?font\b/i.test(lower)) {
        if (lower.startsWith('/')) {
          style = { ...style, color: '' };
        } else {
          const attrs = parseImageAttributes(token);
          const nextColor = String(attrs.color || attrs['data-color'] || attrs['data-docx-color'] || '').trim().replace(/^#/, '');
          style = { ...style, color: nextColor || style.color };
        }
        continue;
      }

      continue;
    }

    pushRun(token);
  }

  return runs.join('');
}

export function htmlToDocxInlineParagraphs(source, options = {}) {
  const { size = '24', color = '', bold = false, imageRegistry = [], indentLeft = '' } = options;
  const tokens = source.match(/<[^>]+>|[^<]+/g) || [];
  const paragraphs = [];
  let runs = [];
  let style = { bold, italic: false, underline: false, color: '' };
  const images = Array.isArray(imageRegistry) ? imageRegistry : [];
  let inListItem = false;
  let listItemPrefixPending = false;

  const findImageMeta = (src) => {
    const normalized = decodeHtmlEntities(String(src ?? '')).trim();
    if (!normalized) {
      return null;
    }

    return images.find((item) => item.src === normalized) || null;
  };

  const pushRun = (text) => {
    const value = decodeHtmlEntities(String(text ?? '').replace(/\s+/g, ' '));
    if (!value.trim()) {
      if (runs.length > 0) {
        runs.push(runXml(' ', { bold: style.bold, italic: style.italic, underline: style.underline, color, size }));
      }
      return;
    }

    runs.push(runXml(value, {
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
      color: style.color || color,
      size
    }));
  };

  const flush = () => {
    if (runs.length === 0) {
      return;
    }

    const indentXml = indentLeft !== '' ? `<w:ind w:left="${indentLeft}"/>` : '';
    paragraphs.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="40"/>${indentXml}</w:pPr>${runs.join('')}</w:p>`);
    runs = [];
  };

  const isBlockEnd = (tag) => /^(\/p|\/div|\/li|\/tr|\/h[1-6]|\/ul|\/ol|\/table)$/i.test(tag);
  const isBlockStart = (tag) => /^(p|div|li|tr|h[1-6]|ul|ol|table)$/i.test(tag);

  for (const token of tokens) {
    if (token.startsWith('<')) {
      const tag = token.replace(/[<>]/g, '').trim();
      const lower = tag.toLowerCase();

      if (/^img\b/i.test(lower)) {
        flush();
        const attrs = parseImageAttributes(token);
        const meta = findImageMeta(attrs.src || attrs['data-src'] || attrs['data-lazy-src'] || '');
        if (meta) {
          paragraphs.push(imageParagraph(meta, { alt: attrs.alt || attrs.title || 'image' }));
        }
        continue;
      }

      if (/^br\b/i.test(lower)) {
        flush();
        continue;
      }

      if (/^\/?(strong|b)\b/i.test(lower)) {
        style = { ...style, bold: !lower.startsWith('/') };
        continue;
      }

      if (/^\/?(em|i)\b/i.test(lower)) {
        style = { ...style, italic: !lower.startsWith('/') };
        continue;
      }

      if (/^\/?u\b/i.test(lower)) {
        style = { ...style, underline: !lower.startsWith('/') };
        continue;
      }

      if (/^\/?font\b/i.test(lower)) {
        if (lower.startsWith('/')) {
          style = { ...style, color: '' };
        } else {
          const attrs = parseImageAttributes(token);
          const nextColor = String(attrs.color || attrs['data-color'] || attrs['data-docx-color'] || '').trim().replace(/^#/, '');
          style = { ...style, color: nextColor || style.color };
        }
        continue;
      }

      if (lower.startsWith('li')) {
        flush();
        inListItem = true;
        listItemPrefixPending = true;
        continue;
      }

      if (lower.startsWith('/li')) {
        flush();
        inListItem = false;
        listItemPrefixPending = false;
        continue;
      }

      if (inListItem && (isBlockStart(lower) || isBlockEnd(lower))) {
        continue;
      }

      if (isBlockEnd(lower) || isBlockStart(lower)) {
        flush();
        continue;
      }

      continue;
    }

    if (inListItem && listItemPrefixPending) {
      pushRun(`- ${token}`);
      listItemPrefixPending = false;
      continue;
    }

    pushRun(token);
  }

  flush();
  return paragraphs.join('');
}

export function htmlToDocxBlocks(source, options = {}) {
  const blocks = [];
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  let lastIndex = 0;
  let match;

  while ((match = tableRegex.exec(source)) !== null) {
    const before = source.slice(lastIndex, match.index);
    const beforeXml = htmlToDocxInlineParagraphs(before, options);
    if (beforeXml) {
      blocks.push(beforeXml);
    }

    blocks.push(htmlTableToDocx(match[0], options));
    blocks.push('<w:p><w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>');
    lastIndex = tableRegex.lastIndex;
  }

  const after = source.slice(lastIndex);
  const afterXml = htmlToDocxInlineParagraphs(after, options);
  if (afterXml) {
    blocks.push(afterXml);
  }

  return blocks.join('');
}

export function stripAnswerParagraphFromSecondCell(cellHtml) {
  const html = String(cellHtml ?? '');
  const paragraphs = html.match(/<p[\s\S]*?<\/p>/gi);

  if (!paragraphs || paragraphs.length === 0) {
    return html;
  }

  const firstParagraphText = htmlToText(paragraphs[0]);
  if (/^[A-D]$/i.test(firstParagraphText) || /^[0-9]+$/.test(firstParagraphText)) {
    return html.replace(paragraphs[0], '');
  }

  return html;
}

export function htmlTableToDocx(tableHtml, options = {}) {
  const rows = [];
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    rows.push(rowMatch[0]);
  }

  const parsedRows = rows.map((rowHtml) => {
    const cells = [];
    const cellRegex = /<(t[dh])[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push({
        tag: cellMatch[1].toLowerCase(),
        html: cellMatch[2]
      });
    }

    if (cells.length > 0) {
      const firstCellText = htmlToText(cells[0].html);
      if (/^\d+$/.test(firstCellText)) {
        cells.shift();
      }
    }

    return cells;
  }).filter((row) => row.length > 0);

  const colCount = parsedRows.reduce((max, row) => Math.max(max, row.length), 0);
  if (colCount === 0) {
    return '';
  }

  const columnWidth = Math.max(Math.floor(9000 / colCount), 1000);
  const gridCols = Array.from({ length: colCount }, () => `<w:gridCol w:w="${columnWidth}"/>`).join('');

  const rowXml = parsedRows.map((row) => {
    const cellXml = row.map((cell, index) => {
      const isHeader = cell.tag === 'th';
      const cellHtml = index === 1 ? stripAnswerParagraphFromSecondCell(cell.html) : cell.html;
      const cellRuns = htmlToDocxInlineParagraphs(cellHtml, {
        ...options,
        bold: isHeader || options.bold
      });

      return `<w:tc>
        <w:tcPr>
          <w:tcW w:w="${columnWidth}" w:type="dxa"/>
          <w:vAlign w:val="top"/>
        </w:tcPr>
        ${cellRuns || '<w:p/>'}
      </w:tc>`;
    }).join('');

    return `<w:tr>${cellXml}</w:tr>`;
  }).join('');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblLayout w:type="fixed"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        <w:insideH w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        <w:insideV w:val="single" w:sz="12" w:space="0" w:color="000000"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>${gridCols}</w:tblGrid>
    ${rowXml}
  </w:tbl>`;
}

export function questionDescriptionHtml(html, options = {}) {
  return htmlToDocxParagraphs(html, { size: '24', ...options });
}

export function runXml(text, options = {}) {
  const { bold = false, color = '', italic = false, size = '', underline = false } = options;
  const runProps = [
    bold === true ? '<w:b/>' : (bold === false ? '<w:b w:val="false"/>' : ''),
    color ? `<w:color w:val="${color}"/>` : '',
    italic ? '<w:i/>' : '',
    underline ? '<w:u w:val="single"/>' : '',
    size ? `<w:sz w:val="${size}"/>` : ''
  ].join('');

  return `<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

export function explanationRuns(text) {
  const stepMatch = String(text).match(/^(Bước|Step)\s+(\d+\s*:)(.*)$/i);

  if (stepMatch) {
    return [
      runXml(`Step ${stepMatch[2]}`, { bold: true, color: '444444', size: '22' }),
      runXml(stepMatch[3], { color: '444444', size: '22' })
    ].join('');
  }

  return runXml(text, { color: '444444', size: '22' });
}

export function paragraphRuns(text, options = {}) {
  const { bold = false, italic = false, underline = false, color = '444444', size = '24' } = options;
  return runXml(text, { bold, italic, underline, color, size });
}

export function borderedParagraph(runs, options = {}) {
  const { top = true, bottom = true, shading = '', before = '0', after = '0' } = options;
  const borders = [
    top ? '<w:top w:val="single" w:sz="12" w:space="1" w:color="000000"/>' : '',
    '<w:left w:val="single" w:sz="12" w:space="4" w:color="000000"/>',
    '<w:right w:val="single" w:sz="12" w:space="4" w:color="000000"/>',
    bottom ? '<w:bottom w:val="single" w:sz="12" w:space="1" w:color="000000"/>' : ''
  ].join('');
  const paragraphShading = shading ? `<w:shd w:fill="${shading}"/>` : '';

  return `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}"/><w:pBdr>${borders}</w:pBdr>${paragraphShading}</w:pPr>${runs}</w:p>`;
}

export function tableCell(runs, options = {}) {
  const { width = 2500, bold = false, gridSpan = 1 } = options;
  const contentRuns = bold ? runXml(runs, { bold: true, size: '24' }) : runs;
  const span = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : '';

  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="pct"/>${span}</w:tcPr><w:p>${contentRuns}</w:p></w:tc>`;
}

export function tableCellRaw(contentXml, options = {}) {
  const { width = 5000, gridSpan = 1 } = options;
  const span = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="pct"/>${span}</w:tcPr>${contentXml}</w:tc>`;
}

export function lineBreakXml() {
  return '<w:r><w:br/></w:r>';
}

export function questionChoicesXml(choices = []) {
  if (!Array.isArray(choices) || choices.length === 0) {
    return '';
  }

  return choices.map((choice) => {
    const text = choice?.text ?? '';
    const shading = choice.correct ? '<w:shd w:fill="00FFFF"/>' : '';
    const color = choice.correct ? 'FF0000' : '000000';

    return `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${shading}</w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:color w:val="${color}"/>${choice.correct ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  }).join('');
}

export function questionAnswerParagraph(answer) {
  if (!answer) {
    return '';
  }

  return `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/><w:shd w:fill="00FFFF"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">Answer: ${escapeXml(answer)}</w:t></w:r></w:p>`;
}

export function cleanExplanationLine(line) {
  return String(line ?? '')
    .replace(/^\s*[\{\[]+\s*/g, '')
    .replace(/^Câu\s+\d+\s*[:.]\s*/i, '')
    .replace(/^Question\s+\d+\s*:?\s*/i, '')
    .replace(/^\s*[\}\]]+\s*/g, '')
    .trim();
}

export function normalizeExplanationHtml(html, answerTokens = [], answerTextMap = new Map(), rawTypeKey = '') {
  const source = String(html ?? '');
  const normalizedRawTypeKey = String(rawTypeKey || '').trim().toUpperCase();
  const isClusterAnswerType = normalizedRawTypeKey.startsWith('MATCHING_')
    || normalizedRawTypeKey === 'SUMMARY_COMPLETION'
    || normalizedRawTypeKey === 'SENTENCE_COMPLETION'
    || normalizedRawTypeKey === 'SHORT_ANSWER';
  const escapeRegExp = (value) => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wrapMatchingChoiceText = (choiceText) => `<strong>&quot;${escapeHtml(choiceText.length > 70 ? `${choiceText.slice(0, 67).trimEnd()}...` : choiceText)}&quot;</strong>`;
  let preprocessedSource = source
    .replace(/(<u>\s*<strong>\s*)Bước\s+(\d+)(\s*<\/strong>\s*<\/u>)/gi, '$1Step $2$3')
    .replace(/(<strong>\s*)Bước\s+(\d+)(\s*<\/strong>)/gi, '$1Step $2$3')
    .replace(/\bBước\s+(\d+)\s*:/gi, 'Step $1:')
    .replace(/(<strong>\s*)(\d+)(\s*<\/strong>)\s*->/gi, '$1[[$2]]$3 ->')
    .replace(/\b(\d+)\s*->/g, '[[$1]] ->');

  if (normalizedRawTypeKey.startsWith('MATCHING_')) {
    const normalizedChoiceEntries = Array.from(answerTextMap instanceof Map ? answerTextMap.entries() : Object.entries(answerTextMap || {}))
      .map(([key, value]) => [normalizeChoiceLabel(key), String(value ?? '').trim()])
      .filter(([key, value]) => Boolean(key) && Boolean(value));

    normalizedChoiceEntries.forEach(([choiceKey, choiceText]) => {
      const safeKey = escapeRegExp(choiceKey);
      const replacement = wrapMatchingChoiceText(choiceText);
      preprocessedSource = preprocessedSource.replace(
        new RegExp(`<\\s*${safeKey}\\s*>`, 'gi'),
        replacement
      );
      preprocessedSource = preprocessedSource.replace(
        new RegExp(`&lt;\\s*${safeKey}\\s*&gt;`, 'gi'),
        replacement
      );
      preprocessedSource = preprocessedSource.replace(
        new RegExp(`<\\s*(?:strong|b)\\s*>\\s*${safeKey}\\s*<\\s*\\/\\s*(?:strong|b)\\s*>`, 'gi'),
        replacement
      );
      preprocessedSource = preprocessedSource.replace(
        new RegExp(`(?:Đáp\\s*án|Answer|Câu)\\s*[:.\\-]?\\s*${safeKey}\\b`, 'gi'),
        `Đáp án ${replacement}`
      );
    });
  }

  const stripped = preprocessedSource
    .replaceAll(/<p>\s*(\{\[|\{\{)\s*<\/p>/gi, '')
    .replaceAll(/(<(?:p|div|li|span|h[1-6])\b[^>]*>)\s*(\{\[|\{\{)/gi, '$1')
    .replaceAll(/^\s*(\{\[|\{\{)\s*/gi, '')
    .replaceAll(/(\]\}|\}\})\s*(?=<\/(?:p|div|li|span|h[1-6])>)/gi, '')
    .replaceAll(/\s*(\]\}|\}\})\s*$/gi, '')
    .replaceAll(/<p>\s*Câu\s+\d+\s*[:.]\s*<\/p>/gi, '')
    .replaceAll(/<p>\s*Question\s+\d+\s*:?\s*<\/p>/gi, '');

  const normalizedTokens = new Set(
    (Array.isArray(answerTokens) ? answerTokens : [])
      .map((token) => htmlToText(token).trim().toUpperCase())
      .filter(Boolean)
  );

  const normalizedChoiceMap = new Map(
    Array.from(answerTextMap instanceof Map ? answerTextMap.entries() : Object.entries(answerTextMap || {}))
      .map(([key, value]) => [normalizeChoiceLabel(key), String(value ?? '').trim()])
      .filter(([, value]) => Boolean(value))
  );

  if (normalizedRawTypeKey === 'MULTIPLE_CHOICE_MANY') {
    for (const choiceText of normalizedChoiceMap.values()) {
      const plain = String(choiceText || '').trim();
      if (!plain) {
        continue;
      }

      const escapedPlain = escapeRegExp(plain);
      preprocessedSource = preprocessedSource
        .replace(
          new RegExp(`(Giải thích\\s+)?Đáp\\s*án\\s+<strong>${escapedPlain}<\\/strong>\\s*:\\s*${escapedPlain}\\s*[:.]?`, 'gi'),
          (_match, prefix = '') => `${prefix || ''}Đáp án <strong>${plain}</strong>`
        )
        .replace(
          new RegExp(`(Giải thích\\s+)?Đáp\\s*án\\s+<strong>${escapedPlain}<\\/strong>\\s*[:.]?\\s*$`, 'gi'),
          (_match, prefix = '') => `${prefix || ''}Đáp án <strong>${plain}</strong>`
        )
        .replace(
          new RegExp(`(Giải thích\\s+)?Đáp\\s*án\\s+&quot;<strong>${escapedPlain}<\\/strong>&quot;\\s*:\\s*${escapedPlain}\\s*[:.]?`, 'gi'),
          (_match, prefix = '') => `${prefix || ''}Đáp án <strong>${plain}</strong>`
        )
        .replace(
          new RegExp(`(Giải thích\\s+)?Đáp\\s*án\\s+&quot;<strong>${escapedPlain}<\\/strong>&quot;\\s*[:.]?\\s*$`, 'gi'),
          (_match, prefix = '') => `${prefix || ''}Đáp án <strong>${plain}</strong>`
        );
    }
  }

  const getChoiceText = (key) => normalizedChoiceMap.get(normalizeChoiceLabel(key)) || '';

  const isStandaloneAnswerText = (value) => {
    const text = htmlToText(value).replace(/\u00a0/g, ' ').trim();
    if (!text || normalizedTokens.size === 0) {
      return false;
    }

    const cleaned = text
      .replace(/^[\-•*]\s*/g, '')
      .replace(/^(?:đáp\s*án|answer|đap\s*an|câu\s+\d+)\s*[:.\-]?\s*/i, '')
      .trim()
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .replace(/[.,;:!?]+$/g, '')
      .trim()
      .toUpperCase();

    if (!cleaned) {
      return false;
    }

    return [...normalizedTokens].some((token) => {
      const safeToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${safeToken}$`, 'i').test(cleaned);
    });
  };

  const replaceAnswerRefs = (htmlText) => {
    const output = normalizedRawTypeKey.startsWith('MATCHING_')
      ? String(htmlText ?? '')
      : decodeHtmlEntities(String(htmlText ?? ''));
    const strongTagPattern = String.raw`<\s*(?:strong|b)(?:\s[^>]*)?>\s*`;
    const strongClosePattern = String.raw`<\s*\/\s*(?:strong|b)\s*>`;
    const replaceWithChoice = (match, key) => {
      const choiceText = normalizedChoiceMap.get(normalizeChoiceLabel(key));
      if (!choiceText) {
        return match;
      }

      const displayText = choiceText.length > 70
        ? `${choiceText.slice(0, 67).trimEnd()}...`
        : choiceText;

      if (normalizedRawTypeKey.startsWith('MATCHING_')) {
        return `<strong>&quot;${escapeHtml(displayText)}&quot;</strong>`;
      }

      if (normalizedRawTypeKey === 'MULTIPLE_CHOICE_MANY') {
        return `Đáp án &quot;${escapeHtml(choiceText)}&quot;`;
      }

      return `Đáp án "<strong>${escapeHtml(displayText)}</strong>"`;
    };

    let replaced = output;
    const keys = Array.from(normalizedChoiceMap.keys()).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      replaced = replaced.replace(
        new RegExp(`(?:Đáp\\s*án|Answer|Câu)\\s*[:.\\-]?\\s*${strongTagPattern}${safeKey}${strongClosePattern}`, 'gi'),
        (match) => replaceWithChoice(match, key)
      );
      replaced = replaced.replace(
        new RegExp(`(?:Đáp\\s*án|Answer|Câu)\\s*[:.\\-]?\\s*${safeKey}\\b`, 'gi'),
        (match) => replaceWithChoice(match, key)
      );
      replaced = replaced.replace(
        new RegExp(`\\b${safeKey}\\s*[-–—]\\s*(?=[\"'“”‘’])`, 'gi'),
        ''
      );
    }

    return replaced;
  };

  const answerBlockPatterns = [
    /<p\b[^>]*>\s*([^<]{1,40})\s*<\/p>/gi,
    /<li\b[^>]*>\s*([^<]{1,80})\s*<\/li>/gi
  ];

  let normalizedHtml = replaceAnswerRefs(preprocessedSource.replaceAll(/<p>\s*(\{\[|\{\{)\s*<\/p>/gi, '')
    .replaceAll(/(<(?:p|div|li|span|h[1-6])\b[^>]*>)\s*(\{\[|\{\{)/gi, '$1')
    .replaceAll(/^\s*(\{\[|\{\{)\s*/gi, '')
    .replaceAll(/(\]\}|\}\})\s*(?=<\/(?:p|div|li|span|h[1-6])>)/gi, '')
    .replaceAll(/\s*(\]\}|\}\})\s*$/gi, '')
    .replaceAll(/<p>\s*Câu\s+\d+\s*[:.]\s*<\/p>/gi, '')
    .replaceAll(/<p>\s*Question\s+\d+\s*:?\s*<\/p>/gi, ''));
  for (const pattern of answerBlockPatterns) {
    normalizedHtml = normalizedHtml.replace(pattern, (match, inner) => {
      const text = htmlToText(inner ?? match).trim();
      const normalized = text.toUpperCase();
      const choiceText = normalizedChoiceMap.get(normalizeChoiceLabel(normalized));

      if (choiceText) {
        return match.replace(
          inner,
          `<strong>${escapeHtml(choiceText.length > 70 ? `${choiceText.slice(0, 67).trimEnd()}...` : choiceText)}</strong>`
        );
      }

      const isTokenLike = /^[A-Z0-9IVXLCDM]+$/.test(normalized);
      if (rawTypeKey === 'MULTIPLE_CHOICE_MANY' && isTokenLike) {
        return match;
      }

      if (rawTypeKey === 'MULTIPLE_CHOICE_MANY' && normalizedChoiceMap.size > 0) {
        for (const rawChoiceText of normalizedChoiceMap.values()) {
          const safeChoiceText = rawChoiceText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const prefixPattern = new RegExp(
            `^\\s*["'“”‘’]?(${safeChoiceText})["'“”‘’]?\\s*[:：]\\s*(.*)$`,
            'i'
          );
          const prefixMatch = String(inner ?? '').match(prefixPattern);
          if (prefixMatch) {
            return match.replace(
              inner,
              `<strong>${escapeHtml(prefixMatch[1])}</strong>: ${escapeHtml(prefixMatch[2].trim())}`
            );
          }
        }
      }

      if (/^\d+$/.test(text) || isTokenLike || isStandaloneAnswerText(text)) {
        return '';
      }
      return match;
    });
  }

  if (normalizedRawTypeKey === 'MULTIPLE_CHOICE_MANY') {
    normalizedHtml = normalizedHtml
      .replace(
        /(Giải thích\s+)?(?:-\s*)?Đáp\s*án\s+([A-Z0-9IVXLCDM]+)\s*:\s*[\s\S]*?\s*=>/gi,
        (match, prefix = '', key) => {
          const choiceText = normalizedChoiceMap.get(normalizeChoiceLabel(key));
          if (!choiceText) {
            return match;
          }
          return `${prefix || ''}Đáp án "${escapeHtml(choiceText)}" =>`;
        }
      )
      .replace(
        /(Giải thích\s+)?Đáp\s*án\s+&quot;([^<]+?)&quot;\s*:\s*\2\s*(=>|[:.]?)/gi,
        (_match, prefix = '', choiceText, arrow) => `${prefix || ''}Đáp án &quot;${choiceText}&quot;${String(arrow || '').includes('=>') ? ' =>' : arrow}`
      )
      .replace(
        /(Giải thích\s+)?(?:-\s*)?Đáp\s*án\s+([A-Z0-9IVXLCDM]+)\s*:\s*([^<\n\r]+?)(\s*=>)/gi,
        (match, prefix = '', key, _value, arrow) => {
          const choiceText = normalizedChoiceMap.get(normalizeChoiceLabel(key));
          if (!choiceText) {
            return match;
          }
          return `${prefix || ''}Đáp án "${escapeHtml(choiceText)}"${String(arrow || '').includes('=>') ? ' =>' : arrow}`;
        }
      );
  }

  if (normalizedRawTypeKey === 'MULTIPLE_CHOICE_MANY') {
    for (const choiceText of normalizedChoiceMap.values()) {
      const plain = String(choiceText || '').trim();
      if (!plain) {
        continue;
      }
      const safePlain = escapeRegExp(plain);
      normalizedHtml = normalizedHtml.replace(
        new RegExp(`(Giải thích\\s+)?Đáp\\s*án\\s+&quot;${safePlain}&quot;\\s*:\\s*[\\s\\S]*?\\s*=>`, 'gi'),
        (_match, prefix = '') => `${prefix || ''}Đáp án &quot;${plain}&quot; =>`
      );
    }
  }

  return normalizedHtml;
}

export function replaceAnswerRefsInXml(xml, answerTextMap = new Map(), rawTypeKey = '') {
  const xmlSource = String(xml ?? '');
  const normalizedChoiceMap = new Map(
    Array.from(answerTextMap instanceof Map ? answerTextMap.entries() : Object.entries(answerTextMap || {}))
      .map(([key, value]) => [String(key).trim().toUpperCase(), String(value ?? '').trim()])
      .filter(([, value]) => Boolean(value))
  );
  const normalizedRawTypeKey = String(rawTypeKey || '').trim().toUpperCase();
  const isClusterAnswerType = normalizedRawTypeKey.startsWith('MATCHING_')
    || normalizedRawTypeKey === 'SUMMARY_COMPLETION'
    || normalizedRawTypeKey === 'SENTENCE_COMPLETION'
    || normalizedRawTypeKey === 'SHORT_ANSWER';

  let output = normalizedRawTypeKey === 'MULTIPLE_CHOICE_MANY'
    ? decodeHtmlEntities(xmlSource)
    : xmlSource
    .replace(/(<u>\s*<strong>\s*)Bước\s+(\d+)(\s*<\/strong>\s*<\/u>)/gi, '$1Step $2$3')
    .replace(/(<strong>\s*)Bước\s+(\d+)(\s*<\/strong>)/gi, '$1Step $2$3')
    .replace(/\bBước\s+(\d+)\s*:/gi, 'Step $1:')
    .replace(/(<strong>\s*)(\d+)(\s*<\/strong>)\s*->/gi, '$1[[$2]]$3 ->')
    .replace(/\b(\d+)\s*->/g, '[[$1]] ->');
  if (isClusterAnswerType) {
    output = output.replace(/(<strong>\s*)(\d+)(\s*<\/strong>)\s*->/gi, '$1[[$2]]$3 ->');
    output = output.replace(/\b(\d+)\s*->/g, '[[$1]] ->');
  }
  const strongTagPattern = String.raw`<\s*(?:strong|b)(?:\s[^>]*)?>\s*`;
  const strongClosePattern = String.raw`<\s*\/\s*(?:strong|b)\s*>`;
  normalizedChoiceMap.forEach((choiceText, choiceKey) => {
    const replacement = normalizedRawTypeKey.startsWith('MATCHING_')
      ? `<strong>&quot;${escapeXml(choiceText)}&quot;</strong>`
      : (normalizedRawTypeKey === 'MULTIPLE_CHOICE_MANY'
        ? `Đáp án &quot;<strong>${escapeXml(choiceText)}</strong>&quot;`
        : `Đáp án &quot;${escapeXml(choiceText)}&quot;`);
    output = output.replace(
      new RegExp(`(?:Đáp\\s*án|Answer|Câu)\\s*[:.\\-]?\\s*${strongTagPattern}${choiceKey}${strongClosePattern}`, 'gi'),
      replacement
    );
    output = output.replace(
      new RegExp(`(?:Đáp\\s*án|Answer|Câu)\\s*[:.\\-]?\\s*${choiceKey}\\b`, 'gi'),
      replacement
    );
    output = output.replace(
      new RegExp(`\\b${choiceKey}\\s*[-–—]\\s*(?=&quot;|&#34;|&ldquo;|&rdquo;|&lsquo;|&rsquo;|['"“”‘’])`, 'gi'),
      ''
    );
  });

  if (normalizedRawTypeKey === 'MULTIPLE_CHOICE_MANY') {
    output = output
      .replace(
        /(Giải thích\s+)?(?:-\s*)?Đáp\s*án\s+([A-Z0-9IVXLCDM]+)\s*:\s*[\s\S]*?\s*=>/gi,
        (match, prefix = '', key) => {
          const choiceText = normalizedChoiceMap.get(normalizeChoiceLabel(key));
          if (!choiceText) {
            return match;
          }
          return `${prefix || ''}Đáp án &quot;<strong>${escapeXml(choiceText)}</strong>&quot; =>`;
        }
      );

    for (const choiceText of normalizedChoiceMap.values()) {
      const plain = String(choiceText || '').trim();
      if (!plain) {
        continue;
      }

      const xmlExact = `Đáp án <strong>${escapeXml(plain)}</strong>: ${escapeXml(plain)}:`;
      const xmlExactWithPrefix = `Giải thích Đáp án <strong>${escapeXml(plain)}</strong>: ${escapeXml(plain)}:`;
      output = output
        .replaceAll(xmlExactWithPrefix, `Giải thích Đáp án <strong>${escapeXml(plain)}</strong>`)
        .replaceAll(xmlExact, `Đáp án <strong>${escapeXml(plain)}</strong>`);
    }

    output = output
      .replace(
        /(Giải thích\s+)?Đáp\s*án\s+&quot;([^<]+?)&quot;\s*:\s*\2\s*(=>|[:.]?)/gi,
        (_match, prefix = '', choiceText, arrow) => `${prefix || ''}Đáp án &quot;${choiceText}&quot;${String(arrow || '').includes('=>') ? ' =>' : arrow}`
      )
      .replace(
        /(Giải thích\s+)?Đáp\s*án\s+&quot;([^<]+?)&quot;\s*:\s*[\s\S]*?\s*=>/gi,
        (_match, prefix = '', choiceText) => `${prefix || ''}Đáp án &quot;${choiceText}&quot; =>`
      )
      .replace(
        /(Giải thích\s+)?(?:-\s*)?Đáp\s*án\s+([A-Z0-9IVXLCDM]+)\s*:\s*([^<\n\r]+?)(\s*=>)/gi,
        (match, prefix = '', key, _value, arrow) => {
          const choiceText = normalizedChoiceMap.get(normalizeChoiceLabel(key));
          if (!choiceText) {
            return match;
          }
          return `${prefix || ''}Đáp án &quot;<strong>${escapeXml(choiceText)}</strong>&quot;${String(arrow || '').includes('=>') ? ' =>' : arrow}`;
        }
      );
    for (const choiceText of normalizedChoiceMap.values()) {
      const plain = String(choiceText || '').trim();
      if (!plain) {
        continue;
      }
      const safePlain = escapeXml(plain);
      output = output.replace(
        new RegExp(`(Giải thích\\s+)?Đáp\\s*án\\s+&quot;${safePlain}&quot;\\s*:\\s*[\\s\\S]*?\\s*=>`, 'gi'),
        (_match, prefix = '') => `${prefix || ''}Đáp án &quot;<strong>${safePlain}</strong>&quot; =>`
      );
    }
  }

  if (String(process.env.E_LEARNING_DEBUG_READING || '').trim().toLowerCase() === 'true' && normalizedRawTypeKey === 'MULTIPLE_CHOICE_MANY' && /Đáp\s*án/i.test(xmlSource)) {
    console.log('[replaceAnswerRefsInXml][MULTIPLE_CHOICE_MANY]', {
      sourceSnippet: xmlSource.replace(/\s+/g, ' ').slice(0, 500),
      outputSnippet: output.replace(/\s+/g, ' ').slice(0, 500),
      choices: Array.from(normalizedChoiceMap.entries())
    });
  }

  return output;
}

export function questionKeywordsParagraphs(keywords = []) {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return '';
  }
  return '';
}

export function questionExplanationBlock(explanationHtml = '', answerTokens = [], answerTextMap = new Map(), rawTypeKey = '') {
  const source = String(explanationHtml ?? '');
  if (!source.trim()) {
    return '';
  }

  const normalizedSource = replaceAnswerRefsInXml(source, answerTextMap, rawTypeKey);
  const body = htmlToDocxParagraphs(normalizedSource, { size: '24', indentLeft: '720' });
  return [
    styledParagraph('Lời giải:', { bold: true, size: '24', before: '40', after: '20', indentLeft: '720' }),
    body
  ].join('');
}

export function questionBlockKeywordsAndExplanation(block) {
  return [
    questionKeywordsParagraphs(block.keywords),
    questionExplanationBlock(block.explanationHtml, block.answerTokens, block.answerTextMap, block.rawTypeKey)
  ].filter(Boolean).join('');
}

export function questionKeywordsBlock(block) {
  return questionKeywordsParagraphs(block.keywords);
}

export function explanationBlock(block) {
  return questionBlockKeywordsAndExplanation(block);
}

export function serializeRenderValue(value) {
  if (value instanceof Map) {
    return Array.from(value.entries());
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeRenderValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeRenderValue(item)])
    );
  }

  return value;
}

export function appendDocxRenderLog(record, filePath = 'logs/e-learning-render-docx.log', enableFileLogs = true) {
  if (!enableFileLogs) {
    return '';
  }

  const payload = `${JSON.stringify(serializeRenderValue(record), null, 2)}\n\n`;

  try {
    const directory = filePath.split('/').slice(0, -1).join('/');
    if (directory && !existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    appendFileSync(filePath, payload, 'utf8');
    return filePath;
  } catch {
    return '';
  }
}

function buildDocxStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:keepLines/>
      <w:spacing w:before="240" w:after="120"/>
      <w:outlineLvl w:val="0"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="36"/>
      <w:color w:val="0F4C5C"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:uiPriority w:val="10"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:keepLines/>
      <w:spacing w:before="240" w:after="120"/>
      <w:outlineLvl w:val="1"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="28"/>
      <w:color w:val="1F6FEB"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="Heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:uiPriority w:val="11"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:keepLines/>
      <w:spacing w:before="160" w:after="40"/>
      <w:outlineLvl w:val="2"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="26"/>
    </w:rPr>
  </w:style>
</w:styles>`;
}

export function appendQuestionTypeLog(rows = [], filePath = 'logs/e-learning-question-types.log', enableFileLogs = true, id = '') {
  if (!enableFileLogs) {
    return '';
  }

  const lines = Array.isArray(rows)
    ? rows.map((row) => {
        const rawTypeKey = String(row?.rawTypeKey ?? '').trim();
        const questionOrder = String(row?.questionOrder ?? '').trim();
        const startOrder = questionOrder.match(/\d+/)?.[0] || '';
        return [String(id ?? '').trim(), rawTypeKey, startOrder].join(' | ');
      }).filter((line) => line.trim() && !line.endsWith(' | '))
    : [];

  try {
    const directory = filePath.split('/').slice(0, -1).join('/');
    if (directory && !existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    if (lines.length > 0) {
      appendFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
    }
    return filePath;
  } catch {
    return '';
  }
}

export function resetDocxRenderLog(filePath = 'logs/e-learning-render-docx.log', enableFileLogs = true) {
  if (!enableFileLogs) {
    return '';
  }

  try {
    const directory = filePath.split('/').slice(0, -1).join('/');
    if (directory && !existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(filePath, '', 'utf8');
    return filePath;
  } catch {
    return '';
  }
}

export function summarizeQuestionTypes(resultLines = []) {
  const summaries = [];
  const seen = new Set();

  for (const line of Array.isArray(resultLines) ? resultLines : []) {
    if (!line || typeof line !== 'object') {
      continue;
    }

    if (line.type === 'questionGroup') {
      const rawTypeKey = String(line.rawTypeKey ?? '').trim();
      const questionOrder = String(line.questionOrder ?? '').trim();
      if (!rawTypeKey || !questionOrder || !isReadingRawType(rawTypeKey) || seen.has(rawTypeKey)) {
        continue;
      }

      seen.add(rawTypeKey);
      summaries.push({
        rawTypeKey,
        questionOrder
      });
    }
  }

  return summaries;
}

export function summarizeUnknownQuestionTypes(resultLines = []) {
  const summaries = [];
  const seen = new Set();

  for (const line of Array.isArray(resultLines) ? resultLines : []) {
    if (!line || typeof line !== 'object') {
      continue;
    }

    if (line.type === 'questionGroup') {
      const rawTypeKey = String(line.rawTypeKey ?? '').trim();
      const questionOrder = String(line.questionOrder ?? '').trim();
      if (!rawTypeKey || !questionOrder || isReadingRawType(rawTypeKey) || seen.has(rawTypeKey)) {
        continue;
      }

      seen.add(rawTypeKey);
      summaries.push({
        rawTypeKey,
        questionOrder
      });
    }
  }

  return summaries;
}

export function formatResult(result) {
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

export function createDocxCore(deps) {
  const {
    buildCoverPageLines,
    buildImageRegistry,
    coverTitleParagraph,
    coverSubjectParagraph,
    coverCodeParagraph,
    pageBreakParagraph,
    heading,
    questionGroup,
    questionDescriptionHtml,
    questionTitle,
    questionTitleWithHtml,
    questionTextParagraph,
    questionAnswerParagraph,
    questionTitleWithAnswerOnly,
    questionTitleWithAnswer,
    questionTitleWithTrailingAnswer,
    readingTestTitle,
    passageLabel,
    passageTitle,
    passageParagraph,
    extractImageOnlyHtml,
    htmlToDocxParagraphs,
    questionKeywordsBlock,
    questionExplanationBlock,
    answerParagraph,
    choiceParagraph,
    questionInfoParagraph,
    paragraph,
    formatResult,
    appendDocxRenderLog,
    appendQuestionTypeLog,
    summarizeUnknownQuestionTypes,
    enableFileLogs = true,
    renderLogFile = 'logs/e-learning-render-docx.log',
    questionTypesLogFile = 'logs/e-learning-question-types.log',
    unknownQuestionTypesLogFile = 'logs/e-learning-question-types-unknown.log',
    createZip
  } = deps;

  return {
    async createDocx({ id, result, quizTypeOverride, testMode = false }) {
      const quizType = resolveEffectiveQuizType(quizTypeOverride, result?.data?.quiz_type);
      console.log('[createDocx]', { id, quizTypeOverride, quizType });
      const imageRegistry = await buildImageRegistry(result);
      const coverLines = buildCoverPageLines({
        quizType,
        id,
        title: result?.data?.title
      });
      const resultLines = deps.formatYouPassResult(result, quizTypeOverride, { testMode });
      const renderLine = (line) => {
        if (line.type === 'coverTitle') {
          return coverTitleParagraph(line.text);
        }

        if (line.type === 'coverSubject') {
          return coverSubjectParagraph(line.text);
        }

        if (line.type === 'coverCode') {
          return coverCodeParagraph(line.text);
        }

        if (line.type === 'pageBreak') {
          return pageBreakParagraph();
        }

        if (line.type === 'heading') {
          return heading(line.text);
        }

        if (line.type === 'questionGroup') {
          return questionGroup(line.text);
        }

        if (line.type === 'questionDescriptionHtml') {
          return questionDescriptionHtml(line.html, { ...(line.options || {}), imageRegistry });
        }

        if (line.type === 'questionTitle') {
          const questionInfoXml = line.questionInfoText ? questionInfoParagraph(line.questionInfoText) : '';
          if (line.questionHtml) {
            return `${questionTitleWithHtml(line.text, line.questionHtml, '. ', { size: '26', imageRegistry })}${questionInfoXml}`;
          }
          if (line.rawTypeKey === 'MATCHING_ENDINGS' && line.answerText) {
            return `${questionTitleWithTrailingAnswer(line.text, line.questionText || '', line.answerText, '. ')}${questionInfoXml}`;
          }
          if (line.answerText) {
            return `${questionTitleWithAnswer(line.text, line.questionText || '', line.answerText, '. ', ' -> ')}${questionInfoXml}`;
          }
          if (line.questionText) {
            return `${questionTitleWithText(line.text, line.questionText, '. ')}${questionInfoXml}`;
          }
          return `${questionTitle(line.text)}${questionInfoXml}`;
        }

        if (line.type === 'questionText') {
          return questionTextParagraph(line.text);
        }

        if (line.type === 'questionAnswerBlock') {
          return questionAnswerParagraph(line.answer);
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

        if (line.type === 'passageListeningTable') {
          return passageListeningTable(line.blocks);
        }

        if (line.type === 'questionGapHtml') {
          const html = line.rawTypeKey === 'MAP_DIAGRAM_LABEL'
            ? extractImageOnlyHtml(line.html)
            : line.html;
          return htmlToDocxParagraphs(html, { size: '26', imageRegistry });
        }

        if (line.type === 'explanation') {
          return explanationParagraph(line);
        }

        if (line.type === 'questionKeywordsBlock') {
          return questionKeywordsBlock(line);
        }

        if (line.type === 'questionExplanationBlock') {
          return questionExplanationBlock(line.explanationHtml, line.answerTokens, line.answerTextMap, line.rawTypeKey);
        }

        if (line.type === 'answer') {
          return answerParagraph(line.text);
        }

        if (line.type === 'choice') {
          return choiceParagraph(line);
        }

        if (line.type === 'questionInfo') {
          return questionInfoParagraph(line.text);
        }

        return paragraph(line.text);
      };
      const lines = [
        ...(coverLines.length > 0 ? coverLines.map(renderLine) : []),
        ...(resultLines.length > 0
          ? resultLines.map(renderLine)
          : [heading('Noi dung'), ...formatResult(result).map(paragraph)])
      ].join('');

      const questionTypes = summarizeQuestionTypes(resultLines);
      const unknownQuestionTypes = typeof summarizeUnknownQuestionTypes === 'function'
        ? summarizeUnknownQuestionTypes(resultLines)
        : [];

      appendDocxRenderLog({
        exportedAt: new Date().toISOString(),
        id,
        quizType,
        coverLines,
        resultLines,
        questionTypes,
        unknownQuestionTypes
      }, renderLogFile, enableFileLogs);

      appendQuestionTypeLog(questionTypes, questionTypesLogFile, enableFileLogs, id);
      appendQuestionTypeLog(unknownQuestionTypes, unknownQuestionTypesLogFile, enableFileLogs, id);

      const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${lines}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

      const imageContentTypes = [...new Set(imageRegistry.map((item) => item.ext).filter(Boolean))].map((ext) => (
        `<Default Extension="${ext}" ContentType="image/${ext === 'jpg' ? 'jpeg' : ext}"/>`
      )).join('\n  ');

      const imageRelationships = imageRegistry.map((item) => (
        `<Relationship Id="${item.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.name}"/>`
      )).join('\n  ');

      return createZip([
        {
          name: '[Content_Types].xml',
          data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${imageContentTypes}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
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
          name: 'word/styles.xml',
          data: buildDocxStylesXml()
        },
        {
          name: 'word/_rels/document.xml.rels',
          data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${imageRelationships}
</Relationships>`
        },
        ...imageRegistry.map((item) => ({
          name: `word/media/${item.name}`,
          data: item.buffer
        })),
        {
          name: 'word/document.xml',
          data: documentXml
        }
      ]);
    }
  };
}

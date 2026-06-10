import http from 'node:http';
import { Buffer } from 'node:buffer';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCoverPageLines } from './cover-page.js';
import { resolveQuizType } from './quiz-types.js';

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
const EXPORT_LOG_FILE = 'logs/e-learning-export-log.log';
const DOCX_RENDER_LOG_FILE = 'logs/e-learning-render-docx.log';

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

const CP1252_REVERSE = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f
};

function decodeCp1252Utf8(value) {
  const bytes = [];
  for (const char of String(value ?? '')) {
    const code = char.codePointAt(0);
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }

    if (CP1252_REVERSE[char] !== undefined) {
      bytes.push(CP1252_REVERSE[char]);
      continue;
    }

    return String(value ?? '');
  }

  return Buffer.from(bytes).toString('utf8');
}

function fixUtf8Mojibake(value) {
  const text = String(value ?? '');
  if (!/[ÃÂÄÆ]|á[»º¼½¾]/.test(text)) {
    return text;
  }

  const latin1Decoded = Buffer.from(text, 'latin1').toString('utf8');
  const cp1252Decoded = decodeCp1252Utf8(text);
  const mojibakeCount = (text.match(/[ÃÂÄÆ]|á[»º¼½¾]/g) || []).length;
  const latin1BadCount = ((latin1Decoded.match(/[ÃÂÄÆ]|á[»º¼½¾]/g) || []).length) + (latin1Decoded.match(/\uFFFD/g) || []).length;
  const cp1252BadCount = ((cp1252Decoded.match(/[ÃÂÄÆ]|á[»º¼½¾]/g) || []).length) + (cp1252Decoded.match(/\uFFFD/g) || []).length;

  if (cp1252BadCount < latin1BadCount && cp1252BadCount < mojibakeCount) {
    return cp1252Decoded;
  }

  if (latin1BadCount < mojibakeCount) {
    return latin1Decoded;
  }

  return cp1252Decoded;
}

function htmlToText(value) {
  return fixUtf8Mojibake(
    decodeHtmlEntities(
    String(value ?? '')
      .replaceAll(/\{\[([\s\S]*?)\]\[[^\]]+\]\}/g, '$1')
      .replaceAll(/<script[\s\S]*?<\/script>/gi, '')
      .replaceAll(/<style[\s\S]*?<\/style>/gi, '')
      .replaceAll(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)>/gi, '\n')
      .replaceAll(/<li[^>]*>/gi, '- ')
      .replaceAll(/<t[dh][^>]*>/gi, ' ')
      .replaceAll(/<[^>]+>/g, '')
  ))
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
  return styledParagraph(text, { align: 'left', bold: true, size: '28', after: '260' });
}

function passageParagraph(text) {
  return styledParagraph(text, { size: '26', before: '80', after: '80' });
}

function htmlToDocxParagraphs(html, options = {}) {
  const { size = '24', color = '', bold = false } = options;
  const source = String(html ?? '');
  if (/<table[\s>]/i.test(source)) {
    return htmlToDocxBlocks(source, options);
  }

  return htmlToDocxInlineParagraphs(source, options);
}

function htmlToDocxInlineParagraphs(source, options = {}) {
  const { size = '24', color = '', bold = false } = options;
  const tokens = source.match(/<[^>]+>|[^<]+/g) || [];
  const paragraphs = [];
  let runs = [];
  let style = { bold, italic: false, underline: false };

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
      color,
      size
    }));
  };

  const flush = () => {
    if (runs.length === 0) {
      return;
    }

    paragraphs.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="40"/></w:pPr>${runs.join('')}</w:p>`);
    runs = [];
  };

  const isBlockEnd = (tag) => /^(\/p|\/div|\/li|\/tr|\/h[1-6]|\/ul|\/ol|\/table)$/i.test(tag);
  const isBlockStart = (tag) => /^(p|div|li|tr|h[1-6]|ul|ol|table)$/i.test(tag);

  for (const token of tokens) {
    if (token.startsWith('<')) {
      const tag = token.replace(/[<>]/g, '').trim();
      const lower = tag.toLowerCase();

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

      if (lower.startsWith('li')) {
        flush();
        runs.push(runXml('- ', { bold: false, italic: false, underline: false, color, size }));
        continue;
      }

      if (isBlockEnd(lower) || isBlockStart(lower)) {
        flush();
        continue;
      }

      continue;
    }

    pushRun(token);
  }

  flush();
  return paragraphs.join('');
}

function htmlToDocxBlocks(source, options = {}) {
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

function stripAnswerParagraphFromSecondCell(cellHtml) {
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

function htmlTableToDocx(tableHtml, options = {}) {
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

function coverTitleParagraph(text) {
  return styledParagraph(text, { align: 'center', bold: true, size: '64', before: '180', after: '200' });
}

function coverSubjectParagraph(text) {
  return styledParagraph(text, { align: 'center', bold: true, size: '32', before: '260', after: '200' });
}

function coverCodeParagraph(text) {
  return styledParagraph(text, { align: 'center', size: '28', before: '200', after: '120' });
}

function pageBreakParagraph() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function questionGroup(text) {
  return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1F6FEB"/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function questionDescriptionHtml(html) {
  return htmlToDocxParagraphs(html, { size: '24' });
}

function questionTitle(text) {
  return `<w:p><w:pPr><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function questionTextParagraph(text) {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function answerParagraph(text) {
  return `<w:p><w:pPr><w:spacing w:before="20" w:after="40"/><w:shd w:fill="00FFFF"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function choiceParagraph(line) {
  const shading = line.correct ? '<w:shd w:fill="00FFFF"/>' : '';
  const bold = line.correct ? '<w:b/>' : '';
  return `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${shading}</w:pPr><w:r><w:rPr>${bold}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(line.text)}</w:t></w:r></w:p>`;
}

function questionInfoParagraph(text) {
  return styledParagraph(text, { color: '555555', size: '22', before: '20', after: '20' });
}

function runXml(text, options = {}) {
  const { bold = false, color = '', italic = false, size = '', underline = false } = options;
  const runProps = [
    bold ? '<w:b/>' : '',
    color ? `<w:color w:val="${color}"/>` : '',
    italic ? '<w:i/>' : '',
    underline ? '<w:u w:val="single"/>' : '',
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

function paragraphRuns(text, options = {}) {
  const { bold = false, italic = false, underline = false, color = '444444', size = '24' } = options;
  return runXml(text, { bold, italic, underline, color, size });
}

function borderedParagraph(runs, options = {}) {
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

function tableCell(runs, options = {}) {
  const { width = 2500, bold = false, gridSpan = 1 } = options;
  const contentRuns = bold ? runXml(runs, { bold: true, size: '24' }) : runs;
  const span = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : '';

  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="pct"/>${span}</w:tcPr><w:p>${contentRuns}</w:p></w:tc>`;
}

function tableCellRaw(contentXml, options = {}) {
  const { width = 5000, gridSpan = 1 } = options;
  const span = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="pct"/>${span}</w:tcPr>${contentXml}</w:tc>`;
}

function lineBreakXml() {
  return '<w:r><w:br/></w:r>';
}

function questionChoicesXml(choices = []) {
  if (!Array.isArray(choices) || choices.length === 0) {
    return '';
  }

  return choices.map((choice) => {
    const text = formatOptionText(choice);
    const shading = choice.correct ? '<w:shd w:fill="00FFFF"/>' : '';
    const color = choice.correct ? 'FF0000' : '000000';

    return `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${shading}</w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:color w:val="${color}"/>${choice.correct ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  }).join('');
}

function questionAnswerParagraph(answer) {
  if (!answer) {
    return '';
  }

  return `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/><w:shd w:fill="00FFFF"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">Answer: ${escapeXml(answer)}</w:t></w:r></w:p>`;
}

function cleanExplanationLine(line) {
  return String(line ?? '')
    .replace(/^\s*[\{\[]+\s*/g, '')
    .replace(/^Câu\s+\d+\s*[:.]\s*/i, '')
    .replace(/^Question\s+\d+\s*:?\s*/i, '')
    .replace(/^\s*[\}\]]+\s*/g, '')
    .trim();
}

function normalizeExplanationHtml(html, answerTokens = [], answerTextMap = new Map()) {
  const source = String(html ?? '');
  const stripped = source
    .replaceAll(/<p>\s*(\{\[|\{\{)\s*<\/p>/gi, '')
    .replaceAll(/^\s*(\{\[|\{\{)\s*/gi, '')
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
      .map(([key, value]) => [String(key).trim().toUpperCase(), String(value ?? '').trim()])
      .filter(([, value]) => Boolean(value))
  );

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
    const output = decodeHtmlEntities(String(htmlText ?? ''));
    return output.replace(/(Đáp\s*án\s*|Answer\s*)([A-D])\b/gi, (match, prefix, key) => {
      const choiceText = normalizedChoiceMap.get(String(key).trim().toUpperCase());
      if (!choiceText) {
        return match;
      }

      const displayText = choiceText.length > 70
        ? `${choiceText.slice(0, 67).trimEnd()}...`
        : choiceText;

      return `Đáp án "<strong>${escapeHtml(displayText)}</strong>"`;
    });
  };

  const answerBlockPatterns = [
    /<p\b[^>]*>\s*([^<]{1,40})\s*<\/p>/gi,
    /<li\b[^>]*>\s*([^<]{1,80})\s*<\/li>/gi
  ];

  let normalizedHtml = replaceAnswerRefs(stripped);
  for (const pattern of answerBlockPatterns) {
    normalizedHtml = normalizedHtml.replace(pattern, (match) => {
      const text = htmlToText(match).trim();
      const normalized = text.toUpperCase();
      if (/^\d+$/.test(text) || /^[A-D]$/.test(normalized) || isStandaloneAnswerText(text)) {
        return '';
      }
      return match;
    });
  }

  return normalizedHtml;
}

function replaceAnswerRefsInXml(xml, answerTextMap = new Map()) {
  const normalizedChoiceMap = new Map(
    Array.from(answerTextMap instanceof Map ? answerTextMap.entries() : Object.entries(answerTextMap || {}))
      .map(([key, value]) => [String(key).trim().toUpperCase(), String(value ?? '').trim()])
      .filter(([, value]) => Boolean(value))
  );

  let output = String(xml ?? '');
  normalizedChoiceMap.forEach((choiceText, choiceKey) => {
    output = output.replace(new RegExp(`Đáp\\s*án\\s*${choiceKey}\\b`, 'gi'), `Đáp án ${escapeXml(choiceText)}`);
    output = output.replace(new RegExp(`Answer\\s*${choiceKey}\\b`, 'gi'), `Đáp án ${escapeXml(choiceText)}`);
  });

  return output;
}

function questionKeywordsParagraphs(keywords = []) {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return '';
  }

  const body = keywords.map((keyword) => `<w:p><w:pPr><w:spacing w:before="0" w:after="20"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(keyword)}</w:t></w:r></w:p>`).join('');
  const table = `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblLayout w:type="fixed"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="12" w:space="0" w:color="000000"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid>
    <w:tr>${tableCellRaw(styledParagraph('Keywords', { bold: true, size: '24' }), { width: 5000 })}</w:tr>
    <w:tr>${tableCellRaw(body || '<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>', { width: 5000 })}</w:tr>
  </w:tbl>`;

  return table;
}

function questionExplanationBlock(explanationHtml = '', answerTokens = [], answerTextMap = new Map()) {
  const source = String(explanationHtml ?? '');
  if (!source.trim()) {
    return '';
  }

  const body = htmlToDocxParagraphs(source, { size: '24' });
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblLayout w:type="fixed"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="12" w:space="0" w:color="000000"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid>
    <w:tr>${tableCellRaw(styledParagraph('Explanation', { italic: true, size: '24' }), { width: 5000 })}</w:tr>
    <w:tr>${tableCellRaw(body, { width: 5000 })}</w:tr>
  </w:tbl>`;
}

function questionBlockKeywordsAndExplanation(block) {
  return [
    questionKeywordsParagraphs(block.keywords),
    questionExplanationBlock(block.explanationHtml, block.answerTokens, block.answerTextMap)
  ].filter(Boolean).join('');
}

function questionKeywordsBlock(block) {
  return questionKeywordsParagraphs(block.keywords);
}

function pushSharedOptions(lines, sharedOptions, emittedSharedOptionGroups, groupKey) {
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

function explanationBlock(block) {
  return questionBlockKeywordsAndExplanation(block);
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
  const bodyLines = extractVocabPassageLines(part.vocabs);
  const fallbackTitle = part.title || cleanQuizTitle(data?.title);
  const title = fallbackTitle;

  return {
    title,
    bodyLines
  };
}

function extractVocabPassageLines(vocabs) {
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

function extractTextLines(node) {
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

function formatSingleChoiceRadio(question) {
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

function formatSharedOptions(question) {
  return (question.shared_options || []).map((option) => ({
    option: htmlToText(option.option),
    text: htmlToText(option.text),
    correct: false
  }));
}

function labelIndexedOptions(options = []) {
  return options.map((option, index) => ({
    ...option,
    option: /^[A-D]$/i.test(String(option.option ?? '').trim())
      ? String(option.option).trim().toUpperCase()
      : String.fromCharCode(65 + index),
    index
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

function getDirectAnswer(question) {
  const correctAnswer = htmlToText(question.correct_answer);
  if (correctAnswer) {
    return correctAnswer;
  }

  if (Array.isArray(question.correct_answers) && question.correct_answers.length > 0) {
    return question.correct_answers.map(htmlToText).filter(Boolean).join(' | ');
  }

  return '';
}

function isFillInTheBlankQuestion(question) {
  return normalizeTypeKey(question.type) === 'FILL_IN_THE_BLANK'
    || (normalizeTypeKey(question.question_type) === 'FILL_BLANK' && Boolean(question.gap_fill_in_blank));
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

function getQuestionRawTypeKey(question) {
  return normalizeTypeKey(
    question?.question_type
      || question?.type
      || question?.kind
      || question?.question_type_id
      || question?.type_id
      || ''
  );
}

function getQuestionRawTypeText(question) {
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

function pushQuestionGroupLines(lines, question, answers) {
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

    if (order && chunk.trim()) {
      explanations.set(String(order), chunk);
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

    const explanation = normalizeExplanationHtml(question.explain);
    if (markedExplanations.size === 0 && question.order && explanation.trim()) {
      explanations.set(String(question.order), explanation);
    }
  }

  return explanations;
}

function collectQuestionAnswerTokens(question, details = {}) {
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

function collectQuestionChoiceTextMap(details = {}) {
  const map = new Map();
  const choices = Array.isArray(details.choices) ? details.choices : [];

  choices.forEach((choice, index) => {
    if (!choice) {
      return;
    }

    const rawValue = String(choice.text ?? choice.displayText ?? '').trim();
    const value = rawValue.replace(/^[A-D]\s*[.)]\s*/i, '').trim();
    const fallbackKey = String.fromCharCode(65 + index);
    const rawKey = String(choice.option ?? choice.key ?? choice.label ?? '').trim().toUpperCase();
    const key = /^[A-D]$/.test(rawKey) ? rawKey : fallbackKey;

    if (key && value) {
      map.set(key, value);
      if (/^[A-D]$/.test(rawKey) && rawKey !== key) {
        map.set(rawKey, value);
      }
    }
  });

  return map;
}

function addExplanationLines(lines, question, order, explanationsByOrder, details = {}, enabled = true) {
  if (!enabled) {
    return;
  }

  const rawTypeKey = getQuestionRawTypeKey(question);
  const answerTokens = collectQuestionAnswerTokens(question, details);
  const choiceTextMap = collectQuestionChoiceTextMap(details);
  const explanationHtml = normalizeExplanationHtml(
    (order && explanationsByOrder.get(String(order))) || question.explain,
    answerTokens,
    choiceTextMap
  );
  const keywords = extractQuestionKeywords(question);
  const answer = htmlToText(details.answer);

  if (!answer && keywords.length === 0 && !String(explanationHtml ?? '').trim()) {
    return;
  }

  if (answer && rawTypeKey !== 'MULTIPLE_CHOICE_ONE') {
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
      answerTextMap: choiceTextMap
    });
  }
}

function formatAreaOfInformation(question) {
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

function extractQuestionKeywords(question) {
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

function addQuestionInfoLines(lines, question) {
  const areaOfInformation = formatAreaOfInformation(question);
  const keywords = extractQuestionKeywords(question);

  if (areaOfInformation) {
    lines.push({ type: 'questionInfo', text: `AREA OF INFORMATION: ${areaOfInformation}` });
  }

  if (keywords.length > 0) {
    lines.push({ type: 'questionInfo', text: 'Keywords:' });
    keywords.forEach((keyword) => {
      lines.push({ type: 'questionInfo', text: `- ${keyword}` });
    });
  }
}

export function formatYouPassResult(result, quizTypeOverride) {
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
      const explanationsByOrder = buildExplanationMap(partQuestions);

      for (const question of partQuestions) {
        if (isFillInTheBlankQuestion(question)) {
          const answers = extractMarkedAnswers(question.gap_fill_in_blank);

          pushQuestionGroupLines(lines, question, answers);

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
            lines.push({ type: 'questionText', text: answer.questionText });
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
        const choiceOptions = singleChoiceOptions.length > 0 ? singleChoiceOptions : formatChoiceOptions(question);
        const sharedOptions = formatSharedOptions(question);
        const renderedChoiceOptions = isMultipleChoiceOne
          ? (singleChoiceOptions.length > 0 ? singleChoiceOptions : choiceOptions)
          : (sharedOptions.length > 0 ? sharedOptions : choiceOptions);
        const choiceAnswer = getChoiceAnswer(question, choiceOptions);

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
              answer: isMultipleChoiceOne ? '' : choiceAnswer,
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
          if (fallback && !emittedQuestionOrders.has(String(question.order))) {
            pushQuestionGroupLines(lines, question, [{ order: question.order }]);
            lines.push({ type: 'questionTitle', text: `Question ${question.order}` });
            lines.push({ type: 'questionText', text: fallback });
            const directAnswer = getDirectAnswer(question);
            addExplanationLines(lines, question, question.order, explanationsByOrder, {
              answer: directAnswer,
              questionText: fallback
            }, useReadingExplanation);
            emittedQuestionOrders.add(String(question.order));
          }
          continue;
        }

        pushQuestionGroupLines(lines, question, answers);

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
          } else {
            pushSharedOptions(lines, sharedOptions, emittedSharedOptionGroups, question.shared_option_group_key);
          }
          addExplanationLines(lines, question, order, explanationsByOrder, {
            answer: isMultipleChoiceOne ? '' : answer.answer,
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

function appendExportLog(record) {
  const payload = `${JSON.stringify(record, null, 2)}\n\n`;

  try {
    mkdirSync('logs', { recursive: true });
    appendFileSync(EXPORT_LOG_FILE, payload, 'utf8');
    return EXPORT_LOG_FILE;
  } catch (error) {
    try {
      const fallbackFile = '/tmp/e-learning-export-log.log';
      appendFileSync(fallbackFile, payload, 'utf8');
      return fallbackFile;
    } catch {
      console.warn('Khong ghi duoc file log export.', error);
      return '';
    }
  }
}

function serializeRenderValue(value) {
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

function appendDocxRenderLog(record) {
  const payload = `${JSON.stringify(serializeRenderValue(record), null, 2)}\n\n`;

  try {
    mkdirSync('logs', { recursive: true });
    appendFileSync(DOCX_RENDER_LOG_FILE, payload, 'utf8');
    return DOCX_RENDER_LOG_FILE;
  } catch (error) {
    try {
      const fallbackFile = '/tmp/e-learning-render-docx.log';
      appendFileSync(fallbackFile, payload, 'utf8');
      return fallbackFile;
    } catch {
      console.warn('Khong ghi duoc file log render docx.', error);
      return '';
    }
  }
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

export function createDocx({ id, result, quizTypeOverride }) {
  const quizType = quizTypeOverride ?? result?.data?.quiz_type;
  const coverLines = buildCoverPageLines({
    quizType,
    id,
    title: result?.data?.title
  });
  const resultLines = formatYouPassResult(result, quizTypeOverride);
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
      return questionDescriptionHtml(line.html);
    }

    if (line.type === 'questionTitle') {
      return questionTitle(line.text);
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

    if (line.type === 'explanation') {
      return explanationParagraph(line);
    }

    if (line.type === 'questionKeywordsBlock') {
      return questionKeywordsBlock(line);
    }

    if (line.type === 'questionExplanationBlock') {
      return questionExplanationBlock(line.explanationHtml, line.answerTokens, line.answerTextMap);
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

  appendDocxRenderLog({
    exportedAt: new Date().toISOString(),
    id,
    quizType,
    coverLines,
    resultLines
  });

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

    input, select {
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

      <label for="skill">Kỹ năng</label>
      <select id="skill" name="skill" required>
        <option value="listening">Listening</option>
        <option value="reading">Reading</option>
        <option value="writing">Writing</option>
        <option value="speaking">Speaking</option>
      </select>

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
      const skill = String(form.get('skill') || '').trim();
      const token = String(form.get('token') || '').trim();

      if (!id || !skill || !token) {
        send(response, 400, renderForm('Vui long nhap day du ID, ky nang va token.'), contentTypes.html);
        return;
      }

      const result = await fetchELearningResult({ id, token });
      appendExportLog(buildCleanExportRecord({ id, result, quizTypeOverride: skill }));
      const docx = createDocx({ id, result, quizTypeOverride: skill });
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

export function decodeHtmlEntities(value) {
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

export function htmlToText(value) {
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
    )
  )
    .replaceAll(/\r/g, '')
    .replaceAll(/[ \t]+\n/g, '\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .replaceAll(/[ \t]{2,}/g, ' ')
    .trim();
}

export function htmlToTextWithBlankPlaceholders(value) {
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

export function htmlWithBlankPlaceholders(value) {
  return String(value ?? '')
    .replaceAll(/\{\[[\s\S]*?\]\[([^\]]+)\]\}/g, (_match, order) => `[__${htmlToText(order)}__]`);
}

export function splitTextLines(value) {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

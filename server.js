import http from 'node:http';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createExportDocsCore } from './core/export-docs.js';
import { createExportMultiCore } from './core/export-multi.js';
import { renderBulkForm, renderForm } from './core/view.js';
import { htmlToText } from './skill/helper.js';

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
const DOCX_RENDER_LOG_FILE = 'logs/e-learning-render-docx.log';
const ENABLE_FILE_LOGS = String(process.env.E_LEARNING_ENABLE_LOGS || '').trim().toLowerCase() === 'true' && !process.env.VERCEL;

const contentTypes = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html; charset=utf-8',
  text: 'text/plain; charset=utf-8'
};

const exportDocsCore = createExportDocsCore({
  collectBody,
  send,
  contentTypes,
  renderForm,
  apiUrl: API_URL,
  enableFileLogs: ENABLE_FILE_LOGS,
  exportLogFile: 'logs/e-learning-export-log.log',
  renderLogFile: 'logs/e-learning-render-docx.log'
});

const exportMultiCore = createExportMultiCore({
  htmlToText,
  createDocx: exportDocsCore.createDocx,
  buildCleanExportRecord: exportDocsCore.buildCleanExportRecord,
  apiUrl: API_URL,
  enableFileLogs: ENABLE_FILE_LOGS,
  exportLogFile: 'logs/e-learning-export-log.log',
  renderLogFile: 'logs/e-learning-render-docx.log'
});

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

function parseFormBody(request, body) {
  const contentType = String(request.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return new URLSearchParams(body);
  }

  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) {
    return new URLSearchParams(body);
  }

  const boundary = `--${boundaryMatch[1].replaceAll(/^"|"$/g, '')}`;
  const form = new URLSearchParams();

  for (const chunk of String(body || '').split(boundary)) {
    const part = chunk.trim();
    if (!part || part === '--') {
      continue;
    }

    const separatorIndex = part.indexOf('\r\n\r\n');
    if (separatorIndex < 0) {
      continue;
    }

    const headerBlock = part.slice(0, separatorIndex);
    const valueBlock = part.slice(separatorIndex + 4).replace(/\r\n--$/, '').trimEnd();
    const nameMatch = headerBlock.match(/name="([^"]+)"/i);
    if (!nameMatch) {
      continue;
    }

    form.append(nameMatch[1], valueBlock.replace(/\r\n$/, ''));
  }

  return form;
}

function getFormFieldValue(body, form, name) {
  const parsedValue = String(form?.get?.(name) || '').trim();
  if (parsedValue) {
    return parsedValue;
  }

  const raw = String(body || '');
  const encodedMatch = raw.match(new RegExp(`(?:^|[?&])${name}=([^&\r\n]+)`, 'i'));
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1].replaceAll('+', ' ')).trim();
    } catch {
      return String(encodedMatch[1] || '').trim();
    }
  }

  const multipartMatch = raw.match(new RegExp(`name="${name}"[^\\r\\n]*\\r\\n\\r\\n([\\s\\S]*?)(?:\\r\\n--|$)`, 'i'));
  if (multipartMatch) {
    return String(multipartMatch[1] || '').trim();
  }

  return '';
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

    if (request.method === 'GET' && requestUrl.pathname === '/bulk') {
      send(response, 200, renderBulkForm(), contentTypes.html);
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/export') {
      await exportDocsCore.handleExportRequest(request, response);
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/export-bulk') {
      const body = await collectBody(request);
      const form = parseFormBody(request, body);
      const skill = getFormFieldValue(body, form, 'skill');
      const fixedParams = {
        types: getFormFieldValue(body, form, 'types'),
        quiz_types: getFormFieldValue(body, form, 'quiz_types'),
        writing_task_type: getFormFieldValue(body, form, 'writing_task_type'),
        submitted_status: getFormFieldValue(body, form, 'submitted_status')
      };
      const token = getFormFieldValue(body, form, 'token');

      if (!skill || !token) {
        send(response, 400, renderBulkForm('Vui long nhap day du tham so va token.'), contentTypes.html);
        return;
      }

      const zip = await exportMultiCore.buildBulkZip({ fixedParams, skill, token });
      const zipName = `e-learning-bulk-${Date.now()}.zip`;

      send(response, 200, zip, 'application/zip', {
        'Content-Disposition': `attachment; filename="${zipName}"`,
        'Content-Length': zip.length
      });
      return;
    }

    send(response, 404, 'Not found');
  } catch (error) {
    if (requestUrl.pathname === '/bulk' || requestUrl.pathname === '/export-bulk') {
      send(response, 500, renderBulkForm(error.message), contentTypes.html);
      return;
    }

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

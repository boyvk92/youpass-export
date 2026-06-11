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
  apiUrl: API_URL
});

const exportMultiCore = createExportMultiCore({
  htmlToText,
  createDocx: exportDocsCore.createDocx,
  apiUrl: API_URL
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
      const form = new URLSearchParams(body);
      const skill = String(form.get('skill') || '').trim();
      const fixedParams = {
        types: form.get('types'),
        quiz_types: form.get('quiz_types'),
        writing_task_type: form.get('writing_task_type'),
        submitted_status: form.get('submitted_status')
      };
      const token = String(form.get('token') || '').trim();

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

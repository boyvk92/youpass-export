import { escapeHtml } from './helper.js';

export function renderForm(error = '') {
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
      <label for="source">ID hoặc URL</label>
      <input id="source" name="source" autocomplete="off" placeholder="https://e-learning.youpass.vn/practice/reading/1312?type=review&answerId=14869981">

      <label for="id">ID</label>
      <input id="id" name="id" autocomplete="off" placeholder="1312">

      <label for="skill">Kỹ năng</label>
      <select id="skill" name="skill">
        <option value="">-- Tự động từ URL hoặc chọn tay --</option>
        <option value="listening">Listening</option>
        <option value="reading">Reading</option>
        <option value="writing">Writing</option>
        <option value="speaking">Speaking</option>
      </select>

      <label for="token">Token</label>
      <input id="token" name="token" type="text" autocomplete="off" required>

      <button type="submit" data-busy-text="Dang xuat DOCX...">Xuat file DOCX</button>
    </form>
    <p style="margin:16px 0 0;"><a href="/bulk">Xuất nhiều file ZIP</a></p>
  </main>
  <script>
    document.querySelectorAll('form').forEach((form) => {
      form.addEventListener('submit', () => {
        const button = form.querySelector('button[type="submit"]');
        if (!button) return;
        button.disabled = true;
        button.textContent = button.dataset.busyText || 'Dang xu ly...';
      });
    });
  </script>
</body>
</html>`;
}

export function renderBulkForm(error = '') {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>E-learning Bulk Export</title>
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
      width: min(100%, 520px);
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

    input, textarea {
      box-sizing: border-box;
      width: 100%;
      border: 1px solid #b8c1cc;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 16px;
    }

    input {
      height: 42px;
    }

    textarea {
      min-height: 130px;
      resize: vertical;
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

    .hint {
      margin: 0 0 14px;
      color: #5c6773;
      font-size: 14px;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <main>
    <h1>Xuất nhiều file ZIP</h1>
    <p class="hint">Nhập các tham số query. API danh sách được cố định ở https://api.youpass.vn/v1/quizzes.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/export-bulk">
      <label for="skill">Kỹ năng</label>
      <select id="skill" name="skill" required>
        <option value="writing">Writing</option>
        <option value="reading">Reading</option>
        <option value="listening">Listening</option>
        <option value="speaking">Speaking</option>
      </select>

      <label for="types">types</label>
      <input id="types" name="types" value="7" autocomplete="off" required>

      <div data-writing-only>
        <label for="quiz_types">quiz_types</label>
        <input id="quiz_types" name="quiz_types" value="3" autocomplete="off">

        <label for="writing_task_type">writing_task_type</label>
        <input id="writing_task_type" name="writing_task_type" value="1" autocomplete="off">

        <label for="submitted_status">submitted_status</label>
        <input id="submitted_status" name="submitted_status" value="2" autocomplete="off">
      </div>

      <label for="token">Token</label>
      <input id="token" name="token" type="text" autocomplete="off" required>

      <button type="submit" data-busy-text="Dang xuat ZIP...">Xuat ZIP</button>
    </form>
    <p style="margin:16px 0 0;"><a href="/">Quay lại xuất 1 file</a></p>
  </main>
  <script>
    const skillSelect = document.getElementById('skill');
    const writingOnly = document.querySelector('[data-writing-only]');
    const toggleWritingFields = () => {
      if (!skillSelect || !writingOnly) return;
      writingOnly.style.display = skillSelect.value === 'writing' ? '' : 'none';
    };
    if (skillSelect) {
      skillSelect.addEventListener('change', toggleWritingFields);
      toggleWritingFields();
    }
    document.querySelectorAll('form').forEach((form) => {
      form.addEventListener('submit', () => {
        const button = form.querySelector('button[type="submit"]');
        if (!button) return;
        button.disabled = true;
        button.textContent = button.dataset.busyText || 'Dang xu ly...';
      });
    });
  </script>
</body>
</html>`;
}

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
    <p style="margin:8px 0 0;"><a href="/test">Chế độ test</a></p>
  </main>
  <script>
    const skillSelect = document.getElementById('skill');
    const submitButton = document.querySelector('button[type="submit"]');
    const updateSubmitLabel = () => {
      if (!skillSelect || !submitButton) return;
      const useZip = skillSelect.value === 'listening' || skillSelect.value === 'speaking';
      submitButton.textContent = useZip ? 'Xuat file ZIP' : 'Xuat file DOCX';
      submitButton.dataset.busyText = useZip ? 'Dang xuat ZIP...' : 'Dang xuat DOCX...';
    };
    if (skillSelect) {
      skillSelect.addEventListener('change', updateSubmitLabel);
      updateSubmitLabel();
    }

    const filenameFromDisposition = (headerValue, fallback) => {
      const value = String(headerValue || '');
      const utf8Match = value.match(/filename\\*=UTF-8''([^;]+)/i);
      if (utf8Match) {
        try {
          return decodeURIComponent(utf8Match[1]);
        } catch {
          return fallback;
        }
      }

      const quotedMatch = value.match(/filename="([^"]+)"/i);
      if (quotedMatch) {
        return quotedMatch[1];
      }

      const plainMatch = value.match(/filename=([^;]+)/i);
      return plainMatch ? plainMatch[1].trim() : fallback;
    };

    const downloadBlob = (blob, filename) => {
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    };

    const submitAsDownload = async (form, button) => {
      const originalText = button?.textContent || 'Dang xu ly...';
      const formData = new FormData(form);
      const hasFileInput = Array.from(form.querySelectorAll('input[type="file"]')).some((input) => input.files && input.files.length > 0);
      const body = hasFileInput ? formData : new URLSearchParams();
      if (!hasFileInput) {
        for (const [key, value] of formData.entries()) {
          body.append(key, String(value ?? ''));
        }
      }
      button.disabled = true;
      button.textContent = button.dataset.busyText || originalText;

      try {
        const requestInit = hasFileInput
          ? {
            method: form.method || 'POST',
            body
          }
          : {
            method: form.method || 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body
          };

        const response = await fetch(form.action, requestInit);

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
          if (contentType.includes('text/html')) {
            document.open();
            document.write(await response.text());
            document.close();
            return;
          }
          throw new Error(await response.text());
        }

        if (contentType.includes('application/zip') || contentType.includes('wordprocessingml.document')) {
          const blob = await response.blob();
          const fallbackName = contentType.includes('application/zip') ? 'export.zip' : 'export.docx';
          downloadBlob(blob, filenameFromDisposition(response.headers.get('content-disposition'), fallbackName));
          return;
        }

        const text = await response.text();
        document.open();
        document.write(text);
        document.close();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Co loi xay ra khi xuat file.');
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    };

    document.querySelectorAll('form').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        if (!button) return;
        submitAsDownload(form, button);
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
    <p class="hint">Reading dùng danh sách https://api.youpass.vn/v1/mock-test, sau đó lấy chi tiết bằng https://api.youpass.vn/v1/mock-test/{id}.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/export-bulk">
      <label for="skill">Kỹ năng</label>
      <select id="skill" name="skill" required>
        <option value="writing">Writing</option>
        <option value="reading">Reading</option>
        <option value="listening">Listening</option>
        <option value="speaking">Speaking</option>
      </select>

      <input type="hidden" id="page_size" name="page_size" value="4">
      <input type="hidden" id="page" name="page" value="1">
      <input type="hidden" id="skill_id" name="skill_id" value="1">
      <input type="hidden" id="sort" name="sort" value="priority.desc">

      <div data-writing-only>
        <label for="types">types</label>
        <input id="types" name="types" value="7" autocomplete="off" required>

        <label for="quiz_types">quiz_types</label>
        <input id="quiz_types" name="quiz_types" value="3" autocomplete="off">

        <label for="writing_task_type">writing_task_type</label>
        <input id="writing_task_type" name="writing_task_type" value="1" autocomplete="off">

        <label for="submitted_status">submitted_status</label>
        <input id="submitted_status" name="submitted_status" value="2" autocomplete="off">
      </div>

      <label for="token">Token</label>
      <input id="token" name="token" type="text" autocomplete="off" required>

      <label style="display:flex;align-items:center;gap:8px;margin-top:16px;font-weight:700;">
        <input type="checkbox" name="create_folders" value="1" style="width:auto;height:auto;margin:0;">
        Tạo folder theo title
      </label>
      <p class="hint" style="margin-top:6px;">Speaking sẽ tạo folder theo title và chia DOCX theo từng pass.</p>

      <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-weight:700;">
        <input type="checkbox" name="no_audio" value="1" style="width:auto;height:auto;margin:0;">
        Không xuất file audio
      </label>
      <p class="hint" style="margin-top:6px;">Áp dụng cho Listening và Speaking.</p>

      <button type="submit" data-busy-text="Dang xuat ZIP...">Xuat ZIP</button>
    </form>
    <p style="margin:16px 0 0;"><a href="/">Quay lại xuất 1 file</a></p>
    <p style="margin:8px 0 0;"><a href="/test">Chế độ test</a></p>
  </main>
  <script>
  const skillSelect = document.getElementById('skill');
  const skillIdInput = document.getElementById('skill_id');
  const writingOnly = document.querySelector('[data-writing-only]');
  const skillIdMap = {
    reading: '1',
    listening: '2',
    speaking: '8',
    writing: ''
  };
  const syncBulkDefaults = () => {
      if (skillSelect && skillIdInput) {
        skillIdInput.value = skillIdMap[skillSelect.value] || '';
      }
  };
  const toggleWritingFields = () => {
      if (!skillSelect || !writingOnly) return;
      writingOnly.style.display = skillSelect.value === 'writing' ? '' : 'none';
      syncBulkDefaults();
  };
    if (skillSelect) {
      skillSelect.addEventListener('change', toggleWritingFields);
      toggleWritingFields();
    }
    const filenameFromDisposition = (headerValue, fallback) => {
      const value = String(headerValue || '');
      const utf8Match = value.match(/filename\\*=UTF-8''([^;]+)/i);
      if (utf8Match) {
        try {
          return decodeURIComponent(utf8Match[1]);
        } catch {
          return fallback;
        }
      }

      const quotedMatch = value.match(/filename="([^"]+)"/i);
      if (quotedMatch) {
        return quotedMatch[1];
      }

      const plainMatch = value.match(/filename=([^;]+)/i);
      return plainMatch ? plainMatch[1].trim() : fallback;
    };

    const downloadBlob = (blob, filename) => {
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    };

    const submitAsDownload = async (form, button) => {
      const originalText = button?.textContent || 'Dang xu ly...';
      const formData = new FormData(form);
      const hasFileInput = Array.from(form.querySelectorAll('input[type="file"]')).some((input) => input.files && input.files.length > 0);
      const body = hasFileInput ? formData : new URLSearchParams();
      if (!hasFileInput) {
        for (const [key, value] of formData.entries()) {
          body.append(key, String(value ?? ''));
        }
      }
      button.disabled = true;
      button.textContent = button.dataset.busyText || originalText;

      try {
        const requestInit = hasFileInput
          ? {
            method: form.method || 'POST',
            body
          }
          : {
            method: form.method || 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body
          };

        const response = await fetch(form.action, requestInit);

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
          if (contentType.includes('text/html')) {
            document.open();
            document.write(await response.text());
            document.close();
            return;
          }
          throw new Error(await response.text());
        }

        if (contentType.includes('application/zip') || contentType.includes('wordprocessingml.document')) {
          const blob = await response.blob();
          const fallbackName = contentType.includes('application/zip') ? 'export.zip' : 'export.docx';
          downloadBlob(blob, filenameFromDisposition(response.headers.get('content-disposition'), fallbackName));
          return;
        }

        const text = await response.text();
        document.open();
        document.write(text);
        document.close();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Co loi xay ra khi xuat file.');
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    };

    document.querySelectorAll('form').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        if (!button) return;
        submitAsDownload(form, button);
      });
    });
  </script>
</body>
</html>`;
}

export function renderTestForm(error = '') {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>E-learning Test Mode</title>
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

    input, select, textarea {
      box-sizing: border-box;
      width: 100%;
      border: 1px solid #b8c1cc;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 16px;
    }

    input, select {
      height: 42px;
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
    <h1>Chế độ test</h1>
    <p class="hint">Đọc dữ liệu trực tiếp từ <code>core/testDe.json</code> cho skill Reading.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/export-test">
      <label for="skill">Kỹ năng</label>
      <select id="skill" name="skill" required>
        <option value="reading">Reading</option>
      </select>

      <label for="token">Token</label>
      <input id="token" name="token" type="text" autocomplete="off" required>

      <button type="submit" data-busy-text="Dang xuat DOCX...">Xuat DOCX</button>
    </form>
    <p style="margin:16px 0 0;"><a href="/">Quay lại xuất 1 file</a></p>
    <p style="margin:8px 0 0;"><a href="/bulk">Xuất nhiều file ZIP</a></p>
  </main>
  <script>
    const filenameFromDisposition = (headerValue, fallback) => {
      const value = String(headerValue || '');
      const utf8Match = value.match(/filename\\*=UTF-8''([^;]+)/i);
      if (utf8Match) {
        try {
          return decodeURIComponent(utf8Match[1]);
        } catch {
          return fallback;
        }
      }

      const quotedMatch = value.match(/filename="([^"]+)"/i);
      if (quotedMatch) {
        return quotedMatch[1];
      }

      const plainMatch = value.match(/filename=([^;]+)/i);
      return plainMatch ? plainMatch[1].trim() : fallback;
    };

    const downloadBlob = (blob, filename) => {
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    };

    const submitAsDownload = async (form, button) => {
      const originalText = button?.textContent || 'Dang xu ly...';
      const formData = new FormData(form);
      const hasFileInput = Array.from(form.querySelectorAll('input[type="file"]')).some((input) => input.files && input.files.length > 0);
      const body = hasFileInput ? formData : new URLSearchParams();
      if (!hasFileInput) {
        for (const [key, value] of formData.entries()) {
          body.append(key, String(value ?? ''));
        }
      }
      button.disabled = true;
      button.textContent = button.dataset.busyText || originalText;

      try {
        const requestInit = hasFileInput
          ? {
            method: form.method || 'POST',
            body
          }
          : {
            method: form.method || 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body
          };

        const response = await fetch(form.action, requestInit);
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
          if (contentType.includes('text/html')) {
            document.open();
            document.write(await response.text());
            document.close();
            return;
          }
          throw new Error(await response.text());
        }

        if (contentType.includes('wordprocessingml.document') || contentType.includes('application/zip')) {
          const blob = await response.blob();
          const fallbackName = contentType.includes('application/zip') ? 'export.zip' : 'export.docx';
          downloadBlob(blob, filenameFromDisposition(response.headers.get('content-disposition'), fallbackName));
          return;
        }

        const text = await response.text();
        document.open();
        document.write(text);
        document.close();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Co loi xay ra khi xuat file.');
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    };

    document.querySelectorAll('form').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        if (!button) return;
        submitAsDownload(form, button);
      });
    });
  </script>
</body>
</html>`;
}

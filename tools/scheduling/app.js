/* ─── 日翊客服小工具 · 客服排班工具 · app.js ─────────────── */
'use strict';

let uploadedCSV = null;
let outputData  = null; // { headers, rows, warnings, stats }

// ── DOM refs ─────────────────────────────────────────────
const apiKeyInput  = document.getElementById('apiKey');
const runBtn       = document.getElementById('runBtn');
const errorEl      = document.getElementById('errorMsg');
const loadingEl    = document.getElementById('loadingDiv');
const progressFill = document.getElementById('progressFill');
const loadingText  = document.getElementById('loadingText');
const resultBlock  = document.getElementById('resultBlock');

// Restore API key
if (localStorage.getItem('rz_apikey')) apiKeyInput.value = localStorage.getItem('rz_apikey');
apiKeyInput.addEventListener('change', () => localStorage.setItem('rz_apikey', apiKeyInput.value.trim()));

// ── Enable run button when inputs ready ──────────────────
function checkReady() {
  const hasKey  = apiKeyInput.value.trim().length > 10;
  const hasText = (document.getElementById('scheduleText')?.value?.trim().length > 10) || !!uploadedCSV;
  runBtn.disabled = !(hasKey && hasText);
  runBtn.textContent = (hasKey && hasText) ? '開始自動排班 ↗' : '請輸入 API Key 與勤務表後開始排班';
}
apiKeyInput.addEventListener('input', checkReady);
document.getElementById('scheduleText').addEventListener('input', checkReady);

// ── Input toggle ─────────────────────────────────────────
window.switchInput = function(mode) {
  document.getElementById('panelText').style.display = mode === 'text' ? '' : 'none';
  document.getElementById('panelFile').style.display = mode === 'file' ? '' : 'none';
  document.getElementById('togText').classList.toggle('active', mode === 'text');
  document.getElementById('togFile').classList.toggle('active', mode === 'file');
  checkReady();
};

// ── File upload ───────────────────────────────────────────
const dropzone  = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv','xlsx','xls'].includes(ext)) { showError('請上傳 CSV 或 Excel 格式檔案'); return; }
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatSize(file.size);
  document.getElementById('fileInfo').style.display = 'flex';
  const reader = new FileReader();
  reader.onload = e => {
    if (ext === 'csv') {
      uploadedCSV = e.target.result;
    } else {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      uploadedCSV = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
    }
    checkReady();
  };
  if (ext === 'csv') reader.readAsText(file, 'UTF-8');
  else reader.readAsBinaryString(file);
}

window.removeFile = function() {
  uploadedCSV = null;
  document.getElementById('fileInfo').style.display = 'none';
  document.getElementById('fileInput').value = '';
  checkReady();
};

function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return Math.round(b/1024) + ' KB';
  return (b/1024/1024).toFixed(1) + ' MB';
}

// ── Run ──────────────────────────────────────────────────
runBtn.addEventListener('click', runScheduling);

async function runScheduling() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) { showError('請輸入 Anthropic API Key'); return; }

  const rawInput = uploadedCSV || document.getElementById('scheduleText').value.trim();
  if (!rawInput) { showError('請提供預定勤務表內容'); return; }

  const optCheck   = document.getElementById('optCheck').checked;
  const optSummary = document.getElementById('optSummary').checked;

  hideError();
  runBtn.disabled = true;
  runBtn.textContent = '排班中...';
  loadingEl.style.display = 'block';
  resultBlock.style.display = 'none';
  setProgress('正在讀取勤務表結構...', 5);

  // ── Build system prompt ───────────────────────────────
  const systemPrompt = `你是「日翊物流」的專業人事排班專員。請嚴格依照以下排班規則處理使用者提供的預定勤務表，填寫所有空缺班位，並以 JSON 格式輸出結果。

## 班位清單（共 11 個名額）
07:00-16:00, 07:30-16:30, 08:00-17:00(x3), 09:00-18:00(x2), 10:00-19:00, 11:00-20:00, 13:00-22:00, 14:00-23:00

## 每日人力需求
- 週一（9人）：移除 08:00×1、10:00
- 週二至週五（8人）：移除 08:00×1、09:00×1、10:00
- 週末六日（4人）：僅保留 4 個班位
- 課會日（11人）：使用完整班位清單
- 週末若張語軒上班：優先安排 08:00，並手動移除一個保留位維持總數 4 人

## 人員特殊規則
- 張語軒：班別固定 08:00~17:00，逢六日及國定假日一律排休
- 全體：確保「一週一例一休」，絕對不可連上 7 天，禁止「上一休一」碎班

## 處理順序
1. 保留原有「休、特、國」及預排班別不動
2. 由名單最上方向下，將當日可用班位依序分配給未休假人員
3. 完成後全局檢查法規

## 輸出格式（JSON，不要其他文字）
{
  "headers": ["姓名", "日期1", "日期2", ...],
  "rows": [
    {"name": "張語軒", "shifts": ["08:00", "休", "08:00", ...]},
    ...
  ],
  "warnings": ["警告訊息1", "警告訊息2"],
  "stats": {
    "totalDays": 數字,
    "staffCount": 數字,
    "totalShiftsAssigned": 數字,
    "offDays": 數字
  }
}

假別（休/特/國）必須原樣保留，空缺填入具體班別時間（如 08:00 或 08:00-17:00）。`;

  const userPrompt = `以下是預定勤務表，請填寫所有空缺班位：

${rawInput}

請嚴格依排班規則填寫，只輸出 JSON，不要任何說明文字。`;

  try {
    setProgress('連線至 AI 排班引擎...', 15);
    await delay(200);

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    setProgress('AI 正在分析排班規則...', 40);

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    setProgress('解析排班結果...', 75);
    await delay(300);

    const raw  = (data.content || []).map(b => b.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    setProgress('產出排班表...', 90);
    await delay(200);

    outputData = parsed;
    document.getElementById('rawOutput').textContent = JSON.stringify(parsed, null, 2);
    renderResult(parsed, optCheck, optSummary);
    setProgress('完成！', 100);
    await delay(300);

    loadingEl.style.display = 'none';
    resultBlock.style.display = 'block';
    resultBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    runBtn.disabled = false;
    runBtn.textContent = '重新排班';

  } catch (err) {
    loadingEl.style.display = 'none';
    runBtn.disabled = false;
    runBtn.textContent = '重新排班';
    showError('排班失敗：' + err.message);
  }
}

// ── Render result ─────────────────────────────────────────
function renderResult(d, showWarnings, showStats) {
  // Stats
  if (showStats && d.stats) {
    const s = d.stats;
    document.getElementById('resultStats').innerHTML = `
      <div class="stat-pill">排班天數 <strong>${s.totalDays || '—'}</strong></div>
      <div class="stat-pill">人員數 <strong>${s.staffCount || (d.rows?.length || '—')}</strong></div>
      <div class="stat-pill">已填班位 <strong>${s.totalShiftsAssigned || '—'}</strong></div>
      <div class="stat-pill">休假人次 <strong>${s.offDays || '—'}</strong></div>
    `;
  }

  // Warnings
  const warnBlock = document.getElementById('warningBlock');
  if (showWarnings && d.warnings?.length) {
    warnBlock.innerHTML = d.warnings.map(w =>
      `<div class="warn-box"><strong>⚠ 注意：</strong>${w}</div>`
    ).join('');
  } else {
    warnBlock.innerHTML = showWarnings
      ? `<div class="warn-box" style="border-color:var(--success);background:var(--success-bg)"><strong style="color:var(--success)">✓ 法規檢查通過</strong>：無連班或碎班異常</div>`
      : '';
  }

  // Table
  if (!d.headers || !d.rows) return;
  const OFF_LABELS = ['休','特','國','例休','例假','補休'];
  const isOff = v => OFF_LABELS.some(o => v && v.includes(o));

  let html = '<table><thead><tr>';
  d.headers.forEach(h => { html += `<th>${h}</th>`; });
  html += '</tr></thead><tbody>';

  d.rows.forEach(row => {
    html += `<tr><td>${row.name || ''}</td>`;
    (row.shifts || []).forEach(cell => {
      const v = cell || '';
      if (isOff(v)) {
        html += `<td class="cell-off">${v}</td>`;
      } else if (!v || v === '') {
        html += `<td class="cell-empty">—</td>`;
      } else {
        html += `<td class="cell-shift">${v}</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  document.getElementById('scheduleTableWrap').innerHTML = html;
}

// ── Export Excel ──────────────────────────────────────────
document.getElementById('exportBtn').addEventListener('click', exportExcel);

function exportExcel() {
  if (!outputData?.headers || !outputData?.rows) return;
  const { headers, rows } = outputData;
  const OFF_LABELS = ['休','特','國','例休','例假','補休'];
  const isOff = v => OFF_LABELS.some(o => v && v.includes(o));

  const wb   = XLSX.utils.book_new();
  const data = [headers, ...rows.map(r => [r.name, ...(r.shifts || [])])];
  const ws   = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 12 : 11 }));

  // Style header row
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[addr]) {
      ws[addr].s = {
        font:      { bold: true, color: { rgb: 'FFFFFF' } },
        fill:      { fgColor: { rgb: '2D3748' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      };
    }
  }

  // Style data cells
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      const val = String(ws[addr].v || '');
      ws[addr].s = {
        alignment: { horizontal: C === 0 ? 'left' : 'center', vertical: 'center' },
        font: isOff(val)
          ? { bold: true, color: { rgb: 'C53030' } }
          : { color: { rgb: '1A202C' } },
        fill: isOff(val)
          ? { fgColor: { rgb: 'FFF5F5' } }
          : { fgColor: { rgb: R % 2 === 0 ? 'F7FAFC' : 'FFFFFF' } }
      };
    }
  }

  // Name column style
  for (let R = 1; R <= range.e.r; R++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: 0 });
    if (ws[addr]) ws[addr].s = { ...ws[addr].s, font: { bold: true, color: { rgb: '2D3748' } } };
  }

  XLSX.utils.book_append_sheet(wb, ws, '排班表');

  // Stats sheet
  if (outputData.stats) {
    const s = outputData.stats;
    const statsWs = XLSX.utils.aoa_to_sheet([
      ['項目', '數值'],
      ['排班天數', s.totalDays || ''],
      ['人員數', s.staffCount || rows.length],
      ['已填班位數', s.totalShiftsAssigned || ''],
      ['休假人次', s.offDays || ''],
    ]);
    statsWs['!cols'] = [{ wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, statsWs, '統計摘要');
  }

  const now = new Date();
  const ts  = `${now.getFullYear()}${pad2(now.getMonth()+1)}${pad2(now.getDate())}`;
  XLSX.writeFile(wb, `排班表_${ts}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────
function pad2(n)    { return String(n).padStart(2,'0'); }
function delay(ms)  { return new Promise(r => setTimeout(r, ms)); }
function showError(msg) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
function hideError()    { errorEl.style.display = 'none'; }
function setProgress(msg, pct) {
  loadingText.textContent = msg;
  progressFill.style.width = pct + '%';
}

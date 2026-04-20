/* ─── 日翊客服小工具 · 客服排班工具 · app.js（純前端版）── */
'use strict';

let uploadedCSV = null;
let outputData  = null;

// ── 班位清單定義 ─────────────────────────────────────────
const ALL_SHIFTS = [
  '07:00-16:00','07:30-16:30',
  '08:00-17:00','08:00-17:00','08:00-17:00',
  '09:00-18:00','09:00-18:00',
  '10:00-19:00','11:00-20:00',
  '13:00-22:00','14:00-23:00'
];

// 各日別可用班位
function getAvailableShifts(dayType) {
  let shifts = [...ALL_SHIFTS];
  if (dayType === 'mon') {
    // 週一：移除 1個08:00、10:00
    const i08 = shifts.indexOf('08:00-17:00'); if (i08 > -1) shifts.splice(i08, 1);
    shifts = shifts.filter(s => s !== '10:00-19:00');
  } else if (dayType === 'tue-fri') {
    // 週二至五：移除 1個08:00、1個09:00、10:00
    const i08 = shifts.indexOf('08:00-17:00'); if (i08 > -1) shifts.splice(i08, 1);
    const i09 = shifts.indexOf('09:00-18:00'); if (i09 > -1) shifts.splice(i09, 1);
    shifts = shifts.filter(s => s !== '10:00-19:00');
  } else if (dayType === 'weekend') {
    // 週末：僅保留 4 個班位
    shifts = ['08:00-17:00','09:00-18:00','13:00-22:00','14:00-23:00'];
  }
  // 課會日：回傳全部 ALL_SHIFTS
  return shifts;
}

// ── DOM refs ─────────────────────────────────────────────
const runBtn       = document.getElementById('runBtn');
const errorEl      = document.getElementById('errorMsg');
const loadingEl    = document.getElementById('loadingDiv');
const progressFill = document.getElementById('progressFill');
const loadingText  = document.getElementById('loadingText');
const resultBlock  = document.getElementById('resultBlock');

// ── 輸入就緒檢查 ─────────────────────────────────────────
function checkReady() {
  const hasText = (document.getElementById('scheduleText')?.value?.trim().length > 5) || !!uploadedCSV;
  runBtn.disabled = !hasText;
  runBtn.textContent = hasText ? '開始自動排班' : '請輸入或上傳預定勤務表後開始';
}
document.getElementById('scheduleText').addEventListener('input', checkReady);

// ── 輸入切換 ─────────────────────────────────────────────
window.switchInput = function(mode) {
  document.getElementById('panelText').style.display = mode === 'text' ? '' : 'none';
  document.getElementById('panelFile').style.display = mode === 'file' ? '' : 'none';
  document.getElementById('togText').classList.toggle('active', mode === 'text');
  document.getElementById('togFile').classList.toggle('active', mode === 'file');
  checkReady();
};

// ── 檔案上傳 ─────────────────────────────────────────────
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

// ── CSV 解析 ─────────────────────────────────────────────
function parseCsv(csv) {
  const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(line => splitLine(line));
  return { headers, rows };
}

function splitLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}

// ── 判斷日別類型 ─────────────────────────────────────────
function getDayType(header) {
  // header 格式如：4/28(一)、5/1(三)、課會日 等
  if (header.includes('課會')) return 'meeting';
  if (header.includes('六') || header.includes('日')) return 'weekend';
  if (header.includes('一')) return 'mon';
  if (header.match(/[二三四五]/)) return 'tue-fri';
  return 'tue-fri'; // 預設
}

// ── 假別判斷 ─────────────────────────────────────────────
const OFF_LABELS = ['休','特','國','例休','例假','補休'];
function isOff(v) { return OFF_LABELS.some(o => v && v.toString().includes(o)); }
function isEmpty(v) { return !v || v.toString().trim() === ''; }

// ── 主排班邏輯 ────────────────────────────────────────────
function runScheduleLogic(parsed) {
  const { headers, rows } = parsed;
  // headers[0] = 姓名，headers[1..] = 日期欄
  const dateHeaders = headers.slice(1);
  const warnings = [];
  const result = []; // [{name, shifts:[]}]

  // 建立人員清單
  rows.forEach(row => {
    result.push({ name: row[0] || '', shifts: row.slice(1).map(v => v || '') });
  });

  // 對每個日期欄位做排班
  dateHeaders.forEach((dateHeader, colIdx) => {
    const dayType = getDayType(dateHeader);
    let available = getAvailableShifts(dayType); // 可用班位池（有序）

    // 張語軒特殊處理：週末/國定假日強制休
    const isWeekend = dayType === 'weekend';

    // 先計算已有班別（非空、非假別）的人，從班位池中移除對應班位
    result.forEach(person => {
      const cell = person.shifts[colIdx];
      if (!isEmpty(cell) && !isOff(cell)) {
        // 找到並移除班位池中對應的班位
        const idx = available.findIndex(s => s.startsWith(cell.substring(0,5)));
        if (idx > -1) available.splice(idx, 1);
      }
    });

    // 張語軒規則：週末強制排休
    result.forEach(person => {
      if (person.name.includes('張語軒')) {
        if (isWeekend || dayType === 'weekend') {
          if (isEmpty(person.shifts[colIdx])) {
            person.shifts[colIdx] = '休';
          }
        }
        // 若上班固定08:00
        if (!isOff(person.shifts[colIdx]) && !isEmpty(person.shifts[colIdx])) {
          // 保持原班別
        } else if (!isOff(person.shifts[colIdx]) && isEmpty(person.shifts[colIdx]) && !isWeekend) {
          person.shifts[colIdx] = '08:00-17:00';
          // 從班位池移除一個08:00
          const i = available.findIndex(s => s.startsWith('08:00'));
          if (i > -1) available.splice(i, 1);
        }
      }
    });

    // 週末若張語軒上班，移除一個保留位
    if (isWeekend) {
      const yx = result.find(p => p.name.includes('張語軒'));
      if (yx && !isOff(yx.shifts[colIdx])) {
        // 已處理，保持4人
      }
    }

    // 填寫其他空缺（從名單上方依序分配）
    let shiftPool = [...available];
    result.forEach(person => {
      if (person.name.includes('張語軒')) return; // 張語軒已處理
      const cell = person.shifts[colIdx];
      if (isEmpty(cell)) {
        if (shiftPool.length > 0) {
          person.shifts[colIdx] = shiftPool.shift();
        } else {
          person.shifts[colIdx] = '休'; // 無班可排則排休
        }
      }
    });
  });

  // ── 法規檢查 ─────────────────────────────────────────
  if (document.getElementById('optCheck').checked) {
    result.forEach(person => {
      const shifts = person.shifts;
      // 檢查連上 7 天
      let consecutive = 0;
      for (let i = 0; i < shifts.length; i++) {
        if (!isOff(shifts[i]) && !isEmpty(shifts[i])) {
          consecutive++;
          if (consecutive >= 7) {
            warnings.push(`【${person.name}】在第 ${i-5} ~ ${i+1} 天出現連續 7 天以上上班，請手動調整`);
            consecutive = 0;
          }
        } else {
          consecutive = 0;
        }
      }
      // 檢查上一休一
      let zigzag = 0;
      for (let i = 1; i < shifts.length - 1; i++) {
        const prev = shifts[i-1], curr = shifts[i], next = shifts[i+1];
        const prevWork = !isOff(prev) && !isEmpty(prev);
        const currOff  = isOff(curr);
        const nextWork = !isOff(next) && !isEmpty(next);
        if (prevWork && currOff && nextWork) zigzag++;
      }
      if (zigzag >= 2) {
        warnings.push(`【${person.name}】出現 ${zigzag} 次「上一休一」碎班情形，建議調整連休區段`);
      }
    });
  }

  // ── 統計 ─────────────────────────────────────────────
  let totalAssigned = 0, totalOff = 0;
  result.forEach(p => {
    p.shifts.forEach(s => {
      if (!isEmpty(s) && !isOff(s)) totalAssigned++;
      if (isOff(s)) totalOff++;
    });
  });

  return {
    headers,
    rows: result,
    warnings,
    stats: {
      totalDays:           dateHeaders.length,
      staffCount:          result.length,
      totalShiftsAssigned: totalAssigned,
      offDays:             totalOff
    }
  };
}

// ── 執行排班 ─────────────────────────────────────────────
runBtn.addEventListener('click', runScheduling);

function runScheduling() {
  const rawInput = uploadedCSV || document.getElementById('scheduleText').value.trim();
  if (!rawInput) { showError('請提供預定勤務表內容'); return; }

  hideError();
  runBtn.disabled = true;
  runBtn.textContent = '排班中...';
  loadingEl.style.display = 'block';
  resultBlock.style.display = 'none';
  setProgress('解析勤務表結構...', 20);

  setTimeout(() => {
    try {
      setProgress('套用排班規則...', 50);
      const parsed = parseCsv(rawInput);
      if (!parsed.headers.length || !parsed.rows.length) {
        throw new Error('無法解析資料，請確認格式為 CSV（逗號分隔）或貼入正確的表格內容');
      }

      setProgress('法規檢查...', 80);
      const result = runScheduleLogic(parsed);
      outputData = result;

      setProgress('產出排班表...', 95);
      document.getElementById('rawOutput').textContent =
        result.rows.map(r => [r.name, ...r.shifts].join(',')).join('\n');
      renderResult(result);

      setProgress('完成！', 100);
      setTimeout(() => {
        loadingEl.style.display = 'none';
        resultBlock.style.display = 'block';
        resultBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
        runBtn.disabled = false;
        runBtn.textContent = '重新排班';
      }, 300);

    } catch (err) {
      loadingEl.style.display = 'none';
      runBtn.disabled = false;
      runBtn.textContent = '重新排班';
      showError('排班失敗：' + err.message);
    }
  }, 100);
}

// ── 渲染結果 ─────────────────────────────────────────────
function renderResult(d) {
  // 統計
  if (document.getElementById('optSummary').checked && d.stats) {
    const s = d.stats;
    document.getElementById('resultStats').innerHTML = `
      <div class="stat-pill">排班天數 <strong>${s.totalDays}</strong></div>
      <div class="stat-pill">人員數 <strong>${s.staffCount}</strong></div>
      <div class="stat-pill">已填班位 <strong>${s.totalShiftsAssigned}</strong></div>
      <div class="stat-pill">休假人次 <strong>${s.offDays}</strong></div>
    `;
  }

  // 警告
  const warnBlock = document.getElementById('warningBlock');
  if (document.getElementById('optCheck').checked) {
    if (d.warnings?.length) {
      warnBlock.innerHTML = d.warnings.map(w =>
        `<div class="warn-box"><strong>⚠ 注意：</strong>${w}</div>`
      ).join('');
    } else {
      warnBlock.innerHTML = `<div class="warn-box" style="border-color:var(--success);background:var(--success-bg)"><strong style="color:var(--success)">✓ 法規檢查通過</strong>：無連班或碎班異常</div>`;
    }
  }

  // 表格
  if (!d.headers || !d.rows) return;
  let html = '<table><thead><tr>';
  d.headers.forEach(h => { html += `<th>${h}</th>`; });
  html += '</tr></thead><tbody>';
  d.rows.forEach(row => {
    html += `<tr><td>${row.name}</td>`;
    (row.shifts || []).forEach(cell => {
      const v = cell || '';
      if (isOff(v)) html += `<td class="cell-off">${v}</td>`;
      else if (!v)  html += `<td class="cell-empty">—</td>`;
      else          html += `<td class="cell-shift">${v}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('scheduleTableWrap').innerHTML = html;
}

// ── 匯出 Excel ────────────────────────────────────────────
document.getElementById('exportBtn').addEventListener('click', exportExcel);

function exportExcel() {
  if (!outputData?.headers || !outputData?.rows) return;
  const { headers, rows } = outputData;
  const wb = XLSX.utils.book_new();
  const aoa = [headers, ...rows.map(r => [r.name, ...(r.shifts || [])])];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map((_, i) => ({ wch: i === 0 ? 12 : 13 }));

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  // Header row 樣式
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[addr]) ws[addr].s = {
      font:      { bold: true, color: { rgb: 'FFFFFF' } },
      fill:      { fgColor: { rgb: '2D3748' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
  }

  // 資料儲存格樣式
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      const val = String(ws[addr].v || '');
      ws[addr].s = {
        alignment: { horizontal: C === 0 ? 'left' : 'center', vertical: 'center' },
        font: isOff(val) ? { bold: true, color: { rgb: 'C53030' } } : { color: { rgb: '1A202C' } },
        fill: { fgColor: { rgb: isOff(val) ? 'FFF5F5' : (R % 2 === 0 ? 'F7FAFC' : 'FFFFFF') } }
      };
    }
    // 姓名欄粗體
    const nameAddr = XLSX.utils.encode_cell({ r: R, c: 0 });
    if (ws[nameAddr]) ws[nameAddr].s = { ...ws[nameAddr].s, font: { bold: true, color: { rgb: '2D3748' } } };
  }

  XLSX.utils.book_append_sheet(wb, ws, '排班表');

  // 統計工作表
  if (outputData.stats) {
    const s = outputData.stats;
    const sw = XLSX.utils.aoa_to_sheet([
      ['項目','數值'],
      ['排班天數', s.totalDays],
      ['人員數', s.staffCount],
      ['已填班位數', s.totalShiftsAssigned],
      ['休假人次', s.offDays],
    ]);
    sw['!cols'] = [{ wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, sw, '統計摘要');
  }

  const now = new Date();
  XLSX.writeFile(wb, `排班表_${now.getFullYear()}${pad2(now.getMonth()+1)}${pad2(now.getDate())}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────
function pad2(n)    { return String(n).padStart(2,'0'); }
function showError(msg) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
function hideError()    { errorEl.style.display = 'none'; }
function setProgress(msg, pct) { loadingText.textContent = msg; progressFill.style.width = pct + '%'; }

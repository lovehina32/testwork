/* ─── 日翊客服小工具 · 客服排班工具 · app.js ─────────────── */
'use strict';

/* ══════════════════════════════════════════════════════
   排班規則常數
══════════════════════════════════════════════════════ */

// 各人員固定班別（依輪班週期表）
const PERSON_SHIFT = {
  '陳芝容': '07~16',
  '李雅筠': '07:30~16:30',
  '胡巧宜': '08~17',
  '游鈞捷': '09~18',
  '張語軒': '08~17',   // 張語軒固定 08~17
  '廖聲友': '10~19',
  '廖武志': '11~20',
  '羅思凱': '12~21',
  '曾雪惠': '13~22',
  '劉康正': '14~23',
  '郭信智': '14~23',
};

// 人員順序（依班表排序）
const PERSON_ORDER = ['陳芝容','李雅筠','胡巧宜','游鈞捷','張語軒',
                      '廖聲友','廖武志','羅思凱','曾雪惠','劉康正','郭信智'];

// 每日需上班人數上限
const MAX_WORKERS = { mon:9, 'tue-fri':8, weekend:4, meeting:11, special:9 };

// 假別清單
const OFF_LABELS = ['休','特','國','例休','例假','補休','生日假','喪假'];
function isOff(v)   { return OFF_LABELS.some(o => v && String(v).includes(o)); }
function isEmpty(v) { return !v || String(v).trim() === '' || String(v).trim() === 'None'; }

/* ══════════════════════════════════════════════════════
   DOM refs & 狀態
══════════════════════════════════════════════════════ */
let uploadedData = null;   // { dates, weekdays, specials, persons }
let outputData   = null;

const runBtn       = document.getElementById('runBtn');
const errorEl      = document.getElementById('errorMsg');
const loadingEl    = document.getElementById('loadingDiv');
const progressFill = document.getElementById('progressFill');
const loadingText  = document.getElementById('loadingText');
const resultBlock  = document.getElementById('resultBlock');

/* ══════════════════════════════════════════════════════
   輸入切換
══════════════════════════════════════════════════════ */
window.switchInput = function(mode) {
  document.getElementById('panelText').style.display = mode === 'text' ? '' : 'none';
  document.getElementById('panelFile').style.display = mode === 'file' ? '' : 'none';
  document.getElementById('togText').classList.toggle('active', mode === 'text');
  document.getElementById('togFile').classList.toggle('active', mode === 'file');
  checkReady();
};

function checkReady() {
  const hasFile = !!uploadedData;
  const hasText = document.getElementById('scheduleText')?.value?.trim().length > 5;
  const ready   = hasFile || hasText;
  runBtn.disabled   = !ready;
  runBtn.textContent = ready ? '開始自動排班' : '請上傳或貼入預定勤務表後開始';
}
document.getElementById('scheduleText').addEventListener('input', checkReady);

/* ══════════════════════════════════════════════════════
   檔案上傳（接受 xlsx / xls / csv）
══════════════════════════════════════════════════════ */
const dropzone  = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', ()=> dropzone.classList.remove('dragover'));
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
  hideError();

  const reader = new FileReader();
  reader.onload = e => {
    try {
      let csv;
      if (ext === 'csv') {
        csv = e.target.result;
      } else {
        const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
        csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
      }
      uploadedData = parseScheduleCSV(csv);
      if (!uploadedData) { showError('無法解析班表，請確認格式'); return; }
      checkReady();
    } catch(err) { showError('檔案讀取失敗：' + err.message); }
  };
  if (ext === 'csv') reader.readAsText(file, 'UTF-8');
  else reader.readAsBinaryString(file);
}

window.removeFile = function() {
  uploadedData = null;
  document.getElementById('fileInfo').style.display = 'none';
  fileInput.value = '';
  checkReady();
};

/* ══════════════════════════════════════════════════════
   CSV / Excel 解析
   格式：
   Row1-3：空白
   Row4：標題列（綜合服務部...）
   Row5：姓名|日期|日期1|日期2|...
   Row6：空  |星期|一  |二  |...
   Row7：     |    |    |課會|...  （特記）
   Row8-18：人員資料
   Row19+：統計列（跳過）
══════════════════════════════════════════════════════ */
function parseScheduleCSV(csv) {
  const lines = csv.split('\n').map(l => l.split(','));

  // 找到含「姓名」的 header 列
  let headerRow = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i][0] && lines[i][0].includes('姓名')) { headerRow = i; break; }
  }
  if (headerRow === -1) return null;

  const weekdayRow = lines[headerRow + 1] || [];
  const specialRow = lines[headerRow + 2] || [];

  // 日期欄：從 col 2 開始（0-indexed）
  const dates    = [];
  const weekdays = [];
  const specials = [];

  for (let c = 2; c < lines[headerRow].length; c++) {
    const d = lines[headerRow][c]?.trim();
    const w = weekdayRow[c]?.trim();
    const s = specialRow[c]?.trim();
    if (!d || d === '') break;
    // 停止條件：遇到統計欄（生日/喪假 等）
    if (d.includes('生日') || d.includes('輪休') || d.includes('特休') || d.includes('國定') || d.includes('合計')) break;
    dates.push(d);
    weekdays.push(w || '');
    specials.push(s || '');
  }

  if (!dates.length) return null;

  // 人員資料列
  const persons = [];
  for (let r = headerRow + 3; r < lines.length; r++) {
    const row = lines[r];
    const nameRaw = row[0]?.trim() || '';
    if (!nameRaw) continue;
    // 停止條件：遇到統計列
    if (nameRaw.includes('出勤') || nameRaw.includes('總人數') || nameRaw.includes('國定') || nameRaw.includes('注意')) break;

    // 解析姓名（可能含換行符或班別）
    const namePart = nameRaw.replace(/\n.*/,'').replace(/\r.*/,'').trim();
    if (!namePart) continue;

    const shifts = [];
    for (let c = 2; c < 2 + dates.length; c++) {
      shifts.push(row[c]?.trim() || '');
    }
    persons.push({ name: namePart, shifts });
  }

  return { dates, weekdays, specials, persons };
}

/* ══════════════════════════════════════════════════════
   判斷日別類型
══════════════════════════════════════════════════════ */
function getDayType(weekday, special) {
  if (special && special.includes('課會')) return 'meeting';
  if (weekday === '六' || weekday === '日')  return 'weekend';
  if (weekday === '一')                       return 'mon';
  return 'tue-fri';
}

/* ══════════════════════════════════════════════════════
   取得該日可安排的最大上班人數
══════════════════════════════════════════════════════ */
function getMaxWorkers(dayType) {
  return MAX_WORKERS[dayType] ?? 8;
}

/* ══════════════════════════════════════════════════════
   主排班邏輯
══════════════════════════════════════════════════════ */
function runScheduleLogic(data) {
  const { dates, weekdays, specials, persons } = data;
  const warnings = [];

  // 深複製 shifts（避免修改原始資料）
  const result = persons.map(p => ({ name: p.name, shifts: [...p.shifts] }));

  // 依日期逐欄排班
  for (let ci = 0; ci < dates.length; ci++) {
    const dayType   = getDayType(weekdays[ci], specials[ci]);
    const maxWork   = getMaxWorkers(dayType);
    const isMeeting = dayType === 'meeting';
    const isWeekend = dayType === 'weekend';

    // Step 1：計算已確定上班人數（非空、非假別）
    let workCount = 0;
    result.forEach(p => {
      const v = p.shifts[ci];
      if (!isEmpty(v) && !isOff(v)) workCount++;
    });

    // Step 2：對每位人員處理空白格
    result.forEach(p => {
      const v = p.shifts[ci];
      if (!isEmpty(v)) return; // 已有值，跳過

      const isZhang = p.name.includes('張語軒');

      // 張語軒：週末強制休
      if (isZhang && isWeekend) {
        p.shifts[ci] = '休';
        return;
      }

      // 課會日：所有人上班
      if (isMeeting) {
        p.shifts[ci] = isZhang ? '08~17' : (getPersonShift(p.name) || '08~17');
        workCount++;
        return;
      }

      // 判斷本日還能再安排上班的人數
      if (workCount < maxWork) {
        // 還有名額，安排上班
        const shift = isZhang ? '08~17' : (getPersonShift(p.name) || '08~17');
        p.shifts[ci] = shift;
        workCount++;
      } else {
        // 名額已滿，排休
        p.shifts[ci] = '休';
      }
    });
  }

  // ── 法規檢查 ─────────────────────────────────────────
  if (document.getElementById('optCheck').checked) {
    result.forEach(p => {
      const s = p.shifts;

      // 連上 7 天檢查
      let cons = 0;
      for (let i = 0; i < s.length; i++) {
        if (!isOff(s[i]) && !isEmpty(s[i])) {
          cons++;
          if (cons >= 7) {
            warnings.push(`【${p.name}】第 ${i-5}~${i+1} 欄出現連續 7 天以上上班，請手動調整`);
            cons = 0;
          }
        } else { cons = 0; }
      }

      // 上一休一碎班檢查
      let zigzag = 0;
      for (let i = 1; i < s.length - 1; i++) {
        const pw = !isOff(s[i-1]) && !isEmpty(s[i-1]);
        const co = isOff(s[i]);
        const nw = !isOff(s[i+1]) && !isEmpty(s[i+1]);
        if (pw && co && nw) zigzag++;
      }
      if (zigzag >= 2) {
        warnings.push(`【${p.name}】出現 ${zigzag} 次「上一休一」碎班，建議調整連休區段`);
      }
    });
  }

  // ── 統計 ─────────────────────────────────────────────
  let totalWork = 0, totalOff = 0;
  result.forEach(p => p.shifts.forEach(v => {
    if (!isEmpty(v) && !isOff(v)) totalWork++;
    else if (isOff(v)) totalOff++;
  }));

  return {
    dates, weekdays, specials,
    rows: result,
    warnings,
    stats: {
      totalDays:  dates.length,
      staffCount: result.length,
      totalShiftsAssigned: totalWork,
      offDays: totalOff
    }
  };
}

/* 取得人員預設班別（先從 PERSON_SHIFT，找不到則從名稱解析） */
function getPersonShift(name) {
  for (const [key, val] of Object.entries(PERSON_SHIFT)) {
    if (name.includes(key) || key.includes(name)) return val;
  }
  return '08~17'; // 預設
}

/* ══════════════════════════════════════════════════════
   執行排班
══════════════════════════════════════════════════════ */
runBtn.addEventListener('click', runScheduling);

function runScheduling() {
  hideError();
  runBtn.disabled = true;
  runBtn.textContent = '排班中...';
  loadingEl.style.display = 'block';
  resultBlock.style.display = 'none';
  setProgress('解析勤務表...', 20);

  setTimeout(() => {
    try {
      let data = uploadedData;

      // 若無上傳檔案，嘗試解析文字輸入
      if (!data) {
        const text = document.getElementById('scheduleText').value.trim();
        if (!text) throw new Error('請提供預定勤務表');
        data = parseScheduleCSV(text);
        if (!data || !data.persons.length) throw new Error('無法解析文字格式，建議改用 Excel 上傳');
      }

      setProgress('套用排班規則...', 55);
      const result = runScheduleLogic(data);
      outputData = result;

      setProgress('產出排班表...', 85);
      renderResult(result);

      setProgress('完成！', 100);
      setTimeout(() => {
        loadingEl.style.display = 'none';
        resultBlock.style.display = 'block';
        resultBlock.scrollIntoView({ behavior:'smooth', block:'start' });
        runBtn.disabled = false;
        runBtn.textContent = '重新排班';
      }, 300);

    } catch(err) {
      loadingEl.style.display = 'none';
      runBtn.disabled = false;
      runBtn.textContent = '重新排班';
      showError('排班失敗：' + err.message);
    }
  }, 80);
}

/* ══════════════════════════════════════════════════════
   渲染結果
══════════════════════════════════════════════════════ */
function renderResult(d) {
  // 統計卡
  if (document.getElementById('optSummary').checked && d.stats) {
    const s = d.stats;
    document.getElementById('resultStats').innerHTML = `
      <div class="stat-pill">排班天數 <strong>${s.totalDays}</strong></div>
      <div class="stat-pill">人員數 <strong>${s.staffCount}</strong></div>
      <div class="stat-pill">已填班位 <strong>${s.totalShiftsAssigned}</strong></div>
      <div class="stat-pill">休假人次 <strong>${s.offDays}</strong></div>`;
  }

  // 法規警告
  const wb = document.getElementById('warningBlock');
  if (document.getElementById('optCheck').checked) {
    if (d.warnings?.length) {
      wb.innerHTML = d.warnings.map(w =>
        `<div class="warn-box"><strong>⚠ 注意：</strong>${w}</div>`).join('');
    } else {
      wb.innerHTML = `<div class="warn-box" style="border-color:var(--success);background:var(--success-bg)">
        <strong style="color:var(--success)">✓ 法規檢查通過</strong>：無連班或碎班異常</div>`;
    }
  } else { wb.innerHTML = ''; }

  // 表格
  const dateLabels = d.dates.map((dt, i) => {
    const w = d.weekdays[i] || '';
    const s = d.specials[i] || '';
    let label = dt.replace(/\d{4}-?/,'');  // 簡化日期
    if (s) label += `<br><span style="font-size:0.8em;color:var(--accent)">${s}</span>`;
    return `<th title="${s}">${label}<br><span style="color:var(--ink-4);font-weight:400">${w}</span></th>`;
  }).join('');

  const bodyRows = d.rows.map(row => {
    const cells = row.shifts.map(cell => {
      const v = cell || '';
      if (isOff(v)) return `<td class="cell-off">${v}</td>`;
      if (!v)       return `<td class="cell-empty">—</td>`;
      return `<td class="cell-shift">${v}</td>`;
    }).join('');
    return `<tr><td><strong>${row.name}</strong></td>${cells}</tr>`;
  }).join('');

  document.getElementById('scheduleTableWrap').innerHTML = `
    <table>
      <thead><tr><th>姓名</th>${dateLabels}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;

  // Raw 輸出（CSV 格式）
  const csvOut = [
    ['姓名', ...d.dates],
    ...d.rows.map(r => [r.name, ...r.shifts])
  ].map(r => r.join(',')).join('\n');
  document.getElementById('rawOutput').textContent = csvOut;
}

/* ══════════════════════════════════════════════════════
   匯出 Excel（保持原始班表格式）
══════════════════════════════════════════════════════ */
document.getElementById('exportBtn').addEventListener('click', exportExcel);

function exportExcel() {
  if (!outputData?.rows) return;
  const { dates, weekdays, specials, rows } = outputData;
  const wb = XLSX.utils.book_new();

  // 建立資料陣列
  const headerRow  = ['姓名', ...dates];
  const weekRow    = ['星期', ...weekdays];
  const specialRow = ['備注',  ...specials];
  const dataRows   = rows.map(r => [r.name, ...r.shifts]);
  const aoa = [headerRow, weekRow, specialRow, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 欄寬設定
  ws['!cols'] = [{ wch: 10 }, ...dates.map(() => ({ wch: 12 }))];

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  // Header 列樣式（深色背景）
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[addr]) ws[addr].s = {
      font:      { bold: true, color: { rgb: 'FFFFFF' } },
      fill:      { fgColor: { rgb: '2D3748' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
  }

  // 星期列樣式
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 1, c: C });
    if (ws[addr]) ws[addr].s = {
      font: { color: { rgb: '4A5568' } },
      fill: { fgColor: { rgb: 'EDF2F7' } },
      alignment: { horizontal: 'center' }
    };
  }

  // 備注列（週末/課會日特別標色）
  for (let C = 1; C < specials.length + 1; C++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c: C });
    if (!ws[addr]) continue;
    const s = specials[C - 1] || '';
    const w = weekdays[C - 1] || '';
    let bg = 'FFFFFF';
    if (s.includes('課會')) bg = 'BEE3F8';
    else if (s.includes('檔期')) bg = 'FEF3C7';
    else if (w === '六' || w === '日') bg = 'F0FDF4';
    ws[addr].s = { font: { color: { rgb: '744210' } }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: 'center' } };
  }

  // 資料列樣式
  for (let R = 3; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      const val = String(ws[addr].v || '');
      const off = isOff(val);
      ws[addr].s = {
        alignment: { horizontal: C === 0 ? 'left' : 'center', vertical: 'center' },
        font: off ? { bold: true, color: { rgb: 'C53030' } }
                  : { color: { rgb: C === 0 ? '2D3748' : '1A202C' } },
        fill: { fgColor: { rgb: off ? 'FFF5F5' : (R % 2 === 0 ? 'F7FAFC' : 'FFFFFF') } }
      };
    }
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

/* ══════════════════════════════════════════════════════
   工具函式
══════════════════════════════════════════════════════ */
function pad2(n)    { return String(n).padStart(2,'0'); }
function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return Math.round(b/1024) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function showError(msg) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
function hideError()    { errorEl.style.display = 'none'; }
function setProgress(msg, pct) {
  loadingText.textContent = msg;
  progressFill.style.width = pct + '%';
}

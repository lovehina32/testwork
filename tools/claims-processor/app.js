/* ─── OpsHub · 壓賠資料整合工具 · app.js ───────────────── */
'use strict';

// ── State ────────────────────────────────────────────────
const files = { claims: null, query: null, store: null, prevstore: null };
const data  = { claims: [], query: [], store: [], prevstore: [] };
let outputRows = [];

// ── Slot config ──────────────────────────────────────────
const SLOTS = [
  { key: 'claims',   id: 'slot-claims',   fileId: 'file-claims',   statusId: 'status-claims'   },
  { key: 'query',    id: 'slot-query',    fileId: 'file-query',    statusId: 'status-query'    },
  { key: 'store',    id: 'slot-store',    fileId: 'file-store',    statusId: 'status-store'    },
  { key: 'prevstore',id: 'slot-prevstore',fileId: 'file-prevstore',statusId: 'status-prevstore'},
];

// ── Mount file handlers ──────────────────────────────────
SLOTS.forEach(s => {
  const slot  = document.getElementById(s.id);
  const input = document.getElementById(s.fileId);

  slot.addEventListener('click', e => { if (e.target !== input) input.click(); });
  slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('dragover'); });
  slot.addEventListener('dragleave', () => slot.classList.remove('dragover'));
  slot.addEventListener('drop', e => {
    e.preventDefault(); slot.classList.remove('dragover');
    if (e.dataTransfer.files[0]) loadFile(s.key, e.dataTransfer.files[0]);
  });
  input.addEventListener('change', e => { if (e.target.files[0]) loadFile(s.key, e.target.files[0]); });
});

// ── Load & parse file ────────────────────────────────────
function loadFile(key, file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv','xlsx','xls'].includes(ext)) { showError('請上傳 CSV 或 Excel 格式檔案。'); return; }
  files[key] = file;
  const reader = new FileReader();
  reader.onload = e => {
    let csv;
    if (ext === 'csv') {
      csv = e.target.result;
    } else {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      csv = XLSX.utils.sheet_to_csv(ws);
    }
    data[key] = csvToObjects(csv);
    const slot   = document.getElementById('slot-' + (key === 'prevstore' ? 'prevstore' : key));
    const status = document.getElementById('status-' + (key === 'prevstore' ? 'prevstore' : key));
    slot.classList.add('uploaded');
    status.textContent = `✓ ${file.name}（${data[key].length} 筆）`;
    checkAllUploaded();
  };
  reader.onerror = () => showError('檔案讀取失敗，請重試。');
  if (ext === 'csv') reader.readAsText(file, 'UTF-8');
  else reader.readAsBinaryString(file);
}

function csvToObjects(csv) {
  const lines = csv.split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim().replace(/^["']|["']$/g,''));
  return lines.slice(1).map(line => {
    const vals = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim().replace(/^["']|["']$/g,''); });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ''));
}

function splitCsvLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

// ── Check all files uploaded ─────────────────────────────
function checkAllUploaded() {
  const allReady = SLOTS.every(s => data[s.key].length > 0);
  const runBtn = document.getElementById('runBtn');
  if (allReady) {
    runBtn.disabled = false;
    runBtn.textContent = '執行六步驟 SOP 整合';
    showMappingPreview();
    hideError();
  }
}

// ── Show mapping preview ─────────────────────────────────
function showMappingPreview() {
  const sec = document.getElementById('mappingSection');
  const content = document.getElementById('mappingContent');
  sec.style.display = 'block';

  const claimsHeaders   = data.claims.length   ? Object.keys(data.claims[0])   : [];
  const queryHeaders    = data.query.length     ? Object.keys(data.query[0])    : [];
  const storeHeaders    = data.store.length     ? Object.keys(data.store[0])    : [];
  const prevHeaders     = data.prevstore.length ? Object.keys(data.prevstore[0]): [];

  const autoFind = (arr, candidates) => {
    for (const c of candidates) {
      const found = arr.find(h => h.includes(c));
      if (found) return found;
    }
    return arr[0] || '';
  };

  // Smart column detection
  window.colMap = {
    // Claims
    c_status:      autoFind(claimsHeaders, ['狀態','status']),
    c_sendStore:   autoFind(claimsHeaders, ['寄件店號','寄件店']),
    c_recvStore:   autoFind(claimsHeaders, ['取件店號','取件店']),
    c_sendMethod:  autoFind(claimsHeaders, ['寄件方式','寄件']),
    c_vendor:      autoFind(claimsHeaders, ['廠商名稱','廠商']),
    c_orderNo:     autoFind(claimsHeaders, ['訂單編號','訂單']),
    c_barcode2:    autoFind(claimsHeaders, ['第二段條碼','條碼']),
    c_reason:      autoFind(claimsHeaders, ['賠付原因','處理內容','處理']),
    c_amount:      autoFind(claimsHeaders, ['總賠償','賠償金額','金額']),
    c_closeDate:   autoFind(claimsHeaders, ['結案日','結案']),
    // Query
    q_vendorOrder: autoFind(queryHeaders,  ['廠商訂編','廠商訂單']),
    q_orderNote:   autoFind(queryHeaders,  ['訂單備註','備註']),
    q_senderName:  autoFind(queryHeaders,  ['寄件人姓名','寄件人']),
    q_recverName:  autoFind(queryHeaders,  ['取件人','收件人']),
    q_sendDate:    autoFind(queryHeaders,  ['寄件日期','寄件時間']),
    q_arriveDate:  autoFind(queryHeaders,  ['進店日期時間','進店日期','進店']),
    q_orderKey:    autoFind(queryHeaders,  ['訂單編號','訂單','單號']),
    // Store
    s_storeNo:     autoFind(storeHeaders,  ['店號','門市編號']),
    s_storeName:   autoFind(storeHeaders,  ['店名','門市名稱']),
    s_storeType:   autoFind(storeHeaders,  ['店型','門市類型']),
    s_dept:        autoFind(storeHeaders,  ['所別','營業部','部別']),
    s_section:     autoFind(storeHeaders,  ['課別','營業課','課']),
    // PrevStore
    p_storeNo:     autoFind(prevHeaders,   ['店號','門市編號']),
    p_storeName:   autoFind(prevHeaders,   ['店名','門市名稱']),
    p_storeType:   autoFind(prevHeaders,   ['店型','門市類型']),
    p_dept:        autoFind(prevHeaders,   ['所別','營業部名稱','部別']),
    p_section:     autoFind(prevHeaders,   ['課別','營業課名稱','課']),
  };

  const makeSelect = (arr, val, key) =>
    `<select class="mapping-source" onchange="window.colMap['${key}']=this.value">
      ${arr.map(h => `<option value="${h}" ${h===val?'selected':''}>${h}</option>`).join('')}
    </select>`;

  content.innerHTML = `<div class="mapping-grid">
    <div class="mapping-card">
      <div class="mapping-card-title">理賠檔案</div>
      ${mappingRow('異常狀態', makeSelect(claimsHeaders, colMap.c_status, 'c_status'))}
      ${mappingRow('寄件店號', makeSelect(claimsHeaders, colMap.c_sendStore, 'c_sendStore'))}
      ${mappingRow('取件店號', makeSelect(claimsHeaders, colMap.c_recvStore, 'c_recvStore'))}
      ${mappingRow('寄件方式', makeSelect(claimsHeaders, colMap.c_sendMethod, 'c_sendMethod'))}
      ${mappingRow('廠商名稱', makeSelect(claimsHeaders, colMap.c_vendor, 'c_vendor'))}
      ${mappingRow('訂單編號', makeSelect(claimsHeaders, colMap.c_orderNo, 'c_orderNo'))}
      ${mappingRow('第二段條碼', makeSelect(claimsHeaders, colMap.c_barcode2, 'c_barcode2'))}
      ${mappingRow('賠付原因', makeSelect(claimsHeaders, colMap.c_reason, 'c_reason'))}
      ${mappingRow('總賠償金額', makeSelect(claimsHeaders, colMap.c_amount, 'c_amount'))}
      ${mappingRow('結案日', makeSelect(claimsHeaders, colMap.c_closeDate, 'c_closeDate'))}
    </div>
    <div class="mapping-card">
      <div class="mapping-card-title">大批查件</div>
      ${mappingRow('關聯鍵(訂單)', makeSelect(queryHeaders, colMap.q_orderKey, 'q_orderKey'))}
      ${mappingRow('廠商訂編', makeSelect(queryHeaders, colMap.q_vendorOrder, 'q_vendorOrder'))}
      ${mappingRow('訂單備註', makeSelect(queryHeaders, colMap.q_orderNote, 'q_orderNote'))}
      ${mappingRow('寄件人姓名', makeSelect(queryHeaders, colMap.q_senderName, 'q_senderName'))}
      ${mappingRow('取件人', makeSelect(queryHeaders, colMap.q_recverName, 'q_recverName'))}
      ${mappingRow('寄件日期', makeSelect(queryHeaders, colMap.q_sendDate, 'q_sendDate'))}
      ${mappingRow('進店日期時間', makeSelect(queryHeaders, colMap.q_arriveDate, 'q_arriveDate'))}
    </div>
    <div class="mapping-card">
      <div class="mapping-card-title">店鋪主檔</div>
      ${mappingRow('店號', makeSelect(storeHeaders, colMap.s_storeNo, 's_storeNo'))}
      ${mappingRow('店名', makeSelect(storeHeaders, colMap.s_storeName, 's_storeName'))}
      ${mappingRow('店型', makeSelect(storeHeaders, colMap.s_storeType, 's_storeType'))}
      ${mappingRow('所別', makeSelect(storeHeaders, colMap.s_dept, 's_dept'))}
      ${mappingRow('課別', makeSelect(storeHeaders, colMap.s_section, 's_section'))}
    </div>
    <div class="mapping-card">
      <div class="mapping-card-title">前月店鋪主檔</div>
      ${mappingRow('店號', makeSelect(prevHeaders, colMap.p_storeNo, 'p_storeNo'))}
      ${mappingRow('店名', makeSelect(prevHeaders, colMap.p_storeName, 'p_storeName'))}
      ${mappingRow('店型', makeSelect(prevHeaders, colMap.p_storeType, 'p_storeType'))}
      ${mappingRow('所別', makeSelect(prevHeaders, colMap.p_dept, 'p_dept'))}
      ${mappingRow('課別', makeSelect(prevHeaders, colMap.p_section, 'p_section'))}
    </div>
  </div>`;
}

function mappingRow(label, selectHtml) {
  return `<div class="mapping-row">
    <span class="mapping-target">${label}</span>
    <span class="mapping-arrow">←</span>
    ${selectHtml}
  </div>`;
}

// ── Run Button ───────────────────────────────────────────
document.getElementById('runBtn').addEventListener('click', runSOP);

async function runSOP() {
  hideError();
  const runBtn = document.getElementById('runBtn');
  runBtn.disabled = true; runBtn.textContent = '處理中...';

  const progressBlock = document.getElementById('progressBlock');
  const resultBlock   = document.getElementById('resultBlock');
  progressBlock.style.display = 'block';
  resultBlock.style.display   = 'none';

  const steps = [
    'Step 01 — 基礎理賠資料對應',
    'Step 02 — 大批查件資料對應',
    'Step 03 — 消費者姓名邏輯判斷',
    'Step 04 — 壓賠店號邏輯判斷',
    'Step 05 — 進店日邏輯判斷',
    'Step 06 — 店舖歸屬資料關聯',
  ];

  const stepsEl = document.getElementById('progressSteps');
  stepsEl.innerHTML = steps.map((s, i) =>
    `<div class="progress-step" id="pstep-${i}"><div class="step-dot"></div>${s}</div>`
  ).join('');

  const setStep = (i, state) => {
    document.getElementById('pstep-' + i).className = 'progress-step ' + state;
    document.getElementById('progressFill').style.width = Math.round((i + 1) / steps.length * 100) + '%';
  };

  const delay = ms => new Promise(r => setTimeout(r, ms));

  try {
    const cm = window.colMap;

    // Build lookup maps
    setStep(0, 'running');
    await delay(200);

    // ── Step 1: Base claims data ─────────────────────────
    const rows = data.claims.map((c, idx) => ({
      項次:            idx + 1,
      寄件方式:        c[cm.c_sendMethod] || '',
      廠商名稱:        c[cm.c_vendor]     || '',
      訂單編號:        padZero(c[cm.c_orderNo] || '', 11),
      第二段條碼:      c[cm.c_barcode2]   || '',
      賠付原因:        c[cm.c_reason]     || '',
      總賠償金額:      c[cm.c_amount]     || '',
      結案日:          formatDate(c[cm.c_closeDate] || ''),
      _status:         c[cm.c_status]     || '',
      _sendStore:      c[cm.c_sendStore]  || '',
      _recvStore:      c[cm.c_recvStore]  || '',
      _rawOrderNo:     c[cm.c_orderNo]    || '',
    }));
    setStep(0, 'done'); await delay(150);

    // ── Step 2: Query data ───────────────────────────────
    setStep(1, 'running'); await delay(200);
    const queryMap = {};
    data.query.forEach(q => {
      const key = padZero(q[cm.q_orderKey] || '', 11);
      if (key) queryMap[key] = q;
    });
    rows.forEach(r => {
      const q = queryMap[r.訂單編號] || {};
      r.廠商訂編 = q[cm.q_vendorOrder] || '';
      r.備註     = q[cm.q_orderNote]   || '';
      r._q = q;
    });
    setStep(1, 'done'); await delay(150);

    // ── Step 3: Consumer name ────────────────────────────
    setStep(2, 'running'); await delay(200);
    rows.forEach(r => {
      const status = r._status;
      const q = r._q || {};
      if (status === '寄件未離店') {
        r.消費者姓名 = q[cm.q_senderName] || '[需補人名]';
      } else if (status === '未退貨') {
        r.消費者姓名 = q[cm.q_recverName] || '[需補人名]';
      } else {
        r.消費者姓名 = '[需補人名]';
      }
    });
    setStep(2, 'done'); await delay(150);

    // ── Step 4: Store number ─────────────────────────────
    setStep(3, 'running'); await delay(200);
    rows.forEach(r => {
      const status = r._status;
      let storeNo = '';
      if (status === '寄件未離店') {
        storeNo = r._sendStore;
      } else if (status === '未退貨') {
        storeNo = r._recvStore;
      }
      r.壓賠時店號 = storeNo ? padZero(storeNo, 6) : '[需補店號]';
    });
    setStep(3, 'done'); await delay(150);

    // ── Step 5: Arrive date ──────────────────────────────
    setStep(4, 'running'); await delay(200);
    rows.forEach(r => {
      const status = r._status;
      const q = r._q || {};
      let dateVal = '';
      if (status === '寄件未離店') {
        dateVal = q[cm.q_sendDate] || '';
      } else if (status === '未退貨') {
        dateVal = q[cm.q_arriveDate] || '';
      }
      r.進店日 = formatDate(dateVal);
    });
    setStep(4, 'done'); await delay(150);

    // ── Step 6: Store info lookup ────────────────────────
    setStep(5, 'running'); await delay(200);
    const storeMap = {};
    data.store.forEach(s => {
      const no = padZero(s[cm.s_storeNo] || '', 6);
      if (no) storeMap[no] = s;
    });
    const prevMap = {};
    data.prevstore.forEach(s => {
      const no = padZero(s[cm.p_storeNo] || '', 6);
      if (no) prevMap[no] = s;
    });

    let fallbackCount = 0;
    rows.forEach(r => {
      const no = r.壓賠時店號;
      if (no === '[需補店號]') {
        r.歸屬店名 = ''; r.歸屬店型 = ''; r.歸屬所別 = ''; r.歸屬課別 = '';
        return;
      }
      let src = storeMap[no];
      let usedFallback = false;
      if (!src) { src = prevMap[no]; usedFallback = !!src; if (usedFallback) fallbackCount++; }
      if (src) {
        r.歸屬店名 = usedFallback ? (src[cm.p_storeName] || '') : (src[cm.s_storeName] || '');
        r.歸屬店型 = usedFallback ? (src[cm.p_storeType] || '') : (src[cm.s_storeType] || '');
        r.歸屬所別 = usedFallback ? (src[cm.p_dept]      || '') : (src[cm.s_dept]      || '');
        r.歸屬課別 = usedFallback ? (src[cm.p_section]   || '') : (src[cm.s_section]   || '');
        if (usedFallback) r._fallback = true;
      } else {
        r.歸屬店名 = ''; r.歸屬店型 = ''; r.歸屬所別 = ''; r.歸屬課別 = '';
      }
    });
    setStep(5, 'done'); await delay(200);

    // ── Build final output ───────────────────────────────
    outputRows = rows.map(r => ({
      '項次':            r.項次,
      '壓賠時店號':      r.壓賠時店號,
      '歸屬店名':        r.歸屬店名  || '',
      '歸屬店型':        r.歸屬店型  || '',
      '歸屬所別':        r.歸屬所別  || '',
      '歸屬課別':        r.歸屬課別  || '',
      '寄件方式':        r.寄件方式,
      '廠商名稱':        r.廠商名稱,
      '訂單編號':        r.訂單編號,
      '廠商訂編':        r.廠商訂編,
      '第二段條碼':      r.第二段條碼,
      '消費者姓名':      r.消費者姓名,
      '進店日':          r.進店日,
      '異常狀態':        r._status,
      '賠付原因(處理內容)': r.賠付原因,
      '總賠償金額':      r.總賠償金額,
      '結案日':          r.結案日,
      '備註':            r.備註,
    }));

    // Stats
    const needStore  = outputRows.filter(r => r['壓賠時店號'] === '[需補店號]').length;
    const needName   = outputRows.filter(r => r['消費者姓名'] === '[需補人名]').length;

    document.getElementById('resultStats').innerHTML = `
      <div class="stat-pill">總筆數 <strong>${outputRows.length}</strong></div>
      <div class="stat-pill">需補店號 <strong style="color:var(--warn)">${needStore}</strong></div>
      <div class="stat-pill">需補人名 <strong style="color:var(--warn)">${needName}</strong></div>
      <div class="stat-pill">備援店鋪主檔 <strong>${fallbackCount}</strong></div>
    `;

    renderPreview(outputRows.slice(0, 10));
    resultBlock.style.display = 'block';
    resultBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });

    runBtn.disabled = false; runBtn.textContent = '重新執行';

  } catch (err) {
    showError('處理失敗：' + err.message);
    runBtn.disabled = false; runBtn.textContent = '重新執行';
  }
}

// ── Render Preview ───────────────────────────────────────
function renderPreview(rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const WARN_VALS = ['[需補店號]','[需補人名]'];
  document.getElementById('previewTable').innerHTML = `
    <table class="preview-table">
      <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r =>
        `<tr>${cols.map(c => {
          const v = r[c] || '';
          const cls = WARN_VALS.includes(v) ? 'cell-warn' : (!v ? 'cell-empty' : '');
          return `<td class="${cls}">${v || '—'}</td>`;
        }).join('')}</tr>`
      ).join('')}</tbody>
    </table>`;
}

// ── Export Excel ─────────────────────────────────────────
document.getElementById('exportBtn').addEventListener('click', () => {
  if (!outputRows.length) return;
  const ws = XLSX.utils.json_to_sheet(outputRows);

  // Column widths
  const colWidths = Object.keys(outputRows[0]).map(k => ({ wch: Math.max(k.length * 2, 12) }));
  ws['!cols'] = colWidths;

  // Style header row (basic)
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[addr]) continue;
    ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'F7F5F0' } } };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '壓賠整合資料');

  const now = new Date();
  const ts = `${now.getFullYear()}${pad2(now.getMonth()+1)}${pad2(now.getDate())}`;
  XLSX.writeFile(wb, `壓賠整合_${ts}.xlsx`);
});

// ── Helpers ──────────────────────────────────────────────
function padZero(val, len) {
  if (!val || val.startsWith('[')) return val;
  const s = String(val).replace(/\D/g, '') || String(val);
  return s.padStart(len, '0');
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDate(val) {
  if (!val) return '';
  // Already YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}/.test(val)) return val.substring(0, 10);
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.substring(0, 10).replace(/-/g, '/');
  // MM/DD/YYYY
  const m1 = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) return `${m1[3]}/${pad2(m1[1])}/${pad2(m1[2])}`;
  // YYYYMMDD
  const m2 = val.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m2) return `${m2[1]}/${m2[2]}/${m2[3]}`;
  // Excel serial number
  if (/^\d{5}$/.test(val.trim())) {
    const d = new Date(Math.round((+val - 25569) * 86400 * 1000));
    return `${d.getFullYear()}/${pad2(d.getMonth()+1)}/${pad2(d.getDate())}`;
  }
  return val;
}

function showError(msg) { const e = document.getElementById('errorMsg'); e.textContent = msg; e.style.display = 'block'; }
function hideError()    { document.getElementById('errorMsg').style.display = 'none'; }

/* ─── LogiScan · app.js · 純前端分析版（免 API Key）─────── */
'use strict';

let uploadedData = null;
let uploadedFileName = '';

const dropzone    = document.getElementById('dropzone');
const fileInput   = document.getElementById('fileInput');
const analyzeBtn  = document.getElementById('analyzeBtn');
const fileInfoEl  = document.getElementById('fileInfo');
const errorEl     = document.getElementById('errorMsg');
const loadingEl   = document.getElementById('loadingDiv');
const resultsEl   = document.getElementById('resultsDiv');
const progressFill = document.getElementById('progressFill');
const loadingText  = document.getElementById('loadingText');

// ── Upload handlers ──────────────────────────────────────
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

document.getElementById('removeFile').addEventListener('click', () => {
  uploadedData = null; uploadedFileName = '';
  fileInfoEl.style.display = 'none';
  analyzeBtn.textContent = '選擇檔案後開始分析';
  analyzeBtn.disabled = true;
  resultsEl.style.display = 'none';
  fileInput.value = '';
  hideError();
});

function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv','xlsx','xls'].includes(ext)) { showError('請上傳 CSV 或 Excel（XLSX/XLS）格式的檔案。'); return; }
  uploadedFileName = file.name;
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatSize(file.size);
  document.getElementById('fileIcon').textContent = ext === 'csv' ? '📄' : '📊';
  fileInfoEl.style.display = 'flex';
  analyzeBtn.textContent = '開始分析';
  analyzeBtn.disabled = false;
  hideError();

  const reader = new FileReader();
  reader.onload = e => {
    if (ext === 'csv') {
      uploadedData = e.target.result;
    } else {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // 轉成二維陣列，自動偵測真正的標題列
      const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      // 已知欄位關鍵字（找包含最多這些字的列當標題）
      const KEY_COLS = ['日期','時間','店號','店名','大類別','中類別','小類別','處理狀態','反應事項','處理結果','一次性處理'];
      let headerRowIdx = 0;
      let maxMatch = 0;
      allRows.slice(0, 30).forEach((row, idx) => {
        const rowStr = row.join(',');
        const matches = KEY_COLS.filter(k => rowStr.includes(k)).length;
        if (matches > maxMatch) { maxMatch = matches; headerRowIdx = idx; }
      });
      // 從標題列開始轉成 CSV
      const dataRows = allRows.slice(headerRowIdx);
      uploadedData = dataRows.map(row =>
        row.map(cell => {
          const s = String(cell).replace(/\n/g, ' ').replace(/"/g, '""');
          return s.includes(',') || s.includes('"') ? `"${s}"` : s;
        }).join(',')
      ).join('\n');
    }
  };
  reader.onerror = () => showError('檔案讀取失敗，請重試。');
  if (ext === 'csv') reader.readAsText(file, 'UTF-8');
  else reader.readAsBinaryString(file);
}

function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

// ── Tab switching ────────────────────────────────────────
document.getElementById('resultTabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  switchTab(btn.dataset.tab);
});
function switchTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const target = document.getElementById('tab-' + id);
  if (target) target.classList.add('active');
}

function showError(msg) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
function hideError()    { errorEl.style.display = 'none'; }

// ── CSV Parser ───────────────────────────────────────────
function csvToObjects(csv) {
  const lines = csv.split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim().replace(/^["']|["']$/g, ''));
  return lines.slice(1).map(line => {
    const vals = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim().replace(/^["']|["']$/g, ''); });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ''));
}
function splitCsvLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

// ── Auto-detect column ───────────────────────────────────
function findCol(headers, candidates) {
  for (const c of candidates) {
    const h = headers.find(h => h.includes(c));
    if (h) return h;
  }
  return null;
}

// ── Count map helper ─────────────────────────────────────
function countBy(rows, key) {
  const map = {};
  rows.forEach(r => {
    const v = r[key] || '（空白）';
    map[v] = (map[v] || 0) + 1;
  });
  return Object.entries(map)
    .map(([name, count]) => ({ name, count, pct: 0 }))
    .sort((a, b) => b.count - a.count);
}
function withPct(arr) {
  const total = arr.reduce((s, x) => s + x.count, 0);
  return arr.map(x => ({ ...x, pct: total ? +(x.count / total * 100).toFixed(1) : 0 }));
}

// ── Keyword extractor ────────────────────────────────────
function topKeywords(rows, colKey, topN = 10) {
  const STOP = new Set(['的','了','是','在','和','有','我','你','他','她','它','都','這','那','也','不','就','可以','請','已','並','及','或','對','以','於','到','為','如','與','之','其','將','由','更','其他','進行','相關','處理','目前','確認','無法','發現']);
  const freq = {};
  rows.forEach(r => {
    const text = (r[colKey] || '');
    const words = text.match(/[\u4e00-\u9fa5]{2,6}|[A-Za-z]{3,}/g) || [];
    words.forEach(w => {
      if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
    });
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

// ── Analyze button ───────────────────────────────────────
analyzeBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (!uploadedData) { showError('請先選擇檔案。'); return; }
  const checks = [1,2,3,4,5,6].map(i => document.getElementById('chk'+i).checked);
  if (!checks.some(Boolean)) { showError('請至少選擇一個分析項目。'); return; }

  hideError();
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = '分析中...';
  loadingEl.style.display = 'block';
  resultsEl.style.display = 'none';
  startProgress('正在解析資料結構...');

  await delay(80);

  try {
    const rows = csvToObjects(uploadedData);
    if (!rows.length) throw new Error('無法解析資料，請確認檔案格式正確。');
    const headers = Object.keys(rows[0]);

    // ── Column detection ──
    const COL = {
      date:       findCol(headers, ['日期','建立時間','時間','Date','date']),
      store:      findCol(headers, ['店名','店號','門市','Store']),
      route:      findCol(headers, ['路線','Route','配別']),
      warehouse:  findCol(headers, ['倉別','倉庫','Warehouse']),
      majorCat:   findCol(headers, ['大類別','大類','Major']),
      midCat:     findCol(headers, ['中類別','中類','Mid']),
      minorCat:   findCol(headers, ['小類別','小類','Minor']),
      status:     findCol(headers, ['處理狀態','狀態','Status']),
      ftr:        findCol(headers, ['一次性處理','一次解決','FTR']),
      issue:      findCol(headers, ['反應事項','問題描述','異常狀態','Issue']),
      result:     findCol(headers, ['處理結果','Result']),
      handler:    findCol(headers, ['處理人員','負責人','Handler']),
      closeDate:  findCol(headers, ['結案日','結案時間','Close']),
    };

    updateProgress('統計類別分布...', 30);
    await delay(80);

    // ── Step 1: Summary ──
    const totalRows = rows.length;
    const storeSet = COL.store ? new Set(rows.map(r => r[COL.store]).filter(Boolean)) : new Set();
    const routeSet = COL.route ? new Set(rows.map(r => r[COL.route]).filter(Boolean)) : new Set();
    const whSet    = COL.warehouse ? new Set(rows.map(r => r[COL.warehouse]).filter(Boolean)) : new Set();

    // Date range
    let dateRange = '無法判斷';
    if (COL.date) {
      const dates = rows.map(r => r[COL.date]).filter(Boolean).sort();
      if (dates.length) dateRange = dates[0] + ' ～ ' + dates[dates.length - 1];
    }

    // Main distribution (major category or status)
    const distCol = COL.majorCat || COL.status || headers[1];
    const distMap = distCol ? countBy(rows, distCol).slice(0, 6) : [];

    // Missing fields
    const missingFields = [];
    const wantedCols = ['大類別','中類別','小類別','處理狀態','一次性處理','反應事項','處理結果'];
    wantedCols.forEach(w => { if (!headers.some(h => h.includes(w.slice(0,2)))) missingFields.push(w); });

    updateProgress('計算問題頻率...', 55);
    await delay(80);

    // ── Step 2: Category Stats ──
    const majorStats = COL.majorCat ? withPct(countBy(rows, COL.majorCat)) : [];
    const midStats   = COL.midCat   ? withPct(countBy(rows, COL.midCat))   : [];
    const minorStats = COL.minorCat ? withPct(countBy(rows, COL.minorCat)) : [];

    // ── Step 3: Top 3 problems ──
    const top3Source = majorStats.length ? majorStats : midStats.length ? midStats : withPct(countBy(rows, headers[1] || headers[0]));
    const top3 = top3Source.slice(0, 3).map((x, i) => ({
      rank: i + 1,
      title: x.name,
      count: x.count,
      percentage: x.pct.toFixed(1) + '%',
      description: `共出現 ${x.count} 筆，佔總量 ${x.pct.toFixed(1)}%。` +
        (COL.issue ? `相關關鍵字：${topKeywords(rows.filter(r => (r[COL.majorCat] || r[headers[1]]) === x.name), COL.issue, 3).map(k => k.word).join('、') || '—'}` : '')
    }));

    // ── Step 4: Quality Stats ──
    let ftrY = 0, ftrN = 0, ftrNA = 0;
    if (COL.ftr) {
      rows.forEach(r => {
        const v = (r[COL.ftr] || '').toUpperCase();
        if (v === 'Y' || v === '是' || v === '1') ftrY++;
        else if (v === 'N' || v === '否' || v === '0') ftrN++;
        else ftrNA++;
      });
    }
    const statusDist = COL.status ? withPct(countBy(rows, COL.status)) : [];
    const unresolved = COL.status
      ? rows.filter(r => {
          const s = r[COL.status] || '';
          return s && !['已結案','結案','完成','Closed','closed'].some(k => s.includes(k));
        }).slice(0, 5).map((r, i) => ({
          id: '第 ' + (i + 1) + ' 筆',
          issue: (COL.issue ? r[COL.issue] : '') || r[headers[0]] || '（無描述）'
        }))
      : [];

    updateProgress('偵測異常店舖...', 75);
    await delay(80);

    // ── Step 5: Warnings ──
    const warnings = [];
    if (COL.store) {
      const storeCounts = countBy(rows, COL.store);
      const avg = totalRows / (storeSet.size || 1);
      storeCounts.slice(0, 5).forEach(s => {
        if (s.count > avg * 2 && s.name !== '（空白）') {
          warnings.push({ type: 'store', target: s.name, count: s.count, issue: `反應件數為平均值的 ${(s.count / avg).toFixed(1)} 倍，建議優先關注`, severity: s.count > avg * 4 ? 'high' : 'mid' });
        }
      });
    }
    if (COL.route) {
      const routeCounts = countBy(rows, COL.route);
      const avg = totalRows / (routeSet.size || 1);
      routeCounts.slice(0, 3).forEach(s => {
        if (s.count > avg * 2.5 && s.name !== '（空白）') {
          warnings.push({ type: 'route', target: s.name, count: s.count, issue: `路線異常件數偏高，為平均值的 ${(s.count / avg).toFixed(1)} 倍`, severity: 'mid' });
        }
      });
    }
    if (COL.handler) {
      const handlerCounts = countBy(rows, COL.handler);
      const avg = totalRows / (new Set(rows.map(r => r[COL.handler])).size || 1);
      handlerCounts.slice(0, 3).forEach(s => {
        if (s.count > avg * 3 && s.name !== '（空白）') {
          warnings.push({ type: 'staff', target: s.name, count: s.count, issue: `處理件數明顯高於其他人員，建議檢視是否需要協助`, severity: 'low' });
        }
      });
    }

    // ── Step 6: Suggestions ──
    updateProgress('產出改善建議...', 90);
    await delay(80);

    const suggestions = [];
    const ftrTotal = ftrY + ftrN;
    const ftrRate = ftrTotal > 0 ? ftrY / ftrTotal : null;
    if (ftrRate !== null && ftrRate < 0.8) {
      suggestions.push({ title: '提升一次解決率', detail: `目前一次解決率為 ${(ftrRate * 100).toFixed(1)}%，建議加強第一線人員培訓，建立標準處理 SOP，目標提升至 85% 以上。`, priority: '高' });
    }
    if (warnings.filter(w => w.severity === 'high').length > 0) {
      const topStore = warnings.find(w => w.type === 'store' && w.severity === 'high');
      if (topStore) suggestions.push({ title: `重點關注高頻異常店舖：${topStore.target}`, detail: `該店舖反應件數異常偏高（${topStore.count} 件），建議安排實地訪查，了解根本原因並提供專項輔導。`, priority: '高' });
    }
    if (top3.length > 0) {
      suggestions.push({ title: `優先解決「${top3[0].title}」問題`, detail: `此類問題佔比最高（${top3[0].percentage}），建議制定專項改善計畫，設定改善目標並每週追蹤進度。`, priority: '高' });
    }
    if (COL.route && routeSet.size > 0) {
      suggestions.push({ title: '建立路線異常監控機制', detail: '建議設定各路線異常件數警戒值，超標時自動通知負責主管，實現即時預警。', priority: '中' });
    }
    suggestions.push({ title: '定期製作月度異常趨勢報告', detail: '每月彙整異常數據，追蹤各類別問題的改善趨勢，作為績效評估與資源分配的依據。', priority: '低' });

    // ── Keyword analysis for issues ──
    const issueKeywords = COL.issue ? topKeywords(rows, COL.issue, 8) : [];
    const resultKeywords = COL.result ? topKeywords(rows, COL.result, 8) : [];

    updateProgress('產生月報...', 95);
    await delay(80);

    // ── Step 7: Monthly Report Data ──
    const monthlyMajor = majorStats.length ? majorStats : midStats;
    const monthlyTotal = monthlyMajor.reduce((s, x) => s + x.count, 0);

    updateProgress('完成！', 100);
    await delay(200);

    const result = {
      summary: { totalRows, dateRange, storeCount: storeSet.size || null, routeCount: routeSet.size || null, warehouseCount: whSet.size || null, mainDistribution: distMap, missingFields },
      top3,
      categoryStats: { major: majorStats.slice(0, 15), mid: midStats.slice(0, 15), minor: minorStats.slice(0, 15) },
      qualityStats: { firstTimeResolutionY: ftrY, firstTimeResolutionN: ftrN, firstTimeResolutionNA: ftrNA, statusDist, unresolved },
      warnings,
      suggestions,
      issueKeywords,
      resultKeywords,
      monthlyReport: {
        total: monthlyTotal,
        categories: monthlyMajor,
        midCategories: midStats,
        dateRange,
        rawSample: rows.slice(0, 2000).map(r => {
          let issue = COL.issue ? String(r[COL.issue] || '') : '';
          const result = COL.result ? String(r[COL.result] || '') : '';

          // 若反應事項只有系統代碼（如[[訂購]]XXXXXXX）無文字描述
          // 嘗試從處理結果欄補充商品名稱
          const isCodeOnly = /^\s*(\[\[.+?\]\][\d,]+\s*)+\s*$/.test(issue);
          if (isCodeOnly && result) {
            // 從處理結果抓取商品名稱
            // 情況1：「已代訂，商品名稱」或「已代訂購，商品名稱」→ 取逗號後的名稱
            // 情況2：「商品名稱，已代訂」→ 取逗號前的名稱
            let productName = '';
            const afterComma = result.match(/已代訂購?[，,、](.+)/);
            const beforeComma = result.match(/^(.+)[，,、]已代訂/);
            const afterSpace  = result.match(/已代訂購?\s+(.+)/);
            if (afterComma) {
              productName = afterComma[1].replace(/\(.*\)/, '').replace(/\d{1,2}\/\d{1,2}.*/, '').trim();
            } else if (beforeComma) {
              productName = beforeComma[1].trim();
            } else if (afterSpace) {
              productName = afterSpace[1].replace(/\d{1,2}\/\d{1,2}.*/, '').trim();
            }
            if (productName.length > 2) {
              issue = `訂購${productName}`;
            } else {
              // fallback：處理結果本身有意義就直接用
              const cleanResult = result.replace(/\d{1,2}\/\d{1,2}[^\n]*/g,'').replace(/到店.*/,'').trim();
              if (cleanResult.length > 3 && !/^已代訂/.test(cleanResult)) {
                issue = cleanResult;
              }
            }
          }

          // 若反應事項含系統代碼又含文字，清除代碼只保留文字
          issue = issue.replace(/\[\[.+?\]\][\d,]+\s*/g, '').trim() || issue;

          return {
            major: COL.majorCat ? r[COL.majorCat] : '',
            mid:   COL.midCat   ? r[COL.midCat]   : '',
            minor: COL.minorCat ? r[COL.minorCat] : '',
            issue: issue,
            result: result,
            store: COL.store    ? r[COL.store]     : '',
          };
        })
      },
    };

    renderResults(result, checks);

  } catch (err) {
    stopProgress();
    loadingEl.style.display = 'none';
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '重新分析';
    showError('分析失敗：' + err.message);
  }
}

// ── Progress ─────────────────────────────────────────────
let _progressTimer = null;
function startProgress(msg) {
  progressFill.style.width = '0%';
  loadingText.textContent = msg || '正在解析資料結構...';
}
function updateProgress(msg, pct) {
  loadingText.textContent = msg;
  progressFill.style.width = pct + '%';
}
function stopProgress() {
  clearInterval(_progressTimer);
  progressFill.style.width = '100%';
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Render ────────────────────────────────────────────────
function renderResults(d, checks) {
  stopProgress();
  setTimeout(() => {
    loadingEl.style.display = 'none';
    resultsEl.style.display = 'block';
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '重新分析';

    if (checks[0]) renderSummary(d.summary, d.issueKeywords, d.resultKeywords);
    if (checks[1]) renderTop3(d.top3);
    if (checks[4]) renderWarnings(d.warnings);
    if (checks[5]) renderSuggestions(d.suggestions);
    if (checks[2] || checks[3]) renderStats(d.categoryStats, d.qualityStats, checks);
    renderMonthlyReport(d.monthlyReport);
    renderQuickAsks();
    switchTab('summary');
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

function renderSummary(s, issueKw, resultKw) {
  if (!s) return;
  document.getElementById('tab-summary').innerHTML = `
    <div class="metric-grid">
      <div class="metric-card"><div class="metric-label">總資料筆數</div><div class="metric-value">${(s.totalRows||0).toLocaleString()}</div></div>
      <div class="metric-card"><div class="metric-label">涉及店舖數</div><div class="metric-value">${s.storeCount || '—'}</div></div>
      <div class="metric-card"><div class="metric-label">路線數</div><div class="metric-value">${s.routeCount || '—'}</div></div>
      <div class="metric-card"><div class="metric-label">倉別數</div><div class="metric-value">${s.warehouseCount || '—'}</div></div>
    </div>
    <div class="r-card"><h3>日期範圍</h3><p style="font-size:0.93em;color:var(--ink)">${s.dateRange}</p></div>
    ${s.mainDistribution?.length ? `<div class="r-card"><h3>主要案件分布</h3>
      ${s.mainDistribution.map(x => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(14,14,14,0.06)">
        <span style="font-size:0.87em;flex:1;color:var(--ink)">${x.name}</span>
        <span style="font-size:0.87em;font-weight:500;font-family:var(--font-mono);color:var(--ink)">${x.count}</span>
      </div>`).join('')}</div>` : ''}
    ${issueKw?.length ? `<div class="r-card"><h3>反應事項高頻關鍵字</h3><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
      ${issueKw.map(k => `<span class="tag" style="font-size:0.8em">${k.word} <strong>${k.count}</strong></span>`).join('')}
    </div></div>` : ''}
    ${resultKw?.length ? `<div class="r-card"><h3>處理結果高頻關鍵字</h3><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
      ${resultKw.map(k => `<span class="tag" style="font-size:0.8em">${k.word} <strong>${k.count}</strong></span>`).join('')}
    </div></div>` : ''}
    ${s.missingFields?.length ? `<div class="r-card"><h3>建議補充欄位 <span class="badge badge-warn">可增加分析深度</span></h3>
      ${s.missingFields.map(f => `<span class="tag">${f}</span>`).join('')}</div>` : ''}
  `;
}

function renderTop3(top3) {
  if (!top3?.length) return;
  document.getElementById('tab-top3').innerHTML = `
    <div class="r-card"><h3>核心問題 TOP 3</h3>
      ${top3.map(t => `<div class="top3-item">
        <div class="rank-num">${t.rank}</div>
        <div class="rank-body">
          <div class="title">${t.title} <span class="badge badge-warn">${t.percentage}</span></div>
          <div class="desc">${t.description}</div>
        </div>
      </div>`).join('')}
    </div>`;
}

function renderWarnings(ws) {
  const el = document.getElementById('tab-warning');
  if (!ws?.length) { el.innerHTML = '<div class="r-card"><p style="font-size:0.93em;color:var(--ink-3)">未偵測到明顯異常。資料分布均勻，各店舖/路線件數無顯著偏差。</p></div>'; return; }
  const typeLabel = { store:'店舖', route:'路線', warehouse:'倉別', staff:'人員' };
  const sevBadge  = { high:'badge-danger', mid:'badge-warn', low:'badge-info' };
  const sevLabel  = { high:'高風險', mid:'注意', low:'觀察' };
  el.innerHTML = `<div class="r-card"><h3>異常預警清單</h3>
    ${ws.map(w => `<div class="warn-item">
      <div class="wt">[${typeLabel[w.type]||w.type}] ${w.target} — ${w.count} 件
        <span class="badge ${sevBadge[w.severity]||'badge-warn'}">${sevLabel[w.severity]||w.severity}</span>
      </div>
      <div class="wd">${w.issue}</div>
    </div>`).join('')}
  </div>`;
}

function renderSuggestions(sg) {
  if (!sg?.length) return;
  const priColor = {'高':'badge-danger','中':'badge-warn','低':'badge-info'};
  document.getElementById('tab-suggestion').innerHTML = `
    <div class="r-card"><h3>行動導向改善建議</h3>
      ${sg.map(s => `<div class="insight-item">
        <div class="it">${s.title} <span class="badge ${priColor[s.priority]||'badge-info'}">優先度：${s.priority}</span></div>
        <div class="id">${s.detail}</div>
      </div>`).join('')}
    </div>`;
}

function renderStats(cs, qs, checks) {
  let html = '';
  if (checks[2] && cs) {
    const renderCatTable = (arr, label) => {
      if (!arr?.length) return `<div class="r-card"><h3>${label}</h3><p style="font-size:0.87em;color:var(--ink-3)">未偵測到對應欄位。</p></div>`;
      const max = Math.max(...arr.map(x => x.count));
      return `<div class="r-card"><h3>${label}</h3>
        <table class="data-table">
          <thead><tr><th style="width:45%">類別</th><th style="width:18%">數量</th><th style="width:37%">佔比</th></tr></thead>
          <tbody>${arr.map(x => `<tr>
            <td>${x.name}</td>
            <td style="font-family:var(--font-mono)">${x.count}</td>
            <td><div class="bar-wrap"><div class="bar" style="width:${Math.round(x.count/max*80)}px"></div>
              <span class="bar-pct">${x.pct.toFixed(1)}%</span></div></td>
          </tr>`).join('')}</tbody>
        </table></div>`;
    };
    html += renderCatTable(cs.major, '大類別統計');
    html += renderCatTable(cs.mid,   '中類別統計');
    html += renderCatTable(cs.minor, '小類別統計');
  }
  if (checks[3] && qs) {
    const total = (qs.firstTimeResolutionY||0) + (qs.firstTimeResolutionN||0) + (qs.firstTimeResolutionNA||0);
    const ftrPct = total > 0 ? Math.round(qs.firstTimeResolutionY / total * 100) : 0;
    html += `<div class="r-card"><h3>時效與品質評估</h3>
      <div class="metric-grid" style="margin-bottom:1rem">
        <div class="metric-card"><div class="metric-label">一次解決 (Y)</div><div class="metric-value">${qs.firstTimeResolutionY||0}</div></div>
        <div class="metric-card"><div class="metric-label">非一次解決 (N)</div><div class="metric-value">${qs.firstTimeResolutionN||0}</div></div>
        <div class="metric-card"><div class="metric-label">一次解決率</div><div class="metric-value">${total > 0 ? ftrPct + '%' : '—'}</div></div>
      </div>
      ${qs.statusDist?.length ? `<table class="data-table">
        <thead><tr><th>處理狀態</th><th>數量</th><th>佔比</th></tr></thead>
        <tbody>${qs.statusDist.map(s => `<tr>
          <td>${s.name}</td>
          <td style="font-family:var(--font-mono)">${s.count}</td>
          <td style="font-family:var(--font-mono)">${s.pct.toFixed(1)}%</td>
        </tr>`).join('')}</tbody>
      </table>` : ''}
      ${qs.unresolved?.length ? `<div style="margin-top:1rem">
        <p style="font-size:0.8em;font-family:var(--font-mono);color:var(--ink-3);margin-bottom:8px">未結案 / 非結案件（前5筆）</p>
        ${qs.unresolved.map(u => `<div class="warn-item" style="margin-top:6px">
          <div class="wt">${u.id}</div><div class="wd">${u.issue}</div>
        </div>`).join('')}
      </div>` : ''}
    </div>`;
  }
  document.getElementById('tab-stats').innerHTML = html || '<div class="r-card"><p style="font-size:0.93em;color:var(--ink-3)">統計項目未選擇或資料不足。</p></div>';
}

function renderQuickAsks() {
  const qs = ['哪個店舖的異常件數最多？','一次解決率最低的問題類型是什麼？','最常見的反應事項關鍵字有哪些？','如何改善配送延遲問題？'];
  document.getElementById('quickAsks').innerHTML = qs.map(q => `
    <button class="qa-btn" onclick="copyQ('${q.replace(/'/g,"\\'")}')">
      ${q}
    </button>`).join('');
}
function copyQ(q) {
  navigator.clipboard.writeText(q).then(() => {
    alert('已複製問題，可貼上至 Claude.ai 等 AI 工具繼續深入分析。');
  }).catch(() => { prompt('複製以下問題：', q); });
}

// ── Monthly Report ────────────────────────────────────────
async function renderMonthlyReport(mr) {
  const el = document.getElementById('tab-monthly');
  if (!el) return;
  if (!mr || !mr.categories?.length) {
    el.innerHTML = '<div class="r-card"><p style="font-size:0.93em;color:var(--ink-3)">無法產生月報，請確認資料包含大類別欄位。</p></div>';
    return;
  }

  const total = mr.total || 1;

  // 表格 HTML
  const tableRows = mr.categories.map(c => {
    const pct = (c.count / total * 100).toFixed(0) + '%';
    return `<tr>
      <td style="text-align:left;padding:6px 10px">${c.name}</td>
      <td style="font-family:var(--font-mono);text-align:center">${c.count}</td>
      <td style="font-family:var(--font-mono);text-align:center;color:${c.pct >= 20 ? '#c53030' : 'inherit'};font-weight:${c.pct >= 20 ? '600' : '400'}">${c.pct.toFixed(0)}%</td>
      <td style="text-align:center;color:var(--ink-3);font-size:0.8em">—</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="r-card">
      <h3 style="margin-bottom:1rem">客服案件分析 <span style="font-size:0.8em;color:var(--ink-3);font-weight:400">— ${mr.dateRange}</span></h3>
      <table class="data-table" style="margin-bottom:1.5rem">
        <thead><tr>
          <th style="text-align:left">大類別</th>
          <th style="text-align:center">案件數</th>
          <th style="text-align:center">佔比</th>
          <th style="text-align:center">前月比</th>
        </tr></thead>
        <tbody>
          ${tableRows}
          <tr style="font-weight:600;border-top:2px solid var(--line)">
            <td style="text-align:left;padding:6px 10px">總計</td>
            <td style="font-family:var(--font-mono);text-align:center">${total.toLocaleString()}</td>
            <td style="font-family:var(--font-mono);text-align:center">100%</td>
            <td style="text-align:center">—</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:0.75em;color:var(--ink-3);margin-bottom:1.5rem">※筆數統計以立案件數計算</p>
      <div id="monthly-highlights">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:1rem">
          <span style="font-size:0.87em;font-weight:600">重點說明</span>
          <span class="badge badge-info">AI 產生中...</span>
        </div>
        <div id="monthly-highlights-content" style="font-size:0.87em;color:var(--ink-3)">正在分析資料，請稍候...</div>
      </div>
    </div>`;

  // 呼叫 Claude API 產生重點說明
  await generateMonthlyHighlights(mr);
}

async function generateMonthlyHighlights(mr) {
  const el = document.getElementById('monthly-highlights-content');
  const badgeEl = document.querySelector('#monthly-highlights .badge');
  if (!el) return;

  const GEMINI_URL = 'https://rz-scheduler-v2-587734217935.asia-east1.run.app/api/gemini';

  try {
    const total = mr.total || 1;
    const catSummary = mr.categories.map(c => `${c.name}：${c.count}件（${c.pct.toFixed(0)}%）`).join('、');
    const midSummary = mr.midCategories?.slice(0, 10).map(c => `${c.name}：${c.count}件`).join('、') || '';

    // ── 精準分析：按大類→小類→商品名稱統計實際筆數 ──────────
    const catDetail = {};
    mr.rawSample?.forEach(r => {
      if (!r.major || !r.issue) return;
      if (!catDetail[r.major]) catDetail[r.major] = {};
      const minor = r.minor || r.mid || '（未分類）';
      if (!catDetail[r.major][minor]) catDetail[r.major][minor] = [];
      catDetail[r.major][minor].push(String(r.issue).trim());
    });

    // 在每個小類中，統計相似案件（同商品）的筆數
    function groupByProduct(issues) {
      const groups = {};
      issues.forEach(iss => {
        // 取前20字作為分組key，過濾電話、日期等雜訊
        const key = iss
          .replace(/\d{10,}/g, '')        // 手機號碼
          .replace(/\d{1,2}\/\d{1,2}/g, '') // 日期
          .replace(/[，。！？()（）]/g, '')
          .trim()
          .slice(0, 20);
        if (key.length < 3) return;
        if (!groups[key]) groups[key] = { count: 0, sample: iss };
        groups[key].count++;
      });
      return Object.values(groups)
        .sort((a, b) => b.count - a.count)
        .slice(0, 4); // 每小類取前4個商品群組
    }

    // 格式化為 prompt 用的文字（前2大類，每類精準統計）
    const detailText = mr.categories.map(cat => {
      const minors = catDetail[cat.name] || {};
      const minorLines = Object.entries(minors)
        .sort((a,b)=>b[1].length-a[1].length)
        .slice(0, 3)
        .map(([name, issues]) => {
          const groups = groupByProduct(issues);
          const groupLines = groups
            .map(g => `    - ${g.sample.slice(0,60)}（${g.count}筆）`)
            .join('\n');
          return `  【${name}】共${issues.length}筆\n${groupLines}`;
        })
        .join('\n');
      return `【大類：${cat.name}】總計${cat.count}件（佔比${cat.pct.toFixed(0)}%）\n${minorLines}`;
    }).join('\n\n===\n\n');

    const sampleIssues = mr.rawSample
      ?.filter(r => r.issue)
      .slice(0, 50)
      .map(r => r.issue)
      .join('\n') || '';

    const prompt = `請將以下客服案件統計，整理成月報重點說明。只輸出純文字，不要程式碼。

範例格式：
1、「商品訂購」問題佔比21%：
①訂購一番賞落地陳列架，店鋪申請補發已代訂（217筆）。訂購BX-48隨機強化組，商品已無庫存（34筆）。
②退貨單0183581583單據未回，司機已收走商品要求確認入帳（42筆）。

2、「一般商品」問題佔比18%：
①4/20下架FMC紡織品，反應數量退錯或退貨單未回（28筆）。
②店鋪反應貨單KEY錯，要求協助修正帳務（21筆）。

統計資料：
${detailText}

輸出2大類重點說明（每類2小點，只輸出文字）:`;

    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error('Gemini Error:', JSON.stringify(data));
      throw new Error(`HTTP ${resp.status}: ${JSON.stringify(data)}`);
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) throw new Error('無回應');

    const html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n\n/g, '</p><p style="margin-top:0.75rem">')
      .replace(/\n/g, '<br>');

    el.innerHTML = `<div style="line-height:1.9;color:var(--ink)"><p>${html}</p></div>`;
    if (badgeEl) { badgeEl.textContent = 'AI 已產生'; badgeEl.className = 'badge badge-info'; }

  } catch (e) {
    // Gemini 失敗時退回純前端邏輯
    try {
      const top = mr.categories.slice(0, 3);
      const highlights = [];
      top.forEach((cat, idx) => {
        const map = {};
        mr.rawSample?.forEach(r => {
          if (r.major === cat.name) {
            const key = r.minor || r.mid || '（未分類）';
            map[key] = (map[key]||0)+1;
          }
        });
        const minorInCat = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,count])=>({name,count}));
        const pctStr = cat.pct.toFixed(0) + '%';
        let text = `${idx+1}、「${cat.name}」問題佔比${pctStr}（${cat.count}件）：\n`;
        if (minorInCat.length) minorInCat.forEach((m,mi)=>{ text += `${'①②③'[mi]||`(${mi+1})`}${m.name}（${m.count}筆）\n`; });
        else text += `①共${cat.count}筆，佔本月案件${pctStr}\n`;
        highlights.push(text.trim());
      });
      const html = highlights.map(h=>{
        const lines=h.split('\n');
        return `<div style="margin-bottom:1rem"><div style="font-weight:600;margin-bottom:4px">${lines[0]}</div>${lines.slice(1).map(l=>`<div style="padding-left:1em;color:var(--ink-2)">${l}</div>`).join('')}</div>`;
      }).join('');
      el.innerHTML = `<div style="line-height:1.9">${html}</div>`;
      if (badgeEl) { badgeEl.textContent = '自動產生'; badgeEl.className = 'badge badge-info'; }
    } catch {
      el.innerHTML = '<span style="color:var(--ink-3)">說明產生失敗。</span>';
      if (badgeEl) { badgeEl.textContent = '產生失敗'; badgeEl.className = 'badge badge-danger'; }
    }
  }
}

/* ══════════════════════════════════════════════════════
   日翊客服排班工具 app.js  v3.2
   前端 → GCP Cloud Run API → LP 求解 → 下載排班結果 xlsx
   v3.2 新增：
     - 頁面載入時靜默 ping 後端（喚醒 Cloud Run）
     - 求解逾時（120秒無回應）自動重試一次
══════════════════════════════════════════════════════ */

// ── GCP API 端點 ─────────────────────────────────────────
const API_URL    = 'https://rz-scheduler-v2-471942519278.asia-east1.run.app/api/schedule';
const HEALTH_URL = 'https://rz-scheduler-v2-471942519278.asia-east1.run.app/health';

// 第一次無回應超過此毫秒數時自動重試
const FIRST_ATTEMPT_TIMEOUT_MS = 120000; // 120 秒
const TOTAL_TIMEOUT_MS         = 300000; // 5 分鐘（最終 timeout）

/* ── DOM 安全取得 ──────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── 【新增】頁面載入時靜默喚醒後端 ─────────────────────
   不等待結果、不影響 UI，純粹讓 Cloud Run 保持熱機狀態  */
function warmupBackend() {
  fetch(HEALTH_URL, {
    method: 'GET',
    signal: AbortSignal.timeout(30000)
  }).catch(() => {/* 靜默忽略，喚醒失敗不影響使用者 */});
}

/* ── 上傳處理 ─────────────────────────────────────────── */
let uploadedFile = null;

function setupUpload() {
  const zone = $('zone');
  const fi   = $('fi');
  if (!zone || !fi) return;

  zone.addEventListener('click', () => fi.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fi.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
}

function handleFile(f) {
  if (!f.name.match(/\.xlsx?$/i)) { showErr('請上傳 .xlsx 格式的 Excel 班表'); return; }
  uploadedFile = f;
  if ($('fnm')) $('fnm').textContent = f.name;
  if ($('fsz')) $('fsz').textContent = fmtSz(f.size);
  if ($('fbar')) $('fbar').style.display = 'flex';
  hideErr();
  if ($('runBtn')) {
    $('runBtn').disabled = false;
    $('runBtn').textContent = '開始最佳化排班';
  }
}

function clrFile() {
  uploadedFile = null;
  if ($('fbar')) $('fbar').style.display = 'none';
  if ($('fi'))   $('fi').value = '';
  if ($('runBtn')) {
    $('runBtn').disabled = true;
    $('runBtn').textContent = '請上傳班表後開始排班';
  }
  if ($('resultBlock')) $('resultBlock').style.display = 'none';
  hideErr();
}

/* ── 【新增】單次 API 呼叫（帶獨立 timeout）──────────────── */
async function callScheduleAPI(file, timeoutMs) {
  const form = new FormData();
  form.append('file', file, file.name);
  return await fetch(API_URL, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(timeoutMs)
  });
}

/* ── 主流程：呼叫 GCP API ─────────────────────────────── */
function setupRunBtn() {
  const btn = $('runBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!uploadedFile) return;

    hideErr();
    setLoading(true);
    btn.disabled = true;
    btn.textContent = '求解中...';
    if ($('resultBlock')) $('resultBlock').style.display = 'none';
    setP('上傳班表至 GCP...', 20);

    try {
      setP('LP 最佳化求解中（約 30~90 秒）...', 40);

      let resp;
      try {
        // ── 第一次嘗試，120 秒 timeout ──────────────────
        resp = await callScheduleAPI(uploadedFile, FIRST_ATTEMPT_TIMEOUT_MS);
      } catch (firstErr) {
        // 第一次 timeout 或網路中斷 → 自動重試一次
        if (firstErr.name === 'TimeoutError' || firstErr.name === 'AbortError' ||
            firstErr.message.includes('Failed to fetch') || firstErr.message.includes('NetworkError')) {
          setP('伺服器喚醒中，自動重試...', 50);
          // 短暫等待 2 秒讓 Cloud Run 回穩
          await new Promise(r => setTimeout(r, 2000));
          setP('重試中，請稍候...', 55);
          // 第二次給完整 5 分鐘
          resp = await callScheduleAPI(uploadedFile, TOTAL_TIMEOUT_MS);
        } else {
          throw firstErr; // 其他錯誤直接拋出
        }
      }

      setP('接收結果...', 85);

      if (!resp.ok) {
        let errMsg = `伺服器錯誤 (${resp.status})`;
        try { const j = await resp.json(); errMsg = j.error || errMsg; } catch {}
        throw new Error(errMsg);
      }

      const blob  = await resp.blob();
      setP('完成！', 100);

      const mmdd  = getTodayMMDD();
      const fname = `排班結果_${mmdd}.xlsx`;
      const url   = URL.createObjectURL(blob);

      const dl = $('dlBtn');
      if (dl) { dl.href = url; dl.download = fname; }

      setLoading(false);
      if ($('resultBlock')) $('resultBlock').style.display = 'block';
      if ($('resultTitle')) $('resultTitle').textContent = `✓ 排班完成 — ${fname}`;
      if ($('resultBlock')) $('resultBlock').scrollIntoView({ behavior: 'smooth', block: 'start' });

      btn.disabled = false;
      btn.textContent = '重新排班';

    } catch (err) {
      setLoading(false);
      btn.disabled = false;
      btn.textContent = '重新排班';
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        showErr('求解超時（超過 5 分鐘），請稍後再試或聯繫管理員');
      } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        showErr('無法連線至排班伺服器，請確認網路連線或聯繫管理員');
      } else {
        showErr('排班失敗：' + err.message);
      }
    }
  });
}

/* ── 工具函式 ─────────────────────────────────────────── */
function fmtSz(b) {
  if (b < 1024)    return b + ' B';
  if (b < 1048576) return Math.round(b / 1024) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function getTodayMMDD() {
  const d = new Date();
  return String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
}
function showErr(m) {
  const e = $('err');
  if (e) { e.textContent = m; e.style.display = 'block'; }
}
function hideErr() {
  const e = $('err');
  if (e) e.style.display = 'none';
}
function setLoading(on) {
  const el = $('loading');
  if (el) el.style.display = on ? 'block' : 'none';
}
function setP(m, p) {
  const lt   = $('lt');
  const prog = $('prog');
  if (lt)   lt.textContent    = m;
  if (prog) prog.style.width  = p + '%';
}

/* ── 初始化 ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  warmupBackend(); // 頁面載入即靜默喚醒後端
  setupUpload();
  setupRunBtn();
});

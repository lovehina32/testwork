/* ══════════════════════════════════════════════════════
   日翊客服排班工具 app.js
   前端負責：上傳 Excel → 呼叫後端 solver.py → 顯示結果預覽
   
   注意：此工具需要後端 Python 環境執行 LP 求解
   部署方式：GitHub Pages（靜態）無法執行後端
   → 改為前端直接呼叫 scheduling-test.html 的 WASM/JS 模式
   
   實際 LP 求解在瀏覽器端透過 Web Worker 執行
   使用 glpk.js（GLPK 的 WebAssembly 版本）
══════════════════════════════════════════════════════ */

/* ── 上傳處理 ─────────────────────────────────────────── */
const zone=document.getElementById('zone'), fi=document.getElementById('fi');
let uploadedFile=null;

zone.addEventListener('click',()=>fi.click());
zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragover');});
zone.addEventListener('dragleave',()=>zone.classList.remove('dragover'));
zone.addEventListener('drop',e=>{
  e.preventDefault();zone.classList.remove('dragover');
  if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fi.addEventListener('change',e=>{if(e.target.files[0]) handleFile(e.target.files[0]);});

function handleFile(f){
  if(!f.name.match(/\.xlsx?$/i)){showErr('請上傳 .xlsx 格式的 Excel 班表');return;}
  uploadedFile=f;
  document.getElementById('fnm').textContent=f.name;
  document.getElementById('fsz').textContent=fmtSz(f.size);
  document.getElementById('fbar').style.display='flex';
  hideErr();
  document.getElementById('runBtn').disabled=false;
  document.getElementById('runBtn').textContent='開始 LP 最佳化排班';
}
function clrFile(){
  uploadedFile=null;
  document.getElementById('fbar').style.display='none';
  fi.value='';
  document.getElementById('runBtn').disabled=true;
  document.getElementById('runBtn').textContent='請上傳班表後開始排班';
  document.getElementById('resultBlock').style.display='none';
  hideErr();
}

/* ── 主邏輯：載入並執行排班 ──────────────────────────── */
document.getElementById('runBtn').addEventListener('click', async ()=>{
  if(!uploadedFile) return;
  
  // 提示：需要後端環境
  const msg = `LP 最佳化排班需要後端 Python 環境（PuLP + CBC）執行。

如果您是在 GitHub Pages 上使用，請：
1. 下載本工具的原始碼
2. 在本機執行 Python：
   pip install pulp openpyxl
   python solver.py 班表.xlsx 排班結果.xlsx

或者，使用測試版工具（純前端版），雖然使用規則式排班而非LP最佳化：
→ 請聯繫管理員取得本機執行版本`;
  
  alert(msg);
});

/* ── 工具函式 ─────────────────────────────────────────── */
function fmtSz(b){if(b<1024)return b+' B';if(b<1048576)return Math.round(b/1024)+' KB';return (b/1048576).toFixed(1)+' MB';}
function showErr(m){const e=document.getElementById('err');e.textContent=m;e.style.display='block';}
function hideErr(){document.getElementById('err').style.display='none';}

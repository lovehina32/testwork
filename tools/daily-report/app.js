
/* ════════════════════════════════════════════════
   分頁切換
════════════════════════════════════════════════ */
function switchTab(id, el){
  document.querySelectorAll('.dr-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.dr-panel').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('panel-'+id).classList.add('active');
}

/* ════════════════════════════════════════════════
   共用工具
════════════════════════════════════════════════ */
const fmtSz = b => b<1024?b+' B':b<1048576?Math.round(b/1024)+' KB':(b/1048576).toFixed(1)+' MB';
const extractMMDD = raw => { const s=String(raw).replace(/[^0-9]/g,''); return s.length>=4?s.slice(-4):'MMDD'; };
const isOff = v => v===undefined||v===null||String(v).trim()==='';

function showErr(id, m){ const e=document.getElementById(id+'-err'); e.textContent=m; e.style.display='block'; }
function hideErr(id){ document.getElementById(id+'-err').style.display='none'; }
function setP(id, m, p){ document.getElementById(id+'-lt').textContent=m; document.getElementById(id+'-prog').style.width=p+'%'; }

function parseReport(wb){
  const ws=wb.Sheets[wb.SheetNames[0]];
  const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
  let hdrRow=-1;
  for(let i=0;i<aoa.length;i++){
    const r=aoa[i].map(v=>String(v||'').trim());
    if(r.includes('日期')&&r.includes('時間')&&r.includes('店號')){hdrRow=i;break;}
  }
  if(hdrRow<0) throw new Error('找不到表頭列（需包含日期、時間、店號）');
  const hdrs=aoa[hdrRow].map(v=>String(v||'').trim());
  const rows=[];
  for(let i=hdrRow+1;i<aoa.length;i++){
    const row=aoa[i];
    if(!row.some(v=>v!==''&&v!==null)) continue;
    const obj={};
    hdrs.forEach((h,ci)=>{obj[h]=String(row[ci]??'').trim();});
    if(obj['時間']&&/^\d{2}:\d{2}:\d{2}$/.test(obj['時間'])) rows.push(obj);
  }
  return rows;
}

function setupDrop(prefix, onFileReady){
  const zone=document.getElementById(prefix+'-zone');
  const fi=document.getElementById(prefix+'-fi');
  zone.addEventListener('click',()=>fi.click());
  zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');if(e.dataTransfer.files[0])loadFile(prefix,e.dataTransfer.files[0],onFileReady);});
  fi.addEventListener('change',e=>{if(e.target.files[0])loadFile(prefix,e.target.files[0],onFileReady);});
}

function loadFile(prefix, f, onFileReady){
  if(!f.name.match(/\.xls[x]?$/i)){showErr(prefix,'請上傳 .xls 或 .xlsx 格式'); return;}
  document.getElementById(prefix+'-fnm').textContent=f.name;
  document.getElementById(prefix+'-fsz').textContent=fmtSz(f.size);
  document.getElementById(prefix+'-fbar').style.display='flex';
  hideErr(prefix);
  const rd=new FileReader();
  rd.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'binary',cellText:true,cellDates:false});
      onFileReady(wb);
    }catch(ex){showErr(prefix,'讀取失敗：'+ex.message);}
  };
  rd.readAsBinaryString(f);
}

/* ════════════════════════════════════════════════
   一般業務
════════════════════════════════════════════════ */
const GEN_OUT_COLS = ['項次','日期','時間','店號','店名','配別','路線','倉別',
                      '來電單號','反應事項','處理結果','案件屬性','大類別','中類別','小類別','處理狀態'];
const GEN_COL_W   = [4.25,7.875,7.5,6.5,11.25,5.625,6,5.625,12.625,37.125,39,8.875,11.75,10.125,11.125,9.375];
const GEN_CTR     = new Set([0,1,2,3,5,6,7,8,11,12,13,14,15]);
const CAT_ORDER   = ['POP','一般商品','其他','清潔','運務配送問題','預購店取','營收袋'];
const catRank     = v => { const i=CAT_ORDER.indexOf(v); return i>=0?i:999; };

let genWb = null;

setupDrop('gen', wb => {
  genWb = wb;
  document.getElementById('gen-runBtn').disabled=false;
  document.getElementById('gen-runBtn').textContent='開始產生一般業務日報';
});

function genClr(){
  genWb=null;
  document.getElementById('gen-fbar').style.display='none';
  document.getElementById('gen-fi').value='';
  document.getElementById('gen-runBtn').disabled=true;
  document.getElementById('gen-runBtn').textContent='請上傳報表後開始';
  document.getElementById('gen-result').style.display='none';
  hideErr('gen');
}

document.getElementById('gen-runBtn').addEventListener('click',()=>{
  if(!genWb) return;
  hideErr('gen');
  document.getElementById('gen-runBtn').disabled=true;
  document.getElementById('gen-runBtn').textContent='處理中...';
  document.getElementById('gen-loading').style.display='block';
  document.getElementById('gen-result').style.display='none';
  setP('gen','解析報表...',20);

  setTimeout(()=>{
    try{
      setP('gen','篩選 17 點前...',45);
      const all = parseReport(genWb);
      let rows = all.filter(r=>r['時間']<'17:00:00');

      setP('gen','排序中...',65);
      rows.sort((a,b)=>{
        const cr=catRank(a['大類別'])-catRank(b['大類別']);
        if(cr!==0) return cr;
        const cmp=(x,y)=>(x||'').localeCompare(y||'','zh-Hant');
        return cmp(a['中類別'],b['中類別'])||cmp(a['店號'],b['店號']);
      });

      setP('gen','產出 Excel...',82);
      const mmdd = extractMMDD(rows[0]?.['日期']||'');
      const title = `${mmdd}一般業務來電日報記錄(17點前)`;
      const blob  = buildGenExcel(rows, title);

      setP('gen','完成！',100);
      setTimeout(()=>{
        document.getElementById('gen-loading').style.display='none';
        document.getElementById('gen-result').style.display='block';
        document.getElementById('gen-rt').textContent=title;

        // 統計
        const cats={};
        rows.forEach(r=>{const k=r['大類別']||'(空)'; cats[k]=(cats[k]||0)+1;});
        document.getElementById('gen-stats').innerHTML=
          `<div class="stat-pill">日期 <strong>${mmdd}</strong></div>
           <div class="stat-pill">篩選後 <strong>${rows.length}</strong> 筆</div>`+
          Object.entries(cats).map(([k,v])=>
            `<div class="stat-pill"><strong>${k}</strong> ${v}</div>`).join('');

        const url=URL.createObjectURL(blob);
        const dl=document.getElementById('gen-dl');
        dl.href=url; dl.download=`${mmdd}一般業務來電日報記錄_17點前_.xlsx`;

        renderGenTable(rows.slice(0,50));
        document.getElementById('gen-result').scrollIntoView({behavior:'smooth',block:'start'});
        document.getElementById('gen-runBtn').disabled=false;
        document.getElementById('gen-runBtn').textContent='重新產生';
      },300);
    }catch(ex){
      document.getElementById('gen-loading').style.display='none';
      document.getElementById('gen-runBtn').disabled=false;
      document.getElementById('gen-runBtn').textContent='重新產生';
      showErr('gen','處理失敗：'+ex.message);
    }
  },80);
});

function buildGenExcel(rows, title){
  const wb2=XLSX.utils.book_new();
  const aoa=[[title,...Array(GEN_OUT_COLS.length-1).fill('')],[...GEN_OUT_COLS]];
  rows.forEach((r,i)=>{
    aoa.push(GEN_OUT_COLS.map(col=>col==='項次'?i+1:(r[col]||'')));
  });
  const ws2=XLSX.utils.aoa_to_sheet(aoa);
  ws2['!cols']=GEN_COL_W.map(w=>({wch:w}));
  ws2['!merges']=[{s:{r:0,c:0},e:{r:0,c:GEN_OUT_COLS.length-1}}];
  ws2['!rows']=[{hpt:22},{hpt:18},...rows.map(()=>({hpt:55}))];
  applyExcelStyle(ws2, GEN_OUT_COLS.length, rows.length, GEN_CTR, title);
  XLSX.utils.book_append_sheet(wb2,ws2,'一般業務');
  return new Blob([XLSX.write(wb2,{type:'array',bookType:'xlsx',cellStyles:true})],
    {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

function renderGenTable(rows){
  const ths=GEN_OUT_COLS.map(c=>`<th>${c}</th>`).join('');
  const trs=rows.map((r,i)=>`<tr>${GEN_OUT_COLS.map((col,ci)=>
    `<td class="${GEN_CTR.has(ci)?'ctr':''}">${col==='項次'?i+1:(r[col]||'')}</td>`
  ).join('')}</tr>`).join('');
  document.getElementById('gen-tbl').innerHTML=`<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

/* ════════════════════════════════════════════════
   EC業務
════════════════════════════════════════════════ */
const EC_OUT_COLS = ['項次','日期','時間','店號','店名','路線','倉別','來電單號',
                     '反應事項','處理結果','案件屬性','大類別','中類別','小類別','處理狀態'];
const EC_COL_W   = [4.625,8.75,8.625,7.625,14.625,5.625,5.625,13.125,40.25,36.875,9.375,9.875,11.125,10.125,9.375];
const EC_CTR     = new Set([0,1,2,3,5,6,7,10,11,12,13,14]);

let ecWb = null;

setupDrop('ec', wb => {
  ecWb = wb;
  document.getElementById('ec-runBtn').disabled=false;
  document.getElementById('ec-runBtn').textContent='開始產生 EC 業務日報';
});

function ecClr(){
  ecWb=null;
  document.getElementById('ec-fbar').style.display='none';
  document.getElementById('ec-fi').value='';
  document.getElementById('ec-runBtn').disabled=true;
  document.getElementById('ec-runBtn').textContent='請上傳報表後開始';
  document.getElementById('ec-result').style.display='none';
  hideErr('ec');
}

document.getElementById('ec-runBtn').addEventListener('click',()=>{
  if(!ecWb) return;
  hideErr('ec');
  document.getElementById('ec-runBtn').disabled=true;
  document.getElementById('ec-runBtn').textContent='處理中...';
  document.getElementById('ec-loading').style.display='block';
  document.getElementById('ec-result').style.display='none';
  setP('ec','解析報表...',15);

  setTimeout(()=>{
    try{
      const all=parseReport(ecWb);
      setP('ec','Step1 篩選店舖...',35);
      let shop=all.filter(r=>r['案件來源']==='店舖'&&r['時間']<'17:00:00');
      shop.sort((a,b)=>{
        const cmp=(x,y)=>(x||'').localeCompare(y||'','zh-Hant');
        return cmp(a['大類別'],b['大類別'])||cmp(a['中類別'],b['中類別'])||cmp(a['店號'],b['店號']);
      });

      setP('ec','Step2 篩選消費者...',60);
      let cust=all.filter(r=>r['案件來源']==='消費者'&&r['時間']<'17:00:00');
      cust=cust.map(r=>({...r,'店號':'消費者','店名':r['消費者姓名']||''}));
      cust.sort((a,b)=>{
        const cmp=(x,y)=>(x||'').localeCompare(y||'','zh-Hant');
        return cmp(a['大類別'],b['大類別'])||cmp(a['中類別'],b['中類別'])||cmp(a['案件屬性'],b['案件屬性']);
      });

      setP('ec','產出 Excel...',80);
      const combined=[...shop,...cust];
      const mmdd=extractMMDD(all[0]?.['日期']||'');
      const title=`${mmdd} EC業務來電日報記錄(17點前)`;
      const blob=buildEcExcel(combined, title);

      setP('ec','完成！',100);
      setTimeout(()=>{
        document.getElementById('ec-loading').style.display='none';
        document.getElementById('ec-result').style.display='block';
        document.getElementById('ec-rt').textContent=title;

        document.getElementById('ec-stats').innerHTML=
          `<div class="stat-pill">日期 <strong>${mmdd}</strong></div>
           <div class="stat-pill shop">店舖 <strong>${shop.length}</strong> 筆</div>
           <div class="stat-pill ec">消費者 <strong>${cust.length}</strong> 筆</div>
           <div class="stat-pill">合計 <strong>${combined.length}</strong> 筆</div>`;

        const url=URL.createObjectURL(blob);
        const dl=document.getElementById('ec-dl');
        dl.href=url; dl.download=`${mmdd} EC業務來電日報記錄_17點前_.xlsx`;

        renderEcTable('ec-tbl1', shop, 1, '');
        renderEcTable('ec-tbl2', cust, shop.length+1, 'cust-row');
        document.getElementById('ec-result').scrollIntoView({behavior:'smooth',block:'start'});
        document.getElementById('ec-runBtn').disabled=false;
        document.getElementById('ec-runBtn').textContent='重新產生';
      },300);
    }catch(ex){
      document.getElementById('ec-loading').style.display='none';
      document.getElementById('ec-runBtn').disabled=false;
      document.getElementById('ec-runBtn').textContent='重新產生';
      showErr('ec','處理失敗：'+ex.message);
    }
  },80);
});

function buildEcExcel(rows, title){
  const wb2=XLSX.utils.book_new();
  const aoa=[[title,...Array(EC_OUT_COLS.length-1).fill('')],[...EC_OUT_COLS]];
  rows.forEach((r,i)=>{
    aoa.push(EC_OUT_COLS.map(col=>col==='項次'?i+1:(r[col]||'')));
  });
  const ws2=XLSX.utils.aoa_to_sheet(aoa);
  ws2['!cols']=EC_COL_W.map(w=>({wch:w}));
  ws2['!merges']=[{s:{r:0,c:0},e:{r:0,c:EC_OUT_COLS.length-1}}];
  ws2['!rows']=[{hpt:22},{hpt:18},...rows.map(()=>({hpt:55}))];
  applyExcelStyle(ws2, EC_OUT_COLS.length, rows.length, EC_CTR, title);
  XLSX.utils.book_append_sheet(wb2,ws2,'一般業務');
  return new Blob([XLSX.write(wb2,{type:'array',bookType:'xlsx',cellStyles:true})],
    {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

function renderEcTable(id, rows, startIdx, rowClass){
  const ths=EC_OUT_COLS.map(c=>`<th>${c}</th>`).join('');
  const trs=rows.slice(0,100).map((r,i)=>`<tr class="${rowClass}">${EC_OUT_COLS.map((col,ci)=>
    `<td class="${EC_CTR.has(ci)?'ctr':''}">${col==='項次'?startIdx+i:(r[col]||'')}</td>`
  ).join('')}</tr>`).join('');
  document.getElementById(id).innerHTML=`<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

/* ════════════════════════════════════════════════
   共用 Excel 樣式
════════════════════════════════════════════════ */
function applyExcelStyle(ws, nCols, nRows, ctrSet, title){
  const bdr={top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}};
  // 標題列
  const a1=XLSX.utils.encode_cell({r:0,c:0});
  if(ws[a1]) ws[a1].s={
    font:{name:'微軟正黑體',sz:16,bold:true,color:{rgb:'FF0000'}},
    fill:{patternType:'solid',fgColor:{rgb:'FFFF00'}},
    alignment:{horizontal:'center',vertical:'center'}
  };
  // 表頭列
  for(let c=0;c<nCols;c++){
    const addr=XLSX.utils.encode_cell({r:1,c});
    if(ws[addr]) ws[addr].s={
      font:{name:'微軟正黑體',sz:10,bold:true},
      alignment:{horizontal:'center',vertical:'center',wrapText:true},
      border:bdr
    };
  }
  // 資料列
  for(let r=2;r<nRows+2;r++){
    for(let c=0;c<nCols;c++){
      const addr=XLSX.utils.encode_cell({r,c});
      if(!ws[addr]) continue;
      ws[addr].s={
        font:{name:'微軟正黑體',sz:10},
        alignment:{horizontal:ctrSet.has(c)?'center':'left',vertical:'center',wrapText:true},
        border:bdr
      };
    }
  }
}

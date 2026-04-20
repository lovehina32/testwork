/* ═══════════════════════════════════════════════════════
   日翊客服小工具 · 客服排班工具 · app.js
   
   排班邏輯（v6）：
   ─ Phase0：張語軒預先處理（固定班，不計入人數）
   ─ Phase1：每人每週補足 2 天休假（智慧分散，保護班位需求）
   ─ Phase2：班位池依序分配空白格（有人休假後面的人自動遞補）
   ─ Phase3：法規檢查（連班 / 碎班 / 週休不足）

   班位清單：
   一般完整（11個）：07~16, 07:30~16:30, 08~17×3, 09~18×2, 10~19, 11~20, 13~22, 14~23
   課會日（11個）：   07~16, 07:30~16:30, 08~17×3, 09~18×2, 10~19×2, 11~20, 14~23
   週末（4個）：      07~16, 09~18, 11~20, 14~23
   週一（9個）：      移除 1個08~17 + 10~19
   週二至五（8個）：  移除 1個08~17 + 1個09~18 + 10~19
══════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════
   班位清單
══════════════════════════════════════════════════════ */
const ALL_SHIFTS     = ['07~16','07:30~16:30','08~17','08~17','08~17','09~18','09~18','10~19','11~20','13~22','14~23'];
const MEETING_SHIFTS = ['07~16','07:30~16:30','08~17','08~17','08~17','09~18','09~18','10~19','10~19','11~20','14~23'];
const WEEKEND_SHIFTS = ['07~16','09~18','11~20','14~23'];

// 每日非張語軒最大休假人數（10人 - 需上班人數）
const MAX_OFF = { mon:1, weekday:2, weekend:6, meeting:0 };

function getPool(dtype, zhangWorks) {
  let p;
  if (dtype==='meeting')     p=[...MEETING_SHIFTS];
  else if (dtype==='mon')  { p=[...ALL_SHIFTS]; rmOne(p,'08~17'); rmOne(p,'10~19'); }
  else if (dtype==='weekday'){p=[...ALL_SHIFTS]; rmOne(p,'08~17'); rmOne(p,'09~18'); rmOne(p,'10~19');}
  else                       p=[...WEEKEND_SHIFTS];
  if (zhangWorks && p.includes('08~17')) rmOne(p,'08~17');
  return p;
}
function rmOne(arr, v) { const i=arr.indexOf(v); if(i>=0) arr.splice(i,1); }

/* ══════════════════════════════════════════════════════
   工具函式
══════════════════════════════════════════════════════ */
const OFF_W   = ['休','特','國','例休','例假','補休','生日假','喪假'];
const isOff   = v => OFF_W.some(o=>v&&String(v).includes(o));
const isEmpty = v => { const s=String(v==null?'':v).trim(); return !s||s==='undefined'||s==='null'; };

function getDtype(wd, sp) {
  if (sp&&sp.includes('課會')) return 'meeting';
  if (wd==='六'||wd==='日')    return 'weekend';
  if (wd==='一')               return 'mon';
  return 'weekday';
}

function gcv(ws,r,c){
  const cell=ws[XLSX.utils.encode_cell({r,c})];
  if(!cell) return '';
  if(cell.t==='d'||cell.v instanceof Date){
    const d=cell.v instanceof Date?cell.v:new Date((cell.v-25569)*86400*1000);
    return `${d.getMonth()+1}/${String(d.getDate()).padStart(2,'0')}`;
  }
  return String(cell.v==null?'':cell.v).split('\n')[0].trim();
}
function gcvRaw(ws,r,c){
  const cell=ws[XLSX.utils.encode_cell({r,c})];
  if(!cell||cell.v==null) return '';
  return String(cell.v).trim();
}

/* ══════════════════════════════════════════════════════
   解析工作表
══════════════════════════════════════════════════════ */
function parseWS(ws){
  const rng=XLSX.utils.decode_range(ws['!ref']), dbg=[];
  let hdrR=-1;
  for(let r=0;r<=Math.min(rng.e.r,10);r++){
    if(gcv(ws,r,0).includes('姓名')){hdrR=r;break;}
  }
  if(hdrR<0) throw new Error('找不到「姓名」欄位');
  dbg.push(`姓名列 Row${hdrR+1}`);

  let cS=-1,cE=-1;
  for(let c=1;c<=rng.e.c;c++){
    const cell=ws[XLSX.utils.encode_cell({r:hdrR,c})];
    if(!cell) continue;
    const isDate=cell.t==='d'||(cell.t==='n'&&typeof cell.v==='number'&&cell.v>40000&&cell.v<60000);
    if(isDate){if(cS<0)cS=c;cE=c;}
    else if(cS>=0) break;
  }
  if(cS<0) throw new Error('找不到日期欄位');
  dbg.push(`日期 col${cS}~${cE}（${cE-cS+1}天）`);

  const dates=[],weekdays=[],specials=[];
  for(let c=cS;c<=cE;c++){
    dates.push(gcv(ws,hdrR,c));
    weekdays.push(gcv(ws,hdrR+1,c));
    specials.push(gcv(ws,hdrR+2,c));
  }

  const persons=[];
  for(let r=hdrR+3;r<=hdrR+13&&r<=rng.e.r;r++){
    const raw=gcvRaw(ws,r,0);
    if(!raw) continue;
    const lines=raw.split('\n');
    const name=lines[0].trim();
    if(/出勤|總人數|國定休|注意/.test(name)) break;
    if(/^\d{1,2}[~:]/.test(name)) continue;
    const defaultShift=lines.length>1?lines[1].trim():'';
    const shifts=[];
    for(let c=cS;c<=cE;c++) shifts.push(gcv(ws,r,c));
    persons.push({name,defaultShift,shifts});
    dbg.push(`人員 Row${r+1}: ${name}[${defaultShift}]`);
  }
  if(!persons.length) throw new Error('找不到人員資料');
  return {dates,weekdays,specials,persons,_dbg:dbg};
}

/* ══════════════════════════════════════════════════════
   排班核心
   規則：
   1. 保留預排值
   2. 張語軒固定班，不計入人數
   3. Phase1：每人每週不足2天休假 → 智慧補休（分散，不超過當日容量）
   4. Phase2：班位池依序分配空白格（遞補）
   5. 法規：連上≤6天、禁上一休一
══════════════════════════════════════════════════════ */
function doSchedule(parsed){
  const {dates,weekdays,specials,persons}=parsed;
  const warnings=[], dbg=[];
  const rows=persons.map(p=>({
    name:p.name, defaultShift:p.defaultShift,
    shifts:[...p.shifts],
    isNew:Array(p.shifts.length).fill(false)
  }));
  const nDays=dates.length;

  // 找週一位置（週期起點）
  const weekStarts=[];
  for(let ci=0;ci<nDays;ci++){
    if(weekdays[ci]==='一') weekStarts.push(ci);
  }

  // 每日 dtype 快取
  const dtypes=dates.map((d,i)=>getDtype(weekdays[i],specials[i]));

  // 張語軒 index
  const zhangIdx=rows.findIndex(r=>r.name.includes('張語軒'));

  /* ── Phase0：張語軒預先處理 ── */
  for(let ci=0;ci<nDays;ci++){
    if(zhangIdx<0) break;
    if(!isEmpty(rows[zhangIdx].shifts[ci])) continue;
    rows[zhangIdx].shifts[ci] = dtypes[ci]==='weekend' ? '休' : '08~17';
    rows[zhangIdx].isNew[ci]  = true;
  }

  /* ── Phase1：每人每週補足2天休假（智慧分散，保護班位需求）── */
  // dailyOff：每日非張語軒已確定休假人數
  const dailyOff=Array(nDays).fill(0);
  for(let ci=0;ci<nDays;ci++){
    rows.forEach((r,pi)=>{
      if(pi===zhangIdx) return;
      if(isOff(r.shifts[ci])) dailyOff[ci]++;
    });
  }

  // needWork[ci]：當日（不含張語軒）最少需上班人數
  const needWork={meeting:10,mon:9,weekday:8,weekend:4};

  // canAddOff(ci)：若再加一人休假，剩餘空白格是否還能滿足需上班人數
  function canAddOff(ci){
    const dtype=dtypes[ci];
    if(dtype==='meeting') return false; // 課會日不排休
    const nw=needWork[dtype];
    // 當日非張語軒：已上班數 + 空白數（扣掉即將補休的1格）
    let alreadyWork=0, emptyCount=0;
    rows.forEach((r,pi)=>{
      if(pi===zhangIdx) return;
      const v=r.shifts[ci];
      if(!isEmpty(v)&&!isOff(v)) alreadyWork++;
      else if(isEmpty(v)) emptyCount++;
    });
    // 加1人休後，剩餘可工作格 = alreadyWork + (emptyCount-1)
    return (alreadyWork + emptyCount - 1) >= nw;
  }

  for(let wi=0;wi<weekStarts.length;wi++){
    const wStart=weekStarts[wi];
    const wEnd  =(wi+1<weekStarts.length ? weekStarts[wi+1]-1 : nDays-1);
    const wCis  =Array.from({length:wEnd-wStart+1},(_,i)=>wStart+i);

    rows.forEach((r,pi)=>{
      if(pi===zhangIdx) return;
      const existOff=wCis.filter(ci=>isOff(r.shifts[ci])).length;
      let needed=Math.max(0,2-existOff);
      if(needed===0) return;

      // 候選格：空白、且加休後不會破壞當日班位需求
      // 按 dailyOff 升序分散，優先平日後段
      const cands=wCis
        .filter(ci=>isEmpty(r.shifts[ci]) && canAddOff(ci))
        .sort((a,b)=>dailyOff[a]-dailyOff[b]||a-b);

      cands.forEach(ci=>{
        if(needed<=0) return;
        r.shifts[ci]='休'; r.isNew[ci]=true;
        dailyOff[ci]++; needed--;
      });

      if(needed>0) dbg.push(`⚠ ${r.name} 第${wi+1}週休假不足（僅${2-needed}天），班位需求優先`);
    });
  }

  /* ── Phase2：班位池依序分配空白格 ── */
  for(let ci=0;ci<nDays;ci++){
    const dtype=dtypes[ci];
    const zhangWorks = zhangIdx>=0 && !isOff(rows[zhangIdx].shifts[ci]) && !isEmpty(rows[zhangIdx].shifts[ci]);
    const pool=getPool(dtype, zhangWorks);

    // 移除已有預排班別
    rows.forEach((r,pi)=>{
      if(pi===zhangIdx) return;
      const v=r.shifts[ci];
      if(!isEmpty(v)&&!isOff(v)){const idx=pool.indexOf(v);if(idx>=0)pool.splice(idx,1);}
    });

    // 空白格依名單順序從池取班位
    rows.forEach((r,pi)=>{
      if(pi===zhangIdx) return;
      if(!isEmpty(r.shifts[ci])) return;
      if(pool.length>0){r.shifts[ci]=pool.shift();r.isNew[ci]=true;}
      else{r.shifts[ci]='休';r.isNew[ci]=true;}
    });

    const fw=rows.filter(r=>!isEmpty(r.shifts[ci])&&!isOff(r.shifts[ci])).length;
    const fo=rows.filter(r=>isOff(r.shifts[ci])).length;
    const exp={meeting:11,mon:9,weekday:8,weekend:4}[dtype];
    dbg.push(`${dates[ci]}(${weekdays[ci]}${specials[ci]?'/'+specials[ci]:''}) 上班:${fw}/${exp} 假:${fo}`);
  }

  /* ── Phase3：法規檢查 ── */
  if(document.getElementById('optC').checked){
    rows.forEach(r=>{
      // 連上超過6天
      let cons=0;
      for(let i=0;i<r.shifts.length;i++){
        if(!isOff(r.shifts[i])&&!isEmpty(r.shifts[i])){
          if(++cons>6) warnings.push(`【${r.name}】第${i-5}~${i+1}天連上${cons}天`);
        } else cons=0;
      }
      // 上一休一
      let zz=0;
      for(let i=1;i<r.shifts.length-1;i++){
        if(!isOff(r.shifts[i-1])&&!isEmpty(r.shifts[i-1])&&
            isOff(r.shifts[i])&&
           !isOff(r.shifts[i+1])&&!isEmpty(r.shifts[i+1])) zz++;
      }
      if(zz>=2) warnings.push(`【${r.name}】出現${zz}次「上一休一」碎班`);
      // 週休不足2天
      weekStarts.forEach((ws,wi)=>{
        const we=wi+1<weekStarts.length?weekStarts[wi+1]-1:nDays-1;
        const off=Array.from({length:we-ws+1},(_,i)=>ws+i).filter(ci=>isOff(r.shifts[ci])).length;
        if(off<2) warnings.push(`【${r.name}】第${wi+1}週休假不足2天（僅${off}天）`);
      });
    });
  }

  let tw=0,to=0;
  rows.forEach(r=>r.shifts.forEach(v=>{if(!isEmpty(v)&&!isOff(v))tw++;else if(isOff(v))to++;}));
  return{dates,weekdays,specials,rows,warnings,_dbg:dbg,
    stats:{totalDays:nDays,staffCount:rows.length,totalWork:tw,totalOff:to}};
}

/* ══════════════════════════════════════════════════════
   上傳 & 執行
══════════════════════════════════════════════════════ */
let wsData=null,output=null;
const zone=document.getElementById('zone'),fi=document.getElementById('fi');
zone.addEventListener('click',()=>fi.click());
zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag');});
zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');if(e.dataTransfer.files[0])loadFile(e.dataTransfer.files[0]);});
fi.addEventListener('change',e=>{if(e.target.files[0])loadFile(e.target.files[0]);});

function loadFile(f){
  document.getElementById('fnm').textContent=f.name;
  document.getElementById('fsz').textContent=fmtSz(f.size);
  document.getElementById('fbar').style.display='flex';
  hideErr();
  const rd=new FileReader();
  rd.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'binary',cellDates:true});
      wsData=wb.Sheets[wb.SheetNames[0]];
      document.getElementById('runBtn').disabled=false;
      document.getElementById('runBtn').textContent='開始自動排班';
    }catch(ex){showErr('讀取失敗：'+ex.message);}
  };
  rd.readAsBinaryString(f);
}
function clrFile(){
  wsData=null;
  document.getElementById('fbar').style.display='none';
  fi.value='';
  document.getElementById('runBtn').disabled=true;
  document.getElementById('runBtn').textContent='請上傳班表後開始排班';
  document.getElementById('result').style.display='none';
  document.getElementById('dbg').style.display='none';
}

document.getElementById('runBtn').addEventListener('click',()=>{
  if(!wsData) return;
  hideErr();
  document.getElementById('runBtn').disabled=true;
  document.getElementById('runBtn').textContent='排班中...';
  document.getElementById('loading').style.display='block';
  document.getElementById('result').style.display='none';
  document.getElementById('dbg').style.display='none';
  setP('解析班表...',20);
  setTimeout(()=>{
    try{
      setP('讀取儲存格...',35);
      const parsed=parseWS(wsData);
      if(document.getElementById('optD').checked){
        const d=document.getElementById('dbg');d.style.display='block';d.textContent=parsed._dbg.join('\n');
      }
      setP('Phase1 週休分配...',55);
      setP('Phase2 班位遞補...',70);
      output=doSchedule(parsed);
      if(document.getElementById('optD').checked){
        document.getElementById('dbg').textContent+='\n---\n'+output._dbg.join('\n');
      }
      setP('產出結果...',88);
      renderResult(output);
      setP('完成！',100);
      setTimeout(()=>{
        document.getElementById('loading').style.display='none';
        document.getElementById('result').style.display='block';
        document.getElementById('result').scrollIntoView({behavior:'smooth',block:'start'});
        document.getElementById('runBtn').disabled=false;
        document.getElementById('runBtn').textContent='重新排班';
      },300);
    }catch(ex){
      document.getElementById('loading').style.display='none';
      document.getElementById('runBtn').disabled=false;
      document.getElementById('runBtn').textContent='重新排班';
      showErr('排班失敗：'+ex.message);
    }
  },80);
});

/* ══════════════════════════════════════════════════════
   渲染 & 匯出
══════════════════════════════════════════════════════ */
function renderResult(d){
  const s=d.stats;
  document.getElementById('stats').innerHTML=
    `<div class="pill">排班天數 <strong>${s.totalDays}</strong></div>
     <div class="pill">人員數 <strong>${s.staffCount}</strong></div>
     <div class="pill">已填班位 <strong>${s.totalWork}</strong></div>
     <div class="pill">休假人次 <strong>${s.totalOff}</strong></div>`;

  const wb2=document.getElementById('warns');
  if(document.getElementById('optC').checked){
    wb2.innerHTML=d.warnings.length
      ?d.warnings.map(w=>`<div class="wb"><strong>⚠ </strong>${w}</div>`).join('')
      :`<div class="ob"><strong>✓ 法規檢查通過</strong></div>`;
  } else wb2.innerHTML='';

  const SPBG={'課會':'#ebf8ff','檔期':'#fef3c7'};
  const WKBG={'六':'#f0fdf4','日':'#f0fdf4'};

  const ths=d.dates.map((dt,i)=>{
    const w=d.weekdays[i],sp=d.specials[i];
    const bg=SPBG[sp]?`style="background:${SPBG[sp]}"`:WKBG[w]?`style="background:${WKBG[w]}"`:'' ;
    const badge=sp?`<br><span style="font-size:.62rem;color:#1a56db">${sp}</span>`:'';
    return `<th ${bg}>${dt}<br><span style="color:#9a9a9a;font-weight:400">${w}</span>${badge}</th>`;
  }).join('');

  const trs=d.rows.map(r=>{
    const cells=r.shifts.map((v,i)=>{
      const w=d.weekdays[i],sp=d.specials[i];
      const bg=SPBG[sp]?`style="background:${SPBG[sp]}"`:WKBG[w]?`style="background:#f9fafb"`:'';
      const cls=isOff(v)?'off':isEmpty(v)?'empty':r.isNew[i]?'new':'';
      return `<td class="${cls}" ${bg}>${v||'—'}</td>`;
    }).join('');
    return `<tr><td>${r.name}</td>${cells}</tr>`;
  }).join('');

  document.getElementById('tbl').innerHTML=
    `<table><thead><tr><th>姓名</th>${ths}</tr></thead><tbody>${trs}</tbody></table>`;

  const csv=[['姓名',...d.dates],...d.rows.map(r=>[r.name,...r.shifts])].map(r=>r.join(',')).join('\n');
  document.getElementById('raw').textContent=csv;
}

document.getElementById('expBtn').addEventListener('click',()=>{
  if(!output) return;
  const {dates,weekdays,specials,rows}=output;
  const wb3=XLSX.utils.book_new();
  const aoa=[['姓名',...dates],['星期',...weekdays],['備注',...specials],...rows.map(r=>[r.name,...r.shifts])];
  const ws3=XLSX.utils.aoa_to_sheet(aoa);
  ws3['!cols']=[{wch:10},...dates.map(()=>({wch:13}))];
  const rng=XLSX.utils.decode_range(ws3['!ref']||'A1');
  for(let C=rng.s.c;C<=rng.e.c;C++){
    const a=XLSX.utils.encode_cell({r:0,c:C});
    if(ws3[a])ws3[a].s={font:{bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'2D3748'}},alignment:{horizontal:'center'}};
  }
  for(let C=0;C<=rng.e.c;C++){
    const a=XLSX.utils.encode_cell({r:1,c:C});
    if(ws3[a])ws3[a].s={fill:{fgColor:{rgb:'EDF2F7'}},alignment:{horizontal:'center'},font:{color:{rgb:'4A5568'}}};
  }
  for(let R=3;R<=rng.e.r;R++) for(let C=0;C<=rng.e.c;C++){
    const a=XLSX.utils.encode_cell({r:R,c:C});
    if(!ws3[a]) continue;
    const val=String(ws3[a].v||'');
    ws3[a].s={
      alignment:{horizontal:C===0?'left':'center',vertical:'center'},
      font:isOff(val)?{bold:true,color:{rgb:'C53030'}}:{color:{rgb:C===0?'2D3748':'1A202C'}},
      fill:{fgColor:{rgb:isOff(val)?'FFF5F5':R%2===0?'F7FAFC':'FFFFFF'}}
    };
  }
  XLSX.utils.book_append_sheet(wb3,ws3,'排班表');
  const now=new Date();
  XLSX.writeFile(wb3,`排班表_${now.getFullYear()}${p2(now.getMonth()+1)}${p2(now.getDate())}.xlsx`);
});

function p2(n){return String(n).padStart(2,'0');}
function fmtSz(b){if(b<1024)return b+' B';if(b<1048576)return Math.round(b/1024)+' KB';return (b/1048576).toFixed(1)+' MB';}
function showErr(m){const e=document.getElementById('err');e.textContent=m;e.style.display='block';}
function hideErr(){document.getElementById('err').style.display='none';}
function setP(m,p){document.getElementById('lt').textContent=m;document.getElementById('prog').style.width=p+'%';}

import fs from 'node:fs';
const [catPath, outPath] = process.argv.slice(2);
const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
const items = cat.items.map(i => ({ id: i.id, name: i.name, area: i.area, about: i.about, hours: i.hours, side: i.sideTrip, when: i.when, fee: i.fee, warn: i.warn || '', book: i.book || '', photo: i.photo || '', credit: i.credit || '', g: i.google || null }));
const html = `<title>Trip Picker Shortlist</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap">
<style>
/* Layout: one column of activity rows grouped by area, a sticky tally bar on top. */
:root{--bg:#EEF0F2;--surface:#FFFFFF;--ink:#101418;--muted:#5D6670;--line:#D9DEE3;--coconut:#FF7A1A;--tea:#0B5D3B;--cut:#C2362B;--font:"Archivo",system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0B0E11;--surface:#161A1F;--ink:#EEF1F4;--muted:#98A2AD;--line:#2A3138;--coconut:#FF8A33;--tea:#3DBE86;--cut:#F0675B;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0B0E11;--surface:#161A1F;--ink:#EEF1F4;--muted:#98A2AD;--line:#2A3138;--coconut:#FF8A33;--tea:#3DBE86;--cut:#F0675B;color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--font);font-size:15px;line-height:1.45;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:24px 64px}
.wrap{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
h1{margin:0;font-size:clamp(28px,5vw,40px);font-weight:850;font-stretch:120%;line-height:1.05}
.lede{margin:6px 0 0;color:var(--muted);max-width:56ch}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:2;background:var(--bg);padding:10px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.bar b{font-variant-numeric:tabular-nums}
.bar .sp{flex:1}
button{font:inherit;color:inherit}
.copy{all:unset;cursor:pointer;padding:10px 14px;border-radius:12px;background:var(--ink);color:var(--surface);font-weight:700}
.copy:focus-visible,.tg:focus-visible{outline:2px solid var(--coconut);outline-offset:2px}
.copied{color:var(--tea);font-weight:600}
h2{margin:14px 0 0;font-size:20px;font-weight:800;font-stretch:112%}
.row{display:grid;grid-template-columns:120px minmax(0,1fr);gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.row.cut{opacity:.5}
.ph{background:var(--line) center/cover no-repeat;min-height:120px}
.noph{display:grid;place-items:center;color:var(--muted);font-size:12px;text-align:center;padding:8px}
.info{padding:12px 14px 12px 0;display:flex;flex-direction:column;gap:5px;min-width:0}
.top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.nm{font-weight:800;font-size:16px;line-height:1.2}
.facts,.cred{color:var(--muted);font-size:13px}
.cred{font-size:11px}
.warn b{color:var(--cut)}
.g a{color:var(--ink)}
.tg{all:unset;cursor:pointer;flex:none;padding:6px 12px;border-radius:99px;font-weight:700;font-size:13px;box-shadow:inset 0 0 0 1.5px var(--line)}
.tg[aria-pressed="false"]{color:var(--tea);box-shadow:inset 0 0 0 1.5px var(--tea)}
.tg[aria-pressed="true"]{color:var(--cut);box-shadow:inset 0 0 0 1.5px var(--cut)}
@media (max-width:520px){.row{grid-template-columns:1fr}.ph{min-height:170px}.info{padding:0 14px 14px}}
</style>
<div class="wrap">
  <header>
    <h1>The shortlist</h1>
    <p class="lede">All 37 activities the friends will rate. Tap Cut on anything that shouldn't make it, then copy your list and paste it to Claude. Your taps are remembered on this device.</p>
  </header>
  <div class="bar"><span><b id="kept">37</b> kept, <b id="cutn">0</b> cut</span><span class="sp"></span><span id="msg" class="copied" aria-live="polite"></span><button class="copy" id="copy">Copy my list</button></div>
  <div id="list"></div>
  <textarea id="fallback" hidden aria-label="Your list" style="width:100%;min-height:90px"></textarea>
</div>
<script>
const ITEMS=${JSON.stringify(items)};
const AREAS=${JSON.stringify(cat.areas)};
let cut=new Set();try{cut=new Set(JSON.parse(localStorage.getItem('shortlist-cut')||'[]'))}catch(e){}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const h=n=>{const t=Math.round(n*2)/2;return t>=1?t+' h':Math.round(n*60)+' min'};
function render(){
  document.getElementById('list').innerHTML=AREAS.map(a=>{const its=ITEMS.filter(i=>i.area===a);if(!its.length)return'';
    return '<h2>'+esc(a)+'</h2>'+its.map(i=>{const c=cut.has(i.id);
      const ph=i.photo?'<div class="ph" style="background-image:url(img/'+i.photo+'.jpg)" role="img" aria-label="'+esc(i.name)+'"></div>':'<div class="ph noph">Photo needed</div>';
      return '<div class="row'+(c?' cut':'')+'" style="margin-top:10px">'+ph+'<div class="info"><div class="top"><span class="nm">'+esc(i.name)+'</span><button class="tg" data-id="'+i.id+'" aria-pressed="'+c+'">'+(c?'Cut':'Keep')+'</button></div>'
        +'<div>'+esc(i.about)+'</div>'
        +'<div class="facts">'+esc(i.when)+' · '+h(i.hours)+(i.side?' plus '+h(i.side)+' getting there and back':'')+' · '+esc(i.fee)+'</div>'
        +(i.warn?'<div class="warn"><b>Heads up:</b> '+esc(i.warn)+'</div>':'')
        +(i.book?'<div class="facts">Book: '+esc(i.book)+'</div>':'')
        +(i.g?'<div class="g">★ '+esc(i.g.rating)+' on Google ('+esc(i.g.reviews)+') · <a href="'+esc(i.g.url)+'" target="_blank" rel="noopener">open listing</a></div>':'')
        +(i.credit?'<div class="cred">Photo: '+esc(i.credit)+'</div>':'')
        +'</div></div>'}).join('')}).join('');
  document.getElementById('kept').textContent=ITEMS.length-cut.size;document.getElementById('cutn').textContent=cut.size;
}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.id){cut.has(b.dataset.id)?cut.delete(b.dataset.id):cut.add(b.dataset.id);try{localStorage.setItem('shortlist-cut',JSON.stringify([...cut]))}catch(e){}render();return}
  if(b.id==='copy'){const names=ITEMS.filter(i=>cut.has(i.id)).map(i=>i.name);const text=names.length?'Cut these: '+names.join('; '):'Keep all 37.';
    const msg=document.getElementById('msg');try{await navigator.clipboard.writeText(text);msg.textContent='Copied'}catch(err){const f=document.getElementById('fallback');f.hidden=false;f.value=text;f.select();msg.textContent='Select and copy the text below'}}
});
render();
</script>`;
fs.writeFileSync(outPath, html);
console.log('items', items.length, 'bytes', html.length);

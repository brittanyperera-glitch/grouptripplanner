// Builds the shortlist page Brittany uses to keep/remove activities and write her take on each.
// Usage: node scripts/make-shortlist.mjs src/data/catalogue.json docs/curation/shortlist.html
// Choices save to the artifact's db (collection "picks", one doc per item id); localStorage is the fallback.
import fs from 'node:fs';
const [catPath, outPath] = process.argv.slice(2);
const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
const LOCATION = {
  pettah: 'Pettah, Colombo', foodtour: 'Colombo', galleface: 'Galle Face, Colombo', crab: 'Old Dutch Hospital, Colombo Fort',
  gangaramaya: 'Beira Lake, Colombo', bawa: 'Colombo 3', rooftop: 'Colombo', lavinia: 'Mount Lavinia, south of Colombo',
  kottu: 'Wellawatte, Colombo', sigiriya: 'Sigiriya', pidurangala: 'Sigiriya', dambulla: 'Dambulla, 35 min from Sigiriya',
  polonnaruwa: 'Polonnaruwa, 1 h 20 from Sigiriya', elephants: 'Kaudulla or Hurulu, near Habarana', anuradhapura: 'Anuradhapura, 1 h 30 from Sigiriya',
  village: 'Hiriwadunna, near Habarana', tooth: 'Kandy', knuckles: 'Riverston, Knuckles range, 2 h 30 from Kandy',
  rafting: 'Kitulgala, Kelani river', train: 'Nanu Oya to Ella', horton: 'Horton Plains, 1 h 10 from Nuwara Eliya',
  tea: 'Near Nuwara Eliya', ellarock: 'Ella', littleadams: 'Ella', ninearch: 'Demodara, Ella', zipline: 'Ella',
  diyaluma: 'Koslanda, 1 h 15 from Ella', lipton: 'Haputale, 1 h 15 from Ella', yala: 'Yala, 40 min from Tissamaharama',
  udawalawe: 'Udawalawe', surf: 'Weligama bay', whales: 'Mirissa harbour, 15 min from Weligama', galle: 'Galle Fort, 45 min from Weligama',
  coconut: 'Mirissa', hiriketiya: 'Hiriketiya, near Dickwella, 1 h from Weligama', junglebeach: 'Unawatuna, 45 min from Weligama',
  beachday: 'South coast, Weligama or Mirissa',
};
const missing = cat.items.filter(i => !LOCATION[i.id]).map(i => i.id);
if (missing.length) throw new Error('no location for: ' + missing.join(', '));
const items = cat.items.map(i => ({ id: i.id, name: i.name, area: i.area, loc: LOCATION[i.id], about: i.about, hours: i.hours, side: i.sideTrip, when: i.when, fee: i.fee, warn: i.warn || '', book: i.book || '', photo: i.photo || '', credit: i.credit || '', g: i.google || null }));

const html = `<title>Trip Picker Shortlist</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap">
<style>
/* Layout: one column of activity cards grouped by area, a sticky tally bar on top. */
:root{--bg:#EEF0F2;--surface:#FFFFFF;--ink:#101418;--muted:#5D6670;--line:#D9DEE3;--tea:#0B5D3B;--cut:#B3261E;--accent:#B34700;--font:"Archivo",system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0B0E11;--surface:#161A1F;--ink:#EEF1F4;--muted:#98A2AD;--line:#2A3138;--tea:#3DBE86;--cut:#F0675B;--accent:#FF8A33;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0B0E11;--surface:#161A1F;--ink:#EEF1F4;--muted:#98A2AD;--line:#2A3138;--tea:#3DBE86;--cut:#F0675B;--accent:#FF8A33;color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--font);font-size:15px;line-height:1.45;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:24px 64px}
.wrap{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
h1{margin:0;font-size:clamp(28px,5vw,40px);font-weight:850;font-stretch:120%;line-height:1.05}
.lede{margin:6px 0 0;color:var(--muted);max-width:56ch}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:2;background:var(--bg);padding:10px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.bar b{font-variant-numeric:tabular-nums}
.bar .sp{flex:1}
button,textarea{font:inherit;color:inherit}
.copy{all:unset;cursor:pointer;padding:10px 14px;border-radius:12px;box-shadow:inset 0 0 0 1.5px var(--line);font-weight:700}
.saved{color:var(--muted);font-size:13px}
h2{margin:16px 0 0;font-size:20px;font-weight:800;font-stretch:112%}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:grid;grid-template-columns:130px minmax(0,1fr);margin-top:10px}
.card.removed{opacity:.55}
.ph{background:var(--line) center/cover no-repeat;min-height:130px}
.noph{display:grid;place-items:center;color:var(--muted);font-size:12px;text-align:center;padding:8px}
.info{padding:12px 14px;display:flex;flex-direction:column;gap:5px;min-width:0}
.nm{font-weight:800;font-size:16px;line-height:1.2}
.loc{font-size:13px;font-weight:600;color:var(--accent)}
.loc a{color:inherit}
.facts,.cred{color:var(--muted);font-size:13px}
.cred{font-size:11px}
.warn b{color:var(--cut)}
.g a{color:var(--ink)}
.choice{display:flex;gap:8px;margin-top:6px}
.choice button{all:unset;cursor:pointer;padding:8px 16px;border-radius:99px;font-weight:700;font-size:14px;box-shadow:inset 0 0 0 1.5px var(--line)}
.choice button:focus-visible,.copy:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.choice .k[aria-pressed="true"]{background:var(--tea);color:var(--surface);box-shadow:none}
.choice .r[aria-pressed="true"]{background:var(--cut);color:var(--surface);box-shadow:none}
textarea{width:100%;min-height:64px;border:1.5px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--bg);resize:vertical}
.tl{font-size:12px;color:var(--muted)}
@media (max-width:540px){.card{grid-template-columns:1fr}.ph{min-height:170px}}
</style>
<div class="wrap">
  <header>
    <h1>The shortlist</h1>
    <p class="lede">All 37 activities the friends will rate. Keep or remove each one. For the ones you keep, write what you want the others to read on that card. Everything saves as you go.</p>
  </header>
  <div class="bar"><span><b id="done">0</b> of ${items.length} decided · <b id="kept">0</b> kept</span><span class="sp"></span><span id="msg" class="saved" aria-live="polite"></span><button class="copy" id="copy">Copy my list</button></div>
  <div id="list"></div>
  <textarea id="fallback" hidden aria-label="Your list" style="min-height:120px"></textarea>
</div>
<script>
const ITEMS=${JSON.stringify(items)};
const AREAS=${JSON.stringify(cat.areas)};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const h=n=>{const t=Math.round(n*2)/2;return t>=1?t+' h':Math.round(n*60)+' min'};
let picks={};let db=null;
try{picks=JSON.parse(localStorage.getItem('shortlist-picks')||'{}')}catch(e){}
const msg=t=>{document.getElementById('msg').textContent=t};
function card(i){const p=picks[i.id]||{};const k=p.keep===true,r=p.keep===false;
  const ph=i.photo?'<div class="ph" style="background-image:url(img/'+i.photo+'.jpg)" role="img" aria-label="'+esc(i.name)+'"></div>':'<div class="ph noph">Photo needed</div>';
  return '<div class="card'+(r?' removed':'')+'" id="c-'+i.id+'">'+ph+'<div class="info">'
    +'<span class="nm">'+esc(i.name)+'</span>'
    +'<span class="loc">'+esc(i.loc)+(i.g?' · <a href="'+esc(i.g.url)+'" target="_blank" rel="noopener">map</a>':'')+'</span>'
    +'<div>'+esc(i.about)+'</div>'
    +'<div class="facts">'+esc(i.when)+' · '+h(i.hours)+(i.side?' plus '+h(i.side)+' there and back':'')+' · '+esc(i.fee)+'</div>'
    +(i.warn?'<div class="warn"><b>Heads up:</b> '+esc(i.warn)+'</div>':'')
    +(i.g?'<div class="g">★ '+esc(i.g.rating)+' on Google ('+esc(i.g.reviews)+')</div>':'')
    +(i.credit?'<div class="cred">Photo: '+esc(i.credit)+'</div>':'')
    +'<div class="choice"><button class="k" data-id="'+i.id+'" data-keep="1" aria-pressed="'+k+'">Keep</button><button class="r" data-id="'+i.id+'" data-keep="0" aria-pressed="'+r+'">Remove</button></div>'
    +(k?'<label class="tl" for="t-'+i.id+'">Your message on this card</label><textarea id="t-'+i.id+'" data-take="'+i.id+'" placeholder="What should the others know about this one?">'+esc(p.take||'')+'</textarea>':'')
    +'</div></div>'}
function render(){
  document.getElementById('list').innerHTML=AREAS.map(a=>{const its=ITEMS.filter(i=>i.area===a);return its.length?'<h2>'+esc(a)+'</h2>'+its.map(card).join(''):''}).join('');
  tally();
}
function tally(){const v=Object.values(picks);document.getElementById('done').textContent=v.filter(p=>p.keep===true||p.keep===false).length;document.getElementById('kept').textContent=v.filter(p=>p.keep===true).length}
function local(){try{localStorage.setItem('shortlist-picks',JSON.stringify(picks))}catch(e){}}
async function save(id){local();if(!db){msg('Saved on this device');return}
  try{await db.doc('picks/'+id).set({keep:picks[id].keep,take:picks[id].take||'',at:new Date().toISOString()});msg('Saved')}
  catch(e){msg('Not saved to the page, kept on this device')}}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.id){const id=b.dataset.id,keep=b.dataset.keep==='1';const cur=picks[id]||{};
    picks[id]={...cur,keep:cur.keep===keep?null:keep};render();await save(id);
    if(picks[id].keep===true){const t=document.getElementById('t-'+id);if(t)t.focus()}return}
  if(b.id==='copy'){const lines=ITEMS.map(i=>{const p=picks[i.id]||{};return p.keep===true?'KEEP '+i.name+(p.take?': '+p.take:''):p.keep===false?'REMOVE '+i.name:'UNDECIDED '+i.name});
    const text=lines.join('\\n');try{await navigator.clipboard.writeText(text);msg('Copied')}catch(err){const f=document.getElementById('fallback');f.hidden=false;f.value=text;f.select();msg('Select and copy the text below')}}
});
const timers={};
document.addEventListener('input',e=>{const id=e.target.dataset&&e.target.dataset.take;if(!id)return;
  picks[id]={...(picks[id]||{}),take:e.target.value};msg('Saving');clearTimeout(timers[id]);timers[id]=setTimeout(()=>save(id),700)});
render();
(async()=>{try{db=await window.claude?.use('db')}catch(e){db=null}
  if(!db){msg('Saving on this device');return}
  db.collection('picks').onSnapshot(s=>{let changed=false;for(const d of s.docs){const v=d.data();if(!v)continue;const cur=picks[d.id]||{};
      if(cur.keep!==v.keep||(cur.take||'')!==(v.take||'')){
        const focused=document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.take===d.id;
        picks[d.id]=focused?{...cur,keep:v.keep}:{keep:v.keep,take:v.take||''};changed=true}}
    if(changed){local();const a=document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.take;render();if(a){const t=document.getElementById('t-'+a);if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length)}}}},
    ()=>msg('Saving on this device'));
})();
</script>`;
fs.writeFileSync(outPath, html);
console.log('items', items.length, 'bytes', html.length);

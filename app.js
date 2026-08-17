(function(){
"use strict";
const KEY="painel-semanal-v1";
const uid=()=> (crypto.randomUUID?crypto.randomUUID():"id"+Math.random().toString(36).slice(2)+Date.now().toString(36));
const $=(s,r)=> (r||document).querySelector(s);
const $$=(s,r)=> Array.from((r||document).querySelectorAll(s));
const esc=s=> String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- links ---------- */
// Só http e https entram: um "javascript:" colado aqui viraria código rodando no clique.
// Sem esquema, assume https — ninguém digita o prefixo à mão.
function normUrl(v){
  v=(v||"").trim();
  if(!v) return null;
  if(!/^[a-z][a-z0-9+.-]*:/i.test(v)) v="https://"+v;
  try{
    const u=new URL(v);
    if(u.protocol!=="http:"&&u.protocol!=="https:") return false;
    return u.href;
  }catch(e){ return false; }
}
function urlLabel(u){
  try{
    const x=new URL(u);
    const h=x.hostname.replace(/^www\./,"");
    return h+((x.pathname&&x.pathname!=="/")||x.search?" ›":"");
  }catch(e){ return u; }
}

/* ---------- semanas ISO ---------- */
function isoKey(d){
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=t.getUTCDay()||7; t.setUTCDate(t.getUTCDate()+4-day);
  const y=t.getUTCFullYear();
  const wk=Math.ceil(((t-Date.UTC(y,0,1))/864e5+1)/7);
  return y+"-W"+String(wk).padStart(2,"0");
}
function keyMonday(key){
  const [y,w]=key.split("-W").map(Number);
  const jan4=new Date(Date.UTC(y,0,4));
  const day=jan4.getUTCDay()||7;
  const mon=new Date(jan4); mon.setUTCDate(jan4.getUTCDate()-day+1+(w-1)*7);
  return mon;
}
function shiftKey(key,n){ const m=keyMonday(key); m.setUTCDate(m.getUTCDate()+n*7); return isoKey(new Date(m.getUTCFullYear(),m.getUTCMonth(),m.getUTCDate())); }
const MES=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const DIAS=["seg","ter","qua","qui","sex","sáb","dom"];
function rangeLabel(key){
  const a=keyMonday(key), b=new Date(a); b.setUTCDate(a.getUTCDate()+6);
  const f=d=> d.getUTCDate()+" "+MES[d.getUTCMonth()];
  return f(a)+" – "+f(b)+" de "+b.getUTCFullYear();
}
const todayKey=()=> isoKey(new Date());

/* ---------- estado ---------- */
const DEFAULT={
  version:1,
  settings:{theme:"auto",goal:75,partial:50,tempoMedio:30,tempoAlto:120,pushPenalty:true,pushBonus:15,lembrete:"",lembreteFreq:"dia",hideDone:false,hideDoneSubs:{},folded:{},foldedSubs:{},agendaDay:null,agendaFold:false,agendaSub:null},
  areas:[
    {id:"a1",name:"Vida pessoal",tone:"personal",subs:[
      {id:"s11",name:"Saúde financeira"},{id:"s12",name:"Saúde física"},
      {id:"s13",name:"Saúde domiciliar"},{id:"s14",name:"Hobbies"}]},
    {id:"a2",name:"Vida profissional",tone:"pro",subs:[
      {id:"s21",name:"Tese PPGCP"},{id:"s22",name:"Trabalho S&C"},
      {id:"s23",name:"Pesquisador"},{id:"s24",name:"Idiomas"}]}
  ],
  habits:[],
  weeks:{},
  trash:[]
};
let S=load(), cur=todayKey(), query="";

function load(){
  try{
    const raw=localStorage.getItem(KEY);
    if(!raw) return structuredClone(DEFAULT);
    const p=JSON.parse(raw);
    const s=Object.assign(structuredClone(DEFAULT),p,{settings:Object.assign({},DEFAULT.settings,p.settings||{})});
    s.settings.folded=s.settings.folded||{};
    s.settings.foldedSubs=s.settings.foldedSubs||{};
    s.settings.hideDoneSubs=s.settings.hideDoneSubs||{};
    return s;
  }catch(e){ return structuredClone(DEFAULT); }
}
let saveT;
function save(){ clearTimeout(saveT); saveT=setTimeout(()=>{ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){ toast("Não foi possível salvar: armazenamento cheio."); } syncTouch(); },120); }

function week(k,make){
  if(!S.weeks[k]){ if(!make) return {goals:{},acts:[],habits:{},retro:{},pushed:[]}; S.weeks[k]={goals:{},acts:[],habits:{},retro:{},pushed:[]}; }
  const w=S.weeks[k]; w.goals=w.goals||{}; w.acts=w.acts||[]; w.habits=w.habits||{}; w.retro=w.retro||{}; w.pushed=w.pushed||[];
  return w;
}
const allSubs=()=> S.areas.flatMap(a=> a.subs.map(s=> ({...s,area:a})));
// devolve o objeto vivo do estado — nunca uma cópia, senão renomear não persiste
function findSub(id){ for(const a of S.areas){ const s=a.subs.find(x=>x.id===id); if(s) return s; } return null; }
const subArea=id=> S.areas.find(a=> a.subs.some(s=>s.id===id))||null;

/* ---------- cores das subcategorias ---------- */
// Oito slots de uma paleta validada para daltonismo nos dois temas. O slot fica
// gravado na subcategoria, então a cor não dança quando outra é criada ou removida.
const KN=8;
function ensureColors(){
  const uso=new Array(KN+1).fill(0);
  allSubs().forEach(s=>{ if(s.color>=1&&s.color<=KN) uso[s.color]++; });
  let mudou=false;
  S.areas.forEach(a=> a.subs.forEach(s=>{
    if(s.color>=1&&s.color<=KN) return;
    let slot=1; for(let i=2;i<=KN;i++) if(uso[i]<uso[slot]) slot=i;   // o menos usado
    s.color=slot; uso[slot]++; mudou=true;
  }));
  return mudou;
}
const subVar=id=>{ const s=findSub(id); return "var(--k"+((s&&s.color)||1)+")"; };

/* ---------- rotinas ---------- */
// Duas naturezas no mesmo lugar: "freq" é a meta de frequência de sempre (treinar 4×),
// "daily" é a rotina que acontece em dias determinados, com horário e período opcionais.
// A rotina diária existe na agenda; a de frequência continua só no cartão.
function migraRotinas(){
  let mudou=false;
  (S.habits||[]).forEach(h=>{
    if(!h.mode){ h.mode="freq"; mudou=true; }
    // peso 1 é só o ponto de partida — depois é escolha de quem usa, então não sobrescreve
    if(typeof h.weight!=="number"||h.weight<1||h.weight>3){ h.weight=1; mudou=true; }
    if(h.mode==="daily"&&!Array.isArray(h.days)){ h.days=[0,1,2,3,4,5,6]; mudou=true; }
  });
  return mudou;
}
const iso=d=> d.toISOString().slice(0,10);
// dias da semana k em que a rotina está ativa — [] quando o período já acabou ou não começou
function rotDias(h,k){
  if(h.mode!=="daily") return null;
  const mon=keyMonday(k), base=(h.days&&h.days.length)?h.days:[0,1,2,3,4,5,6];
  return base.filter(i=>{
    const d=new Date(mon); d.setUTCDate(mon.getUTCDate()+i);
    const s=iso(d);
    if(h.from && s<h.from) return false;
    if(h.to && s>h.to) return false;
    return true;
  });
}
function rotEstado(k,id,make){
  const w=week(k,make);
  let v=w.habits[id];
  if(typeof v!=="object" || v===null){ v={d:{},i:{}}; if(make) w.habits[id]=v; }
  v.d=v.d||{}; v.i=v.i||{};
  return v;
}
const rotItens=h=> (h.items&&h.items.length)?h.items:null;
// quanto do dia foi cumprido: sem itens é 0 ou 1; com itens, a fração deles
function rotFator(h,st,i){
  const its=rotItens(h);
  if(!its) return st.d[i]?1:0;
  return its.filter(it=> (st.i[it.id]||{})[i]).length/its.length;
}
const rotDiaFeito=(h,st,i)=> rotFator(h,st,i)>=1;

/* ---------- ícones das subcategorias ---------- */
// Traço fino, mesma gramática dos outros ícones. O nome da frente escolhe o desenho
// sozinho; quem quiser troca à mão em Ajustes.
const SVG=(d,extra)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}${extra||""}</svg>`;
const ICONES={
  alvo:{n:"Alvo",s:SVG('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>')},
  casa:{n:"Casa",s:SVG('<path d="M4 11.5 12 4.5l8 7"/><path d="M6 10.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8.5"/><path d="M10 20v-5h4v5"/>')},
  corpo:{n:"Corpo",s:SVG('<path d="M3 12h2M19 12h2"/><rect x="5" y="8.5" width="3" height="7" rx="1"/><rect x="16" y="8.5" width="3" height="7" rx="1"/><path d="M8 12h8"/>')},
  coracao:{n:"Coração",s:SVG('<path d="M12 20s-7-4.4-7-9.3A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.7C19 15.6 12 20 12 20z"/>')},
  pulso:{n:"Saúde",s:SVG('<path d="M3 12h4l2.5-6 4 12L16 12h5"/>')},
  dinheiro:{n:"Dinheiro",s:SVG('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 12h.01M17 12h.01"/>')},
  livro:{n:"Livro",s:SVG('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M8 4v16"/>')},
  caneta:{n:"Escrita",s:SVG('<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 6.5l3 3"/>')},
  pesquisa:{n:"Pesquisa",s:SVG('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>')},
  globo:{n:"Mundo",s:SVG('<circle cx="12" cy="12" r="8"/><path d="M4 12h16"/><path d="M12 4a13 13 0 0 1 0 16 13 13 0 0 1 0-16z"/>')},
  fala:{n:"Idiomas",s:SVG('<path d="M20 14a2 2 0 0 1-2 2H9l-4 3v-3H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M9 10.5h6M9 13h4"/>')},
  mala:{n:"Trabalho",s:SVG('<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"/><path d="M3 13h18"/>')},
  codigo:{n:"Código",s:SVG('<path d="M9 8l-5 4 5 4"/><path d="M15 8l5 4-5 4"/>')},
  musica:{n:"Música",s:SVG('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>')},
  arte:{n:"Arte",s:SVG('<path d="M12 4a8 8 0 1 0 0 16c1.3 0 1.8-1 1.4-2-.5-1.2.3-2 1.6-2H18a3 3 0 0 0 3-3c0-4.5-4-9-9-9z"/><circle cx="8.5" cy="10.5" r="1" fill="currentColor"/><circle cx="12" cy="8" r="1" fill="currentColor"/>')},
  planta:{n:"Planta",s:SVG('<path d="M12 20v-7"/><path d="M12 13c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6z"/><path d="M12 15c0-3-2-5-5-5 0 3 2 5 5 5z"/>')},
  pet:{n:"Bichos",s:SVG('<circle cx="8" cy="8.5" r="1.9"/><circle cx="16" cy="8.5" r="1.9"/><circle cx="5.5" cy="13.5" r="1.6"/><circle cx="18.5" cy="13.5" r="1.6"/><path d="M12 12.5c2.6 0 4.5 2 4.5 4.2 0 1.7-1.4 2.6-3 2.3-1-.2-2-.2-3 0-1.6.3-3-.6-3-2.3 0-2.2 1.9-4.2 4.5-4.2z"/>')},
  comida:{n:"Comida",s:SVG('<path d="M6 3v8a2 2 0 0 0 4 0V3"/><path d="M8 11v10"/><path d="M17 3c-1.5 1.5-2 3.5-2 5.5S16 12 17 12s2-1.5 2-3.5S18.5 4.5 17 3z"/><path d="M17 12v9"/>')},
  viagem:{n:"Viagem",s:SVG('<path d="M3 13l8-2 3.5-6.5a1.5 1.5 0 0 1 2.7 1.3L15 11l5.5-1.4a1.2 1.2 0 0 1 .6 2.3L4.5 17 3 13z"/>')},
  familia:{n:"Família",s:SVG('<circle cx="8.5" cy="8" r="2.7"/><circle cx="16.5" cy="9.5" r="2.2"/><path d="M3.5 19c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M14.5 19c0-2.2 1.3-3.6 3-3.6s3 1.4 3 3.6"/>')},
  sono:{n:"Descanso",s:SVG('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>')},
  cafe:{n:"Café",s:SVG('<path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M16 9.5h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M7 3.5v2M11 3.5v2"/>')},
  compras:{n:"Compras",s:SVG('<path d="M5 7h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>')},
  bicicleta:{n:"Movimento",s:SVG('<circle cx="6" cy="16.5" r="3.5"/><circle cx="18" cy="16.5" r="3.5"/><path d="M6 16.5l4-8h5"/><path d="M10 8.5h4l4 8"/>')},
  camera:{n:"Registro",s:SVG('<rect x="3" y="7" width="18" height="13" rx="2.5"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8.5 7l1.5-2.5h4L15.5 7"/>')},
  estrela:{n:"Estrela",s:SVG('<path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 10.2l5.4-.8z"/>')},
  relampago:{n:"Energia",s:SVG('<path d="M13.5 3L6 13.5h5L10.5 21 18 10.5h-5z"/>')},
  montanha:{n:"Metas",s:SVG('<path d="M3 19l6.5-11 4 6 2.5-4 5 9z"/><circle cx="17" cy="6" r="1.6"/>')}
};
// palavra no nome › ícone; a primeira que casar vence
const PISTAS=[
  [/\bcasa|lar|dom[ié]cil|moradia|apartament|faxin/i,"casa"],
  [/f[íi]sic|corpo|academia|treino|muscul|malha|exerc[íi]c|gym/i,"corpo"],
  // o específico vem antes do genérico: "saúde financeira" é dinheiro, não saúde
  [/financ|dinheiro|grana|or[çc]ament|invest|econom|conta/i,"dinheiro"],
  [/sa[úu]de|m[ée]dic|terap|bem.?estar|mental/i,"pulso"],
  [/cora[çc][ãa]o|amor|relacion|namor|casament/i,"coracao"],
  [/tese|disserta|acad[êe]mic|estud|leitura|ler|livro|curso|faculdade|ppgcp/i,"livro"],
  [/escrit|escrever|reda[çc]|texto|artigo|blog|di[áa]rio/i,"caneta"],
  [/pesquis|investiga|ci[êe]nc|lab|dados|an[áa]lise/i,"pesquisa"],
  [/idioma|l[íi]ngua|ingl[êe]s|espanhol|franc[êe]s|alem[ãa]o|convers/i,"fala"],
  [/trabalh|emprego|carreir|profiss|escrit[óo]rio|cliente|freela/i,"mala"],
  [/c[óo]digo|program|dev|software|site|app|tech/i,"codigo"],
  [/m[úu]sic|viol[ãa]o|guitarr|piano|canto|banda/i,"musica"],
  [/arte|desenh|pint|criativ|design|foto.?grafia/i,"arte"],
  [/jardim|planta|horta|natureza|verde/i,"planta"],
  [/pet|gato|cachorr|c[ãa]o|bicho|animal/i,"pet"],
  [/comida|cozinh|aliment|receita|dieta|nutri/i,"comida"],
  [/viagem|viajar|passeio|f[ée]rias|trip/i,"viagem"],
  [/fam[íi]lia|filh|pais|m[ãa]e|pai\b|irm[ãa]|amig|social/i,"familia"],
  [/sono|dormir|descans|pausa|medita|calma/i,"sono"],
  [/caf[ée]|rotina.?matin|manh[ãa]/i,"cafe"],
  [/compra|mercado|supermerc|shopping/i,"compras"],
  [/corrida|correr|bike|bicicl|caminhada|pedal|nata[çc]/i,"bicicleta"],
  [/foto|v[íi]deo|registro|mem[óo]ria/i,"camera"],
  [/hobby|hobbies|lazer|divers[ãa]o|jogo|game/i,"estrela"],
  [/energia|h[áa]bito|disciplina|foco/i,"relampago"],
  [/meta|objetivo|projeto|plano|sonho|futuro/i,"montanha"]
];
function adivinhaIcone(nome){
  const n=String(nome||"");
  for(const [re,ic] of PISTAS) if(re.test(n)) return ic;
  return "alvo";
}
const chaveIcone=sub=> (sub&&sub.icon&&ICONES[sub.icon]) ? sub.icon : adivinhaIcone(sub&&sub.name);
const iconeSub=sub=> ICONES[chaveIcone(sub)].s;
const iconeDe=subId=>{ const s=findSub(subId); return s?iconeSub(s):ICONES.alvo.s; };

/* ---------- tags ---------- */
// Etiqueta livre, minúscula, sem "#" guardado — o "#" é só como se escreve e se procura.
const normTag=t=> String(t||"").trim().replace(/^#+/,"").toLowerCase().replace(/\s+/g," ").slice(0,24);
function parseTags(txt){
  const fora=[], dentro=[];
  String(txt||"").split(/[,;]+|\s{2,}/).forEach(p=>{ const t=normTag(p); if(t&&!dentro.includes(t)){ dentro.push(t); fora.push(t); } });
  return fora;
}
// tira "#tag" do meio do texto na criação, do mesmo jeito que "!2" define o peso
function extraiTags(texto){
  const tags=[];
  const limpo=String(texto||"").replace(/(^|\s)#([^\s#]{1,24})/g,(m,pre,t)=>{ const n=normTag(t); if(n&&!tags.includes(n)) tags.push(n); return pre; }).replace(/\s{2,}/g," ").trim();
  return {texto:limpo,tags};
}
const tagsDe=o=> Array.isArray(o&&o.tags)?o.tags:[];
function todasTags(k){
  const w=week(k||cur), m=new Map();
  (w.acts||[]).forEach(a=>{
    tagsDe(a).forEach(t=> m.set(t,(m.get(t)||0)+1));
    (a.steps||[]).forEach(s=> tagsDe(s).forEach(t=> m.set(t,(m.get(t)||0)+1)));
  });
  return [...m.entries()].sort((x,y)=> y[1]-x[1]||x[0].localeCompare(y[0]));
}
// a busca vale para texto e etiqueta; "#casa" procura só na etiqueta
function combina(o,q){
  if(!q) return true;
  const alvo=q.startsWith("#")?normTag(q):q;
  if(q.startsWith("#")) return tagsDe(o).some(t=> t.includes(alvo));
  return (o.text||"").toLowerCase().includes(q) || tagsDe(o).some(t=> t.includes(alvo));
}

/* ---------- tempo dedicado ---------- */
// Aceita como se fala: "90", "90m", "1h30", "1:30", "1,5h". Devolve minutos, ou NaN
// quando está escrito de um jeito que não dá para ler.
function parseMin(v){
  const s=String(v==null?"":v).trim().toLowerCase().replace(",",".");
  if(!s) return null;
  let m;
  if((m=s.match(/^(\d+)\s*[:h]\s*(\d{1,2})\s*(min|m)?$/))) return (+m[1])*60+(+m[2]);
  if((m=s.match(/^(\d+(?:\.\d+)?)\s*h(oras?)?$/))) return Math.round(parseFloat(m[1])*60);
  if((m=s.match(/^(\d+)\s*(min|m)?$/))) return +m[1];
  return NaN;
}
function fmtMin(n){
  n=Math.max(0,Math.round(n||0));
  if(!n) return "0min";
  const h=Math.floor(n/60), r=n%60;
  return h? (r? `${h}h${String(r).padStart(2,"0")}` : `${h}h`) : `${r}min`;
}
const limiteMedio=()=> S.settings.tempoMedio||30;
const limiteAlto=()=> S.settings.tempoAlto||120;
const pesoSugerido=min=> (min==null||!min)?null : (min>=limiteAlto()?3 : min>=limiteMedio()?2 : 1);
const tempoDe=o=> Math.max(0,+(o&&o.mins)||0);
// o tempo da atividade inclui o que foi anotado nas subetapas
const tempoTotal=a=> tempoDe(a)+(a.steps||[]).reduce((n,s)=>n+tempoDe(s),0);

/* ---------- menu suspenso ---------- */
// Vai no <body> porque o cartão tem overflow:hidden — dentro dele o menu seria cortado.
let menuFechar=null;
function fecharMenu(){
  const m=document.getElementById("menu");
  if(m) m.remove();
  if(menuFechar){ menuFechar(); menuFechar=null; }
}
function abrirMenu(btn,itens,opts){
  opts=opts||{};
  const jaEra=document.getElementById("menu")?.dataset.dono===btn.dataset.menuId;
  fecharMenu();
  if(jaEra) return;                       // clicar de novo no mesmo botão fecha
  const m=document.createElement("div");
  m.className="menu"; m.id="menu"; m.dataset.dono=btn.dataset.menuId||"";
  m.setAttribute("role","menu");
  const corpo=itens.map((it,i)=> it.sep
    ? `<div class="menusep"></div>`
    : it.titulo
    ? `<div class="menutit">${esc(it.titulo)}</div>`
    : `<button class="menuitem ${it.danger?"danger":""}" data-mi="${i}" role="menuitem"
         data-busca="${esc(((it.busca||it.label||"")+" "+(it.hint||"")).toLowerCase())}">
         <i>${it.icon||""}</i><span>${esc(it.label)}</span>${it.hint?`<em>${esc(it.hint)}</em>`:""}
       </button>`).join("");
  m.innerHTML=(opts.busca?`<div class="menubusca">
      <input type="search" placeholder="${esc(opts.busca)}" autocomplete="off" aria-label="${esc(opts.busca)}">
    </div>`:"")+`<div class="menulista">${corpo}</div>`;
  document.body.appendChild(m);
  // cabe abaixo? senão acima; se não couber dos dois lados, limita a altura ao maior espaço
  const marg=8, r=btn.getBoundingClientRect();
  const abaixo=innerHeight-r.bottom-marg-6, acima=r.top-marg-6;
  let mr=m.getBoundingClientRect();
  let top;
  if(mr.height<=abaixo) top=r.bottom+6;
  else if(mr.height<=acima) top=r.top-mr.height-6;
  else if(abaixo>=acima){ m.style.maxHeight=abaixo+"px"; top=r.bottom+6; }
  else { m.style.maxHeight=acima+"px"; mr=m.getBoundingClientRect(); top=r.top-mr.height-6; }
  mr=m.getBoundingClientRect();
  top=Math.max(marg,Math.min(top,innerHeight-mr.height-marg));
  const left=Math.max(marg,Math.min(r.right-mr.width, innerWidth-mr.width-marg));
  m.style.left=left+"px"; m.style.top=top+"px";
  m.addEventListener("click",e=>{
    const b=e.target.closest("[data-mi]"); if(!b) return;
    const it=itens[+b.dataset.mi];
    fecharMenu();
    if(it&&it.fn) it.fn();
  });
  const forra=e=>{ if(!e.target.closest("#menu")) fecharMenu(); };
  const tecla=e=>{ if(e.key==="Escape"){ e.stopPropagation(); fecharMenu(); } };
  setTimeout(()=>document.addEventListener("mousedown",forra),0);
  document.addEventListener("keydown",tecla,true);
  // rolar a lista de destinos não pode fechar o próprio menu
  const rolou=e=>{ if(!(e.target instanceof Node) || !m.contains(e.target)) fecharMenu(); };
  addEventListener("scroll",rolou,{capture:true});
  addEventListener("resize",fecharMenu,{once:true});
  menuFechar=()=>{
    document.removeEventListener("mousedown",forra);
    document.removeEventListener("keydown",tecla,true);
    removeEventListener("scroll",rolou,{capture:true});
  };

  const campo=m.querySelector(".menubusca input");
  if(campo){
    const visiveis=()=> [...m.querySelectorAll(".menuitem")].filter(b=> b.style.display!=="none");
    campo.addEventListener("input",()=>{
      const q=campo.value.trim().toLowerCase();
      m.querySelectorAll(".menuitem").forEach(b=>{
        b.style.display = (!q || b.dataset.busca.includes(q)) ? "" : "none";
      });
      // título de grupo sem nenhum item visível não fica órfão na lista
      m.querySelectorAll(".menutit").forEach(t=>{
        let n=t.nextElementSibling, achou=false;
        while(n && !n.classList.contains("menutit")){ if(n.classList.contains("menuitem")&&n.style.display!=="none"){ achou=true; break; } n=n.nextElementSibling; }
        t.style.display=achou?"":"none";
      });
      const vazio=m.querySelector(".menuvazio");
      if(vazio) vazio.style.display=visiveis().length?"none":"";
    });
    campo.addEventListener("keydown",e=>{
      if(e.key==="Enter"){ e.preventDefault(); visiveis()[0]?.click(); }
      if(e.key==="ArrowDown"){ e.preventDefault(); visiveis()[0]?.focus(); }
    });
    m.querySelector(".menulista").insertAdjacentHTML("beforeend",
      `<div class="menuvazio" style="display:none">Nenhuma atividade com esse nome.</div>`);
    setTimeout(()=>campo.focus(),0);
  }else{
    m.querySelector(".menuitem")?.focus();
  }
}

/* ---------- lixeira ---------- */
// Excluir é o único gesto do painel sem volta, e o clique é a um pixel do "editar".
// O item sai da semana mas fica guardado com o crachá de onde veio, por 60 dias.
const LIXO_MAX=60, LIXO_DIAS=60;
function podaLixo(){
  if(!Array.isArray(S.trash)) S.trash=[];
  const antes=S.trash.length, limite=Date.now()-LIXO_DIAS*864e5;
  S.trash=S.trash.filter(t=> (t.at||0)>limite);
  if(S.trash.length>LIXO_MAX) S.trash=S.trash.slice(-LIXO_MAX);
  return S.trash.length!==antes;
}
function paraLixo(entrada){
  S.trash=S.trash||[];
  const t=Object.assign({id:uid(),at:Date.now()},entrada);
  S.trash.push(t);
  if(S.trash.length>LIXO_MAX) S.trash=S.trash.slice(-LIXO_MAX);
  return t.id;
}
// devolve o item à semana de origem; se a atividade-mãe da subetapa sumiu, refaz a casca dela
function restaurar(id){
  const i=(S.trash||[]).findIndex(t=>t.id===id);
  if(i<0) return null;
  const t=S.trash[i], w=week(t.week,true);
  if(t.kind==="act"){
    if(!w.acts.some(a=>a.id===t.data.id)) w.acts.push(t.data);
  }else{
    let a=w.acts.find(x=>x.id===t.actId) || w.acts.find(x=>x.text===t.pai.text && x.sub===t.pai.sub);
    if(!a){ a=Object.assign({},t.pai,{steps:[]}); w.acts.push(a); }
    a.steps=a.steps||[];
    if(!a.steps.some(s=>s.id===t.data.id)) a.steps.push(t.data);
    syncFromSteps(a);
  }
  S.trash.splice(i,1);
  return t;
}
const paiSnapshot=a=> ({id:a.id,sub:a.sub,text:a.text,status:a.status,weight:a.weight||1,due:a.due??null,at:a.at??null,url:a.url??null,created:a.created||Date.now()});

/* ---------- transferir para outra atividade ---------- */
// Subetapa muda de dono; atividade inteira vira subetapa do destino. Nos dois casos
// o desfazer devolve a lista de atividades da semana como estava antes.
// destinos na ordem em que os cartões aparecem na tela, com título por frente
function alvosPara(idOrigem){
  const acts=week(cur).acts.filter(a=> a.id!==idOrigem);
  const lista=[];
  S.areas.forEach(area=> area.subs.forEach(sub=>{
    const dela=acts.filter(a=> a.sub===sub.id);
    if(!dela.length) return;
    lista.push({titulo:`${area.name} · ${sub.name}`});
    dela.forEach(a=> lista.push({a,sub}));
  }));
  return lista;
}
function transferir(origem,alvoId,s){
  const w=week(cur), alvo=w.acts.find(a=>a.id===alvoId);
  if(!alvo || alvo.id===origem.id) return;
  const antes=structuredClone(w.acts);
  const desfazer={label:"Desfazer",fn:()=>{ week(cur,true).acts=antes; save(); renderWeek(); toast("Transferência desfeita."); }};

  if(s){
    origem.steps=(origem.steps||[]).filter(x=>x.id!==s.id);
    // esvaziada de etapas, a mãe não segue "concluída" pela conclusão que foi embora
    if(!origem.steps.length && origem.status==="done") origem.status="todo";
    syncFromSteps(origem);
    (alvo.steps=alvo.steps||[]).push(s);
    if(alvo.status==="done" && !s.done) alvo.status="doing";
    syncFromSteps(alvo);
    save(); renderWeek();
    toast(`"${s.text}" agora é subetapa de "${alvo.text}".`,desfazer);
    return;
  }

  const virou={id:uid(),text:origem.text,done:origem.status==="done",due:origem.due??null,at:origem.at??null,
    url:origem.url??null,tags:tagsDe(origem).slice()};
  if(tempoDe(origem)) virou.mins=tempoDe(origem);
  const herdadas=(origem.steps||[]).map(x=> Object.assign(structuredClone(x),{id:uid()}));
  w.acts=w.acts.filter(a=> a.id!==origem.id);
  (alvo.steps=alvo.steps||[]).push(virou,...herdadas);
  if(alvo.status==="done" && (!virou.done||herdadas.some(x=>!x.done))) alvo.status="doing";
  syncFromSteps(alvo);
  save(); renderWeek();
  toast(`"${origem.text}" virou subetapa de "${alvo.text}"${herdadas.length?` com ${herdadas.length} etapa${herdadas.length>1?"s":""} junto`:""}.`,desfazer);
}
// atividade com subetapas não cabe inteira num nível só — avisa antes de achatar
function transferirComAviso(origem,alvoId,s){
  if(!s && (origem.steps||[]).length){
    const alvo=week(cur).acts.find(a=>a.id===alvoId);
    ask("Transferir com as subetapas?",
      `"${origem.text}" vira uma subetapa de "${alvo?alvo.text:"destino"}", e as ${origem.steps.length} subetapas dela passam a ficar no mesmo nível, dentro do destino.`,
      "Transferir").then(ok=>{ if(ok) transferir(origem,alvoId,null); });
    return;
  }
  transferir(origem,alvoId,s||null);
}
function menuTransferir(btn,origem,s){
  const alvos=alvosPara(origem.id);
  if(!alvos.some(x=>x.a)){ toast("Não há outra atividade nesta semana para receber."); return; }
  abrirMenu(btn, alvos.map(x=> x.titulo ? x : ({
      label:x.a.text,
      icon:`<span class="pt" style="background:${subVar(x.a.sub)}"></span>`,
      hint:(x.a.steps||[]).length?`${x.a.steps.length} etapas`:"",
      busca:`${x.a.text} ${x.sub?x.sub.name:""}`,
      fn:()=>transferirComAviso(origem,x.a.id,s)
    })),
    {busca:"Procurar atividade…"});
}

/* ---------- adiar para a semana seguinte ---------- */
// Adiar não é apagar: o item sai da semana mas deixa uma dívida nela, que continua
// pesando no denominador. E chega na semana seguinte marcado, para render um bônus
// pequeno quando finalmente sair.
const bonusPush=()=> S.settings.pushBonus==null?15:S.settings.pushBonus;
const descontaPush=()=> S.settings.pushPenalty!==false;

function empurrar(a,s){
  const prox=shiftKey(cur,1), w=week(prox,true), atual=week(cur,true);
  atual.pushed=atual.pushed||[];
  if(s){
    const antes=Math.max(1,(a.steps||[]).length);
    let m=w.acts.find(x=> x.text===a.text && x.sub===a.sub);
    if(!m){
      m={id:uid(),sub:a.sub,text:a.text,status:"todo",weight:a.weight||1,due:null,at:null,url:a.url??null,steps:[],carried:true,created:Date.now()};
      w.acts.push(m);
    }
    const novo={id:uid(),text:s.text,done:false,doing:!!s.doing,due:s.due??null,at:s.at??null,url:s.url??null,tags:tagsDe(s).slice(),mins:tempoDe(s)||undefined,fromPush:true};
    (m.steps=m.steps||[]).push(novo);
    a.steps=(a.steps||[]).filter(x=>x.id!==s.id);
    // esvaziada de etapas, a atividade não pode continuar "concluída": a prova da
    // conclusão foi junto com as etapas, e ela seguiria inflando o percentual da semana
    if(!a.steps.length && a.status==="done") a.status="todo";
    syncFromSteps(a);
    atual.pushed.push({id:uid(),kind:"step",text:s.text,sub:a.sub,peso:(a.weight||1)/antes,
      to:prox,destId:m.id,destStepId:novo.id,origemId:a.id,at:Date.now()});
  }else{
    atual.acts=atual.acts.filter(x=>x.id!==a.id);
    const novo=Object.assign({},a,{
      id:uid(), carried:true, fromPush:true, created:Date.now(),
      status:a.status==="skip"?"todo":a.status,
      steps:(a.steps||[]).map(x=>({id:uid(),text:x.text,done:!!x.done,doing:!!x.doing,due:x.due??null,at:x.at??null,url:x.url??null,tags:tagsDe(x).slice()}))
    });
    w.acts.push(novo);
    atual.pushed.push({id:uid(),kind:"act",text:a.text,sub:a.sub,peso:a.weight||1,
      to:prox,destId:novo.id,at:Date.now()});
  }
  save(); renderWeek();
  toast(`${s?"Subetapa":"Atividade"} adiada para ${prox.replace("-W"," · semana ")}${descontaPush()?" — segue contando nesta":""}.`,
        {label:"Ir para lá",fn:()=>{ cur=prox; render(); }});
}

// desfaz o adiamento: traz o item de volta e apaga a dívida
function trazerDeVolta(pid){
  const w=week(cur,true), p=(w.pushed||[]).find(x=>x.id===pid);
  if(!p) return;
  const destW=S.weeks[p.to];
  const some=()=>{ w.pushed=w.pushed.filter(x=>x.id!==pid); save(); renderWeek(); };
  if(!destW){ some(); toast("A semana de destino não existe mais — registro removido."); return; }

  if(p.kind==="act"){
    const i=destW.acts.findIndex(a=>a.id===p.destId);
    if(i<0){ some(); toast("A atividade já não está na semana seguinte — registro removido."); return; }
    const [a]=destW.acts.splice(i,1);
    delete a.fromPush; delete a.carried;
    w.acts.push(a);
  }else{
    const pai=destW.acts.find(a=>a.id===p.destId);
    const s=pai&&(pai.steps||[]).find(x=>x.id===p.destStepId);
    if(!s){ some(); toast("A subetapa já não está na semana seguinte — registro removido."); return; }
    pai.steps=pai.steps.filter(x=>x.id!==p.destStepId);
    syncFromSteps(pai);
    // a casca criada só para receber a subetapa não fica sobrando na semana seguinte —
    // mas nada que o usuário tenha mexido é removido
    if(!pai.steps.length && pai.carried && pai.status==="todo" && !tempoDe(pai) && !tagsDe(pai).length && !pai.url)
      destW.acts=destW.acts.filter(a=>a.id!==pai.id);
    delete s.fromPush;
    const mae=w.acts.find(a=>a.id===p.origemId);
    if(mae){ (mae.steps=mae.steps||[]).push(s); syncFromSteps(mae); }
    else w.acts.push({id:uid(),sub:p.sub,text:s.text,status:stepSt(s),weight:1,due:s.due??null,at:s.at??null,
      url:s.url??null,tags:tagsDe(s).slice(),steps:[],created:Date.now()});
  }
  w.pushed=w.pushed.filter(x=>x.id!==pid);
  save(); renderWeek();
  toast(`"${p.text}" voltou para esta semana.`);
}

/* ---------- cálculo ---------- */
// Uma atividade com subetapas vale a fração de subetapas concluídas — mais fiel
// que "em andamento" genérico. Marcada como concluída à mão, vale 1 de qualquer jeito.
// subetapa em andamento vale o mesmo crédito parcial da atividade em andamento
const stepSt=s=> s.done?"done":(s.doing?"doing":"todo");
function actFactor(a){
  if(a.status==="done") return 1;
  if(a.status==="skip") return 0;
  const st=a.steps||[];
  if(st.length){
    const p=S.settings.partial/100;
    return st.reduce((n,x)=> n + (x.done?1:(x.doing?p:0)), 0)/st.length;
  }
  return a.status==="doing" ? S.settings.partial/100 : 0;
}
function subScore(subId,k){
  const w=week(k), acts=w.acts.filter(a=> a.sub===subId && a.status!=="skip");
  let num=0,den=0;
  const bonus=bonusPush()/100;
  acts.forEach(a=>{
    const wt=a.weight||1; den+=wt; num+=wt*actFactor(a);
    // o que voltou de um adiamento rende um bônus pequeno quando enfim sai
    if(bonus>0){
      if(a.fromPush && a.status==="done") num+=wt*bonus;
      const st=a.steps||[];
      if(st.length) st.forEach(x=>{ if(x.fromPush && x.done) num+=(wt/st.length)*bonus; });
    }
  });
  // dívida de adiamento: o item saiu da semana, mas o plano dela continua cobrando
  if(descontaPush()) (w.pushed||[]).filter(p=> p.sub===subId).forEach(p=> den+=(p.peso||1));
  S.habits.filter(h=> h.sub===subId).forEach(h=>{
    const wt=h.weight||1;
    if(h.mode==="daily"){
      const dias=rotDias(h,k);
      if(!dias.length) return;                    // fora do período: não entra na conta
      const st=rotEstado(k,h.id);
      den+=wt; num+=wt*(dias.reduce((s,i)=> s+rotFator(h,st,i),0)/dias.length);
    }else{
      const v=w.habits[h.id], c=typeof v==="number"?v:0;
      den+=wt; num+=wt*Math.min(c/Math.max(1,h.target),1);
    }
  });
  const total=w.acts.filter(a=> a.sub===subId).length;
  // o bônus pode empurrar acima de 100 — o teto mantém o número legível
  return {num,den,pct:den?Math.min(100,Math.round(num/den*100)):null,
    done:acts.filter(a=>a.status==="done").length, count:acts.length, total};
}
function areaScore(area,k){
  let num=0,den=0;
  area.subs.forEach(s=>{ const r=subScore(s.id,k); num+=r.num; den+=r.den; });
  return {num,den,pct:den?Math.min(100,Math.round(num/den*100)):null};
}
function weekScore(k){
  let num=0,den=0;
  S.areas.forEach(a=>{ const r=areaScore(a,k); num+=r.num; den+=r.den; });
  return {num,den,pct:den?Math.min(100,Math.round(num/den*100)):null};
}
const marcouRotina=v=> typeof v==="number" ? v>0
  : !!v && (Object.keys(v.d||{}).length>0 || Object.values(v.i||{}).some(m=> Object.keys(m||{}).length>0));
const hasData=k=>{ const w=S.weeks[k]; return !!w && (w.acts.length>0 || (w.pushed||[]).length>0 || Object.values(w.habits||{}).some(marcouRotina) || Object.values(w.goals||{}).some(v=>v&&v.trim())); };
const dataWeeks=()=> Object.keys(S.weeks).filter(hasData).sort();

/* ---------- ícones ---------- */
const IC={
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 6"/></svg>',
  half:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>',
  skip:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  more:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  grip:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>',
  chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
  move:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h9"/><path d="M4 12h6"/><path d="M4 18h6"/><path d="M14 15l3.5 3.5L21 15"/><path d="M17.5 18.5V8"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/></svg>',
  tag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12.5V4a1 1 0 0 1 1-1h8.5a1 1 0 0 1 .7.3l7.5 7.5a1 1 0 0 1 0 1.4l-8.5 8.5a1 1 0 0 1-1.4 0L3.3 13.2a1 1 0 0 1-.3-.7z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor"/></svg>',
  push:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l7 7-7 7"/><path d="M13 5l7 7-7 7"/></svg>',
  undo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 13.5a4.5 4.5 0 0 0 6.36 0l2.4-2.4a4.5 4.5 0 0 0-6.36-6.36l-1.2 1.2"/><path d="M13.5 10.5a4.5 4.5 0 0 0-6.36 0l-2.4 2.4a4.5 4.5 0 0 0 6.36 6.36l1.2-1.2"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  eyeoff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 6.1A9.7 9.7 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.3 4M6.2 7.9A16.4 16.4 0 0 0 2 12s3.6 6.5 10 6.5a9.9 9.9 0 0 0 4.1-.86"/><path d="M4 4l16 16"/></svg>'
};
function stIcon(s){ return s==="done"?IC.check: s==="doing"?IC.half: s==="skip"?IC.skip:""; }
const NEXT={todo:"doing",doing:"done",done:"skip",skip:"todo"};
const STNAME={todo:"pendente",doing:"em andamento",done:"concluída",skip:"adiada"};

/* ---------- realização ---------- */
// Sequência de semanas fechadas na meta, contada de trás para a frente.
// Conta só as semanas já fechadas: a semana em curso ainda está sendo construída e
// zerar a sequência por causa dela seria cobrar por algo que ainda não aconteceu.
function sequenciaNaMeta(){
  const ks=dataWeeks().filter(k=> k<cur);
  let n=0;
  for(let i=ks.length-1;i>=0;i--){
    const p=weekScore(ks[i]).pct;
    if(p==null) continue;
    if(p>=S.settings.goal) n++; else break;
  }
  const atual=weekScore(cur).pct;
  if(atual!=null && atual>=S.settings.goal) n++;   // a semana corrente entra quando já bateu
  return n;
}
let metaAnterior=null;
// anima uma vez e limpa: o render refaz o DOM, então a classe não pode ficar grudada
function pulsa(el,classe){
  if(!el) return;
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.classList.remove(classe);
  void el.offsetWidth;
  el.classList.add(classe);
  setTimeout(()=>el.classList.remove(classe),900);
}
function celebraItem(id){
  const el=document.querySelector(`.itemwrap[data-id="${CSS.escape(id)}"] .st`);
  pulsa(el,"feito");
}

/* ---------- render: semana ---------- */
// A lateral é constante: semana, anel e sequência não dependem da página aberta.
function renderLateral(){
  const isNow=cur===todayKey();
  $("#wkey").innerHTML=esc(cur.replace("-W"," · sem "))+(isNow?'<span class="today-pill">atual</span>':"");
  $("#wrange").textContent=rangeLabel(cur);

  const ws=weekScore(cur), pct=ws.pct==null?0:ws.pct;
  $("#overall").textContent=(ws.pct==null?"—":pct+"%");
  const C=2*Math.PI*24;
  $("#ringarc").setAttribute("stroke-dashoffset", C-(C*pct/100));

  // meta batida: o anel muda de cor e pulsa uma vez, no instante em que cruza
  const naMeta=ws.pct!=null && pct>=S.settings.goal;
  const ring=$("#ring");
  ring.classList.toggle("meta",naMeta);
  $("#ringcap").textContent=naMeta?"meta":"semana";
  if(naMeta && metaAnterior===false) pulsa(ring,"comemora");
  if(ws.pct!=null) metaAnterior=naMeta;

  const seq=sequenciaNaMeta();
  const el=$("#streak");
  el.classList.toggle("hidden",seq<2);
  if(seq>=2){
    $("#streakn").textContent=seq;
    $("#streakt").textContent="semanas na meta";
    el.title=`Você fechou as últimas ${seq} semanas em ${S.settings.goal}% ou mais.`;
  }
  renderNav();
}

function renderWeek(){
  if(rota.tipo==="home"){ renderHome(); return; }   // a home é o mesmo conteúdo, em outra forma
  renderLateral();
  if(rota.tipo==="sub"||rota.tipo==="area") renderPaginaFrente();
  const q=query.trim().toLowerCase();
  const w=week(cur);
  const hd=S.settings.hideDone;

  if($("#agenda")) renderAgenda(w);
  if(!$("#areas")) return;

  // a página de uma frente mostra só ela; a de uma área, todas as frentes dela
  const soUma=rota.tipo==="sub";
  const escopo = rota.tipo==="area" ? S.areas.filter(a=>a.id===rota.id)
    : soUma ? S.areas.filter(a=> a.subs.some(s=>s.id===rota.id))
        .map(a=> Object.assign({},a,{subs:a.subs.filter(s=>s.id===rota.id)}))
    : S.areas;

  $("#areas").innerHTML=escopo.map(area=>{
    const as=areaScore(area,cur);
    const cards=area.subs.map(sub=>{
      const r=subScore(sub.id,cur);
      let acts=w.acts.filter(a=> a.sub===sub.id);
      const feitas=acts.filter(a=> a.status==="done").length;
      const soSub=!!S.settings.hideDoneSubs[sub.id];   // ocultar só nesta frente
      if(q) acts=acts.filter(a=> combina(a,q) || (a.steps||[]).some(s=> combina(s,q)));
      if(hd||soSub) acts=acts.filter(a=> a.status!=="done");
      const hs=S.habits.filter(h=> h.sub===sub.id);
      const pctTxt=r.pct==null?"—":r.pct+"%";
      const sopen=!S.settings.foldedSubs[sub.id];
      const pendentes=w.acts.filter(a=> a.sub===sub.id && a.status!=="done" && a.status!=="skip").length;
      const temObj=(w.goals[sub.id]||"").trim().length>0;
      const plena=r.pct===100;
      return `<article class="card ${sopen?"":"fold"} ${plena?"plena":""}" style="--c:${subVar(sub.id)}" data-sub="${sub.id}">
        <div class="card-head">
          <div class="card-title">
            <button class="ctoggle" data-foldsub="${sub.id}" aria-expanded="${sopen}" aria-controls="body-${sub.id}" title="${sopen?"Recolher":"Expandir"} ${esc(sub.name)}">${IC.chev}</button>
            <span class="subicon" aria-hidden="true">${iconeSub(sub)}</span>
            <input class="h3in" value="${esc(sub.name)}" data-sname="${sub.id}" aria-label="Nome da subcategoria" title="Clique para renomear">
            ${feitas?`<button class="ib eye ${soSub?"on":""}" data-hidesub="${sub.id}" aria-pressed="${soSub}"
              title="${soSub?`Mostrar as ${feitas} concluída${feitas>1?"s":""} desta frente`:`Ocultar as ${feitas} concluída${feitas>1?"s":""} desta frente`}">${soSub?IC.eyeoff:IC.eye}</button>`:""}
            <button class="kill" data-sdel="${sub.id}" title="Excluir subcategoria">${IC.x}</button>
            <span class="pct mono" style="color:${r.pct==null?"var(--ink-3)":r.pct>=100?"var(--ok)":"var(--ink)"}">${pctTxt}</span>
          </div>
          <div class="bar"><i style="width:${r.pct||0}%;background:${subVar(sub.id)}"></i></div>
          <div class="meta"><span>${r.done}/${r.count} atividades</span>${(hd||soSub)&&feitas?`<span class="hid">${feitas} oculta${feitas>1?"s":""}</span>`:""}${hs.length?`<span>${hs.length} hábito${hs.length>1?"s":""}</span>`:""}${
            sopen?"":`${pendentes?`<span>${pendentes} pendente${pendentes>1?"s":""}</span>`:""}${temObj?`<span>com objetivo</span>`:""}`}</div>
        </div>
        ${sopen?`<div id="body-${sub.id}" style="display:contents">
        <div class="goal">
          <label for="g-${sub.id}">Objetivo da semana</label>
          <textarea id="g-${sub.id}" data-goal="${sub.id}" rows="1" placeholder="O que essa frente precisa entregar até domingo?">${esc(w.goals[sub.id]||"")}</textarea>
        </div>
        ${hs.length?`<div class="subhead">Rotinas</div>`+hs.map(h=>{
          if(h.mode==="daily"){
            const dias=rotDias(h,cur), st=rotEstado(cur,h.id), its=rotItens(h);
            const feitos=dias.filter(i=> rotDiaFeito(h,st,i)).length;
            const fim=h.to?` · até ${h.to.slice(8,10)}/${h.to.slice(5,7)}`:"";
            const resumo=dias.length
              ? `${dias.length===7?"todo dia":dias.map(i=>DIAS[i]).join(" ")}${h.at?` · ${h.at}`:""}${its?` · ${its.length} etapas`:""}${fim}`
              : (h.to?"período encerrado":"fora do período");
            return `<div class="habit rot" style="--c:${subVar(sub.id)}">
              <div class="hn">${esc(h.name)}${(h.weight||1)>1?`<span class="chip w">peso ${h.weight}</span>`:""}<small>${esc(resumo)}</small></div>
              <div class="rotdays">${[0,1,2,3,4,5,6].map(i=>{
                const ativo=dias.includes(i), f=ativo?rotFator(h,st,i):0;
                const cls=!ativo?"off":(f>=1?"on":(f>0?"meio":""));
                return `<button class="rd ${cls}" ${ativo?`data-rot="${h.id}::${i}"`:"disabled"}
                  title="${DIAS[i]}${ativo?(f>=1?" — feito":" — pendente"):" — fora da rotina"}" aria-label="${DIAS[i]}">${DIAS[i][0].toUpperCase()}</button>`;
              }).join("")}</div>
              <span class="v mono ${dias.length&&feitos>=dias.length?"full":""}">${feitos}/${dias.length||"—"}</span>
            </div>`;
          }
          const v=w.habits[h.id], c=typeof v==="number"?v:0, full=c>=h.target;
          return `<div class="habit" style="--c:${subVar(sub.id)}">
            <div class="dots">${Array.from({length:Math.min(h.target,10)},(_,i)=>`<i class="${i<c?"on":""}"></i>`).join("")}</div>
            <div class="hn">${esc(h.name)}${(h.weight||1)>1?`<span class="chip w">peso ${h.weight}</span>`:""}<small>meta ${h.target}× · ${full?"cumprido":(h.target-c)+" restante"+(h.target-c>1?"s":"")}</small></div>
            <div class="counter">
              <button data-hab="${h.id}" data-d="-1" aria-label="Diminuir">−</button>
              <span class="v mono ${full?"full":""}">${c} / ${h.target}</span>
              <button data-hab="${h.id}" data-d="1" aria-label="Aumentar">+</button>
            </div>
          </div>`;
        }).join("")+`<div class="sep"></div>`:""}
        <ul class="list">${acts.length?acts.map(a=>itemHTML(a)).join(""):`<li class="empty">${
          q?"Nada corresponde ao filtro."
          :(hd||soSub)&&feitas?`Tudo concluído aqui — ${feitas} atividade${feitas>1?"s":""} oculta${feitas>1?"s":""}.`
          :"Comece por uma linha só. O resto vem depois."}</li>`}</ul>
        ${plena&&acts.length?`<div class="plenamsg">${IC.check}<span>Frente fechada nesta semana.</span></div>`:""}
        ${(()=>{
          const adiadas=(w.pushed||[]).filter(p=> p.sub===sub.id);
          if(!adiadas.length) return "";
          return `<div class="subhead">Adiadas para a semana seguinte</div>`+adiadas.map(p=>`
            <div class="pushrow">
              <span class="pn">${esc(p.text)}${p.kind==="step"?`<em>subetapa</em>`:""}</span>
              <span class="pv mono" title="${descontaPush()?`Continua pesando ${p.peso===1?"1 ponto":p.peso.toFixed(2)+" ponto"} nesta semana`:"O desconto está desligado nas preferências"}">${descontaPush()?"−"+(p.peso>=1?p.peso.toFixed(0):String(+p.peso.toFixed(2)).replace(".",",")):"—"}</span>
              <button class="lnk" data-unpush="${p.id}">trazer de volta</button>
            </div>`).join("");
        })()}
        <div class="add">
          <input type="text" data-add="${sub.id}" placeholder="Nova atividade — Enter para salvar" autocomplete="off">
        </div>
        </div>`:""}
      </article>`;
    }).join("");

    const open=!S.settings.folded[area.id];
    // recolhida, a área vira uma fita de chips — o percentual de cada frente continua à vista
    const folded=area.subs.map(sub=>{
      const r=subScore(sub.id,cur);
      return `<button class="fold-chip ${r.pct===100?"plena":""}" data-open="${area.id}:${sub.id}" style="--c:${subVar(sub.id)}" title="Abrir ${esc(area.name)} nesta subcategoria">
        <span class="fi">${iconeSub(sub)}</span>${esc(sub.name)}
        <span class="fb"><i style="width:${r.pct||0}%"></i></span><b>${r.pct==null?"—":r.pct+"%"}</b>
      </button>`;
    }).join("");

    return `<section class="area">
      <div class="area-head ${soUma?"hidden":""}">
        <button class="atoggle" data-fold="${area.id}" aria-expanded="${open}" aria-controls="grid-${area.id}">
          ${IC.chev}<h2 style="color:var(--${area.tone})">${esc(area.name)}</h2>
        </button>
        <div class="abar"><i style="width:${as.pct||0}%;background:var(--${area.tone})"></i></div>
        <span class="apct mono">${as.pct==null?"—":as.pct+"%"}</span>
      </div>
      ${open?`<div class="grid" id="grid-${area.id}">${cards}<button class="addcard" data-newsub="${area.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Nova subcategoria em ${esc(area.name)}
      </button></div>`:`<div class="folded" id="grid-${area.id}">${folded}</div>`}
    </section>`;
  }).join("");

  const conhecidas=todasTags(cur);
  $("#taglist").innerHTML=conhecidas.map(([t])=>`<option value="${esc(t)}">`).join("");
  $$("#areas textarea").forEach(autosize);
  atualizaGaveta();
}

// Retrospectiva virou página própria — os campos só existem quando ela está montada.
function renderRetro(){
  const r=week(cur).retro||{};
  if(!$("#r-win")) return;
  $("#r-win").value=r.win||""; $("#r-block").value=r.block||""; $("#r-next").value=r.next||"";
  scale("#sc-energy","energy",r.energy); scale("#sc-mood","mood",r.mood);
}

// Agenda: distribui pelo dia-alvo as atividades da semana aberta.
// Só lê a tag que já existe em cada atividade — não cria um segundo lugar para marcar prioridade.
function renderAgenda(w){
  const mon=keyMonday(cur);
  const isNow=cur===todayKey();
  const today=isNow ? ((new Date().getDay()||7)-1) : -1;
  const cols=[0,1,2,3,4,5,6].map(()=>[]), semDia=[];
  const q=query.trim().toLowerCase();
  const casa=(t,o)=> !q || (o?combina(o,q):(t||"").toLowerCase().includes(q));
  const hd=S.settings.hideDone;

  // Duas fontes de entrada: a atividade (pelo dia dela) e cada subetapa que tenha dia próprio.
  // Uma atividade sem dia cujas subetapas já estão distribuídas não vai para "sem dia" —
  // o cronograma dela está expresso nas etapas.
  // porSub alimenta a legenda e é contado ANTES do filtro por subcategoria,
  // senão o chip que tira o filtro sumiria junto com os itens.
  const porSub={}, fs=S.settings.agendaSub||null;
  w.acts.forEach(a=>{
    const steps=a.steps||[];
    const bateNaAtividade=casa(null,a)||steps.some(s=>casa(null,s));
    const temStepComDia=steps.some(x=> x.due!=null && x.due>=0 && x.due<=6);
    steps.forEach(s=>{
      const semDiaPropria=(s.due==null || s.due<0 || s.due>6);
      if(hd && s.done) return;
      if(!(casa(null,s)||casa(null,a))) return;
      // subetapa sem dia numa atividade cujo cronograma está nas etapas: sem isto ela
      // não aparecia em lugar nenhum — a atividade-mãe não vai para "sem dia" nesse caso
      if(semDiaPropria){
        if(!(a.due==null && temStepComDia)) return;
        porSub[a.sub]=(porSub[a.sub]||0)+(s.done?0:1);
        if(fs && a.sub!==fs) return;
        semDia.push({a,s,pend:!s.done});
        return;
      }
      porSub[a.sub]=(porSub[a.sub]||0)+(s.done?0:1);
      if(fs && a.sub!==fs) return;
      cols[s.due].push({a,s,pend:!s.done});
    });
    if(hd && a.status==="done") return;
    if(!bateNaAtividade) return;
    const e={a,pend:a.status!=="done"&&a.status!=="skip"};
    if(a.due!=null && a.due>=0 && a.due<=6) porSub[a.sub]=(porSub[a.sub]||0)+(e.pend?1:0);
    else if(!steps.some(s=> s.due!=null)) porSub[a.sub]=(porSub[a.sub]||0)+(e.pend?1:0);
    if(fs && a.sub!==fs) return;
    if(a.due!=null && a.due>=0 && a.due<=6) cols[a.due].push(e);
    else if(!steps.some(s=> s.due!=null)) semDia.push(e);
  });

  // rotinas diárias entram na agenda como qualquer outra linha do dia
  S.habits.forEach(h=>{
    if(h.mode!=="daily") return;
    const dias=rotDias(h,cur); if(!dias.length) return;
    const st=rotEstado(cur,h.id), its=rotItens(h);
    dias.forEach(i=>{
      (its||[null]).forEach(it=>{
        const done=it ? !!(st.i[it.id]||{})[i] : !!st.d[i];
        const txt=it?it.name:h.name;
        if(hd && done) return;
        if(!(casa(txt)||casa(h.name))) return;
        porSub[h.sub]=(porSub[h.sub]||0)+(done?0:1);
        if(fs && h.sub!==fs) return;
        cols[i].push({h,it,dia:i,pend:!done,at:(it&&it.at)||h.at||null});
      });
    });
  });

  const cnt=arr=> arr.filter(e=>e.pend).length;
  const hoje=today>=0?cnt(cols[today]):0;
  const atrasadas=today>0?cnt(cols.slice(0,today).flat()):0;
  const restoSemana=today>=0?cnt(cols.slice(today+1).flat()):cnt(cols.flat());

  // pendentes primeiro; dentro disso, por horário — os sem horário vão para o fim do bloco
  const hora=e=> (e.h ? e.at : (e.s?e.s.at:e.a.at))||null;
  const ordena=(x,y)=>{
    if(y.pend-x.pend) return y.pend-x.pend;
    const hx=hora(x), hy=hora(y);
    if(hx&&hy) return hx.localeCompare(hy);
    if(hx) return -1; if(hy) return 1;
    return ((x.a&&x.a.created)||0)-((y.a&&y.a.created)||0);
  };
  const foco=S.settings.agendaDay;   // null = semana inteira; 0..6 = um dia; "none" = sem dia
  const dayCol=(i)=>{
    const d=new Date(mon); d.setUTCDate(mon.getUTCDate()+i);
    const list=cols[i].slice().sort(ordena);
    const n=cnt(list);
    const cls=[i===today?"today":(today>=0&&i<today?"past":""), i>=5?"wknd":""].filter(Boolean).join(" ");
    // na grade semanal a rotina vira uma pastilha: sete dias de café da manhã afogariam as tarefas.
    // o detalhe fica na visão do dia, a um clique de distância.
    const rots=list.filter(e=>e.h), tarefas=list.filter(e=>!e.h);
    const feitasR=rots.filter(e=>!e.pend).length;
    return `<div class="day ${cls}">
      <div class="dayhead"><span>${DIAS[i]}</span><b>${d.getUTCDate()}</b>${n?`<span class="n mono">${n}</span>`:""}</div>
      ${tarefas.length?tarefas.map(e=> agendaItem(e, today>=0 && i<today && e.pend)).join(""):(rots.length?"":`<span class="none-txt">—</span>`)}
      ${rots.length?`<button class="rotsum ${feitasR>=rots.length?"full":""}" data-agday="${i}"
        title="${rots.length} rotina${rots.length>1?"s":""} neste dia, ${feitasR} concluída${feitasR===1?"":"s"} — clique para abrir o dia">
        <i></i>rotinas <b>${feitasR}/${rots.length}</b></button>`:""}
    </div>`;
  };
  const dias=foco==null?[0,1,2,3,4,5,6]:(foco==="none"?[]:[Number(foco)]);
  const diaUnico=(foco!=null&&foco!=="none")?Number(foco):null;
  const mostraSemDia=foco==null||foco==="none";
  const filtro=[["","Semana"],...DIAS.map((d,i)=>[String(i),d]),["none","sem dia"]]
    .map(([v,r])=>{
      const ativo=(v===""&&foco==null)||(v!==""&&String(foco)===v);
      const qtd=v===""?null:(v==="none"?cnt(semDia):cnt(cols[Number(v)]));
      return `<button data-agday="${v}" aria-pressed="${ativo}" class="${v!==""&&Number(v)===today?"hoje":""}">${r}${qtd?`<i>${qtd}</i>`:""}</button>`;
    }).join("");

  // legenda: só as subcategorias que aparecem na agenda desta semana
  const legenda=allSubs().filter(s=> porSub[s.id]!=null).map(s=>{
    const n=porSub[s.id]||0, on=fs===s.id;
    return `<button class="lg" data-agsub="${s.id}" aria-pressed="${on}" style="--c:${subVar(s.id)}"
      title="${on?"Mostrar todas as subcategorias":"Ver só "+esc(s.name)+" na agenda"}">
      <i></i>${esc(s.name)}${n?`<b>${n}</b>`:""}
    </button>`;
  }).join("");
  const min=!!S.settings.agendaFold;

  $("#agenda").innerHTML=`<div class="agenda ${min?"fold":""}">
    <div class="agenda-head">
      <button class="agtoggle" data-agfold="1" aria-expanded="${!min}" aria-controls="agenda-corpo"
        title="${min?"Expandir":"Minimizar"} a agenda">
        ${IC.chev}<h2>Agenda da semana</h2>
      </button>
      <span class="sum">${isNow
        ? `<b>${hoje}</b> para hoje · <b>${restoSemana}</b> no resto da semana${atrasadas?` · <span class="od">${atrasadas} em atraso</span>`:""}`
        : `<b>${cnt(cols.flat())}</b> com dia marcado · <b>${cnt(semDia)}</b> sem dia`}</span>
      ${min?"":`<div class="dayfilter">${filtro}</div>`}
    </div>
    ${min||!legenda?"":`<div class="agleg">${legenda}${fs?`<button class="lg" data-agsub="" title="Mostrar todas as subcategorias" style="--c:var(--ink-3)"><i></i>todas</button>`:""}</div>`}
    ${diaUnico!=null
      ? dayView(diaUnico, cols[diaUnico], today, mon)
      : `<div class="days" id="agenda-corpo">
      ${dias.map(dayCol).join("")}
      ${mostraSemDia?`<div class="day none">
        <div class="dayhead"><span>sem dia</span>${cnt(semDia)?`<span class="n mono">${cnt(semDia)}</span>`:""}</div>
        ${semDia.length?semDia.slice().sort(ordena).map(e=> agendaItem(e,false)).join(""):`<span class="none-txt">—</span>`}
      </div>`:""}
    </div>`}
  </div>`;
}

// Um dia sozinho não é uma coluna estreita com letra miúda: é o panorama do dia.
// Horário à esquerda, tarefa em destaque, e uma barra que responde "estou seguindo
// o que planejei?" — concluídas cheias, em andamento em meio-tom.
const MESLONGO=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
function dayView(i,lista,today,mon){
  const d=new Date(mon); d.setUTCDate(mon.getUTCDate()+i);
  // aqui a ordem é a do relógio, não a de pendência: é a leitura do dia como ele acontece
  const hr=e=> (e.h ? e.at : (e.s?e.s.at:e.a.at))||null;
  const list=lista.slice().sort((x,y)=>{
    const hx=hr(x), hy=hr(y);
    if(hx&&hy&&hx!==hy) return hx.localeCompare(hy);
    if(hx&&!hy) return -1;
    if(!hx&&hy) return 1;
    return ((x.a&&x.a.created)||0)-((y.a&&y.a.created)||0);
  });
  const eh=i===today, passou=today>=0&&i<today;
  const stOf=e=> e.h ? (e.pend?"todo":"done") : (e.s ? stepSt(e.s) : e.a.status);
  const feitos=list.filter(e=> stOf(e)==="done").length;
  const andando=list.filter(e=> stOf(e)==="doing").length;
  const adiadas=list.filter(e=> stOf(e)==="skip").length;
  const base=list.length-adiadas;                       // adiada sai da conta: não era mais o plano
  const pct=base?Math.round(feitos*100/base):null;
  const pctDoing=base?Math.round(andando*100/base):0;

  // agrupa por horário; sem horário vira um bloco só, no fim
  const comHora=list.filter(hr), semHora=list.filter(e=> !hr(e));
  const blocos=[];
  comHora.forEach(e=>{
    const h=hr(e);
    const ult=blocos[blocos.length-1];
    if(ult&&ult.h===h) ult.itens.push(e); else blocos.push({h,itens:[e]});
  });
  if(semHora.length) blocos.push({h:null,itens:semHora});

  const agora=eh? new Date().toTimeString().slice(0,5) : null;
  const corpo=blocos.length? blocos.map(b=>{
    const passada=agora&&b.h&&b.h<agora&&b.itens.some(e=> stOf(e)!=="done"&&stOf(e)!=="skip");
    return `<div class="dv-slot ${b.h?"":"livre"} ${passada?"venceu":""}">
      <div class="dv-time mono">${b.h?esc(b.h):"sem hora"}</div>
      <div class="dv-cards">${b.itens.map(e=> dayItem(e, passou&&e.pend)).join("")}</div>
    </div>`;
  }).join("") : `<p class="dv-vazio">Nenhuma atividade marcada para este dia. Use o <span class="mono">›</span> de uma atividade para dar um dia a ela.</p>`;

  return `<div class="dayview ${eh?"hoje":""} ${passou?"passou":""}" id="agenda-corpo">
    <div class="dv-head">
      <div class="dv-when">
        <b>${DIAS[i]}</b>
        <span>${d.getUTCDate()} de ${MESLONGO[d.getUTCMonth()]}</span>
        ${eh?`<em>hoje</em>`:""}
      </div>
      <div class="dv-stat">
        <div class="dv-pct mono">${pct==null?"—":pct+"%"}</div>
        <div class="dv-leg">${base? `${feitos} de ${base} concluída${base>1?"s":""}`:"nada planejado"}${andando?` · ${andando} em andamento`:""}${adiadas?` · ${adiadas} adiada${adiadas>1?"s":""}`:""}</div>
      </div>
    </div>
    <div class="dv-bar" role="img" aria-label="${pct==null?"Sem atividades":pct+"% do dia concluído"}">
      <i class="feito" style="width:${pct||0}%"></i>
      <i class="andando" style="width:${pctDoing}%"></i>
    </div>
    <div class="dv-track">${corpo}</div>
  </div>`;
}
function dayItem(e,late){
  if(e.h){
    const h=e.h, it=e.it, sub=findSub(h.sub), feito=!e.pend;
    const chaveRot=(h.weight||1)>1;
    return `<div class="dvi rot ${chaveRot?"chave":""} ${late?"late":""}" data-s="${feito?"done":"todo"}" style="--c:${subVar(h.sub)}">
      <button class="dvbox" data-rot="${h.id}:${it?it.id:""}:${e.dia}" title="${feito?"Feito":"Pendente"} — clique para marcar" aria-label="Rotina ${feito?"feita":"pendente"}">${feito?IC.check:""}</button>
      <button class="dvtxt" data-gorot="${h.id}" title="Ver a rotina na categoria">
        <span class="t">${esc(it?it.name:h.name)}</span>
        <span class="m"><i></i>${esc(sub?sub.name:"")}${it?` · ${esc(h.name)}`:""}</span>
      </button>
      <span class="dv-chip ${chaveRot?"":"rotina"}">${chaveRot?"prioridade":"rotina"}</span>
    </div>`;
  }
  const a=e.a, s=e.s, sub=findSub(a.sub);
  const st=s?stepSt(s):a.status;
  // a subetapa herda a prioridade da atividade: se o capítulo é peso 3, reescrever
  // a conclusão dele também é o que importa naquele dia
  const chave=(a.weight||1)>1;
  const steps=a.steps||[], sdone=steps.filter(x=>x.done).length;
  const alvo=s?`data-steptoggle="${a.id}:${s.id}"`:`data-cycle="${a.id}"`;
  return `<div class="dvi ${chave?"chave":""} ${late?"late":""}" data-s="${st}" style="--c:${subVar(a.sub)}">
    <button class="dvbox" ${alvo} title="${STNAME[st]} — clique para avançar" aria-label="Estado: ${STNAME[st]}">${stIcon(st)}</button>
    <button class="dvtxt" data-jump="${a.id}" title="Ir para a atividade">
      <span class="t">${esc(s?s.text:a.text)}</span>
      <span class="m"><i></i>${esc(sub?sub.name:"")}${s?` · ${esc(a.text)}`:""}${!s&&steps.length?` · ${sdone}/${steps.length} subetapas`:""}${late?" · atrasada":""}</span>
    </button>
    ${linkBtn(s?(s.url||a.url):a.url)}
    ${chave?`<span class="dv-chip">prioridade</span>`:""}
  </div>`;
}
function agendaItem(e,late){
  if(e.h){
    const h=e.h, it=e.it, sub=findSub(h.sub), feito=!e.pend;
    return `<div class="ai rot" data-s="${feito?"done":"todo"}" style="--c:${subVar(h.sub)}">
      <button class="abox" data-rot="${h.id}:${it?it.id:""}:${e.dia}" title="${feito?"Feito":"Pendente"} — clique para marcar" aria-label="Rotina ${feito?"feita":"pendente"}">${feito?IC.check:""}</button>
      <button class="atxt" data-gorot="${h.id}" title="Ver a rotina na categoria">
        <span>${e.at?`<time>${esc(e.at)}</time> `:""}${esc(it?it.name:h.name)}</span>
        <em>${esc(it?h.name:(sub?sub.name:""))} · rotina</em>
      </button>
    </div>`;
  }
  const a=e.a, s=e.s;
  const sub=findSub(a.sub);
  const cor=`--c:${subVar(a.sub)}`;
  if(s){
    // subetapa com dia próprio: o contexto é a atividade-mãe, não a subcategoria
    const sst=stepSt(s);
    return `<div class="ai substep ${late?"late":""}" data-s="${sst}" style="${cor}">
      <button class="abox" data-steptoggle="${a.id}:${s.id}" title="${STNAME[sst]} — clique para avançar" aria-label="Subetapa ${STNAME[sst]}">${stIcon(sst)}</button>
      <button class="atxt" data-jump="${a.id}" title="Ir para a atividade">
        <span>${s.at?`<time>${esc(s.at)}</time> `:""}${esc(s.text)}</span>
        <em>${esc(a.text)}${late?" · atrasada":""}</em>
      </button>
      ${linkBtn(s.url||a.url)}
    </div>`;
  }
  const steps=a.steps||[], sdone=steps.filter(x=>x.done).length;
  return `<div class="ai ${late?"late":""}" data-s="${a.status}" style="${cor}">
    <button class="abox" data-cycle="${a.id}" title="${STNAME[a.status]} — clique para avançar" aria-label="Estado: ${STNAME[a.status]}">${stIcon(a.status)}</button>
    <button class="atxt" data-jump="${a.id}" title="Ir para a atividade">
      <span>${a.at?`<time>${esc(a.at)}</time> `:""}${esc(a.text)}</span>
      <em>${esc(sub?sub.name:"")}${steps.length?` · <s>${sdone}/${steps.length}</s>`:""}${late?" · atrasada":""}</em>
    </button>
    ${linkBtn(a.url)}
  </div>`;
}
// atalho para abrir o lugar onde a tarefa se resolve, sem passar pelo cartão
function linkBtn(u){
  return u?`<a class="go" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="Abrir ${esc(u)}" aria-label="Abrir o link">${IC.link}</a>`:"";
}

function itemHTML(a){
  const late=a.due!=null && a.status!=="done" && a.status!=="skip" && cur===todayKey() && a.due < ((new Date().getDay()||7)-1);
  const steps=a.steps||[], sdone=steps.filter(x=>x.done).length;
  // Os marcadores viraram os próprios controles: clicar no de dia troca o dia, no de
  // peso troca o peso. O resto foi para o menu — seis botões fixos desalinhavam a linha.
  const chips=[];
  if(steps.length) chips.push(`<button class="chip steps ${sdone===steps.length?"full":""}" data-steps="${a.id}" title="${sdone} de ${steps.length} subetapas concluídas — clique para ${a.open?"recolher":"mostrar"}">${sdone}/${steps.length}</button>`);
  // só entra na linha o marcador que diz alguma coisa; o resto vive no menu,
  // que mostra o valor atual ao lado de cada opção
  if((a.weight||1)>1) chips.push(`<button class="chip w" data-weight="${a.id}" title="Peso no cálculo — clique para alternar 1 › 2 › 3">peso ${a.weight}</button>`);
  if(a.due!=null) chips.push(`<button class="chip due ${late?"late":""}" data-due="${a.id}" title="Dia-alvo — clique para avançar">${DIAS[a.due]}</button>`);
  const tt=tempoTotal(a), sug=pesoSugerido(tt);
  if(tt) chips.push(`<button class="chip tempo" data-time="${a.id}" title="Tempo dedicado${(a.steps||[]).some(s=>tempoDe(s))?" (com as subetapas)":""} — clique para ajustar">${IC.clock}${fmtMin(tt)}</button>`);
  // tempo longo nem sempre é tarefa importante — a sugestão pode ser dispensada por item
  if(sug && sug!==(a.weight||1) && !a.sugOff)
    chips.push(`<span class="sugpar">
      <button class="chip sug" data-sugw="${a.id}:${sug}" title="${fmtMin(tt)} de trabalho sugere peso ${sug} em vez de ${a.weight||1} — clique para aplicar">› peso ${sug}</button>
      <button class="chip sugx" data-sugoff="${a.id}" title="Ignorar a sugestão de peso nesta atividade" aria-label="Ignorar a sugestão">×</button>
    </span>`);
  if(a.fromPush) chips.push(`<span class="chip carry" title="Veio adiada da semana anterior — concluí-la aqui rende um bônus de ${bonusPush()}%">veio adiada</span>`);
  else if(a.carried) chips.push(`<span class="chip carry">herdada</span>`);
  if(a.status==="skip") chips.push(`<span class="chip">adiada</span>`);
  tagsDe(a).forEach(t=> chips.push(`<button class="chip tag" data-tagq="${esc(t)}" title="Filtrar por #${esc(t)}">#${esc(t)}</button>`));
  if(a.url) chips.push(`<a class="chip lk" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" title="Abrir ${esc(a.url)}">${IC.link}${esc(urlLabel(a.url))}</a>`);
  // o horário só faz sentido depois que há um dia — por isso o campo aparece junto do chip do dia
  if(a.due!=null) chips.push(`<input class="timein ${a.at?"set":""}" type="time" value="${esc(a.at||"")}" data-attime="${a.id}" title="Horário desejado" aria-label="Horário da atividade">`);
  const open=!!a.open;
  return `<li class="itemwrap" data-s="${a.status}" data-id="${a.id}">
    <div class="item">
      <span class="grip" data-grip="${a.id}" draggable="true" title="Arrastar para reordenar ou mover de subcategoria">${IC.grip}</span>
      <button class="st" data-cycle="${a.id}" title="${STNAME[a.status]} — clique para avançar" aria-label="Estado: ${STNAME[a.status]}">${stIcon(a.status)}</button>
      <div class="itxt">
        <textarea class="t" rows="1" data-text="${a.id}" aria-label="Descrição da atividade">${esc(a.text)}</textarea>
      </div>
      ${chips.length?`<div class="tags">${chips.join("")}</div>`:""}
      <div class="irow">
        <button class="ib ${open?"open":""}" data-steps="${a.id}" data-on="${steps.length?1:0}" aria-expanded="${open}" title="${steps.length?"Mostrar subetapas":"Dividir em subetapas"}">${IC.chev}</button>
        <button class="ib" data-menu="${a.id}" data-menu-id="act-${a.id}" title="Mais opções" aria-haspopup="menu">${IC.more}</button>
      </div>
    </div>
    ${a.linkOpen?`<div class="linkrow">
      ${IC.link}
      <input type="url" inputmode="url" data-linkval="${a.id}" value="${esc(a.url||"")}"
        placeholder="Cole o endereço — ex: drive.google.com/… · Enter para salvar" autocomplete="off" aria-label="Link da atividade">
      ${a.url?`<button class="ib" data-linkdel="${a.id}" title="Remover o link">${IC.x}</button>`:""}
    </div>`:""}
    ${a.timeOpen?`<div class="linkrow timerow">
      ${IC.clock}
      <input type="text" inputmode="numeric" data-timeval="${a.id}" value="${tempoDe(a)?esc(fmtMin(tempoDe(a))):""}"
        placeholder="Tempo nesta atividade — 45, 1h30, 90m · Enter para salvar" autocomplete="off" aria-label="Tempo dedicado">
      <span class="quick">
        <button class="qb" data-timeadd="${a.id}:15" title="Somar 15 minutos">+15</button>
        <button class="qb" data-timeadd="${a.id}:30" title="Somar 30 minutos">+30</button>
        <button class="qb" data-timeadd="${a.id}:60" title="Somar 1 hora">+1h</button>
        ${tempoDe(a)?`<button class="qb zero" data-timeadd="${a.id}:0" title="Zerar">zerar</button>`:""}
      </span>
    </div>`:""}
    ${a.tagOpen?`<div class="linkrow tagrow">
      ${IC.tag}
      <input type="text" data-tagval="${a.id}" value="${esc(tagsDe(a).join(", "))}"
        placeholder="Etiquetas separadas por vírgula — ex: casa, urgente · Enter para salvar" autocomplete="off" aria-label="Etiquetas da atividade"
        list="taglist">
    </div>`:""}
    ${open?`<div class="steps">
      ${steps.map(s=>{
        const slate=s.due!=null && !s.done && cur===todayKey() && s.due < ((new Date().getDay()||7)-1);
        const sst=stepSt(s);
        return `<div class="step ${sst==="done"?"done":sst==="doing"?"doing":""}" data-aid="${a.id}" data-sid="${s.id}">
        <span class="sgrip" data-stepgrip="${a.id}:${s.id}" draggable="true" title="Arrastar para reordenar">${IC.grip}</span>
        <button class="sbox" data-steptoggle="${a.id}:${s.id}" title="${STNAME[sst]} — clique para avançar" aria-label="Estado: ${STNAME[sst]}">${stIcon(sst)}</button>
        <textarea class="stx" rows="1" data-steptext="${a.id}:${s.id}" aria-label="Descrição da subetapa">${esc(s.text)}</textarea>
        ${tempoDe(s)?`<button class="chip tempo mini" data-stime="${a.id}:${s.id}" title="Tempo dedicado — clique para ajustar">${fmtMin(tempoDe(s))}</button>`:""}
        ${tagsDe(s).length?`<span class="stags">${tagsDe(s).map(t=>`<button class="chip tag mini" data-tagq="${esc(t)}" title="Filtrar por #${esc(t)}">#${esc(t)}</button>`).join("")}</span>`:""}
        ${s.url?`<a class="sgo" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="Abrir ${esc(s.url)}">${IC.link}</a>`:""}
        ${s.due!=null?`<input class="timein ${s.at?"set":""}" type="time" value="${esc(s.at||"")}" data-attime="${a.id}:${s.id}" title="Horário desejado" aria-label="Horário da subetapa">`:""}
        <button class="sday ${s.due!=null?"set":""} ${slate?"late":""}" data-stepdue="${a.id}:${s.id}" title="Dia-alvo da subetapa">${s.due!=null?DIAS[s.due]:"dia"}</button>
        <button class="sx" data-smenu="${a.id}:${s.id}" data-menu-id="step-${s.id}" title="Mais opções" aria-haspopup="menu">${IC.more}</button>
      </div>
      ${s.linkOpen?`<div class="linkrow step">
        ${IC.link}
        <input type="url" inputmode="url" data-slinkval="${a.id}:${s.id}" value="${esc(s.url||"")}"
          placeholder="Endereço desta subetapa — Enter para salvar" autocomplete="off" aria-label="Link da subetapa">
        ${s.url?`<button class="ib" data-slinkdel="${a.id}:${s.id}" title="Remover o link">${IC.x}</button>`:""}
      </div>`:""}
      ${s.timeOpen?`<div class="linkrow step timerow">
        ${IC.clock}
        <input type="text" inputmode="numeric" data-stimeval="${a.id}:${s.id}" value="${tempoDe(s)?esc(fmtMin(tempoDe(s))):""}"
          placeholder="Tempo nesta subetapa — 45, 1h30 · Enter para salvar" autocomplete="off" aria-label="Tempo dedicado">
        <span class="quick">
          <button class="qb" data-stimeadd="${a.id}:${s.id}:15">+15</button>
          <button class="qb" data-stimeadd="${a.id}:${s.id}:30">+30</button>
          <button class="qb" data-stimeadd="${a.id}:${s.id}:60">+1h</button>
          ${tempoDe(s)?`<button class="qb zero" data-stimeadd="${a.id}:${s.id}:0">zerar</button>`:""}
        </span>
      </div>`:""}
      ${s.tagOpen?`<div class="linkrow step tagrow">
        ${IC.tag}
        <input type="text" data-stagval="${a.id}:${s.id}" value="${esc(tagsDe(s).join(", "))}"
          placeholder="Etiquetas separadas por vírgula · Enter para salvar" autocomplete="off" aria-label="Etiquetas da subetapa" list="taglist">
      </div>`:""}`;}).join("")}
      <div class="stepadd"><input type="text" data-stepadd="${a.id}" placeholder="Nova subetapa — Enter para salvar" autocomplete="off"></div>
    </div>`:""}
  </li>`;
}
// box-sizing é border-box, então a altura precisa somar as bordas —
// sem isso a última linha fica cortada por alguns pixels
function autosize(t){
  t.style.height="auto";
  const cs=getComputedStyle(t);
  const b=(parseFloat(cs.borderTopWidth)||0)+(parseFloat(cs.borderBottomWidth)||0);
  t.style.height=(t.scrollHeight+b)+"px";
}
function scale(sel,field,val){
  $(sel).innerHTML=[1,2,3,4,5].map(n=>`<button data-scale="${field}" data-v="${n}" aria-pressed="${val===n}">${n}</button>`).join("");
}

/* ---------- análise da semana ---------- */
// Tudo é derivado do que já está gravado — nada de campo novo só para o relatório.
function analiseSemana(k){
  const w=week(k), mon=keyMonday(k);
  const acts=(w.acts||[]).filter(a=> a.status!=="skip");
  const adiadas=(w.acts||[]).filter(a=> a.status==="skip").length;
  const feitas=acts.filter(a=>a.status==="done").length;

  const steps=acts.flatMap(a=> (a.steps||[]).map(s=>({a,s})));
  const stepsFeitas=steps.filter(x=>x.s.done).length;

  // por dia: quantas linhas tinham aquele dia e quantas saíram
  const dias=[0,1,2,3,4,5,6].map(()=>({plan:0,feito:0}));
  acts.forEach(a=>{
    if(a.due!=null&&a.due>=0&&a.due<=6){ dias[a.due].plan++; if(a.status==="done") dias[a.due].feito++; }
    (a.steps||[]).forEach(s=>{ if(s.due!=null&&s.due>=0&&s.due<=6){ dias[s.due].plan++; if(s.done) dias[s.due].feito++; } });
  });
  S.habits.forEach(h=>{
    if(h.mode!=="daily") return;
    const at=rotDias(h,k); if(!at.length) return;
    const st=rotEstado(k,h.id);
    at.forEach(i=>{ dias[i].plan++; if(rotDiaFeito(h,st,i)) dias[i].feito++; });
  });

  // pontualidade: só atividades com dia-alvo e carimbo de conclusão
  let noPrazo=0, atrasadas=0, semCarimbo=0, aindaAbertas=0;
  acts.forEach(a=>{
    if(a.due==null||a.due<0||a.due>6) return;
    if(a.status!=="done"){ aindaAbertas++; return; }
    if(!a.doneAt){ semCarimbo++; return; }
    const f=new Date(a.doneAt);
    const idx=Math.floor((Date.UTC(f.getFullYear(),f.getMonth(),f.getDate())-mon.getTime())/864e5);
    if(idx<=a.due) noPrazo++; else atrasadas++;
  });

  // esforço por subcategoria, na mesma régua de peso do percentual
  const porSub=allSubs().map(s=>{ const r=subScore(s.id,k); return {sub:s,pct:r.pct,num:r.num,den:r.den}; })
    .filter(x=> x.den>0).sort((a,b)=> b.den-a.den);

  // rotinas: aderência de cada uma
  const rotinas=S.habits.map(h=>{
    if(h.mode==="daily"){
      const at=rotDias(h,k); if(!at.length) return null;
      const st=rotEstado(k,h.id);
      const f=at.filter(i=> rotDiaFeito(h,st,i)).length;
      return {h,feito:f,total:at.length,pct:Math.round(f/at.length*100)};
    }
    const v=w.habits[h.id], c=typeof v==="number"?v:0;
    return {h,feito:c,total:h.target,pct:Math.round(Math.min(c/Math.max(1,h.target),1)*100)};
  }).filter(Boolean).sort((a,b)=> a.pct-b.pct);

  // etiquetas: quantas linhas de cada e quanto saiu
  const tags=new Map();
  (w.acts||[]).forEach(a=>{
    const reg=(t,ok)=>{ const o=tags.get(t)||{n:0,f:0}; o.n++; if(ok) o.f++; tags.set(t,o); };
    tagsDe(a).forEach(t=> reg(t,a.status==="done"));
    (a.steps||[]).forEach(s=> tagsDe(s).forEach(t=> reg(t,s.done)));
  });

  // tempo: total, por frente, e onde o peso escolhido destoa do que o relógio diz
  const comTempo=acts.filter(a=> tempoTotal(a)>0);
  const minTotal=acts.reduce((n,a)=> n+tempoTotal(a),0);
  const tempoSub=new Map();
  acts.forEach(a=>{ const t=tempoTotal(a); if(t) tempoSub.set(a.sub,(tempoSub.get(a.sub)||0)+t); });
  const ignoradas=comTempo.filter(a=> a.sugOff).length;
  const calib=comTempo.filter(a=> !a.sugOff).map(a=>({a,min:tempoTotal(a),sug:pesoSugerido(tempoTotal(a))}))
    .filter(x=> x.sug!=null);
  const batem=calib.filter(x=> x.sug===(x.a.weight||1)).length;
  const desalinhadas=calib.filter(x=> x.sug!==(x.a.weight||1))
    .sort((x,y)=> Math.abs(y.sug-(y.a.weight||1))-Math.abs(x.sug-(x.a.weight||1))||y.min-x.min);

  // adiamentos: o que saiu daqui e o que chegou adiado e rendeu bônus
  const adiadasProx=(w.pushed||[]);
  const pesoAdiado=adiadasProx.reduce((n,p)=> n+(p.peso||1),0);
  const vindas=acts.filter(a=> a.fromPush);
  const vindasFeitas=vindas.filter(a=> a.status==="done").length;

  const anterior=weekScore(shiftKey(k,-1)).pct;
  const atual=weekScore(k).pct;
  const ult=dataWeeks().filter(x=>x<k).slice(-4).map(x=>weekScore(x).pct).filter(v=>v!=null);

  return {acts,adiadas,feitas,steps:steps.length,stepsFeitas,dias,
    noPrazo,atrasadas,semCarimbo,aindaAbertas,porSub,rotinas,
    minTotal,comTempo:comTempo.length,tempoSub,calib:calib.length,batem,desalinhadas,ignoradas,
    adiadasProx,pesoAdiado,vindas:vindas.length,vindasFeitas,
    tags:[...tags.entries()].sort((a,b)=> b[1].n-a[1].n),
    atual,anterior,delta:(atual!=null&&anterior!=null)?atual-anterior:null,media4:avg(ult),
    retro:w.retro||{}};
}

function barrasDia(dias){
  const max=Math.max(1,...dias.map(d=>d.plan));
  const H=104, W=7*54;
  return `<svg viewBox="0 0 ${W} ${H+30}" width="100%" height="${H+30}" role="img" aria-label="Planejado e concluído por dia">
    ${dias.map((d,i)=>{
      const x=i*54+9, larg=36;
      const hp=d.plan? Math.max(4,Math.round(d.plan/max*H)) : 0;
      const hf=d.feito? Math.max(4,Math.round(d.feito/max*H)) : 0;
      return `<g>
        ${hp?`<rect x="${x}" y="${H-hp}" width="${larg}" height="${hp}" rx="4" fill="var(--line)"/>`:""}
        ${hf?`<rect x="${x}" y="${H-hf}" width="${larg}" height="${hf}" rx="4" fill="var(--ok)"/>`:""}
        ${d.plan?`<text x="${x+larg/2}" y="${H-hp-5}" text-anchor="middle" font-size="10.5" font-family="var(--mono)" fill="var(--ink-2)">${d.feito}/${d.plan}</text>`:""}
        <text x="${x+larg/2}" y="${H+16}" text-anchor="middle" font-size="10" font-family="var(--mono)" fill="var(--ink-3)">${DIAS[i]}</text>
      </g>`;
    }).join("")}
    <line x1="0" x2="${W}" y1="${H+0.5}" y2="${H+0.5}" stroke="var(--line-2)" stroke-width="1"/>
  </svg>`;
}

function renderAnalise(){
  const el=$("#analise"); if(!el) return;
  const A=analiseSemana(cur);
  const pct=A.atual;
  const seta=A.delta==null?"":(A.delta>0?"▲":A.delta<0?"▼":"=");
  const corDelta=A.delta==null?"var(--ink-3)":(A.delta>0?"var(--ok)":A.delta<0?"var(--crit)":"var(--ink-3)");

  const tiles=[
    ["Percentual da semana", pct==null?"—":pct+"%",
     A.delta==null?"sem semana anterior para comparar"
       :A.delta===0?"igual à semana anterior"
       :`${seta} ${Math.abs(A.delta)} ponto${Math.abs(A.delta)>1?"s":""} vs. a semana anterior`, corDelta],
    ["Atividades", `${A.feitas}/${A.acts.length}`, A.adiadas?`${A.adiadas} adiada${A.adiadas>1?"s":""} fora da conta`:"nenhuma adiada"],
    ["Subetapas", A.steps?`${A.stepsFeitas}/${A.steps}`:"—", A.steps?"":"nenhuma subetapa esta semana"],
    ["Média das 4 anteriores", A.media4==null?"—":A.media4+"%", pct!=null&&A.media4!=null?(pct>=A.media4?"acima da sua média":"abaixo da sua média"):""]
  ];

  const totalPont=A.noPrazo+A.atrasadas;
  const pontual=totalPont? Math.round(A.noPrazo/totalPont*100) : null;

  const maxSub=Math.max(1,...A.porSub.map(x=>x.den));

  el.innerHTML=`
    <div class="stats">${tiles.map(([k,v,d,c])=>`<div class="stat">
      <div class="k">${k}</div><div class="v">${esc(v)}</div>
      <div class="d" ${c?`style="color:${c}"`:""}>${esc(d)}</div></div>`).join("")}</div>

    <div class="an-grid">
      <div class="panel an">
        <h2>Distribuição pelos dias</h2>
        <p class="hint">O que estava marcado para cada dia e quanto saiu — atividades, subetapas e rotinas juntas.</p>
        <div class="chartwrap">${barrasDia(A.dias)}</div>
        <div class="legend"><span><i style="background:var(--line)"></i>planejado</span><span><i style="background:var(--ok)"></i>concluído</span></div>
      </div>

      <div class="panel an">
        <h2>Pontualidade</h2>
        <p class="hint">Atividades com dia-alvo, comparando o dia planejado com o dia em que foram marcadas.</p>
        ${totalPont?`
          <div class="pontnum mono" style="color:${pontual>=70?"var(--ok)":pontual>=40?"var(--warn)":"var(--crit)"}">${pontual}%</div>
          <div class="pontleg">${A.noPrazo} no dia planejado · ${A.atrasadas} depois do dia</div>
          <div class="pontbar"><i class="ok" style="width:${pontual}%"></i><i class="late" style="width:${100-pontual}%"></i></div>
        `:`<p class="vazio">Nenhuma atividade concluída com dia-alvo ainda nesta semana.</p>`}
        ${A.aindaAbertas?`<p class="obs">${A.aindaAbertas} com dia marcado ${A.aindaAbertas>1?"seguem":"segue"} em aberto.</p>`:""}
        ${A.adiadasProx.length?`<p class="obs">${A.adiadasProx.length} ${A.adiadasProx.length>1?"foram adiadas":"foi adiada"} para a semana seguinte${descontaPush()?` e ${A.adiadasProx.length>1?"seguem pesando":"segue pesando"} aqui`:" (desconto desligado)"}.</p>`:""}
        ${A.vindas?`<p class="obs">${A.vindasFeitas} de ${A.vindas} que ${A.vindas>1?"chegaram adiadas":"chegou adiada"} ${A.vindasFeitas===1?"saiu":"saíram"} com bônus de ${bonusPush()}%.</p>`:""}
        ${A.semCarimbo?`<p class="obs">${A.semCarimbo} ${A.semCarimbo>1?"não têm":"não tem"} registro da data de conclusão e ${A.semCarimbo>1?"ficaram":"ficou"} fora desta conta.</p>`:""}
      </div>
    </div>

    <div class="panel an">
      <h2>Onde foi o esforço</h2>
      <p class="hint">Peso total de cada frente nesta semana e quanto dele saiu do papel. A barra mais longa é a frente que mais ocupou o seu plano.</p>
      ${A.porSub.length?`<div class="esf">${A.porSub.map(x=>`
        <div class="esfrow" style="--c:${subVar(x.sub.id)}">
          <span class="esfn">${esc(x.sub.name)}</span>
          <span class="esfbar"><i style="width:${Math.round(x.den/maxSub*100)}%"><b style="width:${x.den?Math.round(x.num/x.den*100):0}%"></b></i></span>
          <span class="esfv mono">${x.pct==null?"—":x.pct+"%"}</span>
        </div>`).join("")}</div>`:`<p class="vazio">Nada planejado nesta semana.</p>`}
    </div>

    <div class="panel an">
      <h2>Tempo dedicado</h2>
      <p class="hint">Some o que você anotou em cada atividade e subetapa. Serve de contraprova do peso: o peso é a sua estimativa de importância, o relógio é o custo real.</p>
      ${A.minTotal?`
        <div class="an-two">
          <div>
            <div class="pontnum mono">${fmtMin(A.minTotal)}</div>
            <div class="pontleg">em ${A.comTempo} de ${A.acts.length} atividade${A.acts.length>1?"s":""} · média de ${fmtMin(Math.round(A.minTotal/Math.max(1,A.comTempo)))} por atividade anotada</div>
          </div>
          <div class="esf">${[...A.tempoSub.entries()].sort((a,b)=>b[1]-a[1]).map(([sid,min])=>{
            const s=findSub(sid), maxT=Math.max(...A.tempoSub.values());
            return `<div class="esfrow" style="--c:${subVar(sid)}">
              <span class="esfn">${esc(s?s.name:"—")}</span>
              <span class="esfbar"><i style="width:${Math.round(min/maxT*100)}%"><b style="width:100%"></b></i></span>
              <span class="esfv mono">${fmtMin(min)}</span>
            </div>`;}).join("")}</div>
        </div>
        <div class="calib">
          <div class="calibhead">Peso × relógio
            <span>${A.batem} de ${A.calib} com o peso que o tempo sugere${A.ignoradas?` · ${A.ignoradas} com a sugestão ignorada`:""} · faixas atuais: até ${fmtMin(limiteMedio())} peso 1, até ${fmtMin(limiteAlto())} peso 2, acima disso peso 3</span>
          </div>
          ${A.desalinhadas.length?`<div class="esf">${A.desalinhadas.slice(0,6).map(x=>`
            <div class="calibrow">
              <span class="esfn">${esc(x.a.text)}</span>
              <span class="calibv mono">${fmtMin(x.min)}</span>
              <span class="calibp">peso ${x.a.weight||1} <i>›</i> <b>${x.sug}</b></span>
              <button class="btn" data-sugw="${x.a.id}:${x.sug}">Aplicar</button>
            </div>`).join("")}</div>
            ${A.desalinhadas.length>6?`<p class="obs">e mais ${A.desalinhadas.length-6}.</p>`:""}`
          :`<p class="obs">Nenhum descompasso: onde há tempo anotado, o peso combina com o relógio.</p>`}
        </div>
      `:`<p class="vazio">Nenhum tempo anotado nesta semana. O marcador de relógio em cada atividade abre o campo — dá para digitar "45", "1h30" ou somar de 15 em 15.</p>`}
    </div>

    ${A.rotinas.length?`<div class="panel an">
      <h2>Aderência das rotinas</h2>
      <p class="hint">Da que menos saiu para a que mais saiu — o topo da lista é onde a semana escorregou.</p>
      <div class="esf">${A.rotinas.map(r=>`
        <div class="esfrow" style="--c:${subVar(r.h.sub)}">
          <span class="esfn">${esc(r.h.name)}${(r.h.weight||1)>1?` <b class="pesoinl">peso ${r.h.weight}</b>`:""}</span>
          <span class="esfbar"><i style="width:100%"><b style="width:${r.pct}%"></b></i></span>
          <span class="esfv mono">${r.feito}/${r.total}</span>
        </div>`).join("")}</div>
    </div>`:""}

    ${A.tags.length?`<div class="panel an">
      <h2>Etiquetas da semana</h2>
      <p class="hint">Quantas linhas carregaram cada etiqueta e quantas foram concluídas.</p>
      <div class="tagcloud">${A.tags.map(([t,o])=>`
        <button class="chip tag" data-tagq="${esc(t)}" title="Filtrar a semana por #${esc(t)}">#${esc(t)} <b>${o.f}/${o.n}</b></button>`).join("")}</div>
    </div>`:""}

    ${(A.retro.win||A.retro.block||A.retro.next)?`<div class="panel an">
      <h2>Retrospectiva registrada</h2>
      ${A.retro.win?`<div class="retroline"><span>O que funcionou</span><p>${esc(A.retro.win)}</p></div>`:""}
      ${A.retro.block?`<div class="retroline"><span>O que travou</span><p>${esc(A.retro.block)}</p></div>`:""}
      ${A.retro.next?`<div class="retroline"><span>Foco da próxima</span><p>${esc(A.retro.next)}</p></div>`:""}
      ${(A.retro.energy||A.retro.mood)?`<div class="retroline"><span>Escalas</span><p>${A.retro.energy?`energia ${A.retro.energy}/5`:""}${A.retro.energy&&A.retro.mood?" · ":""}${A.retro.mood?`satisfação ${A.retro.mood}/5`:""}</p></div>`:""}
    </div>`:`<p class="hint" style="margin:0 0 18px">A retrospectiva desta semana ainda está em branco — ela aparece aqui depois de preenchida na aba Semana.</p>`}
  `;
}

/* ---------- render: histórico ---------- */
function renderHist(){
  $("#anweek").textContent=cur.replace("-W"," · semana ")+" · "+rangeLabel(cur);
  renderAnalise();
  const ks=dataWeeks();
  const series=ks.map(k=> ({k,total:weekScore(k).pct,a:S.areas.map(a=> areaScore(a,k).pct)}));
  const done=series.filter(s=> s.total!=null);

  // sequência de semanas na meta (a partir da mais recente com dados)
  let streak=0;
  for(let i=done.length-1;i>=0;i--){ if(done[i].total>=S.settings.goal) streak++; else break; }
  let best=0,run=0; done.forEach(s=>{ if(s.total>=S.settings.goal){run++;best=Math.max(best,run);} else run=0; });

  const avg4=avg(done.slice(-4).map(s=>s.total)), avgAll=avg(done.map(s=>s.total));
  const w=week(cur);
  const totalActs=Object.values(S.weeks).reduce((n,x)=> n+((x.acts||[]).filter(a=>a.status==="done").length),0);

  $("#stats").innerHTML=[
    ["Semana atual", weekScore(cur).pct==null?"—":weekScore(cur).pct+"%", `${w.acts.filter(a=>a.status==="done").length} de ${w.acts.length} atividades`],
    ["Média 4 semanas", avg4==null?"—":avg4+"%", avgAll==null?"":"média geral "+avgAll+"%"],
    ["Sequência na meta", streak+(streak===1?" semana":" semanas"), `meta ${S.settings.goal}% · recorde ${best}`],
    ["Semanas registradas", String(done.length), totalActs+" atividades concluídas"]
  ].map(([k,v,d])=>`<div class="stat"><div class="k">${k}</div><div class="v">${esc(v)}</div><div class="d">${esc(d)}</div></div>`).join("");

  $("#chart").innerHTML=chartSVG(series.slice(-14));

  // tabela por subcategoria
  const look=8; $("#lookback").textContent=look;
  const recent=ks.slice(-look);
  let rows="";
  S.areas.forEach(area=>{
    area.subs.forEach(sub=>{
      const vals=recent.map(k=> subScore(sub.id,k).pct);
      const m=avg(vals.filter(v=> v!=null));
      const acts=recent.reduce((n,k)=> n+week(k).acts.filter(a=>a.sub===sub.id).length,0);
      rows+=`<tr>
        <td style="width:34%"><span style="display:inline-block;width:3px;height:13px;background:var(--${area.tone});border-radius:2px;vertical-align:-2px;margin-right:8px"></span>${esc(sub.name)}</td>
        <td class="mono" style="width:52px;text-align:right;padding-right:14px">${m==null?"—":m+"%"}</td>
        <td><div class="tbar"><i style="width:${m||0}%;background:var(--${area.tone})"></i></div></td>
        <td style="width:110px">${sparkSVG(vals,`var(--${area.tone})`)}</td>
        <td class="mono" style="width:64px;text-align:right;color:var(--ink-3);font-size:12px">${acts} ativ.</td>
      </tr>`;
    });
  });
  $("#subtable").innerHTML=`<thead><tr><th>Subcategoria</th><th style="text-align:right">Média</th><th></th><th>Trajetória</th><th style="text-align:right">Volume</th></tr></thead><tbody>${rows}</tbody>`;

  // alertas
  const last3=ks.slice(-3);
  const al=[];
  allSubs().forEach(s=>{
    const acts=last3.reduce((n,k)=> n+week(k).acts.filter(a=>a.sub===s.id).length,0);
    const hab=S.habits.some(h=>h.sub===s.id);
    if(last3.length>=2 && acts===0 && !hab) al.push([ "var(--warn)", `<b>${esc(s.name)}</b> está sem atividades há ${last3.length} semanas. Frente esquecida ou fora do escopo atual?`]);
  });
  if(done.length>=2){
    const a=done[done.length-1], b=done[done.length-2];
    if(a.total-b.total<=-15) al.push(["var(--crit)",`Queda de ${b.total-a.total} pontos entre <span class="mono">${b.k}</span> e <span class="mono">${a.k}</span>. Vale olhar a retrospectiva daquela semana.`]);
    if(a.total-b.total>=15) al.push(["var(--ok)",`Alta de ${a.total-b.total} pontos na última semana registrada.`]);
  }
  S.areas.forEach(a=>{
    const vals=recent.map(k=> areaScore(a,k).pct).filter(v=>v!=null);
    const m=avg(vals); if(m!=null && m<40 && vals.length>=3) al.push(["var(--warn)",`<b>${esc(a.name)}</b> está em ${m}% de média nas últimas semanas — abaixo do resto do painel.`]);
  });
  const skipped=Object.entries(S.weeks).reduce((n,[k,x])=> n+(x.acts||[]).filter(a=>a.status==="skip").length,0);
  if(skipped>=6) al.push(["var(--ink-3)",`${skipped} atividades adiadas no total. Adiar sempre a mesma coisa costuma significar que ela não é prioridade — ou que está grande demais.`]);
  $("#alerts").innerHTML=al.length?al.map(([c,t])=>`<div class="warnrow"><span class="dot" style="background:${c}"></span><span>${t}</span></div>`).join("")
    :`<div class="warnrow"><span class="dot" style="background:var(--ok)"></span><span>Nenhum desequilíbrio evidente. Registre mais algumas semanas para análises melhores.</span></div>`;

  // tabela de semanas
  $("#weektable").innerHTML=`<thead><tr><th>Semana</th><th>Período</th><th style="text-align:right">Total</th><th></th><th>Atividades</th><th>Energia</th><th></th></tr></thead><tbody>`+
    ks.slice().reverse().map(k=>{
      const s=weekScore(k), x=week(k), r=x.retro||{};
      return `<tr>
        <td class="mono">${k}${k===cur?' <span class="chip w">aberta</span>':""}</td>
        <td style="color:var(--ink-3);font-size:12.5px">${rangeLabel(k)}</td>
        <td class="mono" style="text-align:right;padding-right:14px">${s.pct==null?"—":s.pct+"%"}</td>
        <td style="width:120px"><div class="tbar"><i style="width:${s.pct||0}%;background:${s.pct>=S.settings.goal?"var(--ok)":"var(--accent)"}"></i></div></td>
        <td class="mono" style="font-size:12.5px">${x.acts.filter(a=>a.status==="done").length}/${x.acts.length}</td>
        <td class="mono" style="font-size:12.5px;color:var(--ink-3)">${r.energy?r.energy+"/5":"—"}</td>
        <td><button class="btn" data-go="${k}" style="padding:3px 9px;font-size:12px">Abrir</button></td>
      </tr>`;
    }).join("")+`</tbody>`;
  if(!ks.length) $("#weektable").innerHTML=`<tbody><tr><td style="color:var(--ink-3);font-style:italic;padding:8px 0">Nada registrado ainda.</td></tr></tbody>`;
}
function avg(a){ return a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null; }

function chartSVG(series){
  const W=Math.max(560,series.length*64), H=200, P={t:14,r:14,b:30,l:34};
  const iw=W-P.l-P.r, ih=H-P.t-P.b;
  const x=i=> P.l+(series.length<2?iw/2:i*iw/(series.length-1));
  const y=v=> P.t+ih-(v/100)*ih;
  let g="";
  [0,25,50,75,100].forEach(v=>{
    g+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>`;
    g+=`<text x="${P.l-8}" y="${y(v)+4}" text-anchor="end" font-size="10" font-family="var(--mono)" fill="var(--ink-3)">${v}</text>`;
  });
  if(!series.length) return `<svg width="${W}" height="${H}">${g}<text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="13" fill="var(--ink-3)">Sem semanas registradas.</text></svg>`;
  const line=(vals,color,width,op)=>{
    const pts=vals.map((v,i)=> v==null?null:[x(i),y(v)]).filter(Boolean);
    if(!pts.length) return "";
    const d=pts.map((p,i)=> (i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`
      + pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${width>2?3:2}" fill="${color}"/>`).join("");
  };
  const totals=series.map(s=>s.total);
  const areaFill=(()=>{
    const pts=totals.map((v,i)=> v==null?null:[x(i),y(v)]).filter(Boolean);
    if(pts.length<2) return "";
    return `<path d="${pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ")} L ${pts[pts.length-1][0].toFixed(1)} ${P.t+ih} L ${pts[0][0].toFixed(1)} ${P.t+ih} Z" fill="var(--ink)" opacity=".055"/>`;
  })();
  const goalY=y(S.settings.goal);
  const meta=`<line x1="${P.l}" x2="${W-P.r}" y1="${goalY}" y2="${goalY}" stroke="var(--ok)" stroke-width="1" stroke-dasharray="3 4"/>`;
  const labels=series.map((s,i)=> `<text x="${x(i)}" y="${H-10}" text-anchor="middle" font-size="9.5" font-family="var(--mono)" fill="${s.k===cur?"var(--ink)":"var(--ink-3)"}">${s.k.split("-W")[1]}</text>`).join("");
  const lines=S.areas.map((a,ai)=> line(series.map(s=>s.a[ai]),`var(--${a.tone})`,1.6,.75)).join("");
  const lastPt=(()=>{ const i=totals.map((v,i)=>[v,i]).filter(p=>p[0]!=null).pop(); if(!i) return "";
    return `<circle cx="${x(i[1])}" cy="${y(i[0])}" r="5" fill="none" stroke="var(--ink)" stroke-width="1.6"/>`; })();
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}${meta}${areaFill}${lines}${line(totals,"var(--ink)",2.4,1)}${lastPt}${labels}</svg>`;
}
function sparkSVG(vals,color){
  const v=vals.filter(x=>x!=null); if(v.length<2) return `<span style="color:var(--ink-3);font-size:12px">—</span>`;
  const W=100,H=22;
  const pts=v.map((n,i)=>[4+i*(W-8)/(v.length-1), H-3-(n/100)*(H-6)]);
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="${pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ")}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${pts[pts.length-1][0].toFixed(1)}" cy="${pts[pts.length-1][1].toFixed(1)}" r="2.4" fill="${color}"/></svg>`;
}

/* ---------- render: ajustes ---------- */
function renderSet(){
  if(!$("#cats")) return;
  $("#cats").innerHTML=S.areas.map((a,ai)=>`
    <div class="areablock" data-area="${a.id}" style="margin-bottom:18px">
      <div class="setrow arearow">
        <span class="agrip" data-agrip="${a.id}" draggable="true" title="Arrastar para reordenar as áreas">${IC.grip}</span>
        <span style="width:3px;height:18px;background:var(--${a.tone});border-radius:2px;flex:none"></span>
        <div class="grow"><input type="text" value="${esc(a.name)}" data-aname="${a.id}" style="font-weight:640"></div>
        <button class="ib" data-amove="${a.id}" data-d="-1" title="Subir" ${ai===0?"disabled style=opacity:.3":""}>${IC.up}</button>
        <button class="ib" data-amove="${a.id}" data-d="1" title="Descer" ${ai===S.areas.length-1?"disabled style=opacity:.3":""}>${IC.down}</button>
        <button class="ib" data-adel="${a.id}" title="Excluir área">${IC.x}</button>
      </div>
      <div class="indent" style="--c:var(--${a.tone})">
        ${a.subs.map((s,si)=>`<div class="setrow">
          <button class="icobtn" data-icon="${s.id}" data-menu-id="ico-${s.id}" style="--c:${subVar(s.id)}"
            title="${s.icon?`Ícone: ${ICONES[chaveIcone(s)].n}`:`Ícone automático pelo nome: ${ICONES[chaveIcone(s)].n}`} — clique para trocar">${iconeSub(s)}</button>
          <div class="swatches">${Array.from({length:KN},(_,i)=>`<button class="sw" data-scolor="${s.id}:${i+1}" aria-pressed="${s.color===i+1}" style="--c:var(--k${i+1})" title="Cor ${i+1} para ${esc(s.name)}"></button>`).join("")}</div>
          <div class="grow"><input type="text" value="${esc(s.name)}" data-sname="${s.id}"></div>
          <button class="ib" data-smove="${s.id}" data-d="-1" ${si===0?"disabled style=opacity:.3":""} title="Subir">${IC.up}</button>
          <button class="ib" data-smove="${s.id}" data-d="1" ${si===a.subs.length-1?"disabled style=opacity:.3":""} title="Descer">${IC.down}</button>
          <button class="ib" data-sdel="${s.id}" title="Excluir">${IC.x}</button>
        </div>`).join("")}
        <div class="setrow"><button class="btn" data-addsub="${a.id}" style="padding:4px 10px;font-size:12.5px">+ Subcategoria</button></div>
      </div>
    </div>`).join("");

  renderPrefs();
}

// Rotinas ganharam página própria; Ajustes ficou com categorias, preferências,
// lixeira, sincronização e dados.
function renderRotinas(){
  if(!$("#habits")) return;
  $("#habits").innerHTML=S.habits.length?S.habits.map(h=>{
    const s=findSub(h.sub), diaria=h.mode==="daily";
    const its=h.items||[];
    return `<div class="rotedit" style="--c:${subVar(h.sub)}">
      <div class="setrow">
        <span class="rotdot"></span>
        <div class="grow"><input type="text" value="${esc(h.name)}" data-hname="${h.id}"></div>
        <span class="chip">${esc(s?s.name:"sem categoria")}</span>
        <div class="seg">
          <button data-hmode="${h.id}:freq" aria-pressed="${!diaria}">Frequência</button>
          <button data-hmode="${h.id}:daily" aria-pressed="${diaria}">Diária</button>
        </div>
        <div class="seg wseg" title="Peso no cálculo — 2 e 3 também marcam a rotina como prioridade no dia">
          ${[1,2,3].map(n=>`<button data-hweight="${h.id}:${n}" aria-pressed="${(h.weight||1)===n}" aria-label="Peso ${n}">${n}</button>`).join("")}
        </div>
        ${diaria?"":`<input class="num" type="number" min="1" max="21" value="${h.target}" data-htarget="${h.id}" title="Vezes por semana">
        <span style="font-size:12px;color:var(--ink-3)">×/sem</span>`}
        <button class="ib" data-hdel="${h.id}" title="Excluir rotina">${IC.x}</button>
      </div>
      ${diaria?`
      <div class="rotcfg">
        <div class="rotline">
          <label>Dias</label>
          <div class="rotdays">${[0,1,2,3,4,5,6].map(i=>{
            const on=(h.days||[]).includes(i);
            return `<button class="rd ${on?"on":""}" data-hday="${h.id}:${i}" aria-pressed="${on}" title="${DIAS[i]}">${DIAS[i][0].toUpperCase()}</button>`;
          }).join("")}</div>
          <button class="lnk" data-hdays="${h.id}:all">todos</button>
          <button class="lnk" data-hdays="${h.id}:week">úteis</button>
        </div>
        <div class="rotline">
          <label for="hat-${h.id}">Horário</label>
          <input id="hat-${h.id}" class="timein ${h.at?"set":""}" type="time" value="${esc(h.at||"")}" data-hat="${h.id}">
          <label style="margin-left:10px">Período</label>
          <input type="date" class="dtin ${h.from?"set":""}" value="${esc(h.from||"")}" data-hfrom="${h.id}" title="Início — vazio começa já">
          <span style="color:var(--ink-3)">até</span>
          <input type="date" class="dtin ${h.to?"set":""}" value="${esc(h.to||"")}" data-hto="${h.id}" title="Fim — vazio não termina">
        </div>
        <div class="rotline top">
          <label>Etapas</label>
          <div class="rotitems">
            ${its.map(it=>`<div class="rotitem">
              <input type="text" value="${esc(it.name)}" data-hiname="${h.id}:${it.id}" aria-label="Nome da etapa">
              <input class="timein ${it.at?"set":""}" type="time" value="${esc(it.at||"")}" data-hiat="${h.id}:${it.id}" title="Horário da etapa">
              <button class="ib" data-hidel="${h.id}:${it.id}" title="Excluir etapa">${IC.x}</button>
            </div>`).join("")}
            <input class="rotadd" type="text" placeholder="${its.length?"Outra etapa":"Dividir em etapas — ex: café da manhã"} — Enter para salvar" data-hiadd="${h.id}" autocomplete="off">
          </div>
        </div>
      </div>`:""}
    </div>`;
  }).join(""):`<p style="color:var(--ink-3);font-style:italic;font-size:13.5px;margin:0">Nenhuma rotina ainda.</p>`;

  $("#hsub").innerHTML=S.areas.map(a=>`<optgroup label="${esc(a.name)}">${a.subs.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")}</optgroup>`).join("");
}

function renderPrefs(){
  if(!$("#goalpct")) return;
  renderTrash();
  $("#goalpct").value=S.settings.goal;
  $("#partial").value=S.settings.partial;
  $("#tmedio").value=limiteMedio();
  $("#talto").value=limiteAlto();
  $("#pushbonus").value=bonusPush();
  $("#lemtxt").value=S.settings.lembrete||"";
  $$("#lemfreq button").forEach(b=> b.setAttribute("aria-pressed", b.dataset.lf===lemFreq()));
  $$("#pushpen button").forEach(b=> b.setAttribute("aria-pressed", (b.dataset.pp==="1")===descontaPush()));
  $$("#theme button").forEach(b=> b.setAttribute("aria-pressed", b.dataset.t===S.settings.theme));
  renderSync();
}

function renderTrash(){
  const el=$("#trash"); if(!el) return;
  const lista=(S.trash||[]).slice().reverse();
  if(!lista.length){ el.innerHTML=`<p style="color:var(--ink-3);font-style:italic;font-size:13.5px;margin:0">A lixeira está vazia.</p>`; return; }
  const quando=t=>{
    const dias=Math.floor((Date.now()-(t.at||0))/864e5);
    if(dias<=0) return "hoje";
    if(dias===1) return "ontem";
    return `há ${dias} dias`;
  };
  el.innerHTML=lista.map(t=>{
    const s=findSub(t.kind==="act"?t.sub:t.pai.sub);
    return `<div class="setrow trashrow" style="--c:${subVar(t.kind==="act"?t.sub:t.pai.sub)}">
      <span class="rotdot"></span>
      <div class="grow">
        <div class="tname">${esc(t.rotulo||"(sem nome)")}</div>
        <div class="tmeta">${t.kind==="act"?"atividade":"subetapa"}${t.contexto?` de "${esc(t.contexto)}"`:""} · ${esc(s?s.name:"categoria excluída")} · ${esc(t.week.replace("-W"," · sem "))} · excluída ${quando(t)}</div>
      </div>
      <button class="btn" data-restore="${t.id}">Restaurar</button>
      <button class="ib" data-trashdel="${t.id}" title="Descartar de vez">${IC.x}</button>
    </div>`;
  }).join("");
}

/* ==========================================================================
   Navegação: uma rota por seção, conteúdo montado a partir de <template>.
   ========================================================================== */
let rota={tipo:"home",id:null};

const SECOES={
  home:{nome:"Semana",desc:"O retrato da semana inteira num relance.",
    ic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 3v3M16 3v3"/><path d="M7.5 13.5h3M13.5 13.5h3M7.5 17h3"/></svg>'},
  agenda:{nome:"Agenda",desc:"Como a semana se distribui pelos dias.",
    ic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/></svg>'},
  rotinas:{nome:"Rotinas",desc:"O que se repete sozinho, sem você recriar toda semana.",
    ic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 0 1 14.5-6l2.5 2.4"/><path d="M20.5 12a8.5 8.5 0 0 1-14.5 6L3.5 15.6"/><path d="M20.5 3.2v5.2h-5.2M3.5 20.8v-5.2h5.2"/></svg>'},
  retro:{nome:"Retrospectiva",desc:"O fechamento da semana, escrito por você.",
    ic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 6.5l3 3"/></svg>'},
  hist:{nome:"Histórico",desc:"O que os números dizem sobre esta semana e sobre o percurso.",
    ic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-4M12.5 16V8M17 16v-6"/></svg>'},
  set:{nome:"Ajustes",desc:"Categorias, preferências, lixeira e sincronização.",
    ic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z"/></svg>'}
};

function irPara(tipo,id){
  rota={tipo,id:id||null};
  fecharSide();
  render();
  window.scrollTo({top:0,behavior:"instant"});
  $("#palco").focus({preventScroll:true});
}
const tpl=id=>{ const t=document.getElementById(id); return t?t.content.cloneNode(true):document.createDocumentFragment(); };

function renderNav(){
  const nav=$("#nav"); if(!nav) return;
  const item=(tipo,id,nome,ic,extra)=>{
    const at=rota.tipo===tipo && (id==null||rota.id===id);
    return `<button class="navitem ${extra&&extra.classe||""}" data-ir="${tipo}${id?":"+id:""}" ${at?'aria-current="page"':""}
      ${extra&&extra.cor?`style="--c:${extra.cor}"`:""}>
      <span class="ni">${ic}</span><span class="nt">${esc(nome)}</span>${extra&&extra.dir||""}
    </button>`;
  };
  let h=item("home",null,SECOES.home.nome,SECOES.home.ic)
       +item("agenda",null,SECOES.agenda.nome,SECOES.agenda.ic);

  S.areas.forEach(a=>{
    const as=areaScore(a,cur);
    h+=`<div class="navgrupo"><b>${esc(a.name)}</b><span class="apct">${as.pct==null?"—":as.pct+"%"}</span></div>`;
    a.subs.forEach(s=>{
      const r=subScore(s.id,cur);
      h+=item("sub",s.id,s.name,iconeSub(s),{
        cor:subVar(s.id),
        classe:r.pct===100?"plena":"",
        dir:`<span class="nbar"><i style="width:${r.pct||0}%"></i></span><span class="np">${r.pct==null?"—":r.pct+"%"}</span>`
      });
    });
  });

  h+=`<div class="navgrupo"><b>Painel</b></div>`
    +item("rotinas",null,SECOES.rotinas.nome,SECOES.rotinas.ic)
    +item("retro",null,SECOES.retro.nome,SECOES.retro.ic)
    +item("hist",null,SECOES.hist.nome,SECOES.hist.ic)
    +item("set",null,SECOES.set.nome,SECOES.set.ic);
  nav.innerHTML=h;
}

function renderMigalha(){
  const el=$("#migalha"); if(!el) return;
  const raiz=`<button data-ir="home">Painel</button>`;
  if(rota.tipo==="home"){ el.innerHTML=`<b>Semana</b>`; return; }
  if(rota.tipo==="sub"){
    const s=findSub(rota.id), a=subArea(rota.id);
    el.innerHTML=`${raiz}<span class="sep">›</span><button data-ir="area:${a?a.id:""}">${esc(a?a.name:"—")}</button><span class="sep">›</span><b>${esc(s?s.name:"—")}</b>`;
    return;
  }
  if(rota.tipo==="area"){
    const a=S.areas.find(x=>x.id===rota.id);
    el.innerHTML=`${raiz}<span class="sep">›</span><b>${esc(a?a.name:"—")}</b>`;
    return;
  }
  el.innerHTML=`${raiz}<span class="sep">›</span><b>${esc((SECOES[rota.tipo]||{}).nome||"")}</b>`;
}

function heroHTML({eyebrow,titulo,sub,ic,cor,num,numLabel,pct}){
  return `<div class="hero" ${cor?`style="--c:${cor}"`:""}>
    ${ic?`<div class="hero-ic">${ic}</div>`:""}
    <div class="hero-txt">
      ${eyebrow?`<div class="eyebrow">${esc(eyebrow)}</div>`:""}
      <h1>${esc(titulo)}</h1>
      ${sub||""}
    </div>
    ${num!=null?`<div class="hero-num"><div class="v">${esc(num)}</div><div class="l">${esc(numLabel||"")}</div></div>`:""}
  </div>
  ${pct!=null?`<div class="hero-bar" ${cor?`style="--c:${cor}"`:""}><i style="width:${pct||0}%"></i></div>`:""}`;
}

/* ---------- lateral no telefone ---------- */
function abrirSide(){ $("#side").classList.add("on"); $("#veu").hidden=false; }
function fecharSide(){ $("#side").classList.remove("on"); $("#veu").hidden=true; }
/* Botões que vivem dentro de <template> só existem quando a página está montada,
   então a ligação é delegada por id em vez de direta no elemento. */
const ACOES={}, ACOES_CHANGE={};
document.addEventListener("change",e=>{ const f=ACOES_CHANGE[e.target.id]; if(f) f(e); });
document.addEventListener("click",e=>{
  let n=e.target;
  while(n && n!==document){
    if(n.id && ACOES[n.id]){ ACOES[n.id](e); return; }
    n=n.parentElement;
  }
});
document.addEventListener("focusin",e=>{
  if(e.target.id==="ghtoken" && e.target.dataset.masked==="1"){ e.target.value=""; e.target.dataset.masked=""; }
});

$("#abrirside").onclick=abrirSide;
$("#sfech").onclick=fecharSide;
$("#veu").onclick=fecharSide;
$("#gveu").onclick=fecharGaveta;

/* ---------- gaveta de detalhe ---------- */
// O que antes se espremia na linha da atividade cabe aqui com folga.
let gavetaId=null;
function fecharGaveta(){
  gavetaId=null;
  $("#gaveta").classList.remove("on");
  $("#gaveta").setAttribute("aria-hidden","true");
  $("#gveu").classList.remove("on");
  setTimeout(()=>{ if(!gavetaId) $("#gveu").hidden=true; },200);
}
function abrirGaveta(id){
  const a=act(id); if(!a) return;
  gavetaId=id;
  const g=$("#gaveta");
  g.innerHTML=gavetaHTML(a);
  g.classList.add("on"); g.setAttribute("aria-hidden","false");
  $("#gveu").hidden=false;
  requestAnimationFrame(()=>$("#gveu").classList.add("on"));
  $$("#gaveta textarea").forEach(autosize);
  setTimeout(()=>g.querySelector(".gav-fech")?.focus(),40);
}
function atualizaGaveta(){ if(gavetaId && act(gavetaId)) abrirGavetaSilencioso(); else if(gavetaId) fecharGaveta(); }
function abrirGavetaSilencioso(){
  const a=act(gavetaId); if(!a) return;
  $("#gaveta").innerHTML=gavetaHTML(a);
  $$("#gaveta textarea").forEach(autosize);
}
function gavetaHTML(a){
  const sub=findSub(a.sub), area=subArea(a.sub);
  const steps=a.steps||[], sdone=steps.filter(x=>x.done).length;
  const tt=tempoTotal(a), sug=pesoSugerido(tt);
  const late=a.due!=null && a.status!=="done" && a.status!=="skip" && cur===todayKey() && a.due<((new Date().getDay()||7)-1);
  return `<div class="gav-topo" style="--c:${subVar(a.sub)}">
    <div class="gav-eyebrow"><span class="gic">${sub?iconeSub(sub):""}</span>${esc(area?area.name+" · ":"")}${esc(sub?sub.name:"")}</div>
    <h2>${esc(a.text)}</h2>
    <button class="gav-fech" data-gfech="1" aria-label="Fechar" title="Fechar (Esc)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </div>
  <div class="gav-corpo">
    <div class="gav-bloco">
      <span class="rot">Estado</span>
      <div class="gav-linha">
        <button class="btn ${a.status==="done"?"pri":""}" data-cycle="${a.id}">${stIcon(a.status)||""}${STNAME[a.status]}</button>
        <button class="chip w" data-weight="${a.id}">peso ${a.weight||1}</button>
        <button class="chip due ${late?"late":""}" data-due="${a.id}">${a.due!=null?DIAS[a.due]:"sem dia"}</button>
        ${a.due!=null?`<input class="timein ${a.at?"set":""}" type="time" value="${esc(a.at||"")}" data-attime="${a.id}" aria-label="Horário">`:""}
        ${a.carried||a.fromPush?`<span class="chip carry">${a.fromPush?"veio adiada":"herdada"}</span>`:""}
      </div>
    </div>

    <div class="gav-bloco">
      <span class="rot">Tempo dedicado</span>
      <div class="gav-linha">
        <span class="chip tempo">${IC.clock}${tt?fmtMin(tt):"nada anotado"}</span>
        <button class="qb" data-timeadd="${a.id}:15">+15</button>
        <button class="qb" data-timeadd="${a.id}:30">+30</button>
        <button class="qb" data-timeadd="${a.id}:60">+1h</button>
        ${tempoDe(a)?`<button class="qb zero" data-timeadd="${a.id}:0">zerar</button>`:""}
        ${sug&&sug!==(a.weight||1)&&!a.sugOff?`<button class="chip sug" data-sugw="${a.id}:${sug}">› peso ${sug}</button>`:""}
      </div>
    </div>

    <div class="gav-bloco">
      <span class="rot">Etiquetas</span>
      <div class="gav-linha">
        ${tagsDe(a).map(t=>`<button class="chip tag" data-tagq="${esc(t)}">#${esc(t)}</button>`).join("")}
        <button class="qb" data-tagedit="${a.id}">${tagsDe(a).length?"editar":"+ etiqueta"}</button>
      </div>
      <input type="text" class="hidden" data-tagval="${a.id}" value="${esc(tagsDe(a).join(", "))}"
        placeholder="Separadas por vírgula · Enter para salvar" list="taglist">
    </div>

    <div class="gav-bloco">
      <span class="rot">Link</span>
      <div class="gav-linha">
        ${a.url?`<a class="chip lk" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${IC.link}${esc(urlLabel(a.url))}</a>`:""}
        <button class="qb" data-linkedit="${a.id}">${a.url?"editar":"+ link"}</button>
      </div>
      <input type="url" class="hidden" data-linkval="${a.id}" value="${esc(a.url||"")}" placeholder="drive.google.com/… · Enter para salvar">
    </div>

    <div class="gav-bloco">
      <span class="rot">Subetapas ${steps.length?`· ${sdone}/${steps.length}`:""}</span>
      <div class="steps" style="padding-left:0">
        ${steps.map(s=>{
          const sst=stepSt(s);
          return `<div class="step ${sst==="done"?"done":sst==="doing"?"doing":""}" data-aid="${a.id}" data-sid="${s.id}">
            <button class="sbox" data-steptoggle="${a.id}:${s.id}" title="${STNAME[sst]}">${stIcon(sst)}</button>
            <textarea class="stx" rows="1" data-steptext="${a.id}:${s.id}">${esc(s.text)}</textarea>
            <button class="sday ${s.due!=null?"set":""}" data-stepdue="${a.id}:${s.id}">${s.due!=null?DIAS[s.due]:"dia"}</button>
            <button class="sx" data-smenu="${a.id}:${s.id}" data-menu-id="gs-${s.id}">${IC.more}</button>
          </div>`;
        }).join("")}
        <div class="stepadd"><input type="text" data-stepadd="${a.id}" placeholder="Nova subetapa — Enter para salvar" autocomplete="off"></div>
      </div>
    </div>

    <div class="gav-bloco">
      <span class="rot">Mover</span>
      <div class="gav-linha">
        <button class="btn" data-push="${a.id}">${IC.push} Adiar uma semana</button>
        <button class="btn" data-gtransf="${a.id}" data-menu-id="gt-${a.id}">${IC.move} Transferir</button>
        <button class="btn dgr" data-gdel="${a.id}">${IC.x} Excluir</button>
      </div>
    </div>
  </div>`;
}

/* ---------- página inicial: o retrato da semana ---------- */
function renderHome(){
  const palco=$("#palco"); if(!palco) return;
  renderLateral(); renderMigalha();
  const w=week(cur), ws=weekScore(cur), pct=ws.pct==null?0:ws.pct;
  const A=analiseSemana(cur);
  const isNow=cur===todayKey();
  const hoje=isNow?((new Date().getDay()||7)-1):-1;
  const doDia=hoje>=0?A.dias[hoje]:null;
  const pend=w.acts.filter(a=>a.status!=="done"&&a.status!=="skip");
  const foco=pend.filter(a=>(a.weight||1)>1).sort((a,b)=>(b.weight||1)-(a.weight||1)).slice(0,5);
  const lembrete=lemTexto();

  palco.innerHTML=
    heroHTML({
      eyebrow:rangeLabel(cur),
      titulo:isNow?"Esta semana":cur.replace("-W"," · semana "),
      ic:SECOES.home.ic,
      sub:lembrete?`<p class="sub">${esc(lembrete)}</p>`:`<p class="sub">${A.acts.length?`${A.feitas} de ${A.acts.length} atividades concluídas${A.adiadas?` · ${A.adiadas} adiada${A.adiadas>1?"s":""}`:""}.`:"Nenhuma atividade nesta semana ainda. Escolha uma frente na lateral para começar."}</p>`,
      num:ws.pct==null?"—":pct+"%", numLabel:"da semana", pct
    })
    +`<div class="widgets" style="margin-top:26px">
      ${doDia?`<button class="wid clic ${doDia.plan&&doDia.feito>=doDia.plan?"boa":""}" data-ir="agenda">
        <div class="k">Hoje</div>
        <div class="v">${doDia.feito}<span style="font-size:16px;color:var(--ink-3)">/${doDia.plan}</span></div>
        <div class="d">${doDia.plan?`${doDia.plan-doDia.feito} ainda em aberto para hoje`:"Nada marcado para hoje"}</div>
        <div class="mini"><i style="width:${doDia.plan?Math.round(doDia.feito/doDia.plan*100):0}%;background:var(--ok)"></i></div>
      </button>`:""}
      <button class="wid clic" data-ir="agenda">
        <div class="k">Com dia marcado</div>
        <div class="v">${A.dias.reduce((n,d)=>n+d.plan,0)}</div>
        <div class="d">linhas distribuídas pelos sete dias</div>
      </button>
      <button class="wid clic ${A.atrasadas?"alerta":""}" data-ir="hist">
        <div class="k">Pontualidade</div>
        <div class="v">${(A.noPrazo+A.atrasadas)?Math.round(A.noPrazo/(A.noPrazo+A.atrasadas)*100)+"%":"—"}</div>
        <div class="d">${(A.noPrazo+A.atrasadas)?`${A.noPrazo} no dia planejado · ${A.atrasadas} depois`:"sem conclusões com dia-alvo ainda"}</div>
      </button>
      <button class="wid clic" data-ir="hist">
        <div class="k">Tempo dedicado</div>
        <div class="v">${A.minTotal?fmtMin(A.minTotal):"—"}</div>
        <div class="d">${A.minTotal?`em ${A.comTempo} atividade${A.comTempo>1?"s":""} anotada${A.comTempo>1?"s":""}`:"nada anotado nesta semana"}</div>
      </button>
    </div>`
    +`<div class="secao">
      <div class="secao-tit"><h2>Frentes</h2><span>clique para abrir a página da frente</span></div>
      <div class="frentes">${allSubs().map(s=>{
        const r=subScore(s.id,cur);
        const obj=(w.goals[s.id]||"").trim();
        const nAtiv=w.acts.filter(a=>a.sub===s.id).length;
        const rots=S.habits.filter(h=>h.sub===s.id).length;
        return `<button class="fcard ${r.pct===100?"plena":""}" data-ir="sub:${s.id}" style="--c:${subVar(s.id)}">
          <div class="fcard-top">
            <span class="fcard-ic">${iconeSub(s)}</span>
            <h3>${esc(s.name)}</h3>
            <span class="pc">${r.pct==null?"—":r.pct+"%"}</span>
          </div>
          <p class="obj">${obj?esc(obj):`<span style="color:var(--ink-3);font-style:italic">Sem objetivo escrito para a semana.</span>`}</p>
          <div class="bar"><i style="width:${r.pct||0}%"></i></div>
          <div class="meta"><span>${r.done}/${nAtiv} atividades</span>${rots?`<span>${rots} rotina${rots>1?"s":""}</span>`:""}</div>
        </button>`;
      }).join("")}</div>
    </div>`
    +(foco.length?`<div class="secao">
      <div class="secao-tit"><h2>O que pesa mais</h2><span>pendências de peso 2 e 3</span></div>
      <div class="frentes">${foco.map(a=>{
        const s=findSub(a.sub);
        return `<button class="fcard" data-abrir="${a.id}" style="--c:${subVar(a.sub)}">
          <div class="fcard-top"><span class="fcard-ic">${iconeSub(s||{})}</span>
            <h3>${esc(a.text)}</h3><span class="pc">${a.weight}</span></div>
          <div class="meta"><span>${esc(s?s.name:"")}</span>${a.due!=null?`<span>${DIAS[a.due]}</span>`:""}${tempoTotal(a)?`<span>${fmtMin(tempoTotal(a))}</span>`:""}</div>
        </button>`;
      }).join("")}</div>
    </div>`:"");
}

/* ---------- página de uma frente (ou de uma área) ---------- */
function renderPaginaFrente(){
  const topo=$("#paginaTopo"); if(!topo) return;
  if(rota.tipo==="area"){
    const a=S.areas.find(x=>x.id===rota.id); if(!a) return;
    const as=areaScore(a,cur);
    topo.innerHTML=heroHTML({
      eyebrow:"Área",titulo:a.name,ic:SECOES.home.ic,cor:`var(--${a.tone})`,
      sub:`<p class="sub">${a.subs.length} frente${a.subs.length>1?"s":""} nesta área.</p>`,
      num:as.pct==null?"—":as.pct+"%",numLabel:"da área",pct:as.pct});
    return;
  }
  const s=findSub(rota.id), area=subArea(rota.id);
  if(!s) return;
  const r=subScore(s.id,cur), w=week(cur);
  const acts=w.acts.filter(a=>a.sub===s.id);
  const rots=S.habits.filter(h=>h.sub===s.id);
  const min=acts.reduce((n,a)=>n+tempoTotal(a),0);
  const adiadas=(w.pushed||[]).filter(p=>p.sub===s.id).length;
  topo.innerHTML=heroHTML({
    eyebrow:area?area.name:"",titulo:s.name,ic:iconeSub(s),cor:subVar(s.id),
    sub:`<textarea class="heroobj" data-goal="${s.id}" rows="1" placeholder="Qual é o objetivo desta frente na semana?">${esc(w.goals[s.id]||"")}</textarea>`,
    num:r.pct==null?"—":r.pct+"%",numLabel:"da frente",pct:r.pct})
  +`<div class="widgets" style="margin-top:24px">
    <div class="wid" style="--c:${subVar(s.id)}">
      <div class="k">Atividades</div><div class="v">${r.done}<span style="font-size:16px;color:var(--ink-3)">/${acts.length}</span></div>
      <div class="d">${acts.length?`${acts.length-r.done} em aberto`:"nenhuma ainda"}</div>
    </div>
    <div class="wid" style="--c:${subVar(s.id)}">
      <div class="k">Tempo dedicado</div><div class="v">${min?fmtMin(min):"—"}</div>
      <div class="d">${min?"somando as subetapas":"nada anotado"}</div>
    </div>
    <div class="wid" style="--c:${subVar(s.id)}">
      <div class="k">Rotinas</div><div class="v">${rots.length||"—"}</div>
      <div class="d">${rots.length?rots.map(h=>esc(h.name)).slice(0,2).join(" · "):"nenhuma nesta frente"}</div>
    </div>
    ${adiadas?`<div class="wid alerta"><div class="k">Adiadas</div><div class="v">${adiadas}</div>
      <div class="d">seguem pesando nesta semana</div></div>`:""}
  </div>`;
  $$(".heroobj").forEach(autosize);
}

function render(){
  if(ensureColors()|migraRotinas()|podaLixo()) save();
  applyTheme();
  renderLateral();
  renderMigalha();

  const palco=$("#palco");
  palco.innerHTML="";
  const t=rota.tipo;

  if(t==="home"){ renderHome(); return; }

  if(t==="agenda"){
    palco.insertAdjacentHTML("beforeend",heroHTML({
      eyebrow:rangeLabel(cur),titulo:SECOES.agenda.nome,ic:SECOES.agenda.ic,
      sub:`<p class="sub">${SECOES.agenda.desc}</p>`}));
    palco.appendChild(tpl("tpl-agenda"));
    renderWeek(); return;
  }
  if(t==="sub" || t==="area"){
    palco.insertAdjacentHTML("beforeend",`<div id="paginaTopo"></div><div id="areas"></div>`);
    renderPaginaFrente();
    renderWeek(); return;
  }
  if(t==="rotinas"){
    palco.insertAdjacentHTML("beforeend",heroHTML({
      titulo:SECOES.rotinas.nome,ic:SECOES.rotinas.ic,sub:`<p class="sub">${SECOES.rotinas.desc}</p>`}));
    palco.appendChild(tpl("tpl-rotinas"));
    renderRotinas(); return;
  }
  if(t==="retro"){
    palco.insertAdjacentHTML("beforeend",heroHTML({
      eyebrow:rangeLabel(cur),titulo:SECOES.retro.nome,ic:SECOES.retro.ic,
      sub:`<p class="sub">${SECOES.retro.desc}</p>`}));
    palco.appendChild(tpl("tpl-retro"));
    renderRetro(); return;
  }
  if(t==="hist"){
    palco.insertAdjacentHTML("beforeend",heroHTML({
      titulo:SECOES.hist.nome,ic:SECOES.hist.ic,sub:`<p class="sub">${SECOES.hist.desc}</p>`}));
    palco.appendChild(tpl("tpl-hist"));
    renderHist(); return;
  }
  if(t==="set"){
    palco.insertAdjacentHTML("beforeend",heroHTML({
      titulo:SECOES.set.nome,ic:SECOES.set.ic,sub:`<p class="sub">${SECOES.set.desc}</p>`}));
    palco.appendChild(tpl("tpl-set"));
    renderSet(); return;
  }
}
function applyTheme(){
  const t=S.settings.theme;
  if(t==="auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme",t);
}
/* ---------- lembrete de abertura ---------- */
// Um recado do usuário para ele mesmo. Fica no estado, então viaja na sincronização.
const lemTexto=()=> (S.settings.lembrete||"").trim();
const lemFreq=()=> S.settings.lembreteFreq||"dia";
const hojeISO=()=>{ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };

function deveMostrarLembrete(){
  if(!lemTexto() || lemFreq()==="off") return false;
  if(lemFreq()==="sempre") return true;
  return S.settings.lembreteVisto!==hojeISO();     // uma vez por dia
}
function abrirLembrete(forcado){
  if(!forcado && !deveMostrarLembrete()) return;
  if(!lemTexto()) return;
  $("#lem-txt").textContent=lemTexto();
  $("#lem-txt").classList.remove("hidden");
  $("#lem-edit").classList.add("hidden");
  $("#lem-editar").textContent="Editar";
  $("#lmask").classList.add("on");
  setTimeout(()=>$("#lem-ok").focus(),20);
  if(lemFreq()==="dia"){ S.settings.lembreteVisto=hojeISO(); save(); }
}
function fecharLembrete(){
  const ed=$("#lem-edit");
  if(!ed.classList.contains("hidden")){       // saiu com o campo aberto: guarda o texto
    S.settings.lembrete=ed.value.trim();
    save();
    if(rota.tipo==="set") renderSet();
  }
  $("#lmask").classList.remove("on");
}
$("#lem-ok").onclick=fecharLembrete;
$("#lem-editar").onclick=()=>{
  const ed=$("#lem-edit"), txt=$("#lem-txt");
  if(ed.classList.contains("hidden")){
    ed.value=lemTexto(); ed.classList.remove("hidden"); txt.classList.add("hidden");
    $("#lem-editar").textContent="Guardar";
    ed.focus();
  }else{
    S.settings.lembrete=ed.value.trim(); save();
    if(rota.tipo==="set") renderSet();
    txt.textContent=lemTexto(); ed.classList.add("hidden"); txt.classList.remove("hidden");
    $("#lem-editar").textContent="Editar";
    if(!lemTexto()) fecharLembrete();
  }
};
$("#lmask").onclick=e=>{ if(e.target.id==="lmask") fecharLembrete(); };

// Substitui confirm(): promessa resolvida pelos botões do diálogo.
let askResolve=null;
function ask(titulo,msg,rotulo){
  $("#dlg-t").textContent=titulo;
  $("#dlg-m").textContent=msg||"";
  $("#dlg-yes").textContent=rotulo||"Excluir";
  $("#mask").classList.add("on");
  setTimeout(()=>$("#dlg-yes").focus(),20);
  return new Promise(res=>{ askResolve=res; });
}
function closeAsk(v){
  $("#mask").classList.remove("on");
  const r=askResolve; askResolve=null;
  if(r) r(v);
}
$("#dlg-yes").onclick=()=>closeAsk(true);
$("#dlg-no").onclick=()=>closeAsk(false);
$("#mask").onclick=e=>{ if(e.target.id==="mask") closeAsk(false); };

let toastT;
// com ação o aviso fica clicável e dura mais: é a janela do "desfazer"
function toast(msg,acao){
  const el=$("#toast");
  el.textContent="";
  const s=document.createElement("span"); s.textContent=msg; el.appendChild(s);
  if(acao){
    const b=document.createElement("button");
    b.className="tbtn"; b.textContent=acao.label;
    b.onclick=()=>{ el.classList.remove("on"); clearTimeout(toastT); acao.fn(); };
    el.appendChild(b);
  }
  el.classList.toggle("acao",!!acao);
  el.classList.add("on");
  clearTimeout(toastT);
  toastT=setTimeout(()=>el.classList.remove("on"), acao?7000:2600);
}

/* ---------- ações ---------- */
const foco=sel=> setTimeout(()=>{ const i=document.querySelector(sel); if(i){ i.focus(); i.select&&i.select(); } },0);

function excluirAtividade(id){
  const w=week(cur), a=w.acts.find(x=>x.id===id); if(!a) return;
  const tid=paraLixo({kind:"act",week:cur,rotulo:a.text,sub:a.sub,data:structuredClone(a)});
  w.acts=w.acts.filter(x=>x.id!==id); save(); renderWeek();
  toast(`"${a.text}" excluída.`,{label:"Desfazer",fn:()=>{ restaurar(tid); save(); renderWeek(); toast("Atividade restaurada."); }});
}
function excluirSubetapa(ref){
  const {a,s}=step(ref); if(!a||!s) return;
  const tid=paraLixo({kind:"step",week:cur,actId:a.id,pai:paiSnapshot(a),rotulo:s.text,contexto:a.text,data:structuredClone(s)});
  a.steps=a.steps.filter(x=>x.id!==s.id); syncFromSteps(a); save(); renderWeek();
  toast(`Subetapa "${s.text}" excluída.`,{label:"Desfazer",fn:()=>{ restaurar(tid); save(); renderWeek(); toast("Subetapa restaurada."); }});
}

function addAct(subId,text){
  text=text.trim(); if(!text) return;
  const m=text.match(/\s!([123])\s*$/);
  let weight=1; if(m){ weight=+m[1]; text=text.slice(0,m.index).trim(); }
  const r=extraiTags(text);
  if(!r.texto) return;
  week(cur,true).acts.push({id:uid(),sub:subId,text:r.texto,status:"todo",weight,due:null,tags:r.tags,created:Date.now()});
  save(); renderWeek();
}
function act(id){ return week(cur).acts.find(a=>a.id===id); }
function step(ref){ const [aid,sid]=ref.split(":"); const a=act(aid); return {a,s:a&&(a.steps||[]).find(x=>x.id===sid)}; }

function addStep(actId,text){
  text=text.trim(); if(!text) return;
  const a=act(actId); if(!a) return;
  const r=extraiTags(text);
  if(!r.texto) return;
  (a.steps=a.steps||[]).push({id:uid(),text:r.texto,done:false,due:null,tags:r.tags});
  if(a.status==="done") a.status="doing"; // nova subetapa reabre a atividade
  save(); renderWeek();
}
// Concluir a última subetapa fecha a atividade; desmarcar uma reabre.
function syncFromSteps(a){
  const st=a.steps||[]; if(!st.length || a.status==="skip") return;
  const done=st.filter(x=>x.done).length;
  const andando=st.some(x=>x.doing);
  a.status = done===st.length ? "done" : (done>0||andando) ? "doing" : "todo";
}

function flash(el){
  if(!el) return;
  el.scrollIntoView({block:"center",behavior:"smooth"});
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}
// Abre o que estiver recolhido no caminho — área e subcategoria — antes de destacar o alvo.
function reveal(subId){
  const ar=subArea(subId); let mudou=false;
  if(ar && S.settings.folded[ar.id]){ S.settings.folded[ar.id]=false; mudou=true; }
  if(S.settings.foldedSubs[subId]){ S.settings.foldedSubs[subId]=false; mudou=true; }
  if(mudou){ save(); renderWeek(); }
}
// vindo da agenda ou da visão do dia, o item abre em detalhe — é o caminho mais curto
function jumpToAct(id){
  if(act(id)){ abrirGaveta(id); return; }
  jumpToActAntigo(id);
}
function jumpToActAntigo(id){
  const a=act(id); if(!a) return;
  reveal(a.sub);
  // vindo de uma subetapa da agenda, abre o painel de subetapas junto
  if((a.steps||[]).length && !a.open){ a.open=true; save(); renderWeek(); }
  flash(document.querySelector(`.itemwrap[data-id="${CSS.escape(id)}"]`)
     || document.querySelector(`.card[data-sub="${CSS.escape(a.sub)}"]`));
}
function openSub(ref){
  const subId=ref.split(":")[1];
  reveal(subId);
  flash(document.querySelector(`.card[data-sub="${CSS.escape(subId)}"]`));
}

function addSub(areaId){
  const a=S.areas.find(x=>x.id===areaId); if(!a) return;
  const s={id:uid(),name:"Nova subcategoria"};
  a.subs.push(s); save(); render();
  const el=document.querySelector(`[data-sname="${CSS.escape(s.id)}"]`);
  if(el){ el.scrollIntoView({block:"center",behavior:"smooth"}); el.focus(); el.select(); }
}

function carryOver(){
  const prev=shiftKey(cur,-1), p=S.weeks[prev];
  if(!p){ toast("A semana anterior não tem registro."); return; }
  const w=week(cur,true);
  let g=0,c=0;
  Object.entries(p.goals||{}).forEach(([k,v])=>{ if(v&&v.trim()&&!(w.goals[k]||"").trim()){ w.goals[k]=v; g++; } });
  (p.acts||[]).filter(a=> a.status==="todo"||a.status==="doing"||a.status==="skip").forEach(a=>{
    if(w.acts.some(x=> x.text===a.text && x.sub===a.sub)) return;
    // só as subetapas que ficaram pendentes vêm junto — o que já foi feito, foi
    // o tempo não vem junto: ele é o registro do que foi gasto naquela semana
    const steps=(a.steps||[]).filter(s=>!s.done).map(s=>({id:uid(),text:s.text,done:false,doing:!!s.doing,due:s.due??null,at:s.at??null,url:s.url??null,tags:tagsDe(s).slice()}));
    w.acts.push({id:uid(),sub:a.sub,text:a.text,status:a.status==="skip"?"todo":a.status,weight:a.weight||1,due:a.due??null,at:a.at??null,url:a.url??null,tags:tagsDe(a).slice(),steps,carried:true,created:Date.now()});
    c++;
  });
  save(); renderWeek();
  toast(c+" pendência"+(c===1?"":"s")+" e "+g+" objetivo"+(g===1?"":"s")+" trazidos de "+prev+".");
}

function exportMD(){
  const w=week(cur), ws=weekScore(cur);
  let out=`# ${cur} · ${rangeLabel(cur)}\n\nProgresso geral: **${ws.pct==null?"—":ws.pct+"%"}**\n`;
  S.areas.forEach(a=>{
    const as=areaScore(a,cur);
    out+=`\n## ${a.name} — ${as.pct==null?"—":as.pct+"%"}\n`;
    a.subs.forEach(s=>{
      const r=subScore(s.id,cur), acts=w.acts.filter(x=>x.sub===s.id), hs=S.habits.filter(h=>h.sub===s.id);
      if(!acts.length && !hs.length && !(w.goals[s.id]||"").trim()) return;
      out+=`\n### ${s.name} — ${r.pct==null?"—":r.pct+"%"}\n`;
      if((w.goals[s.id]||"").trim()) out+=`\n> ${w.goals[s.id].trim().replace(/\n/g,"\n> ")}\n\n`;
      acts.forEach(x=>{
        const quando=q=> q.due!=null?` (${DIAS[q.due]}${q.at?` ${q.at}`:""})`:"";
        out+=`- [${x.status==="done"?"x":x.status==="doing"?"~":x.status==="skip"?">":" "}] ${x.text}${quando(x)}${(x.weight||1)>1?` (peso ${x.weight})`:""}\n`;
        (x.steps||[]).forEach(s=> out+=`  - [${s.done?"x":" "}] ${s.text}${quando(s)}\n`);
      });
      hs.forEach(h=>{
        if(h.mode==="daily"){
          const dias=rotDias(h,cur), st=rotEstado(cur,h.id);
          if(!dias.length) return;                 // fora do período: não vai para o relatório
          const f=dias.filter(i=> rotDiaFeito(h,st,i)).length;
          out+=`- ${h.name} (rotina diária): ${f}/${dias.length} dias\n`;
        }else{
          const v=w.habits[h.id];
          out+=`- ${h.name}: ${typeof v==="number"?v:0}/${h.target}\n`;
        }
      });
    });
  });
  const r=w.retro||{};
  if(r.win||r.block||r.next||r.energy||r.mood){
    out+=`\n## Retrospectiva\n`;
    if(r.win) out+=`\n**O que funcionou** — ${r.win}\n`;
    if(r.block) out+=`\n**O que travou** — ${r.block}\n`;
    if(r.next) out+=`\n**Foco da próxima semana** — ${r.next}\n`;
    if(r.energy||r.mood) out+=`\nEnergia ${r.energy||"—"}/5 · Satisfação ${r.mood||"—"}/5\n`;
  }
  download(out,`semana-${cur}.md`,"text/markdown");
}
function download(text,name,mime){
  const b=new Blob([text],{type:(mime||"application/json")+";charset=utf-8"});
  const u=URL.createObjectURL(b), a=document.createElement("a");
  a.href=u; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(u),1500);
  toast("Arquivo gerado: "+name);
}

/* ---------- eventos ---------- */
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-cycle],[data-del],[data-weight],[data-due],[data-steps],[data-steptoggle],[data-stepdel],[data-stepdue],[data-agday],[data-agsub],[data-agfold],[data-scolor],[data-icon],[data-hidesub],[data-rot],[data-gorot],[data-hmode],[data-hday],[data-hdays],[data-hidel],[data-hweight],[data-push],[data-spush],[data-restore],[data-trashdel],[data-menu],[data-smenu],[data-tagq],[data-ir],[data-abrir],[data-gfech],[data-gdel],[data-gtransf],[data-tagedit],[data-linkedit],[data-time],[data-stime],[data-timeadd],[data-stimeadd],[data-sugw],[data-sugoff],[data-unpush],[data-pp],[data-lf],[data-link],[data-slink],[data-linkdel],[data-slinkdel],[data-fold],[data-foldsub],[data-open],[data-jump],[data-hab],[data-scale],[data-go],[data-t],[data-amove],[data-adel],[data-smove],[data-sdel],[data-addsub],[data-newsub],[data-hdel],.tab");
  if(!t) return;
  const d=t.dataset;

  if(d.ir){ const [tipo,id]=d.ir.split(":"); irPara(tipo,id); return; }
  if(d.abrir){ abrirGaveta(d.abrir); return; }
  if(d.gfech){ fecharGaveta(); return; }
  if(d.gdel){ const id=d.gdel; fecharGaveta(); excluirAtividade(id); return; }
  if(d.gtransf){ const a=act(d.gtransf); if(a) menuTransferir(t,a,null); return; }
  if(d.tagedit||d.linkedit){
    const campo=$(`#gaveta [data-${d.tagedit?"tagval":"linkval"}="${CSS.escape(d.tagedit||d.linkedit)}"]`);
    if(campo){ campo.classList.toggle("hidden"); if(!campo.classList.contains("hidden")){ campo.focus(); campo.select(); } }
    return;
  }
  if(d.cycle){ const a=act(d.cycle); if(a){
    a.status=NEXT[a.status];
    // marcar/desmarcar a atividade inteira arrasta as subetapas junto
    if(a.steps&&a.steps.length){
      if(a.status==="done") a.steps.forEach(s=>{ s.done=true; s.doing=false; });
      if(a.status==="todo") a.steps.forEach(s=>{ s.done=false; s.doing=false; });
    }
    if(a.status==="done") a.doneAt=Date.now();
    save(); renderWeek();
    if(a.status==="done") celebraItem(a.id);
    } return; }
  if(d.steps){ const a=act(d.steps); if(a){ a.open=!a.open; save(); renderWeek();
      const inp=document.querySelector(`[data-stepadd="${CSS.escape(d.steps)}"]`);
      if(inp && !(a.steps||[]).length) inp.focus(); } return; }
  // mesmo ciclo da atividade: pendente › em andamento › concluída
  if(d.steptoggle){ const {a,s}=step(d.steptoggle); if(s){
      if(s.done){ s.done=false; s.doing=false; }
      else if(s.doing){ s.doing=false; s.done=true; }
      else s.doing=true;
      syncFromSteps(a); save(); renderWeek();
      if(s.done) pulsa(document.querySelector(`.step[data-sid="${CSS.escape(s.id)}"] .sbox`),"feito");
    } return; }
  if(d.stepdel){ excluirSubetapa(d.stepdel); return; }
  if(d.push){ const a=act(d.push); if(a) empurrar(a,null); return; }
  if(d.spush){ const {a,s}=step(d.spush); if(a&&s) empurrar(a,s); return; }
  if(d.time){ const a=act(d.time); if(a){ a.timeOpen=!a.timeOpen; save(); renderWeek(); foco(`[data-timeval="${CSS.escape(d.time)}"]`); } return; }
  if(d.stime){ const {s}=step(d.stime); if(s){ s.timeOpen=!s.timeOpen; save(); renderWeek(); foco(`[data-stimeval="${CSS.escape(d.stime)}"]`); } return; }
  if(d.timeadd){
    const i=d.timeadd.lastIndexOf(":"), a=act(d.timeadd.slice(0,i)), n=+d.timeadd.slice(i+1);
    if(a){ a.mins = n===0 ? 0 : tempoDe(a)+n; save(); renderWeek(); }
    return;
  }
  if(d.stimeadd){
    const i=d.stimeadd.lastIndexOf(":"), ref=d.stimeadd.slice(0,i), n=+d.stimeadd.slice(i+1);
    const {s}=step(ref);
    if(s){ s.mins = n===0 ? 0 : tempoDe(s)+n; save(); renderWeek(); }
    return;
  }
  if(d.unpush){ trazerDeVolta(d.unpush); return; }
  if(d.sugoff){ const a=act(d.sugoff);
    if(a){ a.sugOff=true; save(); renderWeek(); toast("Sugestão ignorada nesta atividade.",
      {label:"Voltar a sugerir",fn:()=>{ a.sugOff=false; save(); renderWeek(); }}); } return; }
  if(d.sugw){ const [id,n]=d.sugw.split(":"); const a=act(id);
    if(a){ a.weight=Math.max(1,Math.min(3,+n||1)); save(); render();   // pode ter vindo do histórico
      toast(`Peso ${a.weight} aplicado a partir do tempo registrado.`); } return; }
  if(d.tagq){
    const alvo="#"+d.tagq;
    query=(query.trim()===alvo)?"":alvo;
    $("#q").value=query;
    // clicada fora de uma página com itens, leva para a agenda já filtrada
    if(["home","sub","area","agenda"].includes(rota.tipo)) renderWeek(); else irPara("agenda");
    return;
  }
  if(d.menu){
    const a=act(d.menu); if(!a) return;
    abrirMenu(t,[
      {label:"Abrir detalhe",icon:IC.more,fn:()=>abrirGaveta(a.id)},
      {label:a.open?"Recolher subetapas":(a.steps&&a.steps.length?"Mostrar subetapas":"Dividir em subetapas"),icon:IC.chev,
       fn:()=>{ a.open=!a.open; save(); renderWeek(); }},
      {label:tagsDe(a).length?"Editar etiquetas":"Adicionar etiquetas",icon:IC.tag,hint:tagsDe(a).length?tagsDe(a).length+"":"",
       fn:()=>{ a.tagOpen=!a.tagOpen; save(); renderWeek(); foco(`[data-tagval="${CSS.escape(a.id)}"]`); }},
      {label:a.url?"Editar link":"Anexar link",icon:IC.link,hint:a.url?urlLabel(a.url):"",
       fn:()=>{ a.linkOpen=!a.linkOpen; save(); renderWeek(); foco(`[data-linkval="${CSS.escape(a.id)}"]`); }},
      {label:"Tempo dedicado",icon:IC.clock,hint:tempoTotal(a)?fmtMin(tempoTotal(a)):"",
       fn:()=>{ a.timeOpen=!a.timeOpen; save(); renderWeek(); foco(`[data-timeval="${CSS.escape(a.id)}"]`); }},
      {label:a.sugOff?"Voltar a sugerir peso pelo tempo":"Ignorar a sugestão de peso",icon:IC.clock,
       hint:a.sugOff?"ignorada":"",
       fn:()=>{ a.sugOff=!a.sugOff; save(); renderWeek();
         toast(a.sugOff?"Sugestão de peso desligada nesta atividade.":"Sugestão de peso religada."); }},
      {sep:true},
      {label:"Peso",icon:IC.up,hint:"agora "+(a.weight||1),
       fn:()=>{ a.weight=((a.weight||1)%3)+1; save(); renderWeek(); }},
      {label:"Dia-alvo",icon:IC.more,hint:a.due!=null?DIAS[a.due]:"sem dia",
       fn:()=>{ a.due = a.due==null?0 : (a.due>=6? null : a.due+1); save(); renderWeek(); }},
      {label:"Adiar para a semana seguinte",icon:IC.push,fn:()=>empurrar(a,null)},
      {label:"Transferir para outra atividade",icon:IC.move,fn:()=>menuTransferir(t,a,null)},
      {sep:true},
      {label:"Excluir",icon:IC.x,danger:true,fn:()=>excluirAtividade(a.id)}
    ]);
    return;
  }
  if(d.smenu){
    const {a,s}=step(d.smenu); if(!a||!s) return;
    const ref=d.smenu;
    abrirMenu(t,[
      {label:tagsDe(s).length?"Editar etiquetas":"Adicionar etiquetas",icon:IC.tag,
       fn:()=>{ s.tagOpen=!s.tagOpen; save(); renderWeek(); foco(`[data-stagval="${CSS.escape(ref)}"]`); }},
      {label:s.url?"Editar link":"Anexar link",icon:IC.link,hint:s.url?urlLabel(s.url):"",
       fn:()=>{ s.linkOpen=!s.linkOpen; save(); renderWeek(); foco(`[data-slinkval="${CSS.escape(ref)}"]`); }},
      {label:"Tempo dedicado",icon:IC.clock,hint:tempoDe(s)?fmtMin(tempoDe(s)):"",
       fn:()=>{ s.timeOpen=!s.timeOpen; save(); renderWeek(); foco(`[data-stimeval="${CSS.escape(ref)}"]`); }},
      {label:"Adiar para a semana seguinte",icon:IC.push,fn:()=>empurrar(a,s)},
      {label:"Transferir para outra atividade",icon:IC.move,fn:()=>menuTransferir(t,a,s)},
      {sep:true},
      {label:"Excluir subetapa",icon:IC.x,danger:true,fn:()=>excluirSubetapa(ref)}
    ]);
    return;
  }
  if(d.stepdue){ const {s}=step(d.stepdue); if(s){ s.due = s.due==null?0 : (s.due>=6? null : s.due+1); save(); renderWeek(); } return; }
  if(d.link){ const a=act(d.link); if(a){ a.linkOpen=!a.linkOpen; save(); renderWeek();
      if(a.linkOpen) setTimeout(()=>{ const i=document.querySelector(`[data-linkval="${CSS.escape(d.link)}"]`); if(i){ i.focus(); i.select(); } },0); } return; }
  if(d.slink){ const {s}=step(d.slink); if(s){ s.linkOpen=!s.linkOpen; save(); renderWeek();
      if(s.linkOpen) setTimeout(()=>{ const i=document.querySelector(`[data-slinkval="${CSS.escape(d.slink)}"]`); if(i){ i.focus(); i.select(); } },0); } return; }
  if(d.linkdel){ const a=act(d.linkdel); if(a){ a.url=null; a.linkOpen=false; save(); renderWeek(); toast("Link removido."); } return; }
  if(d.slinkdel){ const {s}=step(d.slinkdel); if(s){ s.url=null; s.linkOpen=false; save(); renderWeek(); toast("Link removido."); } return; }
  if(d.agday!=null && "agday" in d){ S.settings.agendaDay = d.agday===""?null:(d.agday==="none"?"none":Number(d.agday)); save(); renderAgenda(week(cur)); return; }
  if("agsub" in d){ S.settings.agendaSub = d.agsub||null; save(); renderAgenda(week(cur)); return; }
  if(d.agfold){ S.settings.agendaFold=!S.settings.agendaFold; save(); renderAgenda(week(cur)); return; }
  if(d.scolor){ const [sid,n]=d.scolor.split(":"); const s=findSub(sid); if(s){ s.color=Number(n); save(); renderSet(); } return; }
  if(d.icon){
    const s=findSub(d.icon); if(!s) return;
    const itens=[{label:`Automático pelo nome (${ICONES[adivinhaIcone(s.name)].n})`,icon:ICONES[adivinhaIcone(s.name)].s,busca:"automatico auto nome",
      fn:()=>{ delete s.icon; save(); render(); toast("Ícone volta a seguir o nome da frente."); }},{sep:true}]
      .concat(Object.entries(ICONES).map(([k,v])=>({label:v.n,icon:v.s,busca:k+" "+v.n,
        fn:()=>{ s.icon=k; save(); render(); }})));
    abrirMenu(t,itens,{busca:"Procurar ícone…"});
    return;
  }
  if(d.hidesub){ const h=S.settings.hideDoneSubs; if(h[d.hidesub]) delete h[d.hidesub]; else h[d.hidesub]=true; save(); renderWeek(); return; }
  if(d.rot){
    const [hid,iid,di]=d.rot.split(":"); const h=S.habits.find(x=>x.id===hid); if(!h) return;
    const st=rotEstado(cur,hid,true), i=Number(di), its=rotItens(h);
    if(iid){ const m=st.i[iid]=st.i[iid]||{}; if(m[i]) delete m[i]; else m[i]=true; }
    else if(its){ // no cartão, o dia inteiro: marca ou desmarca todas as etapas de uma vez
      const feito=rotDiaFeito(h,st,i);
      its.forEach(it=>{ const m=st.i[it.id]=st.i[it.id]||{}; if(feito) delete m[i]; else m[i]=true; });
    }
    else { if(st.d[i]) delete st.d[i]; else st.d[i]=true; }
    save(); renderWeek(); return;
  }
  if(d.gorot){ const h=S.habits.find(x=>x.id===d.gorot); const ar=h&&subArea(h.sub); if(ar) openSub(ar.id+":"+h.sub); return; }
  if(d.hmode){ const [hid,m]=d.hmode.split(":"); const h=S.habits.find(x=>x.id===hid); if(h){
      h.mode=m; if(m==="daily"&&!Array.isArray(h.days)) h.days=[0,1,2,3,4,5,6];
      save(); render(); } return; }
  if(d.hday){ const [hid,i]=d.hday.split(":"); const h=S.habits.find(x=>x.id===hid); if(h){
      const n=Number(i); h.days=h.days||[];
      h.days = h.days.includes(n) ? h.days.filter(x=>x!==n) : h.days.concat(n).sort();
      save(); render(); } return; }
  if(d.hdays){ const [hid,q]=d.hdays.split(":"); const h=S.habits.find(x=>x.id===hid); if(h){
      h.days = q==="week"?[0,1,2,3,4]:[0,1,2,3,4,5,6]; save(); render(); } return; }
  if(d.restore){
    const alvo=(S.trash||[]).find(x=>x.id===d.restore);
    // sem a subcategoria de origem a atividade voltaria para um cartão que não existe mais
    if(alvo && !findSub(alvo.kind==="act"?alvo.sub:alvo.pai.sub)){
      toast("A subcategoria dessa atividade foi excluída — recrie-a antes de restaurar.");
      return;
    }
    const t=restaurar(d.restore);
    if(!t){ toast("Este item já saiu da lixeira."); renderSet(); return; }
    save(); render();
    const volta=t.week!==cur;
    toast(`"${t.rotulo}" restaurada em ${t.week.replace("-W"," · semana ")}.`,
      volta?{label:"Ir para lá",fn:()=>{ cur=t.week; irPara("home"); }}:null);
    return;
  }
  if(d.trashdel){ S.trash=(S.trash||[]).filter(t=>t.id!==d.trashdel); save(); renderSet(); return; }
  if(d.hweight){ const [hid,n]=d.hweight.split(":"); const h=S.habits.find(x=>x.id===hid);
      if(h){ h.weight=Math.max(1,Math.min(3,Number(n)||1)); save(); render(); } return; }
  if(d.pp!=null && "pp" in d){ S.settings.pushPenalty=d.pp==="1"; save(); render(); return; }
  if(d.lf){ S.settings.lembreteFreq=d.lf; save(); renderSet();
    toast(d.lf==="off"?"Lembrete desligado.":d.lf==="sempre"?"O lembrete aparece toda vez que você abrir.":"O lembrete aparece uma vez por dia."); return; }
  if(d.hidel){ const [hid,iid]=d.hidel.split(":"); const h=S.habits.find(x=>x.id===hid); if(h){
      h.items=(h.items||[]).filter(x=>x.id!==iid);
      Object.values(S.weeks).forEach(w=>{ const v=w.habits&&w.habits[hid]; if(v&&typeof v==="object"&&v.i) delete v.i[iid]; });
      save(); render(); } return; }
  if(d.fold){ S.settings.folded[d.fold]=!S.settings.folded[d.fold]; save(); renderWeek(); return; }
  if(d.foldsub){ S.settings.foldedSubs[d.foldsub]=!S.settings.foldedSubs[d.foldsub]; save(); renderWeek(); return; }
  if(d.open){ openSub(d.open); return; }
  if(d.jump){ jumpToAct(d.jump); return; }
  if(d.del){ excluirAtividade(d.del); return; }
  if(d.weight){ const a=act(d.weight); if(a){ a.weight=((a.weight||1)%3)+1; save(); renderWeek(); } return; }
  if(d.due){ const a=act(d.due); if(a){ a.due = a.due==null?0 : (a.due>=6? null : a.due+1); save(); renderWeek(); } return; }
  if(d.hab){ const w=week(cur,true); const h=S.habits.find(x=>x.id===d.hab);
    const atual=typeof w.habits[d.hab]==="number"?w.habits[d.hab]:0;
    w.habits[d.hab]=Math.max(0,Math.min((h?h.target*2:99),atual+ +d.d)); save(); renderWeek(); return; }
  if(d.scale){ const w=week(cur,true); w.retro[d.scale]= w.retro[d.scale]===+d.v?null:+d.v; save(); renderWeek(); return; }
  if(d.go){ cur=d.go; irPara("home"); return; }
  if(d.t){ S.settings.theme=d.t; save(); render(); return; }

  if(d.amove){ const i=S.areas.findIndex(a=>a.id===d.amove), j=i+ +d.d;
    if(j>=0&&j<S.areas.length){ const [x]=S.areas.splice(i,1); S.areas.splice(j,0,x); save(); renderSet(); } return; }
  if(d.adel){ const a=S.areas.find(x=>x.id===d.adel); if(!a) return;
    const ids=a.subs.map(s=>s.id);
    const n=Object.values(S.weeks).reduce((n,w)=> n+(w.acts||[]).filter(x=>ids.includes(x.sub)).length,0);
    ask(`Excluir a área "${a.name}"?`,
        `As ${a.subs.length} subcategorias dela saem junto${n?`, e ${n} atividade${n>1?"s":""} registrada${n>1?"s":""} em todas as semanas ${n>1?"serão apagadas":"será apagada"}`:""}. Não há como desfazer.`)
    .then(ok=>{ if(!ok) return;
      Object.values(S.weeks).forEach(w=>{ w.acts=(w.acts||[]).filter(x=>!ids.includes(x.sub)); ids.forEach(i=> delete w.goals[i]); });
      S.habits=S.habits.filter(h=>!ids.includes(h.sub));
      ids.forEach(i=> delete S.settings.foldedSubs[i]);
      delete S.settings.folded[a.id];
      S.areas=S.areas.filter(x=>x.id!==d.adel); save(); render(); toast(`Área "${a.name}" excluída.`); });
    return; }
  if(d.addsub||d.newsub){ addSub(d.addsub||d.newsub); return; }
  if(d.smove){ const a=S.areas.find(x=>x.subs.some(s=>s.id===d.smove));
    const i=a.subs.findIndex(s=>s.id===d.smove), j=i+ +d.d;
    if(j>=0&&j<a.subs.length){ const [x]=a.subs.splice(i,1); a.subs.splice(j,0,x); save(); render(); } return; }
  if(d.sdel){ const a=S.areas.find(x=>x.subs.some(s=>s.id===d.sdel)); if(!a) return;
    const s=a.subs.find(s=>s.id===d.sdel);
    const n=Object.values(S.weeks).reduce((n,w)=> n+(w.acts||[]).filter(x=>x.sub===d.sdel).length,0);
    ask(`Excluir "${s.name}"?`,
        n?`${n} atividade${n>1?"s":""} registrada${n>1?"s":""} em todas as semanas ${n>1?"serão apagadas":"será apagada"}. Não há como desfazer.`
         :`A subcategoria está vazia — nada mais será perdido.`)
    .then(ok=>{ if(!ok) return;
      a.subs=a.subs.filter(x=>x.id!==d.sdel);
      Object.values(S.weeks).forEach(w=>{ w.acts=(w.acts||[]).filter(x=>x.sub!==d.sdel); delete w.goals[d.sdel]; });
      S.habits=S.habits.filter(h=>h.sub!==d.sdel);
      delete S.settings.foldedSubs[d.sdel];
      save(); render(); toast(`"${s.name}" excluída.`); });
    return; }
  if(d.hdel){ S.habits=S.habits.filter(h=>h.id!==d.hdel); save(); render(); return; }
});

document.addEventListener("keydown",e=>{
  if(e.key==="Escape" && gavetaId && !document.getElementById("menu")){
    const el=e.target;
    if(!(el.dataset&&(el.dataset.tagval||el.dataset.linkval))){ e.preventDefault(); fecharGaveta(); return; }
  }
  if($("#lmask").classList.contains("on")){
    if(e.key==="Escape"||(e.key==="Enter"&&$("#lem-edit").classList.contains("hidden"))){ e.preventDefault(); fecharLembrete(); }
    return;
  }
  if(askResolve){ // diálogo aberto: só Esc e Enter respondem
    if(e.key==="Escape"){ e.preventDefault(); closeAsk(false); }
    if(e.key==="Enter"){ e.preventDefault(); closeAsk(true); }
    return;
  }
  const el=e.target, typing=/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  if(e.key==="Enter" && el.dataset && el.dataset.add){ addAct(el.dataset.add, el.value); el.value=""; setTimeout(()=>{ const n=document.querySelector(`[data-add="${CSS.escape(el.dataset.add)}"]`); if(n) n.focus(); },0); return; }
  const campoInline=el.dataset&&(el.dataset.linkval||el.dataset.slinkval||el.dataset.tagval||el.dataset.stagval||el.dataset.timeval||el.dataset.stimeval);
  if(e.key==="Enter" && campoInline){ e.preventDefault(); el.blur(); return; }
  if(e.key==="Escape" && campoInline){
    const ehStep=!!(el.dataset.slinkval||el.dataset.stagval||el.dataset.stimeval);
    const alvo=ehStep? step(campoInline).s : act(campoInline);
    if(alvo){ alvo.linkOpen=false; alvo.tagOpen=false; alvo.timeOpen=false; save(); renderWeek(); }
    return;
  }
  if(e.key==="Enter" && el.dataset && el.dataset.hiadd){
    const h=S.habits.find(x=>x.id===el.dataset.hiadd), t=el.value.trim();
    if(h&&t){ (h.items=h.items||[]).push({id:uid(),name:t,at:null}); el.value=""; save(); render();
      setTimeout(()=>{ const n=document.querySelector(`[data-hiadd="${CSS.escape(h.id)}"]`); if(n) n.focus(); },0); }
    return;
  }
  if(e.key==="Enter" && el.dataset && el.dataset.stepadd){ const id=el.dataset.stepadd; addStep(id, el.value); el.value="";
    setTimeout(()=>{ const n=document.querySelector(`[data-stepadd="${CSS.escape(id)}"]`); if(n) n.focus(); },0); return; }
  // Enter confirma o texto em vez de inserir quebra de linha
  if(e.key==="Enter" && !e.shiftKey && el.dataset && (el.dataset.text||el.dataset.steptext||el.dataset.sname||el.dataset.aname||el.dataset.hname)){ e.preventDefault(); el.blur(); return; }
  if(e.key==="Escape" && el.id==="q"){ el.value=""; query=""; renderWeek(); el.blur(); return; }
  if(typing) return;
  if(e.key==="/"){ e.preventDefault(); $("#q").focus(); return; }
  if(e.key==="ArrowLeft"){ cur=shiftKey(cur,-1); render(); }
  if(e.key==="ArrowRight"){ cur=shiftKey(cur,1); render(); }
});

document.addEventListener("input",e=>{
  const d=e.target.dataset;
  if(d.goal!=null && "goal" in d){ week(cur,true).goals[d.goal]=e.target.value; autosize(e.target); save(); return; }
  if(d.text){ const a=act(d.text); if(a){ a.text=e.target.value; autosize(e.target); save(); } return; }
  if(d.steptext){ const {s}=step(d.steptext); if(s){ s.text=e.target.value; autosize(e.target); save(); } return; }
  if(d.retro){ week(cur,true).retro[d.retro]=e.target.value; save(); return; }
  // ids não contêm ":", então a chave composta identifica uma subetapa
  if(d.attime){
    const alvo=d.attime.includes(":") ? step(d.attime).s : act(d.attime);
    if(alvo){
      alvo.at=e.target.value||null;
      save(); e.target.classList.toggle("set",!!alvo.at);
      renderAgenda(week(cur)); // só a agenda reordena; não redesenha o campo sob o cursor
    }
    return;
  }
  if(e.target.id==="q"){ query=e.target.value; renderWeek(); return; }
  if(e.target.id==="lemtxt"){ S.settings.lembrete=e.target.value; save(); return; }
});
document.addEventListener("change",e=>{
  const d=e.target.dataset, id=e.target.id;
  if(d.aname){ S.areas.find(a=>a.id===d.aname).name=e.target.value.trim()||"Área"; save(); render(); return; }
  if(d.sname){ const s=findSub(d.sname); if(s){ s.name=e.target.value.trim()||"Subcategoria"; save(); render(); } return; }
  if(d.hname){ const h=S.habits.find(x=>x.id===d.hname); if(h){ h.name=e.target.value.trim()||"Hábito"; save(); } return; }
  if(d.htarget){ const h=S.habits.find(x=>x.id===d.htarget); if(h){ h.target=Math.max(1,Math.min(21,+e.target.value||1)); save(); } return; }
  if(d.hat){ const h=S.habits.find(x=>x.id===d.hat); if(h){ h.at=e.target.value||null; save(); render(); } return; }
  if(d.hfrom||d.hto){
    const hid=d.hfrom||d.hto, h=S.habits.find(x=>x.id===hid);
    if(h){
      if(d.hfrom) h.from=e.target.value||null; else h.to=e.target.value||null;
      if(h.from&&h.to&&h.to<h.from){ toast("O fim vem antes do início — o período ficou vazio."); }
      save(); render();
    }
    return;
  }
  if(d.hiname){ const [hid,iid]=d.hiname.split(":"); const h=S.habits.find(x=>x.id===hid);
    const it=h&&(h.items||[]).find(x=>x.id===iid);
    if(it){ it.name=e.target.value.trim()||"Etapa"; save(); renderWeek(); } return; }
  if(d.hiat){ const [hid,iid]=d.hiat.split(":"); const h=S.habits.find(x=>x.id===hid);
    const it=h&&(h.items||[]).find(x=>x.id===iid);
    if(it){ it.at=e.target.value||null; save(); render(); } return; }
  if(d.timeval||d.stimeval){
    const ehStep=!!d.stimeval, ref=d.timeval||d.stimeval;
    const alvo=ehStep? step(ref).s : act(ref);
    if(!alvo) return;
    const min=parseMin(e.target.value);
    if(Number.isNaN(min)){ toast('Não entendi o tempo — use "45", "1h30" ou "90m".'); e.target.focus(); return; }
    alvo.mins=min==null?0:Math.min(24*60,min);
    alvo.timeOpen=false;
    save(); renderWeek();
    toast(alvo.mins?`Tempo registrado: ${fmtMin(alvo.mins)}.`:"Tempo zerado.");
    return;
  }
  if(d.tagval||d.stagval){
    const ehStep=!!d.stagval, ref=d.tagval||d.stagval;
    const alvo=ehStep? step(ref).s : act(ref);
    if(!alvo) return;
    alvo.tags=parseTags(e.target.value);
    alvo.tagOpen=false;
    save(); renderWeek();
    toast(alvo.tags.length?`Etiquetas: ${alvo.tags.map(t=>"#"+t).join(" ")}`:"Etiquetas removidas.");
    return;
  }
  if(d.linkval||d.slinkval){
    const ehStep=!!d.slinkval, ref=d.linkval||d.slinkval;
    const alvo=ehStep? step(ref).s : act(ref);
    if(!alvo) return;
    const u=normUrl(e.target.value);
    if(u===false){ toast("Endereço inválido — use um link http ou https."); e.target.focus(); return; }
    alvo.url=u; alvo.linkOpen=false;
    save(); renderWeek();
    toast(u?"Link salvo.":"Link removido.");
    return;
  }
  if(id==="goalpct"){ S.settings.goal=Math.max(10,Math.min(100,+e.target.value||75)); save(); return; }
  if(id==="partial"){ S.settings.partial=Math.max(0,Math.min(100,+e.target.value||50)); save(); return; }
  if(id==="tmedio"){ S.settings.tempoMedio=Math.max(5,Math.min(480,+e.target.value||30));
    if(limiteAlto()<=S.settings.tempoMedio) S.settings.tempoAlto=S.settings.tempoMedio*2;   // o alto tem de ficar acima do médio
    save(); renderSet(); return; }
  if(id==="talto"){ S.settings.tempoAlto=Math.max(limiteMedio()+5,Math.min(960,+e.target.value||120)); save(); renderSet(); return; }
  if(id==="pushbonus"){ S.settings.pushBonus=Math.max(0,Math.min(50,+e.target.value||0)); save(); renderSet(); return; }
  if(id==="lemtxt"){ S.settings.lembrete=e.target.value.trim(); save(); return; }   // ao sair do campo, apara os espaços
});

/* arrastar para reordenar/mover entre cartões */
let drag=null, dragStep=null, dragArea=null;
document.addEventListener("dragstart",e=>{
  const ag=e.target.closest("[data-agrip]");
  if(ag){
    dragArea=ag.dataset.agrip;
    const bloco=ag.closest(".areablock"); bloco.classList.add("dragging");
    e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain","");
    try{ e.dataTransfer.setDragImage(bloco,14,12); }catch(_){}
    e.stopPropagation(); return;
  }
  // subetapa: arrasta só dentro da própria atividade
  const sg=e.target.closest("[data-stepgrip]");
  if(sg){
    dragStep=sg.dataset.stepgrip;
    const row=sg.closest(".step"); row.classList.add("dragging");
    e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain","");
    try{ e.dataTransfer.setDragImage(row,14,12); }catch(_){}
    e.stopPropagation(); return;
  }
  const g=e.target.closest("[data-grip]");
  if(!g){ e.preventDefault(); return; }
  const li=g.closest(".itemwrap");
  drag=li.dataset.id; li.classList.add("dragging");
  e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain","");
  try{ e.dataTransfer.setDragImage(li,14,12); }catch(_){}
});
const limpaMarcas=()=> $$(".itemwrap.over,.itemwrap.over-fim,.itemwrap.dentro,.step.over").forEach(x=>x.classList.remove("over","over-fim","dentro"));
document.addEventListener("dragend",()=>{
  $$(".itemwrap,.step,.areablock").forEach(x=>x.classList.remove("dragging","over","over-fim","dentro"));
  drag=null; dragStep=null; dragArea=null;
});
// Nas bordas da linha, reordena. No miolo dela, entra para dentro da atividade —
// é a mesma distinção que o gesto tem em qualquer lista com hierarquia.
function zonaDe(li,y){
  const r=li.getBoundingClientRect(), rel=(y-r.top)/Math.max(1,r.height);
  return rel<0.32?"antes" : rel>0.68?"depois" : "dentro";
}
document.addEventListener("dragover",e=>{
  if(dragArea){
    const b=e.target.closest(".areablock");
    if(!b) return;
    e.preventDefault();
    $$(".areablock.over,.areablock.over-fim").forEach(x=>x.classList.remove("over","over-fim"));
    if(b.dataset.area!==dragArea){
      const r=b.getBoundingClientRect();
      b.classList.add(e.clientY < r.top+r.height/2 ? "over" : "over-fim");
    }
    return;
  }
  if(dragStep){
    const [aid,sid]=dragStep.split(":");
    const li=e.target.closest(".itemwrap");
    if(e.target.closest(".steps")){
      e.preventDefault(); limpaMarcas();
      const st=e.target.closest(".step");
      if(st && st.dataset.aid===aid && st.dataset.sid!==sid) st.classList.add("over");
      return;
    }
    // fora da própria lista de etapas: soltar sobre outra atividade transfere
    if(li && li.dataset.id!==aid){ e.preventDefault(); limpaMarcas(); li.classList.add("dentro"); }
    return;
  }
  if(!drag) return;
  if(!e.target.closest(".card")) return;
  e.preventDefault(); limpaMarcas();
  const li=e.target.closest(".itemwrap");
  if(li && li.dataset.id!==drag){
    const z=zonaDe(li,e.clientY);
    li.classList.add(z==="antes"?"over":z==="depois"?"over-fim":"dentro");
  }
});
document.addEventListener("drop",e=>{
  if(dragArea){
    const b=e.target.closest(".areablock");
    if(!b || b.dataset.area===dragArea) return;
    e.preventDefault();
    const i=S.areas.findIndex(a=>a.id===dragArea); if(i<0) return;
    const [mov]=S.areas.splice(i,1);
    let j=S.areas.findIndex(a=>a.id===b.dataset.area);
    const r=b.getBoundingClientRect();
    if(e.clientY >= r.top+r.height/2) j++;
    S.areas.splice(Math.max(0,j),0,mov);
    save(); render();
    return;
  }
  if(dragStep){
    const [aid,sid]=dragStep.split(":");
    const a=act(aid); if(!a||!a.steps) return;
    if(e.target.closest(".steps")){
      e.preventDefault();
      const i=a.steps.findIndex(x=>x.id===sid); if(i<0) return;
      const [it]=a.steps.splice(i,1);
      const st=e.target.closest(".step");
      const j=(st && st.dataset.aid===aid) ? a.steps.findIndex(x=>x.id===st.dataset.sid) : -1;
      if(j>=0) a.steps.splice(j,0,it); else a.steps.push(it);
      save(); renderWeek(); return;
    }
    const li=e.target.closest(".itemwrap");
    if(li && li.dataset.id!==aid){
      e.preventDefault();
      const s=a.steps.find(x=>x.id===sid);
      if(s) transferir(a,li.dataset.id,s);
    }
    return;
  }
  if(!drag) return;
  const card=e.target.closest(".card"); if(!card) return;
  e.preventDefault();
  const w=week(cur), li=e.target.closest(".itemwrap");
  if(li && li.dataset.id!==drag && zonaDe(li,e.clientY)==="dentro"){
    const origem=w.acts.find(a=>a.id===drag);
    if(origem) transferirComAviso(origem,li.dataset.id,null);
    return;
  }
  const i=w.acts.findIndex(a=>a.id===drag); if(i<0) return;
  const [it]=w.acts.splice(i,1); it.sub=card.dataset.sub;
  let j=li? w.acts.findIndex(a=>a.id===li.dataset.id) : -1;
  if(j>=0 && zonaDe(li,e.clientY)==="depois") j++;
  if(j>=0) w.acts.splice(j,0,it); else w.acts.push(it);
  save(); renderWeek();
});

$("#prev").onclick=()=>{ cur=shiftKey(cur,-1); render(); };
$("#next").onclick=()=>{ cur=shiftKey(cur,1); render(); };
$("#today").onclick=()=>{ cur=todayKey(); render(); };

// as ações que viviam na barra de ferramentas agora moram num menu só
$("#maisacoes").onclick=e=>{
  const subs=allSubs();
  const todasSubsRecolhidas=subs.every(s=>S.settings.foldedSubs[s.id]);
  abrirMenu(e.currentTarget,[
    {label:"Puxar semana anterior",icon:IC.undo,hint:"objetivos e pendências",fn:carryOver},
    {label:"Exportar relatório da semana",icon:IC.down,fn:exportMD},
    {sep:true},
    {label:S.settings.hideDone?"Mostrar concluídas":"Ocultar concluídas",icon:S.settings.hideDone?IC.eye:IC.eyeoff,
     fn:()=>{ S.settings.hideDone=!S.settings.hideDone; save(); renderWeek(); }},
    {label:todasSubsRecolhidas?"Expandir todas as frentes":"Recolher todas as frentes",icon:IC.chev,
     fn:()=>{ subs.forEach(s=> S.settings.foldedSubs[s.id]=!todasSubsRecolhidas);
       if(!todasSubsRecolhidas) S.areas.forEach(a=> S.settings.folded[a.id]=false);
       save(); renderWeek(); }},
    {sep:true},
    {label:"Ajustes",icon:SECOES.set.ic,fn:()=>irPara("set")}
  ]);
};
ACOES["addArea"]=()=>{ S.areas.push({id:uid(),name:"Nova área",tone:S.areas.length%2?"personal":"pro",subs:[{id:uid(),name:"Nova subcategoria"}]}); save(); render(); };
function novaRotina(diaria){
  const n=$("#hname").value.trim(); if(!n){ $("#hname").focus(); return; }
  const h={id:uid(),name:n,sub:$("#hsub").value,target:Math.max(1,+$("#htarget").value||3),weight:1,mode:diaria?"daily":"freq"};
  if(diaria){ h.days=[0,1,2,3,4,5,6]; h.at=null; h.from=null; h.to=null; h.items=[]; }
  S.habits.push(h);
  $("#hname").value=""; save(); render();
  toast(diaria?"Rotina diária criada — já aparece na agenda.":"Rotina de frequência criada.");
}
ACOES["addHabit"]=()=>novaRotina(false);
ACOES["addDaily"]=()=>novaRotina(true);
ACOES["lemver"]=()=>{
  if(!lemTexto()){ toast("Escreva a mensagem primeiro."); $("#lemtxt").focus(); return; }
  abrirLembrete(true);
};
ACOES["emptyTrash"]=()=>{
  const n=(S.trash||[]).length;
  if(!n){ toast("A lixeira já está vazia."); return; }
  ask("Esvaziar a lixeira?",`${n} ite${n===1?"m":"ns"} ${n===1?"será descartado":"serão descartados"} de vez. Aí não há mais como recuperar.`,"Esvaziar")
  .then(ok=>{ if(!ok) return; S.trash=[]; save(); renderSet(); toast("Lixeira esvaziada."); });
};
ACOES["expjson"]=()=> download(JSON.stringify(S,null,2),`painel-semanal-${todayKey()}.json`,"application/json");
ACOES["impjson"]=()=> $("#file").click();
ACOES_CHANGE["file"]=e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{
      const p=JSON.parse(r.result);
      if(!p||!p.areas||!p.weeks) throw 0;
      const n=Object.keys(p.weeks).length;
      ask("Restaurar este backup?",`Ele traz ${n} semana${n===1?"":"s"} e substitui tudo o que está neste navegador. Exporte antes se quiser guardar o estado atual.`,"Restaurar")
      .then(ok=>{ if(!ok) return;
        S=Object.assign(structuredClone(DEFAULT),p,{settings:Object.assign({},DEFAULT.settings,p.settings||{})});
        S.settings.folded=S.settings.folded||{}; S.settings.foldedSubs=S.settings.foldedSubs||{};
        save(); render(); toast("Backup restaurado."); });
    }catch(err){ toast("Arquivo inválido — esperava um backup .json deste painel."); } };
  r.readAsText(f); e.target.value="";
};
ACOES["reset"]=()=>{
  const n=dataWeeks().length;
  ask("Apagar tudo?",`${n} semana${n===1?"":"s"} registrada${n===1?"":"s"}, as categorias e os hábitos somem deste navegador. Não há como desfazer — exporte um backup antes se tiver dúvida.`,"Apagar tudo")
  .then(ok=>{ if(!ok) return;
    S=structuredClone(DEFAULT); save(); cur=todayKey(); render(); toast("Painel zerado."); });
};
/* ---------- sincronização via Gist ---------- */
/* O token mora numa chave separada do estado: assim ele não viaja no backup
   exportado nem sobe para o Gist junto com os dados. */
const SKEY="painel-semanal-sync", GFILE="painel-semanal.json";
let cfg=loadCfg();
function loadCfg(){
  try{ const c=JSON.parse(localStorage.getItem(SKEY)||"{}");
       return {token:c.token||"",gist:c.gist||"",auto:!!c.auto,seen:c.seen||0}; }
  catch(e){ return {token:"",gist:"",auto:false,seen:0}; }
}
function saveCfg(){ try{ localStorage.setItem(SKEY,JSON.stringify(cfg)); }catch(e){} }

let busy=false, statusMsg="", statusKind="";
function setStatus(m,k){ statusMsg=m||""; statusKind=k||""; paintStatus(); }
function paintStatus(){
  const el=$("#ghstatus"); if(!el) return;
  el.textContent=statusMsg;
  el.style.color= statusKind==="err"?"var(--crit)" : statusKind==="ok"?"var(--ok)" : "var(--ink-3)";
}
function lastSyncLabel(){
  if(!cfg.seen) return "Nunca sincronizado.";
  const d=new Date(cfg.seen);
  const p=n=>String(n).padStart(2,"0");
  return `Última sincronização: ${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}.`;
}
function renderSync(){
  const t=$("#ghtoken"); if(!t) return;
  t.value=cfg.token?"••••••••••••••••":"";
  t.dataset.masked=cfg.token?"1":"";
  $("#ghgist").value=cfg.gist;
  $$("#ghauto button").forEach(b=> b.setAttribute("aria-pressed", (b.dataset.a==="1")===cfg.auto));
  if(!statusMsg) setStatus(cfg.token?lastSyncLabel():"Sem token — a sincronização está desligada.");
  else paintStatus();
}

async function gh(path,opts){
  let r;
  try{
    r=await fetch("https://api.github.com"+path,Object.assign({},opts,{headers:{
      "Authorization":"Bearer "+cfg.token,
      "Accept":"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      "Content-Type":"application/json"
    }}));
  }catch(e){ throw new Error("Sem conexão com o GitHub."); }
  if(r.status===401) throw new Error("Token inválido ou expirado.");
  if(r.status===403) throw new Error("Sem permissão — o token precisa de Gists: read and write.");
  if(r.status===404) throw new Error("Gist não encontrado — confira o ID ou deixe o campo vazio para criar um novo.");
  if(!r.ok) throw new Error("GitHub respondeu "+r.status+".");
  return r.json();
}
function envelope(){ return JSON.stringify({app:"painel-semanal",version:1,savedAt:Date.now(),data:S},null,2); }
function unwrap(txt){
  const p=JSON.parse(txt);
  const d=p&&p.data?p.data:p;              // aceita envelope novo ou backup cru
  if(!d||!d.areas||!d.weeks) throw new Error("O Gist não tem um backup deste painel.");
  return {data:d,savedAt:(p&&p.savedAt)||0};
}
function adopt(d){
  S=Object.assign(structuredClone(DEFAULT),d,{settings:Object.assign({},DEFAULT.settings,d.settings||{})});
  S.settings.folded=S.settings.folded||{}; S.settings.foldedSubs=S.settings.foldedSubs||{};
  try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){}
}

async function remoteState(){
  const g=await gh("/gists/"+encodeURIComponent(cfg.gist));
  const f=g.files&&g.files[GFILE];
  if(!f) throw new Error("O Gist não tem o arquivo "+GFILE+".");
  // arquivos grandes vêm truncados; nesse caso o conteúdo real está no raw_url
  let txt=f.content;
  if(f.truncated||txt==null){
    const r=await fetch(f.raw_url);
    if(!r.ok) throw new Error("Não foi possível ler o conteúdo do Gist.");
    txt=await r.text();
  }
  return unwrap(txt);
}

async function push(manual){
  if(busy) return;
  if(!cfg.token){ setStatus("Salve um token antes de sincronizar.","err"); if(manual) toast("Falta o token de acesso."); return; }
  busy=true; setStatus("Enviando…");
  try{
    if(cfg.gist){
      // conflito: alguém gravou depois da última vez que este navegador viu o Gist
      let rem=null;
      try{ rem=await remoteState(); }catch(e){ if(/não tem/.test(e.message)) rem=null; else throw e; }
      if(rem&&rem.savedAt&&cfg.seen&&rem.savedAt>cfg.seen){
        busy=false;
        const ok=await ask("O GitHub tem uma versão mais recente",
          "Outro dispositivo gravou depois da última sincronização deste aqui. Enviar agora substitui aquela versão pelos dados deste navegador.",
          "Enviar mesmo assim");
        if(!ok){ setStatus("Envio cancelado — use \"Puxar\" para trazer a versão do GitHub.","err"); return; }
        busy=true;
      }
    }
    const body=JSON.stringify({
      description:"Painel Semanal — registro de progresso",
      public:false,
      files:{[GFILE]:{content:envelope()}}
    });
    const g=cfg.gist
      ? await gh("/gists/"+encodeURIComponent(cfg.gist),{method:"PATCH",body})
      : await gh("/gists",{method:"POST",body});
    cfg.gist=g.id; cfg.seen=Date.now(); saveCfg();
    setStatus(lastSyncLabel(),"ok");
    if($("#ghgist")) $("#ghgist").value=cfg.gist;
    if(manual) toast("Painel enviado para o GitHub.");
  }catch(e){
    setStatus(e.message,"err");
    if(manual) toast(e.message);
  }finally{ busy=false; }
}

async function pull(manual){
  if(busy) return;
  if(!cfg.token||!cfg.gist){ setStatus("Informe o token e o Gist para puxar.","err"); if(manual) toast("Falta token ou Gist."); return; }
  busy=true; setStatus("Puxando…");
  try{
    const rem=await remoteState();
    if(!manual&&rem.savedAt&&cfg.seen&&rem.savedAt<=cfg.seen){ setStatus(lastSyncLabel()); return; }
    if(manual){
      busy=false;
      const n=Object.keys(rem.data.weeks||{}).length;
      const ok=await ask("Trazer os dados do GitHub?",
        `O Gist traz ${n} semana${n===1?"":"s"} e substitui tudo o que está neste navegador.`,"Trazer");
      if(!ok){ setStatus(lastSyncLabel()); return; }
      busy=true;
    }
    adopt(rem.data);
    cfg.seen=rem.savedAt||Date.now(); saveCfg();
    cur=todayKey(); render();
    setStatus(lastSyncLabel(),"ok");
    if(manual) toast("Dados trazidos do GitHub.");
  }catch(e){
    setStatus(e.message,"err");
    if(manual) toast(e.message);
  }finally{ busy=false; }
}

let autoT;
function syncTouch(){
  if(!cfg.auto||!cfg.token) return;
  clearTimeout(autoT);
  autoT=setTimeout(()=>push(false),8000);
}

ACOES["ghsavetok"]=()=>{
  const el=$("#ghtoken"), v=el.value.trim();
  if(el.dataset.masked==="1"&&v.startsWith("•")){ setStatus("Token já salvo. Cole um novo por cima para trocar."); return; }
  if(!v){ cfg.token=""; saveCfg(); renderSync(); setStatus("Token removido.","err"); return; }
  cfg.token=v; saveCfg(); renderSync(); setStatus("Token salvo neste navegador.","ok"); toast("Token salvo.");
};
ACOES_CHANGE["ghgist"]=e=>{
  // aceita o ID puro ou a URL inteira do Gist
  const m=e.target.value.trim().match(/([0-9a-f]{20,})/i);
  cfg.gist=m?m[1]:""; cfg.seen=0; saveCfg(); e.target.value=cfg.gist;
  setStatus(cfg.gist?"Gist definido — puxe para trazer os dados.":"Gist limpo — o próximo envio cria um novo.");
};
$$("#ghauto button").forEach(b=> b.onclick=()=>{
  cfg.auto=b.dataset.a==="1"; saveCfg(); renderSync();
  setStatus(cfg.auto?"Sincronização automática ligada.":"Sincronização automática desligada.");
});
ACOES["ghpush"]=()=>push(true);
ACOES["ghpull"]=()=>pull(true);

render();
abrirLembrete(false);
if(cfg.auto&&cfg.token&&cfg.gist) pull(false);
})();

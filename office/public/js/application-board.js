// Interactive floor display. Private application data stays local and is never sent to a model.
(function(){
 'use strict';
 const I=window.OfficeI18n,{h,getJson,postJson}=window.OfficeApi,F=window.OfficeLayout.FLOOR_LED;
 const ORDER=['harika_uyum','cok_iyi_uyum','iyi_uyum','uyumlu','uyumsuz','untiered'];
 let options,panel,floating,floor,body,toolbar,footer,title,front,catLabel,menuTitle,mode='idle',data=null,geo=null,error=false,loading=false,classifying=false,selected=null,sort={key:'tier',dir:1},filters={},exactFilters={},tableBody;
 let detailed=false,previousCamera=null,jobView='table',jobType='all',dateFrom='',dateTo='';
 const mapDefaults=()=>({company:'',type:'all',from:'2026-08-01',to:''});
 let mapFilters={board:mapDefaults(),map:mapDefaults()};
 const IDLE_MS=300000;
 let keepScreenOn=false,idleUntil=0,lastMode='usage',powerTimer,powerButtons=[];
 let usageData=null,usageProvider='claude',usageDays=30,usageLoading=false,usageError=false;
 const columns=['position','city','tier','prepared','link','description','evidence'];
 const preparedDay=r=>r.preparedAt?new Date(r.preparedAt).toLocaleDateString('sv-SE'):'';
 const preparedLabel=r=>r.preparedAt?new Date(r.preparedAt).toLocaleDateString(I.lang==='tr'?'tr-TR':'en-GB'):tr('missing');
 const tr=key=>I.t('apps.'+key);
 const tier=t=>tr('tier.'+t);
 const join=a=>(a??[]).join(' • ');
 const value=(r,key)=>({position:r.company+' '+r.title,city:r.location.split(/[;(]/)[0].trim(),tier:tier(r.tier),prepared:preparedDay(r),link:r.url??'',description:join(r.description),evidence:join(r.evidence)||r.summary})[key]??'';
 const normalized=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en');
 function visibleRows(){
  return (data?.reviewed??[]).filter(r=>(jobType==='all'||(r.jobTypes??['unknown']).includes(jobType))&&(!dateFrom||preparedDay(r)>=dateFrom)&&(!dateTo||(preparedDay(r)&&preparedDay(r)<=dateTo))&&Object.entries(filters).every(([key,term])=>{const query=normalized(term).trim(),cell=normalized(value(r,key)).trim();return !query||(exactFilters[key]?cell===query:cell.includes(query));}))
   .sort((a,b)=>sort.dir*(sort.key==='tier'?ORDER.indexOf(a.tier)-ORDER.indexOf(b.tier):value(a,sort.key).localeCompare(value(b,sort.key),I.lang,{numeric:true}))||(b.preparedAt??'').localeCompare(a.preparedAt??''));
 }
 function close(){panel.hidden=true;}
 function open(){window.OfficeNewsDesk.close();window.OfficeNews.close();panel.hidden=false;menuTitle.textContent=tr('title');floating.open();panel.querySelector('button').focus();}
 async function load(fresh=false,classify=false){
  if(loading)return;const previous=body?.querySelector('.table-scroll'),scroll={top:previous?.scrollTop??0,left:previous?.scrollLeft??0,city:body?.querySelector('.city-sidebar')?.scrollTop??0};loading=true;classifying=classify;error=false;render();
  try{const [next,map]=await Promise.all([classify?postJson('/api/applications/refresh',{provider:window.OfficeChat.state.provider}):getJson('/api/applications/board'+(fresh?'?refresh=1':'')),geo?Promise.resolve(geo):getJson('/data/germany.json')]);data=next;geo=map;}
  catch{error=true;}finally{loading=false;classifying=false;render();const table=body.querySelector('.table-scroll');if(table){table.scrollTop=scroll.top;table.scrollLeft=scroll.left;}const city=body.querySelector('.city-sidebar');if(city)city.scrollTop=scroll.city;}
 }
 async function loadUsage(fresh=false){
  if(usageLoading)return;usageLoading=true;usageError=false;render();
  try{usageData=await getJson('/api/usage/details'+(fresh?'?refresh=1':''));}catch{usageError=true;}finally{usageLoading=false;if(mode==='usage')render();}
 }
 function showUsage(provider){usageProvider=['claude','codex','antigravity'].includes(provider)?provider:'claude';close();window.OfficeNewsDesk.close();window.OfficeNews.close();setMode('usage');}
 function toggleFocus(){
  const v=options.view;
  if(previousCamera){v.cam={...previousCamera};previousCamera=null;}
  else if(detailed){v.resetView();}
  else{previousCamera={...v.cam};v.cam={x:F.x+F.w/2,y:F.y+F.h/2,z:2.3};}
  if(previousCamera&&options.view.floorPowerPending===false)options.onCancelPower();
  interact();updatePower();v.clampCam();render();
 }
 function interact(){if(mode!=='idle')idleUntil=Date.now()+IDLE_MS;}
 function wake(){idleUntil=Date.now()+IDLE_MS;}
 function updatePower(){
  if(mode==='idle')return;
  if(previousCamera||document.fullscreenElement){idleUntil=Date.now()+IDLE_MS;}
  if(!keepScreenOn&&Date.now()>=idleUntil&&options.view.floorPowerPending!==false){options.onPower(false);}
  const label=options.view.floorPowerPending===false?tr('powerClosing'):(keepScreenOn||previousCamera||document.fullscreenElement)?tr('alwaysOn'):tr('autoOff').replace('{n}',Math.max(0,Math.ceil((idleUntil-Date.now())/1000)));
  if(powerTimer){const seconds=Math.max(0,Math.ceil((idleUntil-Date.now())/1000)),compact=options.view.floorPowerPending===false?tr('powerClosing'):(keepScreenOn||previousCamera||document.fullscreenElement)?'∞':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');powerTimer.textContent=previousCamera?label:compact;powerTimer.title=label;powerTimer.setAttribute('aria-label',label);}
 }
 function applyPower(on){
  if(on){wake();mode=lastMode;render();if(mode==='usage')void loadUsage(true);else void load();}
  else{mode='idle';if(previousCamera){options.view.cam={...previousCamera};options.view.clampCam();previousCamera=null;}render();}
 }
 function setMode(next){
  if(!['board','map','usage'].includes(next)){if(mode!=='idle')options.onPower(false);return;}
  lastMode=next;
  if(mode==='idle'){options.onPower(true);return;}
  interact();mode=next;selected=null;render();if(mode==='usage')void loadUsage();else void load();
 }
 function link(row){return row.url?h('a',{href:row.url,target:'_blank',rel:'noopener noreferrer',title:row.url},tr('open')):h('span',tr('missing'));}
 function rawMap(){return mode==='board'?data?.reviewedMap:data?.map;}
 function mapData(){return window.OfficeApplicationMap.filterMap(rawMap(),mapFilters[mode]??{});}
 function countText(n){return tr(mode==='board'?'pendingCVs':'applications').replace('{n}',n);}
 function stats(){const m=mapData();return h('div.floor-stats',...[['total',m.total],['mapped',m.mapped],['cities',m.cities.length],['unmapped',m.unmapped.length]].map(([key,n])=>h('span',h('strong',n),tr(mode==='board'?'pending.'+key:key))));}
 function rows(){
  if(!tableBody)return;const list=visibleRows();tableBody.replaceChildren();
  for(const row of list){
   const role=row.title.startsWith(row.company)?row.title.slice(row.company.length).replace(/^\s*[-–—:]\s*/, ''):row.title;
   const details=h('details.job-detail',h('summary',h('strong',row.company),h('span',role)),h('p',row.folder),h('p',tr('column.prepared')+': '+preparedLabel(row)),h('p',(row.jobTypes??['unknown']).map(t=>tr(t==='unknown'?'classificationPending':'jobType.'+t)).join(' / ')),h('small',row.preparedAt?tr('dateSource'):tr('dateUnknown')),h('strong',tr('column.description')),h('p',join(row.description)||tr('missing')),h('strong',tr('column.evidence')),h('p',join(row.evidence)||row.summary||tr('missing')));
   tableBody.append(h('tr',h('td',details),h('td',{title:row.location},row.location.split(/[;(]/)[0].trim()),h('td',h('span.tier-chip',{class:'tier-chip '+row.tier},tier(row.tier))),h('td',{title:row.preparedAt?tr('dateSource'):tr('dateUnknown')},preparedLabel(row)),h('td',link(row)),h('td',h('div.cell-notes',{title:join(row.description)},join(row.description?.slice(0,3).map(s=>s.length>95?s.slice(0,94)+'…':s))||tr('missing'))),h('td',h('div.cell-notes',{title:join(row.evidence)||row.summary},join(row.evidence?.slice(0,3).map(s=>s.length>95?s.slice(0,94)+'…':s))||row.summary||tr('missing')))));
  }
  if(!list.length)tableBody.append(h('tr',h('td',{colspan:columns.length},tr('empty'))));
  for(const th of body.querySelectorAll('th'))th.setAttribute('aria-sort',th.dataset.column===sort.key?(sort.dir===1?'ascending':'descending'):'none');
  footer.textContent=tr('rows').replace('{shown}',list.length).replace('{total}',data.reviewed.length)+(data.skipped?' · '+tr('skipped').replace('{n}',data.skipped):'');
 }
 function table(){
  const types=['all',...(data.jobTypes??['phd','intern','full_time','other']).filter(t=>t!=='unknown')];
  const typeSelect=h('select',{'aria-label':tr('jobTypeLabel'),onchange:e=>{jobType=e.target.value;rows();}},...types.map(t=>h('option',{value:t,selected:jobType===t},tr('jobType.'+t))));
  const start=h('input',{type:'date',value:dateFrom,'aria-label':tr('dateFrom'),onchange:e=>{dateFrom=e.target.value;rows();}});
  const end=h('input',{type:'date',value:dateTo,'aria-label':tr('dateTo'),onchange:e=>{dateTo=e.target.value;rows();}});
  body.append(h('div.job-filters',h('label',tr('jobTypeLabel'),typeSelect),h('label',tr('dateFrom'),start),h('label',tr('dateTo'),end),h('button',{type:'button',onclick:()=>{jobType='all';dateFrom='';dateTo='';filters={};exactFilters={};render();}},tr('clear')),h('small',tr('dateSource'))));
  const head=h('thead'),line=h('tr');
  for(const key of columns){
   const hint=h('small',tr(exactFilters[key]?'filterExact':'filterContains'));
   const input=h('input',{type:'search',value:filters[key]??'',placeholder:tr('filter'),'aria-label':tr('filter')+' · '+tr('column.'+key),
    oninput:e=>{filters[key]=e.target.value;exactFilters[key]=false;hint.textContent=tr('filterContains');rows();},
    onkeydown:e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();filters[key]=e.target.value;exactFilters[key]=!!e.target.value.trim();hint.textContent=tr(exactFilters[key]?'filterExact':'filterContains');rows();}}});
   const popup=h('details.column-menu',h('summary',tr('column.'+key)+' ↕'),h('div.column-controls',
    h('button',{type:'button',onclick:()=>{sort={key,dir:1};rows();}},tr('ascending')),
    h('button',{type:'button',onclick:()=>{sort={key,dir:-1};rows();}},tr('descending')),input,hint,
    h('button',{type:'button',onclick:()=>{filters[key]='';exactFilters[key]=false;input.value='';hint.textContent=tr('filterContains');rows();}},tr('clear'))));
   line.append(h('th',{scope:'col','data-column':key},popup));
  }
  head.append(line);tableBody=h('tbody');body.append(h('div.table-scroll',h('table.jobs-table',head,tableBody)));rows();
 }
 function preview(){
  const root=h('div.terminal-overview');body.append(root);
  if(mode==='usage'){
   root.append(h('p.overview-eyebrow',tr('usageOverview')),h('h2',I.t('usage.title')));
   const providers=h('div.overview-providers');
   for(const [id,name]of [['claude','Claude'],['codex','Codex'],['antigravity','Antigravity']]){
    const p=usageData?.providers?.[id],percent=p?.windows?.[0]?.percent;
    providers.append(h('button',{type:'button',onclick:()=>{usageProvider=id;toggleFocus();}},h('span',name),h('strong',percent==null?'—':Math.round(percent)+'%'),h('span.overview-meter',h('i',{style:`width:${Math.max(0,Math.min(100,percent??0))}%`}))));
   }
   root.append(providers,h('p.overview-hint',tr('usagePreviewHint')));
  }else if(data?.available){
   const visibleMap=mapData();
   const metrics=mode==='map'
    ? [['total',visibleMap.total],['mapped',visibleMap.mapped],['cityCount',visibleMap.cities.length]]
    : [['reviewedCount',data.reviewed.length],['cvCount',data.reviewed.filter(r=>r.preparedAt).length],['pendingCityCount',visibleMap.cities.length]];
   const counts=h('div.overview-metrics',...metrics.map(([key,n])=>h('div',h('strong',String(n)),h('span',tr(key)))));
   if(!geo)root.append(counts);
   const heading=h('div.overview-list-head',h('h2',tr(mode==='map'?'cityOverview':'pendingCitiesOverview')),h('span',tr(mode==='map'?'tab.map':'tab.board')));
   const list=h('div.overview-list');
   for(const city of [...mapData().cities].sort((a,b)=>b.count-a.count).slice(0,4))list.append(h('button',{type:'button',onclick:()=>{selected=city.id;if(mode==='board')jobView='map';toggleFocus();}},h('strong',city.name),h('span',countText(city.count)),h('span','↗')));
   if(geo){root.classList.add('overview-has-map');root.append(h('div.overview-map-layout',h('div.overview-map-summary',counts,heading,list),previewMap()));}
   else root.append(heading,list);
  }else root.append(h('p',tr(loading?'loading':'unavailable')));
  if(mode==='usage'?usageError:error)root.append(h('p.error',tr('error')));
 }
 const svgEl=(tag,attrs={})=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};
 function project(lon,lat){return [28+(lon-5.7)*Math.cos(51*Math.PI/180)*33,15+(55.1-lat)*33];}
 function outline(){const polygons=geo.geometry.type==='MultiPolygon'?geo.geometry.coordinates:[geo.geometry.coordinates];return polygons.map(p=>p.map(r=>r.map(([lon,lat],i)=>{const [x,y]=project(lon,lat);return (i?'L':'M')+x.toFixed(2)+','+y.toFixed(2);}).join(' ')+' Z').join(' ')).join(' ');}
 function previewMap(){
  const svg=svgEl('svg',{viewBox:'24 6 212 285',role:'group','aria-label':tr(mode==='board'?'pendingMapTitle':'mapTitle')});
  svg.append(svgEl('path',{d:outline(),fill:'#203e48',stroke:'#577f88','stroke-width':'1.2','fill-rule':'evenodd'}));
  for(const city of [...mapData().cities].sort((a,b)=>b.count-a.count)){
   const [x,y]=project(city.lon,city.lat),r=Math.max(3,Math.sqrt(city.count)*3.2);
   const marker=svgEl('g',{class:'city-marker',role:'button',tabindex:'0','aria-label':city.name+' · '+countText(city.count),'data-city':city.id,transform:`translate(${x},${y})`});
   marker.append(svgEl('circle',{class:'marker-hit',r:Math.max(4,r),fill:'transparent','pointer-events':'all'}),svgEl('circle',{r:r.toFixed(2),fill:'#5bcaad','fill-opacity':'.6',stroke:'#a3f2d4','stroke-width':1}));
   if(city.count>=4){const text=svgEl('text',{'text-anchor':'middle',dy:4,fill:'#e9fff4','font-size':11,'pointer-events':'none'});text.textContent=city.count;marker.append(text);}
   const title=svgEl('title');title.textContent=city.name+' · '+countText(city.count);marker.append(title);
   const choose=()=>{selected=city.id;if(mode==='board')jobView='map';toggleFocus();};
   marker.addEventListener('click',choose);marker.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose();}});svg.append(marker);
  }
  return h('div.overview-map',svg,h('div.map-credits',h('a',{href:'https://www.naturalearthdata.com/',target:'_blank',rel:'noopener'},'Natural Earth'),' · ',h('a',{href:'https://www.geonames.org/',target:'_blank',rel:'noopener'},'GeoNames CC BY')));
 }
 function cityDetail(city,container){
  container.replaceChildren(h('h3',city.name),h('p.city-total',countText(city.count)),h('p',tr('companies').replace('{n}',city.companies)));
  if(city.uncertain)container.append(h('p.muted',tr('uncertain').replace('{n}',city.uncertain)));
  const tierList=h('div.city-tiers');for(const t of ORDER)if(city.tiers[t])tierList.append(h('span',tier(t)+' · '+city.tiers[t]));container.append(tierList);
  for(const a of city.applications)container.append(h('article.city-job',h('strong',a.company),h('span',a.title),h('small',tier(a.tier)+' · '+preparedLabel(a)),link(a)));
 }
 function mapControls(){
  const state=mapFilters[mode],update=(key,value)=>{state[key]=value;selected=null;interact();render();};
  const companies=[...new Set([...(rawMap()?.cities??[]).flatMap(c=>c.applications),...(rawMap()?.unmapped??[])].map(r=>r.company))].sort((a,b)=>a.localeCompare(b));
  const company=h('select',{'data-map-filter':'company','aria-label':tr('companyFilter'),onchange:e=>update('company',e.target.value)},h('option',{value:''},tr('allCompanies')),...companies.map(c=>h('option',{value:c,selected:c===state.company},c)));
  const type=h('select',{'data-map-filter':'type','aria-label':tr('jobTypeLabel'),onchange:e=>update('type',e.target.value)},...['all','phd','intern','full_time','other','unknown'].map(t=>h('option',{value:t,selected:t===state.type},tr('jobType.'+t))));
  const from=h('input',{type:'date',value:state.from,'data-map-filter':'from','aria-label':tr('packageDateFrom'),onchange:e=>update('from',e.target.value)});
  const to=h('input',{type:'date',value:state.to,'data-map-filter':'to','aria-label':tr('packageDateTo'),onchange:e=>update('to',e.target.value)});
  body.append(h('div.map-filters',h('label',tr('companyFilter'),company),h('label',tr('jobTypeLabel'),type),h('label',tr('packageDateFrom'),from),h('label',tr('packageDateTo'),to),h('button',{type:'button',onclick:()=>{mapFilters[mode]={company:'',type:'all',from:'',to:''};selected=null;render();}},tr('clear'))));
 }
 function map(){
  mapControls();
  let citySelect;body.append(stats());const svg=svgEl('svg',{viewBox:'0 0 270 300',role:'group','aria-label':tr(mode==='board'?'pendingMapTitle':'mapTitle')});
  svg.append(svgEl('path',{d:outline(),fill:'#203e48',stroke:'#577f88','stroke-width':'1.2','fill-rule':'evenodd'}));
  const detail=h('aside.city-detail',h('h3',tr(mapData().total?'chooseCity':'empty')),h('p.muted',tr(mapData().total?'mapHint':'mapEmptyHint')));
  for(const city of [...mapData().cities].sort((a,b)=>b.count-a.count)){
   const [x,y]=project(city.lon,city.lat),r=Math.sqrt(city.count)*3.2;
   const group=svgEl('g',{class:'city-marker',role:'button',tabindex:'0','aria-label':city.name+' · '+countText(city.count),'data-city':city.id,transform:`translate(${x},${y})`});
   group.append(svgEl('circle',{class:'marker-hit',r:r*1.06+2,fill:'transparent','pointer-events':'all'}));
   const circle=svgEl('circle',{r:r.toFixed(2),fill:'#5bcaad','fill-opacity':'.55',stroke:'#a3f2d4','stroke-width':1});
   const pulse=svgEl('animate',{attributeName:'r',values:`${r};${r*1.06};${r}`,dur:'3.5s',repeatCount:'indefinite'});if(!matchMedia('(prefers-reduced-motion: reduce)').matches)circle.append(pulse);group.append(circle);
   if(city.count>=4){const label=svgEl('text',{'text-anchor':'middle',dy:'3',fill:'#e9fff4','font-size':'8','pointer-events':'none'});label.textContent=city.count;group.append(label);}
   const tip=svgEl('title');tip.textContent=city.name+' · '+city.count;group.append(tip);
   const choose=()=>{selected=city.id;if(citySelect)citySelect.value=city.id;for(const g of svg.querySelectorAll('.city-marker'))g.classList.toggle('selected',g===group);cityDetail(city,detail);};
   group.addEventListener('click',choose);group.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose();}});
   svg.append(group);if(selected===city.id){group.classList.add('selected');cityDetail(city,detail);}
  }
  const mapPane=h('div.map-canvas',svg,h('div.map-credits',h('a',{href:'https://www.naturalearthdata.com/',target:'_blank',rel:'noopener'},'Natural Earth'), ' · ',h('a',{href:'https://www.geonames.org/',target:'_blank',rel:'noopener'},'GeoNames CC BY')));
  const cities=h('select',{'aria-label':tr('chooseCity'),onchange:e=>{const c=mapData().cities.find(c=>c.id===e.target.value);if(c){selected=c.id;for(const g of svg.querySelectorAll('.city-marker'))g.classList.toggle('selected',g.dataset.city===c.id);cityDetail(c,detail);}}},h('option',{value:''},tr('chooseCity')),...mapData().cities.map(c=>h('option',{value:c.id,selected:c.id===selected},c.name+' · '+c.count)));
  citySelect=cities;
  body.append(h('div.map-content',mapPane,h('div.city-sidebar',cities,detail)));
  if(mapData().unmapped.length){const list=h('details.unmapped',h('summary',tr('unmapped')+' · '+mapData().unmapped.length));for(const a of mapData().unmapped)list.append(h('p',a.company+' — '+a.location+' · '+tr('reason.'+a.reason)));body.append(list);}
  footer.textContent=tr(mode==='board'?'pendingMapNote':'mapNote')+(mapData().duplicates?' · '+tr('duplicates').replace('{n}',mapData().duplicates):'');
 }
 function render(){
  if(!floor)return;detailed=options.view.cam.z>=1.7;
  menuTitle.textContent=tr('title');panel.querySelectorAll('[data-key]').forEach(n=>n.textContent=tr(n.dataset.key));
  floor.setAttribute('aria-label',mode==='usage'?I.t('usage.title'):tr('screen'));
  options.view.floorDisplayActive=mode!=='idle';
  floor.hidden=mode==='idle';if(mode==='idle')return;
  floor.classList.toggle('terminal-focused',detailed);
  title.textContent=detailed?(mode==='usage'?I.t('usage.title'):tr(mode==='board'?'board':'map')):tr('center');toolbar.replaceChildren();
  if(detailed){
   for(const kind of ['board','map','usage'])toolbar.append(h('button',{type:'button','data-floor-link':'','aria-pressed':String(mode===kind),onclick:()=>setMode(kind)},kind==='usage'?I.t('usage.title'):tr(kind)));
   if(mode==='board')toolbar.append(h('button.job-view-toggle',{type:'button','aria-label':tr('switchJobView'),'aria-pressed':String(jobView==='map'),onclick:()=>{jobView=jobView==='table'?'map':'table';selected=null;render();}},tr(jobView==='map'?'tableView':'cityView')));
   powerTimer=h('span.floor-power-timer');toolbar.append(h('button.floor-keep-on',{type:'button','aria-label':tr('keepOn'),'aria-pressed':String(keepScreenOn),title:tr('keepOnHint'),onclick:()=>{keepScreenOn=!keepScreenOn;if(keepScreenOn&&options.view.floorPowerPending===false)options.onCancelPower();interact();render();}},tr('keepOn')),powerTimer);
   toolbar.append(h('button.floor-focus',{type:'button',title:tr('unfocus'),'aria-pressed':'true',onclick:()=>toggleFocus()},'⤢'),h('button',{type:'button',title:tr('refresh'),disabled:mode==='usage'?usageLoading:loading,onclick:()=>{if(mode==='usage')void loadUsage(true);else void load(true,true);}},'↻'),h('button',{type:'button',title:tr('standby'),onclick:()=>setMode('idle')},'✕'));
  }else{
  const tabs=h('div.terminal-tabs',{'aria-label':tr('views')});
  for(const kind of ['board','map','usage'])tabs.append(h('button',{type:'button','data-floor-link':'','aria-pressed':String(mode===kind),onclick:()=>setMode(kind)},tr('tab.'+kind)));
  const controls=h('div.terminal-controls');powerTimer=h('span.floor-power-timer');
  controls.append(h('button.floor-keep-on',{type:'button','aria-label':tr('keepOn'),'aria-pressed':String(keepScreenOn),title:tr('keepOnHint'),onclick:()=>{keepScreenOn=!keepScreenOn;if(keepScreenOn&&options.view.floorPowerPending===false)options.onCancelPower();interact();render();}},'●'),powerTimer);
  controls.append(h('button.floor-focus',{type:'button',title:tr(detailed?'unfocus':'focus'),'aria-label':tr(detailed?'unfocus':'expand'),'aria-pressed':String(detailed),onclick:()=>toggleFocus()},detailed?'⤡':'⤢ '+tr('expand')),
   h('button',{type:'button',title:tr('refresh'),'aria-label':tr('refresh'),disabled:mode==='usage'?usageLoading:loading,onclick:()=>{if(mode==='usage')void loadUsage(true);else void load(true,true);}},'↻'),
   h('button',{type:'button',title:tr('standby'),'aria-label':tr('standby'),onclick:()=>setMode('idle')},'✕'));
  toolbar.append(tabs,controls);
  }
  updatePower();
  body.className='floor-body'+(detailed?' terminal-body':' terminal-preview');body.replaceChildren();footer.textContent='';tableBody=null;
  if(!detailed){preview();return;}
  if(mode==='usage'){
   if(usageError)body.append(h('p.error',{role:'alert'},I.t('usage.error')));
   if(!usageData){body.append(h('p',I.t(usageLoading?'usage.loading':'usage.noTokens')));return;}
   window.OfficeUsageScreen.render({data:usageData,provider:usageProvider,days:usageDays,body,footer,onProvider:p=>{usageProvider=p;render();},onDays:d=>{usageDays=d;render();}});return;
  }
  if(loading)body.append(h('p',{role:'status'},tr(classifying?'classifying':'loading')));
  if(data?.classification?.failed)body.append(h('p',{role:'alert'},tr('classificationFailed')));
  else if(data?.classification?.pending)body.append(h('p',tr('classificationHint')));
  if(error)body.append(h('p.error',{role:'alert'},tr('error')));
  if(!data){body.append(h('p',tr(loading?'loading':'unavailable')));return;}
  if(!data.available){body.append(h('p',tr('unavailable')));return;}
  if(mode==='board'&&jobView==='table')table();else if(geo)map();
 }
 function refreshScreen(){
  if(mode==='idle')return;
  interact();if(mode==='usage')void loadUsage(true);else void load(true);
 }
 function foreground(){
  const v=options.view,g=front.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,front.width,front.height);g.setTransform(2,0,0,2,-(F.x+3)*2,-(F.y+3)*2);
  g.imageSmoothingEnabled=false;const old=v.b;v.b=g;
  try{const ents=[{y:v.cat.y+9,draw:()=>v.drawCat()}];for(const [id,w]of Object.entries(v.walks))if(w.cur)ents.push({y:v.walkPos(w.cur).y,draw:()=>{v.drawWalker(id,w.cur);v.kitchen?.drawActor(id);if(v.newsDelivery?.id===id)v.drawNewsDelivery();}});ents.sort((a,b)=>a.y-b.y).forEach(e=>e.draw());}finally{v.b=old;}
  const ctx=v.ctx,[x,y]=v.scr(F.x+3,F.y+3),k=2/v.scale();g.setTransform(k,0,0,k,-x*k,-y*k);v.ctx=g;try{v.drawBubbles();}finally{v.ctx=ctx;}
 }
 function mount(config){
  options=config;menuTitle=h('strong');
  panel=h('section.popup.application-menu',{role:'dialog',hidden:true},h('header',menuTitle,h('button',{type:'button','aria-label':tr('close'),onclick:close},'✕')),
   ...['chat','board','map'].map(key=>h('button.application-choice',{type:'button','data-key':key,'data-floor-link':key==='chat'?null:'',onclick:()=>{close();if(key==='chat')options.onChat();else setMode(key);}},tr(key))));
  document.body.append(panel);floating=window.OfficeDeskPopup.attach(panel,{view:options.view,agentId:'emrecan-cv#project'});
  document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target))close();});document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  title=h('strong');toolbar=h('nav');body=h('div.floor-body');footer=h('footer');front=h('canvas.floor-foreground',{'aria-hidden':true,width:(F.w-6)*2,height:(F.h-6)*2});
  catLabel=h('span.floor-cat-label',I.t('cat.label'));
  const content=h('div.floor-content',h('header',title,toolbar),body,footer);
  floor=h('section.floor-apps',{hidden:true,'aria-label':tr('screen')},content,front,catLabel);options.view.canvas.parentElement.append(floor);
  floor.addEventListener('pointerdown',e=>{const hit=options.view.pick(e.clientX,e.clientY);if(hit?.part==='bubble'){e.preventDefault();e.stopPropagation();options.view.handleClick(e);return;}if(hit?.id==='cat'){e.preventDefault();e.stopPropagation();options.view.poke();}},true);
  for(const [key,on]of [['on',true],['off',false]]){const button=h('button.floor-power-pad',{type:'button','data-power':key,'aria-label':tr(on?'powerOn':'powerOff'),onclick:()=>{if((mode!=='idle')!==on)options.onPower(on);}},on?'ON':'OFF');options.view.canvas.parentElement.append(button);powerButtons.push({key,on,button});}
  for(const event of ['pointerdown','keydown','input','wheel'])floor.addEventListener(event,interact,{capture:true,passive:true});
  const loop=()=>{if(mode!=='idle'&&(options.view.cam.z>=1.7)!==detailed){if(options.view.cam.z<1.7)previousCamera=null;render();}updatePower();if(options.view.view){const v=options.view,scale=v.scale()/v.dpr;for(const {key,on,button}of powerButtons){const pad=window.OfficeLayout.FLOOR_POWER_PADS[key],[x,y]=v.scr(pad.x,pad.y);Object.assign(button.style,{left:x/v.dpr+'px',top:y/v.dpr+'px',width:pad.w*scale+'px',height:pad.h*scale+'px',fontSize:Math.max(8,4.5*scale)+'px'});button.disabled=typeof v.floorPowerPending==='boolean';button.setAttribute('aria-pressed',String((mode!=='idle')===on));button.setAttribute('aria-label',tr(on?'powerOn':'powerOff'));button.classList.toggle('pressed',!!v.floorPowerJump&&v.floorPowerJump.on===on&&v.t-v.floorPowerJump.at>=1&&v.t-v.floorPowerJump.at<1.25);}}if(!floor.hidden&&options.view.view){const v=options.view,[x,y]=v.scr(F.x+3,F.y+3),scale=v.scale()/v.dpr;Object.assign(floor.style,{left:x/v.dpr+'px',top:y/v.dpr+'px',width:(F.w-6)*scale+'px',height:(F.h-6)*scale+'px'});
   // The overview follows the room scale; zooming in restores the original full monitor UI.
   const width=(F.w-6)*scale,height=(F.h-6)*scale,uiScale=Math.min(1,width/(detailed?950:760));
   Object.assign(content.style,{width:width/uiScale+'px',height:height/uiScale+'px',transform:`scale(${uiScale})`});
   floor.classList.toggle('distant',uiScale<.75);foreground();floor.classList.toggle('signal-arrived',(v.floorPulses??[]).some(p=>v.t-p.at>=window.OfficeLayout.FLOOR_SIGNAL.travel&&v.t-p.at<window.OfficeLayout.FLOOR_SIGNAL.total));const c=v.cat;catLabel.hidden=!(c.x+9>F.x+3&&c.x+9<F.x+F.w-3&&c.y+16>F.y+3&&c.y+16<F.y+F.h-3);catLabel.textContent=I.t('cat.label');Object.assign(catLabel.style,{left:(c.x+9-F.x-3)*scale+'px',top:(c.y+16-F.y-3)*scale+'px',fontSize:Math.round(Math.max(5.8*v.u,9*v.dpr))/v.dpr+'px'});}requestAnimationFrame(loop);};requestAnimationFrame(loop);
  I.onChange(render);setInterval(()=>{if(!document.hidden){if(mode==='usage')void loadUsage();else if(mode!=='idle')void load();}},60000);render();
 }
 function snapshot(){return {mapFilters,jobView,jobType,dateFrom,dateTo,mode,keepScreenOn,idleUntil,lastMode,previousCamera,usageProvider,usageDays,bodyScroll:body.scrollTop,selected,sort,filters,exactFilters,menu:!panel.hidden,position:floating.snapshot(),scroll:body.querySelector('.table-scroll')?.scrollTop??0,scrollLeft:body.querySelector('.table-scroll')?.scrollLeft??0};}
 async function restore(s){if(!s)return;for(const scope of ['board','map']){const f=s.mapFilters?.[scope];if(f)mapFilters[scope]={company:typeof f.company==='string'?f.company:'',type:['all','phd','intern','full_time','other','unknown'].includes(f.type)?f.type:'all',from:/^\d{4}-\d{2}-\d{2}$/.test(f.from)?f.from:'',to:/^\d{4}-\d{2}-\d{2}$/.test(f.to)?f.to:''};}jobView=s.jobView==='map'?'map':'table';jobType=['all','phd','intern','full_time','other'].includes(s.jobType)?s.jobType:'all';dateFrom=/^\d{4}-\d{2}-\d{2}$/.test(s.dateFrom)?s.dateFrom:'';dateTo=/^\d{4}-\d{2}-\d{2}$/.test(s.dateTo)?s.dateTo:'';previousCamera=s.previousCamera&&['x','y','z'].every(k=>Number.isFinite(s.previousCamera[k]))&&s.previousCamera.z>0?{x:s.previousCamera.x,y:s.previousCamera.y,z:s.previousCamera.z}:null;sort=s.sort&&columns.includes(s.sort.key)?s.sort:sort;filters=s.filters??{};exactFilters=s.exactFilters??{};selected=s.selected??null;usageProvider=['claude','codex','antigravity'].includes(s.usageProvider)?s.usageProvider:'claude';usageDays=[7,30,365].includes(s.usageDays)?s.usageDays:30;keepScreenOn=s.keepScreenOn===true;idleUntil=Number.isFinite(s.idleUntil)?s.idleUntil:0;lastMode=['board','map','usage'].includes(s.lastMode)?s.lastMode:'usage';mode=['board','map','usage'].includes(s.mode)&&(keepScreenOn||Number.isFinite(s.idleUntil))?s.mode:'idle';if(mode==='idle'&&previousCamera){options.view.cam={...previousCamera};options.view.clampCam();previousCamera=null;}if(s.menu){open();floating.restore(s.position);}render();if(mode!=='idle'){if(mode==='usage')await loadUsage();else await load();body.scrollTop=s.bodyScroll??0;const scroll=body.querySelector('.table-scroll');if(scroll){scroll.scrollTop=s.scroll??0;scroll.scrollLeft=s.scrollLeft??0;}}}
 window.OfficeApplicationBoard={mount,open,close,setMode,applyPower,showUsage,refreshScreen,refreshUsage:()=>mode==='usage'?loadUsage(true):Promise.resolve(),snapshot,restore,visibleRows};
})();

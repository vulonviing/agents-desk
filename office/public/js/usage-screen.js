// Aggregate-only usage view, hosted by the existing floor display.
(function(){
 'use strict';
 const I=window.OfficeI18n,{h}=window.OfficeApi,ids=['claude','codex','antigravity'];
 const t=k=>I.t('usage.'+k),names={claude:'Claude',codex:'Codex',antigravity:'Antigravity'},n=v=>v===null||v===undefined?'—':new Intl.NumberFormat(I.lang==='tr'?'tr-TR':'en-US').format(v);
 const dt=v=>v?new Intl.DateTimeFormat(I.lang==='tr'?'tr-TR':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(v):'—';
 const date=s=>new Intl.DateTimeFormat(I.lang==='tr'?'tr-TR':'en-GB',{dateStyle:'medium'}).format(new Date(s+'T12:00:00'));
 function windowName(w){return (w.group?t(w.group)+' · ':'')+t(w.kind);}
 function quotaHistory(p){
  const table=h('table.jobs-table.usage-table',h('thead',h('tr',...['checked','window','percent'].map(k=>h('th',t(k))))));const rows=h('tbody');
  for(const r of p.history??[])for(const w of r.windows)rows.append(h('tr',h('td',dt(r.capturedAt)),h('td',windowName(w)),h('td',n(w.percent)+'%')));
  if(!rows.childElementCount)rows.append(h('tr',h('td',{colspan:3},t('noHistory'))));table.append(rows);return h('details.usage-history',h('summary',t('quotaHistory')),h('p.muted',t('quotaNote')),table);
 }
 function render({data,provider,days,body,footer,onProvider,onDays}){
  const p=data?.providers?.[provider]??{windows:[],history:[]},a=p.activity;
  const tabs=h('div.usage-tabs',{role:'group','aria-label':t('providers')},...ids.map(id=>h('button',{type:'button','data-floor-link':'','aria-pressed':String(id===provider),onclick:()=>onProvider(id)},names[id])));
  const root=h('div.usage-screen',tabs,h('p.usage-source',t('source')));body.append(root);
  const quotas=h('div.usage-quotas');for(const w of p.windows)quotas.append(h('div',h('span',windowName(w)),h('strong',n(w.percent)+'%'),h('small',t('reset')+' '+dt(w.resetsAt))));root.append(quotas,h('p.muted',t('quotaChecked')+' '+dt(p.capturedAt)));
  if(!a){root.append(h('p.usage-empty',t(provider==='antigravity'?'agyNoTokens':'noTokens')),quotaHistory(p));footer.textContent=t('localOnly');return;}
  const stale=Date.now()-a.capturedAt> (provider==='claude'?15:30)*60000 || (a.computedThrough&&new Date(a.computedThrough+'T23:59:59').getTime()<Date.now()-86400000);
  root.append(h('p.usage-freshness',{class:'usage-freshness'+(stale?' is-stale':'')},t(a.kind==='local'?'approximate':'verified')+' · '+t('checked')+' '+dt(a.capturedAt)+(a.computedThrough?' · '+t('through')+' '+date(a.computedThrough):'')+(stale?' · '+t('stale'):'')));
  const totals=h('div.usage-totals');for(const [key,v]of Object.entries(a.summary??{}))totals.append(h('div',h('small',t(key==='tokens'&&provider==='claude'?'inputOutput':key)),h('strong',n(v))));root.append(totals);
  const selector=h('select',{'aria-label':t('period'),onchange:e=>onDays(Number(e.target.value))},...[7,30,365].map(d=>h('option',{value:d,selected:d===days},t('days').replace('{n}',d))));root.append(h('div.usage-period',h('strong',t('daily')),selector));
  const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-days+1);
  const rows=(a.daily??[]).filter(r=>new Date(r.date+'T12:00:00')>=start).sort((a,b)=>a.date.localeCompare(b.date));
  const chart=h('div.usage-chart',{'aria-label':t('daily')});const max=Math.max(1,...rows.map(r=>r.tokens??0));
  for(const r of rows)chart.append(h('button.usage-bar',{type:'button',title:date(r.date)+' · '+n(r.tokens)+' '+t('tokens'),'aria-label':date(r.date)+' · '+n(r.tokens)+' '+t('tokens'),style:`--bar-height:${Math.max(2,(r.tokens??0)/max*100)}%`,onclick:()=>{const row=root.querySelector(`[data-day="${r.date}"]`);root.querySelectorAll('.usage-day.selected').forEach(el=>el.classList.remove('selected'));row?.classList.add('selected');row?.scrollIntoView({block:'nearest'});}},h('span'),h('small',r.date.slice(8))));
  root.append(h('p.muted',t('dailyNote')),chart);
  const keys=provider==='claude'?['date','tokens','messages','sessions','tools']:['date','tokens'];
  const table=h('table.jobs-table.usage-table',h('thead',h('tr',...keys.map(k=>h('th',t(k))))));const tbody=h('tbody');
  for(const r of [...rows].reverse())tbody.append(h('tr.usage-day',{'data-day':r.date},...keys.map(k=>h('td',k==='date'?date(r.date):n(r[k])))));
  if(!rows.length)tbody.append(h('tr',h('td',{colspan:keys.length},t('noHistory'))));table.append(tbody);root.append(table);
  if(a.models?.length){const models=h('details.usage-models',h('summary',t('models')));const mt=h('table.jobs-table.usage-table',h('thead',h('tr',...['model','input','output'].map(k=>h('th',t(k))))));mt.append(h('tbody',...a.models.map(m=>h('tr',h('td',m.name),h('td',n(m.input)),h('td',n(m.output))))));models.append(mt);root.append(models);}
  root.append(quotaHistory(p));footer.textContent=t('localOnly');
 }
 window.OfficeUsageScreen={render};
})();

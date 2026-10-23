// Local map filtering uses only already-served public posting metadata.
(function(){
 'use strict';
 const norm=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en').trim();
 function filterMap(source,filters={}){
  if(!source)return {total:0,mapped:0,cities:[],unmapped:[],duplicates:0};
  const match=row=>{
   if(filters.company&&norm(row.company)!==norm(filters.company))return false;
   if(filters.type&&filters.type!=='all'&&!(row.jobTypes??['unknown']).includes(filters.type))return false;
   // Folder/package dates are deliberately distinct from filesystem and submission dates.
   const date=/^\d{4}-\d{2}-\d{2}$/.test(row.date??'')?row.date:'';
   if(filters.from&&(!date||date<filters.from))return false;
   if(filters.to&&(!date||date>filters.to))return false;
   return true;
  };
  const cities=source.cities.flatMap(city=>{
   const applications=city.applications.filter(match);if(!applications.length)return [];
   const tiers={};for(const row of applications)tiers[row.tier]=(tiers[row.tier]??0)+1;
   return [{...city,applications,count:applications.length,companies:new Set(applications.map(r=>r.company)).size,tiers,uncertain:applications.filter(r=>/unverified|assumed|not in the posting|not stated|metadata/i.test(r.location??'')).length}];
  }).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  const unmapped=source.unmapped.filter(match),mapped=cities.reduce((n,c)=>n+c.count,0);
  return {...source,cities,unmapped,mapped,total:mapped+unmapped.length,duplicates:0};
 }
 window.OfficeApplicationMap={filterMap};
})();

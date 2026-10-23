// Local, replaceable metadata resolvers. Never read CV contents; only public postings may enter authorized CLI classification.
import { lstat, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';

export const JOB_TYPES = ['phd', 'intern', 'full_time', 'other', 'unknown'];
const phd = /\b(?:ph\.?d\.?|doctoral|doctorate|doktorand\w*|promotion)\b/i;
const intern = /\b(?:intern(?:ship)?|praktik\w*|staj)\b/i;
const other = /\b(?:working student|werkstudent\w*|master.?s? thesis|bachelor.?s? thesis|part[ -]time|teilzeit|freelance)\b/i;

export function classifyJob({title='', employment='', contract=''}={}) {
 // Requirements and candidate history are deliberately excluded from classification.
 for (const [source,text] of [['title',title],['employment',employment],['contract',contract]]) {
  if (!text) continue;
  const types=[];
  if(phd.test(text))types.push('phd');
  if(intern.test(text))types.push('intern');
  if(types.length)return {types,source};
  if(other.test(text))return {types:['other'],source};
  if(/\b(?:full[ -]time|vollzeit|permanent(?: consulting)? (?:role|position|contract))\b/i.test(text))return {types:['full_time'],source};
 }
 return {types:['unknown'],source:null};
}

export async function cvPreparation(folder, files, root) {
 // Prefer the editable CV source; PDF creation may happen later during compilation.
 for(const extension of ['json','tex','pdf']) {
  const dates=[];
  for(const name of files.filter(n=>/^Emrecan CV - .+\.(json|tex|pdf)$/.test(n)&&n.endsWith('.'+extension))) {
   try {
    const file=join(folder,name),info=await lstat(file);
    if(!info.isFile()||info.isSymbolicLink()||!(info.birthtimeMs>0))continue;
    if(!(await realpath(file)).startsWith(root+sep))continue;
    dates.push(info.birthtimeMs);
   }catch{}
  }
  if(dates.length)return {at:new Date(Math.min(...dates)).toISOString(),source:'cv_'+extension+'_birthtime'};
 }
 return {at:null,source:null};
}

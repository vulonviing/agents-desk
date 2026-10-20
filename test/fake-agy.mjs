#!/usr/bin/env node
// Deterministic subscription CLI fixture; never contacts a provider.
const args = process.argv.slice(2);
if (args[0] === 'models') { console.log('gemini-3.7-flash-low\tOld Flash\ngemini-3.8-flash-low\tCurrent Flash\ngemini-3.7-flash-medium\tOld Flash medium\ngemini-3.8-flash-medium\tCurrent Flash medium\ngemini-3.9-flash-high\tNewer high\ngemini-4-argon-medium\tArgon'); process.exit(0); }
if (args.includes('/usage')) { console.log(JSON.stringify({command:{data:{groups:[{name:'Gemini Models',buckets:[{id:'gemini-5h',remaining_fraction:0.99,reset_time:'later'}]}]}}})); process.exit(0); }
const mode = process.env.DESK_FAKE_AGY;
if (mode === 'fail') process.exit(1);
console.log(JSON.stringify({ event: 'init', init: { tools: [], model: 'gemini-3.8-flash-medium' } }));
if (mode === 'tool') console.log(JSON.stringify({ event: 'step_update', step_update: { step_type: 'tool', tool_name: 'view_file' } }));
if (mode === 'long-stream') for (let i = 0; i < 400; i++) console.log(JSON.stringify({ event: 'progress', text: 'x'.repeat(1000) }));
if (args.some(a=>a.includes('maxItems')&&a.includes('queries'))) { console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',structured_output:{queries:[]},usage:{input_tokens:100,output_tokens:80}}}));process.exit(0); }
const lines = [{ kind: 'coffee', text: 'Kahvenin kokusu koridora kadar geliyor.' }, { kind: 'visit', text: '{other}, kısa cümle mi somut örnek mi?', reply: 'Somut örnek; cümle de kısa olsun.', followUp: 'Örneği başa mı alalım?', answer: 'Önce fikir, sonra örnek olsun.' }, { kind: 'desk', text: 'Bir cümlede tek fikir daha iyi duruyor.' }];
console.log(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', structured_output: { lines }, usage: { input_tokens: 100, output_tokens: 80 } } }));

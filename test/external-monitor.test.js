import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {startExternalMonitor} from '../server/external-monitor.js';
function fixture(t) {
  mkdirSync('.qa',{recursive:true});const root=mkdtempSync(resolve('.qa/monitor-launch-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'data'));mkdirSync(join(root,'app/dist/Agents Desk Monitor.app'),{recursive:true});
  const enable=value=>writeFileSync(join(root,'data/monitor-settings.json'),JSON.stringify({enabled:value}));
  const calls=[];const launch=(...args)=>{calls.push(args);return {on(){},unref(){calls.push('unref');}};};
  return {root,enable,calls,launch};
}
test('ordinary servers and non-Mac systems never launch a monitor window',t=>{
 const f=fixture(t);assert.equal(startExternalMonitor({...f,platform:'darwin',port:4317}),false);
 f.enable(false);assert.equal(startExternalMonitor({...f,platform:'darwin',port:4317}),false);
 f.enable(true);assert.equal(startExternalMonitor({...f,platform:'linux',port:4317}),false);
 assert.deepEqual(f.calls,[]);assert.equal(existsSync(join(f.root,'data/monitor-runtime.json')),false);
});
test('enabled companion starts in the background with literal app paths and the actual server port',t=>{
 const f=fixture(t);f.enable(true);assert.equal(startExternalMonitor({...f,platform:'darwin',port:4321}),true);
 assert.deepEqual(JSON.parse(readFileSync(join(f.root,'data/monitor-runtime.json'),'utf8')),{port:4321});
 const [command,args,options]=f.calls[0];assert.equal(command,'/usr/bin/open');assert.deepEqual(args,['-g',join(f.root,'app/dist/Agents Desk Monitor.app'),'--args','--repo',f.root,'--port','4321']);
 assert.equal(options.detached,true);assert.equal(options.stdio,'ignore');assert.equal(f.calls[1],'unref');
});
test('invalid ports, corrupt settings, and missing app bundles fail closed',t=>{
 const f=fixture(t);f.enable(true);for(const port of [-1,NaN,0,80,65536,'4317'])assert.equal(startExternalMonitor({...f,platform:'darwin',port}),false);
 writeFileSync(join(f.root,'data/monitor-settings.json'),'{bad');assert.equal(startExternalMonitor({...f,platform:'darwin',port:4317}),false);
 f.enable(true);rmSync(join(f.root,'app'),{recursive:true});assert.equal(startExternalMonitor({...f,platform:'darwin',port:4317}),false);
 assert.deepEqual(f.calls,[]);
});
test('an already running companion receives the server port without reopening laptop windows',t=>{
 const f=fixture(t);f.enable(true);const calls=[],events={};
 const launch=(command,args,options)=>{calls.push({command,args,options});return {on(name,callback){if(calls.length===1)events[name]=callback;},unref(){}};};
 assert.equal(startExternalMonitor({root:f.root,platform:'darwin',port:4325,launch}),true);
 events.exit(0);assert.equal(calls.length,2);assert.equal(calls[1].command,join(f.root,'app/dist/Agents Desk Monitor.app/Contents/MacOS/AgentsDeskMonitor'));
 assert.deepEqual(calls[1].args,['--notify-port','4325']);assert.equal(calls[1].options.detached,true);
});

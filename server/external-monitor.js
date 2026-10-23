// The companion is opt-in, local, and starts only alongside a real Desk server.
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT} from './config.js';
export function startExternalMonitor({port,root=ROOT,platform=process.platform,launch=spawn}={}) {
  if(platform!=='darwin'||!Number.isInteger(port)||port<1024||port>65535)return false;
  const settings=join(root,'data/monitor-settings.json'),app=join(root,'app/dist/Agents Desk Monitor.app');
  try {
    if(!existsSync(app)||!existsSync(settings)||JSON.parse(readFileSync(settings,'utf8')).enabled!==true)return false;
    writeFileSync(join(root,'data/monitor-runtime.json'),JSON.stringify({port}),{mode:0o600});
    const child=launch('/usr/bin/open',['-g',app,'--args','--repo',root,'--port',String(port)],{cwd:root,stdio:'ignore',detached:true});
    child.on('error',()=>{});child.on('exit',code=>{if(code!==0)return;try{const notice=launch(join(app,'Contents/MacOS/AgentsDeskMonitor'),['--notify-port',String(port)],{cwd:root,stdio:'ignore',detached:true});notice.on('error',()=>{});notice.unref();}catch{}});child.unref();return true;
  }catch{return false;}
}

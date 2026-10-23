import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {startExternalMonitor} from '../../server/external-monitor.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
if(process.platform!=='darwin')throw Error('The external-monitor companion requires macOS.');
if(!existsSync(join(root,'app/dist/Agents Desk Monitor.app')))throw Error('Run npm run monitor:build first.');
const config=JSON.parse(readFileSync(join(root,'desk.config.json'),'utf8'));
const port=Number(process.argv[2]??config.port??4317);
const response=await fetch(`http://127.0.0.1:${port}/api/office`,{signal:AbortSignal.timeout(2500)});
const office=await response.json();if(!response.ok||!Array.isArray(office.agents))throw Error('A running Agents Desk server is required.');
mkdirSync(join(root,'data'),{recursive:true});
let settings={};try{settings=JSON.parse(readFileSync(join(root,'data/monitor-settings.json'),'utf8'));}catch{}
writeFileSync(join(root,'data/monitor-settings.json'),JSON.stringify({...settings,enabled:true}),{mode:0o600});
if(!startExternalMonitor({port,root}))throw Error('Could not launch the monitor companion.');
console.log('External-monitor companion enabled. The laptop display stays available.');

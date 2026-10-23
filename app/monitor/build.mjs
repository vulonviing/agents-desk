import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
if(process.platform!=='darwin')throw Error('The external-monitor companion requires macOS.');
const app=join(root,'app/dist/Agents Desk Monitor.app'),contents=join(app,'Contents');
mkdirSync(join(contents,'MacOS'),{recursive:true});mkdirSync(join(root,'app/dist/ModuleCache'),{recursive:true});
writeFileSync(join(contents,'Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>AgentsDeskMonitor</string><key>CFBundleIdentifier</key><string>local.agents-desk.monitor</string><key>CFBundleName</key><string>Agents Desk Monitor</string><key>CFBundleVersion</key><string>1</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>`);
const translations={tr:{},en:{}};
for(const match of readFileSync(join(root,'office/public/js/i18n.js'),'utf8').matchAll(/"monitor\.(\w+)":\s*("(?:[^"\\]|\\.)*")/g)){
 const lang=Object.hasOwn(translations.tr,match[1])?'en':'tr';translations[lang][match[1]]=JSON.parse(match[2]);
}
mkdirSync(join(contents,'Resources'),{recursive:true});writeFileSync(join(contents,'Resources/monitor-strings.json'),JSON.stringify(translations));
for(const [command,args] of [['/usr/bin/swiftc',['-O','-target',`${process.arch==='arm64'?'arm64':'x86_64'}-apple-macosx14.0`,'-module-cache-path',join(root,'app/dist/ModuleCache'),'-framework','Cocoa','-framework','WebKit',join(root,'app/monitor/Monitor.swift'),'-o',join(contents,'MacOS/AgentsDeskMonitor')]],['/usr/bin/codesign',['--force','--sign','-',app]]]){
 const result=spawnSync(command,args,{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
}
console.log(`Built ${app}`);

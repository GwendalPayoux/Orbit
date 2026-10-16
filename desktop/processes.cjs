const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
function executableOf(a, platform = process.platform) {
  if (a.processExecutable) return a.processExecutable;
  if (platform === 'win32') return a.executable || (/\.exe$/i.test(a.target) ? a.target : '');
  if (platform === 'darwin') return a.executable || '';
  const text = a.executable || (/\.appimage$/i.test(a.target) ? a.target : '');
  const tokens = text.match(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^']*'|\S+/g) || [];
  if (tokens[0] === 'env' || tokens[0] === '/usr/bin/env') { tokens.shift(); while (tokens[0]?.includes('=')) tokens.shift(); }
  return (tokens[0] || '').replace(/^['"]|['"]$/g,'');
}
function key(value, platform = process.platform) { const result = String(value || '').replace(/\\/g,'/'); return platform === 'win32' ? result.toLowerCase() : result; }
function matches(a, p, platform = process.platform) {
  if(a.alternateTargets?.some(target=>matches({...target,alternateTargets:undefined},p,platform)))return true;
  if(a.trackingUnsupported)return false;
  const executable = executableOf(a,platform); if (!executable) return false;
  if (path.isAbsolute(executable) || /^[a-z]:[\\/]/i.test(executable)) return key(executable,platform) === key(p.executable,platform);
  return executable === p.name;
}
async function listProcesses() {
  if (process.platform === 'win32') {
    const script = '$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new(); $observer = $PID; @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ProcessId -ne $observer } | Select-Object @{n="pid";e={$_.ProcessId}}, @{n="executable";e={$_.ExecutablePath}}, @{n="name";e={$_.Name}}) | ConvertTo-Json -Compress';
    const {stdout} = await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:20000,maxBuffer:8*1024*1024});
    const data = JSON.parse(stdout.trim() || '[]'); return Array.isArray(data) ? data : [data];
  }
  if (process.platform === 'darwin') {
    const {stdout} = await run('/bin/ps',['-ww','-axo','pid=,comm='],{timeout:10000,maxBuffer:8*1024*1024});
    return stdout.split('\n').flatMap(line => { const m=line.trim().match(/^(\d+)\s+(.+)$/);return m?[{pid:Number(m[1]),executable:m[2],name:path.basename(m[2])}]:[]; });
  }
  const records = [];
  for (const pid of (await fs.readdir('/proc')).filter(s=>/^\d+$/.test(s))) {
    try {const executable = (await fs.readlink(`/proc/${pid}/exe`)).replace(/ \(deleted\)$/,'');records.push({pid:Number(pid),executable,name:path.basename(executable)});} catch { /* Process ended or belongs to another user. */ }
  }
  return records;
}
class UsageTracker {
  constructor(platform = process.platform) {this.platform=platform;this.sessions=new Map();this.pending=new Map();this.paused=new Set();}
  expect(id, now=Date.now()) {this.pending.set(id,now+60000);}
  reconcile(apps, processes, now=Date.now()) {
    const live=new Set();let changed=false;
    for (const a of apps) {
      if (a.hidden && !this.sessions.has(a.id) && !this.pending.has(a.id)) continue;
      const executable=executableOf(a,this.platform); if (!executable) continue;
      const running=processes.some(p=>matches(a,p,this.platform));
      // Access-denied process records are ambiguous; do not infer termination.
      const basename=key(executable,this.platform).split('/').pop();
      const ambiguous=this.platform==='win32' && processes.some(p=>!p.executable && key(p.name,this.platform)===basename);
      const session=this.sessions.get(a.id);
      if (running) {
        this.paused.delete(a.id);
        live.add(a.id);this.pending.delete(a.id);
        if (session) {a.seconds=(a.seconds||0)+Math.min(10000,Math.max(0,now-session.last))/1000;session.last=now;}
        else {this.sessions.set(a.id,{last:now});a.lastUsed=now;}
        changed=true;
      } else if (session && ambiguous) {session.last=now;live.add(a.id);this.paused.add(a.id);}
      else if (session) {this.sessions.delete(a.id);this.paused.delete(a.id);changed=true;}
      if (this.pending.get(a.id)<now) this.pending.delete(a.id);
    }
    return {changed,running:[...live]};
  }
  checkpoint(apps, now=Date.now()) {
    for (const a of apps) {const s=this.sessions.get(a.id);if(s){if(!this.paused.has(a.id))a.seconds=(a.seconds||0)+Math.min(10000,Math.max(0,now-s.last))/1000;s.last=now;}}
  }
}
module.exports={listProcesses,executableOf,matches,UsageTracker};

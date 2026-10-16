const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
async function volumeRoots() {
  if(process.platform==='win32') {
    const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command','@([IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady -and $_.DriveType -in "Fixed","Removable","Network" } | ForEach-Object { $_.RootDirectory.FullName }) | ConvertTo-Json -Compress'],{windowsHide:true,timeout:20000});
    const data=JSON.parse(stdout.trim()||'[]');return Array.isArray(data)?data:[data];
  }
  if(process.platform==='darwin') return ['/',...(await fs.readdir('/Volumes',{withFileTypes:true}).catch(()=>[])).filter(e=>e.isDirectory()).map(e=>path.join('/Volumes',e.name))];
  const mounts=await fs.readFile('/proc/self/mountinfo','utf8').catch(()=>'');
  return [...new Set(['/',...mounts.split('\n').flatMap(line=>{const fields=line.split(' ');const point=fields[4]?.replace(/\\([0-7]{3})/g,(_,s)=>String.fromCharCode(parseInt(s,8)));return point && /^(\/mnt\/|\/media\/|\/run\/media\/)/.test(point)?[point]:[];})])];
}
const skipped=new Set(['windows','$recycle.bin','system volume information','node_modules','.git','.pnpm-store','.cache','cache','caches','temp','tmp','lost+found']);
async function scanVolumes(roots,{platform=process.platform,signal,onProgress=()=>{},exclude=[]}={}) {
  const stack=[...roots],seen=new Set(),candidates=[];let folders=0,unreadable=0;
  const canonical=p=>platform==='win32'?p.toLowerCase():p;
  const excluded=exclude.map(p=>canonical(path.resolve(p)));
  while(stack.length) {
    if(signal?.aborted) throw Error('Exploration annulée');
    const folder=stack.pop();let real;
    try {real=canonical(await fs.realpath(folder));}catch{unreadable++;continue;}
    if(seen.has(real)||excluded.some(p=>real===p||real.startsWith(p+path.sep)))continue;
    seen.add(real);folders++;
    if(folders%100===1)onProgress({folders,found:candidates.length,unreadable,folder});
    let entries;
    try {entries=await fs.readdir(folder,{withFileTypes:true});}catch{unreadable++;continue;}
    for(const entry of entries) {
      if(entry.isSymbolicLink())continue;
      const target=path.join(folder,entry.name);
      if(platform!=='win32'&&['/proc','/sys','/dev'].includes(target)||platform==='darwin'&&['/System','/private'].includes(target))continue;
      if(entry.isDirectory()) {
        if(platform==='darwin' && entry.name.endsWith('.app')) candidates.push({target,name:entry.name.slice(0,-4),type:'software'});
        else if(!skipped.has(entry.name.toLowerCase()))stack.push(target);
      } else if(entry.isFile() && (platform==='win32' && /\.exe$/i.test(entry.name) || platform==='linux' && /\.(desktop|appimage)$/i.test(entry.name))) {
        candidates.push({target,name:entry.name.replace(/\.(exe|desktop|appimage)$/i,''),executable:platform==='win32'||/\.appimage$/i.test(entry.name)?target:'',type:'software'});
      }
    }
    // Yield so cancellation and other IPC remain responsive on large drives.
    if(folders%50===0)await new Promise(resolve=>setImmediate(resolve));
  }
  onProgress({folders,found:candidates.length,unreadable,folder:''});
  return {candidates,folders,unreadable,roots};
}
module.exports={volumeRoots,scanVolumes};

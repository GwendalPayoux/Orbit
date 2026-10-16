const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { volumeRoots, scanVolumes } = require('./volumes.cjs');
async function walk(root, extensions, depth = 3) {
  const results = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory() && depth > 0 && !entry.name.endsWith('.app')) results.push(...await walk(file, extensions, depth - 1));
    else if (extensions.some(ext => entry.name.endsWith(ext))) results.push(file);
  }
  return results;
}
function parseDesktop(text) {
  const section = text.split('[Desktop Entry]')[1]?.split(/\n\[/)[0] || '';
  const values = Object.fromEntries(section.split(/\r?\n/).filter(line => line.includes('=')).map(line => { const i = line.indexOf('='); return [line.slice(0,i), line.slice(i+1)]; }));
  if (values.Type !== 'Application' || values.Hidden === 'true' || values.NoDisplay === 'true') return null;
  return { name: values['Name[fr]'] || values.Name, type: /(^|;)Game;/.test(values.Categories || '') ? 'game' : 'software', desktopCategories: values.Categories || '', executable: values.Exec || '', iconName: values.Icon || '', description: values['Comment[fr]'] || values.Comment || '' };
}
async function discover({allDisks=false,signal,onProgress=()=>{},exclude=[]} = {}) {
  let candidates = [];
  if (process.platform === 'win32') {
    const script = `$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new();
      $paths = @([Environment]::GetFolderPath("StartMenu"), [Environment]::GetFolderPath("CommonStartMenu"), [Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("CommonDesktopDirectory"));
      $wsh = New-Object -ComObject WScript.Shell;
      @(Get-ChildItem -LiteralPath $paths -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        $link = $wsh.CreateShortcut($_.FullName); $info = $null;
        if ($link.TargetPath -and [IO.File]::Exists($link.TargetPath)) { $info = [Diagnostics.FileVersionInfo]::GetVersionInfo($link.TargetPath) }
        [PSCustomObject]@{ target=$_.FullName; name=$_.BaseName; executable=$link.TargetPath; arguments=$link.Arguments; description=$link.Description; productName=$info.ProductName; version=$info.ProductVersion }
      }) | ConvertTo-Json -Compress`;
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, signal, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    const records = JSON.parse(stdout.trim() || '[]');
    candidates = (Array.isArray(records) ? records : [records]).map(record => ({ ...record, type: 'software' }));
  } else if (process.platform === 'darwin') {
    const paths = [...await walk('/Applications', ['.app']), ...await walk(path.join(os.homedir(), 'Applications'), ['.app'])];
    for (const target of paths) {
      let metadata = {};
      try { const { stdout } = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(target, 'Contents/Info.plist')], { timeout: 3000 }); metadata = JSON.parse(stdout); } catch {}
      const appleCategory = metadata.LSApplicationCategoryType || '';
      const categories = /\.games$|\.\w+-games$/.test(appleCategory) ? 'Game;' : appleCategory.endsWith('.developer-tools') ? 'Development;' : appleCategory.endsWith('.productivity') || appleCategory.endsWith('.business') ? 'Office;' : /\.(graphics-design|photography|music|video)$/.test(appleCategory) ? 'Graphics;' : '';
      candidates.push({ target, name: path.basename(target, '.app'), type: 'software', executable: metadata.CFBundleExecutable ? path.join(target,'Contents/MacOS',metadata.CFBundleExecutable) : '', bundleId: metadata.CFBundleIdentifier || '', productName: metadata.CFBundleDisplayName || '', version: metadata.CFBundleShortVersionString || '', desktopCategories: categories });
    }
  } else {
    const roots = [path.join(os.homedir(), '.local/share/applications'), '/usr/local/share/applications', '/usr/share/applications', '/var/lib/flatpak/exports/share/applications', path.join(os.homedir(), '.local/share/flatpak/exports/share/applications')];
    const seen = new Set();
    for (const root of roots) for (const target of await walk(root, ['.desktop'])) {
      const key = path.basename(target);
      if (seen.has(key)) continue;
      seen.add(key);
      const parsed = parseDesktop(await fs.readFile(target, 'utf8').catch(() => ''));
      if (parsed?.name) candidates.push({ ...parsed, target });
    }
  }
  if(allDisks) {
    onProgress({phase:'volumes',folders:0,found:candidates.length});
    const result=await scanVolumes(await volumeRoots(),{signal,onProgress,exclude});
    const key=p=>process.platform==='win32'?String(p||'').toLowerCase():String(p||'');
    const targets=new Set(candidates.map(a=>key(a.target)));
    const executables=new Set(candidates.map(a=>key(a.executable)).filter(Boolean));
    let extra=result.candidates.filter(a=>!targets.has(key(a.target))&&!executables.has(key(a.executable)));
    if(process.platform==='win32') extra=await enrichWindows(extra,signal,onProgress);
    for(const candidate of extra) {
      if(candidate.target.endsWith('.desktop')) {const parsed=parseDesktop(await fs.readFile(candidate.target,'utf8').catch(()=>''));if(!parsed?.name)continue;Object.assign(candidate,parsed);}
      if(process.platform==='darwin') {
        try {const {stdout}=await run('/usr/bin/plutil',['-convert','json','-o','-',path.join(candidate.target,'Contents/Info.plist')],{signal,timeout:3000});const m=JSON.parse(stdout);Object.assign(candidate,{bundleId:m.CFBundleIdentifier||'',version:m.CFBundleShortVersionString||'',executable:m.CFBundleExecutable?path.join(candidate.target,'Contents/MacOS',m.CFBundleExecutable):'',desktopCategories:/\.games$|\.\w+-games$/.test(m.LSApplicationCategoryType||'')?'Game;':''});}catch(error){if(signal?.aborted)throw error;}
      }
      candidates.push({...candidate,discoverySource:'disk'});
    }
    candidates.scanSummary={roots:result.roots,folders:result.folders,unreadable:result.unreadable};
  }
  return candidates;
}
async function enrichWindows(candidates,signal,onProgress) {
  if(!candidates.length)return candidates;
  onProgress({phase:'metadata',found:candidates.length});
  // File names travel on stdin as JSON, never as PowerShell source.
  const script='$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new(); $data = [Console]::In.ReadToEnd() | ConvertFrom-Json; @($data | ForEach-Object { try { $i = [Diagnostics.FileVersionInfo]::GetVersionInfo($_.target); if ($i.ProductName) { $_.name = $i.ProductName }; $_ | Add-Member productName $i.ProductName; $_ | Add-Member description $i.FileDescription; $_ | Add-Member version $i.ProductVersion } catch {}; $_ }) | ConvertTo-Json -Compress -Depth 4';
  const {spawn}=require('node:child_process');
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,signal});let stdout='';let errorText='';
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>64*1024*1024){child.kill();reject(Error('Trop de métadonnées à importer'));}});
    child.stderr.on('data',chunk=>{errorText+=chunk;});child.on('error',reject);child.stdin.on('error',()=>{});
    child.on('close',code=>{if(code!==0)return reject(Error(signal?.aborted?'Exploration annulée':'Lecture des métadonnées impossible'));try{const records=JSON.parse(stdout.trim()||'[]');resolve(Array.isArray(records)?records:[records]);}catch(error){reject(error);}});
    child.stdin.end(JSON.stringify(candidates));
  });
}
module.exports = { discover, parseDesktop, enrichWindows };

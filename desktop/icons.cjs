const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
async function applicationIcon(application, app, nativeImage) {
  if(process.platform==='linux') {
    const icon=application.iconName;
    if(icon) {
      const locations=path.isAbsolute(icon)?[icon]:[
        ...[os.homedir()+'/.local/share/icons','/usr/share/icons/hicolor'].flatMap(root=>[256,128,64,48,32].map(size=>path.join(root,`${size}x${size}`,'apps',path.basename(icon)+'.png'))),
        path.join('/usr/share/pixmaps',path.basename(icon)+'.png')
      ];
      for(const file of locations)if(await fs.access(file).then(()=>true,()=>false)){const image=nativeImage.createFromPath(file);if(!image.isEmpty())return image.resize({width:64,height:64}).toDataURL();}
    }
    return null;
  }
  for(const file of [application.executable,application.target].filter(Boolean)) {
    if(!await fs.access(file).then(()=>true,()=>false))continue;
    try {const image=await app.getFileIcon(file,{size:'normal'});if(!image.isEmpty())return image.toDataURL();}catch{}
  }
  return null;
}
module.exports={applicationIcon};

const {spawnSync}=require('node:child_process');
function releaseEnvironment(input){
  const env={...input};
  for(const key of ['CSC_LINK','CSC_KEY_PASSWORD','WIN_CSC_LINK','WIN_CSC_KEY_PASSWORD','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID'])if(!env[key]?.trim())delete env[key];
  return env;
}
if(require.main===module){
  const result=spawnSync(process.execPath,[require.resolve('electron-builder/cli.js'),'--config','electron-builder.config.cjs','--publish','always'],{stdio:'inherit',env:releaseEnvironment(process.env)});
  if(result.error){console.error(result.error.message);process.exitCode=1;}else process.exitCode=result.status??1;
}
module.exports={releaseEnvironment};

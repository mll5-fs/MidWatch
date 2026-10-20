// Only the lock owner starts the window lifecycle; no settings, accounts or CLI payloads cross instances.
function startSingleInstance(app,{create,getWindow,getAllWindows,platform=process.platform}){
 if(!app.requestSingleInstanceLock()){app.quit();return false;}
 app.on('second-instance',()=>{
  const window=getWindow();if(!window||window.isDestroyed())return;
  if(window.isMinimized())window.restore();
  if(!window.isVisible())window.show();
  window.focus();
 });
 app.whenReady().then(create);
 app.on('activate',()=>{if(getAllWindows().length===0)create();});
 app.on('window-all-closed',()=>{if(platform!=='darwin')app.quit();});
 return true;
}
module.exports={startSingleInstance};

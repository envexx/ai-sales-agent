async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const result=await page.evaluate(()=>{
  const m=window.previewOffice,office=m.worldManager.getOffice();
  const walls=office.children.filter(o=>o.name==='office-wall');
  const signs=office.children.filter(o=>o.userData.fixedSign);
  const work=m.poiManager.getPoi('sit_work-1');
  const facing={x:Math.sin(2*Math.atan2(work.quaternion.y,work.quaternion.w)),z:Math.cos(2*Math.atan2(work.quaternion.y,work.quaternion.w))};
  const origin=m.poiManager.getPoi('leisure-walk-4').position;
  const unreachable=m.poiManager.getAllPois().filter(p=>!p.id.startsWith('spawn')&&p.position.distanceTo(origin)>.01&&!m.navMesh.findPath(origin,p.position).length).map(p=>p.id);
  if(unreachable.length)throw new Error('Unreachable destinations '+unreachable.join(','));
  if(walls.some(o=>o.userData.wallHeight!==2.2))throw new Error('Unequal wall heights');
  if(signs.some(o=>o.isSprite))throw new Error('Billboard sign remains');
  if(facing.z<.99)throw new Error('Supervisor facing not reversed');
  m.setOfficeMode('work');
  return {walls:walls.length,height:2.2,fixedSigns:signs.length,supervisorFacing:facing,unreachable};
 });
 await page.waitForFunction(()=>window.previewOffice.getOfficePreview().every(a=>a.state==='sit_work'),null,{timeout:60000});
 await page.evaluate(()=>window.previewOffice.focusPreviewAgent(null));
 await page.screenshot({path:'.playwright-cli/fixed-walls-interior.png'});
 if(errors.length)throw new Error(errors.join(';'));
 return {...result,agentsAtDesks:15,errors};
}

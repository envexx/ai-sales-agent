async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>window.previewOffice?.getOfficePreview().every(a=>a.state!=='loading'),null,{timeout:60000});
 const result=await page.evaluate(()=>{
  const m=window.previewOffice,o=m.worldManager.getOffice(),origin=m.poiManager.getPoi('leisure-walk-4').position;
  const unreachable=m.poiManager.getAllPois().filter(p=>p.position.distanceTo(origin)>.01&&!m.navMesh.findPath(origin,p.position).length).map(p=>p.id);
  const surfaces=[...new Set(o.children.filter(c=>c.material?.bumpMap).map(c=>c.material.name))];
  const meetings=o.children.filter(c=>c.userData.meetingChair).length;
  if(unreachable.length||meetings!==14||m.getOfficePreview().length!==14||!m.stage.scene.environment)throw new Error(JSON.stringify({unreachable,meetings}));
  return {agents:14,meetingChairs:meetings,windows:o.children.filter(c=>c.name==='office-window').length,textureSurfaces:surfaces,unreachable};
 });
 await page.evaluate(()=>{const s=window.previewOffice.stage;s.followPaused=true;s.camera.position.set(17,8,24);s.controls.target.set(10.4,.8,17);s.controls.update();});
 await page.waitForTimeout(1200);
 await page.screenshot({path:'.playwright-cli/realistic-meeting-detail.png'});
 await page.evaluate(()=>{const s=window.previewOffice.stage;s.followPaused=true;s.camera.position.set(-5.7,5,-3.1);s.controls.target.set(-9.6,.8,-7.9);s.controls.update();});
 await page.waitForTimeout(1200);
 await page.screenshot({path:'.playwright-cli/realistic-workstation-detail.png'});
 await page.evaluate(()=>window.previewOffice.focusPreviewAgent(null));
 await page.waitForTimeout(1000);await page.screenshot({path:'.playwright-cli/realistic-office-final.png'});
 if(errors.length)throw new Error(errors.join(';'));
 return {...result,errors};
}

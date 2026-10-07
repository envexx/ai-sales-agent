async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>window.previewOffice?.getOfficePreview().every(a=>a.state!=='loading'),null,{timeout:60000});
 const settings=await page.evaluate(()=>{
  const m=window.previewOffice,o=m.worldManager.getOffice();
  const floor=o.children.find(c=>c.material?.name==='office-floor').material;
  const fabric=o.children.find(c=>c.material?.name==='office-fabric').material;
  const origin=m.poiManager.getPoi('leisure-walk-4').position;
  const unreachable=m.poiManager.getAllPois().filter(p=>p.position.distanceTo(origin)>.01&&!m.navMesh.findPath(origin,p.position).length).map(p=>p.id);
  const light=m.stage.scene.children.find(c=>c.isDirectionalLight&&c.castShadow);
  return {floorBump:!!floor.bumpMap,fabricBump:!!fabric.bumpMap,anisotropy:floor.map.anisotropy,shadowNormalBias:light.shadow.normalBias,unreachable,agents:m.getOfficePreview().length};
 });
 if(settings.floorBump||settings.fabricBump||settings.unreachable.length||settings.agents!==14)throw new Error(JSON.stringify(settings));
 for(const [name,x,y,z] of [['near',6,8,24],['angle',-7,8,24],['far',25,35,45]]){
  await page.evaluate(({x,y,z})=>{const s=window.previewOffice.stage;s.followPaused=true;s.camera.position.set(x,y,z);s.controls.target.set(0,.8,12);s.controls.update();},{x,y,z});
  await page.waitForTimeout(700);await page.screenshot({path:'.playwright-cli/glitter-fixed-'+name+'.png'});
 }
 await page.evaluate(()=>window.previewOffice.focusPreviewAgent(null));
 if(errors.length)throw new Error(errors.join(';'));
 return {...settings,viewsChecked:3,errors};
}

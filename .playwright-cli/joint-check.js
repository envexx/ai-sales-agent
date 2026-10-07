async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>window.previewOffice?.getOfficePreview().every(a=>a.state!=='loading'),null,{timeout:60000});
 const result=await page.evaluate(()=>{
  const m=window.previewOffice,o=m.worldManager.getOffice();
  const walls=o.children.filter(c=>c.name==='office-wall');
  const jambs=o.children.filter(c=>c.userData.doorJamb),trim=o.children.filter(c=>c.userData.skirting);
  const bounds=c=>{c.geometry.computeBoundingBox();const b=c.geometry.boundingBox;return {min:{x:b.min.x+c.position.x,y:b.min.y+c.position.y,z:b.min.z+c.position.z},max:{x:b.max.x+c.position.x,y:b.max.y+c.position.y,z:b.max.z+c.position.z}};};
  const intersect=(a,b)=>['x','y','z'].every(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])>.00001);
  const overlap=jambs.concat(trim).flatMap(a=>walls.filter(w=>intersect(bounds(a),bounds(w))).map(w=>({fixture:a.name,wall:w.position.toArray()})));
  const origin=m.poiManager.getPoi('leisure-walk-4').position;
  const unreachable=m.poiManager.getAllPois().filter(p=>p.position.distanceTo(origin)>.01&&!m.navMesh.findPath(origin,p.position).length).map(p=>p.id);
  if(overlap.length||unreachable.length)throw new Error(JSON.stringify({overlap,unreachable}));
  return {doorJambs:jambs.length,skirting:trim.length,overlappingWallFaces:overlap.length,unreachable};
 });
 for(const [name,x,y,z] of [['front',4,3.5,16],['left',-4,3.5,15],['right',5,3.5,15]]){
  await page.evaluate(({x,y,z})=>{const s=window.previewOffice.stage;s.followPaused=true;s.camera.position.set(x,y,z);s.controls.target.set(.4,1,9.8);s.controls.update();},{x,y,z});
  await page.waitForTimeout(800);await page.screenshot({path:'.playwright-cli/joint-fixed-'+name+'.png'});
 }
 await page.evaluate(()=>window.previewOffice.focusPreviewAgent(null));
 if(errors.length)throw new Error(errors.join(';'));
 return {...result,errors};
}

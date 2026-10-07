async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const geometry=await page.evaluate(()=>{
   const m=window.previewOffice,o=m.worldManager.getOffice();
   const front=o.children.filter(c=>c.name==='office-wall'&&Math.abs(c.position.z-5.8)<.01);
   const equipment=m.poiManager.getAllPois().filter(p=>/^leisure-(fitness|arcade)-/.test(p.id));
   const origin=m.poiManager.getPoi('leisure-walk-4').position;
   const unreachable=equipment.filter(p=>!m.navMesh.findPath(origin,p.position).length).map(p=>p.id);
   if(front.length!==2||equipment.length!==4||unreachable.length)throw new Error(JSON.stringify({front:front.length,equipment:equipment.length,unreachable}));
   return {relocatedDoorZ:5.8,fitnessStations:2,arcadeStations:2,unreachable};
 });
 const observed=new Set();
 for(let i=0;i<20;i++){
   const usage=await page.evaluate(()=>{
     const m=window.previewOffice;
     return m.getOfficePreview().filter(a=>a.activity==='fitness'||a.activity==='arcade').flatMap(a=>{
       const p=m.poiManager.getPoi(m.activityPoi.get(a.index)),v=m.controller.getCPUPosition(a.index);
       return p&&v&&v.distanceTo(p.position)<.2?[{activity:a.activity,agent:a.id,state:a.state}]:[];
     });
   });
   usage.forEach(u=>observed.add(u.activity));
   if(observed.size===2)break;
   await page.waitForTimeout(1500);
 }
 await page.evaluate(()=>{const s=window.previewOffice.stage;s.followPaused=true;s.camera.position.set(-20,13,20);s.controls.target.set(-10,0,7.5);s.controls.update();});
 await page.waitForTimeout(800);await page.screenshot({path:'.playwright-cli/recreation-fitness-arcade.png'});
 await page.evaluate(()=>window.previewOffice.focusPreviewAgent(null));
 if(errors.length||observed.size!==2)throw new Error(JSON.stringify({errors,observed:[...observed]}));
 return {...geometry,automaticActivitiesObserved:[...observed],errors};
}

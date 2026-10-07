async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const doors=await page.evaluate(()=>{
  const m=window.previewOffice;m.setOfficeMode('work');
  const office=m.worldManager.getOffice();
  const names=[...new Set(office.children.filter(o=>o.userData.officeDoor).map(o=>o.name))];
  // Interrupted at an edge just inside the wall exclusion margin.
  const target=m.poiManager.getPoi('sit_work-5').position;
  const from=target.clone();from.set(6.08,0,-3);
  const recovered=m.navMesh.findPath(from,target);
  if(!recovered.length)throw new Error('No local edge recovery');
  return {names,recovery:recovered.length};
 });
 await page.waitForFunction(()=>window.previewOffice.getOfficePreview().every(a=>a.state==='sit_work'),null,{timeout:60000});
 // Move both reported agents from the leisure wing, interrupt, then repeat work.
 await page.evaluate(()=>{const m=window.previewOffice;for(const i of [5,13])m.setAgentActivity(i,'coffee');});
 await page.waitForTimeout(1200);
 await page.evaluate(()=>{const m=window.previewOffice;for(const i of [5,13]){m.setAgentActivity(i,'work');m.setAgentActivity(i,'work');}});
 await page.waitForFunction(()=>window.previewOffice.getOfficePreview().filter(a=>[5,13].includes(a.index)).every(a=>a.state==='sit_work'),null,{timeout:60000});
 // A duplicate work command while already seated must still complete.
 await page.evaluate(()=>{const m=window.previewOffice;for(const i of [5,13])m.setAgentActivity(i,'work');});
 await page.waitForFunction(()=>window.previewOffice.getOfficePreview().filter(a=>[5,13].includes(a.index)).every(a=>a.state==='sit_work'),null,{timeout:10000});
 const result=await page.evaluate(()=>window.previewOffice.getOfficePreview().filter(a=>[5,13].includes(a.index)).map(a=>({name:a.name,state:a.state,position:a.position})));
 await page.evaluate(()=>window.previewOffice.focusPreviewAgent(null));
 await page.screenshot({path:'.playwright-cli/office-doors.png'});
 if(errors.length)throw new Error(errors.join(';'));
 return {doors,...{reportedAgents:result},errors};
}

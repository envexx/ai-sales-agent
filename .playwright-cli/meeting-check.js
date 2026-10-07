async page => {
 await page.waitForFunction(()=>window.previewOffice?.getOfficePreview().length===14);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const geometry=await page.evaluate(()=>{
 const m=window.previewOffice,office=m.worldManager.getOffice(),origin=m.poiManager.getPoi('leisure-walk-4').position;
 const seats=m.poiManager.getPoisByPrefix('leisure-meeting-');
 const unreachable=m.poiManager.getAllPois().filter(p=>p.position.distanceTo(origin)>.01&&!m.navMesh.findPath(origin,p.position).length).map(p=>p.id);
 return {meetingSeats:seats.length,chairs:office.children.filter(o=>o.userData.meetingChair).length,tables:office.children.filter(o=>o.name==='meeting-table').length,whiteboards:office.children.filter(o=>o.name==='meeting-whiteboard').length,sleepPois:m.poiManager.getPoisByPrefix('leisure-sleep-').length,unreachable};
 });
 if(geometry.meetingSeats!==14||geometry.chairs!==14||geometry.tables!==1||geometry.whiteboards!==1||geometry.sleepPois||geometry.unreachable.length)throw new Error(JSON.stringify(geometry));
 await page.getByRole('button',{name:'Bekerja',exact:true}).click();
 await page.waitForFunction(()=>window.previewOffice.getOfficePreview().every(a=>a.state==='sit_work'),null,{timeout:60000});
 await page.evaluate(()=>{const m=window.previewOffice;for(const a of m.getOfficePreview())m.setAgentActivity(a.index,'meeting');});
 await page.waitForFunction(()=>window.previewOffice.getOfficePreview().every(a=>a.activity==='meeting'&&a.state==='sit_idle'),null,{timeout:60000});
 await page.evaluate(()=>window.previewOffice.focusPreviewAgent(null));
 await page.screenshot({path:'.playwright-cli/meeting-14-seats.png'});
 await page.getByRole('button',{name:'Bekerja',exact:true}).click();
 await page.waitForFunction(()=>window.previewOffice.getOfficePreview().every(a=>a.state==='sit_work'),null,{timeout:60000});
 await page.getByRole('button',{name:'Kantor hidup',exact:true}).click();
 if(errors.length)throw new Error(errors.join(';'));
 return {...geometry,agentsAtMeeting:14,returnToDesks:14,errors};
}

async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>window.previewOffice?.getOfficePreview().length===14);
 const expected=['supervisor','prospecting','scout','sales','scoper','legal','intake','qa','scribe','handover','support','monitor','retainer','content'];
 const divisions=['D0','D1','D1','D1','D2','D2','D2','D3','D3','D4','D4','D4','D4','D5'];
 const before=await page.evaluate(()=>{
 const m=window.previewOffice,office=m.worldManager.getOffice(),agents=m.getOfficePreview();
 const doors=[...new Set(office.children.filter(o=>o.userData.officeDoor).map(o=>o.name))];
 const center=m.poiManager.getPoi('leisure-walk-4').position;
 const unreachable=m.poiManager.getAllPois().filter(p=>p.position.distanceTo(center)>.01&&!m.navMesh.findPath(center,p.position).length).map(p=>p.id);
 return {agents,doors,unreachable,count:m.characterManager.getCount(),desks:m.poiManager.getPoisByPrefix('sit_work').length};
 });
 if(before.agents.map(a=>a.name).join()!==expected.join())throw new Error('Wrong slug roster');
 if(before.agents.some((a,i)=>!a.division.startsWith(divisions[i])))throw new Error('Wrong division assignments');
 if(before.doors.length!==6||before.desks!==14||before.count!==15||before.unreachable.length)throw new Error(JSON.stringify(before));
 await page.getByRole('button',{name:'14 agent',exact:true}).click();
 if(await page.locator('.living-division').count()!==6||await page.locator('.living-directory-agent').count()!==14)throw new Error('Directory counts wrong');
 await page.locator('.living-directory-agent').filter({has:page.getByText('scoper',{exact:true})}).click();
 await page.getByRole('button',{name:'Tutup detail agent',exact:true}).click();
 await page.getByRole('button',{name:'Bekerja',exact:true}).click();
 await page.waitForFunction(()=>window.previewOffice.getOfficePreview().every(a=>a.state==='sit_work'),null,{timeout:60000});
 await page.screenshot({path:'.playwright-cli/14-agent-divisions.png'});
 await page.getByRole('button',{name:'Kantor hidup',exact:true}).click();
 if(errors.length)throw new Error(errors.join(';'));
 return {agents:14,divisions:6,slugNames:expected,desks:before.desks,reachable:'all',agentsWorking:14,errors};
}

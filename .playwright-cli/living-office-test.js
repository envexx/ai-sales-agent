async page=>{
 const requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.reload();await page.getByRole('button',{name:'Waktu santai',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('.living-loading'));
 await page.evaluate(()=>{const el=document.querySelector('.living-stage');let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];while(f){let h=f.memoizedState;while(h){const m=h.memoizedState?.current;if(m?.getOfficePreview){window.previewOffice=m;return;}h=h.next;}f=f.return;}});
 const nav=await page.evaluate(()=>{const m=window.previewOffice,from=m.poiManager.getPoi('spawn-2').position.clone().set(0,0,0);return m.poiManager.getAllPois().filter(p=>p.id.startsWith('leisure-')).map(p=>({id:p.id,steps:from.distanceTo(p.position)<.1?1:m.navMesh.findPath(from,p.position).length}));});
 if(nav.some(p=>!p.steps))throw new Error(JSON.stringify(nav.filter(p=>!p.steps)));
 await page.waitForFunction(()=>{const m=window.previewOffice;return m.getOfficePreview().some(a=>a.activity==='sleep'&&a.state==='idle'&&m.characterManager.restPoseAttribute.array[a.index*3]>1);},null,{timeout:50000});
 const activity=await page.evaluate(()=>{const m=window.previewOffice;return {agents:m.getOfficePreview(),poses:Array.from(m.characterManager.restPoseAttribute.array),ai:!!m.simulation};});
 await page.screenshot({path:'.playwright-cli/living-office-overview.png'});
 const sleeper=activity.agents.find(a=>a.activity==='sleep'&&a.state==='idle');
 await page.evaluate(index=>window.previewOffice.focusPreviewAgent(index),sleeper.index);await page.waitForTimeout(800);await page.screenshot({path:'.playwright-cli/living-office-sleep.png'});
 await page.getByRole('button',{name:'Seluruh workspace',exact:true}).click();
 await page.getByRole('button',{name:'Bekerja',exact:true}).click();
 await page.waitForFunction(()=>window.previewOffice.getOfficePreview().every(a=>a.state==='sit_work'),null,{timeout:55000});
 const posesCleared=await page.evaluate(()=>Array.from(window.previewOffice.characterManager.restPoseAttribute.array).every(n=>n===0));
 if(!posesCleared)throw new Error('Sleep pose not cleared on return to work');
 await page.getByRole('button',{name:'Waktu santai',exact:true}).click();await page.waitForTimeout(500);
 const resting=await page.evaluate(()=>window.previewOffice.getOfficePreview());
 if(!resting.some(a=>a.state==='walk')||resting.some(a=>a.activity==='work'))throw new Error('Break is not autonomous movement');
 await page.getByRole('button',{name:'Kantor hidup',exact:true}).click();
 const external=requests.filter(u=>!u.startsWith('http://127.0.0.1:3005/')&&!u.startsWith('blob:http://127.0.0.1:3005/')&&!u.startsWith('data:'));
 if(errors.length||external.length||activity.ai)throw new Error(JSON.stringify({errors,external,ai:activity.ai}));
 return {agents:activity.agents.length,uniqueColors:new Set(activity.agents.map(a=>a.color)).size,leisureLocations:nav.length,sleepPose:'verified',returnToWork:15,breakMovement:'verified',external,errors};
}

async page => {
  const requests=[],errors=[];
  page.on('request',request=>requests.push(request.url()));
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:900});
  await page.reload();
  await page.getByText('15 / 15 agent duduk di meja',{exact:true}).waitFor({timeout:30000});
  const initial=await page.evaluate(()=>{
    const container=document.querySelector('.preview-stage');
    let fiber=container[Object.keys(container).find(k=>k.startsWith('__reactFiber'))];
    while(fiber){let hook=fiber.memoizedState;for(let i=0;hook&&i<50;i++,hook=hook.next){const manager=hook.memoizedState?.current;if(manager?.getOfficePreview){window.previewOffice=manager;const origin=manager.poiManager.getPoi('spawn-2').position.clone().set(0,0,0);return {agents:manager.getOfficePreview(),paths:manager.getOfficePreview().map(a=>{const poi=manager.poiManager.getPoi(`sit_work-${a.index}`);return {id:a.id,steps:manager.navMesh.findPath(origin,poi.position).length};}),aiRuntime:!!manager.simulation};}}fiber=fiber.return;}
    throw new Error('Scene manager unavailable');
  });
  if(initial.agents.length!==15||initial.agents.some(a=>a.state!=='sit_work'||!a.hasDesk)||initial.paths.some(p=>!p.steps)||initial.aiRuntime)throw new Error(JSON.stringify(initial));
  await page.screenshot({path:'.playwright-cli/delegation-office-final.png'});
  await page.getByRole('button',{name:'Simulasikan istirahat',exact:true}).click();
  await page.waitForFunction(()=>window.previewOffice.getOfficePreview().every(a=>a.state==='idle'),null,{timeout:20000});
  await page.getByRole('button',{name:'Simulasikan bekerja',exact:true}).click();
  await page.getByText('15 / 15 agent duduk di meja',{exact:true}).waitFor({timeout:30000});
  await page.getByRole('button',{name:/Su Supervisor/}).click();
  await page.waitForTimeout(800);
  await page.screenshot({path:'.playwright-cli/delegation-supervisor-detail.png'});
  await page.getByRole('button',{name:'Seluruh kantor',exact:true}).click();
  const external=requests.filter(url=>!url.startsWith('http://127.0.0.1:3005/')&&!url.startsWith('blob:http://127.0.0.1:3005/')&&!url.startsWith('data:'));
  if(external.length||errors.length)throw new Error(JSON.stringify({external,errors}));
  return {agents:15,seated:15,reachableDesks:initial.paths.length,workRestCycle:'passed',aiRuntime:initial.aiRuntime,externalRequests:external,errors};
}

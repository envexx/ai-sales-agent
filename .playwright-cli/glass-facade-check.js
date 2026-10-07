async page => {
 const result=await page.evaluate(()=>{
   const m=window.previewOffice,office=m.worldManager.getOffice();
   const walls=office.children.filter(c=>c.name==='office-wall');
   const panes=office.children.filter(c=>c.name==='office-window');
   const blockedFacade=walls.filter(c=>Math.abs(c.position.z+10)<.01||Math.abs(c.position.z+11)<.01||Math.abs(c.position.x+14)<.01||Math.abs(c.position.x-14.8)<.01);
   const rearGlass=panes.filter(c=>Math.abs(c.position.z+11)<.01);
   if(blockedFacade.length||rearGlass.length!==9)throw new Error(JSON.stringify({blockedFacade:blockedFacade.length,rearGlass:rearGlass.length}));
   return {agents:m.getOfficePreview().length,rearGlass:rearGlass.length,totalGlass:panes.length,obstructingOuterWalls:blockedFacade.length};
 });
 await page.evaluate(()=>{const s=window.previewOffice.stage;s.followPaused=true;s.camera.position.set(24,29,-35);s.controls.target.set(0,.8,3);s.controls.update();});
 await page.waitForTimeout(1000);await page.screenshot({path:'.playwright-cli/office-rear-glass.png'});
 await page.evaluate(()=>{const s=window.previewOffice.stage;s.camera.position.set(8,39,30);s.controls.target.set(0,.8,3);s.controls.update();});
 await page.waitForTimeout(1000);await page.screenshot({path:'.playwright-cli/office-glass-plan.png'});
 await page.evaluate(()=>window.previewOffice.focusPreviewAgent(null));
 return result;
}

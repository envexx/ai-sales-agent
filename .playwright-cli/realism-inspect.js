async page => {
 await page.waitForFunction(()=>window.previewOffice?.getOfficePreview().every(a=>a.state!=='loading'),null,{timeout:60000});
 await page.screenshot({path:'.playwright-cli/realistic-office-overview.png'});
 const m=await page.evaluate(()=>{const m=window.previewOffice,o=m.worldManager.getOffice();return {agents:m.getOfficePreview().length,windows:o.children.filter(c=>c.name==='office-window').length,environment:!!m.stage.scene.environment,keys:o.getObjectByName('keyboard-keycaps').count,materials:[...new Set(o.children.filter(c=>c.material?.map).map(c=>c.material.name))]};});return m;
}

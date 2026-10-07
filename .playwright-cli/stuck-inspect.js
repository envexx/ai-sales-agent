async page => {
 await page.evaluate(()=>window.previewOffice.setOfficeMode('work'));
 await page.waitForTimeout(20000);
 return await page.evaluate(()=>({agents:window.previewOffice.getOfficePreview(),paths:[5,13].map(i=>({i,moving:window.previewOffice.controller.pathAgents[i].isMoving,path:window.previewOffice.controller.pathAgents[i]}))}));
}

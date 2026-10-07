async page => {
 await page.waitForFunction(()=>document.querySelectorAll('.living-label').length===15);
 const info=await page.evaluate(()=>Array.from(document.querySelectorAll('.living-label')).map(el=>({name:el.textContent,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,visible:getComputedStyle(el).visibility==='visible',small:el.querySelector('small')!==null})));
 if(info.some(x=>x.height>22||x.width>105||x.small))throw new Error('Labels not compact');
 await page.screenshot({path:'.playwright-cli/compact-labels.png'});
 await page.getByRole('button',{name:'15 agent',exact:true}).click();
 await page.locator('.living-directory>button').first().click();
 await page.waitForSelector('.living-inspector');
 return {labels:info.length,visible:info.filter(x=>x.visible).length,maximumHeight:Math.max(...info.map(x=>x.height)),detail:'opens'};
}

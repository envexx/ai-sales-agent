async page => {
 await page.getByText('LangGraph Business',{exact:false}).first().waitFor({timeout:20000});
 await page.locator('canvas').first().waitFor();
 await page.waitForTimeout(1000);
 const items=await page.evaluate(()=>JSON.parse(localStorage.getItem('openclaw-office-furniture-v9:lobby')||'[]'));
 const office=items.filter(i=>i._uid.startsWith('supervisor_'));
 if(office.length!==4 || !office.some(i=>i.id==='supervisor_desk')) throw Error('Supervisor office not installed in saved layout');
 await page.screenshot({path:'.playwright-cli/claw-supervisor-office.png'});
 return {office,canvas:await page.locator('canvas').count()};
}

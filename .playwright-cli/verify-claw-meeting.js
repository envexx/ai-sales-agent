async page => {
 await page.getByText('LangGraph Business',{exact:false}).first().waitFor({timeout:20000});
 await page.locator('canvas').first().waitFor();
 await page.waitForTimeout(1000);
 const layout=await page.evaluate(()=>JSON.parse(localStorage.getItem('openclaw-office-furniture-v9:lobby')||'[]'));
 const table=layout.find(i=>i.type==='round_table');
 if(table?.r!==64 || table.x!==76 || table.y!==56) throw Error('Saved layout did not migrate');
 await page.getByRole('button',{name:'Collapse building directory'}).click();
 await page.screenshot({path:'.playwright-cli/claw-meeting-indonesia.png'});
 return {table,chairs:layout.filter(i=>i.type==='chair'&&i.x<290&&i.y<235),loaded:await page.locator('canvas').count()};
}

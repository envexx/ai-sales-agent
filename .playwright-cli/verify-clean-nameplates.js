async page => {
 await page.getByText('LangGraph Business',{exact:false}).first().waitFor({timeout:20000});
 await page.getByRole('button',{name:'Collapse building directory'}).click();
 await page.locator('canvas').first().waitFor();
 await page.waitForTimeout(1500);
 await page.screenshot({path:'.playwright-cli/claw-clean-nameplates.png'});
 return {canvas:await page.locator('canvas').count(),ready:(await page.locator('body').innerText()).slice(0,500)};
}

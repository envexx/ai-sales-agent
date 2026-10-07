async page => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto("http://localhost:3001/");
  await page.getByRole("button", {name:/Riset prospek harian/}).click();
  await page.getByRole("dialog").waitFor();
  const dialog = await page.getByRole("dialog").innerText();
  await page.keyboard.press("Escape");
  const closed = await page.getByRole("dialog").count() === 0;
  await page.goto("http://localhost:3001/workflow");
  await page.locator(".react-flow__node").first().waitFor();
  const nodes = await page.locator(".react-flow__node").count();
  await page.screenshot({path:".playwright-cli/business-workflow.png"});
  const issues = [];
  for (const width of [320,390,768,1024,1440]) {
    for (const path of ["/","/workflow","/leads","/projects","/invoices","/booking","/kualitas","/knowledge","/pipeline","/approvals","/tickets","/pengaturan"]) {
      await page.setViewportSize({width,height:900});
      await page.goto("http://localhost:3001"+path);
      await page.locator("[data-slot=page-body]").waitFor();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
      if(overflow) issues.push({path,width});
    }
  }
  await page.goto("http://localhost:3001/agents/scoper");
  const redirect = page.url();
  return {dialogHasSchedule:dialog.includes("Dijadwalkan"),closed,nodes,issues,redirect};
}

async page => {
  const routes = ['/', '/leads', '/projects', '/invoices', '/knowledge', '/pipeline', '/approvals', '/tickets', '/booking', '/kualitas', '/workflow', '/operasional', '/pengaturan', '/agents/scoper', '/agents/sales?tab=aktivitas'];
  const report = [];
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`http://localhost:3001${route}`);
      await page.locator('h1').waitFor();
      await page.waitForTimeout(250);
      report.push(await page.evaluate(({route,width}) => {
        const overflow = [...document.querySelectorAll('main *')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width && r.right > innerWidth + 1 && !el.closest('[data-slot="table-container"],.react-flow');
        }).slice(0,5).map(el=>({tag:el.tagName,class:el.className,text:el.textContent?.slice(0,60)}));
        return {route,width,scrollWidth:document.documentElement.scrollWidth,overflow};
      },{route,width}));
      if ([390,1440].includes(width) && ['/','/pengaturan','/leads','/operasional'].includes(route)) await page.screenshot({path:`.playwright-cli/spacing-before-${route.replaceAll('/','') || 'home'}-${width}.png`,fullPage:true});
    }
  }
  console.log(JSON.stringify(report));
}

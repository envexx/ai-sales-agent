async page => {
  const routes = ['/', '/leads', '/projects', '/invoices', '/knowledge', '/pipeline', '/approvals', '/tickets', '/booking', '/kualitas', '/workflow', '/operasional', '/pengaturan', '/agents/scoper', '/agents/sales?tab=aktivitas'];
  const report = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`http://localhost:3001${route}`);
      await page.locator('h1').waitFor();
      await page.locator('[data-slot="page-body"]').waitFor();
      await page.waitForTimeout(150);
      report.push(await page.evaluate(({route,width}) => {
        const body = document.querySelector('[data-slot="page-body"]');
        const header = document.querySelector('[data-slot="page-header"] > div');
        const overflow = [...document.querySelectorAll('main *')].filter(el => {
          const r = el.getBoundingClientRect();
          if (!r.width || r.right <= innerWidth + 1) return false;
          if (el.closest('[data-slot="table-container"],.react-flow')) return false;
          let parent = el.parentElement;
          while (parent && parent.tagName !== 'MAIN') {
            if (['hidden','auto','scroll'].includes(getComputedStyle(parent).overflowX)) return false;
            parent = parent.parentElement;
          }
          return true;
        }).slice(0,4).map(el=>({tag:el.tagName,class:el.className,text:el.textContent?.slice(0,60)}));
        const style = getComputedStyle(body);
        const headerRect = header.getBoundingClientRect(), bodyRect = body.getBoundingClientRect();
        return {route,width,scrollWidth:document.documentElement.scrollWidth,gutter:style.paddingLeft,aligned:headerRect.x===bodyRect.x && getComputedStyle(header).paddingLeft===style.paddingLeft,overflow};
      },{route,width}));
      if ([390,1440].includes(width) && ['/','/pengaturan','/leads','/operasional'].includes(route)) await page.screenshot({path:`.playwright-cli/spacing-after-${route.replaceAll('/','') || 'home'}-${width}.png`,fullPage:true});
    }
  }
  return {checks:report.length,issues:report.filter(row=>row.scrollWidth>row.width || !row.aligned || row.overflow.length),gutters:[...new Set(report.map(row=>`${row.width}:${row.gutter}`))]};
}

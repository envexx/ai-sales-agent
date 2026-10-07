async page => {
  const response = await page.request.get('http://localhost:4000/agents/status');
  const { agents } = await response.json();
  let scopedChecks = 0;
  for (const agent of agents) {
    for (const [resource, types] of [['jobs', agent.jobTypes], ['events', agent.eventTypes]]) {
      const result = await page.request.get(`http://localhost:4000/pipeline/${resource}?agent=${agent.slug}&limit=80`);
      if (!result.ok()) throw new Error(`API failed: ${agent.slug}/${resource}`);
      const data = await result.json();
      if (data[resource].some(item => !types.includes(item.type))) throw new Error(`Activity leaked into ${agent.slug}`);
      scopedChecks++;
    }
  }
  const invalid = await page.request.get('http://localhost:4000/pipeline/jobs?agent=unknown');
  if (invalid.status() !== 400) throw new Error('Unknown agent must be rejected');
  await page.goto('http://localhost:3001/agents/prospecting?tab=aktivitas');
  await page.getByText('Aktivitas Research Prospecting', { exact: true }).waitFor();
  await page.getByText('Menjalankan pencarian harian', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Pekerjaan', exact: true }).click();
  if (await page.getByRole('button', { name: 'Pekerjaan', exact: true }).getAttribute('aria-pressed') !== 'true') throw new Error('Filter did not activate');
  await page.getByRole('button', { name: 'Scoper & PRD', exact: true }).click();
  await page.locator('a[href="/agents/scoper?tab=aktivitas"]').first().click();
  await page.getByText('Belum ada aktivitas Scoper & PRD', { exact: true }).waitFor();
  if (await page.getByText('Menjalankan pencarian harian', { exact: true }).count()) throw new Error('Previous agent activity retained');
  await page.goto('http://localhost:3001/agents/sales?tab=aktivitas');
  await page.getByText('Aktivitas Sales (Nadia)', { exact: true }).waitFor();
  await page.getByText('Memuat aktivitas Sales (Nadia)…', { exact: true }).waitFor({state:'hidden'});
  await page.goto('http://localhost:3001/agents/scoper');
  await page.getByRole('heading', { name: 'Bagian Anda', exact: true }).waitFor();
  await page.setViewportSize({width:390,height:844});
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error('Mobile page overflows');
  await page.screenshot({path:'.playwright-cli/agent-scoper-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'.playwright-cli/agent-scoper-desktop.png',fullPage:true});
  await page.goto('http://localhost:3001/');
  await page.getByText('Apa yang ingin Anda kerjakan?', { exact: true }).waitFor();
  return {scopedChecks,invalidAgentRejected:true,agentNavigation:true,salesActivity:true,mobileOverflow:false,homeGuide:true};
}

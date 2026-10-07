async page => {
  let paid=false;
  const at = new Date().toISOString();
  const record={id:'project:gate-test',title:'Audit Gate Workflow',company:'Test',projectId:'gate-test',leadId:null,column:'review',stage:'done_review',salesPath:'meeting',currentAgent:'qa',status:'running',createdAt:at,updatedAt:at,steps:[{agent:'qa',state:'running',evidence:'qa1'},{agent:'scoper',state:'done',evidence:'prd1'}],jobs:[],evidence:[],approvals:[]};
  await page.route('http://localhost:4000/business/board',r=>r.fulfill({json:{generatedAt:at,limited:false,columns:[],records:[record]}}));
  await page.route('http://localhost:4000/projects/gate-test',r=>r.fulfill({json:{project:{id:'gate-test',title:record.title,stage:record.stage,createdAt:at,updatedAt:at},client:null,context:{},documents:[],invoices:[{id:'dp1',kind:'dp',status:paid?'paid':'sent',amount:100000,currency:'IDR'}],jobs:[],events:[]}}));
  await page.goto('http://localhost:3001/workflow?case=project:gate-test');
  await page.locator('[data-id="dp"]').getByText('Menunggu',{exact:true}).waitFor();
  await page.locator('[data-id="meeting"]').getByText('Selesai',{exact:true}).waitFor();
  await page.locator('[data-id="demo"]').getByText('Belum ada bukti',{exact:true}).waitFor();
  await page.locator('[data-id="qa"]').getByText('Sedang bekerja',{exact:true}).waitFor();
  paid=true;
  await page.locator('[data-id="dp"]').getByText('Selesai',{exact:true}).waitFor({timeout:12000});
  await page.locator('[data-id="dp"]').click();
  await page.getByRole('complementary').filter({hasText:'DP dibayar'}).getByText('Selesai',{exact:true}).waitFor();
  const checks=[];
  for(const width of [320,390,768,1024,1440]) {
    await page.setViewportSize({width,height:1000});
    checks.push({width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  }
  await page.unrouteAll({behavior:'wait'});
  await page.goto('http://localhost:3001/projects');
  return {pass:'Live DP update confirmed; meeting route evidence, QA state and selected gate details correct',checks};
}

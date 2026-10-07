async page => {
  const now=new Date().toISOString();
  const board=await (await page.request.get("http://localhost:4000/business/board")).json();
  const record={id:"lead:verification-only",title:"Audit Kanban",company:"Pengujian browser",leadId:"verification-only",projectId:null,column:"prospects",stage:"discovered",currentAgent:"scout",status:"running",createdAt:now,updatedAt:now,steps:[{agent:"prospecting",state:"done",evidence:"research-proof"},{agent:"scout",state:"running",evidence:"scout-proof"},{agent:"sales",state:"unknown",evidence:null}],jobs:[],evidence:[{id:"research-proof",type:"prospect.discovered",at:now,summary:"Riset selesai; prospek diteruskan"}],approvals:[]};
  let mock={...board,records:[record]};
  await page.route("**/business/board",route=>route.fulfill({json:mock}));
  try {
    await page.goto("http://localhost:3001/");
    await page.getByRole("button",{name:/Audit Kanban/}).click();
    const first=await page.getByRole("dialog").innerText();
    mock={...mock,records:[{...record,column:"sales",currentAgent:"sales",steps:[record.steps[0],{agent:"scout",state:"done",evidence:"scout-proof"},{agent:"sales",state:"running",evidence:"sales-proof"}]}]};
    await page.getByRole("dialog").getByText("sales",{exact:false}).first().waitFor({timeout:12000});
    await page.keyboard.press("Escape");
    const moved=await page.getByRole("region",{name:"Sales"}).count();
    const cardMoved=await page.locator("section").filter({has:page.getByRole("heading",{name:/^Sales/})}).getByRole("button",{name:/Audit Kanban/}).count();
    await page.goto("http://localhost:3001/workflow?case=lead%3Averification-only");
    await page.locator(".react-flow__node").first().waitFor();
    const states=await page.locator(".react-flow__node").evaluateAll(nodes=>Object.fromEntries(nodes.filter(n=>["prospecting","scout","sales"].includes(n.dataset.id)).map(n=>[n.dataset.id,n.textContent])));
    await page.screenshot({path:".playwright-cli/workflow-live-verification.png"});
    return {auditVisible:first.includes("Riset selesai"),moved,cardMoved,states};
  } finally { await page.unroute("**/business/board"); }
}

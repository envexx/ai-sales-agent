async (page) => {
  await page.evaluate(() => {
    const ids=window.officeAgentsRef.current.map(a=>a.id);
    const emit = () => { for(const socket of window.officeSockets) for(const id of ids) socket.dispatchEvent(new MessageEvent('message', {data: JSON.stringify({type:'event',event:'agent',payload:{agentId:id,sessionKey:`agent:${id}:main`,runId:`visual-test-${id}`,timestamp:Date.now(),stream:'lifecycle',data:{phase:'start'}}})})); };
    emit(); window.officeWorkingFixture=setInterval(emit,3000);
  });
  await page.waitForFunction(() => window.officeAgentsRef.current.length===14 && window.officeAgentsRef.current.every(a=>a.status==='working'&&a.state==='sitting'), null, {timeout:55000});
  const states = await page.evaluate(() => window.officeAgentsRef.current.map(a=>({id:a.id,status:a.status,state:a.state,x:a.x,y:a.y,targetX:a.targetX,targetY:a.targetY,facing:a.facing,pathLength:a.path?.length})));
  await page.screenshot({path:'.playwright-cli/office-agents-working.png'});
  await page.evaluate(() => clearInterval(window.officeWorkingFixture));
  return states;
}

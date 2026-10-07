async (page) => {
  await page.addInitScript(() => {
    window.officeSockets = [];
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args) { super(...args); window.officeSockets.push(this); }
    };
  });
  await page.goto('http://localhost:3000/office');
  await page.getByRole('button', {name: '14 agents', exact: true}).waitFor({timeout: 30000});
  const close = page.getByRole('button', {name: 'Close onboarding'});
  if (await close.isVisible()) await close.click();
  await page.waitForTimeout(3000);
  const layout = await page.evaluate(() => {
    const values = Object.entries(localStorage).filter(([key]) => key.includes('furniture'));
    return values.map(([key, value]) => ({key, desks: JSON.parse(value).filter(item => item.id === 'supervisor_desk' || item.id?.startsWith('agent_desk:')).map(item => ({id:item.id,x:item.x,y:item.y}))}));
  });
  await page.screenshot({path: '.playwright-cli/office-agent-workstations.png'});
  return layout;
}

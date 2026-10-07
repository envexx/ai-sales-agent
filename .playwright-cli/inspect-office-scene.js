async (page) => page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const key = Object.keys(canvas).find(key => key.startsWith('__reactFiber'));
  let root = canvas[key];
  while (root.return) root = root.return;
  root = root.stateNode?.current || root;
  const seen = new Set();
  const result = [];
  function walk(fiber) {
    if (!fiber || seen.has(fiber)) return;
    seen.add(fiber);
    const p = fiber.memoizedProps;
    let hook = fiber.memoizedState;
    for(let i=0; hook && i<500; i++,hook=hook.next) {
      const v=hook.memoizedState;
      const value=v?.current;
      if(Array.isArray(value) && value.some(a => a?.targetX !== undefined)) { window.officeAgentsRef=v; result.push({agents:value.map(a=>({id:a.id,state:a.state,status:a.status,x:a.x,y:a.y,targetX:a.targetX,targetY:a.targetY}))}); }
      if(value?.getState) { window.officeSceneStore=value; result.push({store: Object.keys(value.getState())}); }
      if(value?.store?.getState) { window.officeSceneStore=value.store; result.push({store: Object.keys(value.store.getState())}); }
      if(value && typeof value==='object' && (value.container || value.scene || value.fiber)) result.push({refKeys:Object.keys(value)});
    }
    walk(fiber.child); walk(fiber.sibling);
  }
  walk(root);
  let ancestor = canvas[key];
  while(ancestor) {walk(ancestor); ancestor=ancestor.return;}
  return {canvasKeys: Object.keys(canvas), matches: result, sockets: window.officeSockets.map(s => ({url:s.url,state:s.readyState}))};
})

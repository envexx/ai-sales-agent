async page => page.evaluate(() => {
  const container=document.querySelector('.living-stage, .preview-stage');
  let fiber=container[Object.keys(container).find(k=>k.startsWith('__reactFiber'))];
  while(fiber){let hook=fiber.memoizedState;for(let i=0;hook&&i<50;i++,hook=hook.next){const value=hook.memoizedState?.current;if(value?.getOfficePreview){window.previewOffice=value;return {agents:value.getOfficePreview(),ready:value.navMesh.isReady(),pois:value.poiManager.getAllPois().map(p=>({id:p.id,position:p.position.toArray()}))};}}fiber=fiber.return;}
  return 'manager not found';
})

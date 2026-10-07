async (page) => {
  await page.waitForTimeout(20000);
  return page.evaluate(() => {
    const c=document.querySelector('canvas');let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber'))];let props;
    while(f){if(f.memoizedProps?.deskAssignmentByDeskUid)props=f.memoizedProps;f=f.return;}
    return {assignments:props?.deskAssignmentByDeskUid,states:window.officeAgentsRef.current.map(a=>({id:a.id,status:a.status,state:a.state,x:a.x,y:a.y,targetX:a.targetX,targetY:a.targetY,facing:a.facing,pathLength:a.path?.length}))};
  });
}

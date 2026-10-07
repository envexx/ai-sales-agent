async page => {
 const p=await page.context().newPage();await p.goto('file:///C:/AI/AI%20Agent%20LangGraph/.playwright-cli/video-glitter.html');
 await p.waitForFunction(()=>document.querySelector('video').readyState>=2);
 await p.setViewportSize({width:1226,height:516});
 for(const [name,time] of [['a',.25],['b',.65],['c',1.25]]){
  await p.evaluate(async time=>{const v=document.querySelector('video');await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=time;});},time);
  await p.screenshot({path:'.playwright-cli/glitter-'+name+'.png'});
 }
 await p.close();return 'Frames extracted';
}

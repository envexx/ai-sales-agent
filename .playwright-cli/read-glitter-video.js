async page => {
 const videoPage=await page.context().newPage();
 await videoPage.goto('file:///C:/AI/AI%20Agent%20LangGraph/.playwright-cli/video-glitter.html');
 await videoPage.waitForFunction(()=>document.querySelector('video').readyState>=2);
 const meta=await videoPage.evaluate(()=>{const v=document.querySelector('video');return {duration:v.duration,width:v.videoWidth,height:v.videoHeight};});
 await videoPage.evaluate(async()=>{
  const v=document.querySelector('video');const canvas=document.createElement('canvas');
  canvas.width=1200;canvas.height=3*360;const ctx=canvas.getContext('2d');
  for(let i=0;i<6;i++){
   const t=v.duration*(i+.2)/6;
   await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=t;});
   const x=(i%2)*600,y=Math.floor(i/2)*360;ctx.drawImage(v,x,y,600,338);ctx.fillStyle='#222';ctx.fillRect(x,y+338,600,22);ctx.fillStyle='#fff';ctx.fillText(t.toFixed(2)+'s',x+8,y+353);
  }
  v.remove();document.body.appendChild(canvas);
 });
 await videoPage.setViewportSize({width:1200,height:1080});
 await videoPage.screenshot({path:'.playwright-cli/video-glitter-frames.png',fullPage:true});
 await videoPage.close();return meta;
}

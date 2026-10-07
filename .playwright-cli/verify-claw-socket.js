async page => {
 return await page.evaluate(async()=>{
  const frames=[];
  const ws=new WebSocket("ws://localhost:3000/api/gateway/ws");
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("timeout")),10000);ws.onmessage=e=>{const frame=JSON.parse(e.data);frames.push(frame.type==="event"?frame.event:frame.payload?.agents?.map(a=>a.name)??frame.error?.message??frame.payload?.runtimeName);if(frame.event==="connect.challenge") ws.send(JSON.stringify({type:"req",id:"connection",method:"connect",params:{}}));if(frame.id==="connection"){ws.send(JSON.stringify({type:"req",id:"roster",method:"agents.list",params:{}}));}if(frame.id==="roster"){clearTimeout(timer);resolve();}};ws.onerror=()=>{clearTimeout(timer);reject(new Error("socketerror"));};});
  ws.close();return {ready:document.readyState,frames};
 });
}


const fs=require('fs');
for(const name of ['desk','computerScreen']) {
 const data=fs.readFileSync('claw3d/public/office-assets/models/furniture/'+name+'.glb');
 const json=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
 console.log(name,JSON.stringify({nodes:json.nodes,positions:json.meshes.map(m=>m.primitives.map(p=>({min:json.accessors[p.attributes.POSITION].min,max:json.accessors[p.attributes.POSITION].max})))}));
}

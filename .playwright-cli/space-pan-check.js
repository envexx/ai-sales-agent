async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const canvas=page.locator('.living-stage canvas');await canvas.focus();
 const read=()=>page.evaluate(()=>({target:window.previewOffice.stage.controls.target.toArray(),camera:window.previewOffice.stage.camera.position.toArray(),left:window.previewOffice.stage.controls.mouseButtons.LEFT,space:document.querySelector('.living-stage canvas').dataset.spacePan}));
 const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
 const drag=async button=>{await page.mouse.move(1050,180);await page.mouse.down({button});await page.mouse.move(1170,230,{steps:12});await page.mouse.up({button});await page.waitForTimeout(3500);};
 await page.evaluate(()=>window.previewOffice.focusPreviewAgent(null));const before=await read();await page.keyboard.down('Space');const held=await read();
 if(held.left!==2||held.space!=='true')throw new Error('Space did not enable pan');
 await drag('left');await page.keyboard.up('Space');const panned=await read();
 if(distance(before.target,panned.target)<.5)throw new Error('Pan did not move target');
 if(panned.left!==0||panned.space)throw new Error('Space release did not restore rotate');
 await page.waitForTimeout(1500);const stable=await read();
 if(distance(stable.target,panned.target)>.1)throw new Error('Pan snapped back');
 await drag('left');const rotated=await read();
 if(distance(rotated.target,stable.target)>.1||distance(rotated.camera,stable.camera)<.5)throw new Error('Normal drag did not rotate');
 await drag('right');const right=await read();
 if(distance(right.target,rotated.target)<.5)throw new Error('Right drag did not pan');
 await page.keyboard.down('Space');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const blurred=await read();await page.keyboard.up('Space');
 if(blurred.left!==0||blurred.space)throw new Error('Blur did not reset Space');
 await page.evaluate(()=>window.previewOffice.focusPreviewAgent(null));
 if(errors.length)throw new Error(errors.join(';'));
 return {spaceDrag:'passed',panPersists:'passed',normalRotation:'passed',rightDrag:'passed',blurReset:'passed',errors};
}



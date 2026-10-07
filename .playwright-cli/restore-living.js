async page => {
 await page.getByRole('button',{name:'Kantor hidup',exact:true}).click();
 const close=page.getByRole('button',{name:'Tutup detail agent',exact:true});
 if(await close.count())await close.click();
 return 'Living mode restored';
}

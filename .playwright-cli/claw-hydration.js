async page => {
 await page.reload();
 await page.getByRole("button",{name:"Collapse building directory"}).click();
 return {collapsed:await page.getByRole("button",{name:"Expand building directory"}).count(), templates:await page.locator("template").count(), body:(await page.locator("body").innerText()).slice(0,600)};
}

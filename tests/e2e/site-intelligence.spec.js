const { test, expect } = require('@playwright/test');

test.describe('Skyline Site Intelligence workspace', () => {
  let savedSite = null;
  let lastAnalysis = null;
  test.beforeEach(async ({ page }) => {
    savedSite = null; lastAnalysis = null;
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      const json = body => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      if(url.pathname==='/api/studio/generate'&&method==='GET')return json({role:'preview',aiInterpretationEnabled:false});
      if(url.pathname==='/api/studio/projects'&&method==='GET')return json({projects:[]});
      if(url.pathname==='/api/studio/site-projects'&&method==='GET'){
        if(url.searchParams.has('id')&&savedSite)return json({siteContext:{id:41,name:'Browser test site',latest_version:1},latestRevision:{version:1,site_context:savedSite,analysis:{summary:{boundaryAreaM2:400},decision:'brief_only',findings:[],disclaimer:'Fixture only.'}},history:[{version:1}]});
        return json({siteContexts:savedSite?[{id:41,name:'Browser test site',latest_version:1}]:[]});
      }
      if(url.pathname==='/api/studio/site-projects'&&method==='POST'){const body=request.postDataJSON();savedSite=body.siteContext;return json({siteContext:{id:41,name:body.name,latest_version:1},analysis:{summary:{boundaryAreaM2:400},decision:'brief_only',findings:[],disclaimer:'Fixture only.'}});}
      if(url.pathname==='/api/studio/site-documents'&&method==='GET')return json({documents:[]});
      if(url.pathname==='/api/studio/site'&&method==='POST'){lastAnalysis=request.postDataJSON();return json({summary:{boundaryAreaM2:400},decision:'brief_only',findings:[{code:'EXCLUSION_ZONE_UNVERIFIED',severity:'warning',message:'Unverified zones are not applied.'}],disclaimer:'Preliminary test response. No approval.'});}
      return json({});
    });
    await page.goto('/studio.html');
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#site-intelligence')).toBeVisible();
  });
  async function clickMap(page,x,y){const canvas=page.locator('#site-canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();await page.mouse.click(box.x+x/1000*box.width,box.y+y/650*box.height);}
  async function drawBoundary(page){await page.selectOption('#site-draw-mode','boundary');for(const [x,y] of [[100,100],[900,100],[900,550],[100,550]])await clickMap(page,x,y);await page.click('#site-finish');await expect(page.locator('#site-drawing-status')).toContainText('Boundary closed');}
  async function drawZone(page,label='Utility corridor'){await page.selectOption('#site-draw-mode','exclusion');await page.fill('#site-zone-label',label);await page.selectOption('#site-zone-type','utility');await page.selectOption('#site-zone-source','survey');await page.selectOption('#site-zone-status','provided');for(const [x,y] of [[320,240],[520,240],[520,390],[320,390]])await clickMap(page,x,y);await page.click('#site-zone-finish');}

  test('draws overlays, edits a polygon vertex and evidence, then removes a zone',async({page})=>{
    const canvas=page.locator('#site-canvas'),blank=await canvas.evaluate(el=>el.toDataURL());
    await drawBoundary(page);await drawZone(page);
    await expect(page.locator('#site-zone-list')).toContainText('Utility corridor');
    await expect(page.locator('#site-zone-list')).toContainText('Visible only · not applied');
    expect(await canvas.evaluate(el=>el.toDataURL())).not.toBe(blank);
    await page.locator('[data-edit-zone="0"]').click();
    await page.selectOption('#site-zone-status','verified');await page.fill('#site-zone-label','Verified corridor');
    await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
    await page.mouse.move(box.x+320/1000*box.width,box.y+240/650*box.height);
    await page.mouse.down();await page.mouse.move(box.x+350/1000*box.width,box.y+260/650*box.height);await page.mouse.up();
    await page.click('#site-zone-finish');
    await expect(page.locator('#site-zone-list')).toContainText('Verified corridor');
    await expect(page.locator('#site-zone-list')).toContainText('Applied to candidate search');
    const zones=JSON.parse(await page.locator('#site-exclusion-zones').inputValue());
    expect(zones[0].vertices[0].x).toBeCloseTo(10.5,1);
    await page.locator('[data-remove-zone="0"]').click();
    await expect(page.locator('#site-zone-list')).toContainText('No exclusion zones recorded');
  });

  test('saves, reloads, exports and reassesses the same site evidence',async({page})=>{
    await drawBoundary(page);await drawZone(page,'Protected tree');
    await page.locator('#site-zone-list [data-edit-zone="0"]').click();
    await page.selectOption('#site-zone-source','professional_observation');await page.selectOption('#site-zone-status','verified');await page.click('#site-zone-finish');
    await page.fill('#site-name','Browser test site');await page.click('#site-save');
    await expect(page.locator('#site-save-status')).toContainText('Saved immutable site revision 1');
    await page.selectOption('#site-saved-select','41');await page.click('#site-load');
    await expect(page.locator('#site-zone-list')).toContainText('Protected tree');
    await expect(page.locator('#site-zone-list')).toContainText('Applied to candidate search');
    const downloadPromise=page.waitForEvent('download');await page.click('#site-export');
    expect((await downloadPromise).suggestedFilename()).toContain('skyline-site-context-v1.json');
    await page.click('#site-analyze');await expect(page.locator('#site-report')).toContainText('PRELIMINARY SITE EVIDENCE REPORT');
    expect(lastAnalysis.siteContext.exclusionZones[0].evidence.status).toBe('verified');
    expect(lastAnalysis.siteContext.exclusionZones[0].evidence.source).toBe('professional_observation');
    await page.locator('[data-edit-zone="0"]').click();await page.selectOption('#site-zone-status','provided');await page.click('#site-zone-finish');
    await expect(page.locator('#site-report')).toContainText('Site details changed');await page.click('#site-analyze');
    expect(lastAnalysis.siteContext.exclusionZones[0].evidence.status).toBe('provided');
  });

  test('imports site-context JSON and renders imported unverified zones',async({page})=>{
    const fixture={siteContext:{boundary:{vertices:[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}],evidence:{source:'owner_input',status:'provided'}},exclusionZones:[{type:'easement',label:'Imported unverified easement',vertices:[{x:4,y:4},{x:8,y:4},{x:8,y:8},{x:4,y:8}],evidence:{source:'owner_input',status:'provided',reference:'Owner sketch'}}]}};
    await page.locator('#site-json').setInputFiles({name:'site-context.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await expect(page.locator('#site-zone-list')).toContainText('Imported unverified easement');
    await expect(page.locator('#site-zone-list')).toContainText('Visible only · not applied');
    await expect(page.locator('#site-drawing-status')).toContainText('Boundary closed');
  });
});

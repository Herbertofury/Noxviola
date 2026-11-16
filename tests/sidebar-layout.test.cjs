'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {sidebarLayout}=require('../browser/sidebar-layout.cjs');
test('rail, panel, vertical tabs and page reserve distinct space on either side',()=>{
 for(const side of ['left','right']){const r=sidebarLayout({width:1200,height:800,chromeHeight:76,verticalTabs:true,visible:true,expanded:true,side,panelWidth:320});assert.equal(r.pageWidth,622);assert.equal(r.panel,320);assert.equal(r.rail,48);assert.equal(r.contentHeight,724);if(side==='left'){assert.equal(r.railX,0);assert.equal(r.panelX,48);assert.equal(r.tabX,368);assert.equal(r.pageX,578);}else{assert.equal(r.tabX,0);assert.equal(r.pageX,210);assert.equal(r.panelX,832);assert.equal(r.railX,1152);assert.equal(r.pageRight,368);}}
});
test('narrow windows fit the panel and animation can reverse without negative page bounds',()=>{
 const base={width:700,height:500,chromeHeight:40,verticalTabs:true,visible:true,expanded:true,side:'left',panelWidth:600};const full=sidebarLayout(base),half=sidebarLayout({...base,progress:.5}),closed=sidebarLayout({...base,progress:0});assert.equal(full.panel,202);assert.equal(full.pageWidth,240);assert.equal(half.panel,101);assert.equal(closed.panel,0);assert.equal(sidebarLayout({...base,visible:false}).rail,0);
});

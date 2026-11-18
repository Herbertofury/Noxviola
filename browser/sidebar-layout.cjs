'use strict';
// All measurements are device-independent pixels. The side panel and vertical
// tabs each reserve their own space so they cannot overlap one another or a
// split page. The panel shrinks only to fit the actual window.
function sidebarLayout({width,height,chromeHeight,verticalTabs,visible,expanded,side,panelWidth,progress=1,railProgress=0,takeover=false}) {
  width=Math.max(0,Math.floor(width));height=Math.max(0,Math.floor(height));chromeHeight=Math.max(0,Math.min(height,Math.floor(chromeHeight)));
  const tabs=verticalTabs?210:0, wideRail=Math.min(200,Math.max(48,width-tabs-240));
  const rail=visible?Math.round(48+(wideRail-48)*Math.max(0,Math.min(1,railProgress))):0;
  const available=Math.max(0,width-rail-tabs-(takeover?0:240));
  const desired=visible&&expanded?(takeover?available:Math.min(Math.max(0,panelWidth),available)):0;
  const panel=Math.round(desired*Math.max(0,Math.min(1,progress))),leftSide=side!=='right';
  const sideWidth=rail+panel,tabX=leftSide?sideWidth:0;
  const pageX=tabX+tabs,pageRight=leftSide?0:sideWidth,pageWidth=Math.max(0,width-pageX-pageRight);
  return {rail,panel,panelTarget:desired,sideWidth,tabX,pageX,pageRight,pageWidth,contentHeight:height-chromeHeight,
    railX:leftSide?0:width-rail,panelX:leftSide?rail:width-rail-panel};
}
module.exports={sidebarLayout};

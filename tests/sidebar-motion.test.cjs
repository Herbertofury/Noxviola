'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {sidebarEase,sidebarDuration}=require('../browser/sidebar-motion.cjs');
test('sidebar easing follows the reference curve, is monotonic, and reaches its endpoints',()=>{
 for(const [input,expected] of [[0,0],[0.1,0.15625],[0.25,0.60722],[0.5,0.877834],[0.75,0.97548],[1,1]])assert.ok(Math.abs(sidebarEase(input)-expected)<0.00002);
 let previous=0;for(let i=1;i<=100;i++){const value=sidebarEase(i/100);assert.ok(value>=previous&&value<=1);previous=value;}
});
test('open and close timings scale with interrupted progress and reduced motion',()=>{
 assert.equal(sidebarDuration(0,1,230,190),230);assert.equal(sidebarDuration(1,0,230,190),190);assert.equal(sidebarDuration(0.5,1,230,190),115);assert.equal(sidebarDuration(1,0,230,190,true),0);
});

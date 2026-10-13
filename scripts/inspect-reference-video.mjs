import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from '@playwright/test';
const file=process.argv[2],out=new URL('../../video-frames/',import.meta.url);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.setContent('<video muted style="width:100%;height:100%;object-fit:contain"></video>');
await page.evaluate(src=>new Promise((resolve,reject)=>{const v=document.querySelector('video');v.onloadedmetadata=()=>resolve();v.onerror=()=>reject(Error('Video decode failed'));v.src=src;}),'data:video/mp4;base64,'+readFileSync(file).toString('base64'));
const meta=await page.evaluate(()=>{const v=document.querySelector('video');return {duration:v.duration,width:v.videoWidth,height:v.videoHeight}});console.log(meta);
for(const [i,t] of [0.1,meta.duration*.25,meta.duration*.5,meta.duration*.75,meta.duration-.2].entries()){await page.evaluate(t=>new Promise(resolve=>{const v=document.querySelector('video');v.onseeked=()=>resolve();v.currentTime=t}),t);await page.locator('video').screenshot({path:new URL(`frame-${i}.png`,out).pathname.replace(/^\/(.:)/,'$1').replaceAll('%20',' ')});}
}finally{await browser.close()}

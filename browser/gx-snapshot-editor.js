'use strict';

window.createSnapshotEditor=(api,report)=>{
  const canvas=document.getElementById('snapshot-canvas'),pick=document.getElementById('snapshot-stickers'),
    save=document.getElementById('snapshot-save'),undo=document.getElementById('snapshot-undo');
  let model=null,drag=null;
  function draw(){
    if(!model?.background)return;
    const context=canvas.getContext('2d');
    context.drawImage(model.background,0,0);
    for(const item of model.stickers)context.drawImage(item.image,item.x,item.y,item.width,item.height);
    undo.disabled=model.stickers.length===0;
  }
  async function load(url){
    const image=new Image();
    if(url.startsWith('nox-mod:'))image.crossOrigin='anonymous';
    image.src=url;await image.decode();return image;
  }
  async function open(data){
    const view={id:data.id,stickers:[],background:null};
    model=view;drag=null;save.disabled=true;undo.disabled=true;pick.replaceChildren();
    try{
      view.background=await load(data.image);
      if(model!==view)return;
      canvas.width=view.background.naturalWidth;canvas.height=view.background.naturalHeight;
      draw();save.disabled=false;
      data.stickers.forEach((url,index)=>{
        const button=document.createElement('button'),preview=document.createElement('img');
        button.type='button';button.setAttribute('aria-label',`Place sticker ${index+1}`);preview.alt='';preview.src=url;button.append(preview);pick.append(button);
        button.onclick=async()=>{
          try{
            const image=await load(url);
            if(model!==view)return;
            const factor=Math.min(canvas.width*.23/image.naturalWidth,canvas.height*.23/image.naturalHeight);
            const width=image.naturalWidth*factor,height=image.naturalHeight*factor;
            view.stickers.push({image,width,height,x:(canvas.width-width)/2,y:(canvas.height-height)/2});draw();
          }catch(error){report(error.message);}
        };
      });
    }catch(error){if(model===view)report(error.message);}
  }
  function point(event){
    const box=canvas.getBoundingClientRect();
    return {x:(event.clientX-box.left)*canvas.width/box.width,y:(event.clientY-box.top)*canvas.height/box.height};
  }
  canvas.onpointerdown=event=>{
    if(!model||event.button!==0)return;
    const {x,y}=point(event),item=model.stickers.findLast(sticker=>x>=sticker.x&&x<=sticker.x+sticker.width&&y>=sticker.y&&y<=sticker.y+sticker.height);
    if(item){drag={item,dx:x-item.x,dy:y-item.y};canvas.setPointerCapture(event.pointerId);}
  };
  canvas.onpointermove=event=>{
    if(!drag)return;
    const {x,y}=point(event),{item,dx,dy}=drag;
    item.x=Math.max(0,Math.min(canvas.width-item.width,x-dx));
    item.y=Math.max(0,Math.min(canvas.height-item.height,y-dy));
    draw();
  };
  canvas.onlostpointercapture=()=>{drag=null;};
  undo.onclick=()=>{model?.stickers.pop();draw();};
  save.onclick=async()=>{
    if(!model||save.disabled)return;
    save.disabled=true;
    try{await api.command('snapshot-save',{id:model.id,image:canvas.toDataURL('image/png')});}
    catch(error){report(error.message);}
    finally{save.disabled=!model;}
  };
  function clear(){
    model=null;drag=null;pick.replaceChildren();canvas.width=0;canvas.height=0;save.disabled=true;undo.disabled=true;
  }
  api.onSnapshotEditor?.(data=>void open(data));
  return {clear};
};

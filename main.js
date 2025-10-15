import * as faceapi from 'face-api.js';

const qs = (s)=>document.querySelector(s);
const fileEl = qs('#file');
const stage = qs('#stage');
const ctx = stage.getContext('2d');

const presetEl = qs('#preset');
const autocropBtn = qs('#autocropBtn');
const bgBtn = qs('#bgBtn');

const enableAttire = qs('#enableAttire');
const shirtStyle = qs('#shirtStyle');
const shirtColor = qs('#shirtColor');
const tieStyle = qs('#tieStyle');
const tieColor = qs('#tieColor');
const applyAttire = qs('#applyAttire');
const clearAttire = qs('#clearAttire');

const exportSingle = qs('#exportSingle');
const exportSheet = qs('#exportSheet');

let imgBitmap = null;
let detection = null;
let attireState = {enabled:false, shirt:{style:'oxford', color:'#ffffff'}, tie:{style:'none', color:'#0b2a6f'}};

const shirts = [
  {name: 'Oxford', file: 'shirt_oxford.png', style: 'oxford'},
  {name: 'Point Collar', file: 'shirt_point.png', style: 'point'},
  {name: 'Mandarin', file: 'shirt_mandarin.png', style: 'mandarin'}
];

const ties = [
  {name: 'None', file: 'tie_none.png', style: 'none'},
  {name: 'Regular', file: 'tie_regular.png', style: 'regular'},
  {name: 'Slim', file: 'tie_slim.png', style: 'slim'},
  {name: 'Bow', file: 'tie_bow.png', style: 'bow'}
];

const shirtGallery = document.getElementById('shirtGallery');
const tieGallery = document.getElementById('tieGallery');

function createGallery(galleryEl, items, selectCallback) {
  galleryEl.innerHTML = '';
  items.forEach(item => {
    const img = document.createElement('img');
    img.src = item.file;
    img.alt = item.name;
    img.title = item.name;
    img.width = 80;
    img.height = 80;
    img.style.cursor = 'pointer';
    img.style.border = '2px solid transparent';
    img.style.borderRadius = '8px';
    img.style.objectFit = 'contain';
    img.addEventListener('click', () => {
      selectCallback(item.style);
      highlightSelected();
    });

    galleryEl.appendChild(img);

    function highlightSelected() {
      Array.from(galleryEl.children).forEach(child => {
        child.style.border = '2px solid transparent';
      });
      img.style.border = '2px solid #2f80ed';
    }
  });
}

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('https://unpkg.com/face-api.js/weights/'),
  faceapi.nets.faceLandmark68Net.loadFromUri('https://unpkg.com/face-api.js/weights/')
]).then(() => {

  // Initialize galleries and selection highlight after window load
  window.addEventListener('load', () => {
    createGallery(shirtGallery, shirts, (style) => {
      shirtStyle.value = style;
      redrawAttire();
    });

    createGallery(tieGallery, ties, (style) => {
      tieStyle.value = style;
      redrawAttire();
    });

    // Highlight selected on initial load
    setTimeout(() => {
      Array.from(shirtGallery.children).forEach(child => {
        if(child.alt.toLowerCase() === shirtStyle.value) child.style.border = '2px solid #2f80ed';
      });
      Array.from(tieGallery.children).forEach(child => {
        if(child.alt.toLowerCase() === tieStyle.value) child.style.border = '2px solid #2f80ed';
      });
    }, 100);
  });

  fileEl.addEventListener('change', async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    imgBitmap = await createImageBitmap(file);
    drawFit(imgBitmap);
    [autocropBtn,bgBtn,applyAttire,clearAttire,exportSingle,exportSheet].forEach(b=>b.disabled=false);
  });

  autocropBtn.addEventListener('click', autoDetectAndCrop);
  bgBtn.addEventListener('click', setWhiteBackground);
  enableAttire.addEventListener('change', (e)=>{ attireState.enabled = e.target.checked; redrawAttire(); });
  shirtStyle.addEventListener('change', (e)=>{ attireState.shirt.style = e.target.value; redrawAttire(); });
  shirtColor.addEventListener('input', (e)=>{ attireState.shirt.color = e.target.value; redrawAttire(); });
  tieStyle.addEventListener('change', (e)=>{ attireState.tie.style = e.target.value; redrawAttire(); });
  tieColor.addEventListener('input', (e)=>{ attireState.tie.color = e.target.value; redrawAttire(); });
  applyAttire.addEventListener('click', redrawAttire);
  clearAttire.addEventListener('click', ()=>{
    attireState.enabled=false; enableAttire.checked=false; drawFit(imgBitmap);
  });

  exportSingle.addEventListener('click', ()=>exportPNG('single'));
  exportSheet.addEventListener('click', ()=>exportPNG('sheet'));

});

// DRAWING AND EVENT HANDLING FUNCTIONS:

function drawFit(bitmap){
  const w = bitmap.width, h = bitmap.height;
  stage.width = Math.min(1200, w);
  stage.height = Math.min(1600, Math.round(stage.width * (h/w)));
  ctx.clearRect(0,0,stage.width,stage.height);
  ctx.drawImage(bitmap, 0, 0, stage.width, stage.height);
}

function mmToPx(mm, dpi=300){
  const inches = mm/25.4;
  return Math.round(inches * dpi);
}

async function autoDetectAndCrop(){
  if(!imgBitmap) return;
  const temp = document.createElement('canvas');
  temp.width = imgBitmap.width;
  temp.height = imgBitmap.height;
  const tctx = temp.getContext('2d');
  tctx.drawImage(imgBitmap, 0, 0);
  const det = await faceapi.detectSingleFace(temp, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
  if(!det) { alert('Face not found. Use a front-facing photo.'); return; }
  detection = det;

  const preset = presetEl.value;
  const aspect = (preset==='35x45') ? (35/45) : 1;

  const box = det.detection.box;
  const headCx = box.x + box.width/2;
  const headCy = box.y + box.height/2;
  const headH = box.height;

  const targetH = headH / 0.70;
  const cropH = Math.max(targetH, box.height * 1.35);
  const cropW = cropH * aspect;

  let x = Math.round(headCx - cropW/2);
  let y = Math.round(headCy - cropH*0.55);
  if(x<0) x=0;
  if(y<0) y=0;
  if(x+cropW>temp.width) x = temp.width - cropW;
  if(y+cropH>temp.height) y = temp.height - cropH;

  const workW = 900;
  const workH = Math.round(workW / aspect);
  stage.width = workW;
  stage.height = workH;
  ctx.clearRect(0,0,workW,workH);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(temp, x, y, cropW, cropH, 0, 0, workW, workH);

  redrawAttire();
}

function setWhiteBackground(){
  const imgData = ctx.getImageData(0,0,stage.width, stage.height);
  const d = imgData.data;
  for(let i=0;i<d.length;i+=4){
    const maxc = Math.max(d[i], d[i+1], d[i+2]);
    const lift = Math.min(255, (d[i]+d[i+1]+d[i+2])/3 * 1.15 + 25);
    d[i]=d[i+1]=d[i+2]= maxc>240 ? 255 : lift;
  }
  ctx.putImageData(imgData,0,0);
}

function redrawAttire(){
  if(!attireState.enabled || !detection) return;
  const lm = detection.landmarks;
  const jaw = lm.getJawOutline();
  const leftShoulderX = jaw[3].x;
  const rightShoulderX = jaw[13].x;
  const chin = jaw[8];

  const scaleX = stage.width / (imgBitmap ? imgBitmap.width : stage.width);
  const scaleY = stage.height / (imgBitmap ? imgBitmap.height : stage.height);

  const widthPx = Math.abs(rightShoulderX - leftShoulderX) * scaleX;
  const centerX = (leftShoulderX + rightShoulderX)/2 * scaleX;
  const topY = chin.y * scaleY;

  drawShirt(centerX, topY, widthPx*1.6, attireState.shirt);
  drawTie(centerX, topY, widthPx*0.5, attireState.tie);
}

function drawShirt(cx, topY, w, shirt){
  const h = w*0.9;
  const c = stage.getContext('2d');
  c.save();
  c.translate(cx, topY+10);
  c.fillStyle = shirt.color;
  roundRect(c, -w/2, 0, w, h, 16);
  c.fill();
  c.fillStyle = shade(shirt.color, -15);
  if(shirt.style==='oxford' || shirt.style==='point'){
    c.beginPath();
    c.moveTo(-w*0.22, 0);
    c.lineTo(-w*0.02, -w*0.16);
    c.lineTo(w*0.02, -w*0.16);
    c.lineTo(w*0.22, 0);
    c.closePath();
    c.fill();
  }else if(shirt.style==='mandarin'){
    roundRect(c, -w*0.25, -w*0.14, w*0.5, w*0.12, 8);
    c.fill();
  }
  c.restore();
}

function drawTie(cx, topY, w, tie){
  if(tie.style==='none') return;
  const c = stage.getContext('2d');
  c.save();
  c.translate(cx, topY-6);
  c.fillStyle = tie.color;
  if(tie.style==='bow'){
    roundRect(c, -w*0.25, -w*0.05, w*0.5, w*0.1, 4);
    roundRect(c, -w*0.6, -w*0.15, w*0.35, w*0.3, 8);
    roundRect(c,  w*0.25, -w*0.15, w*0.35, w*0.3, 8);
  }else{
    roundRect(c, -w*0.12, -w*0.08, w*0.24, w*0.18, 6);
    roundRect(c, -w*0.13,  w*0.08, w*0.26, w*0.95, 10);
  }
  c.fill();
  c.restore();
}

function roundRect(c, x, y, w, h, r){
  c.beginPath();
  c.moveTo(x+r,y);
  c.arcTo(x+w,y,x+w,y+h,r);
  c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r);
  c.arcTo(x,y,x+w,y,r);
  c.closePath();
}

function shade(hex, amt){
  let c = hex.replace('#','');
  if(c.length===3){ c = c.split('').map(ch=>ch+ch).join(''); }
  const num = parseInt(c, 16);
  let r = (num>>16)+amt, g = ((num>>8)&0xff)+amt, b = (num&0xff)+amt;
  r=Math.max(0,Math.min(255,r)); g=Math.max(0,Math.min(255,g)); b=Math.max(0,Math.min(255,b));
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}

function exportPNG(target='single'){
  const dpi = 300;
  const p = presetEl.value;
  let pxW=0, pxH=0;
  if(p==='35x45'){ pxW = mmToPx(35,dpi); pxH = mmToPx(45,dpi); }
  else if(p==='2x2'){ pxW = Math.round(2*dpi); pxH = Math.round(2*dpi); }
  else { pxW = mmToPx(51,dpi); pxH = mmToPx(51,dpi); }

  const out = document.createElement('canvas');
  out.width = pxW; out.height = pxH;
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality='high';
  octx.fillStyle = '#ffffff';
  octx.fillRect(0,0,out.width,out.height);
  octx.drawImage(stage, 0, 0, out.width, out.height);

  if(target==='single'){
    const link = document.createElement('a');
    link.download = `passport_${p}_300dpi.png`;
    link.href = out.toDataURL('image/png');
    link.click();
  }else{
    const sheet = document.createElement('canvas');
    sheet.width = 1200; sheet.height = 1800; // 4x6 at 300 DPI
    const sctx = sheet.getContext('2d');
    sctx.fillStyle = '#ffffff'; sctx.fillRect(0,0,sheet.width,sheet.height);

    const margin = 40, gap = 30, cols = 2, rows = 3;
    const cellW = (sheet.width - margin*2 - gap*(cols-1))/cols;
    const cellH = (sheet.height - margin*2 - gap*(rows-1))/rows;
    const drawW = pxW, drawH = pxH;
    const offsetX = margin + (cellW - drawW)/2;
    const offsetY = margin + (cellH - drawH)/2;

    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const x = offsetX + c*(cellW+gap);
        const y = offsetY + r*(cellH+gap);
        sctx.drawImage(out, x, y, drawW, drawH);
      }
    }

    const link = document.createElement('a');
    link.download = `sheet_4x6_${p}_300dpi.png`;
    link.href = sheet.toDataURL('image/png');
    link.click();
  }
}

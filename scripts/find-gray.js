function srgbToLinear(c) {
  c = c / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function lum(rgb){ const [r,g,b]=rgb; return 0.2126*srgbToLinear(r)+0.7152*srgbToLinear(g)+0.0722*srgbToLinear(b); }
function contrastHex(hex1,hex2){
  const a = hexToRgb(hex1); const b = hexToRgb(hex2);
  const L1 = lum(a); const L2 = lum(b); const hi=Math.max(L1,L2), lo=Math.min(L1,L2); return (hi+0.05)/(lo+0.05);
}
function hexFromVal(v){ const s=v.toString(16).padStart(2,'0'); return `#${s}${s}${s}`; }
function hexToRgb(hex){ hex=hex.replace('#',''); const num=parseInt(hex,16); return [(num>>16)&255,(num>>8)&255,num&255]; }

function findForBackground(bgHex, target){
  // if background is light (white), prefer darker grays (search descending).
  if (bgHex.toLowerCase() === '#ffffff') {
    for(let v=255; v>=0; v--){ const h = hexFromVal(v); const r = contrastHex(h,bgHex); if(r>=target) return {val:v,hex:h,ratio:r.toFixed(2)}; }
  } else {
    // for dark background (black), prefer lighter grays (search ascending)
    for(let v=0; v<=255; v++){ const h = hexFromVal(v); const r = contrastHex(h,bgHex); if(r>=target) return {val:v,hex:h,ratio:r.toFixed(2)}; }
  }
  return null;
}
console.log('For white background (#ffffff):');
console.log('  >=3:', findForBackground('#ffffff',3));
console.log('  >=4.5:', findForBackground('#ffffff',4.5));
console.log('For black background (#000000):');
console.log('  >=3:', findForBackground('#000000',3));
console.log('  >=4.5:', findForBackground('#000000',4.5));

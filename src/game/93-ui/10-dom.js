/* ================= DOM RENDER ================= */
const $=id=>document.getElementById(id);
const btn=(label,act,args={},cls='',dis=false,title='')=>`<button class="b ${cls}" data-act="${act}" data-args="${esc(JSON.stringify(args))}"${dis?' disabled':''}${title?` title="${esc(title)}"`:''}>${label}</button>`;
const logo=n=>`<span class="logo" style="--c:${n.col}">${initials(n)}</span>`;
const barCls=u=>u>=0.9?'bad':u>=0.65?'warn':'';
/* Panels are rebuilt from state every tick. Replacing a thousand rows makes the browser style and lay out every one
   of them again, so patch what changed instead: same HTML, far less work. A button that now does something else, and
   any form field that changed, is swapped out whole, so a tap that started on the old one still cannot fire it (#44). */
const SWAP={INPUT:1,SELECT:1,TEXTAREA:1,OPTION:1};
function morph(el,html){const t=document.createElement(el.tagName);t.innerHTML=html;morphKids(el,t);}
function sameNode(x,y){if(x.nodeType!==y.nodeType||x.nodeName!==y.nodeName)return false;if(x.nodeType!==1)return true;
  if(SWAP[x.nodeName])return x.outerHTML===y.outerHTML;
  return x.getAttribute('data-act')===y.getAttribute('data-act')&&x.getAttribute('data-args')===y.getAttribute('data-args');}
function morphKids(a,b){let x=a.firstChild,y=b.firstChild;
  while(y){const ny=y.nextSibling;
    if(!x)a.appendChild(y);
    else if(!sameNode(x,y)){a.replaceChild(y,x);x=y;}
    else if(x.nodeType===1){if(!SWAP[x.nodeName]){const ya=y.attributes,xa=x.attributes;
        for(let i=0;i<ya.length;i++){const {name,value}=ya[i];if(x.getAttribute(name)!==value)x.setAttribute(name,value);}
        for(let i=xa.length-1;i>=0;i--)if(!y.hasAttribute(xa[i].name))x.removeAttribute(xa[i].name);
        morphKids(x,y);}}
    else if(x.nodeValue!==y.nodeValue)x.nodeValue=y.nodeValue;
    x=x&&x.nextSibling;y=ny;}
  while(x){const nx=x.nextSibling;a.removeChild(x);x=nx;}}
function renderAll(){if(isTablet()&&!UI.sel)UI.leftOpen=false;renderHUD();renderLeft();renderPanel();renderHint();renderMega();renderCoach();pzRender();}
function renderMega(){const el=$('mega');if(!el)return;const on=!!(S&&S.ev&&S.ev.php>S.day);if(el.hidden===!on)return;el.hidden=!on;}


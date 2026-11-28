/*!
 * PageGlass 1.0.3 — Liquid Glass look for the Vivaldi browser UI.
 * https://github.com/halykoss/PageGlass · MIT License
 *
 * Runs inside Vivaldi's own window (window.html). It captures the visible tab
 * locally, in memory only, and projects it under the toolbars as frosted and
 * glossy glass. Nothing is written to disk or sent over the network.
 */
(() => {
  'use strict';
  if(window.__pageGlass)return;
  const VERSION='1.0.3';
  const STORE='pageglass.enabled';
  const T={off:'off',on:n=>`on · ${n} captures`,paused:'paused on this page',noimg:'no image',toggle:'click to turn on/off'};
  const api=globalThis.chrome||globalThis.browser;
  const pg=window.__pageGlass={version:VERSION,enabled:true,frames:0,busy:false,lastTab:null,epoch:0,scrolling:false};
  const channel='pageglass-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const layers=new Map();
  const STRIP_GAP=4; // strip panes are inset; their element edge is what touches the page
  const MIRROR=.45; // horizontal compression of the reflected page inside narrow strips
  const INSET=4; // gap between window edge and the floating sidebar card (same as strips)
  let button,windowId,timer,observer,raf=0,position=0,capturedPosition=0,attachedTab=null,attachEpoch=0;
  let lastCapture=0,pending=false,resizeTimer,lastFrame=null;
  const interval=()=>pg.backend==='tabs'?550:70;
  const surfaces=()=>[...document.querySelectorAll('#browser .mainbar,#browser .tabbar-wrapper,#browser #header,#browser #panels-container')].filter(el=>{const r=el.getBoundingClientRect();return r.width>10&&r.height>10&&getComputedStyle(el).display!=='none';}).filter((el,_,all)=>!all.some(o=>o!==el&&o.contains(el)));
  function call(object,method,...args){return new Promise((resolve,reject)=>{
    let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timeout);const error=api.runtime?.lastError;error?reject(new Error(error.message)):resolve(value);};
    const timeout=setTimeout(()=>{if(!done){done=true;reject(new Error(method+' timeout'));}},4000);
    try{const value=object[method](...args,finish);if(value?.then)value.then(finish,e=>{if(!done){done=true;clearTimeout(timeout);reject(e);}});}catch(e){done=true;clearTimeout(timeout);reject(e);}
  });}
  function status(message=''){
    pg.error=message;
    if(!button)return;
    const text='PageGlass: '+(!pg.enabled?T.off:message||T.on(pg.frames));
    button.title=text+' · '+T.toggle;button.setAttribute('aria-label',text);button.setAttribute('aria-pressed',String(pg.enabled));
  }
  function schedule(delay=0){if(!pg.enabled)return;if(pg.busy){pending=true;return;}if(timer)return;timer=setTimeout(()=>{timer=0;frame();},Math.max(delay,interval()-(performance.now()-lastCapture)));}
  function clear(){
    pg.epoch++;pending=false;lastFrame=null;cancelAnimationFrame(raf);raf=0;
    for(const [el,layer]of layers){layer.remove();el.classList.remove('pg-surface','pg-pos','pg-strip','pg-card','pg-icons');delete el.__pgWant;}layers.clear();classWatch.disconnect();
  }
  // Group adjacent real buttons into shared glass capsules (Safari 26 style).
  // Spacers, dividers and hidden slots are also `.button-toolbar > button` in
  // Vivaldi: they never get glass, and they split capsules like a gap would.
  const RUN=['pg-run','pg-run-start','pg-run-end'];
  const SPACER='.toolbar-spacer,.toolbar-spacer-flexible,.toolbar-spacer-panel,.toolbar-divider';
  const real=item=>{
    if(!item||!item.classList?.contains('button-toolbar')||item.matches(SPACER))return false;
    const b=item.querySelector(':scope>button');
    if(!b||b.offsetWidth<8||b.offsetHeight<8)return false;
    return !!b.querySelector('svg,img,.button-icon')||!!b.textContent.trim();
  };
  // Vivaldi tags toolbar buttons with a language-independent data-name.
  const role=item=>item?.querySelector(':scope>button')?.getAttribute('data-name')||'';
  const SOLO=/^(Reload|Stop)$/, NAV=/^(Back|Forward)$/;
  // May two neighbouring buttons share one capsule?
  //  - Reload/Stop always stands alone (its own circle).
  //  - Back and Forward pair up only with each other, and only while both are available;
  //    if either is disabled they become two separate circles.
  //  - Other adjacent buttons merge as before.
  const linked=(a,b)=>{
    if(!real(a)||!real(b))return false;
    const ra=role(a),rb=role(b);
    if(SOLO.test(ra)||SOLO.test(rb))return false;
    if(NAV.test(ra)||NAV.test(rb))return NAV.test(ra)&&NAV.test(rb)&&!a.querySelector(':scope>button').disabled&&!b.querySelector(':scope>button').disabled;
    return true;
  };
  function capsules(){
    for(const el of document.querySelectorAll('.pg-run'))el.classList.remove(...RUN);
    for(const bar of document.querySelectorAll('#browser .toolbar-mainbar')){
      for(const item of bar.querySelectorAll('.button-toolbar')){
        if(item.closest('.toolbar-extensions,.toolbar-insideinput,.UrlBar,.UrlBar-AddressField')||!real(item))continue;
        // Inside a .toolbar-group the run may continue into the neighbouring group.
        const prev=item.previousElementSibling,next=item.nextElementSibling;
        item.classList.add('pg-run');
        if(!linked(prev,item))item.classList.add('pg-run-start');
        if(!linked(item,next))item.classList.add('pg-run-end');
      }
    }
  }
  let mountRaf=0;
  const scheduleMount=()=>{if(!mountRaf)mountRaf=requestAnimationFrame(()=>{mountRaf=0;mount();});};
  function mount(){
    capsules();
    // Vivaldi sometimes replaces a toolbar element outright (React re-render). Re-dress the new one
    // straight away from the last capture instead of leaving it bare until the next capture.
    if(pg.enabled&&lastFrame&&!pg.busy){
      const now=surfaces();
      if(now.some(el=>!layers.has(el))||[...layers.keys()].some(el=>!el.isConnected))paint(lastFrame.image,now,lastFrame.atPosition);
    }
    const bar=document.querySelector('.toolbar-mainbar');
    if(!bar||document.getElementById('pageglass-toggle'))return;
    const holder=document.createElement('div');holder.className='button-toolbar';holder.id='pageglass-toggle';
    button=document.createElement('button');button.type='button';button.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 14c1-5 4-6 8-5M8 17l8-10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    button.onclick=()=>{pg.enabled=!pg.enabled;try{api?.storage?.local?.set({[STORE]:pg.enabled});}catch{}clear();status();if(pg.enabled)refresh();};holder.append(button);bar.append(holder);status();
  }
  const css=document.createElement('style');css.id='pageglass-style';css.textContent=`
    /* ── Palette (light default, dark follows macOS). Liquid Glass: clear and neutral; colour comes
       from the content behind, light comes from a thin rim, depth from wide soft shadows. ── */
    #browser .pg-surface{
      --pg-ink:#1d1d1f;--pg-tint:rgba(250,250,252,.44);--pg-bar-tint:rgba(250,250,252,.36);--pg-sheen:rgba(255,255,255,.10);
      --pg-rim:rgba(255,255,255,.78);--pg-rim-soft:rgba(255,255,255,.30);--pg-line:rgba(0,0,0,.06);
      --pg-glass:rgba(255,255,255,.20);--pg-glass-hi:rgba(255,255,255,.34);--pg-spec:rgba(255,255,255,.38);
      --pg-hover:rgba(255,255,255,.38);--pg-press:rgba(255,255,255,.55);--pg-shadow:rgba(0,0,0,.14);--pg-ring:rgba(255,255,255,.45);
      --pg-float:0 8px 22px -10px var(--pg-shadow),0 1px 3px -1px rgba(0,0,0,.08);
      --pg-accent:#0a84ff;--pg-fallback:#eeeef1;--pg-card:rgba(248,248,250,.94);--pg-strip-hi:rgba(255,255,255,.40);--pg-strip-tint:rgba(250,250,252,.44);--pg-strip-lo:rgba(255,255,255,.22);
    }
    @media(prefers-color-scheme:dark){#browser .pg-surface{
      --pg-ink:#f5f5f7;--pg-tint:rgba(26,26,30,.52);--pg-bar-tint:rgba(20,20,24,.52);--pg-sheen:rgba(255,255,255,.04);
      --pg-rim:rgba(255,255,255,.32);--pg-rim-soft:rgba(255,255,255,.10);--pg-line:rgba(0,0,0,.22);
      --pg-glass:rgba(255,255,255,.05);--pg-glass-hi:rgba(255,255,255,.11);--pg-spec:rgba(255,255,255,.14);
      --pg-hover:rgba(255,255,255,.10);--pg-press:rgba(255,255,255,.18);--pg-shadow:rgba(0,0,0,.42);--pg-ring:rgba(255,255,255,.12);
      --pg-card:rgba(40,40,46,.92);--pg-fallback:#2c2c31;--pg-strip-hi:rgba(255,255,255,.07);--pg-strip-tint:rgba(26,26,30,.44);--pg-strip-lo:rgba(255,255,255,.03);
    }}

    /* ── Bar material: projected page, blurred and saturated, low tint, bright rim. ── */
    #browser .pg-surface.pg-pos{position:relative;}
    #browser .pg-surface:not(.pg-strip){background:transparent!important;}
    #browser .pg-surface{isolation:isolate;color:var(--pg-ink)!important;backdrop-filter:none!important;box-shadow:none!important;}
    #browser .pg-material{position:absolute;inset:0;z-index:-1;overflow:hidden;border-radius:inherit;pointer-events:none;contain:strict;background:var(--pg-fallback);}
    #browser .pg-material img{position:absolute;max-width:none!important;max-height:none!important;pointer-events:none;will-change:transform;}
    #browser .pg-material[data-mirror] .pg-base{filter:blur(5px) saturate(1.15)!important;}
    #browser .pg-material:is([data-mirror="left"],[data-mirror="right"])>.pg-refract{opacity:.5;}
    #browser .pg-material:is([data-mirror="top"],[data-mirror="below"]) .pg-base{filter:blur(14px) saturate(1.4) brightness(1.03)!important;}
    #browser .pg-reflect{display:none;position:absolute;inset:0;overflow:hidden;opacity:.42;-webkit-mask:linear-gradient(to top,#000,rgba(0,0,0,.35) 55%,transparent);mask:linear-gradient(to top,#000,rgba(0,0,0,.35) 55%,transparent);}
    #browser .pg-material:is([data-mirror="top"],[data-mirror="below"])>.pg-reflect{display:block;}
    /* Bottom address bar: the reflection is strongest at its top edge, where it meets the page. */
    #browser .pg-material[data-mirror="below"]>.pg-reflect{-webkit-mask:linear-gradient(to bottom,#000,rgba(0,0,0,.35) 55%,transparent);mask:linear-gradient(to bottom,#000,rgba(0,0,0,.35) 55%,transparent);}
    #browser .pg-reflect img{position:absolute;filter:blur(3px) saturate(1.3);}
    #browser .pg-material .pg-base{filter:blur(14px) saturate(1.4) brightness(1.03);}
    #browser .pg-refract{position:absolute;inset:0;overflow:hidden;}
    #browser .pg-material::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,var(--pg-sheen),transparent 40%),linear-gradient(var(--pg-tint),var(--pg-tint));box-shadow:inset 0 .5px 0 var(--pg-rim-soft);}
    /* The bar is the content seen through clear glass: gentle blur, vivid colour, a whisper of tint.
       No highlight band and no rim: the controls floating on it carry the light. */
    #browser .pg-material[data-kind="bar"] .pg-base{filter:blur(10px) saturate(1.45) brightness(1.03)!important;}
    @media(prefers-color-scheme:dark){#browser .pg-material[data-kind="bar"] .pg-base{filter:blur(10px) saturate(1.15) brightness(.92)!important;}}
    #browser .pg-material[data-kind="bar"]::after{background:linear-gradient(var(--pg-bar-tint),var(--pg-bar-tint));box-shadow:none;}
    #browser .pg-material[data-kind="bar"]>.pg-reflect{opacity:.3;}
    #browser .pg-surface .toolbar-mainbar,#browser .pg-surface #tabs-tabbar-container,#browser .pg-surface #tabs-container{background:transparent!important;backdrop-filter:none!important;}
    /* Taller bar so the 32px capsules float with ~4px of glass around them instead of touching the edges. */
    #browser .mainbar.pg-surface,#browser .pg-surface .mainbar{height:auto!important;min-height:40px!important;}
    #browser .pg-surface .toolbar-mainbar{height:40px!important;min-height:40px!important;align-items:center!important;overflow:visible!important;}
    #browser .pg-surface .UrlBar-AddressField,#browser .pg-surface .UrlBar-SearchField{height:32px!important;min-height:32px!important;box-sizing:border-box!important;align-self:center;}

    /* ── Floating glass capsules: button groups, extensions, address field. ── */
    #browser .pg-surface .toolbar-mainbar .pg-run,
    #browser .pg-surface .toolbar-extensions:has(.button-toolbar>button),
    #browser .pg-surface .UrlBar-AddressField,
    #browser .pg-surface .UrlBar-SearchField{
      background:linear-gradient(180deg,var(--pg-glass-hi),var(--pg-glass) 60%)!important;
      -webkit-backdrop-filter:blur(16px) saturate(1.8) brightness(1.08);backdrop-filter:blur(16px) saturate(1.8) brightness(1.08);
      border-color:transparent!important;
      box-shadow:inset 0 1px 0 var(--pg-rim),inset 0 -.5px 0 var(--pg-rim-soft),var(--pg-float)!important;
    }
    /* Dark glass dims what is behind it instead of brightening it. */
    @media(prefers-color-scheme:dark){
      #browser .pg-surface .toolbar-mainbar .pg-run,#browser .pg-surface .toolbar-extensions:has(.button-toolbar>button),
      #browser .pg-surface .UrlBar-AddressField,#browser .pg-surface .UrlBar-SearchField{-webkit-backdrop-filter:blur(16px) saturate(1.25) brightness(.82);backdrop-filter:blur(16px) saturate(1.25) brightness(.82);}
    }
    #browser .pg-surface .toolbar-extensions:has(.button-toolbar>button),
    #browser .pg-surface .UrlBar-AddressField,#browser .pg-surface .UrlBar-SearchField{
      border-radius:999px!important;
      box-shadow:inset 0 1px 0 var(--pg-rim),inset 0 -.5px 0 var(--pg-rim-soft),0 0 0 .5px var(--pg-line),var(--pg-float)!important;
    }
    #browser .pg-surface .UrlBar-AddressField:focus-within{box-shadow:inset 0 1px 0 var(--pg-rim),0 0 0 .5px var(--pg-line),0 0 0 3px color-mix(in srgb,var(--pg-accent) 35%,transparent)!important;}
    #browser .pg-surface .UrlBar-AddressField,#browser .pg-surface .UrlFragment-Wrapper,#browser .pg-surface .UrlBar-AddressField input{color:var(--pg-ink)!important;}
    /* Vivaldi colours the URL host/path itself; follow our ink so it stays readable on glass in both modes. */
    #browser .pg-surface .UrlFragment--Highlight{color:var(--pg-ink)!important;}
    #browser .pg-surface .UrlFragment--Lowlight{color:var(--pg-ink)!important;opacity:.55;}

    /* Specular glint where light enters each shape (top-left), fading well before any segment seam. */
    #browser .pg-surface .toolbar-mainbar .pg-run-start,
    #browser .pg-surface .toolbar-extensions:has(.button-toolbar>button),
    #browser .pg-surface .UrlBar-AddressField{
      background:radial-gradient(30px 22px at 13px 2px,var(--pg-spec),transparent 100%),linear-gradient(180deg,var(--pg-glass-hi),var(--pg-glass) 60%)!important;
    }
    /* Whole shapes get a light edge all round (inner, never a dark outline). */
    #browser .pg-surface .toolbar-mainbar .pg-run-start.pg-run-end,
    #browser .pg-surface .toolbar-extensions:has(.button-toolbar>button),
    #browser .pg-surface .UrlBar-AddressField,#browser .pg-surface .UrlBar-SearchField{
      box-shadow:inset 0 1px 0 var(--pg-rim),inset 0 0 0 .5px var(--pg-ring),inset 0 -.5px 0 var(--pg-rim-soft),var(--pg-float)!important;
    }
    /* Capsule segments: one shape per run of adjacent buttons, no seams. */
    #browser .pg-surface .toolbar-mainbar .pg-run{align-self:center;display:flex;align-items:center;height:32px!important;min-height:32px!important;max-height:32px!important;margin-block:0!important;margin-inline:0!important;padding-inline:0!important;border-radius:0!important;}
    #browser .pg-surface .toolbar-mainbar .pg-run-start{border-radius:999px 0 0 999px!important;padding-left:2px!important;margin-left:4px!important;box-shadow:inset 0 1px 0 var(--pg-rim),inset .5px 0 0 var(--pg-ring),inset 0 -.5px 0 var(--pg-rim-soft),var(--pg-float)!important;}
    #browser .pg-surface .toolbar-mainbar .pg-run-end{border-radius:0 999px 999px 0!important;padding-right:2px!important;margin-right:4px!important;box-shadow:inset 0 1px 0 var(--pg-rim),inset -.5px 0 0 var(--pg-ring),inset 0 -.5px 0 var(--pg-rim-soft),var(--pg-float)!important;}
    #browser .pg-surface .toolbar-mainbar .pg-run-start.pg-run-end{border-radius:999px!important;width:32px!important;min-width:32px!important;padding:2px!important;justify-content:center;}
    #browser .pg-surface .toolbar-mainbar .pg-run-start.pg-run-end>button{width:28px!important;min-width:28px!important;max-width:28px!important;flex:0 0 28px!important;}
    #browser .pg-surface .toolbar-mainbar .pg-run-start.pg-run-end:has(>button:disabled){opacity:.55;}
    #browser .pg-surface .toolbar-mainbar .pg-run-start.pg-run-end>button:disabled{opacity:.7;}
    #browser .pg-surface .toolbar-mainbar .pg-run-start:not(.pg-run-end){clip-path:inset(-12px 0 -12px -12px);}
    #browser .pg-surface .toolbar-mainbar .pg-run-end:not(.pg-run-start){clip-path:inset(-12px -12px -12px 0);}
    #browser .pg-surface .toolbar-mainbar .pg-run:not(.pg-run-start):not(.pg-run-end){clip-path:inset(-12px 0);}
    #browser .pg-surface .toolbar-extensions:has(.button-toolbar>button){align-self:center;height:32px!important;min-height:32px!important;max-height:32px!important;padding-inline:3px!important;margin-inline:4px!important;}

    /* ── Buttons: icon on glass, no own disk. Hover = soft pill, press = squish. ── */
    #browser .pg-surface .toolbar-mainbar .pg-run>button,
    #browser .pg-surface .toolbar-extensions .button-toolbar>button{
      width:34px!important;min-width:34px!important;height:28px!important;min-height:28px!important;padding:0!important;margin:0!important;
      border-radius:999px!important;background:transparent!important;box-shadow:none!important;border:0!important;color:var(--pg-ink)!important;
      transition:background-color 140ms ease,transform 260ms cubic-bezier(.3,1.6,.5,1);
    }
    #browser .pg-surface .toolbar-mainbar .pg-run>button svg{flex-shrink:0;}
    #browser .pg-surface .toolbar-mainbar .pg-run>button img,#browser .pg-surface .toolbar-extensions .button-toolbar>button img{width:18px!important;height:18px!important;max-width:18px!important;max-height:18px!important;object-fit:contain;}
    #browser .pg-surface .toolbar-mainbar .pg-run>button:hover:not(:disabled),
    #browser .pg-surface .toolbar-extensions .button-toolbar>button:hover:not(:disabled){background:var(--pg-hover)!important;}
    #browser .pg-surface .toolbar-mainbar .pg-run>button:active:not(:disabled),
    #browser .pg-surface .toolbar-extensions .button-toolbar>button:active:not(:disabled){background:var(--pg-press)!important;transform:scale(.9);transition-duration:80ms;}
    #browser .pg-surface .toolbar-mainbar .pg-run>button:disabled{opacity:.38;}
    #browser .pg-surface .toolbar-mainbar .button-toolbar>button:focus-visible{outline:2px solid var(--pg-accent)!important;outline-offset:-2px;}

    /* ── Tabs ── */
    #browser .pg-surface .tab{color:var(--pg-ink)!important;}
    #browser .pg-surface .tab:not(.active):hover{background:var(--pg-hover)!important;}
    #browser .pg-surface .tab.active{background:linear-gradient(180deg,var(--pg-glass-hi),var(--pg-glass))!important;box-shadow:inset 0 1px 0 var(--pg-rim),inset 0 0 0 .5px var(--pg-ring),inset 0 -.5px 0 var(--pg-rim-soft),var(--pg-float)!important;}
    #browser .pg-surface .tab .favicon{width:14px!important;height:14px!important;}
    /* Tab stacks. Vivaldi paints the accordion arrow of the active stack as a solid block (accent or
       stack colour) that sits behind the whole tile and spills out of the glass. Here the arrow is a
       quiet chevron; a stack's own colour survives only as an accent (chevron, counter ring, tint). */
    #browser .pg-surface .accordion-toggle-arrow{--pg-stack:var(--stackColorBg,var(--pg-ink));background:transparent!important;color:var(--pg-ink)!important;box-shadow:none!important;border:0!important;border-radius:10px!important;opacity:.6;transition:background-color 140ms ease,opacity 140ms ease;}
    #browser .pg-surface .accordion-toggle-arrow.colored{color:var(--pg-stack)!important;opacity:.9;}
    #browser .pg-surface .accordion-toggle-arrow:hover{background:var(--pg-hover)!important;opacity:1;}
    #browser .pg-surface .accordion-toggle-arrow.closed.active{opacity:.9;}
    #browser .pg-surface .accordion-toggle-arrow::before,#browser .pg-surface .accordion-toggle-arrow::after{background:transparent!important;box-shadow:none!important;}
    #browser .pg-surface .stack-counter{background:color-mix(in srgb,var(--pg-glass-hi) 85%,transparent)!important;color:var(--pg-ink)!important;border-radius:999px!important;
      box-shadow:inset 0 .5px 0 var(--pg-rim-soft),0 0 0 .5px var(--pg-line)!important;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}
    #browser .pg-surface .tab-position.colored .stack-counter{box-shadow:inset 0 0 0 1.5px var(--stackColorBg),0 0 0 .5px var(--pg-line)!important;}
    #browser .pg-surface .tab-position.colored .tab:not(.active),
    #browser .pg-surface .tab-position .tab-in-accordion:not(.active){background:transparent!important;}
    #browser .pg-surface .tab-position.colored .tab:not(.active){background:color-mix(in srgb,var(--stackColorBg) 16%,transparent)!important;}
    #browser .pg-surface .tab-position.colored .tab:not(.active):hover{background:color-mix(in srgb,var(--stackColorBg) 26%,transparent)!important;}
    #browser .pg-surface .tab-group-indicator .tab-indicator{opacity:.6;}
    /* Vivaldi frames each stack with an SVG stroke in the stack colour: keep it as a faint hairline. */
    #browser .pg-surface .svg-tab-stack .stack-frame{stroke:color-mix(in srgb,var(--stackColorBg,var(--pg-ink)) 40%,transparent)!important;stroke-width:1px!important;}
    /* Collapsed stack holding the active tab: tab + arrow read as one glass tile. */
    #browser .pg-surface .accordion-toggle-arrow.closed.active{background:var(--pg-glass)!important;border-radius:0 0 8px 8px!important;opacity:1;}
    #browser .pg-surface .accordion-toggle-arrow.closed.active:hover{background:color-mix(in srgb,var(--pg-glass) 70%,var(--pg-glass-hi))!important;}
    #browser .pg-surface .tab.active.tab-accordion{box-shadow:inset 0 1px 0 var(--pg-rim)!important;}
    #browser .pg-surface .tab-position:not(.colored) .tab-group-indicator .tab-indicator.active{background:var(--pg-ink)!important;opacity:.45;}
    /* Narrow strips show icons only: Vivaldi may squeeze the first letters of titles in otherwise. */
    #browser .pg-surface.pg-icons .tab .title{display:none!important;}
    /* Narrow strips: no permanent scrollbar on the glass (scrolling still works). */
    #browser .pg-surface.pg-strip *{scrollbar-width:none!important;}
    #browser .pg-surface.pg-strip ::-webkit-scrollbar{display:none!important;width:0!important;}

    /* ── Icons inside the address field (site info shield, bookmark): bare glyphs, no capsule. ── */
    #browser .pg-surface .UrlBar-AddressField .button-toolbar,
    #browser .pg-surface .UrlBar-AddressField .SiteInfoButton,
    #browser .pg-surface .UrlBar-AddressField .BookmarkButton{background:transparent!important;box-shadow:none!important;border:0!important;backdrop-filter:none!important;clip-path:none!important;margin:0!important;padding:0!important;height:auto!important;min-height:0!important;}
    #browser .pg-surface .UrlBar-AddressField .button-toolbar>button,
    #browser .pg-surface .UrlBar-AddressField .SiteInfoButton>button,
    #browser .pg-surface .UrlBar-AddressField .BookmarkButton button{
      /* Auto width: icon-only buttons stay a 26 px circle, but the site-info button grows into a pill
         when Vivaldi adds a label such as "Not secure" (a fixed width made it spill over the URL). */
      width:auto!important;min-width:26px!important;max-width:none!important;height:26px!important;min-height:26px!important;padding:0 4px!important;margin:0 1px!important;
      display:inline-flex!important;align-items:center;justify-content:center;gap:4px;flex:0 0 auto!important;
      border-radius:999px!important;border:0!important;outline-offset:-2px;background:transparent!important;box-shadow:none!important;color:var(--pg-ink)!important;opacity:.72;
      transition:background-color 140ms ease,opacity 140ms ease,transform 260ms cubic-bezier(.3,1.6,.5,1);
    }
    #browser .pg-surface .UrlBar-AddressField .button-toolbar>button::before,#browser .pg-surface .UrlBar-AddressField .button-toolbar>button::after{display:none!important;}
    #browser .pg-surface .UrlBar-AddressField .button-toolbar>button:hover,
    #browser .pg-surface .UrlBar-AddressField .SiteInfoButton>button:hover,
    #browser .pg-surface .UrlBar-AddressField .BookmarkButton button:hover{background:var(--pg-hover)!important;opacity:1;}
    #browser .pg-surface .UrlBar-AddressField .button-toolbar>button:active,
    #browser .pg-surface .UrlBar-AddressField .SiteInfoButton>button:active,
    #browser .pg-surface .UrlBar-AddressField .BookmarkButton button:active{background:var(--pg-press)!important;transform:scale(.9);}
    #browser .pg-surface .UrlBar-AddressField svg{width:18px!important;height:18px!important;}
    #browser .pg-surface .UrlBar-AddressField .SiteInfoButton-Favicon,#browser .pg-surface .UrlBar-AddressField .SiteInfoButton-Favicon svg{width:16px!important;height:16px!important;}

    /* ── Vertical surfaces. Narrow strips (vertical tabs, panel icons): a floating glass pane
       that mirrors the page beside it. Wide panels: an opaque floating card. ── */
    #browser .pg-surface.pg-strip{padding-block:10px!important;box-sizing:border-box!important;}
    #browser .pg-surface>.pg-material[data-kind="strip"]{inset:4px!important;border-radius:14px!important;background:linear-gradient(180deg,var(--pg-strip-hi),var(--pg-strip-lo))!important;box-shadow:0 0 0 .5px var(--pg-line),0 6px 18px -8px var(--pg-shadow)!important;}
    #browser .pg-surface>.pg-material[data-kind="strip"]::after{background:linear-gradient(180deg,var(--pg-sheen),transparent 18%),linear-gradient(var(--pg-strip-tint),var(--pg-strip-tint))!important;box-shadow:inset 0 1px 0 var(--pg-rim),inset 1px 0 0 var(--pg-rim-soft),inset -1px 0 0 var(--pg-rim-soft),inset 0 -1px 0 var(--pg-rim-soft)!important;}
    #browser .pg-surface.pg-strip{box-shadow:none!important;}
    #browser .pg-material[data-kind="card"]>.pg-refract,#browser .pg-material[data-kind="card"]>.pg-reflect{display:none;}
    #browser .pg-surface.pg-card{box-shadow:none!important;}
    #browser .pg-surface>.pg-material[data-kind="card"]{background:var(--pg-card);}
    #browser .pg-surface>.pg-material[data-kind="card"]::after{background:linear-gradient(180deg,var(--pg-sheen),transparent 30%);}
    /* Buttons on vertical strips: bare glyphs, rounded hover. */
    #browser .pg-surface.pg-strip .button-toolbar:not(.toolbar-spacer,.toolbar-spacer-flexible,.toolbar-divider)>button{background:transparent!important;box-shadow:none!important;border:0!important;border-radius:10px!important;transition:background-color 140ms ease,transform 260ms cubic-bezier(.3,1.6,.5,1);}
    #browser .pg-surface.pg-strip .button-toolbar>button:hover{background:var(--pg-hover)!important;}
    #browser .pg-surface.pg-strip .button-toolbar>button:active{background:var(--pg-press)!important;transform:scale(.9);}
    #browser .pg-surface.pg-strip .tab:not(.active){background:transparent!important;box-shadow:none!important;}
    #browser .pg-surface>.pg-material[data-axis="y"]{inset:${INSET}px;border-radius:18px;contain:layout style size;overflow:hidden;box-shadow:0 0 0 .5px var(--pg-line),0 12px 32px -12px var(--pg-shadow);}
    #browser .pg-surface>.pg-material[data-axis="y"]::after{border-radius:inherit;box-shadow:inset 0 1px 0 var(--pg-rim),inset 1px 0 0 var(--pg-rim-soft),inset -1px 0 0 var(--pg-rim-soft),inset 0 -1px 0 var(--pg-rim-soft),inset 0 14px 24px -20px var(--pg-rim);}
    #browser #panels-container.pg-surface{box-shadow:none!important;border:0!important;}
    #browser #panels-container.pg-surface #switch,#browser #panels-container.pg-surface #switch>.toolbar,
    #browser #panels-container.pg-surface #panels,#browser #panels-container.pg-surface .panel-group,
    #browser #panels-container.pg-surface .panel,#browser #panels-container.pg-surface .webpanel-header,
    #browser #panels-container.pg-surface .panel-collapse-guard{background:transparent!important;border-color:transparent!important;box-shadow:none!important;}
    #browser #panels-container.pg-card #switch{padding-block:${INSET+4}px!important;}
    #browser #panels-container.pg-card .panel-group{clip-path:inset(${INSET}px ${INSET}px ${INSET}px 0 round 0 14px 14px 0);}
    #browser #panels-container.right.pg-card .panel-group{clip-path:inset(${INSET}px 0 ${INSET}px ${INSET}px round 14px 0 0 14px);}
    #browser #panels-container.pg-surface #switch>button,
    #browser #panels-container.pg-surface #switch .button-toolbar:not(.toolbar-spacer,.toolbar-spacer-flexible,.toolbar-divider)>button{
      border-radius:11px!important;background:transparent!important;box-shadow:none!important;border:0!important;color:var(--pg-ink)!important;
      flex:0 0 30px!important;width:30px!important;min-width:30px!important;max-width:30px!important;margin-inline:auto!important;
      transition:background-color 140ms ease,transform 260ms cubic-bezier(.3,1.6,.5,1);
    }
    #browser #panels-container.pg-surface #switch>button:hover,
    #browser #panels-container.pg-surface #switch .button-toolbar>button:hover{background:var(--pg-hover)!important;}
    #browser #panels-container.pg-surface #switch>button:active,
    #browser #panels-container.pg-surface #switch .button-toolbar>button:active{background:var(--pg-press)!important;transform:scale(.9);}
    #browser #panels-container.pg-surface #switch .button-toolbar.active,
    #browser #panels-container.pg-surface #switch .button-toolbar:focus-visible{background:transparent!important;box-shadow:none!important;}
    #browser #panels-container.pg-surface #switch>button.active,
    #browser #panels-container.pg-surface #switch .button-toolbar.active>button,
    #browser #panels-container.pg-surface #switch .button-toolbar>button.active{
      background:linear-gradient(180deg,var(--pg-glass-hi),var(--pg-glass))!important;
      box-shadow:inset 0 1px 0 var(--pg-rim),inset 0 -.5px 0 var(--pg-rim-soft),0 0 0 .5px var(--pg-line),var(--pg-float)!important;
    }
    #browser #panels-container.pg-surface #switch>button.active::before,#browser #panels-container.pg-surface #switch>button.active::after,
    #browser #panels-container.pg-surface #switch .button-toolbar.active::before,#browser #panels-container.pg-surface #switch .button-toolbar.active::after{display:none!important;}

    /* PageGlass toggle: plain glyph, full strength when on (white in dark mode, ink in light mode). */
    #pageglass-toggle{flex:0 0 auto;}
    #pageglass-toggle>button[aria-pressed="false"]{opacity:.55;}
    #pageglass-toggle>button[aria-pressed="true"],
    #browser .pg-surface .toolbar-mainbar #pageglass-toggle>button[aria-pressed="true"]{color:var(--pg-ink,currentColor)!important;opacity:1!important;}
    @media(prefers-color-scheme:dark){#pageglass-toggle>button[aria-pressed="true"],#browser .pg-surface .toolbar-mainbar #pageglass-toggle>button[aria-pressed="true"]{color:#fff!important;}}
    @media(prefers-reduced-motion:reduce){#browser .pg-surface .button-toolbar>button{transition:none!important;transform:none!important;}#browser .pg-material img{will-change:auto;}}
    @media(prefers-reduced-transparency:reduce){
      #browser .pg-material{display:none;}#browser .pg-surface{background:var(--colorBg)!important;color:var(--colorFg)!important;}
      #browser .pg-surface .pg-run,#browser .pg-surface .toolbar-extensions,#browser .pg-surface .UrlBar-AddressField{backdrop-filter:none!important;background:var(--colorBgAlpha,var(--colorBg))!important;}
    }
  `;document.head.append(css);
  function move(){
    raf=0;
    // Shift the retained texture on the compositor between fresh screenshots;
    // unseen page content is supplied by the next capture.
    const dy=Math.max(-80,Math.min(80,position-capturedPosition));
    const shift=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:-dy;
    for(const layer of layers.values()){
      // Only transforms change here, so scrolling stays on the compositor (no repaint, no filters re-run).
      const m=layer.dataset.mirror;
      // Strips beside the page: the base itself is the page flipped across their edge.
      // Never slide a texture past its own edge: the capture has no pixels beyond the viewport,
      // so an uncovered band would flash the fallback colour until the next capture lands.
      const base=layer.firstChild.firstChild,t=clamp(shift,base);
      base.style.transform=m==='left'||m==='right'?`translate3d(0,${t}px,0) scaleX(${-MIRROR})`:`translate3d(0,${t}px,0)`;
      // Bar above the page: see-through base plus a reflection overlay that moves the opposite way.
      const reflect=layer.children[1]?.firstChild;
      if(reflect&&(m==='top'||m==='below'))reflect.style.transform=`translate3d(0,${clamp(-shift*MIRROR,reflect)}px,0) scaleY(${-MIRROR})`;
    }
  }
  const clamp=(v,img)=>Math.max(+img.dataset.lo||0,Math.min(+img.dataset.hi||0,v));
  // Allowed vertical travel [lo,hi] that keeps a texture of height `size`, whose top sits at
  // `start` inside a pane of height `pane`, covering the pane (never worse than at rest).
  const travel=(img,start,size,pane)=>{img.dataset.hi=Math.max(0,-start);img.dataset.lo=Math.min(0,pane-start-size);};
  function motion(){if(!raf)raf=requestAnimationFrame(move);}
  // Vivaldi re-renders some surfaces' `class` attribute (e.g. #panels-container when a panel opens),
  // which wipes our classes while the glass layer stays. Put them back and refresh the geometry.
  const classWatch=new MutationObserver(records=>{
    for(const {target:el} of records){
      const want=el.__pgWant;
      if(want&&want.some(c=>!el.classList.contains(c))){el.classList.add(...want);schedule(60);}
    }
  });
  function paint(image,elements,atPosition){
    const root=document.getElementById('browser'),rr=root.getBoundingClientRect();
    capturedPosition=atPosition;lastFrame={image,atPosition};
    const active=new Set(elements);
    for(const [el,layer]of layers)if(!active.has(el)){layer.remove();el.classList.remove('pg-surface','pg-pos','pg-strip','pg-card','pg-icons');delete el.__pgWant;layers.delete(el);}
    const img=()=>{const i=document.createElement('img');i.alt='';i.draggable=false;i.decoding='async';return i;};
    for(const el of elements){
      const r=el.getBoundingClientRect();if(r.width*r.height>rr.width*rr.height*.45)continue;
      let layer=layers.get(el);
      if(!layer){
        layer=document.createElement('div');layer.className='pg-material';layer.setAttribute('aria-hidden','true');
        const refract=document.createElement('div');refract.className='pg-refract';
        const base=img();base.className='pg-base';refract.append(base);
        const reflect=document.createElement('div');reflect.className='pg-reflect';reflect.append(img());
        layer.append(refract,reflect);layers.set(el,layer);el.prepend(layer);
        // Only static elements need a containing block; never override Vivaldi's absolute/fixed overlays.
        if(getComputedStyle(el).position==='static')el.classList.add('pg-pos');
      }
      layer.dataset.axis=r.width>=r.height?'x':'y';
      // Narrow vertical strips (vertical tabs, panel icons) stay native: a full-height glass slab
      // reads as a grey bar. Only their items get glass. Wider panels become a floating card.
      const kind=layer.dataset.axis==='x'?'bar':r.width<120?'strip':'card';
      layer.dataset.kind=kind;
      el.__pgWant=['pg-surface',...(el.classList.contains('pg-pos')?['pg-pos']:[]),...(kind==='bar'?[]:['pg-'+kind]),...(kind==='strip'&&r.width<70?['pg-icons']:[])];
      el.classList.remove('pg-strip','pg-card','pg-icons');el.classList.add(...el.__pgWant);
      // Measure the pane itself after our classes applied (bar height, insets, padding all change it).
      const lr=layer.getBoundingClientRect();
      const left=lr.x-rr.x+8,top=lr.y-rr.y;
      const refract=layer.firstChild,i=refract.firstChild,ri=layer.children[1].firstChild;
      if(i.src!==image.src)i.src=image.src;
      // A pane touching the page reflects the content right next to it: the page is laid
      // against the pane's inner edge and mirrored back into it (see move()). Strips beside
      // the page mirror sideways; the bar right above the page mirrors upward under its buttons.
      const page=kind!=='card'?document.querySelector('#webview-container,#webpage-stack')?.getBoundingClientRect():null;
      const near=(a,b)=>Math.abs(a-b)<=4;
      const side=!page||page.width<50||page.height<50?'':
        kind==='strip'?(near(lr.right+STRIP_GAP,page.left)?'left':near(lr.left-STRIP_GAP,page.right)?'right':''):
        !(lr.left<page.right&&lr.right>page.left)?'':
        near(lr.bottom,page.top)?'top':near(lr.top,page.bottom)?'below':'';
      const vertical=side==='top'||side==='below';
      if(vertical){
        // 'top': bar above the page (reflects upward); 'below': address bar at the bottom of
        // the window (reflects the page above it downward, into the bar).
        layer.dataset.mirror=side;
        if(ri.src!==image.src)ri.src=image.src;
        ri.style.width=page.width+'px';ri.style.height=page.height+'px';ri.style.left=(page.left-lr.left)+'px';
        if(side==='top'){
          ri.style.top=lr.height+'px';ri.style.transformOrigin='50% 0';
          travel(ri,lr.height-page.height*MIRROR,page.height*MIRROR,lr.height); // spans [h-kH, h]
        }else{
          ri.style.top=(-page.height)+'px';ri.style.transformOrigin='50% 100%';
          travel(ri,0,page.height*MIRROR,lr.height); // spans [0, kH]
        }
      }
      if(side&&!vertical){
        layer.dataset.mirror=side;
        // 1:1 with the captured viewport: any extra height would stretch the page and misalign it.
        i.style.width=page.width+'px';i.style.height=page.height+'px';
        i.style.top=(page.top-lr.top)+'px';travel(i,page.top-lr.top,page.height,lr.height);
        i.style.left=(side==='left'?lr.width:-page.width)+'px';
        i.style.transformOrigin=side==='left'?'0 50%':'100% 50%';
      }else{
        if(!vertical)delete layer.dataset.mirror;i.style.transformOrigin='';
        i.style.width=(rr.width+16)+'px';i.style.height=rr.height+'px';
        i.style.left=-left+'px';i.style.top=-top+'px';travel(i,-top,rr.height,lr.height);
      }
    }
    classWatch.disconnect();
    for(const el of layers.keys())classWatch.observe(el,{attributes:true,attributeFilter:['class']});
    move();
  }
  async function attach(tab){
    if(attachedTab===tab.id)return;
    const generation=++attachEpoch;
    const records=await call(api.scripting,'executeScript',{target:{tabId:tab.id},args:[channel],func:token=>{
      const key='__pageglassMotion';const previous=globalThis[key];
      if(previous?.token===token)return{y:scrollY};
      previous?.stop?.();
      let raf=0,timer=0;
      const send=phase=>{if(document.hidden)return;try{chrome.runtime.sendMessage({pageglass:token,phase,y:scrollY},()=>{void chrome.runtime.lastError;});}catch{}};
      const onscroll=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;send('move');});clearTimeout(timer);timer=setTimeout(()=>send('end'),140);};
      const wheel=()=>{clearTimeout(timer);timer=setTimeout(()=>send('end'),140);};
      document.addEventListener('scroll',onscroll,{passive:true,capture:true});document.addEventListener('wheel',wheel,{passive:true,capture:true});
      globalThis[key]={token,stop(){document.removeEventListener('scroll',onscroll,true);document.removeEventListener('wheel',wheel,true);cancelAnimationFrame(raf);clearTimeout(timer);}};
      return{y:scrollY};
    }});
    if(generation!==attachEpoch||tab.id!==pg.lastTab)return;
    attachedTab=tab.id;position=records?.[0]?.result?.y||0;
  }
  const receive=(message,sender)=>{
    if(!pg.enabled||message?.pageglass!==channel||sender.id!==api.runtime.id||sender.tab?.id!==pg.lastTab||sender.tab?.incognito||sender.tab?.windowId!==windowId)return;
    if(!['move','end'].includes(message.phase)||!Number.isFinite(message.y))return;
    position=message.y;pg.scrolling=message.phase==='move';motion();schedule();
  };
  async function capture(tab){
    const thumbnails=globalThis.vivaldi?.thumbnails;
    if(thumbnails?.captureTab)try{
      const value=await call(thumbnails,'captureTab',tab.id,{encodeFormat:'jpg',encodeQuality:62,fullPage:false,width:1000,height:0});
      const data=typeof value==='string'?value:value?.dataUrl||value?.data||value?.thumbnail;
      if(data){pg.backend='native';return data;}
    }catch(e){pg.nativeError=e.message;}
    pg.backend='tabs';return call(api.tabs,'captureVisibleTab',windowId,{format:'jpeg',quality:62});
  }
  async function frame(){
    if(!pg.enabled||document.hidden||!api?.tabs)return;
    if(pg.busy){pending=true;return;}pg.busy=true;lastCapture=performance.now();
    try{
      if(windowId===undefined)windowId=(await call(api.windows,'getCurrent')).id;
      const[tab]=await call(api.tabs,'query',{windowId,active:true});
      if(!tab){clear();status(T.paused);return;}
      if(pg.lastTab!==tab.id){clear();pg.lastTab=tab.id;attachedTab=null;}
      if(tab.incognito||!/^https?:\/\//.test(tab.url||'')){clear();status(T.paused);return;}
      const epoch=pg.epoch,url=tab.url;await attach(tab);
      if(pg.epoch!==epoch||!pg.enabled)return;
      const atPosition=position,data=await capture(tab);
      if(!data)throw new Error(T.noimg);
      const image=new Image();image.src=data.startsWith('data:')||data.startsWith('blob:')||data.includes('://')?data:'data:image/jpeg;base64,'+data;await image.decode();
      const[current]=await call(api.tabs,'query',{windowId,active:true});
      if(!pg.enabled||pg.epoch!==epoch||current?.id!==tab.id||current?.url!==url)return;
      paint(image,surfaces(),atPosition);pg.frames++;status();
    }catch(e){clear();status((e.message||String(e)).slice(0,140));}
    finally{pg.busy=false;if(pending){pending=false;schedule();}}
  }
  const refresh=()=>{clearTimeout(timer);timer=0;clear();pg.scrolling=false;attachedTab=null;attachEpoch++;schedule(100);};
  const changed=info=>{if(windowId!==undefined&&info.windowId!==undefined&&info.windowId!==windowId)return;pg.lastTab=info.tabId??null;refresh();};
  const updated=(id,change)=>{if(id!==pg.lastTab){if(pg.lastTab===null&&(change.url||change.status==='complete'))schedule(80);return;}if(change.url||change.status==='loading')refresh();if(change.status==='complete')schedule(80);};
  const resized=()=>{pg.epoch++;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>schedule(),120);};
  // Captures pause while the window is hidden; resume as soon as it is visible again.
  const visible=()=>{if(!document.hidden)schedule(60);};
  api?.runtime?.onMessage?.addListener(receive);api?.tabs?.onActivated?.addListener(changed);api?.tabs?.onUpdated?.addListener(updated);window.addEventListener('resize',resized);document.addEventListener('visibilitychange',visible);
  pg.stop=()=>{pg.enabled=false;clearTimeout(timer);clearTimeout(resizeTimer);observer?.disconnect();api?.runtime?.onMessage?.removeListener(receive);api?.tabs?.onActivated?.removeListener(changed);api?.tabs?.onUpdated?.removeListener(updated);window.removeEventListener('resize',resized);document.removeEventListener('visibilitychange',visible);clear();document.getElementById('pageglass-toggle')?.remove();css.remove();delete window.__pageGlass;};
  // The on/off choice survives restarts (localStorage is null inside Vivaldi's window).
  async function loadSetting(){try{const v=await api?.storage?.local?.get(STORE);if(v&&v[STORE]===false)pg.enabled=false;}catch{}}
  async function start(){if(!document.getElementById('browser')){setTimeout(start,300);return;}await loadSetting();mount();observer=new MutationObserver(scheduleMount);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});if(pg.enabled)schedule(500);}
  start();
})();

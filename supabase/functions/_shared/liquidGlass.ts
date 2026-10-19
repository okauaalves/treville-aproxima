/** Liquid glass nas superfícies clicáveis/visuais da página pública (perfil + marca). */

export const GENERIC_ICON_BLUE = '#4A90E2';
export const WHATSAPP_GREEN = '#25D366';
export const INSTAGRAM_GRADIENT =
  'linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)';

/** Filtro SVG Apple-style (turbulence + specular + displacement). */
export function glassFilterSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" role="presentation" style="display: none">
  <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
    <feTurbulence type="fractalNoise" baseFrequency="0.001 0.005" numOctaves="1" seed="17" result="turbulence"/>
    <feComponentTransfer in="turbulence" result="mapped">
      <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
      <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
      <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
    </feComponentTransfer>
    <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
    <feSpecularLighting in="softMap" surfaceScale="9" specularConstant="1" specularExponent="100" lighting-color="white" result="specLight">
      <fePointLight x="-200" y="-200" z="300" />
    </feSpecularLighting>
    <feComposite in="specLight" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litImage" />
    <feDisplacementMap in="SourceGraphic" in2="softMap" scale="280" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>`;
}

/**
 * CSS do efeito em cards/banner/CTA inteiros.
 * Ícones coloridos ficam sólidos acima do vidro; conteúdo permanece nítido.
 * Link cards: hover/press no mesmo ritmo do botão PAGINA (cubic-bezier 0.25,1,0.5,1).
 */
export function liquidGlassCss(): string {
  return `
.liquid-glass{--glass-transition:0.4s cubic-bezier(0.5,1.5,0.5,1);--link-anim:280ms cubic-bezier(0.25,1,0.5,1);position:relative;border-radius:inherit;isolation:isolate;background-color:rgb(255 255 255 / 10%);border:1.5px solid var(--border,rgba(47,95,224,0.55));box-shadow:var(--shadow,0 6px 6px rgb(0 0 0 / 20%),0 0 20px rgb(0 0 0 / 10%),0 0 18px var(--accent-glow,rgba(47,95,224,0.22)));transition:transform var(--glass-transition),box-shadow var(--link-anim),border-color var(--link-anim);transform-origin:center center}
.liquid-glass::before,.liquid-glass::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none}
.liquid-glass::before{backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);filter:url(#glass-distortion);z-index:-1;transition:backdrop-filter var(--link-anim),-webkit-backdrop-filter var(--link-anim)}
.liquid-glass::after{box-shadow:inset 2px 2px 1px 0 rgb(255 255 255 / 65%),inset -1px -1px 1px 1px rgb(255 255 255 / 65%),inset 0 0 0 1px var(--accent-inset,rgba(47,95,224,0.12));z-index:0;transition:box-shadow var(--link-anim)}
.liquid-glass>:not(.banner-decor){position:relative;z-index:1}
.liquid-glass>.banner-decor{z-index:0;pointer-events:none}
.liquid-glass.is-expanded{transform:scale(1.06);transition:transform var(--glass-transition)}
.link-card.is-navigating{pointer-events:none}
.link-card.liquid-glass{border-radius:26px;border:1.5px solid var(--border,rgba(47,95,224,0.55));cursor:pointer;-webkit-tap-highlight-color:transparent;box-shadow:var(--shadow,0 6px 6px rgb(0 0 0 / 20%),0 0 20px rgb(0 0 0 / 10%),0 0 16px var(--accent-glow,rgba(47,95,224,0.2)));transition:transform var(--link-anim),box-shadow var(--link-anim),border-color var(--link-anim)}
.link-card.liquid-glass::after{box-shadow:inset 2px 2px 1px 0 rgb(255 255 255 / 65%),inset -1px -1px 1px 1px rgb(255 255 255 / 65%),inset 0 0 0 1px var(--accent-inset,rgba(47,95,224,0.12))}
.icon-circle{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:16px;flex:none;color:#fff;box-shadow:inset 1px 1px 1px 0 rgba(255,255,255,0.35),inset -1px -1px 1px 0 rgba(255,255,255,0.2);transition:transform var(--link-anim)}
.icon-circle svg{width:60%;height:60%;display:block}
@media (hover:hover) and (pointer:fine){
  .link-card.liquid-glass:hover{transform:scale(1.03);box-shadow:0 14px 28px rgb(0 0 0 / 34%),0 0 36px rgb(0 0 0 / 18%),0 0 0 1px rgb(255 255 255 / 28%),0 0 22px var(--accent-glow,rgba(47,95,224,0.35))}
  .link-card.liquid-glass:hover::before{backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
  .link-card.liquid-glass:hover::after{box-shadow:inset 2px 2px 2px 0 rgb(255 255 255 / 78%),inset -1px -1px 2px 1px rgb(255 255 255 / 70%),0 0 18px var(--accent-glow,rgba(47,95,224,0.28))}
  .link-card.liquid-glass:hover .icon-circle{transform:scale(1.08)}
}
.link-card.liquid-glass:active:not(.is-expanded){transform:scale(0.97);box-shadow:0 4px 8px rgb(0 0 0 / 28%),0 0 16px rgb(0 0 0 / 16%),0 0 12px var(--accent-glow,rgba(47,95,224,0.18))}
.link-card.liquid-glass:active:not(.is-expanded) .icon-circle{transform:scale(0.96)}
.link-card.liquid-glass.is-expanded,.link-card.liquid-glass.is-expanded:hover,.link-card.liquid-glass.is-expanded:active{transform:scale(1.06);transition:transform var(--glass-transition)}
@media (hover:none) and (pointer:coarse){
  .liquid-glass::before{filter:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  .link-card.liquid-glass:hover{transform:none;box-shadow:var(--shadow,0 6px 6px rgb(0 0 0 / 20%),0 0 20px rgb(0 0 0 / 10%),0 0 16px var(--accent-glow,rgba(47,95,224,0.2)))}
  .link-card.liquid-glass:hover::before{backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  .link-card.liquid-glass:hover::after{box-shadow:inset 2px 2px 1px 0 rgb(255 255 255 / 65%),inset -1px -1px 1px 1px rgb(255 255 255 / 65%),inset 0 0 0 1px var(--accent-inset,rgba(47,95,224,0.12))}
  .link-card.liquid-glass:hover .icon-circle{transform:none}
  .link-card.liquid-glass:active:not(.is-expanded){transform:scale(0.97)}
  .link-card.liquid-glass:active:not(.is-expanded) .icon-circle{transform:scale(0.96)}
}
@media (prefers-color-scheme:light){
  .liquid-glass{background-color:rgb(255 255 255 / 55%);box-shadow:var(--shadow,0 6px 6px rgb(0 0 0 / 8%),0 0 20px rgb(0 0 0 / 6%),0 0 14px var(--accent-glow-light,rgba(47,95,224,0.14)))}
  .link-card.liquid-glass{box-shadow:var(--shadow,0 6px 6px rgb(0 0 0 / 8%),0 0 20px rgb(0 0 0 / 6%),0 0 14px var(--accent-glow-light,rgba(47,95,224,0.14)))}
}
body[data-theme="light"] .liquid-glass{background-color:rgb(255 255 255 / 55%);box-shadow:var(--shadow,0 6px 6px rgb(0 0 0 / 8%),0 0 20px rgb(0 0 0 / 6%),0 0 14px var(--accent-glow-light,rgba(47,95,224,0.14)))}
body[data-theme="light"] .link-card.liquid-glass{box-shadow:var(--shadow,0 6px 6px rgb(0 0 0 / 8%),0 0 20px rgb(0 0 0 / 6%),0 0 14px var(--accent-glow-light,rgba(47,95,224,0.14)))}
body[data-theme="balanced"] .liquid-glass{background-color:rgb(255 255 255 / 14%)}
@media (hover:hover) and (pointer:fine){
  @media (prefers-color-scheme:light){
    .link-card.liquid-glass:hover{box-shadow:0 14px 28px rgb(0 0 0 / 14%),0 0 32px rgb(0 0 0 / 10%),0 0 0 1px rgb(255 255 255 / 42%),0 0 20px var(--accent-glow-light,rgba(47,95,224,0.22))}
  }
  body[data-theme="light"] .link-card.liquid-glass:hover{box-shadow:0 14px 28px rgb(0 0 0 / 14%),0 0 32px rgb(0 0 0 / 10%),0 0 0 1px rgb(255 255 255 / 42%),0 0 20px var(--accent-glow-light,rgba(47,95,224,0.22))}
}
@media (prefers-reduced-transparency:reduce),(prefers-reduced-motion:reduce){
  .liquid-glass::before{filter:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  .liquid-glass,.link-card.liquid-glass,.icon-circle{transition:none}
  .liquid-glass.is-expanded,.link-card.liquid-glass:hover,.link-card.liquid-glass:active,.link-card.liquid-glass.is-expanded{transform:none}
  .link-card.liquid-glass:hover .icon-circle,.link-card.liquid-glass:active .icon-circle{transform:none}
}
`.trim();
}

/**
 * Script: zoom (is-expanded) no card inteiro ao clicar, depois redireciona.
 * URLs vêm só do atributo href já escapado do HTML — sem interpolar dados do usuário no JS.
 */
export function liquidGlassNavScript(): string {
  return `<script>
(function(){
  var DUR=400;
  var busy=false;
  function go(a,href){
    if(a.getAttribute('target')==='_blank'){
      window.open(href,'_blank','noopener,noreferrer');
      a.classList.remove('is-expanded');
      a.classList.remove('is-navigating');
      busy=false;
      return;
    }
    window.location.href=href;
  }
  document.querySelectorAll('a.link-card.liquid-glass[href]').forEach(function(a){
    a.addEventListener('click',function(e){
      var href=a.getAttribute('href');
      if(!href||href.charAt(0)==='#')return;
      e.preventDefault();
      if(busy)return;
      busy=true;
      a.classList.add('is-navigating');
      a.classList.add('is-expanded');
      setTimeout(function(){go(a,href);},DUR);
    });
  });
})();
</script>`;
}

/**
 * CTA PAGINA interativo (Petr Knoll glass button), escopado em `.button-wrap` / `.cta-button`
 * para não afetar botões da chrome bar. Azul vibrante + texto branco (dark e light).
 * Largura 100% do container (mesma faixa do banner e dos link cards).
 */
export function interactiveCtaCss(): string {
  return `
@property --angle-1{syntax:"<angle>";inherits:false;initial-value:-75deg}
@property --angle-2{syntax:"<angle>";inherits:false;initial-value:-45deg}
.cta-area{--anim--hover-time:400ms;--anim--hover-ease:cubic-bezier(0.25,1,0.5,1);position:relative;z-index:2;margin:18px 0 0;display:flex;align-items:center;justify-content:center;width:100%;min-height:64px;font-size:15px;isolation:isolate}
.cta-dots{position:absolute;inset:-28px -12px;width:calc(100% + 24px);height:calc(100% + 56px);z-index:0;pointer-events:none;opacity:1}
.button-wrap{position:relative;z-index:2;width:100%;border-radius:999vw;background:transparent;pointer-events:none;transition:all var(--anim--hover-time) var(--anim--hover-ease)}
.button-shadow{--shadow-cuttoff-x:2em;position:absolute;width:calc(100% + var(--shadow-cuttoff-x));height:calc(100% + var(--shadow-cuttoff-x));top:calc(0% - var(--shadow-cuttoff-x) / 2);left:calc(0% - var(--shadow-cuttoff-x) / 2);filter:blur(clamp(2px,0.125em,12px));-webkit-filter:blur(clamp(2px,0.125em,12px));-moz-filter:blur(clamp(2px,0.125em,12px));-ms-filter:blur(clamp(2px,0.125em,12px));overflow:visible;pointer-events:none}
.button-shadow::after{content:"";position:absolute;z-index:0;inset:0;border-radius:999vw;background:linear-gradient(180deg,rgba(47,95,224,0.45),rgba(26,54,140,0.28));width:calc(100% - var(--shadow-cuttoff-x) - 0.25em);height:calc(100% - var(--shadow-cuttoff-x) - 0.25em);top:calc(var(--shadow-cuttoff-x) - 0.5em);left:calc(var(--shadow-cuttoff-x) - 0.875em);padding:0.125em;box-sizing:border-box;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;transition:all var(--anim--hover-time) var(--anim--hover-ease);overflow:visible;opacity:1}
.button-wrap .cta-button{--border-width:clamp(1px,0.0625em,4px);all:unset;cursor:pointer;position:relative;-webkit-tap-highlight-color:rgba(0,0,0,0);pointer-events:auto;z-index:3;display:block;width:100%;box-sizing:border-box;text-decoration:none;background:linear-gradient(-75deg,#2F5FE0 0%,#3D6FF0 48%,#4A7FFF 100%);border-radius:999vw;box-shadow:inset 0 0.125em 0.125em rgba(0,0,0,0.08),inset 0 -0.125em 0.125em rgba(255,255,255,0.45),0 0.25em 0.125em -0.125em rgba(15,40,120,0.35),0 0 0.12em 0.22em inset rgba(255,255,255,0.22),0 0 18px rgba(47,95,224,0.35);backdrop-filter:blur(clamp(6px,0.35em,10px));-webkit-backdrop-filter:blur(clamp(6px,0.35em,10px));-moz-backdrop-filter:blur(clamp(6px,0.35em,10px));-ms-backdrop-filter:blur(clamp(6px,0.35em,10px));transition:all var(--anim--hover-time) var(--anim--hover-ease)}
.button-wrap .cta-button:hover{transform:scale(0.975);background:linear-gradient(-75deg,#3A6AE8 0%,#4A7FFF 48%,#5B8CFF 100%);backdrop-filter:blur(clamp(8px,0.4em,12px));-webkit-backdrop-filter:blur(clamp(8px,0.4em,12px));-moz-backdrop-filter:blur(clamp(8px,0.4em,12px));-ms-backdrop-filter:blur(clamp(8px,0.4em,12px));box-shadow:inset 0 0.125em 0.125em rgba(0,0,0,0.06),inset 0 -0.125em 0.125em rgba(255,255,255,0.55),0 0.2em 0.12em -0.08em rgba(15,40,120,0.42),0 0 0.08em 0.14em inset rgba(255,255,255,0.4),0 0 22px rgba(74,127,255,0.45)}
.button-wrap .cta-button span{position:relative;display:block;width:100%;box-sizing:border-box;text-align:center;user-select:none;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;font-family:"Inter",sans-serif;letter-spacing:0.16em;font-weight:800;font-size:1em;color:#FFFFFF;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-shadow:0em 0.2em 0.06em rgba(0,0,0,0.28);transition:all var(--anim--hover-time) var(--anim--hover-ease);padding-inline:1em;padding-block:0.875em}
.button-wrap .cta-button:hover span{text-shadow:0.025em 0.025em 0.04em rgba(0,0,0,0.2)}
.button-wrap .cta-button span::after{content:"";display:block;position:absolute;z-index:1;width:calc(100% - var(--border-width));height:calc(100% - var(--border-width));top:calc(0% + var(--border-width) / 2);left:calc(0% + var(--border-width) / 2);box-sizing:border-box;border-radius:999vw;overflow:clip;background:linear-gradient(var(--angle-2),rgba(255,255,255,0) 0%,rgba(255,255,255,0.82) 38% 52%,rgba(255,255,255,0) 62%);z-index:3;mix-blend-mode:screen;pointer-events:none;background-size:200% 200%;background-position:0% 50%;background-repeat:no-repeat;transition:background-position calc(var(--anim--hover-time) * 1.25) var(--anim--hover-ease),--angle-2 calc(var(--anim--hover-time) * 1.25) var(--anim--hover-ease)}
.button-wrap .cta-button:hover span::after{background-position:32% 50%}
.button-wrap .cta-button:active span::after{background-position:55% 12%;--angle-2:-15deg}
@media (hover:none) and (pointer:coarse){
  .button-wrap .cta-button{backdrop-filter:blur(clamp(4px,0.25em,8px));-webkit-backdrop-filter:blur(clamp(4px,0.25em,8px));-moz-backdrop-filter:blur(clamp(4px,0.25em,8px));-ms-backdrop-filter:blur(clamp(4px,0.25em,8px))}
  .button-wrap .cta-button:hover{backdrop-filter:blur(clamp(4px,0.25em,8px));-webkit-backdrop-filter:blur(clamp(4px,0.25em,8px));-moz-backdrop-filter:blur(clamp(4px,0.25em,8px));-ms-backdrop-filter:blur(clamp(4px,0.25em,8px));background:linear-gradient(-75deg,#2F5FE0 0%,#3D6FF0 48%,#4A7FFF 100%);box-shadow:inset 0 0.125em 0.125em rgba(0,0,0,0.08),inset 0 -0.125em 0.125em rgba(255,255,255,0.45),0 0.25em 0.125em -0.125em rgba(15,40,120,0.35),0 0 0.12em 0.22em inset rgba(255,255,255,0.22),0 0 18px rgba(47,95,224,0.35)}
  .button-wrap .cta-button span::after,.button-wrap .cta-button:active span::after{--angle-2:-45deg}
}
.button-wrap .cta-button::after{content:"";position:absolute;z-index:1;inset:0;border-radius:999vw;width:calc(100% + var(--border-width));height:calc(100% + var(--border-width));top:calc(0% - var(--border-width) / 2);left:calc(0% - var(--border-width) / 2);padding:var(--border-width);box-sizing:border-box;background:conic-gradient(from var(--angle-1) at 50% 50%,rgba(15,40,120,0.55),rgba(0,0,0,0) 5% 40%,rgba(15,40,120,0.55) 50%,rgba(0,0,0,0) 60% 95%,rgba(15,40,120,0.55)),linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0.55));mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;transition:all var(--anim--hover-time) var(--anim--hover-ease),--angle-1 500ms ease;box-shadow:inset 0 0 0 calc(var(--border-width) / 2) rgba(255,255,255,0.55)}
.button-wrap .cta-button:hover::after{--angle-1:-125deg}
.button-wrap .cta-button:active::after{--angle-1:-75deg}
@media (hover:none) and (pointer:coarse){
  .button-wrap .cta-button::after,.button-wrap .cta-button:hover::after,.button-wrap .cta-button:active::after{--angle-1:-75deg}
}
.button-wrap:has(.cta-button:hover) .button-shadow{filter:blur(clamp(2px,0.0625em,6px));-webkit-filter:blur(clamp(2px,0.0625em,6px));-moz-filter:blur(clamp(2px,0.0625em,6px));-ms-filter:blur(clamp(2px,0.0625em,6px));transition:filter var(--anim--hover-time) var(--anim--hover-ease)}
.button-wrap:has(.cta-button:hover) .button-shadow::after{top:calc(var(--shadow-cuttoff-x) - 0.875em);opacity:1}
.button-wrap:has(.cta-button:active){transform:rotate3d(1,0,0,25deg)}
.button-wrap:has(.cta-button:active) .cta-button{background:linear-gradient(-75deg,#2854C8 0%,#2F5FE0 48%,#3D6FF0 100%);box-shadow:inset 0 0.125em 0.125em rgba(0,0,0,0.1),inset 0 -0.125em 0.125em rgba(255,255,255,0.4),0 0.125em 0.125em -0.125em rgba(15,40,120,0.3),0 0 0.1em 0.22em inset rgba(255,255,255,0.22),0 0.225em 0.05em 0 rgba(0,0,0,0.08),0 0.25em 0 0 rgba(255,255,255,0.55),inset 0 0.25em 0.05em 0 rgba(0,0,0,0.12)}
.button-wrap:has(.cta-button:active) .button-shadow{filter:blur(clamp(2px,0.125em,12px));-webkit-filter:blur(clamp(2px,0.125em,12px));-moz-filter:blur(clamp(2px,0.125em,12px));-ms-filter:blur(clamp(2px,0.125em,12px))}
.button-wrap:has(.cta-button:active) .button-shadow::after{top:calc(var(--shadow-cuttoff-x) - 0.5em);opacity:0.75}
.button-wrap:has(.cta-button:active) span{text-shadow:0.025em 0.25em 0.05em rgba(0,0,0,0.18)}
@media (prefers-color-scheme:light){
  .button-wrap .cta-button span{color:#FFFFFF;text-shadow:0em 0.15em 0.05em rgba(15,40,120,0.35)}
}
body[data-theme="light"] .button-wrap .cta-button span{color:#FFFFFF;text-shadow:0em 0.15em 0.05em rgba(15,40,120,0.35)}
`.trim();
}

/** Grade pontilhada atrás do CTA (não full-page). */
export function ctaDottedGridSvg(): string {
  return `<svg class="cta-dots" aria-hidden="true" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
<defs>
<pattern id="dottedGrid" width="30" height="30" patternUnits="userSpaceOnUse">
<circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.12)"/>
</pattern>
</defs>
<rect width="100%" height="100%" fill="url(#dottedGrid)"/>
</svg>`;
}

/** Markup do botão PAGINA com destino preservado. */
export function renderInteractiveCta(href: string, targetAttr: string): string {
  return `<div class="cta-area">
${ctaDottedGridSvg()}
<div class="button-wrap">
<a class="cta-button" href="${href}" rel="noopener noreferrer"${targetAttr} role="button"><span>PAGINA</span></a>
<div class="button-shadow"></div>
</div>
</div>`;
}

/** Ícone colorido sólido acima do vidro do card (sem camadas glass no círculo). */
export function wrapLinkIcon(innerSvg: string, iconClass: string): string {
  return `<span class="icon-circle ${iconClass}" aria-hidden="true">${innerSvg}</span>`;
}

/** @deprecated Use wrapLinkIcon — mantido para imports legados. */
export function wrapLiquidGlassIcon(innerSvg: string, iconClass: string): string {
  return wrapLinkIcon(innerSvg, iconClass);
}

/**
 * Modal "Sobre" ao tocar no logo/avatar quando há descrição longa.
 * Backdrop escurecido + painel liquid-glass; fade+scale alinhado aos cards.
 */
export function aboutModalCss(): string {
  return `
.avatar-trigger,.logo-trigger{display:block;margin:0 auto 14px;padding:0;border:0;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent;appearance:none}
.avatar-trigger:focus-visible,.logo-trigger:focus-visible{outline:2px solid rgba(255,255,255,0.65);outline-offset:3px;border-radius:14px}
.avatar-trigger .avatar,.logo-trigger .logo,.logo-trigger .logo-fallback{margin:0}
.about-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:24px 18px;opacity:0;visibility:hidden;pointer-events:none;transition:opacity 280ms cubic-bezier(0.25,1,0.5,1),visibility 280ms}
.about-overlay.is-open{opacity:1;visibility:visible;pointer-events:auto}
.about-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.58);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.about-sheet{position:relative;z-index:1;width:100%;max-width:360px;max-height:min(80vh,560px);overflow:auto;border-radius:24px;padding:28px 22px 24px;text-align:center;transform:scale(0.92);opacity:0;transition:transform 280ms cubic-bezier(0.25,1,0.5,1),opacity 280ms cubic-bezier(0.25,1,0.5,1);box-sizing:border-box}
.about-overlay.is-open .about-sheet{transform:scale(1);opacity:1}
.about-close{position:absolute;top:10px;right:10px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,0.14);color:inherit;font-size:22px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;z-index:2}
.about-close:active{opacity:.75}
.about-logo{margin:4px auto 16px}
.about-logo .avatar{display:block;margin:0 auto;width:112px;height:112px;border-radius:50%;object-fit:cover}
.about-logo .avatar.initial{display:flex;align-items:center;justify-content:center;border-radius:22px;border:none;font-size:42px;font-weight:800;color:#fff}
.about-logo .logo{display:block;margin:0 auto;max-width:148px;max-height:96px;width:auto;height:auto;object-fit:contain}
.about-logo .logo-fallback{width:112px;height:112px;margin:0 auto;border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:800;color:#fff}
.about-title{margin:0;font-size:20px;font-weight:800;line-height:1.2;letter-spacing:.06em;word-wrap:break-word;text-transform:uppercase}
.about-body{margin:14px 0 0;font-size:14px;line-height:1.55;font-weight:400;white-space:pre-line;word-wrap:break-word;text-align:left;opacity:.92}
@media (prefers-color-scheme:light){
  .about-backdrop{background:rgba(15,23,42,0.42)}
  .about-close{background:rgba(15,23,42,0.08)}
}
body[data-theme="light"] .about-backdrop{background:rgba(15,23,42,0.42)}
body[data-theme="light"] .about-close{background:rgba(15,23,42,0.08)}
@media (prefers-reduced-motion:reduce){
  .about-overlay,.about-sheet{transition:none}
  .about-overlay.is-open .about-sheet{transform:none}
}
`.trim();
}

/** Markup do modal (name/about/logo já escapados). Só incluir quando about não vazio. */
export function renderAboutModal(input: { nameHtml: string; aboutHtml: string; logoHtml: string }): string {
  return `<div class="about-overlay" id="about-overlay" aria-hidden="true">
<div class="about-backdrop" data-about-close tabindex="-1" aria-hidden="true"></div>
<div class="about-sheet liquid-glass" role="dialog" aria-modal="true" aria-labelledby="about-title">
<button type="button" class="about-close" data-about-close aria-label="Fechar">&times;</button>
<div class="about-logo">${input.logoHtml}</div>
<h2 class="about-title" id="about-title">${input.nameHtml}</h2>
<p class="about-body">${input.aboutHtml}</p>
</div>
</div>`;
}

/** Abre/fecha o modal: trigger data-about-open; fecha X, backdrop ou Escape. */
export function aboutModalScript(): string {
  return `<script>
(function(){
  var overlay=document.getElementById('about-overlay');
  if(!overlay)return;
  function open(){
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden','false');
    document.documentElement.style.overflow='hidden';
  }
  function close(){
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden','true');
    document.documentElement.style.overflow='';
  }
  document.querySelectorAll('[data-about-open]').forEach(function(el){
    el.addEventListener('click',function(e){e.preventDefault();open();});
  });
  overlay.querySelectorAll('[data-about-close]').forEach(function(el){
    el.addEventListener('click',function(e){e.preventDefault();close();});
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&overlay.classList.contains('is-open'))close();
  });
})();
</script>`;
}

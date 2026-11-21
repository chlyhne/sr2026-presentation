const SR_LANGUAGES={
 da:{locale:'da-DK',flag:'🇩🇰'},
 en:{locale:'en-GB',flag:'🇬🇧'},
 de:{locale:'de-DE',flag:'🇩🇪'},
 fr:{locale:'fr-FR',flag:'🇫🇷'}
};
const SR_LANGUAGE_KEY='sr-language';
let srLanguage=(()=>{
 const requested=new URL(location.href).searchParams.get('lang');
 let saved;
 try{saved=localStorage.getItem(SR_LANGUAGE_KEY);}catch{}
 return Object.hasOwn(SR_LANGUAGES,requested)?requested:Object.hasOwn(SR_LANGUAGES,saved)?saved:'da';
})();
let srLocale=SR_LANGUAGES[srLanguage].locale;
function srText(key,...values){
 const message=srLanguage==='da'||!Object.hasOwn(SR_MESSAGES,key)?key:SR_MESSAGES[key][SR_MESSAGE_LANGUAGES.indexOf(srLanguage)];
 return values.length?message.replace(/\{(\d+)\}/g,(placeholder,index)=>index<values.length?String(values[index]):placeholder):message;
}
function srLanguageURL(href,language=srLanguage){
 const url=new URL(href,document.baseURI);
 if(language!=='da'||url.searchParams.has('lang'))url.searchParams.set('lang',language);
 return url;
}

class SRMessageError extends Error{
 constructor(key,...values){
  super(srText(key,...values));
  this.key=key;this.values=values;
 }
}
function srErrorText(error){
 return error instanceof SRMessageError?srText(error.key,...error.values):srText(error?.message||String(error));
}

const srLanguageListeners=new Set();
function srOnLanguageChange(listener){srLanguageListeners.add(listener);}
const srStaticBindings=[];
const srLiveBindings=new WeakMap();
function srApplyBinding(binding){
 const text=binding.render();
 if(binding.read()!==text)binding.write(text);
 binding.last=binding.read();
}
function srBindAttribute(node,attribute,render){
 srBind(node,'@'+attribute,render);
}
function srBind(node,property,render){
 let bindings=srLiveBindings.get(node);
 if(!bindings){
  bindings=new Map();srLiveBindings.set(node,bindings);node.setAttribute('data-i18n-live','');
 }
 const attribute=property.startsWith('@')?property.slice(1):null;
 const binding=attribute
  ?{read:()=>node.getAttribute(attribute),write:value=>node.setAttribute(attribute,value),render}
  :{read:()=>node[property],write:value=>{node[property]=value;},render};
 bindings.set(property,binding);srApplyBinding(binding);
}
function srSyncLanguage(){
 document.documentElement.lang=srLanguage;
 try{localStorage.setItem(SR_LANGUAGE_KEY,srLanguage);}catch{}
 for(const binding of srStaticBindings){
  const live=srLiveBindings.get(binding.node);
  if(live?.has(binding.property)||live?.has(binding.property.replace(/^@/,'')))continue;
  if(binding.read()===binding.last)srApplyBinding(binding);
 }
 for(const node of document.querySelectorAll('[data-i18n-live]')){
  const bindings=srLiveBindings.get(node);if(!bindings)continue;
  for(const [property,binding] of bindings){
   if(binding.read()===binding.last)srApplyBinding(binding);
   else bindings.delete(property);
  }
 }
}
function srSetLanguage(language){
 if(language===srLanguage||!Object.hasOwn(SR_LANGUAGES,language))return;
 const url=new URL(location.href);
 url.searchParams.set('lang',language);
 history.replaceState(history.state,'',url);
 srLanguage=language;srLocale=SR_LANGUAGES[language].locale;
 srSyncLanguage();
 for(const listener of srLanguageListeners)listener();
}

for(const element of document.querySelectorAll('[data-i18n]')){
 for(const node of element.childNodes){
  if(node.nodeType!==Node.TEXT_NODE)continue;
  const original=node.data,key=original.trim();
  if(!key)continue;
  const binding={node:element,property:'textContent',read:()=>node.data,write:value=>{node.data=value;},render:()=>original.replace(key,()=>srText(key))};
  srStaticBindings.push(binding);srApplyBinding(binding);
 }
}
for(const element of document.querySelectorAll('[data-i18n-attrs]')){
 for(const attr of element.dataset.i18nAttrs.split(' ')){
  const key=element.getAttribute(attr);
  const binding={node:element,property:'@'+attr,read:()=>element.getAttribute(attr),write:value=>element.setAttribute(attr,value),render:()=>srText(key)};
  srStaticBindings.push(binding);srApplyBinding(binding);
 }
}
srSyncLanguage();

for(const picker of document.querySelectorAll('[data-language-picker]')){
 const button=picker.querySelector('button'),panel=picker.querySelector('[data-languages]');
 const choices=panel.querySelectorAll('[lang]');
 const toggle=open=>{
  panel.hidden=!open;button.setAttribute('aria-expanded',String(open));
 };
 function updatePicker(){
  button.textContent=SR_LANGUAGES[srLanguage].flag;
  for(const choice of choices){
   const url=new URL(location.href);
   url.searchParams.set('lang',choice.lang);choice.href=url;
   if(choice.lang===srLanguage)choice.setAttribute('aria-current','true');
   else choice.removeAttribute('aria-current');
  }
 }
 updatePicker();srOnLanguageChange(updatePicker);
 button.onclick=()=>toggle(panel.hidden);
 picker.onmousedown=event=>{
  if(event.button===0&&document.activeElement?.matches?.('input,textarea,[contenteditable="true"]'))event.preventDefault();
 };
 for(const choice of choices){
  choice.onclick=event=>{
   if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   event.preventDefault();
   const focused=picker.contains(document.activeElement);
   srSetLanguage(choice.lang);toggle(false);if(focused)button.focus();
  };
 }
 document.addEventListener('click',event=>{if(!picker.contains(event.target))toggle(false);});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!panel.hidden){
   event.preventDefault();event.stopImmediatePropagation();toggle(false);button.focus();
  }
 },true);
}

const fs=require('node:fs'),vm=require('node:vm');
const scripts=['i18n-messages','i18n'].map(name=>fs.readFileSync('viewer/'+name+'.js','utf8')).join('\n');

function viewerTestContext(globals={},language='da'){
 const href='https://viewer.test/?lang='+language;
 const context=vm.createContext({URL,location:{href},document:{documentElement:{},querySelectorAll:()=>[],baseURI:href},...globals});
 const {document,location}=context;
 context.document={documentElement:{},querySelectorAll:()=>[],baseURI:href};
 context.location={href};
 vm.runInContext(scripts,context);
 context.document=document;context.location=location;
 return context;
}
module.exports=viewerTestContext;

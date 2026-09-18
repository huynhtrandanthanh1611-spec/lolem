const parts=['./app-parts/part-00.txt','./app-parts/part-01.txt','./app-parts/part-02.txt','./app-parts/part-03.txt','./app-parts/part-04.txt','./app-parts/part-05.txt'];
const source=(await Promise.all(parts.map(async p=>{const r=await fetch(p,{cache:'no-cache'});if(!r.ok)throw new Error(`Không tải được ${p}`);return r.text()}))).join('');
const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
try{await import(url)}finally{URL.revokeObjectURL(url)}

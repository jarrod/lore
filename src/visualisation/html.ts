import type { GraphEdge, GraphNode } from "../index/graph";

export interface VisualisationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  root?: string;
}

export function renderVisualisation(graph: VisualisationGraph): string {
  const encoded = JSON.stringify(graph)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  const labelsDefault = graph.edges.length <= 100 ? "checked" : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<title>Lore knowledge graph</title>
<style>
:root{color-scheme:light dark;--bg:#f8fafc;--surface:#fff;--text:#172033;--muted:#5d687b;--border:#ccd3df;--edge:#7b8799;--focus:#275fcb;--missing:#9b3745;--type-0:#3568b8;--type-1:#8b4dac;--type-2:#0e7c73;--type-3:#a65d16;--type-4:#a43f65;--type-5:#4c6f2d;--type-6:#5961a8;--type-7:#16708b}
@media(prefers-color-scheme:dark){:root{--bg:#10141d;--surface:#181e29;--text:#eef2f8;--muted:#aeb8c8;--border:#3a4557;--edge:#8d99aa;--focus:#82adff;--missing:#f18493;--type-0:#5f91df;--type-1:#b77bd2;--type-2:#3ca79c;--type-3:#d58a43;--type-4:#d06b8b;--type-5:#80a85a;--type-6:#858dde;--type-7:#4ba0b8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:18px 20px 12px;border-bottom:1px solid var(--border);background:var(--surface)}h1{font-size:19px;line-height:1.2;margin:0 0 3px;font-weight:600}.summary{color:var(--muted);font-size:13px}.controls{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.controls label{display:flex;align-items:center;gap:6px;color:var(--muted)}input[type=search]{width:min(280px,40vw);padding:7px 9px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text)}button{padding:7px 10px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);cursor:pointer}button:hover{border-color:var(--focus)}button:focus-visible,input:focus-visible,.node:focus-visible{outline:3px solid var(--focus);outline-offset:2px}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 280px;height:calc(100vh - 75px);min-height:500px}.plot{position:relative;min-width:0;overflow:hidden}.plot svg{width:100%;height:100%;display:block;background:var(--bg);touch-action:none}.details{border-left:1px solid var(--border);background:var(--surface);padding:16px;overflow:auto}.details h2{font-size:15px;margin:0 0 14px}.details dl{display:grid;grid-template-columns:72px 1fr;gap:8px;margin:0}.details dt{color:var(--muted)}.details dd{margin:0;overflow-wrap:anywhere}.hint{color:var(--muted)}.edge{stroke:var(--edge);stroke-width:1.4;opacity:.72;vector-effect:non-scaling-stroke}.edge.markdown{stroke-dasharray:5 4}.edge-label{fill:var(--muted);font-size:10px;text-anchor:middle;pointer-events:none;paint-order:stroke;stroke:var(--bg);stroke-width:4px;stroke-linejoin:round}.node{cursor:pointer}.node circle{stroke:var(--surface);stroke-width:2;vector-effect:non-scaling-stroke}.node.missing circle{fill:var(--surface)!important;stroke:var(--missing);stroke-width:2;stroke-dasharray:5 3}.node.selected circle{stroke:var(--focus);stroke-width:4}.node.dimmed{opacity:.16}.node text{fill:var(--text);font-size:11px;text-anchor:middle;pointer-events:none;paint-order:stroke;stroke:var(--bg);stroke-width:4px;stroke-linejoin:round}.legend{position:absolute;left:12px;bottom:12px;display:flex;flex-wrap:wrap;gap:8px 12px;max-width:calc(100% - 24px);padding:7px 9px;border:1px solid var(--border);border-radius:5px;background:color-mix(in srgb,var(--surface) 92%,transparent);font-size:11px;color:var(--muted)}.legend span{display:inline-flex;align-items:center;gap:5px}.swatch{width:9px;height:9px;border-radius:50%}.line-swatch{width:18px;border-top:2px solid var(--edge)}.line-swatch.markdown{border-top-style:dashed}@media(max-width:720px){header{align-items:stretch;flex-direction:column}.workspace{grid-template-columns:1fr;height:auto}.plot{height:70vh;min-height:440px}.details{border-left:0;border-top:1px solid var(--border);min-height:180px}input[type=search]{width:min(100%,300px)}}
</style>
</head>
<body>
<header>
  <div><h1>Lore knowledge graph</h1><div class="summary" id="summary"></div></div>
  <div class="controls">
    <input id="search" type="search" aria-label="Search concepts" placeholder="Search title or ID">
    <label><input id="labels" type="checkbox" ${labelsDefault}> Edge labels</label>
    <button id="reset" type="button">Reset view</button>
  </div>
</header>
<main class="workspace">
  <section class="plot" aria-label="Interactive knowledge graph">
    <svg id="graph" viewBox="0 0 1200 800" role="img" aria-labelledby="graph-title graph-description">
      <title id="graph-title">Lore knowledge graph</title>
      <desc id="graph-description">Directed relationships between knowledge concepts. Select a concept for details.</desc>
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge)"></path></marker></defs>
      <g id="viewport"><g id="edges"></g><g id="edge-labels"></g><g id="nodes"></g></g>
    </svg>
    <div class="legend" id="legend" aria-label="Graph legend"></div>
  </section>
  <aside class="details" aria-live="polite"><h2>Selected concept</h2><div id="details" class="hint">Select a node to inspect its metadata.</div></aside>
</main>
<script id="lore-data" type="application/json">${encoded}</script>
<script>
(function(){
  'use strict';
  var data=JSON.parse(document.getElementById('lore-data').textContent);
  var svg=document.getElementById('graph'),viewport=document.getElementById('viewport'),edgeLayer=document.getElementById('edges'),labelLayer=document.getElementById('edge-labels'),nodeLayer=document.getElementById('nodes');
  var search=document.getElementById('search'),labels=document.getElementById('labels'),details=document.getElementById('details'),legend=document.getElementById('legend');
  var width=1200,height=800,view={x:0,y:0,k:1},drag=null,pan=null;
  var types=Array.from(new Set(data.nodes.filter(function(n){return !n.missing;}).map(function(n){return n.type||'Concept';}))).sort();
  var typeColor=new Map(types.map(function(type,index){return [type,'var(--type-'+(index%8)+')'];}));
  function hash(value){var h=2166136261;for(var i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  var nodes=data.nodes.map(function(node,index){var h=hash(node.id),angle=(h%6283)/1000,radius=120+(h%260);return Object.assign({},node,{x:width/2+Math.cos(angle)*radius,y:height/2+Math.sin(angle)*radius,vx:0,vy:0,index:index});});
  var byId=new Map(nodes.map(function(node){return [node.id,node];}));
  var edges=data.edges.map(function(edge){return Object.assign({},edge,{source:byId.get(edge.from),target:byId.get(edge.to)});}).filter(function(edge){return edge.source&&edge.target;});
  for(var tick=0;tick<80;tick++){
    for(var i=0;i<nodes.length;i++){for(var j=i+1;j<nodes.length;j++){var a=nodes[i],b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,d2=Math.max(100,dx*dx+dy*dy),force=900/d2;a.vx+=dx*force;a.vy+=dy*force;b.vx-=dx*force;b.vy-=dy*force;}}
    edges.forEach(function(edge){var dx=edge.target.x-edge.source.x,dy=edge.target.y-edge.source.y,d=Math.max(1,Math.sqrt(dx*dx+dy*dy)),force=(d-115)*.0025,fx=dx/d*force,fy=dy/d*force;edge.source.vx+=fx;edge.source.vy+=fy;edge.target.vx-=fx;edge.target.vy-=fy;});
    nodes.forEach(function(node){node.vx+=(width/2-node.x)*.0008;node.vy+=(height/2-node.y)*.0008;node.vx*=.82;node.vy*=.82;node.x=Math.max(30,Math.min(width-30,node.x+node.vx));node.y=Math.max(30,Math.min(height-30,node.y+node.vy));});
  }
  function element(name,attributes){var item=document.createElementNS('http://www.w3.org/2000/svg',name);Object.keys(attributes||{}).forEach(function(key){item.setAttribute(key,String(attributes[key]));});return item;}
  var edgeViews=edges.map(function(edge){var line=element('line',{class:'edge '+edge.origin,'marker-end':'url(#arrow)'});edgeLayer.appendChild(line);var text=element('text',{class:'edge-label'});text.textContent=edge.rel;labelLayer.appendChild(text);return {edge:edge,line:line,text:text};});
  function shortLabel(value){return value.length>42?value.slice(0,39)+'…':value;}
  var nodeViews=nodes.map(function(node){var fullLabel=node.title||node.id,group=element('g',{class:'node'+(node.missing?' missing':''),role:'button',tabindex:'0','aria-label':fullLabel+' concept'}),circle=element('circle',{r:node.missing?12:15,fill:node.missing?'var(--surface)':typeColor.get(node.type||'Concept')}),text=element('text',{y:31}),title=element('title');text.textContent=shortLabel(fullLabel);title.textContent=fullLabel;group.appendChild(title);group.appendChild(circle);group.appendChild(text);nodeLayer.appendChild(group);group.addEventListener('click',function(event){event.stopPropagation();select(node);});group.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();select(node);}});group.addEventListener('pointerdown',function(event){event.stopPropagation();group.setPointerCapture(event.pointerId);drag={node:node,lastX:event.clientX,lastY:event.clientY};select(node);});return {node:node,group:group};});
  function render(){viewport.setAttribute('transform','translate('+view.x+' '+view.y+') scale('+view.k+')');edgeViews.forEach(function(item){var edge=item.edge;item.line.setAttribute('x1',edge.source.x);item.line.setAttribute('y1',edge.source.y);item.line.setAttribute('x2',edge.target.x);item.line.setAttribute('y2',edge.target.y);item.text.setAttribute('x',(edge.source.x+edge.target.x)/2);item.text.setAttribute('y',(edge.source.y+edge.target.y)/2-4);item.text.style.display=labels.checked?'':'none';});nodeViews.forEach(function(item){item.group.setAttribute('transform','translate('+item.node.x+' '+item.node.y+')');});}
  function field(term,value,container){var dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=term;dd.textContent=value===null||value===undefined||value===''?'Unspecified':String(value);container.appendChild(dt);container.appendChild(dd);}
  function select(node){nodeViews.forEach(function(item){item.group.classList.toggle('selected',item.node===node);});var dl=document.createElement('dl'),incoming=edges.filter(function(edge){return edge.target===node;}).length,outgoing=edges.filter(function(edge){return edge.source===node;}).length;field('ID',node.id,dl);field('Title',node.title,dl);field('Type',node.missing?'Missing target':node.type,dl);field('Status',node.status,dl);field('Trust',node.trust,dl);field('Incoming',incoming,dl);field('Outgoing',outgoing,dl);details.replaceChildren(dl);}
  function applySearch(){var query=search.value.trim().toLowerCase();nodeViews.forEach(function(item){var match=!query||(item.node.id+' '+(item.node.title||'')+' '+(item.node.type||'')).toLowerCase().includes(query);item.group.classList.toggle('dimmed',!match);});}
  function reset(){view={x:0,y:0,k:1};render();}
  svg.addEventListener('wheel',function(event){event.preventDefault();var rect=svg.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width*width,py=(event.clientY-rect.top)/rect.height*height,next=Math.max(.25,Math.min(4,view.k*Math.exp(-event.deltaY*.001)));view.x=px-(px-view.x)*next/view.k;view.y=py-(py-view.y)*next/view.k;view.k=next;render();},{passive:false});
  svg.addEventListener('pointerdown',function(event){svg.setPointerCapture(event.pointerId);pan={x:event.clientX,y:event.clientY,viewX:view.x,viewY:view.y};});
  svg.addEventListener('pointermove',function(event){if(drag){var rect=svg.getBoundingClientRect(),scaleX=width/rect.width/view.k,scaleY=height/rect.height/view.k;drag.node.x+=(event.clientX-drag.lastX)*scaleX;drag.node.y+=(event.clientY-drag.lastY)*scaleY;drag.lastX=event.clientX;drag.lastY=event.clientY;render();}else if(pan){var rect=svg.getBoundingClientRect();view.x=pan.viewX+(event.clientX-pan.x)*width/rect.width;view.y=pan.viewY+(event.clientY-pan.y)*height/rect.height;render();}});
  function endPointer(){drag=null;pan=null;}svg.addEventListener('pointerup',endPointer);svg.addEventListener('pointercancel',endPointer);
  search.addEventListener('input',applySearch);labels.addEventListener('change',render);document.getElementById('reset').addEventListener('click',reset);
  types.forEach(function(type,index){var item=document.createElement('span'),swatch=document.createElement('i');swatch.className='swatch';swatch.style.background='var(--type-'+(index%8)+')';item.appendChild(swatch);item.appendChild(document.createTextNode(type));legend.appendChild(item);});
  [['Typed',''],['Markdown','markdown']].forEach(function(entry){var item=document.createElement('span'),line=document.createElement('i');line.className='line-swatch '+entry[1];item.appendChild(line);item.appendChild(document.createTextNode(entry[0]));legend.appendChild(item);});
  document.getElementById('summary').textContent=nodes.length+' concepts · '+edges.length+' relationships'+(data.root?' · rooted at '+data.root:'');
  render();
})();
</script>
</body>
</html>
`;
}

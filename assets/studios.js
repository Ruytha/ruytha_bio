document.documentElement.classList.add('js');
// stagger the children of each [data-r] block, reveal it once it scrolls in
document.querySelectorAll('[data-r]').forEach(function(g){[].forEach.call(g.children,function(c,i){c.style.setProperty('--n',i)})});
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -12% 0px'});
document.querySelectorAll('[data-r]').forEach(function(g){io.observe(g)});

// phone menu
(function(){var b=document.querySelector('.menu-btn'),m=document.getElementById('mnav');if(!b||!m)return;
  [].forEach.call(m.querySelectorAll('.w>*'),function(a,i){a.style.setProperty('--n',i)});
  function set(on){b.setAttribute('aria-expanded',on);b.setAttribute('aria-label',on?'Close menu':'Menu');m.hidden=!on}
  b.addEventListener('click',function(){set(m.hidden)});
  addEventListener('keydown',function(e){if(e.key==='Escape'&&!m.hidden){set(false);b.focus()}});
  matchMedia('(min-width: 721px)').addEventListener('change',function(q){if(q.matches)set(false)})})();

// brief builder: writes the email, opens it in the visitor's mail app, nothing is sent from here
(function(){var f=document.getElementById('brief');if(!f)return;var out=document.getElementById('briefText'),st=document.getElementById('briefStatus');
  function kind(){return f.querySelector('input[name=kind]:checked').value}
  function text(){var k=kind(),w=f.elements.when.value.trim(),a=f.elements.about.value.trim();
    return 'Hi Ruytha! I\'d like to work with Ruytha Studios on '+k+'.'+(w?'\nTimeline: '+w+'.':'')+(a?'\n\n'+a:'')}
  function upd(){out.textContent=text()}
  f.addEventListener('input',upd);upd();
  f.addEventListener('submit',function(e){e.preventDefault();var t=text();
    // also copy it, in case this device has no mail app to open
    if(navigator.clipboard)navigator.clipboard.writeText(t).catch(function(){});
    st.textContent='Opening your email app. If nothing opens, the message is copied: paste it into an email to studios@ruytha.dev.';
    location.href='mailto:studios@ruytha.dev?subject='+encodeURIComponent('Project brief: '+kind())+'&body='+encodeURIComponent(t)})})();

// studio reel: plays muted on loop, pauses off screen, never autoplays with reduced motion
(function(){var v=document.querySelector('.reel-video'),b=document.querySelector('.reel-toggle');if(!v||!b)return;
  var wanted=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  function sync(){var on=!v.paused;b.textContent=on?'Pause':'Play';b.setAttribute('aria-pressed',String(!on));b.setAttribute('aria-label',(on?'Pause':'Play')+' the background reel')}
  function play(){var p=v.play();if(p&&p.catch)p.catch(sync)}
  b.addEventListener('click',function(){wanted=v.paused;wanted?play():v.pause()});
  v.addEventListener('play',sync);v.addEventListener('pause',sync);
  new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting&&wanted)play();else if(!e.isIntersecting)v.pause()})},{threshold:.25}).observe(v);
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&wanted&&v.getBoundingClientRect().top<innerHeight)play()});
  sync()})();

// intro clip: plays muted while it's on screen, never with reduced motion
(function(){var v=document.querySelector('.intro video');if(!v||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){var p=v.play();if(p&&p.catch)p.catch(function(){})}else v.pause()})},{threshold:.4}).observe(v)})();

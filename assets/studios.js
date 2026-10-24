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

// brief builder: writes a message to paste into Discord, nothing is sent
(function(){var f=document.getElementById('brief');if(!f)return;var out=document.getElementById('briefText'),st=document.getElementById('briefStatus');
  function text(){var k=f.querySelector('input[name=kind]:checked').value,w=f.elements.when.value.trim(),a=f.elements.about.value.trim();
    return 'Hi Ruytha! I\'d like to work with Ruytha Studios on '+k+'.'+(w?'\nTimeline: '+w+'.':'')+(a?'\n\n'+a:'')}
  function upd(){out.textContent=text()}
  f.addEventListener('input',upd);upd();
  f.addEventListener('submit',function(e){e.preventDefault();var t=text();
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){st.textContent='Copied. Paste it into Discord.'},function(){st.textContent='Copy the message above, then paste it into Discord.'});
    window.open('https://discord.com/users/690508522395402260','_blank','noopener')})})();

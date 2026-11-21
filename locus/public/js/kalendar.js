                                                                     
                                                                       
                                                                   
                                                     
  
                                                                
                                                                  
                                                                    
                                                               
                                                                    
  
                                                                    
                                                                      

(function () {
  'use strict';
  if(window.KALENDAR)return;
  var activeClose=null,activeInput=null,sequence=0,lastPointer=null;
  document.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')lastPointer={x:event.clientX,y:event.clientY};},true);
  var openDelay=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hover-open-delay'))||90,closeDelay=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hover-close-delay'))||120;
  function closeActive(){if(activeClose)activeClose();}
  function hoverAvailable(){return matchMedia('(hover:hover) and (pointer:fine)').matches;}

  var MESJACY = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
                                                                
  var DNI = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

  var TELEFON = 760;

                                             
                                                                
                                                                   
                                                              
                                        
  function razobrat(iso) {
    if (!iso) return null;
    var ch = String(iso).slice(0, 10).split('-');
    if (ch.length !== 3) return null;
    var g = +ch[0], m = +ch[1], d = +ch[2];
    if (!g || !m || !d) return null;
    var dt = new Date(g, m - 1, d);
                                                                      
    if (dt.getFullYear() !== g || dt.getMonth() !== m - 1
        || dt.getDate() !== d) return null;
    return dt;
  }

  function v_iso(dt) {
    var m = dt.getMonth() + 1, d = dt.getDate();
    return dt.getFullYear() + '-' + (m < 10 ? '0' + m : m)
      + '-' + (d < 10 ? '0' + d : d);
  }

  function segodnja() {
    var iso = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
    return razobrat(iso);
  }

                                                             
                                                      
  function nachalo_setki(god, mes) {
    var p = new Date(god, mes, 1);
    var sdvig = (p.getDay() + 6) % 7;
    return new Date(god, mes, 1 - sdvig);
  }

  function odin_den(a, b) {
    return !!a && !!b && a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

                            
  function narisovat_setku(god, mes, vybrano, min, max) {
    var sej = segodnja();
    var start = nachalo_setki(god, mes);
    var ryadov = 6;                                                            
    var out = '<div class="dk-dni">';
    for (var i = 0; i < 7; i++) out += '<span class="dk-dn">' + DNI[i] + '</span>';
    out += '</div><div class="dk-setka">';
    for (var k = 0; k < ryadov * 7; k++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k);
      var chuzhoj = d.getMonth() !== mes;
      var iso = v_iso(d);
      var vne = (min && iso < min) || (max && iso > max);
      var kl = 'dk-d';
      if (chuzhoj) kl += ' chuzh';
      if (odin_den(d, sej)) kl += ' sej';
      if (odin_den(d, vybrano)) kl += ' vyb';
      if (vne) kl += ' vne';
      out += '<button type="button" class="' + kl + '" data-iso="' + iso + '"'
        + (vne ? ' disabled' : '')
        + ' aria-label="' + d.getDate() + ' ' + MESJACY[d.getMonth()] + ' '
        + d.getFullYear() + '"'
        + (odin_den(d, vybrano) ? ' aria-current="date"' : '')
        + '>' + d.getDate() + '</button>';
    }
    return out + '</div>';
  }

  function razmetka(god, mes, vybrano, min, max) {
    return '<div class="dk-shapka">'
      + '<button type="button" class="dk-str" data-hod="-1" aria-label="прошлый месяц">'
      + '<svg viewBox="0 0 16 16" fill="none"><path d="M10 3.5 5.5 8l4.5 4.5"'
      + ' stroke="currentColor" stroke-width="1.4" stroke-linecap="round"'
      + ' stroke-linejoin="round"/></svg></button>'
      + '<span class="dk-mes">' + MESJACY[mes] + ' ' + god + '</span>'
      + '<button type="button" class="dk-str" data-hod="1" aria-label="следующий месяц">'
      + '<svg viewBox="0 0 16 16" fill="none"><path d="M6 3.5 10.5 8 6 12.5"'
      + ' stroke="currentColor" stroke-width="1.4" stroke-linecap="round"'
      + ' stroke-linejoin="round"/></svg></button></div>'
      + narisovat_setku(god, mes, vybrano, min, max)
      + '<div class="dk-niz">'
      + '<button type="button" class="dk-kn" data-dk="sej">сегодня</button>'
      + '<button type="button" class="dk-kn dk-snjat" data-dk="snjat">убрать дату</button>'
      + '</div>';
  }

                          
  function povesit(pole) {
    if (!pole || pole.dataset.kalendar === '1') return;
    var originallyReadOnly=pole.readOnly;
    pole.dataset.kalendar = '1';
                                                       
    pole.setAttribute('readonly', 'readonly');
    pole.classList.add('dk-pole');

                                                               
                                                                  
                                                                  
                                                                
    var pometit = function () { pole.classList.toggle('pusto', !pole.value); };
    pometit();
    pole.addEventListener('input', pometit);
    pole.addEventListener('change', pometit);

    var panel = null, fon = null, god, mes, otkryt_snizu = false,enterTimer,leaveTimer,keyboard=false,focusedDay=null,hoverBlock=lastPointer;
    pole.setAttribute('aria-haspopup','dialog');pole.setAttribute('aria-expanded','false');

    function telefon() { return window.innerWidth <= TELEFON; }

                                                                   
                                                                  
                                                             
                                                             
                           
    function zakryt(vybral) {
      clearTimeout(enterTimer);clearTimeout(leaveTimer);
      if (!panel) return;
                                                                             
                                                                      
      hoverBlock=lastPointer;
      if(activeClose===closeOwn){activeClose=null;activeInput=null;}
      panel.remove(); panel = null;
      if (fon) { fon.remove(); fon = null; }
      document.removeEventListener('keydown', po_klavishe, true);
      document.removeEventListener('mousedown', mimo, true);
      window.removeEventListener('resize', pri_razmere);
      window.removeEventListener('scroll', pri_skrolle, true);
      pole.classList.remove('dk-otkryt');
      pole.setAttribute('aria-expanded','false');pole.removeAttribute('aria-controls');pole.removeAttribute('aria-activedescendant');keyboard=false;
                                                                 
                                                                 
                                                       
      if (vybral) {
        try { pole.focus({ preventScroll: true }); } catch (e) { pole.focus(); }
        pole.blur();
      }
    }
    function closeOwn(){zakryt(false);}

    function postavit(iso) {
      if(pole.disabled||pole.closest('[inert]')||pole.value===(iso||''))return;
      if(!iso&&pole.required||iso&&((pole.min&&iso<pole.min)||(pole.max&&iso>pole.max)))return;
      pole.value = iso || '';
                                                               
                                                              
      pole.dispatchEvent(new Event('input', { bubbles: true }));
      pole.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function pererisovat() {
      if (!panel) return;
      var vyb = razobrat(pole.value);
      panel.querySelector('.dk-telo').innerHTML =
        razmetka(god, mes, vyb, pole.min || '', pole.max || '');
      panel.querySelector('[data-dk="snjat"]').disabled=pole.required;
      for(var day of panel.querySelectorAll('.dk-d')){day.tabIndex=-1;day.id=panel.id+'-'+day.dataset.iso;day.setAttribute('aria-label',razobrat(day.dataset.iso).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}));if(focusedDay&&day.dataset.iso===v_iso(focusedDay)){day.classList.add('dk-fokus');pole.setAttribute('aria-activedescendant',day.id);}}
    }

    function po_klavishe(e) {
      if (e.key === 'Escape') { var restore=keyboard||e.target===pole||panel?.contains(document.activeElement);e.preventDefault(); e.stopPropagation(); zakryt(); if(restore)pole.focus(); }
      else if(e.key==='Tab')zakryt();
      else if(panel&&e.target===pole&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Enter',' '].includes(e.key)){
        e.preventDefault();e.stopPropagation();keyboard=true;
        if(e.key==='Enter'||e.key===' '){if(focusedDay){postavit(v_iso(focusedDay));zakryt(true);}return;}
        var next=new Date(focusedDay||razobrat(pole.value)||segodnja());
        if(e.key==='PageUp'||e.key==='PageDown'){var oldDay=next.getDate();next.setDate(1);next.setMonth(next.getMonth()+(e.key==='PageUp'?-1:1)*(e.shiftKey?12:1));next.setDate(Math.min(oldDay,new Date(next.getFullYear(),next.getMonth()+1,0).getDate()));}
        else next.setDate(next.getDate()+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-((next.getDay()+6)%7),End:6-((next.getDay()+6)%7)})[e.key]);
        if(pole.min&&v_iso(next)<pole.min)next=razobrat(pole.min);if(pole.max&&v_iso(next)>pole.max)next=razobrat(pole.max);
        if(next){focusedDay=next;god=next.getFullYear();mes=next.getMonth();pererisovat();}
      }
    }

    function mimo(e) {
      if (panel && !panel.contains(e.target) && e.target !== pole) zakryt();
    }

                                                                  
                                                                  
    function pri_skrolle() {
      if (!panel || otkryt_snizu) return;
      postavit_mesto();
    }
    function pri_razmere(){
      if(!panel)return;if(!pole.isConnected){zakryt();return;}
      if(telefon()!==otkryt_snizu){var keepKeyboard=keyboard;zakryt();keyboard=keepKeyboard;otkryt();}
      else if(!otkryt_snizu)postavit_mesto();
    }

    function postavit_mesto() {
      var k = pole.getBoundingClientRect();
      var vysota = panel.offsetHeight || 330;
      var shirina = panel.offsetWidth || 290;
      var snizu = k.bottom + 6;
                                               
      if (snizu + vysota > window.innerHeight - 8) {
        if (k.top - vysota - 6 > 8) snizu = k.top - vysota - 6;
                                                                   
                                                                    
        else snizu = Math.max(8, window.innerHeight - vysota - 8);
      }
      var levo = k.left;
      if (levo + shirina > window.innerWidth - 8) levo = window.innerWidth - shirina - 8;
      if (levo < 8) levo = 8;
      panel.style.top = Math.max(8, snizu) + 'px';
      panel.style.left = levo + 'px';
    }

    function otkryt() {
      if(pole.disabled||originallyReadOnly||pole.getAttribute('aria-disabled')==='true'||pole.closest('[inert]'))return;
      clearTimeout(enterTimer);clearTimeout(leaveTimer);
      if (panel) return;
      closeActive();window.LocusControls?.close();window.LocusSuggestions?.close();document.querySelectorAll('.vyp.otkryt').forEach(v=>v.locusClose?.());
      activeClose=closeOwn;activeInput=pole;
      var vyb = razobrat(pole.value) || razobrat(pole.min) || segodnja();
                                                                            
      if (pole.min && v_iso(vyb) < pole.min) vyb = razobrat(pole.min) || vyb;
      if (pole.max && v_iso(vyb) > pole.max) vyb = razobrat(pole.max) || vyb;
      god = vyb.getFullYear(); mes = vyb.getMonth();focusedDay=vyb;
      otkryt_snizu = telefon();

      panel = document.createElement('div');
      panel.className = 'dk' + (otkryt_snizu ? ' dk-shtorka' : '');
      panel.id='locus-calendar-'+(++sequence);pole.setAttribute('aria-expanded','true');pole.setAttribute('aria-controls',panel.id);
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'выбор даты');
      panel.innerHTML = (otkryt_snizu ? '<span class="dk-uhvat"></span>' : '')
        + '<div class="dk-telo"></div>';

      if (otkryt_snizu) {
        fon = document.createElement('div');
        fon.className = 'dk-fon';
        fon.addEventListener('click', zakryt);
        document.body.appendChild(fon);
      }
      document.body.appendChild(panel);
      panel.addEventListener('pointerenter',()=>clearTimeout(leaveTimer));
      panel.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch'&&hoverAvailable()&&!keyboard&&!otkryt_snizu)leaveTimer=setTimeout(()=>{if(panel&&!pole.matches(':hover')&&!panel.matches(':hover'))zakryt();},closeDelay);});
      pererisovat();
      if (!otkryt_snizu) postavit_mesto();
      pole.classList.add('dk-otkryt');

                                                              
                                                                  
                                                                   
                                                               
                                                              
                                                                  
      panel.addEventListener('mousedown', function (e) {
        var den = e.target.closest('.dk-d');
        var kn = e.target.closest('[data-dk]');
        if (den && !den.disabled) {
          e.preventDefault();
          postavit(den.dataset.iso);
        } else if (kn&&!kn.disabled) {
          e.preventDefault();
          if (kn.dataset.dk === 'snjat') postavit('');
          else {
            var s0 = segodnja(), i0 = v_iso(s0);
            if (!((pole.min && i0 < pole.min) || (pole.max && i0 > pole.max))) postavit(i0);
          }
        } else e.preventDefault();
      });

      panel.addEventListener('click', function (e) {
        var hod = e.target.closest('[data-hod]');
        if (hod) {
          mes += +hod.dataset.hod;
          if (mes < 0) { mes = 11; god--; }
          if (mes > 11) { mes = 0; god++; }
          pererisovat();
          return;
        }
                                                             
                                                             
        var kn = e.target.closest('[data-dk]');
        if (kn) {
          if (kn.dataset.dk === 'snjat') { zakryt(true); return; }
          var s = segodnja(), iso = v_iso(s);
          if ((pole.min && iso < pole.min) || (pole.max && iso > pole.max)) {
                                                                     
            god = s.getFullYear(); mes = s.getMonth(); pererisovat(); return;
          }
          zakryt(true); return;
        }
        var den = e.target.closest('.dk-d');
        if (den && !den.disabled) zakryt(true);
      });

      document.addEventListener('keydown', po_klavishe, true);
                                                                 
                                 
      setTimeout(function () {
        document.addEventListener('mousedown', mimo, true);
      }, 0);
      window.addEventListener('resize', pri_razmere);
      window.addEventListener('scroll', pri_skrolle, true);
    }

                                                              
                                                             
                                                              
                                                               
                                                            
                                                                  
                                                           
                                                                  
                                                           
    pole.addEventListener('mousedown', function (e) {
      e.preventDefault();
      keyboard=false;
      otkryt();
    });
                                                             
    pole.addEventListener('click', function (e) { e.preventDefault(); });
    pole.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();keyboard=true;otkryt();
      }
    });
    function hoverOpen(event){if(event.pointerType==='touch'||!hoverAvailable())return;if(hoverBlock&&event.clientX===hoverBlock.x&&event.clientY===hoverBlock.y)return;hoverBlock=null;clearTimeout(leaveTimer);clearTimeout(enterTimer);enterTimer=setTimeout(()=>{if(pole.isConnected&&pole.matches(':hover'))otkryt();},openDelay);}
    pole.addEventListener('pointerenter',hoverOpen);
    pole.addEventListener('pointermove',event=>{if(hoverBlock)hoverOpen(event);});
    pole.addEventListener('pointerleave',event=>{if(event.pointerType==='touch'||!hoverAvailable())return;hoverBlock=null;clearTimeout(enterTimer);if(!keyboard&&!otkryt_snizu)leaveTimer=setTimeout(()=>{if(panel&&!panel.matches(':hover')&&!pole.matches(':hover'))zakryt();},closeDelay);});
    pole.locusDateOpen=otkryt;
  }

                                                                
                                                                
  function vse(koren) {
    var mesto = koren || document;
    mesto.querySelectorAll('input[type="date"]').forEach(povesit);
  }

                                                                   
                                                                    
  function sledit() {
    if (!document.body) return;
    new MutationObserver(function (zapisi) {
      if(activeInput&&!activeInput.isConnected)closeActive();
      for (var i = 0; i < zapisi.length; i++) {
        var dob = zapisi[i].addedNodes;
        for (var k = 0; k < dob.length; k++) {
          var u = dob[k];
          if (u.nodeType !== 1) continue;
          if (u.matches && u.matches('input[type="date"]')) povesit(u);
          else if (u.querySelectorAll) vse(u);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function start() { vse(); sledit(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else start();

  window.KALENDAR = { povesit: povesit, vse: vse, zakryt: closeActive };
})();

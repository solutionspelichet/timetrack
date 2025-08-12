// ==============================
// TimeTrack (Google Sheets only) - ES2018 safe
// ==============================

(function(){
  var HARDCODED_GAS_URL = "https://script.google.com/macros/s/AKfycbytSVwrFniXpF5BCasoxBkz48X2MZtsEb-xOY_R5LfBxr-0fCY7iIrC9nL7rkGy5E9smQ/exec";
  var CONFIG = {
    GAS_URL: (typeof window !== 'undefined' && window.GAS_URL) ? window.GAS_URL : HARDCODED_GAS_URL
  };
  console.log('GAS_URL', CONFIG.GAS_URL);

  var calendarMonth = (new Date()).getMonth();
  var calendarYear = (new Date()).getFullYear();
  var weekOffset = 0;

  // ---------- Utils ----------
  function ymdLocal(d){
    if(!d) d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth()+1).padStart(2,'0');
    var day = String(d.getDate()).padStart(2,'0');
    return y + '-' + m + '-' + day;
  }
 function timeToMinutes(t){
  if(!t) return 0;
  var s = String(t);
  var m = s.match(/(\d{1,2}):(\d{2})/);   // extrait HH:MM où qu’il soit
  if(!m) return 0;
  var h = parseInt(m[1],10)||0;
  var mm = parseInt(m[2],10)||0;
  return h*60+mm;
}
  function minutesToHHMM(min){
    var h = Math.floor(min/60);
    var m = min%60;
    return String(h).padStart(2,'0')+'h'+String(m).padStart(2,'0');
  }
  function calcDuration(start,end,pause){
    if(!pause && pause!==0) pause = 60;
    if(!start || !end) return 0;
    return Math.max(0, timeToMinutes(end)-timeToMinutes(start)-pause);
  }
  function showToast(msg, type){
    console.log('['+(type||'info')+']', msg);
  }

  // ---------- API Google Apps Script ----------
  var API = {
    updateDay: function(date, data){
      var form = new URLSearchParams();
      form.set('date', date);
      form.set('data', JSON.stringify(data));
      return fetch(CONFIG.GAS_URL+'?action=update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      }).then(function(r){
        if(!r.ok) throw new Error('update failed');
        return r.json().catch(function(){return {ok:true};});
      });
    },
    deleteDay: function(date){
      var form = new URLSearchParams();
      form.set('date', date);
      return fetch(CONFIG.GAS_URL+'?action=delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      }).then(function(r){
        if(!r.ok) throw new Error('delete failed');
        return r.json().catch(function(){return {ok:true};});
      });
    },
    getRange: function(start, end){
      return fetch(CONFIG.GAS_URL+'?action=range&start='+start+'&end='+end)
        .then(function(r){ if(!r.ok) throw new Error('range failed'); return r.json(); })
        .then(function(obj){ return obj || {}; });
    }
  };

  // ---------- Tabs ----------
  function initTabs(){
    var btns = document.querySelectorAll('.tab-button');
    for (var i=0;i<btns.length;i++){
      (function(btn){
        btn.addEventListener('click', function(){
          var allBtn = document.querySelectorAll('.tab-button');
          for (var j=0;j<allBtn.length;j++){
            if(allBtn[j].classList.contains('bg-blue-200')){
              allBtn[j].classList.remove('bg-blue-200');
              allBtn[j].classList.add('bg-gray-200');
            }
          }
          var panels = document.querySelectorAll('.tab-content');
          for (var k=0;k<panels.length;k++){ panels[k].classList.add('hidden'); }
          btn.classList.remove('bg-gray-200');
          btn.classList.add('bg-blue-200');
          var id = btn.getAttribute('data-tab');
          var el = document.getElementById(id);
          if (el) el.classList.remove('hidden');
          if (id==='hebdo') loadWeeklyView();
          if (id==='calendrier') loadCalendarView();
          if (id==='conges') initCongesTab();
        });
      })(btns[i]);
    }
  }

  // ---------- Pointage ----------
  function initPointage(){
    var startBtn = document.getElementById('start');
    var stopBtn = document.getElementById('stop');
    var saveManual = document.getElementById('saveManual');
    var delToday = document.getElementById('deleteToday');
    var startInput = document.getElementById('manualStart');
    var endInput = document.getElementById('manualEnd');
    var pauseInput = document.getElementById('manualPause');
    var noteInput = document.getElementById('manualNote');
    var durationEl = document.getElementById('current-duration');

    function updateDurationDisplay(){
      if(!startInput || !endInput || !pauseInput || !durationEl) return;
      var dur = calcDuration(startInput.value, endInput.value, Number(pauseInput.value||0));
      durationEl.textContent = dur ? ('Durée: '+minutesToHHMM(dur)) : '';
    }

    if(startBtn){ startBtn.addEventListener('click', function(){
      var now = new Date();
      if(startInput) startInput.value = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
      updateDurationDisplay();
    });}

    if(stopBtn){ stopBtn.addEventListener('click', function(){
      var now = new Date();
      if(endInput) endInput.value = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
      updateDurationDisplay();
      saveToday();
    });}

    if(saveManual){ saveManual.addEventListener('click', saveToday); }
    if(delToday){ delToday.addEventListener('click', function(){
      var date = ymdLocal(new Date());
      API.deleteDay(date).then(function(){ showToast('Jour supprimé','warning'); })
        .catch(function(){ showToast('Suppression échouée','error'); });
    });}

    ['change','input'].forEach(function(ev){
      if(startInput) startInput.addEventListener(ev, updateDurationDisplay);
      if(endInput) endInput.addEventListener(ev, updateDurationDisplay);
      if(pauseInput) pauseInput.addEventListener(ev, updateDurationDisplay);
    });

    function saveToday(){
      var date = ymdLocal(new Date());
      var data = {
        date: date,
        start: (startInput && startInput.value) ? startInput.value : '',
        end: (endInput && endInput.value) ? endInput.value : '',
        pause: Number((pauseInput && pauseInput.value) ? pauseInput.value : 60),
        note: (noteInput && noteInput.value) ? noteInput.value : '',
        type: 'normal'
      };
      data.duration = minutesToHHMM(calcDuration(data.start, data.end, data.pause));
      API.updateDay(date, data).then(function(){
        showToast('Jour enregistré','success');
      }).catch(function(){
        showToast('Échec enregistrement','error');
      });
    }
  }

  // ---------- Hebdo ----------
  function mondayOfWeek(date, offset){
    if(offset==null) offset=0;
    var d = new Date(date);
    d.setDate(d.getDate() + offset*7);
    var day = (d.getDay()+6)%7;
    d.setDate(d.getDate()-day);
    d.setHours(0,0,0,0);
    return d;
  }
  function loadWeeklyView(){
    var monday = mondayOfWeek(new Date(), weekOffset);
    var sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
    var start = ymdLocal(monday), end = ymdLocal(sunday);
    API.getRange(start,end).then(function(data){
      var tbody = document.querySelector('#weeklyTable tbody');
      var title = document.getElementById('weekTitle');
      var totalEl = document.getElementById('weekTotal');
      if(!tbody || !title || !totalEl) return;
      tbody.innerHTML = '';
      var total = 0;
      for (var i=0;i<7;i++){
        var d = new Date(monday); d.setDate(monday.getDate()+i);
        var ymd = ymdLocal(d);
        var row = document.createElement('tr');
        row.className = 'border-b';
        var day = data[ymd] ? data[ymd] : {};
        var pauseVal = (typeof day.pause!=='undefined' && day.pause!==null) ? Number(day.pause) : 60;
        var durMin = calcDuration(day.start, day.end, pauseVal);
        total += durMin;
        row.innerHTML =
          '<td class="px-3 py-2">'+ d.toLocaleDateString('fr-FR',{weekday:'short', day:'2-digit', month:'2-digit'}) +'</td>'+
          '<td class="px-3 py-2">'+ (day.start||'') +'</td>'+
          '<td class="px-3 py-2">'+ (day.end||'') +'</td>'+
          '<td class="px-3 py-2">'+ pauseVal +' min</td>'+
          '<td class="px-3 py-2">'+ (durMin?minutesToHHMM(durMin):'00h00') +'</td>'+
          '<td class="px-3 py-2">'+ (day.note||'') +'</td>'+
          '<td class="px-3 py-2">'+ (day.type||'normal') +'</td>';
        tbody.appendChild(row);
      }
      totalEl.textContent = minutesToHHMM(total);
      title.textContent = monday.toLocaleDateString('fr-FR')+' — '+sunday.toLocaleDateString('fr-FR');
    }).catch(function(e){ console.warn('hebdo err', e); });
  }
  function initWeeklyNav(){
    var pw=document.getElementById('prevWeek'); if(pw){ pw.addEventListener('click', function(){ weekOffset--; loadWeeklyView(); }); }
    var nw=document.getElementById('nextWeek'); if(nw){ nw.addEventListener('click', function(){ weekOffset++; loadWeeklyView(); }); }
  }

  // ---------- Calendrier ----------
  function loadCalendarView(){
    var grid = document.getElementById('calendar-grid');
    if(!grid) return;
    grid.innerHTML = '';
    var year = calendarYear, month = calendarMonth;
    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month+1, 0);
    var totalDays = lastDay.getDate();
    var startDayOfWeek = (firstDay.getDay()+6)%7;
    var title = firstDay.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
    var titleElement = document.getElementById('calendar-title');
    if (titleElement) titleElement.textContent = title.charAt(0).toUpperCase()+title.slice(1);

    API.getRange(ymdLocal(firstDay), ymdLocal(lastDay)).then(function(data){
      for (var i=0;i<startDayOfWeek;i++){ var e=document.createElement('div'); e.className='p-2'; grid.appendChild(e); }
      for (var d=1; d<=totalDays; d++){
        var dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        var cell = document.createElement('div');
        var dayData = data[dateStr] || null;
        var jsDate = new Date(dateStr);
        var isWeekend = (jsDate.getDay()===0 || jsDate.getDay()===6);
        var bg='bg-gray-200', text='text-gray-800', emoji='';
        if (dayData && dayData.type==='holiday'){ bg='bg-blue-300'; text='text-blue-900'; emoji='🏖️'; }
        else if (dayData && dayData.type==='leave'){ bg='bg-indigo-300'; text='text-indigo-900'; emoji='🌴'; }
        else if (isWeekend){ bg='bg-gray-300'; text='text-gray-700'; }
        cell.className = bg + ' p-2 rounded min-h-16';
        var header = document.createElement('div');
        header.className = 'flex items-center justify-between ' + text;
        header.innerHTML = '<span class="font-semibold">'+ d +'</span><span>'+ emoji +'</span>';
        cell.appendChild(header);
        if (dayData){
          var pauseVal = (typeof dayData.pause!=='undefined' && dayData.pause!==null) ? Number(dayData.pause) : 60;
          var durMin = calcDuration(dayData.start, dayData.end, pauseVal);
          if (durMin){
            var dur = document.createElement('div');
            dur.className = 'text-xs mt-1';
            dur.textContent = minutesToHHMM(durMin);
            cell.appendChild(dur);
          }
        }
        (function(dateStr, dayData){
          cell.addEventListener('click', function(){ openModal(dateStr, dayData); });
        })(dateStr, dayData);
        grid.appendChild(cell);
      }
    });
  }
  function initCalendarNav(){
    var pm=document.getElementById('prevMonth'); if(pm){ pm.addEventListener('click', function(){ calendarMonth--; if(calendarMonth<0){calendarMonth=11; calendarYear--;} loadCalendarView(); }); }
    var nm=document.getElementById('nextMonth'); if(nm){ nm.addEventListener('click', function(){ calendarMonth++; if(calendarMonth>11){calendarMonth=0; calendarYear++;} loadCalendarView(); }); }
  }
  function openModal(date, data){
    if(!data) data = {};
    var modal = document.getElementById('calendar-modal'); if(!modal) return;
    var label = document.getElementById('modal-date-label');
    var startInput = document.getElementById('modal-start');
    var endInput = document.getElementById('modal-end');
    var pauseInput = document.getElementById('modal-pause');
    var noteInput = document.getElementById('modal-note');
    var typeInput = document.getElementById('modal-type');
    label.textContent = (new Date(date)).toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    startInput.value = data.start||''; endInput.value = data.end||'';
    pauseInput.value = (typeof data.pause!=='undefined' && data.pause!==null) ? data.pause : 60;
    noteInput.value = data.note||'';
    typeInput.value = data.type ? data.type : 'normal';
    modal.classList.remove('hidden'); modal.classList.add('flex');

    document.getElementById('modal-close').onclick = function(){ modal.classList.add('hidden'); modal.classList.remove('flex'); };
    document.getElementById('modal-save').onclick = function(){
      var payload = {
        date: date,
        start: startInput.value||'',
        end: endInput.value||'',
        pause: Number(pauseInput.value||60),
        note: noteInput.value||'',
        type: typeInput.value||'normal'
      };
      payload.duration = minutesToHHMM(calcDuration(payload.start,payload.end,payload.pause));
      API.updateDay(date, payload).then(function(){
        showToast('Enregistré','success'); loadCalendarView(); loadWeeklyView();
      }).catch(function(){ showToast('Échec enregistrement','error'); });
      modal.classList.add('hidden'); modal.classList.remove('flex');
    };
    document.getElementById('modal-delete').onclick = function(){
      API.deleteDay(date).then(function(){ showToast('Supprimé','warning'); loadCalendarView(); loadWeeklyView(); })
      .catch(function(){ showToast('Échec suppression','error'); });
      modal.classList.add('hidden'); modal.classList.remove('flex');
    };
  }

  // ---------- Congés ----------
  function createLeavePeriod(startDate, endDate, leaveType, note, includeWeekends){
    if(!leaveType) leaveType='vacances';
    if(!note) note='Congés';
    includeWeekends = !!includeWeekends;
    var start = new Date(startDate), end = new Date(endDate);
    if (isNaN(start) || isNaN(end) || end < start){ showToast('Période invalide','error'); return Promise.resolve(0); }
    var count=0;
    var chain = Promise.resolve();
    for (var d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
      (function(dcopy){
        chain = chain.then(function(){
          var ymd = ymdLocal(dcopy);
          var jsDay = dcopy.getDay();
          if (!includeWeekends && (jsDay===0 || jsDay===6)) return null;
          var data = { date: ymd, start:'', end:'', pause:0, note: (note? note+' ' : '')+'['+leaveType+']', type:'leave', duration:'' };
          return API.updateDay(ymd, data).then(function(){ count++; }).catch(function(){});
        });
      })(new Date(d));
    }
    return chain.then(function(){ showToast(count+' jour(s) de congé ajoutés','success'); return count; });
  }
  function renderLeaveList(){
    var container = document.getElementById('leave-list');
    if(!container) return;
    var today = new Date();
    var from = new Date(today); from.setFullYear(today.getFullYear()-1);
    var to = new Date(today); to.setFullYear(today.getFullYear()+1);
    API.getRange(ymdLocal(from), ymdLocal(to)).then(function(data){
      var entries = Object.keys(data).map(function(k){ return [k,data[k]]; })
        .filter(function(pair){ return pair[1] && pair[1].type==='leave'; })
        .sort(function(a,b){ return a[0].localeCompare(b[0]); });
      container.innerHTML='';
      if(entries.length===0){ container.innerHTML='<div class="p-3 text-sm text-gray-500">Aucun congé.</div>'; return; }
      entries.forEach(function(pair){
        var date = pair[0], obj = pair[1];
        var row = document.createElement('div'); row.className='flex items-center justify-between p-2';
        var label = document.createElement('div'); label.className='text-sm';
        label.textContent = (new Date(date)).toLocaleDateString('fr-FR',{weekday:'short', year:'numeric', month:'short', day:'numeric'}) + (obj.note? ' — '+obj.note : '');
        var btn = document.createElement('button'); btn.className='text-red-600 hover:underline text-sm'; btn.textContent='Supprimer';
        btn.addEventListener('click', function(){ API.deleteDay(date).then(function(){ renderLeaveList(); loadCalendarView(); }); });
        row.appendChild(label); row.appendChild(btn);
        container.appendChild(row);
      });
    });
  }
  function initCongesTab(){
    var start = document.getElementById('leave-start');
    var end = document.getElementById('leave-end');
    var type = document.getElementById('leave-type');
    var note = document.getElementById('leave-note');
    var add = document.getElementById('leave-add');
    var clear = document.getElementById('leave-clear');
    var today = ymdLocal(new Date());
    if(start) start.value=today;
    if(end) end.value=today;
    if(add){ add.addEventListener('click', function(){
      createLeavePeriod(start.value,end.value,type.value,note.value,false).then(function(){ renderLeaveList(); });
    });}
    if(clear){ clear.addEventListener('click', function(){
      var today = new Date(); var from = new Date(today); from.setFullYear(today.getFullYear()-1);
      var to = new Date(today); to.setFullYear(today.getFullYear()+1);
      API.getRange(ymdLocal(from), ymdLocal(to)).then(function(data){
        var entries = Object.keys(data).filter(function(d){ return data[d] && data[d].type==='leave'; });
        var chain = Promise.resolve();
        entries.forEach(function(d){ chain = chain.then(function(){ return API.deleteDay(d).catch(function(){}); }); });
        chain.then(function(){ renderLeaveList(); loadCalendarView(); showToast('Tous les congés (±1 an) supprimés','warning'); });
      });
    });}
    renderLeaveList();
  }

  // ---------- Export ----------
  function toCSV(rows){
    return rows.map(function(r){
      return r.map(function(v){
        v = (v==null?'':String(v)).replace(/"/g,'""');
        return '"'+v+'"';
      }).join(';');
    }).join('\n');
  }
  function initExportTab(){
    var startInput = document.getElementById('export-start');
    var endInput = document.getElementById('export-end');
    var btnCsv = document.getElementById('export-csv');
    var today = new Date();
    var firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    var lastDay = new Date(today.getFullYear(), today.getMonth()+1, 0);
    if(startInput) startInput.value = ymdLocal(firstDay);
    if(endInput) endInput.value = ymdLocal(lastDay);
    if(btnCsv){ btnCsv.addEventListener('click', function(){
      var start = startInput.value, end = endInput.value;
      API.getRange(start,end).then(function(data){
        var header = ['date','start','end','pause','duration','note','type'];
        var rows = [header];
        Object.keys(data).sort().forEach(function(d){
          var v = data[d] || {};
          var pauseVal = (typeof v.pause!=='undefined' && v.pause!==null) ? Number(v.pause) : 60;
          var dur = minutesToHHMM(calcDuration(v.start, v.end, pauseVal));
          rows.push([d, v.start||'', v.end||'', pauseVal, dur, v.note||'', v.type||'normal']);
        });
        var csv = toCSV(rows);
        var blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = 'timetrack.csv'; a.click();
        URL.revokeObjectURL(url);
      });
    });}
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', function(){
    initTabs();
    initPointage();
    initWeeklyNav();
    initCalendarNav();
    initExportTab();
    loadWeeklyView();
    loadCalendarView();
    console.log('🚀 TimeTrack (Google Sheets only) initialisé');
  });
})();
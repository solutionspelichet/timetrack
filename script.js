// =====================================
// TimeTrack PWA - Version SIMPLIFIÉE SANS ERREURS
// =====================================

const CONFIG = {
  API_BASE: 'https://timetrack-api.onrender.com/api',
  OFFLINE_MODE: false,
  INITIAL_SYNC_DONE: false
};

let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

// Utilitaire: date locale YYYY-MM-DD
function ymdLocal(d=new Date()){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}


// =====================================
// STOCKAGE LOCAL
// =====================================
const Storage = {
  get: (key) => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },
  
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
};

// =====================================
// GESTION DES DONNÉES AVEC CONGÉS
// =====================================
const TimeData = {
  getAll: () => Storage.get('timetrack_data') || {},
  
  saveDay: async (date, data) => {
    const allData = TimeData.getAll();
    allData[date] = data;
    Storage.set('timetrack_data', allData);
    
    // Essayer de sauvegarder sur le cloud
    if (!CONFIG.OFFLINE_MODE) {
      try {
        await fetch(`${CONFIG.API_BASE}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: date,
            start: data.start,
            end: data.end,
            pause: data.pause,
            note: data.note
          })
        });
        showToast('Sauvegardé localement et sur Google Sheets', 'success');
      } catch (error) {
        showToast('Sauvegardé localement seulement', 'warning');
      }
    } else {
      showToast('Sauvegardé localement', 'success');
    }
    
    return true;
  },
  
  // Création de jour spécial (férié/congé)
  createSpecialDay: async (date, type = 'holiday', note = 'Jour spécial') => {
    const holidayData = {
      date: date,
      start: '09:00',
      end: '17:00', 
      pause: 60,
      note: note,
      type: type // 'holiday' ou 'leave'
    };
    
    await TimeData.saveDay(date, holidayData);
    return holidayData;
  },
  
  // Vérifier si un jour est un congé
  isHoliday: (date) => {
    const data = TimeData.getAll()[date];
    return data && data.type === 'holiday';
  },
  
  // Vérifier si c'est un weekend
  isWeekend: (date) => {
    const day = new Date(date).getDay();
    return day === 0 || day === 6; // Dimanche = 0, Samedi = 6
  },
  
  getRange: async (startDate, endDate) => {
    // Essayer de récupérer depuis le cloud d'abord
    if (!CONFIG.OFFLINE_MODE) {
      try {
        const response = await fetch(`${CONFIG.API_BASE}/range?start=${startDate}&end=${endDate}`);
        if (response.ok) {
          const cloudData = await response.json();
          return cloudData;
        }
      } catch (error) {
        console.log('Utilisation des données locales');
      }
    }
    
    // Utiliser les données locales
    const localData = TimeData.getAll();
    const result = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayData = localData[dateStr];
      
      if (dayData) {
        const duration = calculateDuration(dayData.start, dayData.end, dayData.pause || 60);
        result.push([
          dateStr,
          dayData.start || '',
          dayData.end || '',
          (dayData.pause || 60) + ' min',
          formatMinutes(duration),
          dayData.note || ''
        ]);
      } else {
        result.push([dateStr, '', '', '60 min', '00h00', '']);
      }
    }
    
    return result;
  },
  
  
  ,
  // Supprimer un jour
  deleteDay: async (date) => {
    const allData = TimeData.getAll();
    if (allData[date]) {
      delete allData[date];
      Storage.set('timetrack_data', allData);
      // Optionnel: appeler API pour delete si dispo
      return true;
    }
    return false;
  },
  
  // Compat: ancien nom pour les jours fériés
  createHolidayDay: async (date, note = 'Jour férié') => {
    return await TimeData.createSpecialDay(date, 'holiday', note);
  }
clear: () => {
    Storage.set('timetrack_data', {});
    return true;
  }
};

// =====================================
// UTILITAIRES
// =====================================
function calculateDuration(start, end, pause) {
  if (!start || !end) return 0;
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const duration = endMinutes - startMinutes - (pause || 60);
  return Math.max(0, duration);
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function formatMinutes(minutes) {
  if (minutes <= 0) return "00h00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h.toString().padStart(2, '0') + 'h' + m.toString().padStart(2, '0');
}

function showToast(message, type) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.className = 'toast show ' + (type || 'success');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// =====================================
// EXPORT EXCEL SIMPLE
// =====================================
async function exportToExcel(data, filename) {
  console.log('🚀 Export Excel:', filename);
  
  try {
    // Charger SheetJS
    if (!window.XLSX) {
      showToast('Chargement de la bibliothèque Excel...', 'warning');
      await loadSheetJS();
    }
    
    // Préparer les données
    const excelData = [];
    excelData.push(['Date', 'Jour', 'Début', 'Fin', 'Pause', 'Durée', 'Note']);
    
    let totalMinutes = 0;
    let daysWorked = 0;
    
    data.forEach(row => {
      const date = row[0];
      const start = row[1];
      const end = row[2];
      const pause = row[3];  
      const duration = row[4];
      const note = row[5];
      
      const dayName = new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' });
      const pauseNum = parseInt(pause) || 60;
      const durationMinutes = calculateDuration(start, end, pauseNum);
      
      if (durationMinutes > 0) {
        totalMinutes += durationMinutes;
        daysWorked++;
      }
      
      excelData.push([
        date,
        dayName,
        start,
        end,
        pauseNum + ' min',
        duration,
        note
      ]);
    });
    
    // Ajouter les statistiques
    excelData.push(['', '', '', '', '', '', '']);
    excelData.push(['TOTAL', '', '', '', '', formatMinutes(totalMinutes), '']);
    excelData.push(['JOURS TRAVAILLÉS', '', '', '', '', daysWorked, '']);
    
    // Créer le fichier Excel
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(excelData);
    window.XLSX.utils.book_append_sheet(wb, ws, 'TimeTrack');
    
    // Télécharger
    const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Export Excel terminé !', 'success');
    
  } catch (error) {
    console.error('Erreur Excel:', error);
    
    // Fallback HTML
    exportToHTML(data, filename.replace('.xlsx', '.xls'));
    showToast('Export HTML Excel créé', 'warning');
  }
}

function loadSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Erreur chargement SheetJS'));
    document.head.appendChild(script);
  });
}

function exportToHTML(data, filename) {
  let html = '<table border="1">';
  html += '<tr style="background: #2563eb; color: white;"><th>Date</th><th>Jour</th><th>Début</th><th>Fin</th><th>Pause</th><th>Durée</th><th>Note</th></tr>';
  
  data.forEach(row => {
    const date = row[0];
    const dayName = new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' });
    html += '<tr>';
    html += '<td>' + date + '</td>';
    html += '<td>' + dayName + '</td>';
    html += '<td>' + (row[1] || '') + '</td>';
    html += '<td>' + (row[2] || '') + '</td>';
    html += '<td>' + (row[3] || '60 min') + '</td>';
    html += '<td>' + (row[4] || '00h00') + '</td>';
    html += '<td>' + (row[5] || '') + '</td>';
    html += '</tr>';
  });
  
  html += '</table>';
  
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =====================================
// EXPORTS STANDARDS
// =====================================
function exportToCSV(data, filename) {
  const headers = ['Date', 'Début', 'Fin', 'Pause', 'Durée', 'Note'];
  let csv = headers.join(',') + '\n';
  
  data.forEach(row => {
    const csvRow = row.map(cell => {
      const str = String(cell || '');
      if (str.includes(',') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    });
    csv += csvRow.join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportToJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =====================================
// GESTION DES ONGLETS
// =====================================
function initTabs() {
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      // Désactiver tous les onglets
      document.querySelectorAll('.tab-button').forEach(b => {
        b.classList.remove('bg-blue-200');
        b.classList.add('bg-gray-200');
      });
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.add('hidden');
      });
      
      // Activer l'onglet cliqué
      button.classList.remove('bg-gray-200');
      button.classList.add('bg-blue-200');
      const tabId = button.getAttribute('data-tab');
      const content = document.getElementById(tabId);
      if (content) {
        content.classList.remove('hidden');
      }
      
      // Charger le contenu selon l'onglet
      if (tabId === 'export') {
        initExportTab();
      } else if (tabId === 'hebdo') {
        loadWeeklyView();
      } else if (tabId === 'calendrier') {
        loadCalendarView();
      }
    });
  });
}

// =====================================
// VUE HEBDOMADAIRE
// =====================================
async function loadWeeklyView() {
  console.log('📅 Chargement vue hebdomadaire...');
  
  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - 6);
  const formattedStart = startDate.toISOString().split('T')[0];
  const formattedEnd = today.toISOString().split('T')[0];

  try {
    const data = await TimeData.getRange(formattedStart, formattedEnd);
    renderWeeklyTable(data);
  } catch (error) {
    console.error('Erreur chargement semaine:', error);
    showToast('Erreur lors du chargement de la semaine', 'error');
  }
}

function renderWeeklyTable(data) {
  const tbody = document.getElementById('hebdo-body');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  let totalMinutes = 0;

  data.forEach(row => {
    const [date, debut, fin, pause, durée, note] = row;
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';

    // Date avec nom du jour
    const dayName = new Date(date).toLocaleDateString('fr-FR', { weekday: 'short' });
    const formattedDate = new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    
    const tdDate = document.createElement('td');
    tdDate.innerHTML = `<div class="font-medium">${dayName}</div><div class="text-xs text-gray-500">${formattedDate}</div>`;
    tdDate.className = 'p-2 border';
    tr.appendChild(tdDate);

    // Début
    const tdStart = document.createElement('td');
    const inputStart = document.createElement('input');
    inputStart.type = 'time';
    inputStart.value = debut || '';
    inputStart.className = 'w-full border rounded px-2 py-1';
    inputStart.onchange = () => updateWeeklyCell(date, inputStart.value, null, pause, tr);
    tdStart.appendChild(inputStart);
    tdStart.className = 'p-2 border';
    tr.appendChild(tdStart);

    // Fin
    const tdEnd = document.createElement('td');
    const inputEnd = document.createElement('input');
    inputEnd.type = 'time';
    inputEnd.value = fin || '';
    inputEnd.className = 'w-full border rounded px-2 py-1';
    inputEnd.onchange = () => updateWeeklyCell(date, null, inputEnd.value, pause, tr);
    tdEnd.appendChild(inputEnd);
    tdEnd.className = 'p-2 border';
    tr.appendChild(tdEnd);

    // Pause
    const tdPause = document.createElement('td');
    tdPause.textContent = pause || '60 min';
    tdPause.className = 'p-2 border text-center';
    tr.appendChild(tdPause);

    // Durée
    const tdDurée = document.createElement('td');
    const durationMinutes = calculateDuration(debut, fin, parseInt(pause) || 60);
    totalMinutes += durationMinutes > 0 ? durationMinutes : 0;
    tdDurée.textContent = formatMinutes(durationMinutes);
    tdDurée.className = 'p-2 border text-center font-mono';
    tdDurée.dataset.durationCell = 'true';
    tr.appendChild(tdDurée);

    // Note
    const tdNote = document.createElement('td');
    tdNote.textContent = note || '';
    tdNote.className = 'p-2 border text-xs';
    tr.appendChild(tdNote);

    tbody.appendChild(tr);
  });

  // Total
  const totalRow = document.createElement('tr');
  totalRow.className = 'bg-gray-100 font-bold';
  totalRow.innerHTML = `
    <td colspan="4" class="p-2 border text-right">Total semaine</td>
    <td class="p-2 border text-center font-mono">${formatMinutes(totalMinutes)}</td>
    <td class="p-2 border"></td>
  `;
  tbody.appendChild(totalRow);
  
  // Mettre à jour l'affichage du total
  const weeklyTotal = document.getElementById('weekly-total');
  if (weeklyTotal) {
    weeklyTotal.textContent = formatMinutes(totalMinutes);
  }
}

async function updateWeeklyCell(date, newStart, newEnd, pause, rowElement) {
  const rowInputs = rowElement.querySelectorAll("input[type='time']");
  const start = newStart || (rowInputs[0] ? rowInputs[0].value : '');
  const end = newEnd || (rowInputs[1] ? rowInputs[1].value : '');
  const pauseMinutes = parseInt((pause || '60').toString().replace(' min', ''));

  const existingData = TimeData.getAll()[date] || {};
  const dayData = {
    ...existingData,
    start,
    end,
    pause: pauseMinutes
  };

  await TimeData.saveDay(date, dayData);

  const durationCell = rowElement.querySelector('[data-duration-cell]');
  if (durationCell) {
    const minutes = calculateDuration(start, end, pauseMinutes);
    durationCell.textContent = formatMinutes(minutes);
  }
}

// =====================================
// VUE CALENDRIER AVEC GESTION DES CONGÉS
// =====================================
async function loadCalendarView() {
  console.log('📅 Chargement vue calendrier...');
  
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  
  grid.innerHTML = '';

  const year = calendarYear;
  const month = calendarMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Lundi = 0

  const title = firstDay.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const titleElement = document.getElementById('calendar-title');
  if (titleElement) {
    titleElement.textContent = title.charAt(0).toUpperCase() + title.slice(1);
  }

  const start = `${year}-${(month + 1).toString().padStart(2, '0')}-01`;
  const end = `${year}-${(month + 1).toString().padStart(2, '0')}-${totalDays.toString().padStart(2, '0')}`;
  
  try {
    const data = await TimeData.getRange(start, end);
    const datesMap = new Map();
    const localData = TimeData.getAll();
    
    data.forEach(row => {
      const [date, debut, fin, pause, duration, note] = row;
      const dayData = localData[date];
      
      let status = 'absent';
      let type = 'normal';
      
      if (dayData) {
        type = dayData.type || 'normal';
        if (debut && fin) status = 'complet';
        else if (debut) status = 'partiel';
      }
      
      datesMap.set(date, { 
        debut, 
        fin, 
        status, 
        note, 
        pause: parseInt(pause) || 60,
        duration,
        type: type
      });
    });

    // Cases vides pour aligner le premier jour
    for (let i = 0; i < startDayOfWeek; i++) {
      const empty = document.createElement('div');
      empty.className = 'p-2';
      grid.appendChild(empty);
    }

    // Jours du mois
    const today = ymdLocal(new Date());
    
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      const cell = document.createElement('div');
      const dayData = datesMap.get(dateStr);
      const isWeekend = TimeData.isWeekend(dateStr);

      let bg = 'bg-gray-200';
      let textColor = 'text-gray-700';
      let emoji = '';
      
      // Couleurs selon le type et le statut
      if (dayData?.type === 'holiday') {
        bg = 'bg-blue-300';
        textColor = 'text-blue-800';
        emoji = '🏖️';
      } else if (dayData?.type === 'leave') {
        bg = 'bg-indigo-300';
        textColor = 'text-indigo-800';
        emoji = '🌴';
        bg = 'bg-blue-300';
        textColor = 'text-blue-800';
        emoji = '🏖️';
      } else if (isWeekend) {
        bg = 'bg-gray-300';
        textColor = 'text-gray-600';
        emoji = '🏠';
      } else if (dayData?.status === 'complet') {
        bg = 'bg-green-300';
        textColor = 'text-green-800';
        emoji = '✅';
      } else if (dayData?.status === 'partiel') {
        bg = 'bg-yellow-300';
        textColor = 'text-yellow-800';
        emoji = '⏰';
      }
      
      if (dateStr === today) {
        bg += ' ring-2 ring-blue-500';
      }

      cell.className = `${bg} ${textColor} p-2 rounded cursor-pointer hover:bg-opacity-70 transition-colors text-center relative`;
      
      const dayNumber = document.createElement('div');
      dayNumber.textContent = d;
      dayNumber.className = 'font-semibold';
      cell.appendChild(dayNumber);
      
      // Emoji pour indiquer le type
      if (emoji) {
        const emojiDiv = document.createElement('div');
        emojiDiv.textContent = emoji;
        emojiDiv.className = 'text-xs';
        cell.appendChild(emojiDiv);
      }
      
      // Durée si disponible
      if (dayData?.duration && dayData.duration !== '00h00') {
        const duration = document.createElement('div');
        duration.textContent = dayData.duration;
        duration.className = 'text-xs mt-1';
        cell.appendChild(duration);
      }
      
      cell.onclick = () => {
        openModal(dateStr, dayData?.debut, dayData?.fin, dayData?.status, dayData?.note || '', dayData?.pause || 60, dayData?.type || 'normal');
      };
      
      grid.appendChild(cell);
    }
  } catch (error) {
    console.error('Erreur chargement calendrier:', error);
    showToast('Erreur lors du chargement du calendrier', 'error');
  }
}

// Navigation calendrier
function initCalendarNavigation() {
  const prevBtn = document.getElementById('prev-month');
  const nextBtn = document.getElementById('next-month');
  
  if (prevBtn) {
    prevBtn.onclick = () => {
      calendarMonth--;
      if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
      }
      loadCalendarView();
    };
  }
  
  if (nextBtn) {
    nextBtn.onclick = () => {
      calendarMonth++;
      if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
      }
      loadCalendarView();
    };
  }
}

// =====================================
// MODAL DE MODIFICATION AVEC GESTION DES CONGÉS
// =====================================
function openModal(date, start = '', end = '', status = '', note = '', pause = 60, type = 'normal') {
  const modal = document.getElementById('calendar-modal');
  const dateLabel = document.getElementById('modal-date-label');
  
  if (!modal || !dateLabel) return;
  
  dateLabel.textContent = new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const startInput = document.getElementById('modal-start');
  const endInput = document.getElementById('modal-end');
  const pauseInput = document.getElementById('modal-pause');
  const noteInput = document.getElementById('modal-note');
  
  if (startInput) startInput.value = start || '';
  if (endInput) endInput.value = end || '';
  if (pauseInput) pauseInput.value = pause;
  if (noteInput) noteInput.value = note || '';
  
  // Ajouter le sélecteur de type si il n'existe pas
  let typeSelect = document.getElementById('modal-type');
  if (!typeSelect) {
    const typeContainer = document.createElement('label');
    typeContainer.className = 'block';
    typeContainer.innerHTML = `
      <span class="text-sm font-medium">Type de journée</span>
      <select id="modal-type" class="w-full border rounded px-3 py-2">
        <option value="normal">🏢 Travail normal</option>
        <option value="holiday">🏖️ Congé (8h auto)</option>
        <option value="sick">🤒 Arrêt maladie</option>
        <option value="remote">🏠 Télétravail</option>
      </select>
    `;
    
    // Insérer avant les boutons
    const buttonContainer = modal.querySelector('.mt-6');
    buttonContainer.parentNode.insertBefore(typeContainer, buttonContainer);
    typeSelect = document.getElementById('modal-type');
  }
  
  if (typeSelect) {
    typeSelect.value = type;
    
    // Gérer le changement de type
    typeSelect.onchange = () => {
      const selectedType = typeSelect.value;
      
      if (selectedType === 'holiday') {
        // Congé : mettre automatiquement 8h (9h-17h avec 1h pause)
        if (startInput) startInput.value = '09:00';
        if (endInput) endInput.value = '17:00';
        if (pauseInput) pauseInput.value = '60';
        if (noteInput && !noteInput.value) noteInput.value = 'Congé';
        showToast('8h de congé ajoutées automatiquement', 'success');
      } else if (selectedType === 'sick') {
        // Arrêt maladie : 8h aussi mais avec note différente
        if (startInput) startInput.value = '09:00';
        if (endInput) endInput.value = '17:00';
        if (pauseInput) pauseInput.value = '60';
        if (noteInput && !noteInput.value) noteInput.value = 'Arrêt maladie';
        showToast('8h d\'arrêt maladie ajoutées', 'success');
      } else if (selectedType === 'remote') {
        // Télétravail : garder les heures normales
        if (noteInput && !noteInput.value) noteInput.value = 'Télétravail';
      }
    };
  }
  
  modal.classList.remove('hidden');

  const saveBtn = document.getElementById('modal-save');
  const deleteBtn = document.getElementById('modal-delete');
  const cancelBtn = document.getElementById('modal-cancel');
  
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const newStart = startInput ? startInput.value : '';
      const newEnd = endInput ? endInput.value : '';
      const newPause = pauseInput ? parseInt(pauseInput.value) || 60 : 60;
      const newNote = noteInput ? noteInput.value : '';
      const newType = typeSelect ? typeSelect.value : 'normal';

      const dayData = {
        date: date,
        start: newStart,
        end: newEnd,
        pause: newPause,
        note: newNote,
        type: newType
      };

      await TimeData.saveDay(date, dayData);
      
      let message = 'Pointage mis à jour';
      if (newType === 'holiday') message = '🏖️ Congé enregistré (8h)';
      else if (newType === 'sick') message = '🤒 Arrêt maladie enregistré';
      else if (newType === 'remote') message = '🏠 Télétravail enregistré';
      
      showToast(message, 'success');
      closeModal();
      loadCalendarView();
    };
  }

  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (confirm('Supprimer ce pointage ?')) {
        const allData = TimeData.getAll();
        delete allData[date];
        Storage.set('timetrack_data', allData);
        showToast('Pointage supprimé', 'success');
        closeModal();
        loadCalendarView();
      }
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = closeModal;
  }
}

// =====================================
// GESTION DES CONGÉS AUTOMATIQUES
// =====================================

// Jours fériés français 2025 (vous pouvez personnaliser)
const FRENCH_HOLIDAYS_2025 = [
  '2025-01-01', // Nouvel An
  '2025-04-21', // Lundi de Pâques
  '2025-05-01', // Fête du Travail
  '2025-05-08', // Victoire 1945
  '2025-05-29', // Ascension
  '2025-06-09', // Lundi de Pentecôte
  '2025-07-14', // Fête Nationale
  '2025-08-15', // Assomption
  '2025-11-01', // Toussaint
  '2025-11-11', // Armistice
  '2025-12-25'  // Noël
];

// Fonction pour créer automatiquement les jours fériés
function createPublicHolidays(year = 2025) {
  const holidays = FRENCH_HOLIDAYS_2025.filter(date => date.startsWith(year.toString()));
  let count = 0;
  
  holidays.forEach(async (date) => {
    const existing = TimeData.getAll()[date];
    if (!existing) {
      await TimeData.createHolidayDay(date, 'Jour férié');
      count++;
    }
  });
  
  if (count > 0) {
    showToast(`${count} jours fériés ajoutés automatiquement`, 'success');
  } else {
    showToast('Jours fériés déjà présents', 'warning');
  }
  
  return count;
}

// Fonction pour créer une période de congés
async function createHolidayPeriod(startDate, endDate, note = 'Congés') {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    
    // Ignorer les weekends (optionnel)
    if (!TimeData.isWeekend(dateStr)) {
      await TimeData.createSpecialDay(dateStr, 'leave', note);
      count++;
    }
  }
  
  showToast(`${count} jours de congés créés`, 'success');
  return count;
}

function initExportTab() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  const startInput = document.getElementById('export-start');
  const endInput = document.getElementById('export-end');
  
  if (startInput) startInput.value = firstDay.toISOString().split('T')[0];
  if (endInput) endInput.value = lastDay.toISOString().split('T')[0];
}

// =====================================
// GESTION DU POINTAGE
// =====================================
function initPointage() {
  const startBtn = document.getElementById('start');
  const stopBtn = document.getElementById('stop');
  const submitBtn = document.getElementById('submit');
  
  if (startBtn) {
    startBtn.onclick = async () => {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().substring(0, 5);
      
      const startInput = document.getElementById('manualStart');
      if (startInput && !startInput.value) {
        startInput.value = time;
      }
      
      const data = TimeData.getAll()[date] || {};
      data.start = startInput ? startInput.value : time;
      data.date = date;
      
      await TimeData.saveDay(date, data);
    };
  }
  
  if (stopBtn) {
    stopBtn.onclick = () => {
      const now = new Date();
      const time = now.toTimeString().substring(0, 5);
      const endInput = document.getElementById('manualEnd');
      if (endInput) {
        endInput.value = time;
      }
      showToast('Heure de fin prête !', 'success');
    };
  }
  
  if (submitBtn) {
    submitBtn.onclick = async () => {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      
      const startInput = document.getElementById('manualStart');
      const endInput = document.getElementById('manualEnd');
      const pauseInput = document.getElementById('pause');
      const noteInput = document.getElementById('note');
      
      const start = startInput ? startInput.value : '';
      const end = endInput ? endInput.value : '';
      const pause = pauseInput ? parseInt(pauseInput.value) || 60 : 60;
      const note = noteInput ? noteInput.value : '';
      
      if (!start || !end) {
        showToast('Veuillez renseigner début et fin', 'error');
        return;
      }
      
      const data = { date, start, end, pause, note };
      await TimeData.saveDay(date, data);
      
      if (noteInput) noteInput.value = '';
      
      // Recharger la vue hebdomadaire si elle est active
      const hebdoTab = document.querySelector('[data-tab="hebdo"]');
      if (hebdoTab && hebdoTab.classList.contains('bg-blue-200')) {
        loadWeeklyView();
      }
    };
  }
}

// =====================================
// GESTION DES EXPORTS
// =====================================
function initExports() {
  const csvBtn = document.getElementById('export-csv');
  const excelBtn = document.getElementById('export-excel');
  const jsonBtn = document.getElementById('export-json');
  const monthBtn = document.getElementById('export-month');
  const clearBtn = document.getElementById('clear-data');
  
  if (csvBtn) {
    csvBtn.onclick = async () => {
      const start = document.getElementById('export-start').value;
      const end = document.getElementById('export-end').value;
      
      if (!start || !end) {
        showToast('Sélectionnez les dates', 'error');
        return;
      }
      
      try {
        const data = await TimeData.getRange(start, end);
        exportToCSV(data, `timetrack_${start}_${end}.csv`);
        showToast('Export CSV terminé', 'success');
      } catch (error) {
        showToast('Erreur export CSV', 'error');
      }
    };
  }
  
  if (excelBtn) {
    excelBtn.onclick = async () => {
      const start = document.getElementById('export-start').value;
      const end = document.getElementById('export-end').value;
      
      if (!start || !end) {
        showToast('Sélectionnez les dates', 'error');
        return;
      }
      
      try {
        const data = await TimeData.getRange(start, end);
        await exportToExcel(data, `timetrack_${start}_${end}.xlsx`);
      } catch (error) {
        console.error('Erreur:', error);
        showToast('Erreur export Excel', 'error');
      }
    };
  }
  
  if (jsonBtn) {
    jsonBtn.onclick = async () => {
      const start = document.getElementById('export-start').value;
      const end = document.getElementById('export-end').value;
      
      if (!start || !end) {
        showToast('Sélectionnez les dates', 'error');
        return;
      }
      
      try {
        const data = await TimeData.getRange(start, end);
        exportToJSON(data, `timetrack_${start}_${end}.json`);
        showToast('Export JSON terminé', 'success');
      } catch (error) {
        showToast('Erreur export JSON', 'error');
      }
    };
  }
  
  if (monthBtn) {
    monthBtn.onclick = async () => {
      const year = calendarYear;
      const month = calendarMonth + 1;
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
      
      try {
        const data = await TimeData.getRange(startDate, endDate);
        const monthName = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        await exportToExcel(data, `timetrack_${monthName.replace(' ', '_')}.xlsx`);
        showToast(`Export Excel ${monthName} terminé`, 'success');
      } catch (error) {
        console.error('Erreur export mensuel:', error);
        showToast('Erreur export du mois', 'error');
      }
    };
  }
  
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm('Effacer toutes les données ?')) {
        TimeData.clear();
        showToast('Données effacées', 'success');
        loadWeeklyView();
        loadCalendarView();
      }
    };
  }
}

// =====================================
// INITIALISATION
// =====================================
async function initApp() {
  console.log('🚀 Initialisation TimeTrack...');
  
  try {
    // Vérifier la connexion
    try {
      const testDate = new Date().toISOString().split('T')[0];
      const response = await fetch(`${CONFIG.API_BASE}/range?start=${testDate}&end=${testDate}`);
      CONFIG.OFFLINE_MODE = !response.ok;
    } catch (error) {
      CONFIG.OFFLINE_MODE = true;
    }
    
    // Initialiser les composants
    initTabs();
    initPointage();
    initExports();
    initCalendarNavigation();
    
    // Charger la vue par défaut (hebdomadaire)
    await loadWeeklyView();
    
    console.log('✅ TimeTrack initialisé');
    showToast('Application prête !', 'success');
    
  } catch (error) {
    console.error('Erreur init:', error);
    showToast('Erreur initialisation', 'error');
  }
}

// =====================================
// DEBUG
// =====================================
window.TimeTrackDebug = {
  testExcel: async () => {
    const testData = [
      ['2025-01-15', '09:00', '17:00', '60 min', '07h00', 'Test'],
      ['2025-01-16', '08:30', '16:30', '30 min', '07h30', 'Test 2']
    ];
    await exportToExcel(testData, 'test.xlsx');
  },
  showData: () => console.log(TimeData.getAll()),
  clearData: () => TimeData.clear(),
  loadWeek: () => loadWeeklyView(),
  loadCalendar: () => loadCalendarView()
};

// =====================================
// DÉMARRAGE


// =====================================
// CONGÉS & VACANCES
// =====================================

async function createLeavePeriod(startDate, endDate, leaveType='vacances', note='Congés', includeWeekends=false){
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start) || isNaN(end) || end < start) {
    showToast('Période invalide', 'error');
    return 0;
  }
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)){
    const dateStr = ymdLocal(d);
    if (!includeWeekends && TimeData.isWeekend(dateStr)) continue;
    const data = {
      date: dateStr,
      start: '',
      end: '',
      pause: 0,
      note: (note ? note+' ' : '') + '[' + leaveType + ']',
      type: 'leave'
    };
    await TimeData.saveDay(dateStr, data);
    count++;
  }
  showToast(`${count} jour(s) de congé ajoutés`, 'success');
  return count;
}

function renderLeaveList(){
  const container = document.getElementById('leave-list');
  if (!container) return;
  container.innerHTML = '';
  const all = TimeData.getAll();
  const entries = Object.entries(all)
    .filter(([d, data]) => data && (data.type === 'leave'))
    .sort((a,b) => a[0].localeCompare(b[0]));
  if (entries.length === 0){
    container.innerHTML = '<div class="p-3 text-sm text-gray-500">Aucun congé enregistré.</div>';
    return;
  }
  for (const [date, data] of entries){
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-2';
    const label = document.createElement('div');
    label.className = 'text-sm';
    label.textContent = new Date(date).toLocaleDateString('fr-FR', { weekday:'short', year:'numeric', month:'short', day:'numeric' }) + (data.note? ' — '+data.note : '');
    const btn = document.createElement('button');
    btn.className = 'text-red-600 hover:underline text-sm';
    btn.textContent = 'Supprimer';
    btn.onclick = async () => {
      await TimeData.deleteDay(date);
      renderLeaveList();
      // Refresh calendar if visible
      const calBtn = document.querySelector('[data-tab="calendrier"]');
      if (calBtn && calBtn.classList.contains('bg-blue-200')) {
        try { loadCalendarView(); } catch(e){}
      }
    };
    row.appendChild(label);
    row.appendChild(btn);
    container.appendChild(row);
  }
}

function initCongesTab(){
  const start = document.getElementById('leave-start');
  const end = document.getElementById('leave-end');
  const type = document.getElementById('leave-type');
  const note = document.getElementById('leave-note');
  const add = document.getElementById('leave-add');
  const clear = document.getElementById('leave-clear');
  if (start && end){
    const today = new Date();
    const ymd = ymdLocal(today);
    start.value = ymd;
    end.value = ymd;
  }
  if (add){
    add.addEventListener('click', async () => {
      await createLeavePeriod(start.value, end.value, type.value, note.value, false);
      renderLeaveList();
    });
  }
  if (clear){
    clear.addEventListener('click', async () => {
      const all = TimeData.getAll();
      for (const [d, data] of Object.entries(all)){
        if (data && data.type === 'leave'){
          await TimeData.deleteDay(d);
        }
      }
      renderLeaveList();
      showToast('Tous les congés ont été supprimés', 'warning');
    });
  }
  renderLeaveList();
}
// =====================================
document.addEventListener('DOMContentLoaded', initApp);

console.log('🔄 TimeTrack Simple chargé');
console.log('🧪 Test Excel: TimeTrackDebug.testExcel()');

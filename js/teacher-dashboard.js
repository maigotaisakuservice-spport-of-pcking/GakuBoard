// js/teacher-dashboard.js

let currentUser = null;
let currentClassId = null; // The currently selected context class ID
let availableClasses = []; // List of all classes teacher belongs to
let wbUnsubscribe = null;

// Init
auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;
        const userDocRef = db.collection('users').doc(user.uid);
        const doc = await userDocRef.get();

        if (doc.exists) {
            const data = doc.data();
            if (data.role !== 'teacher') {
                alert('権限がありません');
                window.location.href = 'login.html';
                return;
            }

            await loadAffiliatedClasses(data);
            document.getElementById('loading').classList.add('hidden');

            // Feature Flag Check (Daily Record)
            try {
                const schoolId = data.schoolId;
                const schoolDoc = await db.collection('schools').doc(schoolId).get();
                if(schoolDoc.exists && schoolDoc.data().features && schoolDoc.data().features.dailyRecord === false) {
                    const navBtn = document.querySelector('button[onclick="showSection(\'daily\')"]');
                    if(navBtn) navBtn.style.display = 'none';
                    const widget = document.getElementById('home-stats');
                    if(widget && widget.parentElement) widget.parentElement.style.display = 'none';
                }
            } catch(e) { console.warn("Feature flag check failed", e); }

            // Check AI Config
            try {
                const aiConfig = await AIService.getConfig(data.tenantId);
                const aiBtn = document.getElementById('btn-ai-draft');
                if (!aiConfig.enabled) { if(aiBtn) aiBtn.style.display = 'none'; }
            } catch(e) {
                const aiBtn = document.getElementById('btn-ai-draft');
                if(aiBtn) aiBtn.style.display = 'none';
            }

            // Set date pickers
            const dp = document.getElementById('daily-date-picker');
            if(dp) dp.valueAsDate = new Date();
            const homeDp = document.getElementById('home-absent-date');
            if(homeDp) {
                homeDp.valueAsDate = new Date();
                homeDp.onchange = loadAbsenteesWidget;
            }

            // Run Cleanup
            cleanOldLogs(db).catch(e => console.error("Cleanup error", e));

            showSection('home');
        }
    } else {
        window.location.href = 'login.html';
    }
});

async function loadAffiliatedClasses(userData) {
    availableClasses = [];
    const select = document.getElementById('ctx-class-select');
    select.innerHTML = '';
    const classIds = new Set();
    if (userData.classId) classIds.add(userData.classId);
    if (userData.affiliations) userData.affiliations.forEach(a => classIds.add(a.classId));
    const idsArray = Array.from(classIds);
    if (idsArray.length > 0) {
        const chunks = [];
        for (let i = 0; i < idsArray.length; i += 10) { chunks.push(idsArray.slice(i, i + 10)); }
        for (const chunk of chunks) {
            const snap = await db.collection('classes').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
            snap.forEach(d => availableClasses.push({ id: d.id, ...d.data() }));
        }
    }
    if (availableClasses.length === 0) {
        const opt = document.createElement('option'); opt.text = "所属クラスなし"; select.appendChild(opt); return;
    }
    const classGroup = document.createElement('optgroup'); classGroup.label = "クラス (ホームルーム)";
    const clubGroup = document.createElement('optgroup'); clubGroup.label = "部活動";
    availableClasses.forEach(c => {
        const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.name;
        if (c.type === 'club') clubGroup.appendChild(opt); else classGroup.appendChild(opt);
    });
    if(classGroup.children.length > 0) select.appendChild(classGroup);
    if(clubGroup.children.length > 0) select.appendChild(clubGroup);
    select.onchange = (e) => switchClassContext(e.target.value);
    switchClassContext(availableClasses[0].id);
}

function switchClassContext(classId) {
    currentClassId = classId;
    const cls = availableClasses.find(c => c.id === classId);
    const homeHeader = document.getElementById('home-class-name');
    if (homeHeader) homeHeader.textContent = cls ? `(${cls.name})` : '';
    const select = document.getElementById('ctx-class-select');
    if (select.value !== classId) select.value = classId;
    const activeSection = document.querySelector('section:not(.hidden)');
    if (activeSection) { loadSectionData(activeSection.id.replace('section-', '')); }
}

function showSection(id) {
    document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`section-${id}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.getAttribute('onclick') === `showSection('${id}')`) btn.classList.add('bg-indigo-800', 'font-bold');
        else btn.classList.remove('bg-indigo-800', 'font-bold');
    });
    loadSectionData(id);
}

function loadSectionData(id) {
    if (!currentClassId) return;
    if (id === 'daily') loadDailyRecords();
    if (id === 'materials') { loadPortalLinks(); loadMaterials(); }
    if (id === 'announce') loadAnnouncements();
    if (id === 'students') loadStudentList();
    if (id === 'assignments') loadAssignments();
    if (id === 'surveys') loadSurveys();
    if (id === 'home') { loadHomeStats(); loadWhiteboards(); loadAbsenteesWidget(); }
}

// --- HOME ---
async function loadHomeStats() {
    if (!currentClassId) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const recordsSnap = await db.collection('daily_records')
        .where('classId', '==', currentClassId)
        .where('schoolId', '==', userDoc.data().schoolId)
        .where('createdAt', '>=', today).get();
    const html = `<div class="text-4xl font-bold text-center text-indigo-600">${recordsSnap.size} <span class="text-lg text-gray-400 font-normal">人</span></div><p class="text-center text-sm text-gray-500 mt-2">本日の健康観察提出済み</p>`;
    const statsEl = document.getElementById('home-stats');
    if (statsEl) statsEl.innerHTML = html;
}

async function loadAbsenteesWidget() {
    if (!currentClassId) return;
    const container = document.getElementById('home-absentees-container');
    if(!container) return;
    container.innerHTML = '<p class="text-gray-400 text-sm">読み込み中...</p>';
    const dateInput = document.getElementById('home-absent-date');
    const dateStr = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const snap = await db.collection('attendance').where('classId', '==', currentClassId).where('schoolId', '==', userDoc.data().schoolId).where('date', '==', dateStr).get();
    if(snap.empty) { container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4 bg-gray-50 rounded-lg">欠席・遅刻の連絡はありません</p>'; return; }
    let html = '<h4 class="font-bold text-sm text-gray-600 mb-2">欠席・遅刻の連絡</h4><ul class="space-y-2">';
    snap.forEach(doc => {
        const d = doc.data();
        let badgeColor = d.type === 'absent' ? 'bg-red-500' : d.type === 'suspend' ? 'bg-purple-500' : 'bg-yellow-500';
        html += `<li class="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-100 transition" onclick="alert('理由: ${d.reason || 'なし'}')"><span class="font-bold text-sm">${d.studentName}</span><span class="${badgeColor} text-white text-xs px-2 py-1 rounded-full font-bold">${d.type === 'absent' ? '欠席' : d.type === 'suspend' ? '出席停止' : '遅刻'}</span></li>`;
    });
    html += '</ul>'; container.innerHTML = html;
}

function launchActivity(type) {
    if (!currentClassId) return alert("クラス設定エラー");
    window.open(`${type}.html?classId=${currentClassId}&mode=teacher`, '_blank');
}

// --- WHITEBOARDS ---
function loadWhiteboards() {
    if (wbUnsubscribe) wbUnsubscribe();
    if (!currentClassId) return;
    const list = document.getElementById('wb-list');
    wbUnsubscribe = db.collection('classes').doc(currentClassId).collection('active_boards').onSnapshot(snap => {
        list.innerHTML = '';
        if (snap.empty) { list.innerHTML = '<p class="text-xs text-gray-400">開催中のボードはありません</p>'; return; }
        snap.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div'); div.className = "flex justify-between items-center bg-indigo-50 p-2 rounded-lg border border-indigo-100";
            div.innerHTML = `<span class="text-sm font-bold text-indigo-800 truncate flex-grow mr-2">${data.name}</span><button onclick="joinWhiteboard('${doc.id}', '${data.name}')" class="text-xs bg-white border border-indigo-300 px-2 py-1 rounded text-indigo-600 hover:bg-indigo-100 transition">開く</button>`;
            list.appendChild(div);
        });
    });
}
function createWhiteboard() {
    const nameInput = document.getElementById('new-wb-name');
    if (!nameInput.value) return alert("名前を入力してください");
    joinWhiteboard('wb_' + Math.random().toString(36).substr(2, 9), nameInput.value);
    nameInput.value = '';
}
function joinWhiteboard(boardId, name) { window.open(`whiteboard.html?classId=${currentClassId}&boardId=${boardId}&name=${encodeURIComponent(name)}&mode=teacher`, '_blank'); }

// --- MATERIALS ---
async function loadMaterials() {
    const list = document.getElementById('material-list'); list.innerHTML = '<p class="text-gray-400 text-sm">読み込み中...</p>';
    const snap = await db.collection('materials').where('classId', '==', currentClassId).get();
    list.innerHTML = '';
    if(snap.empty) { list.innerHTML = '<p class="text-gray-400 text-sm italic">登録された教材はありません</p>'; return; }
    snap.forEach(doc => {
        const d = doc.data();
        const div = document.createElement('div'); div.className = "flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100 group";
        div.innerHTML = `<div class="flex items-center gap-3"><span class="text-xl">📄</span><a href="${d.url}" target="_blank" class="text-sm font-bold text-indigo-600 hover:underline truncate max-w-xs">${d.title}</a></div><button onclick="deleteMaterial('${doc.id}')" class="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition">&times;</button>`;
        list.appendChild(div);
    });
}
async function addMaterial() {
    const title = document.getElementById('mat-title').value; const url = document.getElementById('mat-url').value;
    if(!title || !url) return alert("入力してください");
    await db.collection('materials').add({ classId: currentClassId, title, url, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById('mat-title').value = ''; document.getElementById('mat-url').value = ''; loadMaterials();
}
async function deleteMaterial(id) { if(confirm("削除しますか？")) { await db.collection('materials').doc(id).delete(); loadMaterials(); } }

// --- PORTAL ---
async function loadPortalLinks() {
    const container = document.getElementById('portal-list-edit'); container.innerHTML = '';
    const snap = await db.collection('portal_links').where('classId', '==', currentClassId).get();
    snap.forEach(doc => {
        const d = doc.data();
        const div = document.createElement('div'); div.className = "bg-gray-50 p-3 rounded-lg flex flex-col items-center relative group border";
        div.innerHTML = `<img src="${d.iconUrl || 'https://via.placeholder.com/64'}" class="w-12 h-12 rounded mb-2 object-cover"><span class="font-bold text-xs text-center truncate w-full">${d.title}</span><button onclick="deletePortalLink('${doc.id}')" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition shadow">×</button>`;
        container.appendChild(div);
    });
}
async function addPortalLink() {
    const title = document.getElementById('link-title').value; const url = document.getElementById('link-url').value; const iconUrl = document.getElementById('link-icon').value;
    if (!title || !url) return alert('必須項目を入力してください');
    await db.collection('portal_links').add({ classId: currentClassId, title, url, iconUrl, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById('link-title').value = ''; document.getElementById('link-url').value = ''; document.getElementById('link-icon').value = ''; loadPortalLinks();
}
async function deletePortalLink(id) { if(confirm('削除しますか？')) { await db.collection('portal_links').doc(id).delete(); loadPortalLinks(); } }

// --- ASSIGNMENTS ---
async function loadAssignments() {
    const list = document.getElementById('assignment-list'); list.innerHTML = '<p class="col-span-full text-center text-gray-400 py-10">読み込み中...</p>';
    const snap = await db.collection('assignments').where('classId', '==', currentClassId).orderBy('createdAt', 'desc').get();
    list.innerHTML = '';
    if(snap.empty) { list.innerHTML = '<p class="col-span-full text-center text-gray-400 py-10">課題がありません</p>'; return; }
    snap.forEach(doc => {
        const d = doc.data();
        const div = document.createElement('div'); div.className = "bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between";
        div.innerHTML = `<div><h3 class="font-bold text-lg text-gray-800 mb-2">${d.title}</h3><p class="text-sm text-gray-500 mb-4 truncate">${d.description || ''}</p><div class="text-xs text-red-500 font-bold mb-4">期限: ${d.dueDate ? new Date(d.dueDate).toLocaleString() : 'なし'}</div></div><div class="flex gap-2"><button onclick="viewSubmissions('${doc.id}', '${d.title}')" class="flex-grow bg-indigo-50 text-indigo-700 py-2 rounded-lg font-bold hover:bg-indigo-100 transition">提出物を確認</button><button onclick="deleteAssignment('${doc.id}')" class="bg-gray-100 text-gray-400 p-2 rounded-lg hover:text-red-600 transition">🗑️</button></div>`;
        list.appendChild(div);
    });
}
async function createAssignment() {
    const title = document.getElementById('new-assign-title').value; const description = document.getElementById('new-assign-desc').value; const dueDate = document.getElementById('new-assign-due').value;
    if(!title) return alert("タイトルは必須です");
    await db.collection('assignments').add({ classId: currentClassId, title, description, dueDate, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    closeModals(); loadAssignments();
}
async function deleteAssignment(id) { if(confirm("この課題を削除しますか？")) { await db.collection('assignments').doc(id).delete(); loadAssignments(); } }
async function viewSubmissions(assignId, title) {
    document.getElementById('view-assignment-title').textContent = title;
    const list = document.getElementById('submission-list-body'); list.innerHTML = '<tr><td colspan="4" class="p-4 text-center">読み込み中...</td></tr>';
    document.getElementById('submission-viewer').classList.remove('hidden');
    const snap = await db.collection('assignments').doc(assignId).collection('submissions').get();
    list.innerHTML = '';
    if(snap.empty) { list.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">未提出</td></tr>'; return; }
    snap.forEach(doc => {
        const d = doc.data(); const date = d.createdAt ? d.createdAt.toDate().toLocaleString() : '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="p-3 font-bold">${d.studentName}</td><td class="p-3"><a href="${d.url}" target="_blank" class="text-blue-600 underline">開く</a></td><td class="p-3 text-xs text-gray-400">${date}</td><td class="p-3 text-center"><input type="text" placeholder="評価" id="grade-${doc.id}" value="${d.feedback || ''}" class="border rounded px-2 py-1 text-xs w-24"><button onclick="saveFeedback('${assignId}', '${doc.id}')" class="bg-indigo-600 text-white text-xs px-2 py-1 rounded ml-1">保存</button></td>`;
        list.appendChild(tr);
    });
}
async function saveFeedback(assignId, subId) {
    const val = document.getElementById(`grade-${subId}`).value;
    await db.collection('assignments').doc(assignId).collection('submissions').doc(subId).update({ feedback: val }); alert("保存しました");
}
function hideSubmissions() { document.getElementById('submission-viewer').classList.add('hidden'); }

// --- SURVEYS ---
async function loadSurveys() {
    const list = document.getElementById('survey-list'); list.innerHTML = '<p class="col-span-full text-center py-10 text-gray-400">読み込み中...</p>';
    const snap = await db.collection('surveys').where('classId', '==', currentClassId).orderBy('createdAt', 'desc').get();
    list.innerHTML = '';
    if(snap.empty) { list.innerHTML = '<p class="col-span-full text-center text-gray-400 py-10">アンケートはありません</p>'; return; }
    snap.forEach(doc => {
        const d = doc.data();
        const div = document.createElement('div'); div.className = "bg-white p-6 rounded-xl shadow-sm border border-gray-100";
        div.innerHTML = `<h3 class="font-bold text-lg mb-2">${d.title}</h3><p class="text-sm text-gray-500 mb-4">${d.description || ''}</p><div class="flex gap-2"><button onclick="viewSurveyResults('${doc.id}', '${d.title}')" class="flex-grow bg-blue-50 text-blue-700 py-2 rounded-lg font-bold hover:bg-blue-100 transition">集計結果</button><button onclick="deleteSurvey('${doc.id}')" class="bg-gray-100 text-gray-400 p-2 rounded-lg hover:text-red-600">🗑️</button></div>`;
        list.appendChild(div);
    });
}
async function createSurvey() {
    const title = document.getElementById('new-survey-title').value; const description = document.getElementById('new-survey-desc').value;
    const options = Array.from(document.querySelectorAll('.survey-opt-input')).map(i => i.value).filter(v => v);
    if(!title || options.length < 2) return alert("タイトルと2つ以上の選択肢が必要です");
    await db.collection('surveys').add({ classId: currentClassId, title, description, options, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    closeModals(); loadSurveys();
}
async function deleteSurvey(id) { if(confirm("削除しますか？")) { await db.collection('surveys').doc(id).delete(); loadSurveys(); } }
async function viewSurveyResults(surveyId, title) {
    const snap = await db.collection('surveys').doc(surveyId).collection('responses').get();
    const counts = {}; snap.forEach(doc => { const choice = doc.data().choice; counts[choice] = (counts[choice] || 0) + 1; });
    let resStr = `【${title}】の集計結果 (${snap.size}件)\n\n`; for(const key in counts) { resStr += `${key}: ${counts[key]}票\n`; }
    alert(resStr || "まだ回答がありません");
}

// --- DAILY RECORDS (Health SOS) ---
async function loadDailyRecords() {
    if (!currentClassId) return;
    const list = document.getElementById('daily-list'); list.innerHTML = '<tr><td colspan="5" class="p-4 text-center">読み込み中...</td></tr>';
    const dateVal = document.getElementById('daily-date-picker').value;
    const date = new Date(dateVal); const nextDate = new Date(date); nextDate.setDate(date.getDate() + 1);
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const snap = await db.collection('daily_records')
        .where('classId', '==', currentClassId).where('schoolId', '==', userDoc.data().schoolId)
        .where('createdAt', '>=', date).where('createdAt', '<', nextDate).orderBy('createdAt', 'desc').get();
    list.innerHTML = '';
    if (snap.empty) { list.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">データなし</td></tr>'; return; }
    snap.forEach(doc => {
        const d = doc.data(); const time = d.createdAt ? d.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';
        const isAbnormal = (d.temperature > 37.5) || (d.mood === 'bad');
        const tr = document.createElement('tr'); tr.className = `relative group ${isAbnormal ? "bg-red-50 border-l-4 border-red-500" : ""}`;
        let tooltip = '';
        if (isAbnormal) {
            const notifiedText = d.adminNotified ? '<span class="text-green-600 font-bold text-xs ml-2">通知済み</span>' : '';
            const notifyBtn = !d.adminNotified ? `<button onclick="notifyAdmin('${doc.id}')" class="bg-red-600 text-white text-xs px-2 py-1 rounded hover:bg-red-700 ml-2">管理者に通知</button>` : '';
            tooltip = `<div class="hidden group-hover:block absolute top-0 left-0 w-full h-full bg-white bg-opacity-95 flex items-center justify-center space-x-4 z-10 p-2 shadow-inner"><span class="font-bold text-red-600">⚠️ 要対応: 保健室へ誘導してください</span>${notifyBtn}${notifiedText}</div>`;
        }
        tr.innerHTML = `${tooltip}<td class="p-3 font-bold">${d.studentName || '不明'}</td><td class="p-3 text-2xl">${d.mood === 'good' ? '😊' : d.mood === 'bad' ? '😫' : '😐'}</td><td class="p-3 ${d.temperature > 37.5 ? 'text-red-600 font-bold' : ''}">${d.temperature}℃</td><td class="p-3 text-gray-600 truncate max-w-xs">${d.comment || ''}</td><td class="p-3 text-xs text-gray-400">${time}</td>`;
        list.appendChild(tr);
    });
}
async function notifyAdmin(recordId) {
    if(!confirm("管理者にこの生徒の体調不良を通知しますか？")) return;
    try { await db.collection('daily_records').doc(recordId).update({ adminNotified: true, notifiedAt: firebase.firestore.FieldValue.serverTimestamp() }); loadDailyRecords(); alert("管理者に通知しました"); }
    catch(e) { alert("通知に失敗しました"); }
}

// --- ANNOUNCEMENTS ---
async function loadAnnouncements() {
    const div = document.getElementById('announce-history'); div.innerHTML = '';
    const snap = await db.collection('announcements').where('classId', '==', currentClassId).orderBy('createdAt', 'desc').limit(10).get();
    snap.forEach(doc => {
        const d = doc.data(); const date = d.createdAt ? d.createdAt.toDate().toLocaleDateString() : '';
        const card = document.createElement('div'); card.className = "border p-4 rounded-xl bg-white shadow-sm";
        card.innerHTML = `<div class="flex justify-between mb-2"><span class="font-bold text-lg">${d.title}</span><span class="text-xs text-gray-500">${date}</span></div><p class="text-sm text-gray-700 whitespace-pre-wrap">${d.body}</p>`;
        div.appendChild(card);
    });
}
async function draftAnnouncementWithAI() {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const topic = prompt("トピックを入力:"); if (!topic) return;
    const btn = document.getElementById('btn-ai-draft'); btn.textContent = "AI生成中..."; btn.disabled = true;
    try { const draft = await AIService.draftAnnouncement(userDoc.data().tenantId, topic); document.getElementById('announce-body').value = draft; } catch(e) { alert("AI生成エラー"); }
    finally { btn.textContent = "🤖 AI下書き"; btn.disabled = false; }
}
async function postAnnouncement() {
    const title = document.getElementById('announce-title').value; const body = document.getElementById('announce-body').value;
    if(!title || !body) return alert("入力してください");
    await db.collection('announcements').add({ classId: currentClassId, title, body, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById('announce-title').value = ''; document.getElementById('announce-body').value = ''; alert("送信しました"); loadAnnouncements();
}

// --- STUDENT LIST (UX Restore) ---
async function loadStudentList() {
    const tbody = document.getElementById('student-list-body'); tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">読み込み中...</td></tr>';
    const userDoc = await db.collection('users').doc(currentUser.uid).get(); const schoolId = userDoc.data().schoolId;
    const absentCounts = {}; const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    try {
        const attendSnap = await db.collection('attendance').where('schoolId', '==', schoolId).where('type', 'in', ['absent', 'suspend']).where('createdAt', '>=', oneYearAgo).get();
        attendSnap.forEach(doc => { const sid = doc.data().studentId; absentCounts[sid] = (absentCounts[sid] || 0) + 1; });
    } catch(e) {}
    const snap = await db.collection('users').where('schoolId', '==', schoolId).where('tenantId', '==', userDoc.data().tenantId).where('role', '==', 'student').get();
    const clubSnap = await db.collection('classes').where('schoolId', '==', schoolId).where('type', '==', 'club').get();
    const clubMap = {}; clubSnap.forEach(c => clubMap[c.id] = c.data().name);
    const students = []; snap.forEach(doc => {
        const d = doc.data(); if(d.classId === currentClassId || (d.affiliations && d.affiliations.some(a => a.classId === currentClassId))) students.push({id: doc.id, ...d});
    });
    tbody.innerHTML = ''; if(students.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">生徒がいません</td></tr>'; return; }
    students.sort((a,b) => (a.attendanceNumber || 999) - (b.attendanceNumber || 999));
    students.forEach(s => {
        const count = absentCounts[s.id] || 0; const clubs = s.affiliations ? s.affiliations.map(a => clubMap[a.classId]).filter(n => n).join(', ') : '-';
        const tr = document.createElement('tr'); tr.className = "border-b hover:bg-gray-50 transition";
        tr.innerHTML = `<td class="p-3 text-center">${s.attendanceNumber || '-'}</td><td class="p-3 font-bold">${s.name}</td><td class="p-3 text-sm text-gray-600">${clubs}</td><td class="p-3 text-center text-xs text-gray-400 font-bold">${count > 0 ? count + '回' : '-'}</td><td class="p-3 text-center"><button onclick="editStudent('${s.id}', '${s.name}', '${s.attendanceNumber||''}')" class="bg-gray-100 px-3 py-1 rounded text-xs hover:bg-gray-200 transition">編集</button></td>`;
        tbody.appendChild(tr);
    });
}
function editStudent(uid, name, currentNum) {
    const modalId = 'edit-student-modal'; if(document.getElementById(modalId)) document.getElementById(modalId).remove();
    const div = document.createElement('div'); div.id = modalId; div.className = "fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50";
    div.innerHTML = `<div class="bg-white rounded p-6 w-96"><h3 class="font-bold text-lg mb-4">${name} の編集</h3><label class="block text-sm font-bold mb-1">出席番号</label><input type="number" id="edit-num" value="${currentNum}" class="border p-2 w-full mb-4 rounded"><p class="text-xs text-red-500 mb-4">※ 学年・クラスの変更は、学校管理画面または本人のプロフィール設定から行ってください。</p><div class="flex justify-end gap-2"><button onclick="document.getElementById('${modalId}').remove()" class="bg-gray-300 px-4 py-2 rounded">キャンセル</button><button id="btn-save-student" class="bg-blue-600 text-white px-4 py-2 rounded">保存</button></div></div>`;
    document.body.appendChild(div);
    document.getElementById('btn-save-student').onclick = async () => {
        const newNum = document.getElementById('edit-num').value;
        try { await db.collection('users').doc(uid).update({ attendanceNumber: parseInt(newNum) }); alert("更新しました"); document.getElementById(modalId).remove(); loadStudentList(); }
        catch(e) { alert("更新失敗"); }
    };
}

async function cleanOldLogs(db) {
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
    const deleteOld = async (collection) => {
        const snap = await db.collection(collection).where('createdAt', '<', cutoff).limit(500).get(); if(snap.empty) return;
        const batch = db.batch(); snap.forEach(doc => batch.delete(doc.ref)); await batch.commit();
    };
    await deleteOld('daily_records'); await deleteOld('attendance');
}

// js/student-dashboard.js

let currentUser = null;
let userData = null;
let currentAffiliations = [];
let primaryClassId = null;
let selectedMood = null;

// Modal Caches
window.assignmentCache = {};
window.surveyCache = {};

// NEW: Preview Mode Detection
const urlParams = new URLSearchParams(window.location.search);
const isPreview = urlParams.get('preview') === 'true';
const previewClassId = urlParams.get('classId');
const previewSchoolId = urlParams.get('schoolId');

if (isPreview) {
    currentUser = { uid: 'preview_user', email: 'preview@student.com' };
    const mockData = {
        name: 'プレビュー生徒',
        role: 'student',
        schoolId: previewSchoolId || 'mock_school',
        tenantId: 'mock_tenant',
        affiliations: []
    };
    if (previewClassId) mockData.affiliations.push({ classId: previewClassId, yearType: 'current' });
    initDashboard(mockData);
} else {
    auth.onAuthStateChanged(async user => {
        if (user) {
            currentUser = user;
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                userData = doc.data();
                if (userData.role !== 'student') {
                    alert('生徒用アカウントではありません');
                    window.location.href = 'login.html';
                    return;
                }
                if (typeof checkAndShowProfileSetup === 'function') await checkAndShowProfileSetup(user, db);
                initDashboard(userData);
            }
        } else {
            window.location.href = 'login.html';
        }
    });
}

async function initDashboard(data) {
    userData = data;
    const navNameEl = document.getElementById('nav-student-name');
    if(navNameEl) navNameEl.textContent = userData.name || currentUser.email;

    if (isPreview && previewClassId) {
        currentAffiliations = [{ classId: previewClassId, yearType: 'current' }];
        primaryClassId = previewClassId;
    } else {
        await resolveAffiliations(userData);
    }

    // Check GAKU-Talk visibility
    checkGakuTalkSettings();

    if(!isPreview) checkDailySubmission();
    loadUnifiedPortal(userData.schoolId);
    loadHomeAnnouncements();
    loadUnifiedActivities();
    showStudentSection('home');

    if (isPreview) {
        document.querySelectorAll('button, input, select').forEach(el => {
            if(el.id === 'student-context-select' || el.classList.contains('nav-item')) return;
            el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); alert("プレビューモードでは操作できません"); }, true);
        });
    }
}

async function checkGakuTalkSettings() {
    const nav = document.getElementById('nav-gakutalk');
    if(!nav) return;
    try {
        const tenantDoc = await db.collection('tenants').doc(userData.tenantId).get();
        if(!tenantDoc.exists || tenantDoc.data().gakutalkEnabled !== true) {
            nav.style.display = 'none';
        }
    } catch(e) { nav.style.display = 'none'; }
}

async function resolveAffiliations(userData) {
    currentAffiliations = userData.affiliations || [];
    if (currentAffiliations.length === 0 && userData.classId) {
        currentAffiliations.push({ classId: userData.classId, yearType: 'current' });
    }
    const primary = currentAffiliations.find(a => a.yearType === 'current');
    primaryClassId = primary ? primary.classId : (currentAffiliations[0]?.classId || null);

    const contextSelect = document.getElementById('student-context-select');
    if(contextSelect) {
        contextSelect.innerHTML = '';
        const classGroup = document.createElement('optgroup'); classGroup.label = "クラス";
        const clubGroup = document.createElement('optgroup'); clubGroup.label = "部活";
        for (const aff of currentAffiliations) {
            const clsDoc = await db.collection('classes').doc(aff.classId).get();
            if (clsDoc.exists) {
                const d = clsDoc.data();
                const opt = document.createElement('option');
                opt.value = aff.classId;
                opt.textContent = d.name;
                if (aff.classId === primaryClassId) opt.selected = true;
                if (d.type === 'club') clubGroup.appendChild(opt);
                else classGroup.appendChild(opt);
            }
        }
        if(classGroup.children.length > 0) contextSelect.appendChild(classGroup);
        if(clubGroup.children.length > 0) contextSelect.appendChild(clubGroup);
    }
}

window.editProfile = function() {
    if (typeof checkAndShowProfileSetup === 'function') {
        checkAndShowProfileSetup(currentUser, db, true);
    } else {
        console.error("checkAndShowProfileSetup not found");
    }
}

window.showStudentSection = function(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('nav-active', 'bg-blue-50', 'text-blue-700', 'font-bold'));

    document.getElementById(`sec-${id}`).classList.remove('hidden');
    const navBtn = document.getElementById(`nav-${id}`);
    if(navBtn) navBtn.classList.add('nav-active', 'bg-blue-50', 'text-blue-700', 'font-bold');

    loadStudentSectionData(id);
}

function loadStudentSectionData(id) {
    if (id === 'apps') { loadUnifiedPortal(userData.schoolId); loadMaterials(); }
    if (id === 'assignments') loadAssignments();
    if (id === 'surveys') loadSurveys();
    if (id === 'announce') loadAnnouncementsList();
    if (id === 'home') loadHomeAnnouncements();
}

window.switchStudentContext = function(classId) {
    primaryClassId = classId;
    loadHomeAnnouncements();
    loadUnifiedActivities();
    // Refresh current view if applicable
    const activeSec = document.querySelector('section:not(.hidden)');
    if(activeSec) loadStudentSectionData(activeSec.id.replace('sec-', ''));
}

async function loadMaterials() {
    const list = document.getElementById('material-list');
    list.innerHTML = '<p class="text-gray-400 text-sm">読み込み中...</p>';
    const snap = await db.collection('materials').where('classId', '==', primaryClassId).get();
    list.innerHTML = '';
    if(snap.empty) {
        list.innerHTML = '<p class="text-gray-400 text-sm italic">教材はありません</p>';
        return;
    }
    snap.forEach(doc => {
        const d = doc.data();
        const url = formatURL(d.url);
        const div = document.createElement('div');
        div.className = "bg-white p-4 rounded-xl shadow-sm border border-blue-50 flex items-center justify-between group hover:shadow-md transition cursor-pointer";
        div.onclick = () => { if(url) window.open(url, '_blank'); };
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-2xl">📄</span>
                <div>
                    <h4 class="font-bold text-gray-800">${d.title}</h4>
                    <span class="text-xs text-blue-500 group-hover:underline">資料を開く</span>
                </div>
            </div>
            <span class="text-blue-200 group-hover:text-blue-500 transition">→</span>
        `;
        list.appendChild(div);
    });
}

async function loadAssignments() {
    const list = document.getElementById('assignment-list');
    list.innerHTML = '<p class="text-gray-400 text-sm">読み込み中...</p>';
    const snap = await db.collection('assignments').where('classId', '==', primaryClassId).orderBy('createdAt', 'desc').get();
    list.innerHTML = '';
    if(snap.empty) {
        list.innerHTML = '<p class="text-gray-400 text-sm italic">出されている課題はありません</p>';
        return;
    }
    for (const doc of snap.docs) {
        const d = doc.data();
        window.assignmentCache[doc.id] = d;

        const subSnap = await db.collection('assignments').doc(doc.id).collection('submissions').where('studentId', '==', currentUser.uid).get();
        const isSubmitted = !subSnap.empty;
        const feedback = isSubmitted ? subSnap.docs[0].data().feedback : null;

        const div = document.createElement('div');
        div.className = `bg-white p-6 rounded-2xl shadow-sm border-2 ${isSubmitted ? 'border-green-100' : 'border-blue-100'}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="font-bold text-lg">${d.title}</h3>
                    <p class="text-sm text-gray-500">${d.description || ''}</p>
                </div>
                <span class="text-xs px-3 py-1 rounded-full font-bold ${isSubmitted ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}">${isSubmitted ? '提出済み' : '未提出'}</span>
            </div>
            <div class="text-xs text-gray-400 mb-4">期限: ${d.dueDate ? new Date(d.dueDate).toLocaleString() : 'なし'}</div>
            ${isSubmitted ?
                `<div class="bg-green-50 p-3 rounded-lg text-sm text-green-800">
                    <strong>先生からのコメント:</strong> ${feedback || 'まだありません'}
                </div>` :
                `<button onclick="openSubmitModal('${doc.id}')" class="w-full bg-blue-600 text-white py-2 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition">提出する</button>`
            }
        `;
        list.appendChild(div);
    }
}

let activeAssignId = null;
window.openSubmitModal = function(id) {
    const d = window.assignmentCache[id];
    if(!d) return;
    activeAssignId = id;
    document.getElementById('modal-assign-title').textContent = d.title;
    document.getElementById('modal-assign-desc').textContent = d.description || '';
    document.getElementById('submit-url').value = '';
    document.getElementById('submit-modal').classList.remove('hidden');
}

async function performSubmitAssignment() {
    const url = document.getElementById('submit-url').value;
    if(!url) return alert("URLを入力してください");
    await db.collection('assignments').doc(activeAssignId).collection('submissions').add({
        studentId: currentUser.uid,
        studentName: userData.name,
        url: url,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("提出しました");
    document.getElementById('submit-modal').classList.add('hidden');
    loadAssignments();
}

async function loadSurveys() {
    const list = document.getElementById('survey-list');
    list.innerHTML = '<p class="text-gray-400 text-sm">読み込み中...</p>';
    const snap = await db.collection('surveys').where('classId', '==', primaryClassId).orderBy('createdAt', 'desc').get();
    list.innerHTML = '';
    if(snap.empty) {
        list.innerHTML = '<p class="text-gray-400 text-sm italic">アンケートはありません</p>';
        return;
    }
    for (const doc of snap.docs) {
        const d = doc.data();
        window.surveyCache[doc.id] = d;

        const respSnap = await db.collection('surveys').doc(doc.id).collection('responses').where('studentId', '==', currentUser.uid).get();
        const isAnswered = !respSnap.empty;

        const div = document.createElement('div');
        div.className = "bg-white p-6 rounded-2xl shadow-sm border border-blue-100";
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-lg">${d.title}</h3>
                <span class="text-xs px-2 py-1 rounded font-bold ${isAnswered ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'}">${isAnswered ? '回答済み' : '未回答'}</span>
            </div>
            <p class="text-sm text-gray-500 mb-4">${d.description || ''}</p>
            ${!isAnswered ? `<button onclick="openSurveyModal('${doc.id}')" class="w-full bg-blue-50 text-blue-700 py-2 rounded-xl font-bold hover:bg-blue-100 transition">回答する</button>` : ''}
        `;
        list.appendChild(div);
    }
}

let activeSurveyId = null;
window.openSurveyModal = function(id) {
    const d = window.surveyCache[id];
    if(!d) return;
    activeSurveyId = id;
    document.getElementById('modal-survey-title').textContent = d.title;
    document.getElementById('modal-survey-desc').textContent = d.description || '';
    const container = document.getElementById('survey-options-container');
    container.innerHTML = '';
    if(d.options && Array.isArray(d.options)) {
        d.options.forEach(opt => {
            const label = document.createElement('label');
            label.className = "flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-blue-50 transition";
            label.innerHTML = `<input type="radio" name="survey-opt" value="${opt}" class="w-5 h-5 text-blue-600"> <span class="font-bold text-gray-700">${opt}</span>`;
            container.appendChild(label);
        });
    }
    document.getElementById('survey-resp-modal').classList.remove('hidden');
}

async function performSubmitSurvey() {
    const selected = document.querySelector('input[name="survey-opt"]:checked');
    if(!selected) return alert("選択してください");
    await db.collection('surveys').doc(activeSurveyId).collection('responses').add({
        studentId: currentUser.uid,
        choice: selected.value,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("回答を送信しました");
    document.getElementById('survey-resp-modal').classList.add('hidden');
    loadSurveys();
}

async function loadHomeAnnouncements() {
    const list = document.getElementById('announce-list-home');
    if(!list) return;
    const snap = await db.collection('announcements').where('classId', '==', primaryClassId).orderBy('createdAt', 'desc').limit(3).get();
    list.innerHTML = '';
    if(snap.empty) { list.innerHTML = '<p class="text-gray-400 text-sm">お知らせはありません</p>'; return; }
    snap.forEach(doc => {
        const d = doc.data();
        const date = d.createdAt ? d.createdAt.toDate().toLocaleDateString() : '';
        const div = document.createElement('div');
        div.className = "bg-gray-50 p-4 rounded-xl border-l-4 border-blue-400";
        div.innerHTML = `<div class="flex justify-between mb-1"><span class="font-bold text-gray-800 text-sm">${d.title}</span><span class="text-xs text-gray-400">${date}</span></div><p class="text-xs text-gray-600 truncate">${d.body}</p>`;
        list.appendChild(div);
    });
}

async function loadAnnouncementsList() {
    const list = document.getElementById('announce-list-full');
    list.innerHTML = '読み込み中...';
    const snap = await db.collection('announcements').where('classId', '==', primaryClassId).orderBy('createdAt', 'desc').get();
    list.innerHTML = '';
    if(snap.empty) { list.innerHTML = '<p class="text-gray-400">お知らせはありません</p>'; return; }
    snap.forEach(doc => {
        const d = doc.data();
        const date = d.createdAt ? d.createdAt.toDate().toLocaleDateString() : '';
        const div = document.createElement('div');
        div.className = "bg-white p-6 rounded-2xl shadow-sm border border-blue-50";
        div.innerHTML = `<div class="flex justify-between mb-2"><span class="font-bold text-lg">${d.title}</span><span class="text-xs text-gray-400">${date}</span></div><p class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">${d.body}</p>`;
        list.appendChild(div);
    });
}

// Reuse logic from original
async function loadUnifiedPortal(schoolId) {
    const gridClass = document.getElementById('app-grid-class');
    const gridSchool = document.getElementById('app-grid-school');
    if(!gridClass) return;
    gridClass.innerHTML = ''; gridSchool.innerHTML = '';

    const snapTenant = await db.collection('portal_links').where('tenantId', '==', userData.tenantId).where('isTenantWide', '==', true).get();
    snapTenant.forEach(doc => renderPortalLink(doc.data(), gridSchool)); // Show tenant wide in school grid for students

    const snapSchool = await db.collection('portal_links').where('schoolId', '==', schoolId).where('isSchoolWide', '==', true).get();
    snapSchool.forEach(doc => renderPortalLink(doc.data(), gridSchool));

    const snapClass = await db.collection('portal_links').where('classId', '==', primaryClassId).get();
    snapClass.forEach(doc => renderPortalLink(doc.data(), gridClass));
}

function renderPortalLink(d, container) {
    const url = formatURL(d.url);
    const a = document.createElement('a');
    a.href = url || '#';
    if(url) a.target = "_blank";
    a.className = "bg-white p-4 rounded-2xl shadow-sm border border-blue-50 flex flex-col items-center hover:shadow-md transition transform hover:-translate-y-1";
    a.innerHTML = `<img src="${d.iconUrl || 'https://via.placeholder.com/64'}" class="w-12 h-12 mb-2 rounded-xl object-cover shadow-sm"><span class="text-[10px] font-bold text-center leading-tight text-gray-700">${d.title}</span>`;
    container.appendChild(a);
}

function formatURL(url) {
    if(!url) return "";
    const trimmed = url.trim();
    if(!trimmed) return "";
    if(trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return 'https://' + trimmed;
}

function loadUnifiedActivities() {
    db.collection('activities').doc(`screenshare_${primaryClassId}`).onSnapshot(doc => {
        updateScreenShareUI(doc.exists && doc.data().isPresenting, primaryClassId);
    });
    db.collection('classes').doc(primaryClassId).collection('active_boards').onSnapshot(snap => {
        const list = document.getElementById('wb-list');
        list.innerHTML = '';
        if(snap.empty) { list.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">開催中のボードはありません</p>'; return; }
        snap.forEach(doc => {
            const b = doc.data();
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-blue-50 p-3 rounded-xl border border-blue-100 mb-2";
            div.innerHTML = `<div><span class="font-bold text-blue-900 text-sm">${b.name}</span></div><button onclick="joinActivity('whiteboard', '${doc.id}', '${primaryClassId}')" class="bg-blue-600 text-white px-4 py-1 rounded-lg text-xs font-bold shadow-sm">参加</button>`;
            list.appendChild(div);
        });
    });
}

function updateScreenShareUI(isPresenting, cid) {
    const card = document.getElementById('ss-card');
    const btn = document.getElementById('btn-join-ss');
    const txt = document.getElementById('ss-status-text');
    if(isPresenting) {
        card.classList.remove('opacity-50', 'border-gray-300'); card.classList.add('border-green-400', 'shadow-lg');
        btn.disabled = false; btn.classList.replace('bg-gray-400', 'bg-green-500'); btn.classList.remove('cursor-not-allowed');
        txt.textContent = "開催中"; txt.classList.replace('bg-gray-200', 'bg-green-100'); txt.classList.replace('text-gray-600', 'text-green-700');
        btn.onclick = () => joinActivity('screenshare', null, cid);
    } else {
        card.classList.add('opacity-50', 'border-gray-300'); card.classList.remove('border-green-400', 'shadow-lg');
        btn.disabled = true; btn.classList.replace('bg-green-500', 'bg-gray-400'); btn.classList.add('cursor-not-allowed');
        txt.textContent = "待機中"; txt.classList.replace('bg-green-100', 'bg-gray-200'); txt.classList.replace('text-green-700', 'text-gray-600');
    }
}

function joinActivity(type, boardId, cid) {
    if(isPreview) return;
    if(type==='screenshare') window.location.href=`screenshare.html?classId=${cid}&mode=student`;
    else window.location.href=`whiteboard.html?classId=${cid}&boardId=${boardId}&mode=student`;
}

async function checkDailySubmission() {
    const snap = await db.collection('daily_records').where('studentId', '==', currentUser.uid).orderBy('createdAt', 'desc').limit(1).get();
    if(!snap.empty) {
        const d = snap.docs[0].data();
        const rDate = d.createdAt ? d.createdAt.toDate() : new Date(0);
        const today = new Date();
        if(rDate.toDateString() === today.toDateString()) {
            document.getElementById('daily-form').classList.add('hidden');
            document.getElementById('daily-done').classList.remove('hidden');
        }
    }
}

async function submitDaily() {
    if(!selectedMood) return alert("気分を選択してね");
    const temp = document.getElementById('temp').value;
    if(!temp) return alert("体温を入力してね");
    await db.collection('daily_records').add({
        studentId: currentUser.uid, studentName: userData.name, classId: primaryClassId, schoolId: userData.schoolId,
        mood: selectedMood, temperature: parseFloat(temp), comment: document.getElementById('daily-comment').value,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('daily-form').classList.add('hidden');
    document.getElementById('daily-done').classList.remove('hidden');
}

window.switchAttendTab = function(tab) {
    document.getElementById('panel-daily').classList.toggle('hidden', tab!=='daily');
    document.getElementById('panel-absent').classList.toggle('hidden', tab!=='absent');
    document.getElementById('tab-daily').classList.toggle('border-blue-500', tab==='daily');
    document.getElementById('tab-daily').classList.toggle('text-blue-600', tab==='daily');
    document.getElementById('tab-absent').classList.toggle('border-blue-500', tab==='absent');
    document.getElementById('tab-absent').classList.toggle('text-blue-600', tab==='absent');
}

window.submitAttendance = async function() {
    const date = document.getElementById('attend-date').value;
    const type = document.querySelector('input[name="attend-type"]:checked').value;
    if(!date) return alert("日付を選択してね");
    await db.collection('attendance').add({
        studentId: currentUser.uid, studentName: userData.name, classId: primaryClassId, schoolId: userData.schoolId,
        date, type, reason: document.getElementById('attend-reason').value,
        suspendUntil: type==='suspend' ? document.getElementById('suspend-until').value : null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("送信しました");
}

function selectMood(mood, btn) {
    selectedMood = mood;
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected', 'bg-yellow-100', 'bg-gray-100', 'bg-red-100'));
    const color = mood==='good' ? 'bg-yellow-100' : mood==='normal' ? 'bg-gray-100' : 'bg-red-100';
    btn.classList.add('selected', color);
}

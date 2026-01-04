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
            // Verify role
            if (data.role !== 'teacher') {
                alert('権限がありません');
                window.location.href = 'login.html';
                return;
            }

            // 1. Check Profile Completion
            // Teachers do NOT need profile setup (Name is set by Admin).
            // Removing checkAndShowProfileSetup call as per requirements.

            // 2. Load Affiliated Classes
            await loadAffiliatedClasses(data);

            // 3. Initial Load
            document.getElementById('loading').classList.add('hidden');

            // Feature Flag Check (Daily Record)
            try {
                const schoolDoc = await db.collection('schools').doc(data.schoolId).get();
                if(schoolDoc.exists && schoolDoc.data().features && schoolDoc.data().features.dailyRecord === false) {
                    // Disable Daily Record
                    // Hide Nav
                    const navBtn = document.querySelector('button[onclick="showSection(\'daily\')"]');
                    if(navBtn) navBtn.style.display = 'none';
                    // Hide Widget
                    const widget = document.getElementById('home-stats');
                    if(widget && widget.parentElement) widget.parentElement.style.display = 'none';
                }
            } catch(e) {
                console.warn("Feature flag check failed", e);
            }

            // Run Cleanup (Background)
            cleanOldLogs(db, data.schoolId).catch(e => console.error("Cleanup error", e));

            // Check AI Config
            try {
                const aiConfig = await AIService.getConfig(data.tenantId);
                const aiBtn = document.getElementById('btn-ai-draft');
                if (!aiConfig.enabled) {
                    if(aiBtn) aiBtn.style.display = 'none';
                }
            } catch(e) {
                const aiBtn = document.getElementById('btn-ai-draft');
                if(aiBtn) aiBtn.style.display = 'none';
            }

            // Set date picker to today
            const dp = document.getElementById('daily-date-picker');
            if(dp) dp.valueAsDate = new Date();

            const homeDp = document.getElementById('home-absent-date');
            if(homeDp) {
                homeDp.valueAsDate = new Date();
                homeDp.onchange = loadAbsenteesWidget;
            }

            // Clean old logs
            if(typeof cleanOldLogs === 'function') cleanOldLogs(db);

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

    // Merge classId and affiliations
    const classIds = new Set();

    // 1. Primary Class
    if (userData.classId) classIds.add(userData.classId);

    // 2. Affiliations
    if (userData.affiliations && Array.isArray(userData.affiliations)) {
        userData.affiliations.forEach(a => classIds.add(a.classId));
    }

    const idsArray = Array.from(classIds);

    if (idsArray.length > 0) {
        const chunks = [];
        for (let i = 0; i < idsArray.length; i += 10) {
             chunks.push(idsArray.slice(i, i + 10));
        }

        for (const chunk of chunks) {
            const snap = await db.collection('classes').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
            snap.forEach(d => availableClasses.push({ id: d.id, ...d.data() }));
        }
    }

    if (availableClasses.length === 0) {
        const opt = document.createElement('option');
        opt.text = "所属クラスなし";
        select.appendChild(opt);
        return;
    }

    // Grouping by Type (Class vs Club)
    const classGroup = document.createElement('optgroup');
    classGroup.label = "クラス (ホームルーム)";
    const clubGroup = document.createElement('optgroup');
    clubGroup.label = "部活動";

    availableClasses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (c.type === 'club') {
            clubGroup.appendChild(opt);
        } else {
            classGroup.appendChild(opt);
        }
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

    // Refresh current section
    const activeSection = document.querySelector('section:not(.hidden)');
    if (activeSection) {
        const secId = activeSection.id.replace('section-', '');
        loadSectionData(secId);
    }
}

function showSection(id) {
    document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`section-${id}`).classList.remove('hidden');
    loadSectionData(id);
}

function loadSectionData(id) {
    if (!currentClassId) return;

    if (id === 'daily') loadDailyRecords();
    if (id === 'portal') loadPortalLinks();
    if (id === 'announce') loadAnnouncements();
    if (id === 'students') loadStudentList();
    if (id === 'home') {
        loadHomeStats();
        loadWhiteboards();
        loadAbsenteesWidget();
    }
}

// --- HOME ---
async function loadHomeStats() {
    if (!currentClassId) return;

    // Just count daily records for now
    const today = new Date();
    today.setHours(0,0,0,0);
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const schoolId = userDoc.data().schoolId;

    const recordsSnap = await db.collection('daily_records')
        .where('classId', '==', currentClassId)
        .where('schoolId', '==', schoolId) // Must include for rules
        .where('createdAt', '>=', today)
        .get();
    const recordCount = recordsSnap.size;

    const html = `
        <div class="text-4xl font-bold text-center text-gray-700">
            ${recordCount} <span class="text-lg text-gray-400">人</span>
        </div>
        <p class="text-center text-sm text-gray-500 mt-2">本日の健康観察提出済み</p>
    `;
    const statsEl = document.getElementById('home-stats');
    if (statsEl) statsEl.innerHTML = html;
}

async function loadAbsenteesWidget() {
    if (!currentClassId) return;

    // Updated container ID from HTML fix
    const container = document.getElementById('home-absentees-container');
    if(!container) return;

    container.innerHTML = '<p class="text-gray-400 text-sm">読み込み中...</p>';

    const dateInput = document.getElementById('home-absent-date');
    const dateStr = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const schoolId = userDoc.data().schoolId;

    const snap = await db.collection('attendance')
        .where('classId', '==', currentClassId)
        .where('schoolId', '==', schoolId) // Must include for rules
        .where('date', '==', dateStr)
        .get();

    if(snap.empty) {
        container.innerHTML = '<p class="text-gray-500 text-sm">欠席・遅刻の連絡はありません</p>';
        return;
    }

    let html = '<h4 class="font-bold text-sm text-gray-600 mb-2">欠席・遅刻など</h4><ul class="space-y-2">';
    snap.forEach(doc => {
        const d = doc.data();
        let badgeColor = 'bg-gray-500';
        if(d.type === 'absent') badgeColor = 'bg-red-500';
        if(d.type === 'suspend') badgeColor = 'bg-purple-500';
        if(d.type === 'late') badgeColor = 'bg-yellow-500';

        const typeLabel = d.type === 'absent' ? '欠席' : d.type === 'suspend' ? '出席停止' : '遅刻';
        const reason = d.reason || '理由なし';
        const suspendUntil = d.suspendUntil ? ` (~${d.suspendUntil})` : '';

        html += `
            <li class="flex justify-between items-center bg-gray-50 p-2 rounded cursor-pointer hover:bg-gray-100" onclick="alert('${reason}${suspendUntil}')">
                <span class="font-bold text-sm">${d.studentName}</span>
                <span class="${badgeColor} text-white text-xs px-2 py-1 rounded">${typeLabel}</span>
            </li>
        `;
    });
    html += '</ul>';
    container.innerHTML = html;
}

function launchActivity(type) {
    if (!currentClassId) return alert("クラス設定エラー");
    const url = `${type}.html?classId=${currentClassId}&mode=teacher`;
    window.open(url, '_blank');
}

// --- WHITEBOARDS ---
function loadWhiteboards() {
    if (wbUnsubscribe) wbUnsubscribe();
    if (!currentClassId) return;

    const list = document.getElementById('wb-list');
    const btn = document.getElementById('btn-create-wb');
    if(!list) return;

    wbUnsubscribe = db.collection('classes').doc(currentClassId).collection('active_boards')
        .onSnapshot(snap => {
            list.innerHTML = '';
            if(btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                btn.innerText = "作成";
            }

            if (snap.empty) {
                list.innerHTML = '<p class="text-xs text-gray-400">現在アクティブなボードはありません</p>';
                return;
            }

            snap.forEach(doc => {
                const data = doc.data();
                const div = document.createElement('div');
                div.className = "flex justify-between items-center bg-blue-50 p-2 rounded border border-blue-100";
                div.innerHTML = `
                    <span class="text-sm font-bold text-blue-800 truncate flex-grow mr-2">${data.name}</span>
                    <button onclick="joinWhiteboard('${doc.id}', '${data.name}')" class="text-xs bg-white border border-blue-300 px-2 py-1 rounded text-blue-600 hover:bg-blue-100">開く</button>
                `;
                list.appendChild(div);
            });
        });
}

function createWhiteboard() {
    const nameInput = document.getElementById('new-wb-name');
    const name = nameInput.value;
    if (!name) return alert("名前を入力してください");
    const boardId = 'wb_' + Math.random().toString(36).substr(2, 9);
    joinWhiteboard(boardId, name);
    nameInput.value = '';
}

function joinWhiteboard(boardId, name) {
    const url = `whiteboard.html?classId=${currentClassId}&boardId=${boardId}&name=${encodeURIComponent(name)}&mode=teacher`;
    window.open(url, '_blank');
}

// --- DAILY RECORDS ---
async function loadDailyRecords() {
    if (!currentClassId) return;
    const list = document.getElementById('daily-list');
    list.innerHTML = '<tr><td colspan="5" class="p-4 text-center">読み込み中...</td></tr>';

    const dateVal = document.getElementById('daily-date-picker').value;
    const date = new Date(dateVal);
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);

    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const schoolId = userDoc.data().schoolId;

    const snap = await db.collection('daily_records')
        .where('classId', '==', currentClassId)
        .where('schoolId', '==', schoolId) // Must include for rules
        .where('createdAt', '>=', date)
        .where('createdAt', '<', nextDate)
        .orderBy('createdAt', 'desc')
        .get();

    list.innerHTML = '';
    if (snap.empty) {
        list.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">データなし</td></tr>';
        return;
    }

    snap.forEach(doc => {
        const d = doc.data();
        const time = d.createdAt ? d.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';
        const moodIcon = d.mood === 'good' ? '😊' : d.mood === 'bad' ? '😫' : '😐';

        const isAbnormal = (d.temperature > 37.5) || (d.mood === 'bad');
        let rowClass = isAbnormal ? "bg-red-50 border-l-4 border-red-500" : "";
        let tempClass = d.temperature > 37.5 ? "text-red-600 font-bold" : "";

        const tr = document.createElement('tr');
        tr.className = `relative group ${rowClass}`;

        let tooltip = '';
        if (isAbnormal) {
            const notifiedText = d.adminNotified ? '<span class="text-green-600 font-bold text-xs ml-2">通知済み</span>' : '';
            const notifyBtn = !d.adminNotified ? `<button onclick="notifyAdmin('${doc.id}')" class="bg-red-600 text-white text-xs px-2 py-1 rounded hover:bg-red-700 ml-2">管理者に通知</button>` : '';

            tooltip = `
                <div class="hidden group-hover:block absolute top-0 left-0 w-full h-full bg-white bg-opacity-95 flex items-center justify-center space-x-4 z-10 p-2 shadow-inner">
                    <span class="font-bold text-red-600">⚠️ 要対応: 保健室へ誘導してください</span>
                    ${notifyBtn}
                    ${notifiedText}
                </div>
            `;
        }

        tr.innerHTML = `
            ${tooltip}
            <td class="p-3 font-bold">${d.studentName || '不明'}</td>
            <td class="p-3 text-2xl">${moodIcon}</td>
            <td class="p-3 ${tempClass}">${d.temperature}℃</td>
            <td class="p-3 text-gray-600 truncate max-w-xs">${d.comment || ''}</td>
            <td class="p-3 text-xs text-gray-400">${time}</td>
        `;
        list.appendChild(tr);
    });
}

async function notifyAdmin(recordId) {
    if(!confirm("管理者にこの生徒の体調不良を通知しますか？")) return;
    try {
        await db.collection('daily_records').doc(recordId).update({
            adminNotified: true,
            notifiedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        loadDailyRecords();
        alert("管理者に通知しました");
    } catch(e) {
        console.error(e);
        alert("通知に失敗しました");
    }
}

// --- PORTAL ---
async function loadPortalLinks() {
    if (!currentClassId) return;
    const container = document.getElementById('portal-list-edit');
    if(!container) return;
    container.innerHTML = '';

    const snap = await db.collection('portal_links').where('classId', '==', currentClassId).get();
    snap.forEach(doc => {
        const d = doc.data();
        const div = document.createElement('div');
        div.className = "bg-gray-100 p-4 rounded flex flex-col items-center relative group";
        const img = d.iconUrl || 'https://via.placeholder.com/64';
        div.innerHTML = `
            <img src="${img}" class="w-16 h-16 rounded mb-2 object-cover">
            <span class="font-bold text-sm text-center">${d.title}</span>
            <button onclick="deletePortalLink('${doc.id}')" class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition">×</button>
        `;
        container.appendChild(div);
    });
}

async function addPortalLink() {
    const title = document.getElementById('link-title').value;
    const url = document.getElementById('link-url').value;
    const iconUrl = document.getElementById('link-icon').value;
    if (!title || !url) return alert('タイトルとURLは必須です');
    try {
        await db.collection('portal_links').add({
            classId: currentClassId,
            title, url, iconUrl,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('link-title').value = '';
        document.getElementById('link-url').value = '';
        document.getElementById('link-icon').value = '';
        loadPortalLinks();
    } catch(e) {
        alert("追加失敗");
    }
}

async function deletePortalLink(id) {
    if(!confirm('削除しますか？')) return;
    await db.collection('portal_links').doc(id).delete();
    loadPortalLinks();
}

// --- ANNOUNCEMENTS ---
async function loadAnnouncements() {
    if (!currentClassId) return;
    const div = document.getElementById('announce-history');
    if(!div) return;
    div.innerHTML = '';

    const snap = await db.collection('announcements')
        .where('classId', '==', currentClassId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

    snap.forEach(doc => {
        const d = doc.data();
        const date = d.createdAt ? d.createdAt.toDate().toLocaleDateString() : '';
        const card = document.createElement('div');
        card.className = "border p-4 rounded bg-gray-50";
        card.innerHTML = `
            <div class="flex justify-between mb-2">
                <span class="font-bold text-lg">${d.title}</span>
                <span class="text-xs text-gray-500">${date}</span>
            </div>
            <p class="text-sm text-gray-700 whitespace-pre-wrap">${d.body}</p>
        `;
        div.appendChild(card);
    });
}

async function draftAnnouncementWithAI() {
    if (!currentUser) return;
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const tenantId = userDoc.data().tenantId;
    const topic = prompt("トピックを入力:");
    if (!topic) return;
    const btn = document.getElementById('btn-ai-draft');
    btn.textContent = "AI生成中...";
    btn.disabled = true;
    try {
        const draft = await AIService.draftAnnouncement(tenantId, topic);
        document.getElementById('announce-body').value = draft;
    } catch(e) {
        alert("AI生成エラー: " + e.message);
    } finally {
        btn.textContent = "🤖 AI下書き";
        btn.disabled = false;
    }
}

async function postAnnouncement() {
    const title = document.getElementById('announce-title').value;
    const body = document.getElementById('announce-body').value;
    if(!title || !body) return alert("入力してください");
    try {
        await db.collection('announcements').add({
            classId: currentClassId,
            title, body,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('announce-title').value = '';
        document.getElementById('announce-body').value = '';
        alert("送信しました");
        loadAnnouncements();
    } catch(e) {
        alert("送信失敗");
    }
}

// --- STUDENT LIST & EDIT ---
async function loadStudentList() {
    if (!currentClassId) return;
    const tbody = document.getElementById('student-list-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">読み込み中...</td></tr>';

    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const schoolId = userDoc.data().schoolId;

    // 1. Fetch Absences Count
    const absentCounts = {};
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    try {
        const attendSnap = await db.collection('attendance')
            .where('schoolId', '==', schoolId)
            .where('type', 'in', ['absent', 'suspend'])
            .where('createdAt', '>=', oneYearAgo)
            .get();

        attendSnap.forEach(doc => {
            const sid = doc.data().studentId;
            absentCounts[sid] = (absentCounts[sid] || 0) + 1;
        });
    } catch(e) {
        console.warn("Error fetching attendance counts", e);
    }

    // 2. Fetch Students
    // Need tenantId to satisfy rules
    const tenantId = userDoc.data().tenantId;
    const snap = await db.collection('users')
        .where('schoolId', '==', schoolId)
        .where('tenantId', '==', tenantId) // Fix permission error
        .where('role', '==', 'student')
        .get();

    // Pre-fetch all club names in the school to resolve IDs easily
    const clubMap = {};
    try {
        const clubSnap = await db.collection('classes').where('schoolId', '==', schoolId).where('type', '==', 'club').get();
        clubSnap.forEach(c => clubMap[c.id] = c.data().name);
    } catch(e) {
        console.warn("Error fetching clubs", e);
    }

    const students = [];

    snap.forEach(doc => {
        const d = doc.data();
        let isMember = false;
        if(d.classId === currentClassId) isMember = true;
        if(d.affiliations && d.affiliations.some(a => a.classId === currentClassId)) isMember = true;

        if(isMember) {
            students.push({id: doc.id, ...d});
        }
    });

    if(students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">生徒がいません</td></tr>';
        return;
    }

    students.sort((a,b) => (a.attendanceNumber || 999) - (b.attendanceNumber || 999));

    tbody.innerHTML = '';
    students.forEach(s => {
        const count = absentCounts[s.id] || 0;

        // Resolve Clubs
        const clubNames = [];
        if(s.affiliations) {
            s.affiliations.forEach(aff => {
                // If the affiliation is in our clubMap, add name
                if(clubMap[aff.classId]) {
                    clubNames.push(clubMap[aff.classId]);
                }
            });
        }
        const clubStr = clubNames.length > 0 ? clubNames.join(', ') : '-';

        // Check if context is club to show Remove button
        let actionHtml = `<button onclick="editStudent('${s.id}', '${s.name}', '${s.attendanceNumber||''}')" class="bg-gray-200 px-2 py-1 rounded text-xs hover:bg-gray-300">編集</button>`;

        // Find if current context is a club
        const currentContextClass = availableClasses.find(c => c.id === currentClassId);
        if(currentContextClass && currentContextClass.type === 'club') {
            actionHtml += ` <button onclick="removeStudentFromClub('${s.id}', '${currentClassId}')" class="bg-red-100 text-red-600 px-2 py-1 rounded text-xs hover:bg-red-200 ml-1">脱退</button>`;
        }

        const tr = document.createElement('tr');
        tr.className = "border-b hover:bg-gray-50";
        tr.innerHTML = `
            <td class="p-3 text-center">${s.attendanceNumber || '-'}</td>
            <td class="p-3 font-bold">${s.name}</td>
            <td class="p-3 text-sm text-gray-600">${clubStr}</td>
            <td class="p-3 text-center text-xs text-gray-400 font-bold">${count > 0 ? count + '回' : '-'}</td>
            <td class="p-3 text-center">
                ${actionHtml}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function removeStudentFromClub(uid, clubId) {
    if(!confirm("この生徒を部活から脱退させますか？")) return;
    try {
        const doc = await db.collection('users').doc(uid).get();
        const aff = doc.data().affiliations || [];
        // Filter out this club
        const newAff = aff.filter(a => a.classId !== clubId);
        await db.collection('users').doc(uid).update({ affiliations: newAff });
        alert("脱退させました");
        loadStudentList();
    } catch(e) {
        alert("エラー: " + e.message);
    }
}

function editStudent(uid, name, currentNum) {
    // Show simple prompt-based edit or use a modal
    // User requested "Change Grade, Class, Attendance Number"
    // Since we don't have a modal HTML ready in teacher-dashboard.html, using prompts sequence or a simple injected modal is best.
    // Let's inject a modal for better UX.

    const modalId = 'edit-student-modal';
    if(document.getElementById(modalId)) document.getElementById(modalId).remove();

    const div = document.createElement('div');
    div.id = modalId;
    div.className = "fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50";
    div.innerHTML = `
        <div class="bg-white rounded p-6 w-96">
            <h3 class="font-bold text-lg mb-4">${name} の編集</h3>
            <label class="block text-sm font-bold mb-1">出席番号</label>
            <input type="number" id="edit-num" value="${currentNum}" class="border p-2 w-full mb-4 rounded">

            <p class="text-xs text-red-500 mb-4">※ 学年・クラスの変更は、学校管理画面または本人のプロフィール設定から行ってください。</p>

            <div class="flex justify-end gap-2">
                <button onclick="document.getElementById('${modalId}').remove()" class="bg-gray-300 px-4 py-2 rounded">キャンセル</button>
                <button id="btn-save-student" class="bg-blue-600 text-white px-4 py-2 rounded">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);

    document.getElementById('btn-save-student').onclick = async () => {
        const newNum = document.getElementById('edit-num').value;
        try {
            await db.collection('users').doc(uid).update({
                attendanceNumber: parseInt(newNum)
            });
            alert("更新しました");
            document.getElementById(modalId).remove();
            loadStudentList();
        } catch(e) {
            alert("更新失敗: " + e.message);
        }
    };
}

// Cleanup Script
async function cleanOldLogs(db) {
    // 365 days ago
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);

    // Batch delete helper
    const deleteOld = async (collection) => {
        const snap = await db.collection(collection).where('createdAt', '<', cutoff).limit(500).get();
        if(snap.empty) return;
        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`Cleaned ${snap.size} old docs from ${collection}`);
    };

    await deleteOld('daily_records');
    await deleteOld('attendance');
}

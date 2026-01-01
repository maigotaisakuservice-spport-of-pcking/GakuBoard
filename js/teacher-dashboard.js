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
            // If function is imported from profile-setup.js
            if (typeof checkAndShowProfileSetup === 'function') {
                await checkAndShowProfileSetup(user, db);
            }

            // 2. Load Affiliated Classes
            await loadAffiliatedClasses(data);

            // 3. Initial Load
            document.getElementById('loading').classList.add('hidden');

            // Check AI Config and toggle button visibility
            try {
                const aiConfig = await AIService.getConfig(data.tenantId);
                const aiBtn = document.getElementById('btn-ai-draft');
                if (!aiConfig.enabled) {
                    if(aiBtn) aiBtn.style.display = 'none';
                }
            } catch(e) {
                console.warn("AI check failed", e);
                const aiBtn = document.getElementById('btn-ai-draft');
                if(aiBtn) aiBtn.style.display = 'none';
            }

            // Set date picker to today
            const dp = document.getElementById('daily-date-picker');
            if(dp) dp.valueAsDate = new Date();

            showSection('home');
        }
    } else {
        window.location.href = 'login.html';
    }
});

/**
 * Load classes based on affiliations or backward compatibility 'classId'
 */
async function loadAffiliatedClasses(userData) {
    availableClasses = [];
    const select = document.getElementById('ctx-class-select');
    select.innerHTML = '';

    // A. New 'affiliations' array
    if (userData.affiliations && Array.isArray(userData.affiliations) && userData.affiliations.length > 0) {
        const classIds = userData.affiliations.map(a => a.classId);

        // Fetch class details (Name, etc.)
        // Firestore 'in' query limit is 10. If teacher has >10 classes, we might need logic.
        // For now, assume < 10.
        if (classIds.length > 0) {
            // Chunking if necessary, but keep simple
            const chunks = [];
            for (let i = 0; i < classIds.length; i += 10) {
                 chunks.push(classIds.slice(i, i + 10));
            }

            for (const chunk of chunks) {
                const snap = await db.collection('classes').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
                snap.forEach(d => availableClasses.push({ id: d.id, ...d.data() }));
            }
        }
    }
    // B. Old 'classId' fallback
    else if (userData.classId) {
        const clsDoc = await db.collection('classes').doc(userData.classId).get();
        if (clsDoc.exists) {
            availableClasses.push({ id: clsDoc.id, ...clsDoc.data() });
        }
    }

    // Populate Dropdown
    if (availableClasses.length === 0) {
        const opt = document.createElement('option');
        opt.text = "所属クラスなし";
        select.appendChild(opt);
        return;
    }

    availableClasses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        select.appendChild(opt);
    });

    // Event Listener for Switch
    select.onchange = (e) => switchClassContext(e.target.value);

    // Set Initial Context (First one)
    switchClassContext(availableClasses[0].id);
}

function switchClassContext(classId) {
    currentClassId = classId;
    const cls = availableClasses.find(c => c.id === classId);

    // Update UI Header
    const homeHeader = document.getElementById('home-class-name');
    if (homeHeader) homeHeader.textContent = cls ? `(${cls.name})` : '';

    // Set Dropdown Value (if changed programmatically)
    const select = document.getElementById('ctx-class-select');
    if (select.value !== classId) select.value = classId;

    console.log("Switched context to:", cls ? cls.name : classId);

    // Refresh current section
    const activeSection = document.querySelector('section:not(.hidden)');
    if (activeSection) {
        const secId = activeSection.id.replace('section-', '');
        loadSectionData(secId);
    }
}

// Navigation
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
    if (id === 'home') {
        loadHomeStats();
        loadWhiteboards();
    }
}

// --- HOME ---
async function loadHomeStats() {
    if (!currentClassId) return;

    // Get Student Count (approx)
    // Note: We need to count users who have this classId in their affiliations OR legacy classId
    // Complex Query in Firestore.
    // Simplified: Query users where classId == current (legacy) OR array-contains?
    // "affiliations" is an array of objects, so we can't use array-contains easily on ID alone.
    // Compromise: Just count legacy classId users for now or fetch all school users and filter?
    // Given we are client-side only:
    // fetch users in School, filter in memory (might be heavy if huge school).
    // Or, we assume legacy 'classId' is still primary for "Home Room".
    // Let's rely on 'classId' field if it exists, or skip precise count.

    // Better Approach: Store a 'memberCount' in the class document? No, sync issues.
    // Let's try to query 'classId' == currentClassId first (Legacy/Primary).

    const studentsSnap = await db.collection('users')
        .where('classId', '==', currentClassId)
        .where('role', '==', 'student')
        .get();
    let studentCount = studentsSnap.size;

    // Get Today's Records
    const today = new Date();
    today.setHours(0,0,0,0);
    const recordsSnap = await db.collection('daily_records')
        .where('classId', '==', currentClassId)
        .where('createdAt', '>=', today)
        .get();
    const recordCount = recordsSnap.size;

    const html = `
        <div class="text-4xl font-bold text-center text-gray-700">
            ${recordCount} <span class="text-lg text-gray-400">/ ${studentCount} (主所属)</span>
        </div>
        <p class="text-center text-sm text-gray-500 mt-2">本日の健康観察提出済み</p>
    `;
    const statsEl = document.getElementById('home-stats');
    if (statsEl) statsEl.innerHTML = html;
}

function launchActivity(type) {
    if (!currentClassId) return alert("クラス設定エラー");
    // Only for screenshare now, whiteboard uses specific function
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
            // UNLIMITED: Removed count check
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

    // Generate ID
    const boardId = 'wb_' + Math.random().toString(36).substr(2, 9);

    // Open
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

    const snap = await db.collection('daily_records')
        .where('classId', '==', currentClassId)
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

        // Abnormality check
        const isAbnormal = (d.temperature > 37.5) || (d.mood === 'bad');
        let rowClass = isAbnormal ? "bg-red-50 border-l-4 border-red-500" : "";
        let tempClass = d.temperature > 37.5 ? "text-red-600 font-bold" : "";

        const tr = document.createElement('tr');
        tr.className = `relative group ${rowClass}`;

        // Tooltip logic for abnormal rows
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
        loadDailyRecords(); // Refresh
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

    const topic = prompt("お知らせのトピックやキーワードを入力してください (例: 来週の遠足の持ち物について)");
    if (!topic) return;

    const btn = document.getElementById('btn-ai-draft');
    const originalText = btn.textContent;
    btn.textContent = "AI生成中...";
    btn.disabled = true;

    try {
        const draft = await AIService.draftAnnouncement(tenantId, topic);
        document.getElementById('announce-body').value = draft;
    } catch(e) {
        alert("AI生成エラー: " + e.message);
    } finally {
        btn.textContent = originalText;
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

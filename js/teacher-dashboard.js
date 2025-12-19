// js/teacher-dashboard.js

let currentUser = null;
let currentClassId = null;
let wbUnsubscribe = null;

// Init
auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            const data = doc.data();
            // Verify role
            if (data.role !== 'teacher') {
                alert('権限がありません');
                window.location.href = 'login.html';
                return;
            }
            currentClassId = data.classId;
            document.getElementById('loading').classList.add('hidden');
            showSection('home');

            // Set date picker to today
            document.getElementById('daily-date-picker').valueAsDate = new Date();
        }
    } else {
        window.location.href = 'login.html';
    }
});

// Navigation
function showSection(id) {
    document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`section-${id}`).classList.remove('hidden');

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
    // Simple stats: Count of daily records today vs total students
    if (!currentClassId) return;

    // Get Student Count (approx)
    const studentsSnap = await db.collection('users')
        .where('classId', '==', currentClassId)
        .where('role', '==', 'student')
        .get();
    const studentCount = studentsSnap.size;

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
            ${recordCount} <span class="text-lg text-gray-400">/ ${studentCount}</span>
        </div>
        <p class="text-center text-sm text-gray-500 mt-2">本日の健康観察提出済み</p>
    `;
    document.getElementById('home-stats').innerHTML = html;
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

    const list = document.getElementById('wb-list');
    const btn = document.getElementById('btn-create-wb');

    wbUnsubscribe = db.collection('classes').doc(currentClassId).collection('active_boards')
        .onSnapshot(snap => {
            list.innerHTML = '';
            const count = snap.size;

            if (count >= 5) {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                btn.innerText = "上限";
            } else {
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

        // Temperature check
        let tempClass = "";
        if (d.temperature > 37.5) tempClass = "text-red-600 font-bold";

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-3 font-bold">${d.studentName || '不明'}</td>
            <td class="p-3 text-2xl">${moodIcon}</td>
            <td class="p-3 ${tempClass}">${d.temperature}℃</td>
            <td class="p-3 text-gray-600 truncate max-w-xs">${d.comment || ''}</td>
            <td class="p-3 text-xs text-gray-400">${time}</td>
        `;
        list.appendChild(tr);
    });
}


// --- PORTAL ---
async function loadPortalLinks() {
    const container = document.getElementById('portal-list-edit');
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
    const div = document.getElementById('announce-history');
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

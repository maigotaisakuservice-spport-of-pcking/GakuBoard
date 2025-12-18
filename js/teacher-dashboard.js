// js/teacher-dashboard.js

let currentUser = null;
let currentClassId = null;

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
    if (id === 'home') loadHomeStats();
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
    const url = `${type}.html?classId=${currentClassId}&mode=teacher`;
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

    // Need to fetch student names? Or assume stored in record?
    // Optimization: Store studentName in record to avoid N+1 queries.
    // Assuming record has studentName.

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

// js/student-dashboard.js

let currentUser = null;
let currentClassId = null;
let selectedMood = null;

auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.role !== 'student') {
                alert('生徒用アカウントではありません');
                window.location.href = 'login.html';
                return;
            }
            currentClassId = data.classId;
            document.getElementById('student-name').textContent = data.name || user.email; // Assuming name field or fallback

            checkDailySubmission();
            loadPortal();
            loadAnnouncements();
            loadActivities();
        }
    } else {
        window.location.href = 'login.html';
    }
});

function selectMood(mood, btn) {
    selectedMood = mood;
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected', 'bg-blue-100'));
    btn.classList.add('selected', 'bg-blue-100');
}

async function checkDailySubmission() {
    const today = new Date();
    today.setHours(0,0,0,0);

    const snap = await db.collection('daily_records')
        .where('studentId', '==', currentUser.uid)
        .where('createdAt', '>=', today)
        .get();

    if (!snap.empty) {
        document.getElementById('daily-form').classList.add('hidden');
        document.getElementById('daily-done').classList.remove('hidden');
    }
}

async function submitDaily() {
    if (!selectedMood) return alert("気分を選んでね！");
    const temp = document.getElementById('temp').value;
    if (!temp) return alert("体温を入れてね！");
    const comment = document.getElementById('daily-comment').value;

    try {
        await db.collection('daily_records').add({
            studentId: currentUser.uid,
            studentName: document.getElementById('student-name').textContent, // Cache name
            classId: currentClassId,
            schoolId: null, // Should fetch from user profile if needed, or derived
            mood: selectedMood,
            temperature: parseFloat(temp),
            comment: comment,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('daily-form').classList.add('hidden');
        document.getElementById('daily-done').classList.remove('hidden');
    } catch (e) {
        console.error(e);
        alert("送信できませんでした: " + e.message);
    }
}

async function loadPortal() {
    const grid = document.getElementById('portal-grid');
    grid.innerHTML = '';

    const snap = await db.collection('portal_links').where('classId', '==', currentClassId).get();
    snap.forEach(doc => {
        const d = doc.data();
        const a = document.createElement('a');
        a.href = d.url;
        a.target = "_blank";
        a.className = "bg-white p-4 rounded-xl shadow flex flex-col items-center hover:bg-gray-50 transition";
        const icon = d.iconUrl || 'https://via.placeholder.com/64?text=App';
        a.innerHTML = `
            <img src="${icon}" class="w-12 h-12 mb-2 rounded object-cover">
            <span class="text-xs font-bold text-center leading-tight">${d.title}</span>
        `;
        grid.appendChild(a);
    });
}

async function loadAnnouncements() {
    const list = document.getElementById('announce-list');
    list.innerHTML = '';

    const snap = await db.collection('announcements')
        .where('classId', '==', currentClassId)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();

    snap.forEach(doc => {
        const d = doc.data();
        const div = document.createElement('div');
        div.className = "bg-white p-4 rounded-xl shadow";
        const date = d.createdAt ? d.createdAt.toDate().toLocaleDateString() : '';
        div.innerHTML = `
            <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-indigo-700">${d.title}</span>
                <span class="text-xs text-gray-400">${date}</span>
            </div>
            <p class="text-sm text-gray-600">${d.body}</p>
        `;
        list.appendChild(div);
    });
}

function loadActivities() {
    // Screen Share
    db.collection('activities').doc(`screenshare_${currentClassId}`).onSnapshot(doc => {
        const card = document.getElementById('ss-card');
        const btn = document.getElementById('btn-join-ss');
        const txt = document.getElementById('ss-status-text');

        const isPresenting = doc.exists && doc.data().isPresenting;

        if (isPresenting) {
            card.classList.remove('opacity-50', 'border-gray-300');
            card.classList.add('border-green-500');
            btn.disabled = false;
            btn.classList.remove('bg-gray-400', 'cursor-not-allowed');
            btn.classList.add('bg-green-600', 'hover:bg-green-700');
            txt.textContent = "先生の画面共有 (開催中)";
            txt.classList.add('text-green-800');
        } else {
            card.classList.add('opacity-50', 'border-gray-300');
            card.classList.remove('border-green-500');
            btn.disabled = true;
            btn.classList.add('bg-gray-400', 'cursor-not-allowed');
            btn.classList.remove('bg-green-600', 'hover:bg-green-700');
            txt.textContent = "先生の画面共有 (待機中)";
            txt.classList.remove('text-green-800');
        }
    });

    // Whiteboards
    db.collection('classes').doc(currentClassId).collection('active_boards').onSnapshot(snap => {
        const list = document.getElementById('wb-list');
        list.innerHTML = '';

        if (snap.empty) {
            list.innerHTML = '<p class="text-gray-500 text-sm">現在開催中のボードはありません</p>';
            return;
        }

        snap.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100";
            div.innerHTML = `
                <span class="font-bold text-blue-900">${data.name}</span>
                <button onclick="joinActivity('whiteboard', '${doc.id}')" class="bg-blue-600 text-white px-4 py-1 rounded text-sm hover:bg-blue-700">参加</button>
            `;
            list.appendChild(div);
        });
    });
}

function joinActivity(type, boardId) {
    if (!currentClassId) return;

    if (type === 'screenshare') {
        window.location.href = `screenshare.html?classId=${currentClassId}&mode=student`;
    } else if (type === 'whiteboard') {
        window.location.href = `whiteboard.html?classId=${currentClassId}&boardId=${boardId}&mode=student`;
    }
}

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

function joinActivity(type) {
    if (!currentClassId) return;
    const url = `${type}.html?classId=${currentClassId}&mode=student`;
    window.location.href = url;
}

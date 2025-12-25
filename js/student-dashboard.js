// js/student-dashboard.js

let currentUser = null;
let currentAffiliations = []; // Array of { classId, yearType, attendanceNumber }
let primaryClassId = null; // The main class for daily records
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

            // 1. Check Profile Completion (Tell me about yourself)
            if (typeof checkAndShowProfileSetup === 'function') {
                await checkAndShowProfileSetup(user, db);
            }

            // 2. Set User Data
            document.getElementById('student-name').textContent = data.name || user.email;

            // 3. Resolve Affiliations
            await resolveAffiliations(data);

            // 4. Load Features
            checkDailySubmission();
            loadUnifiedPortal();
            loadUnifiedAnnouncements();
            loadUnifiedActivities();
            loadMexcbtData(); // New: Load Assignments and Results
        }
    } else {
        window.location.href = 'login.html';
    }
});

async function resolveAffiliations(userData) {
    currentAffiliations = [];

    // A. New array format
    if (userData.affiliations && Array.isArray(userData.affiliations)) {
        currentAffiliations = userData.affiliations;
    }
    // B. Legacy single ID
    else if (userData.classId) {
        currentAffiliations.push({ classId: userData.classId, yearType: 'current' });
    }

    // Determine "Primary" class for Daily Record defaults
    const primary = currentAffiliations.find(a => a.yearType === 'current');
    primaryClassId = primary ? primary.classId : (currentAffiliations[0]?.classId || null);

    // If multiple classes, populate Daily Record selector
    const selectorContainer = document.getElementById('daily-class-selector-container');
    const selector = document.getElementById('daily-class-select');

    if (currentAffiliations.length > 1) {
        selectorContainer.classList.remove('hidden');
        selector.innerHTML = '';

        for (const aff of currentAffiliations) {
            const clsDoc = await db.collection('classes').doc(aff.classId).get();
            if (clsDoc.exists) {
                const opt = document.createElement('option');
                opt.value = aff.classId;
                opt.textContent = clsDoc.data().name;
                if (aff.classId === primaryClassId) opt.selected = true;
                selector.appendChild(opt);
            }
        }
    } else {
        selectorContainer.classList.add('hidden');
    }
}

function selectMood(mood, btn) {
    selectedMood = mood;
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected', 'bg-blue-100'));
    btn.classList.add('selected', 'bg-blue-100');
}

async function checkDailySubmission() {
    try {
        const snap = await db.collection('daily_records')
            .where('studentId', '==', currentUser.uid)
            .get();

        let submittedToday = false;
        const now = new Date();
        const todayY = now.getFullYear();
        const todayM = now.getMonth();
        const todayD = now.getDate();

        snap.forEach(doc => {
            const data = doc.data();
            let rDate = data.createdAt ? data.createdAt.toDate() : new Date();

            if (rDate.getFullYear() === todayY &&
                rDate.getMonth() === todayM &&
                rDate.getDate() === todayD) {
                submittedToday = true;
            }
        });

        if (submittedToday) {
            document.getElementById('daily-form').classList.add('hidden');
            document.getElementById('daily-done').classList.remove('hidden');
        }
    } catch (e) {
        console.error("Error checking daily submission:", e);
    }
}

async function submitDaily() {
    if (!selectedMood) return alert("気分を選んでね！");
    const temp = document.getElementById('temp').value;
    if (!temp) return alert("体温を入れてね！");
    const comment = document.getElementById('daily-comment').value;

    let targetClassId = primaryClassId;
    const selector = document.getElementById('daily-class-select');
    if (!selector.closest('div').classList.contains('hidden')) {
        targetClassId = selector.value;
    }

    if (!targetClassId) return alert("クラスが見つかりません");

    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const schoolId = userDoc.data().schoolId;

        await db.collection('daily_records').add({
            studentId: currentUser.uid,
            studentName: document.getElementById('student-name').textContent,
            classId: targetClassId,
            schoolId: schoolId,
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

// --- UNIFIED VIEW LOGIC ---

async function loadUnifiedPortal() {
    const grid = document.getElementById('portal-grid');
    grid.innerHTML = '';

    const classIds = currentAffiliations.map(a => a.classId);
    if (classIds.length === 0) return;

    const snap = await db.collection('portal_links')
        .where('classId', 'in', classIds)
        .get();

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

async function loadUnifiedAnnouncements() {
    const list = document.getElementById('announce-list');
    list.innerHTML = '';

    const classIds = currentAffiliations.map(a => a.classId);
    if (classIds.length === 0) return;

    const snap = await db.collection('announcements')
        .where('classId', 'in', classIds)
        .get();

    let announcements = [];
    snap.forEach(doc => announcements.push(doc.data()));

    announcements.sort((a, b) => {
        const tA = a.createdAt ? a.createdAt.toMillis() : 0;
        const tB = b.createdAt ? b.createdAt.toMillis() : 0;
        return tB - tA;
    });

    announcements.forEach(d => {
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

function loadUnifiedActivities() {
    const classIds = currentAffiliations.map(a => a.classId);

    classIds.forEach(cid => {
        db.collection('activities').doc(`screenshare_${cid}`).onSnapshot(doc => {
            const isPresenting = doc.exists && doc.data().isPresenting;
            if (isPresenting) {
                updateScreenShareUI(true, cid);
            } else {
                updateScreenShareUI(false, cid);
            }
        });

        db.collection('classes').doc(cid).collection('active_boards').onSnapshot(snap => {
            updateWhiteboardList(cid, snap);
        });
    });
}

function updateScreenShareUI(isPresenting, classId) {
    const card = document.getElementById('ss-card');
    const btn = document.getElementById('btn-join-ss');
    const txt = document.getElementById('ss-status-text');

    if (!isPresenting && btn.dataset.activeClass) {
        if (btn.dataset.activeClass !== classId) return;
    }

    if (isPresenting) {
        card.classList.remove('opacity-50', 'border-gray-300');
        card.classList.add('border-green-500');
        btn.disabled = false;
        btn.classList.remove('bg-gray-400', 'cursor-not-allowed');
        btn.classList.add('bg-green-600', 'hover:bg-green-700');
        txt.textContent = "先生の画面共有 (開催中)";
        txt.classList.add('text-green-800');

        btn.dataset.activeClass = classId;
        btn.onclick = () => joinActivity('screenshare', null, classId);

    } else {
        card.classList.add('opacity-50', 'border-gray-300');
        card.classList.remove('border-green-500');
        btn.disabled = true;
        btn.classList.add('bg-gray-400', 'cursor-not-allowed');
        btn.classList.remove('bg-green-600', 'hover:bg-green-700');
        txt.textContent = "先生の画面共有 (待機中)";
        txt.classList.remove('text-green-800');

        delete btn.dataset.activeClass;
    }
}

const wbState = {};

function updateWhiteboardList(classId, snap) {
    wbState[classId] = [];
    snap.forEach(doc => wbState[classId].push({ id: doc.id, ...doc.data() }));

    renderWhiteboards();
}

async function renderWhiteboards() {
    const list = document.getElementById('wb-list');
    list.innerHTML = '';

    let totalBoards = 0;

    for (const [cid, boards] of Object.entries(wbState)) {
        for (const b of boards) {
            totalBoards++;

            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100";
            const count = b.studentCount || 0;

            div.innerHTML = `
                <div>
                    <span class="font-bold text-blue-900 block">${b.name}</span>
                    <span class="text-xs text-blue-500">参加: ${count}人</span>
                </div>
                <button onclick="joinActivity('whiteboard', '${b.id}', '${cid}')" class="bg-blue-600 text-white px-4 py-1 rounded text-sm hover:bg-blue-700">参加</button>
            `;
            list.appendChild(div);
        }
    }

    if (totalBoards === 0) {
        list.innerHTML = '<p class="text-gray-500 text-sm">現在開催中のボードはありません</p>';
    }
}

function joinActivity(type, boardId, classId) {
    if (!classId && currentClassId) classId = currentClassId; // Fallback
    if (!classId) return;

    if (type === 'screenshare') {
        window.location.href = `screenshare.html?classId=${classId}&mode=student`;
    } else if (type === 'whiteboard') {
        window.location.href = `whiteboard.html?classId=${classId}&boardId=${boardId}&mode=student`;
    }
}

// --- MEXCBT Logic ---
async function loadMexcbtData() {
    // 1. Assignments
    // Logic: Fetch assignments for my classes or me.
    // Simplifying assumption: Student belongs to one main school. Assignments are often by class.
    // We check: targetType='student' (me), 'class' (my classes), 'school' (my school)

    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const schoolId = userDoc.data().schoolId;
    const classIds = currentAffiliations.map(a => a.classId);

    // We run 3 parallel queries (or sequential)
    const p1 = db.collection('mexcbt_assignments').where('targetType', '==', 'student').where('targetId', '==', currentUser.uid).get();
    const p2 = db.collection('mexcbt_assignments').where('targetType', '==', 'school').where('targetId', '==', schoolId).get();
    const p3_promises = classIds.map(cid =>
        db.collection('mexcbt_assignments').where('targetType', '==', 'class').where('targetId', '==', cid).get()
    );

    const [snap1, snap2, ...snaps3] = await Promise.all([p1, p2, ...p3_promises]);

    let assignments = [];
    const pushAssign = (doc) => assignments.push({ id: doc.id, ...doc.data() });

    snap1.forEach(pushAssign);
    snap2.forEach(pushAssign);
    snaps3.forEach(snap => snap.forEach(pushAssign));

    // De-duplicate assignments (unlikely but possible if targeted multiple ways)
    assignments = assignments.filter((v,i,a)=>a.findIndex(t=>(t.id===v.id))===i);

    // Filter out "already taken"
    // Fetch my results
    const resSnap = await db.collection('mexcbt_results').where('studentId', '==', currentUser.uid).get();
    const takenTestIds = new Set();
    resSnap.forEach(doc => takenTestIds.add(doc.data().testId));

    const availableAssignments = assignments.filter(a => !takenTestIds.has(a.testId));

    renderAssignments(availableAssignments);
    renderResults(resSnap);
}

function renderAssignments(list) {
    const container = document.getElementById('mexcbt-assignments-list');
    container.innerHTML = '';

    if(list.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">現在配信されているテストはありません</p>';
        return;
    }

    list.forEach(async assign => {
        // Need Test Title (from availableTests or DB)
        // Optimization: Fetch unique testIds once? For now simple loop.
        let test = await MEXCBTService.getTestContent(assign.testId);
        if(!test) test = { title: '不明なテスト' };

        const div = document.createElement('div');
        div.className = "flex justify-between items-center bg-gray-50 p-3 rounded border";
        div.innerHTML = `
            <div>
                <p class="font-bold text-gray-800">${test.title}</p>
                <p class="text-xs text-gray-500">配信: ${assign.distributedAt ? assign.distributedAt.toDate().toLocaleDateString() : ''}</p>
            </div>
            <a href="take-test.html?testId=${assign.testId}" target="_blank" class="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-indigo-700">受験する</a>
        `;
        container.appendChild(div);
    });
}

function renderResults(snap) {
    const container = document.getElementById('mexcbt-results-list');
    container.innerHTML = '';

    if(snap.empty) {
        container.innerHTML = '<p class="text-gray-500 text-sm">履歴はありません</p>';
        return;
    }

    snap.forEach(async doc => {
        const r = doc.data();
        let test = await MEXCBTService.getTestContent(r.testId);
        if(!test) test = { title: '不明なテスト' };

        const div = document.createElement('div');
        div.className = "bg-white p-3 rounded border hover:bg-gray-50 cursor-pointer";
        // On click, show detail modal? Or just summary.
        // For now, simple list.
        const date = r.completedAt ? r.completedAt.toDate().toLocaleDateString() : '';
        const reflection = r.reflection ? `<p class="text-xs text-gray-600 mt-1 bg-yellow-50 p-1 rounded">📝 ${r.reflection}</p>` : '';

        div.innerHTML = `
            <div class="flex justify-between">
                <span class="font-bold text-indigo-700">${test.title}</span>
                <span class="font-bold">${r.score}/${r.totalQuestions}点</span>
            </div>
            <p class="text-xs text-gray-400">${date}</p>
            ${reflection}
        `;
        container.appendChild(div);
    });
}

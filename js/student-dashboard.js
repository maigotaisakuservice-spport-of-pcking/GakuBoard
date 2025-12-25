// js/student-dashboard.js

let currentUser = null;
let currentAffiliations = []; // Array of { classId, yearType, attendanceNumber }
let primaryClassId = null; // The main class for daily records
let selectedMood = null;

// NEW: Preview Mode Detection
const urlParams = new URLSearchParams(window.location.search);
const isPreview = urlParams.get('preview') === 'true';
const previewClassId = urlParams.get('classId');
const previewSchoolId = urlParams.get('schoolId');

if (isPreview) {
    // PREVIEW MODE: Mock User & Bypass Auth
    console.log("Starting in PREVIEW mode");
    currentUser = { uid: 'preview_user', email: 'preview@student.com' };

    // Determine affiliations for preview
    // If classId is provided (Teacher Preview), use that.
    // If schoolId is provided (School Admin Preview), mock a generic student in that school.
    const mockData = {
        name: 'プレビュー生徒',
        role: 'student',
        schoolId: previewSchoolId || 'mock_school',
        affiliations: []
    };

    if (previewClassId) {
        mockData.affiliations.push({ classId: previewClassId, yearType: 'current' });
    } else {
        // School Admin Preview: Need to fetch a real class? Or just show school-wide stuff.
        // We set no specific class affiliations unless we fetch them, but for School Portal preview,
        // we mainly need `schoolId`.
        // To show "Unified Portal" correctly, we need at least one class if we filter by classId too.
        // Let's assume we just want to see School Wide links for now.
    }

    initDashboard(mockData);

} else {
    // NORMAL MODE
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

                // Profile Setup Check
                if (typeof checkAndShowProfileSetup === 'function') {
                    await checkAndShowProfileSetup(user, db);
                }

                initDashboard(data);
            }
        } else {
            window.location.href = 'login.html';
        }
    });
}

async function initDashboard(userData) {
    // 2. Set User Data
    document.getElementById('student-name').textContent = (userData.name || currentUser.email) + (isPreview ? " (プレビュー)" : "");

    // 3. Resolve Affiliations
    if (isPreview && previewClassId) {
        // Mock resolve for preview
        currentAffiliations = [{ classId: previewClassId, yearType: 'current' }];
        primaryClassId = previewClassId;
    } else if (isPreview && previewSchoolId) {
        // School Admin Preview
        currentAffiliations = [];
        primaryClassId = null;
    } else {
        await resolveAffiliations(userData);
    }

    // 4. Load Features
    if(!isPreview) checkDailySubmission();

    // For School Admin Preview, we pass `schoolId` explicitly to loader if affiliations empty?
    // Modified loader to handle school-wide links even without affiliations if schoolId present.
    loadUnifiedPortal(userData.schoolId);

    loadUnifiedAnnouncements();
    loadUnifiedActivities();

    if (isPreview) {
        // Disable interactive elements
        document.querySelectorAll('button, input, select').forEach(el => {
            // Keep tabs or basic nav working if any, but disable submission
            if(el.id === 'daily-class-select') return; // allow switching context if mocked?
            if(el.onclick) el.onclick = (e) => { e.preventDefault(); alert("プレビューモードでは操作できません"); };
            // el.disabled = true; // Visual clutter if disabled style applied everywhere
        });
    }
}

async function resolveAffiliations(userData) {
    currentAffiliations = [];

    if (userData.affiliations && Array.isArray(userData.affiliations)) {
        currentAffiliations = userData.affiliations;
    } else if (userData.classId) {
        currentAffiliations.push({ classId: userData.classId, yearType: 'current' });
    }

    const primary = currentAffiliations.find(a => a.yearType === 'current');
    primaryClassId = primary ? primary.classId : (currentAffiliations[0]?.classId || null);

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
    if(isPreview) return alert("プレビューモードです");

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

async function loadUnifiedPortal(explicitSchoolId = null) {
    const grid = document.getElementById('portal-grid');
    grid.innerHTML = '';

    // 1. School-wide Links
    // If explicitSchoolId passed (Preview) or derived from affiliations (Normal)
    // Actually, student doc has 'schoolId'.
    let schoolId = explicitSchoolId;
    if (!schoolId && !isPreview) {
        // Fetch from user doc again? Or pass in.
        // Let's assume user belongs to one school for simplicity in this prototype.
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        schoolId = userDoc.data().schoolId;
    }

    if (schoolId) {
        const schoolSnap = await db.collection('portal_links')
            .where('schoolId', '==', schoolId)
            .where('isSchoolWide', '==', true)
            .get();

        schoolSnap.forEach(doc => renderPortalLink(doc.data(), grid));
    }

    // 2. Class-specific Links
    const classIds = currentAffiliations.map(a => a.classId);
    if (classIds.length > 0) {
        const classSnap = await db.collection('portal_links')
            .where('classId', 'in', classIds)
            .get();

        classSnap.forEach(doc => renderPortalLink(doc.data(), grid));
    }
}

function renderPortalLink(d, container) {
    const a = document.createElement('a');
    a.href = isPreview ? '#' : d.url;
    a.target = isPreview ? '' : "_blank";
    a.className = "bg-white p-4 rounded-xl shadow flex flex-col items-center hover:bg-gray-50 transition relative";

    // Add badge if school wide?
    const badge = d.isSchoolWide ? '<span class="absolute top-1 right-1 text-xs bg-purple-100 text-purple-800 px-1 rounded">全校</span>' : '';

    const icon = d.iconUrl || 'https://via.placeholder.com/64?text=App';
    a.innerHTML = `
        ${badge}
        <img src="${icon}" class="w-12 h-12 mb-2 rounded object-cover">
        <span class="text-xs font-bold text-center leading-tight">${d.title}</span>
    `;
    if(isPreview) a.onclick = (e) => { e.preventDefault(); alert(`[プレビュー] ${d.title} に遷移します`); };
    container.appendChild(a);
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
    if(isPreview) return alert("プレビューモードです");

    if (!classId && currentClassId) classId = currentClassId; // Fallback
    if (!classId) return;

    if (type === 'screenshare') {
        window.location.href = `screenshare.html?classId=${classId}&mode=student`;
    } else if (type === 'whiteboard') {
        window.location.href = `whiteboard.html?classId=${classId}&boardId=${boardId}&mode=student`;
    }
}

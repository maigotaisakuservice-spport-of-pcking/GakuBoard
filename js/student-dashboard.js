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
    const nameEl = document.getElementById('student-name');
    if(nameEl) nameEl.textContent = (userData.name || currentUser.email) + (isPreview ? " (プレビュー)" : "");

    // Update Side Nav Name
    const navNameEl = document.getElementById('nav-student-name');
    if(navNameEl) navNameEl.textContent = userData.name || currentUser.email;

    // 3. Resolve Affiliations & Populate Context Switcher
    if (isPreview && previewClassId) {
        currentAffiliations = [{ classId: previewClassId, yearType: 'current' }];
        primaryClassId = previewClassId;
    } else if (isPreview && previewSchoolId) {
        currentAffiliations = [];
        primaryClassId = null;
    } else {
        await resolveAffiliations(userData);
    }

    // 4. Load Features based on default context
    if(!isPreview) checkDailySubmission();

    // Load Apps
    loadUnifiedPortal(userData.schoolId);

    // Load Home Content
    loadUnifiedAnnouncements();
    loadUnifiedActivities();

    // Show Home by default
    showStudentSection('home');

    if (isPreview) {
        document.querySelectorAll('button, input, select').forEach(el => {
            if(el.id === 'student-context-select') return;
            if(el.classList.contains('nav-item')) return; // Allow navigation
            if(el.onclick) el.onclick = (e) => { e.preventDefault(); alert("プレビューモードでは操作できません"); };
        });
    }
}

async function resolveAffiliations(userData) {
    currentAffiliations = [];

    if (userData.affiliations && Array.isArray(userData.affiliations)) {
        currentAffiliations = userData.affiliations;
    } else if (userData.classId) {
        currentAffiliations.push({ classId: userData.classId, yearType: 'current' }); // Legacy support
    }

    const primary = currentAffiliations.find(a => a.yearType === 'current');
    primaryClassId = primary ? primary.classId : (currentAffiliations[0]?.classId || null);

    // Populate Context Switcher (Sidebar)
    const contextSelect = document.getElementById('student-context-select');
    if(contextSelect) {
        contextSelect.innerHTML = '';

        // Group by Type? We need to fetch names and types.
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

                if (d.type === 'club' || aff.yearType === 'club') {
                    clubGroup.appendChild(opt);
                } else {
                    classGroup.appendChild(opt);
                }
            }
        }
        if(classGroup.children.length > 0) contextSelect.appendChild(classGroup);
        if(clubGroup.children.length > 0) contextSelect.appendChild(clubGroup);

        // Handle case where only 1 context exists -> maybe hide selector?
        // User requested "switch between class and club". Keep it visible if >1.
    }
}

// Navigation
window.showStudentSection = function(id) {
    // Hide all sections
    ['home', 'apps', 'attendance'].forEach(s => {
        document.getElementById(`sec-${s}`).classList.add('hidden');
        document.getElementById(`nav-${s}`).classList.remove('bg-blue-50', 'text-blue-700', 'font-bold');
        document.getElementById(`nav-${s}`).classList.add('text-gray-600');
    });

    // Show selected
    document.getElementById(`sec-${id}`).classList.remove('hidden');
    document.getElementById(`nav-${id}`).classList.add('bg-blue-50', 'text-blue-700', 'font-bold');
    document.getElementById(`nav-${id}`).classList.remove('text-gray-600');
}

window.editProfile = async function() {
    if(isPreview) return alert("プレビューモードです");
    // Reuse profile setup modal logic
    if (typeof checkAndShowProfileSetup === 'function' && currentUser) {
        // Force show by passing a flag or just calling it (it checks "isProfileComplete" usually)
        // We might need to modify profile-setup.js to allow forced edit.
        // For now, let's just re-trigger the check, but if profile IS complete, it won't show.
        // Let's manually show the modal if available in DOM.

        // Actually, profile-setup.js injects HTML.
        // We can call a function from profile-setup.js if we export it or make it global.
        // Assuming checkAndShowProfileSetup is global.

        // Hack: Reset profile complete flag temporarily? No.
        // Best way: Create a dedicated "Edit Profile" function in profile-setup.js or here.
        // Since we don't want to duplicate HTML injection, let's call the setup function with a "force" flag.

        await checkAndShowProfileSetup(currentUser, db, true); // Added force flag support
    }
}

window.switchStudentContext = function(classId) {
    primaryClassId = classId;
    console.log("Switched context to:", classId);
    // Reload data dependent on context
    // 1. Home Feed (Announcements/Activities)
    // Actually, user requested "Class" vs "Club" view.
    // Announcements are currently unified. Maybe filter?
    // Let's reload Announcements/Activities filtered by this single ID.

    loadUnifiedAnnouncements(classId);
    loadUnifiedActivities(classId);
    // Apps are categorized, no reload needed unless filtering there too.
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
    // Containers
    const gridClass = document.getElementById('app-grid-class');
    const gridSchool = document.getElementById('app-grid-school');
    const gridTenant = document.getElementById('app-grid-tenant');
    if(!gridClass) return; // UI not ready

    gridClass.innerHTML = '';
    gridSchool.innerHTML = '';
    gridTenant.innerHTML = '';

    let schoolId = explicitSchoolId;
    let tenantId = null;

    if (!schoolId && !isPreview) {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        schoolId = userDoc.data().schoolId;
        tenantId = userDoc.data().tenantId;
    }

    // 1. Tenant Wide
    if (tenantId) {
        try {
            const tenantSnap = await db.collection('portal_links')
                .where('tenantId', '==', tenantId)
                .where('isTenantWide', '==', true)
                .get();
            tenantSnap.forEach(doc => renderPortalLink(doc.data(), gridTenant));
        } catch(e) {
            console.warn("Tenant apps load failed:", e);
        }
    }

    // 2. School Wide
    if (schoolId) {
        const schoolSnap = await db.collection('portal_links')
            .where('schoolId', '==', schoolId)
            .where('isSchoolWide', '==', true)
            .get();
        schoolSnap.forEach(doc => renderPortalLink(doc.data(), gridSchool));
    }

    // 3. Class/Club Specific
    const classIds = currentAffiliations.map(a => a.classId);
    if (classIds.length > 0) {
        const classSnap = await db.collection('portal_links')
            .where('classId', 'in', classIds)
            .get();
        classSnap.forEach(doc => renderPortalLink(doc.data(), gridClass));
    }
}

function renderPortalLink(d, container) {
    const a = document.createElement('a');
    a.href = isPreview ? '#' : d.url;
    a.target = isPreview ? '' : "_blank";
    a.className = "bg-white p-4 rounded-xl shadow flex flex-col items-center hover:bg-gray-50 transition relative transform hover:-translate-y-1";

    const icon = d.iconUrl || 'https://via.placeholder.com/64?text=App';
    a.innerHTML = `
        <img src="${icon}" class="w-16 h-16 mb-2 rounded object-cover">
        <span class="text-xs font-bold text-center leading-tight text-gray-700">${d.title}</span>
    `;
    if(isPreview) a.onclick = (e) => { e.preventDefault(); alert(`[プレビュー] ${d.title} に遷移します`); };
    container.appendChild(a);
}

async function loadUnifiedAnnouncements(filterClassId = null) {
    const list = document.getElementById('announce-list');
    list.innerHTML = '<p class="text-gray-400 text-sm">読み込み中...</p>';

    let targetIds = [];
    if(filterClassId) {
        targetIds = [filterClassId];
    } else {
        // Use primary if exists, else all
        if(primaryClassId) targetIds = [primaryClassId];
        else targetIds = currentAffiliations.map(a => a.classId);
    }

    if (targetIds.length === 0) {
        list.innerHTML = '<p class="text-gray-400 text-sm">表示するクラスがありません</p>';
        return;
    }

    const snap = await db.collection('announcements')
        .where('classId', 'in', targetIds)
        .get();

    let announcements = [];
    snap.forEach(doc => announcements.push(doc.data()));

    announcements.sort((a, b) => {
        const tA = a.createdAt ? a.createdAt.toMillis() : 0;
        const tB = b.createdAt ? b.createdAt.toMillis() : 0;
        return tB - tA;
    });

    list.innerHTML = '';
    if(announcements.length === 0) {
        list.innerHTML = '<p class="text-gray-400 text-sm">お知らせはありません</p>';
        return;
    }

    announcements.forEach(d => {
        const div = document.createElement('div');
        div.className = "bg-gray-50 p-4 rounded border-l-4 border-indigo-500";
        const date = d.createdAt ? d.createdAt.toDate().toLocaleDateString() : '';
        div.innerHTML = `
            <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-gray-800">${d.title}</span>
                <span class="text-xs text-gray-400">${date}</span>
            </div>
            <p class="text-sm text-gray-600 whitespace-pre-wrap">${d.body}</p>
        `;
        list.appendChild(div);
    });
}

function loadUnifiedActivities(filterClassId = null) {
    // Clear old listeners if any? (Not implemented for prototype simplicity)

    let targetIds = [];
    if(filterClassId) {
        targetIds = [filterClassId];
        // Clear UI first
        document.getElementById('wb-list').innerHTML = '';
    } else {
        targetIds = currentAffiliations.map(a => a.classId);
    }

    targetIds.forEach(cid => {
        db.collection('activities').doc(`screenshare_${cid}`).onSnapshot(doc => {
            const isPresenting = doc.exists && doc.data().isPresenting;
            if (isPresenting) {
                // If filter is active, only show if match
                if(filterClassId && filterClassId !== cid) return;
                updateScreenShareUI(true, cid);
            } else {
                updateScreenShareUI(false, cid);
            }
        });

        db.collection('classes').doc(cid).collection('active_boards').onSnapshot(snap => {
            // Filter logic inside updateWhiteboardList?
            // Simplified: Global State + Filter Render
            updateWhiteboardList(cid, snap, filterClassId);
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

function updateWhiteboardList(classId, snap, filterClassId) {
    wbState[classId] = [];
    snap.forEach(doc => wbState[classId].push({ id: doc.id, ...doc.data() }));

    renderWhiteboards(filterClassId);
}

async function renderWhiteboards(filterClassId) {
    const list = document.getElementById('wb-list');
    list.innerHTML = '';

    let totalBoards = 0;

    for (const [cid, boards] of Object.entries(wbState)) {
        if(filterClassId && filterClassId !== cid) continue;

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
        list.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">現在開催中のボードはありません</p>';
    }
}

// Attendance Logic
window.switchAttendTab = function(tab) {
    const dailyPanel = document.getElementById('panel-daily');
    const absentPanel = document.getElementById('panel-absent');
    const tDaily = document.getElementById('tab-daily');
    const tAbsent = document.getElementById('tab-absent');

    if(tab === 'daily') {
        dailyPanel.classList.remove('hidden');
        absentPanel.classList.add('hidden');
        tDaily.classList.add('border-blue-500', 'text-blue-600', 'font-bold');
        tDaily.classList.remove('border-transparent', 'text-gray-500');
        tAbsent.classList.add('border-transparent', 'text-gray-500');
        tAbsent.classList.remove('border-blue-500', 'text-blue-600', 'font-bold');
    } else {
        dailyPanel.classList.add('hidden');
        absentPanel.classList.remove('hidden');
        tAbsent.classList.add('border-blue-500', 'text-blue-600', 'font-bold');
        tAbsent.classList.remove('border-transparent', 'text-gray-500');
        tDaily.classList.add('border-transparent', 'text-gray-500');
        tDaily.classList.remove('border-blue-500', 'text-blue-600', 'font-bold');
    }
}

window.submitAttendance = async function() {
    if(isPreview) return alert("プレビューモードです");

    const date = document.getElementById('attend-date').value;
    const typeRadio = document.querySelector('input[name="attend-type"]:checked');
    const reason = document.getElementById('attend-reason').value;
    const suspendUntil = document.getElementById('suspend-until').value;

    if(!date) return alert("日付を選択してください");
    if(!typeRadio) return alert("区分を選択してください");

    const type = typeRadio.value;

    if(!primaryClassId) return alert("クラスが見つかりません");

    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const schoolId = userDoc.data().schoolId;

        await db.collection('attendance').add({
            studentId: currentUser.uid,
            studentName: userDoc.data().name,
            classId: primaryClassId,
            schoolId: schoolId,
            date: date,
            type: type,
            reason: reason,
            suspendUntil: type === 'suspend' ? suspendUntil : null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("連絡しました");
        document.getElementById('attend-reason').value = '';
    } catch(e) {
        alert("送信失敗: " + e.message);
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

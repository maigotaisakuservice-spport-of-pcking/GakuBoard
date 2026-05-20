// js/profile-setup.js
// Handles the "Tell me about yourself" initial setup flow

async function checkAndShowProfileSetup(user, db, force = false) {
    if (!user) return;

    try {
        const userDocRef = db.collection('users').doc(user.uid);
        const doc = await userDocRef.get();

        if (!doc.exists) return; // Should not happen if logged in properly

        const data = doc.data();

        // Check if profile is complete
        // Criteria: Has Name, Kana, and at least one Affiliation (if student/teacher)
        // We use a flag 'isProfileComplete' for efficiency, but fallback to checking fields.
        if (!force && data.isProfileComplete === true) {
            return;
        }

        // If not complete or forced, show modal
        console.log("Showing setup modal (force=" + force + ")");
        showProfileModal(userDocRef, data, db);

    } catch (e) {
        console.error("Error checking profile:", e);
    }
}

function showProfileModal(userDocRef, userData, db) {
    // 1. Create Modal HTML
    const modalId = 'profile-setup-modal';
    if (document.getElementById(modalId)) return; // Already showing

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = "fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 overflow-y-auto";
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl m-4 p-6">
            <h2 class="text-2xl font-bold text-blue-800 mb-2">あなたについて教えてください</h2>
            <p class="text-gray-600 mb-6 text-sm">システムを利用するために必要な情報を登録します。</p>

            <div class="space-y-4">
                <!-- Name Section -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-gray-700 text-sm font-bold mb-1">名前 (姓・名)</label>
                        <input type="text" id="setup-name" value="${userData.name || ''}" class="w-full border p-2 rounded bg-gray-50">
                    </div>
                    <div>
                        <label class="block text-gray-700 text-sm font-bold mb-1">名前 (ふりがな)</label>
                        <input type="text" id="setup-kana" value="${userData.kana || ''}" placeholder="やまだ たろう" class="w-full border p-2 rounded">
                    </div>
                </div>

                <!-- Affiliations Section -->
                <div>
                    <div class="flex justify-between items-center mb-2">
                        <label class="block text-gray-700 text-sm font-bold">クラスと出席番号</label>
                        <button type="button" id="add-affiliation-btn" class="text-blue-600 text-sm hover:underline">+ 所属を追加</button>
                    </div>

                    <div id="affiliations-list" class="space-y-3">
                        <!-- Dynamic Rows will go here -->
                    </div>
                    <p class="text-xs text-gray-500 mt-2">
                        ※「年度」は「現在の年度」か「無期限」から選択します。<br>
                        ※ 部活動などは「無期限」を選択してください。
                    </p>
                </div>

                <!-- Error Msg -->
                <div id="setup-error" class="text-red-500 text-sm hidden"></div>

                <!-- Footer -->
                <div class="flex justify-end pt-4 border-t mt-4">
                    <button id="save-profile-btn" class="bg-blue-600 text-white font-bold py-2 px-6 rounded hover:bg-blue-700">保存する</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 2. Load Class Options
    // We need to fetch all classes in the school to populate the dropdowns
    // Optimally, we filter this somewhat, but for now fetch all school classes.
    let schoolClasses = [];
    const schoolId = userData.schoolId;

    if (schoolId) {
        db.collection('classes').where('schoolId', '==', schoolId).get().then(snap => {
            snap.forEach(d => schoolClasses.push({ id: d.id, ...d.data() }));

            // Add initial row based on existing classId if any
            if (userData.classId) {
                // If user has old 'classId', map it to first row
                const cls = schoolClasses.find(c => c.id === userData.classId);
                const yearType = cls && cls.type === 'indefinite' ? 'indefinite' : 'current'; // Assume current unless marked
                addAffiliationRow(userData.classId, yearType, userData.attendanceNumber || '');
            } else if (userData.affiliations && userData.affiliations.length > 0) {
                // If user already has array (re-editing)
                userData.affiliations.forEach(aff => {
                    addAffiliationRow(aff.classId, aff.yearType || 'current', aff.attendanceNumber);
                });
            } else {
                // Default empty row
                addAffiliationRow();
            }
        });
    }

    // 3. Helper to add row
    function addAffiliationRow(selectedClassId = '', selectedYearType = 'current', attendanceNum = '') {
        const container = document.getElementById('affiliations-list');
        const rowId = 'aff-row-' + new Date().getTime() + Math.random();

        const div = document.createElement('div');
        div.className = "flex gap-2 items-start bg-gray-50 p-3 rounded border relative group";
        div.id = rowId;

        // Year Type Select
        const yearSelect = `
            <select class="border p-2 rounded text-sm w-32 year-type-select" onchange="filterClasses('${rowId}')">
                <option value="current" ${selectedYearType === 'current' ? 'selected' : ''}>現在の年度</option>
                <option value="indefinite" ${selectedYearType === 'indefinite' ? 'selected' : ''}>無期限</option>
            </select>
        `;

        // Class Select
        const classSelect = `
            <select class="border p-2 rounded text-sm flex-grow class-select">
                <option value="">クラスを選択</option>
                <!-- Options populated by JS -->
            </select>
        `;

        // Attendance Number
        const numberInput = `
            <input type="text" placeholder="出席番号" value="${attendanceNum}" class="border p-2 rounded text-sm w-20 attendance-input">
        `;

        // Delete Button
        const deleteBtn = `
            <button onclick="document.getElementById('${rowId}').remove()" class="text-red-400 hover:text-red-600 text-lg px-2 ml-2">&times;</button>
        `;

        div.innerHTML = yearSelect + classSelect + numberInput + deleteBtn;
        container.appendChild(div);

        // Populate Options immediately
        const selectEl = div.querySelector('.class-select');
        populateClassOptions(selectEl, selectedYearType, selectedClassId);
    }

    // Make global for inline onclick
    window.filterClasses = function(rowId) {
        const row = document.getElementById(rowId);
        const yearType = row.querySelector('.year-type-select').value;
        const classSelect = row.querySelector('.class-select');
        populateClassOptions(classSelect, yearType, '');
    };

    function populateClassOptions(selectEl, yearType, selectedId) {
        selectEl.innerHTML = '<option value="">クラスを選択</option>';

        // Filter logic
        const filtered = schoolClasses.filter(c => {
            if (yearType === 'indefinite') {
                // Match explicit indefinite OR type=club
                return c.termType === 'indefinite' || c.type === 'club';
            } else {
                // 'current'
                return c.termType !== 'indefinite' && c.type !== 'club';
            }
        });

        // Always add "No Affiliation" option if indefinite? Or just allow empty?
        if (yearType === 'indefinite') {
            const opt = document.createElement('option');
            opt.value = "none";
            opt.textContent = "無所属";
            selectEl.appendChild(opt);
        }

        filtered.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            if (c.id === selectedId) opt.selected = true;
            selectEl.appendChild(opt);
        });
    }

    // 4. Bind Events
    document.getElementById('add-affiliation-btn').onclick = () => addAffiliationRow();

    document.getElementById('save-profile-btn').onclick = async () => {
        const name = document.getElementById('setup-name').value.trim();
        const kana = document.getElementById('setup-kana').value.trim();

        if (!name || !kana) {
            document.getElementById('setup-error').textContent = "名前とふりがなは必須です";
            document.getElementById('setup-error').classList.remove('hidden');
            return;
        }

        // Collect Affiliations
        const rows = document.querySelectorAll('#affiliations-list > div');
        const affiliations = [];

        // Validation for Affiliations
        let validAff = true;

        rows.forEach(row => {
            const classId = row.querySelector('.class-select').value;
            const yearType = row.querySelector('.year-type-select').value;
            const attNum = row.querySelector('.attendance-input').value.trim();

            if (classId && classId !== 'none') {
                affiliations.push({
                    classId: classId,
                    yearType: yearType,
                    attendanceNumber: attNum
                });
            }
        });

        // Requirement: At least one affiliation?
        // User didn't strictly say so, but usually yes.
        // If "No Affiliation" is selected, the array might be empty.
        if (affiliations.length === 0) {
            if(!confirm("クラスが登録されていませんがよろしいですか？")) return;
        }

        try {
            await userDocRef.update({
                name: name,
                kana: kana,
                affiliations: affiliations,
                isProfileComplete: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),

                // BACKWARD COMPATIBILITY: Set primary classId to the first 'current' affiliation
                classId: affiliations.find(a => a.yearType === 'current')?.classId || null,
                attendanceNumber: affiliations.find(a => a.yearType === 'current')?.attendanceNumber || null
            });

            alert("プロフィールを保存しました");
            modal.remove();

            // Reload page to reflect changes (e.g. dashboards need to reload data based on new class)
            window.location.reload();

        } catch (e) {
            console.error(e);
            alert("保存に失敗しました: " + e.message);
        }
    };
}

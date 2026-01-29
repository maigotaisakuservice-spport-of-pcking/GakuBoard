// js/gakutalk.js

let currentUser = null;
let userData = null;
let currentGroupId = null;
let currentChannelId = null;
let msgUnsubscribe = null;
let chanUnsubscribe = null;

auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userData = doc.data();

            // Check Tenant Settings for GAKU-Talk
            const tenantDoc = await db.collection('tenants').doc(userData.tenantId).get();
            if(!tenantDoc.exists || tenantDoc.data().gakutalkEnabled !== true) {
                alert("GAKU-Talkは現在ご利用いただけません（テナント管理者により無効化されています）");
                window.close();
                return;
            }

            document.getElementById('user-info').textContent = `${userData.name} さん`;
            loadGroups();
        }
    } else {
        window.location.href = 'login.html';
    }
});

async function loadGroups() {
    const grid = document.getElementById('groups-grid');
    grid.innerHTML = '<p class="col-span-full text-center py-10 text-gray-400">読み込み中...</p>';

    let query;
    if (userData.role === 'school_admin' || userData.role === 'tenant_admin' || userData.role === 'super_admin') {
        query = db.collection('classes').where('schoolId', '==', userData.schoolId);
    } else {
        const ids = [];
        if (userData.classId) ids.push(userData.classId);
        if (userData.affiliations) userData.affiliations.forEach(a => ids.push(a.classId));

        if (ids.length === 0) {
            grid.innerHTML = '<p class="col-span-full text-center py-10 text-gray-400">所属しているグループがありません</p>';
            return;
        }

        // Split into chunks of 10 for Firestore 'in' query
        const chunks = [];
        for (let i = 0; i < ids.length; i += 10) {
            chunks.push(ids.slice(i, i + 10));
        }

        const groups = [];
        for (const chunk of chunks) {
            const snap = await db.collection('classes').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
            snap.forEach(d => groups.push({id: d.id, ...d.data()}));
        }

        renderGroups(groups);
        return;
    }

    const snap = await query.get();
    const groups = [];
    snap.forEach(d => groups.push({id: d.id, ...d.data()}));
    renderGroups(groups);
}

function renderGroups(groups) {
    const grid = document.getElementById('groups-grid');
    grid.innerHTML = '';

    if (groups.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center py-10 text-gray-400">表示できるグループがありません</p>';
        return;
    }

    groups.forEach(data => {
        const typeLabel = data.type === 'club' ? '部活動' : 'クラス';
        const card = document.createElement('div');
        card.className = "group-card bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer transition hover:shadow-md hover:border-indigo-300 flex flex-col justify-between";
        card.onclick = () => enterGroup(data.id, data.name);
        card.innerHTML = `
            <div>
                <span class="text-xs font-bold px-2 py-1 rounded bg-indigo-50 text-indigo-600 mb-2 inline-block">${typeLabel}</span>
                <h3 class="text-xl font-bold text-gray-800">${data.name}</h3>
            </div>
            <div class="mt-4 flex justify-end">
                <span class="text-indigo-600 font-bold text-sm flex items-center gap-1">参加する
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                </span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function enterGroup(groupId, groupName) {
    currentGroupId = groupId;
    document.getElementById('group-list-screen').classList.add('hidden');
    document.getElementById('chat-screen').classList.remove('hidden');
    document.getElementById('selected-group-name').textContent = groupName;

    if (userData.role === 'teacher' || userData.role === 'school_admin') {
        document.getElementById('btn-add-channel').classList.remove('hidden');
    }

    loadChannels(groupId);
}

function exitGroup() {
    currentGroupId = null;
    currentChannelId = null;
    if (msgUnsubscribe) msgUnsubscribe();
    if (chanUnsubscribe) chanUnsubscribe();
    document.getElementById('chat-screen').classList.add('hidden');
    document.getElementById('group-list-screen').classList.remove('hidden');
}

function loadChannels(groupId) {
    const list = document.getElementById('channel-list');
    list.innerHTML = '';

    if (chanUnsubscribe) chanUnsubscribe();

    chanUnsubscribe = db.collection('channels')
        .where('classId', '==', groupId)
        .onSnapshot(snap => {
            list.innerHTML = '';
            if (snap.empty) {
                // Auto create "一般" if teacher
                if (userData.role === 'teacher' || userData.role === 'school_admin') {
                    db.collection('channels').add({
                        classId: groupId,
                        name: "一般",
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                list.innerHTML = '<p class="text-xs text-gray-400">チャネルを作成中...</p>';
                return;
            }

            snap.forEach(doc => {
                const data = doc.data();
                const div = document.createElement('div');
                div.className = "flex items-center group";

                const btn = document.createElement('button');
                btn.className = `flex-grow text-left px-3 py-2 rounded text-sm font-medium transition ${currentChannelId === doc.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-600 hover:bg-gray-100'}`;
                btn.textContent = `# ${data.name}`;
                btn.onclick = () => selectChannel(doc.id, data.name);

                div.appendChild(btn);

                if (userData.role === 'teacher' || userData.role === 'school_admin') {
                    const editBtn = document.createElement('button');
                    editBtn.className = "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-600 px-1 text-xs transition";
                    editBtn.innerHTML = "✎";
                    editBtn.onclick = (e) => { e.stopPropagation(); editChannel(doc.id, data.name); };

                    const delBtn = document.createElement('button');
                    delBtn.className = "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 px-1 text-xs transition";
                    delBtn.innerHTML = "×";
                    delBtn.onclick = (e) => { e.stopPropagation(); deleteChannel(doc.id); };

                    div.appendChild(editBtn);
                    div.appendChild(delBtn);
                }

                list.appendChild(div);
            });

            if (!currentChannelId && !snap.empty) {
                const first = snap.docs[0];
                selectChannel(first.id, first.data().name);
            }
        });
}

async function createNewChannel() {
    const name = prompt("チャネル名を入力してください (例: 連絡事項)");
    if (!name) return;
    try {
        await db.collection('channels').add({
            classId: currentGroupId,
            name: name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        alert("作成に失敗しました: " + e.message);
    }
}

async function editChannel(id, oldName) {
    const name = prompt("チャネル名を変更:", oldName);
    if (!name || name === oldName) return;
    await db.collection('channels').doc(id).update({ name: name });
}

async function deleteChannel(id) {
    if (!confirm("チャネルを削除しますか？メッセージも全て削除されます。")) return;
    await db.collection('channels').doc(id).delete();
    // Note: In real app, should use functions to delete sub-collections
}

function selectChannel(chanId, chanName) {
    currentChannelId = chanId;
    document.getElementById('current-channel-name').textContent = `# ${chanName}`;

    // UI Update
    document.querySelectorAll('#channel-list button').forEach(btn => {
        if (btn.textContent === `# ${chanName}`) {
            btn.classList.add('bg-indigo-50', 'text-indigo-700', 'font-bold');
            btn.classList.remove('text-gray-600', 'hover:bg-gray-100');
        } else {
            btn.classList.remove('bg-indigo-50', 'text-indigo-700', 'font-bold');
            btn.classList.add('text-gray-600', 'hover:bg-gray-100');
        }
    });

    loadMessages(chanId);
}

function loadMessages(chanId) {
    if (msgUnsubscribe) msgUnsubscribe();

    const container = document.getElementById('chat-messages');
    container.innerHTML = '<p class="text-center py-10 text-gray-400">メッセージを読み込み中...</p>';

    msgUnsubscribe = db.collection('channels').doc(chanId).collection('messages')
        .orderBy('createdAt', 'asc')
        .limit(100)
        .onSnapshot(snap => {
            container.innerHTML = '';
            if (snap.empty) {
                container.innerHTML = '<p class="text-center py-10 text-gray-400">メッセージがありません</p>';
                return;
            }

            snap.forEach(doc => {
                const data = doc.data();
                const isMe = data.senderId === currentUser.uid;

                const div = document.createElement('div');
                div.className = `flex ${isMe ? 'justify-end' : 'justify-start'}`;

                const time = data.createdAt ? data.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

                const wrapper = document.createElement('div');
                wrapper.className = `max-w-xs md:max-w-md ${isMe ? 'bg-indigo-600 text-white rounded-l-xl rounded-tr-xl' : 'bg-white border text-gray-800 rounded-r-xl rounded-tl-xl'} p-3 shadow-sm relative`;

                if (!isMe) {
                    const name = document.createElement('p');
                    name.className = "text-xs font-bold text-indigo-600 mb-1";
                    name.textContent = data.senderName;
                    wrapper.appendChild(name);
                }

                const msgBody = document.createElement('p');
                msgBody.className = "text-sm whitespace-pre-wrap";
                msgBody.textContent = data.text;
                wrapper.appendChild(msgBody);

                const timeEl = document.createElement('p');
                timeEl.className = `text-right text-xs mt-1 ${isMe ? 'text-indigo-200' : 'text-gray-400'}`;
                timeEl.textContent = time;
                wrapper.appendChild(timeEl);

                div.appendChild(wrapper);
                container.appendChild(div);
            });
            container.scrollTop = container.scrollHeight;
        });
}

async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !currentChannelId) return;

    const senderName = (userData && userData.name) || (currentUser && currentUser.displayName) || 'No Name';

    input.value = '';
    try {
        const msgData = {
            senderId: currentUser.uid,
            senderName: senderName,
            text: text,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        // Clean undefined
        Object.keys(msgData).forEach(key => msgData[key] === undefined && delete msgData[key]);

        await db.collection('channels').doc(currentChannelId).collection('messages').add(msgData);
    } catch (e) {
        console.error("SendMessage error:", e);
    }
}

// Meeting
function startMeeting() {
    if (!currentChannelId) return;
    const url = `meeting.html?groupId=${currentGroupId}&channelId=${currentChannelId}&mode=${userData.role === 'student' ? 'student' : 'teacher'}`;
    window.open(url, '_blank', 'width=1200,height=800');
}

// js/meeting.js

const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get('groupId');
const channelId = urlParams.get('channelId');
const mode = urlParams.get('mode');

let peer = null;
let myStream = null;
let myId = null;
let userData = null;
let isTeacher = mode === 'teacher';

const peers = {}; // pid -> call
let isMicOn = true;
let isCamOn = isTeacher;
let isSharing = false;

// Optimization logic:
// 38 people mesh is impossible. We implement "Teacher/Speaker Broadcast" logic.
// All students start with camera OFF.
// Only the Teacher and those with camera explicitly ON send video.

auth.onAuthStateChanged(async user => {
    if (user) {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userData = doc.data();
            init();
        }
    } else { window.close(); }
});

async function init() {
    document.getElementById('room-name').textContent = "接続準備中...";
    try {
        // Reduced resolution for scalability
        myStream = await navigator.mediaDevices.getUserMedia({
            video: isCamOn ? { width: 426, height: 240, frameRate: 15 } : false,
            audio: true
        });
        document.getElementById('local-video').srcObject = myStream;
    } catch (e) { console.warn("Media failed", e); }

    peer = new Peer({ host: '0.peerjs.com', port: 443, secure: true });
    peer.on('open', id => { myId = id; joinMeetingRoom(); });
    peer.on('call', call => {
        call.answer(myStream);
        handleIncomingStream(call);
    });
}

function joinMeetingRoom() {
    const meetingRef = db.collection('meetings').doc(channelId);
    meetingRef.collection('participants').doc(myId).set({
        uid: currentUser.uid, name: userData.name, isTeacher, isCameraOn: isCamOn, isMicOn,
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
    });

    meetingRef.collection('participants').onSnapshot(snap => {
        document.getElementById('participant-count').textContent = `参加者: ${snap.size}名`;
        snap.forEach(doc => {
            const pid = doc.id;
            if (pid !== myId && !peers[pid]) { setTimeout(() => connectToNewUser(pid), 500); }
        });
        const activeIds = snap.docs.map(d => d.id);
        Object.keys(peers).forEach(pid => { if (!activeIds.includes(pid)) removeVideoStream(pid); });
    });

    window.addEventListener('beforeunload', () => { meetingRef.collection('participants').doc(myId).delete(); });
}

function connectToNewUser(pid) {
    if (peers[pid]) return;
    const call = peer.call(pid, myStream);
    handleIncomingStream(call);
}

function handleIncomingStream(call) {
    const pid = call.peer; peers[pid] = call;
    call.on('stream', userStream => { addVideoStream(pid, userStream); });
    call.on('close', () => removeVideoStream(pid));
    call.on('error', () => removeVideoStream(pid));
}

function addVideoStream(pid, stream) {
    if (document.getElementById(`video-wrapper-${pid}`)) return;
    const grid = document.getElementById('video-grid');
    const wrapper = document.createElement('div');
    wrapper.id = `video-wrapper-${pid}`;
    wrapper.className = "video-wrapper border border-gray-700";

    const video = document.createElement('video');
    video.id = `video-${pid}`; video.srcObject = stream; video.autoplay = true; video.playsInline = true;

    const nameTag = document.createElement('div');
    nameTag.className = "name-tag"; nameTag.textContent = "...";

    db.collection('meetings').doc(channelId).collection('participants').doc(pid).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            nameTag.textContent = data.isTeacher ? `[先生] ${data.name}` : data.name;
            if(data.isTeacher) wrapper.classList.add('border-2', 'border-yellow-400');
            video.style.display = data.isCameraOn ? 'block' : 'none';
        }
    });
    wrapper.appendChild(video); wrapper.appendChild(nameTag); grid.appendChild(wrapper);
}

function removeVideoStream(pid) {
    const el = document.getElementById(`video-wrapper-${pid}`); if (el) el.remove();
    if (peers[pid]) { peers[pid].close(); delete peers[pid]; }
}

function toggleMic() {
    isMicOn = !isMicOn;
    if(myStream) myStream.getAudioTracks().forEach(t => t.enabled = isMicOn);
    document.getElementById('btn-mic').classList.toggle('bg-red-600', !isMicOn);
    document.getElementById('icon-mic').textContent = isMicOn ? '🎙️' : '🔇';
    updatePresence({ isMicOn });
}

async function toggleCam() {
    isCamOn = !isCamOn;
    if (isCamOn) {
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 426, height: 240, frameRate: 15 } });
            const videoTrack = videoStream.getVideoTracks()[0];
            myStream.addTrack(videoTrack);
        } catch(e) { isCamOn = false; return alert("カメラを起動できません"); }
    } else {
        myStream.getVideoTracks().forEach(t => { t.stop(); myStream.removeTrack(t); });
    }
    replaceStream(myStream);
    document.getElementById('local-video').srcObject = myStream;
    document.getElementById('btn-cam').classList.toggle('bg-red-600', !isCamOn);
    document.getElementById('icon-cam').textContent = isCamOn ? '📹' : '📵';
    updatePresence({ isCameraOn: isCamOn });
}

async function toggleShare() {
    if (isSharing) {
        // Stop sharing
        myStream.getVideoTracks().forEach(t => { t.stop(); myStream.removeTrack(t); });
        isSharing = false;
        document.getElementById('btn-share').classList.remove('bg-indigo-600');
        // If camera was on, restart it, else just go audio-only
        if (isCamOn) {
            isCamOn = false; toggleCam(); // Re-toggle will do it
        } else {
            replaceStream(myStream);
        }
    } else {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            // Remove existing video tracks if any
            myStream.getVideoTracks().forEach(t => { t.stop(); myStream.removeTrack(t); });
            myStream.addTrack(screenTrack);
            replaceStream(myStream);
            isSharing = true;
            document.getElementById('btn-share').classList.add('bg-indigo-600');
            screenTrack.onended = () => { if(isSharing) toggleShare(); };
        } catch (e) { console.error(e); }
    }
    document.getElementById('local-video').srcObject = myStream;
}

function replaceStream(newStream) {
    Object.values(peers).forEach(call => {
        const videoTrack = newStream.getVideoTracks()[0];
        const sender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if(sender && videoTrack) sender.replaceTrack(videoTrack);
        else if (videoTrack) call.peerConnection.addTrack(videoTrack, newStream);
    });
}

function updatePresence(data) {
    if(!myId) return;
    db.collection('meetings').doc(channelId).collection('participants').doc(myId).set(data, { merge: true });
}

function hangup() {
    if(myStream) myStream.getTracks().forEach(t => t.stop());
    window.close();
}

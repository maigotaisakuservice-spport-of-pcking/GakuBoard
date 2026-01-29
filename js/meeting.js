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
let isCamOn = isTeacher; // Camera ON by default for teachers, OFF for students
let isSharing = false;

// Optimization for 38+ participants:
// 1. Only Teachers and "Active Speakers" (who requested) send video.
// 2. Everyone else is audio-only.
// 3. This reduces bandwidth significantly.

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
        // Start with audio always, video if teacher or explicitly requested
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

    db.collection('meetings').doc(channelId).collection('participants').doc(pid).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            nameTag.textContent = data.isTeacher ? `[先生] ${data.name}` : data.name;
            if(data.isTeacher) wrapper.classList.add('border-2', 'border-yellow-400');
            // If participant has camera OFF, hide video element to save rendering power
            if(!data.isCameraOn) video.style.display = 'none';
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

    // Logic change: to TRULY save bandwidth, we stop/start the track
    if (isCamOn) {
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 426, height: 240, frameRate: 15 } });
            const videoTrack = videoStream.getVideoTracks()[0];
            myStream.addTrack(videoTrack);
            replaceStream(myStream);
        } catch(e) { isCamOn = false; return alert("カメラを起動できません"); }
    } else {
        myStream.getVideoTracks().forEach(t => { t.stop(); myStream.removeTrack(t); });
        replaceStream(myStream);
    }

    document.getElementById('local-video').srcObject = myStream;
    document.getElementById('btn-cam').classList.toggle('bg-red-600', !isCamOn);
    document.getElementById('icon-cam').textContent = isCamOn ? '📹' : '📵';
    updatePresence({ isCameraOn: isCamOn });
}

function replaceStream(newStream) {
    Object.values(peers).forEach(call => {
        const senders = call.peerConnection.getSenders();
        const videoTrack = newStream.getVideoTracks()[0];
        const sender = senders.find(s => s.track && s.track.kind === 'video');
        if(sender && videoTrack) sender.replaceTrack(videoTrack);
        else if (videoTrack) call.peerConnection.addTrack(videoTrack, newStream);
        // Note: removeTrack is harder to sync in P2P without renegotiation,
        // but replaceTrack with null or stopping track is effective.
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

// State Management
let state = {
    roomCode: null,
    userName: null,
    localStream: null,
    peerConnection: null,
    channel: null,
    isInitiator: false,
    remoteStream: null,
    spectatorToken: null,
    selectedVideoDeviceId: null,
    selectedAudioDeviceId: null,
    receivedAnswer: false
};

// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const setupModal = document.getElementById('setupModal');
const joinBtn = document.getElementById('joinBtn');
const shareBtn = document.getElementById('shareBtn');
const endCallBtn = document.getElementById('endCallBtn');
const roomStatus = document.getElementById('roomStatus');
const notification = document.getElementById('notification');
const connectionStatus = document.getElementById('connectionStatus');
const nameInput = document.getElementById('nameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');
const applyDevicesBtn = document.getElementById('applyDevicesBtn');
const deviceControls = document.getElementById('deviceControls');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupModal.style.display = 'flex';
    joinBtn.addEventListener('click', handleJoinRoom);
    shareBtn.addEventListener('click', handleShareSpectatorLink);
    endCallBtn.addEventListener('click', handleEndCall);
    applyDevicesBtn.addEventListener('click', handleApplyDevices);
});

// Draggable local video overlay
function initDraggableLocal() {
    const el = document.querySelector('.local-container');
    if (!el || !el.parentElement) return;

    const container = el.parentElement; // video-grid
    let dragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    // Restore saved position
    try {
        const saved = JSON.parse(localStorage.getItem('localVideoPos') || '{}');
        if (typeof saved.left === 'number' && typeof saved.top === 'number') {
            el.style.left = `${saved.left}px`;
            el.style.top = `${saved.top}px`;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }
    } catch {}

    const onMouseDown = (e) => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        const parentRect = container.getBoundingClientRect();
        startLeft = rect.left - parentRect.left;
        startTop = rect.top - parentRect.top;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!dragging) return;
        const parentRect = container.getBoundingClientRect();
        const newLeft = clamp(startLeft + (e.clientX - startX), 0, parentRect.width - el.offsetWidth);
        const newTop = clamp(startTop + (e.clientY - startY), 0, parentRect.height - el.offsetHeight);
        el.style.left = `${newLeft}px`;
        el.style.top = `${newTop}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    };

    const onMouseUp = () => {
        dragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        const rect = el.getBoundingClientRect();
        const parentRect = container.getBoundingClientRect();
        localStorage.setItem('localVideoPos', JSON.stringify({
            left: rect.left - parentRect.left,
            top: rect.top - parentRect.top
        }));
    };

    const onTouchStart = (e) => {
        if (!e.touches || !e.touches[0]) return;
        dragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        const rect = el.getBoundingClientRect();
        const parentRect = container.getBoundingClientRect();
        startLeft = rect.left - parentRect.left;
        startTop = rect.top - parentRect.top;
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
    };

    const onTouchMove = (e) => {
        if (!dragging) return;
        e.preventDefault();
        const parentRect = container.getBoundingClientRect();
        const newLeft = clamp(startLeft + (e.touches[0].clientX - startX), 0, parentRect.width - el.offsetWidth);
        const newTop = clamp(startTop + (e.touches[0].clientY - startY), 0, parentRect.height - el.offsetHeight);
        el.style.left = `${newLeft}px`;
        el.style.top = `${newTop}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    };

    const onTouchEnd = () => {
        dragging = false;
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        const rect = el.getBoundingClientRect();
        const parentRect = container.getBoundingClientRect();
        localStorage.setItem('localVideoPos', JSON.stringify({
            left: rect.left - parentRect.left,
            top: rect.top - parentRect.top
        }));
    };

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
}

// Generate random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

    // Sanitize room code to 6 uppercase alphanumerics
    function sanitizeRoomCode(code) {
        return (code || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 6);
    }

// Handle room join
async function handleJoinRoom() {
    const name = nameInput.value.trim();
        const rawCode = (roomCodeInput.value || '').trim();
        const roomCode = rawCode ? sanitizeRoomCode(rawCode) : generateRoomCode();

    if (!name) {
        showNotification('Please enter your name', 'error');
        return;
    }

        // If user provided a code, validate format
        if (rawCode && roomCode.length !== 6) {
            showNotification('Invalid room code format. Use 6 letters/numbers.', 'error');
            return;
        }

    state.userName = name;
    state.roomCode = roomCode;

    try {
        roomStatus.textContent = `Room: ${roomCode} | User: ${name}`;
        setupModal.style.display = 'none';
        shareBtn.removeAttribute('hidden');
        endCallBtn.removeAttribute('hidden');
        deviceControls.removeAttribute('hidden');

        // Initialize local stream
        await initializeLocalStream();
        // Enable draggable local overlay
        initDraggableLocal();
        await enumerateAndPopulateDevices();

        // Setup Supabase Realtime channel
        setupRealtimeChannel();

        // Create or join room in database
        await createOrJoinRoom();

        showNotification('Connected to room. Waiting for other participant...', 'success');
    } catch (error) {
        console.error('Error joining room:', error);
        showNotification('Error joining room: ' + error.message, 'error');
    }
}

// Initialize local media stream
async function initializeLocalStream() {
    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                deviceId: state.selectedVideoDeviceId ? { exact: state.selectedVideoDeviceId } : undefined
            },
            audio: {
                deviceId: state.selectedAudioDeviceId ? { exact: state.selectedAudioDeviceId } : undefined
            }
        });

        localVideo.srcObject = state.localStream;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        throw error;
    }
}

async function enumerateAndPopulateDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const audioDevices = devices.filter(d => d.kind === 'audioinput');

        const currentVideoTrack = state.localStream?.getVideoTracks()[0];
        const currentAudioTrack = state.localStream?.getAudioTracks()[0];
        const currentVideoId = currentVideoTrack?.getSettings()?.deviceId;
        const currentAudioId = currentAudioTrack?.getSettings()?.deviceId;

        cameraSelect.innerHTML = '';
        micSelect.innerHTML = '';

        videoDevices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Camera ${cameraSelect.length + 1}`;
            if (d.deviceId === currentVideoId) opt.selected = true;
            cameraSelect.appendChild(opt);
        });

        audioDevices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Microphone ${micSelect.length + 1}`;
            if (d.deviceId === currentAudioId) opt.selected = true;
            micSelect.appendChild(opt);
        });

        state.selectedVideoDeviceId = cameraSelect.value || currentVideoId || null;
        state.selectedAudioDeviceId = micSelect.value || currentAudioId || null;
    } catch (error) {
        console.error('Error enumerating devices:', error);
    }
}

async function handleApplyDevices() {
    const newVideoId = cameraSelect.value;
    const newAudioId = micSelect.value;

    // If no change, skip
    if (newVideoId === state.selectedVideoDeviceId && newAudioId === state.selectedAudioDeviceId) {
        showNotification('Devices unchanged', 'info');
        return;
    }

    state.selectedVideoDeviceId = newVideoId;
    state.selectedAudioDeviceId = newAudioId;

    try {
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                deviceId: newVideoId ? { exact: newVideoId } : undefined
            },
            audio: {
                deviceId: newAudioId ? { exact: newAudioId } : undefined
            }
        });

        // Swap local preview
        if (state.localStream) {
            state.localStream.getTracks().forEach(t => t.stop());
        }
        state.localStream = newStream;
        localVideo.srcObject = newStream;

        // Replace tracks in ongoing peer connection
        if (state.peerConnection) {
            const videoTrack = newStream.getVideoTracks()[0];
            const audioTrack = newStream.getAudioTracks()[0];

            state.peerConnection.getSenders().forEach(sender => {
                if (sender.track?.kind === 'video' && videoTrack) {
                    sender.replaceTrack(videoTrack);
                }
                if (sender.track?.kind === 'audio' && audioTrack) {
                    sender.replaceTrack(audioTrack);
                }
            });
        }

        showNotification('Devices updated', 'success');
    } catch (error) {
        console.error('Error switching devices:', error);
        showNotification('Error switching devices: ' + error.message, 'error');
    }
}

// Setup Realtime channel
function setupRealtimeChannel() {
    state.channel = supabaseClient.channel(`room-${state.roomCode}`, {
        config: {
            broadcast: { self: false },
            presence: { key: state.userName }
        }
    });

    // Listen for SDP offers
    state.channel.on('broadcast', { event: 'offer' }, async (payload) => {
        console.log('[SIGNALING] Received offer from participant');
        const offer = payload.payload.offer;

        if (!state.peerConnection) {
            await createPeerConnection();
        }

        // Only accept offers when stable to avoid glare
        if (state.peerConnection.signalingState !== 'stable') {
            console.warn('Ignore offer: PC not stable');
            return;
        }

        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await state.peerConnection.createAnswer();
        await state.peerConnection.setLocalDescription(answer);

        // Send answer
        state.channel.send({
            type: 'broadcast',
            event: 'answer',
            payload: { answer: state.peerConnection.localDescription }
        });
    });

    // Listen for SDP answers
    state.channel.on('broadcast', { event: 'answer' }, async (payload) => {
        console.log('[SIGNALING] Received answer from participant');
        const answer = payload.payload.answer;

        if (!state.peerConnection) return;

        // Only apply first valid answer when we have a local offer
        if (state.receivedAnswer) {
            console.warn('Ignore duplicate answer');
            return;
        }

        if (state.peerConnection.signalingState !== 'have-local-offer') {
            console.warn('Ignore answer: PC not in have-local-offer');
            return;
        }

        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        state.receivedAnswer = true;
    });

    // Also support spectator-specific answers
    state.channel.on('broadcast', { event: 'spectator-answer' }, async (payload) => {
        console.log('[SIGNALING] Received spectator answer');
        const answer = payload.payload.answer;

        if (!state.peerConnection) return;

        if (state.receivedAnswer) {
            console.warn('Ignore duplicate spectator answer');
            return;
        }

        if (state.peerConnection.signalingState !== 'have-local-offer') {
            console.warn('Ignore spectator answer: PC not in have-local-offer');
            return;
        }

        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        state.receivedAnswer = true;
    });

    // Listen for ICE candidates
    state.channel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
        const candidate = payload.payload.candidate;

        if (state.peerConnection && candidate) {
            try {
                await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        }
    });

    // Listen for presence changes
    state.channel.on('presence', { event: 'sync' }, () => {
        const presenceState = state.channel.presenceState();
        const remoteUsers = Object.keys(presenceState).filter(key => key !== state.userName);
        console.log('[PRESENCE] Remote users detected:', remoteUsers.length, '| isInitiator:', state.isInitiator);

        // Only initiator sends offer, once
        if (state.isInitiator && remoteUsers.length > 0 && !state.peerConnection && state.localStream) {
            console.log('[SIGNALING] Initiator creating offer...');
            createOffer();
        }
    });

    state.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Subscribed to room channel');
            // Announce presence
            await state.channel.track({ user: state.userName });
            // Fallback: if initiator, local media ready, and no PC yet, kick off an offer
            if (state.isInitiator && state.localStream && !state.peerConnection) {
                setTimeout(() => {
                    if (state.isInitiator && state.localStream && !state.peerConnection) {
                        createOffer();
                    }
                }, 800);
            }
        }
    });
}

// Create or join room in Supabase
async function createOrJoinRoom() {
    try {
        const { data: room, error } = await supabaseClient
            .from('rooms')
            .select('*')
            .eq('room_code', state.roomCode)
            .single();

        if (error && error.code === 'PGRST116') {
            // Room doesn't exist, create it
            const { data, error: insertError } = await supabaseClient
                .from('rooms')
                .insert([{
                    room_code: state.roomCode,
                    created_at: new Date(),
                    is_active: true
                }])
                .select();

            if (insertError) throw insertError;
            state.isInitiator = true;
        } else {
            state.isInitiator = false;
        }
    } catch (error) {
        console.error('Error with room:', error);
    }
}

// Create peer connection
async function createPeerConnection() {
    state.peerConnection = new RTCPeerConnection({ iceServers: RTCConfig.iceServers });

    // Add local tracks
    state.localStream.getTracks().forEach(track => {
        state.peerConnection.addTrack(track, state.localStream);
    });

    // Handle remote tracks
    state.peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind, event.streams);
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.muted = false;
            remoteVideo.play().catch(e => {
                console.log('Autoplay blocked:', e);
                const btn = document.getElementById('playPrompt');
                if (btn) btn.style.display = 'block';
            });
        }
    };

    // Handle ICE candidates
    state.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            state.channel.send({
                type: 'broadcast',
                event: 'ice-candidate',
                payload: { candidate: event.candidate }
            });
        }
    };

    // Monitor connection state
    state.peerConnection.onconnectionstatechange = () => {
        // console.log('Connection state:', state.peerConnection.connectionState);
        updateConnectionStatus();
    };

    state.peerConnection.oniceconnectionstatechange = () => {
        // console.log('ICE connection state:', state.peerConnection.iceConnectionState);
        updateConnectionStatus();
    };

    state.peerConnection.onsignalingstatechange = () => {
        // console.log('Signaling state:', state.peerConnection.signalingState);
    };
}

// Create offer
async function createOffer() {
    try {
        state.receivedAnswer = false;
        await createPeerConnection();
        const offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);
        console.log('[SIGNALING] Offer created, sending to channel...');

        state.channel.send({
            type: 'broadcast',
            event: 'offer',
            payload: { offer: state.peerConnection.localDescription }
        });

        showNotification('Waiting for other participant to accept...', 'success');
    } catch (error) {
        console.error('[ERROR] Failed to create offer:', error);
    }
}

// Update connection status
function updateConnectionStatus() {
    const state_val = state.peerConnection?.connectionState;
    const iceState = state.peerConnection?.iceConnectionState;

    if (state_val === 'connected' || iceState === 'connected') {
        connectionStatus.textContent = 'Connected';
        connectionStatus.classList.add('connected');
    } else if (state_val === 'connecting' || iceState === 'checking') {
        connectionStatus.textContent = 'Connecting...';
        connectionStatus.classList.remove('connected');
    } else if (state_val === 'failed' || iceState === 'failed') {
        connectionStatus.textContent = 'Connection Failed';
        connectionStatus.classList.remove('connected');
    } else {
        connectionStatus.textContent = 'Waiting...';
        connectionStatus.classList.remove('connected');
    }
}

// Handle share spectator link
async function handleShareSpectatorLink() {
    try {
        // Generate spectator token
        state.spectatorToken = Math.random().toString(36).substring(2, 15);

        // Store in database
        const { error } = await supabaseClient
            .from('spectators')
            .insert([{
                room_code: state.roomCode,
                spectator_token: state.spectatorToken,
                created_at: new Date(),
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hour expiry
            }]);

        if (error) throw error;

        const spectatorUrl = `${window.location.origin.replace('participants', 'spectators')}?roomCode=${state.roomCode}&token=${state.spectatorToken}`;

        // Copy to clipboard
        await navigator.clipboard.writeText(spectatorUrl);
        showNotification('Spectator link copied to clipboard!', 'success');
    } catch (error) {
        console.error('Error generating spectator link:', error);
        showNotification('Error generating spectator link', 'error');
    }
}

// Handle end call
async function handleEndCall() {
    // Close peer connection
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }

    // Stop local stream
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => track.stop());
    }

    // Unsubscribe from channel
    if (state.channel) {
        await state.channel.unsubscribe();
    }

    // Mark room as inactive
    if (state.roomCode) {
        await supabaseClient
            .from('rooms')
            .update({ is_active: false })
            .eq('room_code', state.roomCode);
    }

    setupModal.style.display = 'flex';
    shareBtn.setAttribute('hidden', '');
    endCallBtn.setAttribute('hidden', '');
    roomStatus.textContent = 'Initializing...';
    nameInput.value = '';
    roomCodeInput.value = '';
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    showNotification('Call ended', 'success');
}

// Show notification
function showNotification(message, type = 'info') {
    notification.textContent = message;
    notification.className = `notification show ${type}`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 5000);
}

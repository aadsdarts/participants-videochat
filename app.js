// State Management
let state = {
    roomCode: null,
    userName: null,
    localStream: null,
    peerConnection: null,
    channel: null,
    isInitiator: false,
    remoteStream: null,
    spectatorToken: null
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupModal.style.display = 'flex';
    joinBtn.addEventListener('click', handleJoinRoom);
    shareBtn.addEventListener('click', handleShareSpectatorLink);
    endCallBtn.addEventListener('click', handleEndCall);
});

// Generate random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Handle room join
async function handleJoinRoom() {
    const name = nameInput.value.trim();
    const roomCode = roomCodeInput.value.trim() || generateRoomCode();

    if (!name) {
        showNotification('Please enter your name', 'error');
        return;
    }

    state.userName = name;
    state.roomCode = roomCode;

    try {
        roomStatus.textContent = `Room: ${roomCode} | User: ${name}`;
        setupModal.style.display = 'none';
        shareBtn.style.display = 'inline-block';
        endCallBtn.style.display = 'inline-block';

        // Initialize local stream
        await initializeLocalStream();

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
                height: { ideal: 720 }
            },
            audio: true
        });

        localVideo.srcObject = state.localStream;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        throw error;
    }
}

// Setup Realtime channel
function setupRealtimeChannel() {
    state.channel = supabase.channel(`room-${state.roomCode}`, {
        config: {
            broadcast: { self: true },
            presence: { key: state.userName }
        }
    });

    // Listen for SDP offers
    state.channel.on('broadcast', { event: 'offer' }, async (payload) => {
        console.log('Received offer');
        const offer = payload.payload.offer;

        if (!state.peerConnection) {
            await createPeerConnection();
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
        console.log('Received answer');
        const answer = payload.payload.answer;

        if (state.peerConnection) {
            await state.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
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

        if (remoteUsers.length > 0 && !state.peerConnection && state.localStream) {
            createOffer();
        }
    });

    state.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Subscribed to room channel');
            // Announce presence
            await state.channel.track({ user: state.userName });
        }
    });
}

// Create or join room in Supabase
async function createOrJoinRoom() {
    try {
        const { data: room, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('room_code', state.roomCode)
            .single();

        if (error && error.code === 'PGRST116') {
            // Room doesn't exist, create it
            const { data, error: insertError } = await supabase
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
        console.log('Received remote track');
        if (!state.remoteStream) {
            state.remoteStream = new MediaStream();
            remoteVideo.srcObject = state.remoteStream;
        }
        state.remoteStream.addTrack(event.track);
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
        console.log('Connection state:', state.peerConnection.connectionState);
        updateConnectionStatus();
    };

    state.peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', state.peerConnection.iceConnectionState);
        updateConnectionStatus();
    };
}

// Create offer
async function createOffer() {
    try {
        await createPeerConnection();
        const offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);

        state.channel.send({
            type: 'broadcast',
            event: 'offer',
            payload: { offer: state.peerConnection.localDescription }
        });

        showNotification('Waiting for other participant to accept...', 'success');
    } catch (error) {
        console.error('Error creating offer:', error);
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
        const { error } = await supabase
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
        await supabase
            .from('rooms')
            .update({ is_active: false })
            .eq('room_code', state.roomCode);
    }

    setupModal.style.display = 'flex';
    shareBtn.style.display = 'none';
    endCallBtn.style.display = 'none';
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

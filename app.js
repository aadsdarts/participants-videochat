// State Management
let state = {
    roomCode: null,
    localStream: null,
    peerConnection: null,
    channel: null,
    lobbyChannel: null,
    isInitiator: false,
    remoteStream: null,
    spectatorToken: null,
    selectedVideoDeviceId: null,
    selectedAudioDeviceId: null,
    receivedAnswer: false,
    pendingIceCandidates: []
};

// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const setupModal = document.getElementById('setupModal');
const joinBtn = document.getElementById('joinBtn');
const shareBtn = document.getElementById('shareBtn');
const endCallBtn = document.getElementById('endCallBtn');
const reconnectBtn = document.getElementById('reconnectBtn');
const roomStatus = document.getElementById('roomStatus');
const notification = document.getElementById('notification');
const connectionStatus = document.getElementById('connectionStatus');
const roomCodeInput = document.getElementById('roomCodeInput');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');
const applyDevicesBtn = document.getElementById('applyDevicesBtn');
const deviceControls = document.getElementById('deviceControls');
const localVideoContainer = document.getElementById('localVideoContainer');
const toggleAudioBtn = document.getElementById('toggleAudioBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const refreshBtn = document.getElementById('refreshBtn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if returning from refresh
    const savedRoomCode = sessionStorage.getItem('activeRoomCode');
    if (savedRoomCode) {
        roomCodeInput.value = savedRoomCode;
        sessionStorage.removeItem('activeRoomCode');
        // Auto-join the room
        handleJoinRoom();
        return;
    }
    
    setupModal.style.display = 'flex';
    joinBtn.addEventListener('click', handleJoinRoom);
    shareBtn.addEventListener('click', handleShareSpectatorLink);
    endCallBtn.addEventListener('click', handleEndCall);
    applyDevicesBtn.addEventListener('click', handleApplyDevices);
    toggleAudioBtn.addEventListener('click', handleToggleAudio);
    toggleVideoBtn.addEventListener('click', handleToggleVideo);
    refreshBtn.addEventListener('click', handleRefresh);
    setupDividerDrag();
    setupLocalVideoDrag();
});

// Setup draggable divider
function setupDividerDrag() {
    const divider = document.querySelector('.divider');
    const videoSection = document.querySelector('.video-section');
    const dartconnectSection = document.querySelector('.dartconnect-section');
    const content = document.querySelector('.content');

    if (!divider || !videoSection || !dartconnectSection || !content) {
        console.error('Divider drag setup failed: missing elements');
        return;
    }

    let isDragging = false;
    let startX = 0;
    let startVideoWidth = 0;

    divider.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startVideoWidth = videoSection.offsetWidth;
        divider.style.backgroundColor = '#007bff';
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const contentWidth = content.offsetWidth;
        const newVideoWidth = startVideoWidth + deltaX;
        const videoPercent = (newVideoWidth / contentWidth) * 100;

        // Clamp between 20% and 80%
        const clampedPercent = Math.max(20, Math.min(80, videoPercent));
        videoSection.style.flex = `0 0 ${clampedPercent}%`;
        dartconnectSection.style.flex = `0 0 ${100 - clampedPercent}%`;

    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            divider.style.backgroundColor = '';
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// Draggable local video overlay within the video section
function setupLocalVideoDrag() {
    const parent = document.querySelector('.video-grid');
    if (!localVideoContainer || !parent) {
        console.error('Local video drag setup failed: missing elements');
        return;
    }

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    localVideoContainer.addEventListener('mousedown', (e) => {
        const containerRect = localVideoContainer.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = containerRect.left - parentRect.left;
        startTop = containerRect.top - parentRect.top;

        localVideoContainer.classList.add('dragging');
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const parentRect = parent.getBoundingClientRect();
        const containerRect = localVideoContainer.getBoundingClientRect();

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        const maxLeft = parentRect.width - containerRect.width - 10;
        const maxTop = parentRect.height - containerRect.height - 10;

        const newLeft = clamp(startLeft + deltaX, 10, maxLeft);
        const newTop = clamp(startTop + deltaY, 10, maxTop);

        localVideoContainer.style.left = `${newLeft}px`;
        localVideoContainer.style.top = `${newTop}px`;
        localVideoContainer.style.right = 'auto';
        localVideoContainer.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            localVideoContainer.classList.remove('dragging');
            document.body.style.userSelect = '';
        }
    });
}

// Draggable local video overlay
// Generate random room code
function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Sanitize room code to 4 digits
function sanitizeRoomCode(code) {
    return (code || '')
        .replace(/[^0-9]/g, '')
        .slice(0, 4);
    }

// Create or join a room - both database AND broadcast
async function createOrJoinRoom() {
    try {
        console.log('Creating room in database:', state.roomCode);
        
        const now = new Date().toISOString();
        const { data, error } = await supabaseClient
            .from('rooms')
            .upsert({
                room_code: state.roomCode,
                created_at: now,
                updated_at: now,
                is_active: true
            }, {
                onConflict: 'room_code',
                ignoreDuplicates: false
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Room creation failed:', error);
        } else {
            console.log('✅ Room created in database:', data);
        }
        
        state.isInitiator = true;
    } catch (error) {
        console.error('Error in createOrJoinRoom:', error);
        state.isInitiator = false;
    }
}

// Start announcing room to lobby
function startLobbyBroadcast() {
    console.log('Starting lobby broadcast for room:', state.roomCode);
    
    // Create lobby channel
    state.lobbyChannel = supabaseClient.channel('lobby-broadcast');
    
    state.lobbyChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            console.log('✅ Lobby channel subscribed');
            
            // Send initial broadcast
            await state.lobbyChannel.send({
                type: 'broadcast',
                event: 'room-active',
                payload: { 
                    room_code: state.roomCode,
                    timestamp: Date.now()
                }
            });
            console.log('✅ Initial room broadcast sent');
        }
    });
    
    // Keep announcing every 5 seconds
    setInterval(async () => {
        if (state.roomCode && state.lobbyChannel) {
            await state.lobbyChannel.send({
                type: 'broadcast',
                event: 'room-active',
                payload: { 
                    room_code: state.roomCode,
                    timestamp: Date.now()
                }
            });
            console.log('📡 Room broadcast sent:', state.roomCode);
        }
    }, 5000);
}

async function handleJoinRoom() {
    const rawCode = (roomCodeInput.value || '').trim();
    const roomCode = rawCode ? sanitizeRoomCode(rawCode) : generateRoomCode();
    
    // If user provided a code, validate format
    if (rawCode && roomCode.length !== 4) {
        showNotification('Invalid room code format. Use 4 digits.', 'error');
        return;
    }

    state.roomCode = roomCode;
    
    // Store room code for refresh functionality
    sessionStorage.setItem('currentRoomCode', roomCode);

    try {
        roomStatus.textContent = `Room: ${roomCode}`;
        setupModal.style.display = 'none';
        shareBtn.removeAttribute('hidden');
        endCallBtn.removeAttribute('hidden');
        refreshBtn.removeAttribute('hidden');
        toggleAudioBtn.removeAttribute('hidden');
        toggleVideoBtn.removeAttribute('hidden');
        deviceControls.removeAttribute('hidden');

        // Initialize local stream
        await initializeLocalStream();
        // Enable draggable local overlay
        await enumerateAndPopulateDevices();

        // Decide initiator/joiner before connecting signaling
        await createOrJoinRoom();

        // Now subscribe to signaling channel with correct initiator state
        
        setupRealtimeChannel();
        
        // Start broadcasting to lobby
        startLobbyBroadcast();

        showNotification('Connected to room. Waiting for other participant...', 'success');
    } catch (error) {
        console.error('Error joining room:', error);
          
          // Show modal again on error
          setupModal.style.display = 'flex';
          
          // Provide user-friendly error
          let errorMsg = 'Failed to join room. ';
          if (error.name === 'NotReadableError') {
              errorMsg += 'Your camera/microphone is in use by another application or tab. Please close other apps and try again.';
          } else {
              errorMsg += error.message;
          }
          showNotification(errorMsg, 'error');
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
            presence: { key: `user-${Math.random().toString(36).substr(2, 9)}` }
        }
    });

    // Listen for SDP offers
    state.channel.on('broadcast', { event: 'offer' }, async (payload) => {
        console.log('Received offer');
        const offer = payload.payload.offer;

        if (!state.peerConnection) {
            await createPeerConnection();
        }

        // Glare handling: always rollback then accept incoming offer
        if (state.peerConnection.signalingState !== 'stable') {
            console.warn('Glare detected: rolling back to accept incoming offer', {
                signalingState: state.peerConnection.signalingState,
                isInitiator: state.isInitiator,
                isPolite: state.isPolite
            });
            await state.peerConnection.setLocalDescription({ type: 'rollback' });
        }

        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        // Now that remote description is set, flush any buffered ICE candidates
        state.remoteDescriptionSet = true;
flushPendingIceCandidates();
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
        // Flush buffered ICE after remote description is set
        state.remoteDescriptionSet = true;
flushPendingIceCandidates();
        state.receivedAnswer = true;
    });

    // Also support spectator-specific answers
    state.channel.on('broadcast', { event: 'spectator-answer' }, async (payload) => {
        console.log('📺 Received spectator answer');
        const answer = payload.payload.answer;
        const participantId = payload.payload.participantId;
        
        // Match answer to the correct spectator connection
        if (state.spectatorConnections && state.spectatorConnections.length > 0) {
            const spectatorPC = state.spectatorConnections[state.spectatorConnections.length - 1];
            
            // Only process if this answer is for us
            if (!participantId || participantId === state.participantId) {
                if (spectatorPC.signalingState === 'have-local-offer') {
                    try {
                        await spectatorPC.setRemoteDescription(new RTCSessionDescription(answer));
                        console.log('✅ Spectator connection established for participant:', state.participantId);
                    } catch (error) {
                        console.error('Error setting spectator answer:', error);
                    }
                } else {
                    console.warn('Spectator PC not in correct state:', spectatorPC.signalingState);
                }
            } else {
                console.log('Answer not for this participant');
            }
        } else {
            console.warn('No spectator connections available');
        }
    });

    // Listen for ICE candidates
    state.channel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
        const candidate = payload.payload.candidate;

        if (!candidate) return;
        // If PC isn't ready or remote description isn't set yet, buffer candidates
        const pc = state.peerConnection;
        if (!pc || !state.remoteDescriptionSet) { state.pendingIceCandidates.push(candidate); return; }

        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    });

    // Listen for spectator ready event
    state.channel.on('broadcast', { event: 'spectator-ready' }, async (payload) => {
        console.log('🎥 Spectator joined, sending offer:', payload.payload);
        
        // Send offer to spectator if we have local stream
        if (state.localStream) {
            await sendOfferToSpectator();
        } else {
            console.warn('No local stream available to send to spectator');
        }
    });

    // Listen for spectator ICE candidates
    state.channel.on('broadcast', { event: 'spectator-ice' }, async (payload) => {
        const candidate = payload.payload.candidate;
        
        if (candidate && state.spectatorConnections && state.spectatorConnections.length > 0) {
            const spectatorPC = state.spectatorConnections[state.spectatorConnections.length - 1];
            try {
                await spectatorPC.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('✅ Added spectator ICE candidate');
            } catch (error) {
                console.error('Error adding spectator ICE candidate:', error);
            }
        }
    });

    // Listen for presence changes
    state.channel.on('presence', { event: 'sync' }, () => {
        const presenceState = state.channel.presenceState();
        const remoteUsers = Object.keys(presenceState).filter(key => key !== state.userName);

        // Only initiator sends offer, once
        if (state.isInitiator && remoteUsers.length > 0 && !state.peerConnection && state.localStream) {
            createOffer();
        }
    });

    state.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Subscribed to room channel');
            // Announce presence
            await state.channel.track({ online: true });
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

// Flush buffered ICE candidates once remoteDescription is set
function flushPendingIceCandidates() {
    const pc = state.peerConnection;
    if (!pc || !(pc.remoteDescription && pc.remoteDescription.type)) return;

    const queue = state.pendingIceCandidates || [];
    state.pendingIceCandidates = [];
    queue.forEach(async (raw) => {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(raw));
        } catch (err) {
            console.error('Error flushing ICE candidate:', err);
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
            // Room doesn't exist, create it and become initiator
            const { data, error: insertError } = await supabaseClient
                .from('rooms')
                .insert([{
                    room_code: state.roomCode,
                    created_at: new Date().toISOString(),
                    is_active: true,
                    updated_at: new Date().toISOString()
                }])
                .select();

            if (insertError) {
                console.error('Room creation failed:', insertError);
                throw insertError;
            }
            console.log('Room created successfully:', data);
            state.isInitiator = true;
            state.isPolite = false;
            state.isPolite = false;
        } else if (room) {
            // Room exists: if inactive, reactivate and become initiator; otherwise join as responder
            if (!room.is_active) {
                const { error: updateError } = await supabaseClient
                    .from('rooms')
                    .update({ is_active: true })
                    .eq('room_code', state.roomCode);

                if (updateError) throw updateError;
                state.isInitiator = true;
            state.isPolite = false;
            state.isPolite = false;
            } else {
                state.isInitiator = false;
            state.isPolite = true;
            state.isPolite = true;
            }
        }
    } catch (error) {
        console.error('Error with room:', error);
    }
}

// Create peer connection
async function createPeerConnection() {
    state.peerConnection = new RTCPeerConnection({ iceServers: RTCConfig.iceServers });
    state.remoteDescriptionSet = false;
    state.pendingIceCandidates = [];
    state.remoteDescriptionSet = false;
    state.pendingIceCandidates = [];

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
        console.log('Connection state:', state.peerConnection.connectionState);
        updateConnectionStatus();
    };

    state.peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', state.peerConnection.iceConnectionState);
        updateConnectionStatus();
    };

    state.peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', state.peerConnection.signalingState);
    };
}

// Create offer
async function createOffer() {
    try {
        state.receivedAnswer = false;
        await createPeerConnection();
        const offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);

        state.channel.send({
            type: 'broadcast',
            event: 'offer',
            payload: { offer: state.peerConnection.localDescription }
        });

        showNotification('Waiting for other participant to accept...', 'success');    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Send offer to spectator
async function sendOfferToSpectator() {
    try {
        console.log('📹 Creating offer for spectator...');
        
        // Generate unique participant ID
        const participantId = state.participantId || (state.participantId = `p-${Math.random().toString(36).substr(2, 9)}`);
        
        // Create a new peer connection for spectator
        const spectatorPC = new RTCPeerConnection(RTCConfig);
        
        // Clone tracks to prevent interference with existing connections
        // Use the original tracks but don't stop them
        const videoTrack = state.localStream.getVideoTracks()[0];
        const audioTrack = state.localStream.getAudioTracks()[0];
        
        if (videoTrack) {
            spectatorPC.addTrack(videoTrack, state.localStream);
            console.log('Added video track to spectator PC');
        }
        if (audioTrack) {
            spectatorPC.addTrack(audioTrack, state.localStream);
            console.log('Added audio track to spectator PC');
        }

        // Handle ICE candidates for spectator
        spectatorPC.onicecandidate = (event) => {
            if (event.candidate) {
                state.channel.send({
                    type: 'broadcast',
                    event: 'participant-ice',
                    payload: { 
                        participantId: participantId,
                        candidate: event.candidate 
                    }
                });
            }
        };

        spectatorPC.onconnectionstatechange = () => {
            console.log('Spectator PC connection state:', spectatorPC.connectionState);
        };

        // Create and send offer
        const offer = await spectatorPC.createOffer();
        await spectatorPC.setLocalDescription(offer);

        state.channel.send({
            type: 'broadcast',
            event: 'offer',
            payload: { 
                participantId: participantId,
                offer: spectatorPC.localDescription 
            }
        });

        console.log('✅ Offer sent to spectator from participant:', participantId);
        
        // Store spectator PC (you might want to manage multiple spectators)
        if (!state.spectatorConnections) {
            state.spectatorConnections = [];
        }
        state.spectatorConnections.push(spectatorPC);
        
        // Final check: Ensure local video continues to display
        // Double-check after all operations complete
        setTimeout(() => {
            if (localVideo.srcObject !== state.localStream) {
                console.log('🔧 Final check: Re-attaching local video stream');
                localVideo.srcObject = state.localStream;
                localVideo.play().catch(e => console.log('Local video play prevented:', e));
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Error sending offer to spectator:', error);
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
                token: state.spectatorToken
            }]);

        if (error) throw error;

        const spectatorUrl = `${window.location.origin}/spectators-videochat/viewer.html?roomCode=${state.roomCode}&token=${state.spectatorToken}`;

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

    // Clear session storage
    sessionStorage.removeItem('currentRoomCode');
    sessionStorage.removeItem('activeRoomCode');

    setupModal.style.display = 'flex';
    shareBtn.setAttribute('hidden', '');
    endCallBtn.setAttribute('hidden', '');
    refreshBtn.setAttribute('hidden', '');
    toggleAudioBtn.setAttribute('hidden', '');
    toggleVideoBtn.setAttribute('hidden', '');
    roomStatus.textContent = 'Initializing...';
    roomCodeInput.value = '';
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    localVideo.style.opacity = '1';

    showNotification('Call ended', 'success');
}

// Toggle audio (mute/unmute)
function handleToggleAudio() {
    if (!state.localStream) return;
    
    const audioTrack = state.localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        toggleAudioBtn.textContent = audioTrack.enabled ? 'ðŸ”‡ Mute' : 'ðŸ”Š Unmute';
        showNotification(audioTrack.enabled ? 'Microphone unmuted' : 'Microphone muted', 'info');
    }
}

// Toggle video (hide/show)
function handleToggleVideo() {
    if (!state.localStream) return;
    
    const videoTrack = state.localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        toggleVideoBtn.textContent = videoTrack.enabled ? 'ðŸ“¹ Hide Video' : 'ðŸ“¹ Show Video';
        localVideo.style.opacity = videoTrack.enabled ? '1' : '0.3';
        showNotification(videoTrack.enabled ? 'Camera enabled' : 'Camera disabled', 'info');
    }
}

// Handle refresh - rejoin same room
function handleRefresh() {
    if (state.roomCode) {
        sessionStorage.setItem('activeRoomCode', state.roomCode);
        window.location.reload();
    }
}

// Show notification
function showNotification(message, type = 'info') {
    notification.textContent = message;
    notification.className = `notification show ${type}`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 5000);
}




























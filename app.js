// ===== StegoCrypt - Advanced Steganography Tool =====

// State
const state = {
    currentType: 'text-image',
    currentMode: 'encode',
    images: {},
    audio: null,
    video: null,
    mediaRecorder: null,
    audioChunks: [],
    recordingStartTime: null,
    recordingInterval: null
};

// Constants
const DELIMITER = '<<STEGO_END>>';
const AUDIO_MARKER = '<<AUDIO_DATA>>';

// ===== Utility Functions =====
function $(id) { return document.getElementById(id); }
function showToast(message, type = 'success') {
    const toast = $('toast');
    toast.querySelector('.toast-message').textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function textToBinary(text) {
    return text.split('').map(char => char.charCodeAt(0).toString(2).padStart(16, '0')).join('');
}

function binaryToText(binary) {
    const chars = [];
    for (let i = 0; i < binary.length; i += 16) {
        const byte = binary.substr(i, 16);
        if (byte.length === 16) {
            const charCode = parseInt(byte, 2);
            if (charCode > 0) chars.push(String.fromCharCode(charCode));
        }
    }
    return chars.join('');
}

function xorEncrypt(text, key) {
    if (!key) return text;
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// ===== Panel Management =====
function showPanel(type, mode) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const panelId = `${type}-${mode}-panel`;
    const panel = $(panelId);
    if (panel) panel.classList.add('active');
}

function updatePanels() {
    showPanel(state.currentType, state.currentMode);
}

// ===== Text in Image Steganography =====
function encodeTextInImage(imageData, message, key) {
    const encrypted = xorEncrypt(message + DELIMITER, key);
    const binary = textToBinary(encrypted);
    const pixels = imageData.data;
    
    if (binary.length > pixels.length * 3 / 4) {
        throw new Error('Message too long for this image');
    }
    
    let binaryIndex = 0;
    for (let i = 0; i < pixels.length && binaryIndex < binary.length; i += 4) {
        for (let j = 0; j < 3 && binaryIndex < binary.length; j++) {
            pixels[i + j] = (pixels[i + j] & 0xFE) | parseInt(binary[binaryIndex], 2);
            binaryIndex++;
        }
    }
    return imageData;
}

function decodeTextFromImage(imageData, key) {
    const pixels = imageData.data;
    let binary = '';
    
    for (let i = 0; i < pixels.length; i += 4) {
        for (let j = 0; j < 3; j++) {
            binary += (pixels[i + j] & 1).toString();
        }
    }
    
    const text = binaryToText(binary);
    const decrypted = xorEncrypt(text, key);
    const delimiterIndex = decrypted.indexOf(DELIMITER);
    
    if (delimiterIndex === -1) {
        throw new Error('No hidden message found or wrong key');
    }
    return decrypted.substring(0, delimiterIndex);
}

// ===== Image in Image Steganography =====
function encodeImageInImage(carrierData, secretData, bits) {
    const carrierPixels = carrierData.data;
    const secretPixels = secretData.data;
    const mask = 0xFF << bits;
    const shift = 8 - bits;
    
    for (let i = 0; i < carrierPixels.length && i < secretPixels.length; i += 4) {
        for (let j = 0; j < 3; j++) {
            const carrierBits = carrierPixels[i + j] & mask;
            const secretBits = (secretPixels[i + j] >> shift) & ((1 << bits) - 1);
            carrierPixels[i + j] = carrierBits | secretBits;
        }
    }
    return carrierData;
}

function decodeImageFromImage(imageData, bits) {
    const pixels = imageData.data;
    const shift = 8 - bits;
    const extractedData = new Uint8ClampedArray(pixels.length);
    
    for (let i = 0; i < pixels.length; i += 4) {
        for (let j = 0; j < 3; j++) {
            const secretBits = pixels[i + j] & ((1 << bits) - 1);
            extractedData[i + j] = secretBits << shift;
        }
        extractedData[i + 3] = 255;
    }
    return new ImageData(extractedData, imageData.width, imageData.height);
}

// ===== Audio in Image Steganography =====
function encodeAudioInImage(imageData, audioBase64) {
    const message = AUDIO_MARKER + audioBase64 + DELIMITER;
    const binary = textToBinary(message);
    const pixels = imageData.data;
    
    const maxBits = Math.floor(pixels.length * 3 / 4);
    if (binary.length > maxBits) {
        throw new Error('Audio file too large for this image. Use a larger image or smaller audio.');
    }
    
    let binaryIndex = 0;
    for (let i = 0; i < pixels.length && binaryIndex < binary.length; i += 4) {
        for (let j = 0; j < 3 && binaryIndex < binary.length; j++) {
            pixels[i + j] = (pixels[i + j] & 0xFE) | parseInt(binary[binaryIndex], 2);
            binaryIndex++;
        }
    }
    return imageData;
}

function decodeAudioFromImage(imageData) {
    const pixels = imageData.data;
    let binary = '';
    
    for (let i = 0; i < pixels.length; i += 4) {
        for (let j = 0; j < 3; j++) {
            binary += (pixels[i + j] & 1).toString();
        }
    }
    
    const text = binaryToText(binary);
    
    if (!text.startsWith(AUDIO_MARKER)) {
        throw new Error('No audio data found in this image');
    }
    
    const delimiterIndex = text.indexOf(DELIMITER);
    if (delimiterIndex === -1) {
        throw new Error('Audio data is corrupted');
    }
    
    return text.substring(AUDIO_MARKER.length, delimiterIndex);
}

// ===== Image in Video Steganography =====
function encodeImageInVideoFrame(ctx, secretImg, width, height, bits = 4) {
    const frameData = ctx.getImageData(0, 0, width, height);
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(secretImg, 0, 0, width, height);
    const secretData = tempCtx.getImageData(0, 0, width, height);
    
    const encodedData = encodeImageInImage(frameData, secretData, bits);
    ctx.putImageData(encodedData, 0, 0);
}

function decodeImageFromVideoFrame(ctx, width, height, bits = 4) {
    const frameData = ctx.getImageData(0, 0, width, height);
    return decodeImageFromImage(frameData, bits);
}

// ===== Setup Event Listeners =====
function setupEventListeners() {
    // Type selector
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentType = btn.dataset.type;
            updatePanels();
        });
    });
    
    // Mode selector
    $('encode-mode-btn').addEventListener('click', () => {
        $('encode-mode-btn').classList.add('active');
        $('decode-mode-btn').classList.remove('active');
        state.currentMode = 'encode';
        updatePanels();
    });
    
    $('decode-mode-btn').addEventListener('click', () => {
        $('decode-mode-btn').classList.add('active');
        $('encode-mode-btn').classList.remove('active');
        state.currentMode = 'decode';
        updatePanels();
    });
    
    // Setup all upload areas
    setupUploadHandlers();
    
    // Setup all buttons
    setupActionButtons();
    
    // Setup remove buttons
    setupRemoveButtons();
    
    // Setup download buttons
    setupDownloadButtons();
    
    // Setup reset buttons
    setupResetButtons();
    
    // Setup copy buttons
    setupCopyButtons();
    
    // Setup audio recording
    setupAudioRecording();
    
    // Text message input
    const msgInput = $('text-image-message');
    if (msgInput) {
        msgInput.addEventListener('input', () => {
            $('text-image-char-count').textContent = msgInput.value.length;
            updateButtonState('text-image-encode-btn', 
                state.images['text-image-encode'] && msgInput.value.trim().length > 0);
        });
    }
}

function setupUploadHandlers() {
    const uploadConfigs = [
        { upload: 'text-image-encode-upload', file: 'text-image-encode-file', preview: 'text-image-encode-preview', img: 'text-image-encode-preview-img', info: 'text-image-encode-info', key: 'text-image-encode', btn: 'text-image-encode-btn' },
        { upload: 'text-image-decode-upload', file: 'text-image-decode-file', preview: 'text-image-decode-preview', img: 'text-image-decode-preview-img', key: 'text-image-decode', btn: 'text-image-decode-btn' },
        { upload: 'image-image-carrier-upload', file: 'image-image-carrier-file', preview: 'image-image-carrier-preview', img: 'image-image-carrier-preview-img', info: 'image-image-carrier-info', key: 'image-image-carrier', btn: 'image-image-encode-btn' },
        { upload: 'image-image-secret-upload', file: 'image-image-secret-file', preview: 'image-image-secret-preview', img: 'image-image-secret-preview-img', key: 'image-image-secret', btn: 'image-image-encode-btn' },
        { upload: 'image-image-decode-upload', file: 'image-image-decode-file', preview: 'image-image-decode-preview', img: 'image-image-decode-preview-img', key: 'image-image-decode', btn: 'image-image-decode-btn' },
        { upload: 'audio-image-carrier-upload', file: 'audio-image-carrier-file', preview: 'audio-image-carrier-preview', img: 'audio-image-carrier-preview-img', info: 'audio-image-carrier-info', key: 'audio-image-carrier', btn: 'audio-image-encode-btn' },
        { upload: 'audio-image-decode-upload', file: 'audio-image-decode-file', preview: 'audio-image-decode-preview', img: 'audio-image-decode-preview-img', key: 'audio-image-decode', btn: 'audio-image-decode-btn' },
        { upload: 'image-video-secret-upload', file: 'image-video-secret-file', preview: 'image-video-secret-preview', img: 'image-video-secret-preview-img', key: 'image-video-secret', btn: 'image-video-encode-btn' },
    ];
    
    uploadConfigs.forEach(config => {
        const uploadArea = $(config.upload);
        const fileInput = $(config.file);
        
        if (!uploadArea || !fileInput) return;
        
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            handleFile(e.dataTransfer.files[0], config);
        });
        fileInput.addEventListener('change', (e) => handleFile(e.target.files[0], config));
    });
    
    // Audio file upload
    const audioUpload = $('audio-image-audio-upload');
    const audioFile = $('audio-image-audio-file');
    if (audioUpload && audioFile) {
        audioUpload.addEventListener('click', () => audioFile.click());
        audioFile.addEventListener('change', (e) => handleAudioFile(e.target.files[0]));
    }
    
    // Video file uploads
    setupVideoUpload('image-video-video-upload', 'image-video-video-file', 'image-video-video-preview', 'image-video-video-player', 'image-video-video-info', 'image-video-video', 'image-video-encode-btn');
    setupVideoUpload('image-video-decode-upload', 'image-video-decode-file', 'image-video-decode-preview', 'image-video-decode-player', null, 'image-video-decode', 'image-video-decode-btn');
}

function setupVideoUpload(uploadId, fileId, previewId, playerId, infoId, key, btnId) {
    const uploadArea = $(uploadId);
    const fileInput = $(fileId);
    
    if (!uploadArea || !fileInput) return;
    
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        handleVideoFile(e.dataTransfer.files[0], { upload: uploadId, preview: previewId, player: playerId, info: infoId, key, btn: btnId });
    });
    fileInput.addEventListener('change', (e) => handleVideoFile(e.target.files[0], { upload: uploadId, preview: previewId, player: playerId, info: infoId, key, btn: btnId }));
}

function handleFile(file, config) {
    if (!file || !file.type.startsWith('image/')) {
        showToast('Please select a valid image file', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            state.images[config.key] = img;
            $(config.img).src = e.target.result;
            $(config.upload).classList.add('hidden');
            $(config.preview).classList.remove('hidden');
            
            if (config.info) {
                const capacity = Math.floor((img.width * img.height * 3) / 16);
                $(config.info).textContent = `${img.width} × ${img.height} | ~${capacity} chars`;
                if ($('text-image-capacity')) {
                    $('text-image-capacity').textContent = `Max: ~${capacity} chars`;
                }
            }
            
            updateButtonStates();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function handleAudioFile(file) {
    if (!file || !file.type.startsWith('audio/')) {
        showToast('Please select a valid audio file', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        state.audio = e.target.result;
        $('audio-image-audio-upload').classList.add('hidden');
        $('audio-image-audio-preview').classList.remove('hidden');
        $('audio-image-audio-name').textContent = file.name;
        $('audio-image-audio-player').src = e.target.result;
        updateButtonStates();
    };
    reader.readAsDataURL(file);
}

function handleVideoFile(file, config) {
    if (!file || !file.type.startsWith('video/')) {
        showToast('Please select a valid video file', 'error');
        return;
    }
    
    const url = URL.createObjectURL(file);
    state.video = { file, url };
    $(config.player).src = url;
    $(config.upload).classList.add('hidden');
    $(config.preview).classList.remove('hidden');
    
    const video = $(config.player);
    video.onloadedmetadata = () => {
        if (config.info) {
            $(config.info).textContent = `${video.videoWidth} × ${video.videoHeight} | ${video.duration.toFixed(1)}s`;
        }
        updateButtonStates();
    };
}

function updateButtonStates() {
    // Text in Image
    const hasTextImg = state.images['text-image-encode'];
    const hasMsg = $('text-image-message') && $('text-image-message').value.trim().length > 0;
    updateButtonState('text-image-encode-btn', hasTextImg && hasMsg);
    updateButtonState('text-image-decode-btn', state.images['text-image-decode']);
    
    // Image in Image
    const hasCarrier = state.images['image-image-carrier'];
    const hasSecret = state.images['image-image-secret'];
    updateButtonState('image-image-encode-btn', hasCarrier && hasSecret);
    updateButtonState('image-image-decode-btn', state.images['image-image-decode']);
    
    // Audio in Image
    const hasAudioCarrier = state.images['audio-image-carrier'];
    const hasAudio = state.audio !== null;
    updateButtonState('audio-image-encode-btn', hasAudioCarrier && hasAudio);
    updateButtonState('audio-image-decode-btn', state.images['audio-image-decode']);
    
    // Image in Video
    const hasVideo = state.video !== null;
    const hasVideoSecret = state.images['image-video-secret'];
    updateButtonState('image-video-encode-btn', hasVideo && hasVideoSecret);
    updateButtonState('image-video-decode-btn', state.video !== null || state.images['image-video-decode']);
}

function updateButtonState(btnId, enabled) {
    const btn = $(btnId);
    if (btn) btn.disabled = !enabled;
}

function setupActionButtons() {
    // Text in Image - Encode
    $('text-image-encode-btn')?.addEventListener('click', async () => {
        const btn = $('text-image-encode-btn');
        showLoader(btn);
        
        try {
            await new Promise(r => setTimeout(r, 300));
            const canvas = $('stego-canvas');
            const ctx = canvas.getContext('2d');
            const img = state.images['text-image-encode'];
            
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const message = $('text-image-message').value;
            const key = $('text-image-encode-key').value;
            
            encodeTextInImage(imageData, message, key);
            ctx.putImageData(imageData, 0, 0);
            
            $('text-image-result-img').src = canvas.toDataURL('image/png');
            $('text-image-encode-result').classList.remove('hidden');
            showToast('Message hidden successfully!');
        } catch (err) {
            showToast(err.message, 'error');
        }
        hideLoader(btn);
    });
    
    // Text in Image - Decode
    $('text-image-decode-btn')?.addEventListener('click', async () => {
        const btn = $('text-image-decode-btn');
        showLoader(btn);
        
        try {
            await new Promise(r => setTimeout(r, 300));
            const canvas = $('stego-canvas');
            const ctx = canvas.getContext('2d');
            const img = state.images['text-image-decode'];
            
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const key = $('text-image-decode-key').value;
            const message = decodeTextFromImage(imageData, key);
            
            $('text-image-decoded-content').textContent = message;
            $('text-image-decoded').classList.remove('hidden');
            showToast('Message revealed!');
        } catch (err) {
            showToast(err.message, 'error');
        }
        hideLoader(btn);
    });
    
    // Image in Image - Encode
    $('image-image-encode-btn')?.addEventListener('click', async () => {
        const btn = $('image-image-encode-btn');
        showLoader(btn);
        
        try {
            await new Promise(r => setTimeout(r, 300));
            const canvas = $('stego-canvas');
            const canvas2 = $('stego-canvas-2');
            const ctx = canvas.getContext('2d');
            const ctx2 = canvas2.getContext('2d');
            
            const carrier = state.images['image-image-carrier'];
            const secret = state.images['image-image-secret'];
            const bits = parseInt($('image-image-bits').value);
            
            canvas.width = carrier.width;
            canvas.height = carrier.height;
            canvas2.width = carrier.width;
            canvas2.height = carrier.height;
            
            ctx.drawImage(carrier, 0, 0);
            ctx2.drawImage(secret, 0, 0, carrier.width, carrier.height);
            
            const carrierData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const secretData = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);
            
            encodeImageInImage(carrierData, secretData, bits);
            ctx.putImageData(carrierData, 0, 0);
            
            $('image-image-result-img').src = canvas.toDataURL('image/png');
            $('image-image-encode-result').classList.remove('hidden');
            showToast('Image hidden successfully!');
        } catch (err) {
            showToast(err.message, 'error');
        }
        hideLoader(btn);
    });
    
    // Image in Image - Decode
    $('image-image-decode-btn')?.addEventListener('click', async () => {
        const btn = $('image-image-decode-btn');
        showLoader(btn);
        
        try {
            await new Promise(r => setTimeout(r, 300));
            const canvas = $('stego-canvas');
            const ctx = canvas.getContext('2d');
            const img = state.images['image-image-decode'];
            const bits = parseInt($('image-image-decode-bits').value);
            
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const extracted = decodeImageFromImage(imageData, bits);
            
            ctx.putImageData(extracted, 0, 0);
            $('image-image-extracted-img').src = canvas.toDataURL('image/png');
            $('image-image-extracted').classList.remove('hidden');
            showToast('Image extracted!');
        } catch (err) {
            showToast(err.message, 'error');
        }
        hideLoader(btn);
    });
    
    // Audio in Image - Encode
    $('audio-image-encode-btn')?.addEventListener('click', async () => {
        const btn = $('audio-image-encode-btn');
        showLoader(btn);
        
        try {
            await new Promise(r => setTimeout(r, 300));
            const canvas = $('stego-canvas');
            const ctx = canvas.getContext('2d');
            const img = state.images['audio-image-carrier'];
            
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const audioBase64 = state.audio.split(',')[1];
            
            encodeAudioInImage(imageData, audioBase64);
            ctx.putImageData(imageData, 0, 0);
            
            $('audio-image-result-img').src = canvas.toDataURL('image/png');
            $('audio-image-encode-result').classList.remove('hidden');
            showToast('Audio hidden in image!');
        } catch (err) {
            showToast(err.message, 'error');
        }
        hideLoader(btn);
    });
    
    // Audio in Image - Decode
    $('audio-image-decode-btn')?.addEventListener('click', async () => {
        const btn = $('audio-image-decode-btn');
        showLoader(btn);
        
        try {
            await new Promise(r => setTimeout(r, 300));
            const canvas = $('stego-canvas');
            const ctx = canvas.getContext('2d');
            const img = state.images['audio-image-decode'];
            
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const audioBase64 = decodeAudioFromImage(imageData);
            
            $('audio-image-extracted-audio').src = 'data:audio/wav;base64,' + audioBase64;
            $('audio-image-extracted').classList.remove('hidden');
            showToast('Audio extracted!');
        } catch (err) {
            showToast(err.message, 'error');
        }
        hideLoader(btn);
    });
    
    // Image in Video - Encode
    $('image-video-encode-btn')?.addEventListener('click', async () => {
        const btn = $('image-video-encode-btn');
        showLoader(btn);
        
        try {
            const video = $('image-video-video-player');
            const secretImg = state.images['image-video-secret'];
            
            // Seek to first frame
            video.currentTime = 0;
            await new Promise(r => video.onseeked = r);
            
            const canvas = $('stego-canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            ctx.drawImage(video, 0, 0);
            encodeImageInVideoFrame(ctx, secretImg, canvas.width, canvas.height, 4);
            
            // Create encoded video frame as image
            const resultImg = $('image-video-result-video');
            resultImg.poster = canvas.toDataURL('image/png');
            resultImg.src = state.video.url;
            
            $('image-video-encode-result').classList.remove('hidden');
            showToast('Image hidden in video frame! (First frame modified)');
        } catch (err) {
            showToast(err.message, 'error');
        }
        hideLoader(btn);
    });
    
    // Image in Video - Decode
    $('image-video-decode-btn')?.addEventListener('click', async () => {
        const btn = $('image-video-decode-btn');
        showLoader(btn);
        
        try {
            const video = $('image-video-decode-player');
            
            video.currentTime = 0;
            await new Promise(r => video.onseeked = r);
            
            const canvas = $('stego-canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            ctx.drawImage(video, 0, 0);
            const extracted = decodeImageFromVideoFrame(ctx, canvas.width, canvas.height, 4);
            
            ctx.putImageData(extracted, 0, 0);
            $('image-video-extracted-img').src = canvas.toDataURL('image/png');
            $('image-video-extracted').classList.remove('hidden');
            showToast('Image extracted from video!');
        } catch (err) {
            showToast(err.message, 'error');
        }
        hideLoader(btn);
    });
}

function showLoader(btn) {
    if (!btn) return;
    btn.disabled = true;
    btn.querySelector('.btn-text')?.classList.add('hidden');
    btn.querySelector('.btn-loader')?.classList.remove('hidden');
}

function hideLoader(btn) {
    if (!btn) return;
    btn.querySelector('.btn-text')?.classList.remove('hidden');
    btn.querySelector('.btn-loader')?.classList.add('hidden');
    updateButtonStates();
}

function setupRemoveButtons() {
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            if (!target) return;
            
            // Handle special cases
            if (target === 'audio-image-audio') {
                state.audio = null;
                $('audio-image-audio-preview').classList.add('hidden');
                $('audio-image-audio-upload').classList.remove('hidden');
            } else if (target.includes('video')) {
                state.video = null;
                $(`${target}-preview`).classList.add('hidden');
                $(`${target}-upload`).classList.remove('hidden');
            } else {
                delete state.images[target];
                $(`${target}-preview`).classList.add('hidden');
                $(`${target}-upload`).classList.remove('hidden');
            }
            
            updateButtonStates();
        });
    });
}

function setupDownloadButtons() {
    document.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const resultId = btn.dataset.result;
            if (!resultId) return;
            
            const img = $(resultId);
            if (!img || !img.src) return;
            
            const link = document.createElement('a');
            link.download = 'stego_' + Date.now() + '.png';
            link.href = img.src;
            link.click();
            showToast('Downloaded!');
        });
    });
    
    $('download-extracted-audio')?.addEventListener('click', () => {
        const audio = $('audio-image-extracted-audio');
        if (!audio || !audio.src) return;
        
        const link = document.createElement('a');
        link.download = 'extracted_audio.wav';
        link.href = audio.src;
        link.click();
        showToast('Audio downloaded!');
    });
    
    $('download-encoded-video')?.addEventListener('click', () => {
        if (!state.video) return;
        
        const link = document.createElement('a');
        link.download = 'stego_video.mp4';
        link.href = state.video.url;
        link.click();
        showToast('Video downloaded!');
    });
}

function setupResetButtons() {
    document.querySelectorAll('.reset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = btn.dataset.panel;
            if (!panel) return;
            
            // Reset based on panel type
            if (panel.includes('text-image')) {
                delete state.images['text-image-encode'];
                $('text-image-encode-preview')?.classList.add('hidden');
                $('text-image-encode-upload')?.classList.remove('hidden');
                $('text-image-encode-result')?.classList.add('hidden');
                if ($('text-image-message')) $('text-image-message').value = '';
                if ($('text-image-encode-key')) $('text-image-encode-key').value = '';
            } else if (panel.includes('image-image')) {
                delete state.images['image-image-carrier'];
                delete state.images['image-image-secret'];
                $('image-image-carrier-preview')?.classList.add('hidden');
                $('image-image-carrier-upload')?.classList.remove('hidden');
                $('image-image-secret-preview')?.classList.add('hidden');
                $('image-image-secret-upload')?.classList.remove('hidden');
                $('image-image-encode-result')?.classList.add('hidden');
            } else if (panel.includes('audio-image')) {
                delete state.images['audio-image-carrier'];
                state.audio = null;
                $('audio-image-carrier-preview')?.classList.add('hidden');
                $('audio-image-carrier-upload')?.classList.remove('hidden');
                $('audio-image-audio-preview')?.classList.add('hidden');
                $('audio-image-audio-upload')?.classList.remove('hidden');
                $('audio-image-encode-result')?.classList.add('hidden');
            } else if (panel.includes('image-video')) {
                delete state.images['image-video-secret'];
                state.video = null;
                $('image-video-video-preview')?.classList.add('hidden');
                $('image-video-video-upload')?.classList.remove('hidden');
                $('image-video-secret-preview')?.classList.add('hidden');
                $('image-video-secret-upload')?.classList.remove('hidden');
                $('image-video-encode-result')?.classList.add('hidden');
            }
            
            updateButtonStates();
        });
    });
}

function setupCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const contentId = btn.dataset.content;
            if (!contentId) return;
            
            const content = $(contentId);
            if (!content) return;
            
            navigator.clipboard.writeText(content.textContent)
                .then(() => showToast('Copied to clipboard!'))
                .catch(() => showToast('Failed to copy', 'error'));
        });
    });
}

function setupAudioRecording() {
    const recordBtn = $('audio-record-btn');
    const stopBtn = $('stop-record-btn');
    const indicator = $('recording-indicator');
    const timeDisplay = $('recording-time');
    
    if (!recordBtn) return;
    
    recordBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.mediaRecorder = new MediaRecorder(stream);
            state.audioChunks = [];
            
            state.mediaRecorder.ondataavailable = (e) => {
                state.audioChunks.push(e.data);
            };
            
            state.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(state.audioChunks, { type: 'audio/wav' });
                const reader = new FileReader();
                reader.onload = (e) => {
                    state.audio = e.target.result;
                    $('audio-image-audio-upload').classList.add('hidden');
                    $('audio-image-audio-preview').classList.remove('hidden');
                    $('audio-image-audio-name').textContent = 'Recording.wav';
                    $('audio-image-audio-player').src = e.target.result;
                    updateButtonStates();
                };
                reader.readAsDataURL(audioBlob);
                
                stream.getTracks().forEach(track => track.stop());
            };
            
            state.mediaRecorder.start();
            recordBtn.classList.add('hidden');
            indicator.classList.remove('hidden');
            
            state.recordingStartTime = Date.now();
            state.recordingInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - state.recordingStartTime) / 1000);
                const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const secs = (elapsed % 60).toString().padStart(2, '0');
                timeDisplay.textContent = `${mins}:${secs}`;
            }, 1000);
            
        } catch (err) {
            showToast('Microphone access denied', 'error');
        }
    });
    
    stopBtn?.addEventListener('click', () => {
        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
            state.mediaRecorder.stop();
            clearInterval(state.recordingInterval);
            recordBtn.classList.remove('hidden');
            indicator.classList.add('hidden');
            timeDisplay.textContent = '00:00';
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    updatePanels();
    console.log('StegoCrypt initialized with multiple steganography modes');
});

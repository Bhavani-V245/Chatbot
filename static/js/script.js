document.addEventListener("DOMContentLoaded", () => {
    const chatWindow = document.getElementById("chat-window");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    const emptyState = document.getElementById("empty-state");
    const newChatBtn = document.getElementById("new-chat-btn");
    const chatWrapper = document.querySelector(".chat-wrapper");

    // Voice elements
    const micBtn = document.getElementById("mic-btn");
    const voiceModeBtn = document.getElementById("voice-mode-btn");
    const voiceOverlay = document.getElementById("voice-overlay");
    const voiceOrb = document.getElementById("voice-orb");
    const voiceOrbIcon = document.getElementById("voice-orb-icon");
    const voiceStatusText = document.getElementById("voice-status-text");
    const voiceTranscript = document.getElementById("voice-transcript");
    const voiceCloseBtn = document.getElementById("voice-close-btn");

    // Attachment elements
    const attachBtn = document.getElementById("attach-btn");
    const fileInput = document.getElementById("file-input");
    const attachmentPreview = document.getElementById("attachment-preview");

    try {
        if (typeof marked.setOptions === "function") marked.setOptions({ breaks: true });
    } catch(e) { console.warn("marked config error", e); }

    let messageHistory = [];
    let pendingAttachments = []; // [{type, name, dataUrl, text}]

    // ── TEXT FILE EXTENSIONS ────────────────────────
    const TEXT_EXTS = ["txt","md","py","js","ts","css","html","json","csv","xml","yaml","yml","sh","cpp","c","java","rs","go","rb","php","swift","kt","sql","toml","ini","env","gitignore","log"];

    // ── ATTACHMENT HANDLING ─────────────────────────
    attachBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", () => {
        Array.from(fileInput.files).forEach(file => processFile(file));
        fileInput.value = "";
    });

    function getIconForFile(name) {
        const ext = name.split(".").pop().toLowerCase();
        if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return "ph-image";
        if (["py","js","ts","cpp","c","java","rs","go","rb","php","swift","kt"].includes(ext)) return "ph-file-code";
        if (ext === "json") return "ph-brackets-curly";
        if (ext === "csv") return "ph-table";
        if (ext === "md") return "ph-article";
        if (ext === "pdf") return "ph-file-pdf";
        return "ph-file-text";
    }

    function processFile(file) {
        const ext = file.name.split(".").pop().toLowerCase();
        const isImage = file.type.startsWith("image/");
        const isText = TEXT_EXTS.includes(ext);

        if (!isImage && !isText) {
            alert("Unsupported file type: " + file.name + "\nSupported: Images, and text/code files.");
            return;
        }

        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_SIZE) {
            alert("File too large (max 5MB): " + file.name);
            return;
        }

        const reader = new FileReader();

        if (isImage) {
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                pendingAttachments.push({ type: "image", name: file.name, dataUrl });
                addAttachmentChip(file.name, dataUrl, "image", pendingAttachments.length - 1);
                updateAttachBtn();
            };
            reader.readAsDataURL(file);
        } else {
            reader.onload = (e) => {
                const text = e.target.result;
                pendingAttachments.push({ type: "text", name: file.name, text });
                addAttachmentChip(file.name, null, "text", pendingAttachments.length - 1);
                updateAttachBtn();
            };
            reader.readAsText(file);
        }
    }

    function addAttachmentChip(name, dataUrl, type, idx) {
        const chip = document.createElement("div");
        chip.className = "attach-chip";
        chip.dataset.idx = idx;

        if (type === "image" && dataUrl) {
            const img = document.createElement("img");
            img.src = dataUrl;
            chip.appendChild(img);
        } else {
            const icon = document.createElement("i");
            icon.className = "ph " + getIconForFile(name);
            chip.appendChild(icon);
        }

        const nameEl = document.createElement("span");
        nameEl.className = "attach-chip-name";
        nameEl.textContent = name;
        chip.appendChild(nameEl);

        const removeBtn = document.createElement("button");
        removeBtn.className = "attach-chip-remove";
        removeBtn.title = "Remove";
        removeBtn.textContent = "x";
        removeBtn.addEventListener("click", () => {
            pendingAttachments[idx] = null;
            chip.remove();
            updateAttachBtn();
        });
        chip.appendChild(removeBtn);
        attachmentPreview.appendChild(chip);
    }

    function updateAttachBtn() {
        const hasAttachments = pendingAttachments.some(a => a !== null);
        if (hasAttachments) {
            attachBtn.classList.add("attach-active");
            sendBtn.classList.remove("disabled");
        } else {
            attachBtn.classList.remove("attach-active");
            if (!chatInput.value.trim()) sendBtn.classList.add("disabled");
        }
    }

    function clearAttachments() {
        pendingAttachments = [];
        attachmentPreview.innerHTML = "";
        attachBtn.classList.remove("attach-active");
    }

    // ── SPEECH RECOGNITION ──────────────────────────
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isListening = false;
    let voiceModeActive = false;
    let isSpeaking = false;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
            isListening = true;
            micBtn.classList.add("listening");
            micBtn.querySelector("i").className = "ph ph-microphone-stage";
            if (voiceModeActive) {
                voiceOrb.classList.add("listening");
                voiceOrbIcon.className = "ph ph-microphone";
                voiceStatusText.textContent = "Listening... speak now";
                voiceTranscript.textContent = "";
            }
        };

        recognition.onresult = (event) => {
            let interim = "", final = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) final += t; else interim += t;
            }
            if (voiceModeActive) {
                voiceTranscript.textContent = final || interim;
            } else {
                chatInput.value = final || interim;
                chatInput.style.height = "auto";
                chatInput.style.height = chatInput.scrollHeight + "px";
                if (chatInput.value.trim()) sendBtn.classList.remove("disabled");
            }
            if (final && voiceModeActive) {
                voiceStatusText.textContent = "Processing...";
                voiceOrb.classList.remove("listening");
                voiceOrbIcon.className = "ph ph-spinner";
                sendVoiceMessage(final.trim());
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            stopListening();
            if (voiceModeActive) {
                voiceStatusText.textContent = "Could not hear you. Tap the orb to try again.";
                voiceOrb.classList.remove("listening");
                voiceOrbIcon.className = "ph ph-microphone-slash";
            }
        };

        recognition.onend = () => {
            isListening = false;
            micBtn.classList.remove("listening");
            micBtn.querySelector("i").className = "ph ph-microphone";
        };
    } else {
        micBtn.title = "Speech recognition not supported in this browser";
        micBtn.style.opacity = "0.4";
        micBtn.style.cursor = "not-allowed";
        voiceModeBtn.title = "Speech recognition not supported";
        voiceModeBtn.style.opacity = "0.4";
        voiceModeBtn.style.cursor = "not-allowed";
    }

    function startListening() {
        if (!recognition || isListening) return;
        try { recognition.start(); } catch(e) { console.warn("Recognition start error:", e); }
    }
    function stopListening() {
        if (!recognition || !isListening) return;
        try { recognition.stop(); } catch(e) {}
    }

    // ── TEXT TO SPEECH ──────────────────────────────
    function speakText(text) {
        if (!window.speechSynthesis) return;
        const cleaned = text
            .replace(/```[\s\S]*?```/g, "code block omitted.")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/[*_#>\[\]]/g, "").trim();
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.rate = 1.0; utterance.pitch = 1.0; utterance.volume = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Natural"));
        if (preferred) utterance.voice = preferred;
        utterance.onstart = () => { isSpeaking = true; };
        utterance.onend = () => {
            isSpeaking = false;
            if (voiceModeActive) {
                voiceStatusText.textContent = "Tap the orb to speak again";
                voiceOrbIcon.className = "ph ph-microphone-slash";
            }
        };
        window.speechSynthesis.speak(utterance);
    }

    // ── VOICE MODE OVERLAY ──────────────────────────
    voiceModeBtn.addEventListener("click", () => {
        voiceModeActive = true;
        voiceModeBtn.classList.add("active");
        voiceOverlay.classList.remove("hidden");
        voiceStatusText.textContent = "Tap the orb to speak";
        voiceOrbIcon.className = "ph ph-microphone-slash";
        voiceTranscript.textContent = "";
    });
    voiceCloseBtn.addEventListener("click", closeVoiceMode);
    voiceOrb.addEventListener("click", () => {
        if (isListening) {
            stopListening();
            voiceStatusText.textContent = "Tap the orb to speak";
            voiceOrbIcon.className = "ph ph-microphone-slash";
        } else {
            window.speechSynthesis && window.speechSynthesis.cancel();
            startListening();
        }
    });
    function closeVoiceMode() {
        voiceModeActive = false;
        voiceModeBtn.classList.remove("active");
        voiceOverlay.classList.add("hidden");
        stopListening();
        window.speechSynthesis && window.speechSynthesis.cancel();
    }

    micBtn.addEventListener("click", () => {
        if (!recognition) return;
        if (isListening) stopListening(); else startListening();
    });

    // ── TEXTAREA AUTO-RESIZE ────────────────────────
    chatInput.addEventListener("input", function() {
        this.style.height = "auto";
        this.style.height = this.scrollHeight + "px";
        if (this.value.trim().length > 0 || pendingAttachments.some(a => a)) {
            sendBtn.classList.remove("disabled");
        } else {
            sendBtn.classList.add("disabled");
        }
    });

    function scrollToBottom() {
        chatWrapper.scrollTo({ top: chatWrapper.scrollHeight, behavior: "smooth" });
    }

    // ── BUILD MESSAGE CONTENT WITH ATTACHMENTS ──────
    function buildContentWithAttachments(text) {
        const active = pendingAttachments.filter(a => a !== null);
        if (active.length === 0) return text || "";

        // If only attachments and no text, use a default prompt
        const finalText = text || "Please analyse the attached file(s).";
        const parts = [{ type: "text", text: finalText }];

        active.forEach(att => {
            if (att.type === "image") {
                parts.push({ type: "image_url", image_url: { url: att.dataUrl } });
            } else if (att.type === "text") {
                // Embed file content as text
                parts[0].text += "\n\n--- Attached file: " + att.name + " ---\n" + att.text;
            }
        });

        // If the only parts are text (no images), collapse to a string for simpler API calls
        const hasImage = parts.some(p => p.type === "image_url");
        if (!hasImage) return parts[0].text;
        return parts;
    }

    // ── CREATE MESSAGE ELEMENT ──────────────────────
    function createMessageElement(content, sender, attachmentsSnapshot) {
        const msgContainer = document.createElement("div");
        msgContainer.classList.add("message-container", sender === "user" ? "user-message" : "bot-message");

        const msgContent = document.createElement("div");
        msgContent.classList.add("message-content");

        if (sender === "bot") {
            try {
                const rawMarkup = marked.parse(content);
                msgContent.innerHTML = DOMPurify.sanitize(rawMarkup);
            } catch(err) { msgContent.innerText = content; }

            const speakBtn = document.createElement("button");
            speakBtn.className = "speak-btn";
            speakBtn.innerHTML = '<i class="ph ph-speaker-high"></i> Speak';
            speakBtn.addEventListener("click", () => {
                if (speakBtn.classList.contains("speaking")) {
                    window.speechSynthesis.cancel();
                    speakBtn.classList.remove("speaking");
                    speakBtn.innerHTML = '<i class="ph ph-speaker-high"></i> Speak';
                } else {
                    document.querySelectorAll(".speak-btn.speaking").forEach(b => {
                        b.classList.remove("speaking");
                        b.innerHTML = '<i class="ph ph-speaker-high"></i> Speak';
                    });
                    speakBtn.classList.add("speaking");
                    speakBtn.innerHTML = '<i class="ph ph-stop-circle"></i> Stop';
                    const utt = new SpeechSynthesisUtterance(
                        content.replace(/```[\s\S]*?```/g, "code block omitted.").replace(/[*_#>`\[\]]/g, "").trim()
                    );
                    const voices = window.speechSynthesis.getVoices();
                    const pref = voices.find(v => v.name.includes("Google") || v.name.includes("Samantha"));
                    if (pref) utt.voice = pref;
                    utt.onend = () => {
                        speakBtn.classList.remove("speaking");
                        speakBtn.innerHTML = '<i class="ph ph-speaker-high"></i> Speak';
                    };
                    window.speechSynthesis.speak(utt);
                }
            });
            msgContent.appendChild(speakBtn);
        } else {
            // Show attachment previews in the message
            if (attachmentsSnapshot && attachmentsSnapshot.length > 0) {
                attachmentsSnapshot.forEach(att => {
                    if (!att) return;
                    if (att.type === "image") {
                        const img = document.createElement("img");
                        img.src = att.dataUrl;
                        img.className = "msg-image";
                        img.alt = att.name;
                        msgContent.appendChild(img);
                    } else {
                        const label = document.createElement("div");
                        label.className = "msg-file-label";
                        label.innerHTML = '<i class="ph ph-file-text"></i>' + att.name;
                        msgContent.appendChild(label);
                    }
                });
            }
            if (content) {
                const textNode = document.createTextNode(content);
                const p = document.createElement("p");
                p.appendChild(textNode);
                p.innerHTML = p.innerHTML.replace(/\n/g, "<br>");
                msgContent.appendChild(p);
            }
        }

        msgContainer.appendChild(msgContent);
        return msgContainer;
    }

    function addMessage(content, sender, attachmentsSnapshot) {
        if (emptyState) emptyState.style.display = "none";
        const msgElement = createMessageElement(content, sender, attachmentsSnapshot);
        chatWindow.appendChild(msgElement);
        msgElement.querySelectorAll("pre code").forEach(block => hljs.highlightElement(block));
        scrollToBottom();
        return msgElement;
    }

    function showTypingIndicator() {
        const c = document.createElement("div");
        c.classList.add("message-container", "bot-message");
        c.id = "typing-indicator-container";
        const mc = document.createElement("div"); mc.classList.add("message-content");
        const ind = document.createElement("div"); ind.classList.add("typing-indicator");
        ind.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        mc.appendChild(ind); c.appendChild(mc);
        chatWindow.appendChild(c);
        scrollToBottom();
    }
    function removeTypingIndicator() {
        const el = document.getElementById("typing-indicator-container");
        if (el) el.remove();
    }

    // ── SEND MESSAGE ────────────────────────────────
    async function sendMessage() {
        const text = chatInput.value.trim();
        const hasAttachments = pendingAttachments.some(a => a !== null);
        if (!text && !hasAttachments) return;

        const attachmentsSnapshot = [...pendingAttachments];
        const messageContent = buildContentWithAttachments(text);

        chatInput.value = "";
        chatInput.style.height = "auto";
        sendBtn.classList.add("disabled");
        clearAttachments();

        addMessage(text, "user", attachmentsSnapshot);
        messageHistory.push({ role: "user", content: messageContent });
        showTypingIndicator();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: messageHistory }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            removeTypingIndicator();
            let data;
            try { data = await response.json(); } catch(e) { throw new Error("Failed to parse server response"); }
            if (!response.ok || data.error) {
                addMessage("**Error:** " + (data.error || "Unknown server error"), "bot");
            } else {
                addMessage(data.response, "bot");
                messageHistory.push({ role: "assistant", content: data.response });
            }
        } catch(error) {
            removeTypingIndicator();
            if (error.name === "AbortError") {
                addMessage("**Error:** The request timed out.", "bot");
            } else {
                addMessage("**Error:** Sorry, I encountered an issue connecting to the server.", "bot");
            }
        }
    }

    async function sendVoiceMessage(text) {
        if (!text) return;
        addMessage(text, "user");
        messageHistory.push({ role: "user", content: text });
        voiceTranscript.textContent = "";
        voiceStatusText.textContent = "Thinking...";
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: messageHistory }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            let data;
            try { data = await response.json(); } catch(e) { throw new Error("Parse error"); }
            if (!response.ok || data.error) {
                const errMsg = data.error || "Unknown error";
                addMessage("**Error:** " + errMsg, "bot");
                speakText("Sorry, I encountered an error: " + errMsg);
            } else {
                addMessage(data.response, "bot");
                messageHistory.push({ role: "assistant", content: data.response });
                voiceStatusText.textContent = "Speaking...";
                voiceOrbIcon.className = "ph ph-speaker-high";
                speakText(data.response);
            }
        } catch(error) {
            const errMsg = error.name === "AbortError" ? "Request timed out." : "Connection error.";
            addMessage("**Error:** " + errMsg, "bot");
            speakText("Sorry, " + errMsg);
            voiceStatusText.textContent = "Tap the orb to speak again";
            voiceOrbIcon.className = "ph ph-microphone-slash";
        }
    }

    sendBtn.addEventListener("click", () => {
        if (!sendBtn.classList.contains("disabled")) sendMessage();
    });
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.classList.contains("disabled")) sendMessage();
        }
    });
    newChatBtn.addEventListener("click", () => {
        messageHistory = [];
        chatWindow.innerHTML = "";
        clearAttachments();
        window.speechSynthesis && window.speechSynthesis.cancel();
        if (emptyState) {
            chatWindow.appendChild(emptyState);
            emptyState.style.display = "flex";
        }
    });
    document.querySelectorAll(".rec-card").forEach(card => {
        card.addEventListener("click", () => {
            const h4 = card.querySelector("h4").innerText;
            const p = card.querySelector("p").innerText;
            chatInput.value = h4 + " " + p;
            chatInput.style.height = "auto";
            chatInput.style.height = chatInput.scrollHeight + "px";
            sendBtn.classList.remove("disabled");
            sendMessage();
        });
    });
    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
    }
});

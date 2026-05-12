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

    try {
        if (typeof marked.setOptions === "function") {
            marked.setOptions({ breaks: true });
        }
    } catch(e) { console.warn("marked config error", e); }

    let messageHistory = [];

    // Speech Recognition Setup
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
            let interim = "";
            let final = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    final += transcript;
                } else {
                    interim += transcript;
                }
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

    // Text-to-Speech
    function speakText(text) {
        if (!window.speechSynthesis) return;
        const cleaned = text
            .replace(/```[\s\S]*?```/g, "code block omitted.")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/[*_#>\[\]]/g, "")
            .trim();
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v =>
            v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Natural")
        );
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

    // Voice Mode Overlay
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

    // Inline mic button
    micBtn.addEventListener("click", () => {
        if (!recognition) return;
        if (isListening) { stopListening(); } else { startListening(); }
    });

    // Auto-resize textarea
    chatInput.addEventListener("input", function() {
        this.style.height = "auto";
        this.style.height = (this.scrollHeight) + "px";
        if (this.value.trim().length > 0) {
            sendBtn.classList.remove("disabled");
        } else {
            sendBtn.classList.add("disabled");
        }
    });

    function scrollToBottom() {
        chatWrapper.scrollTo({ top: chatWrapper.scrollHeight, behavior: "smooth" });
    }

    function createMessageElement(content, sender) {
        const msgContainer = document.createElement("div");
        msgContainer.classList.add("message-container");
        msgContainer.classList.add(sender === "user" ? "user-message" : "bot-message");

        const msgContent = document.createElement("div");
        msgContent.classList.add("message-content");

        if (sender === "bot") {
            try {
                const rawMarkup = marked.parse(content);
                const cleanMarkup = DOMPurify.sanitize(rawMarkup);
                msgContent.innerHTML = cleanMarkup;
            } catch (err) {
                msgContent.innerText = content;
            }

            // Speak button
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
                    const utterance = new SpeechSynthesisUtterance(
                        content.replace(/```[\s\S]*?```/g, "code block omitted.")
                               .replace(/[*_#>`\[\]]/g, "").trim()
                    );
                    const voices = window.speechSynthesis.getVoices();
                    const preferred = voices.find(v =>
                        v.name.includes("Google") || v.name.includes("Samantha")
                    );
                    if (preferred) utterance.voice = preferred;
                    utterance.onend = () => {
                        speakBtn.classList.remove("speaking");
                        speakBtn.innerHTML = '<i class="ph ph-speaker-high"></i> Speak';
                    };
                    window.speechSynthesis.speak(utterance);
                }
            });
            msgContent.appendChild(speakBtn);
        } else {
            const textNode = document.createTextNode(content);
            const p = document.createElement("p");
            p.appendChild(textNode);
            p.innerHTML = p.innerHTML.replace(/\n/g, "<br>");
            msgContent.appendChild(p);
        }

        msgContainer.appendChild(msgContent);
        return msgContainer;
    }

    function addMessage(content, sender) {
        if (emptyState) emptyState.style.display = "none";
        const msgElement = createMessageElement(content, sender);
        chatWindow.appendChild(msgElement);
        msgElement.querySelectorAll("pre code").forEach(block => hljs.highlightElement(block));
        scrollToBottom();
        return msgElement;
    }

    function showTypingIndicator() {
        const c = document.createElement("div");
        c.classList.add("message-container", "bot-message");
        c.id = "typing-indicator-container";
        const mc = document.createElement("div");
        mc.classList.add("message-content");
        const ind = document.createElement("div");
        ind.classList.add("typing-indicator");
        ind.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        mc.appendChild(ind);
        c.appendChild(mc);
        chatWindow.appendChild(c);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById("typing-indicator-container");
        if (indicator) indicator.remove();
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = "";
        chatInput.style.height = "auto";
        sendBtn.classList.add("disabled");
        addMessage(text, "user");
        messageHistory.push({ role: "user", content: text });
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
        } catch (error) {
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
            chatInput.style.height = (chatInput.scrollHeight) + "px";
            sendBtn.classList.remove("disabled");
            sendMessage();
        });
    });

    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
    }
});

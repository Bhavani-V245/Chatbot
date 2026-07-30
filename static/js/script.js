document.addEventListener("DOMContentLoaded", () => {
    // ── STATE & TOKENS ──────────────────────────────
    let jwtToken = localStorage.getItem("jwt_token") || null;
    let currentUser = null;
    let currentConversationId = null;
    let messageHistory = [];
    let pendingAttachments = []; // [{type, name, dataUrl, text}]
    let abortController = null;
    let otpTimerInterval = null;

    // ── DOM ELEMENTS ────────────────────────────────
    const chatWrapper = document.getElementById("chat-wrapper");
    const chatWindow = document.getElementById("chat-window");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    const emptyState = document.getElementById("empty-state");
    const newChatBtn = document.getElementById("new-chat-btn");
    const modelSelect = document.getElementById("model-select");

    // Sidebar & History
    const conversationList = document.getElementById("conversation-list");
    const searchConvInput = document.getElementById("search-conv-input");
    const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
    const sidebar = document.getElementById("sidebar");
    const sidebarUserName = document.getElementById("sidebar-user-name");

    // Voice Elements
    const micBtn = document.getElementById("mic-btn");
    const voiceModeBtn = document.getElementById("voice-mode-btn");
    const voiceOverlay = document.getElementById("voice-overlay");
    const voiceOrb = document.getElementById("voice-orb");
    const voiceOrbIcon = document.getElementById("voice-orb-icon");
    const voiceStatusText = document.getElementById("voice-status-text");
    const voiceTranscript = document.getElementById("voice-transcript");
    const voiceCloseBtn = document.getElementById("voice-close-btn");

    // Attachments & Drag Drop
    const attachBtn = document.getElementById("attach-btn");
    const fileInput = document.getElementById("file-input");
    const attachmentPreview = document.getElementById("attachment-preview");
    const dragOverlay = document.getElementById("drag-overlay");

    // Stop Generation
    const stopGenerationBar = document.getElementById("stop-generation-bar");
    const stopGenerationBtn = document.getElementById("stop-generation-btn");

    // Auth Modal
    const authBtn = document.getElementById("auth-btn");
    const authBtnText = document.getElementById("auth-btn-text");
    const authModal = document.getElementById("auth-modal");
    const authModalClose = document.getElementById("auth-modal-close");
    const tabLoginBtn = document.getElementById("tab-login-btn");
    const tabSignupBtn = document.getElementById("tab-signup-btn");
    const loginForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");
    const forgotForm = document.getElementById("forgot-form");
    const forgotPwLink = document.getElementById("forgot-pw-link");
    const sendOtpBtn = document.getElementById("send-otp-btn");
    const verifyResetBtn = document.getElementById("verify-reset-btn");
    const resendOtpBtn = document.getElementById("resend-otp-btn");
    const otpSection = document.getElementById("otp-section");
    const otpTimerText = document.getElementById("otp-timer-text");

    // Profile & Settings Modals
    const userProfileBtn = document.getElementById("user-profile-btn");
    const profileModal = document.getElementById("profile-modal");
    const profileModalClose = document.getElementById("profile-modal-close");
    const profileForm = document.getElementById("profile-form");
    const changePwForm = document.getElementById("change-pw-form");
    const logoutBtn = document.getElementById("logout-btn");

    const topbarSettingsBtn = document.getElementById("topbar-settings-btn");
    const sidebarSettingsBtn = document.getElementById("sidebar-settings-btn");
    const settingsModal = document.getElementById("settings-modal");
    const settingsModalClose = document.getElementById("settings-modal-close");
    const settingTheme = document.getElementById("setting-theme");
    const settingTemp = document.getElementById("setting-temp");
    const tempVal = document.getElementById("temp-val");
    const settingTopp = document.getElementById("setting-topp");
    const toppVal = document.getElementById("topp-val");
    const settingVoice = document.getElementById("setting-voice");
    const settingSpeechRate = document.getElementById("setting-speech-rate");
    const rateVal = document.getElementById("rate-val");

    const exportChatBtn = document.getElementById("export-chat-btn");
    const clearAllChatsBtn = document.getElementById("clear-all-chats-btn");
    const deleteAccountBtn = document.getElementById("delete-account-btn");

    try {
        if (typeof marked.setOptions === "function") marked.setOptions({ breaks: true });
    } catch(e) { console.warn("marked config error", e); }

    // ── INITIALIZE APP ──────────────────────────────
    checkAuthStatus();
    loadVoices();
    loadConversations();

    // ── AUTHENTICATION MANAGEMENT ──────────────────
    async function checkAuthStatus() {
        if (!jwtToken) {
            updateAuthUI(null);
            return;
        }
        try {
            const res = await fetch("/api/me", {
                headers: { "Authorization": "Bearer " + jwtToken }
            });
            if (res.ok) {
                const data = await res.json();
                currentUser = data;
                updateAuthUI(currentUser);
            } else {
                logout();
            }
        } catch(e) {
            console.warn("Auth verify error:", e);
        }
    }

    function updateAuthUI(user) {
        if (user) {
            authBtnText.textContent = user.display_name || user.email.split("@")[0];
            sidebarUserName.textContent = user.display_name || user.email.split("@")[0];
        } else {
            authBtnText.textContent = "Sign In";
            sidebarUserName.textContent = "Guest User";
        }
    }

    function logout() {
        jwtToken = null;
        currentUser = null;
        localStorage.removeItem("jwt_token");
        updateAuthUI(null);
        profileModal.classList.add("hidden");
        loadConversations();
    }

    // Modal Toggles
    authBtn.addEventListener("click", () => {
        if (currentUser) {
            openProfileModal();
        } else {
            openAuthModal();
        }
    });

    userProfileBtn.addEventListener("click", () => {
        if (currentUser) openProfileModal(); else openAuthModal();
    });

    authModalClose.addEventListener("click", () => authModal.classList.add("hidden"));
    profileModalClose.addEventListener("click", () => profileModal.classList.add("hidden"));
    settingsModalClose.addEventListener("click", () => settingsModal.classList.add("hidden"));

    topbarSettingsBtn.addEventListener("click", openSettingsModal);
    sidebarSettingsBtn.addEventListener("click", openSettingsModal);

    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener("click", () => {
            sidebar.classList.toggle("open");
        });
    }

    function openAuthModal() {
        authModal.classList.remove("hidden");
        switchAuthTab("login");
    }

    function switchAuthTab(tab) {
        document.getElementById("login-error").classList.add("hidden");
        document.getElementById("signup-error").classList.add("hidden");
        document.getElementById("forgot-error").classList.add("hidden");
        document.getElementById("forgot-success").classList.add("hidden");

        if (tab === "login") {
            tabLoginBtn.classList.add("active");
            tabSignupBtn.classList.remove("active");
            loginForm.classList.remove("hidden");
            signupForm.classList.add("hidden");
            forgotForm.classList.add("hidden");
        } else if (tab === "signup") {
            tabSignupBtn.classList.add("active");
            tabLoginBtn.classList.remove("active");
            signupForm.classList.remove("hidden");
            loginForm.classList.add("hidden");
            forgotForm.classList.add("hidden");
        } else if (tab === "forgot") {
            loginForm.classList.add("hidden");
            signupForm.classList.add("hidden");
            forgotForm.classList.remove("hidden");
        }
    }

    tabLoginBtn.addEventListener("click", () => switchAuthTab("login"));
    tabSignupBtn.addEventListener("click", () => switchAuthTab("signup"));
    forgotPwLink.addEventListener("click", () => switchAuthTab("forgot"));

    // Login submit
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value;
        const errEl = document.getElementById("login-error");

        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) {
                errEl.textContent = data.error || "Login failed";
                errEl.classList.remove("hidden");
            } else {
                jwtToken = data.token;
                localStorage.setItem("jwt_token", jwtToken);
                currentUser = { email: data.email, role: data.role };
                updateAuthUI(currentUser);
                authModal.classList.add("hidden");
                loadConversations();
            }
        } catch(err) {
            errEl.textContent = "Connection error";
            errEl.classList.remove("hidden");
        }
    });

    // Signup submit
    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("signup-email").value.trim();
        const password = document.getElementById("signup-password").value;
        const errEl = document.getElementById("signup-error");

        try {
            const res = await fetch("/api/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) {
                errEl.textContent = data.error || "Signup failed";
                errEl.classList.remove("hidden");
            } else {
                switchAuthTab("login");
                document.getElementById("login-email").value = email;
            }
        } catch(err) {
            errEl.textContent = "Connection error";
            errEl.classList.remove("hidden");
        }
    });

    // Send OTP
    sendOtpBtn.addEventListener("click", async () => {
        const email = document.getElementById("forgot-email").value.trim();
        const errEl = document.getElementById("forgot-error");
        const succEl = document.getElementById("forgot-success");
        errEl.classList.add("hidden");
        succEl.classList.add("hidden");

        if (!email) {
            errEl.textContent = "Please enter your email";
            errEl.classList.remove("hidden");
            return;
        }

        try {
            const res = await fetch("/api/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (!res.ok) {
                errEl.textContent = data.error || "Failed to send OTP";
                errEl.classList.remove("hidden");
            } else {
                succEl.textContent = data.message || "OTP code sent to email!";
                succEl.classList.remove("hidden");
                otpSection.classList.remove("hidden");
                sendOtpBtn.classList.add("hidden");
                verifyResetBtn.classList.remove("hidden");
                startOtpTimer(60);
            }
        } catch(err) {
            errEl.textContent = "Connection error";
            errEl.classList.remove("hidden");
        }
    });

    function startOtpTimer(seconds) {
        clearInterval(otpTimerInterval);
        let remaining = seconds;
        resendOtpBtn.classList.add("disabled");
        otpTimerText.textContent = `Resend in ${remaining}s`;

        otpTimerInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(otpTimerInterval);
                otpTimerText.textContent = "Didn't get code?";
                resendOtpBtn.classList.remove("disabled");
            } else {
                otpTimerText.textContent = `Resend in ${remaining}s`;
            }
        }, 1000);
    }

    resendOtpBtn.addEventListener("click", () => {
        if (!resendOtpBtn.classList.contains("disabled")) {
            sendOtpBtn.click();
        }
    });

    // Reset Password verify
    verifyResetBtn.addEventListener("click", async () => {
        const email = document.getElementById("forgot-email").value.trim();
        const otp = document.getElementById("reset-otp").value.trim();
        const new_password = document.getElementById("reset-new-password").value;
        const errEl = document.getElementById("forgot-error");
        const succEl = document.getElementById("forgot-success");

        try {
            const res = await fetch("/api/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp, new_password })
            });
            const data = await res.json();
            if (!res.ok) {
                errEl.textContent = data.error || "Failed to reset password";
                errEl.classList.remove("hidden");
            } else {
                succEl.textContent = data.message;
                succEl.classList.remove("hidden");
                setTimeout(() => switchAuthTab("login"), 1500);
            }
        } catch(e) {
            errEl.textContent = "Connection error";
            errEl.classList.remove("hidden");
        }
    });

    // ── PROFILE MODAL ───────────────────────────────
    async function openProfileModal() {
        profileModal.classList.remove("hidden");
        document.getElementById("profile-email").value = currentUser.email || "";
        document.getElementById("profile-name").value = currentUser.display_name || "";
        document.getElementById("profile-photo").value = currentUser.photo_url || "";

        try {
            const res = await fetch("/api/profile", {
                headers: { "Authorization": "Bearer " + jwtToken }
            });
            if (res.ok) {
                const p = await res.json();
                document.getElementById("profile-name").value = p.display_name || "";
                document.getElementById("profile-photo").value = p.photo_url || "";
            }
        } catch(e) {}
    }

    profileForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const display_name = document.getElementById("profile-name").value.trim();
        const photo_url = document.getElementById("profile-photo").value.trim();
        const msgEl = document.getElementById("profile-msg");

        try {
            const res = await fetch("/api/profile", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + jwtToken
                },
                body: JSON.stringify({ display_name, photo_url })
            });
            if (res.ok) {
                msgEl.textContent = "Profile saved successfully!";
                msgEl.classList.remove("hidden");
                currentUser.display_name = display_name;
                updateAuthUI(currentUser);
                setTimeout(() => msgEl.classList.add("hidden"), 2000);
            }
        } catch(e) {}
    });

    changePwForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const old_password = document.getElementById("pw-current").value;
        const new_password = document.getElementById("pw-new").value;
        const msgEl = document.getElementById("change-pw-msg");

        try {
            const res = await fetch("/api/profile/change-password", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + jwtToken
                },
                body: JSON.stringify({ old_password, new_password })
            });
            const data = await res.json();
            if (!res.ok) {
                msgEl.textContent = data.error || "Failed to change password";
                msgEl.classList.remove("hidden");
            } else {
                msgEl.className = "success-msg";
                msgEl.textContent = "Password updated successfully!";
                msgEl.classList.remove("hidden");
                changePwForm.reset();
                setTimeout(() => msgEl.classList.add("hidden"), 2000);
            }
        } catch(e) {}
    });

    logoutBtn.addEventListener("click", logout);

    // ── SETTINGS MODAL ───────────────────────────────
    function openSettingsModal() {
        settingsModal.classList.remove("hidden");
        if (jwtToken) fetchSettings();
    }

    async function fetchSettings() {
        try {
            const res = await fetch("/api/settings", {
                headers: { "Authorization": "Bearer " + jwtToken }
            });
            if (res.ok) {
                const s = await res.json();
                settingTheme.value = s.theme || "system";
                settingTemp.value = s.temperature || 0.8;
                tempVal.textContent = settingTemp.value;
                settingTopp.value = s.top_p || 0.1;
                toppVal.textContent = settingTopp.value;
                applyTheme(settingTheme.value);
            }
        } catch(e) {}
    }

    settingTheme.addEventListener("change", (e) => {
        applyTheme(e.target.value);
        saveSettings();
    });

    function applyTheme(theme) {
        if (theme === "light") {
            document.body.classList.add("light-theme");
        } else if (theme === "dark") {
            document.body.classList.remove("light-theme");
        } else {
            const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
            if (prefersDark) document.body.classList.remove("light-theme");
            else document.body.classList.add("light-theme");
        }
    }

    settingTemp.addEventListener("input", (e) => {
        tempVal.textContent = e.target.value;
        saveSettings();
    });
    settingTopp.addEventListener("input", (e) => {
        toppVal.textContent = e.target.value;
        saveSettings();
    });
    settingSpeechRate.addEventListener("input", (e) => {
        rateVal.textContent = e.target.value;
    });

    async function saveSettings() {
        if (!jwtToken) return;
        const theme = settingTheme.value;
        const temperature = parseFloat(settingTemp.value);
        const top_p = parseFloat(settingTopp.value);

        try {
            await fetch("/api/settings", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + jwtToken
                },
                body: JSON.stringify({ theme, temperature, top_p })
            });
        } catch(e) {}
    }

    exportChatBtn.addEventListener("click", async () => {
        if (!jwtToken) {
            alert("Please log in to export your chat history.");
            return;
        }
        try {
            const res = await fetch("/api/export-data", {
                headers: { "Authorization": "Bearer " + jwtToken }
            });
            if (res.ok) {
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `chat_export_${new Date().toISOString().slice(0,10)}.json`;
                a.click();
            }
        } catch(e) { alert("Failed to export chat history."); }
    });

    clearAllChatsBtn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to clear all chat conversations?")) return;
        if (jwtToken) {
            try {
                await fetch("/api/conversations", {
                    method: "DELETE",
                    headers: { "Authorization": "Bearer " + jwtToken }
                });
            } catch(e) {}
        }
        messageHistory = [];
        currentConversationId = null;
        chatWindow.innerHTML = "";
        if (emptyState) {
            chatWindow.appendChild(emptyState);
            emptyState.style.display = "flex";
        }
        loadConversations();
        settingsModal.classList.add("hidden");
    });

    deleteAccountBtn.addEventListener("click", async () => {
        if (!confirm("CRITICAL WARNING: This will permanently delete your account and all associated data. Continue?")) return;
        if (jwtToken) {
            try {
                await fetch("/api/profile/delete-account", {
                    method: "DELETE",
                    headers: { "Authorization": "Bearer " + jwtToken }
                });
            } catch(e) {}
        }
        logout();
        settingsModal.classList.add("hidden");
    });

    // ── CONVERSATION HISTORY & SIDEBAR ───────────────
    async function loadConversations() {
        if (!jwtToken) {
            conversationList.innerHTML = '<div class="history-label">Sign in to save chats</div>';
            return;
        }
        try {
            const res = await fetch("/api/conversations", {
                headers: { "Authorization": "Bearer " + jwtToken }
            });
            if (res.ok) {
                const data = await res.json();
                renderConversationSidebar(data.conversations || []);
            }
        } catch(e) {
            console.warn("Failed to load conversations:", e);
        }
    }

    function renderConversationSidebar(conversations) {
        conversationList.innerHTML = "";
        const query = (searchConvInput.value || "").toLowerCase().trim();

        const filtered = conversations.filter(c => c.title.toLowerCase().includes(query));
        if (filtered.length === 0) {
            conversationList.innerHTML = '<div class="history-label">No chats found</div>';
            return;
        }

        const label = document.createElement("div");
        label.className = "history-label";
        label.textContent = "Recent Chats";
        conversationList.appendChild(label);

        const listContainer = document.createElement("div");
        listContainer.className = "history-list";

        filtered.forEach(conv => {
            const btn = document.createElement("button");
            btn.className = "history-item" + (conv.id === currentConversationId ? " active" : "");
            
            const titleSpan = document.createElement("span");
            titleSpan.className = "truncate";
            titleSpan.textContent = conv.title || "Untitled Chat";

            const actionsDiv = document.createElement("div");
            actionsDiv.className = "history-item-actions";

            const editBtn = document.createElement("span");
            editBtn.className = "history-action-btn";
            editBtn.innerHTML = '<i class="ph ph-pencil"></i>';
            editBtn.title = "Rename";
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                renameConversation(conv.id, conv.title);
            });

            const delBtn = document.createElement("span");
            delBtn.className = "history-action-btn";
            delBtn.innerHTML = '<i class="ph ph-trash"></i>';
            delBtn.title = "Delete";
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                deleteConversation(conv.id);
            });

            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(delBtn);

            btn.appendChild(titleSpan);
            btn.appendChild(actionsDiv);

            btn.addEventListener("click", () => switchConversation(conv.id));
            listContainer.appendChild(btn);
        });

        conversationList.appendChild(listContainer);
    }

    searchConvInput.addEventListener("input", () => loadConversations());

    async function switchConversation(id) {
        if (!jwtToken) return;
        currentConversationId = id;
        try {
            const res = await fetch(`/api/conversations/${id}`, {
                headers: { "Authorization": "Bearer " + jwtToken }
            });
            if (res.ok) {
                const data = await res.json();
                messageHistory = data.messages || [];
                renderMessageHistory(messageHistory);
                loadConversations();
            }
        } catch(e) {}
    }

    function renderMessageHistory(history) {
        chatWindow.innerHTML = "";
        if (history.length === 0) {
            if (emptyState) {
                chatWindow.appendChild(emptyState);
                emptyState.style.display = "flex";
            }
            return;
        }
        if (emptyState) emptyState.style.display = "none";
        history.forEach(m => {
            addMessageUI(m.content, m.role === "user" ? "user" : "bot");
        });
        scrollToBottom();
    }

    async function renameConversation(id, oldTitle) {
        const newTitle = prompt("Enter new title for this conversation:", oldTitle);
        if (!newTitle || newTitle.trim() === oldTitle) return;
        try {
            await fetch(`/api/conversations/${id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + jwtToken
                },
                body: JSON.stringify({ title: newTitle.trim() })
            });
            loadConversations();
        } catch(e) {}
    }

    async function deleteConversation(id) {
        if (!confirm("Delete this conversation?")) return;
        try {
            await fetch(`/api/conversations/${id}`, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + jwtToken }
            });
            if (currentConversationId === id) {
                newChatBtn.click();
            } else {
                loadConversations();
            }
        } catch(e) {}
    }

    // ── ATTACHMENTS & DRAG DROP ──────────────────────
    const TEXT_EXTS = ["txt","md","py","js","ts","css","html","json","csv","xml","yaml","yml","sh","cpp","c","java","rs","go","rb","php","swift","kt","sql","toml","ini","env","gitignore","log"];

    attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        Array.from(fileInput.files).forEach(file => processFile(file));
        fileInput.value = "";
    });

    // Drag & Drop handlers
    ["dragenter", "dragover"].forEach(evt => {
        document.body.addEventListener(evt, (e) => {
            e.preventDefault();
            dragOverlay.classList.remove("hidden");
        });
    });
    ["dragleave", "drop"].forEach(evt => {
        dragOverlay.addEventListener(evt, (e) => {
            e.preventDefault();
            dragOverlay.classList.add("hidden");
        });
    });
    dragOverlay.addEventListener("drop", (e) => {
        if (e.dataTransfer.files) {
            Array.from(e.dataTransfer.files).forEach(file => processFile(file));
        }
    });

    function getIconForFile(name) {
        const ext = name.split(".").pop().toLowerCase();
        if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return "ph-image";
        if (["py","js","ts","cpp","c","java","rs","go","rb","php"].includes(ext)) return "ph-file-code";
        return "ph-file-text";
    }

    function processFile(file) {
        const ext = file.name.split(".").pop().toLowerCase();
        const isImage = file.type.startsWith("image/");
        const isText = TEXT_EXTS.includes(ext);

        if (!isImage && !isText) {
            alert("Unsupported file type: " + file.name);
            return;
        }

        const reader = new FileReader();
        if (isImage) {
            reader.onload = (e) => {
                pendingAttachments.push({ type: "image", name: file.name, dataUrl: e.target.result });
                addAttachmentChip(file.name, e.target.result, "image", pendingAttachments.length - 1);
                updateAttachBtn();
            };
            reader.readAsDataURL(file);
        } else {
            reader.onload = (e) => {
                pendingAttachments.push({ type: "text", name: file.name, text: e.target.result });
                addAttachmentChip(file.name, null, "text", pendingAttachments.length - 1);
                updateAttachBtn();
            };
            reader.readAsText(file);
        }
    }

    function addAttachmentChip(name, dataUrl, type, idx) {
        const chip = document.createElement("div");
        chip.className = "attach-chip";

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

    // ── SPEECH RECOGNITION & SYNTHESIS ──────────────
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isListening = false;
    let voiceModeActive = false;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
            isListening = true;
            micBtn.classList.add("listening");
            if (voiceModeActive) {
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
                sendVoiceMessage(final.trim());
            }
        };

        recognition.onend = () => {
            isListening = false;
            micBtn.classList.remove("listening");
        };
    }

    function loadVoices() {
        if (!window.speechSynthesis) return;
        const updateVoiceList = () => {
            const voices = window.speechSynthesis.getVoices();
            settingVoice.innerHTML = "";
            voices.forEach((v, idx) => {
                const opt = document.createElement("option");
                opt.value = idx;
                opt.textContent = `${v.name} (${v.lang})`;
                if (v.default || v.name.includes("Google") || v.name.includes("Samantha")) opt.selected = true;
                settingVoice.appendChild(opt);
            });
        };
        updateVoiceList();
        window.speechSynthesis.onvoiceschanged = updateVoiceList;
    }

    function speakText(text) {
        if (!window.speechSynthesis) return;
        const cleaned = text
            .replace(/```[\s\S]*?```/g, "code block omitted.")
            .replace(/[*_#>\[\]]/g, "").trim();
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.rate = parseFloat(settingSpeechRate.value || 1.0);
        
        const voices = window.speechSynthesis.getVoices();
        const selIdx = parseInt(settingVoice.value);
        if (!isNaN(selIdx) && voices[selIdx]) utterance.voice = voices[selIdx];

        window.speechSynthesis.speak(utterance);
    }

    voiceModeBtn.addEventListener("click", () => {
        voiceModeActive = true;
        voiceOverlay.classList.remove("hidden");
        voiceStatusText.textContent = "Tap the orb to speak";
    });
    voiceCloseBtn.addEventListener("click", () => {
        voiceModeActive = false;
        voiceOverlay.classList.add("hidden");
        if (recognition) recognition.stop();
        window.speechSynthesis && window.speechSynthesis.cancel();
    });
    voiceOrb.addEventListener("click", () => {
        if (isListening) {
            if (recognition) recognition.stop();
        } else {
            window.speechSynthesis && window.speechSynthesis.cancel();
            if (recognition) recognition.start();
        }
    });

    micBtn.addEventListener("click", () => {
        if (!recognition) return;
        if (isListening) recognition.stop(); else recognition.start();
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

    function buildContentWithAttachments(text) {
        const active = pendingAttachments.filter(a => a !== null);
        if (active.length === 0) return text || "";
        const finalText = text || "Please analyse the attached file(s).";
        const parts = [{ type: "text", text: finalText }];

        active.forEach(att => {
            if (att.type === "image") {
                parts.push({ type: "image_url", image_url: { url: att.dataUrl } });
            } else if (att.type === "text") {
                parts[0].text += "\n\n--- Attached file: " + att.name + " ---\n" + att.text;
            }
        });
        const hasImage = parts.some(p => p.type === "image_url");
        if (!hasImage) return parts[0].text;
        return parts;
    }

    // ── CREATE MESSAGE ELEMENT ──────────────────────
    function addMessageUI(content, sender, attachmentsSnapshot) {
        if (emptyState) emptyState.style.display = "none";
        const msgContainer = document.createElement("div");
        msgContainer.classList.add("message-container", sender === "user" ? "user-message" : "bot-message");

        const msgContent = document.createElement("div");
        msgContent.classList.add("message-content");

        if (sender === "bot") {
            try {
                const rawMarkup = marked.parse(content);
                msgContent.innerHTML = DOMPurify.sanitize(rawMarkup);
            } catch(err) { msgContent.innerText = content; }

            // Add action bar
            const actions = document.createElement("div");
            actions.className = "msg-actions";

            const copyBtn = document.createElement("button");
            copyBtn.className = "action-btn";
            copyBtn.innerHTML = '<i class="ph ph-copy"></i> Copy';
            copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(content);
                copyBtn.innerHTML = '<i class="ph ph-check"></i> Copied!';
                setTimeout(() => copyBtn.innerHTML = '<i class="ph ph-copy"></i> Copy', 2000);
            });

            const speakBtn = document.createElement("button");
            speakBtn.className = "action-btn";
            speakBtn.innerHTML = '<i class="ph ph-speaker-high"></i> Speak';
            speakBtn.addEventListener("click", () => speakText(content));

            const regenBtn = document.createElement("button");
            regenBtn.className = "action-btn";
            regenBtn.innerHTML = '<i class="ph ph-arrows-counter-clockwise"></i> Regenerate';
            regenBtn.addEventListener("click", () => {
                if (messageHistory.length > 0) {
                    // Remove last bot message and resend
                    if (messageHistory[messageHistory.length - 1].role === "assistant") {
                        messageHistory.pop();
                    }
                    sendMessagePayload();
                }
            });

            actions.appendChild(copyBtn);
            actions.appendChild(speakBtn);
            actions.appendChild(regenBtn);
            msgContent.appendChild(actions);

            // Add copy button to code blocks
            msgContent.querySelectorAll("pre").forEach(pre => {
                const codeBtn = document.createElement("button");
                codeBtn.className = "action-btn";
                codeBtn.style.position = "absolute";
                codeBtn.style.top = "8px";
                codeBtn.style.right = "8px";
                codeBtn.innerHTML = '<i class="ph ph-copy"></i>';
                codeBtn.addEventListener("click", () => {
                    const codeText = pre.querySelector("code") ? pre.querySelector("code").innerText : pre.innerText;
                    navigator.clipboard.writeText(codeText);
                    codeBtn.innerHTML = '<i class="ph ph-check"></i>';
                    setTimeout(() => codeBtn.innerHTML = '<i class="ph ph-copy"></i>', 2000);
                });
                pre.appendChild(codeBtn);
            });
        } else {
            if (attachmentsSnapshot && attachmentsSnapshot.length > 0) {
                attachmentsSnapshot.forEach(att => {
                    if (!att) return;
                    if (att.type === "image") {
                        const img = document.createElement("img");
                        img.src = att.dataUrl;
                        img.className = "msg-image";
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
                const p = document.createElement("p");
                p.innerText = content;
                msgContent.appendChild(p);
            }
        }

        msgContainer.appendChild(msgContent);
        chatWindow.appendChild(msgContainer);
        msgContainer.querySelectorAll("pre code").forEach(block => hljs.highlightElement(block));
        scrollToBottom();
        return msgContainer;
    }

    function showTypingIndicator() {
        const c = document.createElement("div");
        c.classList.add("message-container", "bot-message");
        c.id = "typing-indicator-container";
        c.innerHTML = '<div class="message-content"><div class="typing-indicator"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>';
        chatWindow.appendChild(c);
        scrollToBottom();
    }
    function removeTypingIndicator() {
        const el = document.getElementById("typing-indicator-container");
        if (el) el.remove();
    }

    // ── SEND MESSAGES ──────────────────────────────
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

        addMessageUI(text, "user", attachmentsSnapshot);
        messageHistory.push({ role: "user", content: messageContent });
        
        await sendMessagePayload();
    }

    async function sendMessagePayload() {
        showTypingIndicator();
        stopGenerationBar.classList.remove("hidden");
        abortController = new AbortController();

        // Selected provider and model
        const [selProvider, selModel] = modelSelect.value.split(":");
        const temperature = parseFloat(settingTemp.value || 0.8);
        const top_p = parseFloat(settingTopp.value || 0.1);

        const headers = { "Content-Type": "application/json" };
        if (jwtToken) headers["Authorization"] = "Bearer " + jwtToken;

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: headers,
                body: JSON.stringify({
                    messages: messageHistory,
                    provider: selProvider,
                    model: selModel,
                    temperature: temperature,
                    top_p: top_p
                }),
                signal: abortController.signal
            });

            removeTypingIndicator();
            stopGenerationBar.classList.add("hidden");

            const data = await response.json();
            if (!response.ok || data.error) {
                addMessageUI("**Error:** " + (data.error || "Unknown server error"), "bot");
            } else {
                addMessageUI(data.response, "bot");
                messageHistory.push({ role: "assistant", content: data.response });

                // Sync with conversation history session if logged in
                if (jwtToken) syncConversationSession();
            }
        } catch(error) {
            removeTypingIndicator();
            stopGenerationBar.classList.add("hidden");
            if (error.name === "AbortError") {
                addMessageUI("*Generation stopped by user.*", "bot");
            } else {
                addMessageUI("**Error:** Encounted issue connecting to server.", "bot");
            }
        }
    }

    async function syncConversationSession() {
        if (!jwtToken || messageHistory.length === 0) return;
        const firstUserMsg = messageHistory.find(m => m.role === "user");
        let title = "New Conversation";
        if (firstUserMsg) {
            title = typeof firstUserMsg.content === "string" ? firstUserMsg.content.slice(0, 30) : "File Conversation";
        }

        if (!currentConversationId) {
            try {
                const res = await fetch("/api/conversations", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + jwtToken
                    },
                    body: JSON.stringify({ title, messages: messageHistory })
                });
                if (res.ok) {
                    const data = await res.json();
                    currentConversationId = data.id;
                    loadConversations();
                }
            } catch(e) {}
        } else {
            try {
                await fetch(`/api/conversations/${currentConversationId}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + jwtToken
                    },
                    body: JSON.stringify({ messages: messageHistory })
                });
                loadConversations();
            } catch(e) {}
        }
    }

    async function sendVoiceMessage(text) {
        if (!text) return;
        addMessageUI(text, "user");
        messageHistory.push({ role: "user", content: text });
        sendMessagePayload().then(() => {
            const lastMsg = messageHistory[messageHistory.length - 1];
            if (lastMsg && lastMsg.role === "assistant") {
                speakText(lastMsg.content);
            }
        });
    }

    stopGenerationBtn.addEventListener("click", () => {
        if (abortController) {
            abortController.abort();
        }
    });

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
        currentConversationId = null;
        messageHistory = [];
        chatWindow.innerHTML = "";
        clearAttachments();
        window.speechSynthesis && window.speechSynthesis.cancel();
        if (emptyState) {
            chatWindow.appendChild(emptyState);
            emptyState.style.display = "flex";
        }
        loadConversations();
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
});

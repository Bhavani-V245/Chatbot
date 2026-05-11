document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const emptyState = document.getElementById('empty-state');
    const newChatBtn = document.getElementById('new-chat-btn');
    const chatWrapper = document.querySelector('.chat-wrapper');
    
    // Use basic marked.js (no custom highlight.js integration to avoid version crashes via CDN)
    try {
        if (typeof marked.setOptions === 'function') {
            marked.setOptions({ breaks: true });
        }
    } catch(e) { console.warn('marked config error', e); }

    let messageHistory = [];

    // Auto-resize textarea
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        
        // Toggle send button state
        if (this.value.trim().length > 0) {
            sendBtn.classList.remove('disabled');
        } else {
            sendBtn.classList.add('disabled');
        }
    });

    function scrollToBottom() {
        chatWrapper.scrollTo({
            top: chatWrapper.scrollHeight,
            behavior: 'smooth'
        });
    }

    function createMessageElement(content, sender) {
        const msgContainer = document.createElement('div');
        msgContainer.classList.add('message-container');
        msgContainer.classList.add(sender === 'user' ? 'user-message' : 'bot-message');

        const msgContent = document.createElement('div');
        msgContent.classList.add('message-content');
        
        if (sender === 'bot') {
            try {
                // Parse Markdown for bot, sanitize it with DOMPurify
                const rawMarkup = marked.parse(content);
                const cleanMarkup = DOMPurify.sanitize(rawMarkup);
                msgContent.innerHTML = cleanMarkup;
            } catch (err) {
                console.error("Markdown parsing failed:", err);
                msgContent.innerText = content;
            }
        } else {
            // Escape user input to prevent XSS, preserve newlines
            const textNode = document.createTextNode(content);
            const p = document.createElement('p');
            p.appendChild(textNode);
            // Replace newlines with <br>
            p.innerHTML = p.innerHTML.replace(/\n/g, '<br>');
            msgContent.appendChild(p);
        }

        msgContainer.appendChild(msgContent);

        return msgContainer;
    }

    function addMessage(content, sender) {
        if (emptyState) {
            emptyState.style.display = 'none';
        }

        const msgElement = createMessageElement(content, sender);
        chatWindow.appendChild(msgElement);
        
        // Highlight code blocks inside the new message
        msgElement.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

        scrollToBottom();
    }

    function showTypingIndicator() {
        const indicatorContainer = document.createElement('div');
        indicatorContainer.classList.add('message-container', 'bot-message');
        indicatorContainer.id = 'typing-indicator-container';

        const msgContent = document.createElement('div');
        msgContent.classList.add('message-content');
        
        const indicator = document.createElement('div');
        indicator.classList.add('typing-indicator');
        indicator.innerHTML = `
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        `;
        
        msgContent.appendChild(indicator);
        indicatorContainer.appendChild(msgContent);
        
        chatWindow.appendChild(indicatorContainer);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator-container');
        if (indicator) {
            indicator.remove();
        }
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        // Reset input
        chatInput.value = '';
        chatInput.style.height = 'auto';
        sendBtn.classList.add('disabled');

        // Add user message to UI
        addMessage(text, 'user');
        
        // Add to history
        messageHistory.push({ role: 'user', content: text });

        showTypingIndicator();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ messages: messageHistory }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            removeTypingIndicator();

            let data;
            try {
                data = await response.json();
            } catch (e) {
                throw new Error('Failed to parse server response');
            }
            
            if (!response.ok || data.error) {
                const errMsg = data.error || 'Unknown server error';
                addMessage(`**Error:** ${errMsg}`, 'bot');
            } else {
                addMessage(data.response, 'bot');
                messageHistory.push({ role: 'assistant', content: data.response });
            }
            
        } catch (error) {
            removeTypingIndicator();
            if (error.name === 'AbortError') {
                addMessage('**Error:** The request timed out. The server or AI model is taking too long to respond.', 'bot');
            } else {
                addMessage('**Error:** Sorry, I encountered an issue connecting to the server.', 'bot');
            }
            console.error('Error:', error);
        }
    }

    sendBtn.addEventListener('click', (e) => {
        if (!sendBtn.classList.contains('disabled')) {
            sendMessage();
        }
    });

    chatInput.addEventListener('keydown', (e) => {
        // Send on Enter (without Shift)
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.classList.contains('disabled')) {
                sendMessage();
            }
        }
    });

    // New chat button functionality
    newChatBtn.addEventListener('click', () => {
        messageHistory = [];
        chatWindow.innerHTML = '';
        if (emptyState) {
            chatWindow.appendChild(emptyState);
            emptyState.style.display = 'flex';
        }
    });

    // Handle recommendation clicks
    document.querySelectorAll('.rec-card').forEach(card => {
        card.addEventListener('click', () => {
            const h4 = card.querySelector('h4').innerText;
            const p = card.querySelector('p').innerText;
            chatInput.value = `${h4} ${p}`;
            
            // Trigger auto-resize
            chatInput.style.height = 'auto';
            chatInput.style.height = (chatInput.scrollHeight) + 'px';
            
            // Enable and send
            sendBtn.classList.remove('disabled');
            sendMessage();
        });
    });
});

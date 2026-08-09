# AI Assistant

A beautifully designed, premium full-screen conversational AI web application. This project uses a Flask backend to connect to the **GitHub Models Inference API**, natively powering the chat experience with the `DeepSeek-R1` model.

## ✨ Features

- **Premium UI/UX:** A stunning dark mode interface with glassmorphism effects, a vibrant animated AI logo, and smooth transitions.
- **Interactive Suggestions:** Clickable recommendation cards to instantly get started with common tasks.
- **Markdown & Syntax Highlighting:** Fully supports rendering Markdown responses and beautifully highlights code blocks.
- **Auto-expanding Input:** The chat input automatically resizes to accommodate multi-line messages (use `Shift+Enter` for a new line).
- **Graceful Error Handling:** Built-in timeouts and error displays to prevent infinite loading if the API connection fails.

## 🛠️ Technology Stack

- **Backend:** Python, Flask, Azure AI Inference SDK
- **Frontend:** Vanilla HTML5, CSS3, JavaScript
- **Libraries:** `marked.js` (Markdown parsing), `DOMPurify` (XSS prevention), `highlight.js` (Code syntax highlighting), Phosphor Icons.

## 🚀 Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/YourUsername/YourRepoName.git
cd YourRepoName
```

### 2. Create a virtual environment
```bash
python -m venv env
# On Windows:
env\Scripts\activate
# On Mac/Linux:
source env/bin/activate
```

### 3. Install dependencies
```bash
pip install flask azure-ai-inference azure-core python-dotenv
```

### 4. Configure your Environment Variables
Create a `.env` file in the root directory of the project and add your GitHub Personal Access Token (no special scopes are required):
```env
GITHUB_TOKEN=ghp_your_github_personal_access_token_here
```
*(Note: Never commit your `.env` file to version control. It is already included in the `.gitignore`)*

### 5. Run the Application
Start the Flask development server:
```bash
python app.py
```
Open your web browser and navigate to **http://127.0.0.1:5000**

## 🔧 Troubleshooting

- **`Unauthorized` Error:** Your `GITHUB_TOKEN` is missing, expired, or invalid. Generate a new classic Personal Access Token from GitHub Developer Settings.
- **`Too Many Requests`:** The GitHub Models API is rate-limiting your token. Wait a few minutes before sending another request.

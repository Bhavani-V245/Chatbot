import os
from flask import Flask, render_template, request, jsonify
from azure.ai.inference import ChatCompletionsClient
from azure.ai.inference.models import SystemMessage, UserMessage, AssistantMessage
from azure.core.credentials import AzureKeyCredential
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, template_folder='../templates', static_folder='../static')

endpoint = "https://models.inference.ai.azure.com"
model = "gpt-4o-mini"
token = os.environ.get("GITHUB_TOKEN")

if not token:
    print("Warning: GITHUB_TOKEN environment variable is not set.")

client = None
if token:
    client = ChatCompletionsClient(
        endpoint=endpoint,
        credential=AzureKeyCredential(token),
        retry_total=0,
        connection_timeout=10,
        read_timeout=10
    )

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    client_messages = data.get("messages", [])
    
    # We will construct the messages for the Azure AI client
    messages = [SystemMessage("You are a helpful assistant.")]
    
    for msg in client_messages:
        role = msg.get("role")
        content = msg.get("content")
        if role == "user":
            messages.append(UserMessage(content))
        elif role == "assistant":
            messages.append(AssistantMessage(content))
            
    try:
        if not client:
            return jsonify({"error": "GITHUB_TOKEN is missing or invalid. Please configure your .env file."}), 500

        response = client.complete(
            messages=messages,
            temperature=0.8,
            top_p=0.1,
            max_tokens=2048,
            model=model
        )
        bot_response = response.choices[0].message.content
        return jsonify({"response": bot_response})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)

import os
from flask import Flask, render_template, request, jsonify
from azure.ai.inference import ChatCompletionsClient
from azure.ai.inference.models import (
    SystemMessage, UserMessage, AssistantMessage,
    ImageContentItem, TextContentItem, ImageUrl
)
from azure.core.credentials import AzureKeyCredential
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, template_folder='../templates', static_folder='../static')

endpoint = "https://models.inference.ai.azure.com"
model = "gpt-4o-mini"

def build_user_message(content):
    """Build a UserMessage supporting both plain text and multimodal (image + text) content."""
    if isinstance(content, str):
        return UserMessage(content)

    # content is a list of {type, text} or {type, image_url: {url}}
    parts = []
    for item in content:
        if item.get("type") == "text":
            parts.append(TextContentItem(text=item["text"]))
        elif item.get("type") == "image_url":
            url = item.get("image_url", {}).get("url", "")
            parts.append(ImageContentItem(image_url=ImageUrl(url=url)))
    return UserMessage(content=parts)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/chat", methods=["GET", "POST"])
def chat():
    if request.method == "GET":
        return jsonify({"message": "Chat endpoint expects POST with JSON payload"}), 200

    data = request.json
    client_messages = data.get("messages", [])

    messages = [SystemMessage(
        "You are a helpful assistant. When the user shares an image, describe and analyse it. "
        "When they share file contents, read and assist with them."
    )]

    for msg in client_messages:
        role = msg.get("role")
        content = msg.get("content")
        if role == "user":
            messages.append(build_user_message(content))
        elif role == "assistant":
            messages.append(AssistantMessage(content if isinstance(content, str) else str(content)))

    try:
        token = os.environ.get("GITHUB_TOKEN")
        if not token:
            return jsonify({"error": "GITHUB_TOKEN is missing or invalid. Please configure your .env file or Vercel Environment Variables."}), 500

        client = ChatCompletionsClient(
            endpoint=endpoint,
            credential=AzureKeyCredential(token),
            retry_total=0
        )

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


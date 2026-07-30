import sys
import os

# Ensure project root is in sys.path so 'providers' module resolves correctly
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import datetime
import random
import jwt
import traceback
from functools import wraps
from flask import Flask, render_template, request, jsonify
from flask_mail import Mail, Message

from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient
from bson import ObjectId
from providers.factory import ProviderFactory



from azure.ai.inference import ChatCompletionsClient
from azure.ai.inference.models import (
    SystemMessage, UserMessage, AssistantMessage,
    ImageContentItem, TextContentItem, ImageUrl
)
from azure.core.credentials import AzureKeyCredential
from dotenv import load_dotenv

# override=False ensures Vercel real env vars are NOT overwritten by local .env
load_dotenv(override=False)

app = Flask(__name__, template_folder='../templates', static_folder='../static')

# --- Flask-Mail Configuration ---
app.config['MAIL_SERVER'] = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT'] = int(os.environ.get('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.environ.get('MAIL_USE_TLS', 'True').lower() in ['true', '1', 't']
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME', '').strip()
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD', '').strip()

mail = Mail(app)


# --- MongoDB Database Setup ---
mongo_uri = os.environ.get("MONGO_URI", "")
db = None
users_collection = None
history_collection = None
conversations_collection = None
settings_collection = None

if mongo_uri and "<username>" not in mongo_uri and "cluster0" in mongo_uri:
    try:
        mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        db = mongo_client.get_default_database("chatbot_db")
        users_collection = db["users"]
        history_collection = db["chat_history"]
        conversations_collection = db["conversations"]
        settings_collection = db["settings"]
    except Exception as e:
        print(f"MongoDB Warning: Failed to connect to MongoDB: {e}")


endpoint = "https://models.inference.ai.azure.com"
model = "gpt-4o-mini"

# --- Authorization Decorator ---
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if "Authorization" in request.headers:
            auth_header = request.headers["Authorization"]
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]

        if not token:
            return jsonify({"error": "Authorization token is missing!"}), 401

        try:
            secret = os.environ.get("JWT_SECRET", "fallback_secret_key")
            data = jwt.decode(token, secret, algorithms=["HS256"])
            current_user = None
            if users_collection is not None:
                try:
                    current_user = users_collection.find_one({"email": data.get("email")})
                except Exception:
                    pass
            
            if not current_user:
                current_user = {"email": data.get("email")}
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired!"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token!"}), 401


        return f(current_user, *args, **kwargs)
    return decorated

def build_user_message(content):
    if isinstance(content, str):
        return UserMessage(content)
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

@app.route("/check-token")
def check_token():
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        return jsonify({
            "status": "Token Found",
            "token_preview": token[:10] + "...",
            "mongo_connected": db is not None
        })
    return jsonify({
        "status": "Token Missing",
        "env_keys": [k for k in os.environ.keys()],
        "mongo_connected": db is not None
    })

# --- Authentication Endpoints ---
@app.route("/api/signup", methods=["POST"])
def signup():
    if users_collection is None:
        return jsonify({"error": "MongoDB is not configured yet. Please set MONGO_URI in .env"}), 500

    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "").strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    try:
        if users_collection.find_one({"email": email}):
            return jsonify({"error": "User already exists with this email"}), 400

        hashed_pw = generate_password_hash(password)
        user_doc = {
            "email": email,
            "password": hashed_pw,
            "role": "user",
            "created_at": datetime.datetime.utcnow()
        }
        users_collection.insert_one(user_doc)
        return jsonify({"message": "User registered successfully!"}), 201
    except Exception as e:
        return jsonify({"error": f"Database operation failed: {str(e)}"}), 500

@app.route("/api/login", methods=["POST"])
def login():
    if users_collection is None:
        return jsonify({"error": "MongoDB is not configured yet. Please set MONGO_URI in .env"}), 500

    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "").strip()

    try:
        user = users_collection.find_one({"email": email})
        if not user or not check_password_hash(user["password"], password):
            return jsonify({"error": "Invalid email or password"}), 401

        secret = os.environ.get("JWT_SECRET", "fallback_secret_key")
        payload = {
            "email": user["email"],
            "role": user.get("role", "user"),
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }
        token = jwt.encode(payload, secret, algorithm="HS256")
        return jsonify({
            "message": "Login successful",
            "token": token,
            "email": user["email"],
            "role": user.get("role", "user")
        }), 200
    except Exception as e:
        return jsonify({"error": f"Database operation failed: {str(e)}"}), 500

@app.route("/api/me", methods=["GET"])

@token_required
def get_me(current_user):
    return jsonify({
        "email": current_user.get("email"),
        "role": current_user.get("role", "user")
    })

@app.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()

    if not email:
        return jsonify({"error": "Email is required"}), 400

    otp = str(random.randint(100000, 999999))

    if users_collection is not None:
        user = users_collection.find_one({"email": email})
        if not user:
            return jsonify({"error": "User with this email does not exist"}), 404
        
        users_collection.update_one(
            {"email": email},
            {"$set": {
                "otp": otp,
                "otp_expiry": datetime.datetime.utcnow() + datetime.timedelta(minutes=5)
            }}
        )

    try:
        msg = Message(
            "Password Reset OTP",
            sender=app.config['MAIL_USERNAME'],
            recipients=[email]
        )
        msg.body = f"Your Password Reset OTP is {otp}. It is valid for 5 minutes."
        mail.send(msg)
        return jsonify({"message": "Password reset OTP sent to your email!"}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to send email: {str(e)}"}), 500

@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    otp = data.get("otp", "").strip()
    new_password = data.get("new_password", "").strip()

    if not email or not otp or not new_password:
        return jsonify({"error": "Email, OTP, and new_password are required"}), 400

    if users_collection is None:
        return jsonify({"error": "MongoDB is not connected"}), 500

    user = users_collection.find_one({"email": email})
    if not user:
        return jsonify({"error": "User not found"}), 404

    stored_otp = user.get("otp")
    otp_expiry = user.get("otp_expiry")

    if not stored_otp or stored_otp != otp:
        return jsonify({"error": "Invalid OTP"}), 400

    if otp_expiry and datetime.datetime.utcnow() > otp_expiry:
        return jsonify({"error": "OTP has expired"}), 400

    hashed_pw = generate_password_hash(new_password)
    users_collection.update_one(
        {"email": email},
        {"$set": {"password": hashed_pw}, "$unset": {"otp": "", "otp_expiry": ""}}
    )
    return jsonify({"message": "Password reset successful! You can now login with your new password."}), 200


# --- Conversation History Management Endpoints ---
@app.route("/api/conversations", methods=["GET", "POST", "DELETE"])
def handle_conversations():
    auth_header = request.headers.get("Authorization", "")
    user_email = "anonymous"
    if auth_header.startswith("Bearer "):
        try:
            tok = auth_header.split(" ")[1]
            decoded = jwt.decode(tok, os.environ.get("JWT_SECRET", "fallback_secret_key"), algorithms=["HS256"])
            user_email = decoded.get("email", "anonymous")
        except Exception:
            pass

    if conversations_collection is None:
        return jsonify({"conversations": [], "message": "MongoDB not connected"}), 200

    if request.method == "GET":
        convs = list(conversations_collection.find({"user_email": user_email}).sort("updated_at", -1))
        result = []
        for c in convs:
            result.append({
                "id": str(c["_id"]),
                "title": c.get("title", "New Conversation"),
                "messages_count": len(c.get("messages", [])),
                "created_at": c.get("created_at").isoformat() if isinstance(c.get("created_at"), datetime.datetime) else str(c.get("created_at")),
                "updated_at": c.get("updated_at").isoformat() if isinstance(c.get("updated_at"), datetime.datetime) else str(c.get("updated_at"))
            })
        return jsonify({"conversations": result}), 200

    elif request.method == "POST":
        data = request.get_json() or {}
        title = data.get("title", "New Conversation").strip()
        messages = data.get("messages", [])
        now = datetime.datetime.utcnow()
        doc = {
            "user_email": user_email,
            "title": title,
            "messages": messages,
            "created_at": now,
            "updated_at": now
        }
        res = conversations_collection.insert_one(doc)
        return jsonify({"id": str(res.inserted_id), "title": title, "messages": messages}), 201

    elif request.method == "DELETE":
        conversations_collection.delete_many({"user_email": user_email})
        return jsonify({"message": "All conversations deleted successfully"}), 200

@app.route("/api/conversations/<id>", methods=["GET", "PATCH", "DELETE"])
def handle_single_conversation(id):
    auth_header = request.headers.get("Authorization", "")
    user_email = "anonymous"
    if auth_header.startswith("Bearer "):
        try:
            tok = auth_header.split(" ")[1]
            decoded = jwt.decode(tok, os.environ.get("JWT_SECRET", "fallback_secret_key"), algorithms=["HS256"])
            user_email = decoded.get("email", "anonymous")
        except Exception:
            pass

    if conversations_collection is None:
        return jsonify({"error": "MongoDB not connected"}), 500

    try:
        obj_id = ObjectId(id)
    except Exception:
        return jsonify({"error": "Invalid conversation ID"}), 400

    conv = conversations_collection.find_one({"_id": obj_id, "user_email": user_email})
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404

    if request.method == "GET":
        return jsonify({
            "id": str(conv["_id"]),
            "title": conv.get("title", "New Conversation"),
            "messages": conv.get("messages", []),
            "created_at": str(conv.get("created_at")),
            "updated_at": str(conv.get("updated_at"))
        }), 200

    elif request.method == "PATCH":
        data = request.get_json() or {}
        update_fields = {"updated_at": datetime.datetime.utcnow()}
        if "title" in data:
            update_fields["title"] = data["title"].strip()
        if "messages" in data:
            update_fields["messages"] = data["messages"]
        
        conversations_collection.update_one({"_id": obj_id}, {"$set": update_fields})
        return jsonify({"message": "Conversation updated successfully"}), 200

    elif request.method == "DELETE":
        conversations_collection.delete_one({"_id": obj_id})
        return jsonify({"message": "Conversation deleted successfully"}), 200


# --- User Profile & Settings Endpoints ---
@app.route("/api/profile", methods=["GET", "PUT"])
@token_required
def handle_profile(current_user):
    user_email = current_user["email"]
    if request.method == "GET":
        return jsonify({
            "email": current_user.get("email"),
            "display_name": current_user.get("display_name", user_email.split("@")[0]),
            "photo_url": current_user.get("photo_url", ""),
            "role": current_user.get("role", "user"),
            "created_at": current_user.get("created_at").isoformat() if isinstance(current_user.get("created_at"), datetime.datetime) else str(current_user.get("created_at", ""))
        }), 200

    elif request.method == "PUT":
        data = request.get_json() or {}
        update_data = {}
        if "display_name" in data:
            update_data["display_name"] = data["display_name"].strip()
        if "photo_url" in data:
            update_data["photo_url"] = data["photo_url"].strip()

        if users_collection is not None and update_data:
            users_collection.update_one({"email": user_email}, {"$set": update_data})

        return jsonify({"message": "Profile updated successfully"}), 200

@app.route("/api/profile/change-password", methods=["PUT"])
@token_required
def change_password(current_user):
    data = request.get_json() or {}
    old_pw = data.get("old_password", "").strip()
    new_pw = data.get("new_password", "").strip()

    if not old_pw or not new_pw:
        return jsonify({"error": "old_password and new_password are required"}), 400

    if not check_password_hash(current_user["password"], old_pw):
        return jsonify({"error": "Incorrect current password"}), 401

    hashed_pw = generate_password_hash(new_pw)
    if users_collection is not None:
        users_collection.update_one({"email": current_user["email"]}, {"$set": {"password": hashed_pw}})

    return jsonify({"message": "Password updated successfully!"}), 200

@app.route("/api/profile/delete-account", methods=["DELETE"])
@token_required
def delete_account(current_user):
    user_email = current_user["email"]
    if users_collection is not None:
        users_collection.delete_one({"email": user_email})
    if conversations_collection is not None:
        conversations_collection.delete_many({"user_email": user_email})
    return jsonify({"message": "Account deleted successfully"}), 200

@app.route("/api/settings", methods=["GET", "PUT"])
@token_required
def handle_settings(current_user):
    user_email = current_user["email"]
    if settings_collection is None:
        return jsonify({
            "theme": "system",
            "provider": "github",
            "model": "gpt-4o-mini",
            "temperature": 0.8,
            "top_p": 0.1
        }), 200

    if request.method == "GET":
        st = settings_collection.find_one({"user_email": user_email}) or {}
        return jsonify({
            "theme": st.get("theme", "system"),
            "provider": st.get("provider", "github"),
            "model": st.get("model", "gpt-4o-mini"),
            "temperature": st.get("temperature", 0.8),
            "top_p": st.get("top_p", 0.1),
            "voice_enabled": st.get("voice_enabled", True)
        }), 200

    elif request.method == "PUT":
        data = request.get_json() or {}
        fields = {
            "theme": data.get("theme", "system"),
            "provider": data.get("provider", "github"),
            "model": data.get("model", "gpt-4o-mini"),
            "temperature": float(data.get("temperature", 0.8)),
            "top_p": float(data.get("top_p", 0.1)),
            "voice_enabled": bool(data.get("voice_enabled", True))
        }
        settings_collection.update_one(
            {"user_email": user_email},
            {"$set": fields},
            upsert=True
        )
        return jsonify({"message": "Settings saved successfully"}), 200

@app.route("/api/export-data", methods=["GET"])
@token_required
def export_data(current_user):
    user_email = current_user["email"]
    convs = []
    if conversations_collection is not None:
        raw_convs = list(conversations_collection.find({"user_email": user_email}))
        for c in raw_convs:
            convs.append({
                "id": str(c["_id"]),
                "title": c.get("title", "New Conversation"),
                "messages": c.get("messages", []),
                "created_at": str(c.get("created_at")),
                "updated_at": str(c.get("updated_at"))
            })
    return jsonify({
        "user": user_email,
        "export_date": datetime.datetime.utcnow().isoformat(),
        "conversations": convs
    }), 200


# --- Protected Chat Endpoint ---


@app.route("/api/chat", methods=["GET", "POST"])
def chat():
    if request.method == "GET":
        return jsonify({"message": "Chat endpoint expects POST with JSON payload"}), 200

    data = request.json or {}
    client_messages = data.get("messages", [])
    provider_name = data.get("provider", "github")
    model_name = data.get("model", "gpt-4o-mini")
    temperature = data.get("temperature", 0.8)
    top_p = data.get("top_p", 0.1)

    options = {
        "model_name": model_name,
        "temperature": temperature,
        "top_p": top_p
    }

    try:
        provider = ProviderFactory.get_provider(provider_name)
        bot_response = provider.generate_response(client_messages, options)

        # Save conversation log to MongoDB if connected
        if history_collection is not None:
            auth_header = request.headers.get("Authorization", "")
            user_email = "anonymous"
            if auth_header.startswith("Bearer "):
                try:
                    tok = auth_header.split(" ")[1]
                    decoded = jwt.decode(tok, os.environ.get("JWT_SECRET", "fallback_secret_key"), algorithms=["HS256"])
                    user_email = decoded.get("email", "anonymous")
                except Exception:
                    pass

            history_collection.insert_one({
                "user_email": user_email,
                "provider": provider_name,
                "model": model_name,
                "messages": client_messages,
                "bot_response": bot_response,
                "timestamp": datetime.datetime.utcnow()
            })

        return jsonify({"response": bot_response})
    except Exception as e:
        traceback.print_exc()
        print("ERROR:", repr(e))
        return jsonify({"error": str(e)}), 500



if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)



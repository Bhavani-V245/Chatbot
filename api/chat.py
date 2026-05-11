import os
from azure.ai.inference import ChatCompletionsClient
from azure.ai.inference.models import SystemMessage, UserMessage, AssistantMessage
from azure.core.credentials import AzureKeyCredential
from dotenv import load_dotenv

load_dotenv()


endpoint = "https://models.inference.ai.azure.com"
model = "DeepSeek-R1"
token = os.environ["GITHUB_TOKEN"]

client = ChatCompletionsClient(
    endpoint=endpoint,
    credential=AzureKeyCredential(token),
)

import sys
sys.stdout.reconfigure(encoding='utf-8')

messages = [
    SystemMessage("You are a helpful assistant.")
]

print("Chatbot initialized! Type 'quit' or 'exit' to stop.")
print("-" * 50)

while True:
    user_input = input("\nYou: ")
    if user_input.lower() in ["quit", "exit", "q"]:
        print("Goodbye!")
        break
        
    messages.append(UserMessage(user_input))

    try:
        response = client.complete(
            messages=messages,
            temperature=0.8,
            top_p=0.1,
            max_tokens=2048,
            model=model
        )
        
        bot_response = response.choices[0].message.content
        print(f"\nBot: {bot_response}")
        
        messages.append(AssistantMessage(bot_response))
    except Exception as e:
        print(f"\nAn error occurred: {e}")

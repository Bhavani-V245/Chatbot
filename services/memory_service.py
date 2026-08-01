import datetime

class MemoryService:
    def __init__(self, db):
        self.db = db
        self.collection = db.memory if db is not None else None

    def process_memory_intent(self, user_email: str, message: str) -> str:
        if self.collection is None:
            return None
            
        msg_lower = message.strip().lower()
        
        # 1. View Memory
        if msg_lower in ["what do you remember about me?", "view memory", "show memory"]:
            memories = list(self.collection.find({"user_email": user_email}))
            if not memories:
                return "I don't have any specific memories saved for you yet."
            
            res = "Here is what I remember about you:\n"
            for idx, m in enumerate(memories):
                res += f"{idx + 1}. {m['fact']}\n"
            return res

        # 2. Remember
        if msg_lower.startswith("remember "):
            fact = message[len("remember "):].strip()
            # Check if it exists
            existing = self.collection.find_one({"user_email": user_email, "fact": fact})
            if not existing:
                self.collection.insert_one({
                    "user_email": user_email,
                    "fact": fact,
                    "timestamp": datetime.datetime.utcnow()
                })
            return f"Got it! I will remember: '{fact}'"

        # 3. Forget
        if msg_lower.startswith("forget "):
            fact = message[len("forget "):].strip()
            result = self.collection.delete_many({"user_email": user_email, "fact": {"$regex": fact, "$options": "i"}})
            if result.deleted_count > 0:
                return f"I have forgotten information related to: '{fact}'"
            else:
                return f"I couldn't find any memory about '{fact}' to forget."
                
        # 4. Update (implicit via forget then remember, or explicit)
        if msg_lower.startswith("update memory "):
            # naive implementation: forget old, remember new
            # "update memory old_fact to new_fact"
            parts = message[len("update memory "):].split(" to ", 1)
            if len(parts) == 2:
                old_fact, new_fact = parts
                self.collection.delete_many({"user_email": user_email, "fact": {"$regex": old_fact.strip(), "$options": "i"}})
                self.collection.insert_one({
                    "user_email": user_email,
                    "fact": new_fact.strip(),
                    "timestamp": datetime.datetime.utcnow()
                })
                return f"Memory updated to: '{new_fact}'"
                
        return None

    def get_memory_context(self, user_email: str) -> str:
        if self.collection is None:
            return ""
            
        memories = list(self.collection.find({"user_email": user_email}))
        if not memories:
            return ""
            
        context = "Here are some persistent facts you should remember about the user:\n"
        for m in memories:
            context += f"- {m['fact']}\n"
            
        return context

import os
import time
import requests
import uuid

class ImageProvider:
    def generate_image(self, prompt: str, save_dir: str) -> str:
        raise NotImplementedError

class PollinationsProvider(ImageProvider):
    def generate_image(self, prompt: str, save_dir: str) -> str:
        import urllib.parse
        encoded_prompt = urllib.parse.quote(prompt)
        url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&nologo=true"
        
        filename = f"img_{int(time.time())}_{uuid.uuid4().hex[:6]}.jpg"
        file_path = os.path.join(save_dir, filename)
        
        response = requests.get(url, stream=True, timeout=30)
        if response.status_code == 200:
            with open(file_path, 'wb') as f:
                for chunk in response.iter_content(1024):
                    f.write(chunk)
            return filename
        else:
            raise Exception(f"Failed to generate image. Status: {response.status_code}")

class ImageService:
    def __init__(self):
        self.provider = PollinationsProvider()
        
    def generate(self, prompt: str, project_root: str) -> dict:
        save_dir = os.path.join(project_root, "storage", "generated_images")
        os.makedirs(save_dir, exist_ok=True)
        
        filename = self.provider.generate_image(prompt, save_dir)
        
        return {
            "filename": filename,
            "path": f"/storage/generated_images/{filename}",
            "prompt": prompt,
            "provider": "pollinations.ai",
            "timestamp": time.time()
        }

import os
import json
import traceback

class FileParser:
    """
    Modular File Parser Service for extracting text from various document formats.
    """
    
    @staticmethod
    def parse_file(file_path: str, filename: str) -> str:
        """
        Detects file type by extension and delegates to the appropriate parser.
        Returns the extracted text.
        """
        ext = os.path.splitext(filename)[1].lower()
        
        try:
            if ext == '.pdf':
                return FileParser.parse_pdf(file_path)
            elif ext in ['.docx', '.doc']:
                return FileParser.parse_docx(file_path)
            elif ext in ['.csv']:
                return FileParser.parse_csv(file_path)
            elif ext in ['.xlsx', '.xls']:
                return FileParser.parse_xlsx(file_path)
            elif ext == '.json':
                return FileParser.parse_json(file_path)
            elif ext in ['.txt', '.md', '.py', '.js', '.html', '.css', '.java', '.cpp', '.c', '.go', '.rs']:
                return FileParser.parse_text(file_path)
            else:
                return f"Unsupported file format: {ext}"
        except Exception as e:
            traceback.print_exc()
            return f"Error parsing {filename}: {str(e)}"

    @staticmethod
    def parse_pdf(file_path: str) -> str:
        try:
            import fitz  # PyMuPDF
            text = ""
            with fitz.open(file_path) as doc:
                for page in doc:
                    text += page.get_text() + "\n"
            return text.strip()
        except ImportError:
            return "PyMuPDF not installed. Cannot parse PDF."
            
    @staticmethod
    def parse_docx(file_path: str) -> str:
        try:
            import docx
            doc = docx.Document(file_path)
            return "\n".join([para.text for para in doc.paragraphs])
        except ImportError:
            return "python-docx not installed. Cannot parse DOCX."

    @staticmethod
    def parse_csv(file_path: str) -> str:
        try:
            import pandas as pd
            df = pd.read_csv(file_path)
            return df.to_string()
        except ImportError:
            return "pandas not installed. Cannot parse CSV."

    @staticmethod
    def parse_xlsx(file_path: str) -> str:
        try:
            import pandas as pd
            df = pd.read_excel(file_path)
            return df.to_string()
        except ImportError:
            return "pandas/openpyxl not installed. Cannot parse XLSX."

    @staticmethod
    def parse_json(file_path: str) -> str:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return json.dumps(data, indent=2)

    @staticmethod
    def parse_text(file_path: str) -> str:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()

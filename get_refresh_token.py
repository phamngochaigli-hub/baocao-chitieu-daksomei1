"""Lấy refresh_token Google Drive (chạy 1 lần trên máy tính cá nhân).

1. Vào https://console.cloud.google.com -> tạo project -> bật "Google Drive API".
2. "APIs & Services" -> "OAuth consent screen": chọn External, thêm email của bạn vào Test users
   (sau đó bấm "Publish app" để refresh_token không hết hạn sau 7 ngày).
3. "Credentials" -> "Create credentials" -> "OAuth client ID" -> loại "Desktop app"
   -> tải file JSON, đổi tên thành client_secret.json, đặt cạnh file này.
4. Chạy:  pip install google-auth-oauthlib  &&  python get_refresh_token.py
5. Đăng nhập Google, chép đoạn [google_oauth] in ra vào .streamlit/secrets.toml
"""

import json
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/drive"]

path = sys.argv[1] if len(sys.argv) > 1 else "client_secret.json"
flow = InstalledAppFlow.from_client_secrets_file(path, SCOPES)
creds = flow.run_local_server(port=0, access_type="offline", prompt="consent")

print("\n# Dán đoạn sau vào .streamlit/secrets.toml\n")
print("[google_oauth]")
print(f"client_id = {json.dumps(creds.client_id)}")
print(f"client_secret = {json.dumps(creds.client_secret)}")
print(f"refresh_token = {json.dumps(creds.refresh_token)}")

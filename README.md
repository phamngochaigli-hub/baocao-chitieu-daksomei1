# baocao-chitieu-daksomei1
pnh

## 1. App báo cáo chỉ tiêu
`streamlit run APP1.PY`

## 2. App lưu trữ văn bản trên Google Drive (`app_luutru.py`)

Chức năng:
- **Tải lên** file mọi định dạng (PDF, Word, Excel, ảnh, ZIP, ...) vào một thư mục Google Drive, kèm
  **trích yếu nội dung**, số ký hiệu, ngày ban hành, loại văn bản, cơ quan ban hành, ghi chú.
  File được giữ nguyên bản gốc; trích yếu được ghi vào mục *Mô tả* của file trên Drive.
- **Tìm kiếm** theo trích yếu nội dung: gõ có dấu hay không dấu, hoa hay thường đều được
  (VD `ke hoach kinh te` tìm ra "Kế hoạch phát triển kinh tế"). Lọc thêm theo loại văn bản, năm ban hành.
  Tuỳ chọn tìm cả nội dung bên trong file bằng bộ tìm kiếm toàn văn của Google Drive.
- **Xuất file** tìm được: tải từng file về máy, tải tất cả kết quả thành 1 file ZIP,
  xuất danh sách kết quả ra Excel, hoặc mở trực tiếp trên Google Drive.

### Cài đặt
```bash
pip install -r requirements.txt
cp .streamlit/secrets.toml.example .streamlit/secrets.toml   # rồi điền thông tin
streamlit run app_luutru.py
```

### Kết nối Google Drive (tài khoản Gmail cá nhân)
1. Vào https://console.cloud.google.com, tạo project, bật **Google Drive API**.
2. *OAuth consent screen*: chọn External, thêm email của bạn vào *Test users*, sau đó **Publish app**
   (nếu để chế độ Testing, refresh token hết hạn sau 7 ngày).
3. *Credentials → Create credentials → OAuth client ID → Desktop app*, tải JSON về,
   đổi tên `client_secret.json`.
4. Trên máy tính: `python get_refresh_token.py`, đăng nhập Google, chép đoạn `[google_oauth]`
   in ra vào `.streamlit/secrets.toml` (hoặc mục *Secrets* của Streamlit Cloud).
5. (Tuỳ chọn) đặt `DRIVE_FOLDER_ID` là ID thư mục Drive muốn dùng; nếu bỏ trống app tự tạo
   thư mục `LuuTruVanBan`.

Lưu ý: service account chỉ dùng được với **Shared Drive** (Google Workspace) vì service account
không có dung lượng lưu trữ riêng — xem `secrets.toml.example`.

Không đưa `secrets.toml` và `client_secret.json` lên GitHub (đã có trong `.gitignore`).

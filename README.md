# baocao-chitieu-daksomei1

| Ứng dụng | Tệp chạy | Mô tả |
|---|---|---|
| Giao việc và theo dõi nhiệm vụ từ văn bản — **bản Google Apps Script (khuyến nghị: dễ cài đặt nhất)** | `google_apps_script/` | Không cần máy chủ: dán 2 tệp vào Google Sheet, dữ liệu nằm trong Sheet và Drive. Xem [google_apps_script/HUONG_DAN.md](google_apps_script/HUONG_DAN.md). |
| Giao việc và theo dõi nhiệm vụ từ văn bản — bản Python/Streamlit | `app_nhiemvu.py` | Văn bản mới → AI đọc → xác định nhiệm vụ → phân công → đặt hạn → theo dõi → cảnh báo → tạo báo cáo → kiểm duyệt. Dữ liệu lưu trên Google Drive. Xem [HUONG_DAN.md](HUONG_DAN.md). |
| Báo cáo chỉ tiêu 2026–2030 | `APP1.PY` | Nhập và theo dõi chỉ tiêu theo năm. |

```bash
pip install -r requirements.txt
streamlit run app_nhiemvu.py
```

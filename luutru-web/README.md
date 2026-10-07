# Web app Lưu trữ văn bản (Google Drive)

Chạy trên **Google Apps Script**: miễn phí, không cần máy chủ, người dùng **đăng nhập bằng tài khoản Google**.

## Chức năng
- **Tải lên** file mọi định dạng (PDF, Word, Excel, PowerPoint, ảnh scan, ZIP…), kéo thả nhiều file cùng lúc.
  File được lưu nguyên bản gốc vào một thư mục Google Drive dùng chung.
- **Tự động trích xuất** ngay khi tải lên: trích yếu, số ký hiệu, ngày ban hành, loại văn bản,
  cơ quan ban hành và **tóm tắt nội dung**. File PDF/ảnh scan được Google Drive nhận dạng chữ (OCR tiếng Việt).
  - Mặc định: trích theo thể thức văn bản hành chính (dòng "V/v…", dòng dưới tên loại văn bản…).
  - Nếu cấu hình khoá Claude AI: trích yếu và tóm tắt chính xác hơn, kể cả văn bản không theo thể thức.
  - Kết quả có thể **sửa lại** ngay trên thẻ văn bản.
- **Danh mục** lưu trong Google Sheet "Danh mục văn bản lưu trữ" (cùng thư mục), mở/xuất Excel được.
- **Tìm kiếm** theo trích yếu, gõ có dấu hay không dấu đều được; lọc theo loại văn bản và năm;
  tuỳ chọn tìm cả trong nội dung file.
- Mỗi kết quả hiển thị trích yếu, thông tin văn bản, **tóm tắt nội dung ở bên dưới**, nút **Tải file về** và **Xem trên Drive**.
- Người tải lên (hoặc quản trị viên) được sửa, xoá văn bản của mình (file vào thùng rác Drive).

## Cài đặt (khoảng 10 phút)
1. Vào https://script.google.com → **Dự án mới**, đặt tên "Lưu trữ văn bản".
2. Tạo các file và dán nội dung tương ứng từ thư mục này:
   `Code.gs`, `TrichXuat.gs` (Tệp → + → Tập lệnh) và `Index.html`, `Styles.html`, `Script.html` (+ → HTML).
3. **Cài đặt dự án** (biểu tượng bánh răng) → tích *Hiển thị tệp kê khai "appsscript.json"*,
   rồi dán nội dung `appsscript.json`.
4. Chọn hàm `caiDat` → **Chạy** → cấp quyền. Xem **Nhật ký thực thi** để lấy link thư mục và Google Sheet.
5. **Chia sẻ thư mục `LuuTruVanBan`** với quyền **Người chỉnh sửa** cho từng cán bộ được dùng app.
6. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**:
   - Thực thi với tư cách: **Người dùng truy cập ứng dụng web**
   - Người có quyền truy cập: **Bất kỳ ai có Tài khoản Google**
   → Triển khai, gửi đường link `/exec` cho cán bộ.

Lần đầu mở app, mỗi người cần bấm **Cho phép** quyền truy cập Google Drive (nếu thấy "Google chưa xác minh ứng dụng
này" thì bấm *Nâng cao → Đi tới Lưu trữ văn bản*; đây là app nội bộ của chính đơn vị).

### Thuộc tính tập lệnh (Cài đặt dự án → Thuộc tính tập lệnh)
| Thuộc tính | Ý nghĩa |
|---|---|
| `FOLDER_ID`, `SHEET_ID` | Do `caiDat()` tự tạo, không cần sửa |
| `ADMIN_EMAILS` | Email quản trị (cách nhau dấu phẩy): được sửa/xoá mọi văn bản |
| `ALLOWED_EMAILS` | (Tuỳ chọn) chỉ những email này được dùng app. Bỏ trống = ai được chia sẻ thư mục đều dùng được |
| `CLAUDE_API_KEY` | (Tuỳ chọn) khoá API từ https://console.anthropic.com để AI trích yếu và tóm tắt |
| `CLAUDE_MODEL` | (Tuỳ chọn) mặc định `claude-opus-5-5` |

## Lưu ý
- Tải qua web tối đa **35 MB/file** (giới hạn của Apps Script). File lớn hơn: tải thẳng vào thư mục Drive
  rồi bấm **Quét file mới trong thư mục** trong app để lập danh mục.
- OCR của Google Drive với PDF scan dài chỉ đọc một số trang đầu; trích yếu nằm ở trang đầu nên vẫn lấy được.
- File thuộc quyền sở hữu của người tải lên nhưng nằm trong thư mục dùng chung. Khi cán bộ nghỉ việc,
  chủ thư mục nên chuyển quyền sở hữu các file của họ.
- Khi dùng Claude AI, nội dung văn bản được gửi tới Anthropic để phân tích; không bật nếu văn bản mật.

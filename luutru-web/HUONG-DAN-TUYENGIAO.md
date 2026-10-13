# App lưu trữ công tác Tuyên giáo — hướng dẫn cài đặt

App dùng **cùng bộ file** với app lưu trữ chung và app HĐND, nhưng cài thành **một dự án Apps Script riêng**:
**link riêng, thư mục Drive riêng (`LuuTru_TuyenGiao`), Google Sheet riêng, danh sách người dùng riêng**.
Các app độc lập hoàn toàn, người dùng app này không thấy hồ sơ của app kia.

## Chức năng
- **Tải lên** file mọi định dạng (PDF, Word, Excel, PowerPoint, ảnh scan, ảnh, video, ZIP…), kéo thả nhiều file.
- **Tự động trích xuất** trích yếu, số ký hiệu (cả dạng của Đảng như `12-KH/ĐU`), ngày ban hành, loại văn bản, cơ quan ban hành,
  tóm tắt nội dung, **nhóm hồ sơ**, **chuyên đề/sự kiện** và **nhiệm kỳ/giai đoạn**. PDF và ảnh scan được nhận dạng chữ tiếng Việt.
- **Tìm kiếm** theo trích yếu (có dấu hay không dấu đều được), lọc theo nhóm hồ sơ, chuyên đề/sự kiện, loại văn bản, năm.
- **Tải file về** kèm tóm tắt nội dung bên dưới; sửa, xóa hồ sơ của mình; danh mục lưu ở Google Sheet.

### 15 nhóm hồ sơ
1. Văn kiện, nghị quyết, chỉ thị của Đảng
2. Hướng dẫn, chỉ đạo của cấp trên
3. Kế hoạch, chương trình công tác tuyên giáo
4. Học tập, quán triệt nghị quyết
5. Đề cương, tài liệu tuyên truyền
6. Sinh hoạt chi bộ, thông tin nội bộ
7. Báo cáo viên, tuyên truyền viên
8. Nắm bắt tình hình tư tưởng, dư luận xã hội
9. Đấu tranh, phản bác quan điểm sai trái
10. Báo chí, truyền thông, thông tin cơ sở
11. Giáo dục lý luận chính trị
12. Học tập và làm theo tư tưởng, đạo đức, phong cách Hồ Chí Minh
13. Báo cáo, thống kê
14. Hình ảnh, video, tư liệu tuyên truyền (file ảnh, video tự vào nhóm này)
15. Khác

Hai trường phụ: **Chuyên đề, sự kiện** (VD "Kỷ niệm 80 năm Ngày Quốc khánh 2/9", "Chuyên đề: học tập năm 2026") và
**Nhiệm kỳ, giai đoạn** (VD "2025-2030"). Nhận dạng tự động chỉ là gợi ý, nếu sai bấm **Sửa thông tin** để chọn lại,
hoặc **chọn sẵn Nhóm hồ sơ và Chuyên đề** trước khi thả file ở tab Tải lên.

## Cài đặt từng bước
**Bước 1.** Vào https://script.google.com → **Dự án mới** → đặt tên `Lưu trữ công tác Tuyên giáo`.

**Bước 2.** Dán 5 file (giống hệt app HĐND và app chung, không sửa gì):
`Code.gs` (đã có sẵn, xóa nội dung mặc định rồi dán), `Index.html`, `Styles.html`, `Script.html` (bấm **+** → **HTML**, đặt tên không gõ đuôi),
và `appsscript.json` (bánh răng ⚙️ → tích **Hiển thị tệp kê khai "appsscript.json"** → mở file và dán).
**Bắt buộc có dòng `"runtimeVersion": "V8"`** trong `appsscript.json`, nếu không sẽ báo lỗi Rhino.

**Bước 3.** Mở `Code.gs`, chọn hàm **`caiDatTuyenGiao`** (không phải `caiDat`) → **▶ Chạy** → cấp quyền
(**Xem xét quyền → Nâng cao → Đi tới … → tích hết các ô quyền → Cho phép**). Nhật ký phải ghi:
```
Loại app: Lưu trữ công tác Tuyên giáo (PROFILE=TUYENGIAO)
Thư mục lưu trữ: https://drive.google.com/drive/folders/...
Danh mục: https://docs.google.com/spreadsheets/d/...
```
Nếu ghi PROFILE khác, vào **Cài đặt dự án → Thuộc tính tập lệnh**, đặt `PROFILE` = `TUYENGIAO`, xóa `FOLDER_ID` và `SHEET_ID`, chạy lại `caiDatTuyenGiao`.

**Bước 4.** Thuộc tính tập lệnh (Cài đặt dự án ⚙️ → Thêm thuộc tính → Lưu):
| Thuộc tính | Giá trị | Ghi chú |
|---|---|---|
| `ADMIN_EMAILS` | email của bạn | được sửa, xóa mọi hồ sơ |
| `ALLOWED_EMAILS` | email cán bộ Tuyên giáo, báo cáo viên, người được dùng | **chỉ những email này vào được app**; nhiều email cách nhau dấu phẩy |
| `CLAUDE_API_KEY` | (tuỳ chọn) | AI trích yếu, tóm tắt chính xác hơn. **Không bật** nếu hồ sơ có nội dung nhạy cảm, vì nội dung sẽ gửi tới Anthropic |

**Bước 5.** Chia sẻ thư mục `LuuTru_TuyenGiao` (Drive → chuột phải → Chia sẻ) cho đúng những người đó với quyền **Người chỉnh sửa**
(hoặc **Người xem** nếu chỉ cần tra cứu). Giữ "Quyền truy cập chung" là **Bị hạn chế**.

**Bước 6.** **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**: *Thực thi với tư cách* **Người dùng truy cập ứng dụng web**,
*Người có quyền truy cập* **Bất kỳ ai có Tài khoản Google** → **Triển khai** → sao chép URL đuôi `/exec`. Rút gọn bằng TinyURL (VD `tuyengiao-daksomei`).

**Bước 7.** Thử: mở link, tab **Tải lên văn bản**, chọn Nhóm hồ sơ và gõ Chuyên đề, thả một file mẫu, rồi tìm lại ở tab Tìm kiếm.

## Gợi ý sử dụng
- Đặt chuyên đề, sự kiện theo từng đợt tuyên truyền (kỷ niệm, đại hội, chiến dịch…) để một lần chọn là lọc ra toàn bộ tài liệu liên quan.
- Hình ảnh, video hoạt động tuyên truyền: thả thẳng vào app, tự vào nhóm "Hình ảnh, video, tư liệu"; ghi chú ngày, nội dung ở trường Sửa thông tin.
- File lớn hơn 35 MB: tải thẳng vào thư mục Drive rồi bấm **Quét file mới trong thư mục**.

## Lưu ý quan trọng
- **Không đưa văn bản có độ mật lên app.** Tài liệu nội bộ của Đảng cần theo quy định về quản lý, lưu trữ và đưa lên dịch vụ đám mây của cấp có thẩm quyền; hãy hỏi lại bộ phận văn phòng, văn thư trước khi dùng.
- App là kho số hóa để tra cứu; hồ sơ gốc vẫn lập, bảo quản và nộp lưu theo quy định.
- Chỉ để mình bạn (hoặc người thật tin cậy) có quyền **sửa dự án Apps Script**; cán bộ dùng app không cần quyền này.
- Tài khoản làm chủ dự án nên là tài khoản bền vững của cơ quan.

## Cập nhật code và sự cố
Dán lại file mới rồi **Triển khai → Quản lý hoạt động triển khai → bút chì ✏️ → Phiên bản mới → Triển khai**; link giữ nguyên, dữ liệu không mất.
| Hiện tượng | Cách xử lý |
|---|---|
| Lỗi Rhino | Thiếu `"runtimeVersion": "V8"` trong `appsscript.json`; sửa rồi tạo phiên bản triển khai mới |
| "App chưa được cài đặt" | Chạy `caiDatTuyenGiao` |
| "Truy cập bị từ chối: DriveApp" | Gỡ quyền app ở myaccount.google.com/permissions, cấp lại và tích đủ các ô quyền |
| "Tài khoản … chưa được cấp quyền" | Thêm email vào `ALLOWED_EMAILS` và chia sẻ thư mục |
| Vẫn thấy "Lưu trữ văn bản" hoặc nhãn "Kỳ họp" | Thiếu `PROFILE=TUYENGIAO`, hoặc chưa tạo phiên bản triển khai mới |
| `... is not defined` | Dán thiếu nội dung `Code.gs`, kiểm tra có đủ 5 file |

App Tuyên giáo hiện chưa có tab Trợ lý AI (soạn thảo đề cương, báo cáo bằng Gemini). Có thể bổ sung khi cần.

## Sửa lỗi chữ lạ khi tóm tắt file Word, Excel, PowerPoint (bản cập nhật 10/2026)
Bản code cũ đọc nhầm file Word (`.docx`), Excel (`.xlsx`) và PowerPoint (`.pptx`) như file nhị phân, nên trích yếu và tóm tắt hiện ký tự lạ.
Bản mới đã sửa. Với các văn bản **đã lưu bị lỗi**:
- **Từng văn bản:** bấm nút **🔄 Trích xuất lại** trên thẻ văn bản (chỉ người tải lên hoặc quản trị viên). Thông tin đã sửa tay của văn bản đó sẽ bị thay bằng kết quả đọc lại.
- **Hàng loạt:** trong Apps Script mở `Code.gs`, chọn hàm **`trichXuatLaiTatCa`** → **▶ Chạy**. Hàm chỉ động tới các văn bản có chữ hỏng và giữ nguyên các văn bản khác. Nhật ký ghi số văn bản đã xử lý; nếu còn sót thì chạy lại.


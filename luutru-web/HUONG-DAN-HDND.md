# App lưu trữ công tác HĐND xã — hướng dẫn cài đặt

App này dùng **cùng bộ file** với app lưu trữ văn bản chung, nhưng chạy thành **một dự án Apps Script riêng**,
nên có **link riêng, thư mục Drive riêng (`LuuTru_HDND`), Google Sheet riêng và danh sách người dùng riêng**.
App chung và app HĐND độc lập hoàn toàn: người trong app này không thấy hồ sơ của app kia.

## Khác gì so với app chung
| | App chung | App HĐND |
|---|---|---|
| Tên, thư mục Drive | Lưu trữ văn bản · `LuuTruVanBan` | Lưu trữ công tác HĐND · `LuuTru_HDND` |
| Nhóm hồ sơ | không | 11 nhóm (bảng dưới), tự nhận dạng khi tải lên |
| Kỳ họp, nhiệm kỳ | không | tự nhận dạng từ nội dung ("Kỳ họp thứ 3", "nhiệm kỳ 2026 - 2031"); chọn sẵn được khi tải lên |
| Loại văn bản | danh sách chung | thêm Báo cáo thẩm tra, Dự thảo nghị quyết, Giấy triệu tập, Tổng hợp ý kiến cử tri, Danh sách đại biểu |
| Bộ lọc tìm kiếm | loại, năm | thêm **Nhóm hồ sơ** và **Kỳ họp** |

### 11 nhóm hồ sơ
1. Nghị quyết HĐND
2. Kỳ họp HĐND (chương trình, giấy triệu tập, tài liệu, biên bản, báo cáo trình kỳ họp)
3. Hoạt động Thường trực HĐND
4. Hoạt động các Ban của HĐND (báo cáo thẩm tra, kế hoạch, báo cáo của Ban)
5. Giám sát, khảo sát
6. Tiếp xúc cử tri, kiến nghị cử tri
7. Chất vấn, trả lời chất vấn
8. Hoạt động của đại biểu HĐND
9. Văn bản chỉ đạo, hướng dẫn của cấp trên
10. Tờ trình, báo cáo của UBND và cơ quan
11. Khác

Nhận dạng tự động chỉ là gợi ý ban đầu. Nếu sai, bấm **Sửa thông tin** trên thẻ văn bản để chọn lại nhóm, kỳ họp, nhiệm kỳ.

## Trợ lý AI (Gemini): soạn thảo, phân tích, báo cáo
App HĐND có thêm tab **🤖 Trợ lý AI** (chỉ hiện khi đã cấu hình `GEMINI_API_KEY`, xem phần "Bật Trợ lý AI" bên dưới).

| Chế độ | Làm được gì |
|---|---|
| ✍️ **Soạn thảo** | Soạn Nghị quyết, Kế hoạch, Quyết định, Tờ trình, Chương trình kỳ họp, Thông báo, Giấy mời, Giấy triệu tập, Công văn, Biên bản, Kết luận, Diễn văn/phát biểu theo thể thức văn bản hành chính (phần đầu, căn cứ, các điều, nơi nhận, chữ ký) |
| 🔍 **Phân tích** | Hỏi đáp, so sánh, tổng hợp trên các hồ sơ đã chọn: các ý kiến cử tri, nội dung các nghị quyết, số liệu... Trả lời có dẫn nguồn [TL1], [TL2] và nêu rõ phần tài liệu không đề cập |
| 📊 **Lập báo cáo** | Báo cáo kết quả kỳ họp; tổng hợp ý kiến, kiến nghị cử tri; hoạt động của Thường trực HĐND; kết quả giám sát, khảo sát; báo cáo thẩm tra; báo cáo công tác HĐND |

**Cách dùng:** chọn chế độ → chọn loại → nhập yêu cầu → (tuỳ chọn) chọn **tài liệu tham khảo từ kho**: tìm và tích từng tài liệu,
hoặc lấy tất cả theo **Kỳ họp / Nhóm hồ sơ** → bấm nút. Kết quả hiện như văn bản; sau đó có thể:
- **Chỉnh sửa** bằng lời ("rút gọn Điều 2", "thêm căn cứ", "viết lại mục III trang trọng hơn");
- **Sao chép** (giữ định dạng) để dán vào Word;
- **Tạo Google Docs** (lưu trong thư mục con `BanThao_AI` của kho) để biên tập tiếp.

Chỗ AI không có thông tin (số tờ trình, căn cứ pháp lý, ngày tháng...) được **đánh dấu vàng `[CẦN BỔ SUNG: ...]`** thay vì tự bịa;
ghi chú dành cho người soạn hiện ở dưới văn bản. Mức chi tiết **Tóm tắt** nhanh và tiết kiệm; **Toàn văn** chính xác hơn nhưng chậm hơn và tốn hơn.

## Cài đặt từng bước

### Bước 1. Tạo dự án Apps Script mới
1. Vào https://script.google.com (đăng nhập tài khoản sẽ làm chủ app HĐND).
2. Bấm **Dự án mới (New project)**.
3. Bấm vào chữ **"Dự án chưa đặt tên"** ở góc trên bên trái, đổi tên thành `Lưu trữ công tác HĐND`.

Đây là dự án thứ hai, không động tới dự án app chung.

### Bước 2. Dán 5 file (giống hệt app chung, không sửa gì)
| File | Cách tạo |
|---|---|
| `Code.gs` | đã có sẵn, xóa nội dung mặc định rồi dán |
| `Index.html` | bấm **+** cạnh "Tệp" → **HTML**, đặt tên `Index` |
| `Styles.html` | **+** → **HTML**, đặt tên `Styles` |
| `Script.html` | **+** → **HTML**, đặt tên `Script` |
| `appsscript.json` | bấm bánh răng ⚙️ → tích **Hiển thị tệp kê khai "appsscript.json"** → quay lại trình chỉnh sửa, mở file và dán |

Mỗi file: mở file nguồn bằng Notepad → **Ctrl + A**, **Ctrl + C** → vào file tương ứng trong Apps Script → **Ctrl + A**, **Delete**, **Ctrl + V**, **Ctrl + S**.
Đặt tên file **không gõ đuôi** `.gs`, `.html`; đúng chữ hoa chữ thường.

### Bước 3. Chạy hàm `caiDatHDND` (không phải `caiDat`)
1. Mở file `Code.gs`. Ở ô chọn hàm trên thanh công cụ, chọn **`caiDatHDND`**.
2. Bấm **▶ Chạy**. Lần đầu sẽ hỏi quyền: **Xem xét quyền** → chọn tài khoản → **Nâng cao** → **Đi tới … (không an toàn)** → **Cho phép**.
3. Mở **Nhật ký thực thi**, phải thấy:
   ```
   Loại app: Lưu trữ công tác HĐND (PROFILE=HDND)
   Thư mục lưu trữ: https://drive.google.com/drive/folders/...
   Danh mục: https://docs.google.com/spreadsheets/d/...
   ```
   Nếu dòng đầu ghi "Lưu trữ văn bản (PROFILE=CHUNG)" nghĩa là bạn chạy nhầm `caiDat`. Vào **Cài đặt dự án → Thuộc tính tập lệnh**,
   thêm `PROFILE` = `HDND`, xóa hai dòng `FOLDER_ID` và `SHEET_ID`, rồi chạy lại `caiDatHDND`.
4. Kiểm tra trong Google Drive đã có thư mục **LuuTru_HDND** và bên trong có sổ **Danh mục hồ sơ công tác HĐND**.

### Bước 4. Đặt thuộc tính (Cài đặt dự án ⚙️ → Thuộc tính tập lệnh → Thêm thuộc tính → Lưu)
| Thuộc tính | Giá trị | Ghi chú |
|---|---|---|
| `PROFILE` | `HDND` | tự có sau bước 3 |
| `ADMIN_EMAILS` | email của bạn (và Chánh Văn phòng nếu cần) | được sửa, xóa mọi hồ sơ |
| `ALLOWED_EMAILS` | email Thường trực, các Ban, đại biểu, cán bộ giúp việc HĐND | **chỉ những email này vào được app**; nhiều email cách nhau dấu phẩy |
| `CLAUDE_API_KEY` | khóa Claude (tuỳ chọn) | AI nhận dạng nhóm hồ sơ, kỳ họp chính xác hơn. Dùng khóa riêng nếu muốn tính chi phí riêng. Không bật nếu có văn bản mật |

### Bước 5. Chia sẻ thư mục cho đúng người
Drive → chuột phải thư mục **LuuTru_HDND** → **Chia sẻ** → thêm email người dùng, quyền **Người chỉnh sửa** → **Gửi**.
Giữ "Quyền truy cập chung" là **Bị hạn chế**. Chỉ chia sẻ cho những người trong `ALLOWED_EMAILS`.

### Bước 6. Triển khai và lấy link riêng
1. **Triển khai → Tùy chọn triển khai mới → biểu tượng bánh răng → Ứng dụng web**.
2. Mô tả: `HĐND v1`. **Thực thi với tư cách: Người dùng truy cập ứng dụng web**. **Người có quyền truy cập: Bất kỳ ai có Tài khoản Google**.
3. **Triển khai** → sao chép dòng **URL** đuôi `/exec`. Đó là link riêng của app HĐND.
4. Rút gọn bằng https://tinyurl.com với tên như `hdnd-daksomei` để dễ nhớ (xem hướng dẫn rút gọn link).

### Bước 7. Thử nghiệm
1. Mở link, thấy tiêu đề **Lưu trữ công tác HĐND** và các bộ lọc **Nhóm hồ sơ**, **Kỳ họp**.
2. Vào tab **Tải lên văn bản**, chọn **Nhóm hồ sơ** = `Nghị quyết HĐND`, gõ **Kỳ họp** = `Kỳ họp thứ 1`, rồi thả một file nghị quyết mẫu.
3. Kiểm tra thẻ kết quả: trích yếu, số ký hiệu, nhóm hồ sơ, kỳ họp, tóm tắt. Tìm lại bằng từ khóa ở tab **Tìm kiếm & tải file**.

## Cách dùng hằng ngày (gợi ý)
- **Tải theo kỳ họp:** trước khi thả file, chọn sẵn **Nhóm hồ sơ** và gõ **Kỳ họp**. Mọi file thả vào sau đó mang nhóm và kỳ họp đã chọn,
  còn trích yếu, số ký hiệu, ngày ban hành vẫn tự trích xuất. Để **Tự động nhận dạng** khi tải hỗn hợp.
- **Một kỳ họp nên có đủ:** giấy triệu tập, chương trình, báo cáo và tờ trình, báo cáo thẩm tra của các Ban, dự thảo nghị quyết, nghị quyết đã thông qua, biên bản, ý kiến cử tri.
- **Tìm nhanh:** chọn Kỳ họp = `Kỳ họp thứ 3` và gõ từ khóa trích yếu như `ngân sách`, `đất đai`, `giao thông`.
- **Scan:** PDF scan rõ nét (200–300 dpi) thì nhận dạng chữ tốt, trích yếu chính xác hơn.
- **Cuối mỗi kỳ họp:** mở Google Sheet danh mục, lọc theo kỳ họp để lập danh mục hồ sơ.

## Lưu ý quan trọng
- App là **kho số hóa để tra cứu**. Hồ sơ gốc vẫn được lập, bảo quản và nộp lưu theo quy định về công tác lưu trữ của cơ quan.
- **Không đưa văn bản có độ mật** lên app, và không bật `CLAUDE_API_KEY` nếu hồ sơ có nội dung nhạy cảm.
- Khi có đại biểu hoặc cán bộ thay đổi: sửa `ALLOWED_EMAILS`, thu hồi quyền chia sẻ thư mục. Khi bàn giao nhiệm kỳ mới,
  chuyển quyền sở hữu thư mục và các file về tài khoản của cơ quan.
- Tài khoản làm chủ dự án nên là tài khoản bền vững của cơ quan (không phải của cá nhân sắp nghỉ hoặc luân chuyển).

## Cập nhật code về sau
Dán lại file mới vào đúng dự án rồi **Triển khai → Quản lý hoạt động triển khai → bút chì ✏️ → Phiên bản mới → Triển khai**. Link giữ nguyên.
Có thể cập nhật app chung lên cùng bộ code; sổ danh mục cũ tự thêm 3 cột mới (Nhóm hồ sơ, Kỳ họp, Nhiệm kỳ) và hoạt động như trước.

## Xử lý sự cố
| Hiện tượng | Cách xử lý |
|---|---|
| Mở link vẫn thấy "Lưu trữ văn bản", không có Nhóm hồ sơ | Thiếu `PROFILE=HDND` ở Thuộc tính tập lệnh, hoặc chưa tạo phiên bản triển khai mới |
| "Tài khoản … chưa được cấp quyền" | Thêm email vào `ALLOWED_EMAILS` |
| "App chưa được cài đặt" | Chạy `caiDatHDND` |
| Nhóm hồ sơ gán sai | Bấm **Sửa thông tin** chọn lại, hoặc chọn nhóm trước khi tải lên |
| `... is not defined` | Thiếu file hoặc dán thiếu nội dung `Code.gs`; kiểm tra có đủ 5 file |

## Bật Trợ lý AI (Gemini)
1. Lấy khoá API tại https://aistudio.google.com/apikey (đăng nhập tài khoản Google, bấm **Create API key**).
2. **Quan trọng về dữ liệu:** với gói miễn phí, Google có thể dùng nội dung gửi lên để cải tiến sản phẩm và nhân sự có thể đọc;
   gói trả phí (bật thanh toán cho dự án chứa khoá) thì Google cam kết không dùng nội dung để huấn luyện. Hồ sơ công tác HĐND nên dùng khoá **gói trả phí**;
   kiểm tra điều khoản hiện hành của Google trước khi dùng. Không đưa văn bản có độ mật vào Trợ lý AI.
3. Vào **Cài đặt dự án ⚙️ → Thuộc tính tập lệnh**, thêm:

| Thuộc tính | Giá trị | Ghi chú |
|---|---|---|
| `GEMINI_API_KEY` | khoá vừa lấy | **bắt buộc**; có khoá thì tab Trợ lý AI mới hiện |
| `TEN_XA` | VD `Đak Sơmei` | tự điền "HỘI ĐỒNG NHÂN DÂN XÃ ĐAK SƠMEI" và địa danh vào bản thảo |
| `GEMINI_MODEL` | (tuỳ chọn) tên mô hình | bỏ trống thì app tự hỏi Google và chọn mô hình **flash** mới nhất đang dùng được |
| `GEMINI_LOAI` | (tuỳ chọn) `pro` | ưu tiên mô hình pro: chất lượng cao hơn nhưng chậm và tốn hơn |
| `GEMINI_GIOI_HAN` | (tuỳ chọn) số, mặc định 40 | số lượt AI tối đa mỗi người mỗi ngày (quản trị viên không bị giới hạn) |

4. Mở `Code.gs`, chọn hàm **`kiemTraGemini`** → **▶ Chạy**. Nhật ký phải ghi "Mô hình được chọn: …" và câu trả lời của Gemini.
   Nếu báo lỗi, đọc nội dung lỗi (khoá sai, chưa bật API, hết hạn mức...).
5. Dán `Code.gs`, `Index.html`, `Styles.html`, `Script.html` bản mới, rồi **Triển khai → Quản lý hoạt động triển khai → bút chì ✏️ → Phiên bản mới → Triển khai**. Mở link, thấy tab **🤖 Trợ lý AI**.

**Lưu ý:** mỗi lượt gọi có thể mất 30–90 giây; bản thảo dài mà bị ngắt thì chọn "Tóm tắt", giảm số tài liệu tham khảo hoặc bấm "Chỉnh sửa" để yêu cầu viết tiếp.
Tên mô hình của Google thay đổi theo thời gian; nếu tính năng báo "không tìm thấy mô hình", chạy `kiemTraGemini` hoặc đặt `GEMINI_MODEL`.

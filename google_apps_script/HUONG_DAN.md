# Hệ thống giao việc và theo dõi nhiệm vụ — phiên bản Google Apps Script

Bản này chạy hoàn toàn trên Google, **không cần máy chủ, không cần cài phần mềm**:

- **Dữ liệu** nằm trong một Google Sheet, có thể mở ra xem, lọc, in ngay.
- **Văn bản gốc và báo cáo đã duyệt** nằm trong một thư mục Google Drive.
- **Người dùng** chỉ cần mở một đường link trên máy tính hoặc điện thoại.

```
Văn bản mới → AI đọc → xác định nhiệm vụ → phân công cơ quan/cá nhân → đặt hạn
→ theo dõi → cảnh báo (kèm email nhắc việc tự động 7 giờ sáng) → tạo báo cáo → cán bộ kiểm duyệt
```

---

## Cài đặt (khoảng 10 phút, làm một lần)

### Bước 1. Tạo Google Sheet và dán mã

1. Vào <https://sheets.new> để tạo một bảng tính mới, đặt tên, ví dụ: **Sổ theo dõi nhiệm vụ**.
2. Chọn menu **Tiện ích mở rộng → Apps Script**.
3. Trong tệp `Mã.gs` (hoặc `Code.gs`) đang mở: xóa hết nội dung có sẵn, rồi dán toàn bộ nội dung tệp **`Code.gs`**.
4. Bấm dấu **＋** cạnh chữ *Tệp* → **HTML**, đặt tên đúng là **`Index`** (không gõ đuôi `.html`). Xóa nội dung có sẵn, rồi dán toàn bộ nội dung tệp **`Index.html`**.
5. Bấm biểu tượng 💾 **Lưu dự án**.
6. Bấm ⚙️ **Cài đặt dự án** → mục *Múi giờ*, chọn **(GMT+07:00) Hà Nội**.

### Bước 2. Chạy cài đặt lần đầu

1. Quay lại tab Google Sheet và tải lại trang (F5). Trên thanh menu xuất hiện mục **📋 Nhiệm vụ**.
2. Chọn **📋 Nhiệm vụ → 1. Cài đặt lần đầu**.
3. Google sẽ hỏi cấp quyền: chọn tài khoản → **Nâng cao** → **Đi tới … (không an toàn)** → **Cho phép**.
   (Cảnh báo này xuất hiện vì mã do chính anh/chị tạo, chưa qua kiểm duyệt của Google. Mã chỉ truy cập Sheet, Drive, Gmail của tài khoản anh/chị.)
4. Chạy lại **1. Cài đặt lần đầu** một lần nữa sau khi cấp quyền, rồi nhập:
   - tên cơ quan, ví dụ: *UBND xã Đăk Sơmei*;
   - mật khẩu cho tài khoản quản trị **`quantri`**.

Bước này tự động:

- tạo các trang tính `CauHinh`, `NguoiDung`, `DonVi`, `VanBan`, `NhiemVu`, `LichSu`, `BaoCao`;
- tạo thư mục Drive **«Hệ thống nhiệm vụ - …»**, gồm hai thư mục con *Văn bản gốc* và *Báo cáo đã duyệt*, rồi chuyển bảng tính vào đó;
- nạp danh mục đơn vị mẫu;
- hẹn giờ gửi email nhắc việc lúc 7 giờ sáng hằng ngày.

### Bước 3. Nhập khóa AI (Claude)

1. Đăng ký và tạo khóa API tại <https://console.anthropic.com> (mục *API Keys*). Khóa bắt đầu bằng `sk-ant-`.
2. Trong Google Sheet, chọn **📋 Nhiệm vụ → 2. Nhập khóa API Claude**, rồi dán khóa vào.

Khóa được cất trong *Thuộc tính tập lệnh*, không hiện trên bảng tính.

> Chưa có khóa vẫn dùng được, nhưng có hai hạn chế:
> - chỉ đọc được tệp DOCX/TXT, không đọc được PDF;
> - nhiệm vụ được gợi ý bằng quy tắc đơn giản, nên cán bộ cần rà soát kỹ hơn.

### Bước 4. Khai báo đơn vị và người dùng

1. **Trang `DonVi`** — sửa danh sách cơ quan, đơn vị cho đúng thực tế. Cột *Email nhận nhắc việc* dùng để gửi email cảnh báo cho từng đơn vị.
2. **Trang `NguoiDung`** — mỗi người một dòng:

| Tên đăng nhập | Họ tên | Vai trò | Đơn vị | Email |
|---|---|---|---|---|
| chuyenvien | Trần Thị B | `chuyen_vien` | | b@… |
| lanhdao | Lê Văn C | `can_bo_duyet` | | c@… |
| phongkinhte | Phòng Kinh tế | `don_vi` | Phòng Kinh tế | pkt@… |

   - Cột **Vai trò** nhận một trong bốn giá trị: `quan_tri`, `chuyen_vien`, `can_bo_duyet`, `don_vi`.
   - Với vai trò `don_vi`, cột **Đơn vị** phải ghi **đúng tên** như ở trang `DonVi`.
   - Để trống cột *Mật khẩu*; mật khẩu được đặt ở bước 3 dưới đây.
3. Đặt mật khẩu cho từng người: **📋 Nhiệm vụ → 3. Đặt mật khẩu cho người dùng**.

### Bước 5. Triển khai thành ứng dụng web

1. Trong cửa sổ Apps Script, bấm **Triển khai → Tùy chọn triển khai mới**.
2. Bấm ⚙️ cạnh *Chọn loại* → **Ứng dụng web**, rồi chọn:
   - *Thực thi dưới dạng*: **Tôi** (tài khoản của anh/chị);
   - *Người có quyền truy cập*: **Bất kỳ ai**. Nếu cơ quan dùng Google Workspace, có thể chọn *Bất kỳ ai trong tổ chức*.
3. Bấm **Triển khai** và sao chép **URL ứng dụng web**. Có thể xem lại URL bất cứ lúc nào qua menu **📋 Nhiệm vụ → Mở ứng dụng**.
4. Gửi URL đó cho cán bộ và các đơn vị. Mỗi người đăng nhập bằng tên và mật khẩu đã cấp.

> **Khi sửa mã về sau:** vào **Triển khai → Quản lý các bản triển khai → ✏️ → Phiên bản: Phiên bản mới → Triển khai**. Làm như vậy thì URL được giữ nguyên.

---

## Sử dụng

| Bước | Màn hình | Ai làm | Thao tác |
|---|---|---|---|
| 1–3 | 📥 Văn bản mới | Chuyên viên | Chọn tệp PDF/DOCX/TXT → **AI đọc văn bản**. AI điền số hiệu, trích yếu, cơ quan ban hành, tóm tắt và lập danh sách nhiệm vụ, mỗi nhiệm vụ kèm **trích dẫn nguyên văn** để đối chiếu. |
| 4–5 | 📥 Văn bản mới | Chuyên viên | Sửa nội dung; chọn **đơn vị chủ trì** (bắt buộc), phối hợp, cá nhân; đặt **hạn xử lý**; thêm hoặc xóa dòng → **Giao nhiệm vụ**. Văn bản gốc được lưu vào Drive. |
| 6 | 📊 Theo dõi | Đơn vị, chuyên viên | Bấm vào một nhiệm vụ để cập nhật trạng thái, % tiến độ và kết quả. Chỉ chuyên viên được điều chỉnh hạn. Mọi thay đổi được ghi ở trang `LichSu`. |
| 7 | ⏰ Cảnh báo | Tự động | Đỏ: quá hạn. Vàng: còn ≤ 3 ngày (đổi số ngày tại `CauHinh` → `SO_NGAY_BAO_TRUOC`). Email nhắc việc gửi lúc 7 giờ sáng cho từng đơn vị, kèm bản tổng hợp cho quản trị và chuyên viên. |
| 8 | 📝 Lập báo cáo | Chuyên viên | Chọn kỳ, đơn vị → **Tạo bản nháp** (AI soạn từ số liệu thật) → chỉnh sửa → **Gửi duyệt**. |
| 9 | ✅ Kiểm duyệt | Cán bộ kiểm duyệt | Đọc báo cáo → **Duyệt** (tạo bản **Google Docs** theo thể thức hành chính, lưu vào thư mục *Báo cáo đã duyệt*) hoặc **Yêu cầu chỉnh sửa** kèm ý kiến. |

Quyền của từng vai trò:

| Vai trò | Được dùng |
|---|---|
| `quan_tri` | Tất cả các màn hình, menu cài đặt trong Google Sheet |
| `chuyen_vien` | Văn bản mới, Theo dõi (toàn bộ), Cảnh báo, Lập báo cáo |
| `can_bo_duyet` | Theo dõi, Cảnh báo, Kiểm duyệt |
| `don_vi` | Chỉ thấy nhiệm vụ đơn vị mình chủ trì hoặc phối hợp; chỉ cập nhật được nhiệm vụ mình chủ trì |

---

## Câu hỏi thường gặp

**Muốn xem hoặc in toàn bộ dữ liệu?**
Mở Google Sheet: trang `NhiemVu` là sổ theo dõi đầy đủ, có thể dùng *Dữ liệu → Tạo bộ lọc*.
Không xóa hoặc đổi tên các cột tiêu đề. Có thể kéo đổi thứ tự cột.

**AI báo lỗi hết thời gian hoặc chạy quá lâu?**
Văn bản rất dài có thể vượt giới hạn thời gian của Google (6 phút cho mỗi lần chạy). Có hai cách xử lý:

- tách văn bản thành nhiều phần;
- hoặc tại trang `CauHinh`, đổi `MODEL` từ `claude-opus-5-5` sang `claude-sonnet-5-5` để AI chạy nhanh hơn.

**Chi phí?**
Apps Script, Google Sheet và Drive đều miễn phí trong hạn mức của tài khoản Google. Riêng AI Claude tính phí theo lượng sử dụng; xem bảng giá tại <https://www.anthropic.com/pricing>.
Tài khoản Gmail cá nhân gửi được khoảng 100 email mỗi ngày.

**Quên mật khẩu?**
Quản trị viên dùng menu **📋 Nhiệm vụ → 3. Đặt mật khẩu cho người dùng** để đặt lại.

**Bảo mật**

- Ứng dụng chạy bằng quyền của tài khoản đã triển khai. Người dùng **không cần** quyền xem Google Sheet; chỉ cần URL và mật khẩu.
- Mật khẩu được lưu dưới dạng mã băm có muối.
- Phiên đăng nhập hết hạn sau 6 giờ.
- **Chỉ chia sẻ Google Sheet cho người quản trị.**

---

## Tệp trong thư mục này

| Tệp | Nội dung |
|---|---|
| `Code.gs` | Toàn bộ xử lý phía máy chủ: menu cài đặt, đăng nhập, AI đọc văn bản, giao việc, theo dõi, nhắc việc, báo cáo, kiểm duyệt |
| `Index.html` | Giao diện web (chạy được trên máy tính và điện thoại) |
| `kiem_thu/` | Kiểm thử chạy ngoài Google bằng bộ giả lập: `node google_apps_script/kiem_thu/kiem_thu.js` |

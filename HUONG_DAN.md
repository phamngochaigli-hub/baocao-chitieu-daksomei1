# Hệ thống giao việc và theo dõi nhiệm vụ từ văn bản

Ứng dụng web (Streamlit) thực hiện trọn quy trình:

```
Văn bản mới → AI đọc → xác định nhiệm vụ → phân công cơ quan/cá nhân → đặt hạn
→ theo dõi → cảnh báo → tạo báo cáo → cán bộ kiểm duyệt
```

Toàn bộ dữ liệu được lưu trong một thư mục **Google Drive**.

## 1. Các bước của quy trình trong ứng dụng

| Bước | Màn hình | Người thực hiện | Nội dung |
|---|---|---|---|
| 1. Văn bản mới | 📥 Văn bản mới | Chuyên viên | Tải lên tệp PDF / DOCX / TXT (PDF scan vẫn đọc được khi có AI). |
| 2. AI đọc | 📥 Văn bản mới | Claude | Đọc toàn văn, trích số hiệu, trích yếu, cơ quan ban hành, ngày ban hành, tóm tắt. |
| 3. Xác định nhiệm vụ | 📥 Văn bản mới | Claude + chuyên viên | Mỗi nhiệm vụ kèm **trích dẫn nguyên văn** để đối chiếu. Chuyên viên sửa, thêm, bỏ dòng. |
| 4. Phân công | 📥 Văn bản mới | Chuyên viên | Chọn đơn vị chủ trì (từ danh mục), đơn vị phối hợp, cá nhân phụ trách. |
| 5. Đặt hạn | 📥 Văn bản mới | Chuyên viên | AI đề xuất hạn từ văn bản; chuyên viên xác nhận hoặc sửa, rồi bấm **Giao nhiệm vụ**. |
| 6. Theo dõi | 📊 Theo dõi nhiệm vụ | Đơn vị, chuyên viên | Đơn vị chủ trì cập nhật trạng thái, % tiến độ, kết quả; mọi lần cập nhật được ghi lịch sử. |
| 7. Cảnh báo | ⏰ Cảnh báo + thanh bên | Tự động | Đỏ: quá hạn. Vàng: còn ≤ N ngày (mặc định 3). Tải nội dung nhắc việc theo từng đơn vị. |
| 8. Tạo báo cáo | 📝 Lập báo cáo | Chuyên viên | Chọn kỳ và đơn vị; AI soạn bản nháp từ số liệu thật; chỉnh sửa rồi **Gửi duyệt**. |
| 9. Kiểm duyệt | ✅ Kiểm duyệt báo cáo | Cán bộ kiểm duyệt | Đối chiếu số liệu, **Duyệt** (bản Word được lưu lên Drive) hoặc **Yêu cầu sửa** kèm ý kiến. |

Vai trò và quyền:

| Vai trò (`vai_tro`) | Được dùng |
|---|---|
| `quan_tri` | Tất cả, kể cả danh mục đơn vị và sao lưu dữ liệu |
| `chuyen_vien` | Văn bản mới, Theo dõi (toàn bộ, được điều chỉnh hạn), Cảnh báo, Lập báo cáo |
| `can_bo_duyet` | Theo dõi, Cảnh báo, Kiểm duyệt báo cáo |
| `don_vi` | Chỉ nhiệm vụ của đơn vị mình (chủ trì hoặc phối hợp); chỉ đơn vị chủ trì được cập nhật |

## 2. Cách lưu dữ liệu trên Google Drive

```
<Thư mục gốc trên Drive>/
├── du_lieu.json   ← văn bản, nhiệm vụ, lịch sử cập nhật, báo cáo, danh mục đơn vị
├── van_ban/       ← tệp văn bản gốc đã tải lên
└── bao_cao/       ← báo cáo .docx đã được duyệt
```

Khi hai người cùng sửa, người lưu sau sẽ được báo "Dữ liệu vừa được người khác cập nhật" thay vì ghi đè mất dữ liệu.

## 3. Cài đặt

```bash
pip install -r requirements.txt
cp .streamlit/secrets.toml.example .streamlit/secrets.toml   # rồi điền thông tin
streamlit run app_nhiemvu.py
```

Chưa cấu hình gì vẫn chạy được để dùng thử: dữ liệu lưu ở thư mục `du_lieu_cuc_bo/`, đăng nhập bằng
`quantri`, `chuyenvien`, `lanhdao`, `phongkinhte` (mật khẩu trùng tên đăng nhập), và nhiệm vụ được gợi ý
bằng quy tắc đơn giản thay cho AI.

### 3.1. Kết nối Google Drive

**Cách 1 — Tài khoản dịch vụ (khuyến nghị cho cơ quan dùng Google Workspace):**

1. Vào <https://console.cloud.google.com>, tạo dự án, bật **Google Drive API**.
2. *IAM & Admin → Service Accounts* → tạo tài khoản dịch vụ → *Keys → Add key → JSON*, tải tệp khóa về.
3. Tạo một **Bộ nhớ dùng chung (Shared Drive)**, thêm email của tài khoản dịch vụ với quyền *Người quản lý nội dung*.
   (Tài khoản dịch vụ không có dung lượng riêng nên không ghi được vào "Drive của tôi".)
4. Tạo thư mục trong Shared Drive, lấy ID ở cuối đường dẫn `https://drive.google.com/drive/folders/<ID>`.
5. Điền `folder_id` và các trường của tệp JSON vào `[google_drive.credentials]` trong `secrets.toml`.

**Cách 2 — Tài khoản Gmail cá nhân ("Drive của tôi"):** tạo *OAuth client ID* loại *Desktop app*, lấy
`refresh_token` với phạm vi `https://www.googleapis.com/auth/drive` (ví dụ bằng `google-auth-oauthlib`),
rồi điền `type = "authorized_user"`, `client_id`, `client_secret`, `refresh_token`.

### 3.2. Kết nối AI (Claude)

Tạo khóa tại <https://console.anthropic.com> và điền `ANTHROPIC_API_KEY`. Ứng dụng dùng mô hình
`claude-opus-5-5` với đầu ra có cấu trúc (JSON theo lược đồ), nên danh sách nhiệm vụ luôn đúng định dạng.
Khi một yêu cầu bị bộ lọc an toàn từ chối, máy chủ tự chuyển sang mô hình dự phòng.

### 3.3. Tài khoản người dùng

Khai báo trong `[nguoi_dung.<tên đăng nhập>]`. Mật khẩu lưu dạng SHA-256:

```bash
python -c "import hashlib;print(hashlib.sha256('mat-khau'.encode()).hexdigest())"
```

Với vai trò `don_vi`, trường `don_vi` phải trùng tên trong danh mục đơn vị (màn hình ⚙️ Cấu hình).

### 3.4. Triển khai lên Streamlit Community Cloud

1. Đẩy mã lên GitHub (tệp `secrets.toml` đã được loại trừ qua `.gitignore`).
2. Tại <https://share.streamlit.io> chọn kho, tệp chính `app_nhiemvu.py`.
3. *Advanced settings → Secrets*: dán nội dung `secrets.toml`.

## 4. Lưu ý khi sử dụng

- AI chỉ **đề xuất**; chuyên viên luôn rà soát trước khi bấm Giao nhiệm vụ. Cột *Trích dẫn* giúp đối chiếu nhanh với văn bản gốc.
- Nhiệm vụ không có hạn (thường xuyên) không phát sinh cảnh báo.
- Báo cáo đã duyệt không sửa được nữa; muốn điều chỉnh, lập báo cáo mới.
- Định kỳ tải bản sao lưu JSON tại màn hình ⚙️ Cấu hình (Drive cũng tự lưu lịch sử phiên bản của `du_lieu.json`).

## 5. Cấu trúc mã nguồn

| Tệp | Chức năng |
|---|---|
| `app_nhiemvu.py` | Giao diện Streamlit, đăng nhập, phân quyền |
| `quanly_nhiemvu/ai_extract.py` | Gọi Claude để phân tích văn bản và soạn báo cáo; quy tắc dự phòng khi không có AI |
| `quanly_nhiemvu/doc_reader.py` | Đọc chữ từ PDF, DOCX, TXT |
| `quanly_nhiemvu/workflow.py` | Giao việc, cập nhật tiến độ, cảnh báo hạn, thống kê, kiểm duyệt |
| `quanly_nhiemvu/report.py` | Xuất báo cáo Word theo thể thức hành chính |
| `quanly_nhiemvu/storage.py` | Lưu trữ Google Drive (và thư mục cục bộ khi chạy thử) |
| `quanly_nhiemvu/models.py` | Mô hình dữ liệu |
| `tests/` | Kiểm thử: `python -m pytest tests` |

"""App lưu trữ văn bản trên Google Drive.

Chức năng:
  1. Tải lên file mọi định dạng (PDF, Word, Excel, ảnh, nén, ...) vào Google Drive,
     kèm trích yếu nội dung và thông tin văn bản.
  2. Tìm kiếm theo trích yếu nội dung (không phân biệt hoa thường / dấu tiếng Việt).
  3. Xuất (tải về) file tìm được, xuất danh sách kết quả ra Excel, tải nhiều file dạng ZIP.

Chạy: streamlit run app_luutru.py
"""

import datetime
import io
import zipfile

import pandas as pd
import streamlit as st

from luutru_drive import DriveStore, build_service, loc_ket_qua

st.set_page_config(page_title="Lưu trữ văn bản", page_icon="📁", layout="wide")

LOAI_VAN_BAN = ["Nghị quyết", "Quyết định", "Chỉ thị", "Kết luận", "Kế hoạch", "Báo cáo",
                "Tờ trình", "Công văn", "Thông báo", "Hướng dẫn", "Biên bản", "Hợp đồng",
                "Khác"]
MAX_ZIP = 50


# ---------------- Đăng nhập (tuỳ chọn) ----------------
def kiem_tra_dang_nhap():
    mat_khau = st.secrets.get("APP_PASSWORD")
    if not mat_khau or st.session_state.get("da_dang_nhap"):
        return True
    st.title("📁 Lưu trữ văn bản")
    with st.form("login"):
        ten = st.text_input("Họ tên người dùng")
        pw = st.text_input("Mật khẩu", type="password")
        if st.form_submit_button("Đăng nhập"):
            if pw == mat_khau:
                st.session_state.da_dang_nhap = True
                st.session_state.nguoi_dung = ten.strip()
                st.rerun()
            st.error("Sai mật khẩu")
    return False


# ---------------- Kết nối Drive ----------------
@st.cache_resource(show_spinner="Đang kết nối Google Drive...")
def lay_store():
    svc = build_service(st.secrets)
    return DriveStore(svc, folder_id=st.secrets.get("DRIVE_FOLDER_ID"),
                      folder_name=st.secrets.get("DRIVE_FOLDER_NAME", "LuuTruVanBan"))


@st.cache_data(ttl=300, show_spinner="Đang đọc danh sách văn bản...")
def lay_danh_sach(_store):
    return _store.danh_sach()


@st.cache_data(ttl=600, max_entries=20, show_spinner="Đang tải file từ Drive...")
def tai_file(_store, file_id, _file):
    return _store.tai_ve(_file)


def kich_thuoc(size):
    if not size:
        return ""
    size = float(size)
    for dv in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.0f} {dv}" if dv == "B" else f"{size:.1f} {dv}"
        size /= 1024
    return f"{size:.1f} TB"


def bang_ket_qua(files):
    rows = []
    for f in files:
        p = f.get("appProperties") or {}
        rows.append({
            "Số ký hiệu": p.get("so_ky_hieu", ""),
            "Ngày ban hành": p.get("ngay_ban_hanh", ""),
            "Loại văn bản": p.get("loai_van_ban", ""),
            "Trích yếu nội dung": f.get("description", ""),
            "Cơ quan ban hành": p.get("co_quan", ""),
            "Tên file": f["name"],
            "Dung lượng": kich_thuoc(f.get("size")),
            "Người nhập": p.get("nguoi_nhap", ""),
            "Ngày lưu": (f.get("createdTime") or "")[:10],
            "Link Drive": f.get("webViewLink", ""),
        })
    return pd.DataFrame(rows)


def to_excel(df):
    out = io.BytesIO()
    with pd.ExcelWriter(out, engine="openpyxl") as w:
        df.to_excel(w, index=False, sheet_name="Danh sách văn bản")
    return out.getvalue()


# ---------------- Tab: Tải lên ----------------
def tab_tai_len(store):
    st.subheader("⬆️ Tải lên văn bản")
    st.caption("Chấp nhận mọi định dạng file. File được lưu nguyên bản gốc trên Google Drive.")
    with st.form("upload", clear_on_submit=True):
        files = st.file_uploader("Chọn file (có thể chọn nhiều file cho cùng một văn bản)",
                                 accept_multiple_files=True)
        trich_yeu = st.text_area("Trích yếu nội dung *", height=100,
                                 placeholder="VD: Về việc triển khai kế hoạch phát triển kinh tế - xã hội năm 2026")
        c1, c2, c3 = st.columns(3)
        so_ky_hieu = c1.text_input("Số, ký hiệu", placeholder="VD: 15/QĐ-UBND")
        ngay = c2.date_input("Ngày ban hành", value=datetime.date.today(), format="DD/MM/YYYY")
        loai = c3.selectbox("Loại văn bản", LOAI_VAN_BAN)
        c4, c5 = st.columns(2)
        co_quan = c4.text_input("Cơ quan ban hành")
        ghi_chu = c5.text_input("Ghi chú")
        gui = st.form_submit_button("Lưu lên Google Drive", type="primary")

    if not gui:
        return
    if not files:
        st.error("Chưa chọn file.")
        return
    if not trich_yeu.strip():
        st.error("Vui lòng nhập trích yếu nội dung để có thể tìm kiếm sau này.")
        return

    tien_do = st.progress(0.0)
    for i, f in enumerate(files, 1):
        try:
            kq = store.tai_len(
                f.name, f.getvalue(), trich_yeu, mime_type=f.type,
                so_ky_hieu=so_ky_hieu.strip(), ngay_ban_hanh=ngay.isoformat() if ngay else "",
                co_quan=co_quan.strip(), loai_van_ban=loai, ghi_chu=ghi_chu.strip(),
                nguoi_nhap=st.session_state.get("nguoi_dung", ""))
            st.success(f"Đã lưu: **{kq['name']}** ([mở trên Drive]({kq.get('webViewLink', '')}))")
        except Exception as e:  # noqa: BLE001 - báo lỗi từng file, tiếp tục file khác
            st.error(f"Lỗi khi tải {f.name}: {e}")
        tien_do.progress(i / len(files))
    lay_danh_sach.clear()


# ---------------- Tab: Tìm kiếm & xuất file ----------------
def tab_tim_kiem(store):
    st.subheader("🔎 Tìm kiếm văn bản theo trích yếu")
    c1, c2, c3 = st.columns([3, 1, 1])
    tu_khoa = c1.text_input("Từ khoá trích yếu",
                            placeholder="VD: ke hoach kinh te 2026 (gõ có dấu hoặc không dấu đều được)")
    loai = c2.selectbox("Loại văn bản", ["Tất cả"] + LOAI_VAN_BAN)
    nam = c3.selectbox("Năm ban hành", ["Tất cả"] + [str(y) for y in range(datetime.date.today().year + 1, 2009, -1)])
    c4, c5, c6 = st.columns([2, 2, 1])
    chi_trich_yeu = c4.checkbox("Chỉ tìm trong trích yếu",
                                help="Bỏ chọn để tìm cả trong tên file, số ký hiệu, cơ quan ban hành.")
    toan_van = c5.checkbox("Tìm cả nội dung bên trong file",
                           help="Dùng bộ tìm kiếm toàn văn của Google Drive (PDF có chữ, Word, Excel...).")
    if c6.button("🔄 Làm mới"):
        lay_danh_sach.clear()

    tat_ca = lay_danh_sach(store)
    ket_qua = loc_ket_qua(tat_ca, tu_khoa,
                          loai=None if loai == "Tất cả" else loai,
                          nam=None if nam == "Tất cả" else nam,
                          chi_trich_yeu=chi_trich_yeu)
    if toan_van and tu_khoa.strip():
        da_co = {f["id"] for f in ket_qua}
        them = [f for f in loc_ket_qua(store.tim_toan_van(tu_khoa.strip()),
                                       "", None if loai == "Tất cả" else loai,
                                       None if nam == "Tất cả" else nam)
                if f["id"] not in da_co]
        ket_qua += them

    st.write(f"Tìm thấy **{len(ket_qua)}** / {len(tat_ca)} văn bản.")
    if not ket_qua:
        return

    df = bang_ket_qua(ket_qua)
    st.dataframe(df, hide_index=True, width="stretch",
                 column_config={"Link Drive": st.column_config.LinkColumn(display_text="Mở")})

    c1, c2 = st.columns(2)
    c1.download_button("📊 Xuất danh sách kết quả (Excel)", to_excel(df),
                       f"ket_qua_tim_kiem_{datetime.date.today():%Y%m%d}.xlsx")
    if len(ket_qua) <= MAX_ZIP and c2.button(f"🗜️ Chuẩn bị tải tất cả {len(ket_qua)} file (ZIP)"):
        buf = io.BytesIO()
        ten_da_dung = set()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for f in ket_qua:
                ten, data, _ = tai_file(store, f["id"], f)
                goc, n = ten, 1
                while ten in ten_da_dung:
                    n += 1
                    ten = f"({n}) {goc}"
                ten_da_dung.add(ten)
                z.writestr(ten, data)
        st.session_state.zip_data = buf.getvalue()
    if st.session_state.get("zip_data"):
        c2.download_button("⬇️ Tải file ZIP", st.session_state.zip_data, "van_ban.zip",
                           "application/zip")

    st.markdown("#### Xuất từng file")
    co_quyen_xoa = st.secrets.get("ALLOW_DELETE", False)
    for f in ket_qua:
        p = f.get("appProperties") or {}
        tieu_de = " · ".join(x for x in [p.get("so_ky_hieu"), p.get("ngay_ban_hanh"), f["name"]] if x)
        with st.expander(tieu_de):
            st.write(f"**Trích yếu:** {f.get('description', '')}")
            st.write(f"**Loại:** {p.get('loai_van_ban', '')} · **Cơ quan:** {p.get('co_quan', '')} "
                     f"· **Dung lượng:** {kich_thuoc(f.get('size'))}")
            if p.get("ghi_chu"):
                st.write(f"**Ghi chú:** {p['ghi_chu']}")
            b1, b2, b3 = st.columns(3)
            if b1.button("Chuẩn bị xuất file", key=f"prep_{f['id']}"):
                st.session_state[f"ready_{f['id']}"] = True
            if st.session_state.get(f"ready_{f['id']}"):
                ten, data, mime = tai_file(store, f["id"], f)
                b1.download_button("⬇️ Tải về máy", data, ten, mime, key=f"dl_{f['id']}")
            if f.get("webViewLink"):
                b2.link_button("Mở trên Google Drive", f["webViewLink"])
            if co_quyen_xoa and b3.button("🗑️ Xoá (vào thùng rác)", key=f"del_{f['id']}"):
                store.xoa(f["id"])
                lay_danh_sach.clear()
                st.rerun()


def main():
    if not kiem_tra_dang_nhap():
        return
    st.title("📁 Lưu trữ văn bản trên Google Drive")
    try:
        store = lay_store()
    except Exception as e:  # noqa: BLE001
        st.error(f"Không kết nối được Google Drive: {e}")
        st.info("Xem hướng dẫn cấu hình trong README.md và .streamlit/secrets.toml.example")
        return
    t1, t2 = st.tabs(["🔎 Tìm kiếm & xuất file", "⬆️ Tải lên"])
    with t1:
        tab_tim_kiem(store)
    with t2:
        tab_tai_len(store)


main()

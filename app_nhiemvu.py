"""Ứng dụng giao việc và theo dõi nhiệm vụ từ văn bản chỉ đạo.

Quy trình: Văn bản mới → AI đọc → xác định nhiệm vụ → phân công cơ quan/cá nhân
→ đặt hạn → theo dõi → cảnh báo → tạo báo cáo → cán bộ kiểm duyệt.

Chạy:  streamlit run app_nhiemvu.py
Cấu hình: xem .streamlit/secrets.toml.example và HUONG_DAN.md
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from datetime import date

import pandas as pd
import streamlit as st

from quanly_nhiemvu import ai_extract, doc_reader, report, workflow
from quanly_nhiemvu.models import (
    BC_CHO_DUYET,
    BC_DA_DUYET,
    BC_NHAP,
    BC_YEU_CAU_SUA,
    TRANG_THAI_NHIEM_VU,
    BaoCao,
    CoSoDuLieu,
)
from quanly_nhiemvu.storage import (
    THU_MUC_BAO_CAO,
    THU_MUC_VAN_BAN,
    KhoCucBo,
    KhoGoogleDrive,
    XungDotDuLieu,
    tao_credentials,
)

st.set_page_config(page_title="Theo dõi nhiệm vụ", page_icon="📋", layout="wide")

# --------------------------------------------------------------------------
# Cấu hình
# --------------------------------------------------------------------------
VAI_TRO = {
    "quan_tri": "Quản trị",
    "chuyen_vien": "Chuyên viên tổng hợp",
    "can_bo_duyet": "Cán bộ kiểm duyệt",
    "don_vi": "Đơn vị thực hiện",
}

TRANG = {
    "van_ban_moi": "📥 Văn bản mới",
    "theo_doi": "📊 Theo dõi nhiệm vụ",
    "canh_bao": "⏰ Cảnh báo",
    "bao_cao": "📝 Lập báo cáo",
    "kiem_duyet": "✅ Kiểm duyệt báo cáo",
    "cau_hinh": "⚙️ Cấu hình",
}

QUYEN = {
    "quan_tri": ["van_ban_moi", "theo_doi", "canh_bao", "bao_cao", "kiem_duyet", "cau_hinh"],
    "chuyen_vien": ["van_ban_moi", "theo_doi", "canh_bao", "bao_cao"],
    "can_bo_duyet": ["theo_doi", "canh_bao", "kiem_duyet"],
    "don_vi": ["theo_doi", "canh_bao"],
}

# Tài khoản dùng thử khi chưa khai báo [nguoi_dung] trong secrets.
NGUOI_DUNG_DUNG_THU = {
    "quantri": {"mat_khau": "quantri", "vai_tro": "quan_tri", "ho_ten": "Quản trị viên"},
    "chuyenvien": {"mat_khau": "chuyenvien", "vai_tro": "chuyen_vien", "ho_ten": "Chuyên viên tổng hợp"},
    "lanhdao": {"mat_khau": "lanhdao", "vai_tro": "can_bo_duyet", "ho_ten": "Lãnh đạo văn phòng"},
    "phongkinhte": {
        "mat_khau": "phongkinhte", "vai_tro": "don_vi", "ho_ten": "Phòng Kinh tế", "don_vi": "Phòng Kinh tế",
    },
}


def cau_hinh(khoa: str, mac_dinh=None):
    try:
        if khoa in st.secrets:
            return st.secrets[khoa]
    except FileNotFoundError:
        pass
    return os.environ.get(khoa.upper(), mac_dinh)


def danh_sach_nguoi_dung() -> tuple[dict, bool]:
    nd = cau_hinh("nguoi_dung")
    if nd:
        return {k: dict(v) for k, v in nd.items()}, False
    return NGUOI_DUNG_DUNG_THU, True


def kiem_tra_mat_khau(thong_tin: dict, mat_khau: str) -> bool:
    if "mat_khau_sha256" in thong_tin:
        bam = hashlib.sha256(mat_khau.encode("utf-8")).hexdigest()
        return hmac.compare_digest(bam, str(thong_tin["mat_khau_sha256"]).lower())
    return hmac.compare_digest(mat_khau, str(thong_tin.get("mat_khau", "")))


def khoi_tao_kho():
    gd = cau_hinh("google_drive")
    if gd and gd.get("folder_id"):
        if "credentials" in gd:
            thong_tin = dict(gd["credentials"])
        elif "credentials_json" in gd:
            thong_tin = json.loads(gd["credentials_json"])
        else:
            raise RuntimeError("Thiếu [google_drive.credentials] hoặc google_drive.credentials_json trong secrets.")
        return KhoGoogleDrive(tao_credentials(thong_tin), gd["folder_id"])
    return KhoCucBo(cau_hinh("thu_muc_du_lieu", "du_lieu_cuc_bo"))


def lay_kho():
    # Mỗi phiên làm việc có đối tượng kho riêng để phát hiện ghi đè lẫn nhau.
    if "kho" not in st.session_state:
        st.session_state.kho = khoi_tao_kho()
    return st.session_state.kho


def luu(csdl: CoSoDuLieu) -> bool:
    try:
        lay_kho().ghi(csdl)
        return True
    except XungDotDuLieu as e:
        st.error(f"⚠️ {e}")
        return False


API_KEY = cau_hinh("ANTHROPIC_API_KEY") or None
CO_AI = bool(API_KEY)
TEN_CO_QUAN = cau_hinh("ten_co_quan", "UBND XÃ")
SO_NGAY_BAO_TRUOC = int(cau_hinh("so_ngay_bao_truoc", 3))


# --------------------------------------------------------------------------
# Đăng nhập
# --------------------------------------------------------------------------
def man_hinh_dang_nhap():
    nguoi_dung, dung_thu = danh_sach_nguoi_dung()
    st.title("📋 Hệ thống giao việc và theo dõi nhiệm vụ")
    with st.form("dang_nhap"):
        ten = st.text_input("Tên đăng nhập")
        mk = st.text_input("Mật khẩu", type="password")
        if st.form_submit_button("Đăng nhập", type="primary"):
            tt = nguoi_dung.get(ten)
            if tt and kiem_tra_mat_khau(tt, mk):
                st.session_state.nguoi_dung = {
                    "ten": ten,
                    "ho_ten": tt.get("ho_ten", ten),
                    "vai_tro": tt.get("vai_tro", "don_vi"),
                    "don_vi": tt.get("don_vi", ""),
                }
                st.rerun()
            else:
                st.error("Tên đăng nhập hoặc mật khẩu không đúng.")
    if dung_thu:
        st.info(
            "Đang dùng **tài khoản dùng thử** (chưa khai báo `[nguoi_dung]` trong secrets): "
            "quantri / chuyenvien / lanhdao / phongkinhte — mật khẩu trùng tên đăng nhập."
        )


# --------------------------------------------------------------------------
# Tiện ích hiển thị
# --------------------------------------------------------------------------
MAU_CANH_BAO = {
    workflow.QUA_HAN: "#f8d7da",
    workflow.SAP_DEN_HAN: "#fff3cd",
    workflow.TRONG_HAN: "",
    workflow.KHONG_HAN: "",
    workflow.DA_XONG: "#d1e7dd",
}


def bang_nhiem_vu(csdl: CoSoDuLieu, ds, hom_nay: date) -> pd.DataFrame:
    hang = []
    for nv in ds:
        vb = csdl.tim_van_ban(nv.van_ban_id)
        con_lai = workflow.so_ngay_con_lai(nv, hom_nay)
        hang.append({
            "Mã": nv.id,
            "Cảnh báo": workflow.muc_canh_bao(nv, hom_nay, SO_NGAY_BAO_TRUOC),
            "Nội dung": nv.noi_dung,
            "Chủ trì": nv.don_vi_chu_tri,
            "Phối hợp": ", ".join(nv.don_vi_phoi_hop),
            "Cá nhân": nv.ca_nhan_phu_trach,
            "Hạn": nv.han_xu_ly,
            "Còn (ngày)": con_lai if nv.trang_thai != "Hoàn thành" else None,
            "Trạng thái": nv.trang_thai,
            "Tiến độ": nv.tien_do,
            "Văn bản": (vb.so_hieu or vb.trich_yeu[:40]) if vb else "",
        })
    return pd.DataFrame(hang)


def hien_bang(df: pd.DataFrame):
    if df.empty:
        st.info("Chưa có nhiệm vụ nào.")
        return
    to_mau = df.style.apply(
        lambda h: [f"background-color: {MAU_CANH_BAO.get(h['Cảnh báo'], '')}"] * len(h), axis=1
    )
    st.dataframe(
        to_mau,
        hide_index=True,
        width="stretch",
        column_config={
            "Mã": None,
            "Hạn": st.column_config.DateColumn(format="DD/MM/YYYY"),
            "Tiến độ": st.column_config.ProgressColumn(min_value=0, max_value=100, format="%d%%"),
        },
    )


# --------------------------------------------------------------------------
# 1–5. Văn bản mới → AI đọc → xác định nhiệm vụ → phân công → đặt hạn
# --------------------------------------------------------------------------
def trang_van_ban_moi(csdl: CoSoDuLieu, nd: dict):
    st.header(TRANG["van_ban_moi"])
    st.caption("Bước 1–5: tải văn bản → AI đọc → xác định nhiệm vụ → phân công → đặt hạn.")
    if not CO_AI:
        st.warning("Chưa cấu hình `ANTHROPIC_API_KEY`: sẽ dùng quy tắc đơn giản để gợi ý nhiệm vụ, cần rà soát kỹ.")

    tep = st.file_uploader("Văn bản chỉ đạo", type=doc_reader.DINH_DANG_HO_TRO)
    if tep is not None and st.button("🤖 AI đọc văn bản", type="primary"):
        noi_dung = tep.getvalue()
        try:
            chu = doc_reader.trich_van_ban(tep.name, noi_dung)
        except Exception as e:  # tệp hỏng hoặc định dạng lạ
            st.error(f"Không đọc được tệp: {e}")
            return
        if not doc_reader.la_pdf(tep.name) and not chu.strip():
            st.error("Tệp không có nội dung chữ.")
            return
        with st.spinner("Đang phân tích văn bản…"):
            try:
                if CO_AI:
                    kq = ai_extract.phan_tich_van_ban(tep.name, noi_dung, chu, csdl.don_vi, API_KEY)
                elif chu.strip():
                    kq = ai_extract.trich_nhiem_vu_theo_quy_tac(chu, csdl.don_vi)
                else:
                    st.error("PDF dạng ảnh scan cần có AI để đọc. Hãy cấu hình ANTHROPIC_API_KEY.")
                    return
            except ai_extract.AIKhongTraLoi as e:
                st.error(str(e))
                return
        st.session_state.phan_tich = {"ten_tep": tep.name, "noi_dung": noi_dung, "ket_qua": kq}

    pt = st.session_state.get("phan_tich")
    if not pt:
        return
    kq: ai_extract.KetQuaPhanTich = pt["ket_qua"]

    st.subheader("Thông tin văn bản")
    c1, c2, c3 = st.columns([1, 2, 1])
    so_hieu = c1.text_input("Số, ký hiệu", kq.so_hieu)
    co_quan = c2.text_input("Cơ quan ban hành", kq.co_quan_ban_hanh)
    ngay_bh = c3.date_input("Ngày ban hành", workflow.doc_ngay(kq.ngay_ban_hanh), format="DD/MM/YYYY")
    trich_yeu = st.text_input("Trích yếu", kq.trich_yeu)
    tom_tat = st.text_area("Tóm tắt", kq.tom_tat, height=100)

    st.subheader(f"Nhiệm vụ xác định được ({len(kq.nhiem_vu)})")
    st.caption("Rà soát, chỉnh sửa, bổ sung dòng; chọn đơn vị chủ trì và đặt hạn trước khi giao. "
               "Đơn vị phối hợp ghi cách nhau bằng dấu chấm phẩy (;).")
    tuy_chon_don_vi = sorted(set(csdl.don_vi) | {n.don_vi_chu_tri for n in kq.nhiem_vu if n.don_vi_chu_tri})
    df = pd.DataFrame([
        {
            "Giao": True,
            "Nội dung nhiệm vụ": n.noi_dung,
            "Đơn vị chủ trì": n.don_vi_chu_tri or None,
            "Đơn vị phối hợp": "; ".join(n.don_vi_phoi_hop),
            "Cá nhân phụ trách": n.ca_nhan_phu_trach,
            "Hạn xử lý": workflow.doc_ngay(n.han_xu_ly),
            "Trích dẫn": n.trich_dan,
        }
        for n in kq.nhiem_vu
    ], columns=["Giao", "Nội dung nhiệm vụ", "Đơn vị chủ trì", "Đơn vị phối hợp",
                "Cá nhân phụ trách", "Hạn xử lý", "Trích dẫn"])
    df["Hạn xử lý"] = pd.to_datetime(df["Hạn xử lý"]).dt.date
    da_sua = st.data_editor(
        df,
        num_rows="dynamic",
        width="stretch",
        hide_index=True,
        key=f"bang_giao_{pt['ten_tep']}",
        column_config={
            "Giao": st.column_config.CheckboxColumn(width="small", default=True),
            "Nội dung nhiệm vụ": st.column_config.TextColumn(width="large", required=True),
            "Đơn vị chủ trì": st.column_config.SelectboxColumn(options=tuy_chon_don_vi, width="medium"),
            "Hạn xử lý": st.column_config.DateColumn(format="DD/MM/YYYY"),
            "Trích dẫn": st.column_config.TextColumn(width="large"),
        },
    )

    chon = da_sua[da_sua["Giao"].fillna(False).astype(bool)]
    thieu_don_vi = chon["Đơn vị chủ trì"].isna() | (chon["Đơn vị chủ trì"].astype(str).str.strip() == "")
    thieu_han = chon["Hạn xử lý"].isna()
    if thieu_don_vi.any():
        st.warning(f"{int(thieu_don_vi.sum())} nhiệm vụ chưa có đơn vị chủ trì.")
    if thieu_han.any():
        st.info(f"{int(thieu_han.sum())} nhiệm vụ chưa đặt hạn (sẽ theo dõi như nhiệm vụ thường xuyên).")

    c1, c2 = st.columns([1, 5])
    if c2.button("Hủy"):
        del st.session_state.phan_tich
        st.rerun()
    if c1.button(f"📤 Giao {len(chon)} nhiệm vụ", type="primary", disabled=chon.empty or thieu_don_vi.any()):
        kho = lay_kho()
        with st.spinner("Đang lưu văn bản và giao nhiệm vụ…"):
            file_id = kho.tai_tep_len(
                THU_MUC_VAN_BAN, pt["ten_tep"], pt["noi_dung"], doc_reader.mime_cua(pt["ten_tep"])
            )
            kq_sua = kq.model_copy(update={
                "so_hieu": so_hieu, "co_quan_ban_hanh": co_quan, "trich_yeu": trich_yeu, "tom_tat": tom_tat,
                "ngay_ban_hanh": ngay_bh.isoformat() if ngay_bh else "",
            })
            vb = workflow.tao_van_ban(kq_sua, pt["ten_tep"], file_id, nd["ten"])
            ds = [
                {
                    "noi_dung": h["Nội dung nhiệm vụ"],
                    "trich_dan": h["Trích dẫn"] or "",
                    "don_vi_chu_tri": h["Đơn vị chủ trì"] or "",
                    "don_vi_phoi_hop": [d.strip() for d in str(h["Đơn vị phối hợp"] or "").split(";") if d.strip()],
                    "ca_nhan_phu_trach": h["Cá nhân phụ trách"] or "",
                    "han_xu_ly": h["Hạn xử lý"] if pd.notna(h["Hạn xử lý"]) else None,
                }
                for _, h in chon.iterrows()
            ]
            moi = workflow.giao_nhiem_vu(csdl, vb, ds, nd["ten"])
            if luu(csdl):
                del st.session_state.phan_tich
                st.success(f"Đã giao {len(moi)} nhiệm vụ từ văn bản {vb.so_hieu or vb.ten_tep}.")
                st.balloons()


# --------------------------------------------------------------------------
# 6. Theo dõi
# --------------------------------------------------------------------------
def trang_theo_doi(csdl: CoSoDuLieu, nd: dict, hom_nay: date):
    st.header(TRANG["theo_doi"])
    don_vi_cua_toi = nd["don_vi"] if nd["vai_tro"] == "don_vi" else None
    ds = workflow.nhiem_vu_cua_don_vi(csdl, don_vi_cua_toi)

    tk = workflow.thong_ke(ds, hom_nay, SO_NGAY_BAO_TRUOC)
    c = st.columns(5)
    c[0].metric("Tổng số", tk.tong)
    c[1].metric("Hoàn thành", tk.hoan_thanh)
    c[2].metric("Đang thực hiện", tk.dang_thuc_hien)
    c[3].metric("Sắp đến hạn", tk.sap_den_han)
    c[4].metric("Quá hạn", tk.qua_han)

    with st.expander("Bộ lọc", expanded=False):
        c1, c2, c3 = st.columns(3)
        loc_dv = None if don_vi_cua_toi else c1.selectbox("Đơn vị", ["(Tất cả)"] + csdl.don_vi)
        loc_tt = c2.multiselect("Trạng thái", TRANG_THAI_NHIEM_VU)
        loc_cb = c3.multiselect("Mức cảnh báo", workflow.THU_TU_CANH_BAO)
        tu_khoa = st.text_input("Tìm theo nội dung")
    if loc_dv and loc_dv != "(Tất cả)":
        ds = workflow.nhiem_vu_cua_don_vi(csdl, loc_dv)
    if loc_tt:
        ds = [n for n in ds if n.trang_thai in loc_tt]
    if loc_cb:
        ds = [n for n in ds if workflow.muc_canh_bao(n, hom_nay, SO_NGAY_BAO_TRUOC) in loc_cb]
    if tu_khoa:
        ds = [n for n in ds if tu_khoa.lower() in n.noi_dung.lower()]
    ds.sort(key=lambda n: (
        workflow.THU_TU_CANH_BAO.index(workflow.muc_canh_bao(n, hom_nay, SO_NGAY_BAO_TRUOC)),
        n.han_xu_ly or date.max,
    ))
    hien_bang(bang_nhiem_vu(csdl, ds, hom_nay))
    if not ds:
        return

    st.subheader("Cập nhật tiến độ")
    nhan = {n.id: f"[{n.don_vi_chu_tri}] {n.noi_dung[:90]}" for n in ds}
    nv_id = st.selectbox("Chọn nhiệm vụ", list(nhan), format_func=nhan.get)
    nv = csdl.tim_nhiem_vu(nv_id)
    vb = csdl.tim_van_ban(nv.van_ban_id)

    c1, c2 = st.columns([3, 2])
    with c1:
        if vb:
            st.markdown(f"**Văn bản:** {vb.so_hieu} — {vb.trich_yeu}")
            link = lay_kho().duong_dan(vb.drive_file_id) if vb.drive_file_id else None
            if link:
                st.markdown(f"[Mở văn bản gốc trên Google Drive]({link})")
        if nv.trich_dan:
            st.markdown(f"> {nv.trich_dan}")
        st.markdown(
            f"**Chủ trì:** {nv.don_vi_chu_tri or '—'} · **Phối hợp:** {', '.join(nv.don_vi_phoi_hop) or '—'} · "
            f"**Cá nhân:** {nv.ca_nhan_phu_trach or '—'} · "
            f"**Hạn:** {nv.han_xu_ly.strftime('%d/%m/%Y') if nv.han_xu_ly else 'không có'}"
        )
        with st.expander(f"Lịch sử ({len(nv.lich_su)})"):
            for ls in reversed(nv.lich_su):
                st.markdown(f"- `{ls.thoi_diem}` **{ls.nguoi_cap_nhat}** — {ls.trang_thai}, {ls.tien_do}% {ls.ghi_chu}")

    duoc_sua = nd["vai_tro"] in ("quan_tri", "chuyen_vien") or (
        nd["vai_tro"] == "don_vi" and nv.don_vi_chu_tri == nd["don_vi"]
    )
    with c2:
        if not duoc_sua:
            st.info("Chỉ đơn vị chủ trì hoặc chuyên viên tổng hợp được cập nhật nhiệm vụ này.")
            return
        with st.form(f"cap_nhat_{nv.id}"):
            trang_thai = st.selectbox("Trạng thái", TRANG_THAI_NHIEM_VU, TRANG_THAI_NHIEM_VU.index(nv.trang_thai))
            tien_do = st.slider("Tiến độ (%)", 0, 100, nv.tien_do, step=5)
            ket_qua = st.text_area("Kết quả / sản phẩm", nv.ket_qua)
            ghi_chu = st.text_input("Ghi chú cập nhật")
            if nd["vai_tro"] in ("quan_tri", "chuyen_vien"):
                han_moi = st.date_input("Điều chỉnh hạn", nv.han_xu_ly, format="DD/MM/YYYY")
            else:
                han_moi = nv.han_xu_ly
            if st.form_submit_button("Lưu cập nhật", type="primary"):
                if han_moi != nv.han_xu_ly:
                    ghi_chu = f"{ghi_chu} (điều chỉnh hạn từ {nv.han_xu_ly} sang {han_moi})".strip()
                    nv.han_xu_ly = han_moi
                workflow.cap_nhat_tien_do(nv, nd["ten"], tien_do, trang_thai, ghi_chu, ket_qua)
                if luu(csdl):
                    st.success("Đã cập nhật.")
                    st.rerun()


# --------------------------------------------------------------------------
# 7. Cảnh báo
# --------------------------------------------------------------------------
def trang_canh_bao(csdl: CoSoDuLieu, nd: dict, hom_nay: date):
    st.header(TRANG["canh_bao"])
    don_vi = nd["don_vi"] if nd["vai_tro"] == "don_vi" else None
    cb = workflow.danh_sach_canh_bao(workflow.nhiem_vu_cua_don_vi(csdl, don_vi), hom_nay, SO_NGAY_BAO_TRUOC)
    if not cb:
        st.success("Không có nhiệm vụ quá hạn hoặc sắp đến hạn.")
        return
    theo_dv: dict[str, list] = {}
    for muc, nv in cb:
        theo_dv.setdefault(nv.don_vi_chu_tri or "(Chưa phân công)", []).append((muc, nv))
    nhac_viec = []
    for dv, ds in theo_dv.items():
        st.subheader(dv)
        nhac_viec.append(f"Kính gửi: {dv}")
        for muc, nv in ds:
            con = workflow.so_ngay_con_lai(nv, hom_nay)
            mo_ta = f"quá hạn {-con} ngày" if con < 0 else ("đến hạn hôm nay" if con == 0 else f"còn {con} ngày")
            dong = f"{nv.noi_dung} — hạn {nv.han_xu_ly:%d/%m/%Y} ({mo_ta}), tiến độ {nv.tien_do}%"
            (st.error if muc == workflow.QUA_HAN else st.warning)(dong, icon="🔴" if muc == workflow.QUA_HAN else "🟡")
            nhac_viec.append(f"- {dong}")
        nhac_viec.append("")
    st.download_button(
        "Tải nội dung nhắc việc (.txt)",
        "\n".join(nhac_viec).encode("utf-8"),
        f"nhac_viec_{hom_nay:%Y%m%d}.txt",
    )


def canh_bao_nhanh(csdl: CoSoDuLieu, nd: dict, hom_nay: date):
    don_vi = nd["don_vi"] if nd["vai_tro"] == "don_vi" else None
    cb = workflow.danh_sach_canh_bao(workflow.nhiem_vu_cua_don_vi(csdl, don_vi), hom_nay, SO_NGAY_BAO_TRUOC)
    qua = sum(1 for m, _ in cb if m == workflow.QUA_HAN)
    sap = len(cb) - qua
    if qua:
        st.sidebar.error(f"🔴 {qua} nhiệm vụ quá hạn")
    if sap:
        st.sidebar.warning(f"🟡 {sap} nhiệm vụ sắp đến hạn")


# --------------------------------------------------------------------------
# 8. Tạo báo cáo
# --------------------------------------------------------------------------
def trang_bao_cao(csdl: CoSoDuLieu, nd: dict, hom_nay: date):
    st.header(TRANG["bao_cao"])
    with st.expander("➕ Lập báo cáo mới", expanded=not csdl.bao_cao):
        with st.form("bao_cao_moi"):
            tieu_de = st.text_input("Tiêu đề", "Kết quả thực hiện nhiệm vụ được giao")
            c1, c2, c3 = st.columns(3)
            tu = c1.date_input("Từ ngày", hom_nay.replace(day=1), format="DD/MM/YYYY")
            den = c2.date_input("Đến ngày", hom_nay, format="DD/MM/YYYY")
            dv = c3.selectbox("Đơn vị", ["(Tất cả)"] + csdl.don_vi)
            dung_ai = st.checkbox("Dùng AI soạn bản nháp", value=CO_AI, disabled=not CO_AI)
            if st.form_submit_button("Tạo bản nháp", type="primary"):
                if tu > den:
                    st.error("Từ ngày phải trước đến ngày.")
                else:
                    dv = "" if dv == "(Tất cả)" else dv
                    ds = workflow.nhiem_vu_trong_ky(csdl, tu, den, dv)
                    noi_dung = workflow.bao_cao_mau(ds, hom_nay)
                    if dung_ai and ds:
                        with st.spinner("AI đang soạn báo cáo…"):
                            try:
                                du_lieu = json.dumps(
                                    workflow.du_lieu_bao_cao(csdl, ds, hom_nay), ensure_ascii=False, indent=1
                                )
                                noi_dung = ai_extract.soan_bao_cao(du_lieu, tieu_de, API_KEY)
                            except ai_extract.AIKhongTraLoi as e:
                                st.warning(f"{e} Đã dùng mẫu báo cáo cố định.")
                    bc = BaoCao(tieu_de=tieu_de, tu_ngay=tu, den_ngay=den, don_vi=dv,
                                noi_dung=noi_dung, nguoi_lap=nd["ho_ten"])
                    csdl.bao_cao.append(bc)
                    if luu(csdl):
                        st.session_state.bao_cao_dang_sua = bc.id
                        st.rerun()

    if not csdl.bao_cao:
        return
    ds_bc = sorted(csdl.bao_cao, key=lambda b: b.thoi_diem_lap, reverse=True)
    nhan = {b.id: f"[{b.trang_thai}] {b.tieu_de} ({b.tu_ngay:%d/%m}–{b.den_ngay:%d/%m/%Y})" for b in ds_bc}
    mac_dinh = st.session_state.get("bao_cao_dang_sua")
    chi_so = list(nhan).index(mac_dinh) if mac_dinh in nhan else 0
    bc = csdl.tim_bao_cao(st.selectbox("Báo cáo", list(nhan), chi_so, format_func=nhan.get))

    if bc.trang_thai == BC_YEU_CAU_SUA:
        st.error(f"**{bc.nguoi_duyet}** yêu cầu chỉnh sửa: {bc.y_kien_duyet}")
    elif bc.trang_thai == BC_DA_DUYET:
        st.success(f"Đã được **{bc.nguoi_duyet}** duyệt lúc {bc.thoi_diem_duyet}.")

    sua_duoc = bc.trang_thai in (BC_NHAP, BC_YEU_CAU_SUA)
    noi_dung = st.text_area("Nội dung báo cáo", bc.noi_dung, height=420, disabled=not sua_duoc)
    c1, c2, c3 = st.columns([1, 1, 4])
    if sua_duoc and c1.button("💾 Lưu nháp"):
        bc.noi_dung = noi_dung
        if luu(csdl):
            st.success("Đã lưu.")
    if sua_duoc and c2.button("📨 Gửi duyệt", type="primary"):
        bc.noi_dung = noi_dung
        try:
            workflow.gui_duyet(bc)
        except ValueError as e:
            st.error(str(e))
        else:
            if luu(csdl):
                st.success("Đã gửi cán bộ kiểm duyệt.")
                st.rerun()
    nut_tai_bao_cao(csdl, bc, hom_nay, c3)


def nut_tai_bao_cao(csdl: CoSoDuLieu, bc: BaoCao, hom_nay: date, cot):
    if bc.drive_file_id:
        link = lay_kho().duong_dan(bc.drive_file_id)
        if link:
            cot.markdown(f"[📄 Bản đã duyệt trên Google Drive]({link})")
            return
    ds = workflow.nhiem_vu_trong_ky(csdl, bc.tu_ngay, bc.den_ngay, bc.don_vi)
    cot.download_button(
        "⬇️ Tải bản Word",
        report.xuat_docx(bc, ds, TEN_CO_QUAN, hom_nay),
        f"bao_cao_{bc.id}.docx",
        key=f"tai_{bc.id}",
    )


# --------------------------------------------------------------------------
# 9. Cán bộ kiểm duyệt
# --------------------------------------------------------------------------
def trang_kiem_duyet(csdl: CoSoDuLieu, nd: dict, hom_nay: date):
    st.header(TRANG["kiem_duyet"])
    cho = [b for b in csdl.bao_cao if b.trang_thai == BC_CHO_DUYET]
    if not cho:
        st.success("Không có báo cáo chờ duyệt.")
    for bc in cho:
        with st.container(border=True):
            st.subheader(bc.tieu_de)
            st.caption(f"Kỳ {bc.tu_ngay:%d/%m/%Y}–{bc.den_ngay:%d/%m/%Y} · {bc.don_vi or 'Toàn bộ'} · "
                       f"Người lập: {bc.nguoi_lap} · {bc.thoi_diem_lap}")
            st.text(bc.noi_dung)
            ds = workflow.nhiem_vu_trong_ky(csdl, bc.tu_ngay, bc.den_ngay, bc.don_vi)
            with st.expander(f"Đối chiếu dữ liệu nhiệm vụ ({len(ds)})"):
                hien_bang(bang_nhiem_vu(csdl, ds, hom_nay))
            y_kien = st.text_area("Ý kiến", key=f"yk_{bc.id}")
            c1, c2, c3 = st.columns([1, 1, 4])
            if c1.button("✅ Duyệt", key=f"duyet_{bc.id}", type="primary"):
                workflow.kiem_duyet(bc, nd["ho_ten"], True, y_kien)
                with st.spinner("Đang lưu bản đã duyệt lên kho…"):
                    tep = report.xuat_docx(bc, ds, TEN_CO_QUAN, hom_nay)
                    bc.drive_file_id = lay_kho().tai_tep_len(
                        THU_MUC_BAO_CAO,
                        f"{bc.den_ngay:%Y%m%d}_{bc.tieu_de[:60]}_{bc.id}.docx",
                        tep,
                        doc_reader.mime_cua("x.docx"),
                    )
                if luu(csdl):
                    st.rerun()
            if c2.button("↩️ Yêu cầu sửa", key=f"tra_{bc.id}"):
                try:
                    workflow.kiem_duyet(bc, nd["ho_ten"], False, y_kien)
                except ValueError as e:
                    st.error(str(e))
                else:
                    if luu(csdl):
                        st.rerun()
            nut_tai_bao_cao(csdl, bc, hom_nay, c3)

    da_xu_ly = [b for b in csdl.bao_cao if b.trang_thai in (BC_DA_DUYET, BC_YEU_CAU_SUA)]
    if da_xu_ly:
        st.subheader("Đã xử lý")
        st.dataframe(pd.DataFrame([{
            "Tiêu đề": b.tieu_de, "Kỳ": f"{b.tu_ngay:%d/%m}–{b.den_ngay:%d/%m/%Y}", "Kết quả": b.trang_thai,
            "Người duyệt": b.nguoi_duyet, "Thời điểm": b.thoi_diem_duyet, "Ý kiến": b.y_kien_duyet,
        } for b in sorted(da_xu_ly, key=lambda b: b.thoi_diem_duyet, reverse=True)]),
            hide_index=True, width="stretch")


# --------------------------------------------------------------------------
# Cấu hình
# --------------------------------------------------------------------------
def trang_cau_hinh(csdl: CoSoDuLieu, nd: dict):
    st.header(TRANG["cau_hinh"])
    st.markdown(f"**Kho dữ liệu:** {lay_kho().mo_ta}")
    st.markdown(f"**AI:** {'Claude (' + ai_extract.MODEL + ')' if CO_AI else 'chưa cấu hình — dùng quy tắc đơn giản'}")
    st.subheader("Danh mục cơ quan, đơn vị")
    df = st.data_editor(pd.DataFrame({"Đơn vị": csdl.don_vi}), num_rows="dynamic", hide_index=True,
                        width="stretch")
    if st.button("Lưu danh mục", type="primary"):
        moi = [d.strip() for d in df["Đơn vị"].dropna().astype(str) if d.strip()]
        csdl.don_vi = list(dict.fromkeys(moi))
        if luu(csdl):
            st.success("Đã lưu danh mục đơn vị.")
    with st.expander("Sao lưu dữ liệu"):
        st.download_button("Tải toàn bộ dữ liệu (JSON)", csdl.model_dump_json(indent=2).encode("utf-8"),
                           f"sao_luu_{date.today():%Y%m%d}.json")


# --------------------------------------------------------------------------
# Chương trình chính
# --------------------------------------------------------------------------
def main():
    if "nguoi_dung" not in st.session_state:
        man_hinh_dang_nhap()
        return
    nd = st.session_state.nguoi_dung
    hom_nay = date.today()

    try:
        csdl = lay_kho().doc()
    except Exception as e:  # lỗi mạng, sai quyền truy cập Drive…
        st.error(f"Không đọc được dữ liệu: {e}")
        st.stop()
    if not csdl.don_vi:
        csdl.don_vi = list(workflow.DON_VI_MAC_DINH)

    st.sidebar.markdown(f"**{nd['ho_ten']}**  \n{VAI_TRO.get(nd['vai_tro'], nd['vai_tro'])}"
                        + (f" · {nd['don_vi']}" if nd["don_vi"] else ""))
    trang = st.sidebar.radio("Chức năng", QUYEN.get(nd["vai_tro"], ["theo_doi"]), format_func=TRANG.get)
    canh_bao_nhanh(csdl, nd, hom_nay)
    st.sidebar.caption(lay_kho().mo_ta)
    if st.sidebar.button("Đăng xuất"):
        for k in list(st.session_state):
            del st.session_state[k]
        st.rerun()

    if trang == "van_ban_moi":
        trang_van_ban_moi(csdl, nd)
    elif trang == "theo_doi":
        trang_theo_doi(csdl, nd, hom_nay)
    elif trang == "canh_bao":
        trang_canh_bao(csdl, nd, hom_nay)
    elif trang == "bao_cao":
        trang_bao_cao(csdl, nd, hom_nay)
    elif trang == "kiem_duyet":
        trang_kiem_duyet(csdl, nd, hom_nay)
    elif trang == "cau_hinh":
        trang_cau_hinh(csdl, nd)


main()

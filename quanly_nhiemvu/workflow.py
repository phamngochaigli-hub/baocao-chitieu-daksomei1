"""Nghiệp vụ: giao việc, theo dõi tiến độ, cảnh báo hạn và tổng hợp số liệu."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Iterable, Optional

from .ai_extract import KetQuaPhanTich
from .models import (
    BC_CHO_DUYET,
    BC_DA_DUYET,
    BC_NHAP,
    BC_YEU_CAU_SUA,
    BaoCao,
    CapNhatTienDo,
    CoSoDuLieu,
    NhiemVu,
    VanBan,
)

# Mức cảnh báo, theo thứ tự ưu tiên hiển thị.
QUA_HAN = "Quá hạn"
SAP_DEN_HAN = "Sắp đến hạn"
TRONG_HAN = "Trong hạn"
KHONG_HAN = "Không có hạn"
DA_XONG = "Đã hoàn thành"
THU_TU_CANH_BAO = [QUA_HAN, SAP_DEN_HAN, TRONG_HAN, KHONG_HAN, DA_XONG]

DON_VI_MAC_DINH = [
    "Phòng Kinh tế",
    "Phòng Văn hóa - Xã hội",
    "Văn phòng HĐND và UBND",
    "Ban Chỉ huy Quân sự",
    "Công an xã",
    "Ban Xây dựng Đảng",
    "Ủy ban MTTQ Việt Nam",
]


def doc_ngay(chuoi: str) -> Optional[date]:
    chuoi = (chuoi or "").strip()
    if not chuoi:
        return None
    for dinh_dang in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(chuoi, dinh_dang).date()
        except ValueError:
            continue
    return None


def muc_canh_bao(nv: NhiemVu, hom_nay: date, so_ngay_bao_truoc: int = 3) -> str:
    if nv.trang_thai == "Hoàn thành":
        return DA_XONG
    if nv.han_xu_ly is None:
        return KHONG_HAN
    if nv.han_xu_ly < hom_nay:
        return QUA_HAN
    if (nv.han_xu_ly - hom_nay).days <= so_ngay_bao_truoc:
        return SAP_DEN_HAN
    return TRONG_HAN


def so_ngay_con_lai(nv: NhiemVu, hom_nay: date) -> Optional[int]:
    return None if nv.han_xu_ly is None else (nv.han_xu_ly - hom_nay).days


def hoan_thanh_dung_han(nv: NhiemVu) -> Optional[bool]:
    if nv.trang_thai != "Hoàn thành" or nv.han_xu_ly is None or not nv.thoi_diem_hoan_thanh:
        return None
    return datetime.fromisoformat(nv.thoi_diem_hoan_thanh).date() <= nv.han_xu_ly


# --------------------------------------------------------------------------
# Văn bản mới → nhiệm vụ
# --------------------------------------------------------------------------
def tao_van_ban(ket_qua: KetQuaPhanTich, ten_tep: str, drive_file_id: str, nguoi_nhap: str) -> VanBan:
    return VanBan(
        so_hieu=ket_qua.so_hieu,
        trich_yeu=ket_qua.trich_yeu,
        co_quan_ban_hanh=ket_qua.co_quan_ban_hanh,
        ngay_ban_hanh=ket_qua.ngay_ban_hanh,
        tom_tat=ket_qua.tom_tat,
        ten_tep=ten_tep,
        drive_file_id=drive_file_id,
        nguoi_nhap=nguoi_nhap,
    )


def giao_nhiem_vu(
    csdl: CoSoDuLieu,
    van_ban: VanBan,
    danh_sach: Iterable[dict],
    nguoi_giao: str,
) -> list[NhiemVu]:
    """Lưu văn bản cùng các nhiệm vụ đã được cán bộ xác nhận phân công."""
    if csdl.tim_van_ban(van_ban.id) is None:
        csdl.van_ban.append(van_ban)
    moi: list[NhiemVu] = []
    for muc in danh_sach:
        noi_dung = (muc.get("noi_dung") or "").strip()
        if not noi_dung:
            continue
        nv = NhiemVu(
            van_ban_id=van_ban.id,
            noi_dung=noi_dung,
            trich_dan=muc.get("trich_dan") or "",
            don_vi_chu_tri=(muc.get("don_vi_chu_tri") or "").strip(),
            don_vi_phoi_hop=[d for d in (muc.get("don_vi_phoi_hop") or []) if d],
            ca_nhan_phu_trach=(muc.get("ca_nhan_phu_trach") or "").strip(),
            han_xu_ly=muc.get("han_xu_ly") or None,
            nguoi_giao=nguoi_giao,
        )
        nv.lich_su.append(
            CapNhatTienDo(nguoi_cap_nhat=nguoi_giao, tien_do=0, trang_thai=nv.trang_thai, ghi_chu="Giao nhiệm vụ")
        )
        csdl.nhiem_vu.append(nv)
        moi.append(nv)
    for nv in moi:
        for d in [nv.don_vi_chu_tri, *nv.don_vi_phoi_hop]:
            if d and d not in csdl.don_vi:
                csdl.don_vi.append(d)
    return moi


# --------------------------------------------------------------------------
# Theo dõi
# --------------------------------------------------------------------------
def cap_nhat_tien_do(
    nv: NhiemVu, nguoi: str, tien_do: int, trang_thai: str, ghi_chu: str = "", ket_qua: str = ""
) -> None:
    tien_do = max(0, min(100, int(tien_do)))
    if trang_thai == "Hoàn thành":
        tien_do = 100
    elif tien_do == 100:
        trang_thai = "Hoàn thành"
    if trang_thai == "Hoàn thành" and nv.trang_thai != "Hoàn thành":
        nv.thoi_diem_hoan_thanh = datetime.now().isoformat(timespec="seconds")
    elif trang_thai != "Hoàn thành":
        nv.thoi_diem_hoan_thanh = ""
    nv.tien_do = tien_do
    nv.trang_thai = trang_thai
    if ket_qua:
        nv.ket_qua = ket_qua
    nv.lich_su.append(CapNhatTienDo(nguoi_cap_nhat=nguoi, tien_do=tien_do, trang_thai=trang_thai, ghi_chu=ghi_chu))


def nhiem_vu_cua_don_vi(csdl: CoSoDuLieu, don_vi: Optional[str]) -> list[NhiemVu]:
    if not don_vi:
        return list(csdl.nhiem_vu)
    return [n for n in csdl.nhiem_vu if n.don_vi_chu_tri == don_vi or don_vi in n.don_vi_phoi_hop]


def danh_sach_canh_bao(
    ds: Iterable[NhiemVu], hom_nay: date, so_ngay_bao_truoc: int = 3
) -> list[tuple[str, NhiemVu]]:
    """Các nhiệm vụ quá hạn hoặc sắp đến hạn, sắp theo mức độ rồi theo hạn."""
    kq = [(muc_canh_bao(n, hom_nay, so_ngay_bao_truoc), n) for n in ds]
    kq = [(m, n) for m, n in kq if m in (QUA_HAN, SAP_DEN_HAN)]
    kq.sort(key=lambda x: (THU_TU_CANH_BAO.index(x[0]), x[1].han_xu_ly))
    return kq


@dataclass
class ThongKe:
    tong: int = 0
    hoan_thanh: int = 0
    hoan_thanh_dung_han: int = 0
    hoan_thanh_qua_han: int = 0
    dang_thuc_hien: int = 0
    qua_han: int = 0
    sap_den_han: int = 0


def thong_ke(ds: Iterable[NhiemVu], hom_nay: date, so_ngay_bao_truoc: int = 3) -> ThongKe:
    tk = ThongKe()
    for nv in ds:
        tk.tong += 1
        muc = muc_canh_bao(nv, hom_nay, so_ngay_bao_truoc)
        if muc == DA_XONG:
            tk.hoan_thanh += 1
            dung_han = hoan_thanh_dung_han(nv)
            if dung_han is True:
                tk.hoan_thanh_dung_han += 1
            elif dung_han is False:
                tk.hoan_thanh_qua_han += 1
        else:
            tk.dang_thuc_hien += 1
            if muc == QUA_HAN:
                tk.qua_han += 1
            elif muc == SAP_DEN_HAN:
                tk.sap_den_han += 1
    return tk


# --------------------------------------------------------------------------
# Báo cáo & kiểm duyệt
# --------------------------------------------------------------------------
def nhiem_vu_trong_ky(csdl: CoSoDuLieu, tu_ngay: date, den_ngay: date, don_vi: str = "") -> list[NhiemVu]:
    """Nhiệm vụ được giao đến hết kỳ và chưa kết thúc trước khi kỳ bắt đầu."""
    kq = []
    for nv in nhiem_vu_cua_don_vi(csdl, don_vi or None):
        ngay_giao = datetime.fromisoformat(nv.thoi_diem_giao).date()
        if ngay_giao > den_ngay:
            continue
        if nv.thoi_diem_hoan_thanh and datetime.fromisoformat(nv.thoi_diem_hoan_thanh).date() < tu_ngay:
            continue
        kq.append(nv)
    return kq


def du_lieu_bao_cao(csdl: CoSoDuLieu, ds: list[NhiemVu], hom_nay: date) -> list[dict]:
    """Dữ liệu gọn gửi cho AI soạn báo cáo."""
    kq = []
    for nv in ds:
        vb = csdl.tim_van_ban(nv.van_ban_id)
        kq.append({
            "van_ban": f"{vb.so_hieu} — {vb.trich_yeu}" if vb else "",
            "noi_dung": nv.noi_dung,
            "don_vi_chu_tri": nv.don_vi_chu_tri,
            "don_vi_phoi_hop": nv.don_vi_phoi_hop,
            "han_xu_ly": nv.han_xu_ly.isoformat() if nv.han_xu_ly else "",
            "trang_thai": nv.trang_thai,
            "muc_canh_bao": muc_canh_bao(nv, hom_nay),
            "so_ngay_con_lai": so_ngay_con_lai(nv, hom_nay),
            "hoan_thanh_dung_han": hoan_thanh_dung_han(nv),
            "tien_do_phan_tram": nv.tien_do,
            "ket_qua": nv.ket_qua,
            "ghi_chu_gan_nhat": nv.lich_su[-1].ghi_chu if nv.lich_su else "",
        })
    return kq


def bao_cao_mau(ds: list[NhiemVu], hom_nay: date) -> str:
    """Bản nháp báo cáo theo mẫu cố định (dùng khi không có AI)."""
    tk = thong_ke(ds, hom_nay)
    dong = [
        "I. TÌNH HÌNH CHUNG",
        f"- Tổng số nhiệm vụ theo dõi: {tk.tong}.",
        f"- Đã hoàn thành: {tk.hoan_thanh} (đúng hạn: {tk.hoan_thanh_dung_han}; quá hạn: {tk.hoan_thanh_qua_han}).",
        f"- Đang thực hiện: {tk.dang_thuc_hien}, trong đó quá hạn: {tk.qua_han}, sắp đến hạn: {tk.sap_den_han}.",
        "",
        "II. KẾT QUẢ THỰC HIỆN",
    ]
    theo_don_vi: dict[str, list[NhiemVu]] = {}
    for nv in ds:
        theo_don_vi.setdefault(nv.don_vi_chu_tri or "(Chưa phân công)", []).append(nv)
    for dv, ds_dv in sorted(theo_don_vi.items()):
        xong = sum(1 for n in ds_dv if n.trang_thai == "Hoàn thành")
        dong.append(f"- {dv}: {xong}/{len(ds_dv)} nhiệm vụ đã hoàn thành.")
        for n in ds_dv:
            if n.trang_thai == "Hoàn thành" and n.ket_qua:
                dong.append(f"  + {n.noi_dung}: {n.ket_qua}")
    dong += ["", "III. NHIỆM VỤ CHẬM, QUÁ HẠN"]
    qua_han = [n for n in ds if muc_canh_bao(n, hom_nay) == QUA_HAN]
    if qua_han:
        for n in qua_han:
            dong.append(
                f"- {n.noi_dung} ({n.don_vi_chu_tri or 'chưa phân công'}; hạn {n.han_xu_ly:%d/%m/%Y}; "
                f"quá {-so_ngay_con_lai(n, hom_nay)} ngày; tiến độ {n.tien_do}%)."
            )
    else:
        dong.append("- Không có nhiệm vụ quá hạn.")
    dong += ["", "IV. ĐỀ XUẤT, KIẾN NGHỊ", "- "]
    return "\n".join(dong)


def gui_duyet(bc: BaoCao) -> None:
    if bc.trang_thai not in (BC_NHAP, BC_YEU_CAU_SUA):
        raise ValueError(f"Báo cáo đang ở trạng thái «{bc.trang_thai}», không thể gửi duyệt.")
    if not bc.noi_dung.strip():
        raise ValueError("Báo cáo chưa có nội dung.")
    bc.trang_thai = BC_CHO_DUYET


def kiem_duyet(bc: BaoCao, nguoi_duyet: str, dong_y: bool, y_kien: str = "") -> None:
    if bc.trang_thai != BC_CHO_DUYET:
        raise ValueError(f"Báo cáo đang ở trạng thái «{bc.trang_thai}», không thể duyệt.")
    if not dong_y and not y_kien.strip():
        raise ValueError("Cần ghi ý kiến khi yêu cầu chỉnh sửa.")
    bc.trang_thai = BC_DA_DUYET if dong_y else BC_YEU_CAU_SUA
    bc.nguoi_duyet = nguoi_duyet
    bc.thoi_diem_duyet = datetime.now().isoformat(timespec="seconds")
    bc.y_kien_duyet = y_kien.strip()

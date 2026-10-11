"""Mô hình dữ liệu dùng chung cho toàn ứng dụng."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

# Trạng thái nhiệm vụ do người dùng cập nhật. "Quá hạn" không lưu mà được tính
# từ hạn xử lý (xem workflow.muc_canh_bao).
TRANG_THAI_NHIEM_VU = ["Mới giao", "Đang thực hiện", "Hoàn thành"]

# Trạng thái báo cáo trong bước kiểm duyệt.
BC_NHAP = "Nháp"
BC_CHO_DUYET = "Chờ duyệt"
BC_DA_DUYET = "Đã duyệt"
BC_YEU_CAU_SUA = "Yêu cầu chỉnh sửa"


def _id() -> str:
    return uuid.uuid4().hex[:12]


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


class VanBan(BaseModel):
    id: str = Field(default_factory=_id)
    so_hieu: str = ""
    trich_yeu: str = ""
    co_quan_ban_hanh: str = ""
    ngay_ban_hanh: str = ""
    tom_tat: str = ""
    ten_tep: str = ""
    drive_file_id: str = ""
    nguoi_nhap: str = ""
    thoi_diem_nhap: str = Field(default_factory=_now)


class CapNhatTienDo(BaseModel):
    thoi_diem: str = Field(default_factory=_now)
    nguoi_cap_nhat: str
    tien_do: int
    trang_thai: str
    ghi_chu: str = ""


class NhiemVu(BaseModel):
    id: str = Field(default_factory=_id)
    van_ban_id: str
    noi_dung: str
    trich_dan: str = ""
    don_vi_chu_tri: str = ""
    don_vi_phoi_hop: list[str] = Field(default_factory=list)
    ca_nhan_phu_trach: str = ""
    han_xu_ly: Optional[date] = None
    trang_thai: str = "Mới giao"
    tien_do: int = 0
    ket_qua: str = ""
    lich_su: list[CapNhatTienDo] = Field(default_factory=list)
    nguoi_giao: str = ""
    thoi_diem_giao: str = Field(default_factory=_now)
    thoi_diem_hoan_thanh: str = ""


class BaoCao(BaseModel):
    id: str = Field(default_factory=_id)
    tieu_de: str
    tu_ngay: date
    den_ngay: date
    don_vi: str = ""  # rỗng = toàn bộ
    noi_dung: str = ""
    trang_thai: str = BC_NHAP
    nguoi_lap: str = ""
    thoi_diem_lap: str = Field(default_factory=_now)
    nguoi_duyet: str = ""
    thoi_diem_duyet: str = ""
    y_kien_duyet: str = ""
    drive_file_id: str = ""


class CoSoDuLieu(BaseModel):
    """Toàn bộ dữ liệu được lưu thành một tệp JSON trên Google Drive."""

    phien_ban: int = 1
    don_vi: list[str] = Field(default_factory=list)
    van_ban: list[VanBan] = Field(default_factory=list)
    nhiem_vu: list[NhiemVu] = Field(default_factory=list)
    bao_cao: list[BaoCao] = Field(default_factory=list)

    def tim_van_ban(self, vb_id: str) -> Optional[VanBan]:
        return next((v for v in self.van_ban if v.id == vb_id), None)

    def tim_nhiem_vu(self, nv_id: str) -> Optional[NhiemVu]:
        return next((n for n in self.nhiem_vu if n.id == nv_id), None)

    def tim_bao_cao(self, bc_id: str) -> Optional[BaoCao]:
        return next((b for b in self.bao_cao if b.id == bc_id), None)

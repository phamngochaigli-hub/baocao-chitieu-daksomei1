from datetime import date, datetime, timedelta

import pytest

from quanly_nhiemvu import ai_extract, report, workflow
from quanly_nhiemvu.models import BC_CHO_DUYET, BC_DA_DUYET, BC_YEU_CAU_SUA, BaoCao, CoSoDuLieu, NhiemVu
from quanly_nhiemvu.storage import KhoCucBo, XungDotDuLieu

HOM_NAY = date(2026, 10, 11)


def _nv(**kw) -> NhiemVu:
    return NhiemVu(van_ban_id="vb", noi_dung="Báo cáo kết quả", **kw)


def test_muc_canh_bao():
    assert workflow.muc_canh_bao(_nv(han_xu_ly=HOM_NAY - timedelta(days=1)), HOM_NAY) == workflow.QUA_HAN
    assert workflow.muc_canh_bao(_nv(han_xu_ly=HOM_NAY), HOM_NAY) == workflow.SAP_DEN_HAN
    assert workflow.muc_canh_bao(_nv(han_xu_ly=HOM_NAY + timedelta(days=3)), HOM_NAY) == workflow.SAP_DEN_HAN
    assert workflow.muc_canh_bao(_nv(han_xu_ly=HOM_NAY + timedelta(days=4)), HOM_NAY) == workflow.TRONG_HAN
    assert workflow.muc_canh_bao(_nv(), HOM_NAY) == workflow.KHONG_HAN
    xong = _nv(han_xu_ly=HOM_NAY - timedelta(days=5), trang_thai="Hoàn thành")
    assert workflow.muc_canh_bao(xong, HOM_NAY) == workflow.DA_XONG


def test_giao_va_cap_nhat_tien_do():
    csdl = CoSoDuLieu(don_vi=["Phòng Kinh tế"])
    kq = ai_extract.KetQuaPhanTich(so_hieu="12/KH-UBND", trich_yeu="Kế hoạch", co_quan_ban_hanh="UBND",
                                   ngay_ban_hanh="2026-10-01", tom_tat="", nhiem_vu=[])
    vb = workflow.tao_van_ban(kq, "kh.pdf", "file1", "chuyenvien")
    moi = workflow.giao_nhiem_vu(csdl, vb, [
        {"noi_dung": "Rà soát hộ nghèo", "don_vi_chu_tri": "Phòng Văn hóa - Xã hội",
         "don_vi_phoi_hop": ["Phòng Kinh tế"], "han_xu_ly": "2026-10-20"},
        {"noi_dung": "  "},  # dòng trống bị bỏ qua
    ], "chuyenvien")
    assert len(moi) == 1 and len(csdl.van_ban) == 1
    assert moi[0].han_xu_ly == date(2026, 10, 20)
    assert "Phòng Văn hóa - Xã hội" in csdl.don_vi  # đơn vị mới được bổ sung vào danh mục
    assert workflow.nhiem_vu_cua_don_vi(csdl, "Phòng Kinh tế") == moi  # đơn vị phối hợp cũng thấy

    nv = moi[0]
    workflow.cap_nhat_tien_do(nv, "pvhxh", 100, "Đang thực hiện", "xong")
    assert nv.trang_thai == "Hoàn thành" and nv.thoi_diem_hoan_thanh
    assert workflow.hoan_thanh_dung_han(nv) is (datetime.now().date() <= nv.han_xu_ly)
    workflow.cap_nhat_tien_do(nv, "pvhxh", 50, "Đang thực hiện")
    assert nv.thoi_diem_hoan_thanh == "" and len(nv.lich_su) == 3


def test_canh_bao_va_thong_ke():
    ds = [
        _nv(han_xu_ly=HOM_NAY - timedelta(days=2)),
        _nv(han_xu_ly=HOM_NAY + timedelta(days=1)),
        _nv(han_xu_ly=HOM_NAY + timedelta(days=30)),
        _nv(trang_thai="Hoàn thành", han_xu_ly=HOM_NAY, thoi_diem_hoan_thanh="2026-10-10T08:00:00"),
    ]
    cb = workflow.danh_sach_canh_bao(ds, HOM_NAY)
    assert [m for m, _ in cb] == [workflow.QUA_HAN, workflow.SAP_DEN_HAN]
    tk = workflow.thong_ke(ds, HOM_NAY)
    assert (tk.tong, tk.hoan_thanh, tk.hoan_thanh_dung_han, tk.qua_han, tk.sap_den_han) == (4, 1, 1, 1, 1)
    noi_dung = workflow.bao_cao_mau(ds, HOM_NAY)
    assert "quá 2 ngày" in noi_dung


def test_quy_trinh_kiem_duyet():
    bc = BaoCao(tieu_de="BC", tu_ngay=HOM_NAY, den_ngay=HOM_NAY, noi_dung="I. TÌNH HÌNH CHUNG")
    with pytest.raises(ValueError):
        workflow.kiem_duyet(bc, "lanhdao", True)  # chưa gửi duyệt
    workflow.gui_duyet(bc)
    assert bc.trang_thai == BC_CHO_DUYET
    with pytest.raises(ValueError):
        workflow.kiem_duyet(bc, "lanhdao", False, "")  # trả lại phải có ý kiến
    workflow.kiem_duyet(bc, "lanhdao", False, "Bổ sung số liệu")
    assert bc.trang_thai == BC_YEU_CAU_SUA
    workflow.gui_duyet(bc)
    workflow.kiem_duyet(bc, "lanhdao", True)
    assert bc.trang_thai == BC_DA_DUYET and bc.nguoi_duyet == "lanhdao"
    tep = report.xuat_docx(bc, [_nv(han_xu_ly=HOM_NAY)], "UBND xã", HOM_NAY)
    assert tep[:2] == b"PK"


def test_quy_tac_du_phong():
    van_ban = """KẾ HOẠCH triển khai nhiệm vụ quý IV
1. Giao Phòng Kinh tế chủ trì, phối hợp Công an xã rà soát các điểm tập kết rác thải, báo cáo trước ngày 25/10/2026.
2. Đề nghị Phòng Văn hóa - Xã hội tổ chức tuyên truyền về bảo hiểm y tế, hoàn thành trước 30/11.
3. Mục đích: nâng cao hiệu quả quản lý nhà nước."""
    kq = ai_extract.trich_nhiem_vu_theo_quy_tac(
        van_ban, ["Phòng Kinh tế", "Công an xã", "Phòng Văn hóa - Xã hội"]
    )
    assert len(kq.nhiem_vu) == 2
    nv1, nv2 = kq.nhiem_vu
    assert nv1.don_vi_chu_tri == "Phòng Kinh tế" and nv1.don_vi_phoi_hop == ["Công an xã"]
    assert nv1.han_xu_ly == "2026-10-25"
    assert nv2.don_vi_chu_tri == "Phòng Văn hóa - Xã hội"
    assert nv2.han_xu_ly.endswith("-11-30")


def test_kho_cuc_bo_phat_hien_ghi_de(tmp_path):
    a, b = KhoCucBo(tmp_path), KhoCucBo(tmp_path)
    csdl_a, csdl_b = a.doc(), b.doc()
    csdl_a.don_vi.append("A")
    a.ghi(csdl_a)
    csdl_b.don_vi.append("B")
    with pytest.raises(XungDotDuLieu):
        b.ghi(csdl_b)
    assert b.doc().don_vi == ["A"]

    fid = a.tai_tep_len("van_ban", "../x.txt", b"noi dung", "text/plain")
    assert a.tai_tep_ve(fid) == b"noi dung"
    with pytest.raises(ValueError):
        a.tai_tep_ve("../../etc/passwd")

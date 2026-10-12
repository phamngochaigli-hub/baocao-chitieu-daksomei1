"""Bước «AI đọc → xác định nhiệm vụ»: phân tích văn bản chỉ đạo bằng Claude.

Khi chưa cấu hình ANTHROPIC_API_KEY, ứng dụng dùng bộ quy tắc đơn giản
(`trich_nhiem_vu_theo_quy_tac`) để cán bộ vẫn có thể làm việc và chỉnh tay.
"""
from __future__ import annotations

import base64
import re
from datetime import date
from typing import Optional

from pydantic import BaseModel

MODEL = "claude-opus-5-5"


class NhiemVuDeXuat(BaseModel):
    noi_dung: str
    trich_dan: str
    don_vi_chu_tri: str
    don_vi_phoi_hop: list[str]
    ca_nhan_phu_trach: str
    han_xu_ly: str  # YYYY-MM-DD, hoặc "" nếu văn bản không nêu hạn


class KetQuaPhanTich(BaseModel):
    so_hieu: str
    trich_yeu: str
    co_quan_ban_hanh: str
    ngay_ban_hanh: str  # YYYY-MM-DD hoặc ""
    tom_tat: str
    nhiem_vu: list[NhiemVuDeXuat]


class AIKhongTraLoi(Exception):
    """Claude từ chối hoặc không trả về kết quả hợp lệ."""


HUONG_DAN_PHAN_TICH = """Bạn là chuyên viên văn phòng của một cơ quan hành chính nhà nước Việt Nam, \
có nhiệm vụ đọc văn bản chỉ đạo (kế hoạch, công văn, thông báo kết luận, quyết định, chỉ thị…) \
và lập danh sách nhiệm vụ để giao việc, theo dõi.

Yêu cầu:
- Liệt kê từng nhiệm vụ cụ thể, có thể giao và kiểm tra được. Tách các việc khác nhau giao cho \
các đơn vị khác nhau thành các nhiệm vụ riêng. Không đưa vào phần căn cứ, mục đích, lời dẫn.
- "noi_dung": diễn đạt ngắn gọn, bắt đầu bằng động từ (ví dụ: "Tham mưu…", "Tổ chức…", "Báo cáo…").
- "trich_dan": chép nguyên văn câu hoặc đoạn trong văn bản làm căn cứ cho nhiệm vụ.
- "don_vi_chu_tri" và "don_vi_phoi_hop": ưu tiên dùng đúng tên trong DANH SÁCH ĐƠN VỊ bên dưới; \
nếu văn bản nêu đơn vị không có trong danh sách thì ghi đúng tên như văn bản. Để trống nếu văn \
bản không nêu.
- "ca_nhan_phu_trach": chỉ ghi khi văn bản nêu rõ cá nhân (họ tên hoặc chức danh); nếu không, để trống.
- "han_xu_ly": định dạng YYYY-MM-DD. Nếu văn bản ghi "trước ngày 15/10" mà không nêu năm, lấy năm \
của ngày ban hành văn bản. Nếu hạn là "thường xuyên", "hằng tháng" hoặc không nêu, để trống.
- Không tự suy diễn nhiệm vụ, đơn vị hoặc thời hạn mà văn bản không nêu.
- Các trường văn bản không có thông tin thì để chuỗi rỗng.

Hôm nay là {hom_nay}.

DANH SÁCH ĐƠN VỊ:
{don_vi}"""


def _client(api_key: Optional[str]):
    import anthropic

    return anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()


def _goi_claude(client, system: str, content: list, output_format, max_tokens: int = 32000):
    """Gọi Claude với structured output; bật dự phòng phía máy chủ khi bị từ chối."""
    from pydantic import ValidationError

    try:
        with client.beta.messages.stream(
            model=MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": content}],
            output_config={"effort": "high"},
            output_format=output_format,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            response = stream.get_final_message()
    except (ValidationError, ValueError) as e:
        # Kết quả JSON bị cắt hoặc sai cấu trúc (thường do văn bản quá dài).
        raise AIKhongTraLoi("Claude trả về kết quả không đúng định dạng, vui lòng thử lại.") from e
    if response.stop_reason == "refusal":
        raise AIKhongTraLoi("Claude đã từ chối xử lý văn bản này.")
    if response.stop_reason == "max_tokens":
        raise AIKhongTraLoi("Văn bản quá dài, kết quả bị cắt ngắn. Hãy tách văn bản thành nhiều phần.")
    return response


def phan_tich_van_ban(
    ten_tep: str,
    noi_dung_tep: bytes,
    van_ban_chu: str,
    danh_sach_don_vi: list[str],
    api_key: Optional[str] = None,
) -> KetQuaPhanTich:
    """Gửi văn bản cho Claude và nhận danh sách nhiệm vụ có cấu trúc.

    PDF được gửi nguyên tệp để Claude đọc được cả bản scan; các định dạng khác
    gửi phần chữ đã trích.
    """
    import anthropic

    system = HUONG_DAN_PHAN_TICH.format(
        hom_nay=date.today().isoformat(),
        don_vi="\n".join(f"- {d}" for d in danh_sach_don_vi) or "(chưa khai báo)",
    )
    if ten_tep.lower().endswith(".pdf"):
        content = [
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.standard_b64encode(noi_dung_tep).decode("ascii"),
                },
                "title": ten_tep,
            },
            {"type": "text", "text": "Hãy phân tích văn bản đính kèm và lập danh sách nhiệm vụ."},
        ]
    else:
        content = [
            {
                "type": "text",
                "text": f"<van_ban ten_tep=\"{ten_tep}\">\n{van_ban_chu}\n</van_ban>\n\n"
                "Hãy phân tích văn bản trên và lập danh sách nhiệm vụ.",
            }
        ]

    try:
        response = _goi_claude(_client(api_key), system, content, KetQuaPhanTich)
    except anthropic.AuthenticationError as e:
        raise AIKhongTraLoi("Khóa API Anthropic không hợp lệ.") from e
    except anthropic.RateLimitError as e:
        raise AIKhongTraLoi("Đã vượt giới hạn gọi API, vui lòng thử lại sau ít phút.") from e
    except anthropic.APIStatusError as e:
        raise AIKhongTraLoi(f"Lỗi từ máy chủ Claude ({e.status_code}): {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise AIKhongTraLoi("Không kết nối được tới máy chủ Claude.") from e

    if response.parsed_output is None:
        raise AIKhongTraLoi("Claude không trả về kết quả đúng định dạng.")
    return response.parsed_output


# --------------------------------------------------------------------------
# Bộ quy tắc dự phòng (không cần AI)
# --------------------------------------------------------------------------
_TU_KHOA_GIAO_VIEC = (
    "giao", "đề nghị", "yêu cầu", "chủ trì", "phối hợp", "tham mưu", "triển khai",
    "tổ chức", "báo cáo", "hoàn thành", "thực hiện", "rà soát", "xây dựng",
)
_MAU_NGAY = re.compile(
    r"(?:trước|chậm nhất|hạn|trong)\s*(?:ngày|đến ngày|là ngày)?\s*"
    r"(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{4}))?",
    re.IGNORECASE,
)
_MAU_CHU_TRI = re.compile(r"(.+?)\s+chủ trì", re.IGNORECASE)


def _tach_cau(van_ban: str) -> list[str]:
    cau: list[str] = []
    for dong in van_ban.splitlines():
        dong = re.sub(r"^\s*(?:[-–•+*]|\d+(?:\.\d+)*[.)]|[a-zđ][.)])\s*", "", dong).strip()
        if dong:
            cau.extend(c.strip() for c in re.split(r"(?<=[.;])\s+(?=[A-ZĐÂÊÔƠƯÁÀẢÃẠ])", dong) if c.strip())
    return cau


def _tim_han(cau: str, nam_mac_dinh: int) -> str:
    m = _MAU_NGAY.search(cau)
    if not m:
        return ""
    ngay, thang, nam = int(m.group(1)), int(m.group(2)), int(m.group(3) or nam_mac_dinh)
    try:
        return date(nam, thang, ngay).isoformat()
    except ValueError:
        return ""


def trich_nhiem_vu_theo_quy_tac(van_ban: str, danh_sach_don_vi: list[str]) -> KetQuaPhanTich:
    nam = date.today().year
    nhiem_vu: list[NhiemVuDeXuat] = []
    for cau in _tach_cau(van_ban):
        thuong = cau.lower()
        if len(cau) < 25 or not any(k in thuong for k in _TU_KHOA_GIAO_VIEC):
            continue
        don_vi_nhac = [d for d in danh_sach_don_vi if d.lower() in thuong]
        han = _tim_han(cau, nam)
        if not don_vi_nhac and not han:
            continue
        chu_tri = ""
        m = _MAU_CHU_TRI.search(cau)
        if m:
            chu_tri = next((d for d in don_vi_nhac if d.lower() in m.group(1).lower()), "")
        if not chu_tri and don_vi_nhac:
            chu_tri = don_vi_nhac[0]
        nhiem_vu.append(
            NhiemVuDeXuat(
                noi_dung=cau,
                trich_dan=cau,
                don_vi_chu_tri=chu_tri,
                don_vi_phoi_hop=[d for d in don_vi_nhac if d != chu_tri],
                ca_nhan_phu_trach="",
                han_xu_ly=han,
            )
        )
    dong_dau = next((d.strip() for d in van_ban.splitlines() if d.strip()), "")
    return KetQuaPhanTich(
        so_hieu="",
        trich_yeu=dong_dau[:200],
        co_quan_ban_hanh="",
        ngay_ban_hanh="",
        tom_tat="(Phân tích bằng quy tắc đơn giản — chưa cấu hình AI. Vui lòng kiểm tra kỹ.)",
        nhiem_vu=nhiem_vu,
    )


# --------------------------------------------------------------------------
# Bước «tạo báo cáo»
# --------------------------------------------------------------------------
HUONG_DAN_BAO_CAO = """Bạn là chuyên viên tổng hợp của một cơ quan hành chính nhà nước Việt Nam. \
Từ dữ liệu theo dõi nhiệm vụ (JSON) được cung cấp, hãy soạn phần nội dung báo cáo kết quả thực \
hiện nhiệm vụ theo văn phong hành chính, gồm các mục:

I. TÌNH HÌNH CHUNG — tổng số nhiệm vụ, số đã hoàn thành (đúng hạn/quá hạn), đang thực hiện, quá hạn.
II. KẾT QUẢ THỰC HIỆN — tóm tắt theo từng đơn vị chủ trì, nêu nhiệm vụ nổi bật đã hoàn thành.
III. NHIỆM VỤ CHẬM, QUÁ HẠN — liệt kê cụ thể, nêu đơn vị chịu trách nhiệm và số ngày quá hạn.
IV. ĐỀ XUẤT, KIẾN NGHỊ — ngắn gọn, bám sát số liệu.

Chỉ dùng số liệu có trong dữ liệu; không bịa thêm. Trình bày bằng văn bản thuần, mỗi mục bắt đầu \
bằng tiêu đề như trên, các ý dùng dấu gạch đầu dòng "- ". Không dùng Markdown (không **, không #)."""


def soan_bao_cao(du_lieu_json: str, tieu_de: str, api_key: Optional[str] = None) -> str:
    import anthropic

    try:
        client = _client(api_key)
        with client.beta.messages.stream(
            model=MODEL,
            max_tokens=32000,
            system=HUONG_DAN_BAO_CAO,
            messages=[{
                "role": "user",
                "content": f"Tiêu đề báo cáo: {tieu_de}\n\n<du_lieu>\n{du_lieu_json}\n</du_lieu>",
            }],
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            response = stream.get_final_message()
    except anthropic.APIStatusError as e:
        raise AIKhongTraLoi(f"Lỗi từ máy chủ Claude ({e.status_code}): {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise AIKhongTraLoi("Không kết nối được tới máy chủ Claude.") from e
    if response.stop_reason == "refusal":
        raise AIKhongTraLoi("Claude đã từ chối soạn báo cáo này.")
    return "".join(b.text for b in response.content if b.type == "text").strip()

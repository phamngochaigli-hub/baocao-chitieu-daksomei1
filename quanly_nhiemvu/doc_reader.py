"""Đọc nội dung văn bản từ tệp PDF, DOCX hoặc TXT."""
from __future__ import annotations

import io
from pathlib import Path

DINH_DANG_HO_TRO = ["pdf", "docx", "txt"]

MIME = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}


def la_pdf(ten_tep: str) -> bool:
    return Path(ten_tep).suffix.lower() == ".pdf"


def mime_cua(ten_tep: str) -> str:
    return MIME.get(Path(ten_tep).suffix.lower(), "application/octet-stream")


def trich_van_ban(ten_tep: str, noi_dung: bytes) -> str:
    """Trả về phần chữ của tệp. PDF scan (không có lớp chữ) sẽ trả về chuỗi rỗng."""
    duoi = Path(ten_tep).suffix.lower()
    if duoi == ".txt":
        for ma in ("utf-8-sig", "utf-16", "cp1258"):
            try:
                return noi_dung.decode(ma)
            except UnicodeDecodeError:
                continue
        return noi_dung.decode("utf-8", errors="replace")
    if duoi == ".docx":
        from docx import Document

        tai_lieu = Document(io.BytesIO(noi_dung))
        dong = [p.text for p in tai_lieu.paragraphs]
        for bang in tai_lieu.tables:
            for hang in bang.rows:
                dong.append(" | ".join(o.text.strip() for o in hang.cells))
        return "\n".join(dong)
    if duoi == ".pdf":
        from pypdf import PdfReader

        doc = PdfReader(io.BytesIO(noi_dung))
        return "\n".join((trang.extract_text() or "") for trang in doc.pages)
    raise ValueError(f"Định dạng {duoi or '(không rõ)'} chưa được hỗ trợ. Hãy dùng PDF, DOCX hoặc TXT.")

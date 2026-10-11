"""Lưu trữ dữ liệu: Google Drive (chính thức) hoặc thư mục cục bộ (chạy thử).

Cấu trúc trên Google Drive, bên trong thư mục gốc do người dùng chỉ định:

    <thư mục gốc>/
        du_lieu.json      ← cơ sở dữ liệu (văn bản, nhiệm vụ, báo cáo, đơn vị)
        van_ban/          ← tệp văn bản gốc được tải lên
        bao_cao/          ← báo cáo .docx đã được cán bộ duyệt
"""
from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Optional, Protocol

from .models import CoSoDuLieu

TEN_TEP_DU_LIEU = "du_lieu.json"
THU_MUC_VAN_BAN = "van_ban"
THU_MUC_BAO_CAO = "bao_cao"
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"]
_MIME_THU_MUC = "application/vnd.google-apps.folder"


class XungDotDuLieu(Exception):
    """Dữ liệu trên kho đã bị người khác thay đổi kể từ lần đọc gần nhất."""


class KhoLuuTru(Protocol):
    mo_ta: str

    def doc(self) -> CoSoDuLieu: ...

    def ghi(self, csdl: CoSoDuLieu) -> None: ...

    def tai_tep_len(self, thu_muc: str, ten_tep: str, noi_dung: bytes, mime: str) -> str: ...

    def tai_tep_ve(self, file_id: str) -> bytes: ...

    def duong_dan(self, file_id: str) -> Optional[str]: ...


def _sang_json(csdl: CoSoDuLieu) -> bytes:
    return csdl.model_dump_json(indent=2).encode("utf-8")


def _tu_json(du_lieu: bytes) -> CoSoDuLieu:
    return CoSoDuLieu.model_validate(json.loads(du_lieu.decode("utf-8")))


class KhoCucBo:
    """Lưu trong một thư mục trên máy — dùng khi chưa cấu hình Google Drive."""

    def __init__(self, thu_muc: str | Path):
        self.goc = Path(thu_muc)
        self.goc.mkdir(parents=True, exist_ok=True)
        self.mo_ta = f"Thư mục cục bộ: {self.goc.resolve()}"
        self._mtime_da_doc: Optional[float] = None

    @property
    def _tep_du_lieu(self) -> Path:
        return self.goc / TEN_TEP_DU_LIEU

    def doc(self) -> CoSoDuLieu:
        if not self._tep_du_lieu.exists():
            self._mtime_da_doc = None
            return CoSoDuLieu()
        self._mtime_da_doc = self._tep_du_lieu.stat().st_mtime
        return _tu_json(self._tep_du_lieu.read_bytes())

    def ghi(self, csdl: CoSoDuLieu) -> None:
        mtime_hien_tai = self._tep_du_lieu.stat().st_mtime if self._tep_du_lieu.exists() else None
        if mtime_hien_tai != self._mtime_da_doc:
            raise XungDotDuLieu("Dữ liệu vừa được người khác cập nhật. Vui lòng tải lại trang.")
        tam = self._tep_du_lieu.with_suffix(".tmp")
        tam.write_bytes(_sang_json(csdl))
        tam.replace(self._tep_du_lieu)
        self._mtime_da_doc = self._tep_du_lieu.stat().st_mtime

    def tai_tep_len(self, thu_muc: str, ten_tep: str, noi_dung: bytes, mime: str) -> str:
        dich = self.goc / thu_muc
        dich.mkdir(parents=True, exist_ok=True)
        ten_an_toan = Path(ten_tep).name
        duong_dan = dich / ten_an_toan
        stt = 1
        while duong_dan.exists():
            duong_dan = dich / f"{Path(ten_an_toan).stem}_{stt}{Path(ten_an_toan).suffix}"
            stt += 1
        duong_dan.write_bytes(noi_dung)
        return str(duong_dan.relative_to(self.goc))

    def tai_tep_ve(self, file_id: str) -> bytes:
        duong_dan = (self.goc / file_id).resolve()
        if self.goc.resolve() not in duong_dan.parents:
            raise ValueError("Đường dẫn tệp không hợp lệ")
        return duong_dan.read_bytes()

    def duong_dan(self, file_id: str) -> Optional[str]:
        return None


class KhoGoogleDrive:
    """Lưu dữ liệu và tệp đính kèm trong một thư mục Google Drive.

    `credentials` có thể là tài khoản dịch vụ (service account) hoặc thông tin
    OAuth của người dùng. Lưu ý: tài khoản dịch vụ không có dung lượng riêng,
    nên thư mục gốc phải nằm trong Bộ nhớ dùng chung (Shared Drive), hoặc dùng
    OAuth của người dùng nếu lưu vào "Drive của tôi".
    """

    def __init__(self, credentials, folder_id: str):
        from googleapiclient.discovery import build

        self.svc = build("drive", "v3", credentials=credentials, cache_discovery=False)
        self.folder_id = folder_id
        self._thu_muc_con: dict[str, str] = {}
        self._id_tep_du_lieu: Optional[str] = None
        self._phien_ban_da_doc: Optional[str] = None
        thong_tin = self.svc.files().get(
            fileId=folder_id, fields="name", supportsAllDrives=True
        ).execute()
        self.mo_ta = f"Google Drive: thư mục «{thong_tin['name']}»"

    # --- tiện ích ---------------------------------------------------------
    def _tim(self, ten: str, cha: str, la_thu_muc: bool = False) -> Optional[str]:
        ten_thoat = ten.replace("\\", "\\\\").replace("'", "\\'")
        q = f"name = '{ten_thoat}' and '{cha}' in parents and trashed = false"
        if la_thu_muc:
            q += f" and mimeType = '{_MIME_THU_MUC}'"
        ket_qua = self.svc.files().list(
            q=q,
            fields="files(id)",
            pageSize=1,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        tep = ket_qua.get("files", [])
        return tep[0]["id"] if tep else None

    def _thu_muc(self, ten: str) -> str:
        if ten not in self._thu_muc_con:
            fid = self._tim(ten, self.folder_id, la_thu_muc=True)
            if fid is None:
                fid = self.svc.files().create(
                    body={"name": ten, "mimeType": _MIME_THU_MUC, "parents": [self.folder_id]},
                    fields="id",
                    supportsAllDrives=True,
                ).execute()["id"]
            self._thu_muc_con[ten] = fid
        return self._thu_muc_con[ten]

    def _phien_ban(self, file_id: str) -> str:
        return self.svc.files().get(
            fileId=file_id, fields="version", supportsAllDrives=True
        ).execute()["version"]

    # --- giao diện KhoLuuTru ---------------------------------------------
    def doc(self) -> CoSoDuLieu:
        if self._id_tep_du_lieu is None:
            self._id_tep_du_lieu = self._tim(TEN_TEP_DU_LIEU, self.folder_id)
        if self._id_tep_du_lieu is None:
            self._phien_ban_da_doc = None
            return CoSoDuLieu()
        self._phien_ban_da_doc = self._phien_ban(self._id_tep_du_lieu)
        return _tu_json(self.tai_tep_ve(self._id_tep_du_lieu))

    def ghi(self, csdl: CoSoDuLieu) -> None:
        from googleapiclient.http import MediaIoBaseUpload

        media = MediaIoBaseUpload(io.BytesIO(_sang_json(csdl)), mimetype="application/json")
        if self._id_tep_du_lieu is None:
            if self._tim(TEN_TEP_DU_LIEU, self.folder_id) is not None:
                raise XungDotDuLieu("Dữ liệu vừa được người khác tạo. Vui lòng tải lại trang.")
            self._id_tep_du_lieu = self.svc.files().create(
                body={"name": TEN_TEP_DU_LIEU, "parents": [self.folder_id]},
                media_body=media,
                fields="id",
                supportsAllDrives=True,
            ).execute()["id"]
        else:
            if self._phien_ban(self._id_tep_du_lieu) != self._phien_ban_da_doc:
                raise XungDotDuLieu("Dữ liệu vừa được người khác cập nhật. Vui lòng tải lại trang.")
            self.svc.files().update(
                fileId=self._id_tep_du_lieu, media_body=media, supportsAllDrives=True
            ).execute()
        self._phien_ban_da_doc = self._phien_ban(self._id_tep_du_lieu)

    def tai_tep_len(self, thu_muc: str, ten_tep: str, noi_dung: bytes, mime: str) -> str:
        from googleapiclient.http import MediaIoBaseUpload

        return self.svc.files().create(
            body={"name": ten_tep, "parents": [self._thu_muc(thu_muc)]},
            media_body=MediaIoBaseUpload(io.BytesIO(noi_dung), mimetype=mime),
            fields="id",
            supportsAllDrives=True,
        ).execute()["id"]

    def tai_tep_ve(self, file_id: str) -> bytes:
        return self.svc.files().get_media(fileId=file_id, supportsAllDrives=True).execute()

    def duong_dan(self, file_id: str) -> Optional[str]:
        return f"https://drive.google.com/file/d/{file_id}/view"


def tao_credentials(thong_tin: dict):
    """Tạo credentials từ JSON tài khoản dịch vụ hoặc JSON OAuth người dùng."""
    if thong_tin.get("type") == "service_account":
        from google.oauth2 import service_account

        return service_account.Credentials.from_service_account_info(thong_tin, scopes=DRIVE_SCOPES)
    from google.oauth2.credentials import Credentials

    return Credentials.from_authorized_user_info(thong_tin, scopes=DRIVE_SCOPES)

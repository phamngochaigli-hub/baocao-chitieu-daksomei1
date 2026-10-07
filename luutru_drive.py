"""Lớp làm việc với Google Drive cho app lưu trữ văn bản.

Mỗi file tải lên được lưu nguyên định dạng gốc vào một thư mục trên Drive.
Thông tin văn bản được gắn kèm ngay trên file Drive:
  - description   : trích yếu nội dung (hiển thị được cả trong giao diện Drive)
  - appProperties : số ký hiệu, ngày ban hành, cơ quan ban hành, loại văn bản...
Nhờ vậy không cần cơ sở dữ liệu riêng: Drive chính là nơi lưu trữ và chỉ mục.
"""

import io
import mimetypes
import re
import unicodedata

from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

SCOPES = ["https://www.googleapis.com/auth/drive"]
FOLDER_MIME = "application/vnd.google-apps.folder"
APP_TAG = "luutru_vanban"

# Định dạng xuất cho file Google Docs/Sheets/Slides (không tải trực tiếp được)
GOOGLE_EXPORT = {
    "application/vnd.google-apps.document": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"),
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"),
    "application/vnd.google-apps.presentation": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"),
    "application/vnd.google-apps.drawing": ("application/pdf", ".pdf"),
}

META_KEYS = ["so_ky_hieu", "ngay_ban_hanh", "co_quan", "loai_van_ban", "nguoi_nhap", "ghi_chu"]
FILE_FIELDS = "id, name, mimeType, size, description, appProperties, createdTime, webViewLink"


def bo_dau(text):
    """Chuẩn hoá chuỗi để tìm kiếm không phân biệt hoa thường và dấu tiếng Việt."""
    text = unicodedata.normalize("NFD", str(text or "").lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.replace("đ", "d")


def _cat_byte(value, max_bytes):
    """Cắt chuỗi theo số byte UTF-8 (giới hạn appProperties: khoá + giá trị <= 124 byte)."""
    raw = str(value or "").encode("utf-8")[:max_bytes]
    return raw.decode("utf-8", errors="ignore")


def _escape_q(text):
    return str(text).replace("\\", "\\\\").replace("'", "\\'")


def khop_tu_khoa(file, tu_khoa, chi_trich_yeu=False):
    """True nếu mọi từ trong tu_khoa đều xuất hiện trong trích yếu (và số ký hiệu, tên file)."""
    tu = bo_dau(tu_khoa).split()
    if not tu:
        return True
    props = file.get("appProperties") or {}
    nguon = [file.get("description", "")]
    if not chi_trich_yeu:
        nguon += [file.get("name", ""), props.get("so_ky_hieu", ""), props.get("co_quan", "")]
    van_ban = bo_dau(" ".join(nguon))
    return all(t in van_ban for t in tu)


def build_service(secrets):
    """Tạo Drive service từ st.secrets (hoặc dict tương đương).

    Hỗ trợ 2 cách xác thực:
      1. [google_oauth] client_id, client_secret, refresh_token  -> tài khoản Gmail cá nhân
      2. [gcp_service_account] ...                              -> chỉ dùng với Shared Drive
    """
    if "google_oauth" in secrets:
        from google.oauth2.credentials import Credentials

        o = secrets["google_oauth"]
        creds = Credentials(
            token=None,
            refresh_token=o["refresh_token"],
            client_id=o["client_id"],
            client_secret=o["client_secret"],
            token_uri="https://oauth2.googleapis.com/token",
            scopes=SCOPES,
        )
    elif "gcp_service_account" in secrets:
        from google.oauth2 import service_account

        creds = service_account.Credentials.from_service_account_info(
            dict(secrets["gcp_service_account"]), scopes=SCOPES)
    else:
        raise RuntimeError(
            "Chưa cấu hình xác thực Google Drive. Thêm mục [google_oauth] hoặc "
            "[gcp_service_account] vào .streamlit/secrets.toml (xem secrets.toml.example).")
    return build("drive", "v3", credentials=creds, cache_discovery=False)


class DriveStore:
    def __init__(self, service, folder_id=None, folder_name="LuuTruVanBan"):
        self.svc = service
        self.folder_id = folder_id or self._tim_hoac_tao_thu_muc(folder_name)

    # ---------- Thư mục ----------
    def _tim_hoac_tao_thu_muc(self, ten):
        q = (f"name = '{_escape_q(ten)}' and mimeType = '{FOLDER_MIME}' "
             f"and 'root' in parents and trashed = false")
        res = self.svc.files().list(q=q, fields="files(id)", pageSize=1).execute()
        if res.get("files"):
            return res["files"][0]["id"]
        meta = {"name": ten, "mimeType": FOLDER_MIME}
        return self.svc.files().create(body=meta, fields="id", supportsAllDrives=True).execute()["id"]

    # ---------- Tải lên ----------
    def tai_len(self, ten_file, du_lieu, trich_yeu, mime_type=None, **thong_tin):
        """Tải 1 file (mọi định dạng, giữ nguyên bản gốc) lên Drive kèm thông tin văn bản."""
        mime_type = (mime_type or mimetypes.guess_type(ten_file)[0]
                     or "application/octet-stream")
        props = {"app": APP_TAG}
        for k in META_KEYS:
            v = thong_tin.get(k)
            if v:
                props[k] = _cat_byte(v, 124 - len(k.encode()))
        body = {
            "name": ten_file,
            "parents": [self.folder_id],
            "description": trich_yeu.strip(),
            "appProperties": props,
        }
        media = MediaIoBaseUpload(io.BytesIO(du_lieu), mimetype=mime_type,
                                  chunksize=8 * 1024 * 1024, resumable=True)
        return self.svc.files().create(body=body, media_body=media, fields=FILE_FIELDS,
                                       supportsAllDrives=True).execute()

    # ---------- Liệt kê / tìm kiếm ----------
    def _list(self, q):
        files, token = [], None
        while True:
            res = self.svc.files().list(
                q=q, fields=f"nextPageToken, files({FILE_FIELDS})", pageSize=1000,
                pageToken=token, orderBy="createdTime desc",
                supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
            files.extend(res.get("files", []))
            token = res.get("nextPageToken")
            if not token:
                return files

    def danh_sach(self):
        """Toàn bộ văn bản trong thư mục lưu trữ."""
        q = (f"'{self.folder_id}' in parents and trashed = false "
             f"and mimeType != '{FOLDER_MIME}'")
        return self._list(q)

    def tim_toan_van(self, tu_khoa):
        """Tìm bằng chỉ mục toàn văn của Google (tên, mô tả và nội dung bên trong file)."""
        q = (f"'{self.folder_id}' in parents and trashed = false "
             f"and fullText contains '{_escape_q(tu_khoa)}'")
        return self._list(q)

    # ---------- Xuất file ----------
    def tai_ve(self, file):
        """Trả về (tên_file, bytes, mime) của file trên Drive."""
        mime = file.get("mimeType", "")
        ten = file["name"]
        if mime in GOOGLE_EXPORT:
            mime, duoi = GOOGLE_EXPORT[mime]
            req = self.svc.files().export_media(fileId=file["id"], mimeType=mime)
            if not ten.lower().endswith(duoi):
                ten += duoi
        else:
            req = self.svc.files().get_media(fileId=file["id"], supportsAllDrives=True)
        buf = io.BytesIO()
        dl = MediaIoBaseDownload(buf, req, chunksize=8 * 1024 * 1024)
        done = False
        while not done:
            _, done = dl.next_chunk()
        return ten, buf.getvalue(), mime

    def xoa(self, file_id):
        """Chuyển file vào thùng rác Drive (có thể khôi phục)."""
        self.svc.files().update(fileId=file_id, body={"trashed": True},
                                supportsAllDrives=True).execute()


def loc_ket_qua(files, tu_khoa="", loai=None, nam=None, chi_trich_yeu=False):
    """Lọc danh sách file theo từ khoá trích yếu, loại văn bản và năm ban hành."""
    out = []
    for f in files:
        p = f.get("appProperties") or {}
        if loai and p.get("loai_van_ban") != loai:
            continue
        if nam and not re.match(rf"^{nam}-", p.get("ngay_ban_hanh", "")):
            continue
        if not khop_tu_khoa(f, tu_khoa, chi_trich_yeu):
            continue
        out.append(f)
    return out

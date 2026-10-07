/**
 * LƯU TRỮ VĂN BẢN — Web app Google Apps Script
 *
 * - Đăng nhập bằng tài khoản Google (web app triển khai "Thực thi với tư cách: Người dùng truy cập").
 * - Tải file mọi định dạng lên thư mục Google Drive dùng chung.
 * - Tự động trích xuất trích yếu, số ký hiệu, ngày ban hành, loại văn bản, cơ quan ban hành
 *   và tóm tắt nội dung (OCR của Google Drive + quy tắc thể thức văn bản; dùng Claude AI nếu có khoá).
 * - Danh mục lưu trong Google Sheet cùng thư mục, phục vụ tìm kiếm và tải file.
 *
 * Cài đặt: xem README.md. Người sở hữu chạy hàm caiDat() một lần trong trình soạn thảo.
 */

var COT = ['id', 'tenFile', 'mimeType', 'dungLuong', 'soKyHieu', 'ngayBanHanh', 'loaiVanBan',
  'coQuan', 'trichYeu', 'tomTat', 'nguoiTai', 'thoiGianTai', 'link', 'noiDung', 'nguonTrichXuat'];
var TIEU_DE_COT = ['ID file', 'Tên file', 'Định dạng', 'Dung lượng (byte)', 'Số, ký hiệu',
  'Ngày ban hành', 'Loại văn bản', 'Cơ quan ban hành', 'Trích yếu', 'Tóm tắt nội dung',
  'Người tải lên', 'Thời gian tải', 'Link Drive', 'Nội dung (trích đoạn)', 'Nguồn trích xuất'];
var MAX_NOI_DUNG = 45000;          // giới hạn ô Google Sheet là 50.000 ký tự
var MAX_KY_TU_AI = 300000;         // độ dài văn bản tối đa gửi cho AI
var CLAUDE_MODEL_MAC_DINH = 'claude-opus-5-5';

var MIME_DOCS = /^(application\/pdf|image\/|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml|application\/rtf|text\/rtf|application\/vnd\.oasis\.opendocument\.text|text\/html)/;
var MIME_SHEETS = /^(application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml|application\/vnd\.oasis\.opendocument\.spreadsheet)/;
var MIME_SLIDES = /^(application\/vnd\.ms-powerpoint|application\/vnd\.openxmlformats-officedocument\.presentationml|application\/vnd\.oasis\.opendocument\.presentation)/;
var DUOI_MIME = {
  pdf: 'application/pdf', doc: 'application/msword', rtf: 'application/rtf', txt: 'text/plain', csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  tif: 'image/tiff', tiff: 'image/tiff', zip: 'application/zip', rar: 'application/vnd.rar'
};

// ===================== Cài đặt & web app =====================

/** Người sở hữu chạy 1 lần: tạo thư mục Drive + Google Sheet danh mục, lưu ID vào Script Properties. */
function caiDat() {
  var p = PropertiesService.getScriptProperties();
  var folderId = p.getProperty('FOLDER_ID');
  var folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.createFolder('LuuTruVanBan');
  var sheetId = p.getProperty('SHEET_ID');
  if (!sheetId) {
    var ss = SpreadsheetApp.create('Danh mục văn bản lưu trữ');
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    var sh = ss.getSheets()[0];
    sh.setName('DanhMuc');
    sh.getRange('A:O').setNumberFormat('@');  // để dạng chữ, tránh Sheets tự đổi ngày/số ký hiệu
    sh.getRange(1, 1, 1, TIEU_DE_COT.length).setValues([TIEU_DE_COT]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sheetId = ss.getId();
  }
  p.setProperties({ FOLDER_ID: folder.getId(), SHEET_ID: sheetId });
  Logger.log('Thư mục lưu trữ: ' + folder.getUrl());
  Logger.log('Danh mục: https://docs.google.com/spreadsheets/d/' + sheetId);
  Logger.log('Hãy chia sẻ thư mục trên (quyền Người chỉnh sửa) cho những người được dùng app.');
}

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  t.email = Session.getActiveUser().getEmail();
  return t.evaluate()
    .setTitle('Lưu trữ văn bản')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setFaviconUrl('https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png');
}

function include(ten) {
  return HtmlService.createHtmlOutputFromFile(ten).getContent();
}

// ===================== Quyền truy cập =====================

function cauHinh_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  if (!p.FOLDER_ID || !p.SHEET_ID) throw new Error('App chưa được cài đặt. Người quản trị cần chạy hàm caiDat().');
  return p;
}

function dsEmail_(s) {
  return String(s || '').toLowerCase().split(/[\s,;]+/).filter(String);
}

/** Kiểm tra người dùng: phải đăng nhập Google, có trong danh sách cho phép (nếu cấu hình). */
function kiemTraNguoiDung_() {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) throw new Error('Không xác định được tài khoản Google. Vui lòng đăng nhập.');
  var p = cauHinh_();
  var choPhep = dsEmail_(p.ALLOWED_EMAILS);
  var quanTri = dsEmail_(p.ADMIN_EMAILS);
  if (choPhep.length && choPhep.indexOf(email) < 0 && quanTri.indexOf(email) < 0) {
    throw new Error('Tài khoản ' + email + ' chưa được cấp quyền sử dụng app.');
  }
  return { email: email, laQuanTri: quanTri.indexOf(email) >= 0, cauHinh: p };
}

function sheet_(p) {
  return SpreadsheetApp.openById(p.SHEET_ID).getSheetByName('DanhMuc');
}

/** Thông tin ban đầu cho giao diện. */
function layThongTinBanDau() {
  var u = kiemTraNguoiDung_();
  return {
    email: u.email,
    laQuanTri: u.laQuanTri,
    coAI: !!u.cauHinh.CLAUDE_API_KEY,
    loaiVanBan: LOAI_VAN_BAN,
    linkThuMuc: 'https://drive.google.com/drive/folders/' + u.cauHinh.FOLDER_ID
  };
}

// ===================== Tải lên & trích xuất =====================

/**
 * Nhận 1 file từ trình duyệt ({ten, mimeType, base64}), lưu vào Drive, trích xuất thông tin,
 * ghi vào danh mục và trả về bản ghi.
 */
function taiLenVanBan(f) {
  var u = kiemTraNguoiDung_();
  var mime = f.mimeType || doanMime_(f.ten);
  var blob = Utilities.newBlob(Utilities.base64Decode(f.base64), mime, f.ten);
  var file = DriveApp.getFolderById(u.cauHinh.FOLDER_ID).createFile(blob);
  try {
    return lapChiMuc_(file, u);
  } catch (e) {
    file.setTrashed(true);
    throw e;
  }
}

/** Quét các file được thêm trực tiếp vào thư mục Drive (VD file quá lớn để tải qua web). */
function quetThuMuc() {
  var u = kiemTraNguoiDung_();
  var sh = sheet_(u.cauHinh);
  var daCo = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { daCo[r[0]] = true; });
  }
  var it = DriveApp.getFolderById(u.cauHinh.FOLDER_ID).getFiles();
  var batDau = Date.now(), moi = [], conLai = 0;
  while (it.hasNext()) {
    var file = it.next();
    if (daCo[file.getId()] || file.getId() === u.cauHinh.SHEET_ID || file.isTrashed()) continue;
    if (Date.now() - batDau > 4 * 60 * 1000) { conLai++; continue; }
    moi.push(lapChiMuc_(file, u));
  }
  return { moi: moi, conLai: conLai };
}

function lapChiMuc_(file, u) {
  var mime = file.getMimeType();
  var canhBao = [];
  var noiDung = '';
  try {
    noiDung = layNoiDungChu_(file.getBlob(), mime, file.getName());
  } catch (e) {
    canhBao.push('Không đọc được nội dung file: ' + e.message);
  }

  var tt = trichXuatThongTin(noiDung, file.getName());
  var nguon = noiDung ? 'Quy tắc thể thức' : 'Tên file';
  var key = u.cauHinh.CLAUDE_API_KEY;
  if (key) {
    try {
      var ai = phanTichBangClaude_(key, u.cauHinh.CLAUDE_MODEL || CLAUDE_MODEL_MAC_DINH, noiDung, file, mime, canhBao);
      if (ai) {
        ['trichYeu', 'soKyHieu', 'ngayBanHanh', 'loaiVanBan', 'coQuan', 'tomTat'].forEach(function (k) {
          if (ai[k]) tt[k] = ai[k];
        });
        nguon = 'Claude AI';
      }
    } catch (e) {
      canhBao.push('AI không phân tích được, dùng trích xuất tự động: ' + e.message);
    }
  }

  file.setDescription(tt.trichYeu + (tt.tomTat ? '\n\nTóm tắt: ' + tt.tomTat : ''));
  var banGhi = {
    id: file.getId(), tenFile: file.getName(), mimeType: mime, dungLuong: file.getSize(),
    soKyHieu: tt.soKyHieu, ngayBanHanh: tt.ngayBanHanh, loaiVanBan: tt.loaiVanBan, coQuan: tt.coQuan,
    trichYeu: tt.trichYeu, tomTat: tt.tomTat, nguoiTai: u.email,
    thoiGianTai: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm'),
    link: file.getUrl(), noiDung: noiDung.slice(0, MAX_NOI_DUNG), nguonTrichXuat: nguon
  };
  ghiBanGhi_(u.cauHinh, banGhi);
  var kq = rutGon_(banGhi);
  kq.canhBao = canhBao;
  return kq;
}

function doanMime_(ten) {
  var duoi = String(ten).split('.').pop().toLowerCase();
  return DUOI_MIME[duoi] || 'application/octet-stream';
}

/** Lấy chữ từ file: chuyển tạm sang Google Docs/Sheets/Slides (có OCR tiếng Việt), đọc chữ rồi xoá bản tạm. */
function layNoiDungChu_(blob, mime, ten) {
  if (/^text\/(plain|csv)|json|xml/.test(mime)) return blob.getDataAsString('UTF-8');
  var dich = MIME_DOCS.test(mime) ? MimeType.GOOGLE_DOCS
    : MIME_SHEETS.test(mime) ? MimeType.GOOGLE_SHEETS
    : MIME_SLIDES.test(mime) ? MimeType.GOOGLE_SLIDES : null;
  if (!dich) return '';
  var tam = Drive.Files.create({ name: '~tam_' + ten, mimeType: dich }, blob,
    { ocrLanguage: 'vi', fields: 'id' });
  try {
    if (dich === MimeType.GOOGLE_DOCS) return DocumentApp.openById(tam.id).getBody().getText();
    if (dich === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(tam.id).getSheets().map(function (s) {
        return s.getDataRange().getDisplayValues().map(function (r) { return r.join(' | '); }).join('\n');
      }).join('\n\n');
    }
    var chu = [];
    SlidesApp.openById(tam.id).getSlides().forEach(function (sl) {
      sl.getPageElements().forEach(function (pe) {
        if (pe.getPageElementType() === SlidesApp.PageElementType.SHAPE) chu.push(pe.asShape().getText().asString());
      });
    });
    return chu.join('\n');
  } finally {
    try { Drive.Files.remove(tam.id); } catch (e) { DriveApp.getFileById(tam.id).setTrashed(true); }
  }
}

// ===================== Claude AI (tuỳ chọn) =====================

var SCHEMA_AI = {
  type: 'object',
  properties: {
    trichYeu: { type: 'string', description: 'Trích yếu nội dung văn bản' },
    soKyHieu: { type: 'string' },
    ngayBanHanh: { type: 'string', description: 'yyyy-mm-dd, rỗng nếu không có' },
    loaiVanBan: { type: 'string' },
    coQuan: { type: 'string' },
    tomTat: { type: 'string' }
  },
  required: ['trichYeu', 'soKyHieu', 'ngayBanHanh', 'loaiVanBan', 'coQuan', 'tomTat'],
  additionalProperties: false
};

var HUONG_DAN_AI =
  'Bạn là chuyên viên văn thư lưu trữ của cơ quan nhà nước Việt Nam. Đọc văn bản được cung cấp và trích xuất:\n' +
  '- trichYeu: trích yếu nội dung đúng như ghi trên văn bản (dòng "V/v ..." hoặc dòng ngay dưới tên loại văn bản, ' +
  'VD "Về việc ban hành Kế hoạch ..."). Nếu văn bản không có trích yếu, viết một câu ngắn (dưới 30 từ) nêu nội dung chính.\n' +
  '- soKyHieu: số, ký hiệu văn bản (VD "15/QĐ-UBND"), rỗng nếu không có.\n' +
  '- ngayBanHanh: ngày ban hành dạng yyyy-mm-dd, rỗng nếu không có.\n' +
  '- loaiVanBan: chọn một trong: ' + LOAI_VAN_BAN.join(', ') + '.\n' +
  '- coQuan: cơ quan ban hành, rỗng nếu không rõ.\n' +
  '- tomTat: tóm tắt nội dung chính bằng tiếng Việt, 3–5 câu, nêu rõ việc gì, ai thực hiện, thời hạn, số liệu quan trọng.\n' +
  'Chỉ dựa vào nội dung văn bản, không suy đoán thông tin không có. Văn bản có thể là kết quả OCR nên có lỗi chính tả, hãy sửa khi chắc chắn.';

function phanTichBangClaude_(key, model, noiDung, file, mime, canhBao) {
  var noiDungGui;
  if (noiDung && noiDung.trim()) {
    var chu = noiDung;
    if (chu.length > MAX_KY_TU_AI) {
      chu = chu.slice(0, MAX_KY_TU_AI);
      canhBao.push('Văn bản rất dài, AI chỉ phân tích ' + MAX_KY_TU_AI.toLocaleString() + ' ký tự đầu.');
    }
    noiDungGui = [{ type: 'text', text: 'Tên file: ' + file.getName() + '\n\n<van_ban>\n' + chu + '\n</van_ban>' }];
  } else if ((mime === 'application/pdf' || /^image\/(jpeg|png|gif|webp)$/.test(mime)) && file.getSize() < 20 * 1024 * 1024) {
    // Không lấy được chữ: gửi trực tiếp PDF/ảnh cho Claude đọc
    var b64 = Utilities.base64Encode(file.getBlob().getBytes());
    var khoi = mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mime, data: b64 } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } };
    noiDungGui = [khoi, { type: 'text', text: 'Tên file: ' + file.getName() }];
  } else {
    return null;
  }

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify({
      model: model,
      max_tokens: 16000,
      fallbacks: 'default',
      system: HUONG_DAN_AI,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_AI } },
      messages: [{ role: 'user', content: noiDungGui }]
    })
  });
  var code = res.getResponseCode();
  var body = JSON.parse(res.getContentText());
  if (code !== 200) throw new Error('HTTP ' + code + ': ' + (body.error && body.error.message || res.getContentText().slice(0, 200)));
  if (body.stop_reason === 'refusal') throw new Error('AI từ chối phân tích văn bản này');
  if (body.stop_reason === 'max_tokens') throw new Error('Kết quả AI bị cắt ngắn');
  var text = (body.content || []).filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; }).join('');
  var kq = JSON.parse(text);
  if (kq.ngayBanHanh && !/^\d{4}-\d{2}-\d{2}$/.test(kq.ngayBanHanh)) kq.ngayBanHanh = '';
  return kq;
}

// ===================== Danh mục (Google Sheet) =====================

function ghiBanGhi_(p, bg) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    sheet_(p).appendRow(COT.map(function (k) { return k === 'dungLuong' ? bg[k] : String(bg[k] == null ? '' : bg[k]); }));
  } finally {
    lock.releaseLock();
  }
}

function docTatCa_(p) {
  var sh = sheet_(p);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, COT.length).getDisplayValues().map(function (r, i) {
    var o = { _dong: i + 2 };
    COT.forEach(function (k, j) { o[k] = r[j]; });
    return o;
  });
}

function rutGon_(bg) {
  var o = {};
  COT.forEach(function (k) { if (k !== 'noiDung') o[k] = bg[k]; });
  o.taiVe = 'https://drive.google.com/uc?export=download&id=' + bg.id;
  return o;
}

/**
 * Tìm kiếm theo trích yếu (không phân biệt hoa thường, có dấu/không dấu).
 * tc = { tuKhoa, loai, nam, phamVi: 'trichYeu' | 'tatCa' | 'noiDung' }
 */
function timKiem(tc) {
  var u = kiemTraNguoiDung_();
  tc = tc || {};
  var tu = boDau(tc.tuKhoa).split(/\s+/).filter(String);
  var kq = docTatCa_(u.cauHinh).filter(function (r) {
    if (tc.loai && r.loaiVanBan !== tc.loai) return false;
    if (tc.nam && String(r.ngayBanHanh).slice(0, 4) !== String(tc.nam)) return false;
    if (!tu.length) return true;
    var nguon = [r.trichYeu];
    if (tc.phamVi !== 'trichYeu') nguon.push(r.soKyHieu, r.tenFile, r.coQuan, r.tomTat);
    if (tc.phamVi === 'noiDung') nguon.push(r.noiDung);
    var s = boDau(nguon.join(' '));
    return tu.every(function (t) { return s.indexOf(t) >= 0; });
  });
  kq.sort(function (a, b) { return (b.ngayBanHanh || b.thoiGianTai) > (a.ngayBanHanh || a.thoiGianTai) ? 1 : -1; });
  return { tong: kq.length, ketQua: kq.slice(0, 200).map(function (r) {
    var o = rutGon_(r);
    o.coTheSua = u.laQuanTri || r.nguoiTai === u.email;
    return o;
  }) };
}

function timDong_(p, id) {
  var sh = sheet_(p);
  var n = sh.getLastRow() - 1;
  if (n < 1) return -1;
  var ids = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return -1;
}

function kiemTraQuyenSua_(u, sh, dong) {
  var nguoiTai = sh.getRange(dong, COT.indexOf('nguoiTai') + 1).getValue();
  if (!u.laQuanTri && nguoiTai !== u.email) throw new Error('Chỉ người tải lên hoặc quản trị viên mới được sửa/xoá văn bản này.');
}

/** Sửa thông tin văn bản (trích yếu, tóm tắt...). */
function capNhatVanBan(id, du) {
  var u = kiemTraNguoiDung_();
  var sh = sheet_(u.cauHinh);
  var dong = timDong_(u.cauHinh, id);
  if (dong < 0) throw new Error('Không tìm thấy văn bản.');
  kiemTraQuyenSua_(u, sh, dong);
  ['soKyHieu', 'ngayBanHanh', 'loaiVanBan', 'coQuan', 'trichYeu', 'tomTat'].forEach(function (k) {
    if (du[k] != null) sh.getRange(dong, COT.indexOf(k) + 1).setValue(String(du[k]));
  });
  if (du.trichYeu != null) {
    DriveApp.getFileById(id).setDescription(du.trichYeu + (du.tomTat ? '\n\nTóm tắt: ' + du.tomTat : ''));
  }
  return true;
}

/** Xoá văn bản: chuyển file vào thùng rác Drive và xoá khỏi danh mục. */
function xoaVanBan(id) {
  var u = kiemTraNguoiDung_();
  var sh = sheet_(u.cauHinh);
  var dong = timDong_(u.cauHinh, id);
  if (dong < 0) throw new Error('Không tìm thấy văn bản.');
  kiemTraQuyenSua_(u, sh, dong);
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* file đã bị xoá trên Drive */ }
  sh.deleteRow(dong);
  return true;
}

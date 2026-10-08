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
  'coQuan', 'trichYeu', 'tomTat', 'nguoiTai', 'thoiGianTai', 'link', 'noiDung', 'nguonTrichXuat',
  'nhomHoSo', 'kyHop', 'nhiemKy'];
var TIEU_DE_COT = ['ID file', 'Tên file', 'Định dạng', 'Dung lượng (byte)', 'Số, ký hiệu',
  'Ngày ban hành', 'Loại văn bản', 'Cơ quan ban hành', 'Trích yếu', 'Tóm tắt nội dung',
  'Người tải lên', 'Thời gian tải', 'Link Drive', 'Nội dung (trích đoạn)', 'Nguồn trích xuất',
  'Nhóm hồ sơ', 'Kỳ họp', 'Nhiệm kỳ'];
var MAX_NOI_DUNG = 45000;          // giới hạn ô Google Sheet là 50.000 ký tự
var MAX_KY_TU_AI = 300000;         // độ dài văn bản tối đa gửi cho AI
var CLAUDE_MODEL_MAC_DINH = 'claude-opus-5-5';

// ===================== Hồ sơ cấu hình: một bộ code, nhiều app =====================
// Mỗi dự án Apps Script có thuộc tính PROFILE riêng (mặc định CHUNG):
//   CHUNG = lưu trữ văn bản chung; HDND = lưu trữ công tác HĐND (thêm nhóm hồ sơ, kỳ họp, nhiệm kỳ).
// Dự án HĐND có thư mục Drive, Google Sheet, danh sách người dùng và đường link riêng.

var NHOM_HDND = {
  NGHI_QUYET: 'Nghị quyết HĐND',
  KY_HOP: 'Kỳ họp HĐND',
  THUONG_TRUC: 'Hoạt động Thường trực HĐND',
  BAN: 'Hoạt động các Ban của HĐND',
  GIAM_SAT: 'Giám sát, khảo sát',
  CU_TRI: 'Tiếp xúc cử tri, kiến nghị cử tri',
  CHAT_VAN: 'Chất vấn, trả lời chất vấn',
  DAI_BIEU: 'Hoạt động của đại biểu HĐND',
  CAP_TREN: 'Văn bản chỉ đạo, hướng dẫn của cấp trên',
  UBND: 'Tờ trình, báo cáo của UBND và cơ quan',
  KHAC: 'Khác'
};

var PROFILES = {
  CHUNG: {
    ma: 'CHUNG', ten: 'Lưu trữ văn bản', moTa: 'Tải lên · Tự động trích yếu · Tìm kiếm · Tải về',
    thuMuc: 'LuuTruVanBan', sheet: 'Danh mục văn bản lưu trữ', nhomHoSo: null, loaiVanBan: null
  },
  HDND: {
    ma: 'HDND', ten: 'Lưu trữ công tác HĐND', moTa: 'Nghị quyết · Kỳ họp · Giám sát · Cử tri · Tìm kiếm theo trích yếu',
    thuMuc: 'LuuTru_HDND', sheet: 'Danh mục hồ sơ công tác HĐND',
    nhomHoSo: [NHOM_HDND.NGHI_QUYET, NHOM_HDND.KY_HOP, NHOM_HDND.THUONG_TRUC, NHOM_HDND.BAN, NHOM_HDND.GIAM_SAT,
      NHOM_HDND.CU_TRI, NHOM_HDND.CHAT_VAN, NHOM_HDND.DAI_BIEU, NHOM_HDND.CAP_TREN, NHOM_HDND.UBND, NHOM_HDND.KHAC],
    loaiVanBan: ['Nghị quyết', 'Dự thảo nghị quyết', 'Chương trình', 'Kế hoạch', 'Báo cáo', 'Báo cáo thẩm tra',
      'Tờ trình', 'Biên bản', 'Thông báo', 'Giấy mời', 'Giấy triệu tập', 'Quyết định', 'Công văn', 'Kết luận',
      'Chỉ thị', 'Hướng dẫn', 'Đề án', 'Quy chế', 'Tổng hợp ý kiến cử tri', 'Danh sách đại biểu', 'Khác']
  }
};

function profile_() {
  var ma = PropertiesService.getScriptProperties().getProperty('PROFILE');
  return PROFILES[ma] || PROFILES.CHUNG;
}

function dsLoai_(prof) {
  return prof.loaiVanBan || LOAI_VAN_BAN;
}

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
  var prof = profile_();
  var folderId = p.getProperty('FOLDER_ID');
  var folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.createFolder(prof.thuMuc);
  var sheetId = p.getProperty('SHEET_ID');
  if (!sheetId) {
    var ss = SpreadsheetApp.create(prof.sheet);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    var sh = ss.getSheets()[0];
    sh.setName('DanhMuc');
    sh.getRange('A:R').setNumberFormat('@');  // để dạng chữ, tránh Sheets tự đổi ngày/số ký hiệu
    sh.getRange(1, 1, 1, TIEU_DE_COT.length).setValues([TIEU_DE_COT]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sheetId = ss.getId();
  }
  p.setProperties({ FOLDER_ID: folder.getId(), SHEET_ID: sheetId });
  Logger.log('Loại app: ' + prof.ten + ' (PROFILE=' + prof.ma + ')');
  Logger.log('Thư mục lưu trữ: ' + folder.getUrl());
  Logger.log('Danh mục: https://docs.google.com/spreadsheets/d/' + sheetId);
  Logger.log('Hãy chia sẻ thư mục trên (quyền Người chỉnh sửa) cho những người được dùng app.');
}

/** Dùng cho dự án HĐND: đặt PROFILE=HDND rồi cài đặt (tạo thư mục LuuTru_HDND và Sheet riêng). */
function caiDatHDND() {
  PropertiesService.getScriptProperties().setProperty('PROFILE', 'HDND');
  caiDat();
}

function doGet() {
  var prof = profile_();
  var t = HtmlService.createTemplateFromFile('Index');
  t.email = Session.getActiveUser().getEmail();
  t.ten = prof.ten;
  t.moTa = prof.moTa;
  return t.evaluate()
    .setTitle(prof.ten)
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
  var sh = SpreadsheetApp.openById(p.SHEET_ID).getSheetByName('DanhMuc');
  if (sh.getRange(1, COT.length).getValue() === '') {   // sổ danh mục cũ chưa có các cột mới
    if (sh.getMaxColumns() < COT.length) sh.insertColumnsAfter(sh.getMaxColumns(), COT.length - sh.getMaxColumns());
    sh.getRange(1, 1, sh.getMaxRows(), COT.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, COT.length).setValues([TIEU_DE_COT]).setFontWeight('bold');
  }
  return sh;
}

/** Thông tin ban đầu cho giao diện. */
function layThongTinBanDau() {
  var u = kiemTraNguoiDung_();
  var prof = profile_();
  return {
    email: u.email,
    laQuanTri: u.laQuanTri,
    coAI: !!u.cauHinh.CLAUDE_API_KEY,
    tenApp: prof.ten,
    nhomHoSo: prof.nhomHoSo || [],
    loaiVanBan: dsLoai_(prof),
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
    return lapChiMuc_(file, u, { nhomHoSo: f.nhomHoSo, kyHop: f.kyHop });
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

function lapChiMuc_(file, u, tuyChon) {
  var prof = profile_();
  var mime = file.getMimeType();
  var canhBao = [];
  var noiDung = '';
  try {
    noiDung = layNoiDungChu_(file.getBlob(), mime, file.getName());
  } catch (e) {
    canhBao.push('Không đọc được nội dung file: ' + e.message);
  }

  var tt = trichXuatThongTin(noiDung, file.getName(), dsLoai_(prof));
  tt.nhomHoSo = ''; tt.kyHop = ''; tt.nhiemKy = '';
  if (prof.nhomHoSo) {
    var h = trichXuatHDND_(noiDung, file.getName(), tt);
    tt.nhomHoSo = h.nhomHoSo; tt.kyHop = h.kyHop; tt.nhiemKy = h.nhiemKy;
  }
  var nguon = noiDung ? 'Quy tắc thể thức' : 'Tên file';
  var key = u.cauHinh.CLAUDE_API_KEY;
  if (key) {
    try {
      var ai = phanTichBangClaude_(key, u.cauHinh.CLAUDE_MODEL || CLAUDE_MODEL_MAC_DINH, noiDung, file, mime, canhBao);
      if (ai) {
        ['trichYeu', 'soKyHieu', 'ngayBanHanh', 'loaiVanBan', 'coQuan', 'tomTat'].concat(prof.nhomHoSo ? ['nhomHoSo', 'kyHop', 'nhiemKy'] : [])
          .forEach(function (k) { if (ai[k]) tt[k] = ai[k]; });
        if (prof.nhomHoSo && prof.nhomHoSo.indexOf(tt.nhomHoSo) < 0) tt.nhomHoSo = NHOM_HDND.KHAC;
        nguon = 'Claude AI';
      }
    } catch (e) {
      canhBao.push('AI không phân tích được, dùng trích xuất tự động: ' + e.message);
    }
  }

  if (prof.nhomHoSo && tuyChon) {   // người tải lên chọn sẵn thì ưu tiên hơn nhận dạng tự động
    if (tuyChon.nhomHoSo && prof.nhomHoSo.indexOf(tuyChon.nhomHoSo) >= 0) tt.nhomHoSo = tuyChon.nhomHoSo;
    if (tuyChon.kyHop) tt.kyHop = String(tuyChon.kyHop).trim().slice(0, 100);
  }
  file.setDescription(tt.trichYeu + (tt.tomTat ? '\n\nTóm tắt: ' + tt.tomTat : ''));
  var banGhi = {
    id: file.getId(), tenFile: file.getName(), mimeType: mime, dungLuong: file.getSize(),
    soKyHieu: tt.soKyHieu, ngayBanHanh: tt.ngayBanHanh, loaiVanBan: tt.loaiVanBan, coQuan: tt.coQuan,
    trichYeu: tt.trichYeu, tomTat: tt.tomTat, nguoiTai: u.email,
    thoiGianTai: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm'),
    link: file.getUrl(), noiDung: noiDung.slice(0, MAX_NOI_DUNG), nguonTrichXuat: nguon,
    nhomHoSo: tt.nhomHoSo, kyHop: tt.kyHop, nhiemKy: tt.nhiemKy
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

function schemaAI_(prof) {
  var sc = {
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
  if (prof.nhomHoSo) {
    sc.properties.nhomHoSo = { type: 'string', enum: prof.nhomHoSo };
    sc.properties.kyHop = { type: 'string', description: 'Kỳ họp HĐND liên quan, VD "Kỳ họp thứ 3", rỗng nếu không có' };
    sc.properties.nhiemKy = { type: 'string', description: 'Nhiệm kỳ HĐND, VD "2026-2031", rỗng nếu không có' };
    sc.required = sc.required.concat(['nhomHoSo', 'kyHop', 'nhiemKy']);
  }
  return sc;
}

// Viết dạng hàm vì Apps Script nạp Code.gs trước TrichXuat.gs (nơi khai báo LOAI_VAN_BAN)
function huongDanAI_(prof) {
  prof = prof || profile_();
  var themHDND = !prof.nhomHoSo ? '' :
    '- nhomHoSo: phân loại hồ sơ công tác của HĐND xã vào đúng một nhóm trong: ' + prof.nhomHoSo.join('; ') + '.\n' +
    '- kyHop: kỳ họp HĐND mà văn bản thuộc về (VD "Kỳ họp thứ 3"), rỗng nếu không có.\n' +
    '- nhiemKy: nhiệm kỳ HĐND (VD "2026-2031"), rỗng nếu không nêu.\n';
  return 'Bạn là chuyên viên văn thư lưu trữ của cơ quan nhà nước Việt Nam. Đọc văn bản được cung cấp và trích xuất:\n' +
  '- trichYeu: trích yếu nội dung đúng như ghi trên văn bản (dòng "V/v ..." hoặc dòng ngay dưới tên loại văn bản, ' +
  'VD "Về việc ban hành Kế hoạch ..."). Nếu văn bản không có trích yếu, viết một câu ngắn (dưới 30 từ) nêu nội dung chính.\n' +
  '- soKyHieu: số, ký hiệu văn bản (VD "15/QĐ-UBND"), rỗng nếu không có.\n' +
  '- ngayBanHanh: ngày ban hành dạng yyyy-mm-dd, rỗng nếu không có.\n' +
  '- loaiVanBan: chọn một trong: ' + dsLoai_(prof).join(', ') + '.\n' + themHDND +
  '- coQuan: cơ quan ban hành, rỗng nếu không rõ.\n' +
  '- tomTat: tóm tắt nội dung chính bằng tiếng Việt, 3–5 câu, nêu rõ việc gì, ai thực hiện, thời hạn, số liệu quan trọng.\n' +
  'Chỉ dựa vào nội dung văn bản, không suy đoán thông tin không có. Văn bản có thể là kết quả OCR nên có lỗi chính tả, hãy sửa khi chắc chắn.';
}

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
      system: huongDanAI_(profile_()),
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schemaAI_(profile_()) } },
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
  var tatCa = docTatCa_(u.cauHinh);
  var kyHopSet = {};
  tatCa.forEach(function (r) { if (r.kyHop) kyHopSet[r.kyHop] = true; });
  var kq = tatCa.filter(function (r) {
    if (tc.loai && r.loaiVanBan !== tc.loai) return false;
    if (tc.nhom && r.nhomHoSo !== tc.nhom) return false;
    if (tc.kyHop && r.kyHop !== tc.kyHop) return false;
    if (tc.nam && String(r.ngayBanHanh).slice(0, 4) !== String(tc.nam)) return false;
    if (!tu.length) return true;
    var nguon = [r.trichYeu];
    if (tc.phamVi !== 'trichYeu') nguon.push(r.soKyHieu, r.tenFile, r.coQuan, r.tomTat, r.nhomHoSo, r.kyHop);
    if (tc.phamVi === 'noiDung') nguon.push(r.noiDung);
    var s = boDau(nguon.join(' '));
    return tu.every(function (t) { return s.indexOf(t) >= 0; });
  });
  kq.sort(function (a, b) { return (b.ngayBanHanh || b.thoiGianTai) > (a.ngayBanHanh || a.thoiGianTai) ? 1 : -1; });
  var soKy = function (x) { var m = /(\d+)/.exec(x); return m ? +m[1] : 0; };
  var dsKyHop = Object.keys(kyHopSet).sort(function (a, b) { return soKy(b) - soKy(a) || (a < b ? -1 : 1); });
  return { tong: kq.length, dsKyHop: dsKyHop, ketQua: kq.slice(0, 200).map(function (r) {
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
  ['soKyHieu', 'ngayBanHanh', 'loaiVanBan', 'coQuan', 'trichYeu', 'tomTat', 'nhomHoSo', 'kyHop', 'nhiemKy'].forEach(function (k) {
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

// ============================================================================
// ===================== Trích xuất thông tin văn bản (không cần AI) ==========
// ============================================================================

/**
 * Trích xuất thông tin văn bản hành chính từ nội dung chữ (không cần AI).
 * Dựa theo thể thức văn bản (Nghị định 30/2020/NĐ-CP):
 *   Cơ quan ban hành / Số, ký hiệu / Địa danh, ngày tháng / TÊN LOẠI VĂN BẢN / Trích yếu / Nội dung.
 * Các hàm ở đây là JavaScript thuần để chạy được cả trong Apps Script lẫn Node (kiểm thử).
 */

var LOAI_VAN_BAN = [
  'Nghị quyết', 'Quyết định', 'Chỉ thị', 'Kết luận', 'Quy chế', 'Quy định', 'Thông báo',
  'Hướng dẫn', 'Chương trình', 'Kế hoạch', 'Phương án', 'Đề án', 'Dự án', 'Báo cáo',
  'Biên bản', 'Tờ trình', 'Hợp đồng', 'Công văn', 'Công điện', 'Giấy mời', 'Giấy giới thiệu',
  'Thông tư', 'Nghị định', 'Luật', 'Quy trình', 'Bản ghi nhớ', 'Đơn', 'Khác'
];

/** Bỏ dấu tiếng Việt, chữ thường — dùng cho tìm kiếm. */
function boDau(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function chuanHoaDong_(text) {
  return String(text || '').normalize('NFC').replace(/\r/g, '\n')
    .split('\n').map(function (l) { return l.replace(/[\t  ]+/g, ' ').trim(); });
}

var RE_NGAY = /ng[àa]y\s+(\d{1,2})\s+th[áa]ng\s+(\d{1,2})\s+n[ăa]m\s+(\d{4})/i;
var RE_DONG_DUNG = new RegExp('^(căn cứ|kính gửi|thực hiện|theo đề nghị|xét đề nghị|xét|theo|' +
  'nơi nhận|phần|chương|điều \\d|[ivx]+\\.|\\d+\\.|chủ tịch|ủy ban|uỷ ban|hội đồng|ban chấp hành|' +
  'đảng ủy|đảng uỷ|cộng hòa|cộng hoà|độc lập|[-_*=.…]{3,})', 'i');

function laDauDe_(l) {
  return /^(CỘNG H[ÒO]A|Độc lập|ĐỘC LẬP|[-_*=]{3,})/.test(l) || RE_NGAY.test(l);
}

function timTenLoai_(dong, dsLoai) {
  dsLoai = dsLoai || LOAI_VAN_BAN;
  for (var i = 0; i < Math.min(dong.length, 80); i++) {
    var l = dong[i];
    if (!l || l !== l.toUpperCase() || l.length > 40) continue;
    for (var j = 0; j < dsLoai.length; j++) {
      if (l.replace(/\s+/g, ' ') === dsLoai[j].toUpperCase()) return { loai: dsLoai[j], dong: i };
    }
  }
  return null;
}

function gomDong_(dong, batDau, toiDa) {
  var out = [];
  for (var i = batDau; i < dong.length && out.length < toiDa; i++) {
    var l = dong[i];
    if (!l) { if (out.length) break; else continue; }
    if (laDauDe_(l) || RE_DONG_DUNG.test(l) || /^Số\s*[:.]/i.test(l)) break;
    out.push(l);
  }
  gomDong_.het = i;
  return out.join(' ').replace(/\s+/g, ' ').replace(/^[\s:.\-–]+|[\s\-–]+$/g, '').trim();
}

/**
 * Trả về { trichYeu, soKyHieu, ngayBanHanh (yyyy-mm-dd), loaiVanBan, coQuan, tomTat }.
 * Trường nào không tìm được để chuỗi rỗng.
 */
function trichXuatThongTin(text, tenFile, dsLoai) {
  var dong = chuanHoaDong_(text);
  var kq = { trichYeu: '', soKyHieu: '', ngayBanHanh: '', loaiVanBan: '', coQuan: '', tomTat: '' };
  var dau = dong.slice(0, 80).join('\n');

  var so = dau.match(/S[ốo]\s*[:.]?\s*(\d+[\w\-–.]*\s*\/\s*[\wĐđ\-–\/.]+)/i);
  if (so) kq.soKyHieu = so[1].replace(/\s+/g, '').replace(/[.,;]+$/, '');

  var ngay = dau.match(RE_NGAY);
  if (ngay) {
    var d = +ngay[1], m = +ngay[2];
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      kq.ngayBanHanh = ngay[3] + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
    }
  }

  // Cơ quan ban hành: các dòng chữ hoa đầu văn bản, trước "Số"/"CỘNG HÒA"
  var cq = [];
  for (var i = 0; i < Math.min(dong.length, 8) && cq.length < 2; i++) {
    var l = dong[i];
    if (!l) continue;
    if (/^S[ốo]\s*[:.]/i.test(l) || laDauDe_(l)) break;
    if (l === l.toUpperCase() && /[A-ZÀ-Ỹ]/.test(l) && l.length <= 80) cq.push(l);
  }
  kq.coQuan = cq.join(' ').replace(/\s+/g, ' ');

  // Trích yếu
  var viTriKetThuc = -1;
  var vv = -1;
  for (i = 0; i < Math.min(dong.length, 80); i++) {
    if (/^V\/v\b/i.test(dong[i]) || /^Về việc\b/i.test(dong[i]) && i < 15) { vv = i; break; }
  }
  var tenLoai = timTenLoai_(dong, dsLoai);
  if (tenLoai) {
    kq.loaiVanBan = tenLoai.loai;
    kq.trichYeu = gomDong_(dong, tenLoai.dong + 1, 4);
    viTriKetThuc = gomDong_.het;
  }
  if (!kq.trichYeu && vv >= 0) {
    var dau1 = dong[vv].replace(/^V\/v\s*[:.]?\s*/i, '');
    var tiep = gomDong_(dong, vv + 1, 3);
    kq.trichYeu = (dau1 + ' ' + tiep).trim();
    if (/^V\/v/i.test(dong[vv])) kq.trichYeu = 'V/v ' + kq.trichYeu;
    if (!kq.loaiVanBan) kq.loaiVanBan = 'Công văn';
    viTriKetThuc = gomDong_.het;
  }
  if (!kq.trichYeu) {
    for (i = 0; i < dong.length; i++) {
      l = dong[i];
      if (l.length >= 20 && !laDauDe_(l) && l !== l.toUpperCase()) { kq.trichYeu = l.slice(0, 250); viTriKetThuc = i + 1; break; }
    }
  }
  if (!kq.trichYeu && tenFile) kq.trichYeu = String(tenFile).replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');

  kq.tomTat = tomTatDonGian_(dong, Math.max(viTriKetThuc, 0));
  return kq;
}

/** Tóm tắt đơn giản: lấy các câu nội dung chính đầu tiên (bỏ phần căn cứ, kính gửi...). */
function tomTatDonGian_(dong, batDau) {
  var cau = [];
  var doDai = 0;
  for (var i = batDau; i < dong.length && doDai < 600; i++) {
    var l = dong[i];
    if (!l || laDauDe_(l)) continue;
    if (/^(căn cứ|kính gửi|xét|theo đề nghị|nơi nhận|-\s*(như|lưu))/i.test(l)) continue;
    if (/^(QUYẾT ĐỊNH|QUYẾT NGHỊ|CHỈ THỊ)\s*:?$/.test(l)) continue;
    if (l.length < 4 || (l === l.toUpperCase() && l.length < 80)) continue;
    cau.push(l);
    doDai += l.length + 1;
  }
  var s = cau.join(' ').replace(/\s+/g, ' ').trim();
  if (s.length > 600) s = s.slice(0, 600).replace(/\s+\S*$/, '') + '…';
  return s;
}

// ============================================================================
// ===================== Nhận dạng hồ sơ công tác HĐND ========================
// ============================================================================

function nhanDangNhom_(s, tt) {
  var N = NHOM_HDND;
  var hdndBanHanh = boDau(tt.coQuan).indexOf('hoi dong nhan dan') >= 0;
  if (/nghi quyet/.test(boDau(tt.loaiVanBan)) && hdndBanHanh) return N.NGHI_QUYET;
  if (/cu tri/.test(s) && /(tiep xuc|y kien|kien nghi|nguyen vong)/.test(s)) return N.CU_TRI;
  if (/chat van/.test(s)) return N.CHAT_VAN;
  if (/(giam sat|khao sat)/.test(s)) return N.GIAM_SAT;
  if (/tham tra/.test(s) || /\bban (phap che|kinh te|van hoa|kinh te - xa hoi)\b/.test(s)) return N.BAN;
  if (/ky hop/.test(s)) return N.KY_HOP;
  if (/thuong truc (hdnd|hoi dong nhan dan)/.test(s)) return N.THUONG_TRUC;
  if (/dai bieu (hdnd|hoi dong nhan dan)/.test(s)) return N.DAI_BIEU;
  return '';
}

/**
 * Từ nội dung chữ: đoán nhóm hồ sơ, kỳ họp, nhiệm kỳ của hồ sơ HĐND.
 * Chỉ là gợi ý ban đầu: người dùng có thể sửa trên thẻ văn bản hoặc chọn sẵn khi tải lên.
 */
function trichXuatHDND_(text, tenFile, tt) {
  var N = NHOM_HDND;
  var ten = String(tenFile || '');
  var chu = String(text || '').normalize('NFC');
  var vung = chu.slice(0, 3000);
  var kq = { nhomHoSo: '', kyHop: '', nhiemKy: '' };

  var m = /k[ỳy]\s+h[ọo]p\s+th[ứu]\s+([0-9]+|[^\s,.;:()]+)/i.exec(ten + '\n' + vung);
  if (m) {
    kq.kyHop = 'Kỳ họp thứ ' + m[1];
    var sau = (ten + '\n' + vung).slice(m.index + m[0].length, m.index + m[0].length + 40);
    var hau = /^\s*[,(–-]?\s*(chuyên đề|bất thường|thường lệ|cuối năm|giữa năm)/i.exec(sau);
    if (hau) kq.kyHop += ' (' + hau[1].toLowerCase() + ')';
  }
  var nk = /nhi[ệe]m\s+k[ỳy]\s*(20\d\d)\s*[-–—]\s*(20\d\d)/i.exec(ten + '\n' + vung);
  if (nk) kq.nhiemKy = nk[1] + '-' + nk[2];

  var cq = boDau(tt.coQuan);   // văn bản do cấp trên ban hành (tỉnh, Trung ương, sở, bộ...) luôn vào nhóm chỉ đạo của cấp trên
  var capTren = !/(^|\s)xa(\s|$)/.test(cq) && /(^|\s)(tinh|trung uong|quoc hoi|chinh phu|thu tuong|so|bo)(\s|$)/.test(cq);
  kq.nhomHoSo = capTren ? N.CAP_TREN : (nhanDangNhom_(boDau(ten + ' ' + chu.slice(0, 800)), tt) ||
    nhanDangNhom_(boDau(ten + ' ' + vung), tt));
  if (!kq.nhomHoSo) {
    var coQuan = boDau(tt.coQuan), loai = boDau(tt.loaiVanBan);
    if (coQuan.indexOf('hoi dong nhan dan') < 0 && /(chi thi|cong van|huong dan|thong tu|nghi dinh|luat|cong dien)/.test(loai)) kq.nhomHoSo = N.CAP_TREN;
    else if (coQuan.indexOf('uy ban nhan dan') >= 0 && /(to trinh|bao cao)/.test(loai)) kq.nhomHoSo = N.UBND;
    else kq.nhomHoSo = N.KHAC;
  }
  return kq;
}

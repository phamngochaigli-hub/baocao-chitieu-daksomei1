/**
 * HỆ THỐNG GIAO VIỆC VÀ THEO DÕI NHIỆM VỤ TỪ VĂN BẢN — phiên bản Google Apps Script
 *
 * Quy trình: Văn bản mới → AI đọc → xác định nhiệm vụ → phân công cơ quan/cá nhân
 * → đặt hạn → theo dõi → cảnh báo → tạo báo cáo → cán bộ kiểm duyệt.
 *
 * Dữ liệu: các trang tính của Google Sheet chứa mã này; tệp văn bản gốc và báo cáo
 * đã duyệt lưu trong thư mục Google Drive do bước «Cài đặt lần đầu» tạo ra.
 *
 * Cài đặt: xem HUONG_DAN.md (chỉ cần dán 2 tệp Code.gs và Index.html).
 */

// ===========================================================================
// 1. CẤU HÌNH CHUNG
// ===========================================================================
var MODEL_MAC_DINH = 'claude-opus-5-5';
var API_URL = 'https://api.anthropic.com/v1/messages';
var THOI_GIAN_PHIEN_GIAY = 6 * 60 * 60; // phiên đăng nhập 6 giờ

var VAI_TRO = {
  quan_tri: 'Quản trị',
  chuyen_vien: 'Chuyên viên tổng hợp',
  can_bo_duyet: 'Cán bộ kiểm duyệt',
  don_vi: 'Đơn vị thực hiện'
};

var TRANG_THAI = ['Mới giao', 'Đang thực hiện', 'Hoàn thành'];
var BC = { NHAP: 'Nháp', CHO_DUYET: 'Chờ duyệt', DA_DUYET: 'Đã duyệt', YEU_CAU_SUA: 'Yêu cầu chỉnh sửa' };
var CB = { QUA_HAN: 'Quá hạn', SAP_DEN_HAN: 'Sắp đến hạn', TRONG_HAN: 'Trong hạn', KHONG_HAN: 'Không có hạn', DA_XONG: 'Đã hoàn thành' };
var THU_TU_CB = [CB.QUA_HAN, CB.SAP_DEN_HAN, CB.TRONG_HAN, CB.KHONG_HAN, CB.DA_XONG];

// Mỗi bảng: tên trang tính và danh sách [khóa nội bộ, tiêu đề cột].
var BANG = {
  CAU_HINH: { ten: 'CauHinh', cot: [['khoa', 'Khóa'], ['giaTri', 'Giá trị'], ['ghiChu', 'Ghi chú']] },
  NGUOI_DUNG: { ten: 'NguoiDung', cot: [
    ['tenDangNhap', 'Tên đăng nhập'], ['hoTen', 'Họ tên'], ['vaiTro', 'Vai trò'], ['donVi', 'Đơn vị'],
    ['email', 'Email'], ['matKhau', 'Mật khẩu (đã mã hóa)']] },
  DON_VI: { ten: 'DonVi', cot: [['ten', 'Tên đơn vị'], ['email', 'Email nhận nhắc việc']] },
  VAN_BAN: { ten: 'VanBan', cot: [
    ['id', 'ID'], ['soHieu', 'Số, ký hiệu'], ['trichYeu', 'Trích yếu'], ['coQuanBanHanh', 'Cơ quan ban hành'],
    ['ngayBanHanh', 'Ngày ban hành'], ['tomTat', 'Tóm tắt'], ['tep', 'Tệp gốc'], ['tepId', 'Tệp ID'],
    ['nguoiNhap', 'Người nhập'], ['thoiDiem', 'Thời điểm nhập']] },
  NHIEM_VU: { ten: 'NhiemVu', cot: [
    ['id', 'ID'], ['vanBanId', 'Văn bản ID'], ['soHieuVanBan', 'Số hiệu văn bản'], ['noiDung', 'Nội dung nhiệm vụ'],
    ['trichDan', 'Trích dẫn'], ['chuTri', 'Đơn vị chủ trì'], ['phoiHop', 'Đơn vị phối hợp'],
    ['caNhan', 'Cá nhân phụ trách'], ['han', 'Hạn xử lý'], ['trangThai', 'Trạng thái'], ['tienDo', 'Tiến độ (%)'],
    ['ketQua', 'Kết quả'], ['nguoiGiao', 'Người giao'], ['ngayGiao', 'Ngày giao'],
    ['ngayHoanThanh', 'Ngày hoàn thành'], ['capNhatCuoi', 'Cập nhật lần cuối']] },
  LICH_SU: { ten: 'LichSu', cot: [
    ['thoiDiem', 'Thời điểm'], ['nhiemVuId', 'Nhiệm vụ ID'], ['nguoi', 'Người cập nhật'], ['trangThai', 'Trạng thái'],
    ['tienDo', 'Tiến độ (%)'], ['ghiChu', 'Ghi chú']] },
  BAO_CAO: { ten: 'BaoCao', cot: [
    ['id', 'ID'], ['tieuDe', 'Tiêu đề'], ['tuNgay', 'Từ ngày'], ['denNgay', 'Đến ngày'], ['donVi', 'Đơn vị'],
    ['noiDung', 'Nội dung'], ['trangThai', 'Trạng thái'], ['nguoiLap', 'Người lập'], ['thoiDiemLap', 'Thời điểm lập'],
    ['nguoiDuyet', 'Người duyệt'], ['thoiDiemDuyet', 'Thời điểm duyệt'], ['yKien', 'Ý kiến kiểm duyệt'],
    ['tep', 'Tệp đã duyệt']] }
};

var DON_VI_MAU = [
  'Văn phòng HĐND và UBND', 'Phòng Kinh tế', 'Phòng Văn hóa - Xã hội', 'Ban Chỉ huy Quân sự',
  'Công an xã', 'Ban Xây dựng Đảng', 'Ủy ban MTTQ Việt Nam'
];

// ===========================================================================
// 2. MENU TRONG GOOGLE SHEET VÀ CÀI ĐẶT
// ===========================================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📋 Nhiệm vụ')
    .addItem('1. Cài đặt lần đầu', 'caiDatLanDau')
    .addItem('2. Nhập khóa API Claude', 'nhapKhoaApi')
    .addItem('3. Đặt mật khẩu cho người dùng', 'datMatKhau')
    .addSeparator()
    .addItem('Gửi email nhắc việc ngay', 'guiNhacViecHangNgay')
    .addItem('Mở ứng dụng', 'moUngDung')
    .addToUi();
}

function caiDatLanDau() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();
  Object.keys(BANG).forEach(function (k) { taoTrangTinh_(ss, BANG[k]); });

  var cauHinh = docCauHinh_();
  if (!cauHinh.TEN_CO_QUAN) {
    var tl = ui.prompt('Cài đặt', 'Tên cơ quan (ví dụ: UBND xã Đăk Sơmei):', ui.ButtonSet.OK_CANCEL);
    if (tl.getSelectedButton() !== ui.Button.OK) return;
    ghiCauHinh_('TEN_CO_QUAN', tl.getResponseText().trim() || 'UBND XÃ', 'Hiển thị trên báo cáo');
  }
  if (!cauHinh.SO_NGAY_BAO_TRUOC) ghiCauHinh_('SO_NGAY_BAO_TRUOC', 3, 'Cảnh báo «sắp đến hạn» khi còn ≤ N ngày');
  if (!cauHinh.MODEL) ghiCauHinh_('MODEL', MODEL_MAC_DINH, 'Mô hình Claude dùng để đọc văn bản');

  var thuMucGoc = cauHinh.THU_MUC_GOC_ID ? DriveApp.getFolderById(cauHinh.THU_MUC_GOC_ID) : null;
  if (!thuMucGoc) {
    thuMucGoc = DriveApp.createFolder('Hệ thống nhiệm vụ - ' + ss.getName());
    DriveApp.getFileById(ss.getId()).moveTo(thuMucGoc);
    ghiCauHinh_('THU_MUC_GOC_ID', thuMucGoc.getId(), 'Thư mục Drive chứa toàn bộ dữ liệu');
    ghiCauHinh_('THU_MUC_VAN_BAN_ID', thuMucGoc.createFolder('Văn bản gốc').getId(), '');
    ghiCauHinh_('THU_MUC_BAO_CAO_ID', thuMucGoc.createFolder('Báo cáo đã duyệt').getId(), '');
  }

  if (docBang_(BANG.DON_VI).length === 0) {
    DON_VI_MAU.forEach(function (t) { themDong_(BANG.DON_VI, { ten: t, email: '' }); });
  }
  if (docBang_(BANG.NGUOI_DUNG).length === 0) {
    var mk = ui.prompt('Tài khoản quản trị',
      'Đặt mật khẩu cho tài khoản «quantri» (ít nhất 6 ký tự):', ui.ButtonSet.OK_CANCEL);
    if (mk.getSelectedButton() !== ui.Button.OK || mk.getResponseText().length < 6) {
      ui.alert('Chưa tạo tài khoản quản trị. Hãy chạy lại «Cài đặt lần đầu».');
      return;
    }
    themDong_(BANG.NGUOI_DUNG, {
      tenDangNhap: 'quantri', hoTen: 'Quản trị viên', vaiTro: 'quan_tri', donVi: '',
      email: Session.getActiveUser().getEmail(), matKhau: bamMatKhau_(mk.getResponseText())
    });
  }

  // Nhắc việc tự động lúc 7 giờ sáng hằng ngày.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'guiNhacViecHangNgay') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('guiNhacViecHangNgay').timeBased().everyDays(1).atHour(7).create();

  ui.alert('Đã cài đặt xong.\n\n'
    + 'Bước tiếp theo:\n'
    + '• Menu 📋 Nhiệm vụ → «Nhập khóa API Claude» (để AI đọc văn bản).\n'
    + '• Khai báo đơn vị ở trang DonVi, người dùng ở trang NguoiDung, rồi dùng menu «Đặt mật khẩu».\n'
    + '• Triển khai ứng dụng web: Tiện ích mở rộng → Apps Script → Triển khai → Tùy chọn triển khai mới → Ứng dụng web.');
}

function taoTrangTinh_(ss, bang) {
  var sh = ss.getSheetByName(bang.ten) || ss.insertSheet(bang.ten);
  if (sh.getLastRow() === 0) {
    var tieuDe = bang.cot.map(function (c) { return c[1]; });
    sh.appendRow(tieuDe);
    sh.getRange(1, 1, 1, tieuDe.length).setFontWeight('bold').setBackground('#e8eaed');
    sh.setFrozenRows(1);
  }
  return sh;
}

function nhapKhoaApi() {
  var ui = SpreadsheetApp.getUi();
  var tl = ui.prompt('Khóa API Claude',
    'Dán khóa API (bắt đầu bằng sk-ant-) lấy tại https://console.anthropic.com.\n'
    + 'Khóa được lưu trong Thuộc tính tập lệnh, không hiển thị trên trang tính.\nĐể trống để xóa khóa.',
    ui.ButtonSet.OK_CANCEL);
  if (tl.getSelectedButton() !== ui.Button.OK) return;
  var khoa = tl.getResponseText().trim();
  var props = PropertiesService.getScriptProperties();
  if (khoa) props.setProperty('ANTHROPIC_API_KEY', khoa); else props.deleteProperty('ANTHROPIC_API_KEY');
  ui.alert(khoa ? 'Đã lưu khóa API.' : 'Đã xóa khóa API. Ứng dụng sẽ dùng quy tắc đơn giản để gợi ý nhiệm vụ.');
}

function datMatKhau() {
  var ui = SpreadsheetApp.getUi();
  var ten = ui.prompt('Đặt mật khẩu', 'Tên đăng nhập (đã khai báo ở trang NguoiDung):', ui.ButtonSet.OK_CANCEL);
  if (ten.getSelectedButton() !== ui.Button.OK) return;
  var nd = timNguoiDung_(ten.getResponseText().trim());
  if (!nd) { ui.alert('Không tìm thấy tên đăng nhập này ở trang NguoiDung.'); return; }
  var mk = ui.prompt('Đặt mật khẩu', 'Mật khẩu mới cho «' + nd.tenDangNhap + '» (ít nhất 6 ký tự):', ui.ButtonSet.OK_CANCEL);
  if (mk.getSelectedButton() !== ui.Button.OK) return;
  if (mk.getResponseText().length < 6) { ui.alert('Mật khẩu phải có ít nhất 6 ký tự.'); return; }
  capNhatDong_(BANG.NGUOI_DUNG, 'tenDangNhap', nd.tenDangNhap, { matKhau: bamMatKhau_(mk.getResponseText()) });
  ui.alert('Đã đặt mật khẩu cho «' + nd.tenDangNhap + '».');
}

function moUngDung() {
  var url = ScriptApp.getService().getUrl();
  var ui = SpreadsheetApp.getUi();
  if (!url) {
    ui.alert('Chưa triển khai ứng dụng web. Vào Tiện ích mở rộng → Apps Script → Triển khai → Tùy chọn triển khai mới → Ứng dụng web.');
    return;
  }
  ui.showModelessDialog(HtmlService.createHtmlOutput(
    '<p>Địa chỉ ứng dụng (gửi cho cán bộ, đơn vị):</p><p><a href="' + url + '" target="_blank">' + url + '</a></p>'
  ).setWidth(520).setHeight(140), 'Mở ứng dụng');
}

// ===========================================================================
// 3. ỨNG DỤNG WEB
// ===========================================================================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Theo dõi nhiệm vụ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---- Đăng nhập ------------------------------------------------------------
function dangNhap(tenDangNhap, matKhau) {
  var nd = timNguoiDung_(String(tenDangNhap || '').trim());
  if (!nd || !nd.matKhau || nd.matKhau !== bamMatKhau_(String(matKhau || ''))) {
    Utilities.sleep(800); // làm chậm dò mật khẩu
    throw new Error('Tên đăng nhập hoặc mật khẩu không đúng.');
  }
  var phien = { ten: nd.tenDangNhap, hoTen: nd.hoTen || nd.tenDangNhap, vaiTro: nd.vaiTro || 'don_vi', donVi: nd.donVi || '' };
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('phien_' + token, JSON.stringify(phien), THOI_GIAN_PHIEN_GIAY);
  return { token: token, nguoiDung: phien, thongTin: thongTinChung_() };
}

function layPhien(token) {
  var nd = xacThuc_(token);
  return { nguoiDung: nd, thongTin: thongTinChung_() };
}

function dangXuat(token) {
  CacheService.getScriptCache().remove('phien_' + token);
}

function xacThuc_(token, vaiTroDuocPhep) {
  var raw = token && CacheService.getScriptCache().get('phien_' + token);
  if (!raw) throw new Error('PHIEN_HET_HAN');
  var nd = JSON.parse(raw);
  if (vaiTroDuocPhep && vaiTroDuocPhep.indexOf(nd.vaiTro) < 0) {
    throw new Error('Tài khoản của bạn không có quyền thực hiện thao tác này.');
  }
  return nd;
}

function thongTinChung_() {
  var ch = docCauHinh_();
  return {
    tenCoQuan: ch.TEN_CO_QUAN || '',
    coAI: !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY'),
    soNgayBaoTruoc: Number(ch.SO_NGAY_BAO_TRUOC) || 3,
    donVi: docBang_(BANG.DON_VI).map(function (d) { return d.ten; }).filter(String),
    trangThai: TRANG_THAI,
    homNay: homNay_()
  };
}

// ---- Bước 1–3: Văn bản mới → AI đọc → xác định nhiệm vụ -------------------
/**
 * @param {{ten: string, mime: string, duLieu: string}} tep  duLieu là base64
 */
function phanTichVanBan(token, tep) {
  xacThuc_(token, ['quan_tri', 'chuyen_vien']);
  var bytes = Utilities.base64Decode(tep.duLieu);
  var laPdf = /\.pdf$/i.test(tep.ten);
  var chu = laPdf ? '' : trichChu_(tep.ten, bytes);
  if (!laPdf && !chu.trim()) throw new Error('Tệp không có nội dung chữ hoặc định dạng chưa được hỗ trợ (dùng PDF, DOCX, TXT).');
  var donVi = docBang_(BANG.DON_VI).map(function (d) { return d.ten; }).filter(String);

  var khoa = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!khoa) {
    if (laPdf) throw new Error('Đọc tệp PDF cần có AI. Quản trị viên hãy nhập khóa API Claude (menu 📋 Nhiệm vụ trong Google Sheet), hoặc tải lên tệp DOCX/TXT.');
    var kq = trichTheoQuyTac_(chu, donVi, new Date().getFullYear());
    kq.canhBao = 'Chưa cấu hình AI: nhiệm vụ được gợi ý bằng quy tắc đơn giản, cần rà soát kỹ.';
    return kq;
  }
  return phanTichBangClaude_(tep.ten, tep.duLieu, chu, donVi, laPdf);
}

/** Trích chữ từ DOCX (giải nén word/document.xml) hoặc TXT. */
function trichChu_(ten, bytes) {
  if (/\.txt$/i.test(ten)) return Utilities.newBlob(bytes).getDataAsString('UTF-8');
  if (/\.docx$/i.test(ten)) {
    var tepCon = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip'));
    var doc = tepCon.filter(function (b) { return b.getName() === 'word/document.xml'; })[0];
    if (!doc) return '';
    var xml = doc.getDataAsString('UTF-8');
    return xml
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<\/w:p>\s*<\/w:tc>/g, ' | ')
      .replace(/<\/w:tr>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }
  return '';
}

var HUONG_DAN_PHAN_TICH =
  'Bạn là chuyên viên văn phòng của một cơ quan hành chính nhà nước Việt Nam, có nhiệm vụ đọc văn bản chỉ đạo '
  + '(kế hoạch, công văn, thông báo kết luận, quyết định, chỉ thị…) và lập danh sách nhiệm vụ để giao việc, theo dõi.\n\n'
  + 'Yêu cầu:\n'
  + '- Liệt kê từng nhiệm vụ cụ thể, có thể giao và kiểm tra được. Tách các việc khác nhau giao cho các đơn vị khác nhau '
  + 'thành các nhiệm vụ riêng. Không đưa vào phần căn cứ, mục đích, lời dẫn.\n'
  + '- "noi_dung": diễn đạt ngắn gọn, bắt đầu bằng động từ (ví dụ: "Tham mưu…", "Tổ chức…", "Báo cáo…").\n'
  + '- "trich_dan": chép nguyên văn câu hoặc đoạn trong văn bản làm căn cứ cho nhiệm vụ.\n'
  + '- "don_vi_chu_tri" và "don_vi_phoi_hop": ưu tiên dùng đúng tên trong DANH SÁCH ĐƠN VỊ bên dưới; nếu văn bản nêu '
  + 'đơn vị không có trong danh sách thì ghi đúng tên như văn bản. Để trống nếu văn bản không nêu.\n'
  + '- "ca_nhan_phu_trach": chỉ ghi khi văn bản nêu rõ cá nhân (họ tên hoặc chức danh); nếu không, để trống.\n'
  + '- "han_xu_ly": định dạng YYYY-MM-DD. Nếu văn bản ghi "trước ngày 15/10" mà không nêu năm, lấy năm của ngày ban '
  + 'hành văn bản. Nếu hạn là "thường xuyên", "hằng tháng" hoặc không nêu, để trống.\n'
  + '- Không tự suy diễn nhiệm vụ, đơn vị hoặc thời hạn mà văn bản không nêu.\n'
  + '- Các trường văn bản không có thông tin thì để chuỗi rỗng.\n\n'
  + 'Hôm nay là {HOM_NAY}.\n\nDANH SÁCH ĐƠN VỊ:\n{DON_VI}';

var LUOC_DO_PHAN_TICH = {
  type: 'object',
  additionalProperties: false,
  required: ['so_hieu', 'trich_yeu', 'co_quan_ban_hanh', 'ngay_ban_hanh', 'tom_tat', 'nhiem_vu'],
  properties: {
    so_hieu: { type: 'string' },
    trich_yeu: { type: 'string' },
    co_quan_ban_hanh: { type: 'string' },
    ngay_ban_hanh: { type: 'string', description: 'YYYY-MM-DD hoặc chuỗi rỗng' },
    tom_tat: { type: 'string' },
    nhiem_vu: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['noi_dung', 'trich_dan', 'don_vi_chu_tri', 'don_vi_phoi_hop', 'ca_nhan_phu_trach', 'han_xu_ly'],
        properties: {
          noi_dung: { type: 'string' },
          trich_dan: { type: 'string' },
          don_vi_chu_tri: { type: 'string' },
          don_vi_phoi_hop: { type: 'array', items: { type: 'string' } },
          ca_nhan_phu_trach: { type: 'string' },
          han_xu_ly: { type: 'string', description: 'YYYY-MM-DD hoặc chuỗi rỗng' }
        }
      }
    }
  }
};

function phanTichBangClaude_(ten, base64, chu, donVi, laPdf) {
  var system = HUONG_DAN_PHAN_TICH
    .replace('{HOM_NAY}', homNay_())
    .replace('{DON_VI}', donVi.map(function (d) { return '- ' + d; }).join('\n') || '(chưa khai báo)');
  var content = laPdf
    ? [{ type: 'document', title: ten, source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
       { type: 'text', text: 'Hãy phân tích văn bản đính kèm và lập danh sách nhiệm vụ.' }]
    : [{ type: 'text', text: '<van_ban ten_tep="' + ten + '">\n' + chu + '\n</van_ban>\n\nHãy phân tích văn bản trên và lập danh sách nhiệm vụ.' }];
  var traLoi = goiClaude_(system, content, LUOC_DO_PHAN_TICH, 'medium');
  var kq;
  try {
    kq = JSON.parse(traLoi);
  } catch (e) {
    throw new Error('Claude trả về kết quả không đúng định dạng, vui lòng thử lại.');
  }
  return {
    vanBan: {
      soHieu: kq.so_hieu, trichYeu: kq.trich_yeu, coQuanBanHanh: kq.co_quan_ban_hanh,
      ngayBanHanh: chuanHoaNgay_(kq.ngay_ban_hanh), tomTat: kq.tom_tat
    },
    nhiemVu: (kq.nhiem_vu || []).map(function (n) {
      return {
        noiDung: n.noi_dung, trichDan: n.trich_dan, chuTri: n.don_vi_chu_tri,
        phoiHop: (n.don_vi_phoi_hop || []).join('; '), caNhan: n.ca_nhan_phu_trach, han: chuanHoaNgay_(n.han_xu_ly)
      };
    })
  };
}

/** Gọi Claude Messages API; trả về phần chữ của câu trả lời. */
function goiClaude_(system, content, luocDo, effort) {
  var khoa = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  var outputConfig = { effort: effort || 'medium' };
  if (luocDo) outputConfig.format = { type: 'json_schema', schema: luocDo };
  var body = {
    model: docCauHinh_().MODEL || MODEL_MAC_DINH,
    max_tokens: 16000,
    system: system,
    messages: [{ role: 'user', content: content }],
    output_config: outputConfig,
    // Khi bộ lọc an toàn từ chối, máy chủ tự chuyển sang mô hình dự phòng phù hợp.
    fallbacks: 'default'
  };
  var res = UrlFetchApp.fetch(API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': khoa,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var ma = res.getResponseCode();
  var json = {};
  try { json = JSON.parse(res.getContentText()); } catch (e) { /* để trống */ }
  if (ma !== 200) {
    var thongBao = (json.error && json.error.message) || res.getContentText().slice(0, 300);
    if (ma === 401) throw new Error('Khóa API Claude không hợp lệ. Quản trị viên hãy nhập lại khóa.');
    if (ma === 429) throw new Error('Đã vượt giới hạn gọi API, vui lòng thử lại sau ít phút.');
    if (ma === 529 || ma >= 500) throw new Error('Máy chủ Claude đang quá tải, vui lòng thử lại sau.');
    throw new Error('Lỗi từ máy chủ Claude (' + ma + '): ' + thongBao);
  }
  if (json.stop_reason === 'refusal') throw new Error('Claude đã từ chối xử lý nội dung này.');
  if (json.stop_reason === 'max_tokens') throw new Error('Văn bản quá dài, kết quả bị cắt ngắn. Hãy tách văn bản thành nhiều phần.');
  return (json.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('')
    .trim();
}

// ---- Bước 4–5: Phân công, đặt hạn → giao nhiệm vụ --------------------------
/**
 * @param {{tep: Object, vanBan: Object, nhiemVu: Object[]}} duLieu
 */
function giaoNhiemVu(token, duLieu) {
  var nd = xacThuc_(token, ['quan_tri', 'chuyen_vien']);
  var ds = (duLieu.nhiemVu || []).filter(function (n) { return String(n.noiDung || '').trim(); });
  if (!ds.length) throw new Error('Chưa có nhiệm vụ nào để giao.');
  ds.forEach(function (n, i) {
    if (!String(n.chuTri || '').trim()) throw new Error('Nhiệm vụ thứ ' + (i + 1) + ' chưa có đơn vị chủ trì.');
  });

  var cauHinh = docCauHinh_();
  var tepUrl = '', tepId = '';
  if (duLieu.tep && duLieu.tep.duLieu) {
    var blob = Utilities.newBlob(Utilities.base64Decode(duLieu.tep.duLieu), duLieu.tep.mime || MimeType.PDF, duLieu.tep.ten);
    var thuMuc = cauHinh.THU_MUC_VAN_BAN_ID ? DriveApp.getFolderById(cauHinh.THU_MUC_VAN_BAN_ID) : DriveApp.getRootFolder();
    var f = thuMuc.createFile(blob);
    tepUrl = f.getUrl();
    tepId = f.getId();
  }

  var vb = duLieu.vanBan || {};
  var vanBanId = taoId_();
  var bayGio = new Date();
  var khoa = LockService.getScriptLock();
  khoa.waitLock(30000);
  try {
    themDong_(BANG.VAN_BAN, {
      id: vanBanId, soHieu: vb.soHieu || '', trichYeu: vb.trichYeu || '', coQuanBanHanh: vb.coQuanBanHanh || '',
      ngayBanHanh: sangNgay_(vb.ngayBanHanh), tomTat: vb.tomTat || '', tep: tepUrl, tepId: tepId,
      nguoiNhap: nd.hoTen, thoiDiem: bayGio
    });
    var donViCo = docBang_(BANG.DON_VI).map(function (d) { return d.ten; });
    ds.forEach(function (n) {
      var id = taoId_();
      themDong_(BANG.NHIEM_VU, {
        id: id, vanBanId: vanBanId, soHieuVanBan: vb.soHieu || '', noiDung: String(n.noiDung).trim(),
        trichDan: n.trichDan || '', chuTri: String(n.chuTri).trim(), phoiHop: n.phoiHop || '', caNhan: n.caNhan || '',
        han: sangNgay_(n.han), trangThai: 'Mới giao', tienDo: 0, ketQua: '', nguoiGiao: nd.hoTen,
        ngayGiao: bayGio, ngayHoanThanh: '', capNhatCuoi: bayGio
      });
      themDong_(BANG.LICH_SU, { thoiDiem: bayGio, nhiemVuId: id, nguoi: nd.hoTen, trangThai: 'Mới giao', tienDo: 0, ghiChu: 'Giao nhiệm vụ' });
      tachDonVi_(n.chuTri + ';' + (n.phoiHop || '')).forEach(function (d) {
        if (donViCo.indexOf(d) < 0) { themDong_(BANG.DON_VI, { ten: d, email: '' }); donViCo.push(d); }
      });
    });
  } finally {
    khoa.releaseLock();
  }
  return { soNhiemVu: ds.length, tep: tepUrl };
}

// ---- Bước 6: Theo dõi -----------------------------------------------------
function layNhiemVu(token) {
  var nd = xacThuc_(token);
  var hn = homNay_();
  var soNgay = Number(docCauHinh_().SO_NGAY_BAO_TRUOC) || 3;
  var vanBan = {};
  docBang_(BANG.VAN_BAN).forEach(function (v) { vanBan[v.id] = v; });
  return nhiemVuCuaNguoiDung_(nd).map(function (n) {
    var vb = vanBan[n.vanBanId] || {};
    n.tienDo = Number(n.tienDo) || 0;
    n.canhBao = mucCanhBao_(n, hn, soNgay);
    n.conLai = n.han && n.trangThai !== 'Hoàn thành' ? soNgayGiua_(hn, n.han) : null;
    n.trichYeuVanBan = vb.trichYeu || '';
    n.tepVanBan = vb.tep || '';
    n.duocSua = coQuyenSua_(nd, n);
    return n;
  }).sort(function (a, b) {
    return THU_TU_CB.indexOf(a.canhBao) - THU_TU_CB.indexOf(b.canhBao) || String(a.han || '9999').localeCompare(String(b.han || '9999'));
  });
}

function layLichSu(token, nhiemVuId) {
  var nd = xacThuc_(token);
  var nv = docBang_(BANG.NHIEM_VU).filter(function (n) { return n.id === nhiemVuId; })[0];
  if (!nv || !thayDuoc_(nd, nv)) throw new Error('Không tìm thấy nhiệm vụ.');
  return docBang_(BANG.LICH_SU).filter(function (l) { return l.nhiemVuId === nhiemVuId; }).reverse();
}

/**
 * @param {{trangThai: string, tienDo: number, ketQua: string, ghiChu: string, han: string}} cn
 */
function capNhatTienDo(token, nhiemVuId, cn) {
  var nd = xacThuc_(token);
  var khoa = LockService.getScriptLock();
  khoa.waitLock(30000);
  try {
    var nv = docBang_(BANG.NHIEM_VU).filter(function (n) { return n.id === nhiemVuId; })[0];
    if (!nv) throw new Error('Không tìm thấy nhiệm vụ.');
    if (!coQuyenSua_(nd, nv)) throw new Error('Chỉ đơn vị chủ trì hoặc chuyên viên tổng hợp được cập nhật nhiệm vụ này.');
    var kq = tinhTrangThaiMoi_(nv, cn.trangThai, cn.tienDo, homNay_());
    var thayDoi = {
      trangThai: kq.trangThai, tienDo: kq.tienDo, ngayHoanThanh: kq.ngayHoanThanh ? sangNgay_(kq.ngayHoanThanh) : '',
      capNhatCuoi: new Date()
    };
    if (cn.ketQua !== undefined) thayDoi.ketQua = cn.ketQua;
    var ghiChu = String(cn.ghiChu || '').trim();
    var hanMoi = chuanHoaNgay_(cn.han);
    if (cn.han !== undefined && hanMoi !== (nv.han || '') && (nd.vaiTro === 'quan_tri' || nd.vaiTro === 'chuyen_vien')) {
      thayDoi.han = sangNgay_(hanMoi);
      ghiChu = (ghiChu + ' (điều chỉnh hạn từ ' + (nv.han || 'không có') + ' sang ' + (hanMoi || 'không có') + ')').trim();
    }
    capNhatDong_(BANG.NHIEM_VU, 'id', nhiemVuId, thayDoi);
    themDong_(BANG.LICH_SU, {
      thoiDiem: new Date(), nhiemVuId: nhiemVuId, nguoi: nd.hoTen, trangThai: kq.trangThai, tienDo: kq.tienDo, ghiChu: ghiChu
    });
  } finally {
    khoa.releaseLock();
  }
  return true;
}

/** Quy tắc: 100% ⇒ Hoàn thành; Hoàn thành ⇒ 100%; ghi ngày hoàn thành khi chuyển sang Hoàn thành. */
function tinhTrangThaiMoi_(nv, trangThai, tienDo, homNay) {
  tienDo = Math.max(0, Math.min(100, Math.round(Number(tienDo) || 0)));
  if (TRANG_THAI.indexOf(trangThai) < 0) trangThai = nv.trangThai || 'Mới giao';
  if (trangThai === 'Hoàn thành') tienDo = 100;
  else if (tienDo === 100) trangThai = 'Hoàn thành';
  var ngayHoanThanh = '';
  if (trangThai === 'Hoàn thành') ngayHoanThanh = nv.trangThai === 'Hoàn thành' && nv.ngayHoanThanh ? nv.ngayHoanThanh : homNay;
  return { trangThai: trangThai, tienDo: tienDo, ngayHoanThanh: ngayHoanThanh };
}

function nhiemVuCuaNguoiDung_(nd) {
  return docBang_(BANG.NHIEM_VU).filter(function (n) { return thayDuoc_(nd, n); });
}

function thayDuoc_(nd, n) {
  if (nd.vaiTro !== 'don_vi') return true;
  return n.chuTri === nd.donVi || tachDonVi_(n.phoiHop).indexOf(nd.donVi) >= 0;
}

function coQuyenSua_(nd, n) {
  return nd.vaiTro === 'quan_tri' || nd.vaiTro === 'chuyen_vien' || (nd.vaiTro === 'don_vi' && n.chuTri === nd.donVi);
}

// ---- Bước 7: Cảnh báo -----------------------------------------------------
function mucCanhBao_(n, homNay, soNgayBaoTruoc) {
  if (n.trangThai === 'Hoàn thành') return CB.DA_XONG;
  if (!n.han) return CB.KHONG_HAN;
  var con = soNgayGiua_(homNay, n.han);
  if (con < 0) return CB.QUA_HAN;
  if (con <= soNgayBaoTruoc) return CB.SAP_DEN_HAN;
  return CB.TRONG_HAN;
}

/** Chạy tự động mỗi sáng: gửi email nhắc việc cho từng đơn vị và bản tổng hợp cho quản trị/chuyên viên. */
function guiNhacViecHangNgay() {
  var hn = homNay_();
  var soNgay = Number(docCauHinh_().SO_NGAY_BAO_TRUOC) || 3;
  var ds = docBang_(BANG.NHIEM_VU)
    .map(function (n) { n.canhBao = mucCanhBao_(n, hn, soNgay); return n; })
    .filter(function (n) { return n.canhBao === CB.QUA_HAN || n.canhBao === CB.SAP_DEN_HAN; });
  if (!ds.length) return 0;

  var url = ScriptApp.getService().getUrl() || '';
  var tenCoQuan = docCauHinh_().TEN_CO_QUAN || '';
  var theoDonVi = {};
  ds.forEach(function (n) { (theoDonVi[n.chuTri || '(Chưa phân công)'] = theoDonVi[n.chuTri || '(Chưa phân công)'] || []).push(n); });

  var daGui = 0;
  var emailDonVi = {};
  docBang_(BANG.DON_VI).forEach(function (d) { emailDonVi[d.ten] = d.email; });
  Object.keys(theoDonVi).forEach(function (dv) {
    var email = String(emailDonVi[dv] || '').trim();
    if (!email) return;
    MailApp.sendEmail({
      to: email,
      subject: '[Nhắc việc] ' + theoDonVi[dv].length + ' nhiệm vụ quá hạn/sắp đến hạn - ' + dv,
      htmlBody: noiDungNhacViec_(tenCoQuan, { dv: theoDonVi[dv] }, hn, url, dv)
    });
    daGui++;
  });

  var nguoiNhanTongHop = docBang_(BANG.NGUOI_DUNG)
    .filter(function (u) { return (u.vaiTro === 'quan_tri' || u.vaiTro === 'chuyen_vien') && u.email; })
    .map(function (u) { return u.email; });
  if (nguoiNhanTongHop.length) {
    MailApp.sendEmail({
      to: nguoiNhanTongHop.join(','),
      subject: '[Tổng hợp nhắc việc] ' + ds.length + ' nhiệm vụ quá hạn/sắp đến hạn',
      htmlBody: noiDungNhacViec_(tenCoQuan, theoDonVi, hn, url, '')
    });
    daGui++;
  }
  return daGui;
}

function guiNhacViecNgay(token) {
  xacThuc_(token, ['quan_tri', 'chuyen_vien']);
  return guiNhacViecHangNgay();
}

function noiDungNhacViec_(tenCoQuan, theoDonVi, hn, url, kinhGui) {
  var h = '<p>' + maHoa_(tenCoQuan) + ' — nhắc việc ngày ' + dinhDangNgayVN_(hn) + '</p>';
  if (kinhGui) h += '<p>Kính gửi: <b>' + maHoa_(kinhGui) + '</b></p>';
  Object.keys(theoDonVi).forEach(function (dv) {
    if (!kinhGui) h += '<h3>' + maHoa_(dv) + '</h3>';
    h += '<ul>';
    theoDonVi[dv].forEach(function (n) {
      var con = soNgayGiua_(hn, n.han);
      var moTa = con < 0 ? '<b style="color:#b3261e">quá hạn ' + (-con) + ' ngày</b>'
        : (con === 0 ? '<b style="color:#b26a00">đến hạn hôm nay</b>' : 'còn ' + con + ' ngày');
      h += '<li>' + maHoa_(n.noiDung) + ' — hạn ' + dinhDangNgayVN_(n.han) + ' (' + moTa + '), tiến độ '
        + (Number(n.tienDo) || 0) + '%' + (n.soHieuVanBan ? ' — VB ' + maHoa_(n.soHieuVanBan) : '') + '</li>';
    });
    h += '</ul>';
  });
  if (url) h += '<p>Cập nhật tiến độ tại: <a href="' + url + '">' + url + '</a></p>';
  return h;
}

// ---- Bước 8: Tạo báo cáo ---------------------------------------------------
function nhiemVuTrongKy_(tuNgay, denNgay, donVi) {
  return docBang_(BANG.NHIEM_VU).filter(function (n) {
    if (donVi && n.chuTri !== donVi && tachDonVi_(n.phoiHop).indexOf(donVi) < 0) return false;
    if (String(n.ngayGiao).slice(0, 10) > denNgay) return false;
    if (n.ngayHoanThanh && String(n.ngayHoanThanh).slice(0, 10) < tuNgay) return false;
    return true;
  });
}

function thongKe_(ds, hn, soNgay) {
  var tk = { tong: 0, hoanThanh: 0, dungHan: 0, treHan: 0, dangThucHien: 0, quaHan: 0, sapDenHan: 0 };
  ds.forEach(function (n) {
    tk.tong++;
    var m = mucCanhBao_(n, hn, soNgay);
    if (m === CB.DA_XONG) {
      tk.hoanThanh++;
      if (n.han && n.ngayHoanThanh) {
        if (String(n.ngayHoanThanh).slice(0, 10) <= n.han) tk.dungHan++; else tk.treHan++;
      }
    } else {
      tk.dangThucHien++;
      if (m === CB.QUA_HAN) tk.quaHan++;
      if (m === CB.SAP_DEN_HAN) tk.sapDenHan++;
    }
  });
  return tk;
}

function baoCaoMau_(ds, hn, soNgay) {
  var tk = thongKe_(ds, hn, soNgay);
  var d = [
    'I. TÌNH HÌNH CHUNG',
    '- Tổng số nhiệm vụ theo dõi: ' + tk.tong + '.',
    '- Đã hoàn thành: ' + tk.hoanThanh + ' (đúng hạn: ' + tk.dungHan + '; quá hạn: ' + tk.treHan + ').',
    '- Đang thực hiện: ' + tk.dangThucHien + ', trong đó quá hạn: ' + tk.quaHan + ', sắp đến hạn: ' + tk.sapDenHan + '.',
    '',
    'II. KẾT QUẢ THỰC HIỆN'
  ];
  var theoDv = {};
  ds.forEach(function (n) { (theoDv[n.chuTri || '(Chưa phân công)'] = theoDv[n.chuTri || '(Chưa phân công)'] || []).push(n); });
  Object.keys(theoDv).sort().forEach(function (dv) {
    var xong = theoDv[dv].filter(function (n) { return n.trangThai === 'Hoàn thành'; });
    d.push('- ' + dv + ': ' + xong.length + '/' + theoDv[dv].length + ' nhiệm vụ đã hoàn thành.');
    xong.forEach(function (n) { if (n.ketQua) d.push('  + ' + n.noiDung + ': ' + n.ketQua); });
  });
  d.push('', 'III. NHIỆM VỤ CHẬM, QUÁ HẠN');
  var qua = ds.filter(function (n) { return mucCanhBao_(n, hn, soNgay) === CB.QUA_HAN; });
  if (!qua.length) d.push('- Không có nhiệm vụ quá hạn.');
  qua.forEach(function (n) {
    d.push('- ' + n.noiDung + ' (' + (n.chuTri || 'chưa phân công') + '; hạn ' + dinhDangNgayVN_(n.han) + '; quá '
      + (-soNgayGiua_(hn, n.han)) + ' ngày; tiến độ ' + (Number(n.tienDo) || 0) + '%).');
  });
  d.push('', 'IV. ĐỀ XUẤT, KIẾN NGHỊ', '- ');
  return d.join('\n');
}

var HUONG_DAN_BAO_CAO =
  'Bạn là chuyên viên tổng hợp của một cơ quan hành chính nhà nước Việt Nam. Từ dữ liệu theo dõi nhiệm vụ (JSON) '
  + 'được cung cấp, hãy soạn phần nội dung báo cáo kết quả thực hiện nhiệm vụ theo văn phong hành chính, gồm các mục:\n\n'
  + 'I. TÌNH HÌNH CHUNG — tổng số nhiệm vụ, số đã hoàn thành (đúng hạn/quá hạn), đang thực hiện, quá hạn.\n'
  + 'II. KẾT QUẢ THỰC HIỆN — tóm tắt theo từng đơn vị chủ trì, nêu nhiệm vụ nổi bật đã hoàn thành.\n'
  + 'III. NHIỆM VỤ CHẬM, QUÁ HẠN — liệt kê cụ thể, nêu đơn vị chịu trách nhiệm và số ngày quá hạn.\n'
  + 'IV. ĐỀ XUẤT, KIẾN NGHỊ — ngắn gọn, bám sát số liệu.\n\n'
  + 'Chỉ dùng số liệu có trong dữ liệu; không bịa thêm. Trình bày bằng văn bản thuần, mỗi mục bắt đầu bằng tiêu đề như '
  + 'trên, các ý dùng dấu gạch đầu dòng "- ". Không dùng Markdown (không **, không #).';

/** @param {{tieuDe: string, tuNgay: string, denNgay: string, donVi: string, dungAI: boolean}} yc */
function taoBaoCao(token, yc) {
  var nd = xacThuc_(token, ['quan_tri', 'chuyen_vien']);
  if (!yc.tuNgay || !yc.denNgay || yc.tuNgay > yc.denNgay) throw new Error('Kỳ báo cáo không hợp lệ.');
  var hn = homNay_();
  var soNgay = Number(docCauHinh_().SO_NGAY_BAO_TRUOC) || 3;
  var ds = nhiemVuTrongKy_(yc.tuNgay, yc.denNgay, yc.donVi || '');
  var noiDung = baoCaoMau_(ds, hn, soNgay);
  var canhBao = '';
  if (yc.dungAI && ds.length && PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY')) {
    try {
      var duLieu = ds.map(function (n) {
        return {
          van_ban: n.soHieuVanBan, noi_dung: n.noiDung, don_vi_chu_tri: n.chuTri, don_vi_phoi_hop: n.phoiHop,
          han_xu_ly: n.han, trang_thai: n.trangThai, muc_canh_bao: mucCanhBao_(n, hn, soNgay),
          so_ngay_con_lai: n.han ? soNgayGiua_(hn, n.han) : null, ngay_hoan_thanh: n.ngayHoanThanh,
          tien_do_phan_tram: Number(n.tienDo) || 0, ket_qua: n.ketQua
        };
      });
      noiDung = goiClaude_(HUONG_DAN_BAO_CAO,
        'Tiêu đề báo cáo: ' + yc.tieuDe + '\nHôm nay: ' + hn + '\n\n<du_lieu>\n' + JSON.stringify(duLieu) + '\n</du_lieu>',
        null, 'medium');
    } catch (e) {
      canhBao = e.message + ' Đã dùng mẫu báo cáo cố định.';
    }
  }
  var id = taoId_();
  themDong_(BANG.BAO_CAO, {
    id: id, tieuDe: yc.tieuDe, tuNgay: sangNgay_(yc.tuNgay), denNgay: sangNgay_(yc.denNgay), donVi: yc.donVi || '',
    noiDung: noiDung, trangThai: BC.NHAP, nguoiLap: nd.hoTen, thoiDiemLap: new Date(),
    nguoiDuyet: '', thoiDiemDuyet: '', yKien: '', tep: ''
  });
  return { id: id, canhBao: canhBao };
}

function layBaoCao(token) {
  xacThuc_(token, ['quan_tri', 'chuyen_vien', 'can_bo_duyet']);
  return docBang_(BANG.BAO_CAO).reverse();
}

function luuBaoCao(token, id, noiDung, guiDuyet) {
  xacThuc_(token, ['quan_tri', 'chuyen_vien']);
  var bc = docBang_(BANG.BAO_CAO).filter(function (b) { return b.id === id; })[0];
  if (!bc) throw new Error('Không tìm thấy báo cáo.');
  if (bc.trangThai !== BC.NHAP && bc.trangThai !== BC.YEU_CAU_SUA) {
    throw new Error('Báo cáo đang ở trạng thái «' + bc.trangThai + '», không sửa được.');
  }
  if (guiDuyet && !String(noiDung || '').trim()) throw new Error('Báo cáo chưa có nội dung.');
  var thayDoi = { noiDung: noiDung };
  if (guiDuyet) thayDoi.trangThai = BC.CHO_DUYET;
  capNhatDong_(BANG.BAO_CAO, 'id', id, thayDoi);
  return true;
}

// ---- Bước 9: Cán bộ kiểm duyệt --------------------------------------------
function kiemDuyetBaoCao(token, id, dongY, yKien) {
  var nd = xacThuc_(token, ['quan_tri', 'can_bo_duyet']);
  var khoa = LockService.getScriptLock();
  khoa.waitLock(30000);
  try {
    var bc = docBang_(BANG.BAO_CAO).filter(function (b) { return b.id === id; })[0];
    if (!bc) throw new Error('Không tìm thấy báo cáo.');
    if (bc.trangThai !== BC.CHO_DUYET) throw new Error('Báo cáo đang ở trạng thái «' + bc.trangThai + '», không thể duyệt.');
    if (!dongY && !String(yKien || '').trim()) throw new Error('Cần ghi ý kiến khi yêu cầu chỉnh sửa.');
    var thayDoi = {
      trangThai: dongY ? BC.DA_DUYET : BC.YEU_CAU_SUA, nguoiDuyet: nd.hoTen, thoiDiemDuyet: new Date(),
      yKien: String(yKien || '').trim()
    };
    if (dongY) {
      bc.nguoiDuyet = nd.hoTen;
      thayDoi.tep = taoGoogleDocBaoCao_(bc);
    }
    capNhatDong_(BANG.BAO_CAO, 'id', id, thayDoi);
    return thayDoi.tep || '';
  } finally {
    khoa.releaseLock();
  }
}

function taoGoogleDocBaoCao_(bc) {
  var cauHinh = docCauHinh_();
  var hn = homNay_();
  var soNgay = Number(cauHinh.SO_NGAY_BAO_TRUOC) || 3;
  var doc = DocumentApp.create(bc.denNgay.replace(/-/g, '') + ' - ' + bc.tieuDe);
  var body = doc.getBody();
  body.setMarginLeft(85).setMarginRight(42).setMarginTop(57).setMarginBottom(57); // 3cm / 1,5cm / 2cm
  var kieu = {};
  kieu[DocumentApp.Attribute.FONT_FAMILY] = 'Times New Roman';
  kieu[DocumentApp.Attribute.FONT_SIZE] = 13;
  body.setAttributes(kieu);

  var dau = body.appendTable([[String(cauHinh.TEN_CO_QUAN || '').toUpperCase(),
    'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc']]);
  dau.setBorderWidth(0);
  for (var c = 0; c < 2; c++) {
    dau.getCell(0, c).editAsText().setBold(true);
    dau.getCell(0, c).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  }
  var p = dau.getCell(0, 1).appendParagraph('ngày ' + hn.slice(8, 10) + ' tháng ' + hn.slice(5, 7) + ' năm ' + hn.slice(0, 4));
  p.setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setItalic(true).setBold(false);

  [['BÁO CÁO', true], [bc.tieuDe, true],
   ['(Từ ngày ' + dinhDangNgayVN_(bc.tuNgay) + ' đến ngày ' + dinhDangNgayVN_(bc.denNgay) + ')', false]]
    .concat(bc.donVi ? [['Đơn vị: ' + bc.donVi, false]] : [])
    .forEach(function (x) {
      body.appendParagraph(x[0]).setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setBold(x[1]);
    });

  String(bc.noiDung || '').split('\n').forEach(function (dong) {
    var laTieuDe = /^(I|II|III|IV|V|VI)\.\s/.test(dong);
    var para = body.appendParagraph(dong);
    para.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFIED);
    if (dong) para.editAsText().setBold(laTieuDe);
    if (!laTieuDe) para.setIndentFirstLine(28);
  });

  body.appendPageBreak();
  body.appendParagraph('PHỤ LỤC: DANH MỤC NHIỆM VỤ').setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setBold(true);
  var hang = [['TT', 'Nội dung nhiệm vụ', 'Đơn vị chủ trì', 'Hạn', 'Tiến độ', 'Tình trạng']];
  nhiemVuTrongKy_(bc.tuNgay, bc.denNgay, bc.donVi).forEach(function (n, i) {
    hang.push([String(i + 1), n.noiDung, n.chuTri, dinhDangNgayVN_(n.han), (Number(n.tienDo) || 0) + '%', mucCanhBao_(n, hn, soNgay)]);
  });
  var bang = body.appendTable(hang);
  bang.editAsText().setFontSize(11);
  bang.getRow(0).editAsText().setBold(true);

  var ky = body.appendParagraph('NGƯỜI LẬP\n' + bc.nguoiLap + '\n\nNGƯỜI DUYỆT\n' + bc.nguoiDuyet);
  ky.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  doc.saveAndClose();

  var tep = DriveApp.getFileById(doc.getId());
  if (cauHinh.THU_MUC_BAO_CAO_ID) tep.moveTo(DriveApp.getFolderById(cauHinh.THU_MUC_BAO_CAO_ID));
  return tep.getUrl();
}

// ===========================================================================
// 4. BỘ QUY TẮC DỰ PHÒNG (KHI CHƯA CÓ KHÓA API)
// ===========================================================================
var TU_KHOA_GIAO_VIEC = ['giao', 'đề nghị', 'yêu cầu', 'chủ trì', 'phối hợp', 'tham mưu', 'triển khai',
  'tổ chức', 'báo cáo', 'hoàn thành', 'thực hiện', 'rà soát', 'xây dựng'];
var MAU_NGAY = /(?:trước|chậm nhất|hạn|trong)\s*(?:ngày|đến ngày|là ngày)?\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*(\d{4}))?/i;

function tachCau_(vanBan) {
  var cau = [];
  String(vanBan).split(/\r?\n/).forEach(function (dong) {
    dong = dong.replace(/^\s*(?:[-–•+*]|\d+(?:\.\d+)*[.)]|[a-zđ][.)])\s*/, '').trim();
    if (!dong) return;
    dong.split(/(?<=[.;])\s+(?=[A-ZĐÂÊÔƠƯÁÀẢÃẠ])/).forEach(function (c) { if (c.trim()) cau.push(c.trim()); });
  });
  return cau;
}

function timHan_(cau, namMacDinh) {
  var m = MAU_NGAY.exec(cau);
  if (!m) return '';
  var ngay = +m[1], thang = +m[2], nam = +(m[3] || namMacDinh);
  var d = new Date(Date.UTC(nam, thang - 1, ngay));
  if (d.getUTCDate() !== ngay || d.getUTCMonth() !== thang - 1) return '';
  return nam + '-' + ('0' + thang).slice(-2) + '-' + ('0' + ngay).slice(-2);
}

function trichTheoQuyTac_(vanBan, donVi, nam) {
  var ds = [];
  tachCau_(vanBan).forEach(function (cau) {
    var thuong = cau.toLowerCase();
    if (cau.length < 25 || !TU_KHOA_GIAO_VIEC.some(function (k) { return thuong.indexOf(k) >= 0; })) return;
    var nhac = donVi.filter(function (d) { return thuong.indexOf(d.toLowerCase()) >= 0; });
    var han = timHan_(cau, nam);
    if (!nhac.length && !han) return;
    var chuTri = '';
    var m = /(.+?)\s+chủ trì/i.exec(cau);
    if (m) chuTri = nhac.filter(function (d) { return m[1].toLowerCase().indexOf(d.toLowerCase()) >= 0; })[0] || '';
    if (!chuTri && nhac.length) chuTri = nhac[0];
    ds.push({
      noiDung: cau, trichDan: cau, chuTri: chuTri,
      phoiHop: nhac.filter(function (d) { return d !== chuTri; }).join('; '), caNhan: '', han: han
    });
  });
  var dongDau = String(vanBan).split(/\r?\n/).filter(function (d) { return d.trim(); })[0] || '';
  return {
    vanBan: { soHieu: '', trichYeu: dongDau.trim().slice(0, 200), coQuanBanHanh: '', ngayBanHanh: '', tomTat: '' },
    nhiemVu: ds
  };
}

// ===========================================================================
// 5. TIỆN ÍCH ĐỌC/GHI TRANG TÍNH
// ===========================================================================
function layTrang_(bang) {
  var sh = SpreadsheetApp.getActive().getSheetByName(bang.ten);
  if (!sh) throw new Error('Thiếu trang tính «' + bang.ten + '». Hãy chạy menu 📋 Nhiệm vụ → Cài đặt lần đầu.');
  return sh;
}

/** Vị trí cột (0-based) theo tiêu đề thực tế, để người dùng có thể sắp xếp lại cột. */
function viTriCot_(sh, bang) {
  var tieuDe = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  var vt = {};
  bang.cot.forEach(function (c) {
    var i = tieuDe.indexOf(c[1]);
    if (i < 0) throw new Error('Trang «' + bang.ten + '» thiếu cột «' + c[1] + '».');
    vt[c[0]] = i;
  });
  return vt;
}

function docBang_(bang) {
  var sh = layTrang_(bang);
  if (sh.getLastRow() < 2) return [];
  var vt = viTriCot_(sh, bang);
  var tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
    .map(function (hang) {
      var o = {};
      bang.cot.forEach(function (c) {
        var v = hang[vt[c[0]]];
        if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm').replace(' 00:00', '');
        o[c[0]] = v === null || v === undefined ? '' : (typeof v === 'number' ? v : String(v));
      });
      return o;
    })
    .filter(function (o) { return Object.keys(o).some(function (k) { return o[k] !== ''; }); });
}

function themDong_(bang, obj) {
  var sh = layTrang_(bang);
  var vt = viTriCot_(sh, bang);
  var hang = new Array(sh.getLastColumn()).fill('');
  Object.keys(vt).forEach(function (k) { if (obj[k] !== undefined) hang[vt[k]] = chongCongThuc_(obj[k]); });
  sh.appendRow(hang);
}

function capNhatDong_(bang, cotKhoa, giaTriKhoa, thayDoi) {
  var sh = layTrang_(bang);
  var vt = viTriCot_(sh, bang);
  var khoa = sh.getRange(2, vt[cotKhoa] + 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < khoa.length; i++) {
    if (String(khoa[i][0]) === String(giaTriKhoa)) {
      Object.keys(thayDoi).forEach(function (k) {
        if (vt[k] !== undefined) sh.getRange(i + 2, vt[k] + 1).setValue(chongCongThuc_(thayDoi[k]));
      });
      return true;
    }
  }
  throw new Error('Không tìm thấy bản ghi cần cập nhật.');
}

/**
 * Giữ nguyên chuỗi khi ghi vào trang tính: ngăn hiểu thành công thức (=, +, -, @) và ngăn
 * Google Sheet tự đổi chuỗi bắt đầu bằng chữ số (ID, mã băm, số hiệu "01/10") thành số hoặc ngày.
 */
function chongCongThuc_(v) {
  if (typeof v === 'string' && /^[=+\-@0-9]/.test(v)) return "'" + v;
  return v;
}

function docCauHinh_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(BANG.CAU_HINH.ten);
  var ch = {};
  if (!sh || sh.getLastRow() < 2) return ch;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (h) { if (h[0]) ch[String(h[0])] = h[1]; });
  return ch;
}

function ghiCauHinh_(khoa, giaTri, ghiChu) {
  var sh = layTrang_(BANG.CAU_HINH);
  var ds = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  for (var i = 0; i < ds.length; i++) {
    if (ds[i][0] === khoa) { sh.getRange(i + 2, 2).setValue(giaTri); return; }
  }
  sh.appendRow([khoa, giaTri, ghiChu || '']);
}

function timNguoiDung_(ten) {
  if (!ten) return null;
  return docBang_(BANG.NGUOI_DUNG).filter(function (u) { return String(u.tenDangNhap).trim() === ten; })[0] || null;
}

function bamMatKhau_(matKhau) {
  var props = PropertiesService.getScriptProperties();
  var muoi = props.getProperty('MUOI_MAT_KHAU');
  if (!muoi) { muoi = Utilities.getUuid(); props.setProperty('MUOI_MAT_KHAU', muoi); }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, muoi + matKhau, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// ===========================================================================
// 6. TIỆN ÍCH NGÀY THÁNG, CHUỖI
// ===========================================================================
function homNay_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Số ngày từ `tu` đến `den` (chuỗi yyyy-MM-dd); âm nếu `den` ở trước. */
function soNgayGiua_(tu, den) {
  var a = String(tu).slice(0, 10).split('-'), b = String(den).slice(0, 10).split('-');
  return Math.round((Date.UTC(+b[0], b[1] - 1, +b[2]) - Date.UTC(+a[0], a[1] - 1, +a[2])) / 86400000);
}

/** Chuẩn hóa yyyy-MM-dd hoặc dd/MM/yyyy về yyyy-MM-dd; chuỗi rỗng nếu không hợp lệ. */
function chuanHoaNgay_(s) {
  s = String(s || '').trim();
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  var nam, thang, ngay;
  if (m) { nam = +m[1]; thang = +m[2]; ngay = +m[3]; } else {
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
    if (!m) return '';
    ngay = +m[1]; thang = +m[2]; nam = +m[3];
  }
  var d = new Date(Date.UTC(nam, thang - 1, ngay));
  if (d.getUTCDate() !== ngay || d.getUTCMonth() !== thang - 1) return '';
  return nam + '-' + ('0' + thang).slice(-2) + '-' + ('0' + ngay).slice(-2);
}

/** yyyy-MM-dd → đối tượng Date (theo múi giờ dự án) để Google Sheet hiển thị đúng kiểu ngày. */
function sangNgay_(s) {
  s = chuanHoaNgay_(s);
  if (!s) return '';
  var p = s.split('-');
  return new Date(+p[0], p[1] - 1, +p[2]);
}

function dinhDangNgayVN_(s) {
  s = String(s || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
}

function tachDonVi_(s) {
  return String(s || '').split(/[;\n]/).map(function (x) { return x.trim(); }).filter(String);
}

function taoId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function maHoa_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

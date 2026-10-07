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

function timTenLoai_(dong) {
  for (var i = 0; i < Math.min(dong.length, 80); i++) {
    var l = dong[i];
    if (!l || l !== l.toUpperCase() || l.length > 40) continue;
    for (var j = 0; j < LOAI_VAN_BAN.length; j++) {
      if (l.replace(/\s+/g, ' ') === LOAI_VAN_BAN[j].toUpperCase()) return { loai: LOAI_VAN_BAN[j], dong: i };
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
function trichXuatThongTin(text, tenFile) {
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
  var tenLoai = timTenLoai_(dong);
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

if (typeof module !== 'undefined') module.exports = { trichXuatThongTin: trichXuatThongTin, boDau: boDau, LOAI_VAN_BAN: LOAI_VAN_BAN };

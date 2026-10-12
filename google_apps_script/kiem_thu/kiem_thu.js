// Kiểm thử Code.gs ngoài Google bằng bộ giả lập gas_mock.js. Chạy: node google_apps_script/kiem_thu/kiem_thu.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { console, TextEncoder, TextDecoder, crypto: require('crypto').webcrypto, atob, Proxy, JSON, Date, Math };
vm.createContext(ctx);
const path = require('path');
vm.runInContext(fs.readFileSync(path.join(__dirname, 'gas_mock.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
const r = (code) => vm.runInContext(code, ctx);

// Cài đặt lần đầu
ctx.__prompts.push('UBND xã Thử', 'matkhau123');
r('caiDatLanDau()');
assert.deepStrictEqual(Object.keys(ctx.__sheets).sort(), ['BaoCao','CauHinh','DonVi','LichSu','NguoiDung','NhiemVu','VanBan']);
assert.strictEqual(r('docBang_(BANG.DON_VI).length'), 7);
assert.ok(ctx.__log.alerts[0].startsWith('Đã cài đặt xong'));
// Mã băm mật khẩu bắt đầu bằng số không bị đổi thành số
const nd = r('docBang_(BANG.NGUOI_DUNG)[0]');
assert.strictEqual(typeof nd.matKhau, 'string'); assert.strictEqual(nd.matKhau.length, 64);

// Đăng nhập
assert.throws(() => r("dangNhap('quantri','sai')"), /không đúng/);
const tk = r("dangNhap('quantri','matkhau123')");
assert.strictEqual(tk.nguoiDung.vaiTro, 'quan_tri');
assert.strictEqual(tk.thongTin.coAI, false);
ctx.TOKEN = tk.token;
r(`themDong_(BANG.NGUOI_DUNG,{tenDangNhap:'phongkinhte',hoTen:'Phòng Kinh tế',vaiTro:'don_vi',donVi:'Phòng Kinh tế',email:'',matKhau:bamMatKhau_('pkt123456')})`);
r(`themDong_(BANG.NGUOI_DUNG,{tenDangNhap:'lanhdao',hoTen:'Lãnh đạo',vaiTro:'can_bo_duyet',donVi:'',email:'ld@x.vn',matKhau:bamMatKhau_('ld123456')})`);
ctx.TK_DV = r("dangNhap('phongkinhte','pkt123456')").token;
ctx.TK_LD = r("dangNhap('lanhdao','ld123456')").token;

// Không có AI: DOCX dùng quy tắc; PDF bị từ chối
// Nội dung word/document.xml rút gọn của một tệp DOCX (Utilities.unzip được giả lập).
const xml = Buffer.from('<w:document><w:body><w:p><w:r><w:t>KẾ HOẠCH số 20/KH-UBND</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t>1. Giao Phòng Kinh tế chủ trì, phối hợp Công an xã rà soát điểm tập kết rác thải, báo cáo trước ngày 25/10/2026.</w:t></w:r></w:p>'
  + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A &amp; B</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>&lt;x&gt;</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
  + '</w:body></w:document>', 'utf8');
ctx.__unzip = [ctx.Utilities.newBlob(Array.from(xml).map(b => b > 127 ? b - 256 : b), 'text/xml', 'word/document.xml')];
const docx = Buffer.from('PK').toString('base64');
let pt = r(`phanTichVanBan(TOKEN, {ten:'kh.docx', mime:'x', duLieu:'${docx}'})`);
assert.strictEqual(pt.nhiemVu.length, 1);
assert.strictEqual(pt.nhiemVu[0].chuTri, 'Phòng Kinh tế');
assert.strictEqual(pt.nhiemVu[0].phoiHop, 'Công an xã');
assert.strictEqual(pt.nhiemVu[0].han, '2026-10-25');
assert.ok(r(`trichChu_('a.docx', Utilities.base64Decode('${docx}'))`).includes('A & B | <x>'));
assert.throws(() => r(`phanTichVanBan(TOKEN, {ten:'a.pdf', mime:'application/pdf', duLieu:'JVBERg=='})`), /cần có AI/);
assert.throws(() => r(`phanTichVanBan(TK_DV, {ten:'a.txt', mime:'t', duLieu:'YQ=='})`), /không có quyền/);

// Có AI: kiểm tra yêu cầu gửi Claude
ctx.__props.ANTHROPIC_API_KEY = 'sk-test';
ctx.__phanTichGia = { so_hieu: '01/KH-UBND', trich_yeu: 'KH thử', co_quan_ban_hanh: 'UBND xã', ngay_ban_hanh: '01/10/2026', tom_tat: 'TT',
  nhiem_vu: [{ noi_dung: 'Rà soát', trich_dan: 'td', don_vi_chu_tri: 'Phòng Kinh tế', don_vi_phoi_hop: ['Công an xã', 'Đoàn xã'], ca_nhan_phu_trach: '', han_xu_ly: '2026-10-05' }] };
pt = r(`phanTichVanBan(TOKEN, {ten:'a.pdf', mime:'application/pdf', duLieu:'JVBERg=='})`);
const req = ctx.__log.fetch.at(-1);
assert.strictEqual(req.body.model, 'claude-opus-5-5');
assert.strictEqual(req.body.fallbacks, 'default');
assert.strictEqual(req.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
assert.strictEqual(req.body.output_config.format.type, 'json_schema');
assert.strictEqual(req.body.messages[0].content[0].type, 'document');
assert.strictEqual(pt.vanBan.ngayBanHanh, '2026-10-01');
assert.strictEqual(pt.nhiemVu[0].phoiHop, 'Công an xã; Đoàn xã');
ctx.__maLoi = 401;
assert.throws(() => r(`phanTichVanBan(TOKEN, {ten:'a.pdf', mime:'application/pdf', duLieu:'JVBERg=='})`), /không hợp lệ/);
ctx.__maLoi = 0;

// Giao nhiệm vụ
ctx.PT = pt;
assert.throws(() => r(`giaoNhiemVu(TOKEN, {vanBan: PT.vanBan, nhiemVu: [{noiDung:'x', chuTri:''}]})`), /chưa có đơn vị chủ trì/);
const g = r(`giaoNhiemVu(TOKEN, {tep:{ten:'a.pdf',mime:'application/pdf',duLieu:'JVBERg=='}, vanBan: PT.vanBan,
  nhiemVu: PT.nhiemVu.concat([{noiDung:'=Tuyên truyền BHYT', chuTri:'Phòng Văn hóa - Xã hội', phoiHop:'', han:''}])})`);
assert.strictEqual(g.soNhiemVu, 2);
assert.ok(r("docBang_(BANG.DON_VI).map(d=>d.ten)").includes('Đoàn xã'));
const ds = r('layNhiemVu(TOKEN)');
assert.strictEqual(ds.length, 2);
assert.strictEqual(ds[0].canhBao, 'Quá hạn');       // hạn 05/10 < hôm nay
assert.strictEqual(ds[1].noiDung, '=Tuyên truyền BHYT'); // không bị hiểu thành công thức
assert.strictEqual(typeof ds[0].id, 'string');
assert.strictEqual(r("docBang_(BANG.VAN_BAN)[0].soHieu"), '01/KH-UBND');
// Kết quả trả về trình duyệt không được chứa Date
assert.ok(!JSON.stringify(ds).includes('T00:00'));

// Đơn vị chỉ thấy việc của mình và chỉ sửa khi là chủ trì
assert.strictEqual(r('layNhiemVu(TK_DV)').length, 1);
ctx.ID1 = ds[0].id; ctx.ID2 = ds[1].id;
assert.throws(() => r(`capNhatTienDo(TK_DV, ID2, {trangThai:'Đang thực hiện', tienDo: 50})`), /Chỉ đơn vị chủ trì/);
r(`capNhatTienDo(TK_DV, ID1, {trangThai:'Đang thực hiện', tienDo: 100, ketQua:'Đã rà soát 12 điểm', ghiChu:'xong', han:'2030-01-01'})`);
let nv1 = r('layNhiemVu(TOKEN)').find(n => n.id === ctx.ID1);
assert.strictEqual(nv1.trangThai, 'Hoàn thành'); assert.strictEqual(nv1.han, '2026-10-05'); // đơn vị không đổi được hạn
assert.strictEqual(nv1.ngayHoanThanh, r('homNay_()'));
r(`capNhatTienDo(TOKEN, ID2, {trangThai:'Đang thực hiện', tienDo: 30, han:'2026-10-12'})`);
const ls = r('layLichSu(TOKEN, ID2)');
assert.ok(ls[0].ghiChu.includes('điều chỉnh hạn'));

// Nhắc việc: ID2 sắp đến hạn; đơn vị chưa có email → chỉ gửi tổng hợp cho quản trị
assert.strictEqual(r('guiNhacViecHangNgay()'), 1);
assert.ok(ctx.__log.mail[0].htmlBody.includes('Tuyên truyền'));

// Báo cáo
assert.throws(() => r(`taoBaoCao(TK_DV, {tieuDe:'x', tuNgay:'2026-10-01', denNgay:'2026-10-31'})`), /không có quyền/);
const bc = r(`taoBaoCao(TOKEN, {tieuDe:'BC tháng 10', tuNgay:'2026-10-01', denNgay:'2026-10-31', donVi:'', dungAI:false})`);
let b = r('layBaoCao(TOKEN)')[0];
assert.ok(b.noiDung.includes('Tổng số nhiệm vụ theo dõi: 2'), b.noiDung);
assert.ok(b.noiDung.includes('Đã rà soát 12 điểm'));
const bcAI = r(`taoBaoCao(TOKEN, {tieuDe:'BC AI', tuNgay:'2026-10-01', denNgay:'2026-10-31', donVi:'', dungAI:true})`);
assert.ok(r('layBaoCao(TOKEN)')[0].noiDung.includes('do AI soạn'));
assert.strictEqual(ctx.__log.fetch.at(-1).body.output_config.format, undefined);
ctx.MA_BC = bc.id;
assert.throws(() => r(`kiemDuyetBaoCao(TK_LD, MA_BC, true, '')`), /không thể duyệt/);
r(`luuBaoCao(TOKEN, MA_BC, 'Nội dung sửa', true)`);
assert.throws(() => r(`luuBaoCao(TOKEN, MA_BC, 'x', false)`), /không sửa được/);
assert.throws(() => r(`kiemDuyetBaoCao(TK_LD, MA_BC, false, '')`), /Cần ghi ý kiến/);
r(`kiemDuyetBaoCao(TK_LD, MA_BC, false, 'Bổ sung số liệu')`);
assert.strictEqual(r('layBaoCao(TOKEN)').find(x => x.id === ctx.MA_BC).trangThai, 'Yêu cầu chỉnh sửa');
r(`luuBaoCao(TOKEN, MA_BC, 'Nội dung đã bổ sung', true)`);
const url = r(`kiemDuyetBaoCao(TK_LD, MA_BC, true, 'Đồng ý')`);
b = r('layBaoCao(TOKEN)').find(x => x.id === ctx.MA_BC);
assert.strictEqual(b.trangThai, 'Đã duyệt'); assert.strictEqual(b.tep, url); assert.ok(url.includes('docs.google.com'));
assert.strictEqual(ctx.__log.docs.length, 1);

// Phiên hết hạn
assert.throws(() => r(`layNhiemVu('khong-co')`), /PHIEN_HET_HAN/);
// Tiện ích
assert.strictEqual(r("chuanHoaNgay_('31/02/2026')"), '');
assert.strictEqual(r("soNgayGiua_('2026-10-11','2026-10-01')"), -10);
assert.strictEqual(r("timHan_('báo cáo trước 30/11', 2026)"), '2026-11-30');
console.log('Tất cả kiểm thử đều đạt.');

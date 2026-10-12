// Giả lập tối thiểu các dịch vụ Google Apps Script để chạy thử Code.gs ngoài Google.
(function (G) {
  G.__log = { mail: [], fetch: [], alerts: [], docs: [] };
  G.__prompts = [];
  function chain(name) {
    var f = function () { return p; };
    var p = new Proxy(f, { get: function (t, k) { if (k === Symbol.toPrimitive) return function () { return name; }; if (k === 'getId') return function () { return 'doc123'; }; return chain(name + '.' + String(k)); }, apply: function () { return p; } });
    return p;
  }
  // --- Sheets ---------------------------------------------------------------
  function coerce(v) {
    if (typeof v === 'string') {
      if (v[0] === "'") return v.slice(1);
      if (/^-?\d+(\.\d+)?(e\d+)?$/i.test(v)) return Number(v);       // Sheets tự đổi chuỗi số
      if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(v)) return new Date(2026, 0, 1); // và chuỗi giống ngày
    }
    return v;
  }
  function Sheet(name) { this.name = name; this.data = []; }
  Sheet.prototype.getLastRow = function () { return this.data.length; };
  Sheet.prototype.getLastColumn = function () { return this.data.reduce(function (m, r) { return Math.max(m, r.length); }, 0); };
  Sheet.prototype.appendRow = function (a) { this.data.push(a.map(coerce)); return this; };
  Sheet.prototype.setFrozenRows = function () { return this; };
  Sheet.prototype.getRange = function (r, c, nr, nc) {
    var sh = this; nr = nr || 1; nc = nc || 1;
    var rg = {
      getValues: function () {
        var out = [];
        for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) { var v = (sh.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); }
        return out;
      },
      setValue: function (v) { while (sh.data.length < r) sh.data.push([]); sh.data[r - 1][c - 1] = coerce(v); return rg; },
      setFontWeight: function () { return rg; }, setBackground: function () { return rg; }
    };
    return rg;
  };
  var sheets = {};
  var ss = {
    getSheetByName: function (n) { return sheets[n] || null; },
    insertSheet: function (n) { return (sheets[n] = new Sheet(n)); },
    getName: function () { return 'Sổ theo dõi'; }, getId: function () { return 'ss1'; }
  };
  G.__sheets = sheets;
  G.SpreadsheetApp = {
    getActive: function () { return ss; },
    getUi: function () {
      return {
        ButtonSet: { OK_CANCEL: 1 }, Button: { OK: 'OK' },
        prompt: function () { var t = G.__prompts.shift(); return { getSelectedButton: function () { return 'OK'; }, getResponseText: function () { return t; } }; },
        alert: function (m) { G.__log.alerts.push(m); },
        createMenu: function () { return chain('menu'); }, showModelessDialog: function () {}
      };
    }
  };
  // --- Utilities ------------------------------------------------------------
  function pad(n) { return ('0' + n).slice(-2); }
  function toBytes(s) { return Array.from(new TextEncoder().encode(s)).map(function (b) { return b > 127 ? b - 256 : b; }); }
  function blob(bytes, mime, name) {
    return {
      getDataAsString: function () { return new TextDecoder().decode(new Uint8Array(bytes.map(function (b) { return b & 255; }))); },
      getName: function () { return name; }, getBytes: function () { return bytes; }, getContentType: function () { return mime; }
    };
  }
  G.Utilities = {
    formatDate: function (d, tz, f) {
      var s = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      return f === 'yyyy-MM-dd' ? s : s + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    },
    getUuid: function () { return crypto.randomUUID(); },
    base64Decode: function (b64) { return Array.from(atob(b64), function (ch) { var c = ch.charCodeAt(0); return c > 127 ? c - 256 : c; }); },
    newBlob: function (bytes, mime, name) { return blob(bytes, mime, name); },
    unzip: function () { return G.__unzip || []; },
    sleep: function () {},
    DigestAlgorithm: { SHA_256: 'sha' }, Charset: { UTF_8: 'utf8' },
    computeDigest: function (alg, s) {
      var h = []; var x = 2166136261;
      for (var k = 0; k < 32; k++) { for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i) + k; x = Math.imul(x, 16777619) >>> 0; } h.push((x & 255) - 128); }
      return h;
    }
  };
  // --- Các dịch vụ khác -----------------------------------------------------
  var cache = {}, props = {};
  G.__props = props; G.__cacheRaw = cache;
  G.CacheService = { getScriptCache: function () { return { put: function (k, v) { cache[k] = v; }, get: function (k) { return cache[k] || null; }, remove: function (k) { delete cache[k]; } }; } };
  G.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return props[k] || null; }, setProperty: function (k, v) { props[k] = v; }, deleteProperty: function (k) { delete props[k]; } }; } };
  G.LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
  G.Session = { getScriptTimeZone: function () { return 'Asia/Ho_Chi_Minh'; }, getActiveUser: function () { return { getEmail: function () { return 'owner@example.com'; } }; } };
  G.MailApp = { sendEmail: function (o) { G.__log.mail.push(o); } };
  G.MimeType = { PDF: 'application/pdf' };
  var soTep = 0;
  function folder(id) { return { getId: function () { return id; }, createFolder: function (n) { return folder('f_' + n); }, createFile: function (b) { soTep++; return { getUrl: function () { return 'https://drive.google.com/file/d/tep' + soTep; }, getId: function () { return 'tep' + soTep; }, name: b.getName() }; } }; }
  G.DriveApp = {
    getFolderById: function (id) { return folder(id); }, createFolder: function (n) { return folder('root_' + n); }, getRootFolder: function () { return folder('root'); },
    getFileById: function (id) { return { moveTo: function () {}, getUrl: function () { return 'https://docs.google.com/document/d/' + id; } }; }
  };
  G.DocumentApp = new Proxy({}, { get: function (t, k) {
    if (k === 'create') return function (name) { G.__log.docs.push(name); return chain('doc'); };
    return chain('DocumentApp.' + String(k));
  } });
  G.ScriptApp = { getProjectTriggers: function () { return []; }, newTrigger: function () { return chain('trigger'); }, deleteTrigger: function () {},
    getService: function () { return { getUrl: function () { return 'https://script.google.com/macros/s/TEST/exec'; } }; } };
  G.HtmlService = chain('HtmlService');
  G.UrlFetchApp = {
    fetch: function (url, opt) {
      var body = JSON.parse(opt.payload);
      G.__log.fetch.push({ url: url, headers: opt.headers, body: body });
      var text;
      if (body.output_config.format) {
        text = JSON.stringify(G.__phanTichGia || { so_hieu: '15/KH-UBND', trich_yeu: 'Kế hoạch thử', co_quan_ban_hanh: 'UBND xã', ngay_ban_hanh: '2026-10-01', tom_tat: 'Tóm tắt', nhiem_vu: [] });
      } else {
        text = 'I. TÌNH HÌNH CHUNG\n- Báo cáo do AI soạn.\n\nII. KẾT QUẢ THỰC HIỆN\n- …';
      }
      var res = { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: text }], stop_reason: 'end_turn' };
      return { getResponseCode: function () { return G.__maLoi || 200; }, getContentText: function () { return G.__maLoi ? JSON.stringify({ error: { message: 'giả lập lỗi' } }) : JSON.stringify(res); } };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
// Lưu/khôi phục trạng thái giả lập qua các lần tải lại trang (chỉ dùng khi chạy thử trên trình duyệt).
(function (G) {
  if (typeof localStorage === 'undefined') return;
  G.__luu = function () {
    var st = { sheets: {}, props: G.__props, cache: {} };
    Object.keys(G.__sheets).forEach(function (n) {
      st.sheets[n] = G.__sheets[n].data.map(function (r) { return r.map(function (v) { return v instanceof Date ? { __d: v.getTime() } : v; }); });
    });
    st.cache = G.__cacheRaw;
    localStorage.setItem('gas_state', JSON.stringify(st));
  };
  G.__khoiPhuc = function () {
    var raw = localStorage.getItem('gas_state');
    if (!raw) return false;
    var st = JSON.parse(raw), ss = G.SpreadsheetApp.getActive();
    Object.keys(st.sheets).forEach(function (n) {
      ss.insertSheet(n).data = st.sheets[n].map(function (r) { return r.map(function (v) { return v && v.__d ? new Date(v.__d) : v; }); });
    });
    Object.assign(G.__props, st.props);
    Object.assign(G.__cacheRaw, st.cache);
    return true;
  };
})(typeof window !== "undefined" ? window : globalThis);

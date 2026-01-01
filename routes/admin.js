var express = require("express");
var router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const XLSX = require("xlsx");
const mongoose = require("mongoose");
const requireAdmin = require("../middlewares/requireAdmin");
const MonAn = require("../models/MonAn");
const DanhMuc = require("../models/DanhMuc");
const DonHang = require("../models/DonHang");
/* ===== Upload ảnh món ăn ===== */
const uploadDir = path.join(__dirname, "..", "public", "uploads", "monan");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname || "").toLowerCase();
        const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".jpg";
        const unique = `mon_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;
        cb(null, unique);
    },
});

const fileFilter = (req, file, cb) => {
    const ok = ["image/png", "image/jpg", "image/jpeg", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("File không phải ảnh"), ok);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 4 * 1024 * 1024 },
});

/* util xóa ảnh cũ theo đường dẫn public */
function tryDeletePublicFile(publicPath = "") {
    try {
        if (!publicPath) return;
        const abs = path.join(__dirname, "..", "public", publicPath.replace(/^\//, ""));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (e) { }
}

/* ===== helper render admin dùng layout dashboard ===== */
function renderAdmin(req, res, view, data = {}) {
    return res.render(view, {
        layout: "admin/_layout", // ✅ file layout dashboard bạn tạo: views/admin/_layout.ejs
        session: req.session,    // ✅ để layout lấy session
        ...data,
    });
}
// ===================
const excelTmpDir = path.join(__dirname, "..", "_tmp_excel");
fs.mkdirSync(excelTmpDir, { recursive: true });

const excelUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, excelTmpDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || "").toLowerCase();
            const safe = [".xlsx", ".xls"].includes(ext) ? ext : ".xlsx";
            cb(null, `excel_${Date.now()}_${Math.random().toString(16).slice(2)}${safe}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        const ok = [".xlsx", ".xls"].includes(ext);
        cb(ok ? null : new Error("File không đúng định dạng Excel (.xlsx/.xls)"), ok);
    },
    limits: { fileSize: 6 * 1024 * 1024 } // 6MB
});

function toNumber(v, def = 0) {
    const n = Number(String(v ?? "").toString().replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : def;
}
function toInt(v, def = 0) {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : def;
}
function toStr(v) {
    return String(v ?? "").trim();
}
function toBool01(v, def = 1) {
    const s = String(v ?? "").trim().toLowerCase();
    if (s === "") return def;
    if (["1", "true", "yes", "y", "on"].includes(s)) return 1;
    if (["0", "false", "no", "n", "off"].includes(s)) return 0;
    const n = Number(s);
    if (Number.isFinite(n)) return n ? 1 : 0;
    return def;
}
/* ===== ADMIN DASHBOARD ===== */
router.get("/dashboard", requireAdmin, async (req, res) => {
    return renderAdmin(req, res, "admin/dashboard_home", {
        title: "Dashboard",
        active: "dashboard",
    });
});

/* ===== LIST món ăn ===== */
// LIST món ăn (có phân trang + tìm kiếm q)
router.get("/monan", requireAdmin, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limitRaw = parseInt(req.query.limit || "6", 10);
    const limit = Math.min(50, Math.max(5, Number.isFinite(limitRaw) ? limitRaw : 10));

    const q = String(req.query.q || "").trim();
    const filter = {};

    if (q) {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(escaped, "i");
        filter.$or = [
            { TenMon: re },
            { Slug: re },
            { MoTaNgan: re },
            { MoTaChiTiet: re },
        ];
    }

    const total = await MonAn.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const curPage = Math.min(page, totalPages);
    const skip = (curPage - 1) * limit;

    const items = await MonAn.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("DanhMucId")
        .lean();

    // baseUrl giữ lại query (q, limit...) khi bấm trang
    const params = { ...req.query };
    delete params.page;
    const qs = new URLSearchParams(params).toString();
    const baseUrl = qs ? `/admin/monan?${qs}` : `/admin/monan`;

    return renderAdmin(req, res, "admin/monan_list", {
        title: "Quản lý món ăn",
        active: "monan",
        items,
        q,
        baseUrl,
        pagination: {
            page: curPage,
            limit,
            total,
            totalPages,
            hasPrev: curPage > 1,
            hasNext: curPage < totalPages,
        },
    });
});

/* ===== FORM thêm món ===== */
router.get("/monan/them", requireAdmin, async (req, res) => {
    const danhMucs = await DanhMuc.find({ KichHoat: 1 })
        .sort({ TenDanhMuc: 1 })
        .lean();

    return renderAdmin(req, res, "admin/monan_form", {
        title: "Thêm món ăn",
        active: "sanpham",
        mode: "create",
        item: null,
        danhMucs,
    });
});

/* ===== POST thêm món ===== */
router.post("/monan/them", requireAdmin, upload.single("HinhAnh"), async (req, res) => {
    try {
        const {
            TenMon,
            Slug,
            Gia,
            GiaKhuyenMai,
            MoTaNgan,
            MoTaChiTiet,
            DanhMucId,
            SoLuongTon,
            KichHoat,
        } = req.body;

        if (!TenMon || !Gia || !DanhMucId) {
            req.session.error = "Thiếu: Tên món / Giá / Danh mục.";
            return res.redirect("/error");
        }

        const doc = {
            TenMon: String(TenMon).trim(),
            Slug: String(Slug || "").trim(), // rỗng -> schema tự tạo
            Gia: Number(Gia || 0),
            GiaKhuyenMai: Number(GiaKhuyenMai || 0),
            MoTaNgan: String(MoTaNgan || "").trim(),
            MoTaChiTiet: String(MoTaChiTiet || "").trim(),
            DanhMucId,
            SoLuongTon: Number(SoLuongTon || 0),
            KichHoat: Number(KichHoat ?? 1),
            HinhAnh: req.file ? `/uploads/monan/${req.file.filename}` : "",
        };

        // nếu nhập slug thì check trùng
        if (doc.Slug) {
            const existed = await MonAn.findOne({ Slug: doc.Slug }).lean();
            if (existed) {
                req.session.error = "Slug đã tồn tại, hãy đổi slug khác.";
                return res.redirect("/error");
            }
        }

        await MonAn.create(doc);

        // ✅ sau khi thêm xong -> quay về danh sách luôn
        return res.redirect("/admin/monan");
    } catch (err) {
        console.error(err);
        req.session.error = err.message || "Lỗi khi thêm món ăn.";
        return res.redirect("/error");
    }
});

/* ===== FORM sửa món ===== */
router.get("/monan/sua/:id", requireAdmin, async (req, res) => {
    const item = await MonAn.findById(req.params.id).lean();
    if (!item) {
        req.session.error = "Không tìm thấy món ăn.";
        return res.redirect("/error");
    }

    const danhMucs = await DanhMuc.find({ KichHoat: 1 })
        .sort({ TenDanhMuc: 1 })
        .lean();

    return renderAdmin(req, res, "admin/monan_form", {
        title: "Sửa món ăn",
        active: "sanpham",
        mode: "edit",
        item,
        danhMucs,
    });
});

/* ===== POST sửa món ===== */
router.post("/monan/sua/:id", requireAdmin, upload.single("HinhAnh"), async (req, res) => {
    try {
        const id = req.params.id;
        const old = await MonAn.findById(id).lean();
        if (!old) {
            req.session.error = "Không tìm thấy món ăn.";
            return res.redirect("/error");
        }

        const {
            TenMon,
            Slug,
            Gia,
            GiaKhuyenMai,
            MoTaNgan,
            MoTaChiTiet,
            DanhMucId,
            SoLuongTon,
            KichHoat,
            XoaAnh,
        } = req.body;

        const update = {
            TenMon: String(TenMon || "").trim(),
            Slug: String(Slug || "").trim(),
            Gia: Number(Gia || 0),
            GiaKhuyenMai: Number(GiaKhuyenMai || 0),
            MoTaNgan: String(MoTaNgan || "").trim(),
            MoTaChiTiet: String(MoTaChiTiet || "").trim(),
            DanhMucId,
            SoLuongTon: Number(SoLuongTon || 0),
            KichHoat: Number(KichHoat ?? 1),
        };

        // check slug trùng (nếu có nhập)
        if (update.Slug) {
            const existed = await MonAn.findOne({ Slug: update.Slug, _id: { $ne: id } }).lean();
            if (existed) {
                req.session.error = "Slug đã tồn tại, hãy đổi slug khác.";
                return res.redirect("/error");
            }
        }

        // ảnh
        let newPublicImg = old.HinhAnh || "";
        if (req.file) {
            newPublicImg = `/uploads/monan/${req.file.filename}`;
            tryDeletePublicFile(old.HinhAnh);
        } else if (String(XoaAnh || "") === "1") {
            tryDeletePublicFile(old.HinhAnh);
            newPublicImg = "";
        }
        update.HinhAnh = newPublicImg;

        await MonAn.findByIdAndUpdate(id, update, { runValidators: true });

        // ✅ sửa xong -> quay về danh sách
        return res.redirect("/admin/monan");
    } catch (err) {
        console.error(err);
        req.session.error = err.message || "Lỗi khi sửa món ăn.";
        return res.redirect("/error");
    }
});

/* ===== XÓA món ===== */
router.post("/monan/xoa/:id", requireAdmin, async (req, res) => {
    try {
        const item = await MonAn.findById(req.params.id).lean();
        if (!item) {
            req.session.error = "Không tìm thấy món ăn.";
            return res.redirect("/error");
        }

        tryDeletePublicFile(item.HinhAnh);
        await MonAn.findByIdAndDelete(req.params.id);

        // ✅ xoá xong -> quay về danh sách
        return res.redirect("/admin/monan");
    } catch (err) {
        console.error(err);
        req.session.error = "Lỗi khi xóa món ăn.";
        return res.redirect("/error");
    }
});
router.get("/danhmuc/quanly", requireAdmin, async (req, res) => {
    const items = await DanhMuc.find().sort({ ThuTu: 1, createdAt: -1 }).lean();
    return renderAdmin(req, res, "admin/danhmuc_list", {
        title: "Quản lý danh mục",
        active: "danhmuc",
        items,
    });
});
async function monAnMauExcel(req, res) {
    const wsData = [
        [
            "TenMon",
            "Slug",
            "Gia",
            "GiaKhuyenMai",
            "MoTaNgan",
            "MoTaChiTiet",
            "DanhMucSlug",
            "SoLuongTon",
            "KichHoat",
            "HinhAnh"
        ],
        [
            "Pad Thái",
            "pad-thai",
            55000,
            49000,
            "Mì xào kiểu Thái",
            "Mì xào kiểu Thái, tôm, trứng, sốt me...",
            "mon-chinh",
            999999,
            1,
            "/uploads/monan/abc.jpg"
        ]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "MonAn");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="mau_monan.xlsx"`);
    return res.send(buf);
}
router.get("/monan/mau-excel", requireAdmin, monAnMauExcel);
router.get("/sanpham/mau-excel", requireAdmin, monAnMauExcel); // alias

/* ===== XUẤT EXCEL ===== */
async function monAnXuatExcel(req, res) {
    const items = await MonAn.find()
        .sort({ createdAt: -1 })
        .populate("DanhMucId")
        .lean();

    const rows = items.map((it) => ({
        TenMon: it.TenMon || "",
        Slug: it.Slug || "",
        Gia: Number(it.Gia || 0),
        GiaKhuyenMai: Number(it.GiaKhuyenMai || 0),
        MoTaNgan: it.MoTaNgan || "",
        MoTaChiTiet: it.MoTaChiTiet || "",
        DanhMucSlug: it.DanhMucId?.Slug || "",
        DanhMucTen: it.DanhMucId?.TenDanhMuc || "",
        SoLuongTon: Number(it.SoLuongTon || 0),
        KichHoat: Number(it.KichHoat ?? 1),
        HinhAnh: it.HinhAnh || ""
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "MonAn");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const d = new Date();
    const file = `monan_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    return res.send(buf);
}
router.get("/monan/xuat-excel", requireAdmin, monAnXuatExcel);
router.get("/sanpham/xuat-excel", requireAdmin, monAnXuatExcel); // alias

/* ===== NHẬP EXCEL ===== */
async function monAnNhapExcel(req, res) {
    try {
        if (!req.file) {
            req.session.error = "Vui lòng chọn file Excel.";
            return res.redirect("/error");
        }

        const filePath = req.file.path;
        const wb = XLSX.readFile(filePath);
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];

        // đọc theo header
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" }); // [{TenMon:..., ...}, ...]

        // xóa file tmp
        try { fs.unlinkSync(filePath); } catch (e) { }

        if (!Array.isArray(data) || data.length === 0) {
            req.session.error = "File Excel không có dữ liệu.";
            return res.redirect("/error");
        }

        let created = 0;
        let updated = 0;
        let skipped = 0;
        const skipReasons = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i] || {};
            const TenMon = toStr(row.TenMon);
            const Slug = toStr(row.Slug);
            const Gia = toNumber(row.Gia, 0);

            // DanhMuc lấy theo DanhMucSlug (ưu tiên), fallback DanhMucTen
            const DanhMucSlug = toStr(row.DanhMucSlug);
            const DanhMucTen = toStr(row.DanhMucTen);

            if (!TenMon || !Gia) {
                skipped++;
                skipReasons.push(`Dòng ${i + 2}: thiếu TenMon hoặc Gia`);
                continue;
            }

            let dm = null;
            if (DanhMucSlug) dm = await DanhMuc.findOne({ Slug: DanhMucSlug }).lean();
            if (!dm && DanhMucTen) dm = await DanhMuc.findOne({ TenDanhMuc: DanhMucTen }).lean();

            if (!dm) {
                skipped++;
                skipReasons.push(`Dòng ${i + 2}: không tìm thấy danh mục (DanhMucSlug/Ten)`);
                continue;
            }

            const payload = {
                TenMon,
                // Slug: nếu rỗng thì schema tự tạo, nhưng khi update thì không set rỗng
                Gia,
                GiaKhuyenMai: toNumber(row.GiaKhuyenMai, 0),
                MoTaNgan: toStr(row.MoTaNgan),
                MoTaChiTiet: toStr(row.MoTaChiTiet),
                DanhMucId: dm._id,
                SoLuongTon: toNumber(row.SoLuongTon, 999999),
                KichHoat: toBool01(row.KichHoat, 1),
                HinhAnh: toStr(row.HinhAnh)
            };

            // nếu có slug => upsert theo slug (slug trùng thì update)
            if (Slug) {
                payload.Slug = Slug;
                const existed = await MonAn.findOne({ Slug }).lean();
                if (existed) {
                    // không ghi đè HinhAnh nếu excel để trống
                    if (!payload.HinhAnh) delete payload.HinhAnh;
                    await MonAn.updateOne({ _id: existed._id }, { $set: payload }, { runValidators: true });
                    updated++;
                } else {
                    await MonAn.create(payload);
                    created++;
                }
            } else {
                // không có slug -> tạo mới
                await MonAn.create(payload);
                created++;
            }
        }

        // thông báo
        req.session.success = `Nhập Excel xong: tạo mới ${created}, cập nhật ${updated}, bỏ qua ${skipped}.` +
            (skipReasons.length ? ` (Lý do: ${skipReasons.slice(0, 3).join(" | ")}${skipReasons.length > 3 ? " ..." : ""})` : "");

        return res.redirect("/success");
    } catch (err) {
        console.error(err);
        req.session.error = err.message || "Lỗi khi nhập Excel món ăn.";
        return res.redirect("/error");
    }
}
router.post("/monan/nhap-excel", requireAdmin, excelUpload.single("excel"), monAnNhapExcel);
router.post("/sanpham/nhap-excel", requireAdmin, excelUpload.single("excel"), monAnNhapExcel);
// cho tiện: /admin/danhmuc -> redirect về /quanly
router.get("/danhmuc", requireAdmin, (req, res) => res.redirect("/admin/danhmuc/quanly"));

/* FORM THÊM */
router.get("/danhmuc/them", requireAdmin, (req, res) => {
    return renderAdmin(req, res, "admin/danhmuc_form", {
        title: "Thêm danh mục",
        active: "danhmuc",
        mode: "create",
        item: null,
    });
});

/* POST THÊM */
router.post("/danhmuc/them", requireAdmin, async (req, res) => {
    try {
        const { TenDanhMuc, Slug, MoTa, ThuTu, KichHoat } = req.body;

        if (!TenDanhMuc) {
            req.session.error = "Vui lòng nhập Tên danh mục.";
            return res.redirect("/error");
        }

        const doc = {
            TenDanhMuc: String(TenDanhMuc).trim(),
            Slug: String(Slug || "").trim(), // rỗng -> schema tự tạo
            MoTa: String(MoTa || "").trim(),
            ThuTu: Number(ThuTu || 0),
            KichHoat: Number(KichHoat ?? 1),
        };

        if (doc.Slug) {
            const existed = await DanhMuc.findOne({ Slug: doc.Slug }).lean();
            if (existed) {
                req.session.error = "Slug đã tồn tại, hãy đổi slug khác.";
                return res.redirect("/error");
            }
        }

        await DanhMuc.create(doc);
        return res.redirect("/admin/danhmuc/quanly");
    } catch (err) {
        console.error(err);
        if (err && err.code === 11000) {
            req.session.error = "Slug đã tồn tại, hãy đổi slug khác.";
            return res.redirect("/error");
        }
        req.session.error = err.message || "Lỗi khi thêm danh mục.";
        return res.redirect("/error");
    }
});

/* FORM SỬA */
router.get("/danhmuc/sua/:id", requireAdmin, async (req, res) => {
    const item = await DanhMuc.findById(req.params.id).lean();
    if (!item) {
        req.session.error = "Không tìm thấy danh mục.";
        return res.redirect("/error");
    }

    return renderAdmin(req, res, "admin/danhmuc_form", {
        title: "Sửa danh mục",
        active: "danhmuc",
        mode: "edit",
        item,
    });
});

/* POST SỬA */
router.post("/danhmuc/sua/:id", requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const old = await DanhMuc.findById(id).lean();
        if (!old) {
            req.session.error = "Không tìm thấy danh mục.";
            return res.redirect("/error");
        }

        const { TenDanhMuc, Slug, MoTa, ThuTu, KichHoat } = req.body;

        if (!TenDanhMuc) {
            req.session.error = "Vui lòng nhập Tên danh mục.";
            return res.redirect("/error");
        }

        const update = {
            TenDanhMuc: String(TenDanhMuc).trim(),
            MoTa: String(MoTa || "").trim(),
            ThuTu: Number(ThuTu || 0),
            KichHoat: Number(KichHoat ?? 1),
        };

        // ⚠️ slug bỏ trống -> giữ slug cũ
        const slugIn = String(Slug || "").trim();
        if (slugIn) update.Slug = slugIn;

        if (update.Slug) {
            const existed = await DanhMuc.findOne({ Slug: update.Slug, _id: { $ne: id } }).lean();
            if (existed) {
                req.session.error = "Slug đã tồn tại, hãy đổi slug khác.";
                return res.redirect("/error");
            }
        }

        await DanhMuc.findByIdAndUpdate(id, update, { runValidators: true });
        return res.redirect("/admin/danhmuc/quanly");
    } catch (err) {
        console.error(err);
        if (err && err.code === 11000) {
            req.session.error = "Slug đã tồn tại, hãy đổi slug khác.";
            return res.redirect("/error");
        }
        req.session.error = err.message || "Lỗi khi sửa danh mục.";
        return res.redirect("/error");
    }
});

/* XÓA */
router.post("/danhmuc/xoa/:id", requireAdmin, async (req, res) => {
    try {
        const item = await DanhMuc.findById(req.params.id).lean();
        if (!item) {
            req.session.error = "Không tìm thấy danh mục.";
            return res.redirect("/error");
        }

        await DanhMuc.findByIdAndDelete(req.params.id);
        return res.redirect("/admin/danhmuc/quanly");
    } catch (err) {
        console.error(err);
        req.session.error = "Lỗi khi xóa danh mục.";
        return res.redirect("/error");
    }
});
/* ===== ĐƠN HÀNG (ADMIN) ===== */
const ORDER_STATUS = ["NEW", "CONFIRMED", "COOKING", "SHIPPING", "DONE", "CANCELLED"];

const STATUS_VI = {
    NEW: "Mới tạo",
    CONFIRMED: "Đã xác nhận",
    COOKING: "Đang chuẩn bị",
    SHIPPING: "Đang giao",
    DONE: "Hoàn thành",
    CANCELLED: "Đã hủy",
};

function statusVI(st) {
    const k = String(st || "").toUpperCase();
    return STATUS_VI[k] || k;
}

function shortId(id) {
    const s = String(id || "");
    return s.length > 6 ? s.slice(-6).toUpperCase() : s.toUpperCase();
}

function fmtDate(d) {
    if (!d) return "";
    const x = new Date(d);
    const dd = String(x.getDate()).padStart(2, "0");
    const mm = String(x.getMonth() + 1).padStart(2, "0");
    const yy = x.getFullYear();
    const hh = String(x.getHours()).padStart(2, "0");
    const mi = String(x.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

// ✅ normalize để VIEW luôn có o.Items và o.ThongTinGiaoHang
function normalizeOrder(o) {
    const Items =
        Array.isArray(o?.Items) ? o.Items :
            Array.isArray(o?.DanhSachMon) ? o.DanhSachMon :
                Array.isArray(o?.items) ? o.items :
                    Array.isArray(o?.chiTiet) ? o.chiTiet :
                        [];

    const ThongTinGiaoHang = o?.ThongTinGiaoHang || o?.thongTinGiaoHang || {};
    return { ...o, Items, ThongTinGiaoHang };
}

// ✅ alias cho menu đang để /admin/donhang/quanly
router.get("/donhang/quanly", requireAdmin, (req, res) => res.redirect("/admin/donhang"));

/**
 * GET /admin/donhang (list + filter)
 */
router.get("/donhang", requireAdmin, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limitRaw = parseInt(req.query.limit || "10", 10);
    const limit = Math.min(50, Math.max(5, Number.isFinite(limitRaw) ? limitRaw : 10));

    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim().toUpperCase();

    const filter = {};
    if (status && ORDER_STATUS.includes(status)) filter.TrangThai = status;

    if (q) {
        if (mongoose.Types.ObjectId.isValid(q)) {
            filter._id = q;
        } else {
            const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(escaped, "i");
            filter.$or = [
                { "ThongTinGiaoHang.HoTen": re },
                { "ThongTinGiaoHang.SDT": re },
                { "ThongTinGiaoHang.DiaChi": re },
            ];
        }
    }

    const total = await DonHang.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const curPage = Math.min(page, totalPages);
    const skip = (curPage - 1) * limit;

    const items = await DonHang.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const params = { ...req.query };
    delete params.page;
    const qs = new URLSearchParams(params).toString();
    const baseUrl = qs ? `/admin/donhang?${qs}` : `/admin/donhang`;

    return renderAdmin(req, res, "admin/donhang_list", {
        title: "Quản lý đơn hàng",
        active: "donhang",
        items,
        q,
        status,
        ORDER_STATUS,
        STATUS_VI,
        statusVI,
        baseUrl,
        shortId,
        fmtDate,
        pagination: {
            page: curPage,
            limit,
            total,
            totalPages,
            hasPrev: curPage > 1,
            hasNext: curPage < totalPages,
            prevPage: curPage - 1,
            nextPage: curPage + 1,
        },
    });
});

/**
 * GET /admin/donhang/:id (detail)
 */
router.get("/donhang/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.session.error = "Id đơn hàng không hợp lệ.";
        return res.redirect("/error");
    }

    const raw = await DonHang.findById(id).lean();
    if (!raw) {
        req.session.error = "Không tìm thấy đơn hàng.";
        return res.redirect("/error");
    }

    const order = normalizeOrder(raw);

    return renderAdmin(req, res, "admin/donhang_detail", {
        title: `Đơn hàng #${shortId(order._id)}`,
        active: "donhang",
        order,
        ORDER_STATUS,
        STATUS_VI,
        statusVI,
        shortId,
        fmtDate,
    });
});

/**
 * POST /admin/donhang/:id/trangthai
 */
router.post("/donhang/:id/trangthai", requireAdmin, async (req, res) => {
    const id = String(req.params.id || "");
    const TrangThai = String(req.body.TrangThai || "").toUpperCase();

    if (!mongoose.Types.ObjectId.isValid(id)) return res.redirect("/admin/donhang");
    if (!ORDER_STATUS.includes(TrangThai)) return res.redirect(`/admin/donhang/${id}`);

    await DonHang.updateOne({ _id: id }, { $set: { TrangThai } });
    return res.redirect(`/admin/donhang/${id}`);
});

/**
 * POST /admin/donhang/:id/thanhtoan
 */
router.post("/donhang/:id/thanhtoan", requireAdmin, async (req, res) => {
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) return res.redirect("/admin/donhang");

    const DaThanhToan = String(req.body.DaThanhToan || "") === "1";
    await DonHang.updateOne({ _id: id }, { $set: { DaThanhToan } });

    return res.redirect(`/admin/donhang/${id}`);
});
module.exports = router;

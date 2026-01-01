// routes/donhang_user.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const MonAn = require("../models/MonAn");
const DonHang = require("../models/DonHang");
const requireLogin = require("../middlewares/requireAdmin"); // đổi sang middleware login user của bạn nếu cần

const money = (n) => (Number(n || 0)).toLocaleString("vi-VN") + "₫";
const fmtDate = (d) => (d ? new Date(d).toLocaleString("vi-VN") : "");
const shortId = (id) => String(id || "").slice(-6).toUpperCase();

// ====== CẤU HÌNH CHUYỂN KHOẢN (QR VietQR fallback img.vietqr.io) ======
const BANK_ACQ_ID = Number(process.env.BANK_ACQ_ID || 970436);
const BANK_ACCOUNT_NO = String(process.env.BANK_ACCOUNT_NO || "9388713126").trim();
const BANK_ACCOUNT_NAME = String(process.env.BANK_ACCOUNT_NAME || "VO TUAN KIET").trim();

// (tuỳ chọn) bankId chữ: VCB/ACB/MB/TCB...
const BANK_ID = String(process.env.BANK_ID || "").trim().toUpperCase();
const QR_TEMPLATE = String(process.env.QR_TEMPLATE || "compact2").trim();

function safeBankToken(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function safeAccNo(s) {
    return String(s || "").replace(/[^\d]/g, "");
}
function safeTemplate(s) {
    return String(s || "compact2").toLowerCase().replace(/[^a-z0-9_]/g, "");
}

// luôn tạo được QR ảnh tĩnh (không cần key)
function buildQuickLink({ amount, addInfo }) {
    const bankToken = safeBankToken(BANK_ID) || String(BANK_ACQ_ID).replace(/[^\d]/g, "");
    const accToken = safeAccNo(BANK_ACCOUNT_NO);
    const tplToken = safeTemplate(QR_TEMPLATE);

    const qs = new URLSearchParams();
    const amt = Math.max(0, Math.floor(Number(amount || 0)));
    qs.set("amount", String(amt));
    if (addInfo) qs.set("addInfo", String(addInfo).slice(0, 50));
    if (BANK_ACCOUNT_NAME) qs.set("accountName", BANK_ACCOUNT_NAME);

    return `https://img.vietqr.io/image/${bankToken}-${accToken}-${tplToken}.png?${qs.toString()}`;
}

// GET /donhang (list)
router.get("/", requireLogin, async (req, res, next) => {
    try {
        const userId = String(req.session.MaNguoiDung);

        const page = Math.max(1, parseInt(req.query.page || "1", 10));
        const limit = 10;
        const skip = (page - 1) * limit;

        const status = String(req.query.status || "").trim().toUpperCase();

        const filter = { NguoiDungId: userId };
        if (status) filter.TrangThai = status;

        const total = await DonHang.countDocuments(filter);
        const totalPages = Math.max(1, Math.ceil(total / limit));

        const orders = await DonHang.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        return res.render("donhang/index", {
            title: "Đơn hàng của tôi",
            money,
            fmtDate,
            shortId,
            orders,
            state: { page, totalPages, total, status },
        });
    } catch (e) {
        next(e);
    }
});

// GET /donhang/:id (detail)
router.get("/:id", requireLogin, async (req, res, next) => {
    try {
        const userId = String(req.session.MaNguoiDung);
        const id = String(req.params.id);

        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).render("404");

        const order = await DonHang.findOne({ _id: id, NguoiDungId: userId }).lean();
        if (!order) return res.status(404).render("404");

        // 1) Lấy items từ nhiều field
        let items =
            order.Items ||
            order.items ||
            order.DanhSachMon ||
            order.danhSachMon ||
            order.ChiTiet ||
            order.chiTiet ||
            order.SanPham ||
            order.sanPham ||
            [];

        if (!Array.isArray(items)) items = [];

        // 2) Chuẩn hoá key về TenMon/DonGia/SoLuong/HinhAnh/MonAnId
        items = items.map((it) => ({
            MonAnId: it.MonAnId || it.monAnId || it.SanPhamId || it.sanPhamId || it.id || it._id,
            TenMon: it.TenMon || it.ten || it.Ten || it.name || "",
            DonGia: Number(it.DonGia ?? it.donGia ?? it.Gia ?? it.gia ?? 0),
            SoLuong: Number(it.SoLuong ?? it.soLuong ?? it.qty ?? 1),
            HinhAnh: (it.HinhAnh || it.anh || it.Anh || "").toString(),
        }));

        // 3) Nếu thiếu TenMon/HinhAnh mà có MonAnId -> bù từ bảng MonAn
        const needFill = items.some((x) => x.MonAnId && (!x.TenMon || !x.HinhAnh));
        if (needFill) {
            const ids = items
                .map((x) => x.MonAnId)
                .filter((x) => mongoose.Types.ObjectId.isValid(String(x)));

            const mons = await MonAn.find({ _id: { $in: ids } })
                .select("TenMon HinhAnh")
                .lean();

            const map = new Map(mons.map((m) => [String(m._id), m]));

            items = items.map((x) => {
                const m = map.get(String(x.MonAnId));
                return {
                    ...x,
                    TenMon: x.TenMon || m?.TenMon || "",
                    HinhAnh: x.HinhAnh && x.HinhAnh.trim() ? x.HinhAnh : m?.HinhAnh || "",
                };
            });
        }

        order.Items = items; // đảm bảo view dùng Items

        // 4) QR chuyển khoản cho user (nếu đơn là BANK)
        const pay = String(order.PhuongThucThanhToan || "COD").toUpperCase();
        let qrSrc = "";
        let bankInfo = null;

        if (pay === "BANK") {
            const noiDung = String(order.NoiDungChuyenKhoan || `DH${shortId(order._id)}`).trim();
            qrSrc = buildQuickLink({ amount: order.TongTien || 0, addInfo: noiDung });

            bankInfo = {
                acqId: BANK_ACQ_ID,
                accountNo: BANK_ACCOUNT_NO,
                accountName: BANK_ACCOUNT_NAME,
                amount: Number(order.TongTien || 0),
                addInfo: noiDung,
            };
        }

        return res.render("donhang/detail", {
            title: "Chi tiết đơn hàng",
            order,
            money,
            fmtDate,
            shortId,

            // ✅ thêm để view hiển thị QR
            qrSrc,
            bankInfo,
        });
    } catch (e) {
        next(e);
    }
});

module.exports = router;

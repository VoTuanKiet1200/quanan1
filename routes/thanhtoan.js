// routes/thanhtoan.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const GioHang = require("../models/GioHang");
const MonAn = require("../models/MonAn");
const DonHang = require("../models/DonHang");

const requireLogin = (req, res, next) => {
    if (req.session && req.session.MaNguoiDung) return next();
    return res.redirect("/dangnhap");
};

const toMini = (cart) => {
    const items = (cart?.DanhSachMon || []).map((it) => ({
        id: String(it.MonAnId),
        TenMon: it.TenMon,
        HinhAnh: it.HinhAnh,
        DonGia: Number(it.DonGia || 0),
        SoLuong: Number(it.SoLuong || 1),
        ThanhTien: Number(it.DonGia || 0) * Number(it.SoLuong || 1),
    }));
    const TongSoLuong = items.reduce((s, x) => s + x.SoLuong, 0);
    const TongTien = items.reduce((s, x) => s + x.ThanhTien, 0);
    return { items, TongSoLuong, TongTien };
};

// ====== CẤU HÌNH CHUYỂN KHOẢN ======
const BANK_ACQ_ID = Number(process.env.BANK_ACQ_ID || 970436);
const BANK_ACCOUNT_NO = String(process.env.BANK_ACCOUNT_NO || "9388713126").trim();
const BANK_ACCOUNT_NAME = String(process.env.BANK_ACCOUNT_NAME || "VO TUAN KIET").trim();

// (tuỳ chọn) bankId dạng chữ cho img.vietqr.io (VCB/ACB/MB/TCB...)
// nếu không set -> dùng BIN (acqId)
const BANK_ID = String(process.env.BANK_ID || "").trim().toUpperCase();
const QR_TEMPLATE = String(process.env.QR_TEMPLATE || "compact2").trim();

// VietQR API keys (tuỳ chọn)
const VIETQR_CLIENT_ID = String(process.env.VIETQR_CLIENT_ID || "");
const VIETQR_API_KEY = String(process.env.VIETQR_API_KEY || "");

// Node < 18 có thể không có fetch
let fetchFn = globalThis.fetch;
if (!fetchFn) {
    try {
        // npm i node-fetch@2
        fetchFn = require("node-fetch");
    } catch (e) {
        fetchFn = null;
    }
}

function safeBankToken(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function safeAccNo(s) {
    return String(s || "").replace(/[^\d]/g, "");
}
function safeTemplate(s) {
    return String(s || "compact2").toLowerCase().replace(/[^a-z0-9_]/g, "");
}

// Quicklink QR ảnh tĩnh (LUÔN QUÉT ĐƯỢC, không cần key)
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

// Trả về src cho <img>: ưu tiên VietQR API (dataURL), lỗi/fail -> quicklink
async function genQrSrc({ amount, addInfo }) {
    const fallbackUrl = buildQuickLink({ amount, addInfo });

    if (!fetchFn) return fallbackUrl;
    if (!VIETQR_CLIENT_ID || !VIETQR_API_KEY) return fallbackUrl;

    try {
        const res = await fetchFn("https://api.vietqr.io/v2/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-client-id": VIETQR_CLIENT_ID,
                "x-api-key": VIETQR_API_KEY,
            },
            body: JSON.stringify({
                accountNo: BANK_ACCOUNT_NO,
                accountName: BANK_ACCOUNT_NAME,
                acqId: BANK_ACQ_ID,
                amount: Number(amount || 0),
                addInfo: String(addInfo || "").slice(0, 50),
                format: "text",
                template: QR_TEMPLATE || "compact2",
            }),
        });

        if (!res.ok) return fallbackUrl;
        const data = await res.json().catch(() => null);
        return data?.data?.qrDataURL || fallbackUrl;
    } catch (e) {
        return fallbackUrl;
    }
}

router.get("/", requireLogin, async (req, res) => {
    const userId = req.session.MaNguoiDung;

    const cartDoc = await GioHang.findOne({ NguoiDungId: userId }).lean();
    const cart = toMini(cartDoc || { DanhSachMon: [] });

    if (!cart.items.length) return res.redirect("/giohang");

    return res.render("thanhtoan/index", {
        title: "Thanh toán",
        cart,
        error: req.query.err || "",
        // nếu bạn muốn show info bank trên trang checkout luôn:
        bankInfo: {
            acqId: BANK_ACQ_ID,
            accountNo: BANK_ACCOUNT_NO,
            accountName: BANK_ACCOUNT_NAME,
        },
    });
});

router.post("/", requireLogin, async (req, res) => {
    try {
        const userId = req.session.MaNguoiDung;

        const HoTen = String(req.body?.HoTen || "").trim();
        const SDT = String(req.body?.SDT || "").trim();
        const DiaChi = String(req.body?.DiaChi || "").trim();
        const GhiChu = String(req.body?.GhiChu || "").trim();
        const Pay = String(req.body?.Pay || "COD").toUpperCase();

        if (!HoTen || !SDT || !DiaChi) {
            return res.redirect("/thanhtoan?err=" + encodeURIComponent("Vui lòng nhập đầy đủ thông tin giao hàng."));
        }

        const cartDoc = await GioHang.findOne({ NguoiDungId: userId });
        const cart = toMini(cartDoc || { DanhSachMon: [] });
        if (!cart.items.length) return res.redirect("/giohang");

        // 1) trừ tồn (bulkWrite)
        const ops = cart.items.map((it) => ({
            updateOne: {
                filter: {
                    _id: new mongoose.Types.ObjectId(it.id),
                    KichHoat: 1,
                    SoLuongTon: { $gte: it.SoLuong },
                },
                update: { $inc: { SoLuongTon: -it.SoLuong } },
            },
        }));

        const bulk = await MonAn.bulkWrite(ops, { ordered: true });
        const modified = Number(bulk?.modifiedCount ?? 0);

        if (modified !== cart.items.length) {
            // rollback best-effort
            const rollbackOps = cart.items.map((it) => ({
                updateOne: {
                    filter: { _id: new mongoose.Types.ObjectId(it.id) },
                    update: { $inc: { SoLuongTon: it.SoLuong } },
                },
            }));
            await MonAn.bulkWrite(rollbackOps, { ordered: false });

            return res.redirect(
                "/thanhtoan?err=" + encodeURIComponent("Một số món đã hết/không đủ tồn. Vui lòng kiểm tra lại giỏ hàng.")
            );
        }

        // 2) tạo đơn hàng (đúng schema)
        const order = await DonHang.create({
            NguoiDungId: userId,
            Items: cart.items.map((it) => ({
                MonAnId: it.id,
                TenMon: it.TenMon,
                DonGia: it.DonGia,
                SoLuong: it.SoLuong,
                HinhAnh: it.HinhAnh || "",
            })),
            TongTien: cart.TongTien,
            ThongTinGiaoHang: { HoTen, SDT, DiaChi, GhiChu },
            PhuongThucThanhToan: Pay === "BANK" ? "BANK" : "COD",
            TrangThai: "NEW",
            DaThanhToan: false,
        });

        // 2.1) BANK -> lưu nội dung chuyển khoản (đúng schema)
        if (Pay === "BANK") {
            const noiDung = `DH${String(order._id).slice(-6).toUpperCase()}`; // ví dụ: DHD8BF2E
            await DonHang.updateOne({ _id: order._id }, { $set: { NoiDungChuyenKhoan: noiDung } });
        }

        // 3) xóa giỏ
        if (cartDoc) {
            cartDoc.DanhSachMon = [];
            await cartDoc.save();
        }

        // 4) cập nhật badge session
        req.session.cartCount = 0;

        return res.redirect("/thanhtoan/thanhcong/" + order._id);
    } catch (e) {
        return res.redirect("/thanhtoan?err=" + encodeURIComponent(e.message || "Không tạo được đơn hàng."));
    }
});

router.get("/thanhcong/:id", requireLogin, async (req, res) => {
    const id = req.params.id;
    const order = await DonHang.findById(id).lean();
    if (!order) return res.redirect("/");

    let qrSrc = "";
    if (order.PhuongThucThanhToan === "BANK") {
        const addInfo = order.NoiDungChuyenKhoan || `DH${String(order._id).slice(-6).toUpperCase()}`;
        qrSrc = await genQrSrc({ amount: order.TongTien, addInfo });
    }

    return res.render("thanhtoan/success", {
        title: "Đặt hàng thành công",
        order,
        qrSrc,
        bankInfo: {
            acqId: BANK_ACQ_ID,
            accountNo: BANK_ACCOUNT_NO,
            accountName: BANK_ACCOUNT_NAME,
        },
    });
});

module.exports = router;

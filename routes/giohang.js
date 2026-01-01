// routes/giohang.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const GioHang = require("../models/GioHang");
const MonAn = require("../models/MonAn");
const requireLogin = require("../middlewares/requireAdmin"); // sửa đúng path

const wantsJson = (req) =>
    req.xhr ||
    req.query?.json === "1" ||
    String(req.headers.accept || "").toLowerCase().includes("application/json");

const moneyNow = (mon) => {
    const g = Number(mon?.Gia || 0);
    const gkm = Number(mon?.GiaKhuyenMai || 0);
    return gkm > 0 && gkm < g ? gkm : g;
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

// GET /giohang/mini
router.get("/mini", requireLogin, async (req, res) => {
    try {
        const userId = req.session.MaNguoiDung;

        const cart = await GioHang.findOne({ NguoiDungId: userId }).lean();
        return res.json({ ok: true, cart: toMini(cart || { DanhSachMon: [] }) });
    } catch (e) {
        return res.status(500).json({ ok: false, message: e.message });
    }
}); router.post("/them/:id", requireLogin, async (req, res) => {
    try {
        const userId = req.session.MaNguoiDung;
        const id = String(req.params.id);

        if (!mongoose.Types.ObjectId.isValid(id)) {
            if (wantsJson(req)) return res.status(400).json({ ok: false, message: "Id không hợp lệ" });
            return res.redirect("back");
        }

        const mon = await MonAn.findOne({ _id: id, KichHoat: 1 }).lean();
        if (!mon) {
            if (wantsJson(req)) return res.status(404).json({ ok: false, message: "Không tìm thấy món" });
            return res.redirect("back");
        }

        const ton = Number(mon.SoLuongTon || 0);
        if (ton <= 0) {
            if (wantsJson(req)) return res.status(409).json({ ok: false, message: "Món đã hết hàng" });
            return res.redirect("back");
        }

        const qty = Math.max(1, Number(req.body?.qty || 1));

        // tính giá hiện tại
        const g = Number(mon.Gia || 0);
        const gkm = Number(mon.GiaKhuyenMai || 0);
        const donGia = (gkm > 0 && gkm < g) ? gkm : g;

        let cart = await GioHang.findOne({ NguoiDungId: userId });

        if (!cart) {
            cart = new GioHang({ NguoiDungId: userId, DanhSachMon: [] });
        }

        // ✅ FIX CỐT LÕI: doc cũ thiếu DanhSachMon => set lại mảng rỗng
        if (!Array.isArray(cart.DanhSachMon)) cart.DanhSachMon = [];

        const idx = cart.DanhSachMon.findIndex((x) => String(x.MonAnId) === String(mon._id));

        if (idx >= 0) {
            const cur = Math.max(1, Number(cart.DanhSachMon[idx].SoLuong || 1));
            cart.DanhSachMon[idx].SoLuong = Math.min(cur + qty, ton);
            cart.DanhSachMon[idx].DonGia = donGia;
        } else {
            cart.DanhSachMon.push({
                MonAnId: mon._id,
                TenMon: mon.TenMon,
                DonGia: donGia,
                SoLuong: Math.min(qty, ton),
                HinhAnh: mon.HinhAnh || "",
            });
        }

        await cart.save();

        if (wantsJson(req)) return res.json({ ok: true, cart: toMini(cart) });
        return res.redirect("back");
    } catch (e) {
        if (wantsJson(req)) return res.status(500).json({ ok: false, message: e.message });
        return res.status(500).send(e.message);
    }
});
// POST /giohang/xoa/:id  (xóa 1 món trong giỏ)
router.post("/xoa/:id", requireLogin, async (req, res) => {
    try {
        const userId = req.session.MaNguoiDung;
        const id = String(req.params.id);

        if (!mongoose.Types.ObjectId.isValid(id)) {
            if (wantsJson(req)) return res.status(400).json({ ok: false, message: "Id không hợp lệ" });
            return res.redirect("back");
        }

        const cart = await GioHang.findOne({ NguoiDungId: userId });
        if (!cart) {
            if (wantsJson(req)) return res.json({ ok: true, cart: toMini({ DanhSachMon: [] }) });
            return res.redirect("back");
        }

        if (!Array.isArray(cart.DanhSachMon)) cart.DanhSachMon = [];

        const before = cart.DanhSachMon.length;
        cart.DanhSachMon = cart.DanhSachMon.filter(x => String(x.MonAnId) !== id);

        // nếu không có món đó -> vẫn ok
        if (cart.DanhSachMon.length === before) {
            if (wantsJson(req)) return res.json({ ok: true, cart: toMini(cart) });
            return res.redirect("back");
        }

        // nếu giỏ rỗng thì xóa document cho gọn (tuỳ bạn)
        if (cart.DanhSachMon.length === 0) {
            await GioHang.deleteOne({ _id: cart._id });
            if (wantsJson(req)) return res.json({ ok: true, cart: toMini({ DanhSachMon: [] }) });
            return res.redirect("back");
        }

        await cart.save();

        if (wantsJson(req)) return res.json({ ok: true, cart: toMini(cart) });
        return res.redirect("back");
    } catch (e) {
        if (wantsJson(req)) return res.status(500).json({ ok: false, message: e.message });
        return res.status(500).send(e.message);
    }
});
// POST /giohang/capnhat/:id
router.post("/capnhat/:id", requireLogin, async (req, res) => {
    try {
        const userId = req.session.MaNguoiDung;
        const id = String(req.params.id);

        if (!mongoose.Types.ObjectId.isValid(id)) {
            if (wantsJson(req)) return res.status(400).json({ ok: false, message: "Id không hợp lệ" });
            return res.redirect("back");
        }

        const qty = Math.max(1, Number(req.body?.qty || 1));

        const cart = await GioHang.findOne({ NguoiDungId: userId });
        if (!cart) return res.json({ ok: true, cart: toMini({ DanhSachMon: [] }) });

        if (!Array.isArray(cart.DanhSachMon)) cart.DanhSachMon = [];

        const idx = cart.DanhSachMon.findIndex(x => String(x.MonAnId) === id);
        if (idx < 0) return res.json({ ok: true, cart: toMini(cart) });

        // kiểm tra tồn kho để clamp
        const mon = await MonAn.findOne({ _id: id, KichHoat: 1 }).lean();
        const ton = Number(mon?.SoLuongTon || 0);
        if (ton <= 0) {
            cart.DanhSachMon.splice(idx, 1);
        } else {
            cart.DanhSachMon[idx].SoLuong = Math.min(qty, ton);
            cart.DanhSachMon[idx].DonGia = moneyNow(mon); // cập nhật giá hiện tại (tuỳ bạn)
        }

        if (cart.DanhSachMon.length === 0) {
            await GioHang.deleteOne({ _id: cart._id });
            return res.json({ ok: true, cart: toMini({ DanhSachMon: [] }) });
        }

        await cart.save();
        return res.json({ ok: true, cart: toMini(cart) });
    } catch (e) {
        return res.status(500).json({ ok: false, message: e.message });
    }
});
router.get("/", requireLogin, async (req, res) => {
    const userId = req.session.MaNguoiDung;
    const cartDoc = await GioHang.findOne({ NguoiDungId: userId }).lean();
    const mini = toMini(cartDoc || { DanhSachMon: [] });
    res.render("giohang/index", { title: "Giỏ hàng", active: "giohang", cart: mini });
});
module.exports = router;

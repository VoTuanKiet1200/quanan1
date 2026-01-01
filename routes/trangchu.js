// routes/trangchu.js
var express = require("express");
var router = express.Router();

const DanhMuc = require("../models/DanhMuc");
const MonAn = require("../models/MonAn");

// GET /
router.get("/", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        const danhMucSlug = String(req.query.dm || "").trim(); // ?dm=slug

        // menu danh mục
        const danhMucs = await DanhMuc.find({ KichHoat: 1 })
            .sort({ ThuTu: 1, TenDanhMuc: 1 })
            .lean();

        const filter = { KichHoat: 1 };

        // lọc theo danh mục
        if (danhMucSlug) {
            const dmDoc = await DanhMuc.findOne({ Slug: danhMucSlug, KichHoat: 1 })
                .select("_id")
                .lean();

            // không có danh mục -> trả trang với mảng rỗng
            if (!dmDoc) {
                return res.render("home", {
                    title: "Trang chủ",
                    danhMucs,
                    monAn: [],
                    monan6: [],
                    q,
                    dm: danhMucSlug,
                });
            }

            filter.DanhMucId = dmDoc._id;
        }

        // tìm kiếm theo tên món
        if (q) {
            filter.TenMon = { $regex: q, $options: "i" };
        }

        // (A) Lấy 6 món cho section s2
        const monan6 = await MonAn.find(filter)
            .populate("DanhMucId", "TenDanhMuc Slug")
            .sort({ createdAt: -1 })
            .limit(8)
            .lean();

        // (B) Nếu bạn vẫn muốn lấy full list trên home (có thể bỏ)
        const monAn = await MonAn.find(filter)
            .populate("DanhMucId", "TenDanhMuc Slug")
            .sort({ createdAt: -1 })
            .lean();

        return res.render("home", {
            title: "Trang chủ",
            danhMucs,
            monAn,
            monan6,
            active: "home",
            q,
            dm: danhMucSlug,
        });
    } catch (err) {
        console.error(err);
        req.session.error = "Lỗi khi tải trang chủ.";
        return res.redirect("/error");
    }
});

module.exports = router;

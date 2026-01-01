const express = require("express");
const router = express.Router();

const MonAn = require("../models/MonAn");
const DanhMuc = require("../models/DanhMuc");

// GET /thucdon?dm=slug-danh-muc&q=tu-khoa&sort=...&page=1
router.get("/", async (req, res, next) => {
    try {
        const q = String(req.query.q || "").trim();
        const dmSlug = String(req.query.dm || "").trim();
        const sort = String(req.query.sort || "new"); // new | price_asc | price_desc | best
        const page = Math.max(1, parseInt(req.query.page || "1", 10));
        const limit = 12;
        const skip = (page - 1) * limit;

        const categories = await DanhMuc.find({ KichHoat: 1 }).sort({ TenDanhMuc: 1 }).lean();

        const filter = { KichHoat: 1 };
        if (q) filter.TenMon = { $regex: q, $options: "i" };

        if (dmSlug) {
            const dm = categories.find((c) => String(c.Slug) === dmSlug);
            if (dm) filter.DanhMucId = dm._id;
        }

        // sort
        let sortObj = { createdAt: -1 };
        if (sort === "price_asc") sortObj = { GiaKhuyenMai: 1, Gia: 1 };
        if (sort === "price_desc") sortObj = { GiaKhuyenMai: -1, Gia: -1 };
        if (sort === "best") sortObj = { BanChay: -1, createdAt: -1 };

        const [total, items] = await Promise.all([
            MonAn.countDocuments(filter),
            MonAn.find(filter)
                .populate("DanhMucId", "TenDanhMuc Slug")
                .sort(sortObj)
                .skip(skip)
                .limit(limit)
                .lean(),
        ]);

        const totalPages = Math.max(1, Math.ceil(total / limit));

        res.render("thucdon/index", {
            title: "Thực đơn",
            items,
            active: "thucdon",
            categories,
            state: { q, dm: dmSlug, sort, page, totalPages, total },
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

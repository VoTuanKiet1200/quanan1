const express = require("express");
const router = express.Router();
const MonAn = require("../models/MonAn");

// /monan/:slug
router.get("/:slug", async (req, res, next) => {
    try {
        const item = await MonAn.findOne({ Slug: req.params.slug, KichHoat: 1 })
            .populate("DanhMucId", "TenDanhMuc Slug")
            .lean();

        if (!item) return res.status(404).render("404", { title: "Không tìm thấy món" });

        // bạn có thể đổi view theo project: "monan/detail"
        return res.render("monan/detail", { title: item.TenMon, item });
    } catch (e) {
        next(e);
    }
});

module.exports = router;

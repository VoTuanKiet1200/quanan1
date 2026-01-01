const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    return res.render("gioithieu/index", {
        title: "Giới thiệu",
        // nếu bạn dùng layout chung thì set layout ở đây
        // layout: "layouts/main",
        // hoặc nếu muốn nằm trong dashboard:
        // layout: "layouts/userdash",
        active: "gioithieu",
        session: req.session
    });
});

module.exports = router;

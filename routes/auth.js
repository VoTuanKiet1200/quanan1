var express = require("express");
var router = express.Router();

var NguoiDung = require("../models/NguoiDung");
const passport = require("passport");
// GET: /dangky
router.get("/dangky", async (req, res) => {
    res.render("dangky", { title: "Đăng ký tài khoản" });
});

// POST: /dangky
router.post("/dangky", async (req, res) => {
    try {
        const { HoVaTen, Email, SoDienThoai, MatKhau } = req.body;

        if (!HoVaTen || !Email || !MatKhau) {
            req.session.error = "Vui lòng nhập Họ và tên / Email / Mật khẩu.";
            return res.redirect("/error");
        }

        const emailChuan = String(Email).toLowerCase().trim();

        const emailTonTai = await NguoiDung.findOne({ Email: emailChuan }).lean();
        if (emailTonTai) {
            req.session.error = "Email đã được sử dụng. Vui lòng dùng email khác.";
            return res.redirect("/error");
        }

        const nguoiDung = new NguoiDung({
            HoTen: String(HoVaTen).trim(),
            Email: emailChuan,
            SoDienThoai: String(SoDienThoai || "").trim(),
            VaiTro: "user",
            KichHoat: 1
        });

        await nguoiDung.DatMatKhau(MatKhau);
        await nguoiDung.save();

        req.session.success = "Đăng ký thành công!";
        return res.redirect("/success");
    } catch (err) {
        console.error(err);
        req.session.error = err.message || "Đã xảy ra lỗi khi đăng ký.";
        return res.redirect("/error");
    }
});

// GET: /dangnhap
router.get("/dangnhap", async (req, res) => {
    res.render("dangnhap", { title: "Đăng nhập" });
});

// POST: /dangnhap (đăng nhập bằng Email)
router.post("/dangnhap", async (req, res) => {
    try {
        if (req.session.MaNguoiDung) {
            req.session.error = "Người dùng đã đăng nhập rồi.";
            return res.redirect("/error");
        }

        const { Email, MatKhau } = req.body;

        if (!Email || !MatKhau) {
            req.session.error = "Vui lòng nhập Email và Mật khẩu.";
            return res.redirect("/error");
        }

        const emailChuan = String(Email).toLowerCase().trim();
        const nguoiDung = await NguoiDung.findOne({ Email: emailChuan }).exec();

        if (!nguoiDung) {
            req.session.error = "Email không tồn tại.";
            return res.redirect("/error");
        }

        if (Number(nguoiDung.KichHoat) === 0) {
            req.session.error = "Tài khoản đã bị khóa.";
            return res.redirect("/error");
        }

        const dung = await nguoiDung.KiemTraMatKhau(MatKhau);
        if (!dung) {
            req.session.error = "Mật khẩu không đúng.";
            return res.redirect("/error");
        }

        req.session.MaNguoiDung = nguoiDung._id;
        req.session.HoTen = nguoiDung.HoTen;
        req.session.VaiTro = nguoiDung.VaiTro;

        return res.redirect("/");
    } catch (err) {
        console.error(err);
        req.session.error = "Lỗi server khi đăng nhập.";
        return res.redirect("/error");
    }
});

// GET: /dangxuat
router.get("/dangxuat", async (req, res) => {
    delete req.session.MaNguoiDung;
    delete req.session.HoTen;
    delete req.session.VaiTro;
    return res.redirect("/");
});
router.get("/auth/google",
    passport.authenticate("google", {
        scope: ["profile", "email"],
        prompt: "select_account",
    })
);

// GET: /auth/google/callback
router.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/dangnhap", session: false }),
    (req, res) => {
        const u = req.user;

        req.session.MaNguoiDung = u._id;
        req.session.HoTen = u.HoTen;
        req.session.VaiTro = u.VaiTro;

        return res.redirect("/");
    }
);
module.exports = router;

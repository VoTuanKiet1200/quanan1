var express = require("express");
var app = express();
var mongoose = require("mongoose");
var session = require("express-session");

if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}
const GioHang = require("./models/GioHang");
const DanhMuc = require("./models/DanhMuc");
const expressLayouts = require("express-ejs-layouts");

const passport = require("passport");
const initGooglePassport = require("./config/passport-google");

// ✅ quan trọng khi chạy sau proxy (Render)
app.set("trust proxy", 1);

// ✅ LẤY TỪ ENV (không hardcode)
const uri = process.env.MONGO_URI;

mongoose
    .connect(uri, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log("Mongo connected"))
    .catch((err) => console.log("Mongo connect error:", err.message));

app.set("views", "./views");
app.set("view engine", "ejs");

app.use(expressLayouts);
app.set("layout", false);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
    session({
        secret: process.env.SESSION_SECRET || "secret_key",
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === "production", // https mới set true
            sameSite: "lax",
        },
    })
);

app.use(passport.initialize());
initGooglePassport();

// ===== middleware cartCount =====
app.use(async (req, res, next) => {
    res.locals.session = req.session;
    res.locals.cartCount = Number(req.session?.cartCount || 0);

    const uid = req.session?.MaNguoiDung;
    if (!uid) return next();

    try {
        const oid = mongoose.Types.ObjectId.isValid(uid) ? new mongoose.Types.ObjectId(uid) : uid;

        const cart = await GioHang.findOne({
            $or: [{ NguoiDungId: oid }, { NguoiDung: oid }, { TaiKhoan: oid }],
        })
            .select("DanhSachMon.SoLuong Items.SoLuong")
            .lean();

        const list = cart?.DanhSachMon || cart?.Items || null;
        if (!Array.isArray(list)) return next();

        const count = list.reduce((s, it) => s + Number(it?.SoLuong || 0), 0);
        req.session.cartCount = count;
        res.locals.cartCount = count;
        return next();
    } catch (e) {
        return next();
    }
});

// ===== middleware danh mục nav =====
app.use(async (req, res, next) => {
    try {
        res.locals.navDanhMucs = await DanhMuc.find({ KichHoat: 1 })
            .sort({ ThuTu: 1, TenDanhMuc: 1 })
            .lean();
    } catch (e) {
        res.locals.navDanhMucs = [];
    }
    next();
});

// routes
app.use("/", require("./routes/trangchu"));
app.use("/", require("./routes/auth"));
app.use("/admin", require("./routes/admin"));
app.use("/giohang", require("./routes/giohang"));
app.use("/monan", require("./routes/monan"));
app.use("/thucdon", require("./routes/thucdon"));
app.use("/thanhtoan", require("./routes/thanhtoan"));
app.use("/donhang", require("./routes/donhang_user.js"));
app.use("/gioithieu", require("./routes/gioithieu"));

app.get("/error", (req, res) => {
    const message = req.session.error || "Có lỗi xảy ra";
    req.session.error = null;
    res.status(400).render("error", { message });
});

app.get("/success", (req, res) => {
    const message = req.session.success || "Thành công";
    req.session.success = null;
    res.render("success", { message });
});

// ✅ Render dùng PORT env
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));

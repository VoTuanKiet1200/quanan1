var express = require('express');
var app = express();
var mongoose = require('mongoose');
var session = require('express-session');
const GioHang = require("./models/GioHang");
const expressLayouts = require("express-ejs-layouts");
const uri = "mongodb+srv://quanly:kiet123@cluster0.dvwumew.mongodb.net/quanan?retryWrites=true&w=majority&appName=Cluster0";
// ✅ ADD
const passport = require("passport");       // ✅ ADD
const initGooglePassport = require("./config/passport-google"); // ✅ ADD
process.env.GOOGLE_CLIENT_ID = "39529139044-4ba55gjc17pgj329gum699ronfm65u7c.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "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";
process.env.GOOGLE_CALLBACK_URL = "http://127.0.0.1:3000/auth/google/callback";
mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log("Mongo connected"))
    .catch(err => console.log("Mongo connect error:", err.message));


app.set('views', './views');
app.set('view engine', 'ejs');

app.use(expressLayouts);
app.set("layout", false);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

app.use(session({
    secret: 'secret_key',
    resave: false,
    saveUninitialized: false,
    // cookie: { maxAge: 1000 * 60 * 60 * 24 } // tuỳ chọn
}));
app.use(passport.initialize());
initGooglePassport();
app.use(async (req, res, next) => {
    res.locals.session = req.session;
    res.locals.cartCount = Number(req.session?.cartCount || 0);

    const uid = req.session?.MaNguoiDung;
    if (!uid) return next();

    try {
        const oid = mongoose.Types.ObjectId.isValid(uid) ? new mongoose.Types.ObjectId(uid) : uid;

        // ✅ tìm theo nhiều field để khỏi lệch schema (NguoiDung / NguoiDungId / TaiKhoan)
        const cart = await GioHang.findOne({
            $or: [{ NguoiDungId: oid }, { NguoiDung: oid }, { TaiKhoan: oid }],
        })
            .select("DanhSachMon.SoLuong Items.SoLuong")
            .lean();

        // ✅ đúng mảng: DanhSachMon hoặc Items
        const list = cart?.DanhSachMon || cart?.Items || null;

        // ✅ nếu không tìm thấy cart thì GIỮ nguyên session.cartCount (đừng reset về 0)
        if (!Array.isArray(list)) return next();

        const count = list.reduce((s, it) => s + Number(it?.SoLuong || 0), 0);

        req.session.cartCount = count;
        res.locals.cartCount = count;
        return next();
    } catch (e) {
        // lỗi DB thì giữ nguyên session.cartCount
        return next();
    }
});
const DanhMuc = require("./models/DanhMuc");

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
app.use("/", require("./routes/trangchu"));
app.use("/", require("./routes/auth"));
app.use("/admin", require("./routes/admin"));
app.use("/giohang", require("./routes/giohang"));
const monanRouter = require("./routes/monan");
app.use("/monan", monanRouter);
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

app.listen(3000, () => {
    console.log('Server is running at http://127.0.0.1:3000');
});

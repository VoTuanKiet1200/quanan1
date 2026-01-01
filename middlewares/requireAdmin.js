module.exports = function requireLogin(req, res, next) {
    if (req.session && req.session.MaNguoiDung) return next();

    const accept = (req.headers.accept || "").toLowerCase();
    const isApi = accept.includes("application/json") || req.xhr;

    if (isApi) {
        return res.status(401).json({
            ok: false,
            message: "Bạn cần đăng nhập",
            redirect: "/dangnhap?next=" + encodeURIComponent(req.originalUrl || "/"),
        });
    }

    return res.redirect("/dangnhap?next=" + encodeURIComponent(req.originalUrl || "/"));
};

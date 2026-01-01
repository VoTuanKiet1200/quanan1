const mongoose = require("mongoose");

function taoSlug(chuoi = "") {
    return String(chuoi)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

const MonAnSchema = new mongoose.Schema(
    {
        TenMon: { type: String, required: true, trim: true, maxlength: 120 },
        Slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

        Gia: { type: Number, required: true, min: 0 },
        GiaKhuyenMai: { type: Number, default: 0, min: 0 },

        HinhAnh: { type: String, default: "", trim: true }, // đường dẫn file ảnh
        MoTaNgan: { type: String, default: "", trim: true },
        MoTaChiTiet: { type: String, default: "", trim: true },

        DanhMucId: { type: mongoose.Schema.Types.ObjectId, ref: "DanhMuc", required: true },

        SoLuongTon: { type: Number, default: 999999, min: 0 }, // nếu không quản lý tồn, để số lớn
        BanChay: { type: Number, default: 0, min: 0 }, // số lượt bán (tuỳ bạn cập nhật)

        KichHoat: { type: Number, enum: [0, 1], default: 1 }
    },
    { timestamps: true }
);

// Tự tạo slug nếu chưa có
MonAnSchema.pre("validate", function () {
    if (!this.Slug && this.TenMon) this.Slug = taoSlug(this.TenMon);
});

// Giá đang áp dụng (giá khuyến mãi hợp lệ thì dùng)
MonAnSchema.methods.GiaHienTai = function () {
    const gkm = Number(this.GiaKhuyenMai || 0);
    const g = Number(this.Gia || 0);
    if (gkm > 0 && gkm < g) return gkm;
    return g;
};

module.exports = mongoose.model("MonAn", MonAnSchema);
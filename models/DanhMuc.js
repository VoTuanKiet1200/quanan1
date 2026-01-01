const mongoose = require("mongoose");

function taoSlug(chuoi = "") {
    return String(chuoi)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // bỏ dấu
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

const DanhMucSchema = new mongoose.Schema(
    {
        TenDanhMuc: { type: String, required: true, trim: true, maxlength: 80 },
        Slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

        MoTa: { type: String, default: "", trim: true },
        ThuTu: { type: Number, default: 0 }, // sắp xếp
        KichHoat: { type: Number, enum: [0, 1], default: 1 }
    },
    { timestamps: true }
);

// Tự tạo slug nếu chưa có
// Tự tạo slug nếu chưa có
DanhMucSchema.pre("validate", function () {
    if (!this.Slug && this.TenDanhMuc) {
        this.Slug = taoSlug(this.TenDanhMuc);
    }
});

module.exports = mongoose.model("DanhMuc", DanhMucSchema);

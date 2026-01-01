const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const NguoiDungSchema = new mongoose.Schema(
    {
        HoTen: { type: String, required: true, trim: true, maxlength: 80 },
        Email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        SoDienThoai: { type: String, default: "", trim: true },

        Provider: { type: String, enum: ["local", "google"], default: "local" },
        GoogleId: { type: String, default: "", index: true },
        Avatar: { type: String, default: "" },

        MatKhauHash: {
            type: String,
            default: "",
            required: function () { return this.Provider === "local"; }
        },

        VaiTro: { type: String, enum: ["user", "admin"], default: "user" },
        KichHoat: { type: Number, enum: [0, 1], default: 1 }
    },
    { timestamps: true }
);

NguoiDungSchema.methods.DatMatKhau = async function (matKhauThuong) {
    const soVong = 10;
    this.MatKhauHash = await bcrypt.hash(String(matKhauThuong), soVong);
};

NguoiDungSchema.methods.KiemTraMatKhau = async function (matKhauThuong) {
    if (!this.MatKhauHash) return false;
    return bcrypt.compare(String(matKhauThuong), this.MatKhauHash);
};

module.exports = mongoose.model("NguoiDung", NguoiDungSchema);

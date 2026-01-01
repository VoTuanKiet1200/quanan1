const mongoose = require("mongoose");

const GioHangSchema = new mongoose.Schema(
    {
        NguoiDungId: { type: mongoose.Schema.Types.ObjectId, ref: "NguoiDung", required: true, unique: true },
        DanhSachMon: [
            {
                MonAnId: { type: mongoose.Schema.Types.ObjectId, ref: "MonAn", required: true },
                TenMon: { type: String, required: true, trim: true },
                DonGia: { type: Number, required: true, min: 0 },
                SoLuong: { type: Number, required: true, min: 1, default: 1 },
                HinhAnh: { type: String, default: "" },
            },
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model("GioHang", GioHangSchema);

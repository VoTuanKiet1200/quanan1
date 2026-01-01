// models/ThanhToan.js
const mongoose = require("mongoose");

const ThanhToanSchema = new mongoose.Schema(
    {
        DonHangId: { type: mongoose.Schema.Types.ObjectId, ref: "DonHang", required: true, index: true },
        NguoiDungId: { type: mongoose.Schema.Types.ObjectId, ref: "TaiKhoan", required: true, index: true },

        SoTien: { type: Number, min: 0, required: true },

        PhuongThuc: {
            type: String,
            enum: ["COD", "VNPAY", "MOMO", "BANK"],
            required: true,
        },

        TrangThai: {
            type: String,
            enum: ["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED"],
            default: "PENDING",
            index: true,
        },

        // mã giao dịch để đối soát
        MaGiaoDichNoiBo: { type: String, trim: true, unique: true, sparse: true },
        MaGiaoDichNCC: { type: String, trim: true, default: "" }, // vnp_TxnRef / momo transId...

        PaidAt: { type: Date, default: null },
        FailedAt: { type: Date, default: null },

        // lưu raw callback/return (tuỳ cổng)
        Raw: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("ThanhToan", ThanhToanSchema);

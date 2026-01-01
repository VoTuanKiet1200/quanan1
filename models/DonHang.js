const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema(
    {
        MonAnId: { type: mongoose.Schema.Types.ObjectId, ref: "MonAn", required: true },
        TenMon: { type: String, required: true },
        DonGia: { type: Number, required: true },
        SoLuong: { type: Number, required: true },
        HinhAnh: { type: String, default: "" },
    },
    { _id: false }
);

const DonHangSchema = new mongoose.Schema(
    {
        NguoiDungId: { type: mongoose.Schema.Types.ObjectId, ref: "NguoiDung", required: true },

        Items: { type: [ItemSchema], default: [] },
        TongTien: { type: Number, default: 0 },

        TrangThai: {
            type: String,
            enum: ["NEW", "CONFIRMED", "COOKING", "SHIPPING", "DONE", "CANCELLED"],
            default: "NEW",
        },

        DaThanhToan: { type: Boolean, default: false },

        PhuongThucThanhToan: { type: String, enum: ["COD", "BANK"], default: "COD" },
        NoiDungChuyenKhoan: { type: String, default: "" }, // để đối soát thủ công
        ThongTinChuyenKhoan: {
            bankId: { type: String, default: "" },        // ví dụ: vietinbank
            accountNo: { type: String, default: "" },
            accountName: { type: String, default: "" },
            amount: { type: Number, default: 0 },
            addInfo: { type: String, default: "" },
            qrUrl: { type: String, default: "" },         // link ảnh QR
        },
        ThongTinGiaoHang: {
            HoTen: { type: String, required: true },
            SDT: { type: String, required: true },
            DiaChi: { type: String, required: true },
            GhiChu: { type: String, default: "" },
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("DonHang", DonHangSchema);

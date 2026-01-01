const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const NguoiDung = require("../models/NguoiDung");

module.exports = function initGooglePassport() {
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: process.env.GOOGLE_CALLBACK_URL, // vd: http://localhost:3000/auth/google/callback
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    const googleId = profile.id;
                    const email = profile?.emails?.[0]?.value?.toLowerCase()?.trim() || "";
                    const name = profile.displayName || "Người dùng";
                    const avatar = profile?.photos?.[0]?.value || "";

                    // 1) Ưu tiên tìm theo GoogleId
                    let user = await NguoiDung.findOne({ GoogleId: googleId }).exec();

                    // 2) Nếu chưa có, thử link theo Email (tránh tạo trùng)
                    if (!user && email) {
                        user = await NguoiDung.findOne({ Email: email }).exec();
                        if (user) {
                            user.GoogleId = googleId;
                            user.Provider = "google";
                            if (!user.HoTen) user.HoTen = name;
                            if (!user.Avatar) user.Avatar = avatar;
                            await user.save();
                        }
                    }

                    // 3) Nếu vẫn chưa có thì tạo mới
                    if (!user) {
                        user = await NguoiDung.create({
                            HoTen: name,
                            Email: email || `google_${googleId}@no-email.local`,
                            Provider: "google",
                            GoogleId: googleId,
                            Avatar: avatar,
                            VaiTro: "user",
                            KichHoat: 1,
                        });
                    }

                    // chặn user bị khóa
                    if (Number(user.KichHoat) === 0) {
                        return done(null, false);
                    }

                    return done(null, user);
                } catch (e) {
                    return done(e);
                }
            }
        )
    );
};

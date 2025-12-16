const createError = require('http-errors');
const jwt = require('jsonwebtoken');
// const { sendOTP } = require('../../utils/sendSMS');
const generateCode = require('../../utils/generateCode');
const { isValidPhone } = require('../../utils/validation');
const deleteFile = require('../../utils/deleteFile');
const User = require('../../models/userModel');
const userNotificationModel = require('../../models/userNotificationModel');
const otpModel = require('../../models/otpModel');
const Product = require('../../models/product');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

/* ===================================================
                USER AUTH API
======================================================*/

// To ensure that a valid user is logged in.
exports.checkUser = async (req, res, next) => {
    try {
        let token;
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer')
        ) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) return next(createError.Unauthorized('auth.provideToken'));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded._id).select(
            '+isActive +passcode +token'
        );

        if (!user) return next(createError.Unauthorized('auth.pleaseLogin'));
        if (!user.isActive)
            return next(createError.Unauthorized('auth.blocked'));
        if (user.isDelete)
            return next(createError.Unauthorized('auth.deleted'));

        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
};

exports.sendOtp = async (req, res, next) => {
    try {
        let { mobileNumber } = req.body;

        const userExist = await User.findOne({
            mobileNumber: mobileNumber,
            isDelete: false,
        });

        if (userExist) {
            if (userExist.mobileNumber == mobileNumber) {
                return next(
                    createError.BadRequest('validation.alreadyRegisteredPhone')
                );
            }
        }

        await otpModel.deleteMany({ mobileNumber });

        // generate and save OTP
        const otp = generateCode(4);

        await otpModel.create({
            mobileNumber,
            otp,
        });

        // send OTP
        // await sendOTP(phone, otp);

        res.json({
            success: true,
            message: req.t('otp.sent'),
            otp, //! Remove this OTP
        });
    } catch (error) {
        next(error);
    }
};

exports.verifyOtp = async (req, res, next) => {
    try {
        let { email, otp } = req.body;

        const otpVerified = await otpModel.findOne({
            email: email,
            otp: otp,
        });

        if (!otpVerified) return next(createError.BadRequest('otp.fail'));

        res.json({
            success: true,
            message: req.t('otp.verified'),
        });
    } catch (error) {
        next(error);
    }
};

exports.resendOtp = async (req, res, next) => {
    try {
        let { mobileNumber } = req.body;

        // generate and save OTP
        const otp = generateCode(4);
        await otpModel.updateOne(
            { mobileNumber: mobileNumber },
            { $set: { otp: otp } }
        );

        // send OTP
        // await sendOTP(phone, otp);

        res.json({
            success: true,
            message: req.t('otp.sent'),
            otp, //! Remove this OTP
        });
    } catch (error) {
        next(error);
    }
};

exports.checksignUp = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email)
            return next(createError.BadRequest('Please provide email!'));

        const user = await User.findOne({ email }).select(
            '+passcode -__v -createdAt -updatedAt'
        );
        if (user)
            return next(createError.BadRequest('Email is already registerd.'));

        user.fcmToken = req.body.fcmToken;
        await user.save();

        user.isActive = undefined;
        user.updatedAt = undefined;
        user.passcode = undefined;

        res.json({
            success: true,
            message: req.t('auth.login'),
            user,
        });
    } catch (error) {
        next(error);
    }
};

exports.signUp = async (req, res, next) => {
    try {
        if (!req.body.password)
            return next(createError.BadRequest('Provide password!'));

        const userExists = await User.findOne({
            email: req.body.email,
        });
        if (userExists)
            return next(
                createError.BadRequest('validation.alreadyRegisteredEmail')
            );

        // create user
        let user = await User.create({
            name: req.body.name,
            email: req.body.email,
            password: req.body.password,
            address: req.body.address,
            landmark: req.body.landmark,
            city: req.body.city,
            state: req.body.state,
            country: req.body.country,
            zipcode: req.body.zipcode,
            fcmToken: req.body.fcmToken,
        });

        // hide fields
        user = user.toObject();
        user.isActive = undefined;
        user.isDelete = undefined;
        user.password = undefined;
        user.__v = undefined;
        user.createdAt = undefined;
        user.updatedAt = undefined;

        res.status(201).json({
            success: true,
            message: req.t('auth.registered'),
            user,
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

exports.socialLogin = async (req, res, next) => {
    try {
        const { email, googleId, facebookId, appleId } = req.body;
        // console.log('googleId: ', googleId);

        let user = await User.findOne({ email }).populate(
            'city country address'
        );
        // console.log('user: ', user);

        // if user not exists, redirect to create profile screen
        if (!user) {
            return res.json({
                code: '001',
                message: req.t('success'),
                user: { email, googleId, facebookId, appleId },
                token: '',
            });
        }

        if (googleId) {
            if (!user.googleId) {
                const errorMessage = user.facebookId
                    ? 'Please log in with Facebook.'
                    : user.appleId
                    ? 'Please log in with Apple.'
                    : 'Please log in with email.';
                return next(createError.BadRequest(errorMessage));
            }
            if (googleId !== user.googleId) {
                return next(createError.BadRequest('Invalid Google ID.'));
            }
        }

        if (facebookId) {
            if (!user.facebookId) {
                const errorMessage = user.googleId
                    ? 'Please log in with Google.'
                    : user.appleId
                    ? 'Please log in with Apple.'
                    : 'Please log in with email.';
                return next(createError.BadRequest(errorMessage));
            }
            if (facebookId !== user.facebookId) {
                return next(createError.BadRequest('Invalid Facebook ID.'));
            }
        }

        if (appleId) {
            if (!user.appleId) {
                const errorMessage = user.googleId
                    ? 'Please log in with Google.'
                    : user.facebookId
                    ? 'Please log in with Facebook.'
                    : 'Please log in with email.';
                return next(createError.BadRequest(errorMessage));
            }
            if (appleId !== user.appleId) {
                return next(createError.BadRequest('Invalid Apple ID.'));
            }
        }

        user.fcmToken = req.body.fcmToken;
        await user.save();
        const token = await user.generateAuthToken();

        user.__v = undefined;
        user.isDelete = undefined;
        user.isActive = undefined;
        user.updatedAt = undefined;

        return res.json({
            code: '002',
            message: 'Login Successful.',
            token,
            user,
        });
    } catch (error) {
        next(error);
    }
};

exports.createSocialProfile = async (req, res, next) => {
    try {
        let user = new User({
            name: req.body.name,
            email: req.body.email,
            address: req.body.address,

            landmark: req.body.landmark,
            city: req.body.city,
            state: req.body.state,
            country: req.body.country,
            zipcode: req.body.zipcode,

            fcmToken: req.body.fcmToken,
            googleId: req.body.googleId,
            facebookId: req.body.facebookId,
            appleId: req.body.appleId,
        });

        await user.validate();

        // console.log(user,"nbew user");
        await Promise.all([user.save()]);
        // console.log(user, 'nbew user');

        const token = await user.generateAuthToken();

        // hide fields
        user.password = undefined;
        user.__v = undefined;
        user.isDelete = undefined;
        user.isActive = undefined;
        user.updatedAt = undefined;

        res.status(201).json({
            message: 'Profile created successfully.',
            token,
            user,
        });
    } catch (error) {
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { email, password, fcmToken } = req.body;

        if (!email && !password)
            return next(createError.BadRequest('Provide email and password!'));

        let user = await User.findOne({ email, isDelete: false }).select(
            '+password -__v -createdAt -updatedAt'
        );

        if (!user) return next(createError.BadRequest('auth.credentialsemail'));

        if(user.googleId || user.facebookId || user.appleId) {
            return next(createError.BadRequest('Login with social account.'));
        }
        if (user.isActive == false)
            return next(createError.BadRequest('auth.blocked'));

        if (!user || !(await user.correctPassword(password, user.password)))
            return next(createError.BadRequest('auth.credentialsemail'));

        const token = await user.generateAuthToken();

        user.fcmToken = fcmToken;
        user.token = token;

        await user.save();
        // hide fields
        user = user.toObject();
        user.isActive = undefined;
        user.isDelete = undefined;
        user.token = undefined;
        user.password = undefined;
        user.__v = undefined;
        user.createdAt = undefined;
        user.updatedAt = undefined;

        res.status(201).json({
            success: true,
            message: req.t('auth.login'),
            token,
            user,
        });
    } catch (error) {
        next(error);
    }
};

exports.forgotPassword = async (req, res, next) => {
    try {
        const email = req.body.email;
        if (!email) return next(createError.BadRequest('validation.email'));

        const user = await User.findOne({ email });
        if (!user)
            return next(createError.BadRequest('phone.notRegisteredEmail'));

        // generate and save OTP
        const otp = generateCode(4);
        await otpModel.updateOne(
            { email: email },
            { otp, expireAt: Date.now() + 5 * 60 * 1000 },
            { upsert: true }
        );

        // send OTP
        // await sendOTP(phone, otp);

        res.json({ success: true, message: req.t('otp.sent'), otp: otp });
    } catch (error) {
        next(error);
    }
};

exports.resetPassword = async (req, res, next) => {
    try {
        let { email, otp } = req.body;

        const otpVerified = await otpModel.findOne({
            email: email,
            otp: otp,
        });

        if (!otpVerified) return next(createError.BadRequest('otp.fail'));

        const user = await User.findOne({
            email: req.body.email,
        });

        // update passcode
        user.password = req.body.password;

        await user.save();

        res.json({
            success: true,
            message: 'Password updated successfully',
        });
    } catch (error) {
        next(error);
    }
};

exports.changePassword = async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id).select('+password');

        const isMatch = await user.correctPassword(oldPassword, user.password);
        if (!isMatch)
            return next(createError.BadRequest('changePass.wrongPass'));

        // update password
        if (oldPassword == newPassword)
            return next(createError.BadRequest('changePass.samePass'));

        user.password = newPassword;

        await user.save();

        res.json({
            success: true,
            message: req.t('changePass.updated'),
        });
    } catch (error) {
        next(error);
    }
};

exports.getProfile = async (req, res, next) => {
    try {
        let user = await User.findById(req.user.id).select(
            '-isDelete -isActive -createdAt -updatedAt -__v -fcmToken -token'
        );

        res.status(201).json({
            success: true,
            message: req.t('success'),
            data: user,
        });
    } catch (error) {
        next(error);
    }
};

exports.editProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        // const phoneExists = await User.findOne({mobileNumber: req.body.mobileNumber, _id: { $ne: user._id } });
        // if (phoneExists)
        //     return next(createError.BadRequest('validation.alreadyRegisteredPhone'));
        if (req.file) {
            user.photo = `${req.file.filename}`;
        }
        user.name = req.body.name;
        user.address = req.body.address;
        user.landmark = req.body.landmark;
        user.city = req.body.city;
        user.state = req.body.state;
        user.country = req.body.country;
        user.zipcode = req.body.zipcode;
        user.gender = req.body.gender;

        await user.save();

        res.status(201).json({
            success: true,
            message: req.t('auth.updated'),
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

exports.deleteAccount = async (req, res, next) => {
    try {
        // Set isDeleted to true for all products associated with this user
        await Product.updateMany({ user: req.user.id }, { isDeleted: true });

        // Delete the user account
        await User.findByIdAndDelete(req.user.id);

        res.status(201).json({
            success: true,
            message: req.t('auth.deleted_success'),
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

exports.updateNotification = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        user.isNotification = req.params.status;

        await user.save();

        res.status(201).json({
            success: true,
            message: req.t('success'),
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

exports.changeLanguage = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        user.language = true;
        user.token = '';
        user.fcmToken = '';

        //Points Removed

        await user.save();

        res.status(201).json({
            success: true,
            message: req.t('auth.deleted_success'),
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

exports.notificationListUser = async (req, res, next) => {
    try {
        const notifications = await userNotificationModel
            .find({
                sentTo: req.user._id,
            })
            .sort({ createdAt: -1 })
            .select('-expireAt -__v -sentTo')
            .lean();
        if (!notifications)
            return next(createError.BadRequest('Notification not found.'));

        const unreadCount = notifications.filter(
            notification =>
                !notification.readBy.some(
                    userId => userId.toString() === req.user._id.toString()
                )
        ).length;

        const notificationsWithoutReadBy = notifications.map(notification => {
            const { readBy, ...rest } = notification;
            return rest;
        });

        res.json({
            success: true,
            unreadCount,
            notifications: notificationsWithoutReadBy,
        });
    } catch (error) {
        next(error);
    }
};

exports.clearNotifications = async (req, res, next) => {
    try {
        await userNotificationModel.deleteMany({ sentTo: req.user._id });

        res.status(200).json({
            success: true,
            message: 'All notifications cleared successfully.',
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

exports.markNotificationRead = async (req, res, next) => {
    try {
        await userNotificationModel.updateMany(
            {
                sentTo: req.user._id,
                readBy: { $ne: req.user._id },
            },
            { $addToSet: { readBy: req.user._id } }
        );

        res.json({
            success: true,
            message: 'All notifications marked as read.',
        });
    } catch (error) {
        next(error);
    }
};

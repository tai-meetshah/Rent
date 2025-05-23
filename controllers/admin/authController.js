const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const createError = require('http-errors');
const generateCode = require('../../utils/generateCode');
// const { sendOtp } = require('../../utils/sendMail');

const Admin = require('../../models/adminModel');
const OTP = require('../../models/adminOtpModel');
const User = require('../../models/userModel');
const Vendor = require('../../models/vendorModel');
const moduleModel = require('../../models/moduleModel');
const adminModel = require('../../models/adminModel');

exports.checkAdmin = async (req, res, next) => {
    try {
        const token = req.cookies['jwtAdmin'];
        req.session.checkAdminSuccess = true;
        if (token) {
            const decoded = await promisify(jwt.verify)(
                token,
                process.env.JWT_SECRET
            );
            const admin = await Admin.findById(decoded._id);
            if (!admin) {
                req.flash('red', 'Please login as admin first!');
                return res.redirect('/login');
            }

            if (admin.role == 'A') {
                if (admin.isActive) {
                    // console.log(req)

                    req.admin = admin;
                    res.locals.photo = admin.photo;
                    req.session.checkAdminSuccess = undefined;
                    next();
                } else {
                    req.flash(
                        'red',
                        'Your account has been blocked, Please contact to admin.'
                    );
                    res.redirect('/login');
                }
            } else {
                req.admin = admin;
                res.locals.photo = admin.photo;
                req.session.checkAdminSuccess = undefined;
                next();
            }
        } else {
            req.flash('red', 'Please login as admin first!');
            res.redirect('/login');
        }
    } catch (error) {
        if (error.message == 'invalid signature')
            req.flash('red', 'Invalid token! Please login again.');
        else req.flash('red', error.message);
        res.redirect('/login');
    }
};

exports.checkPermission = (moduleKey, action) => {
    return async (req, res, next) => {
        try {
            const admin = req.admin;
            if (!admin) {
                req.flash('red', 'Unauthorized access!');
                return res.redirect('/login');
            }

            // Super Admin has full access
            if (admin.role === 'S') return next();

            if (admin.role === 'A') {
                const permission = admin.permission.find(
                    p => p.key === moduleKey
                );

                if (!permission || !permission[action]) {
                    req.flash(
                        'red',
                        'You do not have permission for this action.'
                    );
                    return res.redirect('/'); // Redirect to a safe place
                }
            }

            next();
        } catch (error) {
            console.error(error);
            req.flash('red', 'Something went wrong!');
            res.redirect('/');
        }
    };
};

exports.getDashboard = async (req, res) => {
    var data = {};
    data.user = await User.find({ isDelete: false }).count();
    data.vendor = await Vendor.find({ isDelete: false }).count();
    res.render('index', { data });
};

exports.getLogin = async (req, res) => {
    try {
        if (req.session.checkAdminSuccess) {
            req.session.checkAdminSuccess = undefined;
            return res.render('login');
        }

        const token = req.cookies['jwtAdmin'];
        if (token) {
            const decoded = await promisify(jwt.verify)(
                token,
                process.env.JWT_SECRET
            );
            const admin = await Admin.findById(decoded._id);
            if (!admin) return res.render('login');

            res.redirect('/');
        } else {
            res.render('login');
        }
    } catch (error) {
        req.flash('red', error.message);
        res.render('login');
    }
};

exports.postLogin = async (req, res) => {
    try {
        let { email, password } = req.body;
        email = email.trim();
        const admin = await Admin.findOne({ email });

        if (
            !admin ||
            !(await admin.correctPassword(password, admin.password))
        ) {
            req.flash('red', 'Incorrect email or password');
            return res.redirect(req.originalUrl);
        }
        const token = await admin.generateAuthToken();
        res.cookie('jwtAdmin', token, {
            expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            httpOnly: true,
        });

        res.redirect('/');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect(req.originalUrl);
    }
};

exports.getProfile = (req, res) =>
    res.render('profile', { admin: req.admin, photo: req.admin.photo });

exports.postProfile = async (req, res) => {
    try {
        const image = req.file ? `/uploads/${req.file.filename}` : undefined;
        req.body.photo = image;

        await Admin.findOneAndUpdate({ _id: req.admin.id }, req.body, {
            runValidators: true,
        });

        req.flash('green', 'Profile updated successfully.');
        res.redirect(req.originalUrl);
    } catch (error) {
        req.flash(error.message);
        res.redirect(req.originalUrl);
    }
};

exports.logout = (req, res) => {
    res.clearCookie('jwtAdmin');
    res.redirect('/login');
};

exports.getForgot = (req, res) => {
    res.clearCookie('jwtAdmin');
    res.render('pass_forgot');
};

exports.postForgot = async (req, res) => {
    try {
        const admin = await Admin.findOne({ email: req.body.email });
        if (!admin) {
            req.flash('red', 'No admin with this email.');
            return res.redirect(req.originalUrl);
        }

        // generate and save OTP
        const otp = generateCode(6);
        await OTP.updateOne(
            { adminId: admin.id },
            { otp, createdAt: Date.now() + 5 * 60 * 1000 },
            { upsert: true }
        );

        // send mail
        // sendOtp(admin.email, otp);

        req.session.adminId = admin.id;
        res.redirect('/reset');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect(req.originalUrl);
    }
};

exports.getReset = (req, res) => {
    if (!req.session.adminId) {
        req.flash('red', 'Please try again.');
        return res.redirect('/forgot');
    }
    res.render('pass_reset', { adminId: req.session.adminId });
};

exports.postReset = async (req, res) => {
    try {
        const admin = await Admin.findById(req.body.adminId);
        if (!admin) {
            req.flash('red', 'No admin with this email.');
            return res.redirect('/forgot');
        }

        // verify otp
        let otp = await OTP.findOne({ adminId: admin.id });
        if (otp?.otp != req.body.otp) {
            req.flash('red', 'OTP is incorrect or expired, Please try again.');
            return res.redirect('/forgot');
        }

        // reset pass
        admin.password = req.body.password;
        admin.passwordConfirm = req.body.passwordConfirm;
        await admin.save();

        req.flash('green', 'Password updated, try logging in.');
        return res.redirect('/login');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/forgot');
    }
};

exports.authenticate = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const admin = await Admin.findOne({ email });

        if (!admin || !(await admin.correctPassword(password, admin.password)))
            return next(
                createError.Unauthorized('Incorrect email or password')
            );

        res.json({ status: 'success' });
    } catch (error) {
        next(error);
    }
};

exports.getChangePass = (req, res) => res.render('change_pass');

exports.postChangePass = async (req, res) => {
    try {
        const { currentpass, newpass, cfnewpass } = req.body;

        if (currentpass == newpass) {
            req.flash(
                'red',
                'New password can not be same as current password.'
            );
            return res.redirect(req.originalUrl);
        }

        const admin = await Admin.findOne({ email: req.admin.email });

        if (!(await admin.correctPassword(currentpass, admin.password))) {
            req.flash('red', 'Your current password is wrong.');
            return res.redirect(req.originalUrl);
        }

        admin.password = newpass;
        admin.passwordConfirm = cfnewpass;
        await admin.save();

        req.flash('green', 'Password updated successully.');
        return res.redirect(req.originalUrl);
    } catch (error) {
        if (error.name === 'ValidationError') {
            Object.keys(error.errors).forEach(key => {
                req.flash('red', error.errors[key].message);
            });
        } else {
            req.flash('red', error.message);
        }
        return res.redirect(req.originalUrl);
    }
};

/* SUB ADMIN ROUTES */

exports.getSubAdminList = async (req, res) => {
    const subadmin = await adminModel
        .find({ role: 'A' })
        .sort({ createdAt: -1 });

    res.render('subadmin', { subadmin });
};

exports.getSubAdmin = async (req, res) => {
    const modules = await moduleModel.find();
    res.render('subadmin_add', { modules });
};

exports.postSubAdmin = async (req, res) => {
    try {
        const { name, email, password, permissions } = req.body;

        const isExists = await adminModel.findOne({ email });
        if (isExists) {
            req.flash('red', 'This email address already registered!');
            return res.redirect('/sub-admin/list');
        }

        // Convert permissions into required format
        const formattedPermissions = [
            ...Object.values(permissions).map(perm => ({
                key: perm.module,
                module: perm.moduleName,
                isView: perm.isView === 'true',
                isAdd: perm.isAdd === 'true',
                isEdit: perm.isEdit === 'true',
                isDelete: perm.isDelete === 'true',
            })),
            {
                key: 'subadmin',
                module: 'Sub Admin',
                isView: false,
                isAdd: false,
                isEdit: false,
                isDelete: false,
            },
        ];

        // Create a new admin/sub-admin
        const newAdmin = new adminModel({
            name,
            email,
            password,
            role: 'A',
            permission: formattedPermissions,
        });

        await newAdmin.save();
        req.flash('green', 'Sub Admin added successfully.');
        res.redirect('/sub-admin/list');
    } catch (error) {
        req.flash('red', 'Something went wrong!');
        res.redirect('/sub-admin/list');
    }
};

exports.changeAdminStatus = async (req, res) => {
    try {
        const user = await adminModel.findById(req.params.id);

        user.isActive = req.params.status;

        await user.save();

        req.flash('green', 'Status changed successfully.');
        res.redirect('/sub-admin/list');
    } catch (error) {
        if (error.name === 'CastError' || error.name === 'TypeError')
            req.flash('red', 'User not found!');
        else req.flash('red', error.message);
        res.redirect('/sub-admin/list');
    }
};

exports.getEditSubAdmin = async (req, res) => {
    const admin = await adminModel.findById(req.params.id);
    res.render('subadmin_edit', { admin });
};

exports.postEditSubAdmin = async (req, res) => {
    try {
        const { name, email, password, permissions } = req.body;

        // if(isExists){
        //     req.flash('red', 'This email address already registered!');
        //     return res.redirect("/sub-admin/list");
        // }

        const admin = await adminModel.findById(req.params.id);

        // Convert permissions into required format
        const formattedPermissions = Object.values(permissions).map(perm => ({
            key: perm.module,
            module: perm.moduleName,
            isView: perm.isView === 'true',
            isAdd: perm.isAdd === 'true',
            isEdit: perm.isEdit === 'true',
            isDelete: perm.isDelete === 'true',
        }));

        // Create a new admin/sub-admin
        admin.name = name;
        admin.email = email;
        admin.password = password;
        admin.permission = formattedPermissions;

        await admin.save();

        req.flash('green', 'Sub Admin updated successfully.');
        res.redirect('/sub-admin/list');
    } catch (error) {
        req.flash('red', 'Something went wrong!');
        res.redirect('/sub-admin/list');
    }
};

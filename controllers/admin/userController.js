const User = require('../../models/userModel');
const enquiryModel = require('../../models/enquiryModel');
const sendNotification = require('../../utils/sendNotification');

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find({ isDelete: false })
            .select('name email city createdAt isActive googleId')
            .sort('-_id');

        res.render('user', { users });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.viewUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            req.flash('red', 'User not found!');
            return res.redirect('/admin/user');
        }

        res.render('user_view', { user });
    } catch (error) {
        if (error.name === 'CastError') req.flash('red', 'User not found!');
        else req.flash('red', error.message);
        res.redirect('/admin/user');
    }
};

exports.changeUserStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            req.flash('red', 'User not found.');
            return res.redirect('/admin/user');
        }

        user.isActive = req.params.status;

        await user.save();

        req.flash('green', 'Status changed successfully.');
        res.redirect('/admin/user');
    } catch (error) {
        if (error.name === 'CastError' || error.name === 'TypeError')
            req.flash('red', 'User not found!');
        else req.flash('red', error.message);
        res.redirect('/admin/user');
    }
};

exports.getDeleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);

        req.flash('green', 'User deleted successfully.');
        res.redirect('/admin/user');
    } catch (error) {
        if (error.name === 'CastError' || error.name === 'TypeError')
            req.flash('red', 'User not found!');
        else req.flash('red', error.message);
        res.redirect('/admin/user');
    }
};

exports.getEnquiries = async (req, res) => {
    try {
        const data = await enquiryModel.find().sort({ updatedAt: -1 }).populate('user');

        res.render('enquiry1', { data });

    } catch (error) {
        console.log(error);
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.sendChat = async (req, res, next) => {
    try {
        const enquiry = await enquiryModel.findById(req.params.id)

        enquiry.chat.push(
            {
                msg: req.body.msg,
                sender: "A",
                type: "text"
            }
        )

        await enquiry.save();

        //Need to send notification
        const msg = "Admin sent you a meesage.";
        const body = {
            type: "CHAT",
            data: enquiry._id.toString()
        }
        const userId = enquiry.user

        // await sendNotification(userId, msg, body);

        res.status(200).json({ message: 'Success' });
    } catch (error) {
        res.status(400).json({ message: 'Failed' });
    }
};

exports.endChat = async (req, res, next) => {
    try {

        const enquiry = await enquiryModel.findById(req.params.id)

        enquiry.isEnded = true

        await enquiry.save();

        res.redirect('/admin/enquire/chat/' + req.params.id);
    } catch (error) {
        res.redirect('/admin/enquire/chat/' + req.params.id);
    }
};

exports.getChat = async (req, res) => {
    try {
        const data = await enquiryModel.findById(req.params.id).populate('user')

        await enquiryModel.updateOne(
            { _id: req.params.id },
            { $set: { "chat.$[elem].isRead": true } },
            {
                arrayFilters: [{ "elem.sender": "U", "elem.isRead": false }],
                timestamps: false
            }
        );

        res.render('enquiry', { data });

    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin/enquire');
    }
};
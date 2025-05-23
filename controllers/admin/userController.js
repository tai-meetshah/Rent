const User = require("../../models/userModel");

exports.getAllUsers = async (req, res) => {

    try {
        const users = await User.find({isDelete: false}).select('qrCode name mobileNumber birthDate gender createdAt isActive').sort('-_id');
 
        res.render('user', { users });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/');
    }

};

exports.viewUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash("red", "User not found!");
      return res.redirect("/user");
    }

    res.render("user_view", { user });
  } catch (error) {
    if (error.name === "CastError") req.flash("red", "User not found!");
    else req.flash("red", error.message);
    res.redirect("/user");
  }
};

exports.changeUserStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            req.flash('red', 'User not found.');
            return res.redirect('/user');
        }

        user.isActive = req.params.status

        await user.save();

        req.flash('green', 'Status changed successfully.');
        res.redirect('/user');
    } catch (error) {
        if (error.name === 'CastError' || error.name === 'TypeError')
            req.flash('red', 'User not found!');
        else req.flash('red', error.message);
        res.redirect('/user');
    }
};

exports.getDeleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);

        req.flash('green', 'User deleted successfully.');
        res.redirect('/user');
    } catch (error) {
        if (error.name === 'CastError' || error.name === 'TypeError')
            req.flash('red', 'User not found!');
        else req.flash('red', error.message);
        res.redirect('/user');
    }
};

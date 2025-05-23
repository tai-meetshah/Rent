const discountModel = require("../../models/discountModel");

exports.getAllDiscount = async (req, res) => {

    try {
        const discounts = await discountModel.find().select('-updatedAt -createdAt -__v')
                                .populate({
                                    path: 'vendor',
                                    select: 'businessName'
                                }).sort('-_id');

        res.render('discount', { discounts });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/');
    }
};

exports.approvedDiscount = async (req, res) => {
    try {
        const user = await discountModel.findById(req.params.id);

        user.adminApprovedStatus = req.params.status

        await user.save();

        req.flash('green', 'Discount code approved successfully.');
        res.redirect('/discount');
    } catch (error) {
        if (error.name === 'CastError' || error.name === 'TypeError')
            req.flash('red', 'discount not found!');
        else req.flash('red', error.message);
        res.redirect('/discount');
    }
};

const bannerModel = require('../../models/bannerModel');

exports.getBanners = async (req, res) => {
    try {
        const banners = await bannerModel.find().sort({ sort: 'asc' });

        res.render('banner', { banners });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/');
    }
};

exports.getAddBanner = async (req, res) => {
    try {
        res.render('banner_add');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/banner');
    }
};

exports.postAddBanner = async (req, res) => {
    try {
        await bannerModel.create({
            sort: req.body.sort,
            image: req.files.image[0].filename,
        });

        req.flash('green', 'Banner created successfully.');
        res.redirect('/banner');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/banner');
    }
};

exports.getEditBanner = async (req, res) => {
    try {
        const banner = await bannerModel.findById(req.params.id);

        res.render('banner_edit', { banner });
    } catch (error) {
        if (error.name === 'CastError') req.flash('red', 'banner not found!');
        else req.flash('red', error.message);
        res.redirect('/banner');
    }
};

exports.postEditBanner = async (req, res) => {
    try {
        const banner = await bannerModel.findById(req.params.id);

        banner.sort = req.body.sort;
        banner.image = req.files.image
            ? `${req.files.image[0].filename}`
            : banner.image;

        await banner.save();

        req.flash('green', 'Banner updated successfully.');
        res.redirect('/banner');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/banner');
    }
};

exports.getDeleteBanner = async (req, res) => {
    try {
        await bannerModel.findByIdAndDelete(req.params.id);

        req.flash('green', 'Banner deleted successfully.');
        res.redirect('/banner');
    } catch (error) {
        if (error.name === 'CastError' || error.name === 'TypeError')
            req.flash('red', 'Banner not found!');
        else req.flash('red', error.message);
        res.redirect('/banner');
    }
};

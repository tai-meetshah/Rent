const faqModel = require('../../models/faqModel');
const pageModel = require('../../models/pageModel');

exports.termCondition = async (req, res, next) => {
    try {
        let page = await pageModel
            .findOne({ key: 'term' })
            .select('-__v -key -_id');

        res.json({
            success: true,
            message: req.t('success'),
            data: page.en,
        });
    } catch (error) {
        next(error);
    }
};

exports.privacyPolicy = async (req, res, next) => {
    try {
        let page = await pageModel
            .findOne({ key: 'privacy' })
            .select('-__v -key -_id');

        res.json({
            success: true,
            message: req.t('success'),
            data: page.en,
        });
    } catch (error) {
        next(error);
    }
};

exports.faq = async (req, res, next) => {
    try {
        let page = await faqModel.find().select('-__v -createdAt -updatedAt');

        res.json({
            success: true,
            message: req.t('success'),
            page,
        });
    } catch (error) {
        next(error);
    }
};

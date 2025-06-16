const Page = require('../../models/pageModel.js');
const faqModel = require('../../models/faqModel.js');

exports.getPrivacy = async (req, res) => {
    try {
        const page = await Page.findOne({ key: 'privacy' });

        res.render('privacy', { page });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.postPrivacy = async (req, res) => {
    try {
        const page = await Page.findOne({ key: 'privacy' });

        page.en.title = req.body.EnTitle;
        page.en.content = req.body.EnContent;

        await page.save();

        req.flash('green', 'Privacy Policy updated successfully.');
        res.redirect('/admin/cms/privacy');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect(req.originalUrl);
    }
};

exports.getTerm = async (req, res) => {
    try {
        const page = await Page.findOne({ key: 'term' });

        res.render('term', { page });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.postTerm = async (req, res) => {
    try {
        const page = await Page.findOne({ key: 'term' });

        page.en.title = req.body.EnTitle;
        page.en.content = req.body.EnContent;

        await page.save();

        req.flash('green', 'Terms & Condition updated successfully.');
        res.redirect('/admin/cms/term');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect(req.originalUrl);
    }
};

exports.getFaq = async (req, res) => {
    try {
        const faqs = await faqModel.find();

        res.render('faq', { faqs });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.getFaqAdd = async (req, res) => {
    res.render('faq_add');
};

exports.postFaqAdd = async (req, res) => {
    try {
        await faqModel.create({
            en: { question: req.body.question, answer: req.body.answer },
        });

        req.flash('green', 'FAQ added successfully.');
        res.redirect('/admin/cms/faq');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect(req.originalUrl);
    }
};

exports.getFaqUpdate = async (req, res) => {
    const faq = await faqModel.findById(req.params.id);

    res.render('faq_edit', { faq });
};

exports.postFaqUpdate = async (req, res) => {
    try {
        const faq = await faqModel.findById(req.params.id);

        faq.en.question = req.body.question;
        faq.en.answer = req.body.answer;

        faq.ar.question = req.body.Aquestion;
        faq.ar.answer = req.body.Aanswer;

        await faq.save();

        req.flash('green', 'FAQ updated successfully.');
        res.redirect('/admin/cms/faq');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect(req.originalUrl);
    }
};

exports.getFaqDelete = async (req, res) => {
    try {
        await faqModel.findByIdAndDelete(req.params.id);

        req.flash('green', 'FAQ deleted successfully.');
        res.redirect('/admin/cms/faq');
    } catch (error) {
        console.log(error);
        req.flash('red', error.message);
        res.redirect(req.originalUrl);
    }
};

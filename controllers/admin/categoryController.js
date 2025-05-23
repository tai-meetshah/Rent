const fs = require('fs');
const path = require('path');
const businessTypeModel = require('../../models/businessTypeModel');


exports.getCategories = async (req, res) => {
    try {
        const categories = await businessTypeModel.find({isDelete:false});

        res.render('category', { categories });

    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/');
    }
};

exports.getAddCategory = async (req, res) => {
    try {
        res.render('category_add');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/category');
    }
};

exports.postAddCategory = async (req, res) => {
    try {

        const image = req.file ? `${req.file.filename}` : undefined;

        await businessTypeModel.create({
            en: { name: req.body.ename },
            ar: { name: req.body.aname },
            image,
        });

        req.flash('green', 'Category created successfully.');
        res.redirect('/category');
    }
    catch (error) {
        req.flash('red', error.message);
        res.redirect('/category');
    }
};

exports.getEditCategory = async (req, res) => {
    try {
        const category = await businessTypeModel.findById(req.params.id);

        res.render('category_edit', { category });

    } catch (error) {
        if (error.name === 'CastError') req.flash('red', 'banner not found!');
        else req.flash('red', error.message);
        res.redirect('/category');
    }
};

exports.postEditCategory = async (req, res) => {
    try {
        const category = await businessTypeModel.findById(req.params.id);

        category.en.name = req.body.ename;
        category.ar.name = req.body.aname;

        if (req.file) {
            const oldImagePath = path.join(
                __dirname,
                '../../public/uploads/',
                category.image
            );
            fs.unlink(oldImagePath, () => {});

            category.image = req.file.filename;
        }

        await category.save();

        req.flash('green', 'Category updated successfully.');
        res.redirect('/category');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/category');
    }
};

exports.updateCategoryStatus = async (req, res) => {
    try {
        const category = await businessTypeModel.findById(req.params.id);

        category.isActive = req.params.status;

        await category.save();

        req.flash('green', 'Category status updated successfully.');
        res.redirect('/category');
    } catch (error) {
        if (error.name === 'CastError' || error.name === 'TypeError')
            req.flash('red', 'Category not found!');
        else req.flash('red', error.message);
        res.redirect('/category');
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const category = await businessTypeModel.findByIdAndUpdate(
            req.params.id,
            {
                isDelete: true,
            }
        );
        if (!category) {
            req.flash('red', 'Category not found!');
            return res.redirect('/category');
        }

        req.flash('green', 'Category deleted successfully.');
        res.redirect('/category');
    } catch (error) {
        if (error.name === 'CastError') req.flash('red', 'Category not found!');
        else req.flash('red', error.message);
        res.redirect('/category');
    }
};
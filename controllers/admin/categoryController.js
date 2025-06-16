const fs = require('fs');
const path = require('path');
const Category = require('../../models/categoryModel');

exports.getCategories = async (req, res) => {
    try {
        const categories = await Category.find({ isDelete: false });

        res.render('category', { categories });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.getAddCategory = async (req, res) => {
    try {
        res.render('category_add');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin/category');
    }
};

exports.postAddCategory = async (req, res) => {
    try {
        const image = req.file ? `${req.file.filename}` : undefined;

        await Category.create({
            name: req.body.ename,
            image,
        });

        req.flash('green', 'Category created successfully.');
        res.redirect('/admin/category');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin/category');
    }
};

exports.getEditCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        res.render('category_edit', { category });
    } catch (error) {
        if (error.name === 'CastError') req.flash('red', 'banner not found!');
        else req.flash('red', error.message);
        res.redirect('/admin/category');
    }
};

exports.postEditCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        category.name = req.body.ename;

        if (req.file) {
            category.image = req.file.filename;
        }

        await category.save();

        req.flash('green', 'Category updated successfully.');
        res.redirect('/admin/category');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin/category');
    }
};

exports.updateCategoryStatus = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        category.isActive = req.params.status;

        await category.save();

        req.flash('green', 'Category status updated successfully.');
        res.redirect('/admin/category');
    } catch (error) {
        if (error.name === 'CastError' || error.name === 'TypeError')
            req.flash('red', 'Category not found!');
        else req.flash('red', error.message);
        res.redirect('/admin/category');
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findByIdAndUpdate(req.params.id, {
            isDelete: true,
        });
        if (!category) {
            req.flash('red', 'Category not found!');
            return res.redirect('/admin/category');
        }

        req.flash('green', 'Category deleted successfully.');
        res.redirect('/admin/category');
    } catch (error) {
        if (error.name === 'CastError') req.flash('red', 'Category not found!');
        else req.flash('red', error.message);
        res.redirect('/admin/category');
    }
};

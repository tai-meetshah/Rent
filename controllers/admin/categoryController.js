const fs = require('fs');
const path = require('path');
const Category = require('../../models/categoryModel');
const Subcategory = require('../../models/subCatModel');
const Product = require('../../models/product');
const userModel = require('../../models/userModel');

exports.getCategories = async (req, res) => {
    try {
        const categories = await Category.find({ isDeleted: false });

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

exports.updateProductStatus = async (req, res) => {
    try {
        const category = await Product.findById(req.params.id);

        category.isActive = req.params.status;

        await category.save();

        req.flash('green', 'Product status updated successfully.');
        res.redirect('/admin/product');
    } catch (error) {
        if (error.name === 'CastError' || error.name === 'TypeError')
            req.flash('red', 'Category not found!');
        else req.flash('red', error.message);
        res.redirect('/admin/product');
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findByIdAndUpdate(req.params.id, {
            isDeleted: true,
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


exports.getSubcategories = async (req, res) => {
    try {
        const [category, subcategories] = await Promise.all([
            Category.findById(req.params.categoryId),
            Subcategory.find({ category: req.params.categoryId, isDeleted: false }).sort('name'),
        ]);

        if (!category) {
            req.flash('red', 'Category not found!');
            return res.redirect('/category');
        }

        res.render('subcategory', { subcategories, category });
    } catch (error) {
        if (error.name === 'CastError') req.flash('red', 'Category not found!');
        else req.flash('red', error.message);
        res.redirect('/category');
    }
};

exports.getAddSubcategory = async (req, res) => {
    try {
        const [category, categories] = await Promise.all([
            Category.findById(req.params.categoryId),
            Category.find({ isDeleted: false }).sort('name'),
        ]);
        res.render('subcategory_add', { category, categories });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect(`/admin/category/${req.params.categoryId}`);
    }
};

exports.postAddSubcategory = async (req, res) => {
    try {
        await Subcategory.create({
            name: req.body.ename,
            category: req.body.category,
        });

        req.flash('green', 'Sub Category added successfully.');
        // res.redirect(`/category/${req.params.categoryId}`);
        res.redirect(`/admin/category/${req.params.categoryId}`);

    } catch (error) {
        console.log(error)
        req.flash('red', error.message);
        res.redirect(`/admin/category/${req.params.categoryId}`);
    }
};

exports.getEditSubcategory = async (req, res) => {
    try {

        const [subcategory, categories] = await Promise.all([
            Subcategory.findById(req.params.id),
            Category.find({ isDeleted: false }).sort('name'),
        ]);

        if (!subcategory) {
            req.flash('red', 'Subcategory not found!');
            return res.redirect(`/category/${req.params.categoryId}`);
        }

        res.render('subcategory_edit', { subcategory, categories });
    } catch (error) {
        if (error.name === 'CastError')
            req.flash('red', 'Subcategory not found!');
        else req.flash('red', error.message);
        res.redirect(`/admin/category/${req.params.categoryId}`);
    }
};

exports.postEditSubcategory = async (req, res) => {
    try {

        const subcategory = await Subcategory.findById(req.params.id);
        if (!subcategory) {
            req.flash('red', 'Subcategory not found!');
            return res.redirect(`/category/${req.params.categoryId}`);
        }

        subcategory.name = req.body.EnName;
        subcategory.category = req.body.category;

        await subcategory.save();

        req.flash('green', 'Subcategory updated successfully.');
        res.redirect(`/admin/category/${subcategory.category}`);
    } catch (error) {
        req.flash('red', error.message);
        res.redirect(`/admin/category/${req.params.categoryId}`);
    }
};

exports.getDeleteSubcategory = async (req, res) => {
    try {
        const product = await Subcategory.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        product.isDeleted = true

        await product.save();
        // const merchants = await Merchant.find({
        //     subcategory: req.params.id,
        // }).select('_id');

        // const merchantIDs = merchants.map(x => x._id);

        // const [data] = await Promise.all([
        //     Subcategory.deleteOne({
        //         _id: req.params.id,
        //     }),
        // Review.deleteMany({
        //     merchant: {
        //         $in: merchantIDs,
        //     },
        // }),
        // Offer.deleteMany({
        //     merchant: {
        //         $in: merchantIDs,
        //     },
        // }),
        // ]);



        req.flash('green', 'Subcategory deleted successfully.');
        res.redirect(`/admin/category/${product.category}`);

    } catch (error) {
        if (error.name === 'CastError')
            req.flash('red', 'Subcategory not found!');
        else req.flash('red', error.message);
        res.redirect('/admin/category');
    }
};

exports.getProducts = async (req, res) => {
    try {
        const categories = await Product.find({ isDeleted: false })
            .populate('category subcategory user')
            .select('title user images category subcategory isActive isDeleted')
            .sort('-_id')

        res.render('product', { categories });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.getProductView = async (req, res) => {
    try {
        const vendor = await Product.findById(req.params.id)
            .populate('category subcategory user')

        res.render('product_view', { vendor });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const category = await Product.findByIdAndUpdate(req.params.id, {
            isDeleted: true,
        });
        if (!category) {
            req.flash('red', 'Product not found!');
            return res.redirect('/admin/product');
        }

        await userModel.updateMany(
            { favourites: req.params.id },
            { $pull: { favourites: req.params.id } }
        );
        req.flash('green', 'Product deleted successfully.');
        res.redirect('/admin/product');
    } catch (error) {
        if (error.name === 'CastError') req.flash('red', 'Product not found!');
        else req.flash('red', error.message);
        res.redirect('/admin/category');
    }
};
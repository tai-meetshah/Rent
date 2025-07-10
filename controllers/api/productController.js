const Category = require('../../models/categoryModel');
const Subcategory = require('../../models/subCatModel');

exports.getAllCategories = async (req, res, next) => {
    try {
        let categories = await Category.find({
            isDelete: false,
            isActive: true,
        })
            .sort('-_id')
            .select('-__v -isDelete -isActive');

        res.json({ success: true, categories });
    } catch (error) {
        next(error);
    }
};

exports.getCategoryWithSubcategories = async (req, res, next) => {
    try {
        const categoryId = req.params.categoryId;

        const subcategories = await Subcategory.find({
            category: categoryId,
        }).select('-__v -category');

        res.json({
            success: true,
            subcategories,
        });
    } catch (error) {
        next(error);
    }
};

exports.getAllSubcategories = async (req, res, next) => {
    try {
        const categories = await Subcategory.aggregate([
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'category',
                },
            },
            {
                $unwind: '$category',
            },
            {
                $group: {
                    _id: '$category._id',
                    name: { $first: '$category.name' },
                    subcategories: {
                        $push: {
                            _id: '$_id',
                            name: '$name',
                        },
                    },
                },
            },
        ]);

        res.json({ success: true, categories });
    } catch (error) {
        next(error);
    }
};

const Category = require('../../models/categoryModel');
const Subcategory = require('../../models/subCatModel');
const Product = require('../../models/product');

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
                    image: { $first: '$category.image' },
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

exports.createProductStep1 = async (req, res, next) => {
    try {
        const images = req.files ? req.files.map(file => `/${file.filename}`) : [];

        const {
            title,
            category,
            subcategory,
            description,
            feature,
            ideal,
            inStock,
            stockQuantity,
            deposit,
            depositAmount,
            deliverProduct,
            slabs,
            deliver,
            selectDate,
            allDaysAvailable,
            keywords,
            email,
        } = req.body;

        // Parse fields that come as JSON strings
        const parsedSlabs = typeof slabs === 'string' ? JSON.parse(slabs) : slabs;
        const parsedSelectDate = typeof selectDate === 'string' ? JSON.parse(selectDate) : selectDate;
        const parsedKeywords = typeof keywords === 'string' ? JSON.parse(keywords) : keywords;

        const latitude = parseFloat(req.body.latitude);
        const longitude = parseFloat(req.body.longitude);

        const newProduct = new Product({
            title,
            category,
            subcategory,
            description,
            feature,
            ideal,
            inStock,
            stockQuantity,
            deposit,
            depositAmount,
            deliverProduct,
            slabs: parsedSlabs,
            deliver,
            selectDate: parsedSelectDate,
            allDaysAvailable,
            keywords: parsedKeywords,
            email,
            images,
            step: '1',
            latitude,
            longitude,
            coordinates: {
                type: 'Point',
                coordinates: [longitude, latitude],
            },
        });

        const savedProduct = await newProduct.save();

        savedProduct.oCoordinates = undefined;
        savedProduct.oCancellationCharges = undefined;

        res.status(201).json({
            success: true,
            message: 'Step 1: Product created successfully.',
            productId: savedProduct._id,
            data: savedProduct,
        });
    } catch (error) {
        next(error);
    }
};

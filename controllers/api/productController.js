const Category = require('../../models/categoryModel');
const Subcategory = require('../../models/subCatModel');
const Product = require('../../models/product');
const SearchHistory = require('../../models/SearchHistory');
const userModel = require('../../models/userModel');
const Booking = require('../../models/Booking');

exports.getAllCategories = async (req, res, next) => {
    try {
        let categories = await Category.find({
            isDeleted: false,
            isActive: true,
        })
            .sort('-_id')
            .select('-__v -isDeleted -isActive');

        res.json({ success: true, categories });
    } catch (error) {
        next(error);
    }
};

// one user product
exports.getAllProduct = async (req, res, next) => {
    try {
        let categories = await Product.find({
            isDeleted: false,
            // isActive: true,
            user: req.user.id
        })
            .sort('-_id')
            .populate('category subcategory')
            .select('-__v -isDeleted');

        res.json({ success: true, data: categories });
    } catch (error) {
        next(error);
    }
};

// Get all the products not one user only /all-product
exports.getProducts = async (req, res, next) => {
    try {
        const {
            categoryId,
            subcategoryId,
            latitude,
            longitude,
            distance, // in meters, e.g. 5000 = 5km
            minPrice,
            maxPrice,
            rentalDuration,
            inStock,
            sortBy,
            search,
        } = req.body;

        const filter = {
            isDeleted: false,
            isActive: true,
        };

        if (search) {
            const searchRegex = new RegExp(search, 'i'); // case-insensitive
            const searchLower = search.toLowerCase();

            filter.$or = [
                { title: searchRegex },
                // { description: searchRegex },
                // { keywords: { $in: [search.toLowerCase()] } }, // if keywords stored in lowercase
                {
                    $expr: {
                        $gt: [
                            {
                                $size: {
                                    $filter: {
                                        input: "$keywords",
                                        as: "keyword",
                                        cond: {
                                            $eq: [
                                                { $toLower: "$$keyword" },
                                                searchLower
                                            ]
                                        }
                                    }
                                }
                            },
                            0
                        ]
                    }
                }
            ];
        }

        // Category filter
        if (categoryId) {
            filter.category = categoryId;
        }

        // Subcategory filter
        if (subcategoryId) {
            const subcategories = Array.isArray(subcategoryId)
                ? subcategoryId
                : subcategoryId.split(',').map(id => id.trim());

            filter.subcategory = { $in: subcategories };
        }

        // Price filter
        if (minPrice || maxPrice) {
            filter['price'] = {};
            if (minPrice) filter['price'].$gte = Number(minPrice);
            if (maxPrice) filter['price'].$lte = Number(maxPrice);
        }

        if (inStock !== undefined) {
            filter.inStock = inStock === 'true';
        }

        // Rental Duration filter (example logic, depends on your schema)
        if (rentalDuration) {
            filter.keywords = { $in: [rentalDuration] };
        }


        // Sorting
        let sortOption = { _id: -1 };
        if (sortBy) {
            switch (sortBy) {
                case 'priceLowToHigh':
                    sortOption = { 'price': 1 };
                    break;
                case 'priceHighToLow':
                    sortOption = { 'price': -1 };
                    break;
                case 'ratingHighToLow':
                    sortOption = { avgRating: -1 };
                    break;
                case 'ratingLowToHigh':
                    sortOption = { avgRating: 1 };
                    break;
                case 'mostPopular':
                    sortOption = { totalRating: -1 };
                    break;
            }
        }

        // Geospatial location filter
        if (latitude && longitude) {
            const maxDistance = distance ? Number(distance) : 10000;
            filter.coordinates = {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [Number(longitude), Number(latitude)],
                    },
                    $maxDistance: maxDistance,
                },
            };
        }

        const products = await Product.find(filter)
            .sort(sortOption)
            .populate('category subcategory')
            .select('-__v -isDeleted');

        const favouriteSet = new Set(((req.user && req.user.favourites) ? req.user.favourites : []).map(id => id.toString()));
        const data = products.map(p => ({
            ...p.toObject(),
            isFavourite: favouriteSet.has(p._id.toString())
        }));

        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
};


exports.getAllFeatureProduct = async (req, res, next) => {
    try {
        const { latitude, longitude, distance } = req.body;

        // console.log(latitude, longitude, distance, 'latitude and longitude');
        // console.log('--------------------------------');
        const filter = {
            isDeleted: false,
            publish: true,
            isActive: true,
            user: { $ne: req.user.id }
        };

        // Geospatial location filter
        if (latitude && longitude) {
            const maxDistance = distance ? Number(distance) : 10000; // default 10km
            // console.log(maxDistance);
            filter.coordinates = {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [Number(longitude), Number(latitude)],
                    },
                    $maxDistance: maxDistance,
                },
            };
        }

        const products = await Product.find(filter)
            .sort('-createdAt')
            .populate('category subcategory')
            .select('-__v -isDeleted');

        const favouriteSet = new Set(((req.user && req.user.favourites) ? req.user.favourites : []).map(id => id.toString()));
        const data = products.map(p => ({
            ...p.toObject(),
            isFavourite: favouriteSet.has(p._id.toString())
        }));

        // console.log(products);
        res.json({ success: true, data });
    } catch (error) {
        console.log("error", error);
        next(error);
    }
};

exports.getFeatureProductById = async (req, res, next) => {
    try {
        const product = await Product.findOne({
            _id: req.params.productId,
            isDeleted: false,
            publish: true,
            isActive: true,
            user: { $ne: req.user.id }
        })
            .populate('category subcategory')  // Populate category and subcategory details
            .select('-__v -isDeleted -step');  // Exclude unnecessary fields

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        const favouriteSet = new Set(((req.user && req.user.favourites) ? req.user.favourites : []).map(id => id.toString()));
        const data = { ...product.toObject(), isFavourite: favouriteSet.has(product._id.toString()) };

        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.getCategoryWithSubcategories = async (req, res, next) => {
    try {
        const categoryId = req.params.categoryId;

        const subcategories = await Subcategory.find({
            category: categoryId,
            isDeleted: false,
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
                $match: {
                    isDeleted: false,
                    isActive: true
                },
            },
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
                $match:{
                    'category.isDeleted': false,
                    'category.isActive': true,
                }
            },
            {
                $sort: { 'category.name': 1, name: 1 }, // Sort by category name, then subcategory name
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
            {
                $sort: {
                    name: 1
                }
            }
        ]);

        res.json({ success: true, categories });
    } catch (error) {
        next(error);
    }
};

// exports.getAllSubcategories = async (req, res, next) => {
//     try {
//         const categories = await Subcategory.aggregate([
//             {
//                 $match: {
//                     isDeleted: false, // Only non-deleted subcategories
//                 },
//             },
//             {
//                 $lookup: {
//                     from: 'categories',
//                     let: { categoryId: '$category' },
//                     pipeline: [
//                         {
//                             $match: {
//                                 $expr: {
//                                     $and: [
//                                         { $eq: ['$_id', '$$categoryId'] },
//                                         { $eq: ['$isDeleted', false] }, // Only non-deleted categories
//                                     ],
//                                 },
//                             },
//                         },
//                     ],
//                     as: 'category',
//                 },
//             },
//             {
//                 $unwind: '$category',
//             },
//             {
//                 $group: {
//                     _id: '$category._id',
//                     name: { $first: '$category.name' },
//                     image: { $first: '$category.image' },
//                     subcategories: {
//                         $push: {
//                             _id: '$_id',
//                             name: '$name',
//                         },
//                     },
//                 },
//             },
//         ]);

//         res.json({ success: true, categories });
//     } catch (error) {
//         next(error);
//     }
// };

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
            price,
            stockQuantity,
            deposit,
            depositAmount,
            deliverProduct,
            slabs,
            deliver,
            selectDate,
            allDaysAvailable,
            keywords,
            location,
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
            price,
            stockQuantity,
            deposit,
            depositAmount,
            deliverProduct,
            slabs: parsedSlabs,
            deliver,
            selectDate: parsedSelectDate,
            allDaysAvailable,
            keywords: parsedKeywords,
            images,

            step: '1',
            latitude,
            longitude,
            location,
            coordinates: {
                type: 'Point',
                coordinates: [longitude, latitude],
            },
            user: req.user.id
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

exports.createProductStep2 = async (req, res, next) => {
    try {
        const {
            oName,
            oEmail,
            oLatitude,
            oLongitude,
            oCancellationCharges,
            oRentingOut,
            oRulesPolicy,
            oLocation,
            productId,
            publish
        } = req.body;

        // Prepare update object
        const updateData = {
            oName,
            oEmail,
            oLatitude: parseFloat(oLatitude),
            oLongitude: parseFloat(oLongitude),
            oLocation,
            oRentingOut,
            oRulesPolicy,
            step: "2",
            publish
        };

        // GeoJSON point
        if (oLatitude && oLongitude) {
            updateData.oCoordinates = {
                type: 'Point',
                coordinates: [parseFloat(oLongitude), parseFloat(oLatitude)]
            };
        }

        // Parse cancellation charges
        if (oCancellationCharges) {
            updateData.oCancellationCharges = typeof oCancellationCharges === 'string'
                ? JSON.parse(oCancellationCharges)
                : oCancellationCharges;
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            updateData,
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        const responseFields = {
            _id: updatedProduct._id,
            oName: updatedProduct.oName,
            oEmail: updatedProduct.oEmail,
            oLatitude: updatedProduct.oLatitude,
            oLongitude: updatedProduct.oLongitude,
            oCoordinates: updatedProduct.oCoordinates,
            oLocation: updatedProduct.oLocation,
            oRentingOut: updatedProduct.oRentingOut,
            oRulesPolicy: updatedProduct.oRulesPolicy,
            oCancellationCharges: updatedProduct.oCancellationCharges,
            step: updatedProduct.step,
            publish: updatedProduct.publish
        };

        res.status(200).json({
            success: true,
            message: 'Step 2: Owner information updated.',
            data: responseFields,
        });

    } catch (error) {
        next(error);
    }
};


exports.editProductStep1 = async (req, res, next) => {
    try {
        const {
            productId,
            slabs,
            selectDate,
            keywords,
            latitude, price,
            longitude
        } = req.body;

        const images = req.files ? req.files.map(file => `/${file.filename}`) : undefined;

        const allowedFields = [
            'title', 'category', 'subcategory', 'description', 'feature', 'ideal',
            'inStock', 'stockQuantity', 'deposit', 'depositAmount', 'deliverProduct',
            'deliver', 'allDaysAvailable', 'location', 'publish', 'price'
        ];

        const updateData = {};

        // Dynamically assign values
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        });

        if (slabs !== undefined) {
            updateData.slabs = typeof slabs === 'string' ? JSON.parse(slabs) : slabs;
        }

        if (selectDate !== undefined) {
            updateData.selectDate = typeof selectDate === 'string' ? JSON.parse(selectDate) : selectDate;
        }

        if (keywords !== undefined) {
            updateData.keywords = typeof keywords === 'string' ? JSON.parse(keywords) : keywords;
        }

        if (latitude !== undefined) updateData.latitude = parseFloat(latitude);
        if (longitude !== undefined) updateData.longitude = parseFloat(longitude);

        if (latitude && longitude) {
            updateData.coordinates = {
                type: 'Point',
                coordinates: [parseFloat(longitude), parseFloat(latitude)],
            };
        }

        if (images && images.length > 0) {
            const existingProduct = await Product.findById(productId);
            if (!existingProduct) {
                return res.status(404).json({ success: false, message: "Product not found" });
            }

            updateData.images = [...existingProduct.images, ...images];
        }

        updateData.step = "1";

        const updated = await Product.findByIdAndUpdate(productId, updateData, { new: true });

        if (!updated) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        res.status(200).json({
            success: true,
            message: "Step 1: Product updated successfully.",
            data: updated
        });
    } catch (error) {
        next(error);
    }
};

exports.editProductStep2 = async (req, res, next) => {
    try {
        const { productId, oLatitude, oLongitude, oCancellationCharges } = req.body;
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "productId pass.",
            });
        }

        // Whitelisted Step 2 fields
        const allowedFields = [
            'oName', 'oEmail', 'oLatitude',
            'oLongitude', 'oCancellationCharges', 'oRentingOut',
            'oRulesPolicy', 'oLocation', 'publish'
        ];

        const updateData = {};

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        });

        if (oCancellationCharges) {
            updateData.oCancellationCharges = typeof oCancellationCharges === 'string'
                ? JSON.parse(oCancellationCharges)
                : oCancellationCharges;
        }

        if (oLatitude && oLongitude) {
            updateData.oCoordinates = {
                type: 'Point',
                coordinates: [parseFloat(oLongitude), parseFloat(oLatitude)],
            };
        }

        updateData.step = "2";

        const updated = await Product.findByIdAndUpdate(productId, updateData, { new: true });

        if (!updated) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const responseFields = {
            _id: updated._id,
            oName: updated.oName,
            oEmail: updated.oEmail,
            oLatitude: updated.oLatitude,
            oLongitude: updated.oLongitude,
            oCoordinates: updated.oCoordinates,
            oLocation: updated.oLocation,
            oRentingOut: updated.oRentingOut,
            oRulesPolicy: updated.oRulesPolicy,
            oCancellationCharges: updated.oCancellationCharges,
            step: updated.step,
            publish: updated.publish
        };

        res.status(200).json({
            success: true,
            message: "Step 2: Owner info updated successfully.",
            data: responseFields
        });
    } catch (error) {
        next(error);
    }
};


exports.deleteProductImg = async (req, res, next) => {
    try {
        const { imagePath, productId } = req.body;
        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false });

        product.images = product.images.filter(img => img !== imagePath);
        await product.save();

        res.json({ success: true, message: "Image removed successfully" });
    } catch (error) {
        next(error);
    }
}

exports.cancellProduct = async (req, res, next) => {
    try {
        const { productId } = req.body;
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        product.isDeleted = true

        await product.save();

        res.json({ success: true, message: 'Product cancelled successfully.' });
    } catch (error) {
        next(error);
    }
};

exports.deleteProduct = async (req, res, next) => {
    try {
        const { productId } = req.body;
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        product.isDeleted = true

        await product.save();

        await userModel.updateMany(
            { favourites: productId },
            { $pull: { favourites: productId } }
        );



        res.json({ success: true, message: 'Product deleted successfully.' });
    } catch (error) {
        next(error);
    }
};

exports.activeDeactiveProduct = async (req, res, next) => {
    try {
        const { productId, status } = req.body;
        const product = await Product.findById(productId);

        product.isActive = status

        await product.save()

        res.json({ success: true, message: 'Product status updated successfully.' });
    } catch (error) {
        next(error);
    }
};

// POST /api/search
exports.saveSearch = async (req, res, next) => {
    try {
        const { term } = req.body;

        if (!term || !term.trim()) {
            return res.status(400).json({ success: false, message: 'Search term is required' });
        }

        await SearchHistory.create({
            userId: req.user.id,
            term: term.trim(),
        });

        res.status(200).json({ success: true, message: 'Search saved' });
    } catch (error) {
        next(error);
    }
};

// GET /api/search-history
exports.getSearchHistory = async (req, res, next) => {
    try {
        const history = await SearchHistory.find({ userId: req.user.id })
            .sort({ searchedAt: -1 })
            .limit(10);

        res.status(200).json({ success: true, history });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/search-history/:id
exports.deleteSearchTerm = async (req, res, next) => {
    try {
        const { id } = req.params;

        let deleted = await SearchHistory.findOneAndDelete({ _id: id, userId: req.user.id });
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Term not found' });
        }

        res.status(200).json({ success: true, message: 'Term deleted' });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/search-history
exports.clearSearchHistory = async (req, res, next) => {
    try {
        let deleted = await SearchHistory.deleteMany({ userId: req.user.id });
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Search history not found' });
        }

        res.status(200).json({ success: true, message: 'Search history cleared' });
    } catch (error) {
        next(error);
    }
};

exports.addFavouriteProduct = async (req, res, next) => {
    try {
        const { productId } = req.body;
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        const user = await userModel.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        user.favourites.push(productId);
        await user.save();

        res.status(200).json({ success: true, message: 'Product added to favourites.' });
    } catch (error) {
        next(error);
    }
}

exports.removeFavouriteProduct = async (req, res, next) => {
    try {
        const { productId } = req.body;
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        const user = await userModel.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        user.favourites = user.favourites.filter(id => id.toString() !== productId);
        await user.save();

        res.status(200).json({ success: true, message: 'Product removed from favourites.' });
    } catch (error) {
        next(error);
    }
}

exports.getFavouriteProducts = async (req, res, next) => {
    try {
        const user = await userModel.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const products = await Product.find({ _id: { $in: user.favourites } })
            .populate('category subcategory')
            .select('-__v -isDeleted');

        res.status(200).json({ success: true, data: products });
    } catch (error) {
        next(error);
    }
}

const multer = require('multer');

exports.upload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, './public/uploads/');
        },
        filename: function (req, file, cb) {
            cb(null, Date.now() + file.originalname.replaceAll(' ', ''));
        },
    }),
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
    fileFilter: (req, file, cb) => {
        // reject a file
        if (
            file.mimetype === 'image/jpeg' ||
            file.mimetype === 'image/jpg' ||
            file.mimetype === 'image/png' ||
            file.mimetype === 'image/webp' ||
            file.mimetype === 'application/pdf'
        )
            cb(null, true);
        else cb(new Error('Please upload jpg or png file.'), false);
    },
});

// exports.merchantList = async (req, res, next) => {
//     try {
//         const page = parseInt(req.body.page) || 1;
//         const limit = parseInt(req.body.limit) || 10;

//         const query = { isDeleted: false };

//         const sortByOption = {
//             ratingHighToLow: { avgRating: -1, createdAt: -1 },
//             ratingLowToHigh: { avgRating: 1, createdAt: -1 },
//             popularity: { avgRating: -1, createdAt: -1 },
//             newest: { createdAt: -1 },
//         };

//         const sortBy = sortByOption[req.body.sortBy] || { createdAt: -1 };

//         // In SortBy ratingLowToHigh need "avgRating" field in database ($exists: true)
//         if (sortBy.avgRating)
//             query.avgRating = { $exists: true, ...query.avgRating };

//         if (req.body.city)
//             query.city = { $regex: new RegExp(req.body.city, 'i') };

//         if (req.body.state)
//             query.state = { $regex: new RegExp(req.body.state, 'i') };

//         if (req.body.country)
//             query.country = { $regex: new RegExp(req.body.country, 'i') };

//         if (req.body.name)
//             query.name = { $regex: new RegExp(req.body.name, 'i') };

//         if (req.body.category) {
//             const categoryIds = Array.isArray(req.body.category)
//                 ? req.body.category
//                 : [req.body.category];

//             query.category = { $in: categoryIds };
//         }

//         if (req.body.subcategory) {
//             const subcategoryIds = Array.isArray(req.body.subcategory)
//                 ? req.body.subcategory
//                 : [req.body.subcategory];

//             query.subcategory = { $in: subcategoryIds };
//         }

//         // Pass Array of Numbers in JSON(Array Not work in postman)
//         const rating = parseInt(req.body.rating);
//         if (rating) query.avgRating = { $gte: rating };

//         const userPreference = await Preference.findOne({
//             user: req.user?.id,
//         }).lean();

//         const categoryIds = userPreference?.categories || [];
//         const userRating = parseFloat(userPreference?.rating);

//         const userLatitude =
//             parseFloat(userPreference?.userLatitude) ||
//             parseFloat(req.user?.cityLatitude);

//         const userLongitude =
//             parseFloat(userPreference?.userLongitude) ||
//             parseFloat(req.user?.cityLongitude);

//         if (req.body.MyPreferences === 'on') {
//             const maxDistanceMeters =
//                 parseInt(userPreference?.distance) || 10000; // Default to 10,000 meters
//             const maxDistance = maxDistanceMeters / 1000;

//             if (userLatitude && userLongitude) {
//                 query.coordinates = {
//                     $geoWithin: {
//                         $centerSphere: [
//                             [userLongitude, userLatitude],
//                             maxDistance / 6371,
//                         ], // Divide by Earth's radius to convert to radians
//                     },
//                 };
//             }

//             if (categoryIds.length > 0) query.category = { $in: categoryIds };
//             if (
//                 userRating !== undefined &&
//                 userRating !== '' &&
//                 userRating !== ' ' &&
//                 !isNaN(userRating)
//             )
//                 query.avgRating = { $gte: userRating };
//         }

//         const totalMerchantCount = await Merchant.countDocuments(query);

//         let merchants = await Merchant.aggregate([
//             { $match: query },
//             {
//                 $lookup: {
//                     from: 'categories',
//                     localField: 'category',
//                     foreignField: '_id',
//                     as: 'category',
//                 },
//             },
//             {
//                 $lookup: {
//                     from: 'subcategories',
//                     localField: 'subcategory',
//                     foreignField: '_id',
//                     as: 'subcategory',
//                 },
//             },
//             {
//                 $lookup: {
//                     from: 'offers',
//                     localField: 'offers',
//                     foreignField: '_id',
//                     as: 'offers',
//                 },
//             },
//             { $sort: sortBy },
//             { $skip: (page - 1) * limit },
//             { $limit: limit },
//             {
//                 $addFields: {
//                     isFavourite: {
//                         $cond: {
//                             if: {
//                                 $in: ['$_id', req.user?.favourites || []],
//                             },
//                             then: true,
//                             else: false,
//                         },
//                     },
//                 },
//             },
//             {
//                 $project: {
//                     __v: 0,
//                     date: 0,
//                     createdAt: 0,
//                     updatedAt: 0,
//                     coordinates: 0,
//                 }, // Project stage to exclude fields
//             },
//         ]);

//         if (
//             req.body.distance == 'on' &&
//             userLatitude !== undefined &&
//             userLongitude !== undefined
//         ) {
//             merchants = merchants.map(merchant => {
//                 if (merchant.latitude && merchant.longitude) {
//                     const distance = geolib.getDistance(
//                         {
//                             latitude: userLatitude,
//                             longitude: userLongitude,
//                         },
//                         {
//                             latitude: merchant.latitude,
//                             longitude: merchant.longitude,
//                         }
//                     );
//                     merchant.distance = distance / 1000; // Convert meters to kilometers
//                     merchant.latitude = undefined;
//                     merchant.longitude = undefined;
//                 } else {
//                     merchant.distance = null;
//                     merchant.latitude = undefined;
//                     merchant.longitude = undefined;
//                 }
//                 return merchant;
//             });
//         }

//         res.json({
//             success: true,
//             totalMerchantCount,
//             currentPage: page,
//             totalPages: Math.ceil(totalMerchantCount / limit),
//             merchants,
//         });
//     } catch (error) {
//         next(error);
//     }
// };

// exports.latestMerchantList = async (req, res, next) => {
//     try {
//         const query = { isDeleted: false };

//         const userPreference = await Preference.findOne({
//             user: req.user?.id,
//         }).lean();

//         const categoryIds = userPreference?.categories || [];
//         const userRating = parseFloat(userPreference?.rating);

//         const userLatitude =
//             parseFloat(userPreference?.userLatitude) ||
//             parseFloat(req.user?.cityLatitude);

//         const userLongitude =
//             parseFloat(userPreference?.userLongitude) ||
//             parseFloat(req.user?.cityLongitude);

//         const maxDistanceMeters = parseInt(userPreference?.distance) || 10000; // Default to 10,000 meters
//         const maxDistance = maxDistanceMeters / 1000;

//         if (req.query.MyPreferences === 'on') {
//             if (userLatitude && userLongitude) {
//                 query.coordinates = {
//                     $geoWithin: {
//                         $centerSphere: [
//                             [userLongitude, userLatitude],
//                             maxDistance / 6371,
//                         ], // Divide by Earth's radius to convert to radians
//                     },
//                 };
//             }

//             if (categoryIds.length > 0) query.category = { $in: categoryIds };
//             if (
//                 userRating !== undefined &&
//                 userRating !== '' &&
//                 userRating !== ' ' &&
//                 !isNaN(userRating)
//             )
//                 query.avgRating = { $gte: userRating };
//         }

//         let merchants = await Merchant.find(query)
//             .populate('category subcategory offers', '-__v -date -merchant')
//             .select('-__v -date -createdAt -updatedAt -coordinates')
//             .sort({ createdAt: -1 })
//             .limit(15)
//             .lean();

//         const favouriteMerchants = req.user?.favourites;

//         if (userLatitude !== undefined && userLongitude !== undefined) {
//             merchants = merchants.map(merchant => {
//                 if (merchant.latitude && merchant.longitude) {
//                     const distance = geolib.getDistance(
//                         {
//                             latitude: userLatitude,
//                             longitude: userLongitude,
//                         },
//                         {
//                             latitude: merchant.latitude,
//                             longitude: merchant.longitude,
//                         }
//                     );
//                     merchant.distance = distance / 1000; // Convert meters to kilometers
//                 } else {
//                     merchant.distance = null;
//                 }

//                 merchant.isFavourite = favouriteMerchants
//                     ? favouriteMerchants.includes(merchant._id?.toString())
//                     : false;

//                 return merchant;
//             });
//         } else {
//             merchants = merchants.map(merchant => {
//                 merchant.isFavourite = favouriteMerchants
//                     ? favouriteMerchants.includes(merchant._id?.toString())
//                     : false;
//                 return merchant;
//             });
//         }

//         res.json({
//             success: true,
//             merchants,
//         });
//     } catch (error) {
//         next(error);
//     }
// };